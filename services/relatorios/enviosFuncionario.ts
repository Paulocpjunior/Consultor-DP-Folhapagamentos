// services/relatorios/enviosFuncionario.ts
//
// Histórico dos envios ao funcionário (Paulo, 12/10/2026): o holerite e o cartão de aniversário de cada um, por
// e-mail ou WhatsApp, guardam quem enviou, quando, para onde (mascarado) e se deu certo. A tela não reenvia a quem já
// recebeu pelo mesmo canal na competência, a não ser que se marque "incluir quem já recebeu".
//   envios_funcionario/{empresaId}_{AAAA-MM}_{tipo}_{fichaId} { empresaId, fichaId, competencia, tipo, canais: { email?, whatsapp? } }
// Cada canal guarda só o último envio. Puro, sem Firebase.

export type TipoEnvio = 'holerite' | 'aniversario';
export type CanalEnvio = 'email' | 'whatsapp';
export interface RegistroCanal { ok: boolean; destino: string; em: string; porEmail: string; erro?: string }
export type EnviosDaFicha = Partial<Record<CanalEnvio, RegistroCanal>>;
/** Envios da competência e do tipo, pelo id da ficha. */
export type HistoricoEnvios = Map<string, EnviosDaFicha>;

/** O histórico na tela: ler os envios da competência e gravar um envio (o tipo e a competência já vêm da tela). */
export interface HistoricoDeEnvios {
    listar: () => Promise<HistoricoEnvios>;
    /** Grava o envio (sem `erro`, deu certo). Falha de gravação não desfaz o envio: a tela avisa. */
    registrar: (fichaId: string, canal: CanalEnvio, destino: string, erro?: string) => Promise<void>;
}

export const idEnvio = (empresaId: string, competencia: string, tipo: TipoEnvio, fichaId: string) => `${empresaId}_${competencia}_${tipo}_${fichaId}`;

/** Destino sem expor o contato inteiro: "b***@x.com", "(**) *****-7777". */
export function mascararDestino(canal: CanalEnvio, destino: string): string {
    const d = destino.trim();
    if (canal === 'email') {
        const [u, dom] = d.split('@');
        return dom ? `${u.charAt(0)}***@${dom}`.slice(0, 120) : '***';
    }
    const n = d.replace(/\D/g, '');
    return n.length >= 4 ? `(**) *****-${n.slice(-4)}` : '***';
}

/** Registro de um envio (o erro só quando falhou, curto). */
export function registroDoEnvio(canal: CanalEnvio, destino: string, porEmail: string, erro?: string, agora = new Date()): RegistroCanal {
    const r: RegistroCanal = { ok: !erro, destino: mascararDestino(canal, destino), em: agora.toISOString(), porEmail: porEmail.slice(0, 200) };
    if (erro) r.erro = erro.slice(0, 300);
    return r;
}

/** Já recebeu por este canal (envio que deu certo)? */
export const jaRecebeu = (h: HistoricoEnvios | null | undefined, fichaId: string, canal: CanalEnvio) => !!h?.get(fichaId)?.[canal]?.ok;

const dataHora = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const ROTULO_CANAL: Record<CanalEnvio, string> = { email: 'e-mail', whatsapp: 'WhatsApp' };

/** "e-mail em 12/10/2026 10:30 (b***@x.com, por ana@escritorio)"; a falha diz que não foi. */
export function textoDoEnvio(canal: CanalEnvio, r: RegistroCanal): string {
    const quem = `${r.destino}, por ${r.porEmail}`;
    return r.ok ? `${ROTULO_CANAL[canal]} em ${dataHora(r.em)} (${quem})` : `${ROTULO_CANAL[canal]} falhou em ${dataHora(r.em)} (${quem}): ${r.erro ?? 'erro'}`;
}

/**
 * Separa os destinatários do canal: os que vão agora e os que ficam porque já receberam. Com `incluirJaEnviados`,
 * vão todos.
 */
export function separarPorHistorico<T>(lista: T[], idFicha: (x: T) => string, h: HistoricoEnvios | null | undefined, canal: CanalEnvio, incluirJaEnviados: boolean): { enviar: T[]; jaEnviados: T[] } {
    const jaEnviados = lista.filter(x => jaRecebeu(h, idFicha(x), canal));
    return { enviar: incluirJaEnviados ? lista : lista.filter(x => !jaRecebeu(h, idFicha(x), canal)), jaEnviados };
}
