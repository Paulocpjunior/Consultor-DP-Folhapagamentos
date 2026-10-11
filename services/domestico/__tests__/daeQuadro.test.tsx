// @vitest-environment jsdom
// Quadro do DAE do eSocial Doméstico no Cálculo (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DaeDomesticoQuadro from '../../../components/domestico/DaeDomesticoQuadro';
import type { DaeDomestico } from '../domestico';

afterEach(cleanup);

describe('quadro do DAE', () => {
    it('itens, total e vencimento', () => {
        const dae: DaeDomestico = { competencia: '2026-03', vencimento: '2026-04-07', empregados: 1, total: 55000, avisos: ['Há holerite incompleto: o DAE muda quando ele for completado.'],
            itens: [{ rotulo: 'INSS do empregador', base: 200000, aliquota: '8%', valor: 16000 }, { rotulo: 'Indenização compensatória (FGTS)', base: 200000, aliquota: '3,2%', valor: 6400 }] };
        render(<DaeDomesticoQuadro dae={dae} />);
        expect(screen.getByLabelText('DAE do eSocial Doméstico').textContent).toMatch(/vencimento em 07\/04\/2026/);
        expect(screen.getByText('Indenização compensatória (FGTS)').closest('tr')!.textContent).toMatch(/3,2%.*64,00/);
        expect(screen.getByText('Total do DAE').closest('tr')!.textContent).toMatch(/550,00/);
        expect(screen.getByText(/Há holerite incompleto/)).toBeTruthy();
    });
});
