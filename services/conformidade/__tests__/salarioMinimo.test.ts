import { describe, expect, it } from 'vitest';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { tabelaVazia, tabelaVigente, validarTabela, type TabelaLegal } from '../../cadastros/tabelasLegais';
import { conferirSalarioMinimo, minimoProporcional, minimosVigentes } from '../salarioMinimo';

const FED: TabelaLegal = { ...tabelaVazia('salario_minimo'), id: 'f', vigencia: '2026-01', norma: 'Decreto 12.797/2025', valores: { salarioMinimo: 162100 } };
const SP: TabelaLegal = { ...tabelaVazia('salario_minimo_estadual'), id: 'sp', vigencia: '2026-01', norma: 'Lei estadual de SP (teste)', uf: 'SP', pisos: [{ descricao: 'Piso único', valor: 180400 }] };
const PR: TabelaLegal = { ...tabelaVazia('salario_minimo_estadual'), id: 'pr', vigencia: '2026-01', norma: 'Lei estadual do PR (teste)', uf: 'PR',
    pisos: [{ descricao: 'Grupo I', valor: 200000 }, { descricao: 'Grupo II', valor: 190000 }] };
const ficha = (id: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2025-03-10', salario: '1700.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });

describe('salário mínimo estadual nas tabelas legais', () => {
    it('UF e pisos obrigatórios; a mesma vigência pode existir em UFs diferentes', () => {
        expect(validarTabela(SP, [FED, PR])).toEqual([]);
        expect(validarTabela({ ...SP, uf: '' })).toContain('Escolha a UF do salário mínimo estadual.');
        expect(validarTabela({ ...SP, pisos: [{ descricao: 'x', valor: 0 }] })).toEqual(['Piso 1: informe a categoria (como na lei estadual).', 'Piso 1: valor inválido.']);
        expect(validarTabela({ ...SP, id: 'outra' }, [SP])).toContain('Já existe uma tabela deste tipo com esta vigência para SP.');
    });
    it('a vigente é a da UF', () => {
        const v = tabelaVigente([SP, PR], 'salario_minimo_estadual', '2026-10', 'PR');
        expect('tabela' in v && v.tabela.id).toBe('pr');
        expect(tabelaVigente([SP, PR], 'salario_minimo_estadual', '2026-10', 'RJ')).toEqual({ erro: 'Nenhuma tabela de Salário mínimo estadual (piso regional da UF) de RJ vigente em 10/2026.' });
    });
    it('mínimos vigentes: federal e o menor piso da UF', () => {
        expect(minimosVigentes([FED, SP, PR], 'PR', '2026-10')).toMatchObject({ federal: 162100, estadual: { uf: 'PR', menor: 190000 }, avisos: [] });
        expect(minimosVigentes([FED], 'RJ', '2026-10')).toMatchObject({ federal: 162100, estadual: null });
        expect(minimosVigentes([FED], '', '2026-10').avisos[0]).toMatch(/Empresa sem UF/);
    });
});

describe('conferência do salário mínimo', () => {
    it('abaixo do federal é erro; abaixo do estadual é aviso; jornada parcial proporcional', () => {
        const fichas = [
            ficha('ana', { salario: '1500.00' }), // abaixo do federal
            ficha('bia', { salario: '1700.00' }), // acima do federal, abaixo do piso de SP
            ficha('caio', { salario: '1900.00' }), // ok
            ficha('davi', { salario: '900.00', horasSemanais: '22' }), // 110 h: mínimo 810,50 (federal) e 902,00 (SP)
            ficha('edu', { salario: '10.00', unidadeSalario: '1', horasSemanais: '44' }), // por hora × 220 = 2.200
            ficha('fabi', { salario: '500.00', categoria: '721' }), // não é empregado
            ficha('gil', { salario: '1000.00', dataDesligamento: '2026-09-10' }), // fora da competência
        ];
        const r = conferirSalarioMinimo(fichas, [FED, SP], 'SP', '2026-10');
        expect(r.alertas.map(a => [a.fichaId, a.nivel, a.regra])).toEqual([['ana', 'erro', 'minimo-federal'], ['bia', 'aviso', 'minimo-estadual'], ['davi', 'aviso', 'minimo-estadual']]);
        expect(r.alertas[0].mensagem.replace(/\u00a0/g, ' ')).toBe('Salário R$ 1.500,00 abaixo do mínimo federal de 10/2026: R$ 1.621,00 (CF, art. 7º, IV).');
        expect(r.alertas[2].mensagem.replace(/\u00a0/g, ' ')).toMatch(/R\$ 902,00 \(proporcional a 110 h\/mês\)/);
        expect(r.alertas[1].mensagem).toMatch(/LC 103\/2000/);
        expect(minimoProporcional(162100, 110)).toBe(81050);
        expect(minimoProporcional(162100, 240)).toBe(162100);
    });
    it('o salário vigente na competência, pelo histórico', () => {
        const f = { ...ficha('ana', { salario: '2000.00' }), historicoSalario: [{ desde: '2025-03-10', salario: '1500.00' }, { desde: '2026-11-01', salario: '2000.00' }] } as FichaFuncionario;
        expect(conferirSalarioMinimo([f], [FED], 'SP', '2026-10').alertas.map(a => a.regra)).toEqual(['minimo-federal']);
        expect(conferirSalarioMinimo([f], [FED], 'SP', '2026-11').alertas).toEqual([]);
    });
});
