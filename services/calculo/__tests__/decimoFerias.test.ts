// 13º: 1ª parcela paga com as férias (Lei 4.749/1965, art. 2º, § 2º) e parcela única (dados fictícios).
import { describe, expect, it } from 'vitest';
import { calcular13, feriasComAdiantamento13, type Entrada13 } from '../motor13';
import { calcularFerias } from '../motorFerias';
import { calcularRescisao } from '../motorRescisao';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, mesclarAfastamentos, validarAfastamento, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2024-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2024-01', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const TABELAS = [INSS, IR];
const ficha = (dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'emp1', cnpj: '11222333000181' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const gozo = (a: Partial<Afastamento> = {}): Afastamento => ({ ...afastamentoVazio(), id: `f1_${a.dtInicio ?? '2026-07-06'}`, fichaId: 'f1', motivo: '15',
    dtInicio: '2026-07-06', dtFim: '2026-07-25', perAquisInicio: '2025-01-02', perAquisFim: '2026-01-01', adiantar13: 'S', ...a });
// 1º período (2024) já gozado em 2025: o de 2025 é o das férias de julho de 2026.
const anterior: Afastamento = { ...afastamentoVazio(), id: 'f1_2025-02-03', fichaId: 'f1', motivo: '15', dtInicio: '2025-02-03', dtFim: '2025-03-04', perAquisInicio: '2024-01-02', perAquisFim: '2025-01-01' };
const c13 = (p: Partial<Entrada13>) => calcular13({ ano: 2026, parcela: '2a', ficha: ficha(), afastamentos: [anterior, gozo()], tabelas: TABELAS, movimentos: {}, ...p });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('1ª parcela do 13º com as férias', () => {
    it('o recibo de férias paga a 1ª parcela, com FGTS e sem INSS e IRRF', () => {
        const g = gozo();
        const com = calcularFerias({ ficha: ficha(), gozo: g, afastamentos: [anterior, g], tabelas: TABELAS, movimentos: {} });
        const sem = calcularFerias({ ficha: ficha(), gozo: { ...g, adiantar13: '' }, afastamentos: [anterior, { ...g, adiantar13: '' }], tabelas: TABELAS, movimentos: {} });
        expect(com.erros).toEqual([]);
        expect(com.pagamento).toBe('2026-07');
        expect(v(com, '13A')).toBe(150000);
        expect(com.adiantamento13).toEqual({ valor: 150000, fgts: 12000, competencia: '2026-07' });
        expect(com.fgts - sem.fgts).toBe(12000);
        // INSS e IRRF das férias não mudam; o líquido sobe a 1ª parcela.
        expect([v(com, 'INSSFER'), v(com, 'IRRFFER')]).toEqual([v(sem, 'INSSFER'), v(sem, 'IRRFFER')]);
        expect(com.totais.liquido - sem.totais.liquido).toBe(150000);
        expect(com.memoria.join(' ')).toContain('Lei 4.749/1965, art. 2º, § 2º');
    });

    it('a 1ª de novembro não sai de novo e a 2ª desconta a das férias', () => {
        expect(feriasComAdiantamento13(2026, [anterior, gozo()])).toMatchObject({ pagamento: '2026-07' });
        const nov = c13({ parcela: '1a' });
        expect(nov.situacao).toBe('erro');
        expect(nov.erros[0]).toMatch(/já paga com as férias de 06\/07\/2026/);
        const dez = c13({});
        expect([v(dez, '13'), v(dez, '13ADT')]).toEqual([300000, 150000]);
        expect(dez.memoria.join(' ')).toMatch(/1ª parcela paga com as férias de 06\/07\/2026/);
        expect(dez.avisos.join(' ')).not.toMatch(/calculado da 1ª parcela em novembro/);
        // Valor informado na tela prevalece.
        expect(v(c13({ primeiraPaga: 140000 }), '13ADT')).toBe(140000);
    });

    it('férias pagas em dezembro não adiantam (já é a 2ª parcela)', () => {
        const g = gozo({ dtInicio: '2026-12-07', dtFim: '2026-12-26' });
        const r = calcularFerias({ ficha: ficha(), gozo: g, afastamentos: [anterior, g], tabelas: TABELAS, movimentos: {} });
        expect(v(r, '13A')).toBe(0);
        expect(r.avisos.join(' ')).toMatch(/de janeiro a novembro/);
        expect(feriasComAdiantamento13(2026, [g])).toBeNull();
    });

    it('rescisão desconta a 1ª parcela paga com as férias antes do desligamento', () => {
        const base = { ficha: ficha(), tipo: '02' as const, aviso: 'indenizado' as const, afastamentos: [anterior, gozo()], tabelas: TABELAS, movimentos: {} };
        const r = calcularRescisao({ ...base, data: '2026-09-15' });
        expect(v(r, '13ADT')).toBe(150000);
        expect(r.memoria.join(' ')).toMatch(/1ª parcela paga com as férias de 06\/07\/2026/);
        expect(v(calcularRescisao({ ...base, data: '2026-09-15', adiantamento13: 0 }), '13ADT')).toBe(0);
        // Desligado antes do recibo: nada foi adiantado.
        expect(v(calcularRescisao({ ...base, data: '2026-06-10' }), '13ADT')).toBe(0);
    });
});

describe('parcela única', () => {
    const semFerias = [anterior];
    it('sem 1ª parcela; a 2ª paga o 13º inteiro e avisa do prazo legal', () => {
        const nov = c13({ parcela: '1a', afastamentos: semFerias, parcelaUnica: true });
        expect(nov.erros[0]).toMatch(/Parcela única/);
        const dez = c13({ afastamentos: semFerias, parcelaUnica: true });
        expect([v(dez, '13'), v(dez, '13ADT')]).toEqual([300000, 0]);
        expect(dez.avisos.join(' ')).toMatch(/Lei 7\.855\/1989, art\. 3º/);
        // Paga inteira até novembro: dentro do prazo, sem o aviso.
        expect(c13({ afastamentos: semFerias, parcelaUnica: true, pagamento: '2026-11' }).avisos.join(' ')).not.toMatch(/7\.855/);
    });
    it('quem recebeu a 1ª com as férias tem ela descontada mesmo na parcela única', () => {
        const dez = c13({ parcelaUnica: true });
        expect(v(dez, '13ADT')).toBe(150000);
        expect(dez.avisos.join(' ')).toMatch(/recebeu a 1ª parcela com as férias/);
    });
});

describe('afastamento', () => {
    it('só férias pedem a 1ª parcela; pensão e a marca são gravadas e sobrevivem à reimportação', () => {
        expect(validarAfastamento(gozo({ motivo: '03' }), ficha(), []).erros.join(' ')).toMatch(/só para férias/);
        // Campos que a gravação guarda (os do modelo vazio).
        expect(Object.keys(afastamentoVazio())).toEqual(expect.arrayContaining(['pensaoFerias', 'adiantar13']));
        const atual = gozo({ pensaoFerias: '50000', origem: 'XML eSocial' });
        const [m] = mesclarAfastamentos([{ ...atual, adiantar13: '', pensaoFerias: '', observacao: 'nova' }], [atual]);
        expect(m.afastamento).toMatchObject({ adiantar13: 'S', pensaoFerias: '50000', observacao: 'nova' });
    });
});
