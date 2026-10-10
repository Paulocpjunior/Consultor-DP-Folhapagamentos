// services/esocial/tabelaRubricas.ts
//
// S-1010 (Tabela de Rubricas) gerado pelo Consultor. A equipe monta pedidos de inclusão, alteração ou exclusão
// (cada um vira um S-1010); o lote sai pelo pré-voo (envioSeguro) e, aceito em produção, o pedido atualiza as
// vigências da rubrica no cadastro (cadastro_rubricas) e, se veio de uma verba do motor, o de/para da empresa.
//
// Regras do MOS S-1.3 (S-1010, itens 1 a 4, e S-1200, itens 18 a 20):
// - o S-1010 vai antes do S-1200 e do S-2299 que usam a rubrica (grupo 1, tabelas);
// - codRubr não começa com "eSocial"; espaço à direita ou à esquerda é vedado;
// - mudança a partir de uma competência = INCLUSÃO com novo iniValid (o eSocial encerra a anterior no mês
//   anterior); correção da mesma vigência = ALTERAÇÃO (prevalece a última); fim de validade = ALTERAÇÃO com
//   novaValidade; EXCLUSÃO só de vigência sem uso em eventos de remuneração;
// - códigos de incidência suspensa (9x / 9xxx) exigem o processo do S-1070 no próprio S-1010: não são gerados aqui;
// - rubricas de conferência (9901 a 9908): codIncCP 00, codIncFGTS 00 e codIncIRRF 9;
// - eConsignado (9253): desconto, codIncFGTS 31, codIncCP 00 e codIncIRRF 9.
//
// Os modelos das verbas do motor são SUGESTÃO, coerentes com as marcas de INSS, FGTS e IRRF do próprio cálculo
// (a conferência do S-1200 avisa quando discordam). Os códigos da Tabela 21 sem rótulo conferido aparecem na tela
// como "conferir na Tabela 21".

import { COD_INC_CP, COD_INC_FGTS, vigenciaEm, consolidarRubricas, idRubrica, type DadosRubrica, type EventoRubrica, type Rubrica } from '../cadastros/rubricas';
import { PREFIXO_RESC } from './desligamento';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00';
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;

export type AcaoS1010 = 'inclusao' | 'alteracao' | 'exclusao';
export const ROTULO_ACAO: Record<AcaoS1010, string> = { inclusao: 'Inclusão', alteracao: 'Alteração', exclusao: 'Exclusão' };

export interface PedidoS1010 {
    id: string;
    empresaId: string;
    acao: AcaoS1010;
    codRubr: string;
    ideTabRubr: string;
    /** Vigência a incluir, alterar ou excluir (AAAA-MM). */
    iniValid: string;
    fimValid: string;
    /** Só na alteração: nova validade (vazio = mantém). */
    novaIniValid: string;
    novaFimValid: string;
    /** Inclusão e alteração. */
    dados: DadosRubrica | null;
    /** Verba do motor (chave do de/para, RESC: na rescisão) que passa a usar a rubrica quando aceita. */
    chaveVerba: string;
    situacao: 'rascunho' | 'aplicado' | 'descartado';
    recibo: string;
    criadoPorEmail?: string;
}

export const dadosVazios = (): DadosRubrica => ({ dscRubr: '', natRubr: '', tpRubr: '1', codIncCP: '00', codIncIRRF: '9', codIncFGTS: '00', codIncCPRP: '', observacao: '' });

export function pedidoVazio(empresaId: string, acao: AcaoS1010 = 'inclusao'): PedidoS1010 {
    return { id: '', empresaId, acao, codRubr: '', ideTabRubr: '', iniValid: '', fimValid: '', novaIniValid: '', novaFimValid: '', dados: acao === 'exclusao' ? null : dadosVazios(), chaveVerba: '', situacao: 'rascunho', recibo: '' };
}

/** Referência do S-1010 do pedido no registro de envios (situação na tela). */
export const refPedidoS1010 = (pedidoId: string) => `s1010:${pedidoId}`;

// ---------- Naturezas (Tabela 03) e modelos das verbas do motor ----------

/** Rótulos das naturezas que os modelos usam. As demais são aceitas pelo código (4 dígitos). */
export const NAT_RUBR: Record<string, string> = {
    1000: 'Salário, vencimento, soldo', 1002: 'Descanso semanal remunerado (DSR) e feriados', 1003: 'Horas extraordinárias',
    1015: 'Adiantamento de férias', 1016: 'Férias', 1017: 'Terço constitucional de férias', 1023: 'Abono pecuniário', 1024: 'Férias em dobro',
    1202: 'Adicional de insalubridade', 1203: 'Adicional de periculosidade', 1409: 'Salário-família', 4050: 'Salário-maternidade',
    5001: '13º salário', 5504: '13º salário - adiantamento', 6000: 'Saldo de salários na rescisão', 6001: '13º salário relativo ao aviso prévio indenizado',
    6002: '13º salário proporcional na rescisão', 6003: 'Indenização compensatória do aviso prévio', 6004: 'Férias em dobro na rescisão',
    6006: 'Férias proporcionais', 6007: 'Férias vencidas na rescisão', 6104: 'Indenização do art. 479 da CLT', 6901: 'Desconto do aviso prévio',
    9200: 'Desconto de adiantamentos', 9201: 'Contribuição previdenciária', 9203: 'Imposto de renda retido na fonte', 9207: 'Faltas',
    9213: 'Pensão alimentícia', 9214: '13º salário - desconto de adiantamento', 9216: 'Desconto de vale-transporte', 9221: 'Desconto de férias',
    9253: 'eConsignado', 9989: 'Outros valores informativos',
};

export interface ModeloRubrica { chave: string; dados: DadosRubrica; nota?: string }

const m = (chave: string, dscRubr: string, natRubr: string, tpRubr: '1' | '2', codIncCP: string, codIncIRRF: string, codIncFGTS: string, nota?: string): ModeloRubrica =>
    ({ chave, dados: { dscRubr, natRubr, tpRubr, codIncCP, codIncIRRF, codIncFGTS, codIncCPRP: '', observacao: '' }, ...(nota ? { nota } : {}) });

/**
 * Modelos por verba do motor (chave do de/para). Incidências pelas marcas do próprio cálculo; férias e 13º pelos
 * exemplos do MOS (S-1200, item 19; S-1010, itens 7 e 11).
 */
export const MODELOS: ModeloRubrica[] = [
    m('SAL', 'Salário', '1000', '1', '11', '11', '11'),
    m('INSALUB', 'Adicional de insalubridade', '1202', '1', '11', '11', '11'),
    m('PERICUL', 'Adicional de periculosidade', '1203', '1', '11', '11', '11'),
    m('MAT', 'Salário-maternidade pago pelo empregador', '4050', '1', '21', '11', '11'),
    m('HE50', 'Horas extras 50%', '1003', '1', '11', '11', '11'),
    m('HE100', 'Horas extras 100%', '1003', '1', '11', '11', '11'),
    m('DSRHE', 'DSR sobre horas extras', '1002', '1', '11', '11', '11'),
    m('FALTA', 'Faltas', '9207', '2', '11', '11', '11'),
    m('DSRF', 'DSR sobre faltas', '9207', '2', '11', '11', '11'),
    m('ATRASO', 'Faltas e atrasos em horas', '9207', '2', '11', '11', '11'),
    m('INSS', 'INSS', '9201', '2', '31', '41', '00'),
    m('IRRF', 'IRRF', '9203', '2', '00', '31', '00'),
    m('SF', 'Salário-família', '1409', '1', '51', '9', '00'),
    m('PENSAO', 'Pensão alimentícia', '9213', '2', '00', '51', '00'),
    m('ADIANT', 'Desconto do adiantamento salarial', '9200', '2', '00', '9', '00'),
    m('VT', 'Desconto de vale-transporte', '9216', '2', '00', '9', '00'),
    // 13º: o FGTS incide sobre a 1ª parcela no mês do pagamento; CP e IRRF só na folha anual (MOS, cap. I).
    m('13A', '13º salário - 1ª parcela', '5504', '1', '00', '9', '12', 'A 1ª parcela não é base de CP nem de IRRF no mês: confira o codIncIRRF com a contabilidade.'),
    m('13', '13º salário', '5001', '1', '12', '12', '12'),
    m('13ADT', 'Desconto da 1ª parcela do 13º', '9214', '2', '00', '9', '12'),
    m('INSS13', 'INSS sobre 13º salário', '9201', '2', '32', '42', '00'),
    m('IRRF13', 'IRRF sobre 13º salário', '9203', '2', '00', '32', '00'),
    m('PENSAO13', 'Pensão alimentícia sobre 13º', '9213', '2', '00', '52', '00'),
    // Férias (MOS, S-1200, item 19): adiantamento 1015 e desconto 9221 com IRRF 13; na folha do gozo, 1016 e 1017.
    m('FERADI', 'Adiantamento de férias', '1015', '1', '00', '13', '00'),
    m('FERADI13', 'Adiantamento do 1/3 de férias', '1015', '1', '00', '13', '00'),
    m('FERMES', 'Férias', '1016', '1', '11', '13', '11'),
    m('FERMES13', '1/3 constitucional de férias', '1017', '1', '11', '13', '11'),
    m('FERPAGO', 'Desconto das férias pagas no recibo', '9221', '2', '00', '13', '00'),
    m('FERDOB', 'Férias em dobro', '1024', '1', '00', '13', '00'),
    m('FERDOB13', '1/3 das férias em dobro', '1024', '1', '00', '13', '00'),
    m('ABONO', 'Abono pecuniário de férias', '1023', '1', '00', '79', '00', 'Abono pecuniário é isento de IRRF: confira o código da isenção na Tabela 21.'),
    m('ABONO13', '1/3 do abono pecuniário de férias', '1023', '1', '00', '79', '00', 'Abono pecuniário é isento de IRRF: confira o código da isenção na Tabela 21.'),
    // O INSS das férias é da folha do gozo; no recibo, sem incidência (eventosFolha: as duas não podem ter 31).
    m('INSSFER', 'INSS das férias (recibo)', '9201', '2', '00', '43', '00'),
    m('IRRFFER', 'IRRF das férias (recibo)', '9203', '2', '00', '33', '00'),
    m('INSSFERRET', 'INSS das férias (folha do gozo)', '9201', '2', '31', '9', '00'),
    m('IRRFFERRET', 'IRRF das férias (folha do gozo)', '9203', '2', '00', '9', '00'),
    m('PENSAOFER', 'Pensão alimentícia sobre férias', '9213', '2', '00', '53', '00'),
    // Rescisão (S-2299): verbas próprias. Aviso e indenizações isentos de IRRF (Lei 7.713/88, art. 6º, V).
    m(`${PREFIXO_RESC}SAL`, 'Saldo de salário', '6000', '1', '11', '11', '11'),
    m(`${PREFIXO_RESC}AVISO`, 'Aviso prévio indenizado', '6003', '1', '00', '74', '21', 'Aviso indenizado: FGTS 21 e isento de IRRF; confira o código da isenção na Tabela 21.'),
    m(`${PREFIXO_RESC}AVISODESC`, 'Desconto do aviso prévio não cumprido', '6901', '2', '00', '9', '00'),
    m(`${PREFIXO_RESC}ART479`, 'Indenização do art. 479 da CLT', '6104', '1', '00', '74', '00', 'Indenização isenta de IRRF: confira o código da isenção na Tabela 21.'),
    m(`${PREFIXO_RESC}13PROP`, '13º salário proporcional', '6002', '1', '12', '12', '12'),
    m(`${PREFIXO_RESC}13IND`, '13º salário sobre o aviso indenizado', '6001', '1', '12', '12', '12'),
    m(`${PREFIXO_RESC}FV`, 'Férias vencidas', '6007', '1', '00', '74', '00', 'Férias indenizadas: isentas de IRRF; confira o código da isenção na Tabela 21.'),
    m(`${PREFIXO_RESC}FV13`, '1/3 sobre férias vencidas', '6007', '1', '00', '74', '00', 'Férias indenizadas: isentas de IRRF; confira o código da isenção na Tabela 21.'),
    m(`${PREFIXO_RESC}FVD`, 'Dobra das férias vencidas', '6004', '1', '00', '74', '00', 'Férias indenizadas: isentas de IRRF; confira o código da isenção na Tabela 21.'),
    m(`${PREFIXO_RESC}FVD13`, '1/3 sobre a dobra das férias', '6004', '1', '00', '74', '00', 'Férias indenizadas: isentas de IRRF; confira o código da isenção na Tabela 21.'),
    m(`${PREFIXO_RESC}FP`, 'Férias proporcionais', '6006', '1', '00', '74', '00', 'Férias indenizadas: isentas de IRRF; confira o código da isenção na Tabela 21.'),
    m(`${PREFIXO_RESC}FP13`, '1/3 sobre férias proporcionais', '6006', '1', '00', '74', '00', 'Férias indenizadas: isentas de IRRF; confira o código da isenção na Tabela 21.'),
];
const MODELO_POR_CHAVE = new Map(MODELOS.map(x => [x.chave, x]));

/** Modelo da verba: o próprio; hora extra com outro adicional (HE60, HE75…), como a HE50. */
export function modeloDaVerba(chave: string): ModeloRubrica | undefined {
    const x = MODELO_POR_CHAVE.get(chave);
    if (x) return x;
    const he = chave.match(/^HE(\d+)(?:_(\d+))?$/);
    if (he) { const p = he[2] ? `${he[1]},${he[2]}` : he[1]; return { chave, dados: { ...MODELO_POR_CHAVE.get('HE50')!.dados, dscRubr: `Horas extras ${p}%` } }; }
    return undefined;
}

/** Código sugerido para a rubrica nova: o da tabela do Consultor (sem "eSocial" no início, até 30 caracteres). */
export const codigoSugerido = (chave: string) => `CDP${chave.replace(/^RESC:/, 'R').replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 30);

/** A tabela (ideTabRubr) mais usada pela empresa; sem rubricas, a do Consultor. */
export function tabelaSugerida(rubricas: Pick<Rubrica, 'ideTabRubr'>[]): string {
    const n = new Map<string, number>();
    for (const r of rubricas) n.set(r.ideTabRubr, (n.get(r.ideTabRubr) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'CDP';
}

/** Pedido de inclusão para uma verba do motor, pelo modelo (sem modelo: só a descrição e o tipo). */
export function pedidoDaVerba(empresaId: string, item: { chave: string; descricao: string; tipo: 'provento' | 'desconto' }, rubricas: Rubrica[], iniValid: string): PedidoS1010 {
    const modelo = modeloDaVerba(item.chave);
    const dados = modelo ? { ...modelo.dados } : { ...dadosVazios(), dscRubr: item.descricao.slice(0, 100), tpRubr: item.tipo === 'provento' ? '1' : '2' };
    return { ...pedidoVazio(empresaId), codRubr: codigoSugerido(item.chave), ideTabRubr: tabelaSugerida(rubricas), iniValid, dados, chaveVerba: item.chave };
}

// ---------- Validação ----------

export interface ConferenciaPedido { erros: string[]; avisos: string[] }

const suspensa = (d: DadosRubrica) => /^9\d$/.test(d.codIncCP) || /^9\d$/.test(d.codIncFGTS) || /^9\d$|^9\d{3}$/.test(d.codIncIRRF) || /^9\d$/.test(d.codIncCPRP);

export function validarDados(d: DadosRubrica): string[] {
    const e: string[] = [];
    const dsc = d.dscRubr;
    if (!dsc.trim()) e.push('Descrição da rubrica em branco.');
    else if (dsc !== dsc.trim()) e.push('Descrição com espaço no início ou no fim.');
    else if (dsc.length > 100) e.push('Descrição com mais de 100 caracteres.');
    if (!/^\d{4}$/.test(d.natRubr)) e.push('Natureza (Tabela 03) com 4 dígitos.');
    if (!['1', '2', '3', '4'].includes(d.tpRubr)) e.push('Tipo da rubrica: 1 a 4.');
    if (!COD_INC_CP[d.codIncCP]) e.push(`codIncCP ${d.codIncCP || '(vazio)'} não existe no leiaute.`);
    if (!COD_INC_FGTS[d.codIncFGTS]) e.push(`codIncFGTS ${d.codIncFGTS || '(vazio)'} não existe no leiaute.`);
    if (!/^\d{1,4}$/.test(d.codIncIRRF)) e.push('codIncIRRF: código da Tabela 21 (1 a 4 dígitos).');
    if (d.codIncCPRP && !['00', '11', '12', '31', '32', '91', '92'].includes(d.codIncCPRP)) e.push(`codIncCPRP ${d.codIncCPRP} não existe no leiaute.`);
    if (d.observacao.length > 255) e.push('Observação com mais de 255 caracteres.');
    if (suspensa(d)) e.push('Incidência suspensa (9x) exige o processo do S-1070 no S-1010: envie esta rubrica pelo sistema que tem o processo cadastrado.');
    if (/^990[1-8]$/.test(d.natRubr) && (d.codIncCP !== '00' || d.codIncFGTS !== '00' || d.codIncIRRF !== '9' || !['', '00'].includes(d.codIncCPRP)))
        e.push(`Natureza ${d.natRubr} (conferência de base): codIncCP 00, codIncFGTS 00 e codIncIRRF 9 (MOS, S-1010, item 1.4).`);
    if (d.natRubr === '9253' && (d.tpRubr !== '2' || d.codIncFGTS !== '31' || d.codIncCP !== '00' || d.codIncIRRF !== '9'))
        e.push('Natureza 9253 (eConsignado): desconto, codIncFGTS 31, codIncCP 00 e codIncIRRF 9 (MOS, S-1200, item 20).');
    if (d.codIncFGTS === '31' && d.natRubr !== '9253') e.push('codIncFGTS 31 (eConsignado) só com a natureza 9253.');
    if (['31', '32'].includes(d.codIncCP) && d.tpRubr !== '2') e.push(`codIncCP ${d.codIncCP} é o desconto da contribuição do segurado: a rubrica tem de ser de desconto.`);
    return e;
}

const chaveRubrica = (p: Pick<PedidoS1010, 'ideTabRubr' | 'codRubr'>) => `${p.ideTabRubr}|${p.codRubr}`;

/** Confere o pedido contra o leiaute, o MOS e as vigências que o Consultor conhece da rubrica. */
export function validarPedido(p: PedidoS1010, rubricas: Rubrica[], hojeComp?: string): ConferenciaPedido {
    const erros: string[] = []; const avisos: string[] = [];
    if (!p.codRubr) erros.push('Código da rubrica em branco.');
    else {
        if (p.codRubr !== p.codRubr.trim()) erros.push('Código da rubrica com espaço no início ou no fim.');
        if (p.codRubr.length > 30) erros.push('Código da rubrica com mais de 30 caracteres.');
        if (/^esocial/i.test(p.codRubr)) erros.push('O código da rubrica não pode começar com "eSocial" (MOS, S-1010, item 1.3).');
    }
    if (!p.ideTabRubr) erros.push('Identificador da tabela (ideTabRubr) em branco.');
    else if (p.ideTabRubr !== p.ideTabRubr.trim() || p.ideTabRubr.length > 8) erros.push('Identificador da tabela: até 8 caracteres, sem espaço no início ou no fim.');
    if (!COMP.test(p.iniValid)) erros.push('Início da validade em AAAA-MM.');
    if (p.fimValid && (!COMP.test(p.fimValid) || p.fimValid < p.iniValid)) erros.push('Fim da validade em AAAA-MM, igual ou depois do início.');
    if (p.acao !== 'exclusao') {
        if (!p.dados) erros.push('Dados da rubrica em branco.');
        else erros.push(...validarDados(p.dados));
    }
    if (p.acao === 'alteracao') {
        if (p.novaIniValid && !COMP.test(p.novaIniValid)) erros.push('Novo início da validade em AAAA-MM.');
        if (p.novaFimValid && (!COMP.test(p.novaFimValid) || p.novaFimValid < (p.novaIniValid || p.iniValid))) erros.push('Novo fim da validade em AAAA-MM, igual ou depois do início.');
        if (p.novaFimValid && !p.novaIniValid) erros.push('Para informar o fim da validade, repita o início em "novo início".');
    }
    if (hojeComp && COMP.test(p.iniValid) && p.iniValid > hojeComp && p.acao === 'inclusao') avisos.push(`Início da validade no futuro (${p.iniValid}): o eSocial só aceita até a competência seguinte à atual.`);

    const r = rubricas.find(x => x.ideTabRubr === p.ideTabRubr && x.codRubr === p.codRubr);
    const mesma = r?.vigencias.find(v => v.iniValid === p.iniValid);
    if (p.acao === 'inclusao') {
        if (mesma) erros.push(`A rubrica ${p.codRubr} já tem vigência a partir de ${p.iniValid}: para corrigir, use alteração (MOS, S-1010, item 2.1).`);
        else if (r?.vigencias.some(v => v.iniValid > p.iniValid)) avisos.push(`A rubrica ${p.codRubr} tem vigência que começa depois de ${p.iniValid}: o eSocial recusa a inclusão se os períodos conflitarem.`);
        else if (r && COMP.test(p.iniValid)) avisos.push(`Nova vigência da rubrica ${p.codRubr} a partir de ${p.iniValid}: o eSocial encerra a anterior no mês anterior (MOS, S-1010, item 2.4 b).`);
    } else {
        if (!mesma) erros.push(`O Consultor não conhece a vigência ${p.iniValid || '(vazia)'} da rubrica ${p.codRubr}. Importe o S-1010 do eSocial em Cadastros › Incidências antes de ${p.acao === 'alteracao' ? 'alterar' : 'excluir'}.`);
        if (p.acao === 'exclusao') avisos.push(`Exclusão da rubrica ${p.codRubr} (${p.iniValid}): o eSocial recusa se ela foi usada em S-1200 ou S-2299 do período. Para deixar de usar, prefira informar o fim da validade (alteração).`);
        if (p.acao === 'alteracao' && mesma && p.dados && p.dados.natRubr !== mesma.dados.natRubr) avisos.push(`A natureza muda de ${mesma.dados.natRubr} para ${p.dados.natRubr}: os S-1200 já enviados com a rubrica só refletem a mudança se forem retificados (MOS, S-1010, item 2.5).`);
        else if (p.acao === 'alteracao') avisos.push('A alteração só vale para os S-1200 e S-2299 enviados depois dela; os já enviados precisam de retificação para refletir (MOS, S-1010, item 2.5).');
    }
    return { erros, avisos };
}

/** Conferência do lote: até 50 eventos e uma operação por rubrica (a ordem de processamento no lote não é garantida). */
export function validarLote(pedidos: PedidoS1010[]): string[] {
    const e: string[] = [];
    if (!pedidos.length) e.push('Nenhum pedido para transmitir.');
    if (pedidos.length > 50) e.push(`São ${pedidos.length} pedidos; o lote leva até 50. Transmita em partes.`);
    const vistos = new Map<string, number>();
    for (const p of pedidos) vistos.set(chaveRubrica(p), (vistos.get(chaveRubrica(p)) ?? 0) + 1);
    for (const [k, n] of vistos) if (n > 1) e.push(`A rubrica ${k.split('|')[1]} tem ${n} pedidos no lote: transmita um, espere o retorno e depois o outro.`);
    return e;
}

// ---------- XML ----------

function xmlDados(d: DadosRubrica): string {
    return `<dadosRubrica><dscRubr>${esc(d.dscRubr)}</dscRubr><natRubr>${d.natRubr}</natRubr><tpRubr>${d.tpRubr}</tpRubr>`
        + `<codIncCP>${d.codIncCP}</codIncCP><codIncIRRF>${Number(d.codIncIRRF)}</codIncIRRF><codIncFGTS>${d.codIncFGTS}</codIncFGTS>`
        + (d.codIncCPRP ? `<codIncCPRP>${d.codIncCPRP}</codIncCPRP>` : '')
        + (d.observacao.trim() ? `<observacao>${esc(d.observacao.trim())}</observacao>` : '')
        + '</dadosRubrica>';
}

/** S-1010 do pedido. `seq` distingue os eventos do mesmo lote (o mesmo segundo). */
export function gerarS1010(e: { cnpj: string; tpAmb: TpAmb; pedido: PedidoS1010; agora?: Date; seq?: number }): { id: string; xml: string } {
    const p = e.pedido;
    const agora = e.agora ?? new Date();
    const id = idEvento(e.cnpj, agora, e.seq ?? agora.getMilliseconds() * 100 + 1);
    const ide = `<ideRubrica><codRubr>${esc(p.codRubr)}</codRubr><ideTabRubr>${esc(p.ideTabRubr)}</ideTabRubr><iniValid>${p.iniValid}</iniValid>${p.fimValid ? `<fimValid>${p.fimValid}</fimValid>` : ''}</ideRubrica>`;
    const nova = p.acao === 'alteracao' && p.novaIniValid ? `<novaValidade><iniValid>${p.novaIniValid}</iniValid>${p.novaFimValid ? `<fimValid>${p.novaFimValid}</fimValid>` : ''}</novaValidade>` : '';
    const corpo = p.acao === 'exclusao' ? `<exclusao>${ide}</exclusao>` : `<${p.acao}>${ide}${xmlDados(p.dados!)}${nova}</${p.acao}>`;
    const xml = `<eSocial xmlns="${NS}"><evtTabRubrica Id="${id}">`
        + `<ideEvento><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${e.cnpj.replace(/\D/g, '').slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<infoRubrica>${corpo}</infoRubrica></evtTabRubrica></eSocial>`;
    return { id, xml };
}

/** Eventos do lote, com Ids distintos no mesmo segundo. */
export function gerarLoteS1010(cnpj: string, tpAmb: TpAmb, pedidos: PedidoS1010[], agora = new Date()): { pedido: PedidoS1010; id: string; xml: string }[] {
    const base = agora.getMilliseconds() * 100;
    return pedidos.map((pedido, i) => ({ pedido, ...gerarS1010({ cnpj, tpAmb, pedido, agora, seq: base + i + 1 }) }));
}

// ---------- Aceito: aplica no cadastro ----------

/**
 * Rubrica depois do S-1010 aceito, pelas mesmas regras da importação (consolidarRubricas): a vigência incluída,
 * alterada ou excluída. O vínculo manual com o evento do IOB é preservado. null = a rubrica ficou sem vigências.
 */
export function aplicarPedido(p: PedidoS1010, atual: Rubrica | undefined, recibo: string): Rubrica | null {
    const base: EventoRubrica[] = (atual?.vigencias ?? []).map((v, i) => ({
        id: `atual${i}`, fonte: 'cadastro', acao: 'inclusao', codRubr: p.codRubr, ideTabRubr: p.ideTabRubr,
        iniValid: v.iniValid, fimValid: v.fimValid, dados: v.dados, recibo: v.recibo, processadoEm: '0',
    }));
    const ev: EventoRubrica = {
        id: 'pedido', fonte: 'Consultor', acao: p.acao, codRubr: p.codRubr, ideTabRubr: p.ideTabRubr, iniValid: p.iniValid, fimValid: p.fimValid,
        novaValidade: p.acao === 'alteracao' && p.novaIniValid ? { iniValid: p.novaIniValid, fimValid: p.novaFimValid } : undefined,
        dados: p.dados ? { ...p.dados, codIncIRRF: String(Number(p.dados.codIncIRRF)) } : undefined, recibo, processadoEm: '1',
    };
    const r = consolidarRubricas([...base, ev], p.empresaId).rubricas[0];
    if (!r) return null;
    return { ...r, id: idRubrica(p.empresaId, p.ideTabRubr, p.codRubr), eventoIob: atual?.eventoIob ?? '', origem: atual?.origem || 'Consultor: S-1010' };
}

/** Resumo de uma linha para a lista de pedidos. */
export function resumoPedido(p: PedidoS1010): string {
    const vig = `${p.iniValid}${p.fimValid ? ` a ${p.fimValid}` : ''}`;
    if (p.acao === 'exclusao') return `Excluir a vigência ${vig}`;
    const d = p.dados!;
    const nova = p.acao === 'alteracao' && p.novaIniValid ? ` → validade ${p.novaIniValid}${p.novaFimValid ? ` a ${p.novaFimValid}` : ''}` : '';
    return `${d.dscRubr} · nat. ${d.natRubr} · CP ${d.codIncCP} · IRRF ${d.codIncIRRF} · FGTS ${d.codIncFGTS} · ${vig}${nova}`;
}

/** Dados vigentes da rubrica na competência (para pré-preencher a alteração). */
export const dadosVigentes = (r: Rubrica, competencia: string) => vigenciaEm(r, competencia) ?? r.vigencias[r.vigencias.length - 1];
