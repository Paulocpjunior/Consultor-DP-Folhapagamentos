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
}

export interface EmpresaInput {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string;
    codigoSage: string;
}
