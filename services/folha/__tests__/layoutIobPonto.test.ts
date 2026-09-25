/**
 * layoutIobPonto.test.ts
 *
 * Trava o layout do TXT de apontamento contra o documento OFICIAL da IOB
 * ("Lay-Out de importação de dados Ponto padrão Windows - 3", 40 bytes),
 * fornecido pela IOB em 25/09/2026 para a 1405 - 2XR ENGENHARIA LTDA:
 *
 *   001-006  Numérico      006   Código do Funcionário
 *   007-010  Numérico      004   Código do Evento
 *   011-024  Numérico      014   Referência (as últimas 6 posições = decimais)
 *   025-026  Alfanumérico  002   Espaços em branco
 *   027-040  Numérico      014   Valor (as últimas 2 posições = decimais)
 *
 * Os exemplos de referência do próprio documento estão no teste abaixo — são
 * a régua: se alguém mexer no padNum e eles quebrarem, a IOB rejeita o arquivo.
 */

import { describe, it, expect } from 'vitest';
import { exportarTXT } from '../apontamentoExporter';
import type { Lancamento } from '../folhaTypes';

const lanc = (over: Partial<Lancamento>): Lancamento => ({
    empresa: 'X',
    codigoSage: '1405',
    funcionario: 'FULANO',
    matricula: '836292',
    coluna: 'c',
    evento: '5850',
    descricao_evento: 'FALTAS E ATRASOS',
    tipo: 'D',
    rv: 'R',
    valor: 0,
    origem: 'coluna',
    ...over,
} as Lancamento);

const linha = (l: Lancamento) => exportarTXT([l]).split('\r\n')[0];

describe('layout IOB — Ponto padrão Windows 3 (40 bytes)', () => {
    it('o registro tem exatamente 40 caracteres', () => {
        expect(linha(lanc({ valor: 50.54 }))).toHaveLength(40);
    });

    it('posições 001-006 = código do funcionário, zero-preenchido', () => {
        expect(linha(lanc({ matricula: '836292' })).slice(0, 6)).toBe('836292');
        expect(linha(lanc({ matricula: '101' })).slice(0, 6)).toBe('000101');
    });

    it('posições 007-010 = código do evento, zero-preenchido', () => {
        expect(linha(lanc({ evento: '5850' })).slice(6, 10)).toBe('5850');
        expect(linha(lanc({ evento: '863' })).slice(6, 10)).toBe('0863');
    });

    it('posições 025-026 = dois espaços em branco', () => {
        expect(linha(lanc({ valor: 12.5 })).slice(24, 26)).toBe('  ');
    });

    // Os exemplos impressos no documento da IOB, ao pé do layout.
    it.each([
        [50.54, '00000050540000'],
        [74.15, '00000074150000'],
        [15.73, '00000015730000'],
        [32.4, '00000032400000'],
        [60.0, '00000060000000'],
        [60.123456, '00000060123456'],
    ])('referência %s → %s (exemplo do manual IOB)', (valor, esperado) => {
        expect(linha(lanc({ rv: 'R', valor })).slice(10, 24)).toBe(esperado);
    });

    it('valor monetário usa 12 inteiros + 2 decimais', () => {
        expect(linha(lanc({ rv: 'V', valor: 3243.65 })).slice(26, 40)).toBe('00000000324365');
    });

    it('lançamento de referência zera o valor, e vice-versa', () => {
        const r = linha(lanc({ rv: 'R', valor: 8 }));
        expect(r.slice(26, 40)).toBe('00000000000000');
        const v = linha(lanc({ rv: 'V', valor: 8 }));
        expect(v.slice(10, 24)).toBe('00000000000000');
    });
});
