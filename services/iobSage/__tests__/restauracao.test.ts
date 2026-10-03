// Cenário do "Backup SQL" da linha Office: .zip com o cadastro (DBF) + .backup
// com a folha (PostgreSQL). Monta o zip com as tabelas DBF reais de fixtures/dbf
// e usa o dump real do PostgreSQL 12 de fixtures/.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fonteDeBytes, type Valor } from '../backupPostgres';
import { abrirRestauracao, exportarCsv } from '../restauracao';
import { gerarZip } from '../../implantacao/zip';

const FX = join(__dirname, 'fixtures');
const ler = (p: string) => new Uint8Array(readFileSync(join(FX, p)));
const zipCadastro = () => gerarZip([
    { nome: 'EMPRESAS/EMPRESAS.DBF', conteudo: ler('dbf/EMPRESAS.DBF') },
    { nome: 'EMPRESAS/EMPRESAS.DBT', conteudo: ler('dbf/EMPRESAS.DBT') },
    { nome: 'FOLHA/FUNCIONA.DBF', conteudo: ler('dbf/FUNCIONA.DBF') },
    { nome: 'FOLHA/FUNCIONA.FPT', conteudo: ler('dbf/FUNCIONA.FPT') },
    { nome: 'LEIAME.TXT', conteudo: 'backup de teste' },
]);

describe('restauração em duas partes', () => {
    it('zip de cadastro (DBF) + .backup (PostgreSQL 12): lista tudo, casa memo pela pasta e lê as duas origens', async () => {
        const r = await abrirRestauracao([
            { nome: 'BACKUP_SQL.zip', fonte: fonteDeBytes(zipCadastro()) },
            { nome: 'BACKUP_SQL.backup', fonte: fonteDeBytes(ler('pg12-custom.backup')) },
        ]);
        expect(r.arquivos.map(a => [a.caminho, a.tipo])).toEqual([
            ['BACKUP_SQL.zip', 'zip'],
            ['BACKUP_SQL.backup', 'pg_dump'],
            ['BACKUP_SQL.zip/EMPRESAS/EMPRESAS.DBT', 'memo'],
            ['BACKUP_SQL.zip/FOLHA/FUNCIONA.FPT', 'memo'],
            ['BACKUP_SQL.zip/LEIAME.TXT', 'outro'],
            ['BACKUP_SQL.zip/EMPRESAS/EMPRESAS.DBF', 'dbf'],
            ['BACKUP_SQL.zip/FOLHA/FUNCIONA.DBF', 'dbf'],
        ]);
        expect(r.arquivos.find(a => a.tipo === 'pg_dump')?.detalhe).toMatch(/PostgreSQL 12\.22/);
        expect(r.grupos).toEqual(['BACKUP_SQL.zip/EMPRESAS', 'BACKUP_SQL.zip/FOLHA', 'e0001', 'e0002', 'gen']);
        expect(r.avisos).toEqual([]);

        const empresas = r.tabelas.find(t => t.tabela === 'EMPRESAS')!;
        expect(empresas).toMatchObject({ origem: 'dbf', registros: 3 });
        const linhas: Valor[][] = [];
        await r.lerTabela(empresas, v => { linhas.push(v); });
        expect(linhas.map(l => l[1])).toEqual(['2XR ENGENHARIA LTDA', 'COMÉRCIO SÃO JOÃO AÇÚCAR ÇÃO']);
        expect(linhas[0][6]).toBe('Matriz em São Paulo');

        const pg = r.tabelas.find(t => t.grupo === 'gen' && t.tabela === 'empresas')!;
        const lpg: Valor[][] = [];
        await r.lerTabela(pg, v => { lpg.push(v); });
        expect(lpg).toHaveLength(2);

        const { blob, linhas: n } = await exportarCsv(r, r.tabelas.find(t => t.tabela === 'FUNCIONA')!);
        expect(n).toBe(2);
        expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(await blob.arrayBuffer()))).toContain('"linha 1\r\nlinha 2 com acentuação"');
    });

    it('reconhece pela assinatura: zip com extensão .SBKP também abre', async () => {
        const r = await abrirRestauracao([{ nome: 'TODAS.SBKP', fonte: fonteDeBytes(zipCadastro()) }]);
        expect(r.arquivos[0]).toMatchObject({ tipo: 'zip', detalhe: '5 arquivo(s)' });
        expect(r.tabelas.map(t => t.tabela).sort()).toEqual(['EMPRESAS', 'FUNCIONA']);
        expect(r.avisos.join(' ')).toMatch(/adicione-o para ver as duas partes juntas/);
    });

    it('só o .backup: avisa que o cadastro das empresas vem no .zip', async () => {
        const r = await abrirRestauracao([{ nome: 'x.backup', fonte: fonteDeBytes(ler('pg12-custom.backup')) }]);
        expect(r.avisos.join(' ')).toMatch(/cadastro das empresas vem no \.zip/);
    });

    it('DBF sem o memo ao lado: lê e avisa', async () => {
        const r = await abrirRestauracao([{ nome: 'FUNCIONA.DBF', fonte: fonteDeBytes(ler('dbf/FUNCIONA.DBF')) }]);
        expect(r.avisos.join(' ')).toMatch(/\.FPT\/\.DBT não veio junto/);
    });

    it('arquivo que não é nada conhecido aparece na lista, sem derrubar o resto', async () => {
        const r = await abrirRestauracao([{ nome: 'foto.jpg', fonte: fonteDeBytes(new Uint8Array(600).fill(7)) }]);
        expect(r.arquivos[0].tipo).toBe('outro');
        expect(r.avisos.join(' ')).toMatch(/Nenhum backup/);
    });
});
