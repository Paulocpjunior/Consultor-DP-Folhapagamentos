// services/esocial/alteracaoContratual.ts
//
// S-2206 (alteração de contrato de trabalho) gerado pelo Consultor, pelo leiaute S-1.3. Hoje para a troca de
// estabelecimento da mesma empresa (services/cadastros/locaisTrabalho.ts): o contrato vai inteiro, como manda o
// evento, com o novo local de trabalho (localTrabGeral) e a data da alteração. O contrato sai da ficha e dos dados que
// ela não guarda (services/esocial/admissao.ts: regime e tipo de jornada, natureza, data-base, descrição da jornada).

import { cpfValido, dataValida, normalizarCnpj } from '../cadastros/documentos';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { celetistaXml, contratoXml, validarContrato, type ContratoS2200 } from './admissao';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';

const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const refTrocaEstabelecimento = (fichaId: string, data: string) => `troca-estab:${fichaId}:${data}`;

export interface EntradaS2206 {
    cnpj: string; tpAmb: TpAmb;
    ficha: FichaFuncionario;
    contrato: ContratoS2200;
    /** Data da alteração (a da troca). */
    dtAlteracao: string;
    /** Estabelecimento a partir da alteração. */
    estabelecimento: string;
    dscAlt?: string;
    /** Recibo do S-2206 aceito, para retificar. */
    recibo?: string;
    agora?: Date;
}

export function gerarS2206(e: EntradaS2206): { evento: { id: string; xml: string } | null; erros: string[] } {
    const f = e.ficha;
    const erros = [...validarContrato(f, e.contrato, e.estabelecimento)];
    if (!cpfValido(digitos(f.cpf))) erros.push('CPF inválido.');
    if (!dataValida(e.dtAlteracao)) erros.push('Data da alteração.');
    else if (f.dados.admissao && e.dtAlteracao <= f.dados.admissao) erros.push('A alteração tem de ser depois da admissão.');
    if (erros.length) return { evento: null, erros };
    const id = idEvento(e.cnpj, e.agora ?? new Date(), 5);
    const retif = e.recibo ? `<indRetif>2</indRetif><nrRecibo>${e.recibo}</nrRecibo>` : '<indRetif>1</indRetif>';
    const dsc = (e.dscAlt ?? '').trim();
    return { erros: [], evento: { id, xml: `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAltContratual/v_S_01_03_00"><evtAltContratual Id="${id}">`
        + `<ideEvento>${retif}<tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${normalizarCnpj(e.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<ideVinculo><cpfTrab>${digitos(f.cpf)}</cpfTrab><matricula>${esc(f.matriculaEsocial.trim())}</matricula></ideVinculo>`
        + `<altContratual><dtAlteracao>${e.dtAlteracao}</dtAlteracao>${dsc ? `<dscAlt>${esc(dsc.slice(0, 150))}</dscAlt>` : ''}`
        + `<vinculo><tpRegPrev>${/^[1-3]$/.test(f.dados.regimePrevidenciario ?? '') ? f.dados.regimePrevidenciario : '1'}</tpRegPrev>`
        + `<infoRegimeTrab><infoCeletista>${celetistaXml(f, e.contrato)}</infoCeletista></infoRegimeTrab>${contratoXml(f, e.contrato, e.estabelecimento)}</vinculo>`
        + '</altContratual></evtAltContratual></eSocial>' } };
}
