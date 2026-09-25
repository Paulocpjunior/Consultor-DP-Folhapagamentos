/**
 * geradorRais.test.ts
 *
 * Trava a geração do arquivo da RAIS contra as posições transcritas em
 * layoutRais.ts. Dados fictícios, com a forma do caso real que motivou a rota
 * (S-2200 + ficha PDF de um carpinteiro admitido em 16/09/2026).
 */

import { describe, it, expect } from 'vitest';
import { gerarArquivoRais, VARIANTES_RAIS, type VarianteRais } from '../geradorRais';
import type { FuncionarioUnificado } from '../unificacao';

const func = (over: Partial<FuncionarioUnificado> = {}): FuncionarioUnificado => ({
    chave: 'x', empregador: '29463877', cpf: '01787839516', matricula: '836292',
    dados: {
        nome: 'ANDRE LUIS DE JESUS DOS SANTOS', nascimento: '1984-05-16', sexo: 'M',
        admissao: '2026-09-16', pis: '13054012041', ctps: '0178783', serieCtps: '9516',
        salario: '3243.65', horasSemanais: '44.00', cbo: '715505', categoria: '101',
        municipio: '3550308', estabelecimento: '29463877000109', matriculaIob: '836292',
    },
    origens: {}, complementosPdf: [], divergencias: [], dependentes: [],
    pendencias: [], desligado: false, cadastro: {} as never,
    ...over,
});

const empresa = {
    cnpj: '29463877000109', razaoSocial: '2XR ENGENHARIA LTDA',
    logradouro: 'RUA GALILEU', numero: '216', bairro: 'JARDIM AEROPORTO',
    cep: '04632040', municipio: '3550308', nomeMunicipio: 'SAO PAULO', uf: 'SP',
    ddd: '11', telefone: '999999999', email: 'contato@2xr.com.br',
};

const gerar = (variante: VarianteRais, fs = [func()]) =>
    gerarArquivoRais(fs, { variante, empresa, anoBase: '2009', dataGeracao: new Date(2026, 8, 25) });

describe.each<[VarianteRais, number]>([['generico', 461], ['anual2022', 584]])(
    'gerador RAIS — variante %s', (variante, tamanho) => {
        it(`todo registro tem exatamente ${tamanho} posições`, () => {
            const r = gerar(variante);
            expect(r.erros).toEqual([]);
            expect(r.tamanhoRegistro).toBe(tamanho);
            expect(r.linhas).toHaveLength(4); // tipo 0, 1, 2 e 9
            for (const l of r.linhas) expect(l).toHaveLength(tamanho);
        });

        it('a ordem dos registros é 0, 1, 2… e 9', () => {
            const tipos = gerar(variante).linhas.map(l => l[22]); // posição 023
            expect(tipos).toEqual(['0', '1', '2', '9']);
        });

        it('o sequencial é ascendente e começa em 1', () => {
            const seqs = gerar(variante).linhas.map(l => l.slice(0, 6));
            expect(seqs).toEqual(['000001', '000002', '000003', '000004']);
        });

        it('o TIPO-9 fecha com a contagem real de registros', () => {
            const r = gerar(variante, [func(), func({ chave: 'y', matricula: '836293' })]);
            const t9 = r.linhas[r.linhas.length - 1];
            expect(t9.slice(23, 29)).toBe('000001'); // 1 estabelecimento
            expect(t9.slice(29, 35)).toBe('000002'); // 2 vínculos
            expect(r.totalVinculos).toBe(2);
        });

        it('o arquivo sai em CRLF', () => {
            expect(gerar(variante).conteudo.split('\r\n')).toHaveLength(5); // 4 linhas + final
        });

        it('funcionário desligado não entra', () => {
            const r = gerar(variante, [func(), func({ chave: 'z', desligado: true })]);
            expect(r.totalVinculos).toBe(1);
        });

        it('avisa o que a RAIS não transporta e que o layout não foi confirmado', () => {
            const r = gerar(variante);
            expect(r.avisos.join(' ')).toMatch(/não transporta/);
            expect(r.avisos.join(' ')).toMatch(/não confirmado/i);
        });

        it('recusa CNPJ, ano-base ou lista inválidos', () => {
            expect(gerarArquivoRais([func()], { variante, empresa: { ...empresa, cnpj: '123' }, anoBase: '2009' }).erros.join(' '))
                .toMatch(/CNPJ/);
            expect(gerarArquivoRais([func()], { variante, empresa, anoBase: '09' }).erros.join(' '))
                .toMatch(/Ano-base/);
            expect(gerarArquivoRais([], { variante, empresa, anoBase: '2009' }).erros.join(' '))
                .toMatch(/Nenhum funcionário/);
        });
    });

describe('TIPO-2 do genérico — posições do manual (461)', () => {
    const l = gerar('generico').linhas[2];
    const campo = (ini: number, fim: number) => l.slice(ini - 1, fim);

    it.each([
        ['CNPJ do estabelecimento', 7, 20, '29463877000109'],
        ['PIS', 24, 34, '13054012041'],
        ['Nome', 35, 86, 'ANDRE LUIS DE JESUS DOS SANTOS'.padEnd(52, ' ')],
        ['Nascimento ddmmaaaa', 87, 94, '16051984'],
        ['CPF', 95, 105, '01787839516'],
        ['Constante 0', 106, 106, '0'],
        ['CTPS', 107, 114, '00178783'],
        ['Série CTPS com zeros à esquerda', 115, 119, '09516'],
        ['Admissão ddmmaaaa', 120, 127, '16092026'],
        ['Salário com centavos', 130, 141, '000000324365'],
        ['Horas semanais (inteiro)', 143, 144, '44'],
        ['CBO', 145, 150, '715505'],
        ['Sexo 1=M', 428, 428, '1'],
        ['Matrícula eSocial inteira', 429, 458, '836292'.padEnd(30, ' ')],
    ])('%s → [%i-%i]', (_rotulo, ini, fim, esperado) => {
        expect(campo(ini as number, fim as number)).toBe(esperado);
    });

    it('os campos de movimento saem zerados', () => {
        expect(campo(159, 342)).toBe('0'.repeat(184));
    });
});

describe('TIPO-2 do anual 2022 — posições do manual (584)', () => {
    const l = gerar('anual2022').linhas[2];
    const campo = (ini: number, fim: number) => l.slice(ini - 1, fim);

    it.each([
        ['PIS', 24, 34, '13054012041'],
        ['Nascimento', 87, 94, '16051984'],
        ['CPF em outra posição', 103, 113, '01787839516'],
        ['Admissão', 127, 134, '16092026'],
        ['Salário em 9 posições', 137, 145, '000324365'],
        ['CBO', 149, 154, '715505'],
        ['Sexo', 306, 306, '1'],
        ['Município do local de trabalho', 496, 502, '3550308'],
        ['Matrícula', 544, 573, '836292'.padEnd(30, ' ')],
    ])('%s → [%i-%i]', (_rotulo, ini, fim, esperado) => {
        expect(campo(ini as number, fim as number)).toBe(esperado);
    });
});

describe('mulher sai com sexo 2', () => {
    it.each<[VarianteRais, number]>([['generico', 428], ['anual2022', 306]])('%s', (variante, pos) => {
        const l = gerar(variante, [func({ dados: { ...func().dados, sexo: 'F' } })]).linhas[2];
        expect(l[pos - 1]).toBe('2');
    });
});

describe('códigos sem tabela confirmada', () => {
    it('saem zerados e avisam, em vez de sair chutados', () => {
        const r = gerar('generico');
        expect(r.avisos.join(' ')).toMatch(/Tipo de Admissão/);
        expect(r.avisos.join(' ')).toMatch(/Vínculo empregatício/);
        expect(r.linhas[2].slice(127, 129)).toBe('00'); // tipo de admissão
    });

    it('quando informados, entram no arquivo', () => {
        const r = gerarArquivoRais([func()], {
            variante: 'generico', empresa, anoBase: '2009',
            padroes: { tipoAdmissao: '1', vinculoEmpregaticio: '10', tipoSalarioContratual: '1', categoria: '101' },
        });
        const l = r.linhas[2];
        expect(l.slice(127, 129)).toBe('01');
        expect(l.slice(150, 152)).toBe('10');
        expect(l.slice(141, 142)).toBe('1');
        expect(l.slice(458, 461)).toBe('101');
        expect(r.avisos.join(' ')).not.toMatch(/Tipo de Admissão/);
    });
});

describe('tamanho declarado bate com a transcrição do layout', () => {
    it('VARIANTES_RAIS reflete 461 e 584', () => {
        expect(VARIANTES_RAIS.generico.tamanho).toBe(461);
        expect(VARIANTES_RAIS.anual2022.tamanho).toBe(584);
    });
});
