/**
 * As empresas do DP conferidas contra o cadastro central do CFI (08/08).
 * O que acende e o que NÃO acende — alarme sem ação ensina a ignorar alarme.
 */
import { describe, it, expect } from 'vitest';
import { conferirEmpresas, buscarCadastroCentral } from '../cadastroCentralConferencia';

const central = [
    { cnpj: '51227692000146', nome: 'CLINIPAR SERVICOS MEDICOS LTDA' },
    { cnpj: '44388152000189', nome: 'SP ASSESSORIA CONTABIL' },
];

describe('a régua', () => {
    it('CNPJ que o central não conhece acende, com o nome daqui junto', () => {
        const r = conferirEmpresas([{ cnpj: '11.111.111/0001-91', razaoSocial: 'EMPRESA MISTERIO' }], central);
        expect(r.foraDoCadastro).toEqual([{ cnpj: '11111111000191', nome: 'EMPRESA MISTERIO' }]);
    });

    it('CNPJ com máscara casa; nome divergente vira info lado a lado', () => {
        const r = conferirEmpresas([{ cnpj: '51.227.692/0001-46', razaoSocial: 'PADARIA DO ZE' }], central);
        expect(r.conferidas).toBe(1);
        expect(r.foraDoCadastro).toHaveLength(0);
        expect(r.nomesDivergentes[0].nomeCentral).toMatch(/CLINIPAR/);
    });

    it('variação de sufixo não é divergência', () => {
        const r = conferirEmpresas([{ cnpj: '51227692000146', razaoSocial: 'CLINIPAR SERVICOS' }], central);
        expect(r.nomesDivergentes).toHaveLength(0);
    });

    it('sem CNPJ é contado, não alarmado', () => {
        const r = conferirEmpresas([{ razaoSocial: 'X' }], central);
        expect(r.semCnpj).toBe(1);
        expect(r.foraDoCadastro).toHaveLength(0);
    });
});

describe('o túnel nunca vira alarme falso', () => {
    it('falha de rede devolve null — a tela simplesmente não mostra o bloco', async () => {
        const r = await buscarCadastroCentral(async () => 'tok', {
            fetchImpl: (async () => { throw new Error('CORS'); }) as any,
        });
        expect(r).toBeNull();
    });

    it('resposta boa vira a lista mínima {cnpj, nome}', async () => {
        const r = await buscarCadastroCentral(async () => 'tok', {
            fetchImpl: (async () => ({
                ok: true, status: 200,
                json: async () => ({ ok: true, empresas: [{ cnpj: '51227692000146', nome: 'CLINIPAR', raiz: '51227692', extra: 'x' }] }),
            })) as any,
        });
        expect(r).toEqual([{ cnpj: '51227692000146', nome: 'CLINIPAR' }]);
    });

    it('recusa do CFI (403) também devolve null, não lista vazia', async () => {
        // Lista vazia seria lida como "nenhuma empresa no central" — mentira.
        const r = await buscarCadastroCentral(async () => 'tok', {
            fetchImpl: (async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: 'x' }) })) as any,
        });
        expect(r).toBeNull();
    });
});
