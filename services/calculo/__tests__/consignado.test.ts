// Crédito do Trabalhador (consignado CLT): contratos, margem de 35%, motor mensal, rescisão e o descFolha no S-1200 e
// no S-2299, conferidos no XSD oficial S-1.3 (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contratosNoMes, descontosConsignado, validarContratos, type ContratoConsignado } from '../consignado';
import { calcularMensal, type Verba } from '../motorMensal';
import { calcularRescisao } from '../motorRescisao';
import { fichaVazia, diffFicha, validarFicha, type FichaFuncionario } from '../../cadastros/funcionarios';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import type { Rubrica } from '../../cadastros/rubricas';
import { erroDescFolha, gerarEventosFolha, type ParametrosEsocialFolha } from '../../esocial/eventosFolha';
import { gerarS2299, sugerirDeParaRescisao } from '../../esocial/desligamento';
import { validarPeloXsd } from '../../esocial/validadorXsd';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '29463877000109';
const C1: ContratoConsignado = { instFinanc: '341', nrDoc: 'CT-2026/001', parcela: 45000, inicio: '2026-05', fim: '2027-04' };
const C2: ContratoConsignado = { instFinanc: '104', nrDoc: 'X9', parcela: 90000, inicio: '2026-09', saldoRescisao: 500000 };
const ficha = (consignados: ContratoConsignado[], dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2025-06-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', regimeTrabalhista: '1', ...dados }, consignados });
const v = (codigo: string, tipo: 'provento' | 'desconto', valor: number): Verba => ({ codigo, descricao: codigo, referencia: '', tipo, valor, inss: false, fgts: false, irrf: false });

describe('contratos e margem', () => {
    it('validação pelo XSD (instituição de 3 dígitos, contrato de 2 a 15) e meses', () => {
        expect(validarContratos([C1, C2])).toEqual([]);
        const e = validarContratos([{ instFinanc: '34', nrDoc: '-AB', parcela: 0, inicio: '2026-13' }, { ...C1, fim: '2026-01' }, C1]).join(' ');
        for (const m of [/3 dígitos/, /2 a 15 caracteres/, /parcela mensal/, /primeiro desconto/, /último mês inválido/, /contrato repetido/]) expect(e).toMatch(m);
        expect(contratosNoMes([C1, C2], '2026-08').map(c => c.nrDoc)).toEqual(['CT-2026/001']);
        expect(contratosNoMes([C1, C2], '2027-05').map(c => c.nrDoc)).toEqual(['X9']);
    });
    it('35% da remuneração disponível (menos INSS, IRRF e pensão), na ordem do início; o que não cabe vira aviso', () => {
        const verbas = [v('SAL', 'provento', 300000), v('INSS', 'desconto', 25000), v('IRRF', 'desconto', 0), v('VT', 'desconto', 18000)];
        const a = descontosConsignado([C2, C1], '2026-09', verbas);
        expect([a.disponivel, a.margem]).toEqual([275000, 96250]);
        expect(a.verbas.map(x => [x.descFolha?.nrDoc, x.valor])).toEqual([['CT-2026/001', 45000], ['X9', 51250]]);
        expect(a.avisos.join(' ')).toMatch(/contrato X9: descontado R\$\s?512,50 de R\$\s?900,00 \(margem de 35% esgotado\)/);
        expect(a.verbas[0]).toMatchObject({ codigo: 'CONSIG', tipo: 'desconto', inss: false, fgts: false, irrf: false, descFolha: { instFinanc: '341', nrDoc: 'CT-2026/001' } });
        // O líquido também limita.
        const pouco = descontosConsignado([C1], '2026-09', [v('SAL', 'provento', 300000), v('ADIANT', 'desconto', 280000)]);
        expect(pouco.verbas[0].valor).toBe(20000);
        expect(pouco.avisos[0]).toMatch(/líquido esgotado/);
        expect(descontosConsignado([C1], '2026-04', verbas).verbas).toEqual([]);
    });
    it('ficha: valida e audita os contratos', () => {
        expect(validarFicha(ficha([{ ...C1, instFinanc: '1' }])).erros.join(' ')).toMatch(/Tabela 37/);
        expect(diffFicha(ficha([]), ficha([C1])).map(a => a.campo)).toContain('consignados');
    });
});

describe('motor e rescisão', () => {
    it('folha mensal desconta a parcela depois do INSS e do IRRF, sem mexer nas bases', () => {
        const sem = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha: ficha([]), tabelas: TAB, afastamentos: [] });
        const com = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha: ficha([C1]), tabelas: TAB, afastamentos: [] });
        expect(com.verbas.find(x => x.codigo === 'CONSIG')?.valor).toBe(45000);
        expect(com.bases).toEqual(sem.bases);
        expect(sem.totais.liquido - com.totais.liquido).toBe(45000);
        expect(com.memoria.join(' ')).toMatch(/margem de 35% da remuneração disponível/);
    });
    it('rescisão: uma vez só, sobre as verbas rescisórias, pelo saldo informado', () => {
        const r = calcularRescisao({ ficha: ficha([C1, C2], { dataDesligamento: '2026-10-05' }), data: '2026-10-05', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
        const cons = r.verbas.filter(x => x.codigo === 'CONSIG');
        expect(cons.map(x => x.descFolha?.nrDoc)).toEqual(['CT-2026/001', 'X9']);
        expect(cons[0].valor).toBe(45000);
        expect(cons[1].valor).toBeLessThanOrEqual(500000);
        expect(r.memoria.join(' ')).toMatch(/verba rescisória disponível/);
    });
});

const rub = (cod: string, dsc: string, nat: string, tp: '1' | '2'): Rubrica => ({ id: cod, empresaId: 'E1', codRubr: cod, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] });

describe('eSocial: descFolha (XSD S-1.3)', () => {
    const RUBRICAS = [rub('0001', 'SALARIO', '1000', '1'), rub('5000', 'INSS', '9201', '2'), rub('5002', 'IRRF', '9203', '2'), rub('7000', 'CREDITO DO TRABALHADOR', '9253', '2'), rub('7001', 'OUTRO DESCONTO', '9299', '2')];
    const PARAMS = (consig = '7000'): ParametrosEsocialFolha => ({ nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: {
        SAL: { codRubr: '0001', ideTabRubr: 'T1' }, INSS: { codRubr: '5000', ideTabRubr: 'T1' }, IRRF: { codRubr: '5002', ideTabRubr: 'T1' }, CONSIG: { codRubr: consig, ideTabRubr: 'T1' } } });

    it('S-1200: um item por contrato, cada um com o seu descFolha; passa no XSD', async () => {
        const f = ficha([C1, { ...C2, parcela: 10000, observacao: 'Parcela 1/24' }]);
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha: f, tabelas: TAB, afastamentos: [] });
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-09-30', fichas: [f], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS(), agora: new Date('2026-10-01T12:00:00Z') }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        const xml = t.s1200!.xml;
        expect(xml).toContain('<codRubr>7000</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>450.00</vrRubr><indApurIR>0</indApurIR><descFolha><tpDesc>1</tpDesc><instFinanc>341</instFinanc><nrDoc>CT-2026/001</nrDoc></descFolha>');
        expect(xml).toContain('<descFolha><tpDesc>1</tpDesc><instFinanc>104</instFinanc><nrDoc>X9</nrDoc><observacao>Parcela 1/24</observacao></descFolha>');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        // Rubrica sem a natureza 9253: recusado antes do envio.
        const errado = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-09-30', fichas: [f], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS('7001') }).trabalhadores[0];
        expect(errado.erros.join(' ')).toMatch(/precisa ter a natureza 9253 no S-1010 \(tem 9299\)/);
        expect(erroDescFolha({ descricao: 'Desconto X' }, '7000', '9253')).toMatch(/exige o contrato \(descFolha\)/);
    });

    it('S-2299: detVerbas do consignado com o descFolha; passa no XSD', async () => {
        const f = { ...ficha([C1], { dataDesligamento: '2026-10-05', motivoDesligamento: '02' }), situacao: 'desligado' as const };
        const r = calcularRescisao({ ficha: f, data: '2026-10-05', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
        const RESC = [...RUBRICAS, rub('0480', 'SALDO DE SALARIO', '6000', '1'), rub('0950', 'AVISO PREVIO INDENIZADO', '6003', '1'), rub('0951', '13 SALARIO PROPORCIONAL', '6002', '1'),
            rub('0952', '13 SALARIO S/ AVISO INDENIZADO', '6001', '1'), rub('0955', 'FERIAS PROPORCIONAIS', '6006', '1'), rub('0956', '1/3 FERIAS PROPORCIONAIS', '6006', '1'),
            rub('5001', 'INSS 13 SALARIO', '9201', '2'), rub('5003', 'IRRF 13 SALARIO', '9203', '2'), rub('0953', 'FERIAS VENCIDAS', '6007', '1'), rub('0954', '1/3 FERIAS VENCIDAS', '6007', '1')];
        const p = PARAMS();
        const x = { ...p.rubricas, INSS13: { codRubr: '5001', ideTabRubr: 'T1' }, IRRF13: { codRubr: '5003', ideTabRubr: 'T1' } };
        for (const i of sugerirDeParaRescisao([r], RESC, '2026-10')) if (!x[i.chave] && i.sugestao) x[i.chave] = i.sugestao;
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: f, rescisao: r, rubricas: RESC, parametros: { ...p, rubricas: x }, hoje: '2026-10-06', agora: new Date('2026-10-06T12:00:00Z') });
        expect(g.erros).toEqual([]);
        expect(g.evento!.xml).toContain('<descFolha><tpDesc>1</tpDesc><instFinanc>341</instFinanc><nrDoc>CT-2026/001</nrDoc></descFolha></detVerbas>');
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
});
