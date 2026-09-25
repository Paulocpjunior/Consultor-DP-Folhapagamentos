// services/folha/layoutCadastroIob.ts
//
// Layouts OFICIAIS de "Importação de Funcionários/Bases de Cálculo" do IOB
// Gestão Contábil (Folha de Pagamento > Utilitários), transcritos da ajuda
// online da IOB em 25/09/2026:
//   ajudaonline.ebs.com.br/sgc/index.html?crhoutimp.htm
//
// ATENÇÃO — transcrição feita a partir das telas da AJUDA ONLINE, que pode
// estar atrás da versão instalada. A fonte que manda é o layout impresso pela
// própria instalação (Folha de Pagamento > Utilitários > ... > Layout), do
// mesmo jeito que foi feito com os layouts de ponto. Onde os dois divergirem,
// vale o impresso.
//
// Substitui o layout de 781 posições inventado antes: aquele não existe.
// A tela de importação tem 5 opções independentes, cada uma com seu arquivo:
//   Funções · Funcionários (obrigatórios) · Funcionários (opcionais) ·
//   Eventos Mensais/Bases de Cálculo · Dependentes
//
// Convenções declaradas pela própria IOB:
//   9(n)    numérico, alinhado à DIREITA, zeros à esquerda; vazio = zeros
//   X(n)    alfanumérico, alinhado à ESQUERDA; vazio = espaços
//   9(n)V99 as 2 últimas posições são decimais; NÃO usar vírgula
//   Todo arquivo tem 1 REGISTRO HEADER (tipo 0) e N REGISTROS DETALHE (tipo 1),
//   ordenados de forma ascendente pelo campo SEQUÊNCIA.

export interface CampoLayoutIob {
    campo: string;      // número do campo no manual (001, 002, …)
    nome: string;
    formato: string;    // como impresso no manual
    ini: number;
    fim: number;
    descricao?: string;
}

/** Header comum aos três arquivos (17 posições). */
export const HEADER_IOB: CampoLayoutIob[] = [
    { campo: '001', nome: 'TIPO',      formato: '9(001)', ini: 1, fim: 1,  descricao: 'Tipo de Registro: 0 - Header' },
    { campo: '002', nome: 'SEQUENCIA', formato: '9(006)', ini: 2, fim: 7,  descricao: 'Sequência do registro: 000001' },
    { campo: '003', nome: 'RESERVADO', formato: 'X(010)', ini: 8, fim: 17, descricao: 'Reservado para uso da IOB' },
];

/**
 * Cadastro de Funcionários — CAMPOS OBRIGATÓRIOS. Registro detalhe = 158 pos.
 *
 * Nota sobre os campos de valor: o manual imprime "9(012)V99" em SALARIO mas
 * dá a faixa 137-148, que são 12 posições — e não 14. O mesmo em H.SEMANAIS e
 * ADIANTAMENTO. As FAIXAS são coerentes entre si (cada campo começa onde o
 * anterior terminou), então tratamos a faixa como autoridade e "V99" como
 * "as 2 últimas posições são decimais". Confirmar numa importação de teste.
 */
export const LAYOUT_FUNCIONARIOS_OBRIGATORIOS: CampoLayoutIob[] = [
    { campo: '001', nome: 'TIPO',            formato: '9(001)',    ini: 1,   fim: 1,   descricao: 'Tipo de Registro: 1 - Detalhe' },
    { campo: '002', nome: 'SEQUENCIA',       formato: '9(006)',    ini: 2,   fim: 7,   descricao: 'Número sequencial do registro' },
    // ⚠ EM ABERTO — largura deste campo. A ajuda online publica 9(005), mas o
    // layout de PONTO impresso pela instalação da 2XR em 25/09/2026 usa 9(006),
    // e a decisão do Paulo (25/09) é que o código do funcionário na IOB É a
    // matrícula do eSocial (ex.: 836292, seis dígitos). Ou seja: a ajuda online
    // provavelmente está desatualizada.
    //
    // Não dá para simplesmente escrever 6 dígitos aqui: se o campo virou
    // 008-013, TODOS os campos seguintes andam +1 e o registro passa a ter 159
    // posições, não 158. De onde sai a posição extra, só o layout impresso pela
    // instalação diz — e é ele que manda, não este arquivo.
    { campo: '003', nome: 'FUNCIONARIO',     formato: '9(005)',    ini: 8,   fim: 12,  descricao: 'Código do funcionário = matrícula do eSocial. Largura a confirmar (ver nota acima)' },
    { campo: '004', nome: 'NOME',            formato: 'X(040)',    ini: 13,  fim: 52 },
    { campo: '005', nome: 'SEXO',            formato: 'X(001)',    ini: 53,  fim: 53,  descricao: 'M/F' },
    { campo: '006', nome: 'ESTADO CIVIL',    formato: '9(001)',    ini: 54,  fim: 54 },
    { campo: '007', nome: 'NACIONALIDADE',   formato: '9(002)',    ini: 55,  fim: 56 },
    { campo: '008', nome: 'INSTRUCAO',       formato: '9(001)',    ini: 57,  fim: 57,  descricao: 'Grau de instrução' },
    { campo: '009', nome: 'NASCIMENTO',      formato: '9(008)',    ini: 58,  fim: 65 },
    { campo: '010', nome: 'RACA',            formato: '9(001)',    ini: 66,  fim: 66 },
    { campo: '011', nome: 'DEFICIENTE',      formato: '9(001)',    ini: 67,  fim: 67,  descricao: '0 não portador · 1 física · 2 auditiva · 3 visual · 4 intelectual · 5 múltipla · 6 reabilitado' },
    { campo: '012', nome: 'ADMISSAO',        formato: '9(008)',    ini: 68,  fim: 75 },
    { campo: '013', nome: 'VINCULO',         formato: '9(002)',    ini: 76,  fim: 77,  descricao: 'Vínculo empregatício' },
    { campo: '014', nome: 'CAGED',           formato: '9(002)',    ini: 78,  fim: 79,  descricao: 'Código de admissão para CAGED' },
    { campo: '015', nome: 'SINDICATO',       formato: '9(003)',    ini: 80,  fim: 82,  descricao: 'Código do sindicato NA IOB (não é o CNPJ)' },
    { campo: '016', nome: 'SIT.SINDICAL',    formato: '9(001)',    ini: 83,  fim: 83 },
    { campo: '017', nome: 'CATEGORIA',       formato: '9(002)',    ini: 84,  fim: 85 },
    { campo: '018', nome: 'OCORRENCIA',      formato: '9(002)',    ini: 86,  fim: 87 },
    { campo: '019', nome: 'BANCO',           formato: '9(003)',    ini: 88,  fim: 90,  descricao: 'Código do banco p/ rec. FGTS' },
    { campo: '020', nome: 'OPCAO INSS',      formato: '9(001)',    ini: 91,  fim: 91 },
    { campo: '021', nome: 'CARTEIRA',        formato: '9(007)',    ini: 92,  fim: 98,  descricao: 'Carteira de trabalho' },
    { campo: '022', nome: 'SERIE',           formato: '9(005)',    ini: 99,  fim: 103 },
    { campo: '023', nome: 'DIGITO',          formato: 'X(001)',    ini: 104, fim: 104, descricao: 'Dígito da série' },
    { campo: '024', nome: 'UF',              formato: 'X(002)',    ini: 105, fim: 106, descricao: 'Estado de emissão' },
    { campo: '025', nome: 'PIS',             formato: '9(011)',    ini: 107, fim: 117 },
    { campo: '026', nome: 'FUNCAO',          formato: '9(003)',    ini: 118, fim: 120, descricao: 'Código da função NA IOB (ver FUNCAO.TXT)' },
    { campo: '027', nome: 'ESTABELECIMENTO', formato: '9(003)',    ini: 121, fim: 123 },
    { campo: '028', nome: 'DEPARTAMENTO',    formato: '9(003)',    ini: 124, fim: 126 },
    { campo: '029', nome: 'SETOR',           formato: '9(003)',    ini: 127, fim: 129 },
    { campo: '030', nome: 'SECAO',           formato: '9(003)',    ini: 130, fim: 132 },
    { campo: '031', nome: 'C.DE CUSTO',      formato: '9(003)',    ini: 133, fim: 135 },
    { campo: '032', nome: 'TIPO SALARIO',    formato: 'X(001)',    ini: 136, fim: 136, descricao: 'H (hora) ou M (mês)' },
    { campo: '033', nome: 'SALARIO',         formato: '9(012)V99', ini: 137, fim: 148, descricao: 'Valor do salário (hora ou mês)' },
    { campo: '034', nome: 'H. SEMANAIS',     formato: '9(004)V99', ini: 149, fim: 152 },
    { campo: '035', nome: 'ADIANTAMENTO',    formato: '9(004)V99', ini: 153, fim: 156, descricao: 'Percentual de adiantamento' },
    { campo: '036', nome: 'DIGITO 2',        formato: 'X(002)',    ini: 157, fim: 158, descricao: 'Dígito da série com mais de um caracter' },
];

/** FUNCAO.TXT — registro de 100 posições. */
export const LAYOUT_FUNCOES: CampoLayoutIob[] = [
    { campo: '001', nome: 'TIPO',      formato: '9(001)', ini: 1,  fim: 1 },
    { campo: '002', nome: 'SEQUENCIA', formato: '9(006)', ini: 2,  fim: 7 },
    { campo: '003', nome: 'CODIGO',    formato: '9(003)', ini: 8,  fim: 10,  descricao: 'Código da função' },
    { campo: '004', nome: 'DESCRICAO', formato: 'X(020)', ini: 11, fim: 30 },
    { campo: '005', nome: 'CBO',       formato: '9(006)', ini: 31, fim: 36 },
    { campo: '006', nome: 'RESERVADO', formato: '9(064)', ini: 37, fim: 100 },
];

/** DEPEND.TXT — registro de 100 posições. */
export const LAYOUT_DEPENDENTES: CampoLayoutIob[] = [
    { campo: '001', nome: 'TIPO',               formato: '9(001)', ini: 1,  fim: 1 },
    { campo: '002', nome: 'SEQUENCIA',          formato: '9(006)', ini: 2,  fim: 7 },
    { campo: '003', nome: 'CODIGO FUNCIONARIO', formato: '9(005)', ini: 8,  fim: 12 },
    { campo: '004', nome: 'CODIGO DEPENDENTE',  formato: '9(002)', ini: 13, fim: 14, descricao: 'Sequencial por funcionário, começando em 01' },
    { campo: '005', nome: 'NOME',               formato: 'X(040)', ini: 15, fim: 54 },
    { campo: '006', nome: 'PARENTESCO',         formato: '9(001)', ini: 55, fim: 55 },
    { campo: '007', nome: 'NASCIMENTO',         formato: '9(008)', ini: 56, fim: 63 },
    { campo: '008', nome: 'DESCRICAO',          formato: 'X(020)', ini: 64, fim: 83, descricao: 'Só preencher para parentesco 7, 8 ou 9' },
    { campo: '009', nome: 'RESERVADO',          formato: 'X(017)', ini: 84, fim: 100 },
];

// ─── Tabelas de código da IOB (aba "Informações Adicionais") ───────────────
// NÃO são as mesmas do eSocial. Copiar o código do eSocial direto para o TXT
// grava sujeira no cadastro — ver DE_PARA_ESOCIAL abaixo.

export const IOB_ESTADO_CIVIL: Record<string, string> = {
    '1': 'Solteiro', '2': 'Casado', '3': 'Separado', '4': 'Divorciado',
    '5': 'Viúvo', '6': 'Outros',
};

export const IOB_RACA: Record<string, string> = {
    '1': 'Indígena', '2': 'Branca', '4': 'Preta', '6': 'Amarela',
    '8': 'Parda', '9': 'Não informada',
};

export const IOB_INSTRUCAO: Record<string, string> = {
    '1': 'Analfabeto',
    '2': 'Até a 4ª série do 1º grau (primário incompleto)',
    '3': 'Com a 4ª série do 1º grau completa (primário completo)',
    '4': 'Da 5ª à 8ª série do 1º grau incompleta (ginásio incompleto)',
    '5': 'Primeiro grau completo (ginásio completo)',
    '6': 'Segundo grau incompleto (colegial incompleto)',
    '7': 'Segundo grau completo (colegial completo)',
    '8': 'Superior incompleto',
    '9': 'Superior completo',
};

export const IOB_PARENTESCO: Record<string, string> = {
    '1': 'Cônjuge', '2': 'Filho', '3': 'Filho/Filha inválido',
    '4': 'Filho universitário', '5': 'Filha', '6': 'Filho/Filha não dependente',
    '7': 'Outros dependentes para IR', '8': 'Outros dependentes para SF',
    '9': 'Dependentes sem IR/SF',
};

export const IOB_CATEGORIA: Record<string, string> = {
    '1': 'Empregado', '2': 'Trabalhador avulso',
    '3': 'Trabalhador não vinculado ao RGPS mas com direito ao FGTS',
    '4': 'Trabalhador temporário (Lei 9.601/98)',
    '5': 'Diretor não empregado com FGTS',
    '11': 'Diretor não empregado sem FGTS',
};

// ─── De/para eSocial → IOB ────────────────────────────────────────────────
// O XML do S-2200 usa as tabelas do eSocial; a IOB usa as dela. Onde o número
// coincide é coincidência, não equivalência — por isso o de/para é explícito.

/** eSocial estCiv → IOB campo 006. Atenção: 3 e 4 estão TROCADOS. */
export const DE_PARA_ESTADO_CIVIL: Record<string, string> = {
    '1': '1', // solteiro
    '2': '2', // casado
    '3': '4', // eSocial "divorciado" → IOB "divorciado" é 4
    '4': '3', // eSocial "separado"   → IOB "separado" é 3
    '5': '5', // viúvo
};

/** eSocial racaCor → IOB campo 010. Nenhum número coincide. */
export const DE_PARA_RACA: Record<string, string> = {
    '1': '2', // branca
    '2': '4', // preta
    '3': '8', // parda
    '4': '6', // amarela
    '5': '1', // indígena
    '6': '9', // não informada
};

/** eSocial grauInstr → IOB campo 008. */
export const DE_PARA_INSTRUCAO: Record<string, string> = {
    '01': '1', '02': '2', '03': '3', '04': '4', '05': '5',
    '06': '6', '07': '7', '08': '8', '09': '9',
    // eSocial 10/11/12 (pós, mestrado, doutorado) não existem na IOB:
    // o mais próximo é "superior completo".
    '10': '9', '11': '9', '12': '9',
};

/** eSocial paisNac (105 = Brasil) → IOB campo 007 (10 = Brasileiro). */
export const DE_PARA_NACIONALIDADE: Record<string, string> = {
    '105': '10',
};

/** eSocial codCateg (101 = empregado geral) → IOB campo 017. */
export const DE_PARA_CATEGORIA: Record<string, string> = {
    '101': '1',
};

/** eSocial tpDep → IOB campo 006 do DEPEND.TXT. */
export const DE_PARA_PARENTESCO: Record<string, string> = {
    '01': '1', // cônjuge
    '03': '2', // filho(a) — a IOB separa 2 (filho) de 5 (filha); sem o sexo
               // do dependente no XML, cai em "filho".
};
