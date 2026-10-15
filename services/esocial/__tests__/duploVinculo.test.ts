// Duplo vínculo (múltiplos vínculos) do empregado: o INSS pelo total limitado ao teto, a parte desta empresa, o infoMV
// do S-1200 (validado pelo XSD oficial) e a validação da ficha.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, type ParametrosEsocialFolha } from '../eventosFolha';
import { validarPeloXsd } from '../validadorXsd';
import { calcularMensal } from '../../calculo/motorMensal';
import { calcular13 } from '../../calculo/motor13';
import { inssComOutrosVinculos, validarOutrosVinculos, vinculosDoMes, type OutroVinculo } from '../../cadastros/duploVinculo';
import { diffFicha, fichaVazia, normalizarFicha, validarFicha, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Rubrica } from '../../cadastros/rubricas';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
// Tabela do INSS de 2026 (Portaria Interministerial MPS/MF 13/2026).
const FAIXAS = [{ ate: 162100, aliquota: 7.5 }, { ate: 290284, aliquota: 9 }, { ate: 435427, aliquota: 12 }, { ate: 847555, aliquota: 14 }];
const TETO = 847555;
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2026-01', norma: 'Portaria de teste', observacao: '', valores: {}, faixas: FAIXAS.map(f => ({ ...f, deducao: 0 })) };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 500000, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const reais = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
const CNPJ = '44388152000189';
const OUTRO: OutroVinculo = { tpInsc: '1', nrInsc: '11.222.333/0001-81', codCateg: '101', remuneracao: 200000, desde: '2026-08', ate: '' };
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-03-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' }, outrosVinculos: [OUTRO] };

describe('duplo vínculo do empregado', () => {
    it('INSS: total limitado ao teto, parte proporcional desta empresa; indMV 1, 2 e 3', () => {
        // 3.000 aqui + 2.000 lá = 5.000: INSS do total 501,51; aqui 3.000/5.000 = 300,91 (sozinho seriam 248,60).
        const um = inssComOutrosVinculos(300000, 200000, FAIXAS, TETO, reais)!;
        expect([um.indMV, um.inssTotal, um.baseAqui, um.valor]).toEqual(['1', 50151, 300000, 30091]);
        // 4.000 aqui + 6.000 lá = 10.000 > teto: base aqui = teto − 6.000 = 2.475,55; INSS do teto 988,09 × 2.475,55 / 8.475,55.
        const dois = inssComOutrosVinculos(400000, 600000, FAIXAS, TETO, reais)!;
        expect([dois.indMV, dois.inssTotal, dois.baseAqui, dois.valor]).toEqual(['2', 98809, 247555, 28860]);
        // Lá já no teto: nada aqui.
        expect(inssComOutrosVinculos(300000, 900000, FAIXAS, TETO, reais)).toMatchObject({ indMV: '3', valor: 0 });
        expect(inssComOutrosVinculos(300000, 0, FAIXAS, TETO, reais)).toBeNull();
    });

    it('ficha: valida CNPJ/CPF, categoria, remuneração e período; vale no mês do período; vai no histórico', () => {
        expect(validarOutrosVinculos([OUTRO])).toEqual([]);
        expect(validarOutrosVinculos([{ ...OUTRO, nrInsc: '11222333000100', codCateg: '1', remuneracao: 0, desde: '', ate: '2026-01' }])).toEqual([
            'Duplo vínculo 1: CNPJ do outro empregador inválido.', 'Duplo vínculo 1: categoria do eSocial com 3 dígitos (ex.: 101).',
            'Duplo vínculo 1: informe a remuneração mensal no outro empregador.', 'Duplo vínculo 1: informe o mês de início (a partir de).']);
        expect(validarOutrosVinculos([{ ...OUTRO, desde: '2026-05', ate: '2026-01' }])).toEqual(['Duplo vínculo 1: "até" inválido ou antes do início.']);
        expect(validarOutrosVinculos([{ ...OUTRO, tpInsc: '2', nrInsc: '111.444.777-35' }])).toEqual([]);
        expect(vinculosDoMes([OUTRO, { ...OUTRO, desde: '2026-01', ate: '2026-07' }], '2026-07')).toHaveLength(1);
        expect(normalizarFicha(FICHA).outrosVinculos?.[0].nrInsc).toBe('11222333000181');
        expect(validarFicha(normalizarFicha(FICHA)).erros).toEqual([]);
        expect(diffFicha({ ...FICHA, outrosVinculos: [] }, FICHA).map(a => a.campo)).toContain('outrosVinculos');
    });

    it('motor e S-1200: INSS desta empresa e o infoMV com a outra fonte (XSD oficial); 13º avisa', async () => {
        const r = calcularMensal({ competencia: '2026-10', pagamento: '2026-10', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [] });
        expect(r.verbas.find(v => v.codigo === 'INSS')?.valor).toBe(30091);
        expect(r.infoMV).toEqual({ indMV: '1', outras: [OUTRO] });
        expect(r.memoria.join('\n')).toMatch(/duplo vínculo: base aqui R\$\s3\.000,00 \+ outras fontes R\$\s2\.000,00 = R\$\s5\.000,00; INSS sobre o total R\$\s501,51/);
        // Antes do período: cálculo normal.
        const set = calcularMensal({ competencia: '2026-07', pagamento: '2026-07', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [] });
        expect([set.verbas.find(v => v.codigo === 'INSS')?.valor, set.infoMV]).toEqual([24860, undefined]);
        const RUB: [string, string, string, '1' | '2', string, string, string][] = [['SAL', 'SALARIO', '1000', '1', '11', '11', '11'], ['INSS', 'INSS', '9201', '2', '31', '41', '00']];
        const rubricas: Rubrica[] = RUB.map(([k, dsc, nat, tp, cp, ir, fg]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: cp, codIncIRRF: ir, codIncFGTS: fg, codIncCPRP: '', observacao: '' } }] }));
        const params: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(RUB.map(([k]) => [k, { codRubr: k, ideTabRubr: 'T1' }])) };
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', dataPagamento: '2026-10-30', fichas: [FICHA], resultados: [r], rubricas, parametros: params, agora: new Date('2026-10-15T12:00:00Z') }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        expect(t.s1200!.xml).toContain('<ideTrabalhador><cpfTrab>52998224725</cpfTrab><infoMV><indMV>1</indMV><remunOutrEmpr><tpInsc>1</tpInsc><nrInsc>11222333000181</nrInsc><codCateg>101</codCateg><vlrRemunOE>2000.00</vlrRemunOE></remunOutrEmpr></infoMV>');
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const d13 = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [], movimentos: {} });
        expect(d13.avisos.join(' ')).toMatch(/Duplo vínculo na ficha: o INSS do 13º/);
    });
});
