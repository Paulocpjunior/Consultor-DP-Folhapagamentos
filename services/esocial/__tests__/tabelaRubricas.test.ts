import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { BASE_CP, BASE_FGTS, classeIrrf, type Rubrica } from '../../cadastros/rubricas';
import {
    MODELOS, aplicarPedido, codigoSugerido, gerarLoteS1010, gerarS1010, modeloDaVerba, pedidoDaVerba, pedidoVazio, refPedidoS1010,
    resumoPedido, tabelaSugerida, validarDados, validarLote, validarPedido, type PedidoS1010,
} from '../tabelaRubricas';
import { statusPorRef } from '../statusEvento';
import { validarPeloXsd } from '../validadorXsd';
import type { Envio } from '../transmissaoService';

const lerXsd = (nome: string) => readFile(new URL(`../../../public/esocial-xsd/v_S_01_03_00/${nome}`, import.meta.url), 'utf8');
const CNPJ = '29463877000109';
const AGORA = new Date('2026-10-10T12:00:00.123Z');
const dados = (x: Partial<PedidoS1010['dados'] & object> = {}) => ({ dscRubr: 'Salário', natRubr: '1000', tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '', ...x });
const SAL: Rubrica = { id: 'E1_T1_0001', empresaId: 'E1', codRubr: '0001', ideTabRubr: 'T1', eventoIob: '0099', origem: 'eSocial: S-1010',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '1.1.0000000000000000001', dados: dados() }] };
const ped = (x: Partial<PedidoS1010> = {}): PedidoS1010 => ({ ...pedidoVazio('E1'), id: 'E1_p1', codRubr: 'CDPHE50', ideTabRubr: 'T1', iniValid: '2026-10', dados: dados({ dscRubr: 'Horas extras 50%', natRubr: '1003' }), ...x });

describe('S-1010: XML no XSD oficial', () => {
    it('inclusão, alteração com nova validade e exclusão passam no XSD', async () => {
        for (const p of [
            ped(),
            ped({ dados: dados({ observacao: 'Criada pelo Consultor', codIncIRRF: '09' }), fimValid: '2026-12' }),
            ped({ acao: 'alteracao', codRubr: '0001', iniValid: '2020-01', dados: dados({ dscRubr: 'Salário mensal' }), novaIniValid: '2020-01', novaFimValid: '2026-09' }),
            ped({ acao: 'exclusao', codRubr: '0001', iniValid: '2020-01', dados: null }),
        ]) {
            const { xml } = gerarS1010({ cnpj: CNPJ, tpAmb: 2, pedido: p, agora: AGORA, seq: 1 });
            expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        }
    });
    it('conteúdo: raiz do CNPJ, operação, incidências e IRRF sem zero à esquerda', () => {
        const { id, xml } = gerarS1010({ cnpj: CNPJ, tpAmb: 1, pedido: ped({ dados: dados({ codIncIRRF: '09', dscRubr: 'A & B' }) }), agora: AGORA, seq: 7 });
        expect(id).toMatch(/^ID1294638770000002026101009000000007$/);
        expect(xml).toContain('<tpAmb>1</tpAmb><procEmi>1</procEmi>');
        expect(xml).toContain('<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>');
        expect(xml).toContain('<inclusao><ideRubrica><codRubr>CDPHE50</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2026-10</iniValid></ideRubrica>');
        expect(xml).toContain('<dscRubr>A &amp; B</dscRubr><natRubr>1000</natRubr><tpRubr>1</tpRubr><codIncCP>11</codIncCP><codIncIRRF>9</codIncIRRF><codIncFGTS>11</codIncFGTS>');
        expect(gerarS1010({ cnpj: CNPJ, tpAmb: 2, pedido: ped({ acao: 'exclusao', dados: null }), agora: AGORA }).xml).toContain('<exclusao><ideRubrica>');
    });
    it('lote: Ids distintos no mesmo segundo', () => {
        const lote = gerarLoteS1010(CNPJ, 2, [ped({ id: 'a' }), ped({ id: 'b', codRubr: 'X' }), ped({ id: 'c', codRubr: 'Y' })], AGORA);
        expect(new Set(lote.map(x => x.id)).size).toBe(3);
        expect(lote.map(x => x.pedido.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('S-1010: validação', () => {
    it('código, tabela e validade', () => {
        expect(validarPedido(ped({ codRubr: 'eSocial01' }), []).erros).toContain('O código da rubrica não pode começar com "eSocial" (MOS, S-1010, item 1.3).');
        expect(validarPedido(ped({ codRubr: ' 01' }), []).erros).toContain('Código da rubrica com espaço no início ou no fim.');
        expect(validarPedido(ped({ ideTabRubr: 'TABELA123' }), []).erros[0]).toMatch(/até 8 caracteres/);
        expect(validarPedido(ped({ iniValid: '2026-13' }), []).erros).toContain('Início da validade em AAAA-MM.');
        expect(validarPedido(ped({ fimValid: '2026-01' }), []).erros).toContain('Fim da validade em AAAA-MM, igual ou depois do início.');
        expect(validarPedido(ped(), []).erros).toEqual([]);
    });
    it('incidências: leiaute, suspensão, conferência de base e eConsignado', () => {
        expect(validarDados(dados({ codIncCP: '99' }))).toContain('codIncCP 99 não existe no leiaute.');
        expect(validarDados(dados({ codIncCP: '91' })).join(' ')).toMatch(/exige o processo do S-1070/);
        expect(validarDados(dados({ codIncIRRF: '9011' })).join(' ')).toMatch(/exige o processo do S-1070/);
        expect(validarDados(dados({ natRubr: '9901', tpRubr: '3', codIncCP: '00', codIncFGTS: '00', codIncIRRF: '11' })).join(' ')).toMatch(/item 1.4/);
        expect(validarDados(dados({ natRubr: '9901', tpRubr: '3', codIncCP: '00', codIncFGTS: '00', codIncIRRF: '9' }))).toEqual([]);
        expect(validarDados(dados({ natRubr: '9253', tpRubr: '2', codIncCP: '00', codIncFGTS: '00', codIncIRRF: '9' })).join(' ')).toMatch(/eConsignado/);
        expect(validarDados(dados({ natRubr: '9253', tpRubr: '2', codIncCP: '00', codIncFGTS: '31', codIncIRRF: '9' }))).toEqual([]);
        expect(validarDados(dados({ codIncCP: '31' })).join(' ')).toMatch(/tem de ser de desconto/);
        expect(validarDados(dados({ dscRubr: 'x'.repeat(101) }))).toContain('Descrição com mais de 100 caracteres.');
    });
    it('contra o cadastro: inclusão na mesma vigência vira alteração; alteração e exclusão exigem a vigência conhecida', () => {
        const mesma = validarPedido(ped({ codRubr: '0001', iniValid: '2020-01', dados: dados() }), [SAL]);
        expect(mesma.erros[0]).toMatch(/use alteração/);
        const nova = validarPedido(ped({ codRubr: '0001', iniValid: '2026-10', dados: dados() }), [SAL]);
        expect(nova.erros).toEqual([]);
        expect(nova.avisos[0]).toMatch(/encerra a anterior no mês anterior/);
        expect(validarPedido(ped({ acao: 'alteracao', codRubr: '0001', iniValid: '2021-01' }), [SAL]).erros[0]).toMatch(/não conhece a vigência 2021-01/);
        const exc = validarPedido(ped({ acao: 'exclusao', codRubr: '0001', iniValid: '2020-01', dados: null }), [SAL]);
        expect(exc.erros).toEqual([]);
        expect(exc.avisos[0]).toMatch(/prefira informar o fim da validade/);
        expect(validarPedido(ped({ acao: 'alteracao', codRubr: '0001', iniValid: '2020-01', dados: dados({ natRubr: '1099' }) }), [SAL]).avisos[0]).toMatch(/natureza muda de 1000 para 1099/);
        expect(validarPedido(ped({ acao: 'alteracao', codRubr: '0001', iniValid: '2020-01', novaFimValid: '2026-09' }), [SAL]).erros).toContain('Para informar o fim da validade, repita o início em "novo início".');
        expect(validarPedido(ped({ iniValid: '2027-01' }), [], '2026-10').avisos[0]).toMatch(/no futuro/);
    });
    it('lote: até 50 e um pedido por rubrica', () => {
        expect(validarLote([])).toEqual(['Nenhum pedido para transmitir.']);
        expect(validarLote([ped(), ped({ id: 'x' })])[0]).toMatch(/CDPHE50 tem 2 pedidos/);
        expect(validarLote(Array.from({ length: 51 }, (_, i) => ped({ codRubr: `R${i}` })))[0]).toMatch(/até 50/);
    });
});

describe('S-1010 aceito: aplica no cadastro', () => {
    it('inclusão de rubrica nova', () => {
        const r = aplicarPedido(ped(), undefined, 'REC1')!;
        expect(r).toMatchObject({ id: 'E1_T1_CDPHE50', codRubr: 'CDPHE50', ideTabRubr: 'T1', origem: 'Consultor: S-1010', eventoIob: '' });
        expect(r.vigencias).toEqual([{ iniValid: '2026-10', fimValid: '', recibo: 'REC1', dados: dados({ dscRubr: 'Horas extras 50%', natRubr: '1003' }) }]);
    });
    it('nova vigência, alteração da mesma vigência (com fim) e exclusão; o vínculo com o IOB fica', () => {
        const nova = aplicarPedido(ped({ codRubr: '0001', iniValid: '2026-10', dados: dados({ codIncIRRF: '09' }) }), SAL, 'R2')!;
        expect(nova.vigencias.map(v => v.iniValid)).toEqual(['2020-01', '2026-10']);
        expect(nova.vigencias[1].dados.codIncIRRF).toBe('9');
        expect(nova.eventoIob).toBe('0099');
        const alt = aplicarPedido(ped({ acao: 'alteracao', codRubr: '0001', iniValid: '2020-01', dados: dados({ dscRubr: 'Salário mensal' }), novaIniValid: '2020-01', novaFimValid: '2026-09' }), SAL, 'R3')!;
        expect(alt.vigencias).toEqual([{ iniValid: '2020-01', fimValid: '2026-09', recibo: 'R3', dados: dados({ dscRubr: 'Salário mensal' }) }]);
        expect(aplicarPedido(ped({ acao: 'exclusao', codRubr: '0001', iniValid: '2020-01', dados: null }), SAL, 'R4')).toBeNull();
        expect(aplicarPedido(ped({ acao: 'exclusao', codRubr: '0001', iniValid: '2026-10', dados: null }), nova, 'R4')!.vigencias.map(v => v.iniValid)).toEqual(['2020-01']);
    });
    it('situação pelo envio (ref do pedido)', () => {
        const envio = { id: 'e', empresaId: 'E1', tpAmb: 1, situacao: 'processado', protocolo: 'P', eventos: [{ id: 'ID1', tipo: 'S-1010', perApur: null, ref: refPedidoS1010('E1_p1'), cdResposta: 201, nrRecibo: '1.2.3' }] } as unknown as Envio;
        const s = statusPorRef(refPedidoS1010('E1_p1'), 'S-1010', [envio]);
        expect(s).toMatchObject({ situacao: 'aceito', recibo: '1.2.3' });
        expect(statusPorRef(refPedidoS1010('outro'), 'S-1010', [envio]).situacao).toBe('nao-enviado');
    });
    it('resumo de uma linha', () => {
        expect(resumoPedido(ped())).toBe('Horas extras 50% · nat. 1003 · CP 11 · IRRF 11 · FGTS 11 · 2026-10');
        expect(resumoPedido(ped({ acao: 'exclusao', dados: null }))).toBe('Excluir a vigência 2026-10');
    });
});

describe('Modelos das verbas do Consultor', () => {
    it('todos passam na validação e no XSD', async () => {
        for (const m of MODELOS) expect(validarDados(m.dados), m.chave).toEqual([]);
        // Uma validação pelo XSD por combinação de natureza, tipo e incidências (a descrição não muda o resultado).
        const combinacoes = new Map(MODELOS.map(m => [`${m.dados.natRubr}|${m.dados.tpRubr}|${m.dados.codIncCP}|${m.dados.codIncIRRF}|${m.dados.codIncFGTS}`, m]));
        for (const m of combinacoes.values()) {
            const { xml } = gerarS1010({ cnpj: CNPJ, tpAmb: 2, pedido: ped({ codRubr: codigoSugerido(m.chave), dados: m.dados }), agora: AGORA, seq: 1 });
            expect((await validarPeloXsd(xml, lerXsd)).valido, m.chave).toBe(true);
        }
    }, 60_000);
    it('coerentes com as marcas de INSS, FGTS e IRRF dos proventos do motor', () => {
        // Marcas do motor (motorMensal, motor13, motorFerias, motorRescisao) para os proventos.
        const motor: Record<string, [boolean, boolean, boolean]> = {
            SAL: [true, true, true], MAT: [true, true, true], HE50: [true, true, true], DSRHE: [true, true, true], '13': [true, true, true], '13A': [false, true, false],
            FERDOB: [false, false, true], ABONO: [false, false, false], SF: [false, false, false],
            'RESC:AVISO': [false, true, false], 'RESC:ART479': [false, false, false], 'RESC:13PROP': [true, true, true], 'RESC:13IND': [true, true, true],
            'RESC:FV': [false, false, false], 'RESC:FP13': [false, false, false],
        };
        for (const [k, [inss, fgts, irrf]] of Object.entries(motor)) {
            const d = modeloDaVerba(k)!.dados;
            expect([BASE_CP.includes(d.codIncCP), BASE_FGTS.includes(d.codIncFGTS), classeIrrf(d.codIncIRRF) === 'tributavel'], k).toEqual([inss, fgts, irrf]);
        }
    });
    it('férias pelo exemplo do MOS e INSS das férias só na folha do gozo', () => {
        expect(modeloDaVerba('FERMES')!.dados).toMatchObject({ natRubr: '1016', codIncCP: '11', codIncIRRF: '13', codIncFGTS: '11' });
        expect(modeloDaVerba('FERPAGO')!.dados).toMatchObject({ natRubr: '9221', tpRubr: '2', codIncCP: '00', codIncIRRF: '13' });
        expect(modeloDaVerba('INSSFER')!.dados.codIncCP).toBe('00');
        expect(modeloDaVerba('INSSFERRET')!.dados.codIncCP).toBe('31');
    });
    it('hora extra com outro adicional, código e tabela sugeridos', () => {
        expect(modeloDaVerba('HE75')!.dados).toMatchObject({ dscRubr: 'Horas extras 75%', natRubr: '1003' });
        expect(modeloDaVerba('HE62_5')!.dados.dscRubr).toBe('Horas extras 62,5%');
        expect(modeloDaVerba('LAN:BONUS')).toBeUndefined();
        expect(codigoSugerido('RESC:13PROP')).toBe('CDPR13PROP');
        expect(tabelaSugerida([{ ideTabRubr: 'A' }, { ideTabRubr: 'B' }, { ideTabRubr: 'B' }])).toBe('B');
        expect(tabelaSugerida([])).toBe('CDP');
        const p = pedidoDaVerba('E1', { chave: 'LAN:BONUS', descricao: 'Bônus', tipo: 'provento' }, [SAL], '2026-10');
        expect(p).toMatchObject({ codRubr: 'CDPLANBONUS', ideTabRubr: 'T1', chaveVerba: 'LAN:BONUS', iniValid: '2026-10' });
        expect(p.dados).toMatchObject({ dscRubr: 'Bônus', tpRubr: '1', natRubr: '' });
    });
});
