#!/usr/bin/env python3
"""
patch-snapshot-arquivo.py

Aplica o fix do bug em que handleExportar usa `resultado` de uma sessão antiga
quando o usuário troca de arquivo/empresa sem clicar em Processar de novo.

A solução: snapshot do arquivo (nome+size+lastModified) na hora do processamento.
Se o arquivo atual não bate com o snapshot, bloqueia export com mensagem clara.
"""

import sys
from pathlib import Path

PATH = Path('components/folha/ApontamentoFolhaPanel.tsx')

if not PATH.exists():
    print(f"❌ Não achei {PATH}. Roda da raiz do projeto.")
    sys.exit(1)

txt = PATH.read_text()
original = txt

# ─── 1. Adiciona helper de snapshot logo após os imports ──────────────────
HELPER = '''
// FIX v2.1.4 — Snapshot do arquivo pra detectar "exportar sem reprocessar"
function snapshotDoArquivo(f: File | null): string | null {
    if (!f) return null;
    return `${f.name}::${f.size}::${f.lastModified}`;
}
'''

# Acha o ponto após o último import — antes da declaração do componente
import_marker = 'const ApontamentoFolhaPanel'
if HELPER.strip() not in txt:
    if import_marker in txt:
        txt = txt.replace(import_marker, HELPER + '\n' + import_marker)
        print("✅ Helper snapshotDoArquivo adicionado")
    else:
        print("⚠️  Não achei 'const ApontamentoFolhaPanel' — abortando")
        sys.exit(1)
else:
    print("ℹ️  Helper já existia")

# ─── 2. Adiciona useState do snapshot depois de useState do parsed ────────
NOVO_STATE = "    const [snapshotArqProcessado, setSnapshotArqProcessado] = useState<string | null>(null);"

# Procura por declaração de useState de parsed/resultado pra encaixar perto
state_anchor = "const [parsed, setParsed] = useState"
if NOVO_STATE.strip() not in txt:
    # Acha a linha do anchor e adiciona depois
    lines = txt.split('\n')
    novo = []
    inserido = False
    for line in lines:
        novo.append(line)
        if not inserido and state_anchor in line:
            novo.append(NOVO_STATE)
            inserido = True
            print("✅ useState snapshotArqProcessado adicionado")
    if not inserido:
        print(f"⚠️  Não achei '{state_anchor}' — adiciona manualmente")
    txt = '\n'.join(novo)
else:
    print("ℹ️  useState do snapshot já existia")

# ─── 3. Reseta snapshot no INÍCIO de handleProcessar ──────────────────────
RESET_PROCESSAR = "setResultado(null);"
RESET_PROCESSAR_NEW = "setResultado(null);\n        setSnapshotArqProcessado(null);"
if RESET_PROCESSAR_NEW not in txt and txt.count(RESET_PROCESSAR) >= 1:
    # Só substitui a PRIMEIRA ocorrência (que é em handleProcessar)
    idx = txt.find(RESET_PROCESSAR)
    txt = txt[:idx] + RESET_PROCESSAR_NEW + txt[idx + len(RESET_PROCESSAR):]
    print("✅ Reset do snapshot em handleProcessar adicionado")
else:
    print("ℹ️  Reset em handleProcessar já existia ou âncora não encontrada")

# ─── 4. Marca arquivo como processado nos caminhos de sucesso ─────────────
# Caminho template padrão: depois do setMatriculasEdit({})
TPL_OLD = "setMatriculasEdit({});\n                setMsg("
TPL_NEW = "setMatriculasEdit({});\n                setSnapshotArqProcessado(snapshotDoArquivo(file));\n                setMsg("
if TPL_NEW not in txt and TPL_OLD in txt:
    txt = txt.replace(TPL_OLD, TPL_NEW, 1)
    print("✅ Snapshot marcado após template padrão")
else:
    print("ℹ️  Snapshot do template padrão já estava ou âncora difere — vai precisar revisar manualmente os outros caminhos (INPLAF, autônomos, legado)")

# ─── 5. Validação no handleExportar ───────────────────────────────────────
EXP_OLD = "if (!usaResultadoDireto && !usaLegado) return;\n        setProcessando(true);"
EXP_NEW = '''if (!usaResultadoDireto && !usaLegado) return;

        // FIX v2.1.4 — Garante que o `resultado` em memória é do arquivo ATUAL.
        // Sem essa validação, trocar o arquivo no input (ou trocar de empresa)
        // sem clicar em "Processar" exporta dados velhos com configuração nova.
        const snapAtual = snapshotDoArquivo(file);
        if (!snapshotArqProcessado || snapshotArqProcessado !== snapAtual) {
            setErro(
                '⚠️ O arquivo no input foi alterado (ou nunca processado) desde o último "Processar". ' +
                'Clique em "Processar" novamente antes de exportar para evitar exportar dados desatualizados.'
            );
            return;
        }

        setProcessando(true);'''
if EXP_NEW.split('\n')[2] not in txt and EXP_OLD in txt:
    txt = txt.replace(EXP_OLD, EXP_NEW, 1)
    print("✅ Validação de snapshot em handleExportar adicionada")
else:
    print("⚠️  Validação em handleExportar já existia ou âncora difere")

# ─── Salva ────────────────────────────────────────────────────────────────
if txt != original:
    PATH.write_text(txt)
    print(f"\n✅ Patch aplicado em {PATH}")
    print("   Diff resumido:")
    print(f"   - {original.count(chr(10))} linhas → {txt.count(chr(10))} linhas")
else:
    print("\nℹ️  Nada mudou — patch já estava aplicado ou âncoras não bateram")
