import { describe, expect, it } from 'vitest';
import { anomaliasDaEmpresa, conciliar, ocorrenciasFrequentes, prazoPeriodicos } from '../anomalias';
import type { Envio, EventoEnviado } from '../transmissaoService';

const env = (o: Partial<Envio> & { eventos: EventoEnviado[] }): Envio => ({
    id: 'e', empresaId: 'E1', cnpj: '29463877000109', tpAmb: 1, grupo: 3, protocolo: '1.2', dhRecepcao: '', transmissor: '', certificado: 'escritorio', situacao: 'processado',
    cdResposta: 201, descResposta: '', ocorrencias: [], enviadoPorEmail: 'x', enviadoEm: '2026-10-05T10:00:00.000Z', consultadoEm: null, ...o,
});
const ok = (id: string, tipo: string, perApur: string, cpf?: string, rec = `1.1.${id}`): EventoEnviado => ({ id, tipo, perApur, cpf, cdResposta: 201, nrRecibo: rec });
const pend = (id: string, tipo: string, perApur: string, cpf?: string): EventoEnviado => ({ id, tipo, perApur, cpf });

describe('conciliação com o eSocial', () => {
    it('confirma, acha recibo do sem-resposta, aponta ausente e o que veio de fora', () => {
        const envios = [
            env({ id: 'A', eventos: [ok('ID1', 'S-1200', '2026-09', '1'), ok('ID2', 'S-1200', '2026-09', '2')] }),
            env({ id: 'B', situacao: 'sem-resposta', protocolo: '', eventos: [pend('ID3', 'S-1210', '2026-09', '1')] }),
            env({ id: 'C', tpAmb: 2, eventos: [ok('ID9', 'S-1200', '2026-09', '1')] }),
        ];
        const c = conciliar(envios, { 'S-1200': [{ id: 'ID1', nrRec: '1.1.ID1' }, { id: 'IDX', nrRec: '1.1.X' }], 'S-1210': [{ id: 'ID3', nrRec: '1.1.33' }], 'S-1299': [], 'S-1298': [] }, '2026-09');
        expect(c.confirmados).toBe(1);
        expect(c.semRespostaAchados).toEqual([{ envio: envios[1], achados: { ID3: '1.1.33' } }]);
        expect(c.naoEncontrados.map(x => x.evento.id)).toEqual(['ID2']);
        expect(c.foraDoConsultor).toEqual([{ tipo: 'S-1200', id: 'IDX', nrRec: '1.1.X' }]);
    });
});

describe('anomalias', () => {
    const folha = [{ cpf: '1', nome: 'ANA' }, { cpf: '2', nome: 'BRUNO' }];
    it('folha gravada sem S-1200 aceito: atenção no prazo, crítico depois', () => {
        const envios = [env({ eventos: [ok('ID1', 'S-1200', '2026-09', '1')] })];
        const a = anomaliasDaEmpresa({ competencia: '2026-09', hoje: '2026-10-10', envios, folhaGravada: folha });
        expect(a[0]).toMatchObject({ gravidade: 'atencao', acao: 'conciliar', titulo: '1 trabalhador(es) da folha de 09/2026 sem S-1200 aceito' });
        expect(a[0].detalhe).toContain('BRUNO');
        expect(anomaliasDaEmpresa({ competencia: '2026-09', hoje: '2026-10-16', envios, folhaGravada: folha })[0].gravidade).toBe('critico');
        // Pendente de resultado não conta como faltando.
        expect(anomaliasDaEmpresa({ competencia: '2026-09', hoje: '2026-10-10', envios: [...envios, env({ situacao: 'enviado', eventos: [pend('ID2', 'S-1200', '2026-09', '2')] })], folhaGravada: folha })).toEqual([]);
    });
    it('competência sem S-1299 depois do prazo', () => {
        const envios = [env({ eventos: [ok('ID1', 'S-1200', '2026-08', '1')] })];
        expect(anomaliasDaEmpresa({ competencia: '2026-10', hoje: '2026-09-15', envios, folhaGravada: [] })).toEqual([]);
        const a = anomaliasDaEmpresa({ competencia: '2026-10', hoje: '2026-09-16', envios, folhaGravada: [] });
        expect(a).toEqual([expect.objectContaining({ id: 'sem-fechamento-2026-08', gravidade: 'critico', acao: 'fechamento' })]);
        expect(anomaliasDaEmpresa({ competencia: '2026-10', hoje: '2026-09-16', envios: [...envios, env({ id: 'F', eventos: [ok('ID5', 'S-1299', '2026-08')] })], folhaGravada: [] })).toEqual([]);
    });
    it('fechamento com a régua do servidor: sem S-1299, reaberto pelo S-1298 e fechado de novo', () => {
        const folha = env({ id: 'A', eventos: [ok('ID1', 'S-1200', '2026-08', '52998224725')] });
        const s1299 = (id: string, em: string, extra: Partial<Envio> = {}) => env({ id, enviadoEm: em, eventos: [ok(id, 'S-1299', '2026-08', undefined, `1.1.000000000000000${id.slice(-4)}`)], ...extra });
        const s1298 = (id: string, em: string, extra: Partial<Envio> = {}, ev: Partial<EventoEnviado> = {}) => env({ id, enviadoEm: em, eventos: [{ ...ok(id, 'S-1298', '2026-08', undefined, `1.1.000000000000000${id.slice(-4)}`), ...ev }], ...extra });
        const ids = (envios: Envio[], hoje = '2026-09-20') => anomaliasDaEmpresa({ competencia: '2026-10', hoje, envios, folhaGravada: [] }).map(a => `${a.id}:${a.gravidade}`);
        // 1) Sem S-1299 aceito depois do prazo.
        expect(ids([folha])).toEqual(['sem-fechamento-2026-08:critico']);
        // 2) S-1299 aceito e depois um S-1298 (aceito ou ainda sem resposta): reaberta, falta novo S-1299.
        const fechou = s1299('F0001', '2026-09-10T10:00:00.000Z');
        const reabriu = s1298('R0002', '2026-09-12T10:00:00.000Z');
        expect(ids([folha, fechou, reabriu])).toEqual(['fechamento-reaberto-2026-08:critico']);
        expect(ids([folha, fechou, reabriu], '2026-09-13')).toEqual(['fechamento-reaberto-2026-08:atencao']); // antes do prazo
        const a = anomaliasDaEmpresa({ competencia: '2026-10', hoje: '2026-09-20', envios: [folha, fechou, reabriu], folhaGravada: [] })[0];
        expect(a).toMatchObject({ acao: 'fechamento', titulo: 'Fechamento de 08/2026 reaberto (S-1298): falta novo S-1299' });
        expect(a.detalhe).toContain('recibo 1.1.0000000000000000001');
        expect(ids([folha, fechou, s1298('R0003', '2026-09-12T10:00:00.000Z', { situacao: 'enviado' }, { cdResposta: null, nrRecibo: undefined })])).toEqual(['fechamento-reaberto-2026-08:critico']);
        // S-1298 recusado não reabre; S-1298 anterior ao S-1299 também não.
        expect(ids([folha, fechou, s1298('R0004', '2026-09-12T10:00:00.000Z', {}, { cdResposta: 401, nrRecibo: undefined })])).toEqual([]);
        expect(ids([folha, s1298('R0005', '2026-09-01T10:00:00.000Z'), fechou])).toEqual([]);
        // 3) S-1299 de novo depois do S-1298: fechada.
        expect(ids([folha, fechou, reabriu, s1299('F0006', '2026-09-14T10:00:00.000Z')])).toEqual([]);
        // O importado do governo (origem 'governo') conta igual.
        expect(ids([folha, fechou, s1298('R0007', '2026-09-12T10:00:00.000Z', { origem: 'governo', protocolo: '' })])).toEqual(['fechamento-reaberto-2026-08:critico']);
    });
    it('recusa repetida, certificado e conciliação', () => {
        const rec = (id: string) => env({ id, situacao: 'processado', eventos: [{ ...pend(id, 'S-1210', '2026-09', '1'), cdResposta: 401, descResposta: 'erro', ocorrencias: [{ tipo: 1, codigo: '1801', descricao: 'Demonstrativo não encontrado', localizacao: '' }] }] });
        const envios = [rec('R1'), rec('R2')];
        const a = anomaliasDaEmpresa({ competencia: '2026-09', hoje: '2026-10-10', envios, folhaGravada: null, certificadoDias: 10 });
        expect(a.map(x => x.id)).toEqual(['certificado-vencendo', 'recusa-repetida-S-1210|1|2026-09']);
        expect(ocorrenciasFrequentes(envios, '2026-10-10')).toEqual([{ codigo: '1801', descricao: 'Demonstrativo não encontrado', vezes: 2, tipos: ['S-1210'] }]);
        const c = conciliar([env({ id: 'B', situacao: 'sem-resposta', eventos: [pend('ID3', 'S-1210', '2026-09')] })], { 'S-1210': [{ id: 'ID3', nrRec: '9' }] }, '2026-09');
        const b = anomaliasDaEmpresa({ competencia: '2026-09', hoje: '2026-10-10', envios: [], folhaGravada: null, conciliacao: c });
        expect(b[0]).toMatchObject({ acao: 'resolver-sem-resposta', titulo: '1 evento(s) "sem resposta" estão no eSocial' });
    });
    it('prazo dos periódicos', () => {
        expect(prazoPeriodicos('2026-12')).toBe('2027-01-15');
    });
});
