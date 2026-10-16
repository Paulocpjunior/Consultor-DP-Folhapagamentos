// Empresa com CNPJ alfanumérico (IN RFB 2.229/2024): grava com as letras em maiúsculas, reserva a chave única
// com elas e confere a duplicidade sem perdê-las. Dados fictícios.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ sets: [] as { ref: { path: string }; dados: Record<string, unknown> }[], updates: [] as Record<string, unknown>[], chaves: new Map<string, string>(), visiveis: [] as Record<string, unknown>[] }));
vi.mock('../../firebaseConfig', () => ({ default: {}, db: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'u1' } }) }));
vi.mock('../../carteira/carteiraService', () => ({
    escopoAtual: async () => ({ todas: false, empresaIds: fs.visiveis.map(e => e.id) }),
    esquecerEscopo: () => undefined,
    lerEmpresasPorId: async () => fs.visiveis.map(e => ({ id: e.id, data: () => e })),
}));
vi.mock('firebase/firestore', () => ({
    collection: () => ({ path: 'empresas' }),
    doc: (_db: unknown, col?: string, id?: string) => ({ path: col ? `${col}/${id}` : 'empresas/nova', id: id ?? 'nova' }),
    getDoc: async (ref: { path: string; id: string }) => {
        const empresa = ref.path.startsWith('empresas/') ? fs.visiveis.find(e => e.id === ref.id) : undefined;
        if (empresa) return { id: ref.id, exists: () => true, data: () => empresa };
        const chave = ref.path.replace('empresas_unicos/', '');
        const dono = fs.chaves.get(chave);
        return dono ? { exists: () => true, data: () => ({ chave, empresaId: dono }) } : { exists: () => false, data: () => undefined };
    },
    getDocs: async () => ({ docs: [] }), query: () => ({}), where: () => ({}), orderBy: () => ({}),
    serverTimestamp: () => 'agora', setDoc: async () => undefined, updateDoc: async () => undefined, deleteField: () => undefined, runTransaction: async () => undefined,
    writeBatch: () => ({
        set: (ref: { path: string }, dados: Record<string, unknown>) => fs.sets.push({ ref, dados }),
        update: (_ref: unknown, dados: Record<string, unknown>) => fs.updates.push(dados),
        delete: () => undefined,
        commit: async () => undefined,
    }),
}));
import { atualizarEmpresa, criarEmpresa } from '../empresasService';

const entrada = { razaoSocial: 'NOVA LTDA', nomeFantasia: 'NOVA', codigoSage: '1300', uf: 'SP', municipio: '', sindicatos: [] };

beforeEach(() => { fs.sets = []; fs.updates = []; fs.chaves = new Map(); fs.visiveis = []; });

describe('cadastro de empresa com CNPJ alfanumérico', () => {
    it('grava o CNPJ com as letras, em maiúsculas e sem pontuação, e reserva a chave com elas', async () => {
        await criarEmpresa('u1', { ...entrada, cnpj: '12.abc.345/01de-35' });
        const empresa = fs.sets.find(s => s.ref.path === 'empresas/nova')!;
        expect(empresa.dados.cnpj).toBe('12ABC34501DE35');
        expect(fs.sets.map(s => s.ref.path)).toEqual(['empresas/nova', 'empresas_unicos/sage_1300', 'empresas_unicos/cnpj_12ABC34501DE35']);
    });
    it('o numérico continua só com os dígitos', async () => {
        await criarEmpresa('u1', { ...entrada, cnpj: '11.222.333/0001-81' });
        expect(fs.sets[0].dados.cnpj).toBe('11222333000181');
        expect(fs.sets[2].ref.path).toBe('empresas_unicos/cnpj_11222333000181');
    });
    it('recusa o CNPJ já cadastrado: pela chave reservada e pela lista visível, digitado em minúsculas ou com máscara', async () => {
        fs.chaves.set('cnpj_12ABC34501DE35', 'outra');
        await expect(criarEmpresa('u1', { ...entrada, cnpj: '12abc34501de35' })).rejects.toThrow('O CNPJ 12ABC34501DE35 já está cadastrado');
        fs.chaves = new Map();
        fs.visiveis = [{ id: 'e1', cnpj: '12ABC34501DE35', codigoSage: '0001', nomeFantasia: 'JÁ EXISTE', razaoSocial: 'JA' }];
        await expect(criarEmpresa('u1', { ...entrada, cnpj: '12.ABC.345/01DE-35' })).rejects.toThrow('pela empresa "JÁ EXISTE"');
        expect(fs.sets).toEqual([]);
    });
    it('outro alfanumérico de mesma raiz numérica não conflita (as letras contam)', async () => {
        fs.visiveis = [{ id: 'e1', cnpj: 'A1B2C3D4000193', codigoSage: '0001', nomeFantasia: 'A', razaoSocial: 'A' }];
        await criarEmpresa('u1', { ...entrada, cnpj: '12ABC34501DE35' });
        expect(fs.sets[0].dados.cnpj).toBe('12ABC34501DE35');
    });
    it('a edição também preserva as letras', async () => {
        fs.visiveis = [{ id: 'e1', cnpj: '11222333000181', codigoSage: '1300', nomeFantasia: 'NOVA', razaoSocial: 'NOVA LTDA', criadoPor: 'u1' }];
        fs.chaves.set('cnpj_11222333000181', 'e1');
        await atualizarEmpresa('e1', { cnpj: '12.abc.345/01de-35' });
        expect(fs.updates[0].cnpj).toBe('12ABC34501DE35');
        expect(fs.sets.map(s => s.ref.path)).toEqual(['empresas_unicos/cnpj_12ABC34501DE35']);
    });
});
