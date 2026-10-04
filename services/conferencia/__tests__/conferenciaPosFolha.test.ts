// @vitest-environment jsdom
//
// Os XMLs abaixo seguem a estrutura dos XSDs do leiaute S-1.3 (evtBasesTrab,
// evtBasesFGTS, evtCS e evtFGTS). Não são arquivos reais: quando chegar o
// primeiro lote real de totalizadores, ele deve entrar aqui como regressão.

import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { agruparPorApuracao, centavos, lerTotalizadores, lerTotalizadoresXml } from '../totalizadores';
import { conferirPosFolha, lerValorDigitado } from '../conferenciaPosFolha';
import { crc32, gerarZip } from '../../implantacao/zip';

const NS = 'http://www.esocial.gov.br/schema/evt';
const enc = (s: string) => new TextEncoder().encode(s);

function s5001(cpf: string, o: { per?: string; id?: string; matricula?: string; categ?: string; base?: string; calc?: [string, string, string][]; nrRec?: string } = {}) {
    const calc = (o.calc ?? [['108201', '300.00', '300.00']]).map(([cr, c, d]) => `<infoCpCalc><tpCR>${cr}</tpCR><vrCpSeg>${c}</vrCpSeg><vrDescSeg>${d}</vrDescSeg></infoCpCalc>`).join('');
    return `<eSocial xmlns="${NS}/evtBasesTrab/v_S_01_03_00"><evtBasesTrab Id="${o.id ?? 'ID5001' + cpf}">
<ideEvento><nrRecArqBase>${o.nrRec ?? '1.1.000' + cpf}</nrRecArqBase><indApuracao>1</indApuracao><perApur>${o.per ?? '2026-09'}</perApur></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>
<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>${calc}
<infoCp><classTrib>99</classTrib><ideEstabLot><tpInsc>1</tpInsc><nrInsc>29463877000109</nrInsc><codLotacao>001</codLotacao>
<infoCategIncid><matricula>${o.matricula ?? '836292'}</matricula><codCateg>${o.categ ?? '101'}</codCateg>
<infoBaseCS><ind13>0</ind13><tpValor>11</tpValor><valor>${o.base ?? '3243.65'}</valor></infoBaseCS>
<infoBaseCS><ind13>0</ind13><tpValor>21</tpValor><valor>${(o.calc ?? [['', '', '300.00']])[0][2]}</valor></infoBaseCS>
</infoCategIncid></ideEstabLot></infoCp></evtBasesTrab></eSocial>`;
}

function s5003(cpf: string, o: { rem?: string; dps?: string; tp?: string; id?: string } = {}) {
    return `<eSocial xmlns="${NS}/evtBasesFGTS/v_S_01_03_00"><evtBasesFGTS Id="${o.id ?? 'ID5003' + cpf}">
<ideEvento><nrRecArqBase>1.1.000${cpf}</nrRecArqBase><indApuracao>1</indApuracao><perApur>2026-09</perApur></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>
<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>
<infoFGTS><ideEstab><tpInsc>1</tpInsc><nrInsc>29463877000109</nrInsc><ideLotacao><codLotacao>001</codLotacao>
<infoTrabFGTS><matricula>836292</matricula><codCateg>101</codCateg><infoBaseFGTS>
<basePerApur><tpValor>${o.tp ?? '11'}</tpValor><indIncid>1</indIncid><remFGTS>${o.rem ?? '3243.65'}</remFGTS><dpsFGTS>${o.dps ?? '259.49'}</dpsFGTS></basePerApur>
</infoBaseFGTS></infoTrabFGTS></ideLotacao></ideEstab></infoFGTS></evtBasesFGTS></eSocial>`;
}

function s5011(desc: string, calc: string, creditos: [string, string, string?][] = [['108201', '600.00'], ['109901', '1500.00']]) {
    const cr = creditos.map(([t, v, s]) => `<infoCRContrib><tpCR>${t}</tpCR><vrCR>${v}</vrCR>${s ? `<vrCRSusp>${s}</vrCRSusp>` : ''}</infoCRContrib>`).join('');
    return `<eSocial xmlns="${NS}/evtCS/v_S_01_03_00"><evtCS Id="ID5011">
<ideEvento><indApuracao>1</indApuracao><perApur>2026-09</perApur></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>
<infoCS><nrRecArqBase>1.9.0001</nrRecArqBase><indExistInfo>1</indExistInfo>
<infoCPSeg><vrDescCP>${desc}</vrDescCP><vrCpSeg>${calc}</vrCpSeg></infoCPSeg>
<infoContrib><classTrib>99</classTrib></infoContrib>${cr}</infoCS></evtCS></eSocial>`;
}

function s5013(bases: [string, string, string][]) {
    const b = bases.map(([tp, base, vr]) => `<basePerApur><tpValor>${tp}</tpValor><indIncid>1</indIncid><baseFGTS>${base}</baseFGTS><vrFGTS>${vr}</vrFGTS></basePerApur>`).join('');
    return `<eSocial xmlns="${NS}/evtFGTS/v_S_01_03_00"><evtFGTS Id="ID5013">
<ideEvento><indApuracao>1</indApuracao><perApur>2026-09</perApur></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>
<infoFGTS><nrRecArqBase>1.9.0001</nrRecArqBase><indExistInfo>1</indExistInfo>
<ideEstab><tpInsc>1</tpInsc><nrInsc>29463877000109</nrInsc><ideLotacao><codLotacao>001</codLotacao><tpLotacao>01</tpLotacao>
<infoBaseFGTS>${b}</infoBaseFGTS></ideLotacao></ideEstab></infoFGTS></evtFGTS></eSocial>`;
}

/** ZIP com uma entrada comprimida (método 8), como os do portal e do Windows. */
function zipDeflate(nome: string, conteudo: string): Uint8Array {
    const dados = enc(conteudo), comp = new Uint8Array(deflateRawSync(dados)), n = enc(nome), crc = crc32(dados);
    const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(8), ...u16(0), ...u16(0), ...u32(crc), ...u32(comp.length), ...u32(dados.length), ...u16(n.length), ...u16(0), ...n];
    const central = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(8), ...u16(0), ...u16(0), ...u32(crc), ...u32(comp.length), ...u32(dados.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...n];
    const offCentral = local.length + comp.length;
    const fim = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(central.length), ...u32(offCentral), ...u16(0)];
    return new Uint8Array([...local, ...comp, ...central, ...fim]);
}

const arq = (nome: string, xml: string) => ({ nome, bytes: enc(xml) });

describe('leitura dos totalizadores', () => {
    it('lê S-5001 em centavos, com cálculo, desconto e vínculo', () => {
        const [t] = lerTotalizadoresXml(s5001('01787839516', { calc: [['108201', '296.41', '296.40']] }), 'a.xml');
        expect(t).toMatchObject({ tipo: 'S-5001', cpf: '01787839516', empregador: '29463877', perApur: '2026-09', indApuracao: '1' });
        if (t.tipo !== 'S-5001') throw new Error();
        expect(t.calculos).toEqual([{ tpCR: '108201', calculado: 29641, descontado: 29640 }]);
        expect(t.vinculos[0]).toMatchObject({ matricula: '836292', codCateg: '101', estab: '29463877000109' });
        expect(t.vinculos[0].bases[0]).toEqual({ ind13: '0', tpValor: '11', valor: 324365 });
    });

    it('lê S-5003, S-5011 e S-5013', () => {
        const [f] = lerTotalizadoresXml(s5003('1'), 'f.xml');
        const [c] = lerTotalizadoresXml(s5011('300.00', '300.00', [['108201', '600.00', '50.00']]), 'c.xml');
        const [e] = lerTotalizadoresXml(s5013([['11', '3243.65', '259.49']]), 'e.xml');
        if (f.tipo !== 'S-5003' || c.tipo !== 'S-5011' || e.tipo !== 'S-5013') throw new Error();
        expect(f.itens[0]).toMatchObject({ tpValor: '11', remuneracao: 324365, deposito: 25949, periodoAnterior: false });
        expect(c).toMatchObject({ nrRecArqBase: '1.9.0001', indExistInfo: '1', descontadoSegurados: 30000, calculadoSegurados: 30000 });
        expect(c.creditos).toEqual([{ tpCR: '108201', valor: 60000, suspenso: 5000 }]);
        expect(e.bases).toEqual([{ tpValor: '11', indIncid: '1', base: 324365, valorFgts: 25949, periodoAnterior: false }]);
    });

    it('lê o evento quando ele vem como texto escapado dentro de outro XML', () => {
        const escapado = s5001('2').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const env = `<retorno><arquivo><conteudo>${escapado}</conteudo></arquivo></retorno>`;
        expect(lerTotalizadoresXml(env, 'env.xml').map(t => t.tipo)).toEqual(['S-5001']);
    });

    it('abre .zip simples e comprimido, conta repetidos uma vez e avisa arquivo sem totalizador', async () => {
        const simples = gerarZip([{ nome: 'S5001.xml', conteudo: s5001('3') }, { nome: 'outro.xml', conteudo: '<eSocial><evtAdmissao Id="x"/></eSocial>' }]);
        const r = await lerTotalizadores([
            { nome: 'lote.zip', bytes: simples },
            { nome: 'portal.zip', bytes: zipDeflate('S5011.xml', s5011('300.00', '300.00')) },
            arq('repetido.xml', s5001('3')),
            arq('nota.txt', 'x'),
            arq('quebrado.xml', '<a>'),
        ]);
        expect(r.totalizadores.map(t => t.tipo).sort()).toEqual(['S-5001', 'S-5011']);
        expect(r.avisos.join('\n')).toMatch(/outro\.xml: nenhum totalizador/);
        expect(r.avisos.join('\n')).toMatch(/1 evento\(s\) repetido/);
        expect(r.avisos.join('\n')).toMatch(/nota\.txt: ignorado/);
        expect(r.avisos.join('\n')).toMatch(/quebrado\.xml: XML malformado/);
    });

    it('recusa valor monetário em formato inválido em vez de inventar', () => {
        expect(centavos('1234.5')).toBe(123450);
        expect(() => centavos('1.234,56')).toThrow(/inválido/);
    });

    it('separa competências e empresas diferentes', () => {
        const ts = [...lerTotalizadoresXml(s5001('4'), 'a'), ...lerTotalizadoresXml(s5001('5', { per: '2026-08' }), 'b')];
        expect(agruparPorApuracao(ts).map(g => g.perApur)).toEqual(['2026-09', '2026-08']);
    });
});

async function grupo(...xmls: string[]) {
    const r = await lerTotalizadores(xmls.map((x, i) => arq(`${i}.xml`, x)));
    const gs = agruparPorApuracao(r.totalizadores);
    expect(gs).toHaveLength(1);
    return gs[0];
}

describe('conferência pós-folha', () => {
    it('lote que fecha: nenhuma pendência', async () => {
        const g = await grupo(
            s5001('1', { calc: [['108201', '300.00', '300.00']] }), s5001('2', { calc: [['108201', '300.00', '300.00']] }),
            s5003('1', { dps: '259.49' }), s5003('2', { dps: '259.49' }),
            s5011('600.00', '600.00'), s5013([['11', '6487.30', '518.98']]),
        );
        const r = conferirPosFolha(g, { dctfwebInformado: 210000, fgtsDigitalInformado: 51898 });
        expect(r.pendencias).toEqual([]);
        expect(r.dctfweb.totalARecolher).toBe(210000);
        expect(r.fgtsDigital).toMatchObject({ mensal: 51898, rescisorio: 0, diferenca: 0 });
    });

    it('INSS descontado diferente do calculado vira pendência crítica; centavos viram aviso de arredondamento', async () => {
        const g = await grupo(
            s5001('1', { calc: [['108201', '300.00', '280.00']] }),
            s5001('2', { calc: [['108201', '300.00', '300.01']] }),
            s5003('1'), s5003('2'),
        );
        const r = conferirPosFolha(g);
        const inss = r.pendencias.filter(p => p.regra === 'INSS do trabalhador');
        expect(inss.map(p => [p.cpf, p.gravidade, p.diferenca])).toEqual([['1', 'critica', -2000], ['2', 'info', 1]]);
        expect(inss[0].mensagem).toMatch(/descontou R\$\s?280,00.*calculou R\$\s?300,00.*a menos/);
    });

    it('consignado (CR 160601) não entra na conferência de INSS', async () => {
        const g = await grupo(s5001('1', { calc: [['108201', '300.00', '300.00'], ['160601', '0.00', '500.00']] }), s5003('1'));
        const r = conferirPosFolha(g);
        expect(r.inss.map(l => l.tpCR)).toEqual(['108201']);
        expect(r.pendencias.filter(p => p.regra === 'INSS do trabalhador')).toEqual([]);
    });

    it('aponta empregado sem S-5003 e trabalhador sem S-5001, mas não cobra FGTS de contribuinte individual', async () => {
        const g = await grupo(s5001('1'), s5001('9', { categ: '701', calc: [['109901', '100.00', '100.00']] }), s5003('2'));
        const r = conferirPosFolha(g);
        expect(r.pendencias.filter(p => p.regra === 'FGTS sem totalizador').map(p => p.cpf)).toEqual(['1']);
        expect(r.pendencias.filter(p => p.regra === 'INSS sem totalizador').map(p => p.cpf)).toEqual(['2']);
    });

    it('soma dos trabalhadores que não fecha com o S-5011 e o S-5013 indica lote incompleto', async () => {
        const g = await grupo(s5001('1'), s5003('1'), s5011('600.00', '600.00'), s5013([['11', '6487.30', '518.98']]));
        const r = conferirPosFolha(g);
        const cons = r.pendencias.filter(p => p.regra === 'Consolidado');
        expect(cons).toHaveLength(2);
        expect(cons[0].mensagem).toMatch(/faltam totalizadores/);
        expect(r.consolidacaoFgts[0]).toMatchObject({ tpValor: '11', somaTrabalhadores: 25949, empresa: 51898, diferenca: -25949 });
    });

    it('DCTFWeb: compara o informado com os créditos do S-5011 descontando a parte suspensa', async () => {
        const g = await grupo(s5001('1'), s5003('1'), s5011('300.00', '300.00', [['108201', '300.00'], ['109901', '1000.00', '100.00']]), s5013([['11', '3243.65', '259.49']]));
        expect(conferirPosFolha(g, { dctfwebInformado: 120000 }).dctfweb).toMatchObject({ totalARecolher: 120000, diferenca: 0 });
        const r = conferirPosFolha(g, { dctfwebInformado: 130000 });
        expect(r.pendencias[0]).toMatchObject({ gravidade: 'critica', regra: 'DCTFWeb', diferenca: 10000 });
    });

    it('FGTS Digital: aceita guia só mensal ou mensal + rescisório, e aponta o resto', async () => {
        const g = await grupo(s5001('1'), s5003('1'), s5003('2', { tp: '21', dps: '100.00', rem: '1250.00' }), s5001('2'), s5011('600.00', '600.00', []), s5013([['11', '3243.65', '259.49'], ['21', '1250.00', '100.00']]));
        expect(conferirPosFolha(g, { fgtsDigitalInformado: 25949 }).fgtsDigital).toMatchObject({ mensal: 25949, rescisorio: 10000, diferenca: 0 });
        expect(conferirPosFolha(g, { fgtsDigitalInformado: 35949 }).fgtsDigital.diferenca).toBe(0);
        const r = conferirPosFolha(g, { fgtsDigitalInformado: 30000 });
        expect(r.pendencias.find(p => p.regra === 'FGTS Digital')?.mensagem).toMatch(/rescisório/);
    });

    it('dois S-5001 do mesmo trabalhador (retificação): sai da conta e vira pendência, sem dobrar valor', async () => {
        const g = await grupo(s5001('1', { id: 'A', nrRec: 'r1' }), s5001('1', { id: 'B', nrRec: 'r2' }), s5003('1'), s5011('300.00', '300.00', []));
        const r = conferirPosFolha(g);
        expect(r.inss).toEqual([]);
        expect(r.pendencias.some(p => p.regra === 'Lote' && p.cpf === '1')).toBe(true);
        expect(r.pendencias.some(p => /faltam totalizadores/.test(p.mensagem))).toBe(false);
    });

    it('sem S-5011 e S-5013 avisa que DCTFWeb e FGTS Digital não podem ser conferidos', async () => {
        const r = conferirPosFolha(await grupo(s5001('1'), s5003('1')), { dctfwebInformado: 100, fgtsDigitalInformado: 100 });
        expect(r.dctfweb.diferenca).toBeNull();
        expect(r.fgtsDigital.diferenca).toBeNull();
        expect(r.pendencias.filter(p => p.regra === 'Consolidado')).toHaveLength(2);
    });
});

describe('valor digitado', () => {
    it.each([['1.234,56', 123456], ['1234.56', 123456], ['R$ 2.100,00', 210000], ['', null], ['abc', null]])('%s → %s', (v, c) => {
        expect(lerValorDigitado(v as string)).toBe(c);
    });
});

import { cnpjParaSerpro, consultarSerproConferencia, type ClienteSerpro } from '../serproConferencia';

const ok = (entregue: boolean, situacao: string) => ({ ok: true, entregue, situacao, dataEntrega: '2026-10-15' });
function cliente(o: Partial<{ fgts: unknown; esocial: unknown; dctf: unknown; debitos: unknown }> = {}): ClienteSerpro {
    const r = (v: unknown, padrao: unknown) => (v instanceof Error ? Promise.reject(v) : Promise.resolve(v ?? padrao));
    return {
        consultarFgtsRecolhimento: () => r(o.fgts, { ok: true, depositoDevido: 259.49, depositoRealizado: 259.49 }) as never,
        consultarESocialFechamento: () => r(o.esocial, ok(true, 'FECHADO')) as never,
        consultarDctfWebStatus: () => r(o.dctf, ok(true, 'ENTREGUE')) as never,
        consultarDctfWebDebitos: () => r(o.debitos, { ok: true, fonte: 'serpro', debitos: [] }) as never,
    };
}

describe('SERPRO na conferência', () => {
    it('converte reais em centavos e trata 0 e 0 como "sem valor", não como nada devido', async () => {
        const a = await consultarSerproConferencia(cliente(), '29463877000109', '2026-09');
        expect(a.fgts).toEqual({ ok: true, devido: 25949, realizado: 25949 });
        const b = await consultarSerproConferencia(cliente({ fgts: { ok: true, depositoDevido: 0, depositoRealizado: 0 } }), 'x', '2026-09');
        expect(b.fgts).toEqual({ ok: true, devido: null, realizado: null });
    });

    it('falha de consulta vira ok=false com o erro, nunca "entregue"', async () => {
        const r = await consultarSerproConferencia(cliente({ esocial: new Error('HTTP 502'), dctf: { ok: false, entregue: true, situacao: 'indisponivel', erro: 'timeout' } }), 'x', '2026-09');
        expect(r.esocial).toMatchObject({ ok: false, entregue: false, erro: 'HTTP 502' });
        expect(r.dctfweb).toMatchObject({ ok: false, entregue: false, erro: 'timeout' });
    });

    it('vira pendência: fechamento não transmitido, DCTFWeb não entregue, FGTS devido diferente do S-5013 e não recolhido', async () => {
        const g = await grupo(s5001('1'), s5003('1'), s5011('300.00', '300.00', []), s5013([['11', '3243.65', '259.49']]));
        const sp = await consultarSerproConferencia(cliente({
            esocial: ok(false, 'ABERTO'), dctf: ok(false, 'EM ANDAMENTO'),
            fgts: { ok: true, depositoDevido: 300, depositoRealizado: 0 },
        }), '29463877000109', '2026-09');
        const p = conferirPosFolha(g, { serpro: sp }).pendencias.filter(x => x.regra === 'SERPRO');
        expect(p.map(x => x.gravidade)).toEqual(['critica', 'atencao', 'atencao', 'atencao']);
        expect(p[0].mensagem).toMatch(/devido no SERPRO \(R\$\s?300,00\).*S-5013/);
        expect(p.some(x => /não consta recolhimento/.test(x.mensagem))).toBe(true);
        expect(p.some(x => /S-1299/.test(x.mensagem))).toBe(true);
    });

    it('tudo certo no SERPRO: nenhuma pendência; consulta indisponível vira só informativa', async () => {
        const g = await grupo(s5001('1'), s5003('1'), s5011('300.00', '300.00', []), s5013([['11', '3243.65', '259.49']]));
        const certo = await consultarSerproConferencia(cliente(), 'x', '2026-09');
        expect(conferirPosFolha(g, { serpro: certo }).pendencias).toEqual([]);
        const fora = await consultarSerproConferencia(cliente({ fgts: new Error('FGTS Digital não disponível no plano SERPRO contratado') }), 'x', '2026-09');
        expect(conferirPosFolha(g, { serpro: fora }).pendencias.map(x => [x.gravidade, x.regra])).toEqual([['info', 'SERPRO']]);
    });

    it('escolhe o CNPJ: matriz do cadastro, senão estabelecimento dos totalizadores', async () => {
        const g = await grupo(s5001('1'), s5003('1'));
        const emp = (cnpj: string) => ({ id: cnpj, cnpj, razaoSocial: '', nomeFantasia: '', codigoSage: '', criadoPor: '' });
        expect(cnpjParaSerpro(g, [emp('29.463.877/0002-90'), emp('29.463.877/0001-09'), emp('11.111.111/0001-11')])).toBe('29463877000109');
        expect(cnpjParaSerpro(g, null)).toBe('29463877000109');
        expect(cnpjParaSerpro(g, [emp('11.111.111/0001-11')])).toBe('29463877000109');
    });
});

describe('débitos da DCTFWeb pelo SERPRO', () => {
    const lote = () => grupo(s5001('1'), s5003('1'), s5011('300.00', '300.00', [['108201', '300.00'], ['113801', '1000.00']]), s5013([['11', '3243.65', '259.49']]));

    it('saldo a pagar igual ao S-5011 por código de receita: nenhuma pendência', async () => {
        const sp = await consultarSerproConferencia(cliente({ debitos: { ok: true, fonte: 'serpro', debitos: [{ codReceita: '1082-01', descricao: 'CP SEGURADOS', valor: 300 }, { codReceita: '113801', descricao: 'CP PATRONAL', valor: 1000 }, { codReceita: '056107', descricao: 'IRRF', valor: 50 }] } }), 'x', '2026-09');
        expect(sp.dctfwebDebitos.debitos[0]).toEqual({ codReceita: '108201', descricao: 'CP SEGURADOS', valor: 30000 });
        expect(conferirPosFolha(await lote(), { serpro: sp }).pendencias).toEqual([]);
    });

    it('diferença ou código ausente vira atenção, com a explicação das deduções', async () => {
        const sp = await consultarSerproConferencia(cliente({ debitos: { ok: true, fonte: 'serpro', debitos: [{ codReceita: '113801', descricao: 'CP PATRONAL', valor: 950 }] } }), 'x', '2026-09');
        const p = conferirPosFolha(await lote(), { serpro: sp }).pendencias;
        expect(p.map(x => [x.gravidade, x.diferenca])).toEqual([['atencao', -30000], ['atencao', -5000]]);
        expect(p.map(x => x.mensagem).join(' ')).toMatch(/salário-família/);
    });

    it('rota ainda não publicada (404) e modo mock do CFI ficam indisponíveis, nunca entram como número', async () => {
        const a = await consultarSerproConferencia(cliente({ debitos: new Error('HTTP 404') }), 'x', '2026-09');
        expect(a.dctfwebDebitos).toMatchObject({ ok: false, erro: 'consulta de débitos ainda não publicada no Consultor Fiscal' });
        const b = await consultarSerproConferencia(cliente({ debitos: { ok: true, fonte: 'mock', debitos: [{ codReceita: '108201', descricao: '', valor: 999 }] } }), 'x', '2026-09');
        expect(b.dctfwebDebitos).toMatchObject({ ok: false, debitos: [] });
        expect(conferirPosFolha(await lote(), { serpro: b }).pendencias.map(x => x.gravidade)).toEqual(['info']);
    });
});


import * as XLSX from 'xlsx';
import { centavosDeCelula, extrairFuncionarios, lerPlanilhaResumo, proporMapeamento } from '../resumoFolhaIob';

/** Relatório no jeito dos do IOB: título, cabeçalho no meio, valores em texto BR e linha de total. */
function planilhaIob(linhas: (string | number)[][], cabecalho = ['Código', 'Nome do Funcionário', 'CPF', 'Sal. Contribuição INSS', 'INSS', 'Base FGTS', 'FGTS', 'Líquido']): Uint8Array {
    const ws = XLSX.utils.aoa_to_sheet([['2XR ENGENHARIA LTDA'], ['Resumo da Folha Mensal - Competência 09/2026'], [], cabecalho, ...linhas, ['', 'TOTAL GERAL', '', '', '999,99', '', '', '']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['capa']]), 'Capa');
    XLSX.utils.book_append_sheet(wb, ws, 'Folha');
    return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

describe('folha do IOB (relatório exportado) × eSocial', () => {
    it('acha a aba e o cabeçalho, mapeia as colunas por sinônimo e ignora a linha de total', () => {
        const p = lerPlanilhaResumo(planilhaIob([['000001', 'ANDRE', '017.878.395-16', '3.243,65', '300,00', '3.243,65', '259,49', '2.700,00']]), 'resumo.xlsx');
        expect(p).toMatchObject({ aba: 'Folha', linhaCabecalho: 3 });
        expect(p.mapeamento).toMatchObject({ matricula: 0, nome: 1, cpf: 2, baseInss: 3, inss: 4, baseFgts: 5, fgts: 6, liquido: 7 });
        const f = extrairFuncionarios(p);
        expect(f).toHaveLength(1);
        expect(f[0]).toMatchObject({ cpf: '01787839516', matricula: '000001', nome: 'ANDRE', valores: { baseInss: 324365, inss: 30000, fgts: 25949, liquido: 270000 } });
    });

    it('números em formatos de relatório', () => {
        expect([centavosDeCelula('1.234,56'), centavosDeCelula(1234.56), centavosDeCelula('(12,00)'), centavosDeCelula('12,00-'), centavosDeCelula('R$ 5,5'), centavosDeCelula('abc'), centavosDeCelula('')]).toEqual([123456, 123456, -1200, -1200, 550, null, null]);
        expect(proporMapeamento(['Matrícula', 'Funcionário', 'Base IRRF', 'IRRF'])).toEqual({ matricula: 0, nome: 1, baseIrrf: 2, irrf: 3 });
    });

    it('calculado no IOB e não transmitido vira crítica; valor diferente do transmitido também', async () => {
        const g = await grupo(s5001('01787839516', { calc: [['108201', '300.00', '300.00']] }), s5003('01787839516'), s5011('300.00', '300.00', []), s5013([['11', '3243.65', '259.49']]));
        const p = lerPlanilhaResumo(planilhaIob([
            ['000001', 'ANDRE', '01787839516', '3.243,65', '310,00', '3.243,65', '259,49', '2.700,00'],
            ['000002', 'OBEDI', '11122233396', '3.025,44', '280,00', '3.025,44', '242,04', '2.600,00'],
        ]), 'resumo.xlsx');
        const r = conferirPosFolha(g, { resumoIob: { arquivo: 'resumo.xlsx', funcionarios: extrairFuncionarios(p) } });
        const iob = r.pendencias.filter(x => x.regra === 'Folha do IOB');
        expect(iob.find(x => x.cpf === '11122233396')).toMatchObject({ gravidade: 'critica' });
        expect(iob.find(x => x.cpf === '11122233396')?.mensagem).toMatch(/não transmitida/);
        expect(iob.find(x => x.cpf === '01787839516' && /INSS descontado/.test(x.mensagem))).toMatchObject({ gravidade: 'critica', diferenca: 1000 });
        expect(r.resumoIob?.totais.find(t => t.campo.startsWith('INSS'))).toEqual({ campo: 'INSS descontado dos segurados', iob: 59000, eSocial: 30000 });
        expect(r.resumoIob?.chave).toBe('cpf');
    });

    it('sem CPF, liga pela matrícula do eSocial e avisa que o código sequencial do IOB não casa', async () => {
        const g = await grupo(s5001('01787839516', { matricula: '836292' }), s5003('01787839516'));
        const p = lerPlanilhaResumo(planilhaIob([['836292', 'ANDRE', '3.243,65', '300,00']], ['Matrícula', 'Nome', 'Base INSS', 'INSS']), 'r.xlsx');
        const r = conferirPosFolha(g, { resumoIob: { arquivo: 'r.xlsx', funcionarios: extrairFuncionarios(p) } });
        expect(r.resumoIob?.chave).toBe('matricula');
        expect(r.resumoIob?.linhas[0]).toMatchObject({ cpf: '01787839516', encontradoNoESocial: true, inssIob: 30000, inssESocial: 30000 });
        expect(r.pendencias.some(x => x.regra === 'Folha do IOB' && /código sequencial/.test(x.mensagem))).toBe(true);
    });

    it('trabalhador no eSocial que não está no relatório vira atenção', async () => {
        const g = await grupo(s5001('01787839516'), s5003('01787839516'), s5001('22233344405'), s5003('22233344405'));
        const p = lerPlanilhaResumo(planilhaIob([['000001', 'ANDRE', '01787839516', '3.243,65', '300,00', '3.243,65', '259,49', '2.700,00']]), 'r.xlsx');
        const r = conferirPosFolha(g, { resumoIob: { arquivo: 'r.xlsx', funcionarios: extrairFuncionarios(p) } });
        expect(r.pendencias.find(x => x.regra === 'Folha do IOB' && x.cpf === '22233344405')).toMatchObject({ gravidade: 'atencao' });
    });
});

// ─── IRRF (S-5002 e S-5012), estrutura do XSD S-1.3 ─────────────────────────
function s5002(cpf: string, o: { per?: string; irrf?: string; irrf13?: string; cr?: string; id?: string; semConsolidado?: boolean } = {}) {
    const cr = o.cr ?? '056107';
    const tot = (tag: string) => `<${tag}><CRMen>${cr}</CRMen><vlrRendTrib>5000.00</vlrRendTrib><vlrRendTrib13>0</vlrRendTrib13><vlrPrevOficial>550.00</vlrPrevOficial><vlrPrevOficial13>0</vlrPrevOficial13><vlrCRMen>${o.irrf ?? '120.50'}</vlrCRMen><vlrCR13Men>${o.irrf13 ?? '0'}</vlrCR13Men></${tag}>`;
    return `<eSocial xmlns="${NS}/evtIrrfBenef/v_S_01_03_00"><evtIrrfBenef Id="${o.id ?? 'ID5002' + cpf}">
<ideEvento><nrRecArqBase>1.2.000${cpf}</nrRecArqBase><perApur>${o.per ?? '2026-10'}</perApur></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>
<ideTrabalhador><cpfBenef>${cpf}</cpfBenef>
<dmDev><perRef>2026-09</perRef><ideDmDev>FOLHA</ideDmDev><tpPgto>1</tpPgto><dtPgto>2026-10-06</dtPgto><codCateg>101</codCateg>
<infoIR><tpInfoIR>11</tpInfoIR><valor>5000.00</valor></infoIR>${tot('totApurMen')}</dmDev>
${o.semConsolidado ? '' : `<totInfoIR>${tot('consolidApurMen')}</totInfoIR>`}
</ideTrabalhador></evtIrrfBenef></eSocial>`;
}
function s5012(creditos: [string, string][], per = '2026-10') {
    return `<eSocial xmlns="${NS}/evtIrrf/v_S_01_03_00"><evtIrrf Id="ID5012">
<ideEvento><perApur>${per}</perApur></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>
<infoIRRF><nrRecArqBase>1.9.0002</nrRecArqBase><indExistInfo>1</indExistInfo>${creditos.map(([cr, v]) => `<infoCRMen><CRMen>${cr}</CRMen><vrCRMen>${v}</vrCRMen></infoCRMen>`).join('')}</infoIRRF></evtIrrf></eSocial>`;
}

describe('IRRF: S-5002 × S-5012', () => {
    it('lê S-5002 pelo consolidado e, sem ele, somando os demonstrativos; lê S-5012', () => {
        const [a] = lerTotalizadoresXml(s5002('1', { irrf: '120.50', irrf13: '10.00' }), 'a.xml');
        if (a.tipo !== 'S-5002') throw new Error();
        expect(a).toMatchObject({ cpf: '1', perApur: '2026-10', indApuracao: '1', fonte: 'consolidado', nrRecArqBase: '1.2.0001' });
        expect(a.apuracoes).toEqual([{ crMen: '056107', rendTrib: 500000, rendTrib13: 0, prevOficial: 55000, prevOficial13: 0, irrf: 12050, irrf13: 1000 }]);
        const [b] = lerTotalizadoresXml(s5002('2', { semConsolidado: true }), 'b.xml');
        if (b.tipo !== 'S-5002') throw new Error();
        expect(b.fonte).toBe('demonstrativos');
        expect(b.apuracoes[0].irrf).toBe(12050);
        const [c] = lerTotalizadoresXml(s5012([['056107', '241.00']]), 'c.xml');
        expect(c).toMatchObject({ tipo: 'S-5012', indExistInfo: '1', nrRecArqBase: '1.9.0002', creditos: [{ crMen: '056107', valor: 24100 }] });
    });

    it('lote de IRRF que fecha: sem pendência e sem cobrar S-5011 e S-5013', async () => {
        const g = await grupo(s5002('1'), s5002('2'), s5012([['056107', '241.00']]));
        const r = conferirPosFolha(g);
        expect(r.pendencias).toEqual([]);
        expect(r.contagem).toMatchObject({ s5002: 2, s5012: 1, s5001: 0 });
        expect(r.irrf.consolidacao).toEqual([{ crMen: '056107', descricao: 'IRRF trabalho assalariado (mensal, 13º e férias)', somaTrabalhadores: 24100, empresa: 24100, diferenca: 0 }]);
        expect(r.irrf.totalEmpresa).toBe(24100);
    });

    it('faltou trabalhador, S-5012 ausente, duplicado e só o S-5012', async () => {
        const falta = conferirPosFolha(await grupo(s5002('1'), s5012([['056107', '241.00']])));
        expect(falta.pendencias).toEqual([expect.objectContaining({ gravidade: 'atencao', regra: 'IRRF', diferenca: -12050 })]);
        const semEmpresa = conferirPosFolha(await grupo(s5002('1')));
        expect(semEmpresa.pendencias.map(p => p.mensagem)).toEqual([expect.stringContaining('não tem o S-5012')]);
        const dup = conferirPosFolha(await grupo(s5002('1'), s5002('1', { id: 'OUTRO' }), s5012([['056107', '120.50']])));
        expect(dup.pendencias.map(p => [p.regra, p.cpf])).toEqual([['Lote', '1']]);
        const so = conferirPosFolha(await grupo(s5012([['056107', '120.50']])));
        expect(so.pendencias.map(p => [p.gravidade, p.regra])).toEqual([['info', 'IRRF']]);
    });

    it('SERPRO: IRRF da DCTFWeb do mês × S-5012', async () => {
        const g = await grupo(s5002('1'), s5012([['056107', '120.50']]));
        const igual = await consultarSerproConferencia(cliente({ debitos: { ok: true, fonte: 'serpro', debitos: [{ codReceita: '0561-07', descricao: 'IRRF', valor: 120.5 }] } }), 'x', '2026-10');
        expect(conferirPosFolha(g, { serpro: igual }).pendencias.filter(p => /IRRF/.test(p.mensagem))).toEqual([]);
        const dif = await consultarSerproConferencia(cliente({ debitos: { ok: true, fonte: 'serpro', debitos: [{ codReceita: '0561-07', descricao: 'IRRF', valor: 100 }] } }), 'x', '2026-10');
        expect(conferirPosFolha(g, { serpro: dif }).pendencias.filter(p => p.regra === 'SERPRO')).toEqual([expect.objectContaining({ gravidade: 'atencao', diferenca: -2050, mensagem: expect.stringContaining('código 056107') })]);
        const sem = await consultarSerproConferencia(cliente(), 'x', '2026-10');
        expect(conferirPosFolha(g, { serpro: sem }).pendencias.filter(p => p.regra === 'SERPRO')).toEqual([expect.objectContaining({ mensagem: expect.stringContaining('sem saldo a pagar de IRRF trabalho assalariado') })]);
    });
});
