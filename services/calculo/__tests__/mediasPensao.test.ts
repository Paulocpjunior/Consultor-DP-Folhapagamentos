// @vitest-environment jsdom
// Item 3 dos pontos fortes do SAGE: médias de variáveis (lançamentos) e pensão no IRRF de férias, 13º e rescisão.
import { describe, expect, it } from 'vitest';
import { entraNaMedia, mediaDasVariaveis, variaveisDoMes, type Lancamento, type Movimento } from '../motorMensal';
import { calcularFerias } from '../motorFerias';
import { calcular13 } from '../motor13';
import { calcularRescisao } from '../motorRescisao';
import { limparMovimento } from '../movimento';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, validarAfastamento, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import { gerarEventosFolha, recibosFeriasDaCompetencia, type ParametrosEsocialFolha } from '../../esocial/eventosFolha';
import { calcularMensal } from '../motorMensal';
import type { Rubrica } from '../../cadastros/rubricas';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const TABELAS = [INSS, IR];
const CNPJ = '44388152000189';
const ALIMENTANDO = { tipo: '03', nome: 'FILHA', nascimento: '2015-01-01', cpf: '11144477735', irrf: 'N', salarioFamilia: 'N', pensao: 'S', cotaPensao: '' };
const ficha = (dados: Partial<FichaFuncionario['dados']> = {}, dependentes: unknown[] = []): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'E1_52998224725_M1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dependentes: dependentes as FichaFuncionario['dependentes'], dados: { nome: 'ANA', admissao: '2024-01-02', salario: '6000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const gozo = (extra: Partial<Afastamento> = {}): Afastamento => ({ ...afastamentoVazio(), id: 'g1', fichaId: 'E1_52998224725_M1', motivo: '15', dtInicio: '2025-08-01', dtFim: '2025-08-30', perAquisInicio: '2024-01-02', ...extra });
const lanc = (descricao: string, valor: number, extra: Partial<Lancamento> = {}): Lancamento => ({ descricao, tipo: 'provento', valor, inss: true, fgts: true, irrf: true, ...extra });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('médias de variáveis', () => {
    it('entra na média: o marcado; sem marcar, o provento com INSS (comissão) e não o reembolso sem INSS', () => {
        expect(entraNaMedia(lanc('Comissão', 1))).toBe(true);
        expect(entraNaMedia(lanc('Reembolso', 1, { inss: false }))).toBe(false);
        expect(entraNaMedia(lanc('Prêmio', 1, { media: false }))).toBe(false);
        expect(entraNaMedia(lanc('Ajuda', 1, { inss: false, media: true }))).toBe(true);
        expect(entraNaMedia(lanc('Desconto', 1, { tipo: 'desconto' }))).toBe(false);
    });

    it('variáveis do mês: horas extras com DSR e os lançamentos; a marca "Média" fica gravada no movimento', () => {
        const mov: Movimento = { horasExtras50: 10, lancamentos: [lanc('Comissão', 50000), lanc('Prêmio', 30000, { media: false })] };
        const x = variaveisDoMes(1000, mov, '2025-09');
        expect(x.outras).toBe(50000);
        expect(x.horasExtras).toBeGreaterThan(15000);
        expect(limparMovimento(mov).lancamentos?.[1]).toMatchObject({ media: false });
        expect('media' in (limparMovimento(mov).lancamentos?.[0] ?? {})).toBe(false);
        const m = mediaDasVariaveis(1000, { '2025-01': { lancamentos: [lanc('Comissão', 120000)] } }, ['2025-01', '2025-02'], 12, '12');
        expect(m.media).toBe(10000);
        expect(m.memoria[0]).toContain('lançamentos que entram na média');
    });

    it('férias, 13º e rescisão somam a média dos lançamentos (comissão de R$ 1.200,00 por mês)', () => {
        const movs: Record<string, Movimento> = {};
        for (let m = 1; m <= 12; m++) movs[`2024-${String(m).padStart(2, '0')}`] = { lancamentos: [lanc('Comissão', 120000)] };
        for (let m = 1; m <= 12; m++) movs[`2025-${String(m).padStart(2, '0')}`] = { lancamentos: [lanc('Comissão', 120000)] };
        const ano2024 = Object.fromEntries(Object.entries(movs).filter(([c]) => c.startsWith('2024')));
        const sem = calcularFerias({ ficha: ficha(), gozo: gozo(), afastamentos: [gozo()], tabelas: TABELAS, movimentos: {} });
        const com = calcularFerias({ ficha: ficha(), gozo: gozo(), afastamentos: [gozo()], tabelas: TABELAS, movimentos: ano2024 });
        expect(v(com, 'FER') - v(sem, 'FER')).toBe(Math.round((600000 + 120000) / 30 * 30) - 600000);
        const d13 = calcular13({ ano: 2025, parcela: '2a', ficha: ficha(), afastamentos: [], tabelas: TABELAS, movimentos: movs });
        expect(v(d13, '13')).toBe(600000 + 120000);
        const resc = calcularRescisao({ ficha: ficha(), data: '2025-12-31', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TABELAS, movimentos: movs });
        expect(resc.memoria.join('\n')).toContain('média dos lançamentos variáveis R$');
    });
});

describe('pensão alimentícia em férias, 13º e rescisão', () => {
    it('férias: a pensão gravada no gozo desconta e deduz no IRRF', () => {
        const f = ficha({}, [ALIMENTANDO]);
        const sem = calcularFerias({ ficha: f, gozo: gozo(), afastamentos: [gozo()], tabelas: TABELAS, movimentos: {} });
        const g = gozo({ pensaoFerias: '150000' });
        const com = calcularFerias({ ficha: f, gozo: g, afastamentos: [g], tabelas: TABELAS, movimentos: {} });
        expect(v(com, 'PENSAOFER')).toBe(150000);
        expect(v(com, 'IRRFFER')).toBeLessThan(v(sem, 'IRRFFER'));
        expect(com.deducoesIrrf?.pensao).toBe(150000);
        expect(validarAfastamento({ ...g, pensaoFerias: '1,5' }, undefined, []).erros.join(' ')).toContain('Pensão sobre férias: valor inválido');
        expect(validarAfastamento({ ...g, motivo: '01', pensaoFerias: '100' }, undefined, []).erros.join(' ')).toContain('só para férias');
    });

    it('13º: a pensão do movimento de novembro e de dezembro deduz no IRRF da 2ª; cada parcela desconta a sua', () => {
        const f = ficha({}, [ALIMENTANDO]);
        const sem = calcular13({ ano: 2025, parcela: '2a', ficha: f, afastamentos: [], tabelas: TABELAS, movimentos: {} });
        const movs = { '2025-11': { pensao13: 50000 }, '2025-12': { pensao13: 100000 } };
        const a1 = calcular13({ ano: 2025, parcela: '1a', ficha: f, afastamentos: [], tabelas: TABELAS, movimentos: movs });
        expect(v(a1, 'PENSAO13')).toBe(50000);
        const a2 = calcular13({ ano: 2025, parcela: '2a', ficha: f, afastamentos: [], tabelas: TABELAS, movimentos: movs });
        expect(v(a2, 'PENSAO13')).toBe(100000);
        expect(a2.deducoesIrrf?.pensao).toBe(150000);
        expect(v(a2, 'IRRF13')).toBeLessThan(v(sem, 'IRRF13'));
    });

    it('rescisão: a pensão sobre o 13º do mês do desligamento deduz no IRRF do 13º', () => {
        const f = ficha({}, [ALIMENTANDO]);
        const base = { ficha: f, data: '2025-10-31', tipo: '02' as const, aviso: 'indenizado' as const, afastamentos: [], tabelas: TABELAS };
        const sem = calcularRescisao({ ...base, movimentos: {} });
        const com = calcularRescisao({ ...base, movimentos: { '2025-10': { pensao13: 80000 } } });
        expect(v(com, 'PENSAO13')).toBe(80000);
        expect(v(com, 'IRRF13')).toBeLessThan(v(sem, 'IRRF13'));
    });

    it('S-1210: a pensão das férias vai como penAlim tpRend 13 no mês do recibo', () => {
        const f = ficha({ salario: '9000.00' }, [ALIMENTANDO]);
        const g = gozo({ fichaId: f.id, pensaoFerias: '150000' });
        const NAT: [string, string, '1' | '2'][] = [['SAL', '1000', '1'], ['INSS', '9201', '2'], ['IRRF', '9203', '2'], ['FERMES', '1016', '1'], ['FERMES13', '1017', '1'], ['FERPAGO', '9221', '2'],
            ['INSSFERRET', '9201', '2'], ['IRRFFERRET', '9203', '2'], ['FERADI', '1015', '1'], ['FERADI13', '1015', '1'], ['INSSFER', '9201', '2'], ['IRRFFER', '9203', '2'], ['PENSAOFER', '9213', '2']];
        const rubricas: Rubrica[] = NAT.map(([k, nat, tp]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: k, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] }));
        const params: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(NAT.map(([k]) => [k, { codRubr: k, ideTabRubr: 'T1' }])) };
        const r = calcularMensal({ competencia: '2025-07', pagamento: '2025-08', ficha: f, tabelas: TABELAS, afastamentos: [g] });
        const recibos = recibosFeriasDaCompetencia([f], [g], TABELAS, {}, '2025-07');
        expect(v(recibos[0].r, 'PENSAOFER')).toBe(150000);
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2025-07', dataPagamento: '2025-08-05', fichas: [f], resultados: [r], rubricas, parametros: params, recibosFerias: recibos }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        const jul = new DOMParser().parseFromString(t.outrosMeses[0].s1210!.xml, 'application/xml');
        const pen = jul.getElementsByTagName('penAlim')[0];
        expect(Array.from(pen.children).map(e => e.textContent)).toEqual(['13', '11144477735', '1500.00']);
    });
});
