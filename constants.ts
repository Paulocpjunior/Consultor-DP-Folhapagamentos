// Stub pro build passar. Categorias de transação usadas pelo geminiService legado.
// Se o ExtratosProcessor novo precisar disso, a gente ajusta no Bloco 3.
export const TRANSACTION_CATEGORIES = [
    'Alimentação',
    'Transporte',
    'Moradia',
    'Saúde',
    'Educação',
    'Lazer',
    'Vestuário',
    'Serviços',
    'Salário',
    'Investimentos',
    'Transferências',
    'Impostos',
    'Tarifas Bancárias',
    'Outros'
] as const;

export type TransactionCategory = typeof TRANSACTION_CATEGORIES[number];
