// services/pacoteCliente/pacote.ts
//
// Pacote do cliente (Paulo, 07/10/2026: "pode seguir com pacote de arquivos do
// cliente"): um .zip com o que o DP manda à empresa depois do cálculo:
// holerites ou recibos (PDF), resumo da folha (PDF), arquivo bancário (.REM)
// para importar no banco, convite de agenda (.ics) com o pagamento e as guias,
// e um LEIA-ME com o que fazer com cada arquivo.
//
// Aqui ficam as partes puras (eventos da agenda da folha e o LEIA-ME); a tela
// junta os PDFs e a remessa e baixa o .zip.

import { diaUtilAnterior, type Data } from '../prazos/calendario';
import { vencimentosDaCompetencia } from '../prazos/obrigacoes';
import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { ResultadoRescisao } from '../calculo/motorRescisao';
import type { ResumoFolha } from '../relatorios/resumoFolha';
import type { EventoAgenda } from '../agenda/convite';
import { ROTULO_FORMA, type ResultadoRemessa } from '../bancario/cnab240';

export type TipoFolha = 'mensal' | '13-1a' | '13-2a' | 'ferias' | 'rescisao';

const reais = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d: Data) => d.split('-').reverse().join('/');
const compBr = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;

/** Vencimento da competência pelo id (ex.: "darf-2026-09", "darf-13-2026"). */
function vencimento(competencia: string, id: string) {
    const v = vencimentosDaCompetencia(competencia).find(x => x.id === id);
    if (!v) throw new Error(`Vencimento ${id} não encontrado.`);
    return v;
}

export interface ParamsEventosFolha {
    folha: Exclude<TipoFolha, 'ferias'>;
    empresa: { nome: string; cnpj: string };
    /** AAAA-MM da folha (mensal e rescisão). */
    competencia: string;
    /** Ano do 13º. */
    ano: number;
    /** AAAA-MM do pagamento (IRRF: regime de caixa). */
    pagamento: string;
    /** Data do pagamento (a mesma do arquivo bancário). */
    dataPagamento: Data;
    resultados: ResultadoCalculo[];
    encargos: ResumoFolha['encargos'];
}

/**
 * Eventos da agenda do cliente para a folha (as férias usam os eventos de cada
 * recibo, em services/agenda/convite). Pagamento com lembrete na véspera e as
 * guias com os valores desta folha; o DARF final é o da DCTFWeb do mês, que
 * junta tudo o que a empresa tem na competência.
 */
export function eventosDaFolha(p: ParamsEventosFolha): EventoAgenda[] {
    const calculados = p.resultados.filter(r => r.situacao === 'calculado');
    if (!calculados.length) return [];
    const e = p.encargos;
    const liquido = calculados.reduce((s, r) => s + r.totais.liquido, 0);
    const chave = `${p.empresa.cnpj.replace(/\D/g, '')}-${p.folha}-${p.folha.startsWith('13') ? p.ano : p.competencia}`;
    const uid = (s: string) => `folha-${chave}-${s}@consultor-dp`;
    const base = `${p.empresa.nome}`;
    const ev: EventoAgenda[] = [];
    const nota = 'Valores desta folha; o DARF a pagar é o emitido pela DCTFWeb, que junta tudo o que a empresa tem na competência.';

    /** INSS (e parte patronal, quando há enquadramento) no DARF da competência. */
    const inss = () => {
        const partes = [`INSS descontado dos empregados ${reais(e.inssSegurados)}`];
        if (e.totalPrevidenciario !== undefined) partes.push(`total previdenciário com a parte patronal ${reais(e.totalPrevidenciario)}`);
        return partes;
    };
    const darf = (id: string, competencia: string, titulo: string, partes: string[], valor?: number) => {
        const v = vencimento(competencia, id);
        ev.push({ uid: uid(id), titulo: `${titulo}${valor ? ` (${reais(valor)})` : ''}`, inicio: v.data, lembrete: true,
            descricao: `${base}. ${partes.join('; ')}. ${nota} ${v.base}.${v.observacao ? ` ${v.observacao}.` : ''}` });
    };
    const fgts = (competencia: string, valor: number, extra = '') => {
        if (!valor) return;
        const v = vencimento(competencia, `fgts-${competencia}`);
        ev.push({ uid: uid(`fgts-${competencia}`), titulo: `FGTS Digital ${compBr(competencia)} (${reais(valor)})`, inicio: v.data, lembrete: true,
            descricao: `${base}. FGTS desta folha ${reais(valor)}${extra}. A guia do FGTS Digital da competência ${compBr(competencia)} junta tudo o que a empresa tem no mês. ${v.base}.${v.observacao ? ` ${v.observacao}.` : ''}` });
    };
    const irrfSeparado = (competenciaDoInss: string) => {
        if (!e.irrf || p.pagamento === competenciaDoInss) return;
        darf(`darf-${p.pagamento}`, p.pagamento, `DARF da DCTFWeb ${compBr(p.pagamento)}: IRRF`, [`IRRF retido nesta folha ${reais(e.irrf)} (regime de caixa: vai à DCTFWeb do mês do pagamento, ${compBr(p.pagamento)})`], e.irrf);
    };

    if (p.folha === 'mensal') {
        ev.push({ uid: uid('salario'), titulo: `Pagar os salários de ${compBr(p.competencia)} (${reais(liquido)})`, inicio: p.dataPagamento, lembrete: true,
            descricao: `${base}. Folha de ${compBr(p.competencia)}: ${calculados.length} pagamento(s), líquido total ${reais(liquido)}. Prazo: 5º dia útil do mês seguinte (CLT art. 459, §1º).` });
        const comIrrf = !!e.irrf && p.pagamento === p.competencia;
        darf(`darf-${p.competencia}`, p.competencia, `DARF da DCTFWeb ${compBr(p.competencia)}`, [...inss(), ...(comIrrf ? [`IRRF ${reais(e.irrf)}`] : [])],
            e.totalPrevidenciario !== undefined ? e.totalPrevidenciario + (comIrrf ? e.irrf : 0) : undefined);
        irrfSeparado(p.competencia);
        fgts(p.competencia, e.fgts);
    } else if (p.folha === '13-1a') {
        ev.push({ uid: uid('pagamento'), titulo: `Pagar a 1ª parcela do 13º ${p.ano} (${reais(liquido)})`, inicio: p.dataPagamento, lembrete: true,
            descricao: `${base}. 1ª parcela do 13º salário: ${calculados.length} pagamento(s), ${reais(liquido)}. Prazo: 30/11 (Lei 4.749/1965 art. 2º), antecipando quando não há expediente.` });
        fgts(`${p.ano}-11`, e.fgts, ' (1ª parcela do 13º)');
    } else if (p.folha === '13-2a') {
        ev.push({ uid: uid('pagamento'), titulo: `Pagar a 2ª parcela do 13º ${p.ano} (${reais(liquido)})`, inicio: p.dataPagamento, lembrete: true,
            descricao: `${base}. 2ª parcela do 13º salário: ${calculados.length} pagamento(s), líquido ${reais(liquido)}. Prazo: 20/12 (Lei 4.749/1965 art. 1º), antecipando quando não há expediente.` });
        darf(`darf-13-${p.ano}`, `${p.ano}-12`, `DARF do 13º ${p.ano}`, inss(), e.totalPrevidenciario);
        if (e.irrf) darf(`darf-${p.pagamento}`, p.pagamento, `DARF da DCTFWeb ${compBr(p.pagamento)}: IRRF do 13º`, [`IRRF do 13º ${reais(e.irrf)} (vai à DCTFWeb do mês do pagamento)`], e.irrf);
        fgts(`${p.ano}-12`, e.fgts, ' (2ª parcela do 13º)');
    } else {
        for (const r of calculados as ResultadoRescisao[]) {
            if (!r.pagarAte) continue;
            const dia = diaUtilAnterior(r.pagarAte);
            ev.push({ uid: uid(`rescisao-${r.fichaId}`), titulo: `Pagar a rescisão de ${r.nome} (${reais(r.totais.liquido)})`, inicio: dia, lembrete: true,
                descricao: `${base}. Rescisão de ${r.nome}: líquido ${reais(r.totais.liquido)}. Prazo: 10 dias do término do contrato (CLT art. 477, §6º)${dia !== r.pagarAte ? `; ${br(r.pagarAte)} não é dia útil, antecipado` : ''}.` });
            if (r.multaFgts) ev.push({ uid: uid(`grfgts-${r.fichaId}`), titulo: `FGTS rescisório de ${r.nome} (multa ${reais(r.multaFgts)})`, inicio: dia, lembrete: true,
                descricao: `${base}. Guia rescisória do FGTS Digital de ${r.nome}: multa ${reais(r.multaFgts)} e o FGTS do mês da rescisão, no mesmo prazo do pagamento.` });
        }
        darf(`darf-${p.competencia}`, p.competencia, `DARF da DCTFWeb ${compBr(p.competencia)} (rescisões)`, inss());
        irrfSeparado(p.competencia);
    }
    return ev.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export interface ArquivoDoPacote { nome: string; descricao: string }

/** LEIA-ME do pacote: o que é cada arquivo e o que o cliente faz com ele. CRLF, para abrir no Bloco de Notas. */
export function leiaMe(p: {
    empresa: { nome: string; cnpj: string };
    titulo: string;
    arquivos: ArquivoDoPacote[];
    remessa?: ResultadoRemessa;
    /** Quem não entrou no arquivo bancário (pagar por fora). */
    foraDoArquivo: { nome: string; motivo: string }[];
    eventos: EventoAgenda[];
    geradoEm: Date;
}): string {
    const l: string[] = [];
    l.push(`${p.empresa.nome} (CNPJ ${p.empresa.cnpj})`, p.titulo, `Gerado em ${p.geradoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} pelo Consultor DP.`, '');
    l.push('ARQUIVOS', ...p.arquivos.map(a => `- ${a.nome}: ${a.descricao}`), '');
    const r = p.remessa;
    if (r) {
        l.push('ARQUIVO BANCÁRIO');
        l.push(`Importe ${r.nomeArquivo} no internet banking da empresa (${r.perfil.nome}), na opção de pagamentos por arquivo (remessa CNAB 240${r.perfil.layout === 'sispag' ? ', SISPAG' : ''}), e autorize os pagamentos.`);
        l.push(`Arquivo nº ${r.nsa}: ${r.incluidos.length} pagamento(s), total ${reais(r.total)}.`);
        for (const lote of r.lotes) l.push(`  ${ROTULO_FORMA[lote.forma]}: ${lote.quantidade} · ${reais(lote.total)}`);
        const datas = [...new Set(r.incluidos.map(i => i.favorecido.dataPagamento))].sort();
        l.push(`Data do crédito: ${datas.map(br).join(', ')}. Envie ao banco até o dia útil anterior.`);
        if (r.naoConferidas.length) l.push(`ATENÇÃO: ${r.naoConferidas.map(f => ROTULO_FORMA[f]).join(', ')} ainda em homologação no ${r.perfil.nome}; confira os pagamentos na tela do banco antes de autorizar.`);
        l.push('');
    }
    if (p.foraDoArquivo.length) {
        l.push('PAGAR POR FORA DO ARQUIVO', ...p.foraDoArquivo.map(f => `- ${f.nome}: ${f.motivo}`), '');
    }
    if (p.eventos.length) {
        l.push('AGENDA', 'Abra o arquivo .ics no celular ou no computador: os eventos entram na agenda com lembrete na véspera.');
        l.push(...p.eventos.map(e => `- ${br(e.inicio)}${e.fim && e.fim !== e.inicio ? ` a ${br(e.fim)}` : ''}: ${e.titulo}`), '');
    }
    l.push('Os holerites e recibos devem ser assinados pelos funcionários e guardados pela empresa.');
    return '﻿' + l.join('\r\n') + '\r\n';
}

/** Nome de arquivo sem acento e sem caractere especial. */
export const nomeSeguro = (t: string) =>
    t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
