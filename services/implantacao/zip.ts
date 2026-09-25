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
