import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { calcularRescisao } from '../../calculo/motorRescisao';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { gerarS1210Rescisao } from '../pagamentoRescisao';
import { ideDmDevRescisao } from '../desligamento';
import { validarPeloXsd } from '../validadorXsd';
import type { ReciboEvento } from '../recibosEsocial';

const lerXsd = (nome: string) => readFile(new URL(`../../../public/esocial-xsd/v_S_01_03_00/${nome}`, import.meta.url), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '29463877000109';
const FILHO = { tipo: '03', nome: 'BIA', nascimento: '2015-01-01', cpf: '39053344705', irrf: 'S', salarioFamilia: 'N', pensao: 'N', noEsocial: 'N' };
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'desligado', dependentes: [FILHO as never],
    dados: { nome: 'ANA', admissao: '2025-06-01', salario: '9000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', dataDesligamento: '2026-10-20', motivoDesligamento: '02' } };
const RESC = calcularRescisao({ ficha: FICHA, data: '2026-10-20', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
const IDE = ideDmDevRescisao('2026-10-20', 'M1');
const base = { cnpj: CNPJ, tpAmb: 2 as const, ficha: FICHA, rescisao: RESC, ideDmDev: IDE, dataPagamento: '2026-10-28', agora: new Date('2026-10-14T12:00:00Z') };

describe('S-1210 do pagamento da rescisão', () => {
    it('tpPgto 2, perRef do desligamento, o ideDmDev do S-2299 e as deduções do saldo (11) e do 13º (12); válido pelo XSD', async () => {
        expect(RESC.situacao).toBe('calculado');
        expect(RESC.deducoesIrrf?.simplificado).toBe(false);
        expect(RESC.deducoes13?.simplificado).toBe(false);
        const g = gerarS1210Rescisao(base);
        expect(g.erros).toEqual([]);
        expect(g.exclusao).toBeNull();
        const xml = g.s1210!.xml;
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(xml).toContain(`<perApur>2026-10</perApur>`);
        expect(xml).toContain(`<infoPgto><dtPgto>2026-10-28</dtPgto><tpPgto>2</tpPgto><perRef>2026-10</perRef><ideDmDev>${IDE}</ideDmDev><vrLiq>${(RESC.totais.liquido / 100).toFixed(2)}</vrLiq></infoPgto>`);
        expect(xml).toContain('<dedDepen><tpRend>11</tpRend><cpfDep>39053344705</cpfDep>');
        expect(xml).toContain('<dedDepen><tpRend>12</tpRend><cpfDep>39053344705</cpfDep>');
        expect(xml).toContain('<infoDep><cpfDep>39053344705</cpfDep><dtNascto>2015-01-01</dtNascto><nome>BIA</nome><depIRRF>S</depIRRF><tpDep>03</tpDep></infoDep>');
    });

    it('datas: antes do desligamento, outro mês do cálculo; depois do prazo, aviso da multa do art. 477', () => {
        expect(gerarS1210Rescisao({ ...base, dataPagamento: '2026-10-01' }).erros.join(' ')).toContain('antes do desligamento');
        expect(gerarS1210Rescisao({ ...base, dataPagamento: '2026-11-03' }).erros.join(' ')).toContain('Mês do pagamento');
        expect(gerarS1210Rescisao({ ...base, dataPagamento: '2026-10-31' }).avisos.join(' ')).toContain('art. 477');
    });

    it('com S-1210 aceito no mês (a folha anterior): exclui e volta com os dois pagamentos, sem repetir a dedução do saldo', async () => {
        const folha = '<infoPgto><dtPgto>2026-10-06</dtPgto><tpPgto>1</tpPgto><perRef>2026-09</perRef><ideDmDev>FOLHA202609-M1</ideDmDev><vrLiq>7000.00</vrLiq></infoPgto>';
        const ex: ReciboEvento = { tipo: 'S-1210', cpf: '52998224725', perApur: '2026-10', nrRecibo: '1.1.0000000000000000001', processadoEm: '', origem: 'download',
            pagamentos: [{ tpPgto: '1', perRef: '2026-09', ideDmDev: 'FOLHA202609-M1', xml: folha }],
            irComplem: ['<infoIRComplem><infoDep><cpfDep>39053344705</cpfDep><dtNascto>2015-01-01</dtNascto><nome>BIA</nome><depIRRF>S</depIRRF><tpDep>03</tpDep></infoDep><infoIRCR><tpCR>056107</tpCR><dedDepen><tpRend>11</tpRend><cpfDep>39053344705</cpfDep><vlrDedDep>189.59</vlrDedDep></dedDepen></infoIRCR></infoIRComplem>'] };
        const g = gerarS1210Rescisao({ ...base, existente: ex });
        expect(g.erros).toEqual([]);
        expect(g.exclusao!.xml).toContain('<tpEvento>S-1210</tpEvento><nrRecEvt>1.1.0000000000000000001</nrRecEvt>');
        expect(await validarPeloXsd(g.exclusao!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const xml = g.s1210!.xml;
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(xml).toContain(folha);
        expect(xml).toContain('<tpPgto>2</tpPgto>');
        expect(xml.match(/<tpRend>11<\/tpRend>/g)).toHaveLength(1);
        expect(xml.match(/<tpRend>12<\/tpRend>/g)).toHaveLength(1);
        expect(xml.match(/<infoDep>/g)).toHaveLength(1);
        expect(g.outrosPagamentos).toBe(1);
        // Sem os pagamentos do aceito (só o recibo), pede o download; com o pagamento desta rescisão já nele, recusa.
        expect(gerarS1210Rescisao({ ...base, existente: { ...ex, pagamentos: undefined } }).erros[0]).toContain('Carregue o download');
        expect(gerarS1210Rescisao({ ...base, existente: { ...ex, pagamentos: [{ tpPgto: '2', perRef: '2026-10', ideDmDev: IDE, xml: '' }] } }).erros[0]).toContain('já tem o pagamento desta rescisão');
    });

    it('pensão alimentícia por alimentando (penAlim 11); alimentando sem CPF é erro', async () => {
        const alim = { ...FILHO, irrf: 'N', pensao: 'S' };
        const ficha = { ...FICHA, dependentes: [alim as never] };
        const r = { ...RESC, deducoesIrrf: undefined, deducoes13: undefined, verbas: [...RESC.verbas, { codigo: 'PENSAO', descricao: 'Pensão', referencia: '', tipo: 'desconto' as const, valor: 50000, inss: false, fgts: false, irrf: false }] };
        const g = gerarS1210Rescisao({ ...base, ficha, rescisao: r });
        expect(g.erros).toEqual([]);
        expect(g.s1210!.xml).toContain('<penAlim><tpRend>11</tpRend><cpfDep>39053344705</cpfDep><vlrDedPenAlim>500.00</vlrDedPenAlim></penAlim>');
        expect(await validarPeloXsd(g.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(gerarS1210Rescisao({ ...base, ficha: { ...ficha, dependentes: [{ ...alim, cpf: '' } as never] }, rescisao: r }).erros.join(' ')).toContain('sem CPF válido');
    });
});
