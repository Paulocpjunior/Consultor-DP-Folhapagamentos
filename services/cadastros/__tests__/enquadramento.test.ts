import { describe, expect, it } from 'vitest';
import { calcularPatronal, enquadramentoVazio, enquadramentoVigente, idEnquadramento, numeroDeTexto, validarEnquadramento, type Enquadramento } from '../enquadramento';

// Valores de exemplo para testar a mecânica; os reais vêm do FPAS, do CNAE e do FAP publicado.
const normal: Enquadramento = { ...enquadramentoVazio('emp1'), id: 'emp1_2026-01', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1.1234, terceiros: 5.8 };

describe('enquadramento previdenciário', () => {
    it('valida por regime', () => {
        expect(validarEnquadramento(normal)).toEqual([]);
        expect(validarEnquadramento({ ...normal, rat: 4, fap: 2.5, fpas: '51', terceiros: 12 })).toEqual(['RAT: 1, 2 ou 3% (pelo CNAE preponderante).', 'FAP: entre 0,5000 e 2,0000, com até 4 casas.', 'FPAS: 3 dígitos.', 'Terceiros: entre 0 e 10%.']);
        expect(validarEnquadramento({ ...normal, fap: 1.12345 })).toContain('FAP: entre 0,5000 e 2,0000, com até 4 casas.');
        expect(validarEnquadramento({ ...normal, regime: 'simples-iv', fpas: '' })).toEqual(['Simples Nacional (Anexo IV): sem contribuição para terceiros.']);
        expect(validarEnquadramento({ ...normal, regime: 'simples', rat: 0, fpas: '' })).toEqual([]);
        expect(validarEnquadramento({ ...normal, id: '' }, [normal])).toContain('Já existe enquadramento desta empresa com esta vigência.');
        expect(validarEnquadramento({ ...normal, vigencia: '2026-13' })).toContain('Vigência deve ser um mês no formato AAAA-MM.');
        expect(idEnquadramento('emp1', '2026-01')).toBe('emp1_2026-01');
    });

    it('vigente na competência: o de maior vigência até ela', () => {
        const novo = { ...normal, id: 'emp1_2027-01', vigencia: '2027-01', fap: 0.9 };
        expect(enquadramentoVigente([novo, normal], 'emp1', '2026-12')).toEqual({ enquadramento: normal });
        expect(enquadramentoVigente([novo, normal], 'emp1', '2027-03')).toEqual({ enquadramento: novo });
        expect(enquadramentoVigente([normal], 'emp1', '2025-12')).toHaveProperty('erro');
        expect(enquadramentoVigente([normal], 'outra', '2026-12')).toHaveProperty('erro');
    });

    it('calcula patronal, RAT × FAP e terceiros; maternidade fora da base', () => {
        const p = calcularPatronal(1000000, 200000, normal);
        expect(p.base).toBe(800000);
        expect(p.aliquotaRat).toBe(2.2468);
        expect([p.patronal, p.rat, p.terceiros]).toEqual([160000, Math.round(800000 * 0.022468), 46400]);
        expect(p.memoria[0]).toContain('Tema 72');
        const iv = calcularPatronal(1000000, 0, { ...normal, regime: 'simples-iv', terceiros: 0 });
        expect([iv.patronal, iv.terceiros]).toEqual([200000, 0]);
        const simples = calcularPatronal(1000000, 0, { ...normal, regime: 'simples' });
        expect([simples.patronal, simples.rat, simples.terceiros]).toEqual([0, 0, 0]);
        expect(numeroDeTexto('1,2345')).toBe(1.2345);
        expect(numeroDeTexto('x')).toBeNaN();
    });
});
