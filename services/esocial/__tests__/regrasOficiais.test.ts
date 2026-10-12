// Regras oficiais de validação conferidas no pré-voo só com o XML (regrasOficiais.ts). Dados fictícios.
import { describe, expect, it } from 'vitest';
import { caractereAceito, regrasOficiaisDoEvento, regrasOficiaisDoLote } from '../regrasOficiais';
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
