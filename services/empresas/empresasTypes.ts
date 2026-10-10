export type CertificadoTipo = 'A1' | 'A3';
export type CertificadoStatus = 'valido' | 'vencendo' | 'vencido' | 'sem_certificado';

export interface CertificadoDigital {
    tipo: CertificadoTipo;
    storagePath: string;
    nomeArquivo: string;
    validade: string;          // ISO date (YYYY-MM-DD)
    emissao?: string;          // ISO date
    emissor?: string;          // ex: "AC SOLUTI", "SERASA"
    titular?: string;          // nome no certificado
    uploadEm: any;             // serverTimestamp
    uploadPor: string;         // uid
}

export interface Empresa {
    id: string;
    cnpj: string;              // só dígitos, 14 chars
    razaoSocial: string;
    nomeFantasia: string;
    codigoSage: string;        // 4 dígitos zero-fill (ex: "0229")
    criadoPor: string;         // uid do usuário que cadastrou
    criadoEm?: any;            // serverTimestamp
    atualizadoEm?: any;
    certificado?: CertificadoDigital;
    /** Contas da empresa para o arquivo bancário (remessa CNAB 240 de salários). */
    contasPagamento?: import('../bancario/cnab240').ContaPagamento[];
    /** Para quem vai o pacote da folha (e-mail e WhatsApp do contato no cliente). */
    contatoEnvio?: import('../pacoteCliente/envio').ContatoEnvio;
    /** Procuração do FGTS Digital dada ao escritório (protocolo.gov.br): perfil e validade. */
    procuracaoFgts?: import('../fgts/consultaFgts').ProcuracaoFgts;
    /** Estabelecimento, lotação e de/para das verbas com as rubricas, para o S-1200 e o S-1210. */
    esocialFolha?: import('../esocial/eventosFolha').ParametrosEsocialFolha;
    /** Parâmetros do cálculo da folha (arredondamento do líquido). */
    parametrosFolha?: import('../calculo/arredondamento').ParametrosFolha;
}

export interface EmpresaInput {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string;
    codigoSage: string;
}
