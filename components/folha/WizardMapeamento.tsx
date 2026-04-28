// components/folha/WizardMapeamento.tsx
//
// Modal de mapeamento — abre quando empresa selecionada não tem layout salvo.
// Grava em folha_layouts/{cnpj}.

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type {
  ColumnMapping,
  LayoutFolha,
  LayoutTipoEvento,
  LayoutReferenciaValor,
} from '../../types/layoutFolha';
import { saveLayoutFolha } from '../../services/layoutFolhaService';

interface EmpresaInfo {
  cnpj: string;
  cnpjFormatted: string;
  razaoSocial: string;
  empresaSAGE: string;
}

interface Props {
  empresa: EmpresaInfo;
  fileBuffer: ArrayBuffer;
  fileName: string;
  tipo: string;
  createdBy: string;
  onCancel: () => void;
  onSaved: (layout: LayoutFolha) => void;
}

const colLetter = (i: number) => XLSX.utils.encode_col(i);

export default function WizardMapeamento(props: Props) {
  const { empresa, fileBuffer, fileName, tipo, createdBy } = props;

  const { sheetNames, headers, sampleRow } = useMemo(() => {
    const wb = XLSX.read(fileBuffer, { type: 'array' });
    const first = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(first, {
      header: 1,
      defval: null,
    });
    return {
      sheetNames: wb.SheetNames,
      headers: (rows[0] ?? []).map((h) => String(h ?? '').trim()),
      sampleRow: rows[1] ?? [],
    };
  }, [fileBuffer]);

  const [headerRow] = useState(1);
  const [nameCol, setNameCol] = useState(0);
  const [columns, setColumns] = useState<ColumnMapping[]>(() =>
    headers.map((h, i) => ({
      columnLetter: colLetter(i),
      columnIndex: i,
      headerLabel: h,
      eventCode: null,
      eventLabel: undefined,
      tipo: 'V',
      rv: 'V',
      skipIfEmpty: true,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateCol = (i: number, patch: Partial<ColumnMapping>) => {
    setColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const mappedCount = columns.filter((c, i) => c.eventCode && i !== nameCol).length;

  const handleSave = async () => {
    setError(null);
    if (mappedCount === 0) {
      setError('Mapeie pelo menos uma coluna pra um evento SAGE.');
      return;
    }
    setSaving(true);
    try {
      const layout: LayoutFolha = {
        cnpj: empresa.cnpj.replace(/\D/g, ''),
        cnpjFormatted: empresa.cnpjFormatted,
        razaoSocial: empresa.razaoSocial,
        empresaSAGE: empresa.empresaSAGE,
        tipos: [tipo],
        sheetMatching: { mode: 'first_sheet' },
        headerRow,
        firstDataRow: headerRow + 1,
        employeeNameColumn: nameCol,
        columns,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy,
        version: 1,
      };
      await saveLayoutFolha(layout);
      props.onSaved(layout);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true">
      <div className="wizard-modal">
        <header className="wizard-header">
          <h2>Mapear layout · {empresa.razaoSocial}</h2>
          <p className="muted">
            Arquivo: <code>{fileName}</code> · {sheetNames.length} aba(s) ·{' '}
            {headers.length} coluna(s) · SAGE {empresa.empresaSAGE}
          </p>
          <p className="muted">
            Esse mapeamento é salvo no Firestore. Próximos meses não precisam refazer.
          </p>
        </header>

        <section className="wizard-section">
          <label>
            Coluna do <b>nome do funcionário</b>:{' '}
            <select value={nameCol} onChange={(e) => setNameCol(Number(e.target.value))}>
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {colLetter(i)} — {h || '(sem cabeçalho)'}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="wizard-section">
          <h3>Mapear colunas → eventos SAGE</h3>
          <p className="muted">
            <b>Tipo:</b> V = vencimento (paga), D = desconto.
            <b> RV:</b> V = valor R$, R = referência (horas/quantidade).
          </p>
          <table className="wizard-table">
            <thead>
              <tr>
                <th>Col</th>
                <th>Cabeçalho</th>
                <th>Exemplo</th>
                <th>Evento</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>RV</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={i} className={i === nameCol ? 'is-name-col' : ''}>
                  <td><code>{c.columnLetter}</code></td>
                  <td>{c.headerLabel || <i>(vazio)</i>}</td>
                  <td className="muted">
                    {sampleRow[i] === null || sampleRow[i] === undefined
                      ? '—'
                      : String(sampleRow[i])}
                  </td>
                  <td>
                    {i === nameCol ? (
                      <span className="badge">nome</span>
                    ) : (
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="0000"
                        value={c.eventCode ?? ''}
                        onChange={(e) =>
                          updateCol(i, { eventCode: e.target.value.trim() || null })
                        }
                        style={{ width: 70, fontFamily: 'monospace' }}
                      />
                    )}
                  </td>
                  <td>
                    {i !== nameCol && (
                      <input
                        type="text"
                        placeholder={c.headerLabel}
                        value={c.eventLabel ?? ''}
                        onChange={(e) =>
                          updateCol(i, { eventLabel: e.target.value || undefined })
                        }
                      />
                    )}
                  </td>
                  <td>
                    {i !== nameCol && c.eventCode && (
                      <select
                        value={c.tipo ?? 'V'}
                        onChange={(e) =>
                          updateCol(i, { tipo: e.target.value as LayoutTipoEvento })
                        }
                      >
                        <option value="V">V</option>
                        <option value="D">D</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {i !== nameCol && c.eventCode && (
                      <select
                        value={c.rv ?? 'V'}
                        onChange={(e) =>
                          updateCol(i, { rv: e.target.value as LayoutReferenciaValor })
                        }
                      >
                        <option value="V">V</option>
                        <option value="R">R</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {error && <div className="wizard-error">{error}</div>}

        <footer className="wizard-footer">
          <span className="muted">
            {mappedCount} coluna(s) com evento mapeado
          </span>
          <div>
            <button onClick={props.onCancel} disabled={saving}>Cancelar</button>
            <button
              onClick={handleSave}
              disabled={saving || mappedCount === 0}
              className="btn-primary"
            >
              {saving ? 'Salvando…' : 'Salvar layout e processar'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
