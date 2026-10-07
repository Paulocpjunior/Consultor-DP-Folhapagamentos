// Histórico da folha do IOB (holerith) → movimento mensal (dados fictícios).
import { describe, expect, it } from 'vitest';
import { classificarEvento, mesclarMovimentos, movimentosDoHolerith, naturezasDosEventos, quantidade } from '../movimentosDoBackup';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../../cadastros/funcionarios';

const empresa = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (cpf: string, matricula: string, dados: FichaFuncionario['dados']): FichaFuncionario => ({ ...fichaVazia(empresa), id: idFuncionario(empresa.id, cpf, matricula), cpf, matriculaEsocial: matricula, situacao: 'ativo', dados });

describe('o que cada evento do IOB é no movimento', () => {
    it('pela natureza da rubrica (1003, 9207, 9211) e pela descrição', () => {
        expect(classificarEvento('1003', 'HORAS EXTRAS 50%')).toBe('horasExtras50');
        expect(classificarEvento('1003', 'H.EXTRAS 100%')).toBe('horasExtras100');
        expect(classificarEvento('1003', 'REFLEXO H.E. NO DSR')).toBeNull();
        expect(classificarEvento('9207', 'FALTAS')).toBe('faltasDias');
        expect(classificarEvento('9211', 'FALTAS/ATRASOS')).toBeNull();
        expect(classificarEvento('9211', 'FALTAS NO MES')).toBe('faltasDias');
        expect(classificarEvento('9207', 'DSR S/ FALTAS')).toBe('dsrDescontadoDias');
        expect(classificarEvento('', 'D.S.R. DESCONTADO FALTA')).toBe('dsrDescontadoDias');
        expect(classificarEvento('', 'DSR S/ HORAS EXTRAS')).toBeNull();
        expect(classificarEvento('', 'HORA EXTRA 60%')).toBe('horasExtras50');
        expect(classificarEvento('', 'FALTAS ABONADAS')).toBeNull();
        expect(classificarEvento('1000', 'SALARIO')).toBeNull();
        expect(classificarEvento('1004', 'HORAS EXTRAS BANCO')).toBeNull();
    });

    it('natureza pela rubrica do S-1010 ligada ao evento', () => {
        const eventos = { colunas: ['pk_padrao', 'codeven', 'codesocial', 'rubesocial'], linhas: [['1', '0050', '', '50'], ['2', '120', '', 'R120'], ['3', '9', '', '']] };
        const s1010 = { colunas: ['codrubr', 'natrubr', 'dscrubr'], linhas: [['50', '1003', 'HE 50'], ['R120', '9207', 'FALTAS'], ['9', '1000', 'SAL']] };
        expect([...naturezasDosEventos(eventos, s1010)]).toEqual([['50', '1003'], ['120', '9207'], ['9', '1000']]);
        expect(naturezasDosEventos(null, s1010).size).toBe(0);
    });

    it('quantidades: decimal com vírgula ou ponto; hh,mm quando pedido', () => {
        expect(quantidade('10,5')).toBe(10.5);
        expect(quantidade('10.50')).toBe(10.5);
        expect(quantidade('1.234,5')).toBe(1234.5);
        expect(quantidade('10:30')).toBe(10.5);
        expect(quantidade('10,30', true)).toBe(10.5);
        expect(quantidade('')).toBe(0);
    });
});

describe('movimento mensal pelo holerith', () => {
    const COLS = ['final', 'proced', 'composto', 'codfun', 'anomes', 'codeven', 'ref', 'valor', 'everef', 'tabsal', 'vl_des', 'vl_ven', 'status', 'descricao'];
    const l = (codfun: string, anomes: string, codeven: string, ref: string, descricao: string) => COLS.map(c => ({ codfun, anomes, codeven, ref, descricao } as Record<string, string>)[c] ?? null);
    const ana = ficha('52998224725', '000052', { codigoIob: '52', admissao: '2022-05-02' });
    const naturezas = new Map([['50', '1003'], ['51', '1003'], ['120', '9207']]);

    it('soma por funcionário e mês, respeita o "a partir de" e o vínculo', () => {
        const holerith = { colunas: COLS, linhas: [
            l('000052', '202501', '50', '10,5', 'HORAS EXTRAS 50%'), l('52', '202501', '50', '2', 'HORAS EXTRAS 50%'),
            l('52', '202501', '51', '4', 'HORAS EXTRAS 100%'), l('52', '202502', '120', '2', 'FALTAS'),
            l('52', '202502', '1', '30', 'SALARIO'), l('52', '202312', '50', '8', 'HORAS EXTRAS 50%'),
            l('52', '202201', '50', '8', 'HORAS EXTRAS 50%'), // antes da admissão
            l('999', '202501', '50', '5', 'HORAS EXTRAS 50%'), // sem ficha
            l('52', '202502', '120', '16', 'FALTAS EM HORAS'),
        ] };
        const r = movimentosDoHolerith(holerith, naturezas, [ana], { desde: '2024-01' });
        expect(r.movimentos).toEqual([
            { fichaId: ana.id, competencia: '2025-01', movimento: { horasExtras50: 12.5, horasExtras100: 4 } },
            { fichaId: ana.id, competencia: '2025-02', movimento: { faltasDias: 2 } },
        ]);
        expect(r.eventos.map(e => [e.codeven, e.classe, e.linhas])).toEqual([['120', 'faltasDias', 2], ['50', 'horasExtras50', 3], ['51', 'horasExtras100', 1]]);
        expect(r.avisos.join(' ')).toMatch(/1 lançamento\(s\) de funcionário sem ficha/);
        expect(r.avisos.join(' ')).toMatch(/falta em horas/);
        expect(movimentosDoHolerith(holerith, naturezas, [ana], { desde: '2022-01' }).movimentos.map(m => m.competencia)).toEqual(['2023-12', '2025-01', '2025-02']);
    });

    it('mescla: só preenche o que falta; lançado com outro valor fica e é listado', () => {
        const imp = [{ fichaId: 'f1', competencia: '2025-01', movimento: { horasExtras50: 12.5, faltasDias: 1 } }, { fichaId: 'f1', competencia: '2025-02', movimento: { horasExtras50: 3 } }];
        const existentes = { f1: { '2025-01': { horasExtras50: 10, pensaoAlimenticia: 50000 }, '2025-02': { horasExtras50: 3 } } };
        const [jan, fev] = mesclarMovimentos(imp, existentes);
        expect(jan).toMatchObject({ mudou: true, preservados: ['horasExtras50'], depois: { horasExtras50: 10, faltasDias: 1, pensaoAlimenticia: 50000 } });
        expect(fev.mudou).toBe(false);
        expect(mesclarMovimentos(imp, {})[0]).toMatchObject({ antes: null, mudou: true, depois: { horasExtras50: 12.5, faltasDias: 1 } });
    });
});
