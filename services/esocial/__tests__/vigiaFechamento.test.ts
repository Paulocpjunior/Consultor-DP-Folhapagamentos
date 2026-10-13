import { beforeEach, describe, expect, it, vi } from 'vitest';
import { competenciasDoVigia, diaBrasilia, esquecerReleituras, importarCompetencia, importarFechamentosAutomatico, podeTentar, RESERVA_PEDIDOS_DIA,
    type DepsVigiaFechamento, type MarcaVigia } from '../vigiaFechamento';
import type { FechamentoDoGoverno } from '../fechamentoGoverno';
import type { Envio } from '../transmissaoService';

// Dados fictícios: CNPJ de teste 11.222.333/0001-81.
const EMPRESA = { id: 'E1', cnpj: '11.222.333/0001-81', competencia: '2026-10' };
const ana = { id: 'u1', email: 'ana@x.com' };
const bia = { id: 'u2', email: 'bia@x.com' };
const REC = '1.1.0000000000000000101';
const ID_F = 'ID1112223330001812026101010300000001';
const HORA = 3600_000;
const T0 = Date.parse('2026-10-13T15:00:00Z'); // 12h em Brasília
const espera = () => new Promise(r => setTimeout(r, 5));

/** A marca do Firestore (transação): ler e tomar acontecem juntos, como no runTransaction. */
function ambiente(o: { pedidosHoje?: number; baixarFalha?: boolean; noGoverno?: Record<string, { id: string; nrRec: string }[]> } = {}) {
    const marcas = new Map<string, MarcaVigia & { por: string }>();
    const gravados: FechamentoDoGoverno[] = [];
    const deps = {
        marcas: {
            reivindicar: vi.fn(async (e: string, c: string, u: { id: string }, hoje: string, agora: number) => {
                const k = `${e}_${c}`; const x = marcas.get(k) ?? null;
                if (!podeTentar(x, hoje, agora)) return false;
                marcas.set(k, { dia: hoje, estado: 'rodando', tentativas: (x?.dia === hoje ? x.tentativas : 0) + 1, tentativaEm: agora, por: u.id });
                return true;
            }),
            concluir: vi.fn(async (e: string, c: string, estado: 'feito' | 'falhou' | 'cota') => { const k = `${e}_${c}`; marcas.set(k, { ...marcas.get(k)!, estado }); }),
        },
        consultar: vi.fn(async (p: { tpEvt?: string; perApur?: string; tpAmb?: number }) => {
            await espera();
            return { cdResposta: 201, descResposta: '', qtdeTotal: 0, dhUltimoEvtRetornado: '', pedidosHoje: o.pedidosHoje ?? 2,
                identificadores: p.perApur === '2026-09' ? (o.noGoverno ?? { 'S-1299': [{ id: ID_F, nrRec: REC }] })[p.tpEvt ?? ''] ?? [] : [] };
        }),
        listarEnvios: vi.fn(async () => gravados.map(f => ({ ...(f.dados as unknown as Envio), id: f.docId, enviadoEm: f.enviadoEm, consultadoEm: null }))),
        baixar: vi.fn(async (_c: string, ids: string[]) => {
            await espera();
            if (o.baixarFalha) throw new Error('eSocial fora do ar');
            return { pedidosHoje: 3, arquivos: ids.map(id => ({ id, cdResposta: 200, descResposta: '', elemento: '', evt: '',
                rec: `<retornoEvento><recepcao><tpAmb>1</tpAmb><dhRecepcao>2026-10-10T10:31:12</dhRecepcao></recepcao><processamento><cdResposta>201</cdResposta></processamento><recibo><nrRecibo>${REC}</nrRecibo></recibo></retornoEvento>` })) };
        }),
        gravar: vi.fn(async (f: FechamentoDoGoverno) => { gravados.push(f); }),
    };
    return { marcas, gravados, deps: deps as unknown as DepsVigiaFechamento & typeof deps };
}

beforeEach(() => esquecerReleituras());

describe('vigia: importação automática dos fechamentos de fora do Consultor', () => {
    it('competências: a aberta e a anterior', () => {
        expect(competenciasDoVigia('2026-10')).toEqual(['2026-10', '2026-09']);
        expect(competenciasDoVigia('2027-01')).toEqual(['2027-01', '2026-12']);
        expect(competenciasDoVigia('')).toEqual([]);
        expect(diaBrasilia(Date.parse('2026-10-14T02:00:00Z'))).toBe('2026-10-13'); // 23h em Brasília
    });

    it('importa sozinho o S-1299 da competência anterior, só em produção, e marca o dia como feito', async () => {
        const a = ambiente();
        const r = await importarFechamentosAutomatico(EMPRESA, ana, a.deps, { agora: T0 });
        expect(r.map(x => [x.competencia, x.situacao])).toEqual([['2026-10', 'feito'], ['2026-09', 'feito']]);
        expect(a.deps.consultar).toHaveBeenCalledTimes(4); // S-1299 e S-1298 de cada competência
        expect(a.deps.consultar.mock.calls.every(([p]) => p.tpAmb === 1)).toBe(true);
        expect(a.deps.baixar).toHaveBeenCalledTimes(1); // só onde havia fechamento novo
        expect(a.gravados.map(f => f.docId)).toEqual([`governo-${REC}`]);
        expect(a.gravados[0].dados).toMatchObject({ tpAmb: 1, origem: 'governo', situacao: 'processado', eventos: [{ tipo: 'S-1299', perApur: '2026-09', nrRecibo: REC }] });
        expect(a.marcas.get('E1_2026-09')).toMatchObject({ dia: '2026-10-13', estado: 'feito', tentativas: 1 });
    });

    it('duas abas ou dois usuários no mesmo dia: uma consulta só, um download só', async () => {
        const a = ambiente();
        const comp = { empresa: EMPRESA, competencia: '2026-09', tpAmb: 1 as const, hoje: '2026-10-13', agora: T0 };
        const [x, y] = await Promise.all([importarCompetencia({ ...comp, usuario: ana }, a.deps), importarCompetencia({ ...comp, usuario: bia }, a.deps)]);
        expect([x.situacao, y.situacao].sort()).toEqual(['feito', 'nao-era-hora']);
        expect(a.deps.consultar).toHaveBeenCalledTimes(2);
        expect(a.deps.baixar).toHaveBeenCalledTimes(1);
        expect(a.deps.gravar).toHaveBeenCalledTimes(1);
        // Outra aba mais tarde, no mesmo dia (sem a memória desta aba): nada.
        esquecerReleituras();
        await importarFechamentosAutomatico(EMPRESA, bia, a.deps, { agora: T0 + 5 * HORA });
        expect(a.deps.consultar).toHaveBeenCalledTimes(4); // só a competência aberta, que ainda não tinha marca
        expect(a.deps.baixar).toHaveBeenCalledTimes(1);
        // No dia seguinte consulta de novo, mas o recibo já está gravado: sem download nem gravação.
        esquecerReleituras();
        const r = await importarFechamentosAutomatico(EMPRESA, ana, a.deps, { agora: T0 + 24 * HORA });
        expect(r.map(z => z.situacao)).toEqual(['feito', 'feito']);
        expect(a.deps.baixar).toHaveBeenCalledTimes(1);
        expect(a.deps.gravar).toHaveBeenCalledTimes(1);
    });

    it('a mesma aba não relê a marca a cada rodada do vigia (20 s)', async () => {
        const a = ambiente();
        await importarFechamentosAutomatico(EMPRESA, ana, a.deps, { agora: T0 });
        await importarFechamentosAutomatico(EMPRESA, ana, a.deps, { agora: T0 + 20_000 });
        expect(a.deps.marcas.reivindicar).toHaveBeenCalledTimes(2); // uma por competência, na primeira rodada
    });

    it('homologação não importa nem consulta', async () => {
        const a = ambiente();
        expect(await importarFechamentosAutomatico(EMPRESA, ana, a.deps, { agora: T0, tpAmb: 2 })).toEqual([]);
        expect(await importarCompetencia({ empresa: EMPRESA, competencia: '2026-09', usuario: ana, tpAmb: 2, hoje: '2026-10-13', agora: T0 }, a.deps)).toEqual({ competencia: '2026-09', situacao: 'homologacao' });
        expect(a.deps.marcas.reivindicar).not.toHaveBeenCalled();
        expect(a.deps.consultar).not.toHaveBeenCalled();
        expect(a.deps.gravar).not.toHaveBeenCalled();
    });

    it('falha de download não marca como feito: tenta de novo depois de 1 h', async () => {
        const a = ambiente({ baixarFalha: true });
        const comp = (agora: number) => ({ empresa: EMPRESA, competencia: '2026-09', usuario: ana, tpAmb: 1 as const, hoje: '2026-10-13', agora });
        const r = await importarCompetencia(comp(T0), a.deps);
        expect(r).toMatchObject({ situacao: 'falhou', motivo: expect.stringContaining('eSocial fora do ar') });
        expect(a.marcas.get('E1_2026-09')).toMatchObject({ estado: 'falhou', tentativas: 1 });
        expect((await importarCompetencia(comp(T0 + 10 * 60_000), a.deps)).situacao).toBe('nao-era-hora');
        const de_novo = await importarCompetencia(comp(T0 + HORA), a.deps);
        expect(de_novo.situacao).not.toBe('nao-era-hora');
        expect(a.marcas.get('E1_2026-09')?.tentativas).toBe(2);
    });

    it('consulta que falha também não marca como feito; no máximo 3 tentativas no dia', async () => {
        const a = ambiente();
        a.deps.consultar.mockRejectedValue(new Error('CFI fora do ar'));
        const comp = (agora: number) => ({ empresa: EMPRESA, competencia: '2026-09', usuario: ana, tpAmb: 1 as const, hoje: '2026-10-13', agora });
        for (const h of [0, 1, 2]) expect((await importarCompetencia(comp(T0 + h * HORA), a.deps)).situacao).toBe('falhou');
        expect((await importarCompetencia(comp(T0 + 4 * HORA), a.deps)).situacao).toBe('nao-era-hora');
        expect(a.deps.gravar).not.toHaveBeenCalled();
    });

    it('respeita a cota diária: com a reserva gasta, não baixa nem grava e só volta amanhã', async () => {
        const a = ambiente({ pedidosHoje: RESERVA_PEDIDOS_DIA });
        const r = await importarFechamentosAutomatico(EMPRESA, ana, a.deps, { agora: T0 });
        expect(r).toEqual([expect.objectContaining({ competencia: '2026-10', situacao: 'cota' })]); // a anterior fica para amanhã
        expect(a.deps.consultar).toHaveBeenCalledTimes(1);
        expect(a.deps.baixar).not.toHaveBeenCalled();
        expect(a.deps.gravar).not.toHaveBeenCalled();
        esquecerReleituras();
        expect((await importarCompetencia({ empresa: EMPRESA, competencia: '2026-10', usuario: bia, tpAmb: 1, hoje: '2026-10-13', agora: T0 + 3 * HORA }, a.deps)).situacao).toBe('nao-era-hora');
    });

    it('"rodando" abandonado (aba fechada no meio) pode ser assumido depois de 10 min', () => {
        const m: MarcaVigia = { dia: '2026-10-13', estado: 'rodando', tentativas: 1, tentativaEm: T0 };
        expect(podeTentar(m, '2026-10-13', T0 + 5 * 60_000)).toBe(false);
        expect(podeTentar(m, '2026-10-13', T0 + 11 * 60_000)).toBe(true);
        expect(podeTentar({ ...m, estado: 'feito' }, '2026-10-13', T0 + 10 * HORA)).toBe(false);
        expect(podeTentar({ ...m, estado: 'feito' }, '2026-10-14', T0 + 10 * HORA)).toBe(true);
        expect(podeTentar(null, '2026-10-13', T0)).toBe(true);
    });
});
