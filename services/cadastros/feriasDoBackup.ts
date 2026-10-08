// services/cadastros/feriasDoBackup.ts
//
// Férias já gozadas, pelo histórico do FolhaWin (`hist_ferias` do schema
// fNNNN; inventário de 06/10/2026): período aquisitivo (daquisiini/fim),
// concessivo, gozo (dgozoini/fim), abono (ntotabono, dabonoini/fim), faltas
// e situação. Desde o leiaute S-1.0 as férias não vão ao eSocial (S-2230),
// então o histórico do IOB é a fonte. Cada gozo vira um afastamento de
// motivo 15 com o período aquisitivo e o abono: com isso o motor de férias
// acha sozinho o período certo e o saldo. Liga pelo código do funcionário
// (codfun = "Código no IOB" da ficha). Nada é gravado aqui.

import { idAfastamento, afastamentoVazio, type Afastamento } from './afastamentos';
import { chaveCodfun, chaveColuna, dataDoIob, type TabelaLida } from './cargaBackupIob';
import type { FichaFuncionario } from './funcionarios';
import { somarDias, somarMeses } from '../prazos/calendario';

export const TABELA_HIST_FERIAS = 'hist_ferias';

/** Período aquisitivo: sem o fim (ou com fim antes do início), 12 meses desde o início (CLT, art. 130). */
const aquisitivo = (ini: string | null, fim: string | null) => (!ini ? { perAquisInicio: '', perAquisFim: '' }
    : { perAquisInicio: ini, perAquisFim: fim && fim >= ini ? fim : somarDias(somarMeses(ini, 12), -1) });

const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000) + 1;

export interface GozosDoHistorico { afastamentos: Afastamento[]; avisos: string[]; semFicha: number; semGozo: number }

/**
 * Gozos de férias do `hist_ferias` como afastamentos de motivo 15. Só entra o
 * que foi gozado de fato: cancelada (situação "C…") fica de fora, e férias
 * programadas (início depois de hoje, sem data de recibo) também, porque
 * contariam como período usado no saldo (auditoria de 08/10/2026).
 */
export function gozosDoHistorico(t: TabelaLida, empresa: { id: string }, fichas: FichaFuncionario[], origem = 'Backup IOB: hist_ferias', hoje = new Date().toISOString().slice(0, 10)): GozosDoHistorico {
    const r: GozosDoHistorico = { afastamentos: [], avisos: [], semFicha: 0, semGozo: 0 };
    const i = (n: string) => t.colunas.findIndex(c => chaveColuna(c) === n);
    const [iCod, iSit, iTipo, iAqIni, iAqFim, iGozIni, iGozFim, iAbono, iAbIni, iAbFim, iDobro, iRecibo] =
        ['codfun', 'cstatus', 'ctipfer', 'daquisiini', 'daquisifim', 'dgozoini', 'dgozofim', 'ntotabono', 'dabonoini', 'dabonofim', 'cferdobro', 'drecibo'].map(i);
    let canceladas = 0; let programadas = 0;
    const outrasSituacoes = new Set<string>();
    if (iCod < 0 || iGozIni < 0 || iGozFim < 0) { r.avisos.push('hist_ferias sem as colunas codfun, dgozoini e dgozofim.'); return r; }
    // Fichas pelo código IOB. Com o mesmo código em mais de um vínculo (ex.: readmissão),
    // vale o vínculo em vigor na data do gozo; sem como decidir, a linha fica de fora.
    const porCodigo = new Map<string, FichaFuncionario[]>();
    for (const f of fichas) {
        const k = f.dados.codigoIob ? chaveCodfun(f.dados.codigoIob) : '';
        if (k) porCodigo.set(k, [...(porCodigo.get(k) ?? []), f]);
    }
    const vigente = (lista: FichaFuncionario[], data: string) => lista.filter(f =>
        (!f.dados.admissao || f.dados.admissao <= data) && (!f.dados.dataDesligamento || data <= f.dados.dataDesligamento));
    const vistos = new Set<string>();
    const v = (l: (string | null)[], k: number) => (k >= 0 ? (l[k] ?? '').trim() : '');
    for (const l of t.linhas) {
        const ini = dataDoIob(v(l, iGozIni)); const fim = dataDoIob(v(l, iGozFim));
        if (!ini || !fim || fim < ini) { r.semGozo++; continue; }
        const sit = v(l, iSit).toUpperCase();
        if (/^C/.test(sit)) { canceladas++; continue; }
        if (ini > hoje && !dataDoIob(v(l, iRecibo)) && sit !== 'Q') { programadas++; continue; }
        if (sit && sit !== 'Q') outrasSituacoes.add(sit);
        const candidatas = porCodigo.get(chaveCodfun(v(l, iCod))) ?? [];
        if (!candidatas.length) { r.semFicha++; continue; }
        const naData = vigente(candidatas, ini);
        if (naData.length !== 1) {
            r.avisos.push(`Código IOB ${v(l, iCod)}: gozo de ${ini} ${naData.length ? 'cabe em mais de um vínculo' : 'fora do período de todos os vínculos'}; ficou de fora (lance à mão).`);
            continue;
        }
        const ficha = naData[0];
        const id = idAfastamento(ficha.id, ini);
        if (vistos.has(id)) { r.avisos.push(`${ficha.dados.nome || ficha.cpf}: gozo de ${ini} repetido no histórico; só o primeiro foi usado.`); continue; }
        vistos.add(id);
        let abono = Math.round(Number(v(l, iAbono).replace(',', '.')) || 0);
        const abIni = dataDoIob(v(l, iAbIni)); const abFim = dataDoIob(v(l, iAbFim));
        if (abono <= 0 && abIni && abFim && abFim >= abIni) abono = dias(abIni, abFim);
        const obs = [
            'Férias pelo histórico do IOB',
            v(l, iSit) && `situação ${v(l, iSit)}`,
            v(l, iTipo) && `tipo ${v(l, iTipo)}`,
            /^(s|t|1)$/i.test(v(l, iDobro)) && 'em dobro no IOB',
        ].filter(Boolean).join(' · ');
        r.afastamentos.push({
            ...afastamentoVazio(), id, empresaId: empresa.id, fichaId: ficha.id, cpf: ficha.cpf, matriculaEsocial: ficha.matriculaEsocial,
            dtInicio: ini, dtFim: fim, motivo: '15',
            ...aquisitivo(dataDoIob(v(l, iAqIni)), dataDoIob(v(l, iAqFim))),
            abonoDias: abono > 0 ? String(abono) : '', observacao: obs, origem,
        });
    }
    if (canceladas) r.avisos.push(`${canceladas} férias canceladas no IOB ficaram de fora.`);
    if (programadas) r.avisos.push(`${programadas} férias programadas no IOB (começam depois de hoje, sem recibo) ficaram de fora: programe pelo Cálculo quando confirmar.`);
    if (outrasSituacoes.size) r.avisos.push(`Férias com situação ${[...outrasSituacoes].join(', ')} no IOB entraram como gozadas: confira na ficha de férias do IOB.`);
    if (r.semFicha) r.avisos.push(`${r.semFicha} gozo(s) de funcionário sem ficha com o código IOB nesta empresa (rode "Completar pelo backup do IOB" antes).`);
    return r;
}

/**
 * Junta os afastamentos do S-2230 com os gozos do histórico. Mesmo início no
 * mesmo vínculo: fica o do eSocial, completado com o período aquisitivo e o
 * abono do histórico (que o S-2230 não traz).
 */
export function juntarComHistorico(doEsocial: Afastamento[], doHistorico: Afastamento[]): Afastamento[] {
    const porId = new Map(doEsocial.map(a => [a.id, a]));
    for (const h of doHistorico) {
        const e = porId.get(h.id);
        if (!e) { porId.set(h.id, h); continue; }
        porId.set(h.id, {
            ...e,
            perAquisInicio: e.perAquisInicio || h.perAquisInicio, perAquisFim: e.perAquisFim || h.perAquisFim,
            abonoDias: e.abonoDias || h.abonoDias,
        });
    }
    return [...porId.values()].sort((a, b) => a.fichaId.localeCompare(b.fichaId) || a.dtInicio.localeCompare(b.dtInicio));
}
