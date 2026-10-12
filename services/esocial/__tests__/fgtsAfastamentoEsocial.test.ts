// @vitest-environment jsdom
// Afastamento com FGTS sem salário (acidente do trabalho, serviço militar): a base do FGTS dos dias afastados vai no
// S-1200 do mês em rubrica informativa (MOS S-1.3, S-1200, item 36.1), fora do líquido e do S-1210. Dados fictícios.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, sugerirDePara, type ParametrosEsocialFolha } from '../eventosFolha';
import { validarPeloXsd } from '../validadorXsd';
import { calcularMensal } from '../../calculo/motorMensal';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { Rubrica } from '../../cadastros/rubricas';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '44388152000189';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', grauExp: '1', estabelecimento: CNPJ } };
const RUB: [string, string, string, '1' | '2' | '3', Record<string, string>][] = [
    ['SAL', 'SALARIO', '1000', '1', { codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11' }], ['INSS', 'INSS', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }],
    ['IRRF', 'IRRF', '9203', '2', { codIncIRRF: '31' }],
    ['AUXAC', 'AUXILIO DOENCA ACIDENTARIO', '1099', '3', { codIncCP: '00', codIncIRRF: '09', codIncFGTS: '11' }],
    ['SMIL', 'SALARIO BASE SERVICO MILITAR', '9905', '3', { codIncCP: '00', codIncIRRF: '09', codIncFGTS: '11' }]];
const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp, inc]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '09', codIncFGTS: '00', codIncCPRP: '', observacao: '', ...inc } }] }));
const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const txt = (xml: string, tag: string) => Array.from(doc(xml).getElementsByTagName(tag)).map(e => e.textContent);
const afast = (a: Partial<Afastamento>): Afastamento => ({ ...afastamentoVazio(), id: 'a', fichaId: 'f1', ...a });

const gerar = (afastamentos: Afastamento[]) => {
    const r = calcularMensal({ competencia: '2026-03', pagamento: '2026-03', ficha: FICHA, afastamentos, tabelas: TAB, folhaPagaAntesNoMes: null });
    const de = sugerirDePara([r], RUBRICAS, '2026-03');
    const parametros: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(de.filter(i => i.sugestao).map(i => [i.chave, i.sugestao!])) };
    const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-03', dataPagamento: '2026-03-31', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros, agora: new Date('2026-03-31T12:00:00Z') });
    return { r, de, t: g.trabalhadores[0] };
};

describe('FGTS do afastamento no S-1200 mensal', () => {
    it('acidente do trabalho: a base dos dias com benefício em rubrica informativa; líquido e S-1210 sem ela; passa no XSD', async () => {
        const { r, de, t } = gerar([afast({ dtInicio: '2026-03-10', motivo: '01' })]);
        expect(de.find(i => i.chave === 'FGTSAC')).toMatchObject({ tipo: 'informativa', sugestao: { codRubr: 'AUXAC', ideTabRubr: 'T1' } });
        expect(t.erros).toEqual([]);
        const xml = t.s1200!.xml;
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const itens = Array.from(doc(xml).getElementsByTagName('itensRemun')).map(i => [i.getElementsByTagName('codRubr')[0].textContent, i.getElementsByTagName('vrRubr')[0].textContent]);
        expect(itens).toContainEqual(['AUXAC', '600.00']); // 6 dias × R$ 100,00
        expect(itens).toContainEqual(['SAL', '2400.00']);
        expect(txt(t.s1210!.xml, 'vrLiq')).toEqual([(r.totais.liquido / 100).toFixed(2)]);
        expect(t.liquido).toBe(r.totais.liquido);
    });

    it('serviço militar: rubrica informativa de natureza 9905 (exemplo do MOS)', async () => {
        const { de, t } = gerar([afast({ dtInicio: '2026-03-16', motivo: '29' })]);
        expect(de.find(i => i.chave === 'FGTSSM')).toMatchObject({ tipo: 'informativa', sugestao: { codRubr: 'SMIL', ideTabRubr: 'T1' } });
        expect(t.erros).toEqual([]);
        const xml = t.s1200!.xml;
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(xml).toMatch(/<codRubr>SMIL<\/codRubr><ideTabRubr>T1<\/ideTabRubr>(<qtdRubr>[\d.]+<\/qtdRubr>)?<vrRubr>1500.00<\/vrRubr>/);
    });

    it('sem rubrica informativa no de/para, o S-1200 não sai', () => {
        const r = calcularMensal({ competencia: '2026-03', pagamento: '2026-03', ficha: FICHA, afastamentos: [afast({ dtInicio: '2026-03-10', motivo: '01' })], tabelas: TAB, folhaPagaAntesNoMes: null });
        const parametros: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: 'SAL', ideTabRubr: 'T1' }, INSS: { codRubr: 'INSS', ideTabRubr: 'T1' }, IRRF: { codRubr: 'IRRF', ideTabRubr: 'T1' } } };
        const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-03', dataPagamento: '2026-03-31', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros, agora: new Date('2026-03-31T12:00:00Z') });
        expect(g.trabalhadores[0].erros.join(' ')).toMatch(/"Base do FGTS do afastamento por acidente \(informativa\)" sem rubrica no de\/para/);
    });
});
