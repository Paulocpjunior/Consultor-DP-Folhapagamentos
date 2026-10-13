import { describe, expect, it, vi } from 'vitest';
import { dataDoId, fechamentosParaImportar, importarFechamentosDoGoverno, lerReciboDoGoverno, montarFechamentoDoGoverno, type FechamentoDoGoverno } from '../fechamentoGoverno';
import { conciliar, anomaliasDaEmpresa } from '../anomalias';
import { alertasDaFila, proximaConsulta, podeLiberar, resumoDaFila } from '../filaEnvios';
import { competenciaFechada } from '../preVoo';
import type { Envio, EventoEnviado } from '../transmissaoService';

// Dados fictícios: CNPJ de teste 11.222.333/0001-81.
const CNPJ = '11.222.333/0001-81';
const EMPRESA = { id: 'E1', cnpj: CNPJ };
const usuario = { id: 'u1', email: 'ana@x.com' };
const REC_F = '1.1.0000000000000000101';
const REC_R = '1.1.0000000000000000102';
const ID_F = 'ID1112223330001812026101010300000001'; // gerado 10/10/2026 10:30:00 (Brasília)
const ID_R = 'ID1112223330001812026101114000000001';
const rec = (nr: string, o: { dh?: string; cd?: number; amb?: number } = {}) =>
    `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_2_1"><retornoEvento Id="x"><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador>`
    + `<recepcao><tpAmb>${o.amb ?? 1}</tpAmb><dhRecepcao>${o.dh ?? '2026-10-10T10:31:12.45'}</dhRecepcao><versaoAppRecepcao>1</versaoAppRecepcao><protocoloEnvioLote>1.2.202610.0000001</protocoloEnvioLote></recepcao>`
    + `<processamento><cdResposta>${o.cd ?? 201}</cdResposta><descResposta>Sucesso.</descResposta><dhProcessamento>2026-10-10T10:31:20</dhProcessamento></processamento><recibo><nrRecibo>${nr}</nrRecibo></recibo></retornoEvento></eSocial>`;

const envio = (o: Partial<Envio> & { eventos: EventoEnviado[] }): Envio => ({
    id: 'C', empresaId: 'E1', cnpj: CNPJ, tpAmb: 1, grupo: 3, protocolo: '1.2.3', dhRecepcao: '', transmissor: '', certificado: 'escritorio', situacao: 'processado',
    cdResposta: 201, descResposta: '', ocorrencias: [], enviadoPorEmail: 'ana@x.com', enviadoEm: '2026-10-05T10:00:00.000Z', consultadoEm: null, ...o,
});

/** O documento como o Consultor o lê depois de gravado (listarEnvios). */
const comoLido = (f: FechamentoDoGoverno): Envio => ({ ...(f.dados as unknown as Envio), id: f.docId, enviadoEm: f.enviadoEm, consultadoEm: null, importadoEm: '2026-10-13T12:00:00.000Z', importadoPorEmail: usuario.email });

/**
 * A régua do servidor (dp-fechamento-esocial.js, avaliarFechamentoEsocial), resumida: produção, raiz do CNPJ,
 * S-1299 do perApur com lote processado e evento 201/202 com recibo; S-1298 aceito depois derruba.
 */
function seloDoServidor(envios: Envio[], cnpj: string, competencia: string): boolean {
    const raiz = cnpj.replace(/\D/g, '').slice(0, 8);
    const evs = envios.filter(e => Number(e.tpAmb) === 1 && String(e.cnpj).replace(/\D/g, '').slice(0, 8) === raiz)
        .flatMap(env => env.eventos.filter(ev => ev.perApur === competencia && (ev.tipo === 'S-1299' || ev.tipo === 'S-1298')).map(ev => ({ env, ev, t: Date.parse(String(env.enviadoEm)) })))
        .sort((a, b) => a.t - b.t);
    const aceito = (ev: EventoEnviado) => !!ev.nrRecibo && (ev.cdResposta === 201 || ev.cdResposta === 202);
    let ultimo = -1;
    evs.forEach((x, k) => { if (x.ev.tipo === 'S-1299' && x.env.situacao === 'processado' && aceito(x.ev)) ultimo = k; });
    return ultimo >= 0 && !evs.slice(ultimo + 1).some(x => x.ev.tipo === 'S-1298' && aceito(x.ev));
}

describe('S-1299/S-1298 de fora do Consultor: o registro', () => {
    it('lê o recibo baixado e a data do Id', () => {
        expect(lerReciboDoGoverno(rec(REC_F))).toEqual({ dhRecepcao: '2026-10-10T10:31:12.45', dhProcessamento: '2026-10-10T10:31:20', cdResposta: 201, tpAmb: 1, nrRecibo: REC_F });
        expect(dataDoId(ID_F)).toBe('2026-10-10T13:30:00.000Z');
        expect(dataDoId('ID1')).toBeNull();
    });

    it('monta o documento que acende o selo do servidor (data da recepção, marcado como do governo)', () => {
        const f = montarFechamentoDoGoverno({ empresa: EMPRESA, perApur: '2026-09', achado: { tipo: 'S-1299', id: ID_F, nrRec: REC_F }, arquivo: { rec: rec(REC_F) } });
        if ('motivo' in f) throw new Error(f.motivo);
        expect(f.docId).toBe(`governo-${REC_F}`);
        expect(f.enviadoEm).toBe('2026-10-10T13:31:12.450Z');
        expect(f.dados).toMatchObject({ empresaId: 'E1', cnpj: CNPJ, tpAmb: 1, situacao: 'processado', protocolo: '', origem: 'governo', dataFonte: 'recibo',
            eventos: [{ id: ID_F, tipo: 'S-1299', perApur: '2026-09', cdResposta: 201, nrRecibo: REC_F }] });
        expect(seloDoServidor([comoLido(f)], CNPJ, '2026-09')).toBe(true);
        expect(seloDoServidor([comoLido(f)], CNPJ, '2026-08')).toBe(false);
    });

    it('sem o recibo baixado: cdResposta 201 e a data do Id do evento', () => {
        const f = montarFechamentoDoGoverno({ empresa: EMPRESA, perApur: '2026-09', achado: { tipo: 'S-1299', id: ID_F, nrRec: REC_F } });
        expect(f).toMatchObject({ enviadoEm: '2026-10-10T13:30:00.000Z', dados: { cdResposta: 201, dataFonte: 'id-do-evento', eventos: [{ cdResposta: 201 }] } });
    });

    it('não monta sem recibo, de outro ambiente, recusado ou com recibo que não confere', () => {
        const m = (achado: { nrRec: string }, r?: string) => montarFechamentoDoGoverno({ empresa: EMPRESA, perApur: '2026-09', achado: { tipo: 'S-1299', id: ID_F, ...achado }, arquivo: r ? { rec: r } : null });
        expect(m({ nrRec: '' })).toEqual({ motivo: 'sem recibo válido' });
        expect(m({ nrRec: REC_F }, rec(REC_F, { amb: 2 }))).toEqual({ motivo: 'recibo de outro ambiente' });
        expect(m({ nrRec: REC_F }, rec(REC_F, { cd: 401 }))).toMatchObject({ motivo: expect.stringContaining('não aceito') });
        expect(m({ nrRec: REC_F }, rec(REC_R))).toEqual({ motivo: 'o recibo baixado não confere' });
    });
});

describe('S-1299/S-1298 de fora do Consultor: a importação', () => {
    const governo = { 'S-1200': [{ id: 'IDX', nrRec: '1.1.0000000000000000999' }], 'S-1299': [{ id: ID_F, nrRec: REC_F }], 'S-1298': [{ id: ID_R, nrRec: REC_R }] };
    const deps = () => {
        const gravados: FechamentoDoGoverno[] = [];
        return {
            gravados,
            baixar: vi.fn(async (_c: string, ids: string[]) => ({ pedidosHoje: 4, arquivos: ids.map(id => ({ id, cdResposta: 200, descResposta: '', elemento: '', evt: '', rec: rec(id === ID_F ? REC_F : REC_R, { dh: id === ID_F ? '2026-10-10T10:31:12' : '2026-10-11T14:00:30' }) })) })),
            gravar: vi.fn(async (f: FechamentoDoGoverno, _u: unknown) => { gravados.push(f); }),
        };
    };

    it('grava o S-1299 e o S-1298 (só eles), com a data da recepção; o S-1298 posterior derruba o selo', async () => {
        const d = deps();
        const r = await importarFechamentosDoGoverno({ empresa: EMPRESA, perApur: '2026-09', tpAmb: 1, governo, envios: [], usuario }, d);
        expect(d.baixar).toHaveBeenCalledTimes(1);
        expect(d.baixar).toHaveBeenCalledWith(CNPJ, [ID_F, ID_R]);
        expect(r.importados).toEqual([
            { tipo: 'S-1299', nrRecibo: REC_F, enviadoEm: '2026-10-10T13:31:12.000Z' },
            { tipo: 'S-1298', nrRecibo: REC_R, enviadoEm: '2026-10-11T17:00:30.000Z' },
        ]);
        expect(r.pedidosHoje).toBe(4);
        expect(d.gravados.map(f => f.docId)).toEqual([`governo-${REC_F}`, `governo-${REC_R}`]);
        expect(d.gravar.mock.calls[0][1]).toBe(usuario);
        const lidos = d.gravados.map(comoLido);
        expect(seloDoServidor(lidos.slice(0, 1), CNPJ, '2026-09')).toBe(true);
        expect(seloDoServidor(lidos, CNPJ, '2026-09')).toBe(false); // reaberto depois do fechamento
    });

    it('idempotente: não duplica o recibo já registrado (pelo Consultor ou importado antes)', async () => {
        const d = deps();
        const jaImportado = comoLido(montarFechamentoDoGoverno({ empresa: EMPRESA, perApur: '2026-09', achado: { tipo: 'S-1299', id: ID_F, nrRec: REC_F } }) as FechamentoDoGoverno);
        const doConsultor = envio({ eventos: [{ id: 'IDOUTRO', tipo: 'S-1298', perApur: '2026-09', cdResposta: 201, nrRecibo: REC_R }] });
        const r = await importarFechamentosDoGoverno({ empresa: EMPRESA, perApur: '2026-09', tpAmb: 1, governo, envios: [jaImportado, doConsultor], usuario }, d);
        expect(r.importados).toEqual([]);
        expect(d.baixar).not.toHaveBeenCalled();
        expect(d.gravar).not.toHaveBeenCalled();
        // O Id que o próprio Consultor transmitiu (ainda sem recibo) é da conciliação do "sem resposta", não daqui.
        const semResposta = envio({ situacao: 'sem-resposta', protocolo: '', eventos: [{ id: ID_F, tipo: 'S-1299', perApur: '2026-09' }] });
        expect(fechamentosParaImportar(governo, [semResposta], 1)).toEqual([{ tipo: 'S-1298', id: ID_R, nrRec: REC_R }]);
        // O mesmo recibo duas vezes na resposta do governo: um registro.
        expect(fechamentosParaImportar({ 'S-1299': [{ id: ID_F, nrRec: REC_F }, { id: ID_F, nrRec: REC_F }] }, [], 1)).toHaveLength(1);
    });

    it('sem recibo não grava; homologação não grava', async () => {
        const d = deps();
        const r = await importarFechamentosDoGoverno({ empresa: EMPRESA, perApur: '2026-09', tpAmb: 1, governo: { 'S-1299': [{ id: ID_F, nrRec: '' }], 'S-1298': [{ id: ID_R, nrRec: '123' }] }, envios: [], usuario }, d);
        expect(r.importados).toEqual([]);
        expect(d.gravar).not.toHaveBeenCalled();
        const h = await importarFechamentosDoGoverno({ empresa: EMPRESA, perApur: '2026-09', tpAmb: 2, governo, envios: [], usuario }, d);
        expect(h.importados).toEqual([]);
        expect(d.baixar).not.toHaveBeenCalled();
        expect(d.gravar).not.toHaveBeenCalled();
        // Recibo baixado que diz produção restrita também não.
        const d2 = deps();
        d2.baixar.mockResolvedValueOnce({ pedidosHoje: 1, arquivos: [{ id: ID_F, cdResposta: 200, descResposta: '', elemento: '', evt: '', rec: rec(REC_F, { amb: 2 }) }] });
        const r2 = await importarFechamentosDoGoverno({ empresa: EMPRESA, perApur: '2026-09', tpAmb: 1, governo: { 'S-1299': governo['S-1299'] }, envios: [], usuario }, d2);
        expect(r2.importados).toEqual([]);
        expect(r2.ignorados).toEqual([{ nrRecibo: REC_F, motivo: 'recibo de outro ambiente' }]);
    });

    it('download que falha não impede: data do Id do evento, e o motivo volta', async () => {
        const d = deps();
        d.baixar.mockRejectedValueOnce(new Error('cota diária'));
        const r = await importarFechamentosDoGoverno({ empresa: EMPRESA, perApur: '2026-09', tpAmb: 1, governo: { 'S-1299': governo['S-1299'] }, envios: [], usuario }, d);
        expect(r.importados).toEqual([{ tipo: 'S-1299', nrRecibo: REC_F, enviadoEm: '2026-10-10T13:30:00.000Z' }]);
        expect(r.erro).toContain('cota diária');
        expect(d.gravados[0].dados.dataFonte).toBe('id-do-evento');
    });

    it('gravação recusada (regras) vira "não importado", sem derrubar o resto', async () => {
        const d = deps();
        d.gravar.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
        const r = await importarFechamentosDoGoverno({ empresa: EMPRESA, perApur: '2026-09', tpAmb: 1, governo, envios: [], usuario }, d);
        expect(r.importados.map(x => x.tipo)).toEqual(['S-1298']);
        expect(r.ignorados).toEqual([{ nrRecibo: REC_F, motivo: 'não gravado: Missing or insufficient permissions.' }]);
    });
});

describe('os leitores de esocial_envios e o registro do governo', () => {
    const f = montarFechamentoDoGoverno({ empresa: EMPRESA, perApur: '2026-09', achado: { tipo: 'S-1299', id: ID_F, nrRec: REC_F }, arquivo: { rec: rec(REC_F) } }) as FechamentoDoGoverno;
    const gov = comoLido(f);
    const agora = Date.parse('2026-10-13T12:00:00Z');

    it('a fila não o trata como lote: sem consulta, sem alerta, sem reenvio, fora do resumo', () => {
        expect(proximaConsulta(gov)).toBeNull();
        expect(proximaConsulta({ ...gov, situacao: 'enviado', protocolo: 'P' })).toBeNull(); // nem se mudasse
        expect(podeLiberar({ ...gov, situacao: 'sem-resposta' }, agora)).toBe(false);
        expect(alertasDaFila([{ ...gov, situacao: 'sem-resposta' }, { ...gov, situacao: 'recusado' }], agora)).toEqual([]);
        expect(resumoDaFila([gov], agora)).toMatchObject({ eventos: 0, aceitos: 0, porEtapa: { processado: 0 } });
    });

    it('a conciliação o mantém "de outro sistema" e não o acusa de sumir do governo', () => {
        const comGov = conciliar([gov], { 'S-1299': [{ id: ID_F, nrRec: REC_F }] }, '2026-09');
        expect(comGov).toMatchObject({ confirmados: 0, naoEncontrados: [], semRespostaAchados: [], foraDoConsultor: [{ tipo: 'S-1299', id: ID_F, nrRec: REC_F }] });
        expect(conciliar([gov], { 'S-1299': [] }, '2026-09').naoEncontrados).toEqual([]);
    });

    it('o fechamento importado conta: competência fechada no pré-voo e sem a anomalia "sem S-1299"', () => {
        expect(competenciaFechada('2026-09', [gov], 1)).toEqual({ fechada: true, recibo: REC_F });
        const s1200 = envio({ eventos: [{ id: 'ID9', tipo: 'S-1200', perApur: '2026-09', cpf: '52998224725', cdResposta: 201, nrRecibo: '1.1.0000000000000000009' }] });
        const sem = anomaliasDaEmpresa({ competencia: '2026-10', hoje: '2026-10-20', envios: [s1200], folhaGravada: null });
        expect(sem.map(a => a.id)).toContain('sem-fechamento-2026-09');
        const com = anomaliasDaEmpresa({ competencia: '2026-10', hoje: '2026-10-20', envios: [s1200, gov], folhaGravada: null });
        expect(com.map(a => a.id)).not.toContain('sem-fechamento-2026-09');
    });
});
