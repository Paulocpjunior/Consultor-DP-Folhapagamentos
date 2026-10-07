// services/iobSage/restaurarEmpresa.ts
//
// Restauração de uma empresa no Consultor a partir do Backup SQL do IOB SAGE
// (Paulo, 07/10/2026: "tudo que precisamos está no backup da SAGE: restaurar
// o backup primeiro da empresa piloto, efetuar os parâmetros e seguir com as
// demais"). Junta, numa sequência só, as cargas que já existem uma a uma:
//   1. vínculos pelo eSocial que o IOB transmitiu (S-2200/2205/2206/2299);
//   2. fichas pela `func` do FolhaWin e tabelas complementares (código IOB,
//      salário, cargo, CBO, categoria, sindicato, horas, contrato…);
//   3. enquadramento (depto, depto_ma, S-1000 do schema);
//   4. afastamentos (S-2230 transmitidos) e férias gozadas (hist_ferias);
//   5. histórico da folha (holerith → horas extras, faltas, DSR).
// Cada etapa usa as fichas que a anterior deixou (em memória). Nada é gravado
// aqui: o plano volta com o resumo de cada etapa e a tela grava ao confirmar.
// Os parâmetros (FPAS padrão, período do histórico, formato das horas,
// de/para da func) ficam salvos e valem para as próximas empresas.

import type { Restauracao, TabelaRestauracao } from './restauracao';
import type { Empresa } from '../empresas/empresasTypes';
import { diffFicha, type FichaFuncionario, type ResultadoMescla } from '../cadastros/funcionarios';
import { esocialDoBackup } from '../cadastros/esocialDoBackup';
import { agruparAvisos, paraGravar, prepararImportacao } from '../cadastros/importacaoEsocial';
import {
    TABELAS_COMPLEMENTARES, aplicarComplementos, compararComFichas, complementosFolhaWin, derivarContrato, linhaParaCampos, proporMapeamento,
    type LinhaIob, type Mapeamento, type TabelaLida,
} from '../cadastros/cargaBackupIob';
import {
    aplicarFpasPadrao, aplicarRegime, codigoDoSchema, codigoIob, gravavel, proporEnquadramentos, type PropostaEnquadramento, type TabelasEnquadramento,
} from '../cadastros/cargaEnquadramentoIob';
import { REGIMES, type Enquadramento, type RegimePatronal } from '../cadastros/enquadramento';
import { consolidarAfastamentos, lerXmlAfastamentos, mesclarAfastamentos, type Afastamento, type MesclaAfastamento } from '../cadastros/afastamentos';
import { TABELA_HIST_FERIAS, gozosDoHistorico, juntarComHistorico } from '../cadastros/feriasDoBackup';
import { mesclarMovimentos, movimentosDoHolerith, naturezasDosEventos, type ClasseManual, type EventoResumo, type MesclaMovimento } from '../calculo/movimentosDoBackup';
import type { Movimento } from '../calculo/motorMensal';

export interface ParametrosRestauracao {
    /** FPAS padrão para enquadramento normal sem FPAS no backup (vazio = não aplica). */
    fpas: string; codigoTerceiros: string; terceiros: number;
    /** Histórico da folha e períodos do FAP a partir de (AAAA-MM). */
    historicoDesde: string; fapDesde: string;
    /** Horas do holerith no formato hh,mm. */
    sexagesimal: boolean;
    /** Cria ficha para quem está na func com CPF e matrícula e não tem ficha. */
    criarFichas: boolean;
    /** De/para da func acertado na empresa piloto; vazio = proposto pelos nomes das colunas. */
    mapeamento: Mapeamento;
    /** Classificação dos eventos do IOB acertada pela equipe (código do evento → classe ou "ignorar"). */
    eventos: Record<string, ClasseManual>;
    /** Regime previdenciário informado pela equipe, por empresa (id → regime); vale sobre o S-1000 do backup. */
    regimes: Record<string, RegimePatronal>;
}

const mesAtras = (meses: number) => { const d = new Date(); d.setMonth(d.getMonth() - meses); return d.toISOString().slice(0, 7); };
export const parametrosPadrao = (): ParametrosRestauracao => ({
    fpas: '', codigoTerceiros: '', terceiros: 0, historicoDesde: mesAtras(36), fapDesde: `${new Date().getFullYear() - 1}-01`,
    sexagesimal: false, criarFichas: true, mapeamento: {}, eventos: {}, regimes: {},
});

/**
 * Empresas do backup (schemas fNNNN) com a empresa do Consultor de mesmo
 * código SAGE. Código repetido no Consultor (cadastro de antes da trava) dá
 * uma opção por empresa, marcada: a equipe escolhe pelo CNPJ.
 */
export function empresasDoBackup(rest: Pick<Restauracao, 'grupos'>, empresas: Empresa[]): { codigo: string; grupo: string; empresa: Empresa | null; repetido: boolean }[] {
    const porCodigo = new Map<string, Empresa[]>();
    for (const e of empresas) { const c = codigoIob(e.codigoSage); if (c) porCodigo.set(c, [...(porCodigo.get(c) ?? []), e]); }
    return rest.grupos.map(g => ({ codigo: codigoDoSchema(g), grupo: g })).filter(x => x.codigo)
        .flatMap(x => {
            const l = porCodigo.get(x.codigo) ?? [];
            return l.length ? l.map(e => ({ ...x, empresa: e, repetido: l.length > 1 })) : [{ ...x, empresa: null, repetido: false }];
        })
        .sort((a, b) => Number(a.codigo) - Number(b.codigo) || a.codigo.localeCompare(b.codigo) || (a.empresa?.cnpj ?? '').localeCompare(b.empresa?.cnpj ?? ''));
}

export interface Existentes { fichas: FichaFuncionario[]; afastamentos: Afastamento[]; enquadramentos: Enquadramento[]; movimentos: Record<string, Record<string, Movimento>> }

export interface Etapa { titulo: string; resumo: string; avisos: string[] }
export interface PlanoRestauracao {
    etapas: Etapa[];
    fichas: ResultadoMescla[];
    enquadramentos: PropostaEnquadramento[];
    afastamentos: MesclaAfastamento[];
    movimentos: MesclaMovimento[];
    /** Todos os eventos do holerith no período (para acertar a classificação). */
    eventosHistorico: EventoResumo[];
    /** Arquivos/tabelas de origem, para a auditoria. */
    origem: string[];
}

type Leitor = Pick<Restauracao, 'tabelas' | 'lerTabela'>;

async function ler(rest: Leitor, t: TabelaRestauracao | null | undefined): Promise<TabelaLida | null> {
    if (!t) return null;
    const l: TabelaLida = { colunas: t.colunas, linhas: [] };
    await rest.lerTabela(t, v => { l.linhas.push(v); });
    return l;
}

/** Monta o plano de restauração da empresa (sem gravar nada). */
export async function planejarRestauracao(rest: Leitor, empresa: Empresa, existentes: Existentes, p: ParametrosRestauracao, aoProgresso: (msg: string) => void = () => {}): Promise<PlanoRestauracao> {
    const hoje = new Date().toISOString().slice(0, 10);
    const codigo = codigoIob(empresa.codigoSage);
    const doSchema = (nome: string) => rest.tabelas.find(t => t.origem === 'postgres' && t.tabela.toLowerCase() === nome && codigoDoSchema(t.grupo) === codigo) ?? null;
    const etapas: Etapa[] = [];
    const origem: string[] = [];
    const originais = new Map(existentes.fichas.map(f => [f.id, f]));
    // Empresa que mudou de CNPJ (cadastro corrigido): as fichas passam para o CNPJ atual.
    const cnpjEmpresa = empresa.cnpj.replace(/\D/g, '');
    const atuais = new Map(existentes.fichas.map(f => [f.id, cnpjEmpresa && f.cnpj !== cnpjEmpresa ? { ...f, cnpj: cnpjEmpresa } : f]));
    const cnpjAntigo = existentes.fichas.filter(f => cnpjEmpresa && f.cnpj !== cnpjEmpresa);
    const fichas = () => [...atuais.values()];

    // 1. Vínculos pelo eSocial transmitido.
    aoProgresso('1/5 · eSocial transmitido pelo IOB…');
    const b = await esocialDoBackup(rest, empresa.codigoSage, aoProgresso);
    const prev = prepararImportacao(b.fontes, empresa, hoje, fichas(), { recibos: b.recibos, leiautesAntigos: true });
    const doEsocial = paraGravar(prev);
    for (const r of doEsocial) atuais.set(r.ficha.id, r.ficha);
    etapas.push({ titulo: 'Vínculos pelo eSocial', resumo: `${b.fontes.length} XML(s) · ${doEsocial.filter(r => r.novo).length} ficha(s) nova(s), ${doEsocial.filter(r => !r.novo).length} atualizada(s)`, avisos: [
        ...(cnpjAntigo.length ? [`${cnpjAntigo.length} ficha(s) com outro CNPJ (${[...new Set(cnpjAntigo.map(f => f.cnpj))].join(', ')}): passam para o CNPJ atual da empresa (${cnpjEmpresa}).`] : []),
        ...agruparAvisos([...b.avisos, ...prev.avisos]),
    ] });
    if (b.fontes.length) origem.push(`${b.grupos.join(', ')}.arquivoeventotransmissaoesocial`);

    // 2. Fichas pela func e complementares.
    aoProgresso('2/5 · Funcionários (func e complementares)…');
    const func = doSchema('func');
    if (!func) etapas.push({ titulo: 'Funcionários (func)', resumo: 'tabela func não encontrada', avisos: [`Sem a tabela func do schema f${codigo}.`] });
    else {
        const mapa = Object.keys(p.mapeamento).length ? p.mapeamento : proporMapeamento(func.colunas);
        const linhas: LinhaIob[] = [];
        let n = 0;
        await rest.lerTabela(func, v => { linhas.push(linhaParaCampos(func.colunas, v, mapa, ++n)); });
        const lidas: Record<string, TabelaLida | null> = {};
        for (const [nome] of TABELAS_COMPLEMENTARES) lidas[nome] = await ler(rest, doSchema(nome));
        const comp = complementosFolhaWin(lidas.salarios, lidas.funcdoc, lidas.esocialdadosficha_s1200_remunperapur, lidas.rsalfunc, lidas.cargos, {
            dmdev: lidas.esocialdadosficha_s1200_dmdev, contribSind: lidas.esocialdadosficha_s1300_contribsind, histHorarios: lidas.hist_horarios, cadHorarios: lidas.cad_horarios,
        });
        const finais = derivarContrato(mapa.codigoIob ? aplicarComplementos(linhas, comp) : linhas, hoje);
        const c = compararComFichas(finais, fichas(), empresa, `IOB: ${func.grupo}.func`, p.criarFichas);
        for (const r of [...c.completar, ...c.novas]) atuais.set(r.ficha.id, r.ficha);
        etapas.push({
            titulo: 'Funcionários (func)',
            resumo: `${linhas.length} linha(s) · ${c.novas.length} ficha(s) nova(s), ${c.completar.length} completada(s), ${c.soDivergencias.length} com divergência`,
            avisos: [...c.avisos, ...c.semFicha.slice(0, 50).map(s => `Linha ${s.linha} (${s.nome || s.cpf}): ${s.motivo}`), ...(c.semFicha.length > 50 ? [`e mais ${c.semFicha.length - 50} sem ficha`] : [])],
        });
        origem.push(`${func.grupo}.func`);
    }

    // Fichas: o que mudou em relação ao gravado (eSocial + func juntos).
    const fichasPlano: ResultadoMescla[] = [];
    for (const f of atuais.values()) {
        const antes = originais.get(f.id) ?? null;
        const alteracoes = diffFicha(antes, f);
        if (!antes || alteracoes.length) fichasPlano.push({ ficha: f, novo: !antes, alteracoes, preservados: [] });
    }

    // 3. Enquadramento.
    aoProgresso('3/5 · Enquadramento…');
    const tabelas: TabelasEnquadramento = { schemas: [] };
    const [depto, deptoMa, s1000] = [doSchema('depto'), doSchema('depto_ma'), doSchema('esocialdadosficha_s1000')];
    if (depto || deptoMa || s1000) tabelas.schemas!.push({ grupo: (depto ?? deptoMa ?? s1000)!.grupo, depto: await ler(rest, depto), deptoMa: await ler(rest, deptoMa), s1000: await ler(rest, s1000) });
    const enq = proporEnquadramentos(tabelas, [{ id: empresa.id, nome: empresa.nomeFantasia || empresa.razaoSocial, cnpj: empresa.cnpj, codigoSage: empresa.codigoSage }], existentes.enquadramentos, p.fapDesde);
    const regime = p.regimes?.[empresa.id];
    const propostas = enq.propostas
        .map(x => (regime ? aplicarRegime(x, regime) : x))
        .map(x => (/^\d{3}$/.test(p.fpas) ? aplicarFpasPadrao(x, { fpas: p.fpas, codigoTerceiros: p.codigoTerceiros, terceiros: p.terceiros }) : x));
    const comErro = propostas.filter(x => !x.existente && x.erros.length);
    const enqGravaveis = propostas.filter(gravavel);
    etapas.push({
        titulo: 'Enquadramento',
        resumo: `${propostas.length} vigência(s) · ${enqGravaveis.length} para gravar, ${propostas.filter(x => x.existente).length} já cadastrada(s), ${comErro.length} com erro`
            + (comErro.length ? ` (${REGIMES[comErro[0].enquadramento.regime].split(':')[0]}: ${[...new Set(comErro.flatMap(x => x.erros))].join(' ')})` : ''),
        avisos: [...enq.avisos, ...propostas.flatMap(x => [...x.erros, ...x.pendencias].map(m => `${x.enquadramento.vigencia}: ${m}`))],
    });

    // 4. Afastamentos (S-2230) e férias gozadas (hist_ferias).
    aoProgresso('4/5 · Afastamentos e férias…');
    const lidosAf = b.fontesAfastamento.map(f => lerXmlAfastamentos(f.nome, f.xml, empresa.cnpj.slice(0, 8), { recibos: b.recibos, leiautesAntigos: true }));
    const cons = consolidarAfastamentos(lidosAf.flatMap(l => l.eventos), empresa, fichas());
    const histT = await ler(rest, doSchema(TABELA_HIST_FERIAS));
    const hist = histT ? gozosDoHistorico(histT, empresa, fichas()) : null;
    const afastamentos = mesclarAfastamentos(hist ? juntarComHistorico(cons.afastamentos, hist.afastamentos) : cons.afastamentos, existentes.afastamentos).filter(i => i.mudou);
    etapas.push({
        titulo: 'Afastamentos e férias',
        resumo: `${b.fontesAfastamento.length} S-2230 · ${hist?.afastamentos.length ?? 0} gozo(s) de férias no histórico · ${afastamentos.length} para gravar`,
        avisos: agruparAvisos([...lidosAf.flatMap(l => l.avisos), ...cons.avisos, ...(hist?.avisos ?? []), ...(histT ? [] : ['Sem a tabela hist_ferias: as férias anteriores não vieram.'])]),
    });
    if (histT) origem.push(`f${codigo}.hist_ferias`);

    // 5. Histórico da folha.
    aoProgresso('5/5 · Histórico da folha…');
    const holerith = await ler(rest, doSchema('holerith'));
    let movimentos: MesclaMovimento[] = [];
    let eventosHistorico: EventoResumo[] = [];
    if (!holerith) etapas.push({ titulo: 'Histórico da folha', resumo: 'tabela holerith não encontrada', avisos: [] });
    else {
        const nat = naturezasDosEventos(await ler(rest, doSchema('eventos_esocial')), await ler(rest, doSchema('esocialdadosficha_s1010')));
        const h = movimentosDoHolerith(holerith, nat, fichas(), { desde: p.historicoDesde, sexagesimal: p.sexagesimal, eventos: p.eventos });
        eventosHistorico = h.todos;
        const todos = mesclarMovimentos(h.movimentos, existentes.movimentos).filter(i => i.mudou);
        movimentos = todos.filter(i => !i.erros.length);
        etapas.push({
            titulo: 'Histórico da folha',
            resumo: `${h.linhas} lançamento(s) desde ${p.historicoDesde} · ${movimentos.length} mês(es) para gravar · eventos: ${h.eventos.map(e => `${e.codeven} ${e.descricao} (${e.natRubr || 'descrição'})`).join('; ') || 'nenhum reconhecido'}`,
            avisos: [...h.avisos, ...(nat.size ? [] : ['Sem as rubricas do eSocial no backup: eventos reconhecidos só pela descrição.']),
                ...todos.filter(i => i.erros.length).map(i => `${i.competencia}: ${i.erros.join(' ')} (não grava)`)],
        });
        origem.push(`f${codigo}.holerith`);
    }

    return { etapas, fichas: fichasPlano, enquadramentos: enqGravaveis, afastamentos, movimentos, eventosHistorico, origem };
}
