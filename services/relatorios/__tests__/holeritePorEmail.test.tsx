// @vitest-environment jsdom
// Holerite a cada funcionário por e-mail: destinatários, textos e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';
import { arquivoHolerite, assuntoHolerite, destinatariosHolerite, mensagemHolerite } from '../holeritePorEmail';

const ficha = (id: string, nome: string, email = ''): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '11222333000181' }), id, cpf: '52998224725', matriculaEsocial: `M/${id}`, situacao: 'ativo', dados: { nome, email } });
const res = (fichaId: string, nome: string, situacao: ResultadoCalculo['situacao'] = 'calculado') => ({ fichaId, nome, situacao, competencia: '2026-09', verbas: [], totais: { proventos: 0, descontos: 0, liquido: 0 } } as unknown as ResultadoCalculo);
const FICHAS = [ficha('1', 'BRUNO SOUZA', 'bruno@ex.com'), ficha('2', 'ANA LIMA', 'ana@ex.com'), ficha('3', 'CAIO', 'sem-arroba'), ficha('4', 'DORA', 'dora@ex.com')];
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
    });
});

const srv = vi.hoisted(() => ({ enviados: [] as { para: string; anexos: { nome: string }[] }[], falhar: '' }));
vi.mock('../../pacoteCliente/spConnect', () => ({
    enviarEmailPeloEscritorio: async (e: { para: string; anexos: { nome: string }[] }) => { if (e.para === srv.falhar) throw new Error('caixa cheia'); srv.enviados.push(e); return { remetente: 'dp@x', fonteRemetente: 'padrao', copiaPara: [] }; },
}));
import HoleritePorEmail from '../../../components/relatorios/HoleritePorEmail';
afterEach(() => { cleanup(); srv.enviados.length = 0; srv.falhar = ''; vi.restoreAllMocks(); });

describe('tela', () => {
    it('envia um e-mail por funcionário com o PDF dele e mostra cada resultado', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        srv.falhar = 'bruno@ex.com';
        const gerarPdf = vi.fn(async (r: ResultadoCalculo) => new TextEncoder().encode(r.fichaId));
        render(<HoleritePorEmail empresa={{ id: 'E1', cnpj: '11222333000181', nome: 'ALFA' }} competencia="2026-09" folha={FOLHA} fichas={FICHAS} gerarPdf={gerarPdf} />);
        expect(screen.getByText(/2 com e-mail na ficha · 1 sem e-mail/)).toBeTruthy();
        expect(screen.getByText(/Sem e-mail válido na ficha \(não recebem\): CAIO/)).toBeTruthy();
        fireEvent.click(screen.getByText('Enviar 2 holerite(s) por e-mail'));
        await waitFor(() => expect(screen.getByText('1 de 2 enviado(s).')).toBeTruthy());
        expect(srv.enviados.map(e => [e.para, e.anexos[0].nome])).toEqual([['ana@ex.com', 'holerite-2026-09-M2.pdf']]);
        expect(gerarPdf.mock.calls.map(c => c[0].fichaId)).toEqual(['2', '1']);
        const lista = screen.getByLabelText('Resultado do envio').textContent ?? '';
        expect(lista).toMatch(/ANA LIMA: ✓ enviado para ana@ex.com/);
        expect(lista).toMatch(/BRUNO SOUZA: ✗ caixa cheia/);
    });
});
