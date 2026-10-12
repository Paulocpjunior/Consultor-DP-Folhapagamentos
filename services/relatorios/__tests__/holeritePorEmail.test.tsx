// @vitest-environment jsdom
// Holerite a cada funcionário por e-mail: destinatários, textos e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';
import { arquivoHolerite, assuntoHolerite, destinatariosHolerite, destinatariosWhatsApp, mensagemHolerite, variaveisDoFuncionario } from '../holeritePorEmail';

const ficha = (id: string, nome: string, email = '', telefone = ''): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '11222333000181' }), id, cpf: '52998224725', matriculaEsocial: `M/${id}`, situacao: 'ativo', dados: { nome, email, telefone, nascimento: id === '2' ? '1990-09-15' : '1990-03-01' } });
const res = (fichaId: string, nome: string, situacao: ResultadoCalculo['situacao'] = 'calculado') => ({ fichaId, nome, situacao, competencia: '2026-09', verbas: [], totais: { proventos: 0, descontos: 0, liquido: 0 } } as unknown as ResultadoCalculo);
const FICHAS = [ficha('1', 'BRUNO SOUZA', 'bruno@ex.com', '(11) 98888-7777'), ficha('2', 'ANA LIMA', 'ana@ex.com'), ficha('3', 'CAIO', 'sem-arroba', '11 97777-6666'), ficha('4', 'DORA', 'dora@ex.com', '11966665555')];
const FOLHA = [res('1', 'BRUNO SOUZA'), res('2', 'ANA LIMA'), res('3', 'CAIO'), res('4', 'DORA', 'erro')];

describe('destinatários e textos', () => {
    it('só quem tem e-mail válido na ficha e holerite sem erro; por nome', () => {
        const d = destinatariosHolerite(FOLHA, FICHAS);
        expect(d.comEmail.map(x => [x.nome, x.email])).toEqual([['ANA LIMA', 'ana@ex.com'], ['BRUNO SOUZA', 'bruno@ex.com']]);
        expect(d.semEmail).toEqual(['CAIO']);
    });
    it('arquivo sem o nome da pessoa, assunto e mensagem pessoal', () => {
        const [ana] = destinatariosHolerite(FOLHA, FICHAS).comEmail;
        expect(arquivoHolerite(ana, '2026-09')).toBe('holerite-2026-09-M2.pdf');
        expect(assuntoHolerite('2026-09', 'ALFA')).toBe('Holerite 09/2026 · ALFA');
        const m = mensagemHolerite('ANA LIMA', '2026-09', 'ALFA');
        expect(m).toMatch(/^Olá, Ana!/);
        expect(m).toMatch(/seu holerite de 09\/2026 da ALFA/);
        expect(m).toMatch(/não o encaminhe/);
        // No mês do aniversário, a mensagem de aniversário vem antes do holerite.
        expect(mensagemHolerite('ANA LIMA', '2026-09', 'ALFA', 'Feliz aniversário, Ana!')).toMatch(/^Olá, Ana!\n\nFeliz aniversário, Ana!\n\nSegue em anexo/);
    });
    it('WhatsApp: celular do Brasil na ficha (Telefone ou Telefone 2), holerite sem erro; variáveis do modelo', () => {
        const w = destinatariosWhatsApp(FOLHA, FICHAS);
        expect(w.comWhatsApp.map(x => [x.nome, x.numero])).toEqual([['BRUNO SOUZA', '5511988887777'], ['CAIO', '5511977776666']]);
        expect(w.semWhatsApp).toEqual(['ANA LIMA']);
        const t = { nome: 'dp_holerite', variaveis: [{ chave: 'nome' }, { chave: 'competencia' }, { chave: 'empresa' }] };
        expect(variaveisDoFuncionario(t, { nome: 'BRUNO SOUZA', empresa: 'ALFA', titulo: 'Holerite', competencia: '2026-09' })).toEqual({ variaveis: { nome: 'Bruno', competencia: '09/2026', empresa: 'ALFA' }, faltando: [] });
        expect(variaveisDoFuncionario({ ...t, variaveis: [{ chave: 'protocolo' }] }, { nome: 'X', empresa: 'ALFA', titulo: 'Holerite', competencia: '2026-09' }).faltando).toEqual(['protocolo']);
    });
});

const srv = vi.hoisted(() => ({ enviados: [] as { para: string; anexos: { nome: string }[]; mensagem: string }[], falhar: '', whats: [] as { para: string; template: string; variaveis: Record<string, string>; pdf: { nome: string } }[] }));
vi.mock('../../pacoteCliente/spConnect', async (orig) => ({
    ...(await orig<typeof import('../../pacoteCliente/spConnect')>()),
    enviarEmailPeloEscritorio: async (e: { para: string; anexos: { nome: string }[]; mensagem: string }) => { if (e.para === srv.falhar) throw new Error('caixa cheia'); srv.enviados.push(e); return { remetente: 'dp@x', fonteRemetente: 'padrao', copiaPara: [] }; },
    templatesDoDp: async () => [{ nome: 'dp_holerite', temDocumento: true, variaveis: [{ chave: 'nome' }, { chave: 'competencia' }] }],
    enviarPeloSpConnect: async (e: { para: string; template: string; variaveis: Record<string, string>; pdf: { nome: string } }) => { if (e.para === srv.falhar) throw new Error('número sem WhatsApp'); srv.whats.push(e); return { messageId: 'm', numeroEnviado: e.para, template: e.template }; },
}));
import HoleritePorEmail from '../../../components/relatorios/HoleritePorEmail';
afterEach(() => { cleanup(); srv.enviados.length = 0; srv.whats.length = 0; srv.falhar = ''; vi.restoreAllMocks(); });

describe('tela', () => {
    it('envia um e-mail por funcionário com o PDF dele e mostra cada resultado', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        srv.falhar = 'bruno@ex.com';
        const gerarPdf = vi.fn(async (r: ResultadoCalculo) => new TextEncoder().encode(r.fichaId));
        render(<HoleritePorEmail empresa={{ id: 'E1', cnpj: '11222333000181', nome: 'ALFA' }} competencia="2026-09" folha={FOLHA} fichas={FICHAS} gerarPdf={gerarPdf} />);
        expect(screen.getByText(/2 com e-mail na ficha · 1 sem e-mail/)).toBeTruthy();
        expect(screen.getByText(/Sem e-mail válido na ficha: CAIO/)).toBeTruthy();
        fireEvent.click(screen.getByText('Enviar 2 holerite(s) por e-mail'));
        await waitFor(() => expect(screen.getByText('1 de 2 enviado(s).')).toBeTruthy());
        expect(srv.enviados.map(e => [e.para, e.anexos[0].nome])).toEqual([['ana@ex.com', 'holerite-2026-09-M2.pdf']]);
        expect(gerarPdf.mock.calls.map(c => c[0].fichaId)).toEqual(['2', '1']);
        const lista = screen.getByLabelText('Resultado do envio').textContent ?? '';
        expect(lista).toMatch(/ANA LIMA: ✓ e-mail para ana@ex.com/);
        // ANA faz aniversário em setembro: o e-mail dela leva a mensagem de aniversário (o padrão).
        expect(srv.enviados[0].mensagem).toMatch(/Feliz aniversário, Ana! A ALFA deseja/);
        expect(lista).toMatch(/BRUNO SOUZA: ✗ caixa cheia/);
    });

    it('envia pelo WhatsApp com o modelo do DP, o PDF de cada um e as variáveis dele', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        srv.falhar = '5511977776666';
        const gerarPdf = vi.fn(async (r: ResultadoCalculo) => new TextEncoder().encode(r.fichaId));
        render(<HoleritePorEmail empresa={{ id: 'E1', cnpj: '11222333000181', nome: 'ALFA' }} competencia="2026-09" folha={FOLHA} fichas={FICHAS} gerarPdf={gerarPdf} />);
        expect(screen.getByText(/WhatsApp: 2 com celular na ficha · 1 sem celular/)).toBeTruthy();
        fireEvent.click(screen.getByText('Enviar pelo WhatsApp…'));
        fireEvent.click(await screen.findByText('Enviar 2 pelo WhatsApp'));
        await waitFor(() => expect(screen.getByText('1 de 2 enviado(s).')).toBeTruthy());
        expect(srv.whats).toEqual([{ para: '5511988887777', template: 'dp_holerite', variaveis: { nome: 'Bruno', competencia: '09/2026' }, pdf: { nome: 'holerite-2026-09-M1.pdf', bytes: expect.anything() }, referencia: 'holerite:E1:2026-09:1' }]);
        const lista = screen.getByLabelText('Resultado do envio').textContent ?? '';
        expect(lista).toMatch(/BRUNO SOUZA: ✓ WhatsApp para 5511988887777/);
        expect(lista).toMatch(/CAIO: ✗ número sem WhatsApp/);
    });
});
