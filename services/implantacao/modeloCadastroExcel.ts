// services/implantacao/modeloCadastroExcel.ts
// Modelo Excel de cadastro de funcionários, no mesmo espírito do template de
// apontamentos: uma aba principal com uma linha por funcionário e uma coluna
// por campo do layout IOB, sem eventos, referências ou valores de apontamento.

import * as XLSX from 'xlsx';
import { CAMPOS, type Campo } from './implantacao';
import { formatarData, posicoes, TIPOS_CAMPO, type LayoutCadastroIob } from './layoutCadastroIob';
import type { FichaSemVinculo, FuncionarioUnificado } from './unificacao';

export const HEADERS_FIXOS_CADASTRO = ['Matrícula eSocial (código IOB)', 'Nome do Funcionário', 'CPF'];

const dataBr = (iso: string) => formatarData(iso, 'DD/MM/AAAA') || iso;

function valorPlanilha(f: FuncionarioUnificado, origem: string, constante: string | undefined, cnpj: string): string {
    switch (origem) {
        case 'codigoIob': return f.dados.matriculaIob || f.matricula;
        case 'cpf': return f.cpf;
        case 'cnpj': return cnpj.replace(/\D/g, '');
        case 'cnpjRaiz': return cnpj.replace(/\D/g, '').slice(0, 8);
        case 'constante': return constante || '';
        case 'branco': return '';
        default: {
            const v = f.dados[origem as Campo] || '';
            return ['nascimento', 'admissao', 'emissaoRg', 'fimContrato', 'opcaoFgts', 'cadastroPis'].includes(origem) ? dataBr(v) : v;
        }
    }
}

// Rótulos das tabelas do eSocial, para quem digita escolher PELO NOME na
// tela da IOB — os números do eSocial não são os da IOB.
const ESTADO_CIVIL_ESOCIAL: Record<string, string> = { '1': 'Solteiro', '2': 'Casado', '3': 'Divorciado', '4': 'Separado', '5': 'Viúvo' };
const RACA_ESOCIAL: Record<string, string> = { '1': 'Branca', '2': 'Preta', '3': 'Parda', '4': 'Amarela', '5': 'Indígena', '6': 'Não informada' };
const rotulo = (tabela: Record<string, string>, v: string | undefined) => v ? `${tabela[v] || '?'} (${v})` : '';

/**
 * Aba "Completar após RAIS": o roteiro de digitação do que a carga pela RAIS
 * NÃO transporta. A rotina RAIS2009 do IOB Office cria a empresa e grava
 * nome, nascimento, sexo, instrução, salário, tipo de salário, horas,
 * nacionalidade e CTPS/PIS; endereço, filiação, estado civil, contatos,
 * raça/cor, cargo e dependentes ficam para a ficha — e a informação já está
 * aqui, unificada do XML e do PDF. Colunas na ordem da tela da IOB, com a aba
 * ou botão onde cada campo fica.
 */
export const HEADERS_COMPLETAR_RAIS = [
    'Código IOB previsto', 'Matrícula eSocial', 'Nome do Funcionário', 'CPF',
    'Dados › Logradouro', 'Dados › Nº', 'Dados › Complemento', 'Dados › Bairro', 'Dados › CEP', 'Dados › Município (IBGE)', 'Dados › UF',
    'Dados › País Nasc. (eSocial)', 'Dados › Natural (naturalidade)', 'Dados › Est. Civil',
    'Dados › Cargo / C.B.O.', 'Dados › Nº dep.', 'Dados › Depto.',
    'Dados › Mãe', 'Dados › Pai', 'Dados › Matrícula (eSocial)',
    'Dados › Contatos › Telefone', 'Dados › Contatos › E-mail',
    'Dados › Características › Raça/cor',
    'Ident. Adm. › Opção FGTS', 'Ident. Adm. › Contrato (tipo eSocial)', 'Ident. Adm. › Término do contrato', 'Ident. Adm. › Sindicato',
    'Documentos › CTPS Estado', 'Documentos › R.G.', 'Documentos › Órg.Exp./UF', 'Documentos › Data RG', 'Documentos › Tít. Eleitor', 'Documentos › Zona', 'Documentos › Seção', 'Documentos › Reservista',
    'Complementos › Função', 'Complementos › Horário de trabalho', 'Complementos › Intervalo',
];

/** Larguras das colunas da aba "Completar após RAIS", na mesma ordem dos cabeçalhos. */
const LARGURAS_COMPLETAR_RAIS = [
    18, 18, 40, 16,
    34, 8, 20, 24, 12, 16, 6,
    14, 24, 18,
    30, 8, 10,
    36, 36, 18,
    16, 34,
    18,
    14, 22, 16, 22,
    10, 18, 14, 12, 16, 8, 8, 16,
    24, 30, 24,
];

const TIPO_CONTRATO_ESOCIAL: Record<string, string> = {
    '1': 'Prazo indeterminado', '2': 'Prazo determinado (dias)', '3': 'Prazo determinado (ocorrência de fato)',
};

function linhaCompletarRais(f: FuncionarioUnificado, ordem: number): string[] {
    const d = f.dados;
    const matricula = d.matriculaIob || f.matricula;
    return [
        String(ordem), matricula, d.nome || '', f.cpf,
        d.logradouro || '', d.numero || '', d.complemento || '', d.bairro || '', d.cep || '', d.municipio || '', d.uf || '',
        d.paisNascimento || '', d.naturalidade || '', rotulo(ESTADO_CIVIL_ESOCIAL, d.estadoCivil),
        [d.cargoIob || d.cargo, d.cbo].filter(Boolean).join(' / CBO '), String(f.dependentes.length || ''), d.departamentoIob || '',
        d.mae || '', d.pai || '', matricula,
        d.telefone || '', d.email || '',
        rotulo(RACA_ESOCIAL, d.raca),
        d.opcaoFgts ? dataBr(d.opcaoFgts) : '', rotulo(TIPO_CONTRATO_ESOCIAL, d.tipoContrato), d.fimContrato ? dataBr(d.fimContrato) : '', d.sindicatoIob || d.sindicato || '',
        d.ufCtps || '', d.rg || '', d.orgaoRg || '', d.emissaoRg ? dataBr(d.emissaoRg) : '', d.tituloEleitor || '', d.zonaEleitoral || '', d.secaoEleitoral || '', d.documentoMilitar || '',
        d.funcao || '', d.horarioTrabalho || '', d.horarioIntervalo || '',
    ];
}

export function gerarModeloCadastroIobXlsx(cnpj: string, corte: string, funcionarios: FuncionarioUnificado[], layout: LayoutCadastroIob, avisos: string[], fichasSemVinculo: FichaSemVinculo[] = []): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    const adicionar = (nome: string, linhas: string[][], larguras: number[], filtroDesde?: number) => {
        // Strings viram células de texto: zeros iniciais e fórmulas não são interpretados.
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws['!cols'] = larguras.map(wch => ({ wch }));
        if (filtroDesde != null && linhas.length > filtroDesde + 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: filtroDesde, c: 0 }, e: { r: linhas.length - 1, c: linhas[filtroDesde].length - 1 } }) };
        XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    const colunasLayout = layout.campos.filter(c => !['codigoIob', 'cpf'].includes(c.origem) && !(c.origem === 'nome'));
    const headers = [...HEADERS_FIXOS_CADASTRO, ...colunasLayout.map(c => c.rotulo), 'Ficha PDF', 'Divergências XML × PDF', 'Pendências'];
    adicionar('Funcionários', [
        [`CADASTRO DE FUNCIONÁRIOS — ${cnpj || 'EMPRESA'}`],
        [`Implantação em ${dataBr(corte)} · unificação XML eSocial + ficha PDF · sem eventos, referências ou valores de apontamento`],
        [],
        headers,
        ...funcionarios.map(f => [
            f.dados.matriculaIob || f.matricula, f.dados.nome || '', f.cpf,
            ...colunasLayout.map(c => valorPlanilha(f, c.origem, c.constante, cnpj)),
            f.ficha?.nome || 'não localizada',
            f.divergencias.map(d => `${d.rotulo}: XML "${d.xml}" × PDF "${d.pdf}"`).join(' | '),
            f.pendencias.join(' | '),
        ]),
    ], [22, 40, 16, ...colunasLayout.map(c => Math.min(40, Math.max(12, c.rotulo.length + 2))), 30, 50, 60], 3);
    wb.Sheets['Funcionários']['!merges'] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: Math.min(headers.length - 1, 9) } }));
    // A rotina RAIS2009 atribui o código do funcionário em SEQUÊNCIA, na ordem
    // do arquivo (1, 2, 3…) — o mesmo em que os vínculos ativos saem aqui.
    const ativos = funcionarios.filter(x => !x.desligado);
    adicionar('Completar após RAIS', [
        ['COMPLETAR NA IOB DEPOIS DA CARGA PELA RAIS — o que a RAIS não transporta, já unificado do XML e da ficha PDF'],
        ['Veio pela RAIS (não redigitar): nome, nascimento, sexo, grau de instrução, salário, tipo de salário, horas, nacionalidade, CTPS/PIS. Estado civil e raça: escolher PELO NOME na tela — o número entre parênteses é o do eSocial.'],
        [],
        HEADERS_COMPLETAR_RAIS,
        ...ativos.map((x, i) => linhaCompletarRais(x, i + 1)),
    ], LARGURAS_COMPLETAR_RAIS, 3);
    wb.Sheets['Completar após RAIS']['!merges'] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: 12 } }));
    adicionar('Dependentes', [
        ['Matrícula eSocial', 'Nome do Funcionário', 'CPF do funcionário', 'Tipo (eSocial)', 'Nome do dependente', 'Nascimento', 'CPF do dependente', 'Dependente IRRF', 'Salário-família'],
        ...funcionarios.flatMap(f => f.dependentes.map(d => [f.matricula, f.dados.nome || '', f.cpf, d.tipo, d.nome, dataBr(d.nascimento), d.cpf, d.irrf, d.salarioFamilia])),
    ], [18, 40, 18, 14, 40, 14, 18, 14, 14], 0);
    adicionar('Origem dos campos', [
        ['Matrícula eSocial', 'CPF', 'Campo', 'Valor', 'Origem'],
        ...funcionarios.flatMap(f => (Object.keys(CAMPOS) as Campo[]).filter(k => f.dados[k] || f.origens[k]).map(k => [f.matricula, f.cpf, CAMPOS[k], f.dados[k] || '', f.origens[k] || ''])),
    ], [18, 18, 38, 60, 70], 0);
    adicionar('Pendências', [
        ['Matrícula eSocial', 'CPF', 'Pendência / aviso'],
        ...avisos.map(a => ['', '', a]),
        ...fichasSemVinculo.map(x => ['', '', `Ficha ${x.nome} não unida: ${x.motivo}`]),
        ...funcionarios.flatMap(f => f.pendencias.map(p => [f.matricula, f.cpf, p])),
    ], [18, 18, 120], 0);
    adicionar('Layout TXT', [
        [layout.nome],
        [`Homologado: ${layout.homologado ? 'sim' : 'NÃO — conferir na IOB'} · Datas: ${layout.formatoData} · Codificação: ${layout.codificacao} · Quebra: ${layout.quebraLinha} · ${layout.separador ? `Separador "${layout.separador}"` : 'Posições fixas'} · Extensão .${layout.extensao}`],
        [layout.fonte],
        [],
        ['Ordem', 'Campo', 'Origem', 'Início', 'Fim', 'Tamanho', 'Tipo', 'Decimais', 'Obrigatório', 'Observação'],
        ...posicoes(layout).map((p, i) => [String(i + 1), p.rotulo, p.origem, String(p.inicio), String(p.fim), String(p.tamanho), TIPOS_CAMPO[p.tipo], p.decimais == null ? '' : String(p.decimais), p.obrigatorio ? 'sim' : '', p.observacao || (p.origem === 'constante' ? `Constante "${p.constante || ''}"` : '')]),
    ], [8, 44, 20, 8, 8, 10, 16, 10, 12, 60]);
    adicionar('Instruções', [
        ['MODELO DE CADASTRO — IOB SAGE FOLHAMATIC (Importação de Funcionários/Base de Cálculo)'],
        [''],
        ['IOB OFFICE FOLHA DE PAGAMENTO — rota homologada em 28/09/2026:'],
        ['1. No Consultor DP, passo 5, gere o arquivo RAIS de 584 posições e importe em Utilitários › Importações › Importação de Dados da RAIS2009, com um código de empresa que ainda não exista. A rotina cria a empresa e os vínculos.'],
        ['2. A RAIS já traz nome, nascimento, sexo, instrução, admissão, salário, CPF, PIS, CTPS e série. A aba "Completar após RAIS" é o roteiro do resto (endereço, país, filiação, estado civil, contatos, raça, cargo, FGTS, contrato, sindicato, UF da CTPS, RG, título). Está na ordem das abas da IOB (Dados, Ident. Adm., Documentos, Complementos). Dependentes estão na aba própria.'],
        ['3. A rotina atribui o código do funcionário em sequência, na ordem do arquivo — a coluna "Código IOB previsto" diz qual. A matrícula do eSocial vai no campo Matrícula da ficha.'],
        ['4. Estado civil e raça/cor: escolha pelo nome na tela; os números da planilha são os do eSocial e as tabelas da IOB são outras.'],
        [''],
        ['IOB GESTÃO CONTÁBIL (Importação de Funcionários/Base de Cálculo) — a aba "Funcionários" segue o layout do TXT (aba "Layout TXT"); o TXT não serve para o IOB Office.'],
        [''],
        ['Em qualquer caso: campos vindos da ficha PDF constam em "Origem dos campos" com nome e hash do arquivo; divergências entre XML e PDF mantêm o XML e ficam listadas em "Pendências". Não há colunas de evento, referência ou valor — este modelo é cadastral; o salário é dado do contrato, não lançamento. Apontamentos mensais continuam no modelo de apontamentos e no TXT de 40 posições.'],
        [`CNPJ: ${cnpj} | Data da implantação: ${dataBr(corte)} | ${funcionarios.length} vínculo(s)`],
    ], [130]);
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function nomeArquivoModeloCadastro(cnpj: string): string {
    return `template-cadastro-iob-sage-${cnpj.replace(/\D/g, '') || 'EMPRESA'}.xlsx`;
}
