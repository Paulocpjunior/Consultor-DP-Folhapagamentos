// Auditoria de banco e telas (10/2026): código do banco com zero à esquerda, remessa repetida, guias das férias,
// histórico dos benefícios e gravação do movimento com outra gravação no meio (dados fictícios).
import { describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ docs: [] as { id: string; data: () => unknown }[], sets: [] as unknown[], commits: 0 }));
vi.mock('../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    collection: (..._a: unknown[]) => ({}), doc: (..._a: unknown[]) => ({ id: 'x' }), where: () => ({}), query: () => ({}), serverTimestamp: () => 'agora',
    getDocs: async () => ({ docs: fs.docs }), getDoc: async () => ({}), runTransaction: async () => undefined,
    writeBatch: () => ({ set: (_r: unknown, d: unknown) => fs.sets.push(d), commit: async () => { fs.commits++; } }),
}));
import { chaveRemessa, classificar, type Favorecido } from '../cnab240';
import { resumirFolha } from '../../relatorios/resumoFolha';
import { comHistorico, edicaoRetroativa, type Beneficio } from '../../calculo/beneficios';
import { salvarMovimentos } from '../../calculo/movimentosService';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

const fav = (m: Partial<Favorecido> = {}): Favorecido => ({ ref: 'f1', nome: 'ANA', cpf: '52998224725', banco: '0341', agencia: '1234', conta: '55555-0', tipoConta: 'corrente', pix: '', valor: 100000, dataPagamento: '2026-11-06', ...m });

describe('banco', () => {
    it('"0341" do cadastro é o Itaú 341 (antes virava "034" e ia como TED)', () => {
        expect(classificar(fav(), { banco: '341' }, false).forma).toBe('conta');
        expect(classificar(fav({ banco: '033' }), { banco: '341' }, false).forma).toBe('ted');
    });

    it('a mesma folha com os mesmos pagamentos dá a mesma chave; outro valor ou outra folha, não', () => {
        const r = (v: number) => ({ incluidos: [{ favorecido: fav({ valor: v }), forma: 'conta' as const }, { favorecido: fav({ cpf: '39053344705', valor: 5 }), forma: 'conta' as const }] });
        expect(chaveRemessa('Folha mensal 10/2026', r(100))).toBe(chaveRemessa('Folha mensal 10/2026', { incluidos: [...r(100).incluidos].reverse() }));
        expect(chaveRemessa('Folha mensal 10/2026', r(100))).not.toBe(chaveRemessa('Folha mensal 10/2026', r(101)));
        expect(chaveRemessa('Folha mensal 10/2026', r(100))).not.toBe(chaveRemessa('Adiantamento salarial 10/2026', r(100)));
    });
});

describe('guias da folha do gozo', () => {
    it('o IRRF retido no recibo de férias não entra de novo no DARF da folha; o INSS das férias é da folha do gozo', () => {
        const verba = (codigo: string, valor: number) => ({ codigo, descricao: codigo, referencia: '', tipo: 'desconto' as const, valor, inss: false, fgts: false, irrf: false });
        const folha = { fichaId: 'f1', nome: 'ANA', situacao: 'calculado', verbas: [verba('INSS', 1000), verba('IRRF', 500), verba('INSSFERRET', 300), verba('IRRFFERRET', 200)],
            bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0 } as unknown as ResultadoCalculo;
        const recibo = { ...folha, fichaId: 'f1', verbas: [verba('INSSFER', 300), verba('IRRFFER', 200)] } as unknown as ResultadoCalculo;
        expect(resumirFolha([folha]).encargos).toMatchObject({ inssSegurados: 1300, irrf: 500 });
        expect(resumirFolha([recibo]).encargos).toMatchObject({ inssSegurados: 0, irrf: 200 });
    });
});

describe('benefícios', () => {
    const B: Beneficio = { id: 'b', nome: 'Odonto', tipo: 'desconto', valor: 10000, inss: false, fgts: false, irrf: false, ativo: true };
    it('mudar numa competência anterior a outra mudança é recusado (reescreveria os meses seguintes)', () => {
        const julho = comHistorico([B], [{ ...B, valor: 15000 }], '2026-07');
        expect(edicaoRetroativa(julho, [{ ...julho[0], valor: 12000 }], '2026-03')).toEqual([expect.stringMatching(/Odonto: já há mudança valendo a partir de 07\/2026/)]);
        expect(edicaoRetroativa(julho, [{ ...julho[0], valor: 12000 }], '2026-07')).toEqual([]);
        expect(edicaoRetroativa(julho, [{ ...julho[0], valor: 12000 }], '2026-10')).toEqual([]);
        expect(edicaoRetroativa(julho, [{ ...julho[0], nome: 'Odonto plus' }], '2026-03')).toEqual([]);
    });
});

describe('gravação do movimento', () => {
    const u = { id: 'u1', email: 'dp@x' };
    it('outra gravação depois da leitura da tela: nada é gravado', async () => {
        fs.docs = [{ id: 'f1_2026-09', data: () => ({ empresaId: 'E1', fichaId: 'f1', competencia: '2026-09', movimento: { horasExtras50: 5 }, atualizadoPorEmail: 'bia@x' }) }];
        fs.sets = []; fs.commits = 0;
        await expect(salvarMovimentos('E1', '2026-09', [{ fichaId: 'f1', antes: { horasExtras50: 2 }, depois: { horasExtras50: 3 } }], u)).rejects.toThrow(/alterado por outra gravação \(bia@x\)/);
        // Lido vazio, mas outro já gravou: também recusa.
        await expect(salvarMovimentos('E1', '2026-09', [{ fichaId: 'f1', antes: null, depois: { horasExtras50: 3 } }], u)).rejects.toThrow(/outra gravação/);
        expect(fs.commits).toBe(0);
        await salvarMovimentos('E1', '2026-09', [{ fichaId: 'f1', antes: { horasExtras50: 5 }, depois: { horasExtras50: 3 } }], u);
        expect(fs.commits).toBe(1);
    });
});
