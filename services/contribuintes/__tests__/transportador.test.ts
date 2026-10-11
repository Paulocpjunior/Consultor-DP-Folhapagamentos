// Transportador autônomo (711/712) e retificação do S-1200/S-1210 do contribuinte individual (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import type { Enquadramento } from '../../cadastros/enquadramento';
import type { Rubrica } from '../../cadastros/rubricas';
import { apurarIrrf } from '../../calculo/motorMensal';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { gerarEventosCI } from '../../esocial/eventosCI';
import { recibosCIDosEnvios } from '../../esocial/recibosEsocial';
import type { Envio } from '../../esocial/transmissaoService';
import { calcularCI, contribuinteVazio, totaisCI, validarLancamentos, type ContribuinteIndividual, type LancamentoCI } from '../contribuinteIndividual';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const IRRF = TAB.find(t => t.tipo === 'irrf')!;
const CNPJ = '44388152000189';
const ENQ: Enquadramento = { id: 'e', empresaId: 'E1', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' };
const carga: ContribuinteIndividual = { ...contribuinteVazio('E1'), id: 'E1_39053344705', cpf: '39053344705', nome: 'CARLOS CAMINHONEIRO', nascimento: '1975-03-02', categoria: '712', cbo: '782510' };
const lanc = (c: ContribuinteIndividual, valor: number, x: Partial<LancamentoCI> = {}): LancamentoCI => ({ contribuinteId: c.id, valor, descricao: 'SP x RJ', dataPagamento: '2026-10-05', issAliquota: 0, outrasFontes: [], ...x });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('transportador autônomo: cálculo', () => {
    it('carga: INSS 11% e patronal 20% sobre 20% do frete; SEST 1,5% e SENAT 1%; IRRF sobre 10%', () => {
        const r = calcularCI(carga, lanc(carga, 1000000), '2026-10', TAB, ENQ);
        expect(r.situacao).toBe('calculado');
        expect([v(r, 'FRETE'), v(r, 'INSS'), v(r, 'SEST'), v(r, 'SENAT')]).toEqual([1000000, 22000, 3000, 2000]);
        expect(r.informativas).toEqual([
            { codigo: 'BASEFRETE', descricao: 'Base do INSS e do SEST/SENAT (20% do frete)', valor: 200000 },
            { codigo: 'BASEIRFRETE', descricao: 'Rendimento tributável do IRRF (10% do frete)', valor: 100000 },
        ]);
        expect(r.patronal).toEqual({ base: 200000, aliquota: 20, valor: 40000 });
        expect(r.bases).toMatchObject({ inss: 200000, irrf: 100000 });
        expect(v(r, 'IRRF')).toBe(0); // 10% do frete (R$ 1.000) está na faixa isenta
        expect(r.totais.liquido).toBe(1000000 - 22000 - 3000 - 2000);
        expect(totaisCI([r])).toMatchObject({ inssRetido: 22000, sestSenat: 5000, patronal: 40000 });
    });
    it('passageiros: IRRF sobre 60% do frete', () => {
        const p = { ...carga, categoria: '711' as const };
        const r = calcularCI(p, lanc(p, 1000000), '2026-10', TAB, ENQ);
        const a = apurarIrrf(IRRF, 600000, 22000);
        expect(r.bases.irrf).toBe(600000);
        expect(v(r, 'IRRF')).toBe(a.valor > 1000 ? a.valor : 0);
    });
    it('sem ISS retido para o transportador', () => {
        expect(validarLancamentos('2026-10', [lanc(carga, 100000, { issAliquota: 2 })], [carga]).join(' ')).toMatch(/transportador autônomo sem ISS/);
    });
});

describe('transportador autônomo: eSocial', () => {
    const RUB: [string, string, string, '1' | '2' | '3', Record<string, string>][] = [
        ['FRETE', 'FRETE AUTONOMO', '3501', '1', { codIncCP: '00', codIncIRRF: '09' }],
        ['BFRETE', 'BASE INSS FRETE 20%', '3501', '3', { codIncCP: '11', codIncIRRF: '00' }],
        ['BIRFRETE', 'BASE IR FRETE', '3501', '3', { codIncCP: '00', codIncIRRF: '11' }],
        ['SEST', 'DESC SEST', '9299', '2', { codIncCP: '34', codIncIRRF: '09' }], ['SENAT', 'DESC SENAT', '9299', '2', { codIncCP: '35', codIncIRRF: '09' }],
        ['INSS', 'INSS', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }], ['IRRF', 'IRRF', '9203', '2', { codIncIRRF: '31' }]];
    const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp, inc]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
        vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '09', codIncFGTS: '00', codIncCPRP: '', observacao: '', ...inc } }] }));
    const de = (c: string) => ({ codRubr: c, ideTabRubr: 'T1' });
    const parametros = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { FRETE: de('FRETE'), BASEFRETE: de('BFRETE'), BASEIRFRETE: de('BIRFRETE'), SEST: de('SEST'), SENAT: de('SENAT'), INSS: de('INSS'), IRRF: de('IRRF') } };
    const r = calcularCI(carga, lanc(carga, 1000000), '2026-10', TAB, ENQ);

    it('frete, bases informativas, SEST e SENAT no S-1200; passa no XSD', async () => {
        const t = gerarEventosCI({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', contribuintes: [carga], resultados: [r], rubricas: RUBRICAS, parametros }).eventos[0];
        expect(t.erros).toEqual([]);
        for (const [c, val] of [['FRETE', '10000.00'], ['BFRETE', '2000.00'], ['BIRFRETE', '1000.00'], ['SEST', '30.00'], ['SENAT', '20.00'], ['INSS', '220.00']]) expect(t.s1200!.xml).toContain(`<codRubr>${c}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${val}</vrRubr>`);
        expect(t.s1200!.xml).toContain('<codCateg>712</codCateg>');
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(await validarPeloXsd(t.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('confere as incidências do S-1010: SEST 34, SENAT 35, base 11 e frete fora da base', () => {
        const torto = RUBRICAS.map(x => (x.codRubr === 'SEST' || x.codRubr === 'FRETE' ? { ...x, vigencias: [{ ...x.vigencias[0], dados: { ...x.vigencias[0].dados, codIncCP: '11' } }] } : x));
        const e = gerarEventosCI({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', contribuintes: [carga], resultados: [r], rubricas: torto, parametros }).eventos[0].erros.join(' ');
        expect(e).toMatch(/SEST com incidência 11: tem de ser 34/);
        expect(e).toMatch(/frete é base do INSS \(11\)/);
    });

    it('retificação: com o recibo aceito, indRetif 2; S-1210 de quem também é empregado não sai', async () => {
        const recibos = { s1200: new Map([['39053344705', '1.1.0000000000000000001']]), s1210: new Map([['39053344705', '1.2.0000000000000000002']]) };
        const t = gerarEventosCI({ cnpj: CNPJ, tpAmb: 1, competencia: '2026-10', contribuintes: [carga], resultados: [r], rubricas: RUBRICAS, parametros, recibos }).eventos[0];
        expect(t.s1200!.xml).toContain('<indRetif>2</indRetif><nrRecibo>1.1.0000000000000000001</nrRecibo>');
        expect(t.s1210!.xml).toContain('<indRetif>2</indRetif><nrRecibo>1.2.0000000000000000002</nrRecibo>');
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(await validarPeloXsd(t.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const emp = gerarEventosCI({ cnpj: CNPJ, tpAmb: 1, competencia: '2026-10', contribuintes: [carga], resultados: [r], rubricas: RUBRICAS, parametros, recibos, cpfsEmpregados: new Set(['39053344705']) }).eventos[0];
        expect(emp.s1210).toBeNull();
        expect(emp.avisos.join(' ')).toMatch(/Retifique pela folha/);
    });

    it('recibos do pró-labore e do RPA saem dos envios aceitos em produção (ref ci:cpf:competência)', () => {
        const envios = [
            { tpAmb: 1, protocolo: 'P1', consultadoEm: '2026-10-08T12:00:00Z', enviadoEm: '', eventos: [{ id: 'A', tipo: 'S-1200', perApur: '2026-10', ref: 'ci:39053344705:2026-10', cdResposta: 201, nrRecibo: '1.1.0000000000000000001' }] },
            { tpAmb: 2, protocolo: 'P2', consultadoEm: '', enviadoEm: '', eventos: [{ id: 'B', tipo: 'S-1200', perApur: '2026-10', ref: 'ci:52998224725:2026-10', cdResposta: 201, nrRecibo: '1.1.0000000000000000009' }] },
            { tpAmb: 1, protocolo: 'P3', consultadoEm: '', enviadoEm: '', eventos: [{ id: 'C', tipo: 'S-1200', perApur: '2026-10', ref: 'E1_111_M1', cdResposta: 201, nrRecibo: '1.1.0000000000000000003' }] },
        ] as unknown as Envio[];
        expect(recibosCIDosEnvios(envios).map(x => [x.tipo, x.cpf, x.nrRecibo])).toEqual([['S-1200', '39053344705', '1.1.0000000000000000001']]);
    });
});
