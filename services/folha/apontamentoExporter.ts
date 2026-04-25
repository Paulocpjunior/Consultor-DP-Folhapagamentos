// services/folha/apontamentoExporter.ts
// Gera CSV (conferência) e TXT (layout posicional SAGE) a partir dos lançamentos
// e oferece download via Blob no navegador.

import type { Lancamento } from './folhaTypes';

function pad(s: string | number | null | undefined, len: number, padChar = ' ', direita = true): string {
    const str = String(s ?? '');
    if (str.length >= len) return str.slice(0, len);
    const fill = padChar.repeat(len - str.length);
    return direita ? str + fill : fill + str;
}

function padNum(n: number, inteiro: number, decimal = 2): string {
    const neg = n < 0;
    const v = Math.abs(n).toFixed(decimal);
    const [intPart, decPart = ''] = v.split('.');
    const left = intPart.padStart(inteiro, '0');
    return (neg ? '-' : '') + left + decPart.padEnd(decimal, '0');
}

/**
 * CSV delimitado por ; — abre direto no Excel pt-BR.
 */
export function exportarCSV(lancamentos: Lancamento[], competencia: string): string {
    const header = [
        'empresa_sage',
        'empresa_nome',
        'matricula',
        'funcionario',
        'evento',
        'descricao_evento',
        'tipo',
        'referencia_ou_valor',
        'valor',
        'competencia',
        'origem',
        'obs',
    ].join(';');

    const linhas = lancamentos.map((l) =>
        [
            l.codigoSage,
            l.empresa,
            l.matricula ?? '',
            l.funcionario,
            l.evento,
            l.descricao_evento,
            l.tipo,
            l.rv,
            String(l.valor).replace('.', ','),
            competencia ?? '',
            l.origem ?? '',
            (l.obs ?? '').replace(/;/g, ','),
        ].join(';')
    );

    return [header, ...linhas].join('\r\n') + '\r\n';
}

/**
 * TXT posicional — layout comum para importação de apontamento no SAGE FOLHAMATIC.
 *
 * Posição  Len  Campo
 * 01-04    04   Empresa SAGE
 * 05-10    06   Matrícula (zero-fill à esquerda)
 * 11-14    04   Código do evento
 * 15-16    02   Ref./Valor ("RE" ou "VA")
 * 17-28    12   Valor/horas (9 int + 2 dec, zero-fill)
 * 29-34    06   Competência (MMAAAA)
 * 35       01   Tipo (V/D)
 *
 * ⚠️ Layout comum; validar com a 1ª importação de teste no SAGE.
 */
export function exportarTXT(lancamentos: Lancamento[], competencia: string): string {
    const compMMAAAA = (competencia ?? '')
        .replace(/[^0-9]/g, '')
        .padStart(6, '0')
        .slice(-6);

    return (
        lancamentos
            .map((l) => {
                const empresa = pad(l.codigoSage, 4, '0', false);
                const matricula = pad(l.matricula, 6, '0', false);
                const evento = pad(l.evento, 4, '0', false);
                const rv = l.rv === 'R' ? 'RE' : 'VA';
                const valor = padNum(l.valor ?? 0, 9, 2);
                const tipo = l.tipo ?? 'V';
                return `${empresa}${matricula}${evento}${rv}${valor}${compMMAAAA}${tipo}`;
            })
            .join('\r\n') + '\r\n'
    );
}

/** Gera o JSON completo do pacote de exportação. */
export function exportarJSON(
    lancamentos: Lancamento[],
    competencia: string,
    cliente: string,
    alertas: string[] = []
): string {
    return JSON.stringify(
        { cliente, competencia, lancamentos, alertas, exportadoEm: new Date().toISOString() },
        null,
        2
    );
}

/** Dispara download via Blob no navegador. */
export function downloadFile(nome: string, conteudo: string, mime = 'text/plain;charset=utf-8'): void {
    // BOM para Excel reconhecer UTF-8 em CSV
    const withBom = mime.startsWith('text/csv') ? '\uFEFF' + conteudo : conteudo;
    const blob = new Blob([withBom], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Helpers de nome. */
export function stampNome(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(
        d.getMinutes()
    )}${p(d.getSeconds())}`;
}
