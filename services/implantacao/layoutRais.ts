// services/implantacao/layoutRais.ts
//
// Layout do arquivo de declaração da RAIS — referência para a rota de carga de
// cadastro do IOB Office ("Utilitários > Importações > Importação de Dados da
// RAIS2009 — Engenharia Reversa", que lê o arquivo do GDRAIS 2009).
//
// ⚠ ANO-BASE 2022, NÃO 2009. Transcrito do "LAYOUT PARA GERAÇÃO DO ARQUIVO DE
// DECLARAÇÃO - ANO BASE 2022" (Ministério do Trabalho e Emprego). A IOB pede
// explicitamente o arquivo do GDRAIS 2009, e entre 2009 e 2022 a RAIS ganhou
// campos (teletrabalho, trabalho intermitente, aprendiz grávida…) — logo as
// POSIÇÕES aqui não servem para gerar o arquivo que a IOB lê.
//
// Serve para: conhecer a estrutura (é a mesma família de arquivo desde sempre)
// e responder o que a rota consegue ou não preencher da ficha. Substituir pelo
// layout ano-base 2009 antes de gerar qualquer arquivo.
//
// Estrutura do arquivo (texto, todos os registros com 584 posições):
//   TIPO-0  cabeçalho do responsável pela declaração
//   TIPO-1  estabelecimento (1 por empresa do arquivo)
//   TIPO-2  vínculo/trabalhador (1 por empregado)
//   TIPO-9  totalizador (contagem de registros tipo 1 e tipo 2)

export const RAIS_TAMANHO_REGISTRO = 584;

export interface CampoRais {
    ini: number;
    fim: number;
    tipo: 'N' | 'A';
    nome: string;
    /** De onde sai no Consultor DP, quando existe fonte. */
    origem?: string;
    obs?: string;
}

/**
 * REGISTRO TIPO-2 — o que interessa para cadastro. `origem` diz o que o módulo
 * de implantação já tem (XML do S-2200 ou ficha PDF) e o que não tem.
 */
export const RAIS_TIPO_2: CampoRais[] = [
    { ini: 1,   fim: 6,   tipo: 'N', nome: 'Sequencial do registro no arquivo', origem: 'gerado' },
    { ini: 7,   fim: 20,  tipo: 'N', nome: 'Inscrição CNPJ do estabelecimento', origem: 'XML localTrabGeral/nrInsc' },
    { ini: 21,  fim: 22,  tipo: 'A', nome: 'Prefixo do estabelecimento' },
    { ini: 23,  fim: 23,  tipo: 'N', nome: 'Tipo do registro = 2', origem: 'constante' },
    { ini: 24,  fim: 34,  tipo: 'N', nome: 'Código PIS/PASEP/NIT', origem: 'ficha PDF' },
    { ini: 35,  fim: 86,  tipo: 'A', nome: 'Nome do Empregado', origem: 'XML nmTrab' },
    { ini: 87,  fim: 94,  tipo: 'N', nome: 'Data de Nascimento (ddmmaaaa)', origem: 'XML dtNascto' },
    { ini: 95,  fim: 96,  tipo: 'N', nome: 'Nacionalidade', origem: 'XML paisNac', obs: 'tabela RAIS ≠ tabela eSocial' },
    { ini: 97,  fim: 100, tipo: 'N', nome: 'Ano de Chegada ao país (aaaa)' },
    { ini: 101, fim: 102, tipo: 'N', nome: 'Grau de Instrução (01 a 11)', origem: 'XML grauInstr', obs: 'tabela RAIS ≠ tabela eSocial' },
    { ini: 103, fim: 113, tipo: 'N', nome: 'CPF', origem: 'XML cpfTrab' },
    { ini: 114, fim: 121, tipo: 'N', nome: 'CTPS (número)', origem: 'ficha PDF' },
    { ini: 122, fim: 126, tipo: 'A', nome: 'CTPS (série)', origem: 'ficha PDF' },
    { ini: 127, fim: 134, tipo: 'N', nome: 'Data de Admissão/Transferência (ddmmaaaa)', origem: 'XML dtAdm' },
    { ini: 135, fim: 136, tipo: 'N', nome: 'Tipo de Admissão', origem: 'XML tpAdmissao', obs: 'tabela RAIS ≠ tabela eSocial' },
    { ini: 137, fim: 145, tipo: 'N', nome: 'Salário Contratual (com centavos)', origem: 'XML vrSalFx' },
    { ini: 146, fim: 146, tipo: 'N', nome: 'Tipo de Salário Contratual', origem: 'XML undSalFixo' },
    { ini: 147, fim: 148, tipo: 'N', nome: 'Horas Semanais', origem: 'XML qtdHrsSem', obs: 'só 2 posições: inteiro' },
    { ini: 149, fim: 154, tipo: 'N', nome: 'CBO', origem: 'XML CBOCargo' },
    { ini: 155, fim: 156, tipo: 'N', nome: 'Vínculo empregatício', origem: 'XML tpRegTrab/codCateg', obs: 'tabela RAIS' },
    { ini: 157, fim: 158, tipo: 'N', nome: 'Código do desligamento' },
    { ini: 159, fim: 162, tipo: 'N', nome: 'Data do desligamento (ddmm)' },
    // 163-292: remunerações mês a mês, 13º. Movimento — fora do escopo cadastral.
    { ini: 163, fim: 292, tipo: 'N', nome: 'Remunerações mensais e 13º', obs: 'MOVIMENTO — zeros na carga cadastral' },
    { ini: 293, fim: 293, tipo: 'N', nome: 'Raça/Cor', origem: 'XML racaCor', obs: 'tabela RAIS ≠ tabela eSocial' },
    { ini: 294, fim: 294, tipo: 'N', nome: 'Indicador de Deficiência (1 sim, 2 não)' },
    { ini: 295, fim: 295, tipo: 'N', nome: 'Tipo de Deficiência (0 a 6)' },
    { ini: 296, fim: 296, tipo: 'N', nome: 'Indicador de Alvará' },
    { ini: 297, fim: 305, tipo: 'N', nome: 'Aviso Prévio Indenizado' },
    { ini: 306, fim: 306, tipo: 'N', nome: 'Sexo (1 masculino, 2 feminino)', origem: 'XML sexo', obs: 'RAIS usa 1/2; o eSocial usa M/F' },
    { ini: 307, fim: 339, tipo: 'N', nome: 'Afastamentos (3 ocorrências) e dias', obs: 'MOVIMENTO' },
    { ini: 340, fim: 385, tipo: 'N', nome: 'Férias indenizadas, banco de horas, dissídio, gratificações, multa', obs: 'MOVIMENTO' },
    { ini: 386, fim: 495, tipo: 'N', nome: 'Contribuições sindicais do trabalhador (CNPJ + valor)', obs: 'MOVIMENTO' },
    { ini: 496, fim: 502, tipo: 'N', nome: 'Município — local de trabalho', origem: 'XML codMunic' },
    { ini: 503, fim: 538, tipo: 'N', nome: 'Horas extras mês a mês', obs: 'MOVIMENTO' },
    { ini: 539, fim: 539, tipo: 'N', nome: 'Empregado filiado a sindicato (1 sim, 2 não)' },
    { ini: 540, fim: 540, tipo: 'N', nome: 'Vínculo aprendiz grávida (1 sim, 2 não)', obs: 'campo recente — não existe em 2009' },
    { ini: 541, fim: 541, tipo: 'N', nome: 'Trabalho parcial (1 sim, 2 não)' },
    { ini: 542, fim: 542, tipo: 'N', nome: 'Teletrabalho (1 sim, 2 não)', obs: 'campo recente — não existe em 2009' },
    { ini: 543, fim: 543, tipo: 'N', nome: 'Trabalho intermitente (1 sim, 2 não)', obs: 'campo recente — não existe em 2009' },
    { ini: 544, fim: 573, tipo: 'A', nome: 'Matrícula', origem: 'XML matricula', obs: '30 posições: a matrícula eSocial (836292) cabe inteira' },
    { ini: 574, fim: 576, tipo: 'N', nome: 'Categoria', origem: 'XML codCateg' },
    { ini: 577, fim: 584, tipo: 'A', nome: 'Informação de uso exclusivo da empresa' },
];

/**
 * O que a RAIS NÃO carrega e, portanto, continua na digitação mesmo que a rota
 * funcione. Levantado contra o layout ano-base 2022.
 */
export const RAIS_NAO_CARREGA = [
    'Endereço do trabalhador (a RAIS só tem o endereço do estabelecimento)',
    'Filiação (nome da mãe e do pai)',
    'Estado civil',
    'E-mail e telefone do trabalhador',
    'Identidade (RG/CIN), órgão emissor e data de emissão',
    'Naturalidade',
    'Dependentes (não há registro de dependente no arquivo)',
] as const;
