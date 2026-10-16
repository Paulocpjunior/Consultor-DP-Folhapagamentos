// Homologação do motor por empresa: 3 competências seguidas sem diferença nas conferências gravadas.
import { describe, expect, it } from 'vitest';
import { sequenciaHomologacao, textoHomologacao } from '../homologacaoMotor';

const r = (competencia: string, zerada: boolean) => ({ competencia, zerada });

describe('homologação do motor', () => {
    it('maior sequência de meses seguidos sem diferença, em qualquer ordem e pulando buraco', () => {
        expect(sequenciaHomologacao([r('2026-09', true), r('2026-07', true), r('2026-08', true)])).toEqual({ inicio: '2026-07', fim: '2026-09', meses: 3 });
        expect(sequenciaHomologacao([r('2026-06', true), r('2026-08', true), r('2026-09', true)])).toEqual({ inicio: '2026-08', fim: '2026-09', meses: 2 });
        expect(sequenciaHomologacao([r('2026-07', true), r('2026-08', false), r('2026-09', true)]).meses).toBe(1);
        expect(sequenciaHomologacao([r('2025-12', true), r('2026-01', true), r('2026-02', true)]).meses).toBe(3);
        expect(sequenciaHomologacao([]).meses).toBe(0);
    });

    it('texto da faixa e da ativação', () => {
        expect(textoHomologacao([])).toMatchObject({ atingido: false, texto: expect.stringMatching(/Nenhuma conferência/) });
        const a = textoHomologacao([r('2026-07', true), r('2026-08', true), r('2026-09', true)]);
        expect(a.atingido).toBe(true);
        expect(a.texto).toMatch(/Critério atingido: maior sequência de 3 mês\(es\), de 07\/2026 a 09\/2026\. Conferências gravadas: 09\/2026 sem diferença; 08\/2026/);
        const b = textoHomologacao([r('2026-08', true), r('2026-09', false)]);
        expect(b).toMatchObject({ atingido: false, texto: expect.stringMatching(/ainda não atingido .*09\/2026 com diferença/) });
    });
});
