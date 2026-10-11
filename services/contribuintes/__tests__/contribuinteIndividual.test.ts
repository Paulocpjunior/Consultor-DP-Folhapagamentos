// Pró-labore e RPA: cálculo e S-1200/S-1210 de contribuinte individual (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import type { Enquadramento } from '../../cadastros/enquadramento';
import type { Rubrica } from '../../cadastros/rubricas';
import { apurarIrrf } from '../../calculo/motorMensal';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { gerarEventosCI, ideDmDevCI } from '../../esocial/eventosCI';
import { calcularCI, contribuinteVazio, idContribuinte, totaisCI, validarContribuinte, validarLancamentos, type ContribuinteIndividual, type LancamentoCI } from '../contribuinteIndividual';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const INSS = TAB.find(t => t.tipo === 'inss')!;
const IRRF = TAB.find(t => t.tipo === 'irrf')!;
const TETO = INSS.faixas[INSS.faixas.length - 1].ate!;
const CNPJ = '44388152000189';
const ENQ = (regime: Enquadramento['regime']): Enquadramento => ({ id: 'e', empresaId: 'E1', vigencia: '2026-01', regime, fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' });
const socio: ContribuinteIndividual = { ...contribuinteVazio('E1'), id: 'E1_52998224725', cpf: '52998224725', nome: 'ANA SOCIA', nascimento: '1980-04-10', categoria: '723', cbo: '121010', s2300: true };
const autonomo: ContribuinteIndividual = { ...contribuinteVazio('E1'), id: 'E1_39053344705', cpf: '39053344705', nome: 'BRUNO AUTONOMO', nascimento: '1985-09-01', categoria: '701', cbo: '317110' };
const lanc = (c: ContribuinteIndividual, valor: number, x: Partial<LancamentoCI> = {}): LancamentoCI => ({ contribuinteId: c.id, valor, descricao: '', dataPagamento: '2026-10-05', issAliquota: 0, outrasFontes: [], ...x });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('cadastro e lançamentos', () => {
    it('valida CPF, nascimento, CBO e o S-2300 do sócio', () => {
        expect(validarContribuinte(socio)).toEqual([]);
        expect(validarContribuinte({ ...socio, s2300: false }).join(' ')).toMatch(/precisam do S-2300/);
        const e = validarContribuinte({ ...autonomo, cpf: '123', cbo: '31', dependentes: [{ cpf: '1', nome: '', nascimento: '', tipo: '99' }] }).join(' ');
        expect(e).toMatch(/CPF inválido/); expect(e).toMatch(/CBO com 6/); expect(e).toMatch(/Dependente 1: tipo/);
        expect(idContribuinte('E1', '529.982.247-25')).toBe('E1_52998224725');
    });
    it('um lançamento por pessoa no mês, valor, data e outras fontes', () => {
        const e = validarLancamentos('2026-10', [lanc(socio, 100), lanc(socio, 0, { dataPagamento: '2026-09-30', issAliquota: 6, outrasFontes: [{ tpInsc: '1', nrInsc: '1', codCateg: '1', valor: 0 }] })], [socio]).join(' ');
        expect(e).toMatch(/aparece duas vezes/); expect(e).toMatch(/informe o valor/); expect(e).toMatch(/pagamento antes da competência/); expect(e).toMatch(/ISS entre 0% e 5%/); expect(e).toMatch(/CNPJ ou CPF inválido/);
    });
});

describe('cálculo', () => {
    it('pró-labore: INSS de 11%, IRRF pela tabela, patronal de 20%', () => {
        const r = calcularCI(socio, lanc(socio, 500000), '2026-10', TAB, ENQ('normal'));
        expect(r.situacao).toBe('calculado');
        expect([v(r, 'PROLAB'), v(r, 'INSS')]).toEqual([500000, 55000]);
        const a = apurarIrrf(IRRF, 500000, 55000);
        expect(v(r, 'IRRF')).toBe(a.valor > 1000 ? a.valor : 0);
        expect(r.patronal).toEqual({ base: 500000, aliquota: 20, valor: 100000 });
        expect(r.totais.liquido).toBe(500000 - 55000 - v(r, 'IRRF'));
        expect(r.indMV).toBeUndefined();
    });
    it('teto do INSS e outras fontes: indMV 1, 2 e 3', () => {
        const alto = calcularCI(socio, lanc(socio, TETO + 100000), '2026-10', TAB, ENQ('normal'));
        expect(v(alto, 'INSS')).toBe(Math.round(TETO * 0.11));
        const parcial = calcularCI(socio, lanc(socio, 300000, { outrasFontes: [{ tpInsc: '1', nrInsc: CNPJ, codCateg: '101', valor: TETO - 100000 }] }), '2026-10', TAB, ENQ('normal'));
        expect([parcial.indMV, v(parcial, 'INSS')]).toEqual(['2', 11000]);
        const cheio = calcularCI(socio, lanc(socio, 300000, { outrasFontes: [{ tpInsc: '1', nrInsc: CNPJ, codCateg: '101', valor: TETO }] }), '2026-10', TAB, ENQ('normal'));
        expect([cheio.indMV, v(cheio, 'INSS')]).toEqual(['3', 0]);
        const baixo = calcularCI(socio, lanc(socio, 100000, { outrasFontes: [{ tpInsc: '1', nrInsc: CNPJ, codCateg: '101', valor: 100000 }] }), '2026-10', TAB, ENQ('normal'));
        expect([baixo.indMV, v(baixo, 'INSS')]).toEqual(['1', 11000]);
    });
    it('RPA: ISS retido do não inscrito; inscrito não retém; Simples sem patronal; sem enquadramento avisa', () => {
        const r = calcularCI(autonomo, lanc(autonomo, 200000, { issAliquota: 5, descricao: 'manutenção' }), '2026-10', TAB, ENQ('simples'));
        expect([v(r, 'RPA'), v(r, 'ISS')]).toEqual([200000, 10000]);
        expect(r.verbas[0].descricao).toBe('Serviços prestados (manutenção)');
        expect(r.patronal).toEqual({ base: 200000, aliquota: 0, valor: 0 });
        expect(v(calcularCI({ ...autonomo, inscritoIss: true }, lanc(autonomo, 200000, { issAliquota: 5 }), '2026-10', TAB, ENQ('simples-iv')), 'ISS')).toBe(0);
        const sem = calcularCI(autonomo, lanc(autonomo, 200000), '2026-10', TAB);
        expect(sem.patronal).toBeNull();
        expect(sem.avisos.join(' ')).toMatch(/sem enquadramento/i);
        expect(sem.avisos.join(' ')).toMatch(/confira se a lei municipal/);
    });
    it('dependentes deduzem no IRRF; totais do mês', () => {
        const c = { ...autonomo, dependentes: [{ cpf: '11144477735', nome: 'FILHO', nascimento: '2015-01-01', tipo: '03' }] };
        const r = calcularCI(c, lanc(c, 600000), '2026-10', TAB, ENQ('normal'));
        expect(r.irrfApurado!.deducoesLegais).toBe(v(r, 'INSS') + (IRRF.valores.deducaoDependente ?? 0));
        const t = totaisCI([r, calcularCI(socio, lanc(socio, 500000), '2026-10', TAB, ENQ('normal'))]);
        expect([t.quantidade, t.bruto, t.patronal]).toEqual([2, 1100000, 220000]);
    });
});

describe('eSocial do contribuinte individual', () => {
    const RUB: [string, string, string, '1' | '2', Record<string, string>][] = [
        ['PL', 'PRO LABORE', '3508', '1', { codIncCP: '11', codIncIRRF: '11' }], ['RPA', 'SERVICOS AUTONOMOS', '3501', '1', { codIncCP: '11', codIncIRRF: '11' }],
        ['INSS', 'INSS', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }], ['IRRF', 'IRRF', '9203', '2', { codIncIRRF: '31' }], ['ISS', 'ISS RETIDO', '9222', '2', {}]];
    const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp, inc]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
        vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '09', codIncFGTS: '00', codIncCPRP: '', observacao: '', ...inc } }] }));
    const parametros = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { PROLAB: { codRubr: 'PL', ideTabRubr: 'T1' }, RPA: { codRubr: 'RPA', ideTabRubr: 'T1' }, INSS: { codRubr: 'INSS', ideTabRubr: 'T1' }, IRRF: { codRubr: 'IRRF', ideTabRubr: 'T1' }, ISS: { codRubr: 'ISS', ideTabRubr: 'T1' } } };
    it('autônomo sem S-2300: infoComplem, infoComplCont e infoMV; passa no XSD', async () => {
        const c = { ...autonomo, dependentes: [{ cpf: '11144477735', nome: 'FILHO', nascimento: '2015-01-01', tipo: '03' }] };
        const r = calcularCI(c, lanc(c, 900000, { issAliquota: 2, outrasFontes: [{ tpInsc: '1', nrInsc: CNPJ, codCateg: '101', valor: 200000 }] }), '2026-10', TAB, ENQ('normal'));
        const g = gerarEventosCI({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', contribuintes: [c], resultados: [r], rubricas: RUBRICAS, parametros, agora: new Date('2026-10-05T12:00:00Z') });
        const t = g.eventos[0];
        expect(t.erros).toEqual([]);
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(t.s1200!.xml).toContain(`<infoMV><indMV>2</indMV><remunOutrEmpr><tpInsc>1</tpInsc><nrInsc>${CNPJ}</nrInsc><codCateg>101</codCateg><vlrRemunOE>2000.00</vlrRemunOE></remunOutrEmpr></infoMV><infoComplem><nmTrab>BRUNO AUTONOMO</nmTrab><dtNascto>1985-09-01</dtNascto></infoComplem>`);
        expect(t.s1200!.xml).toContain('<codCateg>701</codCateg>');
        expect(t.s1200!.xml).toContain('<infoComplCont><codCBO>317110</codCBO></infoComplCont></dmDev>');
        expect(t.s1200!.xml).not.toContain('infoAgNocivo');
        expect(await validarPeloXsd(t.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(t.s1210!.xml).toContain(`<ideDmDev>${ideDmDevCI('2026-10', false)}</ideDmDev><vrLiq>${(r.totais.liquido / 100).toFixed(2)}</vrLiq>`);
        if (!r.deducoesIrrf!.simplificado) expect(t.s1210!.xml).toContain('<infoDep><cpfDep>11144477735</cpfDep>');
    });
    it('sócio com S-2300: sem os dados cadastrais; sem S-2300 não sai; sem de/para avisa', async () => {
        const r = calcularCI({ ...socio, matricula: 'SOC1' }, lanc(socio, 500000), '2026-10', TAB, ENQ('normal'));
        const g = gerarEventosCI({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', contribuintes: [{ ...socio, matricula: 'SOC1' }], resultados: [r], rubricas: RUBRICAS, parametros });
        const t = g.eventos[0];
        expect(t.erros).toEqual([]);
        expect(t.s1200!.xml).toContain('<remunPerApur><matricula>SOC1</matricula>');
        expect(t.s1200!.xml).not.toContain('infoComplem');
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(gerarEventosCI({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', contribuintes: [{ ...socio, s2300: false }], resultados: [r], rubricas: RUBRICAS, parametros }).eventos[0].erros.join(' ')).toMatch(/envie o S-2300 antes/);
        expect(gerarEventosCI({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', contribuintes: [socio], resultados: [r], rubricas: RUBRICAS, parametros: { ...parametros, rubricas: {} } }).eventos[0].erros.join(' ')).toMatch(/"Pró-labore" sem rubrica no de\/para/);
    });
});
