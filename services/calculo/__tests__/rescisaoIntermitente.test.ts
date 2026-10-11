// Rescisão do intermitente: média dos meses com remuneração (Portaria MTb 349/2018, art. 5º), convocações do mês até o
// desligamento, aviso e projeção pela média, e o S-2299 com os dias trabalhados (dados fictícios).
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { avosDaProjecao, calcularRescisao } from '../motorRescisao';
import { convocacaoVazia, diasDoPeriodo, type Convocacao } from '../intermitente';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';
import { gerarS2299 } from '../../esocial/desligamento';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import type { ParametrosEsocialFolha } from '../../esocial/eventosFolha';

const lerXsd = (nome: string) => readFile(new URL(`../../../public/esocial-xsd/v_S_01_03_00/${nome}`, import.meta.url), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '29463877000109';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'desligado',
    dados: { nome: 'JOAO', admissao: '2025-02-10', salario: '15.00', unidadeSalario: '1', horasMes: '220', categoria: '111', regimeTrabalhista: '1', dataDesligamento: '2026-09-10', motivoDesligamento: '02' } };
const conv = (id: string, dias: Convocacao['dias']): Convocacao => ({ ...convocacaoVazia('E1', 'f1', id), enviadaEm: '2026-01-01', resposta: 'aceita', respondidaEm: '2026-01-02', dias });
// Junho: 6 dias de 8 h (48 h); julho: 12 dias (96 h); agosto: nada; setembro: 5 dias até o desligamento e um depois.
const CONVS = [
    conv('jun', diasDoPeriodo('2026-06-01', '2026-06-06', [1, 2, 3, 4, 5, 6], 8)),
    conv('jul', diasDoPeriodo('2026-07-06', '2026-07-18', [1, 2, 3, 4, 5, 6], 8)),
    conv('set', [...diasDoPeriodo('2026-09-01', '2026-09-05', [1, 2, 3, 4, 5, 6], 8), { data: '2026-09-14', horas: 8 }]),
];
const v = (r: ReturnType<typeof calcularRescisao>, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('rescisão do intermitente', () => {
    const r = calcularRescisao({ ficha: FICHA, data: '2026-09-10', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {}, convocacoes: CONVS, saldoFgts: 100000 });
    it('média dos meses com remuneração; aviso e projeção pela média; sem 13º e férias proporcionais de novo', () => {
        expect(r.erros).toEqual([]);
        // Junho: 48 h × 15 = 720 + DSR 120 = 840; julho: 96 h × 15 = 1.440 + DSR (2 domingos ÷ 12 úteis) 240 = 1.680. Média 1.260.
        expect(r.memoria.join('\n')).toMatch(/média dos 2 mês\(es\) com remuneração.*= R\$\s1\.260,00/);
        expect(r.diasAviso).toBe(33);
        expect(v(r, 'AVISO')).toBe(Math.round(126000 / 30 * 33));
        expect(avosDaProjecao(33)).toBe(1);
        expect(v(r, '13IND')).toBe(10500);
        expect(v(r, 'FP')).toBe(10500); expect(v(r, 'FP13')).toBe(3500);
        expect(v(r, '13PROP')).toBe(0);
        expect(r.verbas.some(x => /^FV/.test(x.codigo))).toBe(false);
        // Convocações do mês até o desligamento (o dia 14 fica de fora), com as parcelas delas.
        expect(v(r, 'INTERM')).toBe(40 * 1500);
        expect(v(r, '13INT')).toBeGreaterThan(0);
        expect(r.diasIntermitente).toEqual([1, 2, 3, 4, 5].map(dia => ({ dia, horas: 8 })));
        expect(r.percentualMulta).toBe(40);
    });
    it('pedido de demissão: sem aviso indenizado nem projeção; sem convocações carregadas, erro', () => {
        const p = calcularRescisao({ ficha: FICHA, data: '2026-09-10', tipo: '07', aviso: 'dispensado', afastamentos: [], tabelas: TAB, movimentos: {}, convocacoes: CONVS });
        expect([v(p, 'AVISO'), v(p, '13IND'), v(p, 'FP')]).toEqual([0, 0, 0]);
        expect(calcularRescisao({ ficha: FICHA, data: '2026-09-10', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} }).erros.join()).toMatch(/convocações não foram carregadas/);
    });
    it('S-2299 com os dias trabalhados no mês (infoInterm); sem dias no mês, dia 0; XSD', async () => {
        const rub = (cod: string, nat: string, tp: '1' | '2'): Rubrica => ({ id: cod, empresaId: 'E1', codRubr: cod, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: cod, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] });
        const codigos: [string, string, '1' | '2'][] = [['INTERM', '1000', '1'], ['DSRINT', '1002', '1'], ['FERINT', '1016', '1'], ['FERINT13', '1017', '1'], ['13INT', '5001', '1'],
            ['RESC:AVISO', '6003', '1'], ['RESC:13IND', '6001', '1'], ['RESC:FP', '6006', '1'], ['RESC:FP13', '6006', '1'], ['INSS', '9201', '2'], ['INSS13', '9201', '2'], ['IRRF', '9203', '2'], ['IRRF13', '9203', '2'], ['IRRFFER', '9203', '2']];
        const RUBRICAS = codigos.map(([c, n, t]) => rub(c.replace('RESC:', 'R'), n, t));
        const p: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(codigos.map(([c]) => [c, { codRubr: c.replace('RESC:', 'R'), ideTabRubr: 'T1' }])) };
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: p, hoje: '2026-09-12', agora: new Date('2026-09-12T12:00:00Z') });
        expect(g.erros).toEqual([]);
        expect(g.evento!.xml).toContain('<infoInterm><dia>1</dia></infoInterm><infoInterm><dia>2</dia></infoInterm>');
        expect(g.evento!.xml).not.toContain('<dia>14</dia>');
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const semDias = { ...r, diasIntermitente: [] };
        expect(gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: semDias, rubricas: RUBRICAS, parametros: p, hoje: '2026-09-12' }).evento?.xml).toContain('<infoInterm><dia>0</dia></infoInterm>');
    });
});
