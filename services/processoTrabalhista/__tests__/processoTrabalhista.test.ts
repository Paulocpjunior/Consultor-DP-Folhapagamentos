// Processo trabalhista no eSocial: S-2500 e S-2501 (dados fictícios).
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import {
    contratoVazio, gerarS2500, gerarS2501, mesesEntre, numeroCnjValido, processoVazio, totaisDoPagamento, validarPagamento, validarProcesso,
    type PagamentoProcesso, type ProcessoTrabalhista, type TrabalhadorProcesso,
} from '../processoTrabalhista';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
/** Número CNJ com os dígitos verificadores certos (módulo 97). */
const cnj = (n: string, resto: string) => { const dv = String(98n - (BigInt(`${n}${resto}00`) % 97n)).padStart(2, '0'); return `${n}${dv}${resto}`; };
const NR = cnj('0001234', '2025502' + '0001'); // 2025, J=5, TR=02, vara 0001
const CNPJ = '44388152000189';

const processo = (): ProcessoTrabalhista => ({
    ...processoVazio('E1'), nrProcTrab: NR, origem: '1', obs: 'Diferenças de horas extras', dtSent: '2026-08-20', ufVara: 'SP', codMunic: '3550308', idVara: '12',
    trabalhadores: [{
        fichaId: 'E1_52998224725_M1', cpf: '529.982.247-25', nome: 'ANA', matricula: '000052', compIni: '2024-11', compFim: '2025-01', indReperc: '1', codCateg: '101',
        periodos: [
            { perRef: '2024-11', bcCpMensal: 50000, bcCp13: 0, bcFgts: 50000 },
            { perRef: '2024-12', bcCpMensal: 50000, bcCp13: 40000, bcFgts: 90000 },
            { perRef: '2025-01', bcCpMensal: 30000, bcCp13: 0, bcFgts: 30000 },
        ],
    }],
});
const pagamento = (): PagamentoProcesso => ({
    perApurPgto: '2026-09', ideSeqProc: '', obs: '',
    trabalhadores: [{
        cpf: '52998224725',
        contribuicoes: [{ perRef: '2024-11', tpCR: '108251', valor: 4000 }, { perRef: '2024-11', tpCR: '113851', valor: 10000 }, { perRef: '2024-12', tpCR: '108251', valor: 7200 }],
        irrf: [{ tpCR: '188951', vrCR: 1500, vrCR13: 0, rendTrib: 130000, rendTrib13: 0, jurosMora: 8000, isentoNTrib: 0, descIsento: '', prevOficial: 11200, prevOficial13: 0, rra: { descRRA: 'Horas extras 2024-2025', qtdMeses: 3, custas: 0, advogados: 20000 } }],
    }],
});

describe('número do processo e período', () => {
    it('dígitos verificadores do CNJ (módulo 97)', () => {
        expect(numeroCnjValido(NR)).toBe(true);
        expect(numeroCnjValido(NR.slice(0, 7) + '00' + NR.slice(9))).toBe(NR.slice(7, 9) === '00');
        expect(numeroCnjValido('123')).toBe(false);
    });
    it('meses do período', () => {
        expect(mesesEntre('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02']);
        expect(mesesEntre('2025-02', '2024-11')).toEqual([]);
    });
});

describe('validação', () => {
    it('processo certo passa; erros dizem o campo', () => {
        expect(validarProcesso(processo(), '2026-10-11')).toEqual({ erros: [], avisos: [] });
        const ruim = { ...processo(), nrProcTrab: '1'.repeat(20), dtSent: '2027-01-01', codMunic: '355', trabalhadores: [{ ...processo().trabalhadores[0], matricula: '', periodos: [{ perRef: '2025-05', bcCpMensal: 1, bcCp13: 0, bcFgts: 0 }] }] };
        const v = validarProcesso(ruim, '2026-10-11').erros.join(' | ');
        expect(v).toMatch(/padrão do CNJ/); expect(v).toMatch(/não futura/); expect(v).toMatch(/IBGE/); expect(v).toMatch(/matrícula/); expect(v).toMatch(/2025-05 fora do período/);
        const ccp = { ...processo(), origem: '2' as const, nrProcTrab: '123456789012345', dtCCP: '2026-09-01', tpCCP: '2' };
        expect(validarProcesso(ccp, '2026-10-11').erros).toEqual([]);
    });
    it('pagamento: código do IRRF pela origem, RRA completo, perRef com bases', () => {
        expect(validarPagamento(processo(), pagamento()).erros).toEqual([]);
        const g = pagamento();
        g.perApurPgto = '2026-07';
        g.trabalhadores[0].contribuicoes.push({ perRef: '2023-01', tpCR: '1082', valor: 0 });
        g.trabalhadores[0].irrf = [{ ...g.trabalhadores[0].irrf[0], tpCR: '056152', rra: undefined }];
        const e = validarPagamento(processo(), g).erros.join(' | ');
        expect(e).toMatch(/anterior ao da decisão/); expect(e).toMatch(/2023-01 sem bases/); expect(e).toMatch(/6 dígitos/); expect(e).toMatch(/maior que zero/); expect(e).toMatch(/o IRRF é 593656/);
    });
});

describe('XML no XSD oficial (S-1.3)', () => {
    it('S-2500 judicial com as bases mês a mês', async () => {
        const { xml } = gerarS2500({ cnpj: CNPJ, tpAmb: 2, processo: processo(), cpf: '52998224725', id: 'ID1443881520000002026101112000000001' });
        expect(xml).toContain('<nrProcTrab>' + NR + '</nrProcTrab>');
        expect(xml).toContain('<idePeriodo><perRef>2024-12</perRef><baseCalculo><vrBcCpMensal>500.00</vrBcCpMensal><vrBcCp13>400.00</vrBcCp13><infoAgNocivo><grauExp>1</grauExp></infoAgNocivo></baseCalculo><infoFGTS><vrBcFGTSProcTrab>900.00</vrBcFGTSProcTrab></infoFGTS></idePeriodo>');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('S-2500 de acordo em CCP, sem repercussão, e retificação', async () => {
        const p = { ...processo(), origem: '2' as const, nrProcTrab: '123456789012345', dtCCP: '2026-09-01', tpCCP: '2', cnpjCCP: '11222333000181' };
        p.trabalhadores[0] = { ...p.trabalhadores[0], indReperc: '2', periodos: [] };
        const { xml } = gerarS2500({ cnpj: CNPJ, tpAmb: 2, processo: p, cpf: '52998224725', nrRecibo: '1.2.0000000000000000001', id: 'ID1443881520000002026101112000000002' });
        expect(xml).toContain('<indRetif>2</indRetif>');
        expect(xml).not.toContain('idePeriodo');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('S-2501 com contribuições por mês e IRRF de RRA', async () => {
        const { xml } = gerarS2501({ cnpj: CNPJ, tpAmb: 2, processo: processo(), pagamento: pagamento(), id: 'ID1443881520000002026101112000000003' });
        expect(xml).toContain('<calcTrib perRef="2024-11" vrBcCpMensal="500.00" vrBcCp13="0.00"><infoCRContrib tpCR="108251" vrCR="40.00"/><infoCRContrib tpCR="113851" vrCR="100.00"/></calcTrib>');
        expect(xml).toContain('<infoCRIRRF tpCR="188951" vrCR="15.00"><infoIR vrRendTrib="1300.00" vrJurosMora="80.00" vrPrevOficial="112.00"/><infoRRA descRRA="Horas extras 2024-2025" qtdMesesRRA="3.0"><despProcJud vlrDespCustas="0.00" vlrDespAdvogados="200.00"/></infoRRA></infoCRIRRF>');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(totaisDoPagamento(pagamento())).toEqual({ contribuicoes: 21200, irrf: 1500, porCR: { 108251: 11200, 113851: 10000, 188951: 1500 } });
    });
    it('S-2501 judicial mensal com 13º', async () => {
        const g = pagamento();
        g.ideSeqProc = '2';
        g.trabalhadores[0].irrf = [{ tpCR: '593656', vrCR: 2000, vrCR13: 300, rendTrib: 100000, rendTrib13: 40000, jurosMora: 0, isentoNTrib: 5000, descIsento: 'FGTS depositado', prevOficial: 9000, prevOficial13: 3000 }];
        const { xml } = gerarS2501({ cnpj: CNPJ, tpAmb: 2, processo: processo(), pagamento: g, id: 'ID1443881520000002026101112000000004' });
        expect(xml).toContain('<ideSeqProc>2</ideSeqProc>');
        expect(xml).toContain('vrCR13="3.00"');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
});

/** Processo com um trabalhador alterado (contratos além do tipo 1). */
const com = (t: Partial<TrabalhadorProcesso>): ProcessoTrabalhista => { const p = processo(); p.trabalhadores[0] = { ...p.trabalhadores[0], ...t }; return p; };
const s2500 = (p: ProcessoTrabalhista, n: number) => gerarS2500({ cnpj: CNPJ, tpAmb: 2, processo: p, cpf: '52998224725', id: `ID144388152000000202610111200000001${n}` }).xml;
const reconhecido = (): Partial<TrabalhadorProcesso> => ({
    tpContr: '5', fichaId: '', nome: 'BRUNO SEM REGISTRO', matricula: 'PROC-0001', dtNascto: '1990-04-02', codCateg: '101',
    contrato: { ...contratoVazio(), codCBO: '411010', salario: 250000, dtAdm: '2024-11-04', dtDeslig: '2025-01-31', mtvDeslig: '02', dtProjFimAPI: '2025-03-02' },
});

describe('contratos além do tipo 1', () => {
    it('reconhecimento de vínculo (5): nome, nascimento e o vínculo inteiro no S-2500', async () => {
        const p = com(reconhecido());
        expect(validarProcesso(p, '2026-10-11')).toEqual({ erros: [], avisos: [] });
        const xml = s2500(p, 1);
        expect(xml).toContain('<cpfTrab>52998224725</cpfTrab><nmTrab>BRUNO SEM REGISTRO</nmTrab><dtNascto>1990-04-02</dtNascto>');
        expect(xml).toContain('<tpContr>5</tpContr><indContr>N</indContr><indCateg>N</indCateg><indNatAtiv>N</indNatAtiv><indMotDeslig>N</indMotDeslig><matricula>PROC-0001</matricula><codCateg>101</codCateg>');
        expect(xml).toContain('<infoCompl><codCBO>411010</codCBO><natAtividade>1</natAtividade><remuneracao><dtRemun>2024-11-04</dtRemun><vrSalFx>2500.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>');
        expect(xml).toContain('<infoVinc><tpRegTrab>1</tpRegTrab><tpRegPrev>1</tpRegPrev><dtAdm>2024-11-04</dtAdm><tmpParc>0</tmpParc><duracao><tpContr>1</tpContr></duracao><infoDeslig><dtDeslig>2025-01-31</dtDeslig><mtvDeslig>02</mtvDeslig><dtProjFimAPI>2025-03-02</dtProjFimAPI><pensAlim>0</pensAlim></infoDeslig></infoVinc></infoCompl>');
        expect(xml).not.toContain('indReint');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('reconhecimento sem os dados do vínculo: erros por campo', () => {
        const r = reconhecido();
        const p = com({ ...r, nome: '', dtNascto: '', matricula: 'eSocial123', codCateg: '701', contrato: { ...contratoVazio(), duracao: '2', dtAdm: '2024-11-04' } });
        const e = validarProcesso(p, '2026-10-11').erros.join(' | ');
        expect(e).toMatch(/nome do trabalhador/); expect(e).toMatch(/nascimento/); expect(e).toMatch(/começar com "eSocial"/); expect(e).toMatch(/701 não é de empregado/);
        expect(e).toMatch(/CBO/); expect(e).toMatch(/prazo determinado/); expect(e).toMatch(/cláusula assecuratória/); expect(e).toMatch(/desligamento obrigatória/); expect(e).toMatch(/Tabela 19/);
    });
    it('vínculo anterior ao eSocial (7), contrato a prazo por fato e sem pensão antes de 2024-01-22', async () => {
        const r = reconhecido();
        const p = com({ ...r, tpContr: '7', contrato: { ...r.contrato!, dtAdm: '2015-03-02', dtDeslig: '2016-02-28', duracao: '3', clauAssec: 'N', objDet: 'Safra 2015' } });
        p.dtSent = '2023-12-01';
        expect(validarProcesso(p, '2026-10-11').erros).toEqual([]);
        const xml = s2500(p, 2);
        expect(xml).toContain('<tpContr>7</tpContr><indContr>N</indContr>');
        expect(xml).toContain('<duracao><tpContr>3</tpContr><clauAssec>N</clauAssec><objDet>Safra 2015</objDet></duracao>');
        expect(xml).not.toContain('pensAlim');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('nova admissão (2) e novo desligamento (4): admissão original e avisos do S-2200/S-2299', async () => {
        expect(validarProcesso(com({ tpContr: '2' }), '2026-10-11').erros.join()).toMatch(/admissão original/);
        const p = com({ tpContr: '4', dtAdmOrig: '2023-05-02', indReint: 'S' });
        const v = validarProcesso(p, '2026-10-11');
        expect(v.erros).toEqual([]);
        expect(v.avisos.join(' | ')).toMatch(/retifique o S-2200/); expect(v.avisos.join(' | ')).toMatch(/S-2299/); expect(v.avisos.join(' | ')).toMatch(/S-2298/);
        const xml = s2500(p, 3);
        expect(xml).toContain('<tpContr>4</tpContr><indContr>S</indContr><dtAdmOrig>2023-05-02</dtAdmOrig><indReint>S</indReint>');
        expect(xml).not.toContain('nmTrab');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('mudança de categoria e natureza (mudCategAtiv), em ordem de data', async () => {
        expect(validarProcesso(com({ indCateg: 'S' }), '2026-10-11').erros.join()).toMatch(/nova categoria/);
        const p = com({ indCateg: 'S', indNatAtiv: 'S', mudancas: [{ codCateg: '102', natAtividade: '2', data: '2025-01-01' }, { codCateg: '101', natAtividade: '1', data: '2024-12-01' }] });
        expect(validarProcesso(p, '2026-10-11').erros).toEqual([]);
        const xml = s2500(p, 4);
        expect(xml).toContain('<indCateg>S</indCateg><indNatAtiv>S</indNatAtiv>');
        expect(xml).toContain('<matricula>000052</matricula><mudCategAtiv><codCateg>101</codCateg><natAtividade>1</natAtividade><dtMudCategAtiv>2024-12-01</dtMudCategAtiv></mudCategAtiv><mudCategAtiv><codCateg>102</codCateg>');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('TSVE (6) fora do eSocial: início, remuneração do diretor e término com motivo; sem grau de exposição', async () => {
        const p = com({
            tpContr: '6', indContr: 'N', fichaId: '', nome: 'CARLA DIRETORA', matricula: 'DIR-01', dtNascto: '1980-01-15', codCateg: '721', dtInicio: '2024-11-01',
            contrato: { ...contratoVazio(), codCBO: '121010', natAtividade: '', salario: 800000, dtTermTsv: '2025-01-31', mtvDesligTSV: '02' },
        });
        expect(validarProcesso(p, '2026-10-11')).toEqual({ erros: [], avisos: [] });
        const xml = s2500(p, 5);
        expect(xml).toContain('<tpContr>6</tpContr><indContr>N</indContr><indCateg>N</indCateg>');
        expect(xml).toContain('<codCateg>721</codCateg><dtInicio>2024-11-01</dtInicio><infoCompl><codCBO>121010</codCBO><remuneracao><dtRemun>2024-11-01</dtRemun><vrSalFx>8000.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><infoTerm><dtTerm>2025-01-31</dtTerm><mtvDesligTSV>02</mtvDesligTSV></infoTerm></infoCompl>');
        expect(xml).not.toContain('infoAgNocivo');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const semMotivo = com({ ...p.trabalhadores[0], contrato: { ...p.trabalhadores[0].contrato!, mtvDesligTSV: '' } });
        expect(validarProcesso(semMotivo, '2026-10-11').erros.join()).toMatch(/diretor não empregado/);
    });
    it('TSVE (6) já no eSocial: matrícula do S-2300, sem indReint', async () => {
        const p = com({ tpContr: '6', indContr: 'S', codCateg: '701', matricula: 'CI-000052' });
        expect(validarProcesso(p, '2026-10-11').erros).toEqual([]);
        const xml = s2500(p, 6);
        expect(xml).toContain('<tpContr>6</tpContr><indContr>S</indContr><indCateg>N</indCateg>');
        expect(xml).not.toContain('indReint'); expect(xml).not.toContain('infoCompl'); expect(xml).not.toContain('infoAgNocivo');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('depósito judicial: 5 leva as bases; 4 não; seguro-desemprego e abono', async () => {
        const p5 = com({ indReperc: '5', indenSD: true, indenAbono: true, anosAbono: ['2024', '2023'], grauExp: '4' });
        expect(validarProcesso(p5, '2026-10-11').erros).toEqual([]);
        const xml5 = s2500(p5, 7);
        expect(xml5).toContain('<indReperc>5</indReperc><indenSD>S</indenSD><indenAbono>S</indenAbono><abono><anoBase>2023</anoBase></abono><abono><anoBase>2024</anoBase></abono><idePeriodo>');
        expect(xml5).toContain('<infoAgNocivo><grauExp>4</grauExp></infoAgNocivo>');
        expect(await validarPeloXsd(xml5, lerXsd)).toEqual({ valido: true, erros: [] });
        const p4 = com({ indReperc: '4', periodos: [] });
        expect(validarProcesso(p4, '2026-10-11').erros).toEqual([]);
        const xml4 = s2500(p4, 8);
        expect(xml4).not.toContain('idePeriodo');
        expect(await validarPeloXsd(xml4, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(validarProcesso(com({ indenAbono: true }), '2026-10-11').erros.join()).toMatch(/ano\(s\)-base/);
        const g = pagamento(); g.trabalhadores[0].irrf = [{ ...g.trabalhadores[0].irrf[0] }];
        expect(validarPagamento(p5, g).avisos.join()).toMatch(/depósito judicial/);
    });
});
