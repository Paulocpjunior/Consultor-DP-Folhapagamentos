// services/cadastros/tabelasOficiais.ts
//
// Tabelas legais de 2026 para carregar de uma vez (Paulo, 07/10/2026: "pode
// cadastrar as tabelas de 2026 pra mim"). Não são gravadas sozinhas: a tela
// de Tabelas Legais mostra o que falta e a equipe confirma; cada tabela entra
// pelo salvarTabela de sempre (validação, norma e auditoria). Conferidas na
// norma e contra o IOB: INSS de R$ 280,60 sobre a base de R$ 3.266,67 no
// recibo de férias da 1200 (11/2026).

import type { TabelaLegal } from './tabelasLegais';

const r = (reais: number) => Math.round(reais * 100);

export const TABELAS_OFICIAIS_2026: TabelaLegal[] = [
    {
        id: '', tipo: 'inss', vigencia: '2026-01',
        faixas: [
            { ate: r(1621.00), aliquota: 7.5, deducao: 0 },
            { ate: r(2902.84), aliquota: 9, deducao: 0 },
            { ate: r(4354.27), aliquota: 12, deducao: 0 },
            { ate: r(8475.55), aliquota: 14, deducao: 0 },
        ],
        valores: {},
        norma: 'Portaria Interministerial MPS/MF nº 13, de 09/01/2026',
        observacao: 'Carregada pelas tabelas oficiais de 2026 do Consultor.',
    },
    {
        id: '', tipo: 'irrf', vigencia: '2026-01',
        faixas: [
            { ate: r(2428.80), aliquota: 0, deducao: 0 },
            { ate: r(2826.65), aliquota: 7.5, deducao: r(182.16) },
            { ate: r(3751.05), aliquota: 15, deducao: r(394.16) },
            { ate: r(4664.68), aliquota: 22.5, deducao: r(675.49) },
            { ate: null, aliquota: 27.5, deducao: r(908.73) },
        ],
        valores: {
            deducaoDependente: r(189.59), descontoSimplificado: r(607.20),
            redutorAte: r(5000.00), redutorMaximo: r(312.89), redutorLimite: r(7350.00), redutorConstante: r(978.62), redutorCoeficiente: 133145,
        },
        norma: 'Lei nº 15.191/2025 (tabela) e Lei nº 15.270/2025 (redutor mensal)',
        observacao: 'Carregada pelas tabelas oficiais de 2026 do Consultor.',
    },
    {
        id: '', tipo: 'salario_minimo', vigencia: '2026-01', faixas: [],
        valores: { salarioMinimo: r(1621.00) },
        norma: 'Decreto nº 12.797, de 23/12/2025',
        observacao: 'Carregada pelas tabelas oficiais de 2026 do Consultor.',
    },
    {
        id: '', tipo: 'salario_familia', vigencia: '2026-01', faixas: [],
        valores: { cotaSalarioFamilia: r(67.54), limiteSalarioFamilia: r(1980.38) },
        norma: 'Portaria Interministerial MPS/MF nº 13, de 09/01/2026',
        observacao: 'Carregada pelas tabelas oficiais de 2026 do Consultor.',
    },
];

/** Oficiais que ainda não estão cadastradas (mesmo tipo e vigência). */
export const oficiaisQueFaltam = (existentes: TabelaLegal[], oficiais = TABELAS_OFICIAIS_2026) =>
    oficiais.filter(o => !existentes.some(e => e.tipo === o.tipo && e.vigencia === o.vigencia));
