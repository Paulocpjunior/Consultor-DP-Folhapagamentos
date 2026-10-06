// services/cadastros/funcionarios.ts
//
// Cadastro de funcionários mantido no Consultor DP (Arquivos › Funcionários do
// IOB Office). A chave do vínculo é empresa + CPF + matrícula do eSocial; o
// código sequencial do IOB fica num campo próprio, porque o Office não deixa
// editá-lo e é ele que o TXT de ponto usa (decisões de 09/2026).
//
// A carga vem do XML do eSocial, pela mesma consolidação da implantação. Campo
// editado à mão fica marcado como "Manual" e não é sobrescrito por uma nova
// importação: a divergência aparece para alguém decidir.

import { CAMPOS, type Cadastro, type Campo } from '../implantacao/implantacao';
import { lerDependentes, type Dependente } from '../implantacao/unificacao';
import { UFS, cnpjValido, cpfValido, dataValida, centavosDeTexto, pisValido } from './documentos';

export type { Dependente };
export type CampoExtra = 'codigoIob' | 'horario' | 'banco' | 'agencia' | 'conta' | 'tipoConta' | 'pix' | 'observacoes' | 'dataDesligamento' | 'motivoDesligamento' | 'dataProjetadaAviso';
export type CampoFicha = Exclude<Campo, 'dependentes' | 'matriculaIob'> | CampoExtra;
export type Situacao = 'ativo' | 'desligado';
export type ChaveOrigem = CampoFicha | 'dependentes' | 'situacao';

export interface FichaFuncionario {
    id: string;
    empresaId: string;
    cnpj: string;
    cpf: string;
    matriculaEsocial: string;
    situacao: Situacao;
    dados: Partial<Record<CampoFicha, string>>;
    dependentes: Dependente[];
    origens: Partial<Record<ChaveOrigem, string>>;
    pendenciasImportacao: string[];
}

export const ROTULO: Record<CampoFicha, string> = {
    ...(Object.fromEntries(Object.entries(CAMPOS).filter(([k]) => k !== 'dependentes' && k !== 'matriculaIob')) as Record<Exclude<Campo, 'dependentes' | 'matriculaIob'>, string>),
    salario: 'Salário fixo',
    codigoIob: 'Código no IOB (sequencial)',
    horario: 'Horário (tabela de horários)',
    banco: 'Banco (código)', agencia: 'Agência', conta: 'Conta', tipoConta: 'Tipo de conta', pix: 'Chave PIX',
    observacoes: 'Observações', dataDesligamento: 'Data de desligamento',
    motivoDesligamento: 'Motivo do desligamento (eSocial)', dataProjetadaAviso: 'Fim projetado pelo aviso indenizado',
};

/** Motivos de desligamento (Tabela 19 do eSocial) mais usados; outro código fica como está. */
export const MOTIVOS_DESLIGAMENTO: [string, string][] = [
    ['01', 'Com justa causa, por iniciativa do empregador'], ['02', 'Sem justa causa, por iniciativa do empregador'],
    ['03', 'Término antecipado do contrato a termo pelo empregador'], ['04', 'Término antecipado do contrato a termo pelo empregado'],
    ['06', 'Término do contrato a termo'], ['07', 'Pedido de demissão'], ['33', 'Acordo entre as partes (art. 484-A)'],
];

export type TipoCampo = 'texto' | 'data' | 'lista' | 'longo';
export interface DefCampo { tipo: TipoCampo; opcoes?: [string, string][] }

// Tabelas do leiaute S-1.3 do eSocial.
const OPCOES: Partial<Record<CampoFicha, [string, string][]>> = {
    sexo: [['M', 'Masculino'], ['F', 'Feminino']],
    estadoCivil: [['1', 'Solteiro'], ['2', 'Casado'], ['3', 'Divorciado'], ['4', 'Separado'], ['5', 'Viúvo']],
    raca: [['1', 'Branca'], ['2', 'Preta'], ['3', 'Parda'], ['4', 'Amarela'], ['5', 'Indígena'], ['6', 'Não informado']],
    escolaridade: [
        ['01', 'Analfabeto'], ['02', 'Até o 5º ano incompleto'], ['03', '5º ano completo'], ['04', 'Do 6º ao 9º ano incompleto'],
        ['05', 'Fundamental completo'], ['06', 'Médio incompleto'], ['07', 'Médio completo'], ['08', 'Superior incompleto'],
        ['09', 'Superior completo'], ['10', 'Pós-graduação completa'], ['11', 'Mestrado completo'], ['12', 'Doutorado completo'],
    ],
    unidadeSalario: [['1', 'Por hora'], ['2', 'Por dia'], ['3', 'Por semana'], ['4', 'Por quinzena'], ['5', 'Por mês'], ['6', 'Por tarefa'], ['7', 'Não aplicável']],
    tipoContrato: [['1', 'Prazo indeterminado'], ['2', 'Prazo determinado, em dias'], ['3', 'Prazo determinado, vinculado a fato']],
    regimeTrabalhista: [['1', 'CLT'], ['2', 'Estatutário']],
    regimePrevidenciario: [['1', 'RGPS'], ['2', 'RPPS'], ['3', 'Regime de previdência no exterior']],
    motivoDesligamento: MOTIVOS_DESLIGAMENTO,
    tipoConta: [['corrente', 'Corrente'], ['poupanca', 'Poupança'], ['salario', 'Salário'], ['pagamento', 'Pagamento']],
    uf: UFS.map(u => [u, u]), ufCtps: UFS.map(u => [u, u]),
};
const DATAS: CampoFicha[] = ['nascimento', 'admissao', 'fimContrato', 'emissaoRg', 'dataDesligamento', 'dataProjetadaAviso'];
const LONGOS: CampoFicha[] = ['observacoes', 'jornada', 'deficiencia', 'enderecoExterior'];

export function defCampo(campo: CampoFicha): DefCampo {
    if (OPCOES[campo]) return { tipo: 'lista', opcoes: OPCOES[campo] };
    if (DATAS.includes(campo)) return { tipo: 'data' };
    if (LONGOS.includes(campo)) return { tipo: 'longo' };
    return { tipo: 'texto' };
}

/** Abas na ordem do IOB Office. Complementos, Lanç. Automático e Holerite dependem dos prints do Office. */
export const ABAS: { id: string; titulo: string; campos: CampoFicha[] }[] = [
    { id: 'dados', titulo: 'Dados', campos: ['nome', 'nascimento', 'sexo', 'estadoCivil', 'raca', 'escolaridade', 'nacionalidade', 'paisNascimento', 'naturalidade', 'mae', 'pai', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'telefone', 'email'] },
    { id: 'identAdm', titulo: 'Ident. Adm.', campos: ['codigoIob', 'admissao', 'categoria', 'tipoContrato', 'fimContrato', 'cargo', 'cbo', 'funcao', 'cargoIob', 'departamentoIob', 'salario', 'unidadeSalario', 'horasSemanais', 'horario', 'jornada', 'horarioTrabalho', 'horarioIntervalo', 'sindicato', 'sindicatoIob', 'estabelecimento', 'regimeTrabalhista', 'regimePrevidenciario', 'opcaoFgts', 'dataDesligamento', 'motivoDesligamento', 'dataProjetadaAviso'] },
    { id: 'documentos', titulo: 'Documentos', campos: ['pis', 'cadastroPis', 'ctps', 'serieCtps', 'ufCtps', 'rg', 'orgaoRg', 'emissaoRg', 'tituloEleitor', 'zonaEleitoral', 'secaoEleitoral', 'documentoMilitar'] },
    { id: 'outros', titulo: 'Outros', campos: ['banco', 'agencia', 'conta', 'tipoConta', 'pix', 'deficiencia', 'enderecoExterior', 'observacoes'] },
];

/** Id do documento no Firestore: determinístico, para a reimportação cair no mesmo vínculo. */
export function idFuncionario(empresaId: string, cpf: string, matricula: string): string {
    return `${empresaId}_${cpf}_${encodeURIComponent(matricula)}`;
}

export function fichaVazia(empresa: { id: string; cnpj: string }): FichaFuncionario {
    return { id: '', empresaId: empresa.id, cnpj: empresa.cnpj, cpf: '', matriculaEsocial: '', situacao: 'ativo', dados: {}, dependentes: [], origens: {}, pendenciasImportacao: [] };
}

/** Converte um vínculo consolidado da implantação (XML do eSocial) em ficha. */
export function fichaDoEsocial(c: Cadastro, empresa: { id: string; cnpj: string }): FichaFuncionario {
    const dados: FichaFuncionario['dados'] = {};
    const origens: FichaFuncionario['origens'] = {};
    for (const [k, v] of Object.entries(c.dados) as [Campo, string][]) {
        if (k === 'dependentes' || k === 'matriculaIob' || !v) continue;
        dados[k] = v;
        if (c.origens[k]) origens[k] = `eSocial: ${c.origens[k]}`;
    }
    const dependentes = lerDependentes(c.dados.dependentes);
    if (c.origens.dependentes) origens.dependentes = `eSocial: ${c.origens.dependentes}`;
    const s2299 = c.eventos.filter(e => e.tipo === 'S-2299').sort((a, b) => a.data.localeCompare(b.data)).pop();
    if (s2299?.data) { dados.dataDesligamento = s2299.data; origens.dataDesligamento = 'eSocial: S-2299'; }
    // Motivo (Tabela 19) e fim projetado do aviso indenizado, do conteúdo do S-2299.
    const motivo = s2299?.conteudo.match(/\["mtvDeslig",\[\],"(\d{2})"\]/)?.[1];
    if (motivo) { dados.motivoDesligamento = motivo; origens.motivoDesligamento = 'eSocial: S-2299'; }
    const projetada = s2299?.conteudo.match(/\["dtProjFimAPI",\[\],"(\d{4}-\d{2}-\d{2})"\]/)?.[1];
    if (projetada) { dados.dataProjetadaAviso = projetada; origens.dataProjetadaAviso = 'eSocial: S-2299'; }
    origens.situacao = c.desligado ? 'eSocial: S-2299' : 'eSocial';
    return {
        id: idFuncionario(empresa.id, c.cpf, c.matricula), empresaId: empresa.id, cnpj: empresa.cnpj,
        cpf: c.cpf, matriculaEsocial: c.matricula, situacao: c.desligado ? 'desligado' : 'ativo',
        dados, dependentes, origens,
        // A mesma pendência em vários eventos (ex.: leiaute antigo em cada S-2206) aparece uma vez.
        pendenciasImportacao: [...new Set(c.pendencias.filter(p => !/Matrícula para IOB|Código IOB repetido|campo de 6 dígitos/.test(p)))],
    };
}

/** Limpa espaços, deixa só dígitos onde o campo é numérico e padroniza o salário com ponto decimal. */
export function normalizarFicha(f: FichaFuncionario): FichaFuncionario {
    const dados: FichaFuncionario['dados'] = {};
    for (const [k, v] of Object.entries(f.dados) as [CampoFicha, string][]) {
        let t = (v ?? '').trim();
        if (['pis', 'cep', 'cbo'].includes(k)) t = t.replace(/\D/g, '');
        if (['uf', 'ufCtps'].includes(k)) t = t.toUpperCase();
        if (k === 'sindicato' || k === 'estabelecimento') t = t.toUpperCase().replace(/[.\-/\s]/g, '');
        if (k === 'salario' && t) { const c = centavosDeTexto(t); if (c !== null) t = (c / 100).toFixed(2); }
        if (t) dados[k] = t;
    }
    return {
        ...f, cpf: f.cpf.replace(/\D/g, ''), matriculaEsocial: f.matriculaEsocial.trim(), dados,
        dependentes: f.dependentes.map(d => ({ ...d, nome: d.nome.trim(), cpf: d.cpf.replace(/\D/g, ''), nascimento: d.nascimento.trim() })),
    };
}

export interface Validacao { erros: string[]; avisos: string[] }

export function validarFicha(f: FichaFuncionario): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    const d = f.dados;
    if (!f.empresaId) erros.push('Selecione a empresa.');
    if (!cpfValido(f.cpf)) erros.push('CPF inválido.');
    if (!f.matriculaEsocial) erros.push('Informe a matrícula do eSocial.');
    if (!d.nome) erros.push('Informe o nome.');
    for (const k of DATAS) if (d[k] && !dataValida(d[k]!)) erros.push(`${ROTULO[k]}: data inválida.`);
    if (d.salario && !/^\d+(\.\d{1,2})?$/.test(d.salario)) erros.push('Salário inválido.');
    if (d.cep && !/^\d{8}$/.test(d.cep)) erros.push('CEP deve ter 8 dígitos.');
    for (const k of ['uf', 'ufCtps'] as CampoFicha[]) if (d[k] && !UFS.includes(d[k]!)) erros.push(`${ROTULO[k]}: UF inválida.`);
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) erros.push('E-mail inválido.');
    if (d.pis && !pisValido(d.pis)) erros.push('PIS/PASEP inválido.');
    if (d.cbo && !/^\d{6}$/.test(d.cbo)) erros.push('CBO deve ter 6 dígitos.');
    if (d.sindicato && !cnpjValido(d.sindicato)) erros.push('CNPJ do sindicato inválido.');
    if (d.admissao && d.fimContrato && dataValida(d.admissao) && dataValida(d.fimContrato) && d.fimContrato < d.admissao) erros.push('Fim do contrato anterior à admissão.');
    if (d.admissao && d.dataDesligamento && dataValida(d.admissao) && dataValida(d.dataDesligamento) && d.dataDesligamento < d.admissao) erros.push('Desligamento anterior à admissão.');
    f.dependentes.forEach((dep, i) => {
        const n = `Dependente ${i + 1}`;
        if (!dep.nome) erros.push(`${n}: informe o nome.`);
        if (dep.nascimento && !dataValida(dep.nascimento)) erros.push(`${n}: nascimento inválido.`);
        if (dep.cpf && !cpfValido(dep.cpf)) erros.push(`${n}: CPF inválido.`);
    });
    for (const k of ['admissao', 'cargo', 'cbo', 'salario', 'categoria'] as CampoFicha[]) if (!d[k]) avisos.push(`${ROTULO[k]} em branco.`);
    if (!d.codigoIob) avisos.push('Código no IOB em branco: o TXT de ponto usa esse código.');
    if (f.situacao === 'desligado' && !d.dataDesligamento) avisos.push('Desligado sem data de desligamento.');
    if (d.nascimento && d.admissao && dataValida(d.nascimento) && dataValida(d.admissao)) {
        const [a, m, dia] = d.nascimento.split('-').map(Number);
        const quatorze = `${a + 14}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        if (d.admissao < quatorze) avisos.push('Admissão antes dos 14 anos de idade: conferir as datas.');
    }
    return { erros, avisos };
}

export interface Alteracao { campo: ChaveOrigem | 'codigoIob' | 'matriculaEsocial' | 'cpf'; de: string; para: string }

const depsTexto = (l: Dependente[]) => l.map(d => `${d.nome} (${d.nascimento || 's/ nasc.'}${d.cpf ? `, CPF ${d.cpf}` : ''})`).join('; ');

/** Diferença campo a campo entre duas versões, para a trilha de auditoria. */
export function diffFicha(antes: FichaFuncionario | null, depois: FichaFuncionario): Alteracao[] {
    const r: Alteracao[] = [];
    const a = antes ?? { ...depois, cpf: '', matriculaEsocial: '', situacao: '' as Situacao, dados: {}, dependentes: [] };
    if (a.cpf !== depois.cpf) r.push({ campo: 'cpf', de: a.cpf, para: depois.cpf });
    if (a.matriculaEsocial !== depois.matriculaEsocial) r.push({ campo: 'matriculaEsocial', de: a.matriculaEsocial, para: depois.matriculaEsocial });
    if (a.situacao !== depois.situacao) r.push({ campo: 'situacao', de: a.situacao, para: depois.situacao });
    const chaves = new Set([...Object.keys(a.dados), ...Object.keys(depois.dados)]) as Set<CampoFicha>;
    for (const k of chaves) {
        const de = a.dados[k] ?? ''; const para = depois.dados[k] ?? '';
        if (de !== para) r.push({ campo: k, de, para });
    }
    if (depsTexto(a.dependentes) !== depsTexto(depois.dependentes)) r.push({ campo: 'dependentes', de: depsTexto(a.dependentes), para: depsTexto(depois.dependentes) });
    return r;
}

/** Marca como "Manual" a origem de tudo o que o usuário mudou na ficha. */
export function aplicarEdicao(antes: FichaFuncionario | null, depois: FichaFuncionario, autor: string, quando: string): FichaFuncionario {
    const origens = { ...depois.origens };
    for (const alt of diffFicha(antes, depois)) {
        if (alt.campo === 'cpf' || alt.campo === 'matriculaEsocial') continue;
        origens[alt.campo] = `Manual · ${autor} · ${quando}`;
    }
    return { ...depois, origens };
}

export const ehManual = (origem?: string) => !!origem && origem.startsWith('Manual');

export interface Preservado { campo: ChaveOrigem; manual: string; esocial: string }
export interface ResultadoMescla { ficha: FichaFuncionario; novo: boolean; alteracoes: Alteracao[]; preservados: Preservado[] }

/**
 * Reimportação do eSocial sobre uma ficha já gravada. O eSocial atualiza o que
 * veio dele; campo manual divergente é preservado e listado; campos que o
 * eSocial não tem (código IOB, banco, observações) nunca são tocados.
 */
export function mesclarComEsocial(existente: FichaFuncionario | undefined, importada: FichaFuncionario): ResultadoMescla {
    if (!existente) return { ficha: importada, novo: true, alteracoes: diffFicha(null, importada), preservados: [] };
    const ficha: FichaFuncionario = { ...existente, dados: { ...existente.dados }, origens: { ...existente.origens }, pendenciasImportacao: importada.pendenciasImportacao };
    const preservados: Preservado[] = [];
    const chaves = new Set([...Object.keys(importada.dados), ...Object.keys(existente.dados)]) as Set<CampoFicha>;
    for (const k of chaves) {
        const novo = importada.dados[k]; const atual = existente.dados[k];
        const origem = existente.origens[k];
        if (novo === atual) { if (novo && importada.origens[k] && !ehManual(origem)) ficha.origens[k] = importada.origens[k]; continue; }
        if (ehManual(origem)) { if (novo) preservados.push({ campo: k, manual: atual ?? '', esocial: novo }); continue; }
        if (novo) { ficha.dados[k] = novo; ficha.origens[k] = importada.origens[k]; }
        else if (origem?.startsWith('eSocial')) { delete ficha.dados[k]; ficha.origens[k] = importada.origens[k] ?? 'eSocial: campo ausente na última importação'; }
    }
    if (depsTexto(existente.dependentes) !== depsTexto(importada.dependentes)) {
        if (ehManual(existente.origens.dependentes)) {
            if (importada.dependentes.length) preservados.push({ campo: 'dependentes', manual: depsTexto(existente.dependentes), esocial: depsTexto(importada.dependentes) });
        } else { ficha.dependentes = importada.dependentes; ficha.origens.dependentes = importada.origens.dependentes; }
    }
    // Desligado pela data do IOB (dtres) e sem S-2299 nos arquivos: continua desligado, com pendência.
    const desligadoForaDoEsocial = importada.situacao === 'ativo' && !!ficha.dados.dataDesligamento && !ficha.origens.dataDesligamento?.startsWith('eSocial');
    if (desligadoForaDoEsocial) {
        ficha.situacao = 'desligado';
        ficha.pendenciasImportacao = [...ficha.pendenciasImportacao, `Desligado em ${ficha.dados.dataDesligamento} (${ficha.origens.dataDesligamento ?? 'sem origem'}), sem S-2299 nos arquivos do eSocial: conferir.`];
    } else if (existente.situacao !== importada.situacao) {
        if (ehManual(existente.origens.situacao)) preservados.push({ campo: 'situacao', manual: existente.situacao, esocial: importada.situacao });
        else { ficha.situacao = importada.situacao; ficha.origens.situacao = importada.origens.situacao; }
    }
    return { ficha, novo: false, alteracoes: diffFicha(existente, ficha), preservados };
}

/** Texto de exibição de um valor: rótulo da tabela do eSocial quando houver. */
export function exibir(campo: CampoFicha, valor: string | undefined): string {
    if (!valor) return '';
    const op = OPCOES[campo]?.find(([c]) => c === valor);
    return op ? `${op[0]} - ${op[1]}` : valor;
}

/** Linhas da planilha de funcionários: uma coluna por campo, na ordem das abas. */
export function linhasPlanilha(fichas: FichaFuncionario[]): Record<string, string | number>[] {
    return fichas.map(f => {
        const linha: Record<string, string | number> = { CPF: f.cpf, 'Matrícula eSocial': f.matriculaEsocial, Situação: f.situacao === 'ativo' ? 'Ativo' : 'Desligado' };
        for (const aba of ABAS) for (const c of aba.campos) linha[ROTULO[c]] = c === 'salario' && f.dados.salario ? Number(f.dados.salario) : exibir(c, f.dados[c]);
        linha.Dependentes = depsTexto(f.dependentes);
        return linha;
    });
}
