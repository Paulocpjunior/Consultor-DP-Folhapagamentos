import { describe, expect, it } from 'vitest';
import {
    camposDoCargo, cargoDaFicha, cargoVazio, cargoVigente, cargosDasFichas, cargosDoBackup, cboFormatado, divergenciasDeCargo, normalizarCargo, normalizarCodigoCargo, validarCargo, type Cargo,
} from '../cargos';

const cargo = (m: Partial<Cargo>): Cargo => normalizarCargo({ ...cargoVazio('emp1'), ...m });
const ficha = (id: string, dados: Record<string, string>, situacao: 'ativo' | 'desligado' = 'ativo') => ({ id, cpf: id, situacao, dados });

describe('Cadastro de Cargos (SAGE)', () => {
    it('código como o SAGE (6 dígitos), CBO 4110-10 e nome em maiúsculas', () => {
        expect(normalizarCodigoCargo('1')).toBe('000001');
        expect(normalizarCodigoCargo('000004')).toBe('000004');
        expect(normalizarCodigoCargo(' dir-01 ')).toBe('DIR-01');
        const c = cargo({ codigo: '1', nome: ' assistente adm ii ', cbo: '4110-10' });
        expect(c).toMatchObject({ id: 'emp1_000001', codigo: '000001', nome: 'ASSISTENTE ADM II', cbo: '411010' });
        expect(cboFormatado(c.cbo)).toBe('4110-10');
    });

    it('valida código repetido, nome, CBO, validade e os dados do cargo público', () => {
        const a = cargo({ codigo: '1', nome: 'A', cbo: '411010' });
        expect(validarCargo(a, [a])).toEqual([]);
        expect(validarCargo({ ...a, id: '' }, [a])).toContain('Já existe o cargo 000001 nesta empresa.');
        expect(validarCargo(cargo({ codigo: '2', nome: '', cbo: '41' }))).toEqual(['Informe o nome do cargo.', 'CBO do cargo: 6 dígitos (ex.: 4110-10).']);
        expect(validarCargo(cargo({ codigo: '2', nome: 'B', cbo: '411010', inicioValidade: '2022-07', finalValidade: '2022-01' }))).toEqual(['Final da validade antes do início.']);
        const pub = validarCargo({ ...cargo({ codigo: '3', nome: 'C', cbo: '411010' }), cargoPublico: true });
        expect(pub).toHaveLength(4);
        // Sem cargo público, os campos dele são limpos ao gravar.
        expect(normalizarCargo({ ...a, nrLei: '123', situacao: '1' })).toMatchObject({ nrLei: '', situacao: '' });
    });

    it('vigência, cargo da ficha pelo código e os campos que a ficha recebe', () => {
        const a = cargo({ codigo: '4', nome: 'ANALISTA DE DEPARTAMENTO PESSOAL I', cbo: '252305', inicioValidade: '2022-07', funcao: 'ANALISTA DP' });
        expect(cargoVigente(a, '2022-06')).toBe(false);
        expect(cargoVigente(a, '2026-10')).toBe(true);
        expect(cargoVigente({ ...a, inativo: true }, '2026-10')).toBe(false);
        expect(cargoDaFicha([a], { cargoIob: '4' })).toBe(a);
        expect(camposDoCargo(a, { funcao: '' })).toEqual({ cargoIob: '000004', cargo: 'ANALISTA DE DEPARTAMENTO PESSOAL I', cbo: '252305', funcao: 'ANALISTA DP' });
        expect(camposDoCargo(a, { funcao: 'OUTRA' })).not.toHaveProperty('funcao');
    });

    it('diferenças entre ficha e cadastro (sem mudar nada) e cargos novos pelas fichas', () => {
        const a = cargo({ codigo: '4', nome: 'ANALISTA DE DEPARTAMENTO PESSOAL I', cbo: '252305' });
        const fichas = [
            ficha('f1', { nome: 'ANA', cargo: 'ANALISTA DE DEPARTAMENTO PESSOAL I', cbo: '411005', cargoIob: '000004' }),
            ficha('f2', { nome: 'BIA', cargo: 'AUXILIAR', cbo: '411005', cargoIob: '9' }),
            ficha('f3', { nome: 'CAU', cargo: 'AUXILIAR ADM', cbo: '411005', cargoIob: '9' }),
            ficha('f4', { nome: 'DEO', cargo: 'X', cbo: '1', cargoIob: '4' }, 'desligado'),
        ];
        expect(divergenciasDeCargo(fichas, [a])).toEqual([
            { fichaId: 'f1', nome: 'ANA', codigo: '000004', campo: 'cbo', naFicha: '411005', noCadastro: '252305' },
            { fichaId: 'f2', nome: 'BIA', codigo: '9', campo: 'codigo', naFicha: '9', noCadastro: '' },
            { fichaId: 'f3', nome: 'CAU', codigo: '9', campo: 'codigo', naFicha: '9', noCadastro: '' },
        ]);
        const r = cargosDasFichas(fichas, [a], 'emp1');
        expect(r.cargos).toEqual([]);
        expect(r.avisos).toEqual(['Cargo 000009: nomes diferentes nas fichas (AUXILIAR / AUXILIAR ADM); cadastre à mão.']);
        expect(cargosDasFichas([fichas[1]], [], 'emp1').cargos.map(c => [c.codigo, c.nome, c.cbo])).toEqual([['000009', 'AUXILIAR', '411005']]);
    });

    it('tabela cargos do backup do SAGE: só os novos, com CBO válido', () => {
        const t = { colunas: ['codcargo', 'cargo', 'descricao', 'cbo', 'dtinivalid', 'inativo'], linhas: [
            ['000001', 'ASSISTENTE ADM II', 'ASSISTENTE ADM II', '4110-10', '2022-07-01', 'N'],
            ['000004', 'ANALISTA DE DEPARTAMENTO PESSOAL I', '', '252305', null, 'S'],
            ['000005', 'SEM CBO', '', '', null, null],
            ['000002', 'JÁ CADASTRADO', '', '411005', null, null],
        ] };
        const r = cargosDoBackup(t, 'emp1', [cargo({ codigo: '2', nome: 'MANUAL', cbo: '411005' })]);
        expect(r.cargos.map(c => [c.codigo, c.nome, c.cbo, c.inicioValidade, c.inativo, c.descricao])).toEqual([
            ['000001', 'ASSISTENTE ADM II', '411010', '2022-07', false, ''],
            ['000004', 'ANALISTA DE DEPARTAMENTO PESSOAL I', '252305', '', true, ''],
        ]);
        expect(r.avisos).toEqual(['Cargo 000005 (SEM CBO) do backup sem CBO válido: cadastre à mão.']);
        expect(cargosDoBackup(null, 'emp1')).toEqual({ cargos: [], avisos: [] });
    });
});
