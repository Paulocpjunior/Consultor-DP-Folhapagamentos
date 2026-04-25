// services/folha/apontamentoExporter.ts
// Exporta apontamento de folha para o IOB SAGE FOLHAMATIC.
//
// Layouts (engenharia reversa de IMPORTACAO_PONTO.txt e IMPORTACAO_VALORES.txt):
//
// 1) Layout PONTO (40 chars) — apontamento misturado, vários eventos por arquivo:
//    Pos 1-6   (6)  Matrícula (zero-fill)
//    Pos 7-10  (4)  Código do evento
//    Pos 11-24 (14) Horas (4 dec) — preenchido se evento R; zeros se V
//    Pos 25-26 (2)  Espaços fixos
//    Pos 27-40 (14) Valor R$ (4 dec) — preenchido se evento V; zeros se R
//
// 2) Layout VALORES (26 chars) — sem evento, escolhido na importação SAGE:
//    Pos 1-6   (6)  Matrícula
//    Pos 7-20  (14) Valor R$ (4 dec)
//    Pos 21-26 (6)  Reservado (zeros)

import type { Lancamento } from './folhaTypes';

function pad(s: string | number | null | undefined, len: number, padChar = ' ', direita = true): string {
    const str = String(s ?? '');
    if (str.length >= len) return str.slice(0, len);
    const fill = padChar.repeat(len - str.length);
    return direita ? str + fill : fill + str;
}

/** Valor numérico → string com `inteiro` casas inteiras + `decimal` decimais, sem vírgula, zero-fill. */
function padNum(n: number, inteiro: number, decimal = 4): string {
    const v = Math.abs(n).toFixed(decimal);
    const [intPart, decPart = ''] = v.split('.');
    const left = intPart.padStart(inteiro, '0');
    return left + decPart.padEnd(decimal, '0');
}

/** Campo numérico de 14 chars com 4 decimais (10 inteiras + 4 decimais), zero-fill. */
function campo14(n: number): string {
    return padNum(n, 10, 4);
}

/** Matrícula numérica em 6 chars, zero-fill à esquerda; vazia ou não-numérica → 6 zeros. */
function matricula6(m: string | null | undefined): string {
    const dig = String(m ?? '').replace(/\D/g, '');
    return dig.padStart(6, '0').slice(-6);
}

/** Evento em 4 chars, zero-fill à esquerda. */
function evento4(e: string | null | undefined): string {
    const dig = String(e ?? '').replace(/\D/g, '');
    return dig.padStart(4, '0').slice(0, 4);
}

/**
 * CSV delimitado por ; — abre direto no Excel pt-BR.
 */
export function exportarCSV(lancamentos: Lancamento[], competencia: string): string {
    const header = [
        'empresa_sage', 'empresa_nome', 'matricula', 'funcionario',
        'evento', 'descricao_evento', 'tipo', 'referencia_ou_valor',
        'valor', 'competencia', 'origem', 'obs',
    ].join(';');

    const linhas = lancamentos.map((l) =>
        [
            l.codigoSage, l.empresa, l.matricula ?? '', l.funcionario,
            l.evento, l.descricao_evento, l.tipo, l.rv,
            String(l.valor).replace('.', ','),
            competencia ?? '', l.origem ?? '',
            (l.obs ?? '').replace(/;/g, ','),
        ].join(';')
    );

    return [header, ...linhas].join('\r\n') + '\r\n';
}

/**
 * Layout PONTO 40 chars — vários eventos misturados num arquivo só.
 * Cada lançamento gera 1 linha. RV='R' (Referência) preenche horas; RV='V' preenche valor.
 */
export function exportarTXT(lancamentos: Lancamento[], _competencia: string): string {
    return (
        lancamentos
            .map((l) => {
                const matr = matricula6(l.matricula);
                const ev = evento4(l.evento);
                const valNum = Number(l.valor) || 0;
                const horas = l.rv === 'R' ? campo14(valNum) : campo14(0);
                const valor = l.rv === 'V' ? campo14(valNum) : campo14(0);
                return `${matr}${ev}${horas}  ${valor}`;
            })
            .join('\r\n') + '\r\n'
    );
}

/**
 * Layout VALORES 26 chars — sem evento, 1 arquivo por evento (escolhido na importação SAGE).
 * Útil quando você importa cada evento separadamente. Filtra só lançamentos do evento dado.
 */
export function exportarTXTValores(lancamentos: Lancamento[]): string {
    return (
        lancamentos
            .map((l) => {
                const matr = matricula6(l.matricula);
                const valor = campo14(Number(l.valor) || 0);
                return `${matr}${valor}000000`;
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
        null, 2
    );
}

/** Dispara download via Blob no navegador. */
export function downloadFile(nome: string, conteudo: string, mime = 'text/plain;charset=utf-8'): void {
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
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Marcadores de uso interno — alguns componentes ainda importam estes símbolos
export { pad as _pad };
