// Folha e processos gravados em vários lotes (empresas com mais de 450 funcionários): a ordem das escritas e a leitura.
import { afterEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ lotes: [] as string[][], docs: new Map<string, Record<string, unknown>>(), holerites: [] as { id: string; data: Record<string, unknown> }[] }));
vi.mock('firebase/firestore', () => ({
    collection: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
    doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
    getDoc: async (r: { path: string }) => ({ exists: () => fs.docs.has(r.path), data: () => fs.docs.get(r.path) }),
    getDocs: async () => ({ size: fs.holerites.length, docs: fs.holerites.map(h => ({ id: h.id, ref: { path: `h/${h.id}` }, data: () => h.data })) }),
    serverTimestamp: () => 'agora',
    query: () => ({}), where: () => ({}),
    writeBatch: () => { const ops: string[] = []; return { set: (r: { path: string }) => ops.push(`set ${r.path}`), delete: (r: { path: string }) => ops.push(`del ${r.path}`), commit: async () => { fs.lotes.push(ops); } }; },
}));
vi.mock('../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../cadastros/cadastrosService', () => ({ auditar: (b: { set: (r: { path: string }) => void }) => b.set({ path: 'cadastro_audit/x' }), diffObjeto: () => [] }));
import { dividirEmLotes } from '../lotesFirestore';
import { estornarFolha, gravarFolha, lerFolhaGravada } from '../folhaGravadaService';
import { gravarProcesso } from '../processosGravadosService';
import type { ResultadoCalculo } from '../motorMensal';

afterEach(() => { fs.lotes.length = 0; fs.docs.clear(); fs.holerites.length = 0; });
const r = (i: number): ResultadoCalculo => ({ fichaId: `E1_${String(i).padStart(11, '0')}_M`, nome: `F${i}`, competencia: '2026-10', pagamento: '2026-11', situacao: 'calculado',
    verbas: [{ codigo: 'SAL', descricao: 'Salário', referencia: '', tipo: 'provento', valor: 100000, inss: true, fgts: true, irrf: true }],
    bases: { inss: 100000, fgts: 100000, irrf: 100000 }, totais: { proventos: 100000, descontos: 0, liquido: 100000 }, fgts: 8000, memoria: [], avisos: [], erros: [] });
const U = { id: 'u1', email: 'dp@x' };

describe('folha em lotes', () => {
    it('divide as escritas em lotes de até 400', () => {
        expect(dividirEmLotes(Array.from({ length: 1001 }, (_, i) => i)).map(l => l.length)).toEqual([400, 400, 201]);
        expect(dividirEmLotes([])).toEqual([[]]);
    });
    it('grava 1.000 holerites em 3 lotes, com o resumo por último', async () => {
        await gravarFolha('E1', '2026-10', '2026-11', Array.from({ length: 1000 }, (_, i) => r(i)), U, [r(5000).fichaId]);
        expect(fs.lotes.map(l => l.length)).toEqual([400, 400, 202]);
        const ultimo = fs.lotes[2];
        expect(ultimo[ultimo.length - 1]).toBe('set folhas_gravadas/E1_2026-10');
        expect(ultimo).toContain(`del folhas_gravadas/E1_2026-10/holerites/${r(5000).fichaId}`);
        expect(fs.lotes.flat().filter(o => o === 'set folhas_gravadas/E1_2026-10')).toHaveLength(1);
    });
    it('estorna 1.000 holerites: o resumo e a auditoria no primeiro lote', async () => {
        fs.docs.set('folhas_gravadas/E1_2026-10', { totais: {}, pagamento: '2026-11' });
        for (let i = 0; i < 1000; i++) fs.holerites.push({ id: r(i).fichaId, data: {} });
        await estornarFolha('E1', '2026-10', 'teste', U);
        expect(fs.lotes[0].slice(0, 2)).toEqual(['del folhas_gravadas/E1_2026-10', 'set cadastro_audit/x']);
        expect(fs.lotes.flat().filter(o => o.startsWith('del h/'))).toHaveLength(1000);
    });
    it('a leitura usa só os holerites do resumo', async () => {
        fs.docs.set('folhas_gravadas/E1_2026-10', { empresaId: 'E1', competencia: '2026-10', pagamento: '2026-11', fichaIds: [r(2).fichaId, r(1).fichaId], totais: {} });
        for (const i of [1, 2, 3]) fs.holerites.push({ id: r(i).fichaId, data: { resultado: r(i) } });
        expect((await lerFolhaGravada('E1', '2026-10'))!.holerites.map(h => h.nome)).toEqual(['F2', 'F1']);
    });
    it('processos gravados também em lotes, com o resumo por último', async () => {
        await gravarProcesso('E1', 'ferias', '2026-10', Array.from({ length: 500 }, (_, i) => r(i)), U);
        expect(fs.lotes.map(l => l.length)).toEqual([400, 101]);
        expect(fs.lotes[1][100]).toBe('set processos_gravados/E1_ferias_2026-10');
    });
});
