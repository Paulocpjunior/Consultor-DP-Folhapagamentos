// services/bancario/relacaoDeposito.ts
//
// "Relação de Depósito Bancário" (Valores de Salários para Bancos do SAGE): a lista de quem recebe no crédito, com
// banco, agência, conta, CPF (ou RG), funcionário, código e valor. Sai dos mesmos favorecidos do arquivo bancário
// (favorecidosDaFolha), por isso o tipo de movimento é o da tela que abriu o arquivo: folha mensal, adiantamento,
// 13º (1ª e 2ª parcelas), férias ou rescisão. As opções do SAGE: imprimir CPF, RG ou nada; separar por banco (com o
// total de cada um); somente os totais; imprimir ou não os demitidos. Puro, sem Firebase.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { TabelaRelatorio } from '../relatorios/layoutPdf';
import type { Favorecido } from './cnab240';

export type DocumentoRelacao = 'cpf' | 'rg' | 'nenhum';
export interface OpcoesRelacao {
    documento: DocumentoRelacao;
    separarBancos: boolean;
    somenteTotais: boolean;
    imprimirDemitidos: boolean;
}
export const OPCOES_RELACAO_PADRAO: OpcoesRelacao = { documento: 'cpf', separarBancos: false, somenteTotais: false, imprimirDemitidos: true };

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const ref = (f: FichaFuncionario) => (f.dados.codigoIob || f.matriculaEsocial || f.id).slice(0, 20);

/** A ficha do favorecido: pela referência do arquivo (código no IOB, matrícula ou id) e, se houver mais de uma, pelo CPF. */
function fichaDe(fav: Favorecido, fichas: FichaFuncionario[]): FichaFuncionario | undefined {
    const porRef = fichas.filter(f => ref(f) === fav.ref);
    return porRef.length === 1 ? porRef[0] : (porRef.find(f => f.cpf === fav.cpf) ?? fichas.find(f => f.cpf === fav.cpf && (f.dados.nome || '') === fav.nome));
}

export function relacaoDeposito(favorecidos: Favorecido[], fichas: FichaFuncionario[], o: OpcoesRelacao): TabelaRelatorio {
    const itens = favorecidos
        .map(fav => ({ fav, ficha: fichaDe(fav, fichas) }))
        .filter(x => o.imprimirDemitidos || !x.ficha?.dados.dataDesligamento);
    const banco = (x: { fav: Favorecido }) => x.fav.banco || (x.fav.pix ? 'PIX' : 'sem banco');
    itens.sort((a, b) => (o.separarBancos ? banco(a).localeCompare(banco(b)) : 0) || a.fav.nome.localeCompare(b.fav.nome, 'pt-BR'));
    const doc = (x: { fav: Favorecido; ficha?: FichaFuncionario }) => (o.documento === 'cpf' ? cpfFmt(x.fav.cpf)
        : o.documento === 'rg' ? [x.ficha?.dados.rg, x.ficha?.dados.orgaoRg].filter(Boolean).join(' ') : '');
    const linha = (x: { fav: Favorecido; ficha?: FichaFuncionario }) => {
        const f = x.fav;
        const conta = f.conta ? f.conta : f.pix ? `PIX ${f.pix}` : 'sem conta';
        return [f.banco || '—', f.agencia || '', conta, ...(o.documento === 'nenhum' ? [] : [doc(x)]), f.nome, f.ref, brl(f.valor)];
    };
    const colunas = [
        { titulo: 'Banco', largura: 14 }, { titulo: 'Agência', largura: 18 }, { titulo: 'Conta/DV', largura: 28 },
        ...(o.documento === 'nenhum' ? [] : [{ titulo: o.documento === 'cpf' ? 'C.P.F.' : 'R.G.', largura: 28 }]),
        { titulo: 'Funcionário' }, { titulo: 'Código', largura: 18 }, { titulo: 'Valor dep.', alinhar: 'direita' as const, largura: 24 },
    ];
    const vazias = colunas.length - 2;
    const linhas: string[][] = [];
    const total = itens.reduce((s, x) => s + x.fav.valor, 0);
    if (o.separarBancos || o.somenteTotais) {
        const grupos = new Map<string, typeof itens>();
        for (const x of itens) grupos.set(o.separarBancos ? banco(x) : 'todos', [...(grupos.get(o.separarBancos ? banco(x) : 'todos') ?? []), x]);
        for (const [b, xs] of grupos) {
            if (!o.somenteTotais) linhas.push(...xs.map(linha));
            const soma = xs.reduce((s, x) => s + x.fav.valor, 0);
            if (o.separarBancos) linhas.push([`Total do banco ${b}`, ...Array(vazias - 1).fill(''), `${xs.length} funcionário(s)`, brl(soma)]);
        }
    } else linhas.push(...itens.map(linha));
    const fora = favorecidos.length - itens.length;
    return {
        colunas, linhas,
        totais: ['Total geral', ...Array(vazias - 1).fill(''), `${itens.length} funcionário(s)`, brl(total)],
        ...(fora ? { observacao: `${fora} demitido(s) fora da relação (opção "Imprimir demitidos" desmarcada).` } : {}),
    };
}
