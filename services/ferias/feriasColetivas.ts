// services/ferias/feriasColetivas.ts
//
// Férias coletivas (Processos › Férias › Coletivas do SAGE), pela CLT:
// - art. 139: a todos os empregados ou a setores; até 2 períodos por ano, nenhum com menos de 10 dias;
//   comunicação ao órgão local do Ministério do Trabalho e ao sindicato com 15 dias de antecedência e aviso
//   afixado nos locais de trabalho (ME e EPP dispensadas da comunicação ao Ministério: LC 123/2006, art. 51, V);
// - art. 140: quem tem menos de 12 meses de contrato goza as férias proporcionais e o período aquisitivo
//   recomeça no início do gozo (o motor de férias fecha o período na véspera: motorFerias, art140);
// - art. 134, § 3º: as férias não começam nos 2 dias que antecedem feriado ou o repouso semanal;
// - o que passa do saldo vira licença remunerada (afastamento 16, salário normal na folha) ou, por escolha
//   da empresa, antecipação das férias do período em curso.
// O abono pecuniário nas coletivas depende de acordo coletivo (art. 143, § 2º): não entra aqui.
// O plano gera os afastamentos (gozo 15 e licença 16) que o Cálculo › Férias usa para os recibos.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { afastamentoVazio, idAfastamento, type Afastamento } from '../cadastros/afastamentos';
import { dataValida } from '../cadastros/documentos';
import type { Movimento } from '../calculo/motorMensal';
import { avosDoPeriodo, periodosAquisitivos } from '../calculo/motorFerias';
import { aniversario, diaSemana, feriado, somarDias } from '../prazos/calendario';

const br = (d: string) => d.split('-').reverse().join('/');

export type FiltroSetor = { tipo: 'todos' } | { tipo: 'departamento' | 'estabelecimento' | 'cargo'; valor: string };
export type Restante = 'licenca' | 'antecipar';

export interface PlanoColetiva {
    inicio: string;
    dias: number;
    setor: FiltroSetor;
    /** O que fazer com os dias além do saldo de quem tem 12 meses ou mais. */
    restante: Restante;
    /** Microempresa ou EPP: dispensa da comunicação ao Ministério do Trabalho. */
    meEpp: boolean;
    hoje: string;
}

export type SituacaoItem = 'ferias' | 'proporcionais' | 'excluido' | 'gravado';
export interface ItemColetiva {
    fichaId: string; nome: string; situacao: SituacaoItem;
    motivo: string;
    diasGozo: number; diasAntecipados: number; diasLicenca: number;
    /** Afastamentos a gravar (gozos 15, licença 16), em ordem. */
    afastamentos: Afastamento[];
}
export interface ResultadoColetiva {
    fim: string;
    itens: ItemColetiva[];
    erros: string[];
    avisos: string[];
    /** Último dia para comunicar o Ministério do Trabalho e o sindicato (15 dias antes do início). */
    prazoComunicacao: string;
    /** Outras coletivas já gravadas no ano do início. */
    coletivasNoAno: string[];
}

export const valorDoSetor = (f: FichaFuncionario, tipo: 'departamento' | 'estabelecimento' | 'cargo') =>
    (tipo === 'departamento' ? f.dados.departamentoIob : tipo === 'estabelecimento' ? f.dados.estabelecimento : f.dados.cargo) ?? '';

/** Valores de setor existentes nas fichas (para o filtro da tela). */
export const setoresDasFichas = (fichas: FichaFuncionario[], tipo: 'departamento' | 'estabelecimento' | 'cargo') =>
    [...new Set(fichas.map(f => valorDoSetor(f, tipo).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** Coletivas gravadas (pelo início) nos afastamentos da empresa. */
export const coletivasGravadas = (afastamentos: Afastamento[]) => [...new Set(afastamentos.map(a => a.coletiva ?? '').filter(Boolean))].sort();

const intervalo = (a: Afastamento, ini: string, fim: string) => a.dtInicio <= fim && (!a.dtFim || !dataValida(a.dtFim) || a.dtFim >= ini);

export function planejarColetiva(p: PlanoColetiva, fichas: FichaFuncionario[], afastamentos: Afastamento[], movimentos: Record<string, Record<string, Movimento>>): ResultadoColetiva {
    const erros: string[] = []; const avisos: string[] = [];
    const vazio = (fim = ''): ResultadoColetiva => ({ fim, itens: [], erros, avisos, prazoComunicacao: '', coletivasNoAno: [] });
    if (!dataValida(p.inicio)) { erros.push('Informe a data de início das férias coletivas.'); return vazio(); }
    if (!Number.isInteger(p.dias) || p.dias < 10) erros.push('Cada período de férias coletivas tem no mínimo 10 dias (CLT, art. 139, § 1º).');
    if (p.dias > 30) erros.push('Férias coletivas de no máximo 30 dias por período.');
    if (p.setor.tipo !== 'todos' && !p.setor.valor.trim()) erros.push('Escolha o setor das férias coletivas.');
    if (erros.length) return vazio();
    const fim = somarDias(p.inicio, p.dias - 1);

    const ano = p.inicio.slice(0, 4);
    const coletivasNoAno = coletivasGravadas(afastamentos).filter(c => c.startsWith(ano) && c !== p.inicio);
    if (coletivasNoAno.length >= 2) erros.push(`Já há 2 férias coletivas em ${ano} (${coletivasNoAno.map(br).join(' e ')}): a CLT permite até 2 períodos por ano (art. 139, § 1º).`);

    // Início: não nos 2 dias antes de feriado ou do repouso semanal (art. 134, § 3º).
    for (const d of [somarDias(p.inicio, 1), somarDias(p.inicio, 2)]) {
        const fer = feriado(d);
        if (fer) erros.push(`Início em ${br(p.inicio)}: ${br(d)} é feriado (${fer}); as férias não podem começar nos 2 dias que antecedem feriado (CLT, art. 134, § 3º).`);
        else if (diaSemana(d) === 0) avisos.push(`Início em ${br(p.inicio)}: ${br(d)} é domingo. Se o repouso semanal é no domingo, as férias não podem começar nos 2 dias antes dele (CLT, art. 134, § 3º); comece de segunda a quinta.`);
    }

    const prazoComunicacao = somarDias(p.inicio, -15);
    const quem = p.meEpp ? 'ao sindicato (ME/EPP dispensada da comunicação ao Ministério do Trabalho: LC 123/2006, art. 51, V)' : 'ao Ministério do Trabalho e ao sindicato';
    if (p.hoje > prazoComunicacao) avisos.push(`A comunicação ${quem} deveria ter saído até ${br(prazoComunicacao)} (15 dias antes do início: CLT, art. 139, §§ 2º e 3º).`);
    else avisos.push(`Comunique ${quem} até ${br(prazoComunicacao)} e afixe o aviso nos locais de trabalho (CLT, art. 139, §§ 2º e 3º).`);

    const itens: ItemColetiva[] = [];
    const doSetor = (f: FichaFuncionario) => p.setor.tipo === 'todos' || valorDoSetor(f, p.setor.tipo).trim() === p.setor.valor.trim();
    for (const f of fichas) {
        const d = f.dados; const adm = d.admissao ?? ''; const cat = d.categoria ?? '';
        const deslig = d.dataDesligamento && dataValida(d.dataDesligamento) ? d.dataDesligamento : '';
        if (!adm || adm > p.inicio || (deslig && deslig < p.inicio) || !doSetor(f)) continue;
        const nome = d.nome || f.cpf;
        const item = (situacao: SituacaoItem, motivo: string, extra: Partial<ItemColetiva> = {}): ItemColetiva => ({ fichaId: f.id, nome, situacao, motivo, diasGozo: 0, diasAntecipados: 0, diasLicenca: 0, afastamentos: [], ...extra });
        if (cat && !/^1\d\d$/.test(cat)) continue; // não empregados
        if (cat === '111') { itens.push(item('excluido', 'Intermitente: recebe as férias a cada convocação (art. 452-A, § 6º).')); continue; }
        if (deslig && deslig <= fim) { itens.push(item('excluido', `Desligamento em ${br(deslig)}, durante as coletivas.`)); continue; }
        const daFicha = afastamentos.filter(a => !a.fichaId || a.fichaId === f.id);
        const desta = daFicha.filter(a => a.coletiva === p.inicio);
        if (desta.length) {
            itens.push(item('gravado', 'Já gravado em Afastamentos.', { diasGozo: desta.filter(a => a.motivo === '15').reduce((s, a) => s + diasDe(a), 0), diasLicenca: desta.filter(a => a.motivo === '16').reduce((s, a) => s + diasDe(a), 0), afastamentos: desta }));
            continue;
        }
        const conflito = daFicha.find(a => intervalo(a, p.inicio, fim));
        if (conflito) { itens.push(item('excluido', `Afastamento ${conflito.motivo} de ${br(conflito.dtInicio)}${conflito.dtFim ? ` a ${br(conflito.dtFim)}` : ' (sem término)'} no período.`)); continue; }

        const movs = movimentos[f.id] ?? {};
        const gozosAntes = daFicha.filter(a => a.motivo === '15' && a.dtInicio < p.inicio);
        const periodos = periodosAquisitivos(adm, p.inicio, f.id, daFicha, movs, gozosAntes);
        const base = { ...afastamentoVazio(), empresaId: f.empresaId, fichaId: f.id, cpf: f.cpf, matriculaEsocial: f.matriculaEsocial, coletiva: p.inicio, origem: 'Consultor: férias coletivas' };
        const obs = `Férias coletivas de ${br(p.inicio)} a ${br(fim)}`;
        const segs: Afastamento[] = [];
        let cursor = p.inicio;
        const gozo = (dias: number, perAquisInicio: string, extra: Partial<Afastamento> = {}) => {
            const fimSeg = somarDias(cursor, dias - 1);
            segs.push({ ...base, id: idAfastamento(f.id, cursor), dtInicio: cursor, dtFim: fimSeg, motivo: '15', perAquisInicio, observacao: obs, ...extra });
            cursor = somarDias(fimSeg, 1);
        };
        const licenca = (dias: number, porque: string) => {
            if (dias <= 0) return;
            const fimSeg = somarDias(cursor, dias - 1);
            segs.push({ ...base, id: idAfastamento(f.id, cursor), dtInicio: cursor, dtFim: fimSeg, motivo: '16', observacao: `${obs}: licença remunerada (${porque})` });
            cursor = somarDias(fimSeg, 1);
        };

        // Menos de 12 meses de contrato: proporcionais e novo período aquisitivo (art. 140).
        if (adm > aniversario(p.inicio, -1)) {
            // O próprio motor fecha o período na véspera (faltas, suspensões e perdas como no recibo).
            const tentativa: Afastamento = { ...base, id: 'tentativa', dtInicio: p.inicio, dtFim: fim, motivo: '15', novoPeriodo: 'S' };
            const fechado = periodosAquisitivos(adm, p.inicio, f.id, [...daFicha, tentativa], movs, gozosAntes).find(x => x.art140);
            const avos = fechado ? avosDoPeriodo(fechado.inicio, fechado.fim) : 0;
            const proporcionais = fechado && !fechado.perdido ? Math.min(p.dias, fechado.direito) : 0;
            if (proporcionais > 0) gozo(proporcionais, fechado!.inicio, { novoPeriodo: 'S' });
            licenca(p.dias - proporcionais, 'excede as férias proporcionais, art. 140');
            itens.push(item('proporcionais', `Menos de 12 meses: ${avos}/12 = ${proporcionais} dia(s) de férias proporcionais; o período aquisitivo recomeça em ${br(p.inicio)} (art. 140).`,
                { diasGozo: proporcionais, diasLicenca: p.dias - proporcionais, afastamentos: segs }));
            continue;
        }

        // 12 meses ou mais: o saldo dos períodos fechados, do mais antigo para o mais novo.
        let falta = p.dias; const usados: string[] = [];
        for (const per of periodos.filter(x => !x.perdido && x.fim < p.inicio)) {
            const saldo = Math.max(0, per.direito - per.consumido);
            if (!saldo || !falta) continue;
            const n = Math.min(saldo, falta);
            gozo(n, per.inicio); falta -= n; usados.push(`${n} do período ${br(per.inicio)} a ${br(per.fim)}`);
        }
        const diasGozo = p.dias - falta;
        let antecipados = 0;
        if (falta && p.restante === 'antecipar') {
            const atual = periodos.find(x => !x.perdido && x.fim >= p.inicio);
            if (atual) { antecipados = Math.min(falta, atual.direito - atual.consumido); if (antecipados > 0) { gozo(antecipados, atual.inicio); falta -= antecipados; usados.push(`${antecipados} antecipado(s) do período em curso (${br(atual.inicio)} a ${br(atual.fim)})`); } else antecipados = 0; }
        }
        licenca(falta, 'sem saldo de férias');
        itens.push(item('ferias', `${usados.length ? usados.join('; ') : 'Sem saldo de férias'}${falta ? `; ${falta} dia(s) de licença remunerada` : ''}.`,
            { diasGozo, diasAntecipados: antecipados, diasLicenca: falta, afastamentos: segs }));
    }
    itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!itens.some(i => i.situacao === 'ferias' || i.situacao === 'proporcionais' || i.situacao === 'gravado')) erros.push('Nenhum empregado do setor entra nestas férias coletivas.');
    if (itens.some(i => i.diasLicenca > 0)) avisos.push('Os dias de licença remunerada são pagos como salário normal na folha do mês (afastamento 16).');
    if (itens.some(i => i.diasAntecipados > 0)) avisos.push('Férias antecipadas do período em curso: se depois houver faltas que reduzam o direito (art. 130), a diferença é acertada nas próximas férias ou na rescisão.');
    return { fim, itens, erros, avisos, prazoComunicacao, coletivasNoAno };
}

const diasDe = (a: Afastamento) => (a.dtFim && dataValida(a.dtFim) ? Math.round((Date.parse(a.dtFim) - Date.parse(a.dtInicio)) / 86400000) + 1 : 0);

/** Afastamentos a gravar: os dos itens ainda não gravados. */
export const afastamentosParaGravar = (r: ResultadoColetiva) => r.itens.filter(i => i.situacao === 'ferias' || i.situacao === 'proporcionais').flatMap(i => i.afastamentos);
