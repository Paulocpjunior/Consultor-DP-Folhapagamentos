// @vitest-environment jsdom
// Plano de saúde coletivo no S-1210: mensalidade (benefício da empresa) e coparticipação → planSaude (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, normalizar, type ParametrosEsocialFolha } from '../eventosFolha';
import { validarPeloXsd } from '../validadorXsd';
import { calcularMensal } from '../../calculo/motorMensal';
import { validarBeneficios, type Beneficio } from '../../calculo/beneficios';
import { comCoparticipacao, DESCRICAO_COPART } from '../../beneficios/vtECoparticipacao';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Rubrica } from '../../cadastros/rubricas';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2026-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 162100, aliquota: 7.5, deducao: 0 }, { ate: 290284, aliquota: 9, deducao: 0 }, { ate: 435427, aliquota: 12, deducao: 0 }, { ate: 847555, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 500000, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const CNPJ = '44388152000189';
const OPER = '11222333000181';
const PLANO: Beneficio = { id: 'ps', nome: 'PLANO DE SAUDE', tipo: 'desconto', valor: 15000, inss: false, fgts: false, irrf: false, ativo: true, planoSaude: { cnpjOper: OPER, regANS: '123456' } };
const FICHA = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-03-01', salario: '3500.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' },
    beneficios: [{ beneficioId: 'ps', vidas: 2 }] } as FichaFuncionario;
const RUB: [string, string, string, '1' | '2'][] = [['SAL', 'SALARIO', '1000', '1'], ['INSS', 'INSS', '9201', '2'], ['PS', 'PLANO DE SAUDE', '9219', '2'], ['COP', 'COPARTICIPACAO', '9219', '2']];
const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] }));
const PARAMS: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: {
    SAL: { codRubr: 'SAL', ideTabRubr: 'T1' }, INSS: { codRubr: 'INSS', ideTabRubr: 'T1' }, 'BEN-ps': { codRubr: 'PS', ideTabRubr: 'T1' }, [`LAN:${normalizar(DESCRICAO_COPART)}`]: { codRubr: 'COP', ideTabRubr: 'T1' } } };

describe('plano de saúde no S-1210', () => {
    it('benefício de plano: CNPJ da operadora e reg. ANS validados; só desconto', () => {
        expect(validarBeneficios([PLANO])).toEqual([]);
        expect(validarBeneficios([{ ...PLANO, tipo: 'provento', planoSaude: { cnpjOper: '123', regANS: '12' } }]).join(' ')).toMatch(/CNPJ da operadora.*6 dígitos.*desconto/);
    });

    it('mensalidade e coparticipação somadas por operadora no planSaude do titular; passa no XSD', async () => {
        const movimento = comCoparticipacao(null, 4750, { cnpjOper: OPER, regANS: '123456' });
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [], movimento, beneficios: [PLANO] });
        expect(r.verbas.filter(v => v.planoSaude).map(v => [v.descricao, v.valor])).toEqual(expect.arrayContaining([[DESCRICAO_COPART, 4750], ["PLANO DE SAUDE", 30000]]));
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-09-30', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, agora: new Date('2026-10-01T12:00:00Z') }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        expect(t.s1210!.xml).toContain(`<infoIRComplem><planSaude><cnpjOper>${OPER}</cnpjOper><regANS>123456</regANS><vlrSaudeTit>347.50</vlrSaudeTit></planSaude></infoIRComplem>`);
        expect(t.avisos.join(' ')).toMatch(/Plano de saúde no S-1210: 347.50/);
        expect(await validarPeloXsd(t.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });

    it('sem a operadora, nada de planSaude', () => {
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [], movimento: comCoparticipacao(null, 4750), beneficios: [{ ...PLANO, planoSaude: undefined }] });
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-09-30', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS }).trabalhadores[0];
        expect(t.s1210!.xml).not.toContain('planSaude');
    });
});
