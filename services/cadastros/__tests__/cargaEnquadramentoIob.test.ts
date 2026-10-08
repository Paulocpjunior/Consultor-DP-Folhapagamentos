import { describe, expect, it } from 'vitest';
import { anomes, aplicarFpasPadrao, aplicarRegime, codigoDoSchema, fapDe, gravavel, periodosDoDeptoMa, proporEnquadramentos, regimeDaClassTrib, sugestoesTerceiros } from '../cargaEnquadramentoIob';
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
        schemas: [{ grupo: 'f0012', depto: T(['coddepto', 'fpas', 'codterc', 'percterc'], [['1', '', '', ''], ['2', '515', '0115', '5,8']]) }],
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

describe('só com o .backup da empresa (schema fNNNN)', () => {
    // Colunas como estão no inventário do backup da empresa 1200 (06/10/2026).
    const DEPTO_MA = ['composto', 'depsetsec', 'anomes', 'codgps', 'percterc', 'percsat', 'percinss', 'meepp', 'percfap', 'fpas', 'codterc'];
    const ma = (dep: string, mes: string, terc: string, rat: string, fap: string, fpas = '515', cod = '0115') => ['', dep, mes, '2100', terc, rat, '20', '', fap, fpas, cod];
    const S1000 = ['pk_padrao', 'codigo', 'tpinsc', 'nrinsc', 'nmrazao', 'classtrib'];

    it('troca de regime no S-1000: cada vigência com o regime da época; a troca abre vigência; FPAS do backup volta ao trocar para Normal', () => {
        const emp = [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }];
        // Normal desde 2015; Simples desde 03/2025. O depto_ma tem os mesmos parâmetros de 01/2025 a 06/2025.
        const s1000 = T([...S1000, 'inivalid'], [['1', '1', '1', '11222333', 'A', '99', '2015-01'], ['2', '1', '1', '11222333', 'A', '01', '2025-03']]);
        const meses = ['202501', '202502', '202503', '202504', '202505', '202506'].map(m => ma('1', m, '5,8', '2', '1,0000'));
        const r = proporEnquadramentos({ schemas: [{ grupo: 'f1200', s1000, deptoMa: T(DEPTO_MA, meses) }] }, emp, [], '2025-01');
        expect(r.propostas.map(p => [p.enquadramento.vigencia, p.enquadramento.regime, p.enquadramento.fpas])).toEqual([['2025-01', 'normal', '515'], ['2025-03', 'simples', '']]);
        expect(r.propostas[0].pendencias.join(' ')).toMatch(/Regime normal nesta vigência pelo S-1000 do backup \(o atual é simples\)/);
        // A equipe troca a vigência do Simples para Normal: o FPAS e os terceiros do backup voltam.
        expect(aplicarRegime(r.propostas[1], 'normal').enquadramento).toMatchObject({ regime: 'normal', fpas: '515', codigoTerceiros: '0115', terceiros: 5.8 });
    });
    it('períodos do depto_ma: muda o parâmetro, nova vigência; só os que valem a partir do corte; lotação com mais meses', () => {
        const ls = [
            ma('1', '202401', '5,8', '2', '1,0000'), ma('1', '202402', '5,8', '2', '1,0000'), ma('1', '202501', '5,8', '2', '0,9512'),
            ma('1', '202502', '5,8', '2', '0,9512'), ma('1', '202601', '5,8', '3', '0,9512'), ma('2', '202601', '4,5', '1', '1,0000'),
        ].map(l => Object.fromEntries(DEPTO_MA.map((c, i) => [c, l[i]])));
        const r = periodosDoDeptoMa(ls, '2025-01');
        expect(r.periodos).toEqual([
            { ini: '2025-01', fap: 0.9512, rat: 2, fpas: '515', codigoTerceiros: '0115', terceiros: 5.8 },
            { ini: '2026-01', fap: 0.9512, rat: 3, fpas: '515', codigoTerceiros: '0115', terceiros: 5.8 },
        ]);
        expect(r.aviso).toMatch(/Mais de uma lotação no depto_ma \(2\): usada a 1/);
        expect(periodosDoDeptoMa(ls.filter(l => l.depsetsec === '1'), '2024-06').periodos[0].ini).toBe('2024-01');
        expect(codigoDoSchema('f1200')).toBe('1200');
        expect(codigoDoSchema('backup.f0012')).toBe('12');
        expect(codigoDoSchema('empresa')).toBe('');
    });
    it('duas trocas de regime com dois períodos do depto_ma: cada troca copia o período imediatamente anterior', () => {
        const emp = [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }];
        // FAP 0,98 em 2025 e 1,01 em 2026; Simples em 03/2025 e volta ao Normal em 03/2026.
        const s1000 = T([...S1000, 'inivalid'], [['1', '1', '1', '11222333', 'A', '99', '2015-01'], ['2', '1', '1', '11222333', 'A', '01', '2025-03'], ['3', '1', '1', '11222333', 'A', '99', '2026-03']]);
        const meses = [ma('1', '202501', '5,8', '2', '0,9800'), ma('1', '202601', '5,8', '2', '1,0100')];
        const r = proporEnquadramentos({ schemas: [{ grupo: 'f1200', s1000, deptoMa: T(DEPTO_MA, meses) }] }, emp, [], '2025-01');
        expect(r.propostas.map(p => [p.enquadramento.vigencia, p.enquadramento.regime, p.enquadramento.fap])).toEqual([
            ['2025-01', 'normal', 0.98], ['2025-03', 'simples', 0.98], ['2026-01', 'simples', 1.01], ['2026-03', 'normal', 1.01],
        ]);
    });
    it('sem tabelas de sistema: regime pelo classtrib do S-1000 do schema, FPAS/RAT/FAP do depto_ma, CNPJ conferido', () => {
        const r = proporEnquadramentos({
            schemas: [{
                grupo: 'f1200',
                s1000: T(S1000, [['1', '1', '1', '11222333', 'ALFA LTDA', '99']]),
                deptoMa: T(DEPTO_MA, [ma('1', '202501', '5,8', '2', '0,9800'), ma('1', '202601', '5,8', '2', '1,0100')]),
                depto: T(['coddepto', 'percsat', 'cnaef20', 'fpas', 'codterc', 'percterc'], [['1', '2', '4711302', '515', '0115', '5,8']]),
            }],
        }, [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }], [], '2025-01');
        expect(r.semDados).toEqual([]);
        expect(r.propostas.map(p => p.enquadramento)).toMatchObject([
            { id: 'A_2025-01', regime: 'normal', rat: 2, fap: 0.98, fpas: '515', codigoTerceiros: '0115', terceiros: 5.8 },
            { id: 'A_2026-01', regime: 'normal', rat: 2, fap: 1.01, fpas: '515', terceiros: 5.8 },
        ]);
        expect(r.propostas[0].enquadramento.observacao).toBe('Carga do backup do IOB (código 1200, depto_ma) · CNAE 4711302');
        expect(r.propostas.every(p => gravavel(p) && !p.pendencias.length)).toBe(true);
        const outro = proporEnquadramentos({ schemas: [{ grupo: 'f1200', s1000: T(S1000, [['1', '1', '1', '99888777', 'X', '01']]) }] }, [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }], [], '2025-01');
        expect(outro.propostas[0].erros[0]).toMatch(/raiz 99888777/);
        // Uma fonte certa (ESOCIALEMPRESA) não salva outra errada (S-1000 do schema).
        const misto = proporEnquadramentos({
            esocialEmpresa: T(ESOCIALEMPRESA, [eEmp('1200', '202501', '', '1,0000', '11222333000181')]),
            schemas: [{ grupo: 'f1200', s1000: T(S1000, [['1', '1', '1', '99888777', 'X', '99']]) }],
        }, [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }], [], '2025-01');
        expect(misto.propostas[0].erros[0]).toMatch(/raiz 99888777\) não é o da empresa \(raiz 11222333\)/);
        // S-1005 sem RAT válido: o RAT do depto é a reserva.
        const reserva = proporEnquadramentos({
            es1005: T(ES_S1005, [e1005('1200', '')]),
            schemas: [{ grupo: 'f1200', s1000: T(S1000, [['1', '1', '1', '11222333', 'A', '01']]), depto: T(['coddepto', 'percsat'], [['1', '3']]) }],
        }, [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }], [], '2025-01');
        expect(reserva.propostas[0].enquadramento.rat).toBe(3);
        expect(outro.propostas[0].enquadramento.regime).toBe('simples');
    });
    it('S-1000 com histórico: vale a linha mais recente (empresa que entrou no Simples)', () => {
        const emp = [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }];
        const hist = proporEnquadramentos({ schemas: [{ grupo: 'f1200', s1000: T(S1000, [['1', '1', '1', '11222333', 'A', '99'], ['7', '1', '1', '11222333', 'A', '01']]) }] }, emp, [], '2025-01');
        expect(hist.propostas[0].enquadramento.regime).toBe('simples');
        expect(gravavel(hist.propostas[0])).toBe(true);
        const porVigencia = T([...S1000, 'inivalid'], [['9', '1', '1', '11222333', 'A', '99', '2015-01'], ['2', '1', '1', '11222333', 'A', '1', '2019-03']]);
        expect(proporEnquadramentos({ schemas: [{ grupo: 'f1200', s1000: porVigencia }] }, emp, [], '2025-01').propostas[0].enquadramento.regime).toBe('simples');
    });

    it('regime informado pela equipe vale sobre o backup', () => {
        const emp = [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }];
        const [normal] = proporEnquadramentos({ schemas: [{ grupo: 'f1200', s1000: T(S1000, [['1', '1', '1', '11222333', 'A', '99']]), depto: T(['coddepto', 'fpas', 'codterc', 'percterc'], [['1', '515', '0115', '5,8']]) }] }, emp, [], '2025-01').propostas;
        expect(normal.erros).toContain('RAT: 1, 2 ou 3% (pelo CNAE preponderante).');
        const simples = aplicarRegime(normal, 'simples');
        expect(simples.enquadramento).toMatchObject({ regime: 'simples', fpas: '', codigoTerceiros: '', terceiros: 0 });
        expect(gravavel(simples)).toBe(true);
        expect(simples.pendencias.join(' ')).toMatch(/Regime informado na restauração \(simples\); no backup: normal/);
        expect(aplicarRegime(simples, 'simples')).toBe(simples);
        // O FPAS padrão não se aplica fora do regime normal.
        expect(aplicarFpasPadrao(simples, { fpas: '515', codigoTerceiros: '0115', terceiros: 5.8 })).toBe(simples);
    });

    it('S-1000 com linha de outra inscrição: vale a da empresa; a outra vira pendência', () => {
        const emp = [{ id: 'A', nome: 'ALFA', cnpj: '11222333000181', codigoSage: '1200' }];
        const s1000 = T(S1000, [['1', '1', '1', '11222333', 'A', '01'], ['5', '1', '1', '44388152000100', 'OUTRA', '99']]);
        const [p] = proporEnquadramentos({ schemas: [{ grupo: 'f1200', s1000 }] }, emp, [], '2025-01').propostas;
        expect(p.enquadramento.regime).toBe('simples');
        expect(p.erros).toEqual([]);
        expect(p.pendencias.join(' ')).toMatch(/outra raiz \(44388152\): ignorada; usado o da empresa \(raiz 11222333\)/);
    });
});
