// services/folha/apontamentoExporter.ts
// Exporta apontamento de folha para o IOB SAGE FOLHAMATIC.

import type { Lancamento } from './folhaTypes';

export type FolhaFlag = 'salario' | 'adiantamento' | '13sal_1parc' | '13sal_2parc' | 'ferias';

export const FLAG_LABELS: Record<FolhaFlag, string> = {
    salario:        'Folha de Salario',
    adiantamento:   'Adiantamento',
    '13sal_1parc':  '13o Salario (1a parcela)',
    '13sal_2parc':  '13o Salario (2a parcela)',
    ferias:         'Ferias',
};

const FLAG_FILENAME: Record<FolhaFlag, string> = {
    salario:        'salario',
    adiantamento:   'adiantamento',
    '13sal_1parc':  '13sal-1parc',
    '13sal_2parc':  '13sal-2parc',
    ferias:         'ferias',
};

function padNum(n: number, inteiro: number, decimal = 4): string {
    const v = Math.abs(n).toFixed(decimal);
    const [intPart, decPart = ''] = v.split('.');
    return intPart.padStart(inteiro, '0') + decPart.padEnd(decimal, '0');
}

// IOB SAGE FOLHAMATIC: layout 14 chars com pontos decimais implícitos diferentes:
//   - Horas/quantidade:  8 inteiros + 6 decimais
//   - Valor monetário:  12 inteiros + 2 decimais
function campoHoras(n: number): string { return padNum(n, 8, 6); }
function campoValor(n: number): string { return padNum(n, 12, 2); }

function matricula6(m: string | null | undefined): string {
    const matricula = String(m ?? '').trim();
    if (!/^\d{1,6}$/.test(matricula)) {
        throw new Error(`Matrícula "${matricula}" incompatível com o TXT de 6 dígitos. A exportação foi interrompida para não alterar a identificação do funcionário.`);
    }
    return matricula.padStart(6, '0');
}

function evento4(e: string | null | undefined): string {
    const dig = String(e ?? '').replace(/\D/g, '');
    return dig.padStart(4, '0').slice(0, 4);
}

/**
 * Layouts oficiais de importação de ponto do IOB SAGE FOLHAMATIC
 * (documento fornecido pela IOB em 25/09/2026):
 *
 *   windows3 — 40 bytes. É o histórico do app e segue sendo o padrão.
 *       001-006 código do funcionário · 007-010 evento
 *       011-024 referência (6 decimais) · 025-026 brancos
 *       027-040 valor (2 decimais)
 *
 *   windows4 — 50 bytes. Os mesmos 40, MAIS:
 *       041-044 código da empresa · 045-050 competência (MMAAAA)
 *     Com esses dois campos a empresa e o mês viajam DENTRO do arquivo, e não
 *     só no nome dele — some o risco de importar na empresa ou no mês errado.
 *
 * O layout "Ponto padrão DOS" (29 bytes) não é suportado de propósito: ele tem
 * matrícula de 4 dígitos e evento de 3, e as matrículas reais destes clientes
 * têm 6 dígitos (ex.: 836292). Gerá-lo truncaria a identificação do funcionário.
 */
export type LayoutPontoIob = 'windows3' | 'windows4';

export const LAYOUT_PONTO_LABELS: Record<LayoutPontoIob, string> = {
    windows3: 'Ponto padrão Windows - 3 (40 posições)',
    windows4: 'Ponto padrão Windows - 4 (50 posições, com empresa e competência)',
};

/** Código da empresa (041-044): zero-preenchido quando numérico, como o `0606`. */
function codigoEmpresa4(codigo: string | null | undefined): string {
    const t = String(codigo ?? '').trim();
    if (/^\d+$/.test(t)) return t.padStart(4, '0').slice(-4);
    return t.padEnd(4, ' ').slice(0, 4);
}

/** Competência (045-050) no formato MMAAAA exigido pelo layout. */
function competencia6(competencia: string | null | undefined): string {
    const dig = String(competencia ?? '').replace(/\D/g, '');
    return dig.padStart(6, '0').slice(-6);
}

export interface OpcoesExportacaoTXT {
    /** Padrão: 'windows3' (comportamento histórico). */
    layout?: LayoutPontoIob;
    /** Obrigatório no windows4 — código da empresa no IOB (campo 041-044). */
    codigoEmpresa?: string | null;
    /** Obrigatório no windows4 — competência MMAAAA (campo 045-050). */
    competencia?: string | null;
}

export function exportarTXT(
    lancamentos: Lancamento[],
    opcoes: OpcoesExportacaoTXT = {},
): string {
    const layout = opcoes.layout ?? 'windows3';

    // No windows4 os dois campos extras são o motivo de existir do layout.
    // Gerar o arquivo sem eles entregaria 50 posições com lixo no fim, e a
    // importação cairia na empresa/competência erradas — falha silenciosa.
    let sufixo = '';
    if (layout === 'windows4') {
        const emp = codigoEmpresa4(opcoes.codigoEmpresa);
        const comp = competencia6(opcoes.competencia);
        if (!emp.trim() || emp === '0000') {
            throw new Error(
                'Layout Windows-4: código da empresa no IOB não informado. ' +
                'Preencha o código SAGE da empresa (aba Empresas) ou exporte no layout Windows-3.',
            );
        }
        if (comp === '000000') {
            throw new Error(
                'Layout Windows-4: competência inválida. Informe a competência no formato MM/AAAA.',
            );
        }
        sufixo = emp + comp;
    }

    return (
        lancamentos
            .map((l) => {
                const matr = matricula6(l.matricula);
                const ev = evento4(l.evento);
                const valNum = Number(l.valor) || 0;
                // Quando o pós-processador preservou a referência original
                // (caso EDUCATI: aulas semanais ou horas faltadas), emite
                // AMBOS os campos no TXT — o IOB SAGE mostra Ref + Venc/Desc
                // no holerite. Caso contrário, segue o comportamento padrão.
                const refOrig = l.referenciaOriginal;
                const temRefOriginal = typeof refOrig === 'number' && Number.isFinite(refOrig) && refOrig > 0;
                const horas = temRefOriginal
                    ? campoHoras(refOrig as number)
                    : (l.rv === 'R' ? campoHoras(valNum) : campoHoras(0));
                const valor = l.rv === 'V' ? campoValor(valNum) : campoValor(0);
                return matr + ev + horas + '  ' + valor + sufixo;
            })
            .join('\r\n') + '\r\n'
    );
}

export function downloadFile(nome: string, conteudo: string, mime = 'text/plain;charset=utf-8'): void {
    const blob = new Blob([conteudo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function nomeArquivoTXT(nomeFantasiaEmpresa: string, flag: FolhaFlag, competenciaMMAAAA: string): string {
    const empresa = nomeFantasiaEmpresa
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
    const flagSlug = FLAG_FILENAME[flag];
    const comp = (competenciaMMAAAA ?? '').replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
    return 'apontamento-' + empresa + '-' + flagSlug + '-' + comp + '.txt';
}

export function stampNome(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
