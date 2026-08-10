/**
 * services/departamentoGate.ts — o gate do SaaS neste módulo, em MODO AVISO.
 *
 * Desenho do Paulo (08/08): usuário unificado no CFI com DEPARTAMENTO
 * obrigatório; vinculado ao departamento, a pessoa abre o módulo. O vínculo
 * mora em `users.departamentos` DO CFI (projeto `consultorfiscalapp`) e é
 * gravado só pelo admin, no Gerenciar Usuários de lá.
 *
 * ESTE APP PERGUNTA PELO TÚNEL, DIRETO DO NAVEGADOR: o CFI aceita o token
 * Firebase deste projeto (`consultor-dp-folha`) na rota do cadastro central
 * (crossProjectAuth, lista explícita por rota) e o CORS de lá já conhece as
 * origens deste app. Não há segredo envolvido — a URL do CFI é pública, quem
 * autoriza é o token.
 *
 * A TABELA DE VERDADE É A MESMA dos gates do Contábil e da Legalização —
 * mudar um sem os outros faria os módulos responderem coisas diferentes à
 * mesma pessoa:
 *   - modo AVISO (default): sem vínculo = faixa âmbar com a ação; segue.
 *   - modo BLOQUEIO (VITE_DEPARTAMENTO_GATE_MODO=bloqueio no build): tranca
 *     com o motivo. Aqui a virada exige rebuild — o app é estático, não tem
 *     env de runtime como os irmãos de Cloud Run.
 *   - indeterminado LIBERA: túnel fora do ar, e-mail não verificado no CFI,
 *     CORS — nada disso pode trancar o escritório; vira log no console.
 */

const MODULO_DESTE_APP = 'dp-folha';
const MODULO_NOME = 'Consultor DP Folha de Pagamentos';
const CFI_URL = 'https://consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app';

export interface VereditoHorario {
    permitido?: boolean;
    mensagem?: string;
    janela?: string;
}

export interface GateDepartamento {
    permitido: boolean;
    modo: 'aviso' | 'bloqueio';
    indeterminado: boolean;
    aviso: string | null;
    motivo: string | null;
    /** Qual trava fechou a porta: cadeado fixo "sem vínculo" mentiria pra quem só está fora do horário. */
    bloqueio?: 'departamento' | 'horario';
    titulo?: string;
}

export function modoAtual(env: Record<string, string | undefined> = (import.meta as any).env ?? {}): 'aviso' | 'bloqueio' {
    return String(env.VITE_DEPARTAMENTO_GATE_MODO || 'aviso').trim().toLowerCase() === 'bloqueio'
        ? 'bloqueio' : 'aviso';
}

/**
 * TRAVA DE HORÁRIO (Paulo, 10/08): chega no MESMO corpo do túnel, no campo
 * `horario`, JÁ decidida pelo CFI — ele só devolve `permitido:false` quando a
 * chave-mestra dele (HORARIO_ACESSO_ATIVO=bloqueio) está armada. Por isso o
 * arme é ÚNICO e central; cabear este app agora é inócuo até o Paulo virar a
 * env no CFI. É INDEPENDENTE do VITE_DEPARTAMENTO_GATE_MODO. Admin já vem
 * liberado de lá; túnel fora do ar ⇒ sem `horario` ⇒ não barra.
 */
export function avaliarHorario(horario?: VereditoHorario | null): { bloqueia: boolean; mensagem: string | null } {
    if (!horario || horario.permitido !== false) return { bloqueia: false, mensagem: null };
    return {
        bloqueia: true,
        mensagem: horario.mensagem
            || `Acesso fora do horário permitido${horario.janela ? ` — seu acesso é ${horario.janela}` : ''}. `
                + 'Se precisar de exceção, fale com um administrador.',
    };
}

/** A decisão, pura — testável sem rede. Dobra as DUAS travas (depto + horário). */
export function decidirGate(
    { acesso, erro, modo }: { acesso?: { temAcesso: boolean; motivo?: string; horario?: VereditoHorario | null } | null; erro?: unknown; modo: 'aviso' | 'bloqueio' },
): GateDepartamento {
    if (erro || !acesso) {
        return {
            permitido: true, modo, indeterminado: true, aviso: null,
            motivo: erro ? String((erro as any)?.message || erro) : 'sem resposta do cadastro central',
        };
    }
    // Horário barra ANTES: trava armada no CFI, vale mesmo com departamento OK e
    // mesmo em modo aviso.
    const h = avaliarHorario(acesso.horario);
    if (h.bloqueia) {
        return {
            permitido: false, modo, indeterminado: false, aviso: null,
            motivo: h.mensagem, bloqueio: 'horario', titulo: 'Fora do horário de acesso',
        };
    }
    if (acesso.temAcesso) {
        return { permitido: true, modo, indeterminado: false, aviso: null, motivo: acesso.motivo || null };
    }
    const motivo = acesso.motivo || `Sem vínculo com o ${MODULO_NOME}.`;
    if (modo === 'bloqueio') {
        return {
            permitido: false, modo, indeterminado: false, aviso: null, motivo,
            bloqueio: 'departamento', titulo: `Sem vínculo com o módulo DP/Folha`,
        };
    }
    return {
        permitido: true, modo, indeterminado: false,
        aviso: motivo + ' Por enquanto o acesso continua liberado; em breve o vínculo será obrigatório.',
        motivo,
    };
}

/**
 * Consulta o túnel do CFI. Nunca lança: falha vira indeterminado (libera).
 * @param getToken função que devolve o ID token do usuário logado AQUI.
 */
export async function consultarGateDepartamento(
    email: string,
    getToken: () => Promise<string>,
    deps: { fetchImpl?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<GateDepartamento> {
    const modo = modoAtual(deps.env);
    const doFetch = deps.fetchImpl ?? fetch;
    try {
        const token = await getToken();
        const url = `${CFI_URL}/api/admin/cadastro/usuarios/${encodeURIComponent(email.trim().toLowerCase())}`
            + `?modulo=${MODULO_DESTE_APP}`;
        const resp = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const corpo = await resp.json().catch(() => ({}));
        if (!resp.ok || corpo?.ok !== true) {
            // 401/403 aqui inclui "e-mail não verificado no CFI" — indeterminado,
            // não "sem vínculo": afirmar a coisa errada mandaria a pessoa atrás
            // do admin por um problema que é de verificação de e-mail.
            return decidirGate({ erro: new Error(corpo?.error || `HTTP ${resp.status}`), modo });
        }
        return decidirGate({ acesso: { temAcesso: corpo.temAcesso === true, motivo: corpo.motivo, horario: corpo.horario }, modo });
    } catch (e) {
        return decidirGate({ erro: e, modo });
    }
}
