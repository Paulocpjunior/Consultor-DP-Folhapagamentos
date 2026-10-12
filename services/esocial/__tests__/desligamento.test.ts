import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { calcularRescisao } from '../../calculo/motorRescisao';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';
import { afastamentoQueImpede, chaveVerbaRescisao, gerarS2299, MOTIVOS_COM_AFASTADO, ideDmDevRescisao, prazoS2299, refDesligamento, rubricaDaVerba, sugerirDeParaRescisao } from '../desligamento';
import type { ParametrosEsocialFolha } from '../eventosFolha';
import { statusPorRef } from '../statusEvento';
import { validarPeloXsd } from '../validadorXsd';
import type { Envio } from '../transmissaoService';

const lerXsd = (nome: string, pasta = "v_S_01_03_00") => readFile(new URL(`../../../public/esocial-xsd/${pasta}/${nome}`, import.meta.url), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '29463877000109';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'desligado',
    dados: { nome: 'ANA', admissao: '2025-06-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', regimeTrabalhista: '1', dataDesligamento: '2026-10-05', motivoDesligamento: '02' } };
const rub = (cod: string, dsc: string, nat: string, tp: '1' | '2'): Rubrica => ({ id: cod, empresaId: 'E1', codRubr: cod, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] });
// S-1010 de exemplo, com as rubricas de rescisão do IOB pela descrição.
const RUBRICAS = [
    rub('0001', 'SALARIO', '1000', '1'), rub('0480', 'SALDO DE SALARIO', '6000', '1'), rub('0950', 'AVISO PREVIO INDENIZADO', '6003', '1'),
    rub('0951', '13 SALARIO PROPORCIONAL', '6002', '1'), rub('0952', '13 SALARIO S/ AVISO INDENIZADO', '6001', '1'),
    rub('0953', 'FERIAS VENCIDAS', '6007', '1'), rub('0954', '1/3 FERIAS VENCIDAS', '6007', '1'), rub('0955', 'FERIAS PROPORCIONAIS', '6006', '1'),
    rub('0956', '1/3 FERIAS PROPORCIONAIS', '6006', '1'), rub('5000', 'INSS', '9201', '2'), rub('5001', 'INSS 13 SALARIO', '9201', '2'),
    rub('5002', 'IRRF', '9203', '2'), rub('5003', 'IRRF 13 SALARIO', '9203', '2'),
];
const resc = (aviso: 'indenizado' | 'trabalhado' = 'indenizado') => calcularRescisao({ ficha: FICHA, data: '2026-10-05', tipo: '02', aviso, afastamentos: [], tabelas: TAB, movimentos: {} });
const FOLHA: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: {
    SAL: { codRubr: '0001', ideTabRubr: 'T1' }, INSS: { codRubr: '5000', ideTabRubr: 'T1' }, IRRF: { codRubr: '5002', ideTabRubr: 'T1' },
    INSS13: { codRubr: '5001', ideTabRubr: 'T1' }, IRRF13: { codRubr: '5003', ideTabRubr: 'T1' } } };
/** De/para com as sugestões aplicadas, como a tela faz até a equipe gravar. */
const comSugestoes = (p: ParametrosEsocialFolha, r = resc()): ParametrosEsocialFolha => {
    const x = { ...p.rubricas };
    for (const i of sugerirDeParaRescisao([r], RUBRICAS, '2026-10')) if (!x[i.chave] && i.sugestao) x[i.chave] = i.sugestao;
    return { ...p, rubricas: x };
};

describe('S-2299 pelo Consultor', () => {
    it('de/para da rescisão sugerido pela descrição do S-1010; férias vencidas sem o período na chave', () => {
        const r = resc();
        expect(r.situacao).toBe('calculado');
        const sug = Object.fromEntries(sugerirDeParaRescisao([r], RUBRICAS, '2026-10').map(i => [i.chave, i.sugestao?.codRubr ?? null]));
        expect(sug).toMatchObject({ 'RESC:SAL': '0480', 'RESC:AVISO': '0950', 'RESC:13PROP': '0951', 'RESC:13IND': '0952', 'RESC:FP': '0955', 'RESC:FP13': '0956' });
        expect(chaveVerbaRescisao({ codigo: 'FV2024-03-01', descricao: 'x' })).toBe('FV');
        expect(chaveVerbaRescisao({ codigo: 'FVD132024-03-01', descricao: 'x' })).toBe('FVD13');
        // Verba que também existe na folha usa a rubrica da folha; a só da rescisão nunca.
        expect(rubricaDaVerba(FOLHA, { codigo: 'INSS', descricao: '' })?.codRubr).toBe('5000');
        expect(rubricaDaVerba({ ...FOLHA, rubricas: { ...FOLHA.rubricas, AVISO: { codRubr: '0001', ideTabRubr: 'T1' } } }, { codigo: 'AVISO', descricao: '' })).toBeUndefined();
    });

    it('verbas no estabelecimento da ficha na data (filial), com a lotação dela; outra empresa: erro', async () => {
        const filial = '29463877000290';
        const r = resc();
        const ficha = { ...FICHA, dados: { ...FICHA.dados, estabelecimento: filial } };
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes({ ...FOLHA, estabelecimentos: [{ nrInsc: filial, codLotacao: 'LOTFIL' }] }, r), hoje: '2026-10-06', agora: new Date('2026-10-06T12:00:00Z') });
        expect(g.erros).toEqual([]);
        expect(g.evento!.xml).toContain(`<ideEstabLot><tpInsc>1</tpInsc><nrInsc>${filial}</nrInsc><codLotacao>LOTFIL</codLotacao>`);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const outra = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: { ...FICHA, dados: { ...FICHA.dados, estabelecimento: '44388152000189' } }, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA, r), hoje: '2026-10-06' });
        expect(outra.erros.join(' ')).toMatch(/de outra empresa/);
    });

    it('evento válido pelo XSD oficial S-1.3: aviso indenizado com a data projetada, verbas, pensAlim', async () => {
        const r = resc();
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA, r), hoje: '2026-10-06', agora: new Date('2026-10-06T12:00:00Z') });
        expect(g.erros).toEqual([]);
        const xml = g.evento!.xml;
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(xml).toContain('<mtvDeslig>02</mtvDeslig><dtDeslig>2026-10-05</dtDeslig><indPagtoAPI>S</indPagtoAPI>');
        expect(xml).toContain(`<dtProjFimAPI>${r.dataProjetada}</dtProjFimAPI><pensAlim>0</pensAlim>`);
        expect(xml).toContain(`<ideDmDev>${ideDmDevRescisao('2026-10-05', 'M1')}</ideDmDev>`);
        expect(xml).toContain('<codRubr>0480</codRubr>');
        expect(xml).not.toContain('<codRubr>0001</codRubr>');
        expect(xml).toContain('<infoAgNocivo><grauExp>1</grauExp></infoAgNocivo>');
        expect(g.prazo).toBe('2026-10-15');
        expect(g.avisos.join(' ')).toContain('S-1210');
    });

    it('aviso trabalhado com 3 dias indenizados (misto, MOS 3.1): indPagtoAPI S, pede a data do aviso; pensão sobre o FGTS', async () => {
        const r = resc('trabalhado');
        const p = comSugestoes(FOLHA, r);
        const sem = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: p });
        expect(r.diasAviso).toBe(33);
        expect(sem.evento!.xml).toContain('<indPagtoAPI>S</indPagtoAPI><dtProjFimAPI>2026-10-08</dtProjFimAPI><pensAlim>0</pensAlim>');
        expect(sem.avisos.join(' ')).toContain('informe a data em que o aviso foi dado');
        const com = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: p, dtAvisoPrevio: '2026-09-05', pensaoFgts: { tipo: '3', percentual: 30, valor: 150000 } });
        expect(com.evento!.xml).toContain('<dtAvPrv>2026-09-05</dtAvPrv><indPagtoAPI>S</indPagtoAPI><dtProjFimAPI>2026-10-08</dtProjFimAPI><pensAlim>3</pensAlim><percAliment>30.00</percAliment><vrAlim>1500.00</vrAlim>');
        expect((await validarPeloXsd(com.evento!.xml, lerXsd)).valido).toBe(true);
        expect(gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: p, dtAvisoPrevio: '2026-11-01' }).erros).toContain('Data do aviso prévio: entre a admissão e o desligamento.');
    });

    it('sem rubrica, sem parâmetros, sem motivo ou fora do prazo do leiaute: sem evento, com o motivo', () => {
        const r = resc();
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: FOLHA });
        expect(g.evento).toBeNull();
        expect(g.erros.join(' ')).toContain('"Aviso prévio indenizado" sem rubrica no de/para da rescisão');
        expect(gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: { ...comSugestoes(FOLHA), codLotacao: '' } }).erros.join(' ')).toContain('lotação');
        expect(gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: { ...r, tipo: '' }, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA) }).erros[0]).toContain('tipo do desligamento');
        expect(gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA), hoje: '2026-09-20' }).erros.join(' ')).toContain('até 10 dias depois de hoje');
        // Rubrica de desconto para provento: o S-1010 manda.
        const errado = { ...comSugestoes(FOLHA), rubricas: { ...comSugestoes(FOLHA).rubricas, 'RESC:AVISO': { codRubr: '5000', ideTabRubr: 'T1' } } };
        expect(gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: errado }).erros.join(' ')).toContain('Rubrica 5000 é desconto no S-1010');
    });

    it('retificação e estatutário (sem pensAlim)', () => {
        const r = resc();
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 1, ficha: { ...FICHA, dados: { ...FICHA.dados, regimeTrabalhista: '2' } }, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA), retificaRecibo: '1.2.0000000000000000001' });
        expect(g.evento!.xml).toContain('<indRetif>2</indRetif><nrRecibo>1.2.0000000000000000001</nrRecibo><tpAmb>1</tpAmb>');
        expect(g.evento!.xml).not.toContain('pensAlim');
    });

    it('prazo de 10 dias, antecipado para o dia útil anterior', () => {
        expect(prazoS2299('2026-10-05')).toBe('2026-10-15');
        // 10 dias depois de 01/11/2026 cai em 11/11 (quarta).
        expect(prazoS2299('2026-11-01')).toBe('2026-11-11');
        // 10 dias depois de 07/11/2026 é 17/11 (terça); de 08/11 é 18/11.
        expect(prazoS2299('2026-10-07')).toBe('2026-10-16');
        expect(prazoS2299('')).toBe('');
    });

    it('situação na tela pelo envio do Consultor (ref do desligamento) ou pelo desligamento importado do IOB', () => {
        const ref = refDesligamento('f1', '2026-10-05');
        const envio = { id: 'e1', situacao: 'processado', tpAmb: 1, protocolo: 'P1', enviadoEm: '2026-10-06T10:00:00Z', ocorrencias: [],
            eventos: [{ id: 'ID1', tipo: 'S-2299', perApur: null, ref, cdResposta: 201, nrRecibo: '1.2.3' }] } as unknown as Envio;
        expect(statusPorRef(ref, 'S-2299', [envio]).situacao).toBe('aceito');
        expect(statusPorRef(ref, 'S-2299', []).situacao).toBe('nao-enviado');
        expect(statusPorRef(ref, 'S-2299', [], { recibo: '', detalhe: 'importado' }).situacao).toBe('iob');
    });
});

describe('S-2299 dos motivos 05, 10 e 17', () => {
    const r = (tipo: '05' | '10' | '17', aviso: 'indenizado' | 'dispensado' = 'indenizado') => calcularRescisao({ ficha: FICHA, data: '2026-10-05', tipo, aviso, afastamentos: [], tabelas: TAB, movimentos: {} });
    it('falecimento (10): indApurIR 1, sem aviso indenizado, sem S-1210; passa no XSD', async () => {
        const x = r('10', 'dispensado');
        expect(x.situacao).toBe('calculado');
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: x, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA, x), hoje: '2026-10-06', agora: new Date('2026-10-06T12:00:00Z') });
        expect(g.erros).toEqual([]);
        const xml = g.evento!.xml;
        expect(xml).toContain('<mtvDeslig>10</mtvDeslig>');
        expect(xml).toContain('<indPagtoAPI>N</indPagtoAPI>');
        expect(xml).not.toContain('<indApurIR>0</indApurIR>');
        expect(xml).toContain('<indApurIR>1</indApurIR>');
        expect(g.avisos.join(' ')).toMatch(/sem S-1210/);
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('culpa recíproca (05) e rescisão indireta (17): aviso indenizado; passam no XSD', async () => {
        for (const tipo of ['05', '17'] as const) {
            const x = r(tipo);
            const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: x, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA, x), hoje: '2026-10-06', agora: new Date('2026-10-06T12:00:00Z') });
            expect(g.erros, tipo).toEqual([]);
            expect(g.evento!.xml).toContain(`<mtvDeslig>${tipo}</mtvDeslig>`);
            expect(g.evento!.xml).toContain('<indPagtoAPI>S</indPagtoAPI>');
            expect(g.avisos.join(' ')).not.toMatch(/parte trabalhada/);
            expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        }
    });

    it('afastado (inclusive férias) só com os motivos da regra do eSocial; a data é a do fim projetado do aviso', () => {
        const r = calcularRescisao({ ficha: FICHA, data: '2026-10-05', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
        const ferias = { id: 'g', fichaId: FICHA.id, dtInicio: '2026-10-20', dtFim: '2026-11-18', motivo: '15' } as never;
        const emFerias = { id: 'h', fichaId: FICHA.id, dtInicio: '2026-10-01', dtFim: '2026-12-30', motivo: '15' } as never;
        // Férias que acabam antes do fim projetado do aviso não impedem: a regra olha a maior das duas datas.
        expect(gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA, r), afastamentos: [{ ...(emFerias as object), dtFim: r.dataProjetada.replace(/..$/, '01') } as never] }).erros.join(' ')).not.toMatch(/REGRA_DESLIG/);
        const g = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA, r), afastamentos: [emFerias] });
        expect(g.evento).toBeNull();
        expect(g.erros.join(' ')).toMatch(/o trabalhador está em férias .*Desligue depois do fim das férias/);
        const sem = gerarS2299({ cnpj: CNPJ, tpAmb: 2, ficha: FICHA, rescisao: r, rubricas: RUBRICAS, parametros: comSugestoes(FOLHA, r), afastamentos: [] });
        expect(sem.erros.join(' ')).not.toMatch(/REGRA_DESLIG_TRABALHADOR_AFASTADO/);
        expect(afastamentoQueImpede([ferias], FICHA.id, '02', '2026-10-25')?.texto).toMatch(/^Em 25\/10\/2026 o trabalhador está em férias \(15 - /);
        expect(afastamentoQueImpede([ferias], FICHA.id, '07', '2026-10-25')).toBeNull();
        expect(afastamentoQueImpede([ferias], FICHA.id, '47', '2026-10-25')).toBeNull();
        expect(afastamentoQueImpede([ferias], 'outra', '02', '2026-10-25')).toBeNull();
        expect(afastamentoQueImpede([ferias], FICHA.id, '02', '2026-10-10')).toBeNull();
        expect(afastamentoQueImpede([ferias], FICHA.id, '02', '2026-10-10', '2026-11-18')?.data).toBe('2026-11-18');
        expect(afastamentoQueImpede([ferias], FICHA.id, '02', '2026-10-10', '2026-11-19')).toBeNull();
        const doenca = { id: 'd', fichaId: FICHA.id, dtInicio: '2026-09-01', dtFim: '', motivo: '03' } as never;
        expect(afastamentoQueImpede([doenca], FICHA.id, '33', '2026-10-05')?.texto).toMatch(/sem data de fim.*Informe o fim do afastamento/);
        expect(MOTIVOS_COM_AFASTADO).toHaveLength(30);
    });
});
