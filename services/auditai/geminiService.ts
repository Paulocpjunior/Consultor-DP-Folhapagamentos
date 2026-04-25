import type { AnalysisResult, ExtractedAccount, ComparisonRow } from '../../types.auditai';

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function callGemini(body: any, endpoint: 'generate' | 'chat' = 'generate'): Promise<string> {
    const res = await fetch(`/api/gemini/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Erro ${res.status}`);
    }
    const data = await res.json();
    return data.text || '';
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, baseDelay = 3000): Promise<T> {
    try { return await fn(); }
    catch (error: any) {
        const message = error?.message || '';
        if (message.includes('404') || message.includes('not found')) throw error;
        if (retries > 0) {
            await new Promise(r => setTimeout(r, baseDelay));
            return retryWithBackoff(fn, retries - 1, baseDelay * 2);
        }
        throw error;
    }
}

function safeDecodeBase64(str: string): string {
    try {
        const cleaned = str.replace(/[^A-Za-z0-9+/]/g, '');
        const padded = cleaned + '=='.slice(0, (4 - cleaned.length % 4) % 4);
        const binary = window.atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
        try { return window.atob(str); } catch { return ''; }
    }
}

function parseFinancialNumber(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let clean = String(val).trim();
    if (!clean || clean === '-' || clean === '–') return 0;
    clean = clean.replace(/^R\$\s?/, '').replace(/\s/g, '');
    clean = clean.replace(/O/gi, '0').replace(/l/g, '1').replace(/[^0-9.,\-()]/g, '');
    const isNegativeParens = /^\(.*\)$/.test(clean);
    if (isNegativeParens) clean = clean.replace(/[()]/g, '');
    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');
    if (lastComma > lastDot) clean = clean.replace(/\./g, '').replace(',', '.');
    else if (lastDot > lastComma) clean = clean.replace(/,/g, '');
    else if (clean.includes(',')) clean = clean.replace(',', '.');
    let num = parseFloat(clean);
    if (isNaN(num)) return 0;
    if (isNegativeParens) num = -Math.abs(num);
    return num;
}

function mapValuesToColumns(numbers: number[], docType: string) {
    const count = numbers.length;
    let initial = 0, debit = 0, credit = 0, final = 0;
    if (docType === 'DRE') {
        if (count > 0) final = numbers[0];
        return { initial, debit, credit, final };
    }
    if (count === 1) final = numbers[0];
    else if (count === 2) { initial = numbers[0]; final = numbers[1]; }
    else if (count === 3) { debit = numbers[0]; credit = numbers[1]; final = numbers[2]; }
    else if (count >= 4) { initial = numbers[0]; debit = numbers[1]; credit = numbers[2]; final = numbers[3]; }
    return { initial, debit, credit, final };
}

function normalizeFinancialData(rawLines: string[], docType: string): AnalysisResult {
    const accounts: ExtractedAccount[] = [];
    rawLines.forEach(line => {
        let cleanLine = line.trim();
        if (!cleanLine || cleanLine.length < 5) return;
        if (/^(doctype|data|conta|descri|saldo|débito|crédito|página|page|cod|cód|movimento|transporte|historico|empresa|cnpj)/i.test(cleanLine)) return;
        if (/^\|?[\s-]+\|?$/.test(cleanLine)) return;

        let code = '', name = '';
        let valuesPart: number[] = [];
        let type: 'Debit' | 'Credit' = 'Debit';

        if (cleanLine.includes('|')) {
            const parts = cleanLine.split('|').map(p => p.trim()).filter(p => p.length > 0);
            if (parts.length >= 2) {
                const firstLooksLikeCode = /^[\d.-]+$/.test(parts[0]) && parts[0].length < 20;
                if (firstLooksLikeCode) {
                    code = parts[0];
                    name = parts[1];
                    for (let i = 2; i < parts.length; i++) {
                        if (/^[DC%]$/i.test(parts[i])) continue;
                        valuesPart.push(parseFinancialNumber(parts[i]));
                    }
                } else {
                    name = parts[0];
                    for (let i = 1; i < parts.length; i++) {
                        if (/^[DC%]$/i.test(parts[i])) continue;
                        valuesPart.push(parseFinancialNumber(parts[i]));
                    }
                }
            }
        }

        if (valuesPart.length === 0) {
            cleanLine = cleanLine.replace(/\.{3,}/g, ' ');
            const tokens = cleanLine.split(/\s+/);
            const foundNumbers: number[] = [];
            let lastIdx = tokens.length - 1, count = 0;
            while (lastIdx >= 0 && count < 4) {
                const tok = tokens[lastIdx];
                if (/^[DC%]$/i.test(tok)) { lastIdx--; continue; }
                if (/^[\d.,\-()]+$/.test(tok) && /\d/.test(tok)) {
                    foundNumbers.unshift(parseFinancialNumber(tok));
                    count++; lastIdx--;
                } else if (tok.toUpperCase() === 'R$') lastIdx--;
                else break;
            }
            if (foundNumbers.length > 0) {
                valuesPart = foundNumbers;
                const nameTokens = tokens.slice(0, lastIdx + 1);
                if (nameTokens.length > 0) {
                    if (/^[\d.-]+$/.test(nameTokens[0])) { code = nameTokens[0]; name = nameTokens.slice(1).join(' '); }
                    else name = nameTokens.join(' ');
                }
            }
        }

        name = name.replace(/[.|]{2,}/g, '').trim();
        if (!name || name.length < 2 || valuesPart.length === 0) return;

        const lowerName = name.toLowerCase();
        if (code.startsWith('2') || code.startsWith('3') || code.startsWith('6') ||
            lowerName.includes('passivo') || lowerName.includes('fornecedor') || lowerName.includes('receita') ||
            lowerName.includes('patrimônio') || lowerName.includes('capital') || lowerName.includes('lucro') ||
            lowerName.includes('vendas')) type = 'Credit';
        if (docType === 'DRE' && (lowerName.includes('custo') || lowerName.includes('despesa') || lowerName.includes('imposto') || lowerName.includes('cmv'))) type = 'Debit';

        const values = mapValuesToColumns(valuesPart, docType);
        const cleanCode = code.endsWith('.') ? code.slice(0, -1) : code;
        let category = null;
        if (docType === 'DRE' || code.startsWith('3') || code.startsWith('4') || code.startsWith('5')) {
            if (lowerName.includes('receita') || lowerName.includes('custo') || lowerName.includes('despesa') || code.startsWith('3') || code.startsWith('4')) category = 'Operacional';
            else if (lowerName.includes('invest') || lowerName.includes('imobiliz')) category = 'Investimento';
            else if (lowerName.includes('juro') || lowerName.includes('financ')) category = 'Financiamento';
            else category = 'Operacional';
        }
        let finalBal = values.final;
        if (docType === 'DRE') {
            if (values.debit === 0 && values.credit === 0) {
                if (type === 'Debit') values.debit = Math.abs(finalBal);
                else values.credit = Math.abs(finalBal);
            }
            finalBal = type === 'Debit' ? -Math.abs(finalBal) : Math.abs(finalBal);
        } else if (finalBal === 0 && (values.debit !== 0 || values.credit !== 0)) {
            finalBal = values.debit - values.credit;
        }

        accounts.push({
            account_code: cleanCode, account_name: name,
            initial_balance: values.initial, debit_value: values.debit, credit_value: values.credit,
            final_balance: finalBal, total_value: Math.abs(finalBal),
            type, possible_inversion: false, ifrs18_category: category as any,
            level: 1, is_synthetic: false
        });
    });

    accounts.sort((a, b) => {
        if (!a.account_code) return 1;
        if (!b.account_code) return -1;
        return a.account_code.localeCompare(b.account_code, undefined, { numeric: true, sensitivity: 'base' });
    });

    accounts.forEach((acc, idx) => {
        if (acc.account_code) {
            acc.level = acc.account_code.split(/[.-]/).filter(x => x.length > 0).length;
            const next = accounts[idx + 1];
            if (next && next.account_code && next.account_code.startsWith(acc.account_code)) {
                const ch = next.account_code[acc.account_code.length];
                if (ch === '.' || ch === '-' || ch === undefined) acc.is_synthetic = true;
            }
        } else if (/^(total|grupo|resultado)/i.test(acc.account_name)) acc.is_synthetic = true;
    });

    const analytical = accounts.filter(a => !a.is_synthetic);
    const calc = analytical.length > 0 ? analytical : accounts.filter(a => !/total/i.test(a.account_name));
    const total_debits = calc.reduce((s, a) => s + Math.abs(a.debit_value), 0);
    const total_credits = calc.reduce((s, a) => s + Math.abs(a.credit_value), 0);
    const discrepancy = Math.abs(total_debits - total_credits);

    let calculatedResult = 0;
    let resultLabel = 'Resultado do Período';
    if (docType === 'DRE') {
        const rev = analytical.filter(a => a.type === 'Credit').reduce((s, a) => s + Math.abs(a.final_balance), 0);
        const exp = analytical.filter(a => a.type === 'Debit').reduce((s, a) => s + Math.abs(a.final_balance), 0);
        calculatedResult = rev - exp;
        resultLabel = calculatedResult >= 0 ? 'Lucro Líquido Apurado' : 'Prejuízo Líquido Apurado';
    } else {
        let revS = 0, expS = 0;
        analytical.forEach(acc => {
            if (acc.account_code) {
                const f = acc.account_code.charAt(0);
                if (['3', '4', '5', '6', '7'].includes(f)) {
                    if (acc.type === 'Credit') revS += Math.abs(acc.final_balance);
                    if (acc.type === 'Debit') expS += Math.abs(acc.final_balance);
                }
            }
        });
        calculatedResult = revS - expS;
    }

    return {
        summary: {
            document_type: docType as any, period: 'A definir',
            total_debits, total_credits,
            is_balanced: docType === 'DRE' ? true : discrepancy < 1.0,
            discrepancy_amount: discrepancy, observations: [],
            specific_result_value: calculatedResult, specific_result_label: resultLabel
        },
        accounts, spell_check: []
    };
}

async function extractRawData(fileBase64: string, mimeType: string): Promise<{ lines: string[], docType: string }> {
    const basePrompt = `
TASK: Financial Data Extraction.
OUTPUT FORMAT: "CODE | ACCOUNT NAME | VALUE"
CRITICAL RULES:
1. EXTRACT LINE BY LINE FROM ALL PROVIDED IMAGES/PAGES.
2. FORCE PIPE SEPARATOR (|) between Code, Name, and Value.
3. IGNORE NON-MONETARY COLUMNS (e.g., %, AV, AH, Indicators D/C).
4. IF MULTIPLE VALUE COLUMNS: EXTRACT ONLY CURRENT PERIOD.
5. KEEP ORIGINAL NUMBER FORMAT (e.g. 1.000,00).
6. NO MARKDOWN TABLES, JUST RAW TEXT LINES.
7. IGNORE HEADERS/FOOTERS. DO NOT SUMMARIZE.`;

    let extractedText = '';
    let docType = 'Balancete';

    if (mimeType === 'text/csv' || mimeType === 'text/plain' || mimeType === 'application/csv') {
        const decoded = safeDecodeBase64(fileBase64);
        const allLines = decoded.split('\n');
        const CHUNK = 600;
        for (let i = 0; i < allLines.length; i += CHUNK) {
            const chunk = allLines.slice(i, i + CHUNK).join('\n');
            const text = await retryWithBackoff(() => callGemini({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: basePrompt + `\n\n--- SEGMENT ${Math.floor(i/CHUNK)+1} ---\n${chunk}` }] },
                config: { temperature: 0.0, maxOutputTokens: 8192 }
            }));
            extractedText += text + '\n';
        }
    } else if (mimeType === 'application/pdf') {
        extractedText = await retryWithBackoff(() => callGemini({
            model: 'gemini-2.5-flash',
            contents: { parts: [
                { inlineData: { mimeType: 'application/pdf', data: fileBase64 } },
                { text: basePrompt + '\n\nEXTRACT EVERY SINGLE ROW FROM ALL PAGES.' }
            ]},
            config: { temperature: 0.0, maxOutputTokens: 65000 }
        }));
    } else {
        extractedText = await retryWithBackoff(() => callGemini({
            model: 'gemini-2.5-flash',
            contents: { parts: [
                { inlineData: { mimeType, data: fileBase64 } },
                { text: basePrompt + '\n\nEXTRACT EVERYTHING.' }
            ]},
            config: { temperature: 0.1, maxOutputTokens: 65000 }
        }));
    }

    let lines = extractedText.split('\n').filter(l => l.trim().length > 0);
    const typeLine = lines.find(l => /Balanço|Balancete|Demonstração|Resultado/i.test(l));
    if (typeLine) {
        if (/Resultado|DRE/i.test(typeLine)) docType = 'DRE';
        else if (/Balanço/i.test(typeLine)) docType = 'Balanço Patrimonial';
    }
    lines = lines.filter(l => !l.startsWith('DOCTYPE') && /\d/.test(l));
    return { lines, docType };
}

async function generateNarrativeAnalysis(summary: any, sample: string[]) {
    const prompt = `
ATUE COMO: Auditor Contábil Senior SP Assessoria.
DADOS: Doc: ${summary.document_type}, Resultado: ${summary.specific_result_value}.
AMOSTRA: ${sample.join('; ')}

TAREFA:
1. Identifique o período.
2. Identifique erros ortográficos técnicos.

SAÍDA JSON:
{"period":"01/01/2025 a 31/12/2025","observations":["Destaque 1"],"spellcheck":[{"original_term":"RESEITA","suggested_correction":"RECEITA","confidence":"High"}]}`;
    try {
        const text = await retryWithBackoff(() => callGemini({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: { responseMimeType: 'application/json', temperature: 0.4 }
        }));
        const parsed = JSON.parse(text || '{}');
        return {
            period: parsed.period || 'A definir',
            observations: parsed.observations || [],
            spellcheck: parsed.spellcheck || []
        };
    } catch { return { observations: [], spellcheck: [], period: 'Indefinido' }; }
}

// ─── API pública ─────────────────────────────────────────────────────────────

export const analyzeDocument = async (fileBase64: string, mimeType: string): Promise<AnalysisResult> => {
    const { lines, docType } = await extractRawData(fileBase64, mimeType);
    if (lines.length === 0) throw new Error('Nenhum dado contábil identificado.');
    const result = normalizeFinancialData(lines, docType);
    if (result.accounts.length === 0) throw new Error('Falha na interpretação das linhas.');
    const sample = result.accounts.slice(0, 150).map(a => a.account_name);
    const narr = await generateNarrativeAnalysis(result.summary, sample);
    result.summary.period = narr.period || 'Período não identificado';
    result.summary.observations = narr.observations || [];
    result.spell_check = narr.spellcheck || [];
    return result;
};

export const generateFinancialInsight = async (data: AnalysisResult, userPrompt: string, multiple: number): Promise<string> => {
    const top = (data.accounts || []).filter(a => !a.is_synthetic)
        .sort((a, b) => b.total_value - a.total_value).slice(0, 150)
        .map(a => `${a.account_name}: ${a.final_balance}`).join('\n');
    return await callGemini({
        model: 'gemini-2.5-pro',
        contents: { parts: [{ text: `DADOS:\n${top}\n\nPEDIDO:\n${userPrompt}` }] },
        systemInstruction: 'Especialista SP Assessoria. Analise a saúde financeira.',
        config: { temperature: 0.4 }
    });
};

export const generateCMVAnalysis = async (data: AnalysisResult, standard: string): Promise<string> => {
    const accs = (data.accounts || []).slice(0, 300)
        .map(a => `${a.account_code} ${a.account_name}: ${a.total_value}`).join('\n');
    return await callGemini({
        model: 'gemini-2.5-pro',
        contents: { parts: [{ text: `Analise CMV:\n${accs}` }] },
        systemInstruction: 'Auditor de Custos SP Assessoria.',
        config: { temperature: 0.3 }
    });
};

export const generateSpedComplianceCheck = async (data: AnalysisResult): Promise<string> => {
    const accs = (data.accounts || []).slice(0, 250)
        .map(a => `${a.account_code || '?'} | ${a.account_name} | ${a.final_balance}`).join('\n');
    return await callGemini({
        model: 'gemini-2.5-pro',
        contents: { parts: [{ text: `Auditoria SPED:\n\n${accs}` }] },
        systemInstruction: 'Especialista em SPED ECD/ECF SP Assessoria.',
        config: { temperature: 0.2 }
    });
};

export const chatWithFinancialAgent = async (
    history: { role: 'user' | 'model', parts: { text: string }[] }[],
    message: string
): Promise<string> => {
    return await callGemini({
        model: 'gemini-2.5-pro',
        history, message,
        systemInstruction: 'Assistente contábil sênior SP Assessoria.',
        tools: [{ googleSearch: {} }]
    }, 'chat');
};

export const generateComparisonAnalysis = async (rows: ComparisonRow[], period1: string, period2: string): Promise<string> => {
    const top = rows.filter(r => !r.is_synthetic)
        .sort((a, b) => Math.abs(b.varAbs) - Math.abs(a.varAbs))
        .slice(0, 100)
        .map(r => `${r.code} ${r.name}: De ${r.val1} para ${r.val2} (VarAbs: ${r.varAbs}, VarPct: ${r.varPct.toFixed(2)}%)`)
        .join('\n');
    return await callGemini({
        model: 'gemini-2.5-pro',
        contents: { parts: [{ text: `Analise variações entre ${period1} e ${period2}:\n\n${top}` }] },
        systemInstruction: 'Auditor Contábil Senior SP Assessoria especialista em análise horizontal.',
        config: { temperature: 0.3 }
    });
};
