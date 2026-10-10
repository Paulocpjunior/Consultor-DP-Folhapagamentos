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
