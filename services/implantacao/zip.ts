// services/implantacao/zip.ts
// ZIP mínimo (método "stored", sem compressão) para agrupar XMLs no navegador
// sem dependência extra. Suficiente para a rotina de importação por XML da IOB,
// que aceita .xml ou .zip.

import { decodificar } from '../iobSage/dbf';

const TABELA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

export function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = TABELA[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDataHora(d: Date): { data: number; hora: number } {
    const ano = Math.max(1980, d.getFullYear());
    return {
        data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
        hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    };
}

export interface ArquivoZip { nome: string; conteudo: string | Uint8Array }

export function gerarZip(arquivos: ArquivoZip[], agora = new Date()): Uint8Array {
    const enc = new TextEncoder();
    const partes: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    const { data, hora } = dosDataHora(agora);
    const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    for (const a of arquivos) {
        const nome = enc.encode(a.nome.replace(/\\/g, '/'));
        const dados = typeof a.conteudo === 'string' ? enc.encode(a.conteudo) : a.conteudo;
        const crc = crc32(dados);
        // Bit 11 do flag: nomes em UTF-8.
        const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(hora), ...u16(data),
            ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nome.length), ...u16(0), ...nome]);
        partes.push(local, dados);
        central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(hora), ...u16(data),
            ...u32(crc), ...u32(dados.length), ...u32(dados.length), ...u16(nome.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
            ...u32(0), ...u32(offset), ...nome]));
        offset += local.length + dados.length;
    }
    const tamanhoCentral = central.reduce((n, c) => n + c.length, 0);
    const fim = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(arquivos.length), ...u16(arquivos.length),
        ...u32(tamanhoCentral), ...u32(offset), ...u16(0)]);
    const total = offset + tamanhoCentral + fim.length;
    const saida = new Uint8Array(total);
    let pos = 0;
    for (const p of [...partes, ...central, fim]) { saida.set(p, pos); pos += p.length; }
    return saida;
}

/** Download de bytes no navegador (TXT ANSI, ZIP, XLSX). */
export function baixarBytes(nome: string, bytes: Uint8Array | ArrayBuffer, mime = 'application/octet-stream'): void {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ArquivoLido { nome: string; bytes: Uint8Array }

/** Acesso aleatório a bytes (File/Blob por fatias, ou um buffer na memória). */
export interface FonteZip {
    tamanho: number;
    ler(inicio: number, fim: number): Promise<Uint8Array>;
}

const fonteDeUint8 = (u: Uint8Array): FonteZip => ({ tamanho: u.length, ler: async (i, f) => u.subarray(i, Math.min(f, u.length)) });

export interface EntradaZip {
    nome: string;
    /** 0 = stored; 8 = deflate. Outros métodos não são lidos. */
    metodo: number;
    criptografada: boolean;
    pasta: boolean;
    comprimido: number;
    /** Tamanho descomprimido. */
    tamanho: number;
    offLocal: number;
}

const LETRAS_PT = /[áéíóúâêôãõçàÁÉÍÓÚÂÊÔÃÕÇÀ]/g;

/**
 * Nome sem o bit 11 (UTF-8): página de código do DOS. A especificação diz
 * CP437, mas o Windows em português grava na CP850 (ã, õ, Á…, que a CP437
 * não tem): fica com a CP850 quando ela dá mais letras do português.
 */
function nomeDos(b: Uint8Array): string {
    const cp437 = decodificar(b, 'cp437');
    if (!b.some(x => x >= 0x80)) return cp437;
    const cp850 = decodificar(b, 'cp850');
    const letras = (t: string) => (t.match(LETRAS_PT) ?? []).length;
    return letras(cp850) > letras(cp437) ? cp850 : cp437;
}

const u64 = (v: DataView, p: number) => v.getUint32(p, true) + v.getUint32(p + 4, true) * 0x100000000;

/**
 * Lê só o índice (diretório central) do zip, pelo fim do arquivo: não carrega
 * o conteúdo, então serve para zips de qualquer tamanho (inclusive ZIP64).
 */
export async function indiceZip(fonte: FonteZip): Promise<EntradaZip[]> {
    const iniCauda = Math.max(0, fonte.tamanho - 22 - 0xffff);
    const cauda = await fonte.ler(iniCauda, fonte.tamanho);
    const vc = new DataView(cauda.buffer, cauda.byteOffset, cauda.byteLength);
    let fim = -1;
    for (let i = cauda.length - 22; i >= 0; i--) {
        if (vc.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw new Error('Arquivo ZIP inválido: diretório central não encontrado.');
    let total = vc.getUint16(fim + 10, true);
    let tamCentral = vc.getUint32(fim + 12, true);
    let offCentral = vc.getUint32(fim + 16, true);
    // ZIP64: o localizador fica logo antes do fim do diretório central.
    if (fim >= 20 && vc.getUint32(fim - 20, true) === 0x07064b50) {
        const off64 = u64(vc, fim - 20 + 8);
        const r = await fonte.ler(off64, off64 + 56);
        const v64 = new DataView(r.buffer, r.byteOffset, r.byteLength);
        if (r.length < 56 || v64.getUint32(0, true) !== 0x06064b50) throw new Error('Arquivo ZIP inválido: registro ZIP64 não encontrado.');
        total = u64(v64, 32); tamCentral = u64(v64, 40); offCentral = u64(v64, 48);
    }
    const central = await fonte.ler(offCentral, offCentral + tamCentral);
    const v = new DataView(central.buffer, central.byteOffset, central.byteLength);
    const utf8 = new TextDecoder('utf-8');
    const saida: EntradaZip[] = [];
    let p = 0;
    for (let n = 0; n < total; n++) {
        if (p + 46 > central.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('Arquivo ZIP inválido: entrada do diretório central corrompida.');
        const flag = v.getUint16(p + 8, true);
        const metodo = v.getUint16(p + 10, true);
        let comprimido = v.getUint32(p + 20, true);
        let tamanho = v.getUint32(p + 24, true);
        const lenNome = v.getUint16(p + 28, true), lenExtra = v.getUint16(p + 30, true), lenComent = v.getUint16(p + 32, true);
        let offLocal = v.getUint32(p + 42, true);
        const bytesNome = central.subarray(p + 46, p + 46 + lenNome);
        let nome = flag & 0x0800 ? utf8.decode(bytesNome) : nomeDos(bytesNome);
        // Campo extra ZIP64 (0x0001): traz, nesta ordem, só os valores que ficaram em 0xFFFFFFFF.
        for (let x = p + 46 + lenNome; x + 4 <= p + 46 + lenNome + lenExtra;) {
            const id = v.getUint16(x, true), len = v.getUint16(x + 2, true);
            if (id === 0x0001) {
                let q = x + 4;
                if (tamanho === 0xffffffff) { tamanho = u64(v, q); q += 8; }
                if (comprimido === 0xffffffff) { comprimido = u64(v, q); q += 8; }
                if (offLocal === 0xffffffff) { offLocal = u64(v, q); }
            }
            // Caminho Unicode (0x7075, Info-ZIP): vale se o CRC bate com o nome do cabeçalho.
            if (id === 0x7075 && len > 5 && v.getUint8(x + 4) === 1 && v.getUint32(x + 5, true) === crc32(bytesNome)) {
                nome = utf8.decode(central.subarray(x + 9, x + 4 + len));
            }
            x += 4 + len;
        }
        p += 46 + lenNome + lenExtra + lenComent;
        saida.push({ nome, metodo, criptografada: (flag & 1) === 1, pasta: nome.endsWith('/'), comprimido, tamanho, offLocal });
    }
    return saida;
}

async function inicioDosDados(fonte: FonteZip, e: EntradaZip): Promise<number> {
    const h = await fonte.ler(e.offLocal, e.offLocal + 30);
    const v = new DataView(h.buffer, h.byteOffset, h.byteLength);
    if (h.length < 30 || v.getUint32(0, true) !== 0x04034b50) throw new Error(`${e.nome}: cabeçalho local do ZIP não encontrado.`);
    return e.offLocal + 30 + v.getUint16(26, true) + v.getUint16(28, true);
}

function verificarLegivel(e: EntradaZip) {
    if (e.criptografada) throw new Error(`${e.nome}: arquivo protegido por senha no ZIP.`);
    if (e.metodo !== 0 && e.metodo !== 8) throw new Error(`${e.nome}: método de compressão ${e.metodo} não suportado.`);
}

/** Conteúdo inteiro de uma entrada (para entradas pequenas). */
export async function lerEntrada(fonte: FonteZip, e: EntradaZip): Promise<Uint8Array> {
    verificarLegivel(e);
    const ini = await inicioDosDados(fonte, e);
    const dados = await fonte.ler(ini, ini + e.comprimido);
    return e.metodo === 0 ? dados.slice() : inflarRaw(dados);
}

const JANELA_ZIP = 1024 * 1024;

/** Fluxo descomprimido de uma entrada deflate, lendo o zip em janelas de 1 MB. */
function fluxoDeflate(fonte: FonteZip, ini: number, comprimido: number): ReadableStream<Uint8Array> {
    let p = 0;
    const origem = new ReadableStream<Uint8Array>({
        async pull(c) {
            if (p >= comprimido) { c.close(); return; }
            const fim = Math.min(comprimido, p + JANELA_ZIP);
            c.enqueue((await fonte.ler(ini + p, ini + fim)).slice());
            p = fim;
        },
    });
    return origem.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

function juntar(partes: Uint8Array[]): Uint8Array {
    if (partes.length === 1) return partes[0];
    const t = new Uint8Array(partes.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of partes) { t.set(x, o); o += x.length; }
    return t;
}

/**
 * Leitor por cursor de uma entrada deflate grande: guarda só a janela pedida.
 * Leitura para a frente continua o fluxo; para trás, recomeça do início.
 */
class CursorDeflate {
    private leitor: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private pos = 0;
    private buf: Uint8Array = new Uint8Array(0);
    constructor(private abrir: () => Promise<ReadableStream<Uint8Array>>) {}

    async ler(i: number, f: number): Promise<Uint8Array> {
        if (!this.leitor || i < this.pos) {
            this.leitor?.cancel().catch(() => undefined);
            this.leitor = (await this.abrir()).getReader();
            this.pos = 0; this.buf = new Uint8Array(0);
        }
        if (i > this.pos) { const corte = Math.min(i - this.pos, this.buf.length); this.buf = this.buf.subarray(corte); this.pos += corte; }
        const partes: Uint8Array[] = this.buf.length ? [this.buf] : [];
        let fim = this.pos + this.buf.length;
        while (fim < f) {
            const r = await this.leitor.read();
            if (r.done) break;
            let x: Uint8Array = r.value;
            if (fim + x.length <= i) { fim += x.length; this.pos = fim; continue; }
            if (fim < i) { x = x.subarray(i - fim); fim = i; this.pos = i; }
            partes.push(x); fim += x.length;
        }
        this.buf = partes.length ? juntar(partes) : new Uint8Array(0);
        return this.buf.subarray(i - this.pos, Math.min(f, fim) - this.pos);
    }
}

/** Entradas até este tamanho são descomprimidas inteiras e guardadas (memória total limitada). */
const INTEIRA_ATE = 32 * 1024 * 1024;
const MEMORIA_CACHE = 192 * 1024 * 1024;

/** Cache LRU das entradas pequenas já descomprimidas, compartilhado por um zip. */
export class CacheZip {
    private mapa = new Map<string, Promise<Uint8Array>>();
    private tamanhos = new Map<string, number>();
    private usado = 0;
    async obter(chave: string, tamanho: number, gerar: () => Promise<Uint8Array>): Promise<Uint8Array> {
        let pr = this.mapa.get(chave);
        if (pr) { this.mapa.delete(chave); this.mapa.set(chave, pr); return pr; }
        pr = gerar();
        this.mapa.set(chave, pr); this.tamanhos.set(chave, tamanho); this.usado += tamanho;
        for (const k of this.mapa.keys()) {
            if (this.usado <= MEMORIA_CACHE || k === chave) break;
            this.mapa.delete(k); this.usado -= this.tamanhos.get(k) ?? 0; this.tamanhos.delete(k);
        }
        pr.catch(() => { if (this.mapa.get(chave) === pr) { this.mapa.delete(chave); this.usado -= tamanho; this.tamanhos.delete(chave); } });
        return pr;
    }
}

/**
 * Uma entrada do zip como fonte de bytes, sem descomprimir o zip todo:
 * "stored" lê direto do zip por fatias; deflate pequeno é descomprimido
 * inteiro (com cache); deflate grande, por cursor.
 */
export function fonteDaEntrada(fonte: FonteZip, e: EntradaZip, cache = new CacheZip()): FonteZip {
    let ini: Promise<number> | null = null;
    const inicio = () => (ini ??= inicioDosDados(fonte, e));
    let cursor: CursorDeflate | null = null;
    let fila: Promise<unknown> = Promise.resolve();
    return {
        tamanho: e.tamanho,
        async ler(i, f) {
            verificarLegivel(e);
            f = Math.min(f, e.tamanho);
            if (f <= i) return new Uint8Array(0);
            if (e.metodo === 0) { const o = await inicio(); return fonte.ler(o + i, o + f); }
            if (e.tamanho <= INTEIRA_ATE) return (await cache.obter(`${e.offLocal}`, e.tamanho, () => lerEntrada(fonte, e))).subarray(i, f);
            // Um cursor por entrada: as leituras entram em fila, uma de cada vez.
            cursor ??= new CursorDeflate(async () => fluxoDeflate(fonte, await inicio(), e.comprimido));
            const c = cursor;
            const r = fila.then(() => c.ler(i, f));
            fila = r.catch(() => undefined);
            return r;
        },
    };
}

async function inflarRaw(dados: Uint8Array): Promise<Uint8Array> {
    // Response em vez de Blob.stream(): funciona no navegador e no ambiente de teste.
    const fluxo = new Response(dados as BodyInit).body!.pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/**
 * Lê um ZIP comum (métodos "stored" e "deflate"), como os que o portal do
 * eSocial e o Windows geram. Usa o diretório central, então funciona também
 * quando o tamanho vem só no descritor de dados. Entradas de pasta são ignoradas.
 */
export async function lerZip(zip: Uint8Array): Promise<ArquivoLido[]> {
    const fonte = fonteDeUint8(zip);
    const saida: ArquivoLido[] = [];
    for (const e of await indiceZip(fonte)) if (!e.pasta) saida.push({ nome: e.nome, bytes: await lerEntrada(fonte, e) });
    return saida;
}
