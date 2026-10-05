// services/cadastros/cargaEnquadramentoIob.ts
//
// Carga do enquadramento previdenciário a partir do backup do IOB (FolhaWin),
// para as empresas da carteira de uma vez (Paulo, 05/10/2026: "pode seguir
// com a carga de enquadramento"). Tabelas do diretório de sistema, conferidas
// no inventário do backup:
//   - ES_S1005 (estabelecimentos do eSocial): CODEMPRESA, PERCSAT (RAT),
//     RATAJUS (RAT ajustado = RAT × FAP), CNAEF20;
//   - ESOCIALEMPRESA: CODEMPRESA, ANOMESINI, ANOMESFIM, FAP, NROINSCR/CNPJCPF;
//   - ES_S1000 (empregador no eSocial): CODEMPRESA, FKCLASTRIB (classificação
//     tributária → regime);
//   - TERC: FPAS, CODIGO, PERCENTUAL, DESC (terceiros por FPAS, sugestão);
//   - depto (schema fNNNN da folha de cada empresa, só no Backup SQL completo):
//     fpas, codterc, percterc.
// O FPAS da empresa NÃO está no diretório de sistema: sem o depto, a equipe
// informa (há um "FPAS padrão" na tela, aplicado só a quem ela marcar).
//
// Nada é sobrescrito: enquadramento já cadastrado na mesma vigência fica e as
// diferenças aparecem para conferir. É proposta: a equipe confere e grava.

import type { Valor } from '../iobSage/backupPostgres';
import { chaveColuna, type TabelaLida } from './cargaBackupIob';
import { enquadramentoVazio, idEnquadramento, validarEnquadramento, type Enquadramento, type RegimePatronal } from './enquadramento';

export interface TabelasEnquadramento {
    es1005?: TabelaLida | null;
    esocialEmpresa?: TabelaLida | null;
    es1000?: TabelaLida | null;
    terc?: TabelaLida | null;
    /** Tabelas `depto` dos schemas fNNNN (Backup SQL completo da folha). */
    deptos?: { grupo: string; tabela: TabelaLida }[];
}

export interface EmpresaCarga { id: string; nome: string; cnpj: string; codigoSage: string }

export interface PropostaEnquadramento {
    empresa: EmpresaCarga;
    enquadramento: Enquadramento;
    /** O que a equipe precisa conferir (não impede gravar). */
    pendencias: string[];
    /** O que impede gravar (validação do enquadramento). */
    erros: string[];
    /** Enquadramento já cadastrado na mesma vigência (não é trocado). */
    existente: Enquadramento | null;
    diferencas: string[];
}

export interface ResultadoCargaEnq {
    propostas: PropostaEnquadramento[];
    /** Empresas da carteira sem dado no backup. */
    semDados: EmpresaCarga[];
    /** Códigos do backup sem empresa no Consultor (com o código SAGE). */
    semEmpresa: string[];
    avisos: string[];
}

export const codigoIob = (v: Valor | string | undefined) => String(v ?? '').trim().replace(/^0+(?=.)/, '').toUpperCase();

/** Linhas como objetos com a coluna normalizada (minúscula, sem separador). */
export function linhas(t: TabelaLida | null | undefined): Record<string, string>[] {
    if (!t) return [];
    const k = t.colunas.map(chaveColuna);
    return t.linhas.map(l => Object.fromEntries(k.map((c, i) => [c, (l[i] ?? '').trim()])));
}

/** "202501", "2025-01", "2025/01", "01/2025", "012025" → "2025-01"; senão ''. */
export function anomes(v: string): string {
    const t = v.trim();
    const formatos: [RegExp, number, number][] = [[/^(\d{4})-(\d{2})-\d{2}/, 1, 2], [/^(\d{4})[-/]?(\d{2})$/, 1, 2], [/^(\d{2})[-/]?(\d{4})$/, 2, 1]];
    for (const [re, ia, im] of formatos) {
        const m = t.match(re);
        if (!m) continue;
        const [a, mm] = [m[ia], m[im]];
        if (Number(mm) >= 1 && Number(mm) <= 12 && Number(a) >= 1990 && Number(a) <= 2100) return `${a}-${mm}`;
    }
    return '';
}

/** "1,0000", "1.0000", "1" → número; vazio ou ilegível → NaN. */
export function numero(v: string): number {
    const t = v.trim().replace(/\s/g, '');
    if (!t) return NaN;
    const n = /,\d+$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
    return Number.isFinite(n) ? n : NaN;
}

/** FAP de 0,5000 a 2,0000; aceita o número inteiro sem vírgula (10000 = 1,0000). */
export function fapDe(v: string): number {
    let n = numero(v);
    if (n > 2 && n <= 20000 && Number.isInteger(n)) n = n / 10000;
    return n >= 0.5 && n <= 2 ? Math.round(n * 10000) / 10000 : NaN;
}

/**
 * Classificação tributária do eSocial (S-1000) → regime patronal.
 * 01: Simples com a CPP substituída (no DAS) → simples;
 * 02: Simples com a CPP NÃO substituída (Anexo IV) → simples-iv;
 * 03 (substituída e não substituída) e 04 (MEI) → conferir à mão;
 * códigos de pessoa jurídica (06 a 14, 60 a 99) → normal; outros → conferir.
 */
const CLASSTRIB_NORMAL = ['06', '07', '08', '09', '10', '11', '13', '14', '60', '70', '80', '85', '99'];
export function regimeDaClassTrib(v: string): { regime: RegimePatronal; pendencia?: string } {
    const c = v.trim().replace(/^0+(?=\d)/, '').padStart(2, '0');
    if (c === '01') return { regime: 'simples' };
    if (c === '02') return { regime: 'simples-iv' };
    if (c === '03') return { regime: 'simples-iv', pendencia: 'Simples com atividades no DAS e fora dele (classTrib 03): conferir o regime.' };
    if (c === '04') return { regime: 'simples', pendencia: 'MEI (classTrib 04): conferir a contribuição patronal.' };
    if (CLASSTRIB_NORMAL.includes(c)) return { regime: 'normal' };
    return { regime: 'normal', pendencia: v.trim() ? `Classificação tributária "${v.trim()}" não reconhecida: conferir o regime.` : 'Sem classificação tributária no backup: conferir o regime.' };
}

const contar = <T,>(xs: T[]) => { const m = new Map<T, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

/** Linhas da TERC para a tela sugerir FPAS, código e percentual. */
export function sugestoesTerceiros(terc: TabelaLida | null | undefined): { fpas: string; codigo: string; percentual: number; descricao: string }[] {
    return linhas(terc).map(l => ({ fpas: (l.fpas ?? '').replace(/\D/g, ''), codigo: (l.codigo ?? '').replace(/\D/g, ''), percentual: numero(l.percentual ?? ''), descricao: l.desc ?? '' }))
        .filter(x => /^\d{3}$/.test(x.fpas))
        .sort((a, b) => a.fpas.localeCompare(b.fpas) || a.codigo.localeCompare(b.codigo));
}

/**
 * Propõe os enquadramentos. `corte` (AAAA-MM): períodos do FAP encerrados
 * antes dele ficam de fora (não servem às folhas atuais).
 */
export function proporEnquadramentos(t: TabelasEnquadramento, empresas: EmpresaCarga[], existentes: Enquadramento[], corte: string): ResultadoCargaEnq {
    const porCodigo = new Map<string, EmpresaCarga>();
    const avisos: string[] = [];
    for (const e of empresas) {
        const c = codigoIob(e.codigoSage);
        if (!c) continue;
        if (porCodigo.has(c)) avisos.push(`Código SAGE ${c} em mais de uma empresa no Consultor (${porCodigo.get(c)!.nome} e ${e.nome}): só a primeira recebe a carga.`);
        else porCodigo.set(c, e);
    }
    const agrupar = (ls: Record<string, string>[]) => {
        const m = new Map<string, Record<string, string>[]>();
        for (const l of ls) { const c = codigoIob(l.codempresa); if (c) m.set(c, [...(m.get(c) ?? []), l]); }
        return m;
    };
    const s1005 = agrupar(linhas(t.es1005));
    const fapEmp = agrupar(linhas(t.esocialEmpresa));
    const s1000 = agrupar(linhas(t.es1000));
    const deptos = new Map<string, Record<string, string>[]>();
    for (const d of t.deptos ?? []) {
        const m = d.grupo.match(/(?:^|[./])f0*(\d+)$/i);
        if (m) deptos.set(codigoIob(m[1]), linhas(d.tabela));
    }
    const codigosBackup = new Set([...s1005.keys(), ...fapEmp.keys(), ...s1000.keys()]);
    const semEmpresa = [...codigosBackup].filter(c => !porCodigo.has(c)).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const existentesPorId = new Map(existentes.map(e => [e.id || idEnquadramento(e.empresaId, e.vigencia), e]));

    const propostas: PropostaEnquadramento[] = [];
    const semDados: EmpresaCarga[] = [];
    for (const [cod, empresa] of porCodigo) {
        const estab = s1005.get(cod) ?? [];
        const faps = fapEmp.get(cod) ?? [];
        const emp = s1000.get(cod) ?? [];
        if (!estab.length && !faps.length && !emp.length) { semDados.push(empresa); continue; }
        const comum: string[] = [];

        // CNPJ do IOB tem de ser o da empresa (mesma raiz).
        const raiz = empresa.cnpj.replace(/\D/g, '').slice(0, 8);
        const cnpjsIob = [...new Set(faps.map(f => (f.cnpjcpf || f.nroinscr || '').replace(/\D/g, '')).filter(x => x.length === 8 || x.length === 14).map(x => x.slice(0, 8)))];
        const cnpjErrado = raiz && cnpjsIob.length && !cnpjsIob.includes(raiz) ? `CNPJ no IOB (raiz ${cnpjsIob.join(', ')}) não é o da empresa (raiz ${raiz}): confira o código SAGE.` : '';

        // RAT pelo estabelecimento (o CNAE preponderante vale para todos).
        const rats = estab.map(e => numero(e.percsat ?? '')).filter(n => [1, 2, 3].includes(n));
        const freq = [...contar(rats)].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
        const rat = freq[0]?.[0] ?? 0;
        if (freq.length > 1) comum.push(`Estabelecimentos com RAT diferentes (${freq.map(f => `${f[0]}%`).join(', ')}): usado ${rat}%; conferir o CNAE preponderante.`);
        if (!rat) comum.push('RAT não informado no backup.');
        const cnae = estab.map(e => e.cnaef20 ?? '').find(Boolean) ?? '';
        const ratAjus = estab.map(e => numero(e.ratajus ?? '')).find(n => n > 0) ?? NaN;

        const cls = regimeDaClassTrib(emp[0]?.fkclastrib ?? '');
        if (cls.pendencia) comum.push(cls.pendencia);

        // FPAS e terceiros: só no depto da folha da empresa.
        const dep = (deptos.get(cod) ?? []).find(d => /^\d{3}$/.test((d.fpas ?? '').replace(/\D/g, '')));
        const fpas = dep ? dep.fpas.replace(/\D/g, '') : '';
        const codigoTerceiros = dep ? (dep.codterc ?? '').replace(/\D/g, '').slice(0, 4) : '';
        const terceiros = dep ? numero(dep.percterc ?? '') : NaN;
        if (cls.regime === 'normal' && !fpas) comum.push('FPAS e terceiros não estão neste backup (ficam no depto da folha de cada empresa): informe o FPAS.');

        // Uma proposta por período do FAP que ainda serve às folhas.
        type Periodo = { ini: string; fap: number };
        const periodos: Periodo[] = faps
            .map(f => ({ ini: anomes(f.anomesini ?? ''), fim: anomes(f.anomesfim ?? ''), fap: fapDe(f.fap ?? '') }))
            .filter(p => p.ini && (!p.fim || p.fim >= corte))
            .sort((a, b) => a.ini.localeCompare(b.ini))
            .filter((p, i, a) => a.findIndex(x => x.ini === p.ini) === i);
        if (!periodos.length) {
            const fapAjus = rat && ratAjus > 0 ? fapDe(String(Math.round((ratAjus / rat) * 10000) / 10000)) : NaN;
            periodos.push({ ini: corte, fap: fapAjus });
            comum.push(Number.isFinite(fapAjus) ? 'FAP sem período no backup: calculado pelo RAT ajustado ÷ RAT, a partir de ' + corte.split('-').reverse().join('/') + '.' : 'FAP sem período no backup: vigência a partir de ' + corte.split('-').reverse().join('/') + '; conferir.');
        }

        for (const p of periodos) {
            const pend = [...comum];
            let fap = p.fap;
            if (!Number.isFinite(fap)) { fap = 1; pend.push('FAP não informado neste período: 1,0000 provisório; conferir o FAP publicado.'); }
            const e: Enquadramento = {
                ...enquadramentoVazio(empresa.id), id: idEnquadramento(empresa.id, p.ini), vigencia: p.ini, regime: cls.regime,
                fpas: cls.regime === 'normal' ? fpas : '', codigoTerceiros: cls.regime === 'normal' ? codigoTerceiros : '',
                patronal: 20, rat, fap, terceiros: cls.regime === 'normal' && Number.isFinite(terceiros) ? terceiros : 0,
                observacao: [`Carga do backup do IOB (código ${cod})`, cnae && `CNAE ${cnae}`, Number.isFinite(ratAjus) && `RAT ajustado no IOB ${fmt(ratAjus)}%`].filter(Boolean).join(' · '),
            };
            const existente = existentesPorId.get(e.id) ?? null;
            const diferencas = existente ? ([
                ['regime', existente.regime, e.regime], ['RAT', existente.rat, e.rat], ['FAP', existente.fap, e.fap], ['FPAS', existente.fpas, e.fpas],
            ] as [string, unknown, unknown][]).filter(([, a, b]) => b !== '' && b !== 0 && a !== b).map(([k, a, b]) => `${k}: cadastrado ${String(a) || '—'} × IOB ${String(b)}`) : [];
            const erros = [...(cnpjErrado ? [cnpjErrado] : []), ...validarEnquadramento(e)];
            propostas.push({ empresa, enquadramento: e, pendencias: pend, erros, existente, diferencas });
        }
    }
    propostas.sort((a, b) => a.empresa.nome.localeCompare(b.empresa.nome, 'pt-BR') || a.enquadramento.vigencia.localeCompare(b.enquadramento.vigencia));
    semDados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { propostas, semDados, semEmpresa, avisos };
}

/** Aplica o FPAS padrão escolhido na tela às propostas do regime normal sem FPAS. */
export function aplicarFpasPadrao(p: PropostaEnquadramento, padrao: { fpas: string; codigoTerceiros: string; terceiros: number }): PropostaEnquadramento {
    const e = p.enquadramento;
    if (e.regime !== 'normal' || e.fpas || !/^\d{3}$/.test(padrao.fpas)) return p;
    const novo: Enquadramento = { ...e, fpas: padrao.fpas, codigoTerceiros: padrao.codigoTerceiros, terceiros: padrao.terceiros };
    const outros = p.erros.filter(x => x.startsWith('CNPJ no IOB'));
    return {
        ...p, enquadramento: novo,
        pendencias: [...p.pendencias.filter(x => !x.startsWith('FPAS e terceiros')), `FPAS padrão aplicado na carga (${padrao.fpas}, terceiros ${fmt(padrao.terceiros)}%): conferir.`],
        erros: [...outros, ...validarEnquadramento(novo)],
    };
}

/** Pode gravar: sem erro e sem enquadramento já cadastrado na vigência. */
export const gravavel = (p: PropostaEnquadramento) => !p.erros.length && !p.existente;
