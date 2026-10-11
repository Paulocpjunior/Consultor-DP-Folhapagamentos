// services/cadastros/locaisTrabalho.ts
//
// Local de trabalho do empregado por vigência (o estabelecimento do localTrabGeral do S-2200/S-2206): a ficha guarda o
// atual em dados.estabelecimento e, a partir da primeira troca de estabelecimento da mesma empresa, as faixas em
// `locais` (a de antes da troca, desde a admissão, e cada troca, desde a data dela). Com isso:
// - o S-1200 de cada mês sai no estabelecimento daquele mês e, no mês da troca, nos dois, com os proventos pelos
//   dias em cada um (services/esocial/eventosFolha.ts);
// - a troca vai ao eSocial pelo S-2206 (services/esocial/alteracaoContratual.ts).
// Troca para outra raiz de CNPJ não é troca de estabelecimento: é transferência entre empresas (S-2299 + S-2200).
// Puro, sem Firebase.

import { cnpjValido, dataValida } from './documentos';
import { inicioNaEmpresa, type FichaFuncionario } from './funcionarios';
import type { ContratoS2200 } from '../esocial/admissao';

export interface FaixaLocal {
    /** Data a partir da qual vale (AAAA-MM-DD). */
    desde: string;
    /** CNPJ do estabelecimento (14 dígitos). */
    estabelecimento: string;
    origem: string;
    /** Dados do contrato usados no S-2206 da troca (o que a ficha não guarda). */
    contrato?: ContratoS2200;
}

const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const ultimoDia = (comp: string) => { const [a, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
const anterior = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const br = (d: string) => d.split('-').reverse().join('/');

/** Faixas em ordem; sem troca registrada, uma só (o estabelecimento da ficha, desde a admissão). */
export function faixasDeLocal(f: Pick<FichaFuncionario, 'dados' | 'locais'>): FaixaLocal[] {
    const l = [...(f.locais ?? [])].filter(x => dataValida(x.desde)).sort((a, b) => a.desde.localeCompare(b.desde));
    if (l.length) return l;
    const e = digitos(f.dados.estabelecimento);
    return e ? [{ desde: f.dados.admissao || '0000-01-01', estabelecimento: e, origem: 'ficha' }] : [];
}

/** O estabelecimento no dia (vazio se a ficha não informa). */
export function estabelecimentoNoDia(f: Pick<FichaFuncionario, 'dados' | 'locais'>, dia: string): string {
    const fx = faixasDeLocal(f);
    let atual = fx[0]?.estabelecimento ?? '';
    for (const x of fx) if (x.desde <= dia) atual = x.estabelecimento;
    return atual;
}

/** O dia de referência do período: o último da competência (ou do ano, no 13º), limitado ao desligamento. */
export function diaDoPeriodo(f: Pick<FichaFuncionario, 'dados'>, competencia: string): string {
    const fim = /^\d{4}$/.test(competencia) ? `${competencia}-12-31` : /^\d{4}-\d{2}$/.test(competencia) ? ultimoDia(competencia) : competencia;
    const deslig = f.dados.dataDesligamento ?? '';
    return deslig && dataValida(deslig) && deslig < fim ? deslig : fim;
}

/**
 * Estabelecimentos do mês com os dias de vínculo em cada um (da admissão ou do dia 1º ao desligamento ou ao último
 * dia). Mais de um só no mês da troca.
 */
export function estabelecimentosNoMes(f: Pick<FichaFuncionario, 'dados' | 'locais'>, competencia: string): { estab: string; dias: number }[] {
    if (!/^\d{4}-\d{2}$/.test(competencia)) return [];
    const fx = faixasDeLocal(f);
    if (!fx.length) return [];
    let ini = `${competencia}-01`;
    const inicio = inicioNaEmpresa(f.dados);
    if (inicio && inicio > ini) ini = inicio;
    const fim = diaDoPeriodo(f, competencia);
    if (ini > fim) return [];
    const out: { estab: string; dias: number }[] = [];
    fx.forEach((x, i) => {
        const de = x.desde > ini ? x.desde : ini;
        const prox = fx[i + 1]?.desde;
        const ate = prox && anterior(prox) < fim ? anterior(prox) : fim;
        if (i === 0 && x.desde > ini) {
            // Antes da primeira faixa registrada (cadastro antigo): conta como a primeira.
            const d = diasEntre(ini, ate);
            if (d > 0) out.push({ estab: x.estabelecimento, dias: d });
            return;
        }
        if (de > ate) return;
        const d = diasEntre(de, ate);
        if (d <= 0) return;
        const mesmo = out.find(o => o.estab === x.estabelecimento);
        if (mesmo) mesmo.dias += d; else out.push({ estab: x.estabelecimento, dias: d });
    });
    return out;
}

/** O que impede a troca de estabelecimento. */
export function validarTrocaDeEstabelecimento(f: FichaFuncionario, novo: string, data: string, cnpjEmpresa: string): string[] {
    const e: string[] = [];
    const n = digitos(novo);
    if (f.situacao !== 'ativo' || f.dados.dataDesligamento) e.push('Só para quem está ativo.');
    if (n.length !== 14 || !cnpjValido(n)) e.push('CNPJ do novo estabelecimento (14 dígitos).');
    else if (n.slice(0, 8) !== digitos(cnpjEmpresa).slice(0, 8)) e.push('Outra raiz de CNPJ é outra empresa: use a transferência entre empresas do grupo.');
    if (!dataValida(data)) e.push('Informe a data da troca.');
    else {
        if (f.dados.admissao && data <= f.dados.admissao) e.push('A troca tem de ser depois da admissão.');
        const atual = estabelecimentoNoDia(f, data);
        if (n && atual === n) e.push(`Em ${br(data)} o funcionário já está no estabelecimento ${n}.`);
        if ((f.locais ?? []).some(x => x.desde > data)) e.push('Já há troca registrada depois desta data: corrija a mais recente primeiro.');
    }
    if (!digitos(f.dados.estabelecimento) && !(f.locais ?? []).length) e.push('A ficha não tem o estabelecimento atual (local de trabalho): informe-o no cadastro antes da troca.');
    return e;
}

/** A ficha com a troca: a faixa de antes (se ainda não havia histórico), a nova e o estabelecimento atual. */
export function trocarEstabelecimento(f: FichaFuncionario, novo: string, data: string, contrato: ContratoS2200, origem = `Troca de estabelecimento em ${br(data)}`): FichaFuncionario {
    const fx = (f.locais ?? []).length ? [...f.locais!] : faixasDeLocal(f).map(x => ({ ...x, origem: 'Estabelecimento antes da primeira troca' }));
    const nova: FaixaLocal = { desde: data, estabelecimento: digitos(novo), origem, contrato };
    return {
        ...f, locais: [...fx.filter(x => x.desde !== data), nova].sort((a, b) => a.desde.localeCompare(b.desde)),
        dados: { ...f.dados, estabelecimento: digitos(novo) },
        origens: { ...f.origens, estabelecimento: origem },
    };
}
