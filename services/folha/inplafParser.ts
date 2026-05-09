// services/folha/inplafParser.ts
// Parser dedicado ao layout INPLAF (FOLHA_CONTA_BIL.xlsx).
//
// Estratégia:
//   - Linha 1: extrai nome da empresa (A1) e competência (PAGAMENTO + MÊS + ANO)
//   - Linha 2: data interna (descartada)
//   - Linha 3: cabeçalhos REAIS (CÓD., NOME, SALÁRIO, HORAS, DSR, ...EVENTOS)
//   - Linhas 4..N: 1 funcionário por linha
//   - Última linha "ok" / linhas com totais: descartadas
//
// Auto-mapeamento de eventos:
//   - Cada cabeçalho que termina com 4 dígitos vira um evento (regex (\d{4})\s*$)
//   - Tipo (V/D) é resolvido pelo catálogo IOB SAGE (oficial).
//     Se ausente do catálogo, infere pela descrição.
//
// Salário (mensalista vs horista):
//   - Coluna HORAS = "mensalista" (texto) → NÃO gera evento 0001 (IOB calcula
//     sozinho do cadastro)
//   - Coluna HORAS = número (ex.: 177) → gera evento 0001 SALÁRIO com REF=horas

import * as XLSX from 'xlsx';
import type {
    ApontamentoParseado,
    EmpresaApontamento,
    EventoIobSage,
    FuncionarioApontamento,
    Lancamento,
    ReferenciaValor,
    TipoEvento,
} from './folhaTypes';

const PARSER_ID = 'inplaf-folha';
const PARSER_VERSAO = '1.0.0';

const MESES_PT: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03',     abril: '04',
    maio: '05',    junho: '06',     julho: '07',     agosto: '08',
    setembro: '09', outubro: '10',  novembro: '11',  dezembro: '12',
};

// Heurística de tipo (V/D) quando o código não está no catálogo
const PALAVRAS_DESCONTO = [
    'falt', 'desc', 'desconto', 'inss', 'irrf', 'imposto',
    'vale ', 'plano de saude', 'plano de saúde', 'saude', 'saúde',
    'odonto', 'farmacia', 'farmácia',
    'emprestimo', 'empréstimo',
    'pensao', 'pensão',
    'sindical', 'contrib. assist',
    'atraso',
];

const REGEX_CODIGO_NO_FIM = /\b(\d{4})\s*$/;

function normalizar(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function toNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/\./g, '').replace(',', '.').trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function inferirTipoVD(descricao: string): TipoEvento {
    const d = normalizar(descricao);
    if (PALAVRAS_DESCONTO.some((p) => d.includes(p))) return 'D';
    return 'V';
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Extrai competência (MM/AAAA) da linha de título.
 * A planilha INPLAF tem nas últimas células: "PAGAMENTO ", MÊS_TEXTO, ANO.
 * Ex.: ["INPLAF...", null, ..., "PAGAMENTO ", "ABRIL", 2026]
 */
function extrairCompetencia(linhaTitulo: unknown[]): string | undefined {
    let mes: string | undefined;
    let ano: string | undefined;
    for (const c of linhaTitulo) {
        if (c === null || c === undefined) continue;
        const norm = normalizar(c);
        if (!mes && norm in MESES_PT) {
            mes = MESES_PT[norm];
            continue;
        }
        // Ano: número de 4 dígitos entre 2000 e 2099
        if (!ano) {
            const n = toNumberOrNull(c);
            if (n !== null && n >= 2000 && n <= 2099 && Number.isInteger(n)) {
                ano = String(n);
            }
        }
    }
    if (mes && ano) return `${mes}/${ano}`;
    return undefined;
}

export interface ResultadoInplafParser {
    parser: string;
    versao: string;
    processado_em: string;
    lancamentos: Lancamento[];
    alertas: string[];
    funcionarios: Array<{ matricula: string; nome: string; totalLancamentos: number }>;
    codigosSemCatalogo: string[];
    competencia?: string;
    /** Nome da empresa extraído de A1 */
    empresaDetectada?: string;
    /**
     * Estrutura compatível com o parser legado, para a tela de pré-visualização
     * (Section 3 do ApontamentoFolhaPanel) renderizar tabs de empresa, tabela de
     * funcionários, edição de matrículas e seleção de colunas igual aos outros
     * clientes (IRB-GROUP, VALUE).
     */
    parsed: ApontamentoParseado;
}

export interface ContextoInplafParser {
    empresaNome: string;
    codigoSage: string;
    catalogo?: Map<string, EventoIobSage> | null;
}

export async function parsearInplaf(
    arquivo: File | ArrayBuffer | Uint8Array,
    contexto: ContextoInplafParser,
): Promise<ResultadoInplafParser> {
    let buffer: ArrayBuffer | Uint8Array;
    if (arquivo instanceof File) {
        buffer = await arquivo.arrayBuffer();
    } else {
        buffer = arquivo;
    }

    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    if (wb.SheetNames.length === 0) {
        throw new Error('Nenhuma aba encontrada na planilha.');
    }

    // Acha primeira aba que tem o cabeçalho INPLAF na linha 3
    let aba: { nome: string; rows: unknown[][] } | null = null;
    for (const nomeAba of wb.SheetNames) {
        const ws = wb.Sheets[nomeAba];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: null,
            blankrows: false,
        });
        if (rows.length < 4) continue;
        const a3 = normalizar(rows[2]?.[0]);
        const b3 = normalizar(rows[2]?.[1]);
        if (a3.startsWith('cod') && b3 === 'nome') {
            aba = { nome: nomeAba, rows };
            break;
        }
    }

    if (!aba) {
        throw new Error('Layout INPLAF não detectado: cabeçalho na linha 3 não tem COD./NOME.');
    }

    const { rows } = aba;
    const linhaTitulo = rows[0] ?? [];
    const cabecalho = (rows[2] ?? []).map((c) => (c === null || c === undefined ? '' : String(c).trim()));

    const empresaDetectada = linhaTitulo[0] ? String(linhaTitulo[0]).trim() : undefined;
    const competencia = extrairCompetencia(linhaTitulo);

    // Identifica colunas-chave por cabeçalho (case-insensitive, sem acento)
    const idxCod = cabecalho.findIndex((c) => normalizar(c).startsWith('cod'));
    const idxNome = cabecalho.findIndex((c) => normalizar(c) === 'nome');
    const idxHoras = cabecalho.findIndex((c) => normalizar(c) === 'horas');
    const idxSalario = cabecalho.findIndex((c) => normalizar(c) === 'salario');

    if (idxNome < 0) {
        throw new Error('Coluna NOME não encontrada na linha 3.');
    }

    // Mapeia colunas-evento (cabeçalho que termina com código de 4 dígitos)
    type ColunaEvento = { idx: number; codigo: string; descricao: string; cabecalho: string };
    const colunasEvento: ColunaEvento[] = [];
    cabecalho.forEach((c, idx) => {
        const m = c.match(REGEX_CODIGO_NO_FIM);
        if (!m) return;
        const codigo = m[1];
        // descrição = cabeçalho sem o código no fim, espaços normalizados
        const descricao = c.replace(REGEX_CODIGO_NO_FIM, '').trim().replace(/\s+/g, ' ');
        colunasEvento.push({ idx, codigo, descricao, cabecalho: c });
    });

    const lancamentos: Lancamento[] = [];
    const alertas: string[] = [];
    const codigosSemCatalogo = new Set<string>();
    const funcMap = new Map<string, { matricula: string; nome: string; totalLancamentos: number }>();

    // Funcionários no formato legado (FuncionarioApontamento), para a Section 3
    // do panel renderizar a tabela de pré-visualização e edição de matrículas
    // exatamente como faz para IRB-GROUP / VALUE.
    const funcionariosParseados: FuncionarioApontamento[] = [];

    // Processa linhas de dados (linha 4+, índice 3+)
    for (let i = 3; i < rows.length; i++) {
        const linha = rows[i] ?? [];
        const nomeRaw = linha[idxNome];
        if (nomeRaw === null || nomeRaw === undefined) continue;
        const nome = String(nomeRaw).trim();
        if (!nome) continue;
        // Linha "ok" / TOTAL no final / linha de controle
        if (/^(ok|total)/i.test(nome)) continue;

        const matriculaRaw = idxCod >= 0 ? linha[idxCod] : null;
        const matricula = matriculaRaw === null || matriculaRaw === undefined
            ? ''
            : String(matriculaRaw).trim();

        // Monta `celulas` para o registro legado (todas as colunas com cabeçalho)
        const celulas: Record<string, unknown> = {};
        cabecalho.forEach((nomeCol, idx) => {
            if (!nomeCol) return;
            celulas[nomeCol] = linha[idx] ?? null;
        });
        funcionariosParseados.push({
            nome,
            celulas,
            obs: null,
        });

        const lancsDoFunc: Lancamento[] = [];

        // 1) Eventos com código embutido no cabeçalho
        for (const ce of colunasEvento) {
            const valor = toNumberOrNull(linha[ce.idx]);
            if (valor === null || valor === 0) continue;

            const eventoCat = contexto.catalogo?.get(ce.codigo);
            const tipo: TipoEvento = eventoCat?.tipo ?? inferirTipoVD(ce.descricao);
            const rv: ReferenciaValor = eventoCat?.rv ?? 'V';
            const descricaoFinal = eventoCat?.descricao ?? ce.descricao;

            if (!eventoCat) codigosSemCatalogo.add(ce.codigo);

            lancsDoFunc.push({
                empresa: contexto.empresaNome,
                codigoSage: contexto.codigoSage,
                funcionario: nome,
                // Matrícula NÃO vem do CÓD. da planilha — é cadastrada por usuário
                // em folha_mapeamentos/<CNPJ>.matriculas e preenchida pelo panel
                // antes da exportação (igual IRB-GROUP/VALUE).
                matricula: null,
                coluna: ce.cabecalho,
                evento: ce.codigo,
                descricao_evento: descricaoFinal,
                tipo,
                rv,
                valor: round2(valor),
                origem: 'coluna',
            });
        }

        // 2) Salário — INPLAF: horista gera 0001 com REF=horas; mensalista NÃO
        if (idxHoras >= 0) {
            const horasRaw = linha[idxHoras];
            const horasNum = toNumberOrNull(horasRaw);
            const isMensalista = horasNum === null
                && horasRaw !== null
                && horasRaw !== undefined
                && String(horasRaw).trim() !== '';

            if (horasNum !== null && horasNum > 0) {
                // Horista: evento 0001 SALÁRIO com REF=horas
                const eventoCat = contexto.catalogo?.get('0001');
                const tipo: TipoEvento = eventoCat?.tipo ?? 'V';
                const rv: ReferenciaValor = eventoCat?.rv ?? 'R';
                const descricao = eventoCat?.descricao ?? 'SALÁRIO';
                if (!eventoCat) codigosSemCatalogo.add('0001');

                lancsDoFunc.push({
                    empresa: contexto.empresaNome,
                    codigoSage: contexto.codigoSage,
                    funcionario: nome,
                    // Matrícula vem do cadastro (mapa.matriculas), não da planilha
                    matricula: null,
                    coluna: cabecalho[idxHoras] || 'HORAS',
                    evento: '0001',
                    descricao_evento: descricao,
                    tipo,
                    rv,
                    valor: round2(horasNum),
                    origem: 'salario',
                });
            } else if (isMensalista) {
                // Mensalista: pula. IOB calcula sozinho do cadastro.
                // Apenas alerta se a coluna SALÁRIO está vazia (sanity check).
                if (idxSalario >= 0) {
                    const salNum = toNumberOrNull(linha[idxSalario]);
                    if (salNum === null || salNum === 0) {
                        alertas.push(
                            `"${nome}" é mensalista mas a coluna SALÁRIO está vazia.`
                        );
                    }
                }
            }
        }

        if (lancsDoFunc.length === 0) continue;

        lancamentos.push(...lancsDoFunc);

        const chave = matricula || nome;
        const prev = funcMap.get(chave);
        if (prev) {
            prev.totalLancamentos += lancsDoFunc.length;
        } else {
            funcMap.set(chave, {
                matricula,
                nome,
                totalLancamentos: lancsDoFunc.length,
            });
        }
    }

    // Estrutura legada: 1 empresa (a do contexto), com todos os funcionários
    // e todas as colunas do cabeçalho. Permite a Section 3 do panel renderizar
    // tabs (1 só), tabela de funcionários e seleção de colunas igual aos demais.
    const empresaLegada: EmpresaApontamento = {
        nome: contexto.empresaNome,
        colunas: cabecalho.filter((c): c is string => Boolean(c)),
        funcionarios: funcionariosParseados,
    };
    const parsed: ApontamentoParseado = {
        parser: PARSER_ID,
        versao: PARSER_VERSAO,
        processado_em: new Date().toISOString(),
        empresas: [empresaLegada],
    };

    return {
        parser: PARSER_ID,
        versao: PARSER_VERSAO,
        processado_em: new Date().toISOString(),
        lancamentos,
        alertas,
        funcionarios: Array.from(funcMap.values()),
        codigosSemCatalogo: Array.from(codigosSemCatalogo),
        competencia,
        empresaDetectada,
        parsed,
    };
}
