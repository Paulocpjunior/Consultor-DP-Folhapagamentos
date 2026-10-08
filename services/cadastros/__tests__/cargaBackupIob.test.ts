import { describe, expect, it } from 'vitest';
import { aplicarComplementos, chaveColuna, compararComFichas, complementosFolhaWin, dataDoIob, derivarContrato, historicoSalarialSage, linhaParaCampos, normalizarValor, proporMapeamento } from '../cargaBackupIob';
import { mesclarComEsocial } from '../funcionarios';
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

    it('cargo, função e CBO pelo rsalfunc mais recente e o nome pela tabela cargos (a func vem sem cargo)', () => {
        // Colunas como estão no inventário do backup da empresa 1200.
        const rsalfunc = { colunas: ['codfun', 'data', 'composto', 'salario', 'motivosal', 'funcao', 'motivofun', 'cbo', 'codcargo', 'fk_codcarg'], linhas: [
            ['000052', '2022-05-02', '1', '1800', '', '', '', '411010', '0003', ''],
            ['000052', '2024-03-01', '2', '2200', '', 'Supervisor de vendas', '', '', '0007', ''],
            ['8', '2015-01-02', '1', '1500', '', '12', '', '41101', '', '0003'],
            ['9', '2020-01-01', '1', '1500', '', '', '', '', '', ''],
        ] };
        const cargos = { colunas: ['codcargo', 'cargo', 'descricao', 'cbo'], linhas: [['0003', 'AUXILIAR ADMINISTRATIVO', '', '411010'], ['7', '', 'SUPERVISOR COMERCIAL', '520110']] };
        const funcdoc = { colunas: ['codfun', 'codcargo', 'vlchavepix'], linhas: [['10', '3', '']] };
        const c = complementosFolhaWin(null, funcdoc, null, rsalfunc, cargos);
        expect(c.get('52')).toEqual({ cargoIob: '0007', cargo: 'SUPERVISOR COMERCIAL', funcao: 'Supervisor de vendas', cbo: '520110', salario: '2200.00' });
        // Função só como texto; CBO de 5 dígitos (CBO antiga) fica de fora e vale o da tabela de cargos.
        expect(c.get('8')).toEqual({ cargoIob: '0003', cargo: 'AUXILIAR ADMINISTRATIVO', cbo: '411010', salario: '1500.00' });
        // Sem cargo no histórico, só o salário (reserva para quem não está em `salarios`).
        expect(c.get('9')).toEqual({ salario: '1500.00' });
        expect(c.get('10')).toEqual({ cargoIob: '3', cargo: 'AUXILIAR ADMINISTRATIVO', cbo: '411010' });
        const [l] = aplicarComplementos([{ linha: 1, valores: { cpf: '52998224725', codigoIob: '000052', cargo: 'JÁ TINHA' } }], c);
        expect(l.valores).toMatchObject({ cargo: 'JÁ TINHA', cargoIob: '0007', cbo: '520110' });
        expect(normalizarValor('cep', '1310100')).toBe('01310100');
    });
});

describe('CBO e salário do FolhaWin (ficha com "1 erro" de CBO)', () => {
    it('prefere a cbo2 (CBO 2002) e descarta o CBO antigo de 5 dígitos', () => {
        const colunas = ['codfun', 'nome', 'cpf', 'cbo', 'cbo2'];
        const m = proporMapeamento(colunas);
        expect(m.cbo).toBe('cbo2');
        expect(normalizarValor('cbo', '01105')).toBe('');
        expect(normalizarValor('cbo', '4110-05')).toBe('411005');
        expect(linhaParaCampos(colunas, ['7', 'ANA', CPF_A, '01105', '411010'], m, 1).valores.cbo).toBe('411010');
        // cbo2 vazia: vale a outra coluna, se for CBO válido; senão fica em branco.
        expect(linhaParaCampos(colunas, ['7', 'ANA', CPF_A, '411005', ''], m, 1).valores.cbo).toBe('411005');
        expect(linhaParaCampos(colunas, ['7', 'ANA', CPF_A, '01105', null], m, 1).valores.cbo).toBeUndefined();
    });

    it('CBO inválido de carga anterior é trocado; o digitado à mão, não', () => {
        const l = [{ linha: 1, valores: { cpf: CPF_A, cbo: '411010' } }];
        const r = compararComFichas(l, [ficha(CPF_A, 'M1', { cbo: '01105' }, { cbo: 'Backup IOB' })], EMP, 'IOB', false);
        expect(r.completar[0].ficha.dados.cbo).toBe('411010');
        const m = compararComFichas(l, [ficha(CPF_A, 'M1', { cbo: '01105' }, { cbo: 'Manual · ana · 2026-10-01' })], EMP, 'IOB', false);
        expect(m.completar).toEqual([]);
        expect(m.soDivergencias[0].divergencias).toEqual([{ campo: 'cbo', consultor: '01105', iob: '411010' }]);
    });

    it('salário pelo rsalfunc mais recente só para quem não tem registro em salarios', () => {
        const rsalfunc = { colunas: ['codfun', 'data', 'salario', 'codcargo'], linhas: [
            ['7', '2024-01-01', '1800,00', ''], ['7', '2025-03-01', '2100,00', ''], ['8', '2025-03-01', '3000,00', ''],
        ] };
        const salarios = { colunas: ['codfun', 'anomes', 'valor', 'ultimo'], linhas: [['8', '202503', '3200,00', 'S']] };
        const c = complementosFolhaWin(salarios, null, null, rsalfunc);
        expect(c.get('7')?.salario).toBe('2100.00');
        expect(c.get('8')?.salario).toBe('3200.00');
    });
});

describe('demais campos do contrato pelo FolhaWin', () => {
    it('func: tipo de salário, horas semanais, fim de contrato e opção do FGTS', () => {
        const colunas = ['codfun', 'cpf', 'tipsal', 'hrssem', 'fimcontr', 'dtopfg', 'catego'];
        const m = proporMapeamento(colunas);
        expect(m).toMatchObject({ unidadeSalario: 'tipsal', horasSemanais: 'hrssem', fimContrato: 'fimcontr', opcaoFgts: 'dtopfg' });
        expect(m.categoria).toBeUndefined();
        expect(linhaParaCampos(colunas, ['7', CPF_A, 'M', '44,00', '2026-12-31', '2010-01-04', '1'], m, 1).valores)
            .toMatchObject({ unidadeSalario: '5', horasSemanais: '44', fimContrato: '2026-12-31', opcaoFgts: '2010-01-04' });
        expect(normalizarValor('unidadeSalario', 'H')).toBe('1');
        expect(normalizarValor('unidadeSalario', '2')).toBe('');
        expect(normalizarValor('horasSemanais', '220')).toBe('');
        expect(normalizarValor('horasSemanais', '36.5')).toBe('36.5');
        expect(normalizarValor('categoria', '101')).toBe('101');
        expect(normalizarValor('categoria', '1')).toBe('');
    });

    it('categoria e CBO do S-1200, sindicato do S-1300 e horas pelo horário vigente', () => {
        const dmdev = { colunas: ['anomes', 'codfun', 'pk_padrao', 'fk_ficha', 'idedmdev', 'codcateg', 'codcbo', 'natativide', 'qtddiatrab'], linhas: [
            ['202401', '52', '1', '1', 'X', '101', '411010', '1', ''], ['202509', '000052', '2', '1', 'Y', '103', '252210', '1', ''], ['202509', '8', '3', '1', 'Z', '99', '', '1', ''],
        ] };
        const contribSind = { colunas: ['anomes', 'codfun', 'pk_padrao', 'fk_ficha', 'cnpjsindic', 'tpcontrsin', 'vcontrsind'], linhas: [['202503', '52', '1', '1', '11.222.333/0001-81', '1', '50']] };
        const histHorarios = { colunas: ['codfun', 'codhorario', 'data', 'composto', 'pk_padrao'], linhas: [['52', '1', '2020-01-01', '', ''], ['52', '2', '2024-05-01', '', '']] };
        const cadHorarios = { colunas: ['codhorario', 'descricao', 'hrsemanal'], linhas: [['1', 'COMERCIAL', '44'], ['2', 'MEIO PERIODO', '30']] };
        const c = complementosFolhaWin(null, null, null, null, null, { dmdev, contribSind, histHorarios, cadHorarios });
        expect(c.get('52')).toEqual({ categoria: '103', cbo: '252210', sindicato: '11222333000181', horasSemanais: '30' });
        expect(c.has('8')).toBe(false);
    });

    it('regimes pela categoria; fim de contrato vencido vira prazo indeterminado', () => {
        const [a, b, d, e] = derivarContrato([
            { linha: 1, valores: { categoria: '101', admissao: '2026-08-28', fimContrato: '2026-11-25' } },
            { linha: 2, valores: { categoria: '101', admissao: '2022-05-02', fimContrato: '2022-07-30' } },
            { linha: 3, valores: { categoria: '701', fimContrato: '2020-01-01' } },
            { linha: 4, valores: { categoria: '101', regimeTrabalhista: '2', tipoContrato: '3' } },
        ], '2026-10-06');
        expect(a.valores).toMatchObject({ regimeTrabalhista: '1', regimePrevidenciario: '1', tipoContrato: '2', fimContrato: '2026-11-25' });
        expect(b.valores).toMatchObject({ tipoContrato: '1' });
        expect(b.valores.fimContrato).toBeUndefined();
        expect(d.valores).toEqual({ categoria: '701' });
        expect(e.valores).toMatchObject({ regimeTrabalhista: '2', regimePrevidenciario: '1', tipoContrato: '3' });
        // Desligado com contrato a termo encerrado: o fim é histórico e fica.
        const [f] = derivarContrato([{ linha: 5, valores: { categoria: '101', admissao: '2024-01-02', fimContrato: '2024-03-31', dataDesligamento: '2024-03-31' } }], '2026-10-06');
        expect(f.valores).toMatchObject({ tipoContrato: '2', fimContrato: '2024-03-31' });
        expect(normalizarValor('categoria', '314')).toBe('314');
    });
});

describe('situação pela data de desligamento do IOB', () => {
    it('ficha ativa que recebe a data de desligamento vira desligada; situação digitada à mão fica', () => {
        const l = [{ linha: 1, valores: { cpf: CPF_A, dataDesligamento: '2025-03-10' } }];
        const r = compararComFichas(l, [ficha(CPF_A, 'M1', { nome: 'ANA' })], EMP, 'IOB: f1200.func', false);
        expect(r.completar[0].ficha.situacao).toBe('desligado');
        expect(r.completar[0].alteracoes.map(a => a.campo)).toEqual(expect.arrayContaining(['dataDesligamento', 'situacao']));
        const manual = compararComFichas(l, [{ ...ficha(CPF_A, 'M1', { nome: 'ANA' }), origens: { situacao: 'Manual · ana · 2026-10-01' } }], EMP, 'IOB', false);
        expect(manual.completar[0].ficha.situacao).toBe('ativo');
    });
});

describe('conta e agência com o dígito do IOB (arquivo bancário)', () => {
    it('dvcc vai junto da conta; conta gravada sem dígito por carga anterior é completada', () => {
        const l = linhaParaCampos(['codfun', 'cpf', 'bcosal', 'agdsal', 'cc', 'dvcc'], ['17', CPF_A, '237', '0987', '55555', '0'], { codigoIob: 'codfun', cpf: 'cpf', banco: 'bcosal', agencia: 'agdsal', conta: 'cc' }, 1);
        expect(l.valores).toMatchObject({ banco: '237', agencia: '0987', conta: '55555-0' });
        const semDv = ficha(CPF_A, 'M1', { nome: 'ANA', conta: '55555' }, { conta: 'IOB: carga antiga' });
        const r = compararComFichas([l], [semDv], EMP, 'IOB: backup', false);
        expect(r.completar[0].ficha.dados.conta).toBe('55555-0');
        const manual = ficha(CPF_A, 'M1', { nome: 'ANA', conta: '55555' }, { conta: 'Manual · ana@x · 2026-10-01' });
        const m = compararComFichas([l], [manual], EMP, 'IOB: backup', false).completar[0];
        expect(m.ficha.dados.conta).toBe('55555');
        expect(m.divergencias).toEqual([{ campo: 'conta', consultor: '55555', iob: '55555-0' }]);
    });
});

describe('histórico de salário do SAGE (rsalfunc/salarios)', () => {
    it('importação parcial do eSocial (só um S-2206): entra por cima a partir da data, sem apagar o passado; o SAGE não volta', () => {
        const sage = { ...ficha(CPF_A, 'M7', { codigoIob: '7', salario: '2100.00' }), historicoSalario: [
            { desde: '2024-01-02', salario: '1800.00', origem: 'IOB: rsalfunc · 2024-01-02' }, { desde: '2025-03-01', salario: '2100.00', origem: 'IOB: rsalfunc · 2025-03-01' },
        ] };
        const soS2206 = { ...sage, historicoSalario: [{ desde: '2026-05-01', salario: '2300.00', origem: 'S-2206 · 9' }] };
        const m = mesclarComEsocial(sage, soS2206).ficha.historicoSalario!;
        expect(m.map(x => [x.desde, x.salario])).toEqual([['2024-01-02', '1800.00'], ['2025-03-01', '2100.00'], ['2026-05-01', '2300.00']]);
        // Com S-2206 no histórico, a carga do SAGE não o substitui.
        expect(compararComFichas([{ linha: 1, valores: { cpf: CPF_A, codigoIob: '7' } }], [{ ...sage, historicoSalario: m }], EMP, 'IOB: f', false, historicoSalarialSage(null, rsalfunc)).completar).toEqual([]);
        // eSocial incremental sobre eSocial: as faixas anteriores ficam.
        const esocial = { ...sage, historicoSalario: [{ desde: '2024-01-02', salario: '1800.00', origem: 'S-2200 · 1' }, { desde: '2025-03-01', salario: '2100.00', origem: 'S-2206 · 2' }] };
        expect(mesclarComEsocial(esocial, soS2206).ficha.historicoSalario!.map(x => x.origem)).toEqual(['S-2200 · 1', 'S-2206 · 2', 'S-2206 · 9']);
        // Lote parcial de um período antigo (só o S-2206 de 2025-03): as faixas posteriores ficam.
        const comFuturo = { ...esocial, historicoSalario: [...esocial.historicoSalario, { desde: '2026-05-01', salario: '2300.00', origem: 'S-2206 · 9' }] };
        const antigo = { ...sage, historicoSalario: [{ desde: '2025-03-01', salario: '2150.00', origem: 'S-2206 · 2r' }] };
        expect(mesclarComEsocial(comFuturo, antigo).ficha.historicoSalario!.map(x => [x.desde, x.salario])).toEqual([['2024-01-02', '1800.00'], ['2025-03-01', '2150.00'], ['2026-05-01', '2300.00']]);
    });

    const rsalfunc = { colunas: ['codfun', 'data', 'salario', 'codcargo'], linhas: [
        ['0007', '2024-01-02', '1800,00', ''], ['7', '2024-06-01', '1800,00', ''], ['7', '2025-03-01', '2100,00', ''], ['8', '2025-03-01', '3000,00', ''],
    ] };
    const salarios = { colunas: ['codfun', 'codeven', 'anomes', 'valor', 'ultimo'], linhas: [
        ['8', '1', '202401', '2800,00', 'N'], ['8', '1', '202402', '2800,00', 'N'], ['8', '1', '202503', '3000,00', 'S'], ['8', '1', '202504', '9999,00', 'N'], ['8', '5', '202402', '150,00', 'N'],
        ['7', '1', '202401', '1700,00', 'N'], ['9', '1', '202503', '1500,00', 'S'],
    ] };
    it('rsalfunc com data; sem reajuste nele, o salarios mês a mês (evento do salário atual, até o "ultimo"); só quem tem 2 faixas', () => {
        const h = historicoSalarialSage(salarios, rsalfunc);
        expect(h.get('7')).toEqual([
            { desde: '2024-01-02', salario: '1800.00', origem: 'IOB: rsalfunc · 2024-01-02' }, { desde: '2025-03-01', salario: '2100.00', origem: 'IOB: rsalfunc · 2025-03-01' },
        ]);
        expect(h.get('8')).toEqual([
            { desde: '2024-01-01', salario: '2800.00', origem: 'IOB: salarios · 01/2024' }, { desde: '2025-03-01', salario: '3000.00', origem: 'IOB: salarios · 03/2025' },
        ]);
        expect(h.has('9')).toBe(false);
        expect(historicoSalarialSage(null, null).size).toBe(0);
    });
    it('entra na ficha sem reajuste no eSocial; com reajuste no eSocial, fica o do eSocial; a reimportação só com a admissão não apaga', () => {
        const h = historicoSalarialSage(salarios, rsalfunc);
        const soAdmissao = { ...ficha(CPF_A, 'M7', { codigoIob: '7', salario: '2100.00' }), historicoSalario: [{ desde: '2024-01-02', salario: '1800.00', origem: 'S-2200 · 1' }] };
        const r = compararComFichas([{ linha: 1, valores: { cpf: CPF_A, codigoIob: '7' } }], [soAdmissao], EMP, 'IOB: f', false, h);
        expect([r.completar.length, r.completar[0].ficha.historicoSalario?.length, r.completar[0].alteracoes.map(a => a.campo)]).toEqual([1, 2, ['historicoSalario']]);
        const comReajuste = { ...soAdmissao, historicoSalario: [...soAdmissao.historicoSalario, { desde: '2025-01-01', salario: '2000.00', origem: 'S-2206 · 2' }] };
        expect(compararComFichas([{ linha: 1, valores: { cpf: CPF_A, codigoIob: '7' } }], [comReajuste], EMP, 'IOB: f', false, h).completar).toEqual([]);
        // eSocial reimportado só com a admissão: o do SAGE fica; com reajuste, o do eSocial substitui.
        const doSage = r.completar[0].ficha;
        expect(mesclarComEsocial(doSage, soAdmissao).ficha.historicoSalario).toEqual(doSage.historicoSalario);
        expect(mesclarComEsocial(doSage, comReajuste).ficha.historicoSalario).toEqual(comReajuste.historicoSalario);
    });
});
