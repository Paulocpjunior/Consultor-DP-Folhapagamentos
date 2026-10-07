// Registro de guarda dos backups: SHA-256 em fatias e conferência.
import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { fonteDeBytes } from '../../iobSage/backupPostgres';
import { Sha256, sha256DaFonte } from '../sha256';
import { conferirArquivo, tamanhoLegivel, validarRegistro, type RegistroGuarda } from '../guarda';

const ref = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('SHA-256 incremental', () => {
    it('igual ao node:crypto em tamanhos de borda e em fatias de qualquer tamanho', async () => {
        expect(new Sha256().hex()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(new Sha256().atualizar(new TextEncoder().encode('abc')).hex()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
        for (const n of [55, 56, 63, 64, 65, 119, 120, 1000, 100_003]) {
            const b = new Uint8Array(randomBytes(n));
            expect(new Sha256().atualizar(b).hex()).toBe(ref(b));
            const progresso: number[] = [];
            expect(await sha256DaFonte(fonteDeBytes(b), f => progresso.push(f), 7)).toBe(ref(b));
            expect(progresso[progresso.length - 1]).toBe(1);
        }
        const b = new Uint8Array(randomBytes(300));
        const s = new Sha256(); s.atualizar(b.subarray(0, 1)); s.atualizar(b.subarray(1, 70)); s.atualizar(b.subarray(70));
        expect(s.hex()).toBe(ref(b));
    });
});

describe('registro e conferência', () => {
    const sha = 'a'.repeat(64);
    const reg: RegistroGuarda = { id: sha, sha256: sha, arquivo: 'folha_20261006.backup', tamanho: 1000, dataBackup: '2026-10-06', empresas: ['1200'], localGuarda: 'UNAS Pro 4', observacao: '', registradoPor: 'u', registradoPorEmail: 'e' };

    it('valida os campos obrigatórios', () => {
        expect(validarRegistro(reg)).toEqual([]);
        expect(validarRegistro({ ...reg, id: 'x', dataBackup: '', localGuarda: ' ', tamanho: 0 })).toHaveLength(4);
    });

    it('íntegro, renomeado, alterado ou não registrado', () => {
        expect(conferirArquivo([reg], sha, 'folha_20261006.backup', 1000).situacao).toBe('integro');
        expect(conferirArquivo([reg], sha, 'copia.backup', 1000).situacao).toBe('nome-diferente');
        expect(conferirArquivo([reg], 'b'.repeat(64), 'folha_20261006.backup', 1000).situacao).toBe('alterado');
        expect(conferirArquivo([reg], 'b'.repeat(64), 'outro.backup', 5).situacao).toBe('nao-registrado');
        expect(tamanhoLegivel(1_500_000_000)).toBe('1,40 GB');
    });
});
