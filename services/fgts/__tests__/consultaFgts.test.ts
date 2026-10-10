import { describe, expect, it } from 'vitest';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { FolhaGravada } from '../../calculo/folhaGravada';
import type { S5003 } from '../../conferencia/totalizadores';
import { competenciasAte, extratoDoFuncionario, fgtsDasFolhas, prazoDeclaracao, registroDoPopup, situacaoDoMes, situacaoProcuracao, vencimentoFgts } from '../consultaFgts';

const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2025-06-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' } };
const holerite = (fichaId: string, fgts: number) => ({ fichaId, nome: 'X', competencia: '', pagamento: '', situacao: 'calculado', verbas: [], bases: { inss: 0, fgts: fgts * 12.5, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts, memoria: [], avisos: [], erros: [] });
const folha = (c: string, ...h: ReturnType<typeof holerite>[]) => ({ empresaId: 'E1', competencia: c, pagamento: c, gravadoPorEmail: '', totais: {}, holerites: h } as unknown as FolhaGravada);

describe('consulta de FGTS', () => {
    it('vencimento (dia 20, antecipado), prazo da declaração e as competências', () => {
        expect(vencimentoFgts('2026-08')).toBe('2026-09-18'); // 20/09/2026 é domingo
        expect(vencimentoFgts('2026-09')).toBe('2026-10-20');
        expect(prazoDeclaracao('2026-09')).toBe('2026-10-15');
        expect(competenciasAte('2026-02', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
    });
    it('situação do mês pelo devido, recolhido, prazo e folha', () => {
        const hoje = '2026-10-25';
        expect(situacaoDoMes('2026-09', 240000, 240000, 240000, hoje)).toBe('em_dia');
        expect(situacaoDoMes('2026-09', 240000, 100000, 240000, hoje)).toBe('parcial');
        expect(situacaoDoMes('2026-09', 240000, 0, 240000, hoje)).toBe('atrasado');
        expect(situacaoDoMes('2026-09', 240000, 0, 240000, '2026-10-19')).toBe('a_vencer');
        // Folha com FGTS e nada declarado: depois do dia 15 é pendência de envio; antes, dentro do prazo.
        expect(situacaoDoMes('2026-09', 0, 0, 240000, hoje)).toBe('nao_declarado');
        expect(situacaoDoMes('2026-09', 0, 0, 240000, '2026-10-10')).toBe('a_vencer');
        expect(situacaoDoMes('2026-09', 0, 0, null, hoje)).toBe('sem_movimento');
        expect(situacaoDoMes('2026-09', null, null, 1, hoje)).toBe('sem_consulta');
    });
    it('o aviso do popup: um por empresa e mês, em reais; sem aviso no que está a vencer', () => {
        const m = { competencia: '2026-08', vencimento: '2026-09-18', devido: 240000, realizado: 100000, folha: 240000, situacao: 'parcial' as const };
        expect(registroDoPopup('E1', m)).toEqual({ id: 'serpro_E1_2026-08', dados: { empresaId: 'E1', competencia: '2026-08', funcionarioNome: 'TOTAL EMPRESA (SERPRO)', funcionarioCpf: '', valorDevido: 2400, valorRecolhido: 1000, status: 'parcial', dataVencimento: '2026-09-18' } });
        expect(registroDoPopup('E1', { ...m, situacao: 'nao_declarado', devido: 0, realizado: 0 })!.dados).toMatchObject({ status: 'nao_declarado', valorDevido: 2400, funcionarioNome: 'FOLHA SEM DECLARAÇÃO NO eSOCIAL' });
        expect(registroDoPopup('E1', { ...m, situacao: 'em_dia' })!.dados.status).toBe('em_dia');
        expect(registroDoPopup('E1', { ...m, situacao: 'a_vencer' })).toBeNull();
    });
    it('extrato do funcionário: folha × S-5003 pela matrícula, com a diferença', () => {
        const folhas = [folha('2026-08', holerite('f1', 24000), holerite('f2', 9999)), folha('2026-09', holerite('f1', 24000))];
        expect(fgtsDasFolhas(folhas).get('2026-08')).toBe(33999);
        const s5003: S5003[] = [{ tipo: 'S-5003', id: 'a', arquivo: '', empregador: '29463877', perApur: '2026-08', indApuracao: '1', nrRecArqBase: '', cpf: '52998224725',
            itens: [{ estab: '', matricula: 'M1', codCateg: '101', tpValor: '11', indIncid: '1', remuneracao: 300000, deposito: 23000, periodoAnterior: false }, { estab: '', matricula: 'OUTRA', codCateg: '101', tpValor: '11', indIncid: '1', remuneracao: 1, deposito: 5, periodoAnterior: false }] }];
        const e = extratoDoFuncionario(FICHA, ['2026-09', '2026-08', '2026-07'], folhas, s5003, '2026-10-10');
        expect(e.linhas.map(l => [l.competencia, l.fgtsFolha, l.declarado, l.diferenca])).toEqual([['2026-07', null, null, null], ['2026-08', 24000, 23000, 1000], ['2026-09', 24000, null, null]]);
        expect(e.totalFolha).toBe(48000); expect(e.totalDeclarado).toBe(23000);
        expect(e.estimativaContrato).toBeGreaterThan(0);
    });
    it('procuração do FGTS Digital: ausente, vencida, vencendo, válida', () => {
        expect(situacaoProcuracao(undefined, '2026-10-10').situacao).toBe('ausente');
        expect(situacaoProcuracao({ perfil: 'consulta', validaAte: '2026-10-01' }, '2026-10-10').situacao).toBe('vencida');
        expect(situacaoProcuracao({ perfil: 'consulta', validaAte: '2026-10-30' }, '2026-10-10').situacao).toBe('vencendo');
        expect(situacaoProcuracao({ perfil: 'edicao', validaAte: '2027-10-30' }, '2026-10-10').texto).toContain('consulta e edição');
    });
});
