import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import { calcularFerias, periodosAquisitivos } from '../../calculo/motorFerias';
import { afastamentosParaGravar, coletivasGravadas, planejarColetiva, setoresDasFichas, type PlanoColetiva } from '../feriasColetivas';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (id: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2025-03-10', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', departamentoIob: 'PRODUCAO', ...dados } });
const afast = (fichaId: string, motivo: string, dtInicio: string, dtFim: string, extra: Partial<Afastamento> = {}): Afastamento => ({ ...afastamentoVazio(), id: `${fichaId}_${dtInicio}`, empresaId: 'E1', fichaId, motivo, dtInicio, dtFim, ...extra });
const FICHAS = [
    ficha('ana'),
    ficha('bia', { admissao: '2026-06-01' }),
    ficha('caio', { admissao: '2024-01-02' }),
    ficha('davi'),
    ficha('edu', { categoria: '111' }),
    ficha('fabi', { departamentoIob: 'ADMINISTRACAO' }),
];
const AFAST = [
    afast('caio', '15', '2025-01-05', '2025-02-03', { perAquisInicio: '2024-01-02' }),
    afast('caio', '15', '2026-03-01', '2026-03-22', { perAquisInicio: '2025-01-02' }),
    afast('davi', '01', '2026-12-01', ''),
];
const plano = (x: Partial<PlanoColetiva> = {}): PlanoColetiva => ({ inicio: '2026-12-14', dias: 20, setor: { tipo: 'departamento', valor: 'PRODUCAO' }, restante: 'licenca', meEpp: false, hoje: '2026-11-20', ...x });

describe('férias coletivas: plano', () => {
    it('saldo, proporcionais do art. 140, licença do excedente e exclusões', () => {
        const r = planejarColetiva(plano(), FICHAS, AFAST, {});
        expect(r.erros).toEqual([]);
        expect(r.fim).toBe('2027-01-02');
        expect(r.prazoComunicacao).toBe('2026-11-29');
        const por = Object.fromEntries(r.itens.map(i => [i.fichaId, i]));
        expect(Object.keys(por).sort()).toEqual(['ana', 'bia', 'caio', 'davi', 'edu']); // fabi é de outro setor
        expect(por.ana).toMatchObject({ situacao: 'ferias', diasGozo: 20, diasLicenca: 0 });
        expect(por.ana.afastamentos).toEqual([expect.objectContaining({ id: 'ana_2026-12-14', motivo: '15', dtFim: '2027-01-02', perAquisInicio: '2025-03-10', coletiva: '2026-12-14' })]);
        // 6/12 de 30 = 15 dias (dezembro com 13 dias até a véspera não conta); 5 dias de licença; novo período em 14/12.
        expect(por.bia).toMatchObject({ situacao: 'proporcionais', diasGozo: 15, diasLicenca: 5 });
        expect(por.bia.afastamentos.map(a => [a.motivo, a.dtInicio, a.dtFim, a.novoPeriodo ?? ''])).toEqual([['15', '2026-12-14', '2026-12-28', 'S'], ['16', '2026-12-29', '2027-01-02', '']]);
        expect(por.caio).toMatchObject({ situacao: 'ferias', diasGozo: 8, diasLicenca: 12 });
        expect(por.davi).toMatchObject({ situacao: 'excluido' });
        expect(por.davi.motivo).toMatch(/Afastamento 01 de 01\/12\/2026 \(sem término\)/);
        expect(por.edu.motivo).toMatch(/Intermitente/);
        expect(afastamentosParaGravar(r)).toHaveLength(5);
        expect(r.avisos.join(' ')).toMatch(/Comunique ao Ministério do Trabalho e ao sindicato até 29\/11\/2026/);
        expect(r.avisos.join(' ')).toMatch(/licença remunerada são pagos como salário normal/);
    });
    it('antecipação do período em curso no lugar da licença', () => {
        const r = planejarColetiva(plano({ restante: 'antecipar' }), FICHAS, AFAST, {});
        const caio = r.itens.find(i => i.fichaId === 'caio')!;
        expect(caio).toMatchObject({ diasGozo: 8, diasAntecipados: 12, diasLicenca: 0 });
        expect(caio.afastamentos.map(a => [a.dtInicio, a.dtFim, a.perAquisInicio])).toEqual([['2026-12-14', '2026-12-21', '2025-01-02'], ['2026-12-22', '2027-01-02', '2026-01-02']]);
    });
    it('regras: mínimo de 10 dias, 2 por ano, início antes de feriado ou domingo, prazo da comunicação, ME/EPP', () => {
        expect(planejarColetiva(plano({ dias: 9 }), FICHAS, AFAST, {}).erros[0]).toMatch(/mínimo 10 dias/);
        const duas = [...AFAST, afast('ana', '15', '2026-02-02', '2026-02-11', { coletiva: '2026-02-02' }), afast('ana', '15', '2026-07-06', '2026-07-15', { coletiva: '2026-07-06' })];
        expect(coletivasGravadas(duas)).toEqual(['2026-02-02', '2026-07-06']);
        expect(planejarColetiva(plano(), FICHAS, duas, {}).erros[0]).toMatch(/Já há 2 férias coletivas em 2026/);
        expect(planejarColetiva(plano({ inicio: '2026-12-23' }), FICHAS, AFAST, {}).erros[0]).toMatch(/25\/12\/2026 é feriado/);
        expect(planejarColetiva(plano({ inicio: '2026-12-18' }), FICHAS, AFAST, {}).avisos[0]).toMatch(/20\/12\/2026 é domingo/);
        expect(planejarColetiva(plano({ hoje: '2026-12-01' }), FICHAS, AFAST, {}).avisos.join(' ')).toMatch(/deveria ter saído até 29\/11\/2026/);
        expect(planejarColetiva(plano({ meEpp: true }), FICHAS, AFAST, {}).avisos.join(' ')).toMatch(/ao sindicato \(ME\/EPP dispensada/);
        expect(planejarColetiva(plano({ setor: { tipo: 'departamento', valor: 'NADA' } }), FICHAS, AFAST, {}).erros).toEqual(['Nenhum empregado do setor entra nestas férias coletivas.']);
        expect(setoresDasFichas(FICHAS, 'departamento')).toEqual(['ADMINISTRACAO', 'PRODUCAO']);
    });
    it('depois de gravado, a coletiva aparece como gravada e não grava de novo', () => {
        const r = planejarColetiva(plano(), FICHAS, AFAST, {});
        const r2 = planejarColetiva(plano(), FICHAS, [...AFAST, ...afastamentosParaGravar(r)], {});
        expect(r2.itens.filter(i => i.situacao === 'gravado').map(i => [i.fichaId, i.diasGozo, i.diasLicenca])).toEqual([['ana', 20, 0], ['bia', 15, 5], ['caio', 8, 12]]);
        expect(afastamentosParaGravar(r2)).toEqual([]);
    });
});

describe('férias coletivas no motor (art. 140)', () => {
    it('o recibo das proporcionais sai e o novo período aquisitivo começa no gozo', () => {
        const r = planejarColetiva(plano(), FICHAS, AFAST, {});
        const bia = FICHAS[1];
        const afs = afastamentosParaGravar(r).filter(a => a.fichaId === 'bia');
        const rec = calcularFerias({ ficha: bia, gozo: afs[0], afastamentos: afs, tabelas: TAB, movimentos: {} });
        expect(rec.erros).toEqual([]);
        expect([rec.direito, rec.saldo, rec.diasGozo, rec.periodo]).toEqual([15, 15, 15, { inicio: '2026-06-01', fim: '2026-12-13', fimConcessivo: '2027-12-13' }]);
        expect(rec.memoria.join(' ')).toMatch(/CLT, art. 140\): proporcionais do período 01\/06\/2026 a 13\/12\/2026 \(6\/12\)/);
        const ps = periodosAquisitivos('2026-06-01', '2027-06-30', 'bia', afs, {}, afs.filter(a => a.motivo === '15'));
        expect(ps.map(p => [p.inicio, p.fim, p.direito, p.consumido])).toEqual([['2026-06-01', '2026-12-13', 15, 15], ['2026-12-14', '2027-12-13', 30, 0]]);
    });
    it('quem tem saldo: os recibos de cada parte (saldo e antecipação) saem pelo motor', () => {
        const r = planejarColetiva(plano({ restante: 'antecipar' }), FICHAS, AFAST, {});
        const caio = FICHAS[2];
        const afs = [...AFAST.filter(a => a.fichaId === 'caio'), ...afastamentosParaGravar(r).filter(a => a.fichaId === 'caio')];
        const [g1, g2] = afs.filter(a => a.coletiva);
        expect(calcularFerias({ ficha: caio, gozo: g1, afastamentos: afs, tabelas: TAB, movimentos: {} }).erros).toEqual([]);
        expect(calcularFerias({ ficha: caio, gozo: g2, afastamentos: afs, tabelas: TAB, movimentos: {} }).diasGozo).toBe(12);
    });
});
