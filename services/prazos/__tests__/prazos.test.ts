import { describe, expect, it } from 'vitest';
import { diaUtilAnterior, diaUtilSeguinte, ehDiaUtil, feriados, pascoa, quintoDiaUtilSalario, somarMeses } from '../calendario';
import { vencimentosDaCompetencia, vencimentosNoPeriodo } from '../obrigacoes';
import { periodosFerias, prazosFuncionarios, prazosSindicatos } from '../prazosFuncionarios';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import { sindicatoVazio } from '../../cadastros/sindicatos';

describe('calendário', () => {
    it('Páscoa e feriados móveis', () => {
        expect(pascoa(2024)).toBe('2024-03-31');
        expect(pascoa(2025)).toBe('2025-04-20');
        expect(pascoa(2026)).toBe('2026-04-05');
        const f = feriados(2026);
        expect(f.get('2026-02-16')).toBe('Carnaval (segunda)');
        expect(f.get('2026-02-17')).toBe('Carnaval (terça)');
        expect(f.get('2026-04-03')).toBe('Sexta-feira Santa');
        expect(f.get('2026-11-20')).toBe('Dia Nacional de Zumbi e da Consciência Negra');
        expect(feriados(2023).has('2023-11-20')).toBe(false);
    });

    it('dia útil, anterior e seguinte', () => {
        expect(ehDiaUtil('2026-10-12')).toBe(false); // feriado numa segunda
        expect(diaUtilAnterior('2026-11-15')).toBe('2026-11-13'); // domingo → sexta
        expect(diaUtilSeguinte('2026-11-15')).toBe('2026-11-16');
        expect(diaUtilAnterior('2026-12-20')).toBe('2026-12-18');
    });

    it('5º dia útil do salário conta o sábado e pula domingo e feriado', () => {
        // nov/2026: dom 1, seg 2 (Finados), ter 3, qua 4, qui 5, sex 6, sáb 7
        expect(quintoDiaUtilSalario(2026, 11)).toBe('2026-11-07');
        // jan/2027: sex 1 (feriado), sáb 2, seg 4, ter 5, qua 6, qui 7
        expect(quintoDiaUtilSalario(2027, 1)).toBe('2027-01-07');
    });

    it('soma de meses no fim do mês', () => {
        expect(somarMeses('2024-01-31', 1)).toBe('2024-02-29');
        expect(somarMeses('2024-02-29', 12)).toBe('2025-02-28');
    });
});

describe('vencimentos mensais', () => {
    it('competência 10/2026: 15/11 é domingo — S-1299 e DCTFWeb vão para 16/11; 20/11 é feriado — DARF e FGTS antecipam para 19/11', () => {
        const v = vencimentosDaCompetencia('2026-10');
        const por = Object.fromEntries(v.map(x => [x.id.split('-')[0], x]));
        expect(por.s1299).toMatchObject({ data: '2026-11-16', original: '2026-11-15', ajuste: 'posterga' });
        expect(por.s1299.observacao).toContain('15/11/2026: Proclamação da República');
        expect(por.dctfweb.data).toBe('2026-11-16');
        expect(por.darf.data).toBe('2026-11-19');
        expect(por.fgts).toMatchObject({ data: '2026-11-19', ajuste: 'antecipa' });
        expect(por.fgts.observacao).toContain('Consciência Negra');
        expect(por.salario.data).toBe('2026-11-07');
    });

    it('dia 20 no domingo antecipa (FGTS e DARF); 13º em novembro e dezembro', () => {
        const nov = vencimentosDaCompetencia('2026-11');
        expect(nov.find(x => x.id.startsWith('fgts'))?.data).toBe('2026-12-18');
        expect(nov.find(x => x.id.startsWith('13-1'))?.data).toBe('2026-11-30');
        const dez = vencimentosDaCompetencia('2026-12');
        expect(dez.find(x => x.id.startsWith('13-2'))?.data).toBe('2026-12-18');
        expect(dez.find(x => x.id.startsWith('s1299-anual'))?.data).toBe('2026-12-21');
    });

    it('vencimentos no período juntam as competências certas', () => {
        const v = vencimentosNoPeriodo('2026-11-01', '2026-11-30');
        expect(v.map(x => x.id)).toEqual(['salario-2026-10', 's1299-2026-10', 'dctfweb-2026-10', 'darf-2026-10', 'fgts-2026-10', '13-1-2026-11']);
    });
});

const ficha = (extra: Partial<FichaFuncionario['dados']>, situacao: 'ativo' | 'desligado' = 'ativo'): FichaFuncionario =>
    ({ ...fichaVazia({ id: 'emp1', cnpj: '1' }), id: 'f1', cpf: '1', matriculaEsocial: 'M1', situacao, dados: { nome: 'ANA', ...extra } });
const ferias = (dtInicio: string, dtFim: string, perAquisInicio = ''): Afastamento => ({ ...afastamentoVazio(), id: `a${dtInicio}`, fichaId: 'f1', dtInicio, dtFim, motivo: '15', perAquisInicio });

describe('prazos dos funcionários', () => {
    it('períodos de férias: concessivo, último dia para iniciar e gozo reconhecido', () => {
        const p = periodosFerias('2024-03-01', '2026-10-04', [ferias('2025-07-01', '2025-07-30', '2024-03-01')]);
        expect(p.map(x => [x.inicio, x.fim, x.fimConcessivo, x.inicioGozoAte, x.diasGozados, x.completo])).toEqual([
            ['2024-03-01', '2025-02-28', '2026-02-28', '2026-01-30', 30, true],
            ['2025-03-01', '2026-02-28', '2027-02-28', '2027-01-30', 0, false],
            ['2026-03-01', '2027-02-28', '2028-02-29', '2028-01-31', 0, false],
        ]);
        const semPer = periodosFerias('2024-03-01', '2026-10-04', [ferias('2025-07-01', '2025-07-15'), ferias('2025-12-01', '2025-12-15')]);
        expect(semPer[0].diasGozados).toBe(30);
    });

    it('lista férias vencidas e a vencer, fim de experiência, retorno e 16º dia; ignora desligado', () => {
        const hoje = '2026-10-04'; const ate = '2026-12-31';
        const fichas = [
            ficha({ admissao: '2024-01-10' }),
            { ...ficha({ admissao: '2026-08-01', tipoContrato: '2', fimContrato: '2026-10-29' }), id: 'f2', dados: { nome: 'BIA', admissao: '2026-08-01', tipoContrato: '2', fimContrato: '2026-10-29' } },
            { ...ficha({ admissao: '2020-01-01' }, 'desligado'), id: 'f3' },
        ];
        const afast: Afastamento[] = [
            { ...afastamentoVazio(), id: 'x1', fichaId: 'f2', dtInicio: '2026-10-01', dtFim: '', motivo: '03', infoMesmoMtv: 'N' },
            { ...afastamentoVazio(), id: 'x2', fichaId: 'f1', dtInicio: '2026-09-20', dtFim: '2026-10-10', motivo: '01' },
        ];
        const p = prazosFuncionarios(fichas, afast, hoje, ate).sort((a, b) => a.data.localeCompare(b.data));
        expect(p.map(x => [x.tipo, x.nome, x.data, x.gravidade])).toEqual([
            ['ferias', 'ANA', '2025-12-11', 'vencido'],
            ['inss', 'ANA', '2026-10-05', 'urgente'],
            ['retorno', 'ANA', '2026-10-11', 'urgente'],
            ['inss', 'BIA', '2026-10-16', 'normal'],
            ['contrato', 'BIA', '2026-10-29', 'normal'],
            ['ferias', 'ANA', '2026-12-11', 'normal'],
        ]);
        expect(p[0].titulo).toBe('Férias vencidas (pagamento em dobro)');
        expect(p[4].titulo).toBe('Fim do contrato de experiência');
        expect(p.some(x => x.fichaId === 'f3')).toBe(false);
    });

    it('convenção a vencer e próxima data-base', () => {
        const s = { ...sindicatoVazio(), id: 's1', nome: 'SIND', dataBase: '1', vigenciaFim: '2026-12-31' };
        expect(prazosSindicatos([s], '2026-10-04', '2027-01-31').map(x => [x.tipo, x.data])).toEqual([['convencao', '2026-12-31'], ['database', '2027-01-01']]);
        expect(prazosSindicatos([{ ...s, dataBase: '10' }], '2026-10-04', '2026-10-31').map(x => x.data)).toEqual(['2026-10-01']);
    });
});
