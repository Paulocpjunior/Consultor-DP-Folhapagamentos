// services/folhaProcessor.ts
//
// Processa um xlsx usando um LayoutFolha (mapeamento por EMPRESA/CNPJ).
// Retorna AMBOS:
//   - parsed: ApontamentoParseado (alimenta a UI de preview/matrículas)
//   - resultado: ResultadoMapeamento (lançamentos prontos pra exportar TXT)

import * as XLSX from 'xlsx';
import type { LayoutFolha } from '../types/layoutFolha';
import type {
  ApontamentoParseado,
  EmpresaApontamento,
  FuncionarioApontamento,
  Lancamento,
  ResultadoMapeamento,
  TipoEvento,
  ReferenciaValor,
} from './folha/folhaTypes';

function parseCellNumber(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const s = String(raw).trim();
  if (s === '' || s === '-' || s === '--') return 0;
  let normalized = s;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function selectSheet(workbook: XLSX.WorkBook, layout: LayoutFolha): XLSX.WorkSheet {
  const { mode, sheetName } = layout.sheetMatching;
  if (mode === 'sheet_name' && sheetName && workbook.Sheets[sheetName]) {
    return workbook.Sheets[sheetName];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

export interface LayoutProcessResult {
  parsed: ApontamentoParseado;
  resultado: ResultadoMapeamento;
}

export async function processWithLayout(
  file: File | Blob | ArrayBuffer,
  layout: LayoutFolha
): Promise<LayoutProcessResult> {
  const buffer =
    file instanceof ArrayBuffer
      ? file
      : await (file as File | Blob).arrayBuffer();

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = selectSheet(workbook, layout);

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  const lancamentos: Lancamento[] = [];
  const alertas: string[] = [];
  const funcionarios: FuncionarioApontamento[] = [];

  const startRow = layout.firstDataRow - 1;
  const nameCol = layout.employeeNameColumn;

  const colunasHeaders = layout.columns
    .filter((c) => c.columnIndex !== nameCol && c.headerLabel)
    .map((c) => c.headerLabel);

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const nome = String(row[nameCol] ?? '').trim();
    if (!nome) continue;
    if (/^total/i.test(nome)) continue;

    const matricula = layout.matriculas?.[nome.toUpperCase()] ?? null;

    const celulas: Record<string, unknown> = {};
    for (const colMap of layout.columns) {
      if (colMap.columnIndex === nameCol) continue;
      celulas[colMap.headerLabel] = row[colMap.columnIndex] ?? null;
    }

    funcionarios.push({ nome, celulas, obs: null });

    for (const colMap of layout.columns) {
      if (!colMap.eventCode) continue;
      const valor = parseCellNumber(row[colMap.columnIndex]);
      const skip = colMap.skipIfEmpty !== false;
      if (skip && valor === 0) continue;

      lancamentos.push({
        empresa: layout.razaoSocial,
        codigoSage: layout.empresaSAGE,
        funcionario: nome,
        matricula,
        coluna: colMap.headerLabel,
        evento: colMap.eventCode,
        descricao_evento: colMap.eventLabel ?? colMap.headerLabel,
        tipo: (colMap.tipo ?? 'V') as TipoEvento,
        rv: (colMap.rv ?? 'V') as ReferenciaValor,
        valor: round2(valor),
        origem: 'coluna',
      });
    }
  }

  if (lancamentos.length === 0) {
    alertas.push(
      'Nenhum lançamento gerado. Verifique o layout (códigos de evento) e a planilha.'
    );
  }

  const empresa: EmpresaApontamento = {
    nome: layout.razaoSocial,
    colunas: colunasHeaders,
    funcionarios,
  };

  const parsed: ApontamentoParseado = {
    parser: `layout-folha-${layout.cnpj}`,
    versao: '1.0.0',
    processado_em: new Date().toISOString(),
    empresas: [empresa],
  };

  return { parsed, resultado: { lancamentos, alertas } };
}
