// services/bancario/cnab240.ts
//
// Arquivo bancário de pagamento de salários: remessa CNAB 240 no padrão
// FEBRABAN (Pagamentos, serviço 30 = salários), como o "Arquivo Bancário" da
// SAGE (Paulo, 07/10/2026). Um lote por forma de crédito:
//   01 crédito em conta (corrente/salário) no banco da empresa;
//   05 crédito em poupança no banco da empresa;
//   41 TED para conta em outro banco;
//   45 PIX (pela chave da ficha).
// Segmento A + B por funcionário (B com CPF e endereço; no PIX, a chave).
//
// Fontes: layout padrão FEBRABAN 240 (v10.11) e o manual CNAB 240 Pagamentos
// do Banco Inter (v1.9, 04/2024), que segue o padrão. Os manuais da FEBRABAN e
// dos bancos não abriram daqui; os códigos que variam entre os bancos ficam em
// PERFIS_BANCO (versões, finalidade da TED, forma de iniciação do PIX) e são
// conferidos posição a posição com o arquivo gerado pela SAGE antes de usar.
// O Itaú usa o SISPAG, com posições próprias: o crédito em conta Itaú foi
// conferido byte a byte com o arquivo da SAGE (ITAU_10.TXT, 10/2026).

import type { Data } from '../prazos/calendario';
import { cnpjValido, cpfValido } from '../cadastros/documentos';

export type FormaCredito = 'conta' | 'poupanca' | 'ted' | 'pix';
export const FORMA_LANCAMENTO: Record<FormaCredito, string> = { conta: '01', poupanca: '05', ted: '41', pix: '45' };
export const ROTULO_FORMA: Record<FormaCredito, string> = { conta: 'Crédito em conta (mesmo banco)', poupanca: 'Crédito em poupança (mesmo banco)', ted: 'TED (outro banco)', pix: 'PIX' };
const CAMARA: Record<FormaCredito, string> = { conta: '000', poupanca: '000', ted: '018', pix: '009' };

export interface PerfilBanco {
    codigo: string; nome: string;
    /** 'febraban' = padrão 240; 'sispag' = Itaú SISPAG (posições próprias). */
    layout: 'febraban' | 'sispag';
    /** Código da moeda no Segmento A ("BRL" no padrão; "REA" no Itaú). */
    moeda: string;
    /** Formas já conferidas com o arquivo gerado pela SAGE. */
    formasConferidas: FormaCredito[];
    versaoArquivo: string; versaoLote: string; densidade: string;
    /** Código finalidade da TED (Segmento A, 220-224) para salários. */
    finalidadeTedSalario: string;
    observacao: string;
}

export const PERFIS_BANCO: Record<string, PerfilBanco> = {
    '001': { codigo: '001', nome: 'BANCO DO BRASIL S.A.', layout: 'febraban', moeda: 'BRL', formasConferidas: [], versaoArquivo: '107', versaoLote: '046', densidade: '01600', finalidadeTedSalario: '00004',
        observacao: 'Convênio do BB (9 dígitos) + "0126" + reservado: informe os 20 caracteres como o banco passou.' },
    '033': { codigo: '033', nome: 'BANCO SANTANDER', layout: 'febraban', moeda: 'BRL', formasConferidas: [], versaoArquivo: '107', versaoLote: '046', densidade: '01600', finalidadeTedSalario: '00004',
        observacao: 'Código do convênio de pagamentos do Santander nas posições 33-52.' },
    '237': { codigo: '237', nome: 'BANCO BRADESCO', layout: 'febraban', moeda: 'BRL', formasConferidas: [], versaoArquivo: '107', versaoLote: '046', densidade: '01600', finalidadeTedSalario: '00004',
        observacao: 'Código do convênio Multipag nas posições 33-52.' },
    // SISPAG conferido posição a posição com o arquivo da SAGE (ITAU_10.TXT, crédito em conta Itaú, 10/2026).
    '341': { codigo: '341', nome: 'BANCO ITAU', layout: 'sispag', moeda: 'REA', formasConferidas: ['conta'], versaoArquivo: '080', versaoLote: '040', densidade: '00000', finalidadeTedSalario: '00004',
        observacao: 'Itaú SISPAG: crédito em conta Itaú conferido com o arquivo da SAGE; poupança, TED e PIX ainda sem arquivo modelo. O convênio não vai no arquivo.' },
};
export const BANCOS_SUPORTADOS = Object.keys(PERFIS_BANCO);

/** Aviso das formas do arquivo que ainda não foram conferidas com o arquivo da SAGE. */
export function avisoConferencia(p: PerfilBanco, formas: FormaCredito[]): string {
    if (!p.formasConferidas.length) return `O layout do ${p.nome} ainda não foi conferido com o arquivo da SAGE.`;
    return `No ${p.nome}, ${formas.map(f => ROTULO_FORMA[f]).join(', ')} ainda não ${formas.length > 1 ? 'foram conferidos' : 'foi conferido'} com o arquivo da SAGE.`;
}

/** Conta da empresa para débito dos pagamentos (cadastrada no "Arquivo Bancário"). */
export interface ContaPagamento {
    id: string;
    banco: string; agencia: string; agenciaDv: string; conta: string; contaDv: string;
    /** Código do convênio no banco (posições 33-52 do header). */
    convenio: string;
    /** Próximo número sequencial do arquivo (NSA). */
    proximoNsa: number;
    logradouro?: string; numero?: string; complemento?: string; cidade?: string; cep?: string; uf?: string;
}
export const contaPagamentoVazia = (): ContaPagamento => ({ id: '', banco: '', agencia: '', agenciaDv: '', conta: '', contaDv: '', convenio: '', proximoNsa: 1 });

export interface Favorecido {
    ref: string; nome: string; cpf: string;
    banco: string; agencia: string; conta: string; tipoConta: string; pix: string;
    valor: number; // centavos
    dataPagamento: Data;
    logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; cep?: string; uf?: string;
}

// ─── campos ─────────────────────────────────────────────────────────────────

/** Alfanumérico: maiúsculas, sem acento nem caractere especial, alinhado à esquerda com brancos. */
export function alfa(v: string | undefined, n: number): string {
    const t = (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 .,\-/@_]/g, ' ').replace(/\s+/g, ' ').trim();
    return t.slice(0, n).padEnd(n, ' ');
}
/** Numérico: só dígitos, alinhado à direita com zeros. Maior que o campo é erro. */
export function num(v: string | number | undefined, n: number, campo = 'campo'): string {
    const d = String(v ?? '').replace(/\D/g, '');
    if (d.length > n) throw new Error(`${campo}: ${d} não cabe em ${n} posições.`);
    return d.padStart(n, '0');
}
const brancos = (n: number) => ' '.repeat(n);
const dataCnab = (d: Data) => `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}`;

/** "1234-5" → { numero: "1234", dv: "5" }; sem hífen, sem dígito. */
export function separarDv(v: string): { numero: string; dv: string } {
    const m = (v ?? '').trim().toUpperCase().match(/^([\d.\s]+)\s*-\s*([0-9X])$/);
    return m ? { numero: m[1].replace(/\D/g, ''), dv: m[2] } : { numero: (v ?? '').replace(/\D/g, ''), dv: '' };
}
const codBanco = (v: string) => (v ?? '').replace(/\D/g, '').slice(0, 3).padStart(3, '0');

export type TipoChavePix = 'telefone' | 'email' | 'cpf' | 'aleatoria';
const INICIACAO: Record<TipoChavePix, string> = { telefone: '01', email: '02', cpf: '03', aleatoria: '04' };
// DDDs do Brasil (Anatel): telefone sem +55 só é reconhecido com um DDD que existe.
const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
/** Telefone com DDD (10 dígitos, fixo; 11, celular com 9). */
const pareceTelefone = (d: string) => DDDS.has(d.slice(0, 2)) && (d.length === 10 || (d.length === 11 && d[2] === '9'));

/**
 * Tipo da chave PIX. CPF/CNPJ só com o dígito verificador certo; telefone com
 * +55, com máscara de telefone ou, só com dígitos, quando não é um CPF válido.
 * Onze dígitos que são CPF válido e também parecem celular ficam sem tipo
 * (ambíguos): o PIX iria para o CPF de outra pessoa (auditoria de 08/10/2026).
 */
export function tipoChavePix(chave: string): TipoChavePix | null {
    const c = (chave ?? '').trim();
    if (!c) return null;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) return 'email';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return 'aleatoria';
    const d = c.replace(/\D/g, '');
    if (/^\+/.test(c) || (d.length >= 12 && d.length <= 13 && d.startsWith('55') && pareceTelefone(d.slice(2)))) return 'telefone';
    // Máscara de telefone: (11) 98765-4321, 11 98765-4321.
    if (/^\(?\d{2}\)?\s+\d{4,5}-?\d{4}$/.test(c) && pareceTelefone(d)) return 'telefone';
    if (d.length === 14) return cnpjValido(d) ? 'cpf' : null;
    // CPF com a máscara (000.000.000-00) é CPF, mesmo que os dígitos pareçam um celular.
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(c)) return cpfValido(d) ? 'cpf' : null;
    if (d.length === 11) {
        const cpf = cpfValido(d); const tel = pareceTelefone(d);
        if (cpf && !tel) return 'cpf';
        if (tel && !cpf) return 'telefone';
        return null;
    }
    if (d.length === 10 && pareceTelefone(d)) return 'telefone';
    return null;
}

/** Por que a chave não foi reconhecida (para o motivo de quem fica fora do arquivo). */
function motivoChavePix(chave: string): string {
    const d = chave.replace(/\D/g, '');
    if (d.length === 11 && cpfValido(d) && pareceTelefone(d)) return `chave PIX "${chave}" pode ser CPF ou celular: informe o celular com +55 (ex.: +55${d}) ou o CPF com pontos`;
    if ((d.length === 11 || d.length === 14) && !/^\+/.test(chave.trim())) return `chave PIX "${chave}" não é CPF/CNPJ válido nem telefone com DDD: confira na ficha`;
    return `chave PIX "${chave}" não reconhecida (telefone com +55, e-mail, CPF/CNPJ ou aleatória)`;
}

// ─── classificação ──────────────────────────────────────────────────────────

export interface Classificacao { forma: FormaCredito | null; motivo: string }

/** Forma de crédito do funcionário a partir da ficha e da conta da empresa. */
export function classificar(f: Favorecido, empresa: Pick<ContaPagamento, 'banco'>, preferirPix: boolean): Classificacao {
    if (!(f.valor > 0)) return { forma: null, motivo: 'sem líquido a pagar' };
    const temPix = !!tipoChavePix(f.pix);
    if (preferirPix && temPix) return { forma: 'pix', motivo: '' };
    const banco = codBanco(f.banco);
    const ag = separarDv(f.agencia); const ct = separarDv(f.conta);
    const contaOk = banco !== '000' && !!ag.numero && !!ct.numero && !!ct.dv;
    if (contaOk) {
        if (banco === codBanco(empresa.banco)) return { forma: f.tipoConta === 'poupanca' ? 'poupanca' : 'conta', motivo: '' };
        return { forma: 'ted', motivo: '' };
    }
    if (temPix) return { forma: 'pix', motivo: '' };
    if (f.pix) return { forma: null, motivo: motivoChavePix(f.pix) };
    if (banco !== '000' && ct.numero && !ct.dv) return { forma: null, motivo: 'conta sem dígito na ficha (informe como 12345-6)' };
    return { forma: null, motivo: 'sem banco/agência/conta nem chave PIX na ficha' };
}

// ─── registros ──────────────────────────────────────────────────────────────

interface Ctx { perfil: PerfilBanco; conta: ContaPagamento; cnpj: string; razaoSocial: string }

function contaEmpresa(c: ContaPagamento): string {
    const ag = separarDv(c.agencia); const ct = separarDv(c.conta);
    return num(ag.numero, 5, 'Agência da empresa') + alfa(c.agenciaDv || ag.dv, 1) + num(ct.numero, 12, 'Conta da empresa') + alfa(c.contaDv || ct.dv, 1) + brancos(1);
}

function headerArquivo(x: Ctx, nsa: number, agora: Date): string {
    const hh = agora.toTimeString().slice(0, 8).replace(/:/g, '');
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    return x.perfil.codigo + '0000' + '0' + brancos(9) + '2' + num(x.cnpj, 14, 'CNPJ') + alfa(x.conta.convenio, 20) + contaEmpresa(x.conta)
        + alfa(x.razaoSocial, 30) + alfa(x.perfil.nome, 30) + brancos(10) + '1' + dataCnab(hoje) + hh + num(nsa, 6, 'NSA')
        + x.perfil.versaoArquivo + x.perfil.densidade + brancos(20) + brancos(20) + brancos(29);
}

function headerLote(x: Ctx, lote: number, forma: FormaCredito): string {
    const c = x.conta;
    const cep = (c.cep ?? '').replace(/\D/g, '');
    return x.perfil.codigo + num(lote, 4) + '1' + 'C' + '30' + FORMA_LANCAMENTO[forma] + x.perfil.versaoLote + brancos(1) + '2' + num(x.cnpj, 14, 'CNPJ')
        + alfa(c.convenio, 20) + contaEmpresa(c) + alfa(x.razaoSocial, 30) + alfa('PAGAMENTO DE SALARIOS', 40)
        + alfa(c.logradouro, 30) + num((c.numero ?? '').replace(/\D/g, '').slice(0, 5), 5) + alfa(c.complemento, 15) + alfa(c.cidade, 20)
        + num(cep.slice(0, 5), 5) + alfa(cep.slice(5, 8), 3) + alfa(c.uf, 2) + '01' + brancos(6) + brancos(10);
}

function segmentoA(x: Ctx, lote: number, seq: number, f: Favorecido, forma: FormaCredito, iniciacaoPix: string): string {
    const pixSemConta = forma === 'pix' && iniciacaoPix !== '05';
    const ag = separarDv(f.agencia); const ct = separarDv(f.conta);
    const favConta = pixSemConta ? '0'.repeat(3) + '0'.repeat(5) + brancos(1) + '0'.repeat(12) + brancos(1) + brancos(1)
        : num(codBanco(f.banco), 3) + num(ag.numero, 5, `Agência de ${f.nome}`) + alfa(ag.dv, 1) + num(ct.numero, 12, `Conta de ${f.nome}`) + alfa(ct.dv, 1) + brancos(1);
    const ted = forma === 'ted';
    return x.perfil.codigo + num(lote, 4) + '3' + num(seq, 5) + 'A' + '0' + '00' + CAMARA[forma] + favConta + alfa(f.nome, 30)
        + alfa(f.ref, 20) + dataCnab(f.dataPagamento) + x.perfil.moeda + '0'.repeat(15) + num(f.valor, 15, `Valor de ${f.nome}`)
        + brancos(20) + '0'.repeat(8) + '0'.repeat(15) + brancos(40) + brancos(2)
        + (ted ? alfa(x.perfil.finalidadeTedSalario, 5) : brancos(5)) + (ted ? (f.tipoConta === 'poupanca' ? 'PP' : 'CC') : brancos(2))
        + brancos(3) + '0' + brancos(10);
}

function segmentoB(x: Ctx, lote: number, seq: number, f: Favorecido, forma: FormaCredito): string {
    const cpf = num(f.cpf, 14, `CPF de ${f.nome}`);
    if (forma === 'pix') {
        const tipo = tipoChavePix(f.pix)!;
        const dig = f.pix.replace(/\D/g, '');
        const chave = tipo === 'cpf' ? '' : tipo === 'telefone' ? `+${dig.length <= 11 ? `55${dig}` : dig}` : f.pix.trim();
        const doc = tipo === 'cpf' ? num(f.pix, 14) : cpf;
        return x.perfil.codigo + num(lote, 4) + '3' + num(seq, 5) + 'B' + alfa(INICIACAO[tipo], 3) + (doc.replace(/^0+/, '').length > 11 ? '2' : '1') + doc
            + brancos(35) + brancos(60) + chave.slice(0, 99).padEnd(99, ' ') + '0'.repeat(6) + '0'.repeat(8);
    }
    const cep = (f.cep ?? '').replace(/\D/g, '');
    return x.perfil.codigo + num(lote, 4) + '3' + num(seq, 5) + 'B' + brancos(3) + '1' + cpf
        + alfa(f.logradouro, 30) + num((f.numero ?? '').replace(/\D/g, '').slice(0, 5), 5) + alfa(f.complemento, 15) + alfa(f.bairro, 15) + alfa(f.cidade, 20)
        + num(cep.slice(0, 5), 5) + alfa(cep.slice(5, 8), 3) + alfa(f.uf, 2)
        + dataCnab(f.dataPagamento) + num(f.valor, 15) + '0'.repeat(15) + '0'.repeat(15) + '0'.repeat(15) + '0'.repeat(15)
        + alfa(f.cpf.replace(/\D/g, ''), 15) + '0' + '0'.repeat(6) + '0'.repeat(8);
}

const trailerLote = (x: Ctx, lote: number, registros: number, soma: number) =>
    x.perfil.codigo + num(lote, 4) + '5' + brancos(9) + num(registros, 6) + num(soma, 18) + '0'.repeat(18) + '0'.repeat(6) + brancos(165) + brancos(10);
const trailerArquivo = (x: Ctx, lotes: number, registros: number) =>
    x.perfil.codigo + '9999' + '9' + brancos(9) + num(lotes, 6) + num(registros, 6) + '0'.repeat(6) + brancos(205);

// ─── Itaú SISPAG ────────────────────────────────────────────────────────────
// Posições conferidas com o arquivo da SAGE: agência (5) + branco + conta (12)
// + branco + DAC; sem convênio nem NSA no header; moeda "REA"; CPF no
// Segmento A (204-217); sem Segmento B no crédito em conta.

function agContaSispag(agencia: string, conta: string, dv: string, quem: string): string {
    return num(separarDv(agencia).numero, 5, `Agência de ${quem}`) + brancos(1) + num(separarDv(conta).numero, 12, `Conta de ${quem}`) + brancos(1) + alfa(dv, 1);
}
const agContaEmpresaSispag = (c: ContaPagamento) => agContaSispag(c.agencia, c.conta, c.contaDv || separarDv(c.conta).dv, 'empresa');

function headerArquivoSispag(x: Ctx, agora: Date): string {
    const hh = agora.toTimeString().slice(0, 8).replace(/:/g, '');
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    return '341' + '0000' + '0' + brancos(6) + x.perfil.versaoArquivo + '2' + num(x.cnpj, 14, 'CNPJ') + brancos(20) + agContaEmpresaSispag(x.conta)
        + alfa(x.razaoSocial, 30) + alfa(x.perfil.nome, 30) + brancos(10) + '1' + dataCnab(hoje) + hh + '0'.repeat(9) + x.perfil.densidade + brancos(69);
}

function headerLoteSispag(x: Ctx, lote: number, forma: FormaCredito): string {
    const c = x.conta;
    return '341' + num(lote, 4) + '1' + 'C' + '30' + FORMA_LANCAMENTO[forma] + x.perfil.versaoLote + brancos(1) + '2' + num(x.cnpj, 14, 'CNPJ') + brancos(20)
        + agContaEmpresaSispag(c) + alfa(x.razaoSocial, 30) + alfa('01', 30) + brancos(10)
        + alfa(c.logradouro, 30) + num((c.numero ?? '').replace(/\D/g, '').slice(0, 5), 5) + alfa(c.complemento, 15) + alfa(c.cidade, 20)
        + num((c.cep ?? '').replace(/\D/g, '').slice(0, 8), 8) + alfa(c.uf, 2) + brancos(8) + brancos(10);
}

/** "Seu número" do Itaú: o código do funcionário com zeros à esquerda (como a SAGE). */
const seuNumeroSispag = (ref: string) => (/^\d+$/.test(ref.trim()) ? num(ref, 20) : alfa(ref, 20));

function segmentoASispag(x: Ctx, lote: number, seq: number, f: Favorecido, forma: FormaCredito): string {
    const pix = forma === 'pix';
    const favConta = pix ? '000' + '0'.repeat(5) + brancos(1) + '0'.repeat(12) + brancos(2)
        : num(codBanco(f.banco), 3) + agContaSispag(f.agencia, f.conta, separarDv(f.conta).dv, f.nome);
    const ted = forma === 'ted';
    return '341' + num(lote, 4) + '3' + num(seq, 5) + 'A' + '000' + CAMARA[forma] + favConta + alfa(f.nome, 30) + seuNumeroSispag(f.ref)
        + dataCnab(f.dataPagamento) + x.perfil.moeda + '0'.repeat(15) + num(f.valor, 15, `Valor de ${f.nome}`)
        + brancos(15) + brancos(5) + '0'.repeat(8) + '0'.repeat(15) + '0'.repeat(14) + brancos(4) + brancos(2) + '0'.repeat(6)
        + num(f.cpf, 14, `CPF de ${f.nome}`) + brancos(2) + (ted ? alfa(x.perfil.finalidadeTedSalario, 5) : brancos(5)) + brancos(5) + brancos(1) + brancos(10);
}

const trailerLoteSispag = (lote: number, registros: number, soma: number) =>
    '341' + num(lote, 4) + '5' + brancos(9) + num(registros, 6) + num(soma, 18) + '0'.repeat(18) + brancos(171) + brancos(10);
const trailerArquivoSispag = (lotes: number, registros: number) => '341' + '9999' + '9' + brancos(9) + num(lotes, 6) + num(registros, 6) + brancos(211);

// ─── remessa ────────────────────────────────────────────────────────────────

export interface ResultadoRemessa {
    conteudo: string;
    nomeArquivo: string;
    nsa: number;
    lotes: { forma: FormaCredito; quantidade: number; total: number }[];
    incluidos: { favorecido: Favorecido; forma: FormaCredito }[];
    excluidos: { favorecido: Favorecido; motivo: string }[];
    total: number;
    perfil: PerfilBanco;
    /** Formas do arquivo ainda não conferidas com o arquivo da SAGE (o arquivo é prévia). */
    naoConferidas: FormaCredito[];
}

/** Remessa CNAB 240 de salários. Linhas de 240 posições separadas por CRLF. */
export function gerarRemessa(p: { conta: ContaPagamento; cnpj: string; razaoSocial: string; favorecidos: Favorecido[]; preferirPix: boolean; agora?: Date }): ResultadoRemessa {
    const perfil = PERFIS_BANCO[codBanco(p.conta.banco)];
    if (!perfil) throw new Error(`Banco ${p.conta.banco || '(vazio)'} ainda sem layout no Consultor: ${BANCOS_SUPORTADOS.join(', ')}.`);
    const ct = separarDv(p.conta.conta); const ag = separarDv(p.conta.agencia);
    if (!ag.numero || !ct.numero || !(p.conta.contaDv || ct.dv)) throw new Error('Conta da empresa incompleta: agência, conta e dígito.');
    const x: Ctx = { perfil, conta: p.conta, cnpj: p.cnpj.replace(/\D/g, ''), razaoSocial: p.razaoSocial };
    const agora = p.agora ?? new Date();
    const nsa = Math.max(1, Math.floor(p.conta.proximoNsa || 1));

    const incluidos: ResultadoRemessa['incluidos'] = []; const excluidos: ResultadoRemessa['excluidos'] = [];
    for (const f of p.favorecidos) {
        const c = classificar(f, p.conta, p.preferirPix);
        if (!c.forma) { excluidos.push({ favorecido: f, motivo: c.motivo }); continue; }
        if (f.cpf.replace(/\D/g, '').length !== 11) { excluidos.push({ favorecido: f, motivo: 'CPF inválido na ficha' }); continue; }
        incluidos.push({ favorecido: f, forma: c.forma });
    }
    const sispag = perfil.layout === 'sispag';
    const linhas = [sispag ? headerArquivoSispag(x, agora) : headerArquivo(x, nsa, agora)];
    const lotes: ResultadoRemessa['lotes'] = [];
    let nLote = 0;
    for (const forma of ['conta', 'poupanca', 'ted', 'pix'] as FormaCredito[]) {
        const doLote = incluidos.filter(i => i.forma === forma);
        if (!doLote.length) continue;
        nLote++;
        const corpo: string[] = [];
        let seq = 0;
        for (const { favorecido: f } of doLote) {
            if (sispag) {
                // SISPAG: CPF no Segmento A; Segmento B só no PIX (a chave).
                corpo.push(segmentoASispag(x, nLote, ++seq, f, forma));
                if (forma === 'pix') corpo.push(segmentoB(x, nLote, ++seq, f, forma));
            } else corpo.push(segmentoA(x, nLote, ++seq, f, forma, '03'), segmentoB(x, nLote, ++seq, f, forma));
        }
        const soma = doLote.reduce((s, i) => s + i.favorecido.valor, 0);
        linhas.push(sispag ? headerLoteSispag(x, nLote, forma) : headerLote(x, nLote, forma), ...corpo,
            sispag ? trailerLoteSispag(nLote, corpo.length + 2, soma) : trailerLote(x, nLote, corpo.length + 2, soma));
        lotes.push({ forma, quantidade: doLote.length, total: soma });
    }
    linhas.push(sispag ? trailerArquivoSispag(nLote, linhas.length + 1) : trailerArquivo(x, nLote, linhas.length + 1));
    const ruim = linhas.findIndex(l => l.length !== 240);
    if (ruim >= 0) throw new Error(`Registro ${ruim + 1} com ${linhas[ruim].length} posições (esperado 240).`);
    // Nome 8.3 (o Itaú recusa outro: "8 caracteres para nome e 3 para extensão", Paulo, 08/10/2026):
    // PG + dia + mês + os 2 últimos dígitos do número do arquivo, que muda a cada remessa.
    const dd = String(agora.getDate()).padStart(2, '0'); const mm = String(agora.getMonth() + 1).padStart(2, '0');
    return {
        conteudo: linhas.join('\r\n') + '\r\n', nomeArquivo: `PG${dd}${mm}${String(nsa % 100).padStart(2, '0')}.REM`, nsa,
        lotes, incluidos, excluidos, total: lotes.reduce((s, l) => s + l.total, 0), perfil,
        naoConferidas: lotes.map(l => l.forma).filter(f => !perfil.formasConferidas.includes(f)),
    };
}
