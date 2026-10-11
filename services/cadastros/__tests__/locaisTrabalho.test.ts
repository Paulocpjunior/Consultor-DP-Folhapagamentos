// Local de trabalho por vigência, troca de estabelecimento e o S-2206 (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffFicha, fichaVazia, locaisDosEventos, mesclarComEsocial, type FichaFuncionario } from '../funcionarios';
import { diaDoPeriodo, estabelecimentoNoDia, estabelecimentosNoMes, faixasDeLocal, trocarEstabelecimento, validarTrocaDeEstabelecimento } from '../locaisTrabalho';
import { contratoPadrao } from '../../esocial/admissao';
import { gerarS2206 } from '../../esocial/alteracaoContratual';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { calcularMensal } from '../../calculo/motorMensal';
import { TABELAS_OFICIAIS_2026 } from '../tabelasOficiais';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const MATRIZ = '44388152000189';
const FILIAL = '44388152000260';
const FICHA: FichaFuncionario = {
    ...fichaVazia({ id: 'E1', cnpj: MATRIZ }), id: 'E1_52998224725_M1', cpf: '52998224725', matriculaEsocial: 'M1',
    dados: { nome: 'ANA', admissao: '2020-03-02', categoria: '101', cargo: 'AUXILIAR', cbo: '411005', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', tipoContrato: '1',
        sindicato: '11222333000181', estabelecimento: MATRIZ, regimePrevidenciario: '1', jornada: 'Seg a sex 8h às 17h' },
};
const TROCADA = trocarEstabelecimento(FICHA, FILIAL, '2026-09-11', contratoPadrao(FICHA));

describe('local de trabalho por vigência', () => {
    it('sem troca: o da ficha; com troca: a faixa de antes e a nova, e o atual na ficha', () => {
        expect(faixasDeLocal(FICHA)).toEqual([{ desde: '2020-03-02', estabelecimento: MATRIZ, origem: 'ficha' }]);
        expect(TROCADA.locais!.map(x => [x.desde, x.estabelecimento])).toEqual([['2020-03-02', MATRIZ], ['2026-09-11', FILIAL]]);
        expect(TROCADA.dados.estabelecimento).toBe(FILIAL);
        expect(TROCADA.origens.estabelecimento).toBe('Troca de estabelecimento em 11/09/2026');
        expect([estabelecimentoNoDia(TROCADA, '2026-09-10'), estabelecimentoNoDia(TROCADA, '2026-09-11'), estabelecimentoNoDia(TROCADA, '2026-12-01')]).toEqual([MATRIZ, FILIAL, FILIAL]);
    });

    it('dias em cada um no mês da troca; um só nos outros meses; admissão e desligamento limitam', () => {
        expect(estabelecimentosNoMes(TROCADA, '2026-09')).toEqual([{ estab: MATRIZ, dias: 10 }, { estab: FILIAL, dias: 20 }]);
        expect(estabelecimentosNoMes(TROCADA, '2026-08')).toEqual([{ estab: MATRIZ, dias: 31 }]);
        expect(estabelecimentosNoMes(TROCADA, '2026-10')).toEqual([{ estab: FILIAL, dias: 31 }]);
        const saiu = { ...TROCADA, dados: { ...TROCADA.dados, dataDesligamento: '2026-09-20' } };
        expect(estabelecimentosNoMes(saiu, '2026-09')).toEqual([{ estab: MATRIZ, dias: 10 }, { estab: FILIAL, dias: 10 }]);
        expect(diaDoPeriodo(saiu, '2026-12')).toBe('2026-09-20');
        expect(diaDoPeriodo(FICHA, '2026')).toBe('2026-12-31');
    });

    it('o cálculo do mês da troca leva os dois estabelecimentos com os dias', () => {
        const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: TROCADA, tabelas: TAB, afastamentos: [], folhaPagaNoAdiantamento: null });
        expect(r.estabelecimentos).toEqual([{ estab: MATRIZ, peso: 10 }, { estab: FILIAL, peso: 20 }]);
        expect(r.memoria.join(' ')).toMatch(/Troca de estabelecimento no mês/);
        expect(calcularMensal({ competencia: '2026-10', pagamento: '2026-11', ficha: TROCADA, tabelas: TAB, afastamentos: [], folhaPagaNoAdiantamento: null }).estabelecimentos).toBeUndefined();
    });

    it('validações da troca', () => {
        expect(validarTrocaDeEstabelecimento(FICHA, FILIAL, '2026-09-11', MATRIZ)).toEqual([]);
        const e = validarTrocaDeEstabelecimento(FICHA, '29463877000109', '2019-01-01', MATRIZ).join(' ');
        expect(e).toMatch(/Outra raiz/); expect(e).toMatch(/depois da admissão/);
        expect(validarTrocaDeEstabelecimento(FICHA, MATRIZ, '2026-09-11', MATRIZ).join(' ')).toMatch(/já está no estabelecimento/);
        expect(validarTrocaDeEstabelecimento(TROCADA, MATRIZ, '2026-08-01', MATRIZ).join(' ')).toMatch(/troca registrada depois/);
        expect(validarTrocaDeEstabelecimento({ ...FICHA, dados: { ...FICHA.dados, estabelecimento: '' } }, FILIAL, '2026-09-11', MATRIZ).join(' ')).toMatch(/não tem o estabelecimento atual/);
    });
});

describe('S-2206 da troca', () => {
    it('contrato inteiro com o novo local e a data; passa no XSD; retificação', async () => {
        const g = gerarS2206({ cnpj: MATRIZ, tpAmb: 2, ficha: TROCADA, contrato: contratoPadrao(FICHA), dtAlteracao: '2026-09-11', estabelecimento: FILIAL, dscAlt: 'Troca de estabelecimento', agora: new Date('2026-10-11T12:00:00Z') });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<ideVinculo><cpfTrab>52998224725</cpfTrab><matricula>M1</matricula></ideVinculo><altContratual><dtAlteracao>2026-09-11</dtAlteracao><dscAlt>Troca de estabelecimento</dscAlt>');
        expect(g.evento!.xml).toContain(`<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${FILIAL}</nrInsc></localTrabGeral>`);
        const r = gerarS2206({ cnpj: MATRIZ, tpAmb: 1, ficha: TROCADA, contrato: contratoPadrao(FICHA), dtAlteracao: '2026-09-11', estabelecimento: FILIAL, recibo: '1.2.3' });
        expect(r.evento!.xml).toContain('<indRetif>2</indRetif><nrRecibo>1.2.3</nrRecibo>');
        expect(gerarS2206({ cnpj: MATRIZ, tpAmb: 2, ficha: { ...TROCADA, dados: { ...TROCADA.dados, sindicato: '' } }, contrato: contratoPadrao(FICHA), dtAlteracao: '2026-09-11', estabelecimento: FILIAL }).erros.join(' ')).toMatch(/sindicato/);
    });

    it('histórico pelos S-2200/S-2206 do eSocial: só com troca; a importação mantém as trocas posteriores do Consultor', () => {
        const ev = (tipo: string, data: string, estabelecimento: string) => ({ id: `${tipo}${data}`, tipo, empregador: '44388152', tpInsc: '1', cpf: FICHA.cpf, matricula: 'M1', data, recibo: `R${data}`, retifica: '', exclui: '', ambiente: '1',
            fonte: '', hash: '', conteudo: '', dados: { estabelecimento }, avisos: [], processado: true });
        expect(locaisDosEventos({ eventos: [ev('S-2200', '2020-03-02', MATRIZ), ev('S-2206', '2024-01-01', MATRIZ)] })).toEqual([]);
        const l = locaisDosEventos({ eventos: [ev('S-2206', '2025-05-01', FILIAL), ev('S-2200', '2020-03-02', MATRIZ)] });
        expect(l.map(x => [x.desde, x.estabelecimento, x.origem])).toEqual([['2020-03-02', MATRIZ, 'S-2200 · R2020-03-02'], ['2025-05-01', FILIAL, 'S-2206 · R2025-05-01']]);
        const existente = { ...TROCADA, locais: [...TROCADA.locais!, { desde: '2026-12-01', estabelecimento: MATRIZ, origem: 'Consultor' }] };
        const m = mesclarComEsocial(existente, { ...FICHA, locais: l });
        expect(m.ficha.locais!.map(x => x.desde)).toEqual(['2020-03-02', '2025-05-01', '2026-09-11', '2026-12-01']);
        expect(diffFicha(FICHA, TROCADA).some(a => a.campo === 'locais')).toBe(true);
    });
});
