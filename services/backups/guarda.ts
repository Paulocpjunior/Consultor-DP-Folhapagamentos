// services/backups/guarda.ts
//
// Registro de guarda dos backups do IOB SAGE (Paulo, 07/10/2026: "como
// estamos tratando de dados pessoais além de folha de pagamento, será
// necessário o backup completo das informações que usávamos na SAGE").
// O arquivo original fica guardado fora do Consultor (UNAS Pro 4); aqui fica
// só o inventário: nome, tamanho, SHA-256, empresas, local, quem e quando.
// O SHA-256 prova depois que o arquivo guardado é o mesmo (não foi trocado
// nem corrompido). Registro só inclui: ninguém altera nem apaga.

export interface RegistroGuarda {
    /** = sha256: o mesmo arquivo não é registrado duas vezes. */
    id: string;
    sha256: string;
    arquivo: string;
    tamanho: number;
    /** Data do backup (AAAA-MM-DD), informada ou pela data do arquivo. */
    dataBackup: string;
    /** Códigos SAGE das empresas no backup (schemas fNNNN), quando dá para ler. */
    empresas: string[];
    localGuarda: string;
    observacao: string;
    registradoPor: string;
    registradoPorEmail: string;
    registradoEm?: Date;
}

export const LOCAL_PADRAO = 'UNAS Pro 4 do escritório';

export function validarRegistro(r: Omit<RegistroGuarda, 'registradoEm'>): string[] {
    const e: string[] = [];
    if (!/^[0-9a-f]{64}$/.test(r.sha256) || r.id !== r.sha256) e.push('Assinatura SHA-256 inválida.');
    if (!r.arquivo.trim()) e.push('Informe o nome do arquivo.');
    if (!(r.tamanho > 0)) e.push('Arquivo vazio.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.dataBackup)) e.push('Informe a data do backup.');
    if (!r.localGuarda.trim()) e.push('Informe onde o arquivo está guardado.');
    return e;
}

export type Conferencia =
    | { situacao: 'integro'; registro: RegistroGuarda }
    | { situacao: 'nome-diferente'; registro: RegistroGuarda }
    | { situacao: 'alterado'; registros: RegistroGuarda[] }
    | { situacao: 'nao-registrado' };

/**
 * Confere um arquivo pelo SHA-256: íntegro (mesma assinatura e mesmo nome),
 * mesma assinatura com outro nome (renomeado), ou alterado (há registro com
 * o mesmo nome e tamanho, mas outra assinatura).
 */
export function conferirArquivo(registros: RegistroGuarda[], sha256: string, arquivo: string, tamanho: number): Conferencia {
    const mesmo = registros.find(r => r.sha256 === sha256);
    if (mesmo) return mesmo.arquivo === arquivo ? { situacao: 'integro', registro: mesmo } : { situacao: 'nome-diferente', registro: mesmo };
    const homonimos = registros.filter(r => r.arquivo === arquivo || (r.tamanho === tamanho && r.arquivo.toLowerCase() === arquivo.toLowerCase()));
    return homonimos.length ? { situacao: 'alterado', registros: homonimos } : { situacao: 'nao-registrado' };
}

export const tamanhoLegivel = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`).replace('.', ',');
