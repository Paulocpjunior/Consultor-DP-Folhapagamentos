// Tabelas reais geradas com a biblioteca Python "dbf" 0.99.11 (fixtures/dbf):
//   EMPRESAS.DBF/.DBT — dBASE III com memo, code page 850, 1 registro apagado
//   FUNCIONA.DBF/.FPT — Visual FoxPro, code page 1252, tipos I, Y, B, T, L, M e campo NULL
//   SEMCP.DBF/.DBT    — cópia de EMPRESAS com o byte de code page zerado

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fonteDeBytes, type Valor } from '../backupPostgres';
import { abrirDbf, decodificar, deduzirCodificacao } from '../dbf';

const FX = join(__dirname, 'fixtures', 'dbf');
const f = (n: string) => fonteDeBytes(new Uint8Array(readFileSync(join(FX, n))));
async function tudo(t: { ler: (a: (v: Valor[]) => void) => Promise<number> }) { const out: Valor[][] = []; await t.ler(v => { out.push(v); }); return out; }

describe('DBF', () => {
    it('dBASE III com memo, cp850: campos, valores, acentos e registro apagado fora', async () => {
        const t = await abrirDbf(f('EMPRESAS.DBF'), 'EMPRESAS.DBF', f('EMPRESAS.DBT'));
        expect(t).toMatchObject({ versao: 0x83, descricaoVersao: 'dBASE III com memo', registros: 3, codificacao: 'cp850', codificacaoDeduzida: false, temMemo: true, memoAusente: false });
        expect(t.campos.map(c => `${c.nome}:${c.tipo}`)).toEqual(['CODIGO:N', 'RAZAO:C', 'CNPJ:C', 'ABERTURA:D', 'ATIVA:L', 'CAPITAL:N', 'OBS:M']);
        expect(await tudo(t)).toEqual([
            ['1', '2XR ENGENHARIA LTDA', '29463877000109', '2018-01-15', 'true', '150000.50', 'Matriz em São Paulo'],
            ['2', 'COMÉRCIO SÃO JOÃO AÇÚCAR ÇÃO', '11222333000181', '2001-12-31', 'false', '0.00', 'Filial'],
        ]);
        expect(t.atualizadoEm).toMatch(/^20\d\d-\d\d-\d\d$/);
    });

    it('Visual FoxPro com .FPT, cp1252: inteiro, moeda, double, data e hora, lógico e memo com quebra de linha', async () => {
        const t = await abrirDbf(f('FUNCIONA.DBF'), 'FUNCIONA.DBF', f('FUNCIONA.FPT'));
        expect(t).toMatchObject({ versao: 0x30, codificacao: 'windows-1252' });
        expect(t.campos.map(c => c.nome)).toEqual(['CODIGO', 'NOME', 'ADMISSAO', 'SALARIO', 'HORAS', 'ATUALIZ', 'DEMITIDO', 'OBS', 'CARGO']);
        expect(t.campos.find(c => c.nome === 'CARGO')?.anulavel).toBe(true);
        const [a, b] = await tudo(t);
        expect(a).toEqual(['836292', 'ANDRÉ LUIS DE JESUS DOS SANTOS', '2026-09-16', '3243.6500', '220', '2026-09-28 14:30:05', 'false', 'linha 1\r\nlinha 2 com acentuação', 'AUXILIAR']);
        expect(b.slice(0, 7)).toEqual(['2', "JOSÉ D'ÁVILA", null, '1518.0000', '0', null, 'true']);
    });

    it('sem o arquivo de memo: avisa e deixa o memo vazio, sem quebrar', async () => {
        const t = await abrirDbf(f('FUNCIONA.DBF'), 'FUNCIONA.DBF', null);
        expect(t.memoAusente).toBe(true);
        expect(t.avisos.join(' ')).toMatch(/memo/);
        expect((await tudo(t))[0][7]).toBeNull();
    });

    it('sem code page no cabeçalho: deduz cp850 pelo conteúdo', async () => {
        const t = await abrirDbf(f('SEMCP.DBF'), 'SEMCP.DBF', f('SEMCP.DBT'));
        expect(t).toMatchObject({ codificacao: 'cp850', codificacaoDeduzida: true });
        expect((await tudo(t))[1][1]).toBe('COMÉRCIO SÃO JOÃO AÇÚCAR ÇÃO');
    });

    it('a codificação pode ser forçada', async () => {
        const t = await abrirDbf(f('SEMCP.DBF'), 'SEMCP.DBF', f('SEMCP.DBT'), { codificacao: 'windows-1252' });
        expect((await tudo(t))[1][1]).not.toBe('COMÉRCIO SÃO JOÃO AÇÚCAR ÇÃO');
    });

    it('recusa arquivo que não é DBF', async () => {
        await expect(abrirDbf(fonteDeBytes(new TextEncoder().encode('isto não é um dbf, só texto comprido o bastante')), 'x.dbf')).rejects.toThrow(/não parece um DBF/);
    });

    it('code pages DOS e dedução', () => {
        expect(decodificar(new Uint8Array([0x80, 0x87, 0xc6, 0xe4]), 'cp850')).toBe('ÇçãõDOS'.slice(0, 4));
        expect(deduzirCodificacao(new TextEncoder().encode('abc'))).toBe('windows-1252');
        expect(deduzirCodificacao(new Uint8Array([0x87, 0xc6, 0x82]))).toBe('cp850');
        expect(deduzirCodificacao(new Uint8Array([0xe7, 0xe3, 0xe9]))).toBe('windows-1252');
    });
});
