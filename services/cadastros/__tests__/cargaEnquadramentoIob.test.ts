import { describe, expect, it } from 'vitest';
import { anomes, aplicarFpasPadrao, fapDe, gravavel, proporEnquadramentos, regimeDaClassTrib, sugestoesTerceiros } from '../cargaEnquadramentoIob';
import type { TabelaLida } from '../cargaBackupIob';
import { enquadramentoVazio } from '../enquadramento';

const T = (colunas: string[], linhas: (string | null)[][]): TabelaLida => ({ colunas, linhas });
// Colunas como estão no inventário do backup do FolhaWin.
const ES_S1005 = ['PK_PADRAO', 'FK_ESOCIAL', 'CODEMPRESA', 'PERCSAT', 'RATAJUS', 'CNAEF20', 'FKINDCONS', 'NROPROCRAT', 'FKTPCAEPF', 'NROCAEPF', 'FK_S1000'];
const ESOCIALEMPRESA = ['PK_PADRAO', 'CODEMPRESA', 'TPINSCR', 'NROINSCR', 'ANOMESINI', 'ANOMESFIM', 'FAP', 'REGISTRO', 'STATUS', 'CNPJCPF', 'NROPROC'];
const ES_S1000 = ['PK_PADRAO', 'CODEMPRESA', 'FK_ESOCIAL', 'FKCLASTRIB'];
const e1005 = (cod: string, rat: string, ajus = '', cnae = '4711302') => ['1', '1', cod, rat, ajus, cnae, '', '', '', '', ''];
const eEmp = (cod: string, ini: string, fim: string, fap: string, cnpj = '') => ['1', cod, '1', cnpj.slice(0, 8), ini, fim, fap, '', '', cnpj, ''];

const EMPRESAS = [
    { id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '0012' },
    { id: 'B', nome: 'BETA', cnpj: '11444777000161', codigoSage: '13' },
    { id: 'C', nome: 'GAMA', cnpj: '29463877000109', codigoSage: '14' },
    { id: 'D', nome: 'DELTA', cnpj: '33000167000101', codigoSage: '99' },
];

describe('leitura dos campos do IOB', () => {
    it('competência, FAP e classificação tributária', () => {
        expect(['202501', '2025-01', '2025/01', '01/2025', '012025', '2025-01-01 00:00', '', '202513', 'abc'].map(anomes))
            .toEqual(['2025-01', '2025-01', '2025-01', '2025-01', '2025-01', '2025-01', '', '', '']);
        expect(['1,0000', '0.9512', '10000', '2,5', '', '0'].map(fapDe)).toEqual([1, 0.9512, 1, NaN, NaN, NaN]);
        expect(regimeDaClassTrib('1')).toEqual({ regime: 'simples' });
        expect(regimeDaClassTrib('02')).toEqual({ regime: 'simples-iv' });
        expect(regimeDaClassTrib('99')).toEqual({ regime: 'normal' });
        expect(regimeDaClassTrib('03').pendencia).toMatch(/classTrib 03/);
        expect(regimeDaClassTrib('5').pendencia).toMatch(/"5" não reconhecida/);
        expect(regimeDaClassTrib('').pendencia).toMatch(/Sem classificação/);
    });
    it('TERC vira sugestão de FPAS', () => {
        expect(sugestoesTerceiros(T(['FPAS', 'CODIGO', 'PERCENTUAL', 'DESC', 'PK_PADRAO'], [['515', '0115', '5,8', 'Comércio', '1'], ['', 'x', '1', '', '2'], ['507', '0079', '5.8', 'Indústria', '3']])))
            .toEqual([{ fpas: '507', codigo: '0079', percentual: 5.8, descricao: 'Indústria' }, { fpas: '515', codigo: '0115', percentual: 5.8, descricao: 'Comércio' }]);
    });
});

describe('proposta de enquadramento por empresa', () => {
    const tabelas = {
        es1005: T(ES_S1005, [e1005('12', '2', '1,9024'), e1005('12', '2'), e1005('013', '1'), e1005('13', '3'), e1005('14', '3', '3,0'), e1005('500', '1')]),
        esocialEmpresa: T(ESOCIALEMPRESA, [
            eEmp('12', '202301', '202312', '1,1000', '11222333000181'), eEmp('12', '202401', '202412', '0,9512', '11222333000181'), eEmp('12', '202501', '', '0,9800', '11222333000181'),
            eEmp('14', '202501', '', '1,0000', '99888777000166'),
        ]),
        es1000: T(ES_S1000, [['1', '12', '1', '99'], ['2', '13', '1', '01'], ['3', '14', '1', '99']]),
        deptos: [{ grupo: 'f0012', tabela: T(['coddepto', 'fpas', 'codterc', 'percterc'], [['1', '', '', ''], ['2', '515', '0115', '5,8']]) }],
    };
    const r = proporEnquadramentos(tabelas, EMPRESAS, [{ ...enquadramentoVazio('A'), id: 'A_2025-01', vigencia: '2025-01', rat: 2, fap: 1, fpas: '515', terceiros: 5.8 }], '2024-01');
    const de = (id: string) => r.propostas.filter(p => p.empresa.id === id);

    it('normal com FPAS do depto: um enquadramento por período do FAP a partir do corte; nada é sobrescrito', () => {
        const a = de('A');
        expect(a.map(p => p.enquadramento.vigencia)).toEqual(['2024-01', '2025-01']);
        expect(a[0].enquadramento).toMatchObject({ id: 'A_2024-01', regime: 'normal', rat: 2, fap: 0.9512, fpas: '515', codigoTerceiros: '0115', terceiros: 5.8, patronal: 20 });
        expect(a[0].enquadramento.observacao).toBe('Carga do backup do IOB (código 12) · CNAE 4711302 · RAT ajustado no IOB 1,9024%');
        expect(gravavel(a[0]) && !a[0].pendencias.length).toBe(true);
        expect(a[1].existente?.id).toBe('A_2025-01');
        expect(a[1].diferencas).toEqual(['FAP: cadastrado 1 × IOB 0.98']);
        expect(gravavel(a[1])).toBe(false);
    });
    it('Simples (classTrib 01) sem FAP: vigência no corte, RAT divergente entre estabelecimentos vira pendência', () => {
        const [b] = de('B');
        expect(b.enquadramento).toMatchObject({ regime: 'simples', vigencia: '2024-01', fpas: '', terceiros: 0, rat: 3 });
        expect(b.pendencias.join(' ')).toMatch(/RAT diferentes \(3%, 1%\): usado 3%/);
        expect(b.pendencias.join(' ')).toMatch(/FAP sem período no backup/);
        expect(gravavel(b)).toBe(true);
    });
    it('CNPJ do IOB de outra empresa bloqueia; normal sem FPAS fica pendente até o FPAS padrão', () => {
        const [c] = de('C');
        expect(c.erros[0]).toMatch(/CNPJ no IOB \(raiz 99888777\) não é o da empresa \(raiz 29463877\)/);
        expect(c.erros).toContain('FPAS: 3 dígitos.');
        expect(c.pendencias.join(' ')).toMatch(/FPAS e terceiros não estão neste backup/);
        const comPadrao = aplicarFpasPadrao(c, { fpas: '515', codigoTerceiros: '0115', terceiros: 5.8 });
        expect(comPadrao.enquadramento).toMatchObject({ fpas: '515', terceiros: 5.8 });
        expect(comPadrao.erros).toEqual([c.erros[0]]);
        expect(comPadrao.pendencias.join(' ')).toMatch(/FPAS padrão aplicado/);
        expect(aplicarFpasPadrao(de('B')[0], { fpas: '515', codigoTerceiros: '', terceiros: 5.8 })).toBe(de('B')[0]);
    });
    it('sem dado no backup e código do IOB sem empresa', () => {
        expect(r.semDados.map(e => e.id)).toEqual(['D']);
        expect(r.semEmpresa).toEqual(['500']);
    });
});
