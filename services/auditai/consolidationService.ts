
import { AnalysisResult, HistoryItem, ConsolidationResult, ConsolidatedRow, ConsolidatedCompany } from "../../types.auditai";

export interface ConsolidationInput {
    item: HistoryItem;
    result: AnalysisResult;
}

const cleanCnpj = (value: string | undefined | null): string => String(value || '').replace(/\D/g, '');

export const isValidCnpj = (value: string | undefined | null): boolean => {
    const cnpj = cleanCnpj(value);
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1+$/.test(cnpj)) return false;

    const calcDigit = (base: string, weights: number[]) => {
        const sum = weights.reduce((acc, weight, index) => acc + Number(base[index]) * weight, 0);
        const mod = sum % 11;
        return mod < 2 ? 0 : 11 - mod;
    };

    const firstDigit = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondDigit = calcDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    return firstDigit === Number(cnpj[12]) && secondDigit === Number(cnpj[13]);
};

const formatCnpj = (value: string): string => {
    const cnpj = cleanCnpj(value);
    if (cnpj.length !== 14) return value;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
};

const getCompanyLabel = (item: HistoryItem): string => {
    const fileNames = item.fileNames?.length ? item.fileNames.join(', ') : item.fileName;
    return item.headerData.companyName || fileNames || item.id;
};

// Helper to normalize account keys for merging
const getAccountKey = (code: string | null, name: string): string => {
    // Priority: Code. If code exists, use it as primary key (stripping dots for loose matching).
    // If no code, use normalized name.
    if (code && code.length > 0) {
        return code.replace(/[^0-9]/g, ''); 
    }
    return name.trim().toUpperCase();
};

export const consolidateDREs = (items: ConsolidationInput[]): ConsolidationResult => {
    if (!Array.isArray(items) || items.length < 2) {
        throw new Error('Selecione pelo menos 2 DREs para consolidar o Grupo / Holding.');
    }

    const seenCnpjs = new Map<string, string>();
    const companies: ConsolidatedCompany[] = items.map(({ item }) => {
        const cnpjDigits = cleanCnpj(item.headerData.cnpj);
        const companyName = getCompanyLabel(item);

        if (!isValidCnpj(cnpjDigits)) {
            throw new Error(`CNPJ inválido ou ausente na aba Grupo / Holding: ${companyName}. Abra a análise da empresa, informe um CNPJ válido e salve novamente antes de consolidar.`);
        }

        const duplicatedCompany = seenCnpjs.get(cnpjDigits);
        if (duplicatedCompany) {
            throw new Error(`CNPJ duplicado na consolidação (${formatCnpj(cnpjDigits)}): ${duplicatedCompany} e ${companyName}. Cada empresa do Grupo / Holding precisa ter um CNPJ único.`);
        }

        seenCnpjs.set(cnpjDigits, companyName);

        return {
            id: cnpjDigits,
            name: companyName,
            cnpj: formatCnpj(cnpjDigits),
            cnpjDigits,
            sourceHistoryId: item.id
        };
    });

    const accountMap = new Map<string, ConsolidatedRow>();

    // 1. Iterate over all companies to build the superset of accounts
    items.forEach(({ result }, index) => {
        const company = companies[index];

        result.accounts.forEach(acc => {
            const key = getAccountKey(acc.account_code, acc.account_name);
            
            if (!accountMap.has(key)) {
                accountMap.set(key, {
                    code: acc.account_code || '',
                    name: acc.account_name,
                    is_synthetic: acc.is_synthetic,
                    level: acc.level,
                    values: {},
                    total: 0
                });
            }

            const row = accountMap.get(key)!;
            
            // Populate value for this company
            // Ensure we initialize if undefined
            if (row.values[company.id] === undefined) row.values[company.id] = 0;
            
            // Add value (Assuming final_balance represents the DRE line value)
            // Note: In our extraction logic, final_balance for DRE is the line amount.
            row.values[company.id] = acc.final_balance;
        });
    });

    // 2. Calculate Totals and finalize rows
    const rows = Array.from(accountMap.values()).map(row => {
        let sum = 0;
        companies.forEach(company => {
            const val = row.values[company.id] || 0;
            row.values[company.id] = val; // Ensure 0 instead of undefined
            sum += val;
        });
        row.total = sum;
        return row;
    });

    // 3. Sort rows by Code
    rows.sort((a, b) => {
        // Handle rows without codes (push to bottom or sort by name)
        if (!a.code && !b.code) return 0;
        if (!a.code) return 1;
        if (!b.code) return -1;
        
        // Natural sort for "1.01", "1.02", "1.10"
        return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
    });

    // 4. Recalculate Result (Lucro/Prejuízo) explicitly to ensure math consistency
    // (Optional, depends if the rows contain the calculated result or just lines)
    // We rely on the rows extracted.

    return {
        companies,
        rows,
        generatedAt: new Date().toISOString(),
        groupName: companies.length > 0 ? `${companies[0].name} e Outras` : 'Grupo Econômico'
    };
};
