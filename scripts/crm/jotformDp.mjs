// scripts/crm/jotformDp.mjs
//
// CRM do DP no Jotform (tabela do formulário "Controle DP RH_2022") → Consultor DP.
// Parte pura: transforma cada linha da tabela num registro por empresa (CNPJ, código SAGE,
// colaborador responsável e particularidades). Usada pelo job de sincronização
// (scripts/crm/sincronizarCrmJotform.mjs) e pelos testes.

export const FORM_DP = '213255365041650';

const texto = v => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.map(texto).filter(Boolean).join(', ') : '');
const lista = v => (Array.isArray(v) ? v.map(x => texto(x)).filter(Boolean) : typeof v === 'string' && v.trim() ? [v.trim()] : []);
const digitos = v => texto(v).replace(/\D/g, '');

/** As respostas vêm como objeto (API) ou texto JSON (algumas integrações). */
export function respostas(sub) {
    const a = typeof sub.answers === 'string' ? JSON.parse(sub.answers) : sub.answers ?? {};
    const porNome = {};
    for (const v of Object.values(a)) if (v && typeof v === 'object' && v.name && !(v.name in porNome)) porNome[v.name] = v;
    return porNome;
}

/** Colaboradores que o campo de responsável conhece (id → nome e e-mail), juntando todas as linhas. */
export function colaboradoresDasOpcoes(subs) {
    const out = {};
    for (const s of subs) {
        const c = respostas(s).colaborador;
        if (!c?.options_array) continue;
        let opts = {};
        try { opts = JSON.parse(c.options_array); } catch { continue; }
        for (const [id, o] of Object.entries(opts)) {
            if (!o?.value) continue;
            out[id] = { nome: texto(o.value.text), email: texto(o.resourceDetails?.email ?? o.value.subText).toLowerCase(), removido: !!o.isDeleted };
        }
    }
    return out;
}

/**
 * Uma linha da tabela → registro da empresa, ou null (linha apagada/arquivada ou sem CNPJ/CPF).
 * O documento é o CNPJ (14 dígitos) ou o CPF/CAEPF da doméstica ou do produtor.
 */
export function empresaDaLinha(sub, conhecidos = {}) {
    if (sub.status === 'DELETED' || sub.status === 'ARCHIVED') return null;
    const r = respostas(sub);
    const documento = digitos(r.insiraUma?.answer) || digitos(r.cnpjcpfcei?.answer);
    if (![11, 14].includes(documento.length)) return null;
    const ids = lista(r.colaborador?.answer).map(x => x.replace(/[{}]/g, ''));
    const id = ids.find(i => i !== '__OWNER__') ?? ids[0] ?? '';
    const k = conhecidos[id];
    return {
        documento,
        codigoSage: digitos(r.codigo?.answer),
        nome: texto(r.empresa?.answer),
        tributacao: texto(r.tributaCAo?.answer),
        fechamento: lista(r.fechamento?.answer),
        adiantamento: texto(r.adiantamento?.answer).toUpperCase(),
        diaPagamento: texto(r.dataPagamento45?.answer),
        valeTransporte: texto(r.vtE?.answer).toUpperCase(),
        desoneracao: texto(r.desoneraCAo?.answer).toUpperCase(),
        sindicatos: lista(r.sindicato?.answer),
        dissidio: texto(r.dissidio?.answer),
        particularidades: texto(r.observaCAoFechamento?.answer),
        colaborador: id ? { jotformId: id, nome: k?.nome ?? '', email: k?.email ?? '' } : null,
        jotformId: String(sub.id),
        atualizadoNoJotform: texto(sub.updated_at) || texto(sub.created_at),
    };
}

/** Todas as linhas → empresas por documento (a linha mais recente vence quando o CNPJ se repete) e o resumo dos colaboradores. */
export function consolidar(subs) {
    const conhecidos = colaboradoresDasOpcoes(subs);
    const porDoc = new Map();
    for (const s of subs) {
        const e = empresaDaLinha(s, conhecidos);
        if (!e) continue;
        const antes = porDoc.get(e.documento);
        if (!antes || antes.atualizadoNoJotform < e.atualizadoNoJotform) porDoc.set(e.documento, e);
    }
    const resumo = new Map();
    for (const e of porDoc.values()) {
        const id = e.colaborador?.jotformId ?? '';
        const r = resumo.get(id) ?? { jotformId: id, nome: e.colaborador?.nome ?? '', email: e.colaborador?.email ?? '', empresas: 0, exemplos: [] };
        r.empresas++;
        if (r.exemplos.length < 3) r.exemplos.push(e.nome);
        resumo.set(id, r);
    }
    return { empresas: [...porDoc.values()], colaboradores: [...resumo.values()].sort((a, b) => b.empresas - a.empresas) };
}
