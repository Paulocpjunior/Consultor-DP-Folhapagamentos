// @vitest-environment jsdom
// Abas da ficha pelo backup do IOB: lançamentos automáticos (lancauto), Complementos e Holerite (func, mensa); dados fictícios.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { aplicarAutomaticos, automaticosDoMes, chaveAutomatico, diasTrabalhadosNoMes, textoMeses, validarAutomaticos, type LancamentoAutomatico } from '../lancamentosAutomaticos';
import { limparMovimento } from '../movimento';
import { fichaVazia, diffFicha, validarFicha, ABAS, type FichaFuncionario } from '../../cadastros/funcionarios';
import { automaticosDoBackup, compararComFichas, linhaParaCampos, normalizarValor, proporMapeamento } from '../../cadastros/cargaBackupIob';
import { mensagensDoHolerite } from '../../relatorios/holeritePdf';
import type { EventoIobSage } from '../../folha/folhaTypes';

const ev = (codigo: string, descricao: string, x: Partial<EventoIobSage> = {}): EventoIobSage => ({ codigo, descricao, tipo: 'V', rv: 'R', ro: '020', coeficiente: 1, incidencias: { in: 'S', ir: 'S', fg: 'S' }, ...x } as EventoIobSage);
const EVENTOS = [ev('0200', 'GRATIFICACAO', { rv: 'V' }), ev('0300', 'CONVENIO FARMACIA', { tipo: 'D', rv: 'V', incidencias: { in: 'N', ir: 'N', fg: 'N' } as EventoIobSage['incidencias'] })];
const a = (x: Partial<LancamentoAutomatico>): LancamentoAutomatico => ({ codigoEvento: '200', referencia: '150,00', meses: [], desde: '', ate: '', ...x });
const ficha = (id: string, automaticos: LancamentoAutomatico[], dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({
    ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id, cpf: '52998224725', matriculaEsocial: id, lancamentosAutomaticos: automaticos,
    dados: { nome: id.toUpperCase(), admissao: '2025-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', ...dados },
});
const SAL = () => ({ mensal: 300000, horasMes: 220 });

describe('lançamentos automáticos', () => {
    it('validação, meses e período', () => {
        expect(validarAutomaticos([a({}), a({ codigoEvento: '300', referencia: '20,00', meses: [1, 7], desde: '2026-01', ate: '2026-12' })])).toEqual([]);
        const e = validarAutomaticos([a({ codigoEvento: 'x' }), a({ meses: [13] }), a({ desde: '2026-05', ate: '2026-01' }), a({}), a({})]).join(' | ');
        expect(e).toMatch(/código do evento/); expect(e).toMatch(/meses de 1 a 12/); expect(e).toMatch(/"até" antes/); expect(e).toMatch(/mesma referência/);
        const l = [a({}), a({ codigoEvento: '300', meses: [12] }), a({ codigoEvento: '301', desde: '2026-11' }), a({ codigoEvento: '302', ate: '2026-09' })];
        expect(automaticosDoMes(l, '2026-10').map(x => x.codigoEvento)).toEqual(['200']);
        expect(automaticosDoMes(l, '2026-12').map(x => x.codigoEvento)).toEqual(['200', '300', '301']);
        expect(textoMeses([12, 1])).toBe('jan, dez'); expect(textoMeses([])).toBe('todo mês');
        expect(chaveAutomatico(a({ codigoEvento: '0200' }))).toBe('200|150,00');
    });
    it('aplica pelo "Lançar evento" uma vez por mês; erros por funcionário', () => {
        const fichas = [ficha('ana', [a({}), a({ codigoEvento: '300', referencia: '25,00' })]), ficha('bia', [a({ codigoEvento: '999' })]), ficha('caio', [a({ meses: [1] })])];
        const r = aplicarAutomaticos({ fichas, movimentos: { ana: { horasExtras50: 2 } }, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL });
        expect(r).toMatchObject({ aplicados: 2, funcionarios: 1, jaAplicados: 0 });
        expect(r.erros).toEqual([expect.stringMatching(/^BIA: evento 999 não está no catálogo/)]);
        const m = r.movimentos.ana;
        expect(m.horasExtras50).toBe(2);
        expect(m.lancamentos).toEqual([
            expect.objectContaining({ descricao: '0200 GRATIFICACAO', valor: 15000, tipo: 'provento', inss: true }),
            expect.objectContaining({ descricao: '0300 CONVENIO FARMACIA', valor: 2500, tipo: 'desconto', inss: false }),
        ]);
        expect(m.automaticos).toEqual(['200|150,00', '300|25,00']);
        expect(r.movimentos.caio).toBeUndefined();
        // De novo no mesmo mês: nada duplica.
        const r2 = aplicarAutomaticos({ fichas, movimentos: r.movimentos, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL });
        expect(r2).toMatchObject({ aplicados: 0, jaAplicados: 2 });
        expect(r2.movimentos.ana.lancamentos).toHaveLength(2);
        // Fórmula da empresa e referência inválida.
        const f = aplicarAutomaticos({ fichas: [ficha('ana', [a({ referencia: '' })])], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL,
            formulas: { '0200': { expressao: 'SALARIO * 0,1', referencia: 'nenhuma' } } });
        expect(f.movimentos.ana.lancamentos?.[0].valor).toBe(30000);
        expect(aplicarAutomaticos({ fichas: [ficha('ana', [a({ referencia: 'abc' })])], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL }).erros.join()).toMatch(/referência "abc" inválida/);
        // O movimento gravado guarda as chaves.
        expect(limparMovimento({ automaticos: ['300|25,00', '200|150,00', '200|150,00'] }).automaticos).toEqual(['200|150,00', '300|25,00']);
    });
    it('como os Eventos Automáticos do SAGE: Valor entra como está, Sal é o salário-base, fora do catálogo pela rubrica S-1010', () => {
        // Triênio do SAGE (1015, referência 1,0000, valor 626,50): o valor entra como está, com as incidências da rubrica.
        const rubricas = [{ id: 'r', empresaId: 'E1', codRubr: '1015', ideTabRubr: 'T', eventoIob: '', origem: 'S-1010',
            vigencias: [{ iniValid: '2022-01', fimValid: '', recibo: '1', dados: { dscRubr: 'TRIENIO', natRubr: '1003', tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] }];
        const tri = aplicarAutomaticos({ fichas: [ficha('ale', [a({ codigoEvento: '1015', descricao: 'TRIENIO', referencia: '1,0000', valor: '626,50' })])], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL, rubricas });
        expect(tri.erros).toEqual([]);
        expect(tri.movimentos.ale.lancamentos).toEqual([expect.objectContaining({ descricao: '1015 TRIENIO', valor: 62650, tipo: 'provento', inss: true, fgts: true, irrf: true })]);
        // Fora do catálogo e sem rubrica: não há como saber se é provento ou desconto.
        expect(aplicarAutomaticos({ fichas: [ficha('ale', [a({ codigoEvento: '1015', valor: '626,50' })])], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL }).erros.join())
            .toMatch(/1015 não está no catálogo do IOB .* nem tem rubrica S-1010/);
        // Valor vale sobre a rotina do evento do catálogo.
        const fixo = aplicarAutomaticos({ fichas: [ficha('ana', [a({ referencia: '2', valor: '99,90' })])], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL });
        expect(fixo.movimentos.ana.lancamentos?.[0].valor).toBe(9990);
        // Sal: o salário-base no lugar do da ficha (10% de R$ 5.000,00 em vez de R$ 3.000,00).
        const formulas = { '0200': { expressao: 'SALARIO * 0,1', referencia: 'nenhuma' as const } };
        const comSal = aplicarAutomaticos({ fichas: [ficha('ana', [a({ referencia: '', salario: '5000,00' })])], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL, formulas });
        expect(comSal.movimentos.ana.lancamentos?.[0].valor).toBe(50000);
        expect(validarAutomaticos([a({ salario: 'abc' }), a({ codigoEvento: '300', valor: '0' })]).join(' | ')).toMatch(/"Sal".*\| .*"Valor"/);
    });
});

describe('Sal = evento-base: a referência é o percentual sobre ele (pensão do Alexandre, 14/10/2026)', () => {
    const EV = [...EVENTOS, ev('0001', 'SALÁRIO', { ro: '000' }), ev('5810', 'PENSÃO ALIMENTÍCIA', { tipo: 'D', rv: 'R', ro: '060', coeficiente: 1, incidencias: { in: 'N', ir: 'S', fg: 'N' } as EventoIobSage['incidencias'] })];
    const SAL_ALE = () => ({ mensal: 313845, horasMes: 220 });
    it('5810 com referência 33,00 e Sal 00001: 33% do salário no campo da pensão (o Valor do SAGE não entra)', () => {
        const r = aplicarAutomaticos({ fichas: [ficha('ale', [a({ codigoEvento: '5810', referencia: '33,00', salario: '00001', valor: '1' })])], movimentos: {}, competencia: '2026-10', eventos: EV, salarioDe: SAL_ALE });
        expect(r.erros).toEqual([]);
        expect(r.movimentos.ale.pensaoAlimenticia).toBe(Math.round(313845 * 0.33));
        expect(r.movimentos.ale.lancamentos).toBeUndefined();
    });
    it('evento-base que é um lançamento do mês; percentual fora de 0 a 100 é recusado', () => {
        const mov = { ale: { lancamentos: [{ descricao: '0200 GRATIFICACAO', tipo: 'provento' as const, valor: 100000, inss: true, fgts: true, irrf: true }] } };
        const r = aplicarAutomaticos({ fichas: [ficha('ale', [a({ codigoEvento: '300', referencia: '10', salario: '200' })])], movimentos: mov, competencia: '2026-10', eventos: EV, salarioDe: SAL_ALE });
        expect(r.movimentos.ale.lancamentos?.find(x => x.descricao.startsWith('0300'))?.valor).toBe(10000);
        expect(validarAutomaticos([a({ referencia: '150', salario: '00001' })]).join()).toMatch(/a referência é o percentual/);
        expect(aplicarAutomaticos({ fichas: [ficha('ale', [a({ codigoEvento: '300', referencia: '10', salario: '0999' })])], movimentos: {}, competencia: '2026-10', eventos: EV, salarioDe: SAL_ALE }).erros.join())
            .toMatch(/evento-base 0999 não está no movimento/);
    });
});

describe('Lança na rescisão e cópia para o ano seguinte (como o SAGE)', () => {
    it('no mês do desligamento só entram os marcados: proporcional aos dias ÷ 30 ou integral', () => {
        const l = [a({ valor: '626,50', codigoEvento: '200', referencia: '1', naRescisao: 'proporcional' }), a({ codigoEvento: '300', referencia: '30,00', naRescisao: 'integral' }), a({ codigoEvento: '200', referencia: '9' })];
        const deslig = ficha('ale', l, { dataDesligamento: '2026-10-14' });
        const r = aplicarAutomaticos({ fichas: [deslig], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL });
        expect(r).toMatchObject({ aplicados: 2, foraDaRescisao: 1 });
        expect(r.movimentos.ale.lancamentos).toEqual([
            expect.objectContaining({ descricao: '0200 GRATIFICACAO', valor: Math.round(62650 * 14 / 30) }),
            expect.objectContaining({ descricao: '0300 CONVENIO FARMACIA', valor: 3000 }),
        ]);
        // Rescisão simulada (a data vem da tela): a mesma regra. Fora do mês do desligamento, todos entram inteiros.
        const sim = aplicarAutomaticos({ fichas: [ficha('bia', l)], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL, desligamentos: { bia: '2026-10-14' } });
        expect(sim.foraDaRescisao).toBe(1);
        expect(aplicarAutomaticos({ fichas: [ficha('bia', l)], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL }).aplicados).toBe(3);
        // Pela rotina do evento: o avulso é proporcional também (R$ 150,00 × 14/30).
        const rot = aplicarAutomaticos({ fichas: [ficha('caio', [a({ naRescisao: 'proporcional' })], { dataDesligamento: '2026-10-14' })], movimentos: {}, competencia: '2026-10', eventos: EVENTOS, salarioDe: SAL });
        expect(rot.movimentos.caio.lancamentos?.[0].valor).toBe(7000);
    });
    it('dias trabalhados no mês do desligamento (até 30, da admissão no mesmo mês)', () => {
        expect(diasTrabalhadosNoMes('2025-01-02', '2026-10-14')).toBe(14);
        expect(diasTrabalhadosNoMes('2026-10-05', '2026-10-14')).toBe(10);
        expect(diasTrabalhadosNoMes('2025-01-02', '2026-10-31')).toBe(30);
    });
    it('sem cópia para o ano seguinte: só no ano do "a partir de"', () => {
        const l = [a({ desde: '2026-10', meses: [10, 11, 12], copiaAnoSeguinte: false }), a({ codigoEvento: '300', desde: '2026-10', meses: [10] })];
        expect(automaticosDoMes(l, '2026-11').map(x => x.codigoEvento)).toEqual(['200']);
        expect(automaticosDoMes(l, '2027-10').map(x => x.codigoEvento)).toEqual(['300']);
        expect(validarAutomaticos([a({ copiaAnoSeguinte: false })]).join()).toMatch(/informe "a partir de"/);
    });
});

describe('ficha: Complementos e Holerite', () => {
    it('abas na ficha, validação e histórico', () => {
        expect(ABAS.map(x => x.id)).toEqual(expect.arrayContaining(['complementos', 'holerite']));
        const f = ficha('ana', [], { nome: 'ANA', altura: '1,72', peso: '68', tipoSanguineo: 'O+', mensagemHolerite1: 'Parabéns pelo aniversário!' });
        expect(validarFicha(f).erros).toEqual([]);
        const ruim = validarFicha({ ...f, dados: { ...f.dados, altura: '172', mensagemHolerite2: 'x'.repeat(101) }, lancamentosAutomaticos: [a({ codigoEvento: '' })] }).erros.join(' | ');
        expect(ruim).toMatch(/Altura/); expect(ruim).toMatch(/linha 2\): até 100/); expect(ruim).toMatch(/código do evento/);
        expect(diffFicha(f, { ...f, lancamentosAutomaticos: [a({ meses: [12] })] })).toEqual([{ campo: 'lancamentosAutomaticos', de: '', para: '200 150,00 (dez)' }]);
        expect(mensagensDoHolerite(f, ' Feliz Natal ')).toEqual(['Feliz Natal', 'Parabéns pelo aniversário!']);
        expect(mensagensDoHolerite(undefined)).toEqual([]);
    });
});

describe('carga do backup do IOB', () => {
    // Colunas reais da `func` do FolhaWin (inventário do backup de 06/10/2026).
    const FUNC = ['codfun', 'nome', 'cpf', 'telefone', 'telefone2', 'tpsang', 'calca', 'camisa', 'jaqueta', 'calcado', 'cracha', 'cabelos', 'olhos', 'altura', 'peso', 'sinais', 'outrasc', 'obs1', 'obs2', 'obs3', 'obs4', 'mensa1', 'mensa2', 'mensa3', 'tiphole'];
    it('func: Complementos, observações juntas e mensagens do holerite', () => {
        const m = proporMapeamento(FUNC);
        expect(m).toMatchObject({ telefone: 'telefone', telefone2: 'telefone2', tipoSanguineo: 'tpsang', uniformeCalca: 'calca', uniformeCamisa: 'camisa', uniformeJaqueta: 'jaqueta', uniformeCalcado: 'calcado',
            cracha: 'cracha', cabelos: 'cabelos', olhos: 'olhos', altura: 'altura', peso: 'peso', sinaisParticulares: 'sinais', outrasCaracteristicas: 'outrasc', observacoes: 'obs1',
            mensagemHolerite1: 'mensa1', mensagemHolerite2: 'mensa2', mensagemHolerite3: 'mensa3' });
        const l = linhaParaCampos(FUNC, ['7', 'ANA', '52998224725', '1199', '1188', 'o +', '42', 'M', '', '38', 'S', 'CASTANHOS', 'VERDES', '172', '68,5', 'CICATRIZ', '', 'linha 1', '', 'linha 3', '', 'Boas férias', '', '', 'X'], m, 1);
        expect(l.valores).toMatchObject({ telefone2: '1188', tipoSanguineo: 'O+', uniformeCalca: '42', altura: '1.72', peso: '68.5', sinaisParticulares: 'CICATRIZ', observacoes: 'linha 1\nlinha 3', mensagemHolerite1: 'Boas férias' });
        expect(normalizarValor('tipoSanguineo', 'Z')).toBe('');
    });
    it('lancauto: meses pelas marcas, valor ou referência, e só na ficha sem automáticos', () => {
        const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].flatMap(x => [`${x}1s`, `${x}2s`, `${x}1q`, `${x}2q`]);
        const linha = (cod: string, ev: string, ref: string, valor: string, anomes: string, marcados: string[]) => [`${cod}${ev}`, cod, ev, anomes, ref, valor, '', ...meses.map(c => (marcados.includes(c) ? 'S' : 'N')), '', '1'];
        const t = { colunas: ['composto', 'codfun', 'codeven', 'anomes', 'ref', 'valor', 'refeve', ...meses, 'ano', 'pk_padrao'], linhas: [
            linha('0007', '0200', '0', '150.00', '202601', ['jan1q', 'jul2s']), linha('7', '0300', '8.5', '0', '', []), linha('8', '0200', '0', '50', '', meses), linha('9', '', '0', '10', '', []),
        ] };
        const r = automaticosDoBackup(t);
        expect(r.get('7')).toEqual([
            { codigoEvento: '0200', referencia: '', valor: '150,00', meses: [1, 7], desde: '2026-01', ate: '', observacao: 'IOB: lancauto' },
            { codigoEvento: '0300', referencia: '8,5', meses: [], desde: '', ate: '', observacao: 'IOB: lancauto' },
        ]);
        expect(r.get('8')?.[0].meses).toEqual([]);
        expect(r.has('9')).toBe(false);
        const existente = ficha('ana', []);
        existente.dados.codigoIob = '7';
        const c = compararComFichas([{ linha: 1, valores: { cpf: '52998224725', codigoIob: '7' } }], [existente], { id: 'E1', cnpj: '44388152000189' }, 'IOB', false, undefined, r);
        expect(c.completar[0].ficha.lancamentosAutomaticos).toHaveLength(2);
        expect(c.completar[0].alteracoes.map(x => x.campo)).toContain('lancamentosAutomaticos');
        const comProprios = ficha('ana', [a({ codigoEvento: '500' })]);
        comProprios.dados.codigoIob = '7';
        const c2 = compararComFichas([{ linha: 1, valores: { cpf: '52998224725', codigoIob: '7' } }], [comProprios], { id: 'E1', cnpj: '44388152000189' }, 'IOB', false, undefined, r);
        expect(c2.completar).toEqual([]);
    });
});

const srv = vi.hoisted(() => ({ params: {} as Record<string, unknown> }));
vi.mock('../../empresas/empresasService', () => ({
    atualizarParametrosFolha: async (_id: string, mudar: (p: unknown) => Record<string, unknown>) => { srv.params = mudar(srv.params); return srv.params; },
}));
import MensagemHoleriteEmpresa from '../../../components/cadastros/MensagemHoleriteEmpresa';
afterEach(() => { cleanup(); srv.params = {}; });

describe('mensagem geral do holerite (tela)', () => {
    it('grava e limpa a mensagem da empresa', async () => {
        render(<MensagemHoleriteEmpresa empresa={{ id: 'E1', parametrosFolha: { outro: 1 } } as never} />);
        fireEvent.change(screen.getByLabelText('Mensagem geral do holerite'), { target: { value: '  Feliz Natal  ' } });
        fireEvent.click(screen.getByText('Gravar'));
        await waitFor(() => expect(srv.params).toEqual({ mensagemHolerite: 'Feliz Natal' }));
        fireEvent.change(screen.getByLabelText('Mensagem geral do holerite'), { target: { value: 'x'.repeat(301) } });
        expect((screen.getByText('Gravar') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Mensagem geral do holerite'), { target: { value: '' } });
        fireEvent.click(screen.getByText('Gravar'));
        await waitFor(() => expect(srv.params).toEqual({}));
    });

    it('mensagem de aniversário: padrão sem gravar, texto próprio, voltar ao padrão e desligar', async () => {
        render(<MensagemHoleriteEmpresa empresa={{ id: 'E1', razaoSocial: 'ALFA', parametrosFolha: {} } as never} />);
        expect((screen.getByRole('textbox', { name: 'Mensagem de aniversário' }) as HTMLTextAreaElement).value).toMatch(/^Feliz aniversário, \{nome\}!/);
        expect(screen.getByText(/Exemplo: “Feliz aniversário, Maria! A ALFA deseja/)).toBeTruthy();
        fireEvent.change(screen.getByRole('textbox', { name: 'Mensagem de aniversário' }), { target: { value: 'Parabéns, {nome}!' } });
        fireEvent.click(screen.getByText('Gravar a mensagem de aniversário'));
        await waitFor(() => expect(srv.params).toEqual({ mensagemAniversario: 'Parabéns, {nome}!' }));
        fireEvent.click(screen.getByText('Voltar ao texto padrão'));
        fireEvent.click(screen.getByText('Gravar a mensagem de aniversário'));
        await waitFor(() => expect(srv.params).toEqual({}));
        fireEvent.click(screen.getByLabelText('Mensagem de aniversário ligada'));
        fireEvent.click(screen.getByText('Gravar a mensagem de aniversário'));
        await waitFor(() => expect(srv.params).toEqual({ mensagemAniversario: '' }));
    });
});
