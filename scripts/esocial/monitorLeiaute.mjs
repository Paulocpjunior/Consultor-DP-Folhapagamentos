// scripts/esocial/monitorLeiaute.mjs
//
// Job do GitHub Actions (.github/workflows/esocial-leiaute.yml): confere a documentação técnica do eSocial,
// grava em esocial_monitor/documentacao os links relevantes, as versões de leiaute citadas e as novidades desde
// a última verificação. Com GEMINI_API_KEY, resume cada novidade para o DP (marcado como resumo de IA, para
// conferir). Nada é aplicado sozinho: troca de leiaute é feita por gente, com os testes (public/esocial-xsd/LEIAME.md).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { linksRelevantes, novidades, textoDaPagina, versoesCitadas } from './leiauteEsocial.mjs';

const CONTA = process.env.FIREBASE_SERVICE_ACCOUNT;
const GEMINI = process.env.GEMINI_API_KEY;
const MODELO = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PAGINAS = (process.env.ESOCIAL_PAGINAS || 'https://www.gov.br/esocial/pt-br/documentacao-tecnica').split(',');
if (!CONTA) { console.log('::warning::Sem FIREBASE_SERVICE_ACCOUNT: monitor do leiaute não gravado.'); process.exit(0); }

const baixar = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'ConsultorDP-monitor/1.0' } }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.text(); };

async function resumir(item) {
    if (!GEMINI) return null;
    let texto = '';
    try { if (!/\.(pdf|zip|xsd)(\?|$)/i.test(item.url)) texto = textoDaPagina(await baixar(item.url)); } catch { /* sem a página: resume pelo título */ }
    const prompt = `Você ajuda o departamento pessoal de um escritório contábil. A documentação técnica do eSocial publicou: "${item.titulo}" (${item.url}).\n${texto ? `Texto da página:\n${texto}\n` : ''}Em português, em até 5 tópicos curtos, diga o que muda para folha de pagamento e transmissão do eSocial. Não invente: se o texto não mostrar o conteúdo, diga que é preciso abrir o documento.`;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${GEMINI}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim().slice(0, 3000) || null;
}

const db = getFirestore(initializeApp({ credential: cert(JSON.parse(CONTA)) }));
const ref = db.doc('esocial_monitor/documentacao');
const antes = (await ref.get()).data() ?? {};
try {
    const itens = [];
    for (const p of PAGINAS) itens.push(...linksRelevantes(await baixar(p.trim()), p.trim()));
    const unicos = [...new Map(itens.map(i => [i.url, i])).values()];
    // Página sem nenhum link reconhecido: a estrutura mudou ou veio uma página de erro. Não sobrescreve a lista boa.
    if (!unicos.length) throw new Error('Nenhum link de leiaute, nota técnica ou XSD na página da documentação técnica (a página mudou?).');
    const primeiraVez = !antes.itens?.length;
    const novos = primeiraVez ? [] : novidades(unicos, antes.itens);
    const resumidos = [];
    for (const n of novos.slice(0, 5)) resumidos.push({ ...n, detectadoEm: new Date().toISOString(), resumo: await resumir(n), resumoModelo: GEMINI ? MODELO : null });
    await ref.set({
        verificadoEm: FieldValue.serverTimestamp(), paginas: PAGINAS, itens: unicos.slice(0, 400), versoes: versoesCitadas(unicos),
        novidades: [...resumidos, ...(antes.novidades ?? [])].slice(0, 30), erro: null,
    }, { merge: true });
    console.log(`${unicos.length} link(s); ${primeiraVez ? 'primeira verificação' : `${novos.length} novidade(s)`}; versões: ${versoesCitadas(unicos).join(', ') || '—'}`);
} catch (e) {
    await ref.set({ verificadoEm: FieldValue.serverTimestamp(), erro: String(e?.message ?? e).slice(0, 500) }, { merge: true });
    console.log(`::warning::Monitor do leiaute: ${e?.message ?? e}`);
}
