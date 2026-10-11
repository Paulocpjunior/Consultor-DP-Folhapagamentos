// Processo trabalhista no eSocial: S-2500 e S-2501 (dados fictícios).
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import {
    gerarS2500, gerarS2501, mesesEntre, numeroCnjValido, processoVazio, totaisDoPagamento, validarPagamento, validarProcesso,
    type PagamentoProcesso, type ProcessoTrabalhista,
} from '../processoTrabalhista';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
/** Número CNJ com os dígitos verificadores certos (módulo 97). */
const cnj = (n: string, resto: string) => { const dv = String(98n - (BigInt(`${n}${resto}00`) % 97n)).padStart(2, '0'); return `${n}${dv}${resto}`; };
const NR = cnj('0001234', '2025502' + '0001'); // 2025, J=5, TR=02, vara 0001
const CNPJ = '44388152000189';

const processo = (): ProcessoTrabalhista => ({
    ...processoVazio('E1'), nrProcTrab: NR, origem: '1', obs: 'Diferenças de horas extras', dtSent: '2026-08-20', ufVara: 'SP', codMunic: '3550308', idVara: '12',
    trabalhadores: [{
        fichaId: 'E1_52998224725_M1', cpf: '529.982.247-25', nome: 'ANA', matricula: '000052', compIni: '2024-11', compFim: '2025-01', indReperc: '1',
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
        expect(xml).toContain('<idePeriodo><perRef>2024-12</perRef><baseCalculo><vrBcCpMensal>500.00</vrBcCpMensal><vrBcCp13>400.00</vrBcCp13></baseCalculo><infoFGTS><vrBcFGTSProcTrab>900.00</vrBcFGTSProcTrab></infoFGTS></idePeriodo>');
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
