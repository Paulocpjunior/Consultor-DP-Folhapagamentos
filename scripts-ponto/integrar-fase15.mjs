// scripts-ponto/integrar-fase15.mjs
//
// Aplica as modificacoes da Fase 1.5 nos arquivos do projeto:
//  1. FolhaPanel.tsx: adiciona sub-aba "Validador ACJEF (teste)"
//     - amplia o type SubTab
//     - adiciona lazy import de ValidadorACJEFPanel
//     - adiciona botao na nav
//     - adiciona render condicional
//  2. ValidadorACJEFPanel.tsx: corrige nome do campo SAGE para codigoSage
//
// Cria backups (.bak) antes de qualquer modificacao.
// Idempotente: pode rodar varias vezes sem efeito duplicado.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const PATH_PANEL = "components/folha/FolhaPanel.tsx";
const PATH_VALIDADOR = "components/ponto/ValidadorACJEFPanel.tsx";

let totalChanges = 0;
let totalSkipped = 0;
let totalErrors = 0;

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function abortar(msg) {
  log("❌", msg);
  log("🔄", "Pra reverter qualquer mudanca aplicada antes do erro:");
  log("  ", `cp ${PATH_PANEL}.bak ${PATH_PANEL}`);
  log("  ", `cp ${PATH_VALIDADOR}.bak ${PATH_VALIDADOR}`);
  process.exit(1);
}

function aplicarPatch(arquivo, nome, padraoAntigo, padraoNovo, marcadorJaAplicado) {
  let conteudo = readFileSync(arquivo, "utf8");

  if (conteudo.includes(marcadorJaAplicado)) {
    log("⏭️ ", `${nome}: ja aplicado, pulando`);
    totalSkipped++;
    return;
  }

  if (!conteudo.includes(padraoAntigo)) {
    log("❌", `${nome}: padrao esperado nao encontrado em ${arquivo}`);
    log("  ", `Padrao procurado: ${padraoAntigo.substring(0, 80).replace(/\n/g, "\\n")}...`);
    totalErrors++;
    return;
  }

  conteudo = conteudo.replace(padraoAntigo, padraoNovo);
  writeFileSync(arquivo, conteudo, "utf8");
  log("✅", `${nome}: aplicado`);
  totalChanges++;
}

// ============================================================
// PRE-CHECK: arquivos existem?
// ============================================================

if (!existsSync(PATH_PANEL)) abortar(`Nao achei ${PATH_PANEL}. Voce esta na raiz do projeto?`);
if (!existsSync(PATH_VALIDADOR))
  abortar(
    `Nao achei ${PATH_VALIDADOR}. Copie o componente primeiro:\n` +
      `  mkdir -p components/ponto\n` +
      `  cp ~/Downloads/<pasta-baixada>/ValidadorACJEFPanel.tsx components/ponto/`
  );

// ============================================================
// BACKUP
// ============================================================

log("💾", "Criando backups...");
copyFileSync(PATH_PANEL, PATH_PANEL + ".bak");
copyFileSync(PATH_VALIDADOR, PATH_VALIDADOR + ".bak");
log("  ", `${PATH_PANEL}.bak`);
log("  ", `${PATH_VALIDADOR}.bak`);
console.log("");

// ============================================================
// PATCH 1: FolhaPanel.tsx — type SubTab
// ============================================================

aplicarPatch(
  PATH_PANEL,
  "1/4 SubTab type",
  "type SubTab = 'eventos' | 'apontamento';",
  "type SubTab = 'eventos' | 'apontamento' | 'validador-ponto';",
  "'validador-ponto'"
);

// ============================================================
// PATCH 2: FolhaPanel.tsx — lazy import
// ============================================================

aplicarPatch(
  PATH_PANEL,
  "2/4 Lazy import",
  "const ApontamentoFolhaPanel = lazy(() => import('./ApontamentoFolhaPanel'));",
  "const ApontamentoFolhaPanel = lazy(() => import('./ApontamentoFolhaPanel'));\nconst ValidadorACJEFPanel = lazy(() => import('../ponto/ValidadorACJEFPanel'));",
  "ValidadorACJEFPanel = lazy"
);

// ============================================================
// PATCH 3: FolhaPanel.tsx — botao na nav
// ============================================================

const botaoAntigo = `                    <span className="mr-1">📚</span>
                    Catálogo de Eventos
                </button>
            </div>`;

const botaoNovo = `                    <span className="mr-1">📚</span>
                    Catálogo de Eventos
                </button>
                <button
                    onClick={() => setSub('validador-ponto')}
                    className={\`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors \${
                        sub === 'validador-ponto'
                            ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }\`}
                >
                    <span className="mr-1">🕐</span>
                    Validador ACJEF (teste)
                </button>
            </div>`;

aplicarPatch(PATH_PANEL, "3/4 Botao na nav", botaoAntigo, botaoNovo, "Validador ACJEF (teste)");

// ============================================================
// PATCH 4: FolhaPanel.tsx — render condicional
// ============================================================

const renderAntigo = `                {sub === 'apontamento' && sessao && (
                    <ApontamentoFolhaPanel
                        currentUser={currentUser}
                        sessao={sessao}
                        onTrocarEmpresa={() => setSessao(null)}
                    />
                )}
            </Suspense>`;

const renderNovo = `                {sub === 'apontamento' && sessao && (
                    <ApontamentoFolhaPanel
                        currentUser={currentUser}
                        sessao={sessao}
                        onTrocarEmpresa={() => setSessao(null)}
                    />
                )}

                {sub === 'validador-ponto' && (
                    <ValidadorACJEFPanel currentUser={currentUser} />
                )}
            </Suspense>`;

aplicarPatch(PATH_PANEL, "4/4 Render condicional", renderAntigo, renderNovo, "<ValidadorACJEFPanel");

// ============================================================
// PATCH 5: ValidadorACJEFPanel.tsx — corrigir codigoSage
// ============================================================

const sageAntigo = `      (empresa as any).cadastroSAGE ||
      (empresa as any).empresaSAGE ||
      (empresa as any).codigoSAGE ||
      '';`;

const sageNovo = `      (empresa as any).codigoSage ||
      (empresa as any).cadastroSAGE ||
      (empresa as any).empresaSAGE ||
      (empresa as any).codigoSAGE ||
      '';`;

aplicarPatch(
  PATH_VALIDADOR,
  "5/5 codigoSage no Validador",
  sageAntigo,
  sageNovo,
  "(empresa as any).codigoSage ||"
);

// ============================================================
// RESULTADO
// ============================================================

console.log("");
console.log("=".repeat(60));
log("📊", `Resumo: ${totalChanges} aplicado(s), ${totalSkipped} pulado(s), ${totalErrors} erro(s)`);

if (totalErrors > 0) {
  abortar(`Houve ${totalErrors} erro(s). Verifique manualmente os arquivos.`);
}

if (totalChanges === 0 && totalSkipped > 0) {
  log("✅", "Nada a fazer — todas as modificacoes ja estavam aplicadas.");
} else {
  log("✅", "Integracao concluida com sucesso!");
  console.log("");
  log("👉", "Proximo passo: type-check");
  log("  ", "npx tsc --noEmit 2>&1 | grep -E 'components/ponto/|services/ponto/|services/exportador/(eventBus|merger)|types/ponto' || echo 'Zero erros nos arquivos do ponto'");
  console.log("");
  log("🔄", "Pra reverter (se algo deu errado depois):");
  log("  ", `cp ${PATH_PANEL}.bak ${PATH_PANEL}`);
  log("  ", `cp ${PATH_VALIDADOR}.bak ${PATH_VALIDADOR}`);
  console.log("");
  log("🗑️ ", "Pra deletar backups (depois de confirmar que tudo funciona):");
  log("  ", `rm ${PATH_PANEL}.bak ${PATH_VALIDADOR}.bak`);
}
