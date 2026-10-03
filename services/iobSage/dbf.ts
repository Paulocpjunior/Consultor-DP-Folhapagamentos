// services/iobSage/dbf.ts
//
// Leitor de tabelas DBF (dBASE III/IV e FoxPro/Visual FoxPro) no navegador.
// A linha Office da IOB (ex-Folhamatic) nasceu em DBF; no modo SQL, o
// "Backup SQL" vem em duas partes: um .zip com o cadastro das empresas e um
// .backup com os dados da folha (Ajuda Aprendo³, artigo 4898). Este leitor
// abre os DBF de dentro do .zip.
//
// Formato: cabeçalho de 32 bytes (versão, nº de registros, tamanho do
// cabeçalho e do registro, code page no byte 29), descritores de campo de
// 32 bytes até o byte 0x0D, e registros de tamanho fixo começando com o byte
// de exclusão ('*' = apagado). Memo em arquivo à parte: .FPT (FoxPro) ou .DBT
// (dBASE). Testado com tabelas geradas pela biblioteca Python "dbf".

import type { AoLinha, FonteBytes, Valor } from './backupPostgres';

export type Codificacao = 'windows-1252' | 'cp850' | 'cp437' | 'iso-8859-1';

export interface CampoDbf { nome: string; tipo: string; tamanho: number; decimais: number; anulavel: boolean }

export interface InfoDbf {
    nome: string;
    versao: number;
    descricaoVersao: string;
    registros: number;
    atualizadoEm: string | null;
    codificacao: Codificacao;
    /** true quando o cabeçalho não diz a code page e ela foi deduzida pelo conteúdo. */
    codificacaoDeduzida: boolean;
    campos: CampoDbf[];
    temMemo: boolean;
    memoAusente: boolean;
    avisos: string[];
}

export interface TabelaDbf extends InfoDbf {
    /** Lê os registros não apagados. Devolva false em aoLinha para parar. */
    ler(aoLinha: AoLinha): Promise<number>;
}

const VERSOES: Record<number, string> = {
    0x02: 'FoxBASE', 0x03: 'dBASE III / FoxPro sem memo', 0x04: 'dBASE IV', 0x05: 'dBASE V',
    0x30: 'Visual FoxPro', 0x31: 'Visual FoxPro (autoincremento)', 0x32: 'Visual FoxPro (varchar)',
    0x43: 'dBASE IV SQL', 0x63: 'dBASE IV SQL', 0x83: 'dBASE III com memo', 0x8b: 'dBASE IV com memo',
    0xcb: 'dBASE IV SQL com memo', 0xf5: 'FoxPro 2.x com memo', 0xfb: 'FoxBASE',
};
const VFP = new Set([0x30, 0x31, 0x32]);

// Byte 29 (language driver) → code page. Só as que aparecem em sistemas brasileiros.
const CODE_PAGE: Record<number, Codificacao> = {
    0x01: 'cp437', 0x02: 'cp850', 0x03: 'windows-1252', 0x57: 'windows-1252', 0x58: 'windows-1252', 0x59: 'windows-1252',
    0x37: 'cp850', 0x1b: 'cp437', 0x0b: 'cp437', 0x0d: 'cp437',
};

// Metade alta das code pages DOS (0x80–0xFF), gerada do codec do Python.
const ALTA: Record<'cp850' | 'cp437', string> = {
    cp850: 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ',
    cp437: 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
};

export function decodificar(bytes: Uint8Array, cod: Codificacao): string {
    if (cod === 'cp850' || cod === 'cp437') {
        const alta = ALTA[cod];
        let s = '';
        for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : alta[b - 0x80];
        return s;
    }
    return new TextDecoder(cod).decode(bytes);
}

const ACENTOS_PT = /[áéíóúâêôãõçàÁÉÍÓÚÂÊÔÃÕÇÀ]/g;

/** Sem code page no cabeçalho: escolhe a que produz mais letras do português. */
export function deduzirCodificacao(amostra: Uint8Array): Codificacao {
    if (!amostra.some(b => b >= 0x80)) return 'windows-1252';
    const pontos = (c: Codificacao) => (decodificar(amostra, c).match(ACENTOS_PT) ?? []).length;
    const dos = pontos('cp850'), win = pontos('windows-1252');
    return dos > win ? 'cp850' : 'windows-1252';
}

const asciiTrim = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return s.replace(/\0/g, '').trim(); };
const p2 = (n: number) => String(n).padStart(2, '0');

/** Dia juliano (VFP) → AAAA-MM-DD. 2440588 = 1970-01-01. */
function dataJuliana(jd: number): string {
    const d = new Date((jd - 2440588) * 86400000);
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

interface Memo { fonte: FonteBytes; tipo: 'fpt' | 'dbt'; bloco: number }

async function abrirMemo(fonte: FonteBytes, tipo: 'fpt' | 'dbt'): Promise<Memo> {
    const h = await fonte.ler(0, 32);
    if (tipo === 'fpt') return { fonte, tipo, bloco: ((h[6] << 8) | h[7]) || 64 };
    // dBASE IV grava o tamanho do bloco nos bytes 20–21; dBASE III usa 512.
    const b4 = h[20] | (h[21] << 8);
    return { fonte, tipo, bloco: b4 >= 64 && b4 <= 32768 ? b4 : 512 };
}

async function lerMemo(m: Memo, bloco: number, cod: Codificacao): Promise<string | null> {
    if (bloco <= 0) return null;
    const ini = bloco * m.bloco;
    if (ini >= m.fonte.tamanho) return null;
    if (m.tipo === 'fpt') {
        const h = await m.fonte.ler(ini, ini + 8);
        const tam = ((h[4] << 24) >>> 0) + (h[5] << 16) + (h[6] << 8) + h[7];
        return decodificar(await m.fonte.ler(ini + 8, ini + 8 + tam), cod);
    }
    const h = await m.fonte.ler(ini, ini + 8);
    if (h[0] === 0xff && h[1] === 0xff && h[2] === 0x08 && h[3] === 0x00) {
        const tam = h[4] | (h[5] << 8) | (h[6] << 16) | (h[7] << 24);
        return decodificar(await m.fonte.ler(ini + 8, ini + tam), cod);
    }
    // dBASE III: texto até 0x1A, em blocos de 512.
    let s = '';
    for (let p = ini; p < m.fonte.tamanho; p += m.bloco) {
        const b = await m.fonte.ler(p, Math.min(m.fonte.tamanho, p + m.bloco));
        const fim = b.indexOf(0x1a);
        s += decodificar(fim >= 0 ? b.subarray(0, fim) : b, cod);
        if (fim >= 0) break;
    }
    return s;
}

export async function abrirDbf(fonte: FonteBytes, nome: string, memoFonte: FonteBytes | null = null, opcoes: { codificacao?: Codificacao } = {}): Promise<TabelaDbf> {
    if (fonte.tamanho < 33) throw new Error(`${nome}: arquivo pequeno demais para ser um DBF.`);
    const h = await fonte.ler(0, 32);
    const dv = new DataView(h.buffer, h.byteOffset, 32);
    const versao = h[0];
    const registros = dv.getUint32(4, true);
    const tamCab = dv.getUint16(8, true);
    const tamReg = dv.getUint16(10, true);
    if (!VERSOES[versao] || tamCab < 33 || tamReg < 1 || tamCab > fonte.tamanho) throw new Error(`${nome}: não parece um DBF (versão 0x${versao.toString(16)}).`);
    const avisos: string[] = [];
    const esperado = tamCab + registros * tamReg;
    if (fonte.tamanho < esperado) avisos.push(`${nome}: arquivo menor que o esperado; os últimos registros podem estar faltando.`);

    const desc = await fonte.ler(32, tamCab);
    const campos: (CampoDbf & { ofs: number; flags: number })[] = [];
    let ofs = 1;
    for (let p = 0; p + 32 <= desc.length && desc[p] !== 0x0d; p += 32) {
        const nomeCampo = asciiTrim(desc.subarray(p, p + 11));
        const tipo = String.fromCharCode(desc[p + 11]);
        const tamanho = desc[p + 16], decimais = desc[p + 17], flags = desc[p + 18];
        campos.push({ nome: nomeCampo, tipo, tamanho, decimais, anulavel: (flags & 0x02) !== 0, ofs, flags });
        ofs += tamanho;
    }
    const vfp = VFP.has(versao);
    const campoNulos = campos.find(c => c.tipo === '0');
    // Bits do _NullFlags: um por campo anulável e um por varchar, na ordem dos campos.
    const bitNulo = new Map<string, number>(), bitTam = new Map<string, number>();
    let bit = 0;
    for (const c of campos) {
        if (c.tipo === '0') continue;
        if (c.tipo === 'V' || c.tipo === 'Q') bitTam.set(c.nome, bit++);
        if (c.anulavel) bitNulo.set(c.nome, bit++);
    }
    const visiveis = campos.filter(c => c.tipo !== '0');
    const temMemo = visiveis.some(c => 'MGP'.includes(c.tipo) || (!vfp && c.tipo === 'B'));

    let codificacao: Codificacao, codificacaoDeduzida = false;
    if (opcoes.codificacao) codificacao = opcoes.codificacao;
    else if (CODE_PAGE[h[29]]) codificacao = CODE_PAGE[h[29]];
    else {
        // Amostra: os campos de texto dos primeiros registros.
        const amostra = await fonte.ler(tamCab, Math.min(fonte.tamanho, tamCab + tamReg * 200));
        const partes: number[] = [];
        for (let r = 0; r + tamReg <= amostra.length; r += tamReg) for (const c of visiveis) if (c.tipo === 'C') for (let i = 0; i < c.tamanho; i++) partes.push(amostra[r + c.ofs + i]);
        codificacao = deduzirCodificacao(new Uint8Array(partes));
        codificacaoDeduzida = true;
    }

    const memo = memoFonte ? await abrirMemo(memoFonte, vfp || versao === 0xf5 ? 'fpt' : 'dbt') : null;
    const memoAusente = temMemo && !memo;
    if (memoAusente) avisos.push(`${nome}: tem campos memo, mas o arquivo .FPT/.DBT não veio junto; esses campos ficam vazios.`);
    // Byte 1 = anos desde 1900 (2026 → 126).
    const atualizadoEm = h[2] && h[3] ? `${1900 + h[1]}-${p2(h[2])}-${p2(h[3])}` : null;

    async function valor(c: typeof visiveis[number], reg: Uint8Array, nulos: Uint8Array | null): Promise<Valor> {
        const nb = bitNulo.get(c.nome);
        if (nulos && nb !== undefined && (nulos[nb >> 3] >> (nb & 7)) & 1) return null;
        const b = reg.subarray(c.ofs, c.ofs + c.tamanho);
        const dvb = new DataView(b.buffer, b.byteOffset, b.byteLength);
        switch (c.tipo) {
            case 'C': return decodificar(b, codificacao).replace(/[\s\0]+$/, '');
            case 'V': {
                const tb = bitTam.get(c.nome);
                const curto = nulos && tb !== undefined && (nulos[tb >> 3] >> (tb & 7)) & 1;
                return decodificar(curto ? b.subarray(0, b[b.length - 1]) : b, codificacao).replace(/\0+$/, '');
            }
            case 'N': case 'F': { const s = asciiTrim(b); return !s || /^\*+$/.test(s) ? null : s; }
            case 'D': { const s = asciiTrim(b); return /^\d{8}$/.test(s) && s !== '00000000' ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null; }
            case 'L': { const s = asciiTrim(b).toUpperCase(); return 'TY'.includes(s) && s ? 'true' : 'FN'.includes(s) && s ? 'false' : null; }
            case 'I': return String(dvb.getInt32(0, true));
            case 'Y': { const v = dvb.getBigInt64(0, true); const neg = v < 0n; const a = neg ? -v : v; return `${neg ? '-' : ''}${a / 10000n}.${String(a % 10000n).padStart(4, '0')}`; }
            case 'T': {
                const jd = dvb.getInt32(0, true), ms = dvb.getInt32(4, true);
                if (!jd) return null;
                const seg = Math.round(ms / 1000);
                return `${dataJuliana(jd)} ${p2(Math.floor(seg / 3600))}:${p2(Math.floor(seg / 60) % 60)}:${p2(seg % 60)}`;
            }
            case 'B':
                if (vfp) return String(dvb.getFloat64(0, true));
                // dBASE: B é memo binário.
                // falls through
            case 'M': case 'G': case 'P': {
                if (!memo) return null;
                const bloco = c.tamanho === 4 ? dvb.getInt32(0, true) : parseInt(asciiTrim(b) || '0', 10);
                return lerMemo(memo, bloco, codificacao);
            }
            case 'Q': case 'W': return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
            default: return asciiTrim(b) || null;
        }
    }

    async function ler(aoLinha: AoLinha): Promise<number> {
        const porBloco = Math.max(1, Math.floor((1 << 20) / tamReg));
        let n = 0;
        for (let r = 0; r < registros; r += porBloco) {
            const ini = tamCab + r * tamReg;
            const fim = Math.min(fonte.tamanho, tamCab + Math.min(registros, r + porBloco) * tamReg);
            if (ini >= fim) break;
            const bloco = await fonte.ler(ini, fim);
            for (let p = 0; p + tamReg <= bloco.length; p += tamReg) {
                const reg = bloco.subarray(p, p + tamReg);
                if (reg[0] === 0x2a) continue;            // '*' = apagado
                if (reg[0] === 0x1a) return n;            // fim de arquivo
                const nulos = campoNulos ? reg.subarray(campoNulos.ofs, campoNulos.ofs + campoNulos.tamanho) : null;
                const linha: Valor[] = [];
                for (const c of visiveis) linha.push(await valor(c, reg, nulos));
                n++;
                if (aoLinha(linha) === false) return n;
            }
        }
        return n;
    }

    return {
        nome, versao, descricaoVersao: VERSOES[versao], registros, atualizadoEm, codificacao, codificacaoDeduzida,
        campos: visiveis.map(({ nome: n2, tipo, tamanho, decimais, anulavel }) => ({ nome: n2, tipo, tamanho, decimais, anulavel })),
        temMemo, memoAusente, avisos, ler,
    };
}
