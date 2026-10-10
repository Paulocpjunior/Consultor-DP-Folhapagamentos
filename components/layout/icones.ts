// components/layout/icones.ts
//
// Ícones do app (traço de 24×24, no estilo do Lucide), por nome. Cada item do menu tem o seu, na cor do grupo,
// para o colaborador reconhecer a tela pelo desenho e pela cor.

export const ICONES = {
    // Grupos
    empresa: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1',
    cadastro: 'M4 6h16M4 12h16M4 18h10M18 16l2 2-2 2',
    folha: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    conferencia: 'M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
    esocial: 'M4 12a8 8 0 0116 0M7 12a5 5 0 0110 0M12 12v8M9 20h6',
    prazo: 'M12 7v5l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    fim: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4M12 15v2',
    config: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
    // Itens
    certificado: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM12 9.5a2 2 0 100 4 2 2 0 000-4zM12 13.5V16',
    pessoas: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    pessoaMais: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6',
    relogio: 'M12 7v5l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    calendarioX: 'M3 5h18v16H3zM16 3v4M8 3v4M3 9h18M10 13l4 4M14 13l-4 4',
    calendario: 'M3 5h18v16H3zM16 3v4M8 3v4M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01',
    sindicato: 'M3 21h18M4 10h16M12 3l8 5H4zM6 10v8M10 10v8M14 10v8M18 10v8',
    lista: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    elo: 'M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.5-1.5',
    camadas: 'M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
    tabela: 'M3 4h18v16H3zM3 10h18M3 15h18M9 4v16',
    prancheta: 'M9 3h6v3H9zM9 4.5H6V21h12V4.5h-3M9 12h6M9 16h4',
    dinheiro: 'M2 7h20v10H2zM12 15a3 3 0 100-6 3 3 0 000 6zM6 12h.01M18 12h.01',
    calculadora: 'M5 3h14v18H5zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
    sol: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7l1.4-1.4M4.9 19.1l1.4-1.4m11.4 0l1.4 1.4M4.9 4.9l1.4 1.4M16 12a4 4 0 11-8 0 4 4 0 018 0z',
    saida: 'M10 4H5v16h5M15 16l4-4-4-4M19 12H9',
    presente: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8c-1.5-3-5-4-5-1.5S12 8 12 8zm0 0c1.5-3 5-4 5-1.5S12 8 12 8z',
    checkCirculo: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    grafico: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    painel: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    enviar: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
    baixar: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    moeda: 'M12 2a10 10 0 100 20 10 10 0 000-20zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.8 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2',
    lapis: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
    balanca: 'M12 3v18M7 21h10M4 7h16M7 7l-3 7a3 3 0 006 0zM17 7l-3 7a3 3 0 006 0z',
    historico: 'M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8M3 3v5h5M12 7v5l4 2',
    cadeadoAberto: 'M5 11h14v10H5zM8 11V7a4 4 0 017.9-1M12 15v2',
    banco: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
    // Cabeçalho
    chevron: 'M6 9l6 6 6-6',
    lua: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
    sair: 'M15 12H3m0 0l4-4m-4 4l4 4M13 4h6a2 2 0 012 2v12a2 2 0 01-2 2h-6',
    trocar: 'M7 16l-4-4 4-4M3 12h14M17 8l4 4-4 4',
} as const;

export type NomeIcone = keyof typeof ICONES;
