// services/folha/templatePadraoParser.ts
// Parser dedicado ao "Template Padrão" do app.
//
// v1.1.0 — Aceita `aba` e `linhaCabecalho` no contexto (vindos do detector v2),
//          em vez de assumir aba "Lançamentos" e linha 4 hardcoded.
//          Fallback: se não vier no contexto, mantém comportamento v1
//          (procura aba "Lançamentos", linha 4).
//
// Diferença fundamental do apontamentoParser.ts (legado):
//   - Legado: cada COLUNA da planilha = um evento. Funcionário fica em uma linha,
//     com várias colunas de valores.
//   - Template padrão: cada LINHA = um lançamento (1 evento de 1 funcionário).
//     Já vem com matrícula, código de evento, descrição, R/V, valor, etc.
//
// Por isso este parser produz `Lancamento[]` DIRETO, pulando os passos de
// "mapeamento" e "matrículas manuais" que o fluxo legado executa.

import * as XLSX from 'xlsx';
import type {
    EventoIobSage,
    Lancamento,
    ReferenciaValor,
    TipoEvento,
} from './folhaTypes';

const PARSER_ID = 'template-padrao';
const PARSER_VERSAO = '1.1.0';

const ABA_DADOS_DEFAULT = 'Lançamentos';
const ABA_TABELA_EVENTOS = 'Tabela de Eventos';
const LINHA_CABECALHO_DEFAULT = 4; // 1-indexed

// ─── Heurística de fallback pra Tipo V/D ─────────────────────────────────

const PALAVRAS_DESCONTO = [
    'falta', 'dsr', 'desconto', 'desc.', 'desc ',
    'inss', 'irrf', 'pensao', 'pensão',
    'vale transp', 'vale ref', 'vale alim',
    'plano de saude', 'plano de saúde',
    'plano odont', 'odonto',
    'emprestimo', 'empréstimo', 'consignado',
    'adiantamento', 'adto',
    'atraso', 'saida antecip', 'saída antecip',
    'co-particip', 'coparticip', 'co particip',
    'cesta basica', 'cesta básica',
    'farmacia', 'farmácia',
    'sindical',
    'contrib. assist', 'contribuição assistencial', 'contr. assist',
];

function inferirTipoVD(descricao: string, codigo: string): TipoEvento {
    const d = (descricao || '').toLowerCase();
    if (PALAVRAS_DESCONTO.some((p) => d.includes(p))) return 'D';
    return 'V';
}

// ─── Helpers de extração de célula ───────────────────────────────────────

function lerCelulaTexto(ws: XLSX.WorkSheet, ref: string): string {
    const c = ws[ref];
    if (!c) return '';
    if (c.v === null || c.v === undefined) return '';
    return String(c.v).trim();
}

function lerCelulaNumero(ws: XLSX.WorkSheet, ref: string): number | null {
    const c = ws[ref];
    if (!c || c.v === null || c.v === undefined || c.v === '') return null;
    if (typeof c.v === 'number') return c.v;
    const s = String(c.v).trim().replace(',', '.');
    if (s === '' || s === '-') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/** Preserva zeros à esquerda em matrícula/código.
 *  Ex.: número 173 → "000173", string "0500" → "0500". */
function lerComoTextoPreservandoZeros(ws: XLSX.WorkSheet, ref: string, padTo: number): string {
    const c = ws[ref];
    if (!c) return '';
    if (c.v === null || c.v === undefined) return '';

    if (typeof c.v === 'string') {
        const s = c.v.trim();
        return s;
    }

    if (typeof c.v === 'number') {
        const inteiro = Math.trunc(c.v);
        return String(inteiro).padStart(padTo, '0');
    }

    return String(c.v).trim();
}

// ─── Leitura da Tabela de Eventos do template (fonte secundária V/D) ─────

function lerTabelaEventos(wb: XLSX.WorkBook): Map<string, { tipo: TipoEvento; rv: ReferenciaValor; descricao: string }> {
    const mapa = new Map<string, { tipo: TipoEvento; rv: ReferenciaValor; descricao: string }>();
    const nomeAba = wb.SheetNames.find((n) => n === ABA_TABELA_EVENTOS)
        ?? wb.SheetNames.find((n) => n.toLowerCase().includes('tabela de eventos'));
    if (!nomeAba) return mapa;

    const ws = wb.Sheets[nomeAba];
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    if (!range) return mapa;

    for (let r = 2; r <= range.e.r + 1; r++) {
        const codigo = lerCelulaTexto(ws, `A${r}`);
        const desc = lerCelulaTexto(ws, `B${r}`);
        const tipoTexto = lerCelulaTexto(ws, `C${r}`).toLowerCase();
        const rvTexto = lerCelulaTexto(ws, `D${r}`).toLowerCase();
        if (!codigo) continue;

        const tipo: TipoEvento = tipoTexto.startsWith('desc') ? 'D' : 'V';
        const rv: ReferenciaValor = rvTexto.startsWith('ref') ? 'R' : 'V';
        mapa.set(codigo, { tipo, rv, descricao: desc });
    }

    return mapa;
}

// ─── Resultado do parser ─────────────────────────────────────────────────

export interface ResultadoTemplatePadrao {
    parser: string;
    versao: string;
    processado_em: string;
    lancamentos: Lancamento[];
    alertas: string[];
    funcionarios: Array<{ matricula: string; nome: string; totalLancamentos: number }>;
    codigosSemCatalogo: string[];
    competencia?: string;
}

export interface ContextoTemplatePadrao {
    /** Nome da empresa selecionada (vai pro campo Lancamento.empresa) */
    empresaNome: string;
    /** Código SAGE da empresa (vai pro Lancamento.codigoSage) */
    codigoSage: string;
    /** Catálogo IOB SAGE da empresa, se carregado. Resolve V/D oficialmente. */
    catalogo?: Map<string, EventoIobSage> | null;
    /** v1.1: nome da aba de dados (vindo do detector v2). */
    aba?: string;
    /** v1.1: linha do cabeçalho 1-indexed (vinda do detector v2). */
    linhaCabecalho?: number;
}

// ─── Função principal ────────────────────────────────────────────────────

export async function parsearTemplatePadrao(
    arquivo: File | ArrayBuffer | Uint8Array,
    contexto: ContextoTemplatePadrao,
): Promise<ResultadoTemplatePadrao> {
    let buffer: ArrayBuffer | Uint8Array;
    if (arquivo instanceof File) {
        buffer = await arquivo.arrayBuffer();
    } else {
        buffer = arquivo;
    }

    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

    // v1.1: usa a aba indicada pelo contexto; se não vier, tenta "Lançamentos"
    let nomeAba: string | undefined = contexto.aba;
    if (!nomeAba) {
        nomeAba = wb.SheetNames.find((n) => n === ABA_DADOS_DEFAULT)
            ?? wb.SheetNames.find((n) =>
                n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'lancamentos',
            );
    }
    if (!nomeAba || !wb.Sheets[nomeAba]) {
        throw new Error(
            `Aba de dados não encontrada. Contexto: ${contexto.aba ?? '(não informado)'}; ` +
            `abas disponíveis: ${wb.SheetNames.join(', ')}. ` +
            `O detector deveria ter pegado isso antes.`,
        );
    }
    const ws = wb.Sheets[nomeAba];

    // v1.1: linha de cabeçalho do contexto (default 4)
    const linhaCabecalho = contexto.linhaCabecalho ?? LINHA_CABECALHO_DEFAULT;
    const linhaDadosInicio = linhaCabecalho + 1;

    // Lê a Tabela de Eventos do próprio template (fonte secundária pra V/D)
    const tabelaEventos = lerTabelaEventos(wb);

    // Lê competência da célula A2 (informativo; o panel também tem)
    const a2 = lerCelulaTexto(ws, 'A2'); // "Competência: 04/2026"
    const competencia = a2.replace(/^\s*Compet[eê]ncia\s*:\s*/i, '').trim() || undefined;

    // Determina o range de dados
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    if (!range) {
        return {
            parser: PARSER_ID,
            versao: PARSER_VERSAO,
            processado_em: new Date().toISOString(),
            lancamentos: [],
            alertas: [`Aba "${nomeAba}" está vazia.`],
            funcionarios: [],
            codigosSemCatalogo: [],
            competencia,
        };
    }

    const lancamentos: Lancamento[] = [];
    const alertas: string[] = [];
    const codigosSemCatalogo = new Set<string>();
    const funcionariosMap = new Map<string, { matricula: string; nome: string; totalLancamentos: number }>();

    for (let r = linhaDadosInicio; r <= range.e.r + 1; r++) {
        const matricula = lerComoTextoPreservandoZeros(ws, `A${r}`, 6);
        const nome = lerCelulaTexto(ws, `B${r}`);
        const codigoEvento = lerComoTextoPreservandoZeros(ws, `C${r}`, 4);
        const descricaoEvento = lerCelulaTexto(ws, `D${r}`);
        const rvTexto = lerCelulaTexto(ws, `E${r}`).toUpperCase();
        const referencia = lerCelulaNumero(ws, `F${r}`);
        const valor = lerCelulaNumero(ws, `G${r}`);
        const obs = lerCelulaTexto(ws, `H${r}`) || null;

        // Linha vazia: pula (sem alerta, é normal ter linhas em branco no fim)
        if (!matricula && !nome && !codigoEvento) continue;

        // Linha parcial: alerta
        if (!codigoEvento) {
            alertas.push(`Linha ${r}: sem Código de Evento — descartada. Funcionário: "${nome || '?'}".`);
            continue;
        }
        if (!matricula) {
            alertas.push(`Linha ${r}: sem Matrícula — descartada. Funcionário: "${nome || '?'}", evento ${codigoEvento}.`);
            continue;
        }
        if (!nome) {
            alertas.push(`Linha ${r}: sem Nome do Funcionário — descartada. Matrícula ${matricula}, evento ${codigoEvento}.`);
            continue;
        }

        // Determina rv (R=Referência | V=Valor)
        let rv: ReferenciaValor;
        if (rvTexto === 'R') rv = 'R';
        else if (rvTexto === 'V') rv = 'V';
        else {
            if (referencia !== null && valor === null) rv = 'R';
            else if (valor !== null && referencia === null) rv = 'V';
            else {
                alertas.push(
                    `Linha ${r}: coluna "Tipo (R/V)" inválida ("${rvTexto}") e não dá pra inferir. Descartada.`,
                );
                continue;
            }
            alertas.push(
                `Linha ${r}: "Tipo (R/V)" estava em branco — inferido como "${rv}" pelo valor preenchido.`,
            );
        }

        const valorLancamento = rv === 'R' ? referencia : valor;
        if (valorLancamento === null) {
            alertas.push(
                `Linha ${r}: ${rv === 'R' ? 'Referência' : 'Valor (R$)'} não preenchido — descartada. ` +
                `Funcionário ${matricula} · evento ${codigoEvento}.`,
            );
            continue;
        }
        if (valorLancamento === 0) {
            alertas.push(`Linha ${r}: valor zero — funcionário ${matricula} · evento ${codigoEvento}.`);
        }

        // Resolve Tipo V/D em cascata: catálogo → tabela do template → heurística
        let tipo: TipoEvento;
        let rvConfirmado: ReferenciaValor = rv;
        let descricaoFinal = descricaoEvento;
        let origemTipoVD: 'catalogo' | 'tabela' | 'heuristica' = 'heuristica';

        const eventoCatalogo = contexto.catalogo?.get(codigoEvento);
        if (eventoCatalogo) {
            tipo = eventoCatalogo.tipo;
            rvConfirmado = eventoCatalogo.rv;
            if (!descricaoFinal) descricaoFinal = eventoCatalogo.descricao;
            origemTipoVD = 'catalogo';
            if (rvConfirmado !== rv) {
                alertas.push(
                    `Linha ${r}: "Tipo (R/V)"="${rv}" da planilha difere do catálogo IOB ("${rvConfirmado}") ` +
                    `pro evento ${codigoEvento}. Aplicando o do catálogo.`,
                );
            }
        } else {
            const eventoTabela = tabelaEventos.get(codigoEvento);
            if (eventoTabela) {
                tipo = eventoTabela.tipo;
                rvConfirmado = eventoTabela.rv;
                if (!descricaoFinal) descricaoFinal = eventoTabela.descricao;
                origemTipoVD = 'tabela';
            } else {
                tipo = inferirTipoVD(descricaoEvento, codigoEvento);
                origemTipoVD = 'heuristica';
                codigosSemCatalogo.add(codigoEvento);
            }
        }

        if (origemTipoVD === 'heuristica') {
            alertas.push(
                `Linha ${r}: evento ${codigoEvento} não está no catálogo da empresa nem na ` +
                `Tabela de Eventos do template. Tipo V/D inferido como "${tipo}" pela descrição "${descricaoEvento}". ` +
                `Revise antes de exportar.`,
            );
        }

        lancamentos.push({
            empresa: contexto.empresaNome,
            codigoSage: contexto.codigoSage,
            funcionario: nome,
            matricula,
            coluna: `linha ${r}`,
            evento: codigoEvento,
            descricao_evento: descricaoFinal || `(sem descrição: evento ${codigoEvento})`,
            tipo,
            rv: rvConfirmado,
            valor: valorLancamento,
            origem: 'coluna',
            obs,
        });

        const chaveFunc = `${matricula}__${nome}`;
        const acc = funcionariosMap.get(chaveFunc);
        if (acc) {
            acc.totalLancamentos++;
        } else {
            funcionariosMap.set(chaveFunc, { matricula, nome, totalLancamentos: 1 });
        }
    }

    return {
        parser: PARSER_ID,
        versao: PARSER_VERSAO,
        processado_em: new Date().toISOString(),
        lancamentos,
        alertas,
        funcionarios: Array.from(funcionariosMap.values()).sort((a, b) => a.nome.localeCompare(b.nome)),
        codigosSemCatalogo: Array.from(codigosSemCatalogo).sort(),
        competencia,
    };
}
