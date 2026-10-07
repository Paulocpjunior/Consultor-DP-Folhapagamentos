/**
 * services/serpro/serproIntegrationService.ts
 *
 * Cliente HTTP para consumir endpoints SERPRO reais expostos pelo
 * Consultor Fiscal (cross-project integration).
 *
 * O Fiscal expõe /api/dp-integration/* protegidos por Firebase Auth.
 * O DP autentica com o mesmo Firebase project (consultor-dp-folha)
 * mas o token é validado pelo Fiscal contra users/{uid}.
 *
 * IMPORTANTE: usuário precisa existir tanto no DP quanto no Fiscal
 * com mesmo email para que o token seja aceito.
 */
import { comTokenCfi } from '../auth/tokenCfi';

const FISCAL_API_BASE = 'https://consultor-fiscal-inteligente-631239634290.us-west1.run.app/api/dp-integration';

export async function callFiscal<T>(path: string, body: object): Promise<T> {
    return comTokenCfi(token => chamarFiscal<T>(path, body, token));
}

async function chamarFiscal<T>(path: string, body: object, token: string): Promise<T> {
    const resp = await fetch(`${FISCAL_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
}

// ─── FGTS ────────────────────────────────────────────────────────────────

export interface FgtsRecolhimentoResult {
    ok: boolean;
    regular: boolean;
    depositoDevido: number;
    depositoRealizado: number;
    situacao?: string;
    erro?: string;
}

export async function consultarFgtsRecolhimento(
    cnpj: string,
    competencia: string,
): Promise<FgtsRecolhimentoResult> {
    return callFiscal<FgtsRecolhimentoResult>('/fgts/recolhimento', { cnpj, competencia });
}

export interface CrfFgtsResult {
    ok: boolean;
    status: 'negativa' | 'positiva' | 'positiva_efeitos_negativa' | 'indisponivel' | 'nao_consultada';
    validade?: string | null;
    motivo?: string | null;
    numero?: string | null;
    dataEmissao?: string | null;
    pdfBase64?: string | null;
}

export async function consultarCrfFgts(cnpj: string): Promise<CrfFgtsResult> {
    return callFiscal<CrfFgtsResult>('/fgts/crf', { cnpj });
}

// ─── eSocial ─────────────────────────────────────────────────────────────

export interface ESocialStatusResult {
    ok: boolean;
    entregue: boolean;
    situacao: string;
    dataEntrega?: string | null;
    erro?: string;
}

export async function consultarESocialFechamento(
    cnpj: string,
    competencia: string,
): Promise<ESocialStatusResult> {
    return callFiscal<ESocialStatusResult>('/esocial/status', { cnpj, competencia });
}

// ─── DCTFWeb ─────────────────────────────────────────────────────────────

export interface DctfWebStatusResult {
    ok: boolean;
    entregue: boolean;
    situacao: string;
    dataEntrega?: string | null;
    erro?: string;
}

export async function consultarDctfWebStatus(
    cnpj: string,
    competencia: string,
): Promise<DctfWebStatusResult> {
    return callFiscal<DctfWebStatusResult>('/dctfweb/status', { cnpj, competencia });
}

// ─── Consulta completa em batch ──────────────────────────────────────────

export interface EmpresaCompletoResult {
    cnpj: string;
    competencia: string;
    consultadoEm: string;
    fgts: FgtsRecolhimentoResult;
    esocial: ESocialStatusResult;
    dctfweb: DctfWebStatusResult;
    crfFgts: CrfFgtsResult;
}

export async function consultarEmpresaCompleto(
    cnpj: string,
    competencia?: string,
): Promise<EmpresaCompletoResult> {
    const body: any = { cnpj };
    if (competencia) body.competencia = competencia;
    return callFiscal<EmpresaCompletoResult>('/empresa-completo', body);
}

// ─── DCTFWeb — débitos por código de receita ────────────────────────────
// Rota nova do túnel (CFI: POST /api/dp-integration/dctfweb/debitos). Lê o XML
// da declaração (CONSXMLDECLARACAO38) e devolve os débitos com saldo a pagar.

export interface DctfWebDebito { codReceita: string; codigo: string; extensao: string; descricao: string; valor: number }
export interface DctfWebDebitosResult {
    ok: boolean;
    fonte?: string | null;
    identificacao?: { cnpj: string | null; perApuracao: string | null; competencia: string | null; categoriaDCTF: string | null };
    debitos: DctfWebDebito[];
    erro?: string;
}

export async function consultarDctfWebDebitos(cnpj: string, competencia: string): Promise<DctfWebDebitosResult> {
    return callFiscal<DctfWebDebitosResult>('/dctfweb/debitos', { cnpj, competencia });
}
