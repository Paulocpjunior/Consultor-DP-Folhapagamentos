import { describe, expect, it } from 'vitest';
import { afastamentoVazio, mesclarAfastamentos, validarAfastamento, type Afastamento } from '../afastamentos';

const af = (a: Partial<Afastamento>): Afastamento => ({ ...afastamentoVazio(), id: 'f1_2025-07-01', fichaId: 'f1', dtInicio: '2025-07-01', dtFim: '2025-07-20', motivo: '15', ...a });

describe('abono pecuniário no afastamento de férias', () => {
    it('valida de 1 a 10 dias, só no motivo 15', () => {
        expect(validarAfastamento(af({ abonoDias: '10' }), undefined, []).erros).not.toContain('Abono pecuniário: de 1 a 10 dias (até 1/3 das férias, CLT art. 143).');
        expect(validarAfastamento(af({ abonoDias: '11' }), undefined, []).erros).toContain('Abono pecuniário: de 1 a 10 dias (até 1/3 das férias, CLT art. 143).');
        expect(validarAfastamento(af({ abonoDias: '5', motivo: '03' }), undefined, []).erros).toContain('Abono pecuniário só para férias (motivo 15).');
    });

    it('a reimportação do eSocial não apaga o abono gravado', () => {
        const atual = af({ abonoDias: '10', origem: 'eSocial: a.xml' });
        const [m] = mesclarAfastamentos([af({ origem: 'eSocial: b.xml', observacao: 'nova' })], [atual]);
        expect(m.afastamento).toMatchObject({ abonoDias: '10', observacao: 'nova' });
    });
});
