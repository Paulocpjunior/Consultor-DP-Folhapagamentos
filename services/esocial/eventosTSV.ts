// services/esocial/eventosTSV.ts
//
// S-2300 (início de trabalhador sem vínculo, TSVE) e S-2399 (término) do sócio e do diretor, gerados pelo Consultor com
// o cadastro do pró-labore (services/contribuintes/contribuinteIndividual.ts), pelo leiaute S-1.3:
// - S-2300: trabalhador (sexo, raça/cor, instrução, nascimento, endereço e dependentes do IRRF) e infoTSVInicio com a
//   matrícula, a categoria, a data de início (posse do diretor; entrada do sócio), o cargo e o CBO. Diretor (721, 722):
//   remuneração obrigatória (pró-labore fixo; variável vai com 0 e a unidade 7). Diretor com FGTS (721): a data de
//   opção pelo FGTS. Sem natAtividade para 721 e 722. Local de trabalho (o estabelecimento) obrigatório para 721, 722 e
//   723 com início desde 22/01/2024; vedado para o autônomo (XSD do S-2300, condições dos grupos);
// - S-2399: data do término; motivo e pensão alimentícia (0) só para o diretor com FGTS (721). Sem verbasResc (grupo
//   opcional): o pró-labore do mês do término vai no S-1200 da competência.
// Retificação: com o recibo do evento aceito, indRetif 2.

import { cpfValido, dataValida, normalizarCnpj } from '../cadastros/documentos';
import { CATEGORIAS_CI, type ContribuinteIndividual } from '../contribuintes/contribuinteIndividual';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const valor = (c: number) => (c / 100).toFixed(2);
const br = (d: string) => d.split('-').reverse().join('/');

export const refInicioTSV = (contribuinteId: string) => `tsv:${contribuinteId}:inicio`;
export const refTerminoTSV = (contribuinteId: string) => `tsv:${contribuinteId}:termino`;

export const RACA_COR: [string, string][] = [['1', 'Branca'], ['2', 'Preta'], ['3', 'Parda'], ['4', 'Amarela'], ['5', 'Indígena'], ['6', 'Não informado']];
export const ESTADO_CIVIL: [string, string][] = [['1', 'Solteiro'], ['2', 'Casado'], ['3', 'Divorciado'], ['4', 'Separado'], ['5', 'Viúvo']];
export const GRAU_INSTRUCAO: [string, string][] = [
    ['01', 'Analfabeto'], ['02', 'Até o 5º ano incompleto'], ['03', '5º ano completo'], ['04', '6º ao 9º ano incompleto'], ['05', 'Fundamental completo'],
    ['06', 'Médio incompleto'], ['07', 'Médio completo'], ['08', 'Superior incompleto'], ['09', 'Superior completo'], ['10', 'Pós-graduação'],
    ['11', 'Mestrado'], ['12', 'Doutorado'],
];
/** Motivos do término do diretor com FGTS (S-2399, mtvDesligTSV), sem o 07 (mudança de CPF, que pede outro grupo). */
export const MOTIVOS_TERMINO_721: [string, string][] = [
    ['01', 'Exoneração sem justa causa (assembleia, sócios ou autoridade)'], ['02', 'Término do mandato sem recondução'], ['03', 'Exoneração a pedido'],
    ['04', 'Exoneração por culpa recíproca ou força maior'], ['05', 'Morte'], ['06', 'Falência, encerramento ou supressão de parte da empresa'], ['99', 'Outros'],
];
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
/** Desde esta data de início, local de trabalho obrigatório para 721, 722 e 723 (XSD do S-2300). */
export const INICIO_LOCAL_TRAB = '2024-01-22';
/** Desde esta data de início, a raça/cor "6 · não informado" não é aceita (XSD do S-2300). */
export const INICIO_SEM_RACA_6 = '2024-04-22';

export interface EventoTSV { evento: { id: string; xml: string } | null; erros: string[]; avisos: string[] }

export interface EntradaS2300 {
    cnpj: string; tpAmb: TpAmb;
    contribuinte: ContribuinteIndividual;
    /** CNPJ do estabelecimento onde trabalha (o dos parâmetros do eSocial da folha). */
    nrInscEstab: string;
    /** Recibo do S-2300 aceito, para retificar. */
    recibo?: string;
    agora?: Date;
}

/** O que falta no cadastro para o S-2300. */
export function validarS2300(c: ContribuinteIndividual, nrInscEstab = ''): string[] {
    const e: string[] = [];
    const t = c.tsv;
    const cat = c.categoria;
    if (!CATEGORIAS_CI[cat]) return ['Categoria não coberta.'];
    if (!cpfValido(digitos(c.cpf))) e.push('CPF inválido.');
    if (c.nome.trim().length < 3) e.push('Informe o nome.');
    if (!dataValida(c.nascimento)) e.push('Informe a data de nascimento.');
    if (t.sexo !== 'M' && t.sexo !== 'F') e.push('Informe o sexo.');
    if (!RACA_COR.some(([k]) => k === t.racaCor)) e.push('Informe a raça/cor.');
    else if (t.racaCor === '6' && t.dtInicio >= INICIO_SEM_RACA_6) e.push('Raça/cor "não informado" não é aceita para início desde 22/04/2024.');
    if (t.estCiv && !ESTADO_CIVIL.some(([k]) => k === t.estCiv)) e.push('Estado civil inválido.');
    if (!GRAU_INSTRUCAO.some(([k]) => k === t.grauInstr)) e.push('Informe o grau de instrução.');
    if (!/^\d{3}$/.test(t.paisNascto) || !/^\d{3}$/.test(t.paisNac)) e.push('País de nascimento e nacionalidade: código da Tabela 06 (105 = Brasil).');
    const en = t.endereco;
    if (!en.logradouro.trim()) e.push('Endereço: informe o logradouro.');
    if (!en.numero.trim() || en.numero.trim().length > 10) e.push('Endereço: número com até 10 caracteres (S/N se não houver).');
    if (!/^\d{8}$/.test(digitos(en.cep))) e.push('Endereço: CEP com 8 dígitos.');
    if (!/^\d{7}$/.test(digitos(en.codMunic))) e.push('Endereço: código IBGE do município (7 dígitos).');
    if (!UFS.includes(en.uf.toUpperCase())) e.push('Endereço: UF.');
    if (en.complemento.trim().length > 30) e.push('Endereço: complemento com até 30 caracteres.');
    if (en.bairro.trim().length > 90) e.push('Endereço: bairro com até 90 caracteres.');
    const m = c.matricula.trim();
    if (!m) e.push('Informe a matrícula (o S-1200 e o S-2399 usam a mesma).');
    else if (m.length > 30 || /^esocial/i.test(m)) e.push('Matrícula com até 30 caracteres, sem começar por "eSocial".');
    if (!dataValida(t.dtInicio)) e.push(cat === '723' ? 'Informe a data de entrada do sócio.' : 'Informe a data de início (posse do diretor).');
    if (!t.cargo.trim()) e.push('Informe o cargo.');
    if (!/^\d{6}$/.test(c.cbo)) e.push('CBO com 6 dígitos.');
    if (t.remuneracao < 0) e.push('Pró-labore fixo inválido.');
    if (CATEGORIAS_CI[cat].fgts && !dataValida(t.dtOpcFGTS)) e.push('Diretor com FGTS (721): informe a data de opção pelo FGTS.');
    else if (CATEGORIAS_CI[cat].fgts && dataValida(t.dtInicio) && t.dtOpcFGTS < t.dtInicio) e.push('Opção pelo FGTS antes do início.');
    if (localObrigatorio(cat, t.dtInicio) && normalizarCnpj(nrInscEstab).length !== 14) e.push('Informe o CNPJ do estabelecimento (14 dígitos) nos parâmetros do eSocial da folha: o S-2300 leva o local de trabalho.');
    c.dependentes.forEach((d, i) => {
        if (!cpfValido(digitos(d.cpf))) e.push(`Dependente ${i + 1}: CPF inválido.`);
        if (!d.nome.trim()) e.push(`Dependente ${i + 1}: informe o nome.`);
        if (!dataValida(d.nascimento)) e.push(`Dependente ${i + 1}: data de nascimento.`);
        if (!/^\d{2}$/.test(d.tipo) || d.tipo === '99') e.push(`Dependente ${i + 1}: tipo da Tabela 07 (01 a 12).`);
    });
    return e;
}

const localObrigatorio = (cat: string, dtInicio: string) => ['721', '722', '723'].includes(cat) && dtInicio >= INICIO_LOCAL_TRAB;
const localPermitido = (cat: string) => ['721', '722', '723'].includes(cat);

export function gerarS2300(x: EntradaS2300): EventoTSV {
    const c = x.contribuinte;
    const r: EventoTSV = { evento: null, erros: validarS2300(c, x.nrInscEstab), avisos: [] };
    if (r.erros.length) return r;
    const t = c.tsv;
    const cat = c.categoria;
    const def = CATEGORIAS_CI[cat];
    const diretor = cat === '721' || cat === '722';
    const en = t.endereco;
    const opc = (tag: string, v: string) => (v.trim() ? `<${tag}>${esc(v.trim())}</${tag}>` : '');
    const dependentes = c.dependentes.map(d => `<dependente><tpDep>${d.tipo}</tpDep><nmDep>${esc(d.nome.trim().slice(0, 70))}</nmDep><dtNascto>${d.nascimento}</dtNascto><cpfDep>${digitos(d.cpf)}</cpfDep><depIRRF>S</depIRRF><depSF>N</depSF><incTrab>N</incTrab></dependente>`).join('');
    // Remuneração: obrigatória para o diretor; para o sócio, só com pró-labore fixo informado.
    let remuneracao = '';
    if (t.remuneracao > 0) remuneracao = `<remuneracao><vrSalFx>${valor(t.remuneracao)}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>`;
    else if (diretor) {
        remuneracao = '<remuneracao><vrSalFx>0.00</vrSalFx><undSalFixo>7</undSalFixo><dscSalVar>Pró-labore variável, fixado mês a mês</dscSalVar></remuneracao>';
        r.avisos.push('Sem pró-labore fixo: o S-2300 vai com remuneração variável (unidade 7).');
    }
    const fgts = def.fgts ? `<FGTS><dtOpcFGTS>${t.dtOpcFGTS}</dtOpcFGTS></FGTS>` : '';
    const estab = normalizarCnpj(x.nrInscEstab);
    const local = localPermitido(cat) && estab.length === 14 ? `<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${estab}</nrInsc></localTrabGeral>` : '';
    if (t.cadastramentoInicial) r.avisos.push('Cadastramento inicial (cadIni S): só para quem começou antes da obrigatoriedade dos eventos não periódicos da empresa.');
    else if (t.dtInicio < '2018-01-01') r.avisos.push(`Início em ${br(t.dtInicio)}: se for antes da obrigatoriedade do eSocial na empresa, marque "cadastramento inicial".`);
    if (c.s2300 && !x.recibo) r.avisos.push('O cadastro diz que o S-2300 já foi enviado (pelo IOB?): um segundo S-2300 com a mesma matrícula é recusado. Para corrigir, retifique pelo recibo.');
    const id = idEvento(x.cnpj, x.agora ?? new Date(), 1);
    const retif = x.recibo ? `<indRetif>2</indRetif><nrRecibo>${x.recibo}</nrRecibo>` : '<indRetif>1</indRetif>';
    r.evento = { id, xml: `<eSocial xmlns="${NS}/evtTSVInicio/${VERSAO}"><evtTSVInicio Id="${id}">`
        + `<ideEvento>${retif}<tpAmb>${x.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${normalizarCnpj(x.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<trabalhador><cpfTrab>${digitos(c.cpf)}</cpfTrab><nmTrab>${esc(c.nome.trim().slice(0, 70))}</nmTrab><sexo>${t.sexo}</sexo><racaCor>${t.racaCor}</racaCor>${t.estCiv ? `<estCiv>${t.estCiv}</estCiv>` : ''}<grauInstr>${t.grauInstr}</grauInstr>`
        + `<nascimento><dtNascto>${c.nascimento}</dtNascto><paisNascto>${t.paisNascto}</paisNascto><paisNac>${t.paisNac}</paisNac></nascimento>`
        + `<endereco><brasil><dscLograd>${esc(en.logradouro.trim().slice(0, 100))}</dscLograd><nrLograd>${esc(en.numero.trim())}</nrLograd>${opc('complemento', en.complemento)}${opc('bairro', en.bairro)}<cep>${digitos(en.cep)}</cep><codMunic>${digitos(en.codMunic)}</codMunic><uf>${en.uf.toUpperCase()}</uf></brasil></endereco>`
        + `${dependentes}</trabalhador>`
        + `<infoTSVInicio><cadIni>${t.cadastramentoInicial ? 'S' : 'N'}</cadIni><matricula>${esc(c.matricula.trim())}</matricula><codCateg>${cat}</codCateg><dtInicio>${t.dtInicio}</dtInicio>`
        + `<infoComplementares><cargoFuncao><nmCargo>${esc(t.cargo.trim().slice(0, 100))}</nmCargo><CBOCargo>${c.cbo}</CBOCargo></cargoFuncao>${remuneracao}${fgts}${local}</infoComplementares>`
        + '</infoTSVInicio></evtTSVInicio></eSocial>' };
    return r;
}

export interface EntradaS2399 {
    cnpj: string; tpAmb: TpAmb;
    contribuinte: ContribuinteIndividual;
    /** Data de hoje (AAAA-MM-DD): o término vai até 10 dias à frente. */
    hoje: string;
    recibo?: string;
    agora?: Date;
}

export function gerarS2399(x: EntradaS2399): EventoTSV {
    const c = x.contribuinte;
    const t = c.tsv;
    const cat = c.categoria;
    const r: EventoTSV = { evento: null, erros: [], avisos: [] };
    if (!CATEGORIAS_CI[cat]) r.erros.push('Categoria não coberta.');
    if (!cpfValido(digitos(c.cpf))) r.erros.push('CPF inválido.');
    if (!dataValida(t.dtTermino)) r.erros.push('Informe a data do término.');
    else {
        const limite = new Date(`${x.hoje}T12:00:00Z`); limite.setUTCDate(limite.getUTCDate() + 10);
        if (t.dtTermino > limite.toISOString().slice(0, 10)) r.erros.push('O término vai até 10 dias à frente de hoje (S-2399).');
        if (t.dtInicio && t.dtTermino < t.dtInicio) r.erros.push('Término antes do início.');
    }
    const diretorFgts = !!CATEGORIAS_CI[cat]?.fgts;
    if (diretorFgts && !MOTIVOS_TERMINO_721.some(([k]) => k === t.mtvDesligTSV)) r.erros.push('Diretor com FGTS (721): informe o motivo do término.');
    const m = c.matricula.trim();
    if (!m && CATEGORIAS_CI[cat]?.exigeS2300) r.avisos.push('Sem a matrícula no cadastro: o S-2399 vai pela categoria. Se o S-2300 teve matrícula, informe a mesma.');
    if (r.erros.length) return r;
    const ide = m ? `<matricula>${esc(m)}</matricula>` : `<codCateg>${cat}</codCateg>`;
    const motivo = diretorFgts ? `<mtvDesligTSV>${t.mtvDesligTSV}</mtvDesligTSV><pensAlim>0</pensAlim>` : '';
    if (diretorFgts) r.avisos.push('Diretor com FGTS: o pró-labore do mês do término vai no S-1200 da competência (sem verbas rescisórias no S-2399); sem pensão alimentícia sobre o FGTS (pensAlim 0).');
    const id = idEvento(x.cnpj, x.agora ?? new Date(), 2);
    const retif = x.recibo ? `<indRetif>2</indRetif><nrRecibo>${x.recibo}</nrRecibo>` : '<indRetif>1</indRetif>';
    r.evento = { id, xml: `<eSocial xmlns="${NS}/evtTSVTermino/${VERSAO}"><evtTSVTermino Id="${id}">`
        + `<ideEvento>${retif}<tpAmb>${x.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${normalizarCnpj(x.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<ideTrabSemVinculo><cpfTrab>${digitos(c.cpf)}</cpfTrab>${ide}</ideTrabSemVinculo>`
        + `<infoTSVTermino><dtTerm>${t.dtTermino}</dtTerm>${motivo}</infoTSVTermino>`
        + '</evtTSVTermino></eSocial>' };
    return r;
}
