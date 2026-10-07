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
//   - schema fNNNN da folha de cada empresa (o .backup do PostgreSQL; conferido
//     no inventário do backup da empresa 1200, 06/10/2026):
//       esocialdadosficha_s1000: classtrib (código do eSocial) e nrinsc (CNPJ);
//       depto_ma: mês a mês (anomes) fpas, codterc, percterc, percsat (RAT) e
//         percfap (FAP) por lotação (depsetsec);
//       depto: fpas, codterc, percterc, percsat e cnaef20 (reserva).
//     Com o schema, a carga não depende das tabelas de sistema: cada mudança
//     dos parâmetros no depto_ma vira uma vigência.
// O FPAS da empresa NÃO está no diretório de sistema: sem o schema, a equipe
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
    /** Tabelas do schema fNNNN de cada empresa (.backup da folha). */
    schemas?: SchemaFolha[];
}

export interface SchemaFolha { grupo: string; depto?: TabelaLida | null; deptoMa?: TabelaLida | null; s1000?: TabelaLida | null }

/** Código da empresa pelo nome do schema: "f1200" ou "backup.f1200" → "1200". */
export const codigoDoSchema = (grupo: string) => { const m = grupo.match(/(?:^|[./])f0*(\d+)$/i); return m ? codigoIob(m[1]) : ''; };

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
 * Linha do S-1000 que vale hoje: o S-1000 tem histórico (a empresa que entrou
 * no Simples tem a linha antiga do regime normal). Pela maior vigência
 * (inivalid), senão pela última gravada (pk_padrao, depois a ordem do backup).
 */
export function s1000Vigente(ls: Record<string, string>[]): Record<string, string> | undefined {
    const comClass = ls.map((l, i) => ({ l, i })).filter(x => x.l.classtrib);
    const ini = (l: Record<string, string>) => anomes(l.inivalid ?? l.inivalidade ?? l.iniValid ?? '');
    const pk = (l: Record<string, string>) => Number(l.pkpadrao ?? l.pk_padrao ?? '') || 0;
    comClass.sort((a, b) => ini(b.l).localeCompare(ini(a.l)) || pk(b.l) - pk(a.l) || b.i - a.i);
    return comClass[0]?.l;
}

/**
 * Regime informado pela equipe (vale sobre a classificação do backup). Fora
 * do regime normal não há FPAS nem terceiros; os erros são refeitos.
 */
export function aplicarRegime(p: PropostaEnquadramento, regime: RegimePatronal): PropostaEnquadramento {
    if (p.enquadramento.regime === regime) return p;
    const normal = regime === 'normal';
    const novo: Enquadramento = { ...p.enquadramento, regime, ...(normal ? {} : { fpas: '', codigoTerceiros: '', terceiros: 0 }) };
    const outros = p.erros.filter(x => x.startsWith('CNPJ no IOB'));
    return {
        ...p, enquadramento: novo,
        pendencias: [...p.pendencias.filter(x => !/classificação tributária|classTrib|^FPAS e terceiros/i.test(x)), `Regime informado na restauração (${regime}); no backup: ${p.enquadramento.regime}.`],
        erros: [...outros, ...validarEnquadramento(novo)],
    };
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
    const schemas = new Map<string, { depto: Record<string, string>[]; deptoMa: Record<string, string>[]; s1000: Record<string, string>[] }>();
    for (const sc of t.schemas ?? []) {
        const c = codigoDoSchema(sc.grupo);
        if (c) schemas.set(c, { depto: linhas(sc.depto), deptoMa: linhas(sc.deptoMa), s1000: linhas(sc.s1000) });
    }
    const codigosBackup = new Set([...s1005.keys(), ...fapEmp.keys(), ...s1000.keys(), ...schemas.keys()]);
    const semEmpresa = [...codigosBackup].filter(c => !porCodigo.has(c)).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const existentesPorId = new Map(existentes.map(e => [e.id || idEnquadramento(e.empresaId, e.vigencia), e]));

    const propostas: PropostaEnquadramento[] = [];
    const semDados: EmpresaCarga[] = [];
    for (const [cod, empresa] of porCodigo) {
        const estab = s1005.get(cod) ?? [];
        const faps = fapEmp.get(cod) ?? [];
        const emp = s1000.get(cod) ?? [];
        const sch = schemas.get(cod);
        if (!estab.length && !faps.length && !emp.length && !sch) { semDados.push(empresa); continue; }
        const comum: string[] = [];

        // CNPJ do IOB tem de ser o da empresa (mesma raiz).
        const raiz = empresa.cnpj.replace(/\D/g, '').slice(0, 8);
        const raizDe = (v: string) => { const d = v.replace(/\D/g, ''); return d.length === 8 || d.length === 14 ? d.slice(0, 8) : ''; };
        // O S-1000 do schema pode ter linhas de outra inscrição (histórico do IOB): valem as da empresa;
        // sem nenhuma da empresa, todas entram na conferência e o CNPJ errado barra.
        const s1000Todas = sch?.s1000 ?? [];
        const s1000Empresa = raiz ? s1000Todas.filter(x => raizDe(x.nrinsc ?? '') === raiz) : [];
        const s1000Usadas = s1000Empresa.length ? s1000Empresa : s1000Todas;
        const s1000Outras = s1000Empresa.length ? [...new Set(s1000Todas.map(x => raizDe(x.nrinsc ?? '')).filter(x => x && x !== raiz))] : [];
        if (s1000Outras.length) comum.push(`S-1000 do backup também tem a inscrição de outra raiz (${s1000Outras.join(', ')}): ignorada; usado o da empresa (raiz ${raiz}).`);
        const inscricoes = [...faps.map(f => f.cnpjcpf || f.nroinscr || ''), ...s1000Usadas.map(x => x.nrinsc ?? '')];
        const cnpjsIob = [...new Set(inscricoes.map(x => x.replace(/\D/g, '')).filter(x => x.length === 8 || x.length === 14).map(x => x.slice(0, 8)))];
        // Toda fonte com CNPJ (ESOCIALEMPRESA e o S-1000 do schema) tem de ser da empresa: uma certa não salva a outra.
        const outrasRaizes = cnpjsIob.filter(x => x !== raiz);
        const cnpjErrado = raiz && outrasRaizes.length ? `CNPJ no IOB (raiz ${outrasRaizes.join(', ')}) não é o da empresa (raiz ${raiz}): confira o código SAGE.` : '';

        // RAT pelo estabelecimento (o CNAE preponderante vale para todos).
        const ratValidos = (ls: Record<string, string>[]) => ls.map(e => numero(e.percsat ?? '')).filter(n => [1, 2, 3].includes(n));
        // S-1005 primeiro; sem RAT válido nele, o depto da folha é a reserva.
        const rats = ratValidos(estab).length ? ratValidos(estab) : ratValidos(sch?.depto ?? []);
        const freq = [...contar(rats)].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
        const rat = freq[0]?.[0] ?? 0;
        if (freq.length > 1) comum.push(`Estabelecimentos com RAT diferentes (${freq.map(f => `${f[0]}%`).join(', ')}): usado ${rat}%; conferir o CNAE preponderante.`);
        const cnae = [...estab, ...(sch?.depto ?? [])].map(e => e.cnaef20 ?? '').find(Boolean) ?? '';
        const ratAjus = estab.map(e => numero(e.ratajus ?? '')).find(n => n > 0) ?? NaN;

        // O classtrib do schema é o código do eSocial; o FKCLASTRIB do sistema pode ser índice interno.
        const cls = regimeDaClassTrib(s1000Vigente(s1000Usadas)?.classtrib ?? emp[0]?.fkclastrib ?? '');
        if (cls.pendencia) comum.push(cls.pendencia);

        // FPAS e terceiros: só no depto da folha da empresa.
        const dep = (sch?.depto ?? []).find(d => /^\d{3}$/.test((d.fpas ?? '').replace(/\D/g, '')));
        const base = {
            fpas: dep ? dep.fpas.replace(/\D/g, '') : '',
            codigoTerceiros: dep ? (dep.codterc ?? '').replace(/\D/g, '').slice(0, 4) : '',
            terceiros: dep ? numero(dep.percterc ?? '') : NaN,
        };

        // Uma proposta por período: pelo depto_ma (mês a mês) quando houver; senão, pelo FAP do ESOCIALEMPRESA.
        type Periodo = { ini: string; fap: number; rat?: number; fpas?: string; codigoTerceiros?: string; terceiros?: number };
        const doMes = periodosDoDeptoMa(sch?.deptoMa ?? [], corte);
        if (doMes.aviso) comum.push(doMes.aviso);
        const periodos: Periodo[] = doMes.periodos.length ? doMes.periodos : faps
            .map(f => ({ ini: anomes(f.anomesini ?? ''), fim: anomes(f.anomesfim ?? ''), fap: fapDe(f.fap ?? '') }))
            .filter(p => p.ini && (!p.fim || p.fim >= corte))
            .sort((a, b) => a.ini.localeCompare(b.ini))
            .filter((p, i, a) => a.findIndex(x => x.ini === p.ini) === i);
        if (!rat && !periodos.some(p => p.rat)) comum.push('RAT não informado no backup.');
        if (cls.regime === 'normal' && !base.fpas && !periodos.some(p => p.fpas)) comum.push('FPAS e terceiros não estão neste backup (ficam no depto da folha de cada empresa): informe o FPAS.');
        if (!periodos.length) {
            const fapAjus = rat && ratAjus > 0 ? fapDe(String(Math.round((ratAjus / rat) * 10000) / 10000)) : NaN;
            periodos.push({ ini: corte, fap: fapAjus });
            comum.push(Number.isFinite(fapAjus) ? 'FAP sem período no backup: calculado pelo RAT ajustado ÷ RAT, a partir de ' + corte.split('-').reverse().join('/') + '.' : 'FAP sem período no backup: vigência a partir de ' + corte.split('-').reverse().join('/') + '; conferir.');
        }

        for (const p of periodos) {
            const pend = [...comum];
            let fap = p.fap;
            if (!Number.isFinite(fap)) { fap = 1; pend.push('FAP não informado neste período: 1,0000 provisório; conferir o FAP publicado.'); }
            const fpas = p.fpas || base.fpas;
            const codigoTerceiros = p.fpas ? p.codigoTerceiros ?? '' : base.codigoTerceiros;
            const terceiros = p.terceiros !== undefined && Number.isFinite(p.terceiros) ? p.terceiros : base.terceiros;
            const normal = cls.regime === 'normal';
            const e: Enquadramento = {
                ...enquadramentoVazio(empresa.id), id: idEnquadramento(empresa.id, p.ini), vigencia: p.ini, regime: cls.regime,
                fpas: normal ? fpas : '', codigoTerceiros: normal ? codigoTerceiros : '',
                patronal: 20, rat: p.rat || rat, fap, terceiros: normal && Number.isFinite(terceiros) ? terceiros : 0,
                observacao: [`Carga do backup do IOB (código ${cod}${doMes.periodos.length ? ', depto_ma' : ''})`, cnae && `CNAE ${cnae}`, Number.isFinite(ratAjus) && `RAT ajustado no IOB ${fmt(ratAjus)}%`].filter(Boolean).join(' · '),
            };
            if (!e.rat && !pend.includes('RAT não informado no backup.')) pend.push('RAT não informado no backup.');
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

/**
 * Períodos do depto_ma (parâmetros da folha mês a mês). Usa a lotação com
 * mais meses; meses seguidos com os mesmos FPAS, terceiros, RAT e FAP formam
 * um período, e cada período vira uma vigência. Ficam os períodos que ainda
 * valem a partir de `corte`.
 */
export function periodosDoDeptoMa(ls: Record<string, string>[], corte: string): { periodos: { ini: string; fap: number; rat: number; fpas: string; codigoTerceiros: string; terceiros: number }[]; aviso?: string } {
    const porLotacao = new Map<string, Record<string, string>[]>();
    for (const l of ls) { const k = l.depsetsec ?? ''; porLotacao.set(k, [...(porLotacao.get(k) ?? []), l]); }
    const lotacoes = [...porLotacao].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    if (!lotacoes.length) return { periodos: [] };
    const [lotacao, meses] = lotacoes[0];
    const linhasMes = meses
        .map(l => ({ mes: anomes(l.anomes ?? ''), fpas: (l.fpas ?? '').replace(/\D/g, ''), codigoTerceiros: (l.codterc ?? '').replace(/\D/g, '').slice(0, 4), terceiros: numero(l.percterc ?? ''), rat: numero(l.percsat ?? ''), fap: fapDe(l.percfap ?? '') }))
        .filter(l => l.mes)
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .filter((l, i, a) => a.findIndex(x => x.mes === l.mes) === i);
    const chave = (l: typeof linhasMes[number]) => [l.fpas, l.codigoTerceiros, String(l.terceiros), String(l.rat), String(l.fap)].join('|');
    const runs = linhasMes.filter((l, i) => i === 0 || chave(l) !== chave(linhasMes[i - 1]));
    const periodos = runs
        .filter((r, i) => !runs[i + 1] || runs[i + 1].mes > corte)
        .map(r => ({ ini: r.mes, fap: r.fap, rat: [1, 2, 3].includes(r.rat) ? r.rat : 0, fpas: /^\d{3}$/.test(r.fpas) ? r.fpas : '', codigoTerceiros: r.codigoTerceiros, terceiros: r.terceiros }));
    return { periodos, aviso: lotacoes.length > 1 ? `Mais de uma lotação no depto_ma (${lotacoes.length}): usada a ${lotacao || '(sem código)'}, a de mais meses; conferir.` : undefined };
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
