import { CAMPOS, type Complemento, type FonteXml, type Cadastro, type Campo } from './implantacao';

export interface Documento { nome: string; hash: string; tamanho: number }
export interface Dossie {
    formato: 'consultor-dp-implantacao'; versao: 1; cnpj: string; corte: string;
    fontes: FonteXml[]; complementos: Complemento[]; documentos: Documento[];
}
export function novoDossie(): Dossie {
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { formato: 'consultor-dp-implantacao', versao: 1, cnpj: '', corte: local, fontes: [], complementos: [], documentos: [] };
}
export async function hashArquivo(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function lerDossie(texto: string): Dossie {
    if (texto.length > 30 * 1024 * 1024) throw new Error('Dossiê excede 30 MB.');
    const d = JSON.parse(texto);
    const str = (x: unknown, max = 1000) => typeof x === 'string' && x.length <= max;
    if (d?.formato !== 'consultor-dp-implantacao' || d.versao !== 1 || !str(d.cnpj, 18) || !str(d.corte, 10)
        || !Array.isArray(d.fontes) || d.fontes.length > 200 || !Array.isArray(d.complementos) || d.complementos.length > 20000
        || !Array.isArray(d.documentos) || d.documentos.length > 200) throw new Error('Formato de dossiê inválido.');
    for (const f of d.fontes) if (!str(f?.nome, 255) || !str(f?.xml, 10 * 1024 * 1024) || !/^[a-f0-9]{64}$/.test(f?.hash)) throw new Error('Fonte XML inválida no dossiê.');
    for (const c of d.complementos) if (!c || !Object.prototype.hasOwnProperty.call(CAMPOS, c.campo)
        || !['empregador', 'cpf', 'matricula', 'valor', 'fonte', 'justificativa', 'registradoEm'].every(k => str(c[k], k === 'valor' ? 4000 : 1000))) throw new Error('Complemento inválido no dossiê.');
    for (const p of d.documentos) if (!str(p?.nome, 255) || !/^[a-f0-9]{64}$/.test(p?.hash) || !Number.isSafeInteger(p?.tamanho) || p.tamanho < 0) throw new Error('Documento inválido no dossiê.');
    return { formato: d.formato, versao: 1, cnpj: d.cnpj, corte: d.corte, fontes: d.fontes, complementos: d.complementos, documentos: d.documentos };
}
/** CSV de revisão, não é arquivo de importação IOB. Neutraliza fórmulas de planilhas. */
export function csvConferencia(cadastros: Cadastro[], avisos: string[] = []): string {
    const cell = (x: string) => `"${(/^[\s]*[=+@-]/.test(x) ? "'" + x : x).replace(/"/g, '""')}"`;
    const campos = Object.keys(CAMPOS) as Campo[];
    const linhas = [['Empregador (raiz CNPJ)', 'CPF', 'Matrícula eSocial', ...campos.map(k => CAMPOS[k]), 'Pendências', 'Avisos gerais', 'Origem dos campos']];
    for (const c of cadastros) linhas.push([c.empregador, c.cpf, c.matricula, ...campos.map(k => c.dados[k] || ''), c.pendencias.join(' | '), avisos.join(' | '), campos.filter(k => c.origens[k]).map(k => `${CAMPOS[k]}: ${c.origens[k]}`).join(' | ')]);
    return '\uFEFF' + linhas.map(l => l.map(cell).join(';')).join('\r\n');
}

/** Contrato de revisão cadastral, explicitamente separado de um layout homologado IOB. */
export function pacoteCadastral(dossie: Dossie, cadastros: Cadastro[], avisos: string[]): string {
    return JSON.stringify({
        formato: 'consultor-dp-cadastro-conferencia', versao: 1, importavelIob: false,
        modo: 'implantacao-cadastral', cnpj: dossie.cnpj, dataImplantacao: dossie.corte,
        avisos, fontes: [...dossie.fontes.map(({ nome, hash }) => ({ nome, hash })), ...dossie.documentos],
        funcionarios: cadastros.map(c => ({ empregador: c.empregador, cpf: c.cpf, matriculaEsocial: c.matricula,
            dados: c.dados, origens: c.origens, pendencias: c.pendencias, desligado: c.desligado })),
    }, null, 2);
}
