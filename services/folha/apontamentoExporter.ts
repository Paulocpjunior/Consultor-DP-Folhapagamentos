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
    const dig = String(m ?? '').replace(/\D/g, '');
    return dig.padStart(6, '0').slice(-6);
}

function evento4(e: string | null | undefined): string {
    const dig = String(e ?? '').replace(/\D/g, '');
    return dig.padStart(4, '0').slice(0, 4);
}

export function exportarTXT(lancamentos: Lancamento[]): string {
    return (
        lancamentos
            .map((l) => {
                const matr = matricula6(l.matricula);
                const ev = evento4(l.evento);
                const valNum = Number(l.valor) || 0;
                const horas = l.rv === 'R' ? campoHoras(valNum) : campoHoras(0);
                const valor = l.rv === 'V' ? campoValor(valNum) : campoValor(0);
                return matr + ev + horas + '  ' + valor;
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
