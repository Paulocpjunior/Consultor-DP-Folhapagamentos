// services/cadastros/afastamentos.ts
//
// Arquivos › Afastamentos/Retorno do IOB Office = evento S-2230 do eSocial.
// Um afastamento por vínculo e data de início. A carga vem dos XMLs do S-2230
// (início e término podem chegar em eventos separados), com retificação e
// exclusão (S-3000) aplicadas pelo número do recibo.
//
// Motivos: Tabela 18 do eSocial. Só os códigos conferidos em fonte pública
// têm rótulo aqui (busca de 04/10/2026, inclusive as alterações da NT 04/2025);
// qualquer outro código de 2 dígitos é aceito e aparece como "conferir na
// Tabela 18", nunca com descrição inventada.

import { dataValida } from './documentos';
import { idFuncionario, type FichaFuncionario } from './funcionarios';
import { NS_2X, NS_S1 } from '../implantacao/implantacao';
import { chaveIdEvento } from './esocialDoBackup';

export interface Afastamento {
    id: string;
    empresaId: string;
    fichaId: string;
    cpf: string;
    matriculaEsocial: string;
    dtInicio: string;
    dtFim: string;
    motivo: string;
    infoMesmoMtv: string;
    tpAcidTransito: string;
    observacao: string;
    perAquisInicio: string;
    perAquisFim: string;
    /** Férias (motivo 15): dias vendidos como abono pecuniário (CLT, art. 143). Só no Consultor; não vai ao eSocial. */
    abonoDias?: string;
    origem: string;
    recibos: string[];
}

export const MOTIVOS: Record<string, string> = {
    '01': 'Acidente/doença do trabalho',
    '03': 'Acidente/doença não relacionada ao trabalho',
    '06': 'Aposentadoria por invalidez',
    '07': 'Licença para acompanhamento de membro da família enfermo',
    '11': 'Cárcere',
    '14': 'Cessão/requisição',
    '15': 'Gozo de férias ou recesso',
    '16': 'Licença remunerada (lei, liberalidade da empresa ou acordo/convenção coletiva)',
    '17': 'Licença-maternidade (120 dias)',
    '18': 'Licença-maternidade: prorrogação por 60 dias, Lei 11.770/2008 (Empresa Cidadã)',
    '19': 'Licença-maternidade: aborto não criminoso',
    '20': 'Licença-maternidade: adoção ou guarda judicial de criança',
    '21': 'Licença não remunerada ou suspensão contratual decorrente de obrigação legal incompatível com a continuação do serviço',
    '24': 'Mandato sindical',
    '25': 'Mulher vítima de violência, Lei 11.340/2006 (Maria da Penha)',
    '29': 'Serviço militar obrigatório',
    '30': 'Suspensão disciplinar (CLT art. 474)',
    '33': 'Licença-maternidade de 180 dias, Lei 13.301/2016',
    '35': 'Licença-maternidade: antecipação e/ou prorrogação mediante atestado médico',
    '43': 'Licença-maternidade: prorrogação por 60 dias, Lei 15.156/2025',
    '44': 'Suspensão contratual por reclamação trabalhista pedindo rescisão indireta',
    '45': 'Suspensão contratual para inquérito de apuração de falta grave',
};

export const rotuloMotivo = (c: string) => (MOTIVOS[c] ? `${c} - ${MOTIVOS[c]}` : c ? `${c} - conferir na Tabela 18 do eSocial` : '');
export const ACID_TRANSITO: Record<string, string> = { '1': 'Atropelamento', '2': 'Colisão', '3': 'Outros' };

export const idAfastamento = (fichaId: string, dtInicio: string) => `${fichaId}_${dtInicio}`;

export function afastamentoVazio(): Afastamento {
    return { id: '', empresaId: '', fichaId: '', cpf: '', matriculaEsocial: '', dtInicio: '', dtFim: '', motivo: '', infoMesmoMtv: '', tpAcidTransito: '', observacao: '', perAquisInicio: '', perAquisFim: '', abonoDias: '', origem: '', recibos: [] };
}

export const emAberto = (a: Afastamento, hoje: string) => a.dtInicio <= hoje && (!a.dtFim || a.dtFim >= hoje);

const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000) + 1;
const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Dias de calendário em que o afastamento cai na competência (AAAA-MM). Sem término, vai até o fim do mês. */
export function diasNaCompetencia(a: Afastamento, competencia: string): number {
    const ini = `${competencia}-01`;
    const [y, m] = competencia.split('-').map(Number);
    const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const de = a.dtInicio > ini ? a.dtInicio : ini;
    const ate = a.dtFim && a.dtFim < fim ? a.dtFim : fim;
    return de > ate ? 0 : dias(de, ate);
}

export const duracao = (a: Afastamento) => (a.dtFim && dataValida(a.dtFim) ? dias(a.dtInicio, a.dtFim) : null);

/**
 * Doença ou acidente (01, 03): a empresa paga os 15 primeiros dias e o INSS
 * a partir do 16º (Lei 8.213/1991, art. 60). Com "mesmo motivo em 60 dias" a
 * contagem depende do afastamento anterior, e aqui não se calcula.
 */
export function inicioBeneficio(a: Afastamento): string | null {
    if (!['01', '03'].includes(a.motivo) || a.infoMesmoMtv === 'S' || !dataValida(a.dtInicio)) return null;
    return somarDias(a.dtInicio, 15);
}

export function validarAfastamento(a: Afastamento, ficha: FichaFuncionario | undefined, outros: Afastamento[]): { erros: string[]; avisos: string[] } {
    const erros: string[] = []; const avisos: string[] = [];
    if (!a.fichaId) erros.push('Selecione o funcionário.');
    if (!dataValida(a.dtInicio)) erros.push('Data de início inválida.');
    if (a.dtFim && !dataValida(a.dtFim)) erros.push('Data de término inválida.');
    if (dataValida(a.dtInicio) && a.dtFim && dataValida(a.dtFim) && a.dtFim < a.dtInicio) erros.push('Término anterior ao início.');
    if (!/^\d{2}$/.test(a.motivo)) erros.push('Informe o motivo (código de 2 dígitos da Tabela 18).');
    else if (!MOTIVOS[a.motivo]) avisos.push(`Motivo ${a.motivo} sem descrição neste cadastro: conferir na Tabela 18 do eSocial.`);
    if (a.tpAcidTransito && !['01', '03'].includes(a.motivo)) erros.push('Acidente de trânsito só com motivo 01 ou 03.');
    if (a.infoMesmoMtv && !['01', '03'].includes(a.motivo)) erros.push('"Mesmo motivo em 60 dias" só com motivo 01 ou 03.');
    if ((a.perAquisInicio || a.perAquisFim) && a.motivo !== '15') erros.push('Período aquisitivo só para férias (motivo 15).');
    for (const [v, r] of [[a.perAquisInicio, 'Início'], [a.perAquisFim, 'Fim']]) if (v && !dataValida(v)) erros.push(`${r} do período aquisitivo inválido.`);
    if (a.abonoDias) {
        if (a.motivo !== '15') erros.push('Abono pecuniário só para férias (motivo 15).');
        else if (!/^\d{1,2}$/.test(a.abonoDias) || Number(a.abonoDias) > 10) erros.push('Abono pecuniário: de 1 a 10 dias (até 1/3 das férias, CLT art. 143).');
    }
    if (ficha && dataValida(a.dtInicio)) {
        if (ficha.dados.admissao && a.dtInicio < ficha.dados.admissao) erros.push('Início anterior à admissão.');
        if (ficha.dados.dataDesligamento && a.dtInicio > ficha.dados.dataDesligamento) erros.push('Início posterior ao desligamento.');
    }
    const fimA = a.dtFim || '9999-12-31';
    for (const o of outros) {
        if (o.fichaId !== a.fichaId || o.id === a.id) continue;
        if (a.dtInicio <= (o.dtFim || '9999-12-31') && o.dtInicio <= fimA) { erros.push(`Sobrepõe o afastamento iniciado em ${o.dtInicio.split('-').reverse().join('/')}.`); break; }
    }
    if (!a.dtFim) avisos.push('Sem data de término: afastamento em aberto.');
    return { erros, avisos };
}

// ---------- Leitura dos XMLs do S-2230 ----------

export interface EventoAfast {
    id: string; tipo: 'S-2230' | 'S-3000'; fonte: string; cpf: string; matricula: string;
    recibo: string; retifica: string; exclui: string;
    inicio?: { dt: string; motivo: string; infoMesmoMtv: string; tpAcidTransito: string; observacao: string; perAquisInicio: string; perAquisFim: string };
    fim?: string;
}

const filhos = (e: Element, n: string) => Array.from(e.children).filter(c => c.localName === n);
const no = (e: Element | null | undefined, caminho: string) => caminho.split('/').reduce<Element | undefined>((p, n) => p && filhos(p, n)[0], e ?? undefined);
const val = (e: Element | null | undefined, caminho: string) => no(e, caminho)?.textContent?.trim() ?? '';

export interface OpcoesAfastamentos {
    /**
     * Recibos que o IOB guardou no backup (Id do evento → nrRecibo). O XML
     * enviado não traz o retorno: com o mapa, o recibo dele vale e o evento
     * sem recibo fica de fora; `null` = o backup não traz recibos (o evento
     * entra sem recibo). Sem a opção, exige o retorno 201 no próprio XML.
     */
    recibos?: Map<string, string> | null;
    /** Aceita leiaute 2.x e XML sem namespace (cópias guardadas pelo IOB). */
    leiautesAntigos?: boolean;
}

/** Lê S-2230 e as exclusões (S-3000) de S-2230 de um arquivo; só eventos de produção com recibo 201 entram. */
export function lerXmlAfastamentos(nome: string, xml: string, raizCnpj: string, opcoes: OpcoesAfastamentos = {}): { eventos: EventoAfast[]; avisos: string[] } {
    const avisos: string[] = []; const eventos: EventoAfast[] = [];
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { eventos, avisos: [`${nome}: XML com DTD ou entidades não é aceito.`] };
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return { eventos, avisos: [`${nome}: XML malformado.`] };
    const els = Array.from(doc.getElementsByTagName('*')).filter(e => (e.localName === 'evtAfastTemp' || e.localName === 'evtExclusao') && e.hasAttribute('Id'));
    if (!els.length) return { eventos, avisos: [`${nome}: nenhum S-2230 no arquivo.`] };
    for (const el of els) {
        const ns = el.namespaceURI || '';
        if (!NS_S1.test(ns) && !(opcoes.leiautesAntigos && (NS_2X.test(ns) || !ns))) { avisos.push(`${nome}: versão do leiaute não suportada ("${ns || 'sem namespace'}").`); continue; }
        if (el.localName === 'evtExclusao' && val(el, 'infoExclusao/tpEvento') !== 'S-2230') continue;
        if (val(el, 'ideEmpregador/nrInsc').slice(0, 8) !== raizCnpj) { avisos.push(`${nome}: empregador diferente; ignorado.`); continue; }
        if (val(el, 'ideEvento/tpAmb') !== '1') { avisos.push(`${nome}: ambiente diferente de produção; ignorado.`); continue; }
        let env: Element | null = el.parentElement;
        while (env && env.localName !== 'retornoEventoCompleto') env = env.parentElement;
        const ret = env ? no(env, 'recibo/eSocial/retornoEvento') : undefined;
        let recibo = '';
        if (ret) {
            if (val(ret, 'processamento/cdResposta') !== '201') { avisos.push(`${nome}: evento sem recibo de processamento (201); ignorado.`); continue; }
            recibo = val(ret, 'recibo/nrRecibo');
        } else if (opcoes.recibos !== undefined) {
            // Backup do IOB: o recibo vem da tabela de eventos transmitidos.
            const rec = opcoes.recibos?.get(chaveIdEvento(el.getAttribute('Id')!));
            if (opcoes.recibos && !rec) { avisos.push(`${nome}: sem recibo no IOB (envio recusado ou não concluído); ignorado.`); continue; }
            recibo = rec ?? '';
        } else { avisos.push(`${nome}: evento sem recibo de processamento (201); ignorado.`); continue; }
        if (el.localName === 'evtExclusao') {
            eventos.push({ id: el.getAttribute('Id')!, tipo: 'S-3000', fonte: nome, cpf: val(el, 'infoExclusao/ideTrabalhador/cpfTrab'), matricula: '', recibo, retifica: '', exclui: val(el, 'infoExclusao/nrRecEvt') });
            continue;
        }
        const cpf = val(el, 'ideVinculo/cpfTrab'); const matricula = val(el, 'ideVinculo/matricula');
        if (!matricula) { avisos.push(`${nome}: S-2230 sem matrícula (trabalhador sem vínculo) fora do cadastro de funcionários; ignorado.`); continue; }
        const ini = no(el, 'infoAfastamento/iniAfastamento');
        const fim = val(el, 'infoAfastamento/fimAfastamento/dtTermAfast');
        eventos.push({
            id: el.getAttribute('Id')!, tipo: 'S-2230', fonte: nome, cpf, matricula, recibo,
            retifica: val(el, 'ideEvento/indRetif') === '2' ? val(el, 'ideEvento/nrRecibo') : '', exclui: '',
            inicio: ini ? {
                dt: val(ini, 'dtIniAfast'), motivo: val(ini, 'codMotAfast'), infoMesmoMtv: val(ini, 'infoMesmoMtv'), tpAcidTransito: val(ini, 'tpAcidTransito'),
                observacao: val(ini, 'observacao'), perAquisInicio: val(ini, 'perAquis/dtInicio'), perAquisFim: val(ini, 'perAquis/dtFim'),
            } : undefined,
            fim: fim || undefined,
        });
    }
    return { eventos, avisos };
}

/** Aplica exclusões e retificações e monta os afastamentos por vínculo. */
export function consolidarAfastamentos(eventos: EventoAfast[], empresa: { id: string }, fichas: FichaFuncionario[]): { afastamentos: Afastamento[]; avisos: string[] } {
    const avisos: string[] = [];
    const unicos = [...new Map(eventos.map(e => [e.id, e])).values()];
    const excluidos = new Set(unicos.filter(e => e.tipo === 'S-3000').map(e => e.exclui));
    let vivos = unicos.filter(e => e.tipo === 'S-2230' && !excluidos.has(e.recibo));
    const porRecibo = new Map(vivos.map(e => [e.recibo, e]));
    const substituidos = new Set<string>();
    for (const e of vivos) if (e.retifica) {
        if (porRecibo.has(e.retifica)) substituidos.add(e.retifica);
        else avisos.push(`${e.fonte}: retificação do recibo ${e.retifica}, cujo original não veio nos arquivos; usada como está.`);
    }
    vivos = vivos.filter(e => !substituidos.has(e.recibo));
    const fichaPorId = new Map(fichas.map(f => [f.id, f]));
    const mapa = new Map<string, Afastamento>();
    const ordenados = [...vivos].sort((a, b) => (a.inicio?.dt ?? a.fim ?? '').localeCompare(b.inicio?.dt ?? b.fim ?? ''));
    for (const e of ordenados) {
        const fichaId = idFuncionario(empresa.id, e.cpf, e.matricula);
        if (!fichaPorId.has(fichaId)) { avisos.push(`${e.fonte}: CPF ${e.cpf}, matrícula ${e.matricula} sem ficha nesta empresa; importe o S-2200 antes.`); continue; }
        if (e.inicio) {
            const id = idAfastamento(fichaId, e.inicio.dt);
            const atual = mapa.get(id);
            mapa.set(id, {
                id, empresaId: empresa.id, fichaId, cpf: e.cpf, matriculaEsocial: e.matricula,
                dtInicio: e.inicio.dt, dtFim: e.fim ?? atual?.dtFim ?? '', motivo: e.inicio.motivo, infoMesmoMtv: e.inicio.infoMesmoMtv,
                tpAcidTransito: e.inicio.tpAcidTransito, observacao: e.inicio.observacao, perAquisInicio: e.inicio.perAquisInicio, perAquisFim: e.inicio.perAquisFim,
                origem: `eSocial: S-2230 · ${e.fonte}`, recibos: [...new Set([...(atual?.recibos ?? []), e.recibo])],
            });
        } else if (e.fim) {
            const aberto = [...mapa.values()].filter(a => a.fichaId === fichaId && a.dtInicio <= e.fim! && (!a.dtFim || a.dtFim === e.fim))
                .sort((a, b) => b.dtInicio.localeCompare(a.dtInicio))[0];
            if (!aberto) { avisos.push(`${e.fonte}: término em ${e.fim} sem o início do afastamento nos arquivos; envie também o S-2230 de início.`); continue; }
            aberto.dtFim = e.fim; aberto.recibos = [...new Set([...aberto.recibos, e.recibo])];
        }
    }
    return { afastamentos: [...mapa.values()], avisos: [...new Set(avisos)] };
}

export interface MesclaAfastamento { afastamento: Afastamento; novo: boolean; mudou: boolean; preservado: boolean }

/** Afastamento lançado à mão (origem "Manual") não é trocado pela importação; a diferença aparece na prévia. */
export function mesclarAfastamentos(importados: Afastamento[], existentes: Afastamento[]): MesclaAfastamento[] {
    const porId = new Map(existentes.map(a => [a.id, a]));
    const chave = (a: Afastamento) => JSON.stringify([a.dtFim, a.motivo, a.infoMesmoMtv, a.tpAcidTransito, a.observacao, a.perAquisInicio, a.perAquisFim, a.abonoDias || '']);
    return importados.map(imp => {
        const atual = porId.get(imp.id);
        if (!atual) return { afastamento: imp, novo: true, mudou: true, preservado: false };
        if (atual.origem.startsWith('Manual')) return { afastamento: atual, novo: false, mudou: false, preservado: chave(atual) !== chave(imp) };
        // O abono é só do Consultor e o período aquisitivo pode ter vindo do histórico do IOB:
        // a reimportação de um S-2230 que não os traz não os apaga.
        const final = {
            ...imp,
            abonoDias: imp.abonoDias || atual.abonoDias,
            perAquisInicio: imp.perAquisInicio || atual.perAquisInicio,
            perAquisFim: imp.perAquisInicio ? imp.perAquisFim : atual.perAquisFim,
        };
        return { afastamento: final, novo: false, mudou: chave(atual) !== chave(final), preservado: false };
    });
}
