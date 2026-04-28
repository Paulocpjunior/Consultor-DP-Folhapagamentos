# PATCH — ApontamentoFolhaPanel.tsx

Edita `components/folha/ApontamentoFolhaPanel.tsx` em 5 lugares.

---

## 1) IMPORTS — adicionar no topo (depois dos imports atuais)

Localiza o último `import` no topo do arquivo e adiciona DEPOIS dele:

```typescript
import type { LayoutFolha } from '../../types/layoutFolha';
import { getLayoutFolha, saveMatriculasLayout } from '../../services/layoutFolhaService';
import { processWithLayout } from '../../services/folhaProcessor';
import WizardMapeamento from './WizardMapeamento';
```

---

## 2) ESTADOS — adicionar 3 estados novos

Encontra a região onde os `useState` estão definidos (logo depois de `const ApontamentoFolhaPanel: ... = ({ currentUser, sessao, onTrocarEmpresa }) => {`).
Adiciona DEPOIS do último `useState` existente, ANTES do primeiro `useEffect`:

```typescript
    // — modo "layout próprio" (1 empresa por arquivo) —
    const [layoutAtivo, setLayoutAtivo] = useState<LayoutFolha | null>(null);
    const [showWizard, setShowWizard] = useState(false);
    const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);
```

---

## 3) handleProcessar — SUBSTITUIR INTEIRO

Localiza o `const handleProcessar = async () => { ... };` e substitui por:

```typescript
    const handleProcessar = async () => {
        if (!file) {
            alert('Selecione a planilha xlsx primeiro.');
            return;
        }
        setProcessando(true);
        setErro(null);
        setMsg('');
        setResultado(null);
        setLayoutAtivo(null);

        try {
            // 1. Tenta carregar layout próprio da empresa selecionada
            const cnpj = sessao.empresa.cnpj;
            const layout = await getLayoutFolha(cnpj);

            if (layout) {
                // MODO LAYOUT — 1 empresa, layout salvo
                const buffer = await file.arrayBuffer();
                const { parsed: p, resultado: r } = await processWithLayout(buffer, layout);
                setParsed(p);
                setResultado(r);
                setLayoutAtivo(layout);
                setEmpresaAtiva(p.empresas[0]?.nome ?? null);
                setMatriculasEdit({});
                const totalFunc = p.empresas[0]?.funcionarios.length ?? 0;
                setMsg(
                    `Planilha processada (layout salvo): ${totalFunc} funcionário(s) · ${r.lancamentos.length} lançamento(s).`
                );
                return;
            }

            // 2. Sem layout: se empresa selecionada existe, abre wizard
            if (sessao.empresa.cnpj) {
                const buffer = await file.arrayBuffer();
                setPendingBuffer(buffer);
                setShowWizard(true);
                return;
            }

            // 3. Fallback: parser clássico (multi-empresa por aba)
            const p = await parseApontamentoFile(file);
            setParsed(p);
            setEmpresaAtiva(p.empresas[0]?.nome ?? null);
            setMatriculasEdit({});
            setMsg(
                `Planilha processada: ${p.empresas.reduce(
                    (a, e) => a + e.funcionarios.length,
                    0
                )} funcionário(s) em ${p.empresas.length} empresa(s).`
            );
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setProcessando(false);
        }
    };
```

---

## 4) handleExportar — ADICIONAR BRANCH NO INÍCIO

No `const handleExportar = async () => { ... }`, **logo depois** do `setProcessando(true); setErro(null); setMsg('');`, adiciona ANTES do `try`:

Localiza essa parte:
```typescript
    const handleExportar = async () => {
        if (!parsed || !mapa) return;
        setProcessando(true);
        setErro(null);
        setMsg('');
        try {
```

E TROCA por:
```typescript
    const handleExportar = async () => {
        // MODO LAYOUT — exporta direto sem montarLancamentos
        if (layoutAtivo && resultado) {
            setProcessando(true);
            setErro(null);
            setMsg('');
            try {
                // mescla matrículas digitadas em sessão
                const matsEdits = matriculasEdit[layoutAtivo.razaoSocial] ?? {};
                const matsNorm: Record<string, string> = {};
                for (const [nome, mat] of Object.entries(matsEdits)) {
                    if (mat && mat.trim()) matsNorm[nome.toUpperCase()] = mat.trim();
                }

                const lancamentosComMat = resultado.lancamentos.map((l) => ({
                    ...l,
                    matricula:
                        l.matricula ??
                        matsNorm[l.funcionario.toUpperCase()] ??
                        layoutAtivo.matriculas?.[l.funcionario.toUpperCase()] ??
                        null,
                }));

                if (Object.keys(matsNorm).length > 0) {
                    try {
                        await saveMatriculasLayout(layoutAtivo.cnpj, matsNorm);
                    } catch (e) {
                        console.warn('Falha ao salvar matrículas do layout:', e);
                    }
                }

                const compMMAAAA = competencia.replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
                const txt = exportarTXT(lancamentosComMat);
                const nomeArq = nomeArquivoTXT(layoutAtivo.razaoSocial, flag, compMMAAAA);
                downloadFile(nomeArq, txt, 'text/plain;charset=utf-8');

                const valorTotal = lancamentosComMat.reduce((s, l) => s + (Number(l.valor) || 0), 0);
                const funcSet = new Set(lancamentosComMat.map((l) => l.funcionario));

                await addHistorico({
                    cliente: layoutAtivo.razaoSocial,
                    competencia,
                    timestamp: new Date().toISOString(),
                    totalLancamentos: lancamentosComMat.length,
                    totaisPorEmpresa: {
                        [layoutAtivo.razaoSocial]: {
                            funcionarios: funcSet.size,
                            lancamentos: lancamentosComMat.length,
                            valorTotal: Math.round(valorTotal * 100) / 100,
                        },
                    },
                    alertas: resultado.alertas,
                });

                setMsg(
                    `✓ TXT exportado: ${nomeArq} · ${lancamentosComMat.length} lançamento(s) · ${funcSet.size} funcionário(s).`
                );
            } catch (e) {
                setErro(e instanceof Error ? e.message : String(e));
            } finally {
                setProcessando(false);
            }
            return;
        }

        // MODO CLÁSSICO (IRB-GROUP — multi-empresa por aba)
        if (!parsed || !mapa) return;
        setProcessando(true);
        setErro(null);
        setMsg('');
        try {
```

(O `try {` final continua sendo o mesmo do código original — não duplica o `try`, só substitui as linhas de cima.)

---

## 5) JSX DO WIZARD — adicionar antes do fechamento do return

No JSX de retorno do componente, antes do `</div>` final (ou wrapper externo do componente), adiciona:

```tsx
            {showWizard && pendingBuffer && file && (
                <WizardMapeamento
                    empresa={{
                        cnpj: sessao.empresa.cnpj,
                        cnpjFormatted: sessao.empresa.cnpj.replace(
                            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                            '$1.$2.$3/$4-$5'
                        ),
                        razaoSocial: sessao.empresa.razaoSocial,
                        empresaSAGE: sessao.empresa.codigoSage,
                    }}
                    fileBuffer={pendingBuffer}
                    fileName={file.name}
                    tipo={sessao.tipo}
                    createdBy={(currentUser as any).username ?? (currentUser as any).uid ?? 'unknown'}
                    onCancel={() => {
                        setShowWizard(false);
                        setPendingBuffer(null);
                    }}
                    onSaved={async (layout) => {
                        setShowWizard(false);
                        // Processa imediatamente com o layout recém-salvo
                        try {
                            setProcessando(true);
                            const { parsed: p, resultado: r } = await processWithLayout(
                                pendingBuffer!,
                                layout
                            );
                            setParsed(p);
                            setResultado(r);
                            setLayoutAtivo(layout);
                            setEmpresaAtiva(p.empresas[0]?.nome ?? null);
                            setMatriculasEdit({});
                            setMsg(
                                `Layout salvo · ${p.empresas[0]?.funcionarios.length ?? 0} funcionário(s) · ${r.lancamentos.length} lançamento(s).`
                            );
                        } catch (e) {
                            setErro(e instanceof Error ? e.message : String(e));
                        } finally {
                            setProcessando(false);
                            setPendingBuffer(null);
                        }
                    }}
                />
            )}
```

---

## 6) CSS DO WIZARD — adicionar no index.css (ou tailwind.css)

```css
.wizard-overlay {
    position: fixed; inset: 0;
    background: rgba(20,19,15,.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 20px;
}
.wizard-modal {
    background: #fff; color: #14130f;
    border-radius: 14px; padding: 24px;
    width: min(1100px, 100%); max-height: 90vh; overflow: auto;
    box-shadow: 0 18px 48px rgba(0,0,0,.25);
}
.dark .wizard-modal { background: #1f1d19; color: #f3efe4; }
.wizard-header h2 { margin: 0 0 4px; font-size: 1.25rem; font-weight: 600; }
.wizard-header .muted { color: #8a8779; font-size: .85rem; margin: 2px 0; }
.wizard-section { margin: 18px 0; }
.wizard-section h3 { margin: 0 0 8px; font-size: 1rem; font-weight: 600; }
.wizard-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
.wizard-table th, .wizard-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e3e0d6; }
.wizard-table th { font-weight: 600; background: #f6f5f1; }
.dark .wizard-table th { background: #2a2722; }
.dark .wizard-table th, .dark .wizard-table td { border-color: #2a2722; }
.wizard-table tr.is-name-col { background: #e8eaff; }
.dark .wizard-table tr.is-name-col { background: #1d1f3a; }
.wizard-table .badge {
    background: #2b3aff; color: #fff; padding: 2px 8px;
    border-radius: 4px; font-size: .75rem;
}
.wizard-table input, .wizard-table select {
    border: 1px solid #c9c5b6; border-radius: 6px;
    padding: 4px 8px; font-size: .9rem; width: 100%;
    background: #fff; color: inherit;
}
.dark .wizard-table input, .dark .wizard-table select {
    background: #14130f; border-color: #3d3933; color: #f3efe4;
}
.wizard-footer {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 16px; border-top: 1px solid #e3e0d6;
    gap: 10px;
}
.wizard-footer button {
    padding: 8px 16px; margin-left: 8px;
    border: 1px solid #c9c5b6; background: #fff; color: inherit;
    border-radius: 6px; cursor: pointer; font-size: .9rem;
}
.dark .wizard-footer button { background: #14130f; border-color: #3d3933; }
.wizard-footer .btn-primary {
    background: #2b3aff; color: #fff; border-color: #2b3aff;
}
.wizard-footer .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.wizard-error {
    background: #ffe8e8; color: #b00;
    padding: 8px 12px; border-radius: 6px; margin: 12px 0; font-size: .9rem;
}
```
