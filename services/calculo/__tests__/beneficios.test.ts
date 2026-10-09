// Benefícios da empresa com desconto fixo na folha (assistência odontológica do IOB, evento 7001, ref. = vidas),
// conferido com o holerite do IOB da 1200 de 09/2026 (dados trocados).
import { describe, expect, it } from 'vitest';
import { calcularMensal } from '../motorMensal';
import { arredondar } from '../arredondamento';
import { comHistorico, ehBeneficio, validarAdesoes, validarBeneficios, verbasDosBeneficios, type Beneficio } from '../beneficios';
import { conferirHolerite, movimentoDoHolerite } from '../conferenciaHolerites';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { diffFicha, fichaVazia, validarFicha, type FichaFuncionario } from '../../cadastros/funcionarios';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ODONTO: Beneficio = { id: 'odonto', nome: 'Assistência odontológica', codigoIob: '7001', tipo: 'desconto', valor: 13874, inss: false, fgts: false, irrf: false, ativo: true };
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'CARLA', admissao: '2026-02-19', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', adiantamentoPct: '40', valeTransporte: 'S' },
    beneficios: [{ beneficioId: 'odonto', vidas: 1 }] };
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor;

describe('benefícios da empresa', () => {
    it('odontológico de 1 vida: 138,74 sem INSS, FGTS e IRRF; líquido do IOB 1.232,00', () => {
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: FICHA, tabelas: TAB, afastamentos: [], beneficios: [ODONTO], folhaPagaNoAdiantamento: null });
        expect([v(r, 'BEN-odonto'), v(r, 'INSS'), v(r, 'VT'), v(r, 'ADIANT')]).toEqual([13874, 24860, 18000, 120000]);
        expect([r.bases.inss, r.bases.fgts]).toEqual([300000, 300000]);
        expect(r.verbas.find(x => x.codigo === 'BEN-odonto')).toMatchObject({ descricao: 'Assistência odontológica', referencia: '1 vida', tipo: 'desconto' });
        // Com o arredondamento anterior do IOB (0,71): atual 0,05 e líquido 1.232,00.
        const a = arredondar(r, 71);
        expect([v(a, 'ARREDATU'), a.totais.liquido]).toEqual([5, 123200]);
    });

    it('vidas, vigência e benefício inativo', () => {
        expect(verbasDosBeneficios([ODONTO], [{ beneficioId: 'odonto', vidas: 3 }], '2026-09').verbas[0].valor).toBe(41622);
        expect(verbasDosBeneficios([ODONTO], [{ beneficioId: 'odonto', vidas: 1, desde: '2026-10' }], '2026-09').verbas).toEqual([]);
        expect(verbasDosBeneficios([ODONTO], [{ beneficioId: 'odonto', vidas: 1, ate: '2026-08' }], '2026-09').verbas).toEqual([]);
        expect(verbasDosBeneficios([{ ...ODONTO, ativo: false }], [{ beneficioId: 'odonto', vidas: 1 }], '2026-09').verbas).toEqual([]);
        expect(verbasDosBeneficios([ODONTO], [{ beneficioId: 'outro', vidas: 1 }], '2026-09').verbas).toEqual([]);
    });

    it('validação do cadastro e da ficha', () => {
        expect(validarBeneficios([{ ...ODONTO, nome: ' ', valor: 0 }])).toEqual(['Benefício 1: informe o nome.', 'Benefício 1: informe o valor por vida.']);
        expect(validarBeneficios([ODONTO, { ...ODONTO, id: 'x' }])).toEqual(['Há benefícios com o mesmo nome.']);
        expect(validarAdesoes([{ beneficioId: 'odonto', vidas: 0 }, { beneficioId: 'b', vidas: 1, desde: '2026-10', ate: '2026-09' }])).toEqual(['Benefícios: vidas entre 1 e 20.', 'Benefícios: fim antes do início.']);
        expect(validarFicha({ ...FICHA, beneficios: [{ beneficioId: 'odonto', vidas: 0 }] }).erros).toContain('Benefícios: vidas entre 1 e 20.');
        // Vidas mudaram em 11/2026: dois períodos do mesmo benefício, sem sobreposição; cada mês desconta as vidas da época (Codex #122).
        const periodos = [{ beneficioId: 'odonto', vidas: 1, ate: '2026-10' }, { beneficioId: 'odonto', vidas: 2, desde: '2026-11' }];
        expect(validarAdesoes(periodos)).toEqual([]);
        expect([verbasDosBeneficios([ODONTO], periodos, '2026-10').verbas[0].valor, verbasDosBeneficios([ODONTO], periodos, '2026-11').verbas[0].valor]).toEqual([13874, 27748]);
        expect(validarAdesoes([{ beneficioId: 'odonto', vidas: 1 }, { beneficioId: 'odonto', vidas: 2, desde: '2026-11' }])).toEqual(['Benefícios: períodos do mesmo benefício se sobrepõem (feche o anterior com "até" antes de abrir o novo).']);
        // A adesão entra no histórico (auditoria) da ficha.
        expect(diffFicha(FICHA, { ...FICHA, beneficios: [] }).map(a => a.campo)).toEqual(['beneficios']);
    });

    it('holerite do IOB: a linha do benefício confere com o motor e não vira lançamento avulso', () => {
        const linha = { codigo: '7001', descricao: 'ASSISTENCIA ODONTOLOGIC', referencia: '1,00', provento: 0, desconto: 13874 };
        expect(ehBeneficio([ODONTO], '', 'ASSISTENCIA ODONTOLOGIC')).toBe(true);
        expect(ehBeneficio([ODONTO], '7001', 'QUALQUER')).toBe(true);
        expect(ehBeneficio([ODONTO], '', 'FARMACIA')).toBe(false);
        const h = { nome: 'CARLA', competencia: '2026-09', verbas: [linha], totalProventos: null, totalDescontos: null, liquido: 123200, baseInss: null, baseFgts: null, fgtsMes: null, baseIrrf: null, avisos: [] } as never;
        expect(movimentoDoHolerite(h, [ODONTO]).movimento.lancamentos).toBeUndefined();
        expect(movimentoDoHolerite(h).movimento.lancamentos?.[0]?.valor).toBe(13874);
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: FICHA, tabelas: TAB, afastamentos: [], beneficios: [ODONTO], folhaPagaNoAdiantamento: null });
        const c = conferirHolerite(r, h, 'cpf', { fichaId: 'f1', nome: 'CARLA', competencia: '2026-09', beneficios: [ODONTO] });
        expect(c.semCorrespondente).toEqual([]);
        expect(c.linhas.find(l => l.item === 'Benefícios da empresa (efeito)')).toMatchObject({ motor: -13874, iob: -13874, ok: true });
    });

    it('mudança de valor ou desativação vale da competência da tela em diante (Codex #122)', () => {
        const ades = [{ beneficioId: 'odonto', vidas: 1 }];
        const novo = comHistorico([ODONTO], [{ ...ODONTO, valor: 15000 }], '2026-11');
        expect(novo[0].historico).toEqual([{ tipo: 'desconto', valor: 13874, inss: false, fgts: false, irrf: false, ativo: true, ate: '2026-10' }]);
        expect(verbasDosBeneficios(novo, ades, '2026-10').verbas[0].valor).toBe(13874);
        expect(verbasDosBeneficios(novo, ades, '2026-11').verbas[0].valor).toBe(15000);
        // Desativado em 12/2026: novembro ainda desconta.
        const fim = comHistorico(novo, [{ ...novo[0], ativo: false }], '2026-12');
        expect(verbasDosBeneficios(fim, ades, '2026-11').verbas[0].valor).toBe(15000);
        expect(verbasDosBeneficios(fim, ades, '2026-12').verbas).toEqual([]);
        // Sem mudança (só o nome), o histórico fica como está; mudar de novo no mesmo mês não cria faixa vazia.
        expect(comHistorico([ODONTO], [{ ...ODONTO, nome: 'Odonto' }], '2026-11')[0].historico).toBeUndefined();
        expect(comHistorico(novo, [{ ...novo[0], valor: 16000 }], '2026-11')[0].historico).toEqual(novo[0].historico);
    });

    it('holerite só com a linha do benefício legível: confere, não fica ilegível (Codex #122)', () => {
        const linha = { codigo: '7001', descricao: 'ASSISTENCIA ODONTOLOGIC', referencia: '1,00', provento: 0, desconto: 13874 };
        const h = { nome: 'CARLA', competencia: '2026-09', verbas: [linha], totalProventos: null, totalDescontos: null, liquido: null, baseInss: null, baseFgts: null, fgtsMes: null, baseIrrf: null, avisos: [] } as never;
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: FICHA, tabelas: TAB, afastamentos: [], beneficios: [ODONTO], folhaPagaNoAdiantamento: null });
        const c = conferirHolerite(r, h, 'cpf', { fichaId: 'f1', nome: 'CARLA', competencia: '2026-09', beneficios: [ODONTO] });
        expect(c.situacao).not.toBe('ilegível');
        expect(c.linhas.find(l => l.item === 'Benefícios da empresa (efeito)')?.ok).toBe(true);
    });
});
