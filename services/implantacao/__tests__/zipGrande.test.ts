// Leitura de zip por fatias (índice pelo fim + entradas sob demanda), para os
// backups do IOB SAGE de mais de 1 GB. Os zips de teste são "virtuais": as
// regiões de zeros não ocupam memória, então dá para simular arquivos grandes.

import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, fonteDaEntrada, indiceZip, lerZip, type FonteZip } from '../zip';
import { abrirRestauracao } from '../../iobSage/restauracao';
import type { Valor } from '../../iobSage/backupPostgres';

interface EntradaTeste { nome: string; dados?: Uint8Array; zeros?: number; metodo?: 0 | 8; flag?: number; nomeDos?: Uint8Array; extra?: Uint8Array }
interface Segmento { ini: number; fim: number; bytes?: Uint8Array }

const enc = new TextEncoder();
const bytes = (...vs: [number, 1 | 2 | 4 | 8][]) => {
    const out: number[] = [];
    for (const [v, n] of vs) for (let k = 0; k < n; k++) out.push(Math.floor(v / 2 ** (8 * k)) & 0xff);
    return new Uint8Array(out);
};
const junta = (...ps: Uint8Array[]) => { const t = new Uint8Array(ps.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of ps) { t.set(p, o); o += p.length; } return t; };

/** Zip montado em segmentos; registra cada leitura para provar que nada é lido inteiro. */
function zipVirtual(entradas: EntradaTeste[], zip64 = false) {
    const segs: Segmento[] = [];
    let pos = 0;
    const add = (b?: Uint8Array, zeros = 0) => { const n = b ? b.length : zeros; segs.push({ ini: pos, fim: pos + n, bytes: b }); pos += n; };
    const central: Uint8Array[] = [];
    for (const e of entradas) {
        const nome = e.nomeDos ?? enc.encode(e.nome);
        const metodo = e.metodo ?? (e.zeros ? 0 : 8);
        const dados = e.dados && metodo === 8 ? new Uint8Array(deflateRawSync(e.dados)) : e.dados;
        const comp = dados ? dados.length : e.zeros!;
        const tam = e.dados ? e.dados.length : e.zeros!;
        const off = pos;
        const flag = (e.flag ?? 0) | (e.nomeDos ? 0 : 0x0800);
        add(junta(bytes([0x04034b50, 4], [45, 2], [flag, 2], [metodo, 2], [0, 4], [0, 4], [zip64 ? 0xffffffff : comp, 4], [zip64 ? 0xffffffff : tam, 4], [nome.length, 2], [0, 2]), nome));
        add(dados, dados ? 0 : e.zeros);
        const extra = junta(zip64 ? bytes([1, 2], [24, 2], [tam, 8], [comp, 8], [off, 8]) : new Uint8Array(0), e.extra ?? new Uint8Array(0));
        central.push(junta(bytes([0x02014b50, 4], [45, 2], [45, 2], [flag, 2], [metodo, 2], [0, 4], [0, 4],
            [zip64 ? 0xffffffff : comp, 4], [zip64 ? 0xffffffff : tam, 4], [nome.length, 2], [extra.length, 2], [0, 2], [0, 2], [0, 2], [0, 4],
            [zip64 ? 0xffffffff : off, 4]), nome, extra));
    }
    const cd = junta(...central);
    const offCd = pos;
    add(cd);
    if (zip64) {
        const off64 = pos;
        add(bytes([0x06064b50, 4], [44, 8], [45, 2], [45, 2], [0, 4], [0, 4], [entradas.length, 8], [entradas.length, 8], [cd.length, 8], [offCd, 8]));
        add(bytes([0x07064b50, 4], [0, 4], [off64, 8], [1, 4]));
        add(bytes([0x06054b50, 4], [0, 2], [0, 2], [0xffff, 2], [0xffff, 2], [0xffffffff, 4], [0xffffffff, 4], [0, 2]));
    } else {
        add(bytes([0x06054b50, 4], [0, 2], [0, 2], [entradas.length, 2], [entradas.length, 2], [cd.length, 4], [offCd, 4], [0, 2]));
    }
    const leituras: number[] = [];
    const fonte: FonteZip = {
        tamanho: pos,
        async ler(i, f) {
            f = Math.min(f, pos);
            leituras.push(f - i);
            const out = new Uint8Array(Math.max(0, f - i));
            for (const s of segs) {
                if (!s.bytes || s.fim <= i || s.ini >= f) continue;
                const a = Math.max(i, s.ini), b = Math.min(f, s.fim);
                out.set(s.bytes.subarray(a - s.ini, b - s.ini), a - i);
            }
            return out;
        },
    };
    return { fonte, leituras };
}

/** Texto compressível mas não trivial (linhas numeradas). */
function texto(mb: number): Uint8Array {
    const linhas: string[] = [];
    let n = 0, t = 0;
    while (t < mb * 1024 * 1024) { const l = `registro ${n++};valor ${(n * 7919) % 100003}\n`; linhas.push(l); t += l.length; }
    return enc.encode(linhas.join(''));
}

describe('zip lido por fatias', () => {
    it('índice pelo fim e entrada deflate pequena; lerZip continua igual', async () => {
        const a = enc.encode('conteúdo do arquivo A '.repeat(100));
        const { fonte } = zipVirtual([{ nome: 'pasta/', dados: new Uint8Array(0), metodo: 0 }, { nome: 'pasta/A.TXT', dados: a }, { nome: 'B.TXT', dados: enc.encode('bê'), metodo: 0 }]);
        const idx = await indiceZip(fonte);
        expect(idx.map(e => [e.nome, e.metodo, e.pasta, e.tamanho])).toEqual([['pasta/', 0, true, 0], ['pasta/A.TXT', 8, false, a.length], ['B.TXT', 0, false, 3]]);
        const fa = fonteDaEntrada(fonte, idx[1]);
        expect(new TextDecoder().decode(await fa.ler(0, 9))).toBe('conteúdo');
        expect(await fa.ler(5, a.length + 99)).toEqual(a.subarray(5));
        const todos = await lerZip(await fonte.ler(0, fonte.tamanho));
        expect(todos.map(x => x.nome)).toEqual(['pasta/A.TXT', 'B.TXT']);
        expect(todos[0].bytes).toEqual(a);
    });

    it('entrada deflate grande: cursor para a frente, recomeça para trás, nunca lê o zip inteiro', async () => {
        const grande = texto(34);
        const { fonte, leituras } = zipVirtual([{ nome: 'DADOS.backup', dados: grande }]);
        const [e] = await indiceZip(fonte);
        const f = fonteDaEntrada(fonte, e);
        expect(f.tamanho).toBe(grande.length);
        for (const [i, j] of [[0, 512], [1000, 70000], [20_000_000, 20_100_000], [grande.length - 10, grande.length + 10], [3, 9], [33_000_000, 33_000_001]]) {
            expect(await f.ler(i, j)).toEqual(grande.subarray(i, Math.min(j, grande.length)));
        }
        // Leituras concorrentes entram em fila e cada uma devolve o seu pedaço.
        const [x, y] = await Promise.all([f.ler(100, 200), f.ler(10_000_000, 10_000_100)]);
        expect(x).toEqual(grande.subarray(100, 200));
        expect(y).toEqual(grande.subarray(10_000_000, 10_000_100));
        expect(Math.max(...leituras)).toBeLessThanOrEqual(1024 * 1024 + 0xffff + 22);
    }, 30_000);

    it('ZIP64 com entrada "stored" de 5 GB: lê o meio sem alocar o arquivo', async () => {
        const cinco = 5 * 1024 ** 3;
        const { fonte, leituras } = zipVirtual([{ nome: 'ZEROS.BIN', zeros: cinco }, { nome: 'FIM.TXT', dados: enc.encode('fim do backup') }], true);
        const idx = await indiceZip(fonte);
        expect(idx.map(e => [e.nome, e.tamanho])).toEqual([['ZEROS.BIN', cinco], ['FIM.TXT', 13]]);
        expect(idx[1].offLocal).toBeGreaterThan(cinco);
        expect(await fonteDaEntrada(fonte, idx[0]).ler(cinco - 4, cinco + 4)).toEqual(new Uint8Array(4));
        expect(new TextDecoder().decode(await fonteDaEntrada(fonte, idx[1]).ler(0, 99))).toBe('fim do backup');
        expect(Math.max(...leituras)).toBeLessThan(1024 * 1024);
    });

    it('nomes sem UTF-8: CP437 pela especificação, CP850 do Windows em português e caminho Unicode', async () => {
        const dos = (...b: number[]) => new Uint8Array(b);
        const unicode = (nomeHeader: Uint8Array, nome: string) => { const u = enc.encode(nome); return junta(bytes([0x7075, 2], [5 + u.length, 2], [1, 1], [crc32(nomeHeader), 4]), u); };
        const fun = dos(0x46, 0x55, 0x4e, 0x80, 0x82, 0x4f); // FUNÇéO em CP437/CP850 (0x80 = Ç, 0x82 = é)
        const cao = dos(0x41, 0x80, 0xc7, 0x4f); // AÇÃO na CP850 (0xC7 = Ã); na CP437 seria ╟
        const outro = dos(0x58, 0x82);
        const { fonte } = zipVirtual([
            { nome: '', nomeDos: fun, dados: enc.encode('a'), metodo: 0 },
            { nome: '', nomeDos: cao, dados: enc.encode('b'), metodo: 0 },
            { nome: '', nomeDos: outro, dados: enc.encode('c'), metodo: 0, extra: unicode(outro, 'MEMÓRIA.DBF') },
            { nome: '', nomeDos: outro, dados: enc.encode('d'), metodo: 0, extra: unicode(dos(0x59), 'ERRADO.DBF') },
        ]);
        expect((await indiceZip(fonte)).map(e => e.nome)).toEqual(['FUNÇéO', 'AÇÃO', 'MEMÓRIA.DBF', 'Xé']);
    });

    it('zip inválido e entrada protegida por senha dão mensagem clara', async () => {
        await expect(indiceZip({ tamanho: 100, ler: async () => new Uint8Array(100) })).rejects.toThrow(/diretório central não encontrado/);
        const { fonte } = zipVirtual([{ nome: 'SECRETO.DBF', dados: enc.encode('x'), flag: 1 }]);
        const [e] = await indiceZip(fonte);
        await expect(fonteDaEntrada(fonte, e).ler(0, 1)).rejects.toThrow(/protegido por senha/);
    });
});

describe('restauração de backup grande', () => {
    const FX = join(__dirname, '../../iobSage/__tests__/fixtures/dbf');
    const ler = (p: string) => new Uint8Array(readFileSync(join(FX, p)));

    it('zip de 1,2 GB (deflate + uma entrada enorme): lista, casa o memo e lê a tabela por fatias', async () => {
        const { fonte, leituras } = zipVirtual([
            { nome: 'IMAGENS/FOTOS.BIN', zeros: 1200 * 1024 * 1024 },
            { nome: 'FOLHA/FUNCIONA.DBF', dados: ler('FUNCIONA.DBF') },
            { nome: 'FOLHA/FUNCIONA.FPT', dados: ler('FUNCIONA.FPT') },
            { nome: 'FOLHA/SEGREDO.DBF', dados: ler('EMPRESAS.DBF'), flag: 1 },
        ]);
        expect(fonte.tamanho).toBeGreaterThan(1024 ** 3);
        const r = await abrirRestauracao([{ nome: 'CADASTROS.zip', fonte }]);
        expect(r.arquivos.map(a => [a.caminho, a.tipo])).toEqual([
            ['CADASTROS.zip', 'zip'],
            ['CADASTROS.zip/FOLHA/SEGREDO.DBF', 'outro'],
            ['CADASTROS.zip/IMAGENS/FOTOS.BIN', 'outro'],
            ['CADASTROS.zip/FOLHA/FUNCIONA.FPT', 'memo'],
            ['CADASTROS.zip/FOLHA/FUNCIONA.DBF', 'dbf'],
        ]);
        expect(r.arquivos[0].detalhe).toBe('4 arquivo(s)');
        expect(r.arquivos[1].detalhe).toMatch(/protegido por senha/);
        const linhas: Valor[][] = [];
        await r.lerTabela(r.tabelas.find(t => t.tabela === 'FUNCIONA')!, v => { linhas.push(v); });
        expect(linhas).toHaveLength(2);
        expect(linhas.flat().join(' ')).toContain('linha 2 com acentuação');
        expect(Math.max(...leituras)).toBeLessThan(1024 * 1024);
    });
});
