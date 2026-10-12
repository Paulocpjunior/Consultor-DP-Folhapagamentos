// Tabelas do eSocial usadas no Consultor × as tabelas oficiais (leiaute S-1.3, NT 07/2026 rev. 24/09/2026, lidas da
// documentação técnica no gov.br em 12/10/2026 e guardadas em fixtures/tabelasEsocialS13.json).
// - O que o Consultor GERA hoje (motivos do motor, naturezas dos modelos e das sugestões) tem de estar vigente;
// - o que só serve para LER o histórico (rótulos, categorias do backup, a lista da regra do afastado) tem de existir;
// - a vigência embutida no app (vigenciaTabelas.ts) é a mesma da tabela oficial.
import { describe, expect, it } from 'vitest';
import oficial from './fixtures/tabelasEsocialS13.json';
import { CATEGORIAS_ESOCIAL } from '../../cadastros/cargaBackupIob';
import { MOTIVOS, validarAfastamento } from '../../cadastros/afastamentos';
import { COD_INC_IRRF } from '../../cadastros/rubricas';
import { MOTIVOS_DESLIGAMENTO } from '../../cadastros/funcionarios';
import { TIPOS_RESCISAO } from '../../calculo/motorRescisao';
import { MOTIVOS_COM_AFASTADO } from '../desligamento';
import { CONFERENCIA_DE_BASE, MODELOS, NAT_RUBR, validarPedido } from '../tabelaRubricas';
import { NATUREZA_MOS, SUGESTAO } from '../eventosFolha';
import { foraDaVigencia, VIGENCIAS, type TabelaVigencia } from '../vigenciaTabelas';

type Item = { codigo: string; descricao: string; inicio: string | null; termino: string | null };
const tab = (n: string) => (oficial.tabelas as Record<string, { itens: Item[] }>)[n].itens;
const HOJE = '2026-10-12';
const vigentes = (n: string) => new Set(tab(n).filter(i => (i.inicio ?? '') <= HOJE && (!i.termino || i.termino >= HOJE)).map(i => i.codigo));
const existem = (n: string) => new Set(tab(n).map(i => i.codigo));
const naoVigentes = (cs: Iterable<string>, n: string) => [...new Set(cs)].filter(c => !vigentes(n).has(c)).sort();
const inexistentes = (cs: Iterable<string>, n: string) => [...new Set(cs)].filter(c => !existem(n).has(c)).sort();

describe('o que o Consultor gera está vigente na tabela oficial', () => {
    it('Tabela 19: motivos do motor e da ficha', () => {
        expect(naoVigentes(Object.keys(TIPOS_RESCISAO), '19')).toEqual([]);
        expect(naoVigentes(MOTIVOS_DESLIGAMENTO.map(([c]) => c), '19')).toEqual([]);
    });
    it('Tabela 03: naturezas dos modelos do S-1010, das sugestões do de/para e do MOS', () => {
        expect(naoVigentes(MODELOS.map(m => m.dados.natRubr), '03')).toEqual([]);
        expect(naoVigentes(Object.values(SUGESTAO).flatMap(s => s.naturezas), '03')).toEqual([]);
        expect(naoVigentes(Object.values(NATUREZA_MOS), '03')).toEqual([]);
        expect(naoVigentes(CONFERENCIA_DE_BASE, '03')).toEqual([]);
    });
    it('Tabela 21: incidência do IRRF dos modelos', () => expect(naoVigentes(MODELOS.map(m => m.dados.codIncIRRF), '21')).toEqual([]));
});

describe('o que serve para ler o histórico existe na tabela oficial', () => {
    it('categorias, motivos de afastamento, naturezas, IRRF e a lista da regra do afastado', () => {
        expect(inexistentes(CATEGORIAS_ESOCIAL, '01')).toEqual([]);
        expect(inexistentes(Object.keys(MOTIVOS), '18')).toEqual([]);
        expect(inexistentes(Object.keys(NAT_RUBR), '03')).toEqual([]);
        expect(inexistentes(Object.keys(COD_INC_IRRF), '21')).toEqual([]);
        expect(inexistentes(MOTIVOS_COM_AFASTADO, '19')).toEqual([]);
    });
});

describe('vigência embutida no app = tabela oficial', () => {
    it('as faixas de 01, 03, 18 e 19 batem', () => {
        for (const n of ['01', '03', '18', '19'] as TabelaVigencia[]) {
            const doFixture: Record<string, [string, string | null][]> = {};
            for (const i of tab(n)) (doFixture[i.codigo] ??= []).push([i.inicio ?? '2014-01-01', i.termino]);
            expect(VIGENCIAS[n]).toEqual(doFixture);
        }
    });
    it('foraDaVigencia: encerrado com a substituta, futuro, inexistente e vigente', () => {
        expect(foraDaVigencia('03', '1002', '2026-10')).toBe('Natureza 1002 (Tabela 03 do eSocial): encerrado em 30/04/2024 na tabela oficial; use 1012.');
        expect(foraDaVigencia('03', '1002', '2024-04')).toBeNull();
        expect(foraDaVigencia('18', '46', '2026-10-12')).toBe('Motivo de afastamento 46 (Tabela 18 do eSocial): só vale a partir de 01/01/2027.');
        expect(foraDaVigencia('18', '46', '2027-01-01')).toBeNull();
        expect(foraDaVigencia('01', '999', '2026-10-12')).toMatch(/não existe na tabela oficial/);
        expect(foraDaVigencia('01', '107', '2023-02-01')).toMatch(/encerrado em 31\/12\/2022/);
        expect(foraDaVigencia('03', '1016', '2026-10')).toBeNull(); // descrição nova a partir de 2026, mesmo código
    });
    it('nas validações: S-1010 com natureza encerrada e afastamento com motivo encerrado', () => {
        const dados = { ...MODELOS[0].dados, natRubr: '1002' };
        const p = validarPedido({ acao: 'inclusao', codRubr: 'X1', ideTabRubr: 'T', iniValid: '2026-10', dados } as never, []);
        expect(p.erros).toContain('Natureza 1002 (Tabela 03 do eSocial): encerrado em 30/04/2024 na tabela oficial; use 1012.');
        const a = validarAfastamento({ id: 'a', fichaId: 'f', dtInicio: '2026-10-01', dtFim: '2026-10-05', motivo: '30' } as never, undefined, []);
        expect(a.erros.join(' ')).toMatch(/Motivo de afastamento 30 .*encerrado em 18\/07\/2021.*lance os dias como faltas/);
    });
});
