// Regras oficiais de validação conferidas no pré-voo só com o XML (regrasOficiais.ts). Dados fictícios.
import { describe, expect, it } from 'vitest';
import { caractereAceito, regrasDasRubricas, regrasOficiaisDoEvento, regrasOficiaisDoLote } from '../regrasOficiais';
import type { DadosRubrica, Rubrica } from '../../cadastros/rubricas';
import type { EventoLote } from '../preVoo';

const ev = (tipo: string, corpo: string, perApur = ''): EventoLote => ({
    nome: tipo, id: `ID${tipo}${perApur}`, tipo, grupo: 3, perApur, cpf: '52998224725', erro: '', indRetif: '1', nrRecibo: '', nrRecEvt: '', tpEvento: '', evtRemun: '',
    xml: `<eSocial><evt Id="X"><ideEvento><indRetif>1</indRetif>${perApur ? `<perApur>${perApur}</perApur>` : ''}${corpo}</ideEvento></evt></eSocial>`,
});
const regras = (e: EventoLote, hoje = '2026-10-12') => regrasOficiaisDoEvento(e, hoje).map(a => a.regra);

describe('regras oficiais pelo XML', () => {
    it('caracteres: aceitos, proibidos, espaço nas pontas; entidades decodificadas; assinatura fora', () => {
        expect(['A', 'ç', 'º', 'ª', '§', ' ', '~'].every(caractereAceito)).toBe(true);
        expect(['–', '“', '\t', ' ', '¨', '´', '½', '€'].some(caractereAceito)).toBe(false);
        expect(regras(ev('S-2200', '<nmTrab>JOSÉ D&apos;ÁVILA</nmTrab>'))).toEqual([]);
        const r = regrasOficiaisDoEvento(ev('S-2200', '<nmTrab>MARIA – SILVA</nmTrab><dscLograd> RUA A</dscLograd>'), '2026-10-12');
        expect(r.map(a => a.mensagem)).toEqual([
            'S-2200: o campo nmTrab tem "–" (U+2013), que o eSocial não aceita (REGRA_CARACTERE_ESPECIAL).',
            'S-2200: o campo dscLograd tem espaço no início ou no fim (REGRA_CARACTERE_ESPECIAL).',
        ]);
        expect(regras(ev('S-2200', '<Signature><SignatureValue>a\nb</SignatureValue></Signature>'))).toEqual([]);
    });
    it('remuneração: mensal até o mês corrente; 13º só a partir de 1º/12 do ano', () => {
        expect(regras(ev('S-1200', '<indApuracao>1</indApuracao>', '2026-10'))).toEqual([]);
        expect(regras(ev('S-1200', '<indApuracao>1</indApuracao>', '2026-11'))).toEqual(['REGRA_VALIDA_PERIODO_APURACAO']);
        expect(regras(ev('S-1200', '<indApuracao>2</indApuracao>', '2026'))).toEqual(['REGRA_REMUN_ANUAL_DEZEMBRO']);
        expect(regras(ev('S-1200', '<indApuracao>2</indApuracao>', '2026'), '2026-12-01')).toEqual([]);
    });
    it('S-1210: período até o mês corrente; pagamento não antes do perRef (anual = dezembro)', () => {
        const pgto = (perRef: string, dt: string, tp = '1') => `<infoPgto><dtPgto>${dt}</dtPgto><tpPgto>${tp}</tpPgto><perRef>${perRef}</perRef></infoPgto>`;
        expect(regras(ev('S-1210', `<procEmi>1</procEmi>${pgto('2026-09', '2026-10-05')}`, '2026-10'))).toEqual([]);
        expect(regras(ev('S-1210', `<procEmi>1</procEmi>${pgto('2026-10', '2026-09-30')}`, '2026-11'))).toEqual(['REGRA_VALIDA_PER_APUR_PGTO', 'REGRA_VALIDA_DT_PGTO']);
        expect(regras(ev('S-1210', `<procEmi>1</procEmi>${pgto('2025', '2025-11-30')}`, '2025-11'))).toEqual(['REGRA_VALIDA_DT_PGTO']);
        expect(regras(ev('S-1210', `<procEmi>1</procEmi>${pgto('2026-10', '2026-09-30', '2')}`, '2026-09'))).toEqual([]); // rescisão: outra regra
        expect(regras(ev('S-1210', '<procEmi>22</procEmi>', '2026-12'))).toEqual([]);
    });
    it('S-2200: data de admissão e contrato rural de pequeno prazo', () => {
        expect(regras(ev('S-2200', '<codCateg>101</codCateg><dtAdm>2026-11-11</dtAdm>'))).toEqual([]);
        expect(regras(ev('S-2200', '<codCateg>101</codCateg><dtAdm>2026-11-12</dtAdm>'))).toEqual(['REGRA_ADMISSAO_VALIDA_DT_ADM']);
        expect(regras(ev('S-2200', '<codCateg>107</codCateg><dtAdm>2021-01-04</dtAdm>'))).toEqual(['REGRA_ADMISSAO_VALIDA_DT_ADM']);
        const rural = (fim: string) => `<codCateg>102</codCateg><dtAdm>2026-09-01</dtAdm><duracao><tpContr>2</tpContr><dtTerm>${fim}</dtTerm></duracao>`;
        expect(regras(ev('S-2200', rural('2026-10-31')))).toEqual([]);
        expect(regras(ev('S-2200', rural('2026-11-01')))).toEqual(['REGRA_ADMISSAO_VALIDA_DURACAO_CONTRATO']);
    });
    it('tabelas: validade não pode começar nem terminar depois do mês do envio', () => {
        expect(regras(ev('S-1010', '<iniValid>2026-10</iniValid>'))).toEqual([]);
        expect(regras(ev('S-1010', '<iniValid>2026-11</iniValid><fimValid>2026-12</fimValid>'))).toEqual(['REGRA_VALIDA_DT_FUTURA', 'REGRA_VALIDA_DT_FUTURA']);
    });
    it('lote: dois afastamentos do mesmo vínculo com a mesma data', () => {
        const af = (id: string, ini: string) => ({ ...ev('S-2230', `<matricula>M1</matricula><dtIniAfast>${ini}</dtIniAfast>`), id });
        expect(regrasOficiaisDoLote([af('a', '2026-10-01'), af('b', '2026-10-02')])).toEqual([]);
        expect(regrasOficiaisDoLote([af('a', '2026-10-01'), af('b', '2026-10-01')]).map(a => [a.regra, a.eventoId])).toEqual([['REGRA_AFASTAMENTO', 'b']]);
    });
});

describe('regras oficiais com as rubricas do S-1010', () => {
    const rub = (codRubr: string, d: Partial<DadosRubrica>, iniValid = '2026-01', fimValid = ''): Rubrica => ({
        id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: 'manual',
        vigencias: [{ iniValid, fimValid, recibo: '', dados: { dscRubr: codRubr, natRubr: '1000', tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '', ...d } }],
    } as Rubrica);
    const RUB = [
        rub('SAL', {}), rub('INSS', { tpRubr: '2', natRubr: '9201', codIncCP: '31', codIncIRRF: '0', codIncFGTS: '00' }),
        rub('IR', { tpRubr: '2', natRubr: '9203', codIncCP: '00', codIncIRRF: '31', codIncFGTS: '00' }),
        rub('DEVIR', { tpRubr: '1', natRubr: '9203', codIncCP: '00', codIncIRRF: '31', codIncFGTS: '00' }),
        rub('ADI', { tpRubr: '2', natRubr: '9200', codIncCP: '00', codIncIRRF: '9', codIncFGTS: '00' }),
        rub('13S', { natRubr: '5001', codIncCP: '12', codIncIRRF: '12', codIncFGTS: '12' }),
        rub('AVI', { natRubr: '6001', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '21' }),
        rub('INSS13', { tpRubr: '2', natRubr: '9201', codIncCP: '32', codIncIRRF: '0', codIncFGTS: '00' }),
        rub('VELHA', {}, '2020-01', '2025-12'),
    ];
    const it_ = (cod: string, v: number) => `<itensRemun><codRubr>${cod}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${v.toFixed(2)}</vrRubr></itensRemun>`;
    const s1200 = (itens: string, ind = '1', perApur = '2026-09', ant = '') => ev('S-1200',
        `<indApuracao>${ind}</indApuracao></ideEvento><dmDev><ideDmDev>D1</ideDmDev><infoPerApur><ideEstabLot><remunPerApur>${itens}</remunPerApur></ideEstabLot></infoPerApur>${ant}</dmDev><ideEvento>`, perApur);
    const achados = (e: EventoLote, r = RUB) => regrasDasRubricas(e, r).map(a => [a.nivel, a.regra]);

    it('demonstrativo correto não gera achado', () => {
        expect(achados(s1200(it_('SAL', 3000) + it_('INSS', 250) + it_('IR', 40)))).toEqual([]);
    });
    it('descontos maiores que os vencimentos e contribuição do segurado negativa: bloqueio', () => {
        expect(achados(s1200(it_('SAL', 100) + it_('ADI', 300)))).toEqual([['bloqueio', 'REGRA_DEMONSTRATIVO']]);
        const inssDev = [rub('DEVINSS', { tpRubr: '1', codIncCP: '31', codIncIRRF: '0', codIncFGTS: '00' })];
        const r = regrasDasRubricas(s1200(it_('SAL', 1000) + it_('DEVINSS', 50) + it_('INSS', 20)), [...RUB, ...inssDev]);
        expect(r.map(a => a.mensagem)).toEqual(['S-1200 (2026-09): demonstrativo D1: rubricas com codIncCP 31 devolvem R$ 50,00 e descontam R$ 20,00; a contribuição do segurado não pode ficar negativa (REGRA_DEMONSTRATIVO).']);
    });
    it('IRRF negativo: alerta (o S-1210 seria recusado)', () => {
        expect(achados(s1200(it_('SAL', 1000) + it_('DEVIR', 80) + it_('IR', 30)))).toEqual([['aviso', 'REGRA_DESCONTO_IRRF_POSITIVO']]);
    });
    it('rubrica fora do S-1010 do Consultor ou sem validade: alerta e somas não conferidas', () => {
        const r = regrasDasRubricas(s1200(it_('XYZ', 10) + it_('VELHA', 5) + it_('ADI', 900)), RUB);
        expect(r.map(a => a.mensagem)).toEqual(['S-1200 (2026-09): demonstrativo D1: rubrica XYZ (tabela T1) não cadastrada, VELHA (tabela T1) sem validade em 09/2026 no S-1010 do Consultor; o eSocial recusa rubrica fora da tabela de rubricas dele, e as somas deste demonstrativo não foram conferidas (REGRA_DEMONSTRATIVO).']);
        expect(achados(s1200(it_('SAL', 1)), [])).toEqual([['aviso', 'REGRA_DEMONSTRATIVO']]);
    });
    it('período anterior usa a validade do perRef', () => {
        const ant = `<infoPerAnt><ideADC><idePeriodo><perRef>2025-06</perRef><ideEstabLot><remunPerAnt>${it_('VELHA', 100)}</remunPerAnt></ideEstabLot></idePeriodo></ideADC></infoPerAnt>`;
        expect(achados(s1200(it_('SAL', 1000), '1', '2026-09', ant))).toEqual([]);
    });
    it('13º: incidências fora da lista oficial dão alerta, uma vez por rubrica', () => {
        expect(achados(s1200(it_('13S', 2000) + it_('INSS13', 150), '2', '2026'))).toEqual([]);
        // INSS do salário (codIncCP 31) no 13º: o certo é a 32.
        expect(achados(s1200(it_('13S', 2000) + it_('INSS', 150), '2', '2026'))).toEqual([['aviso', 'REGRA_RUBRICA_COMPATIVEL_DECTERCEIRO']]);
        expect(achados(s1200(it_('13S', 2000) + it_('SAL', 10) + it_('SAL', 5), '2', '2026'))).toEqual([['aviso', 'REGRA_RUBRICA_COMPATIVEL_DECTERCEIRO']]);
    });
    it('verba rescisória do FGTS no período de apuração do S-1200: alerta; no S-2299 não', () => {
        expect(achados(s1200(it_('SAL', 1000) + it_('AVI', 500)))).toEqual([['aviso', 'REGRA_RUBRICA_COMPATIVEL_RESC']]);
        const deslig = ev('S-2299', `<dtDeslig>2026-09-30</dtDeslig></ideEvento><verbasResc><dmDev><ideDmDev>R1</ideDmDev><infoPerApur><ideEstabLot>${it_('AVI', 500).replace(/itensRemun/g, 'detVerbas')}</ideEstabLot></infoPerApur></dmDev></verbasResc><ideEvento>`);
        expect(achados(deslig)).toEqual([]);
    });
});
