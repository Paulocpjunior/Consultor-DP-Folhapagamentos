import { describe, expect, it } from 'vitest';
import { avisosDeFerias, fichasFinanceiras, mesesSemFolha, type FolhaDoMes, type ProcessoDoMes } from '../relatoriosAnuais';
import { chaveDoHolerite, competenciaDoProcesso, paraGravar } from '../../calculo/processosGravados';
import { avisoFeriasPdf, fichaFinanceiraPdf } from '../relatoriosAnuaisPdf';
import type { ResultadoCalculo } from '../../calculo/motorMensal';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio } from '../../cadastros/afastamentos';

const hol = (fichaId: string, nome: string, comp: string, sal: number, extra: { codigo: string; tipo: 'provento' | 'desconto'; valor: number }[] = []): ResultadoCalculo => {
    const verbas = [{ codigo: 'SAL', descricao: 'Salário', referencia: '30', tipo: 'provento' as const, valor: sal, inss: true, irrf: true, fgts: true },
        { codigo: 'INSS', descricao: 'INSS', referencia: '', tipo: 'desconto' as const, valor: Math.round(sal * 0.08), inss: false, irrf: false, fgts: false },
        ...extra.map(e => ({ ...e, descricao: e.codigo, referencia: '', inss: true, irrf: true, fgts: true }))];
    const prov = verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0); const desc = verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    return { fichaId, nome, competencia: comp, pagamento: '', situacao: 'calculado', verbas, bases: { inss: prov, fgts: prov, irrf: prov - desc }, totais: { proventos: prov, descontos: desc, liquido: prov - desc }, fgts: Math.round(prov * 0.08), memoria: [], avisos: [], erros: [] } as ResultadoCalculo;
};
const folhas: FolhaDoMes[] = [
    { competencia: '2026-08', holerites: [hol('f1', 'BRUNO', '2026-08', 300000), hol('f2', 'ANA', '2026-08', 200000)] },
    { competencia: '2026-09', holerites: [hol('f1', 'BRUNO', '2026-09', 300000, [{ codigo: 'HE50', tipo: 'provento', valor: 45000 }])] },
    { competencia: '2025-12', holerites: [hol('f1', 'BRUNO', '2025-12', 280000)] },
];

describe('ficha financeira', () => {
    it('mês a mês e verba a verba, só o ano pedido, com totais', () => {
        const fs = fichasFinanceiras('2026', folhas);
        expect(fs.map(f => f.nome)).toEqual(['ANA', 'BRUNO']);
        const b = fs[1];
        expect(b.mesesComFolha).toEqual([7, 8]);
        const sal = b.linhas.find(l => l.codigo === 'SAL')!;
        expect(sal.meses.slice(6, 10)).toEqual([null, 300000, 300000, null]);
        expect(sal.total).toBe(600000);
        expect(b.linhas.find(l => l.codigo === 'HE50')!.meses[8]).toBe(45000);
        expect(b.linhas.map(l => l.descricao).slice(0, 3)).toEqual(['HE50', 'Salário', 'INSS']);
        expect(b.linhas.find(l => l.descricao === 'Líquido')!.total).toBe(300000 - 24000 + 345000 - 24000);
        expect(fichasFinanceiras('2026', folhas, 'f2').map(f => f.nome)).toEqual(['ANA']);
        expect(mesesSemFolha('2026', folhas, '2026-10')).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Out']);
    });
    it('férias, 13º e rescisão gravados entram depois da folha, por processo e no mês gravado', () => {
        const ferias = { ...hol('f1', 'BRUNO', '2026-09', 0, [{ codigo: 'FER', tipo: 'provento', valor: 300000 }, { codigo: 'FER13', tipo: 'provento', valor: 100000 }]), gozoId: 'E_1_M_2026-09-01' };
        const processos: ProcessoDoMes[] = [
            { tipo: 'ferias', competencia: '2026-09', holerites: [ferias] },
            { tipo: '13-1a', competencia: '2026-11', holerites: [hol('f1', 'BRUNO', '2026-13', 150000), hol('f3', 'CAIO', '2026-13', 100000)] },
            { tipo: 'rescisao', competencia: '2025-09', holerites: [hol('f1', 'BRUNO', '2025-09', 1)] },
        ];
        const fs = fichasFinanceiras('2026', folhas, undefined, [], processos);
        expect(fs.map(f => f.nome)).toEqual(['ANA', 'BRUNO', 'CAIO']);
        const b = fs.find(f => f.nome === 'BRUNO')!;
        const descr = b.linhas.map(l => l.descricao);
        // Folha mensal primeiro; a mesma verba (SAL) do 13º fica numa linha própria, sem somar à da folha.
        expect(descr.indexOf('Líquido')).toBeLessThan(descr.indexOf('Férias · FER'));
        expect(b.linhas.find(l => l.descricao === 'Salário')!.total).toBe(600000);
        expect(b.linhas.find(l => l.descricao === '13º 1ª parcela · Salário')!.meses[10]).toBe(150000);
        expect(b.linhas.find(l => l.descricao === 'Férias · FER')).toMatchObject({ processo: 'ferias', total: 300000 });
        expect(b.linhas.find(l => l.descricao === 'Líquido · Férias')!.meses[8]).toBe(ferias.totais.liquido);
        // Rescisão de outro ano não entra; quem só tem processo (CAIO) aparece.
        expect(descr.some(d => d.startsWith('Rescisão'))).toBe(false);
        expect(fs.find(f => f.nome === 'CAIO')!.mesesComFolha).toEqual([]);
        expect(chaveDoHolerite(ferias)).toBe('E_1_M_2026-09-01');
        expect(chaveDoHolerite(hol('f1', 'BRUNO', '2026-13', 1))).toBe('f1');
    });
    it('competência do processo: o mês do pagamento no 13º (padrão nov/dez); a da tela nas férias e rescisão; erros ficam fora', () => {
        expect(competenciaDoProcesso('13-1a', '2026-10', 2026, '2026-10')).toBe('2026-10');
        expect(competenciaDoProcesso('13-2a', '2026-10', 2026, '2025-12')).toBe('2026-12');
        expect(competenciaDoProcesso('13-1a', '2026-10', 2026, '')).toBe('2026-11');
        expect(competenciaDoProcesso('rescisao', '2026-10', 2026, '2026-11')).toBe('2026-10');
        const erro = { ...hol('f9', 'ZÉ', '2026-10', 1), situacao: 'erro' as const, erros: ['sem admissão'] };
        const g = paraGravar([hol('f1', 'BRUNO', '2026-10', 100000), erro]);
        expect([g.validos.length, g.totais.funcionarios, g.foraPorErro]).toEqual([1, 1, ['ZÉ: sem admissão']]);
    });
    it('PDF em paisagem, uma página por funcionário', () => {
        const doc = fichaFinanceiraPdf(fichasFinanceiras('2026', folhas), '2026', { empresa: { razaoSocial: 'EMPRESA', cnpj: '11222333000181' }, titulo: 'Ficha financeira', previa: false }, 'obs', () => 'Matrícula 1');
        expect(doc.getNumberOfPages()).toBe(2);
        expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
    });
});

describe('aviso de férias', () => {
    const ficha: FichaFuncionario = { ...fichaVazia({ id: 'e1', cnpj: '11222333000181' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'BRUNO', cargo: 'AUXILIAR', ctps: '123', serieCtps: '45', ufCtps: 'SP' } };
    const gozo = (id: string, ini: string, fim: string, abono = '') => ({ ...afastamentoVazio(), id, empresaId: 'e1', fichaId: 'f1', motivo: '15', dtInicio: ini, dtFim: fim, perAquisInicio: '2025-08-01', perAquisFim: '2026-07-31', abonoDias: abono });
    it('gozos da competência e do mês seguinte, data do aviso 30 dias antes', () => {
        const a = avisosDeFerias('2026-10', '2026-10-10', [ficha], [gozo('a', '2026-11-16', '2026-12-05', '10'), gozo('b', '2026-12-01', '2026-12-10'), { ...gozo('c', '2026-10-20', '2026-10-29'), motivo: '03' }]);
        expect(a).toHaveLength(1);
        expect(a[0]).toMatchObject({ inicio: '2026-11-16', fim: '2026-12-05', dias: 20, retorno: '2026-12-06', abonoDias: 10, dataAviso: '2026-10-17', avisoForaDoPrazo: false, ctps: '123 série 45 SP' });
        const tarde = avisosDeFerias('2026-10', '2026-10-10', [ficha], [gozo('d', '2026-10-26', '2026-11-04')]);
        expect(tarde[0]).toMatchObject({ dataAviso: '2026-10-10', avisoForaDoPrazo: true, dias: 10 });
    });
    it('PDF: um aviso por página', () => {
        const a = avisosDeFerias('2026-10', '2026-10-01', [ficha], [gozo('a', '2026-11-16', '2026-12-05'), gozo('b', '2026-10-20', '2026-10-29')]);
        const doc = avisoFeriasPdf(a, { empresa: { razaoSocial: 'EMPRESA', cnpj: '11222333000181' }, titulo: 'Aviso de férias', previa: false }, { razaoSocial: 'EMPRESA' });
        expect(doc.getNumberOfPages()).toBe(2);
    });
});
