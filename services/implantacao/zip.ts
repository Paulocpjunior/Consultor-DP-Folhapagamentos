// services/implantacao/zip.ts
// ZIP mínimo (método "stored", sem compressão) para agrupar XMLs no navegador
// sem dependência extra. Suficiente para a rotina de importação por XML da IOB,
// que aceita .xml ou .zip.

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
    const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let fim = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
        if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw new Error('Arquivo ZIP inválido: diretório central não encontrado.');
    const total = v.getUint16(fim + 10, true);
    let p = v.getUint32(fim + 16, true);
    const dec = new TextDecoder('utf-8');
    const saida: ArquivoLido[] = [];
    for (let n = 0; n < total; n++) {
        if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Arquivo ZIP inválido: entrada do diretório central corrompida.');
        const metodo = v.getUint16(p + 10, true);
        const comprimido = v.getUint32(p + 20, true);
        const lenNome = v.getUint16(p + 28, true), lenExtra = v.getUint16(p + 30, true), lenComent = v.getUint16(p + 32, true);
        const offLocal = v.getUint32(p + 42, true);
        const nome = dec.decode(zip.subarray(p + 46, p + 46 + lenNome));
        p += 46 + lenNome + lenExtra + lenComent;
        if (nome.endsWith('/')) continue;
        const inicio = offLocal + 30 + v.getUint16(offLocal + 26, true) + v.getUint16(offLocal + 28, true);
        const dados = zip.subarray(inicio, inicio + comprimido);
        if (metodo === 0) saida.push({ nome, bytes: dados.slice() });
        else if (metodo === 8) saida.push({ nome, bytes: await inflarRaw(dados) });
        else throw new Error(`${nome}: método de compressão ${metodo} não suportado.`);
    }
    return saida;
}
