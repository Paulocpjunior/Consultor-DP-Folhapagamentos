// @vitest-environment jsdom
// Modal "Pacote do cliente": monta o .zip com PDFs, arquivo bancário, agenda e LEIA-ME.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sv = vi.hoisted(() => ({
    // Reserva do número do arquivo em transação: devolve o gravado (9) e grava o seguinte.
    salvar: vi.fn(async (_empresaId: string, contaId: string) => ({ nsa: 9, contas: [{ id: contaId, banco: '341', proximoNsa: 10 }] })),
    contato: vi.fn(async (..._a: unknown[]) => undefined), baixados: [] as { nome: string; bytes: Uint8Array }[],
    templates: vi.fn(async () => [] as unknown[]), enviarSp: vi.fn(async (..._a: unknown[]) => ({ messageId: 'wamid.1', numeroEnviado: '5511988887777', template: 'dp_pacote_folha' })),
    email: vi.fn(async (..._a: unknown[]) => ({ remetente: 'ana@spassessoria.com.br', fonteRemetente: 'colaborador', copiaPara: ['dp@spassessoria.com.br'] })),
}));
vi.mock('../spConnect', async orig => ({ ...(await orig<typeof import('../spConnect')>()), templatesDoDp: () => sv.templates(), enviarPeloSpConnect: (...a: unknown[]) => sv.enviarSp(...a), enviarEmailPeloEscritorio: (...a: unknown[]) => sv.email(...a) }));
vi.mock('../../empresas/empresasService', () => ({ reservarNsa: (e: string, c: string) => sv.salvar(e, c), salvarContatoEnvio: (...a: unknown[]) => sv.contato(...a) }));
vi.mock('../../implantacao/zip', async orig => ({ ...(await orig<typeof import('../../implantacao/zip')>()), baixarBytes: (nome: string, bytes: Uint8Array) => { sv.baixados.push({ nome, bytes }); } }));
import PacoteClienteModal from '../../../components/pacoteCliente/PacoteClienteModal';
import { lerZip } from '../../implantacao/zip';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';
import type { EventoAgenda } from '../../agenda/convite';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); sv.baixados.length = 0; });

const conta = { id: 'c1', banco: '341', agencia: '1234', agenciaDv: '', conta: '98765-4', contaDv: '', convenio: '', proximoNsa: 9 };
const empresa = { id: 'E1', cnpj: '44388152000189', razaoSocial: 'EMPRESA EXEMPLO LTDA', nomeFantasia: 'Exemplo', codigoSage: '1200', criadoPor: 'g', contasPagamento: [conta] };
const ficha = (id: string, nome: string, dados: Record<string, string>) => ({ ...fichaVazia({ id: 'E1', cnpj: empresa.cnpj }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo' as const, dados: { nome, ...dados } });
const fichas = [ficha('f1', 'ANA', { banco: '341', agencia: '0321', conta: '51234-8', codigoIob: '412' }), ficha('f2', 'BRUNO', {})];
const res = (fichaId: string, nome: string, liquido: number): ResultadoCalculo => ({ fichaId, nome, competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado',
    verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: liquido, descontos: 0, liquido }, fgts: 0, memoria: [], avisos: [], erros: [] } as unknown as ResultadoCalculo);
const eventos = (data: string): EventoAgenda[] => [{ uid: 'u1@x', titulo: 'Pagar os salários', inicio: data, descricao: 'd', lembrete: true }];
const pdf = new Uint8Array([37, 80, 68, 70]);

describe('modal Pacote do cliente', () => {
    it('baixa o .zip com LEIA-ME, PDFs, .REM do Itaú e .ics; avança o número do arquivo', async () => {
        const onContas = vi.fn();
        render(<PacoteClienteModal empresa={empresa} resultados={[res('f1', 'ANA', 65432), res('f2', 'BRUNO', 180000)]} fichas={fichas} titulo="Folha mensal 09/2026" sufixo="2026-09"
            dataSugerida="2026-10-06" eventos={eventos} onFechar={() => {}} onContasSalvas={onContas}
            documentos={[{ id: 'holerites', rotulo: 'Holerites (PDF)', nome: 'holerites-1200-2026-09.pdf', descricao: 'holerites', gerar: () => pdf },
                { id: 'resumo', rotulo: 'Resumo da folha (PDF)', nome: 'resumo-1200-2026-09.pdf', descricao: 'resumo', gerar: () => pdf.buffer }]} />);
        expect(screen.getByText(/Arquivo bancário nº 9:/)).toBeTruthy();
        expect(screen.getByText(/Fora do arquivo \(1\)/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Resumo da folha (PDF)'));
        fireEvent.click(screen.getByText('Baixar pacote (.zip)'));
        await waitFor(() => expect(sv.salvar).toHaveBeenCalledTimes(1));
        expect((await sv.salvar.mock.results[0].value).contas[0].proximoNsa).toBe(10);
        expect(onContas).toHaveBeenCalled();
        expect(sv.baixados.map(b => b.nome)).toEqual(['pacote-1200-2026-09.zip']);
        const arquivos = await lerZip(sv.baixados[0].bytes);
        const nomes = arquivos.map(a => a.nome);
        expect(nomes[0]).toBe('LEIA-ME.txt');
        expect(nomes.slice(1)).toEqual(['holerites-1200-2026-09.pdf', expect.stringMatching(/^PG\d{4}09\.REM$/), 'agenda-1200-2026-09.ics']);
        const txt = (n: string) => new TextDecoder().decode(arquivos.find(a => a.nome === n)!.bytes);
        const rem = txt(nomes[2]).split('\r\n').filter(Boolean);
        expect(rem.map(l => l.slice(7, 8))).toEqual(['0', '1', '3', '5', '9']);
        expect(rem[2].slice(23, 43)).toBe('00321 000000051234 8');
        expect(txt('agenda-1200-2026-09.ics')).toContain('DTSTART;VALUE=DATE:20261006');
        const leia = txt('LEIA-ME.txt');
        expect(leia).toContain('- BRUNO: sem banco/agência/conta nem chave PIX na ficha');
        expect(leia).not.toContain('resumo-1200');
        expect(screen.getByRole('status').textContent).toMatch(/pacote-1200-2026-09\.zip baixado com 4 arquivo\(s\)\. Próximo arquivo bancário: nº 10\./);
    });

    it('depois de montado: mensagem pronta, WhatsApp e e-mail com o texto, contato gravado; refazer avisa do novo arquivo bancário', async () => {
        const abertos: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { abertos.push(this.href); });
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const onContato = vi.fn();
        render(<PacoteClienteModal empresa={{ ...empresa, contatoEnvio: { nome: 'Marta' } }} resultados={[res('f1', 'ANA', 65432)]} fichas={fichas} titulo="Folha mensal 09/2026" sufixo="2026-09"
            dataSugerida="2026-10-06" eventos={eventos} onFechar={() => {}} onContatoSalvo={onContato}
            documentos={[{ id: 'holerites', rotulo: 'Holerites (PDF)', nome: 'h.pdf', descricao: 'holerites para assinatura', gerar: () => pdf }]} />);
        fireEvent.click(screen.getByText('Baixar pacote (.zip)'));
        await waitFor(() => expect(screen.getByRole('region', { name: 'Enviar ao cliente' })).toBeTruthy());
        const texto = (screen.getByLabelText('Mensagem ao cliente') as HTMLTextAreaElement).value;
        expect(texto).toMatch(/^Olá, Marta!/);
        // Trocar o nome do contato atualiza a saudação; o que for digitado na mensagem fica.
        fireEvent.change(screen.getByLabelText('Nome do contato'), { target: { value: 'Joana' } });
        expect((screen.getByLabelText('Mensagem ao cliente') as HTMLTextAreaElement).value).toMatch(/^Olá, Joana!/);
        fireEvent.change(screen.getByLabelText('Mensagem ao cliente'), { target: { value: 'Texto meu' } });
        fireEvent.change(screen.getByLabelText('Nome do contato'), { target: { value: 'Marta' } });
        expect((screen.getByLabelText('Mensagem ao cliente') as HTMLTextAreaElement).value).toBe('Texto meu');
        fireEvent.change(screen.getByLabelText('Mensagem ao cliente'), { target: { value: texto } });
        expect(texto).toContain('Segue o pacote da Folha mensal 09/2026 da Exemplo (pacote-1200-2026-09.zip)');
        expect(texto).toContain('• holerites para assinatura');
        expect(texto).toMatch(/Arquivo bancário \(BANCO ITAU\): 1 pagamento\(s\), total R\$ 654,32, crédito em 06\/10\/2026/);
        expect(texto).toContain('• 06/10/2026: Pagar os salários');
        // Sem WhatsApp e sem e-mail os botões ficam desligados.
        expect((screen.getByText('WhatsApp deste computador') as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByText('E-mail deste computador') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '(11) 98888-7777' } });
        fireEvent.change(screen.getByLabelText('E-mail do contato'), { target: { value: 'marta@cliente.com.br' } });
        fireEvent.click(screen.getByText('WhatsApp deste computador'));
        fireEvent.click(screen.getByText('E-mail deste computador'));
        expect(abertos[0]).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=Ol%C3%A1%2C%20Marta!/);
        expect(abertos[1]).toMatch(/^mailto:marta@cliente\.com\.br\?subject=Folha%20mensal%2009%2F2026%20%C2%B7%20Exemplo&body=Ol%C3%A1/);
        fireEvent.click(screen.getByText('Gravar contato na empresa'));
        await waitFor(() => expect(sv.contato).toHaveBeenCalledWith('E1', { nome: 'Marta', whatsapp: '(11) 98888-7777', email: 'marta@cliente.com.br' }));
        expect(onContato).toHaveBeenCalled();
        // Refazer com arquivo bancário pede confirmação (gera o nº seguinte); recusado, o pacote fica.
        fireEvent.click(screen.getByText('Refazer pacote'));
        expect(confirmar.mock.calls[0][0]).toMatch(/novo arquivo bancário \(nº 10\)/);
        expect(screen.getByRole('region', { name: 'Enviar ao cliente' })).toBeTruthy();
        expect(sv.baixados).toHaveLength(1);
    });

    it('SP Connect: template do DP com o PDF escolhido e as variáveis sugeridas; sem template, explica como cadastrar', async () => {
        sv.templates.mockResolvedValueOnce([{ nome: 'dp_pacote_folha', ativo: true, temDocumento: true, variaveis: [{ chave: 'cliente', rotulo: 'Cliente' }, { chave: 'competencia', rotulo: 'Competência' }, { chave: 'obs', rotulo: 'Observação' }] }]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<PacoteClienteModal empresa={{ ...empresa, contasPagamento: [], contatoEnvio: { nome: 'Marta', whatsapp: '(11) 98888-7777' } }} resultados={[res('f1', 'ANA', 65432)]} fichas={fichas} titulo="Folha mensal 09/2026" sufixo="2026-09"
            dataSugerida="2026-10-06" eventos={() => []} onFechar={() => {}}
            documentos={[{ id: 'holerites', rotulo: 'Holerites (PDF)', nome: 'holerites.pdf', descricao: 'h', gerar: () => pdf }, { id: 'resumo', rotulo: 'Resumo da folha (PDF)', nome: 'resumo.pdf', descricao: 'r', gerar: () => pdf }]} />);
        fireEvent.click(screen.getByText('Baixar pacote (.zip)'));
        const enviar = await screen.findByText('Enviar pelo SP Connect') as HTMLButtonElement;
        expect((screen.getByLabelText('Variável Cliente') as HTMLInputElement).value).toBe('Marta');
        expect((screen.getByLabelText('Variável Competência') as HTMLInputElement).value).toBe('09/2026');
        // Variável sem sugestão: o botão espera a equipe preencher.
        expect(enviar.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Variável Observação'), { target: { value: 'Conferir até sexta' } });
        fireEvent.change(screen.getByLabelText('PDF do SP Connect'), { target: { value: 'resumo.pdf' } });
        expect(enviar.disabled).toBe(false);
        fireEvent.click(enviar);
        await waitFor(() => expect(sv.enviarSp).toHaveBeenCalled());
        const e = sv.enviarSp.mock.calls[0][0] as { para: string; template: string; variaveis: Record<string, string>; pdf: { nome: string }; referencia: string };
        expect([e.para, e.template, e.variaveis, e.pdf.nome, e.referencia]).toEqual(['5511988887777', 'dp_pacote_folha', { cliente: 'Marta', competencia: '09/2026', obs: 'Conferir até sexta' }, 'resumo.pdf', '1200 · pacote-1200-2026-09.zip']);
        expect(await screen.findByText(/Enviado pelo SP Connect para 5511988887777/)).toBeTruthy();
        cleanup();
        // Sem template dp-folha com documento: a tela diz o que cadastrar; o WhatsApp deste computador continua.
        render(<PacoteClienteModal empresa={{ ...empresa, contasPagamento: [] }} resultados={[res('f1', 'ANA', 65432)]} fichas={fichas} titulo="Folha" sufixo="2026-09"
            dataSugerida="2026-10-06" eventos={() => []} onFechar={() => {}} documentos={[{ id: 'holerites', rotulo: 'Holerites (PDF)', nome: 'h.pdf', descricao: 'h', gerar: () => pdf }]} />);
        fireEvent.click(screen.getByText('Baixar pacote (.zip)'));
        expect(await screen.findByText(/Nenhum template do Departamento Pessoal \(dp-folha\) com documento/)).toBeTruthy();
        expect(screen.getByText('WhatsApp deste computador')).toBeTruthy();
    });

    it('e-mail pelo escritório: confirma, manda o .zip com a mensagem e diz de quem saiu e quem ficou em cópia', async () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<PacoteClienteModal empresa={{ ...empresa, contasPagamento: [], contatoEnvio: { nome: 'Marta', email: 'marta@cliente.com.br' } }} resultados={[res('f1', 'ANA', 65432)]} fichas={fichas} titulo="Folha mensal 09/2026" sufixo="2026-09"
            dataSugerida="2026-10-06" eventos={() => []} onFechar={() => {}} documentos={[{ id: 'holerites', rotulo: 'Holerites (PDF)', nome: 'h.pdf', descricao: 'h', gerar: () => pdf }]} />);
        fireEvent.click(screen.getByText('Baixar pacote (.zip)'));
        fireEvent.click(await screen.findByText('Enviar e-mail pelo escritório'));
        expect(confirmar.mock.calls[0][0]).toMatch(/pacote-1200-2026-09\.zip para marta@cliente\.com\.br/);
        await waitFor(() => expect(sv.email).toHaveBeenCalled());
        const e = sv.email.mock.calls[0][0] as { empresaId: string; competencia: string; para: string; assunto: string; mensagem: string; anexos: { nome: string; mime: string; bytes: Uint8Array }[] };
        expect([e.empresaId, e.competencia, e.para, e.assunto]).toEqual(['E1', '2026-09', 'marta@cliente.com.br', 'Folha mensal 09/2026 · Exemplo']);
        expect(e.mensagem).toMatch(/^Olá, Marta!/);
        expect(e.anexos.map(a => [a.nome, a.mime])).toEqual([['pacote-1200-2026-09.zip', 'application/zip']]);
        expect((await lerZip(e.anexos[0].bytes)).map(a => a.nome)).toEqual(['LEIA-ME.txt', 'h.pdf']);
        expect(await screen.findByText(/E-mail enviado de ana@spassessoria\.com\.br para marta@cliente\.com\.br, com cópia para dp@spassessoria\.com\.br\./)).toBeTruthy();
        expect(screen.getByText('E-mail enviado ✓')).toBeTruthy();
    });

    it('sem conta cadastrada: o arquivo bancário fica de fora e o pacote sai sem gravar nada', async () => {
        render(<PacoteClienteModal empresa={{ ...empresa, contasPagamento: [] }} resultados={[res('f1', 'ANA', 65432)]} fichas={fichas} titulo="Folha" sufixo="2026-09"
            dataSugerida="2026-10-06" eventos={() => []} onFechar={() => {}} documentos={[{ id: 'holerites', rotulo: 'Holerites (PDF)', nome: 'h.pdf', descricao: 'h', gerar: () => pdf }]} />);
        expect(screen.getByText(/Cadastre a conta da empresa/)).toBeTruthy();
        fireEvent.click(screen.getByText('Baixar pacote (.zip)'));
        await waitFor(() => expect(sv.baixados).toHaveLength(1));
        expect((await lerZip(sv.baixados[0].bytes)).map(a => a.nome)).toEqual(['LEIA-ME.txt', 'h.pdf']);
        expect(sv.salvar).not.toHaveBeenCalled();
    });
});
