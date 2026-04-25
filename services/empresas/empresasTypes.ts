export interface Empresa {
    id: string;
    cnpj: string;              // só dígitos, 14 chars
    razaoSocial: string;
    nomeFantasia: string;
    codigoSage: string;        // 4 dígitos zero-fill (ex: "0229")
    criadoPor: string;         // uid do usuário que cadastrou
    criadoEm?: any;            // serverTimestamp
    atualizadoEm?: any;
}

export interface EmpresaInput {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string;
    codigoSage: string;
}
