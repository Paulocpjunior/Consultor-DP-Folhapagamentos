// services/esocial/admissao.ts
//
// S-2200 (cadastramento inicial do vínculo e admissão do empregado) gerado pelo Consultor a partir da ficha, pelo
// leiaute S-1.3. Hoje é usado na transferência de empregado entre empresas do mesmo grupo (tpAdmissao 2, com o grupo
// sucessaoVinc; services/transferencia/transferencia.ts):
// - trabalhador: nome, sexo, raça/cor, estado civil, instrução, nascimento, endereço, dependentes e contato da ficha;
// - vínculo celetista: matrícula, regime trabalhista e previdenciário, data de admissão (na transferência, a do
//   primeiro empregador), tipo e indicativo de admissão, regime de jornada, natureza da atividade, data-base e CNPJ do
//   sindicato; contrato: cargo, CBO, categoria, salário, duração, local de trabalho e horário contratual;
// - sucessão: CNPJ e matrícula no empregador anterior e a data da transferência.
// Sem o grupo FGTS (vedado para admissão desde 05/10/1988, exceto doméstico antes de 10/2015), sem aprendiz, sem
// trabalhador temporário e sem estatutário: esses ficam com o IOB.

import { descricaoJornada, resumirHorario, tpJornadaDoHorario, type Horario } from '../cadastros/horarios';
import { cnpjValido, cpfValido, dataValida } from '../cadastros/documentos';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

/** Dados do contrato que a ficha não guarda (o S-2200 pede). */
export interface ContratoS2200 {
    /** 1 submetido a horário; 2 atividade externa (art. 62, I); 3 cargo de gestão (art. 62, II); 4 teletrabalho (art. 62, III). */
    tpRegJor: '1' | '2' | '3' | '4';
    /** 1 urbano, 2 rural. */
    natAtividade: '1' | '2';
    /** Mês da data-base da categoria (01 a 12), opcional. */
    dtBase: string;
    /** Tipo de jornada (2 12x36, 3 a 7, 9 demais). */
    tpJornada: string;
    /** 0 não é tempo parcial; 1 até 25 h; 2 até 30 h; 3 até 26 h semanais. */
    tmpParc: '0' | '1' | '2' | '3';
    horNoturno: 'S' | 'N';
    /** Descrição da jornada semanal (dias, entrada, saída e intervalos). */
    dscJorn: string;
}
/** Contrato do S-2200 com o que a ficha tem; com o horário ligado a ela, a jornada (tipo, descrição e trabalho noturno) sai dele. */
export const contratoPadrao = (f?: FichaFuncionario, horario?: Horario | null): ContratoS2200 => ({
    tpRegJor: '1', natAtividade: '1', dtBase: '',
    tpJornada: horario ? tpJornadaDoHorario(horario) : '9', tmpParc: '0', horNoturno: horario && resumirHorario(horario).noturno > 0 ? 'S' : 'N',
    dscJorn: horario ? descricaoJornada(horario) : [f?.dados.jornada, f?.dados.horarioTrabalho, f?.dados.horarioIntervalo ? `intervalo ${f.dados.horarioIntervalo}` : ''].filter(Boolean).join('; '),
});
export const TIPOS_JORNADA: [string, string][] = [
    ['2', '12 x 36'], ['3', 'Horário fixo, folga variável'], ['4', 'Horário fixo, folga fixa no domingo'], ['5', 'Horário fixo, folga fixa fora do domingo'],
    ['6', 'Horário fixo, folga fixa em outro dia com folga periódica no domingo'], ['7', 'Turno ininterrupto de revezamento'], ['9', 'Demais tipos de jornada'],
];

export interface SucessaoS2200 { cnpjAnterior: string; matriculaAnterior: string; dtTransf: string }

export interface EntradaS2200 {
    cnpj: string; tpAmb: TpAmb;
    ficha: FichaFuncionario;
    contrato: ContratoS2200;
    /** Transferência do mesmo grupo (tpAdmissao 2). */
    sucessao?: SucessaoS2200;
    /** Admissão antes da obrigatoriedade dos eventos não periódicos da empresa. */
    cadIni?: boolean;
    agora?: Date;
}

export interface ResultadoS2200 { evento: { id: string; xml: string } | null; erros: string[]; avisos: string[] }

/** O que falta na ficha (e no contrato) para o S-2200. */
export function validarS2200(e: EntradaS2200): string[] {
    const f = e.ficha;
    const d = f.dados;
    const er: string[] = [];
    if (!cpfValido(digitos(f.cpf))) er.push('CPF inválido.');
    if (!(d.nome ?? '').trim()) er.push('Nome.');
    if (d.sexo !== 'M' && d.sexo !== 'F') er.push('Sexo.');
    if (!/^[1-6]$/.test(d.raca ?? '')) er.push('Raça/cor.');
    if (!/^(0[1-9]|1[0-2])$/.test(d.escolaridade ?? '')) er.push('Escolaridade (grau de instrução).');
    if (!dataValida(d.nascimento ?? '')) er.push('Data de nascimento.');
    if (!(d.logradouro ?? '').trim()) er.push('Endereço: logradouro.');
    if (!(d.numero ?? '').trim() || (d.numero ?? '').trim().length > 10) er.push('Endereço: número (até 10 caracteres; S/N se não houver).');
    if (digitos(d.cep).length !== 8) er.push('Endereço: CEP.');
    if (digitos(d.municipio).length !== 7) er.push('Endereço: município (código IBGE de 7 dígitos).');
    if (!UFS.includes((d.uf ?? '').toUpperCase())) er.push('Endereço: UF.');
    er.push(...validarContrato(f, e.contrato));
    if ((d.raca === '6') && (d.admissao ?? '') >= '2024-04-22') er.push('Raça/cor "não informado" não é aceita para admissão desde 22/04/2024.');
    f.dependentes.forEach((x, i) => {
        if (!(x.nome ?? '').trim()) er.push(`Dependente ${i + 1}: nome.`);
        if (!dataValida(x.nascimento ?? '')) er.push(`Dependente ${i + 1}: nascimento.`);
        if (!/^\d{2}$/.test(x.tipo ?? '')) er.push(`Dependente ${i + 1}: tipo (Tabela 07).`);
        if (x.cpf && !cpfValido(digitos(x.cpf))) er.push(`Dependente ${i + 1}: CPF.`);
    });
    const s = e.sucessao;
    if (s) {
        if (!cnpjValido(digitos(s.cnpjAnterior))) er.push('Sucessão: CNPJ do empregador anterior.');
        if (!s.matriculaAnterior.trim()) er.push('Sucessão: matrícula no empregador anterior.');
        if (!dataValida(s.dtTransf)) er.push('Sucessão: data da transferência.');
        else if (dataValida(d.admissao ?? '') && s.dtTransf <= d.admissao!) er.push('A transferência tem de ser depois da admissão.');
    }
    return er;
}

/** O contrato (vínculo celetista, cargo, salário, duração, local e horário): comum ao S-2200 e ao S-2206. */
export function validarContrato(f: FichaFuncionario, c: ContratoS2200, estabelecimento = f.dados.estabelecimento): string[] {
    const d = f.dados;
    const er: string[] = [];
    const m = f.matriculaEsocial.trim();
    if (!m || m.length > 30 || /^esocial/i.test(m)) er.push('Matrícula do eSocial (até 30 caracteres, sem começar por "eSocial").');
    if (!dataValida(d.admissao ?? '')) er.push('Data de admissão.');
    if (!/^\d{3}$/.test(d.categoria ?? '') || !/^1\d\d$/.test(d.categoria ?? '')) er.push('Categoria de empregado (1XX).');
    else if (['104', '105', '106', '107', '108', '111'].includes(d.categoria!)) er.push(`Categoria ${d.categoria}: o S-2200 dela (doméstico, aprendiz, temporário, contrato verde e amarelo ou intermitente) fica com o IOB.`);
    if ((d.regimeTrabalhista ?? '1') !== '1') er.push('Só empregado celetista (regime trabalhista 1).');
    if (!(d.cargo ?? '').trim()) er.push('Cargo.');
    if (!/^\d{6}$/.test(digitos(d.cbo))) er.push('CBO (6 dígitos).');
    if (!(Number(d.salario) >= 0) || d.salario === undefined || d.salario === '') er.push('Salário fixo.');
    if (!/^[1-7]$/.test(d.unidadeSalario ?? '5')) er.push('Unidade salarial.');
    const tpContr = d.tipoContrato || '1';
    if (tpContr === '3') er.push('Contrato por prazo vinculado a fato: o S-2200 fica com o IOB (pede o objeto determinante).');
    if (tpContr === '2' && !dataValida(d.fimContrato ?? '')) er.push('Contrato por prazo determinado: data do término.');
    if (!cnpjValido(digitos(d.sindicato))) er.push('CNPJ do sindicato da categoria.');
    if (digitos(estabelecimento).length !== 14 || !cnpjValido(digitos(estabelecimento))) er.push('Local de trabalho: CNPJ do estabelecimento (14 dígitos).');
    if (!(Number(d.horasSemanais) > 0)) er.push('Horas semanais.');
    if (!TIPOS_JORNADA.some(([k]) => k === c.tpJornada)) er.push('Tipo de jornada.');
    if (!c.dscJorn.trim()) er.push('Descrição da jornada (dias, entrada, saída e intervalos).');
    if (c.dtBase && !/^(0[1-9]|1[0-2])$/.test(c.dtBase)) er.push('Data-base: mês de 01 a 12.');
    return er;
}

/** infoCeletista sem os dados da admissão (regime de jornada, natureza, data-base e sindicato): o do S-2206. */
export const celetistaXml = (f: FichaFuncionario, c: ContratoS2200) =>
    `<tpRegJor>${c.tpRegJor}</tpRegJor><natAtividade>${c.natAtividade}</natAtividade>${c.dtBase ? `<dtBase>${Number(c.dtBase)}</dtBase>` : ''}<cnpjSindCategProf>${digitos(f.dados.sindicato)}</cnpjSindCategProf>`;

/** infoContrato (cargo, CBO, categoria, salário, duração, local de trabalho e horário), igual no S-2200 e no S-2206. */
export function contratoXml(f: FichaFuncionario, c: ContratoS2200, estabelecimento = f.dados.estabelecimento): string {
    const d = f.dados;
    const tpContr = d.tipoContrato || '1';
    return `<infoContrato><nmCargo>${esc(d.cargo!.trim().slice(0, 100))}</nmCargo><CBOCargo>${digitos(d.cbo)}</CBOCargo><codCateg>${d.categoria}</codCateg>`
        + `<remuneracao><vrSalFx>${valorDecimal(d.salario!)}</vrSalFx><undSalFixo>${d.unidadeSalario || '5'}</undSalFixo></remuneracao>`
        + `<duracao><tpContr>${tpContr}</tpContr>${tpContr === '2' ? `<dtTerm>${d.fimContrato}</dtTerm>` : ''}</duracao>`
        + `<localTrabalho><localTrabGeral><tpInsc>1</tpInsc><nrInsc>${digitos(estabelecimento)}</nrInsc></localTrabGeral></localTrabalho>`
        + `<horContratual><qtdHrsSem>${Number(d.horasSemanais)}</qtdHrsSem><tpJornada>${c.tpJornada}</tpJornada><tmpParc>${c.tmpParc}</tmpParc><horNoturno>${c.horNoturno}</horNoturno><dscJorn>${esc(c.dscJorn.trim().slice(0, 999))}</dscJorn></horContratual>`
        + '</infoContrato>';
}

const valorDecimal = (s: string) => Number(s).toFixed(2);

export function gerarS2200(e: EntradaS2200): ResultadoS2200 {
    const r: ResultadoS2200 = { evento: null, erros: validarS2200(e), avisos: [] };
    if (r.erros.length) return r;
    const f = e.ficha;
    const d = f.dados;
    const c = e.contrato;
    const opc = (tag: string, v?: string) => (v && v.trim() ? `<${tag}>${esc(v.trim())}</${tag}>` : '');
    const paisNascto = /^\d{3}$/.test(d.paisNascimento ?? '') ? d.paisNascimento! : '105';
    const paisNac = /^\d{3}$/.test(d.nacionalidade ?? '') ? d.nacionalidade! : '105';
    if (!/^\d{3}$/.test(d.paisNascimento ?? '') || !/^\d{3}$/.test(d.nacionalidade ?? '')) r.avisos.push('País de nascimento ou nacionalidade sem código na ficha: vai 105 (Brasil).');
    const dependentes = f.dependentes.map(x => `<dependente><tpDep>${x.tipo}</tpDep><nmDep>${esc(x.nome.trim().slice(0, 70))}</nmDep><dtNascto>${x.nascimento}</dtNascto>${digitos(x.cpf) ? `<cpfDep>${digitos(x.cpf)}</cpfDep>` : ''}`
        + `<depIRRF>${x.irrf === 'S' ? 'S' : 'N'}</depIRRF><depSF>${x.salarioFamilia === 'S' ? 'S' : 'N'}</depSF><incTrab>N</incTrab></dependente>`).join('');
    const fone = digitos(d.telefone);
    const contato = fone.length >= 8 || (d.email ?? '').includes('@') ? `<contato>${fone.length >= 8 ? `<fonePrinc>${fone.slice(0, 13)}</fonePrinc>` : ''}${(d.email ?? '').includes('@') ? `<emailPrinc>${esc(d.email!.trim().slice(0, 60))}</emailPrinc>` : ''}</contato>` : '';
    const s = e.sucessao;
    const sucessao = s ? `<sucessaoVinc><tpInsc>1</tpInsc><nrInsc>${digitos(s.cnpjAnterior)}</nrInsc><matricAnt>${esc(s.matriculaAnterior.trim())}</matricAnt><dtTransf>${s.dtTransf}</dtTransf></sucessaoVinc>` : '';
    const id = idEvento(e.cnpj, e.agora ?? new Date(), 3);
    r.evento = { id, xml: `<eSocial xmlns="${NS}/evtAdmissao/${VERSAO}"><evtAdmissao Id="${id}">`
        + `<ideEvento><indRetif>1</indRetif><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${digitos(e.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<trabalhador><cpfTrab>${digitos(f.cpf)}</cpfTrab><nmTrab>${esc(d.nome!.trim().slice(0, 70))}</nmTrab><sexo>${d.sexo}</sexo><racaCor>${d.raca}</racaCor>`
        + `${/^[1-5]$/.test(d.estadoCivil ?? '') ? `<estCiv>${d.estadoCivil}</estCiv>` : ''}<grauInstr>${d.escolaridade}</grauInstr>`
        + `<nascimento><dtNascto>${d.nascimento}</dtNascto><paisNascto>${paisNascto}</paisNascto><paisNac>${paisNac}</paisNac></nascimento>`
        + `<endereco><brasil><dscLograd>${esc(d.logradouro!.trim().slice(0, 100))}</dscLograd><nrLograd>${esc(d.numero!.trim())}</nrLograd>${opc('complemento', d.complemento?.slice(0, 30))}${opc('bairro', d.bairro?.slice(0, 90))}`
        + `<cep>${digitos(d.cep)}</cep><codMunic>${digitos(d.municipio)}</codMunic><uf>${d.uf!.toUpperCase()}</uf></brasil></endereco>${dependentes}${contato}</trabalhador>`
        + `<vinculo><matricula>${esc(f.matriculaEsocial.trim())}</matricula><tpRegTrab>1</tpRegTrab><tpRegPrev>${/^[1-3]$/.test(d.regimePrevidenciario ?? '') ? d.regimePrevidenciario : '1'}</tpRegPrev><cadIni>${e.cadIni ? 'S' : 'N'}</cadIni>`
        + `<infoRegimeTrab><infoCeletista><dtAdm>${d.admissao}</dtAdm><tpAdmissao>${s ? '2' : '1'}</tpAdmissao><indAdmissao>1</indAdmissao>${celetistaXml(f, c)}</infoCeletista></infoRegimeTrab>`
        + `${contratoXml(f, c)}${sucessao}</vinculo>`
        + '</evtAdmissao></eSocial>' };
    return r;
}
