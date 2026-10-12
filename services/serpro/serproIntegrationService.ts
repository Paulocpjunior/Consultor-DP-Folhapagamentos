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
import { PREFIXO_INTEGRACAO, postarNoServico, servicoDaRota } from '../plataforma/servicos';
import type { ConsultaPagamentosReceita } from '../guias/pagamentoGuias';

/**
 * Rota do túnel /api/dp-integration no serviço que a atende (services/plataforma/servicos.ts): sem
 * configuração, o CFI de sempre. Rota sem dono cai no serviço do governo, o dono da maior parte delas.
 */
export async function callFiscal<T>(path: string, body: object): Promise<T> {
    return postarNoServico<T>(servicoDaRota(path) ?? 'governo', `${PREFIXO_INTEGRACAO}${path}`, body);
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

// ─── DCTFWeb da folha (parte do DP) ─────────────────────────────────────
// Rotas do túnel só do Consultor DP e da carteira (CFI: dp-integration-routes.js): semáforo dos insumos, DARF e
// transmissão com as travas do CFI (o DP transmite só com os três insumos confirmados).

export interface DctfWebDarfResult {
    ok: boolean; emAndamento: boolean; valor: number | null; numeroDocumento: string; codigoBarras: string; vencimento: string;
    pdfBase64: string; mensagens: unknown[]; fonte: string; error?: string;
}
export interface DctfWebTransmissaoResult { numeroRecibo?: string; transmitidoEm?: string; situacao?: string; retificadora?: boolean; comparacao?: unknown; fonte?: string }

export async function consultarInsumosDctfweb(empresaId: string, cnpj: string, competencia: string): Promise<unknown> {
    return callFiscal<unknown>('/dctfweb/insumos', { empresaId, cnpj, competencia });
}

export async function gerarDarfDctfweb(empresaId: string, cnpj: string, competencia: string, emAndamento: boolean): Promise<DctfWebDarfResult> {
    return callFiscal<DctfWebDarfResult>('/dctfweb/darf', { empresaId, cnpj, competencia, emAndamento });
}

export async function transmitirDctfweb(empresaId: string, cnpj: string, competencia: string, opcoes: {
    retificadora?: boolean; motivo?: string; confirmarInsumosPendentes?: boolean; justificativa?: string;
} = {}): Promise<DctfWebTransmissaoResult> {
    return callFiscal<DctfWebTransmissaoResult>('/dctfweb/transmitir', { empresaId, cnpj, competencia, ...opcoes });
}

// ─── Pagamentos (PAGTOWEB) ───────────────────────────────────────────────

/** DARF pago: pagamentos registrados na Receita pelo número do documento (PAGTOWEB/PAGAMENTOS71 no CFI). */
export async function consultarPagamentosReceita(empresaId: string, cnpj: string, numerosDocumento: string[]): Promise<ConsultaPagamentosReceita> {
    return callFiscal<ConsultaPagamentosReceita>('/pagamentos/consultar', { empresaId, cnpj, numerosDocumento });
}

export interface ComprovanteReceitaResult { ok: boolean; fonte?: string; pdfBase64?: string; error?: string; mensagens?: unknown[] }

/** Comprovante de arrecadação em PDF (PAGTOWEB/COMPARRECADACAO72 no CFI), pelo número do documento. */
export async function emitirComprovanteReceita(empresaId: string, cnpj: string, numeroDocumento: string): Promise<ComprovanteReceitaResult> {
    return callFiscal<ComprovanteReceitaResult>('/pagamentos/comprovante', { empresaId, cnpj, numeroDocumento });
}

