import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(readFileSync("./service-account.json", "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const raw = JSON.parse(readFileSync("./seed-ponto/acjef_p1510_v1.json", "utf8"));

function cleanMeta(obj) {
  if (Array.isArray(obj)) return obj.map(cleanMeta);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_")) continue;
      out[k] = cleanMeta(v);
    }
    return out;
  }
  return obj;
}

const modelo = cleanMeta(raw);
modelo.createdAt = Date.now();
modelo.updatedAt = Date.now();

console.log(`\nCadastrando modelo "${modelo.id}"...`);
console.log(`  nome:           ${modelo.nome}`);
console.log(`  fabricante:     ${modelo.fabricante}`);
console.log(`  formato:        ${modelo.formato}`);
console.log(`  schemas:        ${modelo.schemas?.length || 0} tipos de registro`);
console.log(`  deParaEventos:  ${Object.keys(modelo.deParaEventos || {}).length} mapeamentos`);

await db.collection("ponto_modelos").doc(modelo.id).set(modelo);

const snap = await db.collection("ponto_modelos").doc(modelo.id).get();
const saved = snap.data();
console.log(`\n✅ Salvo em ponto_modelos/${modelo.id}`);
console.log(`   Tipos de registro confirmados:`);
for (const s of saved.schemas || []) {
  console.log(`     tipo ${s.tipo} (${s.nome}) — ${s.campos.length} campos${s.ehEvento ? " [EVENTO]" : ""}`);
}
process.exit(0);
