// services/pacoteCliente/spConnect.ts
//
// Envio ao cliente pelo SP Connect, o WhatsApp oficial do escritório (Cloud
// API da Meta) que mora no CFI (Paulo, 08/10/2026: "deve sair pelo WhatsApp,
// SP Connect" e "com a mesma regra criada no CFI e no CCI, onde podemos enviar
// arquivos em anexo aos clientes"). É a mesma rota dos apps irmãos
// (POST /api/admin/whatsapp/enviar no CFI): o DP manda o template do
// departamento Pessoal (dp-folha), as variáveis e o PDF; o token da Meta
// nunca sai do CFI. Fora da janela de 24h a Meta só aceita template, e o
// template só leva arquivo se tiver cabeçalho de DOCUMENTO aprovado, um PDF
// por envio. O .zip completo (arquivo bancário, agenda, LEIA-ME) segue pelo
// e-mail.

import { comTokenCfi, erroCfi } from '../auth/tokenCfi';
import { callFiscal } from '../serpro/serproIntegrationService';

const CFI_URL = 'https://consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app';
/** Departamento do Pessoal no SP Connect (fila "Gestão - Departamento Pessoal"). */
export const DEPARTAMENTO_DP = 'dp-folha';

export interface VariavelTemplate { chave: string; rotulo?: string }
export interface TemplateWhatsApp {
    nome: string; idioma?: string; descricao?: string;
    temDocumento?: boolean; ativo?: boolean; variaveis?: VariavelTemplate[];
}
export interface ResultadoEnvio { messageId: string; numeroEnviado: string; template: string }

type Fetch = typeof fetch;
const json = async (r: Response) => r.json().catch(() => ({} as Record<string, unknown>));
/** A recusa do CFI traz o que fazer (`acao`): vai junto na mensagem. */
const recusa = (corpo: Record<string, unknown>, status: number) =>
    erroCfi([corpo.error, corpo.acao].filter(Boolean).join(' ') || `SP Connect: HTTP ${status}`, status);

/** Templates ativos do DP que levam arquivo (cabeçalho de documento). */
export async function templatesDoDp(fetchImpl: Fetch = fetch): Promise<TemplateWhatsApp[]> {
    return comTokenCfi(async token => {
        const r = await fetchImpl(`${CFI_URL}/api/admin/whatsapp/templates?departamento=${DEPARTAMENTO_DP}`, { headers: { Authorization: `Bearer ${token}` } });
        const corpo = await json(r);
        if (!r.ok || corpo.ok === false) throw recusa(corpo, r.status);
        return ((corpo.templates as TemplateWhatsApp[]) ?? []).filter(t => t.ativo !== false && t.temDocumento);
    });
}

/** Bytes → base64, em blocos (PDF grande estoura o apply de uma vez só). */
export function paraBase64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

export interface EnvioSpConnect {
    para: string; template: string; variaveis: Record<string, string>;
    pdf: { nome: string; bytes: Uint8Array };
    /** Para a auditoria do CFI (whatsapp_envios.referencia): empresa e pacote. */
    referencia: string;
}

/** Envia pelo SP Connect: template do DP com o PDF no cabeçalho. */
export async function enviarPeloSpConnect(e: EnvioSpConnect, fetchImpl: Fetch = fetch): Promise<ResultadoEnvio> {
    const corpo = JSON.stringify({ departamento: DEPARTAMENTO_DP, template: e.template, para: e.para, variaveis: e.variaveis, pdfBase64: paraBase64(e.pdf.bytes), nomeArquivo: e.pdf.nome, referencia: e.referencia });
    return comTokenCfi(async token => {
        const r = await fetchImpl(`${CFI_URL}/api/admin/whatsapp/enviar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: corpo });
        const resp = await json(r);
        if (!r.ok || resp.ok !== true) throw recusa(resp, r.status);
        return { messageId: String(resp.messageId ?? ''), numeroEnviado: String(resp.numeroEnviado ?? ''), template: String(resp.template ?? e.template) };
    });
}

/**
 * Valor sugerido para cada variável do template, pela chave: o contato, a
 * empresa e a folha do pacote. O que não for reconhecido fica em branco para
 * a equipe preencher (o CFI recusa variável faltando).
 */
export function valoresSugeridos(chaves: string[], d: { contato?: string; empresa: string; titulo: string; competencia: string }): Record<string, string> {
    const norm = (k: string) => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return Object.fromEntries(chaves.map(k => {
        const n = norm(k);
        // Do mais específico ao genérico: "nome_empresa" é a empresa, não o contato (Codex #112).
        const v = /empresa|razao/.test(n) ? d.empresa
            : /compet|mes|periodo/.test(n) ? d.competencia
            : /titulo|folha|documento|assunto/.test(n) ? d.titulo
            : /cliente|contato|nome/.test(n) ? (d.contato?.trim() || d.empresa) : '';
        return [k, v];
    }));
}

// ─── E-mail pelo escritório (Graph, no CFI) ──────────────────────────────────
// POST /api/dp-integration/email/enviar: mesma régua do CFI e do CCI. O
// remetente é o colaborador logado (caixa do escritório; sem caixa, a
// institucional, dito na resposta), o .zip vai em anexo (até 3 MB) e o CFI
// audita quem enviou. Só empresa da carteira de quem envia.
export interface EnvioEmail {
    empresaId: string; cnpj: string; empresaNome: string; titulo: string; competencia: string;
    para: string; assunto: string; mensagem: string; anexos: { nome: string; bytes: Uint8Array; mime: string }[];
}
/** `convites`: o CFI acrescenta vencimentos-sp.ics quando lê um vencimento num PDF anexo; `avisosConvites`: PDF que ele não conseguiu ler. */
export interface ResultadoEmail { remetente: string; fonteRemetente: 'colaborador' | 'padrao'; avisoRemetente?: string | null; copiaPara: string[]; convites?: number; avisosConvites?: string[] }

export async function enviarEmailPeloEscritorio(e: EnvioEmail, chamar: typeof callFiscal = callFiscal): Promise<ResultadoEmail> {
    try {
        return await chamar<ResultadoEmail>('/email/enviar', {
            empresaId: e.empresaId, cnpj: e.cnpj.replace(/\D/g, ''), empresaNome: e.empresaNome, titulo: e.titulo, competencia: e.competencia,
            para: e.para, assunto: e.assunto, mensagem: e.mensagem,
            anexos: e.anexos.map(a => ({ nome: a.nome, base64: paraBase64(a.bytes), mime: a.mime })),
        });
    } catch (err) {
        // Antes da publicação no CFI a rota não existe (404, sem corpo JSON).
        if ((err as { status?: number }).status === 404 || /HTTP 404/.test((err as Error).message)) throw new Error('o envio de e-mail pelo escritório ainda não está publicado no CFI. Use "E-mail deste computador" e anexe o .zip.');
        throw err;
    }
}
