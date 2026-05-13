// disable-regra-salario-clientes-sage-auto.mjs
//
// Aplica regra_salario: null em mapeamentos de clientes onde sabidamente
// o IOB SAGE calcula o salário automaticamente pelo cadastro (não precisa
// do evento 0001 com 30 dias de referência).
//
// Lista vem da memória do projeto:
//   - 60882552000100  Cadeiras Gennaro Ferrante LTDA       (SAGE 1374)
//   - 44687819000144  Ferrante Design LTDA                 (SAGE 1373)
//   - 48079794000157  Ferrante Móveis e Equip. LTDA        (SAGE 1375)
//   - 69259356000140  SPA Saúde                            (SAGE 0903)
//   - 02986671000107  SINTESE SERVICOS S/S LTDA            (SAGE 0095)
//
// Sem essa correção, esses 5 clientes recebem 1 linha de 0001 SALÁRIO
// fantasma por funcionário (30 dias × 0 reais) ressuscitada pela migração
// silenciosa de folhaFirestoreService.getMapeamento. O SAGE ignora porque
// o valor é zero, mas é ruído no TXT.
//
// Idempotente: rodar várias vezes mantém o mesmo estado final (null).
//
// Uso: cd ~/Consultor-DP-Folhapagamentos && node disable-regra-salario-clientes-sage-auto.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const CLIENTES = [
    { cnpj: '60882552000100', nome: 'Cadeiras Gennaro Ferrante LTDA', sage: '1374' },
    { cnpj: '44687819000144', nome: 'Ferrante Design LTDA',          sage: '1373' },
    { cnpj: '48079794000157', nome: 'Ferrante Móveis e Equip. LTDA', sage: '1375' },
    { cnpj: '69259356000140', nome: 'SPA Saúde',                     sage: '0903' },
    { cnpj: '02986671000107', nome: 'SINTESE SERVICOS S/S LTDA',     sage: '0095' },
];

let aplicados = 0;
let jaOk = 0;
let ausentes = 0;

for (const c of CLIENTES) {
    const ref = db.collection('folha_mapeamentos').doc(c.cnpj);
    const snap = await ref.get();

    if (!snap.exists) {
        console.log(`⚠️  ${c.cnpj} (${c.nome}): documento não existe no Firestore. Pulado.`);
        ausentes++;
        continue;
    }

    const d = snap.data();
    const rsAntes = d.regra_salario;

    if (rsAntes === null) {
        console.log(`✓ ${c.cnpj} (${c.nome}): já está null. Sem ação.`);
        jaOk++;
        continue;
    }

    console.log(`→ ${c.cnpj} (${c.nome} · SAGE ${c.sage}):`);
    console.log(`     regra_salario antes: ${JSON.stringify(rsAntes)}`);
    console.log(`     ação: gravando null`);

    await ref.update({
        regra_salario: null,
        observacoes: admin.firestore.FieldValue.arrayUnion(
            `[${new Date().toISOString()}] disable-regra-salario v1.0: SAGE calcula ` +
            `salário automaticamente, regra_salario definida como null pra evitar ` +
            `migração silenciosa de getMapeamento ressuscitar o default 0001.`,
        ),
    });
    aplicados++;
}

console.log('');
console.log('─────────────────────────────────────────');
console.log(`Resumo:`);
console.log(`  ✓ Aplicados: ${aplicados}`);
console.log(`  ✓ Já estavam ok (null): ${jaOk}`);
console.log(`  ⚠ Não encontrados: ${ausentes}`);
console.log(`  Total processados: ${CLIENTES.length}`);
console.log('─────────────────────────────────────────');

process.exit(0);
