import { describe, expect, it } from 'vitest';
import { aplicarComplementos, chaveColuna, compararComFichas, complementosFolhaWin, dataDoIob, linhaParaCampos, normalizarValor, proporMapeamento } from '../cargaBackupIob';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../funcionarios';

const EMP = { id: 'emp1', cnpj: '11222333000181' };
const CPF_A = '52998224725';
const CPF_B = '11144477735';
const CPF_C = '39053344705';

function ficha(cpf: string, matricula: string, dados: FichaFuncionario['dados'], origens: FichaFuncionario['origens'] = {}): FichaFuncionario {
    return { ...fichaVazia(EMP), id: idFuncionario(EMP.id, cpf, matricula), cpf, matriculaEsocial: matricula, situacao: 'ativo', dados, origens };
}

describe('de/para proposto pelos nomes das colunas', () => {
    it('reconhece nomes típicos de DBF e de tabela do PostgreSQL', () => {
        const colunas = ['CODIGO', 'NOME', 'CPF', 'PIS', 'DT_ADMISSAO', 'DTNASC', 'MATRICULA', 'SALARIO', 'BANCO', 'AGENCIA', 'CONTA', 'DT_DEMISSAO', 'CBO', 'OBS'];
        expect(proporMapeamento(colunas)).toEqual({
            codigoIob: 'CODIGO', nome: 'NOME', cpf: 'CPF', pis: 'PIS', admissao: 'DT_ADMISSAO', nascimento: 'DTNASC',
            matriculaEsocial: 'MATRICULA', salario: 'SALARIO', banco: 'BANCO', agencia: 'AGENCIA', conta: 'CONTA',
            dataDesligamento: 'DT_DEMISSAO', cbo: 'CBO',
        });
        expect(proporMapeamento(['nr_cpf', 'nome_funcionario', 'data_admissão'])).toEqual({ cpf: 'nr_cpf', nome: 'nome_funcionario', admissao: 'data_admissão' });
        expect(chaveColuna('Data_Admissão')).toBe('dataadmissao');
    });

    it('uma coluna não vai para dois campos', () => {
        const m = proporMapeamento(['NUMERO', 'CPF']);
        expect(m).toEqual({ cpf: 'CPF', numero: 'NUMERO' });
        expect(Object.values(proporMapeamento(['NR', 'NUM'])).length).toBe(1);
    });
});

describe('valores do IOB no formato da ficha', () => {
    it('datas', () => {
        expect(dataDoIob('31/12/2025')).toBe('2025-12-31');
        expect(dataDoIob('2025-12-31 00:00:00')).toBe('2025-12-31');
        expect(dataDoIob('20251231')).toBe('2025-12-31');
        expect(dataDoIob('31/02/2025')).toBeNull();
        expect(dataDoIob('1899-12-30')).toBeNull();
        expect(dataDoIob('')).toBeNull();
    });

    it('CPF, salário, sexo, UF e campos vazios', () => {
        expect(normalizarValor('cpf', '529.982.247-25')).toBe(CPF_A);
        expect(normalizarValor('cpf', '1144477735')).toBe('01144477735'); // CPF guardado como número perde o zero
        expect(normalizarValor('cpf', '00000000000')).toBe('');
        expect(normalizarValor('salario', '2500.5')).toBe('2500.50');
        expect(normalizarValor('salario', '1.518,00')).toBe('1518.00');
        expect(normalizarValor('salario', 'abc')).toBe('');
        expect(normalizarValor('sexo', 'Feminino')).toBe('F');
        expect(normalizarValor('uf', 'sp ')).toBe('SP');
        expect(normalizarValor('pis', '000.00000.00-0')).toBe('');
        expect(normalizarValor('nome', '  ANA   MARIA ')).toBe('ANA MARIA');
        expect(normalizarValor('nome', null)).toBe('');
        expect(normalizarValor('admissao', '01/03/2025')).toBe('2025-03-01');
    });

    it('linha da tabela vira campos pelo mapeamento, sem os vazios', () => {
        const colunas = ['COD', 'NOME', 'CPF', 'DTADM', 'BANCO'];
        const l = linhaParaCampos(colunas, ['17', 'ANA', CPF_A, '01/03/2025', null], { codigoIob: 'COD', nome: 'NOME', cpf: 'CPF', admissao: 'DTADM', banco: 'BANCO', conta: 'NAO_EXISTE' }, 3);
        expect(l).toEqual({ linha: 3, valores: { codigoIob: '17', nome: 'ANA', cpf: CPF_A, admissao: '2025-03-01' } });
    });
});

describe('comparação com as fichas do Consultor', () => {
    const fichas = [
        ficha(CPF_A, 'M1', { nome: 'ANA', admissao: '2025-03-01', banco: '' }, { nome: 'eSocial: a.xml' }),
        ficha(CPF_B, 'M2', { nome: 'BRUNO', salario: '3000.00' }),
    ];

    it('preenche vazios, lista divergências e não troca valor existente', () => {
        const r = compararComFichas([
            { linha: 1, valores: { cpf: CPF_A, codigoIob: '17', nome: 'ANA MARIA', banco: '341', admissao: '2025-03-01' } },
            { linha: 2, valores: { cpf: CPF_B, salario: '3200.00' } },
        ], fichas, EMP, 'IOB: backup.zip', false);
        expect(r.completar).toHaveLength(1);
        const c = r.completar[0];
        expect(c.ficha.dados).toMatchObject({ nome: 'ANA', codigoIob: '17', banco: '341', admissao: '2025-03-01' });
        expect(c.ficha.origens).toMatchObject({ nome: 'eSocial: a.xml', codigoIob: 'IOB: backup.zip', banco: 'IOB: backup.zip' });
        expect(c.alteracoes.map(a => a.campo).sort()).toEqual(['banco', 'codigoIob']);
        expect(c.divergencias).toEqual([{ campo: 'nome', consultor: 'ANA', iob: 'ANA MARIA' }]);
        expect(fichas[0].dados.codigoIob).toBeUndefined();
        expect(r.soDivergencias).toEqual([{ ficha: fichas[1], divergencias: [{ campo: 'salario', consultor: '3000.00', iob: '3200.00' }] }]);
        expect(r.novas).toEqual([]);
    });

    it('sem CPF liga pela matrícula; matrícula de outro CPF não liga', () => {
        const r = compararComFichas([
            { linha: 1, valores: { matriculaEsocial: 'M2', codigoIob: '9' } },
            { linha: 2, valores: { cpf: CPF_C, matriculaEsocial: 'M1', nome: 'OUTRA' } },
        ], fichas, EMP, 'IOB', true);
        expect(r.completar.map(c => [c.ficha.cpf, c.ficha.dados.codigoIob])).toEqual([[CPF_B, '9']]);
        expect(r.semFicha).toEqual([expect.objectContaining({ linha: 2, motivo: expect.stringContaining('outro CPF') })]);
        expect(r.novas).toEqual([]);
    });

    it('ficha nova só com CPF válido, matrícula e criação ligada', () => {
        const linhas = [
            { linha: 1, valores: { cpf: CPF_C, matriculaEsocial: 'M3', nome: 'CARLA', dataDesligamento: '2026-01-31' } },
            { linha: 2, valores: { cpf: '12345678900', matriculaEsocial: 'M4', nome: 'CPF RUIM' } },
            { linha: 3, valores: { cpf: '86288366757', nome: 'SEM MATRICULA' } },
            { linha: 4, valores: { nome: 'SÓ NOME' } },
            { linha: 5, valores: { cpf: CPF_C, matriculaEsocial: 'M3', nome: 'CARLA DE NOVO' } },
        ];
        const r = compararComFichas(linhas, fichas, EMP, 'IOB: b', true);
        expect(r.novas).toHaveLength(1);
        expect(r.novas[0].ficha).toMatchObject({ id: idFuncionario(EMP.id, CPF_C, 'M3'), situacao: 'desligado', dados: { nome: 'CARLA', dataDesligamento: '2026-01-31' } });
        expect(r.novas[0].ficha.origens).toMatchObject({ nome: 'IOB: b', situacao: 'IOB: b' });
        expect(r.semFicha.map(s => s.linha)).toEqual([2, 3]);
        expect(r.ignoradas).toBe(1);
        expect(r.avisos).toEqual(['Linha 5: funcionário repetido no IOB; só o primeiro foi usado.']);
        const sem = compararComFichas(linhas.slice(0, 1), fichas, EMP, 'IOB', false);
        expect(sem.novas).toEqual([]);
        expect(sem.semFicha[0].motivo).toContain('desligada');
    });

    it('segundo registro do mesmo funcionário é avisado, não aplicado', () => {
        const r = compararComFichas([
            { linha: 1, valores: { cpf: CPF_A, codigoIob: '17' } },
            { linha: 2, valores: { cpf: CPF_A, codigoIob: '99' } },
        ], fichas, EMP, 'IOB', false);
        expect(r.completar[0].ficha.dados.codigoIob).toBe('17');
        expect(r.avisos[0]).toContain('Linha 2');
    });
});

describe('FolhaWin (schema fNNNN do Backup SQL)', () => {
    // Colunas da tabela `func` do FolhaWin, como estão no inventário do backup (05/10/2026), na ordem original.
    const FUNC = ['codfun', 'nome', 'tiphole', 'sit', 'endereco', 'numero', 'comple', 'bairro', 'cid', 'cep', 'uf', 'telefone', 'ramal', 'email', 'foto', 'sexo', 'nasc', 'funcao', 'depto', 'cbo', 'grusal',
        'codsind', 'dtadm', 'tipadm', 'tipmov', 'dtres', 'dteadm', 'numcp', 'sercp', 'ufcp', 'cpf', 'numrg', 'dtemrg', 'orgrg', 'pis', 'numtit', 'zonvot', 'bcofgt', 'dvcc', 'ufccfgts', 'cc', 'bcosal', 'agdsal',
        'pai', 'mae', 'nacio', 'salban', 'ufrg', 'cargo', 'complem', 'matricula', 'dtctps', 'agfgts'];
    it('as siglas do FolhaWin entram no de/para', () => {
        expect(proporMapeamento(FUNC)).toMatchObject({
            codigoIob: 'codfun', dataDesligamento: 'dtres', ctps: 'numcp', serieCtps: 'sercp', ufCtps: 'ufcp', orgaoRg: 'orgrg', emissaoRg: 'dtemrg',
            tituloEleitor: 'numtit', sindicatoIob: 'codsind', banco: 'bcosal', agencia: 'agdsal', complemento: 'comple',
            cpf: 'cpf', nome: 'nome', nascimento: 'nasc', admissao: 'dtadm', rg: 'numrg', numero: 'numero', departamentoIob: 'depto',
        });
    });

    it('salário atual (marcado em "ultimo", senão o mais recente) e PIX pelo codfun', () => {
        const salarios = { colunas: ['composto', 'codfun', 'codeven', 'anomes', 'valor', 'ultimo'], linhas: [
            ['1', '0007', '1', '202401', '2000,00', 'N'], ['2', '0007', '1', '202501', '2500,00', 'S'], ['3', '0007', '1', '202502', '9999,00', 'N'],
            ['4', '8', '1', '202401', '1800.00', null], ['5', '8', '1', '202503', '1900.00', ''], ['6', '9', '1', '202503', '', 'S'],
        ] };
        const funcdoc = { colunas: ['codfun', 'tipo', 'tpchavepix', 'vlchavepix'], linhas: [['7', '1', '1', ''], ['7', '2', '1', 'ana@x.com'], ['8', '1', '3', '+5511999990000']] };
        const c = complementosFolhaWin(salarios, funcdoc);
        expect(c.get('7')).toEqual({ salario: '2500.00', pix: 'ana@x.com' });
        expect(c.get('8')).toEqual({ salario: '1900.00', pix: '+5511999990000' });
        expect(c.has('9')).toBe(false);
        const linhas = aplicarComplementos([
            { linha: 1, valores: { cpf: '52998224725', codigoIob: '007' } },
            { linha: 2, valores: { cpf: '11144477735', codigoIob: '8', salario: '1500.00' } },
            { linha: 3, valores: { cpf: '39053344705' } },
        ], c);
        expect(linhas[0].valores).toMatchObject({ salario: '2500.00', pix: 'ana@x.com' });
        expect(linhas[1].valores).toMatchObject({ salario: '1500.00', pix: '+5511999990000' });
        expect(linhas[2].valores).toEqual({ cpf: '39053344705' });
        expect(complementosFolhaWin(null, null).size).toBe(0);
    });

    it('matrícula do eSocial pelo S-1200 mais recente (a func do FolhaWin vem sem matrícula)', () => {
        const s1200 = { colunas: ['anomes', 'codfun', 'pk_padrao', 'fk_ficha', 'matricula', 'indsimples', 'grauexp'], linhas: [
            ['202401', '0007', '1', '1', 'MAT-ANTIGA', '', ''], ['202509', '7', '2', '1', '000123', '', ''], ['202508', '8', '3', '1', '', '', ''],
        ] };
        const c = complementosFolhaWin(null, null, s1200);
        expect(c.get('7')).toEqual({ matriculaEsocial: '000123' });
        expect(c.has('8')).toBe(false);
        const [l] = aplicarComplementos([{ linha: 1, valores: { cpf: '52998224725', codigoIob: '7', nome: 'ANA' } }], c);
        expect(l.valores.matriculaEsocial).toBe('000123');
        const fichas = compararComFichas([l], [], { id: 'emp1', cnpj: '11222333000181' }, 'IOB', true);
        expect(fichas.novas.map(n => n.ficha.matriculaEsocial)).toEqual(['000123']);
        expect(aplicarComplementos([{ linha: 1, valores: { codigoIob: '7', matriculaEsocial: 'DA-FUNC' } }], c)[0].valores.matriculaEsocial).toBe('DA-FUNC');
    });
});
