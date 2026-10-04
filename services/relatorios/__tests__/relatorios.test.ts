import { describe, expect, it } from 'vitest';
import { resumirFolha } from '../resumoFolha';
import { holeritesPdf, resumoPdf, textoPdf } from '../holeritePdf';
import { calcularMensal } from '../../calculo/motorMensal';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const SF: TabelaLegal = { id: 's', tipo: 'salario_familia', vigencia: '2025-01', norma: 'Portaria', observacao: '', faixas: [], valores: { cotaSalarioFamilia: 6500, limiteSalarioFamilia: 190604 } };
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (id: string, nome: string, salario: string, dependentes: FichaFuncionario['dependentes'] = []): FichaFuncionario => ({ ...fichaVazia(EMP), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo', dependentes,
    dados: { nome, admissao: '2024-01-02', salario, unidadeSalario: '5', horasSemanais: '44', categoria: '101', cargo: 'AUXILIAR', codigoIob: '17' } });
const filho = { tipo: '03', nome: 'FILHO', nascimento: '2018-01-01', cpf: '', irrf: 'S', salarioFamilia: 'S' };
const fichas = [ficha('f1', 'ANA ÁGUEDA', '1800.00', [filho]), ficha('f2', 'BRUNO', '6000.00'), ficha('f3', 'SEM SALÁRIO', '')];
const resultados = fichas.map(f => calcularMensal({ competencia: '2026-03', ficha: f, afastamentos: [], tabelas: [INSS, IR, SF], movimento: f.id === 'f2' ? { horasExtras50: 10 } : undefined }));
const o = { empresa: { razaoSocial: 'EMPRESA UM LTDA', cnpj: '11222333000181', codigoSage: '0229' }, titulo: 'Folha mensal 03/2026', previa: true };

describe('relatórios da folha', () => {
    it('resumo: totais por verba, situações e o quadro das guias', () => {
        const r = resumirFolha(resultados);
        expect(r.funcionarios).toBe(3);
        expect(r.situacoes).toEqual({ calculado: 2, incompleto: 0, erro: 1 });
        const sal = r.porVerba.find(l => l.codigo === 'SAL')!;
        expect(sal).toMatchObject({ tipo: 'provento', funcionarios: 2, valor: 180000 + 600000 });
        expect(r.porVerba.find(l => l.codigo === 'HE50')).toMatchObject({ funcionarios: 1 });
        expect(r.porVerba[0].tipo).toBe('provento');
        expect(r.porVerba.at(-1)!.tipo).toBe('desconto');
        const soma = (c: string) => resultados.filter(x => x.situacao !== 'erro').reduce((s, x) => s + (x.verbas.find(v => v.codigo === c)?.valor ?? 0), 0);
        expect(r.encargos).toEqual({ inssSegurados: soma('INSS'), irrf: soma('IRRF'), fgts: resultados[0].fgts + resultados[1].fgts, multaFgts: 0, salarioFamilia: 6500, salarioMaternidade: 0 });
        expect(r.totais.liquido).toBe(resultados[0].totais.liquido + resultados[1].totais.liquido);
    });

    it('revisão do PR #57: pessoas distintas, multa do FGTS e assinatura que não cabe', () => {
        const dois = [{ ...resultados[0], multaFgts: 40000 }, { ...resultados[0] }, resultados[1]];
        const r = resumirFolha(dois as typeof resultados);
        expect([r.funcionarios, r.registros]).toEqual([2, 3]);
        expect(r.encargos.multaFgts).toBe(40000);
        const muitos = { ...resultados[0], verbas: Array.from({ length: 45 }, (_, i) => ({ codigo: `LAN${i + 1}`, descricao: `Lançamento ${i + 1}`, referencia: '', tipo: 'desconto' as const, valor: 100, inss: false, fgts: false, irrf: false })) };
        expect(holeritesPdf([muitos], fichas, o).getNumberOfPages()).toBe(2);
    });

    it('lançamentos avulsos agrupam pela descrição, não pelo código posicional', () => {
        const lan = (codigo: string, descricao: string, valor: number) => ({ codigo, descricao, referencia: '', tipo: 'desconto' as const, valor, inss: false, fgts: false, irrf: false });
        const a = { ...resultados[0], fichaId: 'a', verbas: [lan('LAN1', 'Vale-transporte', 100), lan('LAN2', 'Farmácia', 50)] };
        const b = { ...resultados[0], fichaId: 'b', verbas: [lan('LAN1', 'Farmácia', 30), lan('LAN2', 'vale-transporte ', 20)] };
        expect(resumirFolha([a, b]).porVerba.map(l => [l.codigo, l.descricao, l.funcionarios, l.valor])).toEqual([['LAN', 'Vale-transporte', 2, 120], ['LAN', 'Farmácia', 2, 80]]);
    });

    it('férias vencidas de vários períodos somam numa linha', () => {
        const base = { ...resultados[0], verbas: [
            { codigo: 'FV2024-01-02', descricao: 'Férias vencidas 2024/2025', referencia: '', tipo: 'provento' as const, valor: 100, inss: false, fgts: false, irrf: false },
            { codigo: 'FV2025-01-02', descricao: 'Férias vencidas 2025/2026', referencia: '', tipo: 'provento' as const, valor: 200, inss: false, fgts: false, irrf: false },
        ] };
        expect(resumirFolha([base]).porVerba).toEqual([{ codigo: 'FV', descricao: 'Férias vencidas 2024/2025', tipo: 'provento', funcionarios: 1, valor: 300 }]);
    });

    it('holerites em PDF: uma página por funcionário calculado, com a marca de prévia', () => {
        const doc = holeritesPdf(resultados, fichas, o);
        expect(doc.getNumberOfPages()).toBe(2);
        const bruto = doc.output();
        expect(bruto.match(/PR(\\311|É|\xc9)VIA/g)?.length).toBe(2); // uma marca por página
        expect(bruto).toContain('EMPRESA UM LTDA');
        expect(bruto).toContain('BRUNO');
        expect(bruto).not.toContain('SEM SAL');
        expect(holeritesPdf([], fichas, o).getNumberOfPages()).toBe(1);
        const resumo = resumoPdf(resumirFolha(resultados), o, 'Folha mensal: o quadro serve para a DCTFWeb e o FGTS Digital.');
        expect(resumo.output()).toContain('Para conferir as guias');
    });

    it('texto do PDF sem caracteres fora da fonte', () => {
        expect(textoPdf('INSS − retido “x” → ok…')).toBe('INSS - retido "x"  ok...');
        expect(textoPdf('Férias 1/3 · nº 5 — ok')).toBe('Férias 1/3 · nº 5 — ok');
    });
});
