// services/iobSage/backupPostgres.ts
//
// Leitor de backups do PostgreSQL (pg_dump) que roda no NAVEGADOR: o arquivo
// do IOB SAGE (PostgreSQL 12) é lido do disco do usuário em pedaços e nunca é
// enviado a servidor nenhum. Dado de folha é dado pessoal (LGPD).
//
// Formatos suportados, os quatro que o pg_dump grava:
//   - custom  (-Fc, ".backup"): cabeçalho "PGDMP", TOC e blocos de dados
//     comprimidos com zlib. Versões de arquivo 1.12 a 1.15 (PostgreSQL 9.x a 16);
//     o PostgreSQL 12 grava a 1.14.
//   - tar     (-Ft): o mesmo TOC em "toc.dat" e um arquivo "NNNN.dat" por tabela.
//   - plain   (-Fp, ".sql"): texto com blocos "COPY ... FROM stdin;".
//   - plain compactado com gzip (".sql.gz").
//
// A estrutura do formato custom segue o pg_backup_archiver.c do PostgreSQL
// (ReadHead, ReadToc, ReadInt, ReadStr, ReadOffset) e o pg_backup_custom.c
// (_ReadExtraToc, _readBlockHeader). Os testes usam dumps reais gerados com
// pg_dump 12.3 e 16 sobre um servidor PostgreSQL 12.22.

export interface FonteBytes {
    tamanho: number;
    ler(inicio: number, fim: number): Promise<Uint8Array>;
}

export function fonteDeBlob(b: Blob): FonteBytes {
    return { tamanho: b.size, ler: async (i, f) => new Uint8Array(await b.slice(i, f).arrayBuffer()) };
}

export function fonteDeBytes(u: Uint8Array): FonteBytes {
    return { tamanho: u.length, ler: async (i, f) => u.subarray(i, Math.min(f, u.length)) };
}

export type FormatoBackup = 'custom' | 'tar' | 'plain' | 'plain-gzip';

export interface TabelaBackup {
    /** Identificador interno (dumpId no custom/tar, ordem no plain). */
    id: string;
    esquema: string;
    tabela: string;
    colunas: string[];
    /** Bytes ocupados no backup (comprimidos, no custom), quando dá para saber sem ler. */
    bytesNoBackup: number | null;
}

export interface ObjetoBackup { tipo: string; quantidade: number }

export interface InfoBackup {
    formato: FormatoBackup;
    nomeArquivo: string;
    tamanhoArquivo: number;
    versaoArquivo: string | null;
    versaoPostgresOrigem: string | null;
    versaoPgDump: string | null;
    banco: string | null;
    criadoEm: string | null;
    compressao: string;
    esquemas: string[];
    tabelas: TabelaBackup[];
    objetos: ObjetoBackup[];
    avisos: string[];
}

export type Valor = string | null;
/** Devolva false para parar a leitura (prévia). */
export type AoLinha = (valores: Valor[]) => boolean | void;

export interface Backup extends InfoBackup {
    lerTabela(t: TabelaBackup, aoLinha: AoLinha): Promise<number>;
}

// ─── leitor sequencial com janela ─────────────────────────────────────────

const JANELA = 1 << 20;

class Leitor {
    private buf = new Uint8Array(0);
    private ini = 0;      // posição no arquivo do buf[0]
    private p = 0;        // posição dentro de buf
    intSize = 4;
    offSize = 8;
    constructor(private fonte: FonteBytes, inicio = 0) { this.ini = inicio; }

    get posicao() { return this.ini + this.p; }
    get fim() { return this.posicao >= this.fonte.tamanho; }

    async garantir(n: number): Promise<void> {
        if (this.buf.length - this.p >= n) return;
        const resto = this.buf.subarray(this.p);
        const de = this.ini + this.buf.length;
        const ate = Math.min(this.fonte.tamanho, de + Math.max(JANELA, n - resto.length));
        const novo = ate > de ? await this.fonte.ler(de, ate) : new Uint8Array(0);
        const junto = new Uint8Array(resto.length + novo.length);
        junto.set(resto); junto.set(novo, resto.length);
        this.ini += this.p; this.p = 0; this.buf = junto;
        if (this.buf.length < n) throw new Error('Fim inesperado do arquivo: o backup parece incompleto ou corrompido.');
    }

    async byte(): Promise<number> { if (this.p >= this.buf.length) await this.garantir(1); return this.buf[this.p++]; }

    async bytes(n: number): Promise<Uint8Array> {
        if (this.buf.length - this.p < n) await this.garantir(n);
        const r = this.buf.subarray(this.p, this.p + n); this.p += n; return r;
    }

    async pular(n: number): Promise<void> {
        const disponivel = this.buf.length - this.p;
        if (n <= disponivel) { this.p += n; return; }
        // Pula sem ler o meio: reposiciona a janela.
        this.ini = this.posicao + n; this.p = 0; this.buf = new Uint8Array(0);
        if (this.ini > this.fonte.tamanho) throw new Error('Fim inesperado do arquivo: o backup parece incompleto ou corrompido.');
    }

    /** ReadInt: byte de sinal + intSize bytes little-endian. */
    async int(): Promise<number> {
        if (this.buf.length - this.p < this.intSize + 1) await this.garantir(this.intSize + 1);
        const sinal = this.buf[this.p++];
        let v = 0, mult = 1;
        for (let i = 0; i < this.intSize; i++) { v += this.buf[this.p++] * mult; mult *= 256; }
        return sinal ? -v : v;
    }

    /** ReadStr: int com o tamanho (-1 = nulo) + bytes. */
    async str(): Promise<string | null> {
        const n = await this.int();
        if (n < 0) return null;
        if (n === 0) return '';
        return DEC.decode(await this.bytes(n));
    }

    /** ReadOffset: byte de estado + offSize bytes little-endian. */
    async offset(): Promise<{ estado: number; pos: number }> {
        const estado = await this.byte();
        if (this.buf.length - this.p < this.offSize) await this.garantir(this.offSize);
        let v = 0, mult = 1;
        for (let i = 0; i < this.offSize; i++) { v += this.buf[this.p++] * mult; mult *= 256; }
        return { estado, pos: v };
    }
}

const DEC = new TextDecoder('utf-8');

// ─── COPY em formato texto ────────────────────────────────────────────────

/** Decodifica uma linha do COPY texto: campos separados por TAB, \N = nulo, escapes com barra. */
export function decodificarLinhaCopy(linha: string): Valor[] {
    const campos = linha.split('\t');
    return campos.map(c => {
        if (c === '\\N') return null;
        if (!c.includes('\\')) return c;
        let s = '';
        for (let i = 0; i < c.length; i++) {
            const ch = c[i];
            if (ch !== '\\' || i === c.length - 1) { s += ch; continue; }
            const n = c[++i];
            if (n === 'n') s += '\n';
            else if (n === 't') s += '\t';
            else if (n === 'r') s += '\r';
            else if (n === 'b') s += '\b';
            else if (n === 'f') s += '\f';
            else if (n === 'v') s += '\v';
            else if (n === 'x' && /[0-9a-fA-F]/.test(c[i + 1] ?? '')) {
                let h = c[++i];
                if (/[0-9a-fA-F]/.test(c[i + 1] ?? '')) h += c[++i];
                s += String.fromCharCode(parseInt(h, 16));
            } else if (/[0-7]/.test(n)) {
                let o = n;
                while (o.length < 3 && /[0-7]/.test(c[i + 1] ?? '')) o += c[++i];
                s += String.fromCharCode(parseInt(o, 8));
            } else s += n;
        }
        return s;
    });
}

/** Lê "COPY esquema.tabela (a, b) FROM stdin;" → esquema, tabela e colunas. */
export function lerComandoCopy(cmd: string): { esquema: string; tabela: string; colunas: string[] } | null {
    const m = /^COPY\s+((?:"(?:[^"]|"")+"|[^\s.(]+)(?:\.(?:"(?:[^"]|"")+"|[^\s(]+))?)\s*(?:\(([^)]*)\))?\s+FROM\s+stdin/i.exec(cmd.trim());
    if (!m) return null;
    const nomes = separarIdentificadores(m[1], '.');
    const colunas = m[2] ? separarIdentificadores(m[2], ',') : [];
    return nomes.length === 2 ? { esquema: nomes[0], tabela: nomes[1], colunas } : { esquema: 'public', tabela: nomes[0], colunas };
}

function separarIdentificadores(s: string, sep: string): string[] {
    const out: string[] = [];
    let atual = '', aspas = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"') { if (aspas && s[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; continue; }
        if (c === sep && !aspas) { out.push(atual.trim()); atual = ''; continue; }
        atual += c;
    }
    if (atual.trim() || out.length) out.push(atual.trim());
    return out;
}

/** Recebe texto em pedaços e entrega linhas completas (sem o \n). */
class Linhas {
    private resto = '';
    constructor(private aoLinha: (l: string) => boolean) {}
    /** false = parar. */
    empurrar(t: string): boolean {
        const txt = this.resto + t;
        let ini = 0;
        for (;;) {
            const i = txt.indexOf('\n', ini);
            if (i < 0) break;
            if (!this.aoLinha(txt.slice(ini, i))) { this.resto = ''; return false; }
            ini = i + 1;
        }
        this.resto = txt.slice(ini);
        return true;
    }
    terminar(): void { if (this.resto) { this.aoLinha(this.resto); this.resto = ''; } }
}

/** Consome um fluxo de bytes de COPY texto, linha a linha, até "\." ou fim. */
async function consumirCopy(fluxo: ReadableStream<Uint8Array>, aoLinha: AoLinha): Promise<number> {
    let n = 0, parar = false;
    const dec = new TextDecoder('utf-8');
    const linhas = new Linhas(l => {
        if (l === '\\.') { parar = true; return false; }
        n++;
        if (aoLinha(decodificarLinhaCopy(l)) === false) { parar = true; return false; }
        return true;
    });
    const r = fluxo.getReader();
    try {
        for (;;) {
            const { value, done } = await r.read();
            if (done) break;
            if (!linhas.empurrar(dec.decode(value, { stream: true }))) break;
        }
        if (!parar) { linhas.empurrar(dec.decode()); linhas.terminar(); }
    } finally {
        await r.cancel().catch(() => undefined);
    }
    return n;
}

function fluxoDe(gerador: () => AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
    let it: AsyncGenerator<Uint8Array>;
    return new ReadableStream<Uint8Array>({
        start() { it = gerador(); },
        async pull(c) { const { value, done } = await it.next(); if (done) c.close(); else c.enqueue(value); },
        async cancel() { await it.return(undefined); },
    });
}

const inflar = (f: ReadableStream<Uint8Array>, formato: 'deflate' | 'gzip') =>
    f.pipeThrough(new DecompressionStream(formato) as unknown as TransformStream<Uint8Array, Uint8Array>);

// ─── formato custom e tar ─────────────────────────────────────────────────

interface EntradaToc {
    dumpId: number; desc: string; tag: string; namespace: string; copyStmt: string;
    estadoDados: number; posDados: number; arquivoDados: string | null;
}

interface Cabecalho {
    versao: [number, number, number]; formato: number; compressao: string; comprimido: boolean;
    banco: string | null; criadoEm: string | null; versaoOrigem: string | null; versaoPgDump: string | null;
}

const FORMATO_TAR = 3;
const BLK_DATA = 1, BLK_BLOBS = 3;
const K_OFFSET_POS_SET = 2;

async function lerCabecalho(l: Leitor): Promise<Cabecalho> {
    const magia = DEC.decode(await l.bytes(5));
    if (magia !== 'PGDMP') throw new Error('Não é um backup do pg_dump (cabeçalho PGDMP ausente).');
    const vmaj = await l.byte(), vmin = await l.byte();
    const vrev = vmaj > 1 || (vmaj === 1 && vmin > 0) ? await l.byte() : 0;
    const v = vmaj * 10000 + vmin * 100 + vrev;
    if (v < 11200) throw new Error(`Versão de arquivo ${vmaj}.${vmin} antiga demais (anterior ao PostgreSQL 9.2).`);
    l.intSize = await l.byte();
    l.offSize = await l.byte();
    const formato = await l.byte();
    let compressao = 'nenhuma', comprimido = false;
    if (v >= 11500) {
        const alg = await l.byte();
        comprimido = alg !== 0;
        compressao = ['nenhuma', 'gzip', 'lz4', 'zstd'][alg] ?? `algoritmo ${alg}`;
        if (alg > 1) throw new Error(`Backup comprimido com ${compressao}, que este leitor ainda não abre. Gere o backup com compressão gzip (padrão) ou sem compressão.`);
    } else {
        const nivel = await l.int();
        comprimido = nivel !== 0;
        compressao = nivel === 0 ? 'nenhuma' : `zlib (nível ${nivel === -1 ? 'padrão' : nivel})`;
    }
    const tm: number[] = [];
    for (let i = 0; i < 7; i++) tm.push(await l.int());
    const [seg, min, hora, dia, mes, ano] = tm;
    const p2 = (n: number) => String(n).padStart(2, '0');
    const criadoEm = ano ? `${1900 + ano}-${p2(mes + 1)}-${p2(dia)} ${p2(hora)}:${p2(min)}:${p2(seg)}` : null;
    const banco = await l.str();
    const versaoOrigem = await l.str();
    const versaoPgDump = await l.str();
    return { versao: [vmaj, vmin, vrev], formato, compressao, comprimido, banco, criadoEm, versaoOrigem, versaoPgDump };
}

async function lerToc(l: Leitor, cab: Cabecalho): Promise<EntradaToc[]> {
    const v = cab.versao[0] * 10000 + cab.versao[1] * 100 + cab.versao[2];
    const qtd = await l.int();
    const out: EntradaToc[] = [];
    for (let i = 0; i < qtd; i++) {
        const dumpId = await l.int();
        await l.int();               // hadDumper
        await l.str();               // tableoid
        await l.str();               // oid
        const tag = (await l.str()) ?? '';
        const desc = (await l.str()) ?? '';
        await l.int();               // section (>= 1.11)
        await l.str();               // defn
        await l.str();               // dropStmt
        const copyStmt = (await l.str()) ?? '';
        const namespace = (await l.str()) ?? '';
        await l.str();               // tablespace
        if (v >= 11400) await l.str();   // tableam (>= 1.14)
        if (v >= 11600) await l.int();   // relkind (>= 1.16, PostgreSQL 17)
        await l.str();               // owner
        await l.str();               // withOids (sempre "false" desde o 12)
        while ((await l.str()) !== null) { /* dependências */ }
        let estadoDados = 0, posDados = 0, arquivoDados: string | null = null;
        if (cab.formato === FORMATO_TAR) arquivoDados = await l.str();
        else { const o = await l.offset(); estadoDados = o.estado; posDados = o.pos; }
        out.push({ dumpId, desc, tag, namespace, copyStmt, estadoDados, posDados, arquivoDados });
    }
    return out;
}

function resumoObjetos(toc: EntradaToc[]): ObjetoBackup[] {
    const m = new Map<string, number>();
    for (const e of toc) m.set(e.desc, (m.get(e.desc) ?? 0) + 1);
    return [...m.entries()].map(([tipo, quantidade]) => ({ tipo, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
}

function tabelasDoToc(toc: EntradaToc[]): TabelaBackup[] {
    return toc.filter(e => e.desc === 'TABLE DATA').map(e => {
        const c = lerComandoCopy(e.copyStmt);
        return { id: String(e.dumpId), esquema: c?.esquema ?? e.namespace, tabela: c?.tabela ?? e.tag, colunas: c?.colunas ?? [], bytesNoBackup: null };
    });
}

/** Pula os pedaços de um bloco (tamanho + bytes, até tamanho 0). */
async function pularPedacos(l: Leitor): Promise<void> {
    for (;;) { const n = await l.int(); if (n <= 0) return; await l.pular(n); }
}

async function abrirCustom(fonte: FonteBytes, nome: string): Promise<Backup> {
    const l = new Leitor(fonte);
    const cab = await lerCabecalho(l);
    if (cab.formato === FORMATO_TAR) throw new Error('Formato tar inesperado dentro do arquivo.');
    const toc = await lerToc(l, cab);
    const inicioDados = l.posicao;
    const avisos: string[] = [];
    const tabelas = tabelasDoToc(toc);

    // Onde começa o bloco de cada tabela. Se o pg_dump gravou para um pipe
    // (sem posições no TOC), o índice é montado percorrendo os blocos.
    const posicoes = new Map<number, number>();
    for (const e of toc) if (e.estadoDados === K_OFFSET_POS_SET) posicoes.set(e.dumpId, e.posDados);
    const precisaIndice = tabelas.some(t => !posicoes.has(Number(t.id)));
    if (precisaIndice) {
        avisos.push('O backup foi gravado sem índice de posições (pg_dump para um pipe). As tabelas foram localizadas percorrendo o arquivo.');
        const s = new Leitor(fonte, inicioDados);
        s.intSize = l.intSize; s.offSize = l.offSize;
        while (!s.fim) {
            const ini = s.posicao;
            const tipo = await s.byte();
            const id = await s.int();
            posicoes.set(id, ini);
            if (tipo === BLK_DATA) await pularPedacos(s);
            else if (tipo === BLK_BLOBS) { for (let oid = await s.int(); oid !== 0; oid = await s.int()) await pularPedacos(s); }
            else { avisos.push(`Bloco de tipo ${tipo} desconhecido na posição ${ini}; a leitura parou ali.`); break; }
        }
    }
    const ordenadas = [...posicoes.values()].sort((a, b) => a - b);
    for (const t of tabelas) {
        const p = posicoes.get(Number(t.id));
        if (p === undefined) continue;
        const prox = ordenadas.find(x => x > p) ?? fonte.tamanho;
        t.bytesNoBackup = prox - p;
    }

    async function lerTabela(t: TabelaBackup, aoLinha: AoLinha): Promise<number> {
        const pos = posicoes.get(Number(t.id));
        if (pos === undefined) return 0;   // tabela sem dados no backup
        const b = new Leitor(fonte, pos);
        b.intSize = l.intSize; b.offSize = l.offSize;
        const tipo = await b.byte();
        const id = await b.int();
        if (tipo !== BLK_DATA || id !== Number(t.id)) throw new Error(`Bloco de dados de ${t.esquema}.${t.tabela} não confere (tipo ${tipo}, id ${id}).`);
        const pedacos = fluxoDe(async function* () {
            for (;;) {
                const n = await b.int();
                if (n <= 0) return;
                yield (await b.bytes(n)).slice();
            }
        });
        return consumirCopy(cab.comprimido ? inflar(pedacos, 'deflate') : pedacos, aoLinha);
    }

    return {
        formato: 'custom', nomeArquivo: nome, tamanhoArquivo: fonte.tamanho,
        versaoArquivo: cab.versao.join('.'), versaoPostgresOrigem: cab.versaoOrigem, versaoPgDump: cab.versaoPgDump,
        banco: cab.banco, criadoEm: cab.criadoEm, compressao: cab.compressao,
        esquemas: [...new Set(toc.filter(e => e.desc === 'SCHEMA').map(e => e.tag))].sort(),
        tabelas, objetos: resumoObjetos(toc), avisos, lerTabela,
    };
}

// tar: cabeçalhos de 512 bytes; nome em 0..100, tamanho em octal em 124..136.
async function indiceTar(fonte: FonteBytes): Promise<Map<string, { pos: number; tamanho: number }>> {
    const m = new Map<string, { pos: number; tamanho: number }>();
    let p = 0;
    while (p + 512 <= fonte.tamanho) {
        const h = await fonte.ler(p, p + 512);
        if (h.every(x => x === 0)) break;
        const nome = DEC.decode(h.subarray(0, 100)).replace(/\0.*$/s, '');
        const tamanho = parseInt(DEC.decode(h.subarray(124, 136)).replace(/\0.*$/s, '').trim() || '0', 8);
        m.set(nome, { pos: p + 512, tamanho });
        p += 512 + Math.ceil(tamanho / 512) * 512;
    }
    return m;
}

async function abrirTar(fonte: FonteBytes, nome: string): Promise<Backup> {
    const idx = await indiceTar(fonte);
    const toc = idx.get('toc.dat');
    if (!toc) throw new Error('Arquivo tar sem "toc.dat": não parece um backup do pg_dump.');
    const sub: FonteBytes = { tamanho: toc.pos + toc.tamanho, ler: (i, f) => fonte.ler(i, Math.min(f, toc.pos + toc.tamanho)) };
    const l = new Leitor(sub, toc.pos);
    const cab = await lerCabecalho(l);
    const entradas = await lerToc(l, cab);
    const tabelas = tabelasDoToc(entradas);
    const arquivos = new Map(entradas.map(e => [String(e.dumpId), e.arquivoDados]));
    for (const t of tabelas) t.bytesNoBackup = idx.get(arquivos.get(t.id) ?? '')?.tamanho ?? null;

    async function lerTabela(t: TabelaBackup, aoLinha: AoLinha): Promise<number> {
        const arq = arquivos.get(t.id);
        const ent = arq ? idx.get(arq) : undefined;
        if (!ent) return 0;
        const fim = ent.pos + ent.tamanho;
        const fluxo = fluxoDe(async function* () {
            for (let p = ent.pos; p < fim; p += JANELA) yield (await fonte.ler(p, Math.min(fim, p + JANELA))).slice();
        });
        return consumirCopy(arq!.endsWith('.gz') ? inflar(fluxo, 'gzip') : fluxo, aoLinha);
    }

    return {
        formato: 'tar', nomeArquivo: nome, tamanhoArquivo: fonte.tamanho,
        versaoArquivo: cab.versao.join('.'), versaoPostgresOrigem: cab.versaoOrigem, versaoPgDump: cab.versaoPgDump,
        banco: cab.banco, criadoEm: cab.criadoEm, compressao: 'nenhuma (tar)',
        esquemas: [...new Set(entradas.filter(e => e.desc === 'SCHEMA').map(e => e.tag))].sort(),
        tabelas, objetos: resumoObjetos(entradas), avisos: [], lerTabela,
    };
}

// ─── formato plain (.sql e .sql.gz) ───────────────────────────────────────

function fluxoArquivo(fonte: FonteBytes, gzip: boolean): ReadableStream<Uint8Array> {
    const f = fluxoDe(async function* () {
        for (let p = 0; p < fonte.tamanho; p += JANELA) yield (await fonte.ler(p, Math.min(fonte.tamanho, p + JANELA))).slice();
    });
    return gzip ? inflar(f, 'gzip') : f;
}

/** Percorre o SQL linha a linha; `aoCopy` recebe cada COPY e decide se quer as linhas dele. */
async function percorrerPlain(fonte: FonteBytes, gzip: boolean, aoTexto: (l: string) => void,
    aoCopy: (indice: number, cmd: string) => AoLinha | 'pular' | 'parar'): Promise<void> {
    const dec = new TextDecoder('utf-8');
    let dentro: AoLinha | 'pular' | null = null, indice = 0, parar = false;
    const linhas = new Linhas(l => {
        if (dentro) {
            if (l === '\\.') { dentro = null; return true; }
            if (dentro !== 'pular' && dentro(decodificarLinhaCopy(l)) === false) { parar = true; return false; }
            return true;
        }
        if (/^COPY\s/i.test(l) && /FROM\s+stdin;\s*$/i.test(l)) {
            const r = aoCopy(indice++, l);
            if (r === 'parar') { parar = true; return false; }
            dentro = r;
            return true;
        }
        aoTexto(l);
        return true;
    });
    const r = fluxoArquivo(fonte, gzip).getReader();
    try {
        for (;;) {
            const { value, done } = await r.read();
            if (done) break;
            if (!linhas.empurrar(dec.decode(value, { stream: true }))) break;
        }
        if (!parar) { linhas.empurrar(dec.decode()); linhas.terminar(); }
    } finally {
        await r.cancel().catch(() => undefined);
    }
}

async function abrirPlain(fonte: FonteBytes, nome: string, gzip: boolean): Promise<Backup> {
    const tabelas: TabelaBackup[] = [];
    const esquemas = new Set<string>();
    const objetos = new Map<string, number>();
    let versaoOrigem: string | null = null, versaoPgDump: string | null = null, banco: string | null = null;
    const contagem = new Map<number, number>();
    await percorrerPlain(fonte, gzip, l => {
        let m = /^-- Dumped from database version (.+)$/.exec(l); if (m) versaoOrigem = m[1];
        m = /^-- Dumped by pg_dump version (.+)$/.exec(l); if (m) versaoPgDump = m[1];
        m = /^-- Name: .*; Type: ([A-Z ]+); Schema: /.exec(l); if (m) objetos.set(m[1], (objetos.get(m[1]) ?? 0) + 1);
        m = /^CREATE SCHEMA ("?[^";]+"?);/.exec(l); if (m) esquemas.add(m[1].replace(/"/g, ''));
        m = /^\\connect\s+(\S+)/.exec(l); if (m) banco = m[1].replace(/"/g, '');
    }, (indice, cmd) => {
        const c = lerComandoCopy(cmd);
        tabelas.push({ id: String(indice), esquema: c?.esquema ?? '', tabela: c?.tabela ?? cmd, colunas: c?.colunas ?? [], bytesNoBackup: null });
        contagem.set(indice, 0);
        return () => { contagem.set(indice, (contagem.get(indice) ?? 0) + 1); };
    });

    async function lerTabela(t: TabelaBackup, aoLinha: AoLinha): Promise<number> {
        const alvo = Number(t.id);
        let n = 0;
        await percorrerPlain(fonte, gzip, () => undefined, indice => {
            if (indice < alvo) return 'pular';
            if (indice > alvo) return 'parar';
            return v => { n++; return aoLinha(v); };
        });
        return n;
    }

    const avisos = [`Backup em SQL ${gzip ? 'compactado ' : ''}: cada leitura percorre o arquivo desde o início.`];
    return {
        formato: gzip ? 'plain-gzip' : 'plain', nomeArquivo: nome, tamanhoArquivo: fonte.tamanho,
        versaoArquivo: null, versaoPostgresOrigem: versaoOrigem, versaoPgDump, banco, criadoEm: null,
        compressao: gzip ? 'gzip (arquivo inteiro)' : 'nenhuma',
        esquemas: [...esquemas].sort(), tabelas,
        objetos: [...objetos.entries()].map(([tipo, quantidade]) => ({ tipo, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
        avisos, lerTabela,
    };
}

// ─── entrada ──────────────────────────────────────────────────────────────

export async function abrirBackup(fonte: FonteBytes, nome: string): Promise<Backup> {
    if (fonte.tamanho < 16) throw new Error('Arquivo vazio ou pequeno demais para ser um backup.');
    const inicio = await fonte.ler(0, Math.min(fonte.tamanho, 512));
    if (DEC.decode(inicio.subarray(0, 5)) === 'PGDMP') return abrirCustom(fonte, nome);
    if (inicio[0] === 0x1f && inicio[1] === 0x8b) return abrirPlain(fonte, nome, true);
    if (fonte.tamanho >= 512 && DEC.decode(inicio.subarray(257, 262)) === 'ustar') return abrirTar(fonte, nome);
    const txt = DEC.decode(inicio);
    if (/PostgreSQL database dump|^--|^SET |^CREATE /m.test(txt)) return abrirPlain(fonte, nome, false);
    throw new Error('Formato não reconhecido. Use o arquivo gerado pelo pg_dump (.backup, .tar, .sql ou .sql.gz). Se o backup veio compactado em .zip ou .rar, extraia antes.');
}

// ─── CSV ──────────────────────────────────────────────────────────────────

const campoCsv = (v: Valor) => (v === null ? '' : /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV com ponto e vírgula e BOM, como o Excel em português abre direto. Nulo vira vazio. */
export async function tabelaParaCsv(b: Backup, t: TabelaBackup): Promise<{ blob: Blob; linhas: number }> {
    const partes: string[] = ['﻿' + t.colunas.map(c => campoCsv(c)).join(';') + '\r\n'];
    let lote: string[] = [];
    const linhas = await b.lerTabela(t, v => {
        lote.push(v.map(campoCsv).join(';'));
        if (lote.length >= 5000) { partes.push(lote.join('\r\n') + '\r\n'); lote = []; }
    });
    if (lote.length) partes.push(lote.join('\r\n') + '\r\n');
    return { blob: new Blob(partes, { type: 'text/csv;charset=utf-8' }), linhas };
}
