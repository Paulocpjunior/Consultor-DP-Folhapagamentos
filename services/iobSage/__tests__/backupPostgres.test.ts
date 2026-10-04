// Testes contra backups REAIS. Os arquivos em fixtures/ foram gerados assim,
// a partir de um servidor PostgreSQL 12.22 com o banco de teste "sage_folha"
// (esquemas gen, e0001 e e0002, imitando um esquema por empresa):
//
//   pg_dump 12.3 -Fc             → pg12-custom.backup
//   pg_dump 12.3 -Fc -Z0         → pg12-custom-z0.backup
//   pg_dump 12.3 -Fc | cat       → pg12-custom-stdout.backup  (sem posições no TOC)
//   pg_dump 12.3 -Fp             → pg12-plain.sql  (e .sql.gz com gzip)
//   pg_dump 12.3 -Ft             → pg12-tar.tar
//   pg_dump 16   -Fc             → pg16-custom.backup  (arquivo versão 1.15)
//
// Conteúdo: gen.empresas (2), e0001.funcionarios (3, com acento, aspas, TAB,
// quebra de linha, barra invertida, nulos e bytea), e0001.movimento (3000),
// e0002.funcionarios (0) e e0002.vazia (0).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBackup, decodificarLinhaCopy, fonteDeBytes, lerComandoCopy, tabelaParaCsv, type Backup, type Valor } from '../backupPostgres';

const FX = join(__dirname, 'fixtures');
const abrir = (arq: string) => abrirBackup(fonteDeBytes(new Uint8Array(readFileSync(join(FX, arq)))), arq);

async function linhas(b: Backup, nome: string, limite = Infinity): Promise<Valor[][]> {
    const t = b.tabelas.find(x => `${x.esquema}.${x.tabela}` === nome);
    if (!t) throw new Error(`tabela ${nome} não listada`);
    const out: Valor[][] = [];
    await b.lerTabela(t, v => { out.push(v); return out.length < limite; });
    return out;
}

const ARQUIVOS = ['pg12-custom.backup', 'pg12-custom-z0.backup', 'pg12-custom-stdout.backup', 'pg12-tar.tar', 'pg12-plain.sql', 'pg12-plain.sql.gz', 'pg16-custom.backup'];

describe.each(ARQUIVOS)('%s', arq => {
    it('lista esquemas e tabelas com colunas', async () => {
        const b = await abrir(arq);
        // O pg_dump 15+ também grava o esquema public.
        expect(b.esquemas.filter(e => e !== 'public')).toEqual(['e0001', 'e0002', 'gen']);
        expect(b.tabelas.map(t => `${t.esquema}.${t.tabela}`).sort()).toEqual(['e0001.funcionarios', 'e0001.movimento', 'e0002.funcionarios', 'e0002.vazia', 'gen.empresas']);
        expect(b.tabelas.find(t => t.tabela === 'movimento')?.colunas).toEqual(['funcionario', 'competencia', 'evento', 'referencia', 'valor']);
        expect(b.versaoPostgresOrigem).toMatch(/^12\.22/);
    });

    it('lê os dados com acentos, aspas, TAB, quebra de linha, barra, nulos e bytea', async () => {
        const b = await abrir(arq);
        expect(await linhas(b, 'gen.empresas')).toEqual([
            ['1', '29463877000109', '2XR ENGENHARIA LTDA'],
            ['2', '11222333000181', 'COMÉRCIO SÃO JOÃO "AÇÚCAR"'],
        ]);
        const f = await linhas(b, 'e0001.funcionarios');
        expect(f[0]).toEqual(['1', 'ANDRE LUIS DE JESUS DOS SANTOS', '01787839516', '2026-09-16', '3243.65', null, 'f', null]);
        expect(f[1]).toEqual(['2', "JOSÉ D'ÁVILA", '11122233396', '2020-01-02', '1518.00', 'linha1\nlinha2\tcom tab e barra \\ fim', 't', '\\x00ff10']);
        expect(f[2]).toEqual(['3', 'Ñandú ção', '22233344405', null, null, '', 'f', null]);
    });

    it('lê tabela grande inteira e para no limite da prévia', async () => {
        const b = await abrir(arq);
        const tudo = await linhas(b, 'e0001.movimento');
        expect(tudo).toHaveLength(3000);
        expect(tudo[2999]).toEqual(['1', '092026', '1000', '1500.000000', '3750.00']);
        expect(await linhas(b, 'e0001.movimento', 5)).toHaveLength(5);
        expect(await linhas(b, 'e0002.vazia')).toEqual([]);
    });
});

describe('cabeçalho do formato custom', () => {
    it('PostgreSQL 12: arquivo 1.14, zlib, banco e versões', async () => {
        const b = await abrir('pg12-custom.backup');
        expect(b).toMatchObject({ formato: 'custom', versaoArquivo: '1.14.0', banco: 'sage_folha', compressao: 'zlib (nível padrão)' });
        expect(b.versaoPgDump).toMatch(/^12\.3/);
        expect(b.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2} /);
        expect(b.objetos.find(o => o.tipo === 'TABLE')?.quantidade).toBe(5);
        expect(b.tabelas.every(t => (t.bytesNoBackup ?? 0) > 0)).toBe(true);
    });

    it('PostgreSQL 16: arquivo 1.15 com algoritmo de compressão no cabeçalho', async () => {
        expect(await abrir('pg16-custom.backup')).toMatchObject({ versaoArquivo: '1.15.0', compressao: 'gzip' });
    });

    it('sem compressão e gravado em pipe (sem posições): avisa e acha as tabelas percorrendo', async () => {
        expect((await abrir('pg12-custom-z0.backup')).compressao).toBe('nenhuma');
        const b = await abrir('pg12-custom-stdout.backup');
        expect(b.avisos.join(' ')).toMatch(/sem índice de posições/);
    });

    it('recusa arquivo que não é backup e backup truncado', async () => {
        await expect(abrirBackup(fonteDeBytes(new TextEncoder().encode('isto não é um backup do postgres')), 'x.txt')).rejects.toThrow(/não reconhecido/);
        const inteiro = new Uint8Array(readFileSync(join(FX, 'pg12-custom.backup')));
        await expect(abrirBackup(fonteDeBytes(inteiro.subarray(0, 300)), 'cortado.backup')).rejects.toThrow(/incompleto|corrompido/);
    });
});

describe('CSV', () => {
    it('gera CSV com ponto e vírgula, BOM e aspas onde precisa', async () => {
        const b = await abrir('pg12-custom.backup');
        const t = b.tabelas.find(x => x.tabela === 'funcionarios' && x.esquema === 'e0001')!;
        const { blob, linhas: n } = await tabelaParaCsv(b, t);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const txt = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
        expect(n).toBe(3);
        expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        expect(txt.slice(1).split('\r\n')[0]).toBe('codigo;nome;cpf;admissao;salario;observacao;demitido;foto');
        expect(txt).toContain('"linha1\nlinha2\tcom tab e barra \\ fim"');
    });
});

describe('COPY texto', () => {
    it('decodifica escapes, octal, hexadecimal e nulo', () => {
        expect(decodificarLinhaCopy('a\\tb\t\\N\t\\101\\x42\t\\\\')).toEqual(['a\tb', null, 'AB', '\\']);
    });
    it('lê o comando COPY com nomes entre aspas', () => {
        expect(lerComandoCopy('COPY "E0001"."Folha ""X""" ("Cod", nome) FROM stdin;')).toEqual({ esquema: 'E0001', tabela: 'Folha "X"', colunas: ['Cod', 'nome'] });
    });
});
