// services/transferencia/transferencia.ts
//
// Transferência de empregado para outra empresa do mesmo grupo econômico, sem rescisão (CLT, arts. 2º, § 2º, 10 e
// 448): o contrato continua, com o tempo de casa, as férias e o 13º a cargo da sucessora. No eSocial:
// - empresa de origem: S-2299 com o motivo 11 (Tabela 19: transferência para empresa do mesmo grupo que assumiu os
//   encargos, sem rescisão), o grupo sucessaoVinc com o CNPJ da sucessora e sem verbas rescisórias (vedadas para o
//   motivo 11); a data do desligamento é o último dia trabalhado na origem, a véspera da transferência;
// - empresa de destino: S-2200 com tpAdmissao 2, a data de admissão do primeiro empregador e o grupo sucessaoVinc
//   com o CNPJ e a matrícula de origem e a data da transferência (services/esocial/admissao.ts).
// No Consultor, a ficha é copiada para a empresa de destino (mesmo CPF, nova matrícula, o local de trabalho dela),
// com os dependentes e o histórico de salário; os movimentos e as férias da origem vão junto, para as médias e os
// períodos aquisitivos. A ficha de origem fica desligada com o motivo 11 na véspera. No mês da transferência, cada
// empresa paga os seus dias: a origem até a véspera, o destino desde a data (dados.inicioNaEmpresa da ficha nova).
// O 13º do ano é todo do destino (a origem não paga 13º a quem saiu pela transferência).
// Entre estabelecimentos da mesma empresa (mesma raiz do CNPJ) não há S-2299: é alteração contratual (S-2206).

import { cnpjValido, dataValida, normalizarCnpj } from '../cadastros/documentos';
import { idFuncionario, type FichaFuncionario } from '../cadastros/funcionarios';
import { idAfastamento, type Afastamento } from '../cadastros/afastamentos';
import { somarDias } from '../prazos/calendario';
import { idEvento, VER_PROC, type TpAmb } from '../esocial/transmissao';

const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const br = (d: string) => d.split('-').reverse().join('/');
export const MOTIVO_TRANSFERENCIA = '11';

export interface EmpresaTransf { id: string; cnpj: string; nome: string }

export interface Transferencia {
    ficha: FichaFuncionario;
    origem: EmpresaTransf;
    destino: EmpresaTransf;
    /** Primeiro dia na empresa de destino (dtTransf do S-2200). */
    data: string;
    /** Matrícula na empresa de destino. */
    matricula: string;
    /** CNPJ do estabelecimento de destino (local de trabalho). */
    estabelecimento: string;
}

/** Último dia na origem (dtDeslig do S-2299): a véspera da transferência. */
export const ultimoDiaNaOrigem = (data: string) => somarDias(data, -1);
export const refTransferenciaSaida = (fichaId: string, data: string) => `transf-saida:${fichaId}:${data}`;
export const refTransferenciaEntrada = (fichaId: string, data: string) => `transf-entrada:${fichaId}:${data}`;

export function validarTransferencia(t: Transferencia, fichasDestino: FichaFuncionario[] = []): string[] {
    const e: string[] = [];
    const f = t.ficha;
    if (f.situacao !== 'ativo' || f.dados.dataDesligamento) e.push('Só se transfere quem está ativo (sem data de desligamento).');
    if (t.origem.id === t.destino.id) e.push('Escolha outra empresa de destino.');
    else if (normalizarCnpj(t.origem.cnpj).slice(0, 8) === normalizarCnpj(t.destino.cnpj).slice(0, 8)) e.push('Mesma raiz de CNPJ: é troca de estabelecimento da mesma empresa (alteração contratual, S-2206), não transferência entre empresas.');
    if (!dataValida(t.data)) e.push('Informe a data da transferência (primeiro dia na empresa de destino).');
    else if (f.dados.admissao && t.data <= f.dados.admissao) e.push('A transferência tem de ser depois da admissão.');
    const m = t.matricula.trim();
    if (!m || m.length > 30 || /^esocial/i.test(m)) e.push('Matrícula no destino com até 30 caracteres, sem começar por "eSocial".');
    if (normalizarCnpj(t.estabelecimento).length !== 14 || !cnpjValido(normalizarCnpj(t.estabelecimento))) e.push('CNPJ do estabelecimento de destino (local de trabalho).');
    else if (normalizarCnpj(t.estabelecimento).slice(0, 8) !== normalizarCnpj(t.destino.cnpj).slice(0, 8)) e.push('O estabelecimento de destino tem de ser da empresa de destino (mesma raiz do CNPJ).');
    const cpf = digitos(f.cpf);
    const ja = fichasDestino.find(x => digitos(x.cpf) === cpf && x.situacao === 'ativo' && !x.dados.dataDesligamento);
    if (ja) e.push(`O CPF já tem ficha ativa na empresa de destino (matrícula ${ja.matriculaEsocial}).`);
    if (fichasDestino.some(x => x.id === idFuncionario(t.destino.id, cpf, m))) e.push('Já existe ficha com esta matrícula na empresa de destino.');
    return e;
}

/** A ficha na empresa de destino: mesmos dados e histórico, nova matrícula e o local de trabalho do destino. */
export function fichaNoDestino(t: Transferencia): FichaFuncionario {
    const f = t.ficha;
    const cpf = digitos(f.cpf);
    const origem = `Transferência de ${t.origem.nome} (matrícula ${f.matriculaEsocial}) em ${br(t.data)}`;
    // O que é da empresa (horário, lotação, departamento, código do IOB) não vai: o destino tem os seus.
    const { codigoIob: _c, horario: _h, lotacao: _l, departamento: _d, departamentoIob: _di, cargoIob: _ci, sindicatoIob: _si, dataDesligamento: _dd, motivoDesligamento: _md, dataProjetadaAviso: _dp, ...dados } = f.dados;
    return {
        id: idFuncionario(t.destino.id, cpf, t.matricula.trim()), empresaId: t.destino.id, cnpj: t.destino.cnpj, cpf, matriculaEsocial: t.matricula.trim(), situacao: 'ativo',
        dados: { ...dados, estabelecimento: normalizarCnpj(t.estabelecimento), inicioNaEmpresa: t.data },
        dependentes: f.dependentes.map(d => ({ ...d })),
        origens: { ...Object.fromEntries(Object.keys(dados).map(k => [k, origem])), estabelecimento: origem, dependentes: origem, situacao: origem },
        pendenciasImportacao: [],
        ...(f.historicoSalario ? { historicoSalario: f.historicoSalario.map(h => ({ ...h })) } : {}),
    };
}

/** A ficha de origem desligada pela transferência (motivo 11, véspera da data). */
export function fichaNaOrigem(t: Transferencia): FichaFuncionario {
    const f = t.ficha;
    const quando = ultimoDiaNaOrigem(t.data);
    const origem = `Transferência para ${t.destino.nome} em ${br(t.data)}`;
    return {
        ...f, situacao: 'desligado',
        dados: { ...f.dados, dataDesligamento: quando, motivoDesligamento: MOTIVO_TRANSFERENCIA },
        origens: { ...f.origens, dataDesligamento: origem, motivoDesligamento: origem, situacao: origem },
    };
}

/**
 * Afastamentos que acompanham o contrato: os gozos de férias (motivo 15, com o período aquisitivo) e os afastamentos
 * terminados antes da transferência, como histórico (sem os recibos, que são do empregador de origem). Um afastamento
 * em curso na data não vai: a transferência de quem está afastado pede análise (aviso).
 */
export function afastamentosParaODestino(t: Transferencia, afs: Afastamento[]): { copiar: Afastamento[]; avisos: string[] } {
    const novo = fichaNoDestino(t);
    const avisos: string[] = [];
    const copiar: Afastamento[] = [];
    for (const a of afs.filter(x => x.fichaId === t.ficha.id)) {
        const emCurso = a.dtInicio < t.data && (!a.dtFim || a.dtFim >= t.data);
        if (a.dtInicio >= t.data || emCurso) { avisos.push(`Afastamento de ${br(a.dtInicio)} (motivo ${a.motivo}) ${emCurso ? 'em curso na data da transferência' : 'depois da transferência'}: não copiado; lance na empresa de destino se for o caso.`); continue; }
        copiar.push({ ...a, id: idAfastamento(novo.id, a.dtInicio), empresaId: novo.empresaId, fichaId: novo.id, matriculaEsocial: novo.matriculaEsocial, recibos: [],
            origem: `Transferência de ${t.origem.nome} (${a.origem || 'Consultor'})` });
    }
    return { copiar, avisos };
}

export interface EntradaS2299Transf { cnpj: string; tpAmb: TpAmb; t: Transferencia; agora?: Date }

/** S-2299 da transferência na empresa de origem: motivo 11, sucessaoVinc e sem verbas rescisórias. */
export function gerarS2299Transferencia(x: EntradaS2299Transf): { evento: { id: string; xml: string } | null; erros: string[] } {
    const { t } = x;
    const erros = validarTransferencia({ ...t, ficha: { ...t.ficha, situacao: 'ativo', dados: { ...t.ficha.dados, dataDesligamento: '' } } });
    if (!t.ficha.matriculaEsocial.trim()) erros.push('Ficha de origem sem matrícula do eSocial.');
    if (erros.length) return { evento: null, erros };
    const id = idEvento(x.cnpj, x.agora ?? new Date(), 4);
    return { erros: [], evento: { id, xml: `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtDeslig/v_S_01_03_00"><evtDeslig Id="${id}">`
        + `<ideEvento><indRetif>1</indRetif><tpAmb>${x.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${normalizarCnpj(x.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<ideVinculo><cpfTrab>${digitos(t.ficha.cpf)}</cpfTrab><matricula>${esc(t.ficha.matriculaEsocial.trim())}</matricula></ideVinculo>`
        + `<infoDeslig><mtvDeslig>${MOTIVO_TRANSFERENCIA}</mtvDeslig><dtDeslig>${ultimoDiaNaOrigem(t.data)}</dtDeslig><indPagtoAPI>N</indPagtoAPI><pensAlim>0</pensAlim>`
        + `<sucessaoVinc><tpInsc>1</tpInsc><nrInsc>${normalizarCnpj(t.destino.cnpj)}</nrInsc></sucessaoVinc></infoDeslig>`
        + '</evtDeslig></eSocial>' } };
}
