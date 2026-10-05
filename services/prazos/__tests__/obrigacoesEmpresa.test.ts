import { describe, expect, it } from 'vitest';
import { cnpjsSindicatosDaEmpresa, guiaDoSindicato, idMarcacao, obrigacoesDaEmpresa, situacao } from '../obrigacoesEmpresa';

const ids = (l: { id: string }[]) => l.map(o => o.id);

describe('calendário de obrigações da folha por empresa', () => {
    it('competência comum: mensais do DP + EFD-Reinf do fiscal, em ordem de data', () => {
        const l = obrigacoesDaEmpresa({ competencia: '2026-09', temEmpregados: true });
        expect(ids(l)).toEqual(['salario-2026-09', 'dctfweb-2026-09', 'reinf-2026-09', 's1299-2026-09', 'darf-2026-09', 'fgts-2026-09']); // mesmo dia: pelo nome
        const reinf = l.find(o => o.id === 'reinf-2026-09')!;
        expect(reinf).toMatchObject({ data: '2026-10-15', responsavel: 'Fiscal', condicao: 'se houver evento no mês' });
        expect(l.find(o => o.id === 'fgts-2026-09')).toMatchObject({ data: '2026-10-20', responsavel: 'DP' });
    });

    it('Reinf com dia 15 em feriado posterga (15/11/2026 é domingo e Proclamação da República)', () => {
        const reinf = obrigacoesDaEmpresa({ competencia: '2026-10', temEmpregados: true }).find(o => o.id === 'reinf-2026-10')!;
        expect(reinf.data).toBe('2026-11-16');
        expect(reinf.observacao).toMatch(/15\/11\/2026/);
    });

    it('sem empregados: S-1299 e DCTFWeb continuam obrigatórios; o resto fica condicionado', () => {
        const l = obrigacoesDaEmpresa({ competencia: '2026-09', temEmpregados: false });
        expect(l.find(o => o.id === 's1299-2026-09')!.condicao).toBeUndefined();
        expect(l.find(o => o.id === 'dctfweb-2026-09')!.condicao).toBeUndefined();
        expect(l.find(o => o.id === 'fgts-2026-09')!.condicao).toMatch(/sem empregados/);
    });

    it('anuais: sindical em março (recolhe até 30/04) e comprovante de rendimentos em janeiro (último dia útil de fevereiro)', () => {
        const marco = obrigacoesDaEmpresa({ competencia: '2027-03', temEmpregados: true }).find(o => o.id === 'sindical-anual-2027-03')!;
        expect(marco).toMatchObject({ data: '2027-04-30', condicao: 'só de quem autorizou prévia e expressamente' });
        const jan = obrigacoesDaEmpresa({ competencia: '2027-01', temEmpregados: true }).find(o => o.id === 'informe-rendimentos-2027-01')!;
        expect(jan.nome).toBe('Comprovante de rendimentos de 2026 aos empregados');
        expect(jan.data).toBe('2027-02-26'); // 28/02/2027 é domingo
        expect(ids(obrigacoesDaEmpresa({ competencia: '2026-09', temEmpregados: true }))).not.toContain('sindical-anual-2026-09');
    });

    it('guia sindical da convenção: dia e meses do cadastro; vence no mês seguinte à competência', () => {
        const mensal = guiaDoSindicato({ cnpj: '11222333000181', nome: 'SINDCOM', guiaDia: '10', guiaMeses: 'todos', guiaDescricao: 'Contribuição assistencial' })!;
        const semestral = guiaDoSindicato({ cnpj: '11444777000161', nome: 'SINDSERV', guiaDia: '31', guiaMeses: '4, 10' })!;
        expect(semestral.meses).toEqual([4, 10]);
        const set = obrigacoesDaEmpresa({ competencia: '2026-09', temEmpregados: true, guias: [mensal, semestral] });
        expect(set.find(o => o.id === 'guia-11222333000181-2026-09')).toMatchObject({ data: '2026-10-09', nome: 'Guia sindical: Contribuição assistencial — SINDCOM' }); // 10/10/2026 é sábado
        expect(set.find(o => o.id === 'guia-11444777000161-2026-09')!.data).toBe('2026-10-30'); // dia 31 em outubro → 31 (sábado) antecipa
        expect(ids(obrigacoesDaEmpresa({ competencia: '2026-10', temEmpregados: true, guias: [semestral] }))).not.toContain('guia-11444777000161-2026-10');
    });

    it('sindicato sem dia ou com meses inválidos não gera guia (não se inventa data)', () => {
        expect(guiaDoSindicato({ cnpj: '1', nome: 'X' })).toBeNull();
        expect(guiaDoSindicato({ cnpj: '1', nome: 'X', guiaDia: '40' })).toBeNull();
        expect(guiaDoSindicato({ cnpj: '1', nome: 'X', guiaDia: '5', guiaMeses: '13, 0' })).toBeNull();
        expect(guiaDoSindicato({ cnpj: '1', nome: 'X', guiaDia: '5', guiaMeses: '' })!.meses).toBe('todos');
    });

    it('situação: pendente vencida é atrasada; entregue e não se aplica não', () => {
        const o = obrigacoesDaEmpresa({ competencia: '2026-09', temEmpregados: true }).find(x => x.id === 'fgts-2026-09')!;
        expect(situacao(o, undefined, '2026-10-21')).toEqual({ status: 'pendente', atrasada: true });
        expect(situacao(o, undefined, '2026-10-20')).toEqual({ status: 'pendente', atrasada: false });
        expect(situacao(o, { status: 'entregue' }, '2026-11-01')).toEqual({ status: 'entregue', atrasada: false });
        expect(idMarcacao('E1', o.id)).toBe('E1_fgts-2026-09');
    });

    it('sindicatos da empresa: só empregados não desligados, CNPJ válido, sem repetir', () => {
        const fichas = [
            { empresaId: 'E1', situacao: 'ativo', dados: { sindicato: '11.222.333/0001-81' } },
            { empresaId: 'E1', situacao: 'ativo', dados: { sindicato: '11222333000181' } },
            { empresaId: 'E1', situacao: 'desligado', dados: { sindicato: '11444777000161' } },
            { empresaId: 'E2', situacao: 'ativo', dados: { sindicato: '33000167000101' } },
            { empresaId: 'E1', situacao: 'ativo', dados: {} },
        ];
        expect(cnpjsSindicatosDaEmpresa(fichas, 'E1')).toEqual(['11222333000181']);
    });
});
