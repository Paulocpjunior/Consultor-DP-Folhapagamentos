import { describe, expect, it, vi } from 'vitest';
import { buscarCofre, cofreDaCarteira, contagemCofre, filtrarCofre, precisaAtencao, type LinhaCofre } from '../cofreCertificados';

const meta = (dias: number | null) => ({ cnpj: null, tipo: 'A1', titular: 'X', emissor: 'AC', validoAte: '2027-01-01', diasParaVencer: dias, faixaAlerta: dias !== null && dias <= 30 ? String(dias) : null });
const linha = (cnpj: string, over: Partial<LinhaCofre> = {}): LinhaCofre => ({ cnpj, nome: cnpj, apto: true, situacao: 'apto-proprio', motivo: '', acao: null, certificado: meta(200), certificadoDaRaiz: null, ...over });
const L = [
    linha('11222333000181'),
    linha('11444777000161', { certificado: meta(10) }),
    linha('33000167000101', { apto: false, situacao: 'vencido', certificado: meta(-3) }),
    linha('51227692000146', { apto: false, situacao: 'sem-certificado', certificado: null }),
    linha('60746948000112', { divergenciaLegal: 'renovado-sem-upload' }),
    linha('07526557000100', { situacao: 'apto-pela-raiz', certificado: null, certificadoDaRaiz: meta(25) }),
];

describe('cofre de certificados no DP', () => {
    it('carteira: só os CNPJs visíveis; o que o CFI não conhece vem à parte; gestor vê todos', () => {
        const r = cofreDaCarteira(L, ['11.222.333/0001-81', '33000167000101', '99999999000191']);
        expect(r.linhas.map(l => l.cnpj)).toEqual(['33000167000101', '11222333000181']);
        expect(r.foraDoCfi).toEqual(['99999999000191']);
        expect(cofreDaCarteira(L, null).linhas).toHaveLength(6);
    });

    it('atenção: vencido, vencendo em 30 dias (inclusive pela matriz), sem certificado e renovado sem upload', () => {
        expect(L.filter(precisaAtencao).map(l => l.cnpj)).toEqual(['11444777000161', '33000167000101', '51227692000146', '60746948000112', '07526557000100']);
        expect(filtrarCofre(L, 'vencendo').map(l => l.cnpj)).toEqual(['11444777000161', '07526557000100']);
        expect(filtrarCofre(L, 'renovados-sem-upload').map(l => l.cnpj)).toEqual(['60746948000112']);
        expect(contagemCofre(L)).toEqual({ total: 6, aptas: 4, vencendo: 2, vencidos: 1, sem: 1, renovadosSemUpload: 1 });
    });

    it('ordena quem pede atenção primeiro e quem vence antes', () => {
        expect(cofreDaCarteira(L, null).linhas.map(l => l.cnpj).slice(0, 3)).toEqual(['51227692000146', '33000167000101', '11444777000161']);
    });

    it('túnel: manda o token e devolve linhas e avisos; erros viram mensagem clara', async () => {
        const ok = vi.fn(async () => new Response(JSON.stringify({ ok: true, linhas: [L[0]], avisos: ['só metadado'] }), { status: 200 }));
        const r = await buscarCofre(async () => 'tok', { fetchImpl: ok as never });
        expect(r).toEqual({ linhas: [L[0]], avisos: ['só metadado'] });
        expect((ok.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({ Authorization: 'Bearer tok' });
        await expect(buscarCofre(async () => 't', { fetchImpl: (async () => new Response('{}', { status: 403 })) as never })).rejects.toThrow(/recusou o acesso/);
        await expect(buscarCofre(async () => 't', { fetchImpl: (async () => { throw new TypeError('rede'); }) as never })).rejects.toThrow(/Não foi possível falar com o cofre/);
        await expect(buscarCofre(async () => 't', { fetchImpl: (async () => new Response(JSON.stringify({ ok: false, error: 'falhou' }), { status: 500 })) as never })).rejects.toThrow('Cofre de certificados: falhou');
    });
});
