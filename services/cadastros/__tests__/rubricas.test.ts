// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
    classeIrrf, codigoEvento, conferirIncidencias, consolidarRubricas, idRubrica, lerXmlRubricas, mesclarRubricas, rotuloIrrf, situacaoGeral,
    vigenciaEm, type DadosRubrica, type VigenciaRubrica,
} from '../rubricas';
import type { EventoIobSage } from '../../folha/folhaTypes';

const ev = (codigo: string, tipo: 'V' | 'D', inc: Partial<EventoIobSage['incidencias']>): EventoIobSage => ({
    codigo, descricao: 'X', tipo, rv: 'V', coeficiente: 1, ro: '060',
    incidencias: { ir: 'N', in: 'N', irf: 'N', inf: 'N', fg: 'N', rt: 'N', vr: 'N', ...inc },
});
const vig = (d: Partial<DadosRubrica>): VigenciaRubrica => ({ iniValid: '2026-01', fimValid: '', recibo: '1', dados: { dscRubr: 'X', natRubr: '1000', tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '', ...d } });

describe('conferência de incidências IOB × S-1010', () => {
    it('salário: IOB incide em tudo e a rubrica é base de tudo → OK', () => {
        const r = conferirIncidencias(ev('0001', 'V', { in: 'S', ir: 'S', fg: 'S' }), vig({}));
        expect(r.every(i => i.situacao === 'ok')).toBe(true);
        expect(situacaoGeral(r)).toBe('ok');
    });

    it('aponta divergência de tipo, INSS, FGTS e IRRF', () => {
        const r = conferirIncidencias(ev('0010', 'D', { in: 'N', ir: 'N', fg: 'S' }), vig({ tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '00' }));
        expect(r.filter(i => i.situacao === 'divergente').map(i => [i.tributo, i.mensagem])).toEqual([
            ['Tipo', 'IOB desconto × eSocial Vencimento'],
            ['INSS', 'IOB não incide × eSocial 11 - Base: salário de contribuição mensal'],
            ['FGTS', 'IOB incide × eSocial 00 - Não é base do FGTS'],
            ['IRRF', 'IOB não incide × eSocial 11 - Remuneração mensal'],
        ]);
    });

    it('férias pelo IOB (INF, IRF) contam como incidência; pensão (51) e dedução (4x) afetam a base do IR', () => {
        expect(situacaoGeral(conferirIncidencias(ev('0100', 'V', { inf: 'S', irf: 'S', fg: 'S' }), vig({ codIncIRRF: '13' })))).toBe('ok');
        expect(situacaoGeral(conferirIncidencias(ev('5812', 'D', { ir: 'S' }), vig({ tpRubr: '2', codIncCP: '00', codIncIRRF: '51', codIncFGTS: '00' })))).toBe('ok');
        expect(situacaoGeral(conferirIncidencias(ev('5001', 'D', { ir: 'S' }), vig({ tpRubr: '2', codIncCP: '31', codIncIRRF: '41', codIncFGTS: '00' })))).toBe('ok');
        // desconto do próprio IRRF (31) não afeta a base
        expect(situacaoGeral(conferirIncidencias(ev('5002', 'D', {}), vig({ tpRubr: '2', codIncCP: '00', codIncIRRF: '31', codIncFGTS: '00' })))).toBe('ok');
    });

    it('suspensão judicial e salário-maternidade pago pelo INSS ficam para conferir; código IRRF fora das faixas também', () => {
        expect(situacaoGeral(conferirIncidencias(ev('0001', 'V', { in: 'S', ir: 'S', fg: 'S' }), vig({ codIncCP: '91', codIncFGTS: '91', codIncIRRF: '9011' })))).toBe('suspensa');
        expect(situacaoGeral(conferirIncidencias(ev('0300', 'V', { in: 'S' }), vig({ codIncCP: '25', codIncIRRF: '11', codIncFGTS: '00' })))).toBe('divergente');
        const c = conferirIncidencias(ev('0300', 'V', { ir: 'S', fg: 'S' }), vig({ codIncCP: '25', codIncIRRF: '79' }));
        expect(c.find(i => i.tributo === 'INSS')?.situacao).toBe('conferir');
        expect(c.find(i => i.tributo === 'IRRF')).toMatchObject({ situacao: 'conferir', mensagem: expect.stringContaining('79 - conferir na Tabela 21') });
    });

    it('eConsignado (natureza 9253) exige desconto e codIncFGTS 31', () => {
        const r = conferirIncidencias(ev('5900', 'D', {}), vig({ natRubr: '9253', tpRubr: '2', codIncCP: '00', codIncIRRF: '31', codIncFGTS: '00' }));
        expect(r.find(i => i.tributo === 'Natureza')?.situacao).toBe('divergente');
    });

    it('faixas da Tabela 21 e rótulos só do que foi conferido', () => {
        expect(['11', '35', '46', '55', '9011', '79', '00'].map(classeIrrf)).toEqual(['tributavel', 'retencao', 'deducao', 'pensao', 'suspensa', 'outra', 'outra']);
        expect(rotuloIrrf('13')).toBe('13 - Férias');
        expect(rotuloIrrf('68')).toBe('68 - conferir na Tabela 21');
    });
});

// ---------- S-1010 ----------

const env = (ev: string, id: string, recibo: string, dh: string) => `<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto><evento>${ev}</evento><recibo><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento Id="${id}"><processamento><cdResposta>201</cdResposta><dhProcessamento>${dh}</dhProcessamento></processamento><recibo><nrRecibo>${recibo}</nrRecibo></recibo></retornoEvento></eSocial></recibo></retornoEventoCompleto></eSocial>`;
const dados = (dsc: string, cp: string, ir: string, fg: string, tp = '1', nat = '1000') => `<dadosRubrica><dscRubr>${dsc}</dscRubr><natRubr>${nat}</natRubr><tpRubr>${tp}</tpRubr><codIncCP>${cp}</codIncCP><codIncIRRF>${ir}</codIncIRRF><codIncFGTS>${fg}</codIncFGTS></dadosRubrica>`;
const s1010 = (id: string, recibo: string, dh: string, bloco: string) => env(`<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00"><evtTabRubrica Id="${id}"><ideEvento><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><infoRubrica>${bloco}</infoRubrica></evtTabRubrica></eSocial>`, id, recibo, dh);
const ide = (cod: string, ini: string, fim = '') => `<ideRubrica><codRubr>${cod}</codRubr><ideTabRubr>FOLHA</ideTabRubr><iniValid>${ini}</iniValid>${fim ? `<fimValid>${fim}</fimValid>` : ''}</ideRubrica>`;

function importar(...xmls: string[]) {
    return consolidarRubricas(xmls.flatMap((x, i) => lerXmlRubricas(`r${i}.xml`, x, '11222333').eventos), 'emp1');
}

describe('S-1010', () => {
    it('inclusão e alteração com nova validade viram duas vigências; a vigente depende da competência', () => {
        const { rubricas, avisos } = importar(
            s1010('ID1', '1.1', '2025-01-10T10:00:00', `<inclusao>${ide('1', '2025-01')}${dados('SALARIO', '11', '11', '11')}</inclusao>`),
            s1010('ID2', '1.2', '2026-03-10T10:00:00', `<alteracao>${ide('1', '2025-01')}${dados('SALARIO', '11', '11', '11')}<novaValidade><iniValid>2025-01</iniValid><fimValid>2026-02</fimValid></novaValidade></alteracao>`),
            s1010('ID3', '1.3', '2026-03-10T10:01:00', `<inclusao>${ide('1', '2026-03')}${dados('SALARIO MENSAL', '11', '11', '00')}</inclusao>`),
        );
        expect(avisos).toEqual([]);
        expect(rubricas).toHaveLength(1);
        const r = rubricas[0];
        expect(r.id).toBe(idRubrica('emp1', 'FOLHA', '1'));
        expect(r.vigencias.map(v => [v.iniValid, v.fimValid])).toEqual([['2025-01', '2026-02'], ['2026-03', '']]);
        expect(vigenciaEm(r, '2026-02')?.dados.codIncFGTS).toBe('11');
        expect(vigenciaEm(r, '2026-05')?.dados.codIncFGTS).toBe('00');
        expect(vigenciaEm(r, '2024-12')).toBeUndefined();
        expect(codigoEvento(r)).toBe('0001');
        expect(codigoEvento({ ...r, codRubr: 'SAL-1' })).toBe('');
        expect(codigoEvento({ ...r, eventoIob: '55' })).toBe('0055');
    });

    it('exclusão remove a vigência; a ordem é a do processamento, não a dos arquivos', () => {
        const { rubricas } = importar(
            s1010('ID9', '1.9', '2026-05-01T00:00:00', `<exclusao>${ide('2', '2026-01')}</exclusao>`),
            s1010('ID8', '1.8', '2026-01-05T00:00:00', `<inclusao>${ide('2', '2026-01')}${dados('HE 50%', '11', '11', '11')}</inclusao>`),
            s1010('ID7', '1.7', '2026-01-05T00:00:00', `<inclusao>${ide('3', '2026-01')}${dados('VT', '00', '00', '00', '2')}</inclusao>`),
        );
        expect(rubricas.map(r => r.codRubr)).toEqual(['3']);
    });

    it('sem recibo 201 ou de outro empregador não entra', () => {
        const x = s1010('ID1', '1.1', '2026-01-01', `<inclusao>${ide('1', '2026-01')}${dados('S', '11', '11', '11')}</inclusao>`);
        expect(lerXmlRubricas('a.xml', x.replace('<cdResposta>201', '<cdResposta>401'), '11222333')).toMatchObject({ eventos: [], avisos: [expect.stringContaining('sem recibo')] });
        expect(lerXmlRubricas('a.xml', x, '99999999')).toMatchObject({ eventos: [], avisos: [expect.stringContaining('empregador diferente')] });
    });

    it('reimportação mantém o vínculo manual com o evento do IOB', () => {
        const { rubricas } = importar(s1010('ID1', '1.1', '2026-01-01', `<inclusao>${ide('1', '2026-01')}${dados('S', '11', '11', '11')}</inclusao>`));
        const gravada = { ...rubricas[0], eventoIob: '0002' };
        expect(mesclarRubricas(rubricas, [gravada])).toEqual([{ rubrica: { ...rubricas[0], eventoIob: '0002' }, novo: false, mudou: false }]);
        expect(mesclarRubricas(rubricas, [])[0].novo).toBe(true);
    });
});
