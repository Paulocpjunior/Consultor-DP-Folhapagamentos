import { describe, expect, it } from 'vitest';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { conferirConvencao, convencaoDoDia, convencaoVazia, lerTextoConvencao, pisoDaFicha, situacaoDaConvencao, validarConvencao, type ConvencaoColetiva, type EntradaConformidade } from '../convencao';

const SIND = '11222333000181';
const CCT: ConvencaoColetiva = { ...convencaoVazia(SIND), id: `${SIND}_2026-05-01`, vigenciaInicio: '2026-05-01', vigenciaFim: '2027-04-30', dataBase: '5', registroMte: 'SP001234/2026',
    reajuste: { percentual: 5, aPartirDe: '2026-05' }, pisos: [{ descricao: 'Auxiliar administrativo', cbo: '411010', valor: 200000 }, { descricao: 'Vendedor', cbo: '', valor: 220000 }, { descricao: 'Geral', cbo: '', valor: 190000 }],
    horaExtra: { minimo50: 60, minimo100: null }, obrigacoes: [{ id: 'o1', descricao: 'Cesta básica mensal' }, { id: 'o2', descricao: 'Seguro de vida' }] };
const ficha = (id: string, dados: Partial<FichaFuncionario['dados']> = {}, historico?: { desde: string; salario: string }[]): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2024-03-10', salario: '2100.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', cbo: '411010', cargo: 'AUXILIAR ADMINISTRATIVO', ...dados },
    ...(historico ? { historicoSalario: historico } : {}) } as FichaFuncionario);
const entrada = (x: Partial<EntradaConformidade> = {}): EntradaConformidade => ({ competencia: '2026-10', hoje: '2026-10-10', sindicatosDaEmpresa: [SIND], nomesSindicatos: { [SIND]: 'SINDICATO X' }, fichas: [], convencoes: [CCT], ...x });

describe('convenção coletiva: cadastro', () => {
    it('validação e vigente', () => {
        expect(validarConvencao(CCT)).toEqual([]);
        expect(validarConvencao({ ...CCT, vigenciaFim: '2029-05-01' })).toContain('Vigência de mais de 2 anos: a CLT não permite (art. 614, § 3º).');
        expect(validarConvencao({ ...CCT, reajuste: { percentual: 5, aPartirDe: '' } })).toContain('Reajuste: informe a partir de qual competência (AAAA-MM).');
        expect(validarConvencao({ ...CCT, horaExtra: { minimo50: 40, minimo100: null } })).toContain('Hora extra de dias úteis: adicional entre 50% e 300%.');
        expect(validarConvencao({ ...CCT, id: 'outra' }, [CCT])).toContain('Já existe uma convenção deste sindicato com o mesmo início de vigência.');
        const antiga = { ...CCT, id: 'a', vigenciaInicio: '2025-05-01', vigenciaFim: '2026-04-30' };
        expect(convencaoDoDia([antiga, CCT], SIND, '2026-04-15')?.id).toBe('a');
        expect(convencaoDoDia([antiga, CCT], SIND, '2026-10-31')?.id).toBe(CCT.id);
        expect([situacaoDaConvencao(CCT, '2026-10-10'), situacaoDaConvencao(CCT, '2027-04-10'), situacaoDaConvencao(CCT, '2027-05-02')]).toEqual(['vigente', 'a vencer', 'vencida']);
    });
    it('piso da ficha: CBO, cargo ou o menor', () => {
        expect(pisoDaFicha(CCT, ficha('a').dados)).toMatchObject({ como: 'cbo', piso: { valor: 200000 } });
        expect(pisoDaFicha(CCT, ficha('b', { cbo: '521110', cargo: 'VENDEDOR INTERNO' }).dados)).toMatchObject({ como: 'cargo', piso: { valor: 220000 } });
        expect(pisoDaFicha(CCT, ficha('c', { cbo: '', cargo: 'PORTEIRO' }).dados)).toMatchObject({ como: 'menor', piso: { valor: 190000 } });
    });
});

describe('convenção coletiva: conferência', () => {
    it('piso, reajuste da data-base, hora extra e obrigações', () => {
        const fichas = [
            ficha('ana', { salario: '1950.00' }), // abaixo do piso do CBO (2.000)
            ficha('bia', { salario: '2100.00' }, [{ desde: '2024-03-10', salario: '2000.00' }, { desde: '2026-05-01', salario: '2100.00' }]), // reajuste 5% ok
            ficha('caio', { salario: '2050.00' }, [{ desde: '2024-03-10', salario: '2000.00' }, { desde: '2026-05-01', salario: '2050.00' }]), // reajuste 2,5%: falta
            ficha('davi', { salario: '2500.00', admissao: '2025-09-01' }, [{ desde: '2025-09-01', salario: '2500.00' }]), // sem reajuste, admitido depois da base anterior
        ];
        const r = conferirConvencao(entrada({ fichas, movimentos: { bia: { horasExtras50: 4 } } }));
        expect(r.alertas.map(a => [a.fichaId, a.regra, a.nivel])).toEqual([
            ['ana', 'piso', 'erro'], ['bia', 'hora-extra', 'erro'], ['caio', 'reajuste', 'erro'], ['davi', 'reajuste', 'aviso'],
        ]);
        expect(r.alertas.find(a => a.fichaId === 'caio')!.mensagem.replace(/ /g, ' ')).toBe('Reajuste de 5% a partir de 05/2026: salário R$ 2.000,00 → R$ 2.050,00; o devido é R$ 2.100,00.');
        expect(r.alertas.find(a => a.regra === 'hora-extra')!.mensagem).toMatch(/garante 60% nos dias úteis/);
        expect([...r.comPiso].sort()).toEqual(['ana', 'bia', 'caio', 'davi']);
        expect(r.gerais.map(g => g.regra)).toEqual(['obrigacoes', 'reajuste-sem-historico']);
        expect(r.gerais[1].mensagem).toMatch(/^1 funcionário\(s\) sem histórico/);
        const ok = conferirConvencao(entrada({ fichas: [], checklists: { [CCT.id]: { o1: { cumprido: true, obs: '', porEmail: 'x', em: 'y' }, o2: { cumprido: true, obs: '', porEmail: 'x', em: 'y' } } } }));
        expect(ok.gerais).toEqual([]);
    });
    it('vigência: vencida, sem convenção, sem sindicato, ficha sem sindicato com dois na empresa', () => {
        expect(conferirConvencao(entrada({ hoje: '2027-05-10', competencia: '2027-05' })).gerais.map(g => [g.regra, g.nivel])).toEqual([['convencao-vencida', 'erro'], ['data-base', 'aviso'], ['obrigacoes', 'aviso']]);
        expect(conferirConvencao(entrada({ convencoes: [] })).gerais[0].mensagem).toMatch(/SINDICATO X: nenhuma convenção cadastrada/);
        expect(conferirConvencao(entrada({ sindicatosDaEmpresa: [] })).gerais[0].regra).toBe('sem-sindicato');
        const dois = conferirConvencao(entrada({ sindicatosDaEmpresa: [SIND, '99888777000166'], fichas: [ficha('ana')] }));
        expect(dois.alertas.map(a => a.regra)).toEqual(['ficha-sem-sindicato']);
        const comSind = conferirConvencao(entrada({ sindicatosDaEmpresa: [SIND, '99888777000166'], fichas: [ficha('ana', { sindicato: SIND, salario: '1950.00' })] }));
        expect(comSind.alertas.map(a => a.regra)).toEqual(['piso']);
    });
});

describe('leitura do texto da convenção', () => {
    it('vigência, data-base, registro, reajuste e pisos', () => {
        const texto = `CONVENÇÃO COLETIVA DE TRABALHO 2026/2027 NÚMERO DE REGISTRO NO MTE: SP001234/2026
            CLÁUSULA PRIMEIRA - VIGÊNCIA E DATA-BASE As partes fixam a vigência da presente Convenção Coletiva de Trabalho no período de 01º de maio de 2026 a 30 de abril de 2027 e a data-base da categoria em 01º de maio.
            CLÁUSULA TERCEIRA - PISO SALARIAL Ficam estabelecidos os seguintes pisos salariais: a) Auxiliar administrativo: R$ 2.000,00 b) Vendedor: R$ 2.200,00.
            CLÁUSULA QUARTA - REAJUSTE SALARIAL Os salários serão reajustados a partir de 1º de maio de 2026 pelo percentual de 5,5% sobre os salários de abril.`;
        const s = lerTextoConvencao(texto);
        expect(s).toMatchObject({ vigenciaInicio: '2026-05-01', vigenciaFim: '2027-04-30', dataBase: '5', registroMte: 'SP001234/2026', percentual: 5.5 });
        expect(s.pisos).toEqual([{ descricao: 'Auxiliar administrativo', valor: 200000 }, { descricao: 'Vendedor', valor: 220000 }]);
        expect(lerTextoConvencao('nada aqui')).toEqual({ vigenciaInicio: '', vigenciaFim: '', dataBase: '', registroMte: '', percentual: null, pisos: [] });
    });
});
