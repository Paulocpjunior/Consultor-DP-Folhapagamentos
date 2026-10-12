// Regras oficiais de validação conferidas no pré-voo só com o XML (regrasOficiais.ts). Dados fictícios.
import { describe, expect, it } from 'vitest';
import { caractereAceito, conferirLotacoes, regrasDasRubricas, regrasOficiaisDoEvento, regrasOficiaisDoLote } from '../regrasOficiais';
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
    it('rubrica × categoria (REGRA_RUBRICA_COMPATIVEL_CATEGORIA): avulso com salário-maternidade, CI e estagiário', () => {
        const mat = [...RUB, rub('MAT', { natRubr: '4050', codIncCP: '21', codIncIRRF: '11', codIncFGTS: '11' })];
        const s1200 = (categ: string, itens: string) => ev('S-1200', `<indApuracao>1</indApuracao></ideEvento><dmDev><ideDmDev>D1</ideDmDev><codCateg>${categ}</codCateg><infoPerApur><ideEstabLot><remunPerApur>${itens}</remunPerApur></ideEstabLot></infoPerApur></dmDev><ideEvento>`, '2026-11');
        const cat = (e: EventoLote, hoje?: string) => regrasDasRubricas(e, mat, { hoje }).filter(a => a.regra === 'REGRA_RUBRICA_COMPATIVEL_CATEGORIA').map(a => [a.nivel, /item (\w+)/.exec(a.mensagem)![1]]);
        expect(cat(s1200('101', it_('SAL', 1000) + it_('MAT', 500)))).toEqual([]);
        expect(cat(s1200('201', it_('SAL', 1000) + it_('MAT', 500)), '2026-11-23')).toEqual([['bloqueio', '1b']]);
        expect(cat(s1200('201', it_('SAL', 1000) + it_('MAT', 500)), '2026-11-10')).toEqual([['aviso', '1b']]);
        expect(cat(s1200('701', it_('SAL', 1000) + it_('INSS13', 10)))).toEqual([['aviso', '2a']]);
        expect(cat(s1200('721', it_('SAL', 1000) + it_('INSS13', 10)))).toEqual([]);
        expect(cat(s1200('901', it_('SAL', 1000)))).toEqual([['aviso', '4']]);
    });
    it('verba rescisória do FGTS no período de apuração do S-1200: alerta; no S-2299 não', () => {
        expect(achados(s1200(it_('SAL', 1000) + it_('AVI', 500)))).toEqual([['aviso', 'REGRA_RUBRICA_COMPATIVEL_RESC']]);
        const deslig = ev('S-2299', `<dtDeslig>2026-09-30</dtDeslig></ideEvento><verbasResc><dmDev><ideDmDev>R1</ideDmDev><infoPerApur><ideEstabLot>${it_('AVI', 500).replace(/itensRemun/g, 'detVerbas')}</ideEstabLot></infoPerApur></dmDev></verbasResc><ideEvento>`);
        expect(achados(deslig)).toEqual([]);
    });
});

describe('NT 07/2026 rev.: regras por data de implantação', () => {
    const r = (e: EventoLote, hoje: string, tpAmb: 1 | 2 = 1) => regrasOficiaisDoEvento(e, hoje, tpAmb).map(a => [a.nivel, a.regra]);
    it('S-2200 infoCota: proibido para admissão desde 26/10/2026, depois da implantação', () => {
        const adm = (dt: string) => ev('S-2200', `<codCateg>101</codCateg><dtAdm>${dt}</dtAdm><infoCota>N</infoCota>`);
        expect(r(adm('2026-10-26'), '2026-10-26')).toEqual([['bloqueio', 'NT 07/2026, S-2200 infoCota']]);
        expect(r(adm('2026-10-25'), '2026-10-26')).toEqual([]);
        expect(r(adm('2026-10-26'), '2026-10-20')).toEqual([]); // antes da produção
        expect(r(adm('2026-10-26'), '2026-10-13', 2)).toEqual([['bloqueio', 'NT 07/2026, S-2200 infoCota']]); // restrita recebe antes
    });
    it('S-2200 horas semanais × tempo parcial e 12x36 (admissão desde 23/11/2026): alerta antes, bloqueio depois', () => {
        const adm = (tmp: string, horas: string, jorn = '9') => ev('S-2200', `<codCateg>101</codCateg><dtAdm>2026-11-23</dtAdm><horContratual><qtdHrsSem>${horas}</qtdHrsSem><tpJornada>${jorn}</tpJornada><tmpParc>${tmp}</tmpParc></horContratual>`);
        expect(r(adm('2', '30'), '2026-11-23')).toEqual([]);
        expect(r(adm('2', '31'), '2026-11-23')).toEqual([['bloqueio', 'NT 07/2026, qtdHrsSem']]);
        expect(r(adm('3', '27'), '2026-11-10')).toEqual([['aviso', 'NT 07/2026, qtdHrsSem']]);
        expect(r(adm('1', '12', '2'), '2026-11-23')).toEqual([['bloqueio', 'NT 07/2026, tmpParc']]);
        const antiga = ev('S-2200', '<codCateg>101</codCateg><dtAdm>2026-11-22</dtAdm><horContratual><qtdHrsSem>44</qtdHrsSem><tpJornada>9</tpJornada><tmpParc>2</tmpParc></horContratual>');
        expect(r(antiga, '2026-11-23')).toEqual([]);
    });
    it('S-1010 informativa dedutora sem observação; S-1000 indOptRegEletron', () => {
        expect(r(ev('S-1010', '<iniValid>2026-10</iniValid><dadosRubrica><tpRubr>4</tpRubr></dadosRubrica>'), '2026-10-12')).toEqual([['aviso', 'NT 07/2026, S-1010 observacao']]);
        expect(r(ev('S-1010', '<iniValid>2026-11</iniValid><dadosRubrica><tpRubr>4</tpRubr><observacao>Dedução</observacao></dadosRubrica>'), '2026-11-23')).toEqual([]);
        expect(r(ev('S-1000', '<iniValid>2026-02</iniValid><indOptRegEletron>1</indOptRegEletron>'), '2026-11-23')).toEqual([['bloqueio', 'NT 07/2026, S-1000 indOptRegEletron']]);
        expect(r(ev('S-1000', '<iniValid>2026-01</iniValid><indOptRegEletron>1</indOptRegEletron>'), '2026-11-23')).toEqual([]);
    });
    it('CPF de dependente com dígito errado bloqueia', () => {
        expect(r(ev('S-1210', '<dedDepen><cpfDep>52998224725</cpfDep></dedDepen>', '2026-10'), '2026-10-12')).toEqual([]);
        expect(r(ev('S-1210', '<dedDepen><cpfDep>52998224724</cpfDep></dedDepen>', '2026-10'), '2026-10-12')).toEqual([['bloqueio', 'CPF do dependente']]);
    });
});

describe('pacote do XSD pela data do envio', () => {
    it('produção e produção restrita; arquivo que não mudou vem do pacote anterior', async () => {
        const { pacoteXsdEm, pastaDoArquivo, PACOTES_XSD } = await import('../validadorXsd');
        const pasta = (d: string, amb: 1 | 2 = 1) => PACOTES_XSD[pacoteXsdEm(d, amb)].pasta;
        expect(pasta('2026-10-12')).toBe('v_S_01_03_00');
        expect(pasta('2026-10-13', 2)).toBe('v_S_01_03_00_2026-10-26');
        expect(pasta('2026-10-26')).toBe('v_S_01_03_00_2026-10-26');
        expect(pasta('2026-12-31')).toBe('v_S_01_03_00_2026-12-14');
        const i = pacoteXsdEm('2026-12-20');
        expect(pastaDoArquivo('evtRemun.xsd', i)).toBe('v_S_01_03_00');
        expect(pastaDoArquivo('evtDeslig.xsd', i)).toBe('v_S_01_03_00_2026-11-23');
        expect(pastaDoArquivo('evtTabRubrica.xsd', i)).toBe('v_S_01_03_00_2026-12-14');
    });
    it('os arquivos do manifesto existem nas pastas', async () => {
        const { existsSync } = await import('node:fs');
        const { PACOTES_XSD } = await import('../validadorXsd');
        for (const p of PACOTES_XSD.slice(1)) for (const f of p.arquivos as string[]) expect(existsSync(new URL(`../../../public/esocial-xsd/${p.pasta}/${f}`, import.meta.url)), `${p.pasta}/${f}`).toBe(true);
    });
});

describe('estabelecimento e lotação vigentes (REGRA_DEMONSTRATIVO 2.3)', () => {
    const s1200 = (cod: string, perApur = '2026-09', ant = '') => ev('S-1200', `<indApuracao>1</indApuracao></ideEvento><dmDev><ideDmDev>D1</ideDmDev><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>11222333000181</nrInsc><codLotacao>${cod}</codLotacao></ideEstabLot></infoPerApur>${ant}</dmDev><ideEvento>`, perApur);
    const lot = (codigo: string, x: Partial<{ iniValid: string; fimValid: string; recibo1020: string; recibo1005: string; cno: string; tipo: string }> = {}) => ({ codigo, tipo: '01', cno: '', iniValid: '2026-01', fimValid: '', recibo1020: '1.1.1', ...x });
    const r = (eventos: EventoLote[], ls: ReturnType<typeof lot>[]) => conferirLotacoes(eventos, ls).map(a => [a.nivel, a.mensagem.replace(/ \(REGRA_DEMONSTRATIVO\)\.$/, '')]);
    it('sem lotação cadastrada: nada a conferir', () => expect(r([s1200('L1')], [])).toEqual([]));
    it('vigente com S-1020 aceito: nada; fora da validade: bloqueio (com recibo) ou alerta (sem)', () => {
        expect(r([s1200('L1')], [lot('L1')])).toEqual([]);
        expect(r([s1200('L1')], [lot('L1', { fimValid: '2026-08' })])).toEqual([['bloqueio', 'S-1200 (2026-09): lotação L1 fora da validade do S-1020 (2026-01 a 2026-08) na competência 2026-09']]);
        expect(r([s1200('L1')], [lot('L1', { fimValid: '2026-08', recibo1020: '' })])[0][0]).toBe('aviso');
        expect(r([s1200('L1')], [lot('L1', { recibo1020: '' })])).toEqual([['aviso', 'S-1200 (2026-09): lotação L1 sem o S-1020 aceito pelo Consultor; confira se a tabela está no eSocial']]);
    });
    it('período anterior confere no perRef; código fora do cadastro: um alerta por lote', () => {
        const ant = '<infoPerAnt><ideADC><idePeriodo><perRef>2025-12</perRef><ideEstabLot><tpInsc>1</tpInsc><nrInsc>11222333000181</nrInsc><codLotacao>L1</codLotacao></ideEstabLot></idePeriodo></ideADC></infoPerAnt>';
        expect(r([s1200('L1', '2026-09', ant)], [lot('L1')])[0]).toEqual(['bloqueio', 'S-1200 (2026-09): lotação L1 fora da validade do S-1020 (2026-01 em diante) na competência 2025-12']);
        expect(r([s1200('X9'), { ...s1200('X9'), id: 'outro' }], [lot('L1')])).toEqual([['aviso', 'Lotação X9 fora do cadastro de lotações do Consultor: a validade do S-1020 não foi conferida']]);
    });
});
