/**
 * folhaPerfilColunas.test.ts
 *
 * Rode com: npx vitest run services/folha/__tests__/folhaPerfilColunas.test.ts
 *
 * Cobre o bug da HE 60% (evento 811) da Waldesa que não exportava:
 * o perfil salvo (colunas_ativas) guardava o header CRU com NBSP/espaços
 * múltiplos ("H. E 60%      811"), mas as colunas da aba vêm do parser já
 * NORMALIZADAS ("H. E 60% 811"). O filtro por includes() não casava e a
 * coluna vinha desmarcada → não entrava no export.
 */

import { describe, it, expect } from 'vitest';
import { calcularSelecaoInicial, type PerfilColunas } from '../folhaPerfilColunasService';

// Header como o PARSER entrega (normalizarHeader já aplicado: NBSP→espaço, colapsa)
const COLUNAS_DA_ABA = [
    'CÓDIGO',
    'FUNCIONÁRIOS',
    'COMISSÃO 770',
    'ATRASOS 5850',
    'FALTAS 5650',
    'DSR 5651',
    'H. E 60% 811',
    'H. E 100%',
    'ADICIONAL NOTURNO',
    'VT',
];

// NBSP =   — exatamente como vem da planilha Waldesa antes de normalizar
const NBSP = ' ';

describe('calcularSelecaoInicial — tolerância a NBSP/espaços no perfil salvo', () => {
    it('mantém HE 60% marcada mesmo com perfil salvo contendo NBSP (bug 811)', () => {
        const perfil: PerfilColunas = {
            cnpj: '61082673000122',
            colunas_ativas: [
                'COMISSÃO  770',                       // 2 espaços
                `ATRASOS${NBSP} 5850`,                 // NBSP + espaço
                `H. E 60%${NBSP}${NBSP}${NBSP}${NBSP}${NBSP} 811`, // vários NBSP
                'VT',
            ],
        };
        const sel = calcularSelecaoInicial(COLUNAS_DA_ABA, [], perfil);
        expect(sel.has('H. E 60% 811')).toBe(true);
        expect(sel.has('ATRASOS 5850')).toBe(true);
        expect(sel.has('COMISSÃO 770')).toBe(true);
        expect(sel.has('VT')).toBe(true);
        // não marca o que não estava no perfil
        expect(sel.has('FALTAS 5650')).toBe(false);
    });

    it('casa "H. E 60%" (perfil) com "H.E 60%" (aba) — bug empresa 27', () => {
        // arquivo da empresa 27 usa "H.E 60%" (sem espaço); perfil salvo idem.
        const colunasAba = ['CÓDIGO', 'ATRASOS 5850', 'H.E 60% 811', 'PRÊMIO'];
        const perfil: PerfilColunas = {
            cnpj: '61082673000122',
            // perfil salvo com a grafia "H. E" (com espaço), do mapeamento/matriz
            colunas_ativas: ['ATRASOS 5850', 'H. E 60%      811'],
        };
        const sel = calcularSelecaoInicial(colunasAba, [], perfil);
        expect(sel.has('H.E 60% 811')).toBe(true);   // marcou apesar de "H. E" x "H.E"
        expect(sel.has('ATRASOS 5850')).toBe(true);
    });

    it('só retorna colunas que existem na aba atual', () => {
        const perfil: PerfilColunas = {
            cnpj: '0',
            colunas_ativas: ['H. E 60% 811', 'COLUNA QUE NÃO EXISTE'],
        };
        const sel = calcularSelecaoInicial(COLUNAS_DA_ABA, [], perfil);
        expect(sel.has('H. E 60% 811')).toBe(true);
        expect(sel.has('COLUNA QUE NÃO EXISTE')).toBe(false);
    });

    it('sem perfil → auto-detecta colunas com pelo menos 1 funcionário com dado', () => {
        const funcionarios = [
            { celulas: { 'H. E 60% 811': 1.5, 'FALTAS 5650': 0 } },
            { celulas: { 'H. E 60% 811': '', 'FALTAS 5650': '' } },
        ];
        const sel = calcularSelecaoInicial(COLUNAS_DA_ABA, funcionarios, null);
        expect(sel.has('H. E 60% 811')).toBe(true); // tem dado
        expect(sel.has('FALTAS 5650')).toBe(false); // só 0/vazio
    });
});
