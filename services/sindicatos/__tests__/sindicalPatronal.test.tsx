// @vitest-environment jsdom
// Contribuição sindical patronal: tabela da CNC de 2026, filiais, atraso, dispensas, calendário e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TABELA_CNC_2026, calcularSindicalPatronal, configPatronalVazia, valorPelaTabela, type ConfigSindicalPatronal } from '../sindicalPatronal';
import { obrigacoesDaEmpresa } from '../../prazos/obrigacoesEmpresa';

const srv = vi.hoisted(() => ({ gravado: null as unknown }));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [{ id: 'E1', cnpj: '44388152000189', razaoSocial: 'ALFA', nomeFantasia: 'ALFA', codigoSage: '1', criadoPor: 'u' }],
    atualizarParametrosFolha: async (_id: string, f: (p: unknown) => unknown) => { srv.gravado = f({}); return srv.gravado; },
}));
vi.mock('../../cadastros/cadastrosService', () => ({ listarEnquadramentos: async () => [], listarFuncionarios: async () => [{ situacao: 'ativo' }], mensagemErro: (e: unknown) => String(e) }));
import SindicalPatronalPanel from '../../../components/sindicatos/SindicalPatronalPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const CFG: ConfigSindicalPatronal = { ...configPatronalVazia(), aderiu: true, capitalSocial: 50000000, entidade: 'Sindicato do Comércio', cnpjEntidade: '11222333000181', codigoSindical: '000.123.456.78901-2' };
afterEach(() => { cleanup(); srv.gravado = null; });

describe('tabela da CNC de 2026', () => {
    it('as classes se encadeiam sem salto e dão o mínimo e o máximo', () => {
        const v = (c: number) => valorPelaTabela(c, TABELA_CNC_2026.faixas).valor;
        expect(v(1000000)).toBe(33850);
        expect(v(5000000)).toBe(40000);
        expect([v(8462550), v(8462551)]).toEqual([67700, 67700]);
        expect([v(84625500), v(84625501)]).toEqual([220026, 220027]);
        expect(v(50000000)).toBe(100000 + 50775);
        expect(v(8462550000)).toBe(8597951);
        expect(v(45133600000)).toBe(15932161);
        expect(v(99999999999)).toBe(15932161);
    });
});

describe('cálculo da contribuição', () => {
    it('devida: valor, vencimento no último dia útil de janeiro e a guia', () => {
        const r = calcularSindicalPatronal({ config: CFG, ano: 2026, simples: false, temEmpregados: true });
        expect(r.situacao).toBe('devida');
        expect(r.valor).toBe(150775);
        expect(r.vencimento).toBe('2026-01-30');
        expect(r.guias).toEqual([{ estabelecimento: 'matriz', entidade: 'Sindicato do Comércio', codigoSindical: '000.123.456.78901-2', capital: 50000000, valor: 150775 }]);
        expect(calcularSindicalPatronal({ config: CFG, ano: 2027, simples: false, temEmpregados: true }).avisos.join(' ')).toMatch(/Tabela de 2026 usada para 2027/);
    });
    it('filiais: a parte do capital de cada uma vai ao sindicato dela (art. 581)', () => {
        const r = calcularSindicalPatronal({ config: { ...CFG, filiais: [{ cnpj: '29463877000109', percentual: 20, entidade: 'Sindicato de Campinas', codigoSindical: '999' }] }, ano: 2026, simples: false, temEmpregados: true });
        expect(r.guias.map(g => [g.estabelecimento, g.capital])).toEqual([['matriz', 40000000], ['29463877000109', 10000000]]);
        expect(r.valor).toBe(r.guias.reduce((s, g) => s + g.valor, 0));
    });
    it('atraso: multa de 10% nos 30 dias, mais 2% por mês, e juros de 1% ao mês (art. 600)', () => {
        const curto = calcularSindicalPatronal({ config: CFG, ano: 2026, simples: false, temEmpregados: true, pagamento: '2026-02-15' }).atraso!;
        expect([curto.multa, curto.juros]).toEqual([15078, 1508]);
        const longo = calcularSindicalPatronal({ config: CFG, ano: 2026, simples: false, temEmpregados: true, pagamento: '2026-05-10' }).atraso!;
        expect(longo.multa).toBe(Math.round(150775 * 16 / 100));
        expect(longo.juros).toBe(Math.round(150775 * 3 / 100));
    });
    it('sem adesão, Simples, sem empregados e faltas', () => {
        expect(calcularSindicalPatronal({ config: { ...CFG, aderiu: false }, ano: 2026, simples: false, temEmpregados: true }).situacao).toBe('sem-adesao');
        expect(calcularSindicalPatronal({ config: CFG, ano: 2026, simples: true, temEmpregados: true }).situacao).toBe('dispensada');
        expect(calcularSindicalPatronal({ config: CFG, ano: 2026, simples: false, temEmpregados: false }).avisos.join(' ')).toMatch(/sem empregados/);
        const e = calcularSindicalPatronal({ config: { ...CFG, capitalSocial: 0, codigoSindical: '', filiais: [{ cnpj: '1', percentual: 100, entidade: '', codigoSindical: '' }] }, ano: 2026, simples: false, temEmpregados: true });
        expect(e.situacao).toBe('erro');
        for (const m of [/capital social/, /código dela na guia/, /menor que 100%/, /Filial 1: CNPJ/]) expect(e.erros.join(' ')).toMatch(m);
        expect(calcularSindicalPatronal({ config: { ...CFG, tabelaId: 'propria' }, ano: 2026, simples: false, temEmpregados: true }).erros.join(' ')).toMatch(/informe as faixas/);
    });
    it('calendário: o vencimento de janeiro na competência de dezembro', () => {
        const o = obrigacoesDaEmpresa({ competencia: '2026-12', temEmpregados: true }).find(x => x.id.startsWith('sindical-patronal'));
        expect(o).toMatchObject({ data: '2027-01-29', condicao: expect.stringMatching(/aderiu/) });
        expect(obrigacoesDaEmpresa({ competencia: '2026-11', temEmpregados: true }).some(x => x.id.startsWith('sindical-patronal'))).toBe(false);
    });
});

describe('tela', () => {
    it('marca a adesão, informa os dados, mostra o valor e grava nos parâmetros da folha', async () => {
        const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: '44388152000189', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><SindicalPatronalPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText(/A empresa aderiu/));
        const cap = screen.getByLabelText('Capital social');
        fireEvent.change(cap, { target: { value: '500.000,00' } }); fireEvent.blur(cap);
        fireEvent.change(screen.getByLabelText('Entidade sindical'), { target: { value: 'Sindicato do Comércio' } });
        fireEvent.change(screen.getByLabelText('Código sindical'), { target: { value: '123' } });
        const calc = screen.getByLabelText('Cálculo da contribuição patronal');
        await waitFor(() => expect(calc.textContent).toMatch(/Contribuição de 2026: R\$\s?1\.507,75 · vencimento 30\/01\/2026/));
        fireEvent.click(screen.getByText('Gravar'));
        await waitFor(() => expect(srv.gravado).toMatchObject({ sindicalPatronal: { aderiu: true, capitalSocial: 50000000, codigoSindical: '123' } }));
    });
});
