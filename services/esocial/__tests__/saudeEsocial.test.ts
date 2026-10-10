import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { gerarS1298, gerarS1299, type InfoFech } from '../transmissao';
import { elementoEVersao, traduzirErroXsd, validarPeloXsd } from '../validadorXsd';
import { chaveDoEvento, competenciaFechada, lerEventoLote, regrasDoLote } from '../preVoo';
import { alertasDaFila, consultaVencida, etapaDoEnvio, podeLiberar, proximaConsulta, resumoDaFila, situacaoAtual } from '../filaEnvios';
import { situacaoDaFalha, type Envio, type EventoEnviado } from '../transmissaoService';

const lerXsd = (nome: string) => readFile(new URL(`../../../public/esocial-xsd/v_S_01_03_00/${nome}`, import.meta.url), 'utf8');
const CNPJ = '29463877000109';
const INFO: InfoFech = { evtRemun: true, evtPgtos: true, evtComProd: false, evtContratAvNP: false, evtInfoComplPer: false, transDCTFWeb: false };
const ID = (n: number) => `ID12946387700000020261010120000${String(n).padStart(5, '0')}`;

describe('validador XSD (leiaute S-1.3 oficial)', () => {
    it('S-1299 e S-1298 do Consultor passam (a assinatura é do CFI)', async () => {
        expect(await validarPeloXsd(gerarS1299({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, info: INFO, id: ID(1) }).xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect((await validarPeloXsd(gerarS1298({ cnpj: CNPJ, perApur: '2026', tpAmb: 2, id: ID(2) }).xml, lerXsd)).valido).toBe(true);
    });
    it('erro de formato, de lista e de ordem em português', async () => {
        const xml = gerarS1299({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, info: INFO, id: ID(1) }).xml.replace('<evtPgtos>S</evtPgtos>', '<evtPgtos>X</evtPgtos>');
        const r = await validarPeloXsd(xml, lerXsd);
        expect(r.valido).toBe(false);
        expect(r.erros.map(e => e.mensagem)).toEqual(['<evtPgtos>: o valor "X" não está entre os permitidos (S, N).']);
        const r2 = await validarPeloXsd(gerarS1299({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, info: INFO, id: ID(1) }).xml.replace('<procEmi>1</procEmi>', ''), lerXsd);
        expect(r2.erros[0].mensagem).toBe('<verProc> fora de lugar ou não permitido aqui; o leiaute espera <procEmi>.');
    });
    it('versão antiga do leiaute é barrada com a explicação', async () => {
        const xml = gerarS1299({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, info: INFO, id: ID(1) }).xml.replace('v_S_01_03_00', 'v_S_01_02_00');
        expect(elementoEVersao(xml)).toEqual({ elemento: 'evtFechaEvPer', versao: 'v_S_01_02_00' });
        expect((await validarPeloXsd(xml, lerXsd)).erros[0].mensagem).toContain('leiaute S-1.2; o vigente é o S-1.3');
    });
    it('sem o XSD não trava: vira aviso', async () => {
        const r = await validarPeloXsd(gerarS1299({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, info: INFO, id: ID(1) }).xml.replace('evtFechaEvPer', 'evtFechaEvPer'), async () => { throw new Error('offline'); });
        // O cache do teste anterior já tem o XSD; um elemento ainda não carregado mostra o caso.
        const r2 = await validarPeloXsd('<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtToxic/v_S_01_03_00"><evtToxic Id="x"/></eSocial>', async () => { throw new Error('offline'); });
        expect(r.valido).toBe(true);
        expect(r2).toMatchObject({ valido: true, indisponivel: expect.stringContaining('offline') });
    });
    it('traduções', () => {
        expect(traduzirErroXsd("evento.xml:1: Schemas validity error : Element '{x}cpfTrab': [facet 'pattern'] The value '123' is not accepted by the pattern '\\d{11}'.")).toBe('<cpfTrab>: o valor "123" está fora do formato do leiaute.');
        expect(traduzirErroXsd("Schemas validity error : Element '{x}nmTrab': [facet 'maxLength'] The value has a length of '80'; this exceeds the allowed maximum length of '70'.")).toBe('<nmTrab>: tem 80 caracteres; o máximo é 70.');
        expect(traduzirErroXsd("Schemas validity error : Element '{x}evtRemun', attribute 'Id': [facet 'length'] The value 'ID1' has a length of '3'; this differs from the allowed length of '36'.")).toBe('<evtRemun Id>: tem 3 caracteres; deve ter 36.');
        expect(traduzirErroXsd("Schemas validity error : Element '{x}ideEvento': Missing child element(s). Expected is ( {x}tpAmb ).")).toBe('Falta <tpAmb> dentro de <ideEvento>.');
    });
});

const env = (o: Partial<Envio> & { eventos: EventoEnviado[] }): Envio => ({
    id: 'e', empresaId: 'E1', cnpj: CNPJ, tpAmb: 2, grupo: 3, protocolo: '1.2.3', dhRecepcao: '', transmissor: '', certificado: 'escritorio', situacao: 'processado',
    cdResposta: 201, descResposta: '', ocorrencias: [], enviadoPorEmail: 'x', enviadoEm: '2026-10-01T10:00:00.000Z', consultadoEm: null, ...o,
});
const ok = (id: string, tipo: string, perApur: string | null, cpf?: string): EventoEnviado => ({ id, tipo, perApur, cpf, cdResposta: 201, nrRecibo: `1.1.${id.slice(-5)}` });
const pend = (id: string, tipo: string, perApur: string | null, cpf?: string): EventoEnviado => ({ id, tipo, perApur, cpf });
const s1299 = (perApur: string, id = ID(9)) => lerEventoLote('s1299', gerarS1299({ cnpj: CNPJ, perApur, tpAmb: 2, info: INFO, id }).xml, { cnpj: CNPJ }, 2);
const s1298 = (perApur: string) => lerEventoLote('s1298', gerarS1298({ cnpj: CNPJ, perApur, tpAmb: 2, id: ID(8) }).xml, { cnpj: CNPJ }, 2);
const s1200 = (cpf: string, perApur: string, id: string, extra = '') => lerEventoLote('s1200', `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00"><evtRemun Id="${id}"><ideEvento>${extra}<indApuracao>1</indApuracao><perApur>${perApur}</perApur><tpAmb>2</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador></evtRemun></eSocial>`, { cnpj: CNPJ }, 2);
const s1210 = (cpf: string, perApur: string, id: string) => ({ ...s1200(cpf, perApur, id), tipo: 'S-1210' });
const regras = (a: ReturnType<typeof regrasDoLote>) => a.map(x => `${x.nivel}:${x.regra}`);

describe('pré-voo: regras de ordem e duplicidade', () => {
    it('lote limpo passa', () => {
        expect(regrasDoLote([s1200('11111111111', '2026-09', ID(1)), s1200('22222222222', '2026-09', ID(2))], [], 2)).toEqual([]);
    });
    it('competência fechada: periódico e S-1299 esperam o S-1298', () => {
        const hist = [env({ eventos: [ok(ID(50), 'S-1299', '2026-09')] })];
        expect(competenciaFechada('2026-09', hist, 2).fechada).toBe(true);
        expect(competenciaFechada('2026-09', hist, 1).fechada).toBe(false);
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(1))], hist, 2))).toEqual(['bloqueio:competencia-fechada']);
        expect(regras(regrasDoLote([s1298('2026-09')], hist, 2))).toEqual([]);
        // Reaberta depois: libera.
        const reaberta = [...hist, env({ id: 'r', enviadoEm: '2026-10-02T10:00:00.000Z', eventos: [ok(ID(51), 'S-1298', '2026-09')] })];
        expect(regrasDoLote([s1200('11111111111', '2026-09', ID(1))], reaberta, 2)).toEqual([]);
    });
    it('não deixa o mesmo evento sair duas vezes', () => {
        const hist = [env({ situacao: 'em-processamento', protocolo: '9.9', eventos: [pend(ID(1), 'S-1200', '2026-09', '11111111111')] })];
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(1))], hist, 2))).toEqual(['bloqueio:id-transmitido']);
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(3))], hist, 2))).toEqual(['bloqueio:pendente']);
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(3))], hist, 1))).toEqual([]);
        const semResposta = [env({ situacao: 'sem-resposta', protocolo: '', eventos: [pend(ID(1), 'S-1200', '2026-09', '11111111111')] })];
        const r = regrasDoLote([s1200('11111111111', '2026-09', ID(1))], semResposta, 2);
        expect(r[0].mensagem).toContain('ficou sem resposta');
        // Lote recusado ou não recebido: pode ir de novo.
        expect(regrasDoLote([s1200('11111111111', '2026-09', ID(1))], [env({ situacao: 'nao-recebido', eventos: [pend(ID(1), 'S-1200', '2026-09', '11111111111')] })], 2)).toEqual([]);
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(1)), s1200('11111111111', '2026-09', ID(1))], [], 2))).toContain('bloqueio:id-repetido');
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(1)), s1200('11111111111', '2026-09', ID(2))], [], 2))).toContain('bloqueio:evento-repetido');
    });
    it('S-1299 espera os periódicos e avisa sem S-1200 aceito; S-1210 espera o S-1200', () => {
        const hist = [env({ situacao: 'enviado', eventos: [pend(ID(1), 'S-1200', '2026-09', '11111111111')] })];
        expect(regras(regrasDoLote([s1299('2026-09')], hist, 2))).toEqual(['bloqueio:fechamento-com-pendentes', 'aviso:fechamento-sem-s1200']);
        expect(regras(regrasDoLote([s1210('11111111111', '2026-09', ID(4))], hist, 2))).toEqual(['bloqueio:s1210-espera-s1200']);
        expect(regras(regrasDoLote([s1298('2026-08')], [], 2))).toEqual(['aviso:reabertura-sem-fechamento']);
    });
    it('retificação sem recibo, grupos misturados e lote grande', () => {
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(1), '<indRetif>2</indRetif>')], [], 2))).toEqual(['bloqueio:retificacao-sem-recibo']);
        expect(regrasDoLote([s1200('11111111111', '2026-09', ID(1), '<indRetif>2</indRetif><nrRecibo>1.1.0000000000000000001</nrRecibo>')], [], 2)).toEqual([]);
        expect(regras(regrasDoLote([s1200('11111111111', '2026-09', ID(1)), { ...s1298('2026-09'), tipo: 'S-2230', grupo: 2 }], [], 2))).toContain('bloqueio:lote-grupo');
        expect(regras(regrasDoLote(Array.from({ length: 51 }, (_, i) => s1200(String(10000000000 + i), '2026-09', ID(100 + i))), [], 2))).toContain('bloqueio:lote-tamanho');
    });
    it('chave do evento', () => {
        expect(chaveDoEvento({ tipo: 'S-1200', cpf: '1', perApur: '2026-09', id: 'a' })).toBe('S-1200|1|2026-09');
        expect(chaveDoEvento({ tipo: 'S-2230', cpf: '1', ref: 'af1', id: 'a' })).toBe('S-2230|1|af1');
        expect(chaveDoEvento({ tipo: 'S-3000', nrRecEvt: '1.1.9', id: 'a' })).toBe('S-3000|1.1.9');
    });
});

describe('fila dos envios', () => {
    const T0 = Date.parse('2026-10-10T12:00:00.000Z');
    const iso = (ms: number) => new Date(ms).toISOString();
    it('transmitindo antigo vira sem resposta; etapas', () => {
        const e = env({ situacao: 'transmitindo', protocolo: '', enviadoEm: iso(T0 - 60_000), eventos: [pend(ID(1), 'S-1200', '2026-09')] });
        expect(situacaoAtual(e, T0)).toBe('transmitindo');
        expect(situacaoAtual(e, T0 + 5 * 60_000)).toBe('sem-resposta');
        expect(etapaDoEnvio(env({ eventos: [ok(ID(1), 'S-1200', '2026-09'), { ...pend(ID(2), 'S-1200', '2026-09'), cdResposta: 401 }] }), T0)).toBe('com-recusa');
        expect(etapaDoEnvio(env({ situacao: 'em-processamento', eventos: [pend(ID(1), 'S-1200', '2026-09')] }), T0)).toBe('aguardando');
    });
    it('consulta automática com intervalo crescente', () => {
        const e = { situacao: 'enviado' as const, protocolo: '1.2', enviadoEm: iso(T0), consultadoEm: null, consultas: 0 };
        expect(proximaConsulta(e)).toBe(T0 + 15_000);
        expect(consultaVencida(e, T0 + 10_000)).toBe(false);
        expect(consultaVencida(e, T0 + 16_000)).toBe(true);
        expect(proximaConsulta({ ...e, situacao: 'em-processamento', consultadoEm: iso(T0 + 60_000), consultas: 3 })).toBe(T0 + 60_000 + 120_000);
        expect(proximaConsulta({ ...e, consultadoEm: iso(T0), consultas: 40 })).toBe(T0 + 1800_000);
        expect(proximaConsulta({ ...e, situacao: 'processado' })).toBeNull();
        expect(proximaConsulta({ ...e, protocolo: '' })).toBeNull();
    });
    it('alertas: sem resposta é crítico; parado; recusas recentes', () => {
        const lista = [
            env({ id: 'a', situacao: 'sem-resposta', protocolo: '', erroEnvio: 'Failed to fetch', enviadoEm: iso(T0 - 10 * 60_000), eventos: [pend(ID(1), 'S-1200', '2026-09')] }),
            env({ id: 'b', situacao: 'em-processamento', enviadoEm: iso(T0 - 45 * 60_000), eventos: [pend(ID(2), 'S-1210', '2026-09')] }),
            env({ id: 'c', situacao: 'enviado', enviadoEm: iso(T0 - 2 * 60_000), eventos: [pend(ID(3), 'S-1210', '2026-09')] }),
            env({ id: 'd', situacao: 'recusado', cdResposta: 301, descResposta: 'Erro no schema', enviadoEm: iso(T0 - 3600_000), eventos: [pend(ID(4), 'S-2230', null)] }),
            env({ id: 'f', situacao: 'em-processamento', enviadoEm: iso(T0 - 30 * 3600_000), eventos: [pend(ID(5), 'S-1200', '2026-08')] }),
        ];
        const a = alertasDaFila(lista, T0);
        expect(a.map(x => `${x.envioId}:${x.gravidade}:${x.acao}`)).toEqual(['a:critico:verificar', 'f:critico:consultar', 'b:atencao:consultar', 'd:atencao:corrigir']);
        expect(a[0].detalhe).toContain('Não transmita de novo');
        const r = resumoDaFila(lista, T0);
        expect(r.porEtapa).toMatchObject({ 'sem-resposta': 1, aguardando: 3, recusado: 1 });
        expect(podeLiberar(lista[0], T0)).toBe(false);
        expect(podeLiberar(lista[0], T0 + 25 * 60_000)).toBe(true);
    });
    it('falha do envio: recusa do CFI (4xx) não chegou; rede ou 5xx pode ter chegado', () => {
        expect(situacaoDaFalha(Object.assign(new Error('Carteira'), { status: 403 }))).toBe('nao-recebido');
        expect(situacaoDaFalha(Object.assign(new Error('timeout'), { status: 504 }))).toBe('sem-resposta');
        expect(situacaoDaFalha(new TypeError('Failed to fetch'))).toBe('sem-resposta');
        expect(situacaoDaFalha(Object.assign(new Error('x'), { status: 408 }))).toBe('sem-resposta');
    });
});

describe('download para conferir lote sem resposta', () => {
    it('só os aceitos com recibo', async () => {
        const { recibosDoDownload } = await import('../filaEnvios');
        expect(recibosDoDownload([
            { id: 'A', rec: '<retornoEvento><processamento><cdResposta>201</cdResposta></processamento><recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo></retornoEvento>' },
            { id: 'B', rec: '<retornoEvento><processamento><cdResposta>401</cdResposta></processamento></retornoEvento>' },
            { id: 'C', rec: '' },
        ])).toEqual({ A: '1.1.0000000000000000001' });
    });
});
