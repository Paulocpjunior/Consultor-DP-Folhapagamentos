// scripts/crm/sincronizarCrmJotform.mjs
//
// Job do GitHub Actions (.github/workflows/crm-jotform.yml): lê a tabela do CRM do DP no Jotform
// e grava no Firestore crm_dp/{documento} (CNPJ ou CPF) e crm_dp_meta/sincronizacao.
// Precisa dos segredos JOTFORM_API_KEY e FIREBASE_SERVICE_ACCOUNT (conta com gravação no Firestore).
// Empresas que saíram da tabela ficam marcadas com ativoNoCrm: false (nada se apaga).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { consolidar, FORM_DP } from './jotformDp.mjs';

const BASE = process.env.JOTFORM_API_BASE || 'https://api.jotform.com';
const CHAVE = process.env.JOTFORM_API_KEY;
const CONTA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!CHAVE || !CONTA) { console.log('::warning::Sem JOTFORM_API_KEY ou FIREBASE_SERVICE_ACCOUNT: CRM não sincronizado.'); process.exit(0); }

async function linhas() {
    const out = [];
    for (let offset = 0; ; offset += 500) {
        const r = await fetch(`${BASE}/form/${FORM_DP}/submissions?limit=500&offset=${offset}`, { headers: { APIKEY: CHAVE } });
        if (!r.ok) throw new Error(`Jotform respondeu ${r.status}`);
        const lote = (await r.json()).content ?? [];
        out.push(...lote);
        if (lote.length < 500) return out;
    }
}

/** Nomes dos responsáveis que a lista do campo não traz (atribuídos pela tabela): tenta a API de equipe/sub-usuários. */
async function nomesExtras() {
    const nomes = {};
    for (const caminho of ['/user/sub-users', '/team/user/me/members']) {
        try {
            const r = await fetch(`${BASE}${caminho}`, { headers: { APIKEY: CHAVE } });
            if (!r.ok) continue;
            const c = (await r.json()).content;
            for (const u of Array.isArray(c) ? c : Object.values(c ?? {})) {
                const id = String(u.id ?? u.userID ?? u.member_id ?? '');
                if (id) nomes[id] = { nome: String(u.name ?? u.username ?? ''), email: String(u.email ?? '').toLowerCase() };
            }
        } catch { /* sem a rota nesta conta */ }
    }
    return nomes;
}

const db = getFirestore(initializeApp({ credential: cert(JSON.parse(CONTA)) }));
const subs = await linhas();
const { empresas, colaboradores } = consolidar(subs);
const extras = await nomesExtras();
for (const e of empresas) if (e.colaborador && !e.colaborador.nome && extras[e.colaborador.jotformId]) Object.assign(e.colaborador, extras[e.colaborador.jotformId]);
for (const c of colaboradores) if (!c.nome && extras[c.jotformId]) Object.assign(c, extras[c.jotformId]);

const agora = FieldValue.serverTimestamp();
const atuais = new Set(empresas.map(e => e.documento));
let lote = db.batch(); let n = 0;
const enviar = async () => { if (n) { await lote.commit(); lote = db.batch(); n = 0; } };
for (const e of empresas) {
    lote.set(db.doc(`crm_dp/${e.documento}`), { ...e, ativoNoCrm: true, sincronizadoEm: agora });
    if (++n === 400) await enviar();
}
for (const d of (await db.collection('crm_dp').where('ativoNoCrm', '==', true).get()).docs) {
    if (!atuais.has(d.id)) { lote.update(d.ref, { ativoNoCrm: false, sincronizadoEm: agora }); if (++n === 400) await enviar(); }
}
lote.set(db.doc('crm_dp_meta/sincronizacao'), { em: agora, linhas: subs.length, empresas: empresas.length, colaboradores, formulario: FORM_DP });
n++;
await enviar();
console.log(`CRM do DP: ${empresas.length} empresas de ${subs.length} linhas; ${colaboradores.length} responsáveis.`);
