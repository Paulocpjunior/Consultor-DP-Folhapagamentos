// @vitest-environment jsdom
// Modal "Pacote do cliente": monta o .zip com PDFs, arquivo bancário, agenda e LEIA-ME.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sv = vi.hoisted(() => ({ salvar: vi.fn(async (..._a: unknown[]) => undefined), baixados: [] as { nome: string; bytes: Uint8Array }[] }));
vi.mock('../../empresas/empresasService', () => ({ salvarContasPagamento: (...a: unknown[]) => sv.salvar(...a) }));
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
        expect((sv.salvar.mock.calls[0][1] as { proximoNsa: number }[])[0].proximoNsa).toBe(10);
        expect(onContas).toHaveBeenCalled();
        expect(sv.baixados.map(b => b.nome)).toEqual(['pacote-1200-2026-09.zip']);
        const arquivos = await lerZip(sv.baixados[0].bytes);
        const nomes = arquivos.map(a => a.nome);
        expect(nomes[0]).toBe('LEIA-ME.txt');
        expect(nomes.slice(1)).toEqual(['holerites-1200-2026-09.pdf', expect.stringMatching(/^CNAB240_341_\d{8}_000009\.REM$/), 'agenda-1200-2026-09.ics']);
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
