// Descontos para o sindicato e aviso prévio da convenção no cálculo (dados fictícios).
import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { calcularMensal } from '../../calculo/motorMensal';
import { calcularRescisao, diasDeAviso } from '../../calculo/motorRescisao';
import { convencaoDaFicha, convencaoVazia, validarConvencao, type ConvencaoColetiva } from '../convencao';
import { avisoDaConvencao, contribuicaoPadrao, descontosSindicais, validarContribuicoes, type ContribuicaoConvencao } from '../contribuicoes';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const SIND = '11111111000191';
const ficha = (dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', nascimento: '1975-05-10', admissao: '2015-02-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const ASSIST: ContribuicaoConvencao = { tipo: 'assistencial', forma: 'percentual', valor: 2, meses: [], teto: 5000, descricao: 'Cláusula 40' };
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('descontos para o sindicato', () => {
    const sindical = contribuicaoPadrao('sindical');
    it('contribuição sindical: um dia de salário em março, só com autorização (CLT, art. 579)', () => {
        const com = descontosSindicais([sindical], ficha({ contribuicaoSindical: 'S' }), '2026-03', 300000, 10000);
        expect(com.descontos).toEqual([{ codigo: 'CONTSIND', descricao: 'Contribuição sindical', referencia: '1 dia(s)', valor: 10000 }]);
        const sem = descontosSindicais([sindical], ficha(), '2026-03', 300000, 10000);
        expect(sem.descontos).toEqual([]);
        expect(sem.memoria[0]).toMatch(/não descontada \(só com autorização prévia e expressa/);
        expect(descontosSindicais([sindical], ficha({ contribuicaoSindical: 'S' }), '2026-04', 300000, 10000).descontos).toEqual([]);
    });
    it('assistencial: de todos, com teto, salvo quem se opôs (STF, Tema 935)', () => {
        expect(descontosSindicais([ASSIST], ficha(), '2026-05', 300000, 10000).descontos[0]).toMatchObject({ codigo: 'CONTASSIST', valor: 5000, referencia: '2%' });
        expect(descontosSindicais([{ ...ASSIST, teto: null }], ficha(), '2026-05', 300000, 10000).descontos[0].valor).toBe(6000);
        expect(descontosSindicais([ASSIST], ficha({ oposicaoAssistencial: 'S' }), '2026-05', 300000, 10000).descontos).toEqual([]);
    });
    it('confederativa e mensalidade: só dos filiados (Súmula Vinculante 40)', () => {
        const cs: ContribuicaoConvencao[] = [{ tipo: 'confederativa', forma: 'percentual', valor: 1, meses: [6], teto: null, descricao: '' }, { tipo: 'mensalidade', forma: 'valor', valor: 2500, meses: [], teto: null, descricao: '' }];
        expect(descontosSindicais(cs, ficha(), '2026-06', 300000, 10000).descontos).toEqual([]);
        expect(descontosSindicais(cs, ficha({ associadoSindicato: 'S' }), '2026-06', 300000, 10000).descontos.map(x => [x.codigo, x.valor])).toEqual([['CONTCONF', 3000], ['MENSSIND', 2500]]);
    });
    it('validação: valor, meses, teto e um de cada tipo', () => {
        expect(validarContribuicoes([sindical, ASSIST])).toEqual([]);
        const e = validarContribuicoes([{ ...ASSIST, valor: 0 }, { ...ASSIST, valor: 150, meses: [13] }]).join(' ');
        expect(e).toMatch(/informe o valor/); expect(e).toMatch(/acima de 100%/); expect(e).toMatch(/meses de 1 a 12/); expect(e).toMatch(/só uma vez/);
        expect(validarConvencao({ ...convencaoVazia(SIND), vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31', contribuicoes: [{ ...ASSIST, valor: 0 }], avisoPrevio: [{ idadeMinima: null, anosMinimos: 5, diasAdicionais: 0, descricao: '' }] }).join(' '))
            .toMatch(/informe o valor.*dias a mais entre 1 e 180/);
    });
});

describe('na folha do mês', () => {
    const contribuicoesSindicais = [contribuicaoPadrao('sindical'), ASSIST];
    it('desconto sem incidência: as bases não mudam e o líquido cai', () => {
        const f = ficha({ contribuicaoSindical: 'S' });
        const com = calcularMensal({ competencia: '2026-03', pagamento: '2026-03', ficha: f, afastamentos: [], tabelas: TAB, contribuicoesSindicais, folhaPagaAntesNoMes: null });
        const sem = calcularMensal({ competencia: '2026-03', pagamento: '2026-03', ficha: f, afastamentos: [], tabelas: TAB, folhaPagaAntesNoMes: null });
        expect([v(com, 'CONTSIND'), v(com, 'CONTASSIST')]).toEqual([10000, 5000]);
        expect(com.bases).toEqual(sem.bases);
        expect(com.totais.liquido).toBe(sem.totais.liquido - 15000);
        expect(com.memoria.join(' ')).toMatch(/Contribuição sindical da convenção: 1 dia\(s\) × R\$\s100,00 = R\$\s100,00/);
    });
    it('afastado o mês todo: não desconta, com aviso', () => {
        const r = calcularMensal({ competencia: '2026-03', pagamento: '2026-03', ficha: ficha({ contribuicaoSindical: 'S' }), tabelas: TAB, contribuicoesSindicais, folhaPagaAntesNoMes: null,
            afastamentos: [{ id: 'a', fichaId: 'f1', motivo: '03', dtInicio: '2026-01-10', dtFim: '', infoMesmoMtv: 'N' } as never] });
        expect(v(r, 'CONTSIND')).toBe(0);
        expect(r.avisos.join(' ')).toMatch(/Sem salário no mês: .* Desconte no retorno/);
    });
});

describe('aviso prévio da convenção', () => {
    const regras = [{ idadeMinima: 45, anosMinimos: null, diasAdicionais: 15, descricao: 'Cláusula 22' }, { idadeMinima: 45, anosMinimos: 10, diasAdicionais: 30, descricao: 'Cláusula 22, § 1º' }];
    it('a regra cumprida que dá mais dias', () => {
        expect(avisoDaConvencao(regras, ficha(), '2026-06-10')).toEqual({ dias: 30, regra: 'Cláusula 22, § 1º (45 anos de idade ou mais e 10 ano(s) de casa ou mais)' });
        expect(avisoDaConvencao(regras, ficha({ admissao: '2020-01-02' }), '2026-06-10')!.dias).toBe(15);
        expect(avisoDaConvencao(regras, ficha({ nascimento: '1990-01-01' }), '2026-06-10')).toBeNull();
        expect(avisoDaConvencao(regras, ficha({ nascimento: '' }), '2026-06-10')).toBeNull();
    });
    it('na rescisão sem justa causa: dias a mais indenizados e projetados', () => {
        const f = ficha();
        const base = { ficha: f, data: '2026-06-10', tipo: '02' as const, aviso: 'indenizado' as const, afastamentos: [], tabelas: TAB, movimentos: {} };
        const sem = calcularRescisao(base);
        const com = calcularRescisao({ ...base, avisoConvencao: avisoDaConvencao(regras, f, '2026-06-10') });
        const legal = diasDeAviso('2015-02-02', '2026-06-10');
        expect([sem.diasAviso, com.diasAviso]).toEqual([legal, legal + 30]);
        expect(v(com, 'AVISO')).toBe(Math.round(300000 / 30 * (legal + 30)));
        expect(com.dataProjetada > sem.dataProjetada).toBe(true);
        expect(com.memoria.join(' ')).toMatch(/Aviso prévio da convenção: 30 dia\(s\) além dos/);
        // Trabalhado: os dias a mais também são indenizados.
        const trab = calcularRescisao({ ...base, aviso: 'trabalhado', avisoConvencao: { dias: 30, regra: 'x' } });
        expect(v(trab, 'AVISO')).toBe(Math.round(300000 / 30 * (legal + 30 - 30)));
        // Pedido de demissão: a convenção não muda; acordo: aviso para conferir.
        expect(calcularRescisao({ ...base, tipo: '07', aviso: 'trabalhado', avisoConvencao: { dias: 30, regra: 'x' } }).diasAviso).toBe(0);
        expect(calcularRescisao({ ...base, tipo: '33', avisoConvencao: { dias: 30, regra: 'x' } }).avisos.join(' ')).toMatch(/no acordo do art\. 484-A, confira/);
    });
});

describe('convenção da ficha', () => {
    const c: ConvencaoColetiva = { ...convencaoVazia(SIND), id: `${SIND}_2026-01-01`, vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31' };
    it('pelo sindicato da ficha ou o único da empresa; vencida não vale', () => {
        expect(convencaoDaFicha([c], ficha({ sindicato: SIND }), [], '2026-03-01')?.id).toBe(c.id);
        expect(convencaoDaFicha([c], ficha(), [SIND], '2026-03-01')?.id).toBe(c.id);
        expect(convencaoDaFicha([c], ficha(), [SIND, '22222222000191'], '2026-03-01')).toBeUndefined();
        expect(convencaoDaFicha([c], ficha({ sindicato: SIND }), [], '2027-02-01')).toBeUndefined();
    });
});
