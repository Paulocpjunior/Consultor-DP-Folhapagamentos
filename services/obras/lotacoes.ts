// services/obras/lotacoes.ts
//
// Obras de construção civil e lotações tributárias da empresa (eSocial S-1005 e S-1020), para a folha por obra.
// Paulo (11/10/2026): "folhas de pagamentos de OBRAS ... máxima atenção ... legislação vigente"; os clientes têm os três
// casos e um funcionário pode trabalhar em mais de uma obra no mês (rateio por dias).
//
// Os três casos (Tabela 10 do eSocial; IN RFB 2.021/2021 para o CNO):
//   01 — obra própria ou empreitada total: a construtora inscreve a obra no CNO em nome dela. A obra é um
//        estabelecimento (S-1005 com tpInsc 4 = CNO, o CNAE da obra, o CNPJ responsável e, para a construtora, se a
//        contribuição patronal da obra é substituída pela CPRB). A lotação é 01 (sem inscrição no S-1020), e o S-1200
//        informa o estabelecimento pelo CNO;
//   02 — empreitada parcial ou subempreitada: a obra é de outro. A lotação leva o CNO da obra, o contratante e, quando
//        o proprietário não está no CNO, o proprietário (infoEmprParcial). O S-1200 informa o estabelecimento da empresa;
//   04 — cessão de mão de obra a pessoa jurídica (Lei 8.212/1991, art. 31): a lotação leva o CNPJ do tomador. A
//        retenção de 11% (3,5% na CPRB) é da nota fiscal (R-2010/R-2020, com o Fiscal).
// FPAS e terceiros vão em cada lotação (construção civil: FPAS 507). RAT e FAP: os da empresa ou, na obra própria, os
// do estabelecimento (S-1005), quando diferentes.
// Cada lotação tem um código da empresa (até 30 caracteres, sem começar com "eSocial").

import { cnpjValido, cpfValido } from '../cadastros/documentos';
import { idEvento, VER_PROC, type TpAmb } from '../esocial/transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';

export type TipoLotacao = '01' | '02' | '04';
export const TIPOS_LOTACAO: Record<TipoLotacao, string> = {
    '01': 'Obra própria ou empreitada total (CNO da empresa) — ou o próprio estabelecimento',
    '02': 'Empreitada parcial ou subempreitada (obra de outro)',
    '04': 'Cessão de mão de obra a tomador pessoa jurídica',
};

export interface Inscricao { tpInsc: '1' | '2'; nrInsc: string }

export interface Lotacao {
    empresaId: string;
    /** Código da lotação no eSocial (codLotacao). */
    codigo: string;
    descricao: string;
    tipo: TipoLotacao;
    /** Obra própria (01) ou da empreitada parcial (02): o número no CNO (12 dígitos). Vazio no 01 = o estabelecimento da empresa. */
    cno: string;
    /** Obra própria (S-1005): CNAE preponderante da obra, 7 dígitos. */
    cnaePrep: string;
    /** Obra própria: alíquota RAT (1, 2 ou 3) e FAP só quando diferentes dos da empresa (com processo, no S-1005). */
    aliqRat: '' | '1' | '2' | '3';
    fap: string;
    /** Obra própria de construtora: contribuição patronal substituída pela CPRB (S-1005, infoObra/indSubstPatrObra = 1). */
    substituida: boolean;
    /** A empresa é construtora no S-1000 (indConstr = 1): o S-1005 da obra leva a informação da substituição. */
    construtora: boolean;
    /** Empreitada parcial (02): contratante e, se não estiver no CNO, o proprietário. */
    contratante: Inscricao;
    proprietario: Inscricao | null;
    /** Cessão de mão de obra (04): CNPJ do tomador. */
    tomador: string;
    fpas: string;
    codTercs: string;
    /** Validade (AAAA-MM). */
    iniValid: string;
    fimValid: string;
    /** Recibos dos eventos aceitos (S-1005 e S-1020): com eles, o envio seguinte é alteração. */
    recibo1005?: string;
    recibo1020?: string;
    atualizadoPor?: string;
}

export const lotacaoVazia = (empresaId: string): Lotacao => ({
    empresaId, codigo: '', descricao: '', tipo: '01', cno: '', cnaePrep: '', aliqRat: '', fap: '', substituida: false, construtora: true,
    contratante: { tpInsc: '1', nrInsc: '' }, proprietario: null, tomador: '', fpas: '507', codTercs: '0079', iniValid: '', fimValid: '',
});

const digitos = (t: string) => (t ?? '').replace(/\D/g, '');
const mes = /^\d{4}-(0[1-9]|1[0-2])$/;
export const idLotacao = (empresaId: string, codigo: string) => `${empresaId}_${codigo.trim()}`;
/** Obra própria com CNO: a obra é o estabelecimento (S-1005, tpInsc 4). */
export const ehObraPropria = (l: Pick<Lotacao, 'tipo' | 'cno'>) => l.tipo === '01' && digitos(l.cno).length === 12;
/** Estabelecimento do S-1200 para a lotação: o CNO da obra própria ou o CNPJ do estabelecimento da empresa. */
export function estabelecimentoDa(l: Pick<Lotacao, 'tipo' | 'cno'>, cnpjEstab: string): { tpInsc: '1' | '4'; nrInsc: string } {
    return ehObraPropria(l) ? { tpInsc: '4', nrInsc: digitos(l.cno) } : { tpInsc: '1', nrInsc: digitos(cnpjEstab) };
}

const inscricaoValida = (i: Inscricao) => (i.tpInsc === '1' ? cnpjValido(digitos(i.nrInsc)) : cpfValido(digitos(i.nrInsc)));

export interface Validacao { erros: string[]; avisos: string[] }

/** `cnpjEmpresa`: o CNPJ da empresa (o responsável pela obra própria; o tomador não pode ser ela). */
export function validarLotacao(l: Lotacao, cnpjEmpresa: string, outras: Lotacao[] = []): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    const cod = l.codigo.trim();
    if (!/^[A-Za-z0-9._-]{1,30}$/.test(cod)) erros.push('Código da lotação: de 1 a 30 caracteres (letras, números, ponto, hífen ou sublinhado).');
    else if (cod.toLowerCase().startsWith('esocial')) erros.push('O código da lotação não pode começar com "eSocial".');
    if (outras.some(o => o.codigo.trim() === cod && o !== l)) erros.push(`Já existe a lotação ${cod}.`);
    if (!l.descricao.trim()) erros.push('Descreva a lotação (nome da obra, do tomador ou do setor).');
    if (!TIPOS_LOTACAO[l.tipo]) erros.push('Tipo de lotação: 01, 02 ou 04.');
    if (!/^\d{3}$/.test(l.fpas)) erros.push('FPAS: 3 dígitos (construção civil: 507).');
    if (!/^\d{4}$/.test(l.codTercs)) erros.push('Código de terceiros: 4 dígitos (FPAS 507: 0079, sem convênio).');
    else if (l.fpas === '507' && !['0079', '0075', '0071', '0077', '0073', '0083', '0091'].includes(l.codTercs)) avisos.push(`Terceiros ${l.codTercs} com FPAS 507: confira na Tabela 04 (o código cheio é 0079).`);
    if (!mes.test(l.iniValid)) erros.push('Início da validade (AAAA-MM).');
    if (l.fimValid && (!mes.test(l.fimValid) || l.fimValid < l.iniValid)) erros.push('Fim da validade inválido ou antes do início.');
    const cno = digitos(l.cno);
    if (l.tipo === '01') {
        if (cno && cno.length !== 12) erros.push('CNO da obra: 12 dígitos.');
        if (cno) {
            if (!/^\d{7}$/.test(l.cnaePrep)) erros.push('CNAE preponderante da obra: 7 dígitos (S-1005).');
            else if (!/^4[123]/.test(l.cnaePrep)) avisos.push(`CNAE ${l.cnaePrep} não é da seção de construção (41, 42 ou 43): confira.`);
            if (l.fap && !(Number(l.fap.replace(',', '.')) >= 0.5 && Number(l.fap.replace(',', '.')) <= 2)) erros.push('FAP da obra entre 0,5000 e 2,0000.');
            if (l.aliqRat || l.fap) avisos.push('RAT ou FAP da obra diferente do da empresa: o S-1005 exige o processo (S-1070) que permite a alíquota diferente. Sem processo, deixe em branco.');
        } else if (l.substituida) avisos.push('Sem CNO, a lotação 01 é o próprio estabelecimento da empresa: a substituição patronal da obra (S-1005) só vale para obra com CNO.');
    }
    if (l.tipo === '02') {
        if (cno.length !== 12) erros.push('CNO da obra da empreitada parcial: 12 dígitos (Tabela 10).');
        if (!inscricaoValida(l.contratante)) erros.push('Contratante da empreitada: CNPJ ou CPF válido.');
        else if (l.contratante.tpInsc === '1' && digitos(l.contratante.nrInsc).slice(0, 8) === digitos(cnpjEmpresa).slice(0, 8)) erros.push('O contratante da empreitada parcial não pode ser a própria empresa.');
        if (l.proprietario && !inscricaoValida(l.proprietario)) erros.push('Proprietário da obra: CNPJ ou CPF válido (só quando ele não estiver no CNO).');
    }
    if (l.tipo === '04') {
        if (!cnpjValido(digitos(l.tomador))) erros.push('CNPJ do tomador da cessão de mão de obra inválido.');
        else if (digitos(l.tomador).slice(0, 8) === digitos(cnpjEmpresa).slice(0, 8)) erros.push('O tomador da cessão não pode ser a própria empresa.');
        avisos.push('Cessão de mão de obra: a nota fiscal tem retenção de 11% do INSS (3,5% se a empresa estiver na CPRB), declarada pelo Fiscal na EFD-Reinf (R-2020).');
    }
    return { erros, avisos };
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ideEvento = (tpAmb: TpAmb) => `<ideEvento><tpAmb>${tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`;
const ideEmpregador = (cnpj: string) => `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${digitos(cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`;
const validade = (l: Lotacao) => `<iniValid>${l.iniValid}</iniValid>${l.fimValid ? `<fimValid>${l.fimValid}</fimValid>` : ''}`;

/** S-1020 da lotação: inclusão ou, com recibo do aceito, alteração (sem assinatura; o CFI assina). */
export function gerarS1020(p: { cnpj: string; tpAmb: TpAmb; lotacao: Lotacao; agora?: Date; seq?: number }): { id: string; xml: string } {
    const l = p.lotacao;
    const id = idEvento(p.cnpj, p.agora, p.seq);
    const acao = l.recibo1020 ? 'alteracao' : 'inclusao';
    const insc = l.tipo === '02' ? `<tpInsc>4</tpInsc><nrInsc>${digitos(l.cno)}</nrInsc>`
        : l.tipo === '04' ? `<tpInsc>1</tpInsc><nrInsc>${digitos(l.tomador)}</nrInsc>` : '';
    const parcial = l.tipo === '02'
        ? `<infoEmprParcial><tpInscContrat>${l.contratante.tpInsc}</tpInscContrat><nrInscContrat>${digitos(l.contratante.nrInsc)}</nrInscContrat>`
            + (l.proprietario ? `<tpInscProp>${l.proprietario.tpInsc}</tpInscProp><nrInscProp>${digitos(l.proprietario.nrInsc)}</nrInscProp>` : '')
            + '</infoEmprParcial>'
        : '';
    const xml = `<eSocial xmlns="${NS}/evtTabLotacao/${VERSAO}"><evtTabLotacao Id="${id}">${ideEvento(p.tpAmb)}${ideEmpregador(p.cnpj)}`
        + `<infoLotacao><${acao}><ideLotacao><codLotacao>${esc(l.codigo.trim())}</codLotacao>${validade(l)}</ideLotacao>`
        + `<dadosLotacao><tpLotacao>${l.tipo}</tpLotacao>${insc}<fpasLotacao><fpas>${l.fpas}</fpas><codTercs>${l.codTercs}</codTercs></fpasLotacao>${parcial}</dadosLotacao>`
        + `</${acao}></infoLotacao></evtTabLotacao></eSocial>`;
    return { id, xml };
}

/** S-1005 da obra própria (CNO): inclusão ou alteração. A construtora informa se a patronal da obra é substituída (CPRB). */
export function gerarS1005(p: { cnpj: string; tpAmb: TpAmb; lotacao: Lotacao; agora?: Date; seq?: number }): { id: string; xml: string } {
    const l = p.lotacao;
    if (!ehObraPropria(l)) throw new Error('S-1005: só a obra própria com CNO é estabelecimento.');
    const id = idEvento(p.cnpj, p.agora, p.seq);
    const acao = l.recibo1005 ? 'alteracao' : 'inclusao';
    const fap = l.fap ? Number(l.fap.replace(',', '.')).toFixed(4) : '';
    const gilrat = l.aliqRat || fap ? `<aliqGilrat>${l.aliqRat ? `<aliqRat>${l.aliqRat}</aliqRat>` : ''}${fap ? `<fap>${fap}</fap>` : ''}</aliqGilrat>` : '';
    const xml = `<eSocial xmlns="${NS}/evtTabEstab/${VERSAO}"><evtTabEstab Id="${id}">${ideEvento(p.tpAmb)}${ideEmpregador(p.cnpj)}`
        + `<infoEstab><${acao}><ideEstab><tpInsc>4</tpInsc><nrInsc>${digitos(l.cno)}</nrInsc>${validade(l)}</ideEstab>`
        + `<dadosEstab><cnaePrep>${l.cnaePrep}</cnaePrep><cnpjResp>${digitos(p.cnpj)}</cnpjResp>${gilrat}`
        + (l.construtora ? `<infoObra><indSubstPatrObra>${l.substituida ? 1 : 2}</indSubstPatrObra></infoObra>` : '')
        + `</dadosEstab></${acao}></infoEstab></evtTabEstab></eSocial>`;
    return { id, xml };
}
