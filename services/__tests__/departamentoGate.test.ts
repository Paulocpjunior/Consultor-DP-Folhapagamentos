/**
 * O GATE DE DEPARTAMENTO NASCE EM MODO AVISO — e a razão é uma data (08/08):
 * no dia em que subiu, ninguém tinha departamento preenchido no cadastro
 * central do CFI. Bloquear já trancaria a equipe com o cadastro certo e o
 * vínculo apenas pendente.
 *
 * A tabela de verdade é a MESMA dos gates do Contábil e da Legalização —
 * mudar um sem os outros faria os módulos responderem coisas diferentes à
 * mesma pessoa.
 */
import { describe, it, expect } from 'vitest';
import { decidirGate, modoAtual, consultarGateDepartamento } from '../departamentoGate';

describe('modo por env, default aviso', () => {
    it('sem env nasce em aviso; valor torto não vira bloqueio por acidente', () => {
        expect(modoAtual({})).toBe('aviso');
        expect(modoAtual({ VITE_DEPARTAMENTO_GATE_MODO: 'bloqueio' })).toBe('bloqueio');
        expect(modoAtual({ VITE_DEPARTAMENTO_GATE_MODO: 'sim' })).toBe('aviso');
    });
});

describe('a tabela de verdade', () => {
    it('com vínculo passa limpo nos dois modos', () => {
        for (const modo of ['aviso', 'bloqueio'] as const) {
            const d = decidirGate({ acesso: { temAcesso: true, motivo: 'Vinculado.' }, modo });
            expect(d.permitido).toBe(true);
            expect(d.aviso).toBeNull();
        }
    });

    it('sem vínculo em AVISO: faixa com a ação, trabalho segue', () => {
        const d = decidirGate({
            acesso: { temAcesso: false, motivo: 'Ana está SEM departamento. Peça ao admin…' }, modo: 'aviso',
        });
        expect(d.permitido).toBe(true);
        expect(d.aviso).toMatch(/SEM departamento/);
        expect(d.aviso).toMatch(/acesso continua liberado/);
    });

    it('sem vínculo em BLOQUEIO: tranca com o motivo do cadastro central', () => {
        const d = decidirGate({
            acesso: { temAcesso: false, motivo: 'Ana pertence a Consultor Contábil.' }, modo: 'bloqueio',
        });
        expect(d.permitido).toBe(false);
        expect(d.motivo).toMatch(/Consultor Contábil/);
    });

    it('indeterminado LIBERA nos dois modos — trancar o escritório porque o túnel piscou é o dano maior', () => {
        for (const modo of ['aviso', 'bloqueio'] as const) {
            const d = decidirGate({ erro: new Error('CORS'), modo });
            expect(d.permitido).toBe(true);
            expect(d.indeterminado).toBe(true);
            expect(d.aviso).toBeNull();
        }
    });
});

describe('a consulta ao túnel', () => {
    const fetchDe = (status: number, corpo: unknown) =>
        (async () => ({ ok: status === 200, status, json: async () => corpo })) as unknown as typeof fetch;

    it('monta a URL do cadastro central com e-mail minúsculo e o módulo dp-folha', async () => {
        let urlChamada = '';
        const espiao = (async (url: string) => {
            urlChamada = url;
            return { ok: true, status: 200, json: async () => ({ ok: true, temAcesso: true, motivo: 'x' }) };
        }) as unknown as typeof fetch;
        await consultarGateDepartamento('Ana@SP.com', async () => 'tok', { fetchImpl: espiao, env: {} });
        expect(urlChamada).toContain('/api/admin/cadastro/usuarios/ana%40sp.com');
        expect(urlChamada).toContain('modulo=dp-folha');
    });

    it('403 do CFI (e-mail não verificado lá) é INDETERMINADO, não "sem vínculo"', async () => {
        // Afirmar a coisa errada mandaria a pessoa atrás do admin por um
        // problema que é de verificação de e-mail.
        const g = await consultarGateDepartamento('a@b.com', async () => 'tok', {
            fetchImpl: fetchDe(403, { ok: false, error: 'Email não verificado' }), env: {},
        });
        expect(g.permitido).toBe(true);
        expect(g.indeterminado).toBe(true);
    });

    it('resposta boa do túnel flui para a decisão', async () => {
        const g = await consultarGateDepartamento('a@b.com', async () => 'tok', {
            fetchImpl: fetchDe(200, { ok: true, temAcesso: false, motivo: 'SEM departamento.' }), env: {},
        });
        expect(g.permitido).toBe(true);
        expect(g.aviso).toMatch(/SEM departamento/);
    });

    it('nunca lança: até getToken falhando vira indeterminado', async () => {
        const g = await consultarGateDepartamento('a@b.com', async () => { throw new Error('sem sessão'); }, {
            fetchImpl: fetchDe(200, {}), env: {},
        });
        expect(g.permitido).toBe(true);
        expect(g.indeterminado).toBe(true);
    });
});
