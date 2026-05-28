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
import { getAuth } from 'firebase/auth';

const FISCAL_API_BASE = 'https://consultor-fiscal-inteligente-631239634290.us-west1.run.app/api/dp-integration';

async function getToken(): Promise<string> {
    const u = getAuth().currentUser;
    if (!u) throw new Error('Usuário não autenticado');
    return u.getIdToken();
}

async function callFiscal<T>(path: string, body: object): Promise<T> {
    const token = await getToken();
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
