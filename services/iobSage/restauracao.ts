// services/iobSage/restauracao.ts
//
// Junta as partes de um backup do IOB SAGE numa só restauração.
// No modo SQL, o "Backup SQL" da linha Office vem em duas partes (Ajuda
// Aprendo³, artigo 4898): um .zip com o cadastro das empresas e um .backup
// com os dados da folha (PostgreSQL). Aqui cada arquivo é reconhecido pela
// ASSINATURA, não pela extensão — assim .SBAK/.SBKP que sejam zip também
// abrem — e o conteúdo do .zip é listado inteiro, inclusive o que não é tabela.

import { abrirBackup, fonteDeBytes, type AoLinha, type Backup, type FonteBytes, type Valor } from './backupPostgres';
import { lerZip } from '../implantacao/zip';
import { abrirDbf, type Codificacao, type TabelaDbf } from './dbf';

export type TipoArquivo = 'pg_dump' | 'zip' | 'dbf' | 'memo' | 'outro';

export interface ArquivoVisto {
    caminho: string;
    tamanho: number;
    tipo: TipoArquivo;
    detalhe: string;
}

export interface TabelaRestauracao {
    id: string;
    origem: 'postgres' | 'dbf';
    /** Esquema (PostgreSQL) ou pasta/arquivo de origem (DBF). */
    grupo: string;
    tabela: string;
    colunas: string[];
    /** Registros, quando o formato diz sem ler (DBF). */
    registros: number | null;
    bytes: number | null;
    arquivo: string;
}

export interface Restauracao {
    arquivos: ArquivoVisto[];
    backups: Backup[];
    dbfs: TabelaDbf[];
    tabelas: TabelaRestauracao[];
    grupos: string[];
    avisos: string[];
    lerTabela(t: TabelaRestauracao, aoLinha: AoLinha): Promise<number>;
}

export interface EntradaArquivo { nome: string; fonte: FonteBytes }

const ZIP_MAXIMO = 512 * 1024 * 1024;

function assinatura(b: Uint8Array): 'pgdmp' | 'zip' | 'gzip' | 'tar' | 'texto' | 'outro' {
    const t = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
    if (t(0, 5) === 'PGDMP') return 'pgdmp';
    if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) return 'zip';
    if (b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
    if (b.length >= 262 && t(257, 5) === 'ustar') return 'tar';
    if (/^(--|SET |CREATE |COPY )/.test(t(0, 16))) return 'texto';
    return 'outro';
}

const pasta = (c: string) => (c.includes('/') ? c.slice(0, c.lastIndexOf('/')) : '');
const base = (c: string) => c.slice(c.lastIndexOf('/') + 1);
const semExt = (c: string) => c.replace(/\.[^./]+$/, '').toLowerCase();

export async function abrirRestauracao(entradas: EntradaArquivo[], opcoes: { codificacaoDbf?: Codificacao } = {}): Promise<Restauracao> {
    const arquivos: ArquivoVisto[] = [];
    const backups: Backup[] = [];
    const dbfs: { t: TabelaDbf; caminho: string }[] = [];
    const avisos: string[] = [];

    // Arquivos soltos e de dentro dos zip, para casar cada DBF com o seu memo.
    const todos: { caminho: string; fonte: FonteBytes; nivel: number }[] = entradas.map(e => ({ caminho: e.nome, fonte: e.fonte, nivel: 0 }));
    for (let i = 0; i < todos.length; i++) {
        const { caminho, fonte, nivel } = todos[i];
        const ext = caminho.toLowerCase().split('.').pop() ?? '';
        const cab = await fonte.ler(0, Math.min(fonte.tamanho, 512));
        const sig = assinatura(cab);
        const reg = (tipo: TipoArquivo, detalhe: string) => arquivos.push({ caminho, tamanho: fonte.tamanho, tipo, detalhe });

        if (sig === 'zip') {
            if (nivel >= 2) { reg('zip', 'zip dentro de zip demais; não foi aberto'); continue; }
            if (fonte.tamanho > ZIP_MAXIMO) { reg('zip', 'grande demais para abrir no navegador; extraia e escolha os arquivos'); continue; }
            try {
                const itens = await lerZip(await fonte.ler(0, fonte.tamanho));
                reg('zip', `${itens.length} arquivo(s)`);
                for (const it of itens) todos.push({ caminho: `${caminho}/${it.nome}`, fonte: fonteDeBytes(it.bytes), nivel: nivel + 1 });
            } catch (e) { reg('zip', (e as Error).message); }
            continue;
        }
        if (sig === 'pgdmp' || sig === 'tar' || sig === 'gzip' || (sig === 'texto' && ['sql', 'backup', 'dump'].includes(ext))) {
            try {
                const b = await abrirBackup(fonte, caminho);
                backups.push(b);
                reg('pg_dump', `PostgreSQL ${b.versaoPostgresOrigem ?? '?'} · ${b.formato} · ${b.tabelas.length} tabela(s)`);
            } catch (e) { reg('outro', (e as Error).message); }
            continue;
        }
        if (ext === 'dbf') continue;   // tratado abaixo, depois de achar o memo
        if (ext === 'fpt' || ext === 'dbt') { reg('memo', 'memo de tabela DBF'); continue; }
        reg('outro', sig === 'texto' ? 'texto' : 'não é tabela nem backup reconhecido');
    }

    for (const d of todos.filter(x => x.caminho.toLowerCase().endsWith('.dbf'))) {
        const memo = todos.find(x => /\.(fpt|dbt)$/i.test(x.caminho) && pasta(x.caminho) === pasta(d.caminho) && semExt(base(x.caminho)) === semExt(base(d.caminho)));
        try {
            const t = await abrirDbf(d.fonte, base(d.caminho), memo?.fonte ?? null, { codificacao: opcoes.codificacaoDbf });
            dbfs.push({ t, caminho: d.caminho });
            avisos.push(...t.avisos);
            arquivos.push({ caminho: d.caminho, tamanho: d.fonte.tamanho, tipo: 'dbf', detalhe: `${t.descricaoVersao} · ${t.registros} registro(s) · ${t.campos.length} campo(s) · ${t.codificacao}${t.codificacaoDeduzida ? ' (deduzida)' : ''}` });
        } catch (e) {
            arquivos.push({ caminho: d.caminho, tamanho: d.fonte.tamanho, tipo: 'outro', detalhe: (e as Error).message });
        }
    }

    const tabelas: TabelaRestauracao[] = [];
    backups.forEach((b, i) => {
        for (const t of b.tabelas) tabelas.push({ id: `pg${i}:${t.id}`, origem: 'postgres', grupo: t.esquema, tabela: t.tabela, colunas: t.colunas, registros: null, bytes: t.bytesNoBackup, arquivo: b.nomeArquivo });
        avisos.push(...b.avisos.map(a => `${b.nomeArquivo}: ${a}`));
    });
    dbfs.forEach(({ t, caminho }, i) => {
        tabelas.push({ id: `dbf${i}`, origem: 'dbf', grupo: pasta(caminho) || '(arquivos DBF)', tabela: t.nome.replace(/\.dbf$/i, ''), colunas: t.campos.map(c => c.nome), registros: t.registros, bytes: null, arquivo: caminho });
    });

    if (!backups.length && !dbfs.length) avisos.push('Nenhum backup do PostgreSQL nem tabela DBF encontrados nos arquivos escolhidos.');
    if (backups.length && !dbfs.length && entradas.length === 1) avisos.push('Só a parte PostgreSQL (.backup) foi carregada. No modo SQL, o cadastro das empresas vem no .zip do mesmo backup: adicione-o para ver as duas partes juntas.');
    if (dbfs.length && !backups.length) avisos.push('Só arquivos DBF foram carregados. Se o backup é do modo SQL, os dados da folha estão no .backup: adicione-o para ver as duas partes juntas.');

    async function lerTabela(t: TabelaRestauracao, aoLinha: AoLinha): Promise<number> {
        if (t.origem === 'dbf') return dbfs[Number(t.id.slice(3))].t.ler(aoLinha);
        const [pg, id] = t.id.slice(2).split(':');
        const b = backups[Number(pg)];
        const tb = b.tabelas.find(x => x.id === id);
        return tb ? b.lerTabela(tb, aoLinha) : 0;
    }

    return {
        arquivos, backups, dbfs: dbfs.map(x => x.t), tabelas,
        grupos: [...new Set(tabelas.map(t => t.grupo))].sort(),
        avisos, lerTabela,
    };
}

const campoCsv = (v: Valor) => (v === null ? '' : /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV com ponto e vírgula e BOM, como o Excel em português abre direto. */
export async function exportarCsv(r: Restauracao, t: TabelaRestauracao): Promise<{ blob: Blob; linhas: number }> {
    const partes: string[] = ['﻿' + t.colunas.map(campoCsv).join(';') + '\r\n'];
    let lote: string[] = [];
    const linhas = await r.lerTabela(t, v => {
        lote.push(v.map(campoCsv).join(';'));
        if (lote.length >= 5000) { partes.push(lote.join('\r\n') + '\r\n'); lote = []; }
    });
    if (lote.length) partes.push(lote.join('\r\n') + '\r\n');
    return { blob: new Blob(partes, { type: 'text/csv;charset=utf-8' }), linhas };
}
