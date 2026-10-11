// services/dctfweb/dctfwebFolha.ts
//
// DCTFWeb da folha, a parte do DP (Paulo, 11/10/2026: "a DCTFWeb tem a parte que cabe ao DP"). Pelo túnel do CFI
// (Integra Contador do SERPRO, com a procuração do escritório):
//   - semáforo dos insumos: eSocial (S-1299, do DP), EFD-Reinf (Contábil) e MIT (Fiscal);
//   - DARF: com a declaração em andamento (antes de transmitir) ou da declaração ativa;
//   - transmissão: o DP transmite só com os três insumos confirmados (regra T1-DP do CFI). Com pendência, quem
//     transmite é o Fiscal, com justificativa. O CFI aplica a regra; aqui ela só orienta a tela.
// Regra da casa: consulta que falha não vira "entregue" nem "pronto".

import { diaUtilAnterior } from '../prazos/calendario';

export type EstadoSelo = 'recebido' | 'pendente' | 'sem-movimento' | 'indeterminado';
export interface SeloInsumo { departamento: string; rotulo: string; estado: EstadoSelo; detalhe: string; fonte?: string; quando?: string | null }
export type Veredito = 'pronto' | 'incompleto' | 'incerto';
export interface SemaforoInsumos { ok: boolean; selos: SeloInsumo[]; veredito: Veredito; frase: string; erro?: string }
export interface SituacaoDeclaracao { ok: boolean; entregue: boolean; situacao: string; dataEntrega?: string | null; erro?: string }

export const ROTULO_ESTADO: Record<EstadoSelo, string> = {
    recebido: 'Recebido', pendente: 'Pendente', 'sem-movimento': 'Sem movimento', indeterminado: 'Sem confirmação',
};

/** Semáforo do túnel → forma da tela; resposta torta vira "incerto" (nunca "pronto"). */
export function lerSemaforo(r: unknown): SemaforoInsumos {
    const x = (r ?? {}) as Partial<SemaforoInsumos> & { error?: string };
    const selos = Array.isArray(x.selos) ? x.selos.filter(s => s && typeof s.rotulo === 'string') : [];
    const estados: EstadoSelo[] = ['recebido', 'pendente', 'sem-movimento', 'indeterminado'];
    const limpos = selos.map(s => ({ ...s, estado: estados.includes(s.estado) ? s.estado : 'indeterminado' as EstadoSelo, detalhe: s.detalhe ?? '' }));
    const veredito: Veredito = x.veredito === 'pronto' || x.veredito === 'incompleto' ? x.veredito : 'incerto';
    // "Pronto" só com os três selos lidos e nenhum pendente ou indeterminado.
    const prontoDeVerdade = veredito === 'pronto' && limpos.length === 3 && limpos.every(s => s.estado === 'recebido' || s.estado === 'sem-movimento');
    return {
        ok: x.ok !== false && limpos.length > 0,
        selos: limpos,
        veredito: veredito === 'pronto' && !prontoDeVerdade ? 'incerto' : veredito,
        frase: x.frase ?? '',
        ...(x.ok === false || !limpos.length ? { erro: x.error ?? x.erro ?? 'semáforo sem resposta' } : {}),
    };
}

export interface Acoes {
    /** DARF com a declaração em andamento (GERARGUIAANDAMENTO313) ou da ativa (GERARGUIA31). */
    darfEmAndamento: boolean;
    podeEmitirDarf: boolean;
    /** Transmissão pelo DP (o CFI confere de novo). */
    podeTransmitir: boolean;
    /** Já transmitida: só a retificadora, com motivo. */
    retificadora: boolean;
    motivo: string;
}

/** O que a tela oferece, pela situação da declaração e pelo semáforo. */
export function acoesDaFolha(situacao: SituacaoDeclaracao | null, semaforo: SemaforoInsumos | null): Acoes {
    if (!situacao?.ok) {
        return { darfEmAndamento: true, podeEmitirDarf: false, podeTransmitir: false, retificadora: false, motivo: `Situação da DCTFWeb indisponível${situacao?.erro ? ` (${situacao.erro})` : ''}: consulte de novo.` };
    }
    const entregue = situacao.entregue;
    const pronto = semaforo?.ok === true && semaforo.veredito === 'pronto';
    const motivo = !semaforo?.ok ? 'Semáforo dos insumos indisponível: sem ele o DP não transmite.'
        : pronto ? (entregue ? 'Declaração já transmitida: só a retificadora, com o motivo.' : 'Os três insumos confirmados: o DP pode transmitir.')
            : `Com insumo pendente ou sem confirmação, a transmissão é do Fiscal. ${semaforo.frase}`.trim();
    return { darfEmAndamento: !entregue, podeEmitirDarf: true, podeTransmitir: pronto, retificadora: entregue, motivo };
}

/**
 * Vencimento do DARF da folha: dia 20 do mês seguinte à competência (contribuições: Lei 8.212/1991, art. 30, I, b;
 * IRRF do trabalho: Lei 11.196/2005, art. 70, I, d), antecipado para o dia útil anterior. 13º (AAAA-13): 20/12.
 */
export function vencimentoDarfFolha(competencia: string): string {
    const [a, m] = competencia.split('-').map(Number);
    const base = m === 13 ? `${a}-12-20` : m === 12 ? `${a + 1}-01-20` : `${a}-${String(m + 1).padStart(2, '0')}-20`;
    return diaUtilAnterior(base);
}

export const JUSTIFICATIVA_MINIMA = 15;

/** Texto do pedido de transmissão: retificadora e justificativa com o mínimo do CFI. */
export function validarPedidoTransmissao(p: { retificadora: boolean; motivo?: string; comPendencia?: boolean; justificativa?: string }): string[] {
    const erros: string[] = [];
    if (p.retificadora && (p.motivo ?? '').trim().length < JUSTIFICATIVA_MINIMA) erros.push(`Escreva o motivo da retificadora (mínimo ${JUSTIFICATIVA_MINIMA} caracteres).`);
    if (p.comPendencia && (p.justificativa ?? '').trim().length < JUSTIFICATIVA_MINIMA) erros.push(`Escreva a justificativa da transmissão com insumo pendente (mínimo ${JUSTIFICATIVA_MINIMA} caracteres).`);
    return erros;
}

/** PDF em base64 → bytes (para baixar). */
export function bytesDoBase64(b64: string): Uint8Array {
    const bin = atob(b64.replace(/\s/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export const nomeArquivoDarf = (codigoSage: string, competencia: string, emAndamento: boolean) =>
    `DARF-DCTFWeb-${codigoSage || 'empresa'}-${competencia}${emAndamento ? '-em-andamento' : ''}.pdf`;
