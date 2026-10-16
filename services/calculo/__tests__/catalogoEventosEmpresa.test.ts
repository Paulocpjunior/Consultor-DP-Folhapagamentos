// Catálogo de eventos da empresa: falha ao ler a tabela dela não vira o catálogo geral em silêncio (Codex #279).
import { describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ falhas: 1 }));
vi.mock('../../folha/folhaFirestoreService', () => ({ getCatalogo: async () => ({ eventos: [{ codigo: '1015', descricao: 'GERAL' }] }) }));
vi.mock('../eventosEmpresaService', () => ({
    lerTabelaEventosEmpresa: async () => {
        if (estado.falhas > 0) { estado.falhas--; throw new Error('sem rede'); }
        return { modo: 'substitui', eventos: [{ codigo: '1015', descricao: 'TRIÊNIO' }] };
    },
}));
import { carregarEventosIob } from '../catalogoEventos';

describe('catálogo da empresa', () => {
    it('falha de leitura rejeita e não fica no cache; a próxima leitura traz a tabela da empresa', async () => {
        await expect(carregarEventosIob('E1')).rejects.toThrow('sem rede');
        await new Promise(r => setTimeout(r, 0));
        expect((await carregarEventosIob('E1')).map(e => e.descricao)).toEqual(['TRIÊNIO']);
        expect((await carregarEventosIob()).map(e => e.descricao)).toEqual(['GERAL']);
    });
});
