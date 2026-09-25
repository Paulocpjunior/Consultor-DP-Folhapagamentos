import { describe, expect, it } from 'vitest';
import {
    LAYOUT_PADRAO, codificar, formatarCampo, gerarRegistros, lerLayout, nomeArquivoTxtCadastro, posicoes, serializarLayout, validarLayout, type LayoutCadastroIob,
} from '../layoutCadastroIob';
import type { FuncionarioUnificado } from '../unificacao';

const funcionario = (dados: Record<string, string>, extra: Partial<FuncionarioUnificado> = {}): FuncionarioUnificado => ({
    chave: 'k', empregador: '11222333', cpf: '52998224725', matricula: '000123',
    dados: { matriculaIob: '000123', nome: 'JOSÉ AÇÃO ÜBER', nascimento: '1990-01-31', admissao: '2026-09-16', cargo: 'AUXILIAR', salario: '3243.65', ...dados },
    origens: {}, complementosPdf: [], divergencias: [], dependentes: [], pendencias: [], desligado: false,
    cadastro: { chave: 'k', empregador: '11222333', cpf: '52998224725', matricula: '000123', dados: {}, origens: {}, pendencias: [], eventos: [], desligado: false }, ...extra,
});
const layoutCurto: LayoutCadastroIob = {
    ...LAYOUT_PADRAO, nome: 'teste', homologado: true,
    campos: [
        { id: 'codigo', rotulo: 'Código', origem: 'codigoIob', tamanho: 6, tipo: 'N', obrigatorio: true },
        { id: 'nome', rotulo: 'Nome', origem: 'nome', tamanho: 20, tipo: 'A', obrigatorio: true },
        { id: 'cpf', rotulo: 'CPF', origem: 'cpf', tamanho: 11, tipo: 'N' },
        { id: 'nasc', rotulo: 'Nascimento', origem: 'nascimento', tamanho: 8, tipo: 'D' },
        { id: 'sal', rotulo: 'Salário', origem: 'salario', tamanho: 10, tipo: 'V', decimais: 2 },
        { id: 'horas', rotulo: 'Horas', origem: 'horasSemanais', tamanho: 5, tipo: 'V', decimais: 2 },
        { id: 'fixo', rotulo: 'Constante', origem: 'constante', constante: 'X', tamanho: 2, tipo: 'A' },
        { id: 'branco', rotulo: 'Reservado', origem: 'branco', tamanho: 3, tipo: 'A' },
        { id: 'cnpj', rotulo: 'CNPJ', origem: 'cnpj', tamanho: 14, tipo: 'N' },
    ],
};

describe('TXT de cadastro no layout IOB (posições fixas)', () => {
    it('alinha numéricos com zeros, textos sem acento à esquerda, datas DDMMAAAA e decimais implícitos', () => {
        const r = gerarRegistros([funcionario({ horasSemanais: '44.00' })], layoutCurto, '11.222.333/0001-81');
        expect(r.erros).toEqual([]);
        expect(r.avisos).toEqual([]);
        expect(r.tamanhoRegistro).toBe(79);
        const linha = r.registros[0].linha;
        expect(linha).toHaveLength(79);
        expect(linha.slice(0, 6)).toBe('000123');
        expect(linha.slice(6, 26)).toBe('JOSE ACAO UBER      ');
        expect(linha.slice(26, 37)).toBe('52998224725');
        expect(linha.slice(37, 45)).toBe('31011990');
        expect(linha.slice(45, 55)).toBe('0000324365');
        expect(linha.slice(55, 60)).toBe('04400');
        expect(linha.slice(60, 62)).toBe('X ');
        expect(linha.slice(62, 65)).toBe('   ');
        expect(linha.slice(65, 79)).toBe('11222333000181');
        expect(r.conteudo.endsWith('\r\n')).toBe(true);
        expect(posicoes(layoutCurto).map(p => [p.inicio, p.fim])[1]).toEqual([7, 26]);
    });
    it('preserva a matrícula eSocial como código e aponta erro em vez de truncar identificação', () => {
        const r = gerarRegistros([funcionario({ matriculaIob: 'AB12345678' })], layoutCurto, '11222333000181');
        expect(r.erros[0]).toContain('excede 6 dígitos');
        const r2 = gerarRegistros([funcionario({ matriculaIob: '836292' })], layoutCurto, '11222333000181');
        expect(r2.registros[0].linha.slice(0, 6)).toBe('836292');
    });
    it('sinaliza obrigatório vazio, data inválida, texto truncado e código repetido', () => {
        const r = gerarRegistros([funcionario({ nome: '', nascimento: '31/01/1990' }), funcionario({ nome: 'NOME MUITO LONGO PARA VINTE POSICOES' })], layoutCurto, '11222333000181');
        expect(r.erros).toEqual(expect.arrayContaining([
            expect.stringContaining('Nome: campo obrigatório vazio'),
            expect.stringContaining('data "31/01/1990" inválida'),
            expect.stringContaining('foi truncado'),
            expect.stringContaining('Código 000123 repetido em 2 vínculos'),
        ]));
        expect(r.registros[1].linha).toHaveLength(79);
    });
    it('layout padrão gera registro com todos os campos e avisa que não está homologado', () => {
        const r = gerarRegistros([funcionario({})], LAYOUT_PADRAO, '11222333000181');
        expect(r.registros[0].linha).toHaveLength(LAYOUT_PADRAO.campos.reduce((n, c) => n + c.tamanho, 0));
        expect(r.avisos[0]).toContain('não homologado');
        expect(validarLayout(LAYOUT_PADRAO)).toEqual([]);
        expect(nomeArquivoTxtCadastro('11.222.333/0001-81', LAYOUT_PADRAO)).toBe('cadastro-funcionarios-iob-11222333000181.txt');
    });
    it('codifica em ANSI sem BOM e em UTF-8 quando solicitado', () => {
        const bytes = codificar('ABC\r\n', LAYOUT_PADRAO);
        expect([...bytes]).toEqual([65, 66, 67, 13, 10]);
        expect([...codificar('É', { ...LAYOUT_PADRAO, codificacao: 'UTF-8' })]).toEqual([0xc3, 0x89]);
        expect([...codificar('É', LAYOUT_PADRAO)]).toEqual([0xc9]);
    });
});

describe('layout delimitado e validação do JSON', () => {
    it('gera campos separados sem preenchimento quando há separador', () => {
        const r = gerarRegistros([funcionario({})], { ...layoutCurto, separador: ';', formatoData: 'DD/MM/AAAA' }, '11222333000181');
        expect(r.registros[0].linha).toBe('000123;JOSE ACAO UBER;52998224725;31/01/1990;3243,65;;X;;11222333000181');
        expect(r.tamanhoRegistro).toBe(0);
    });
    it('lê e valida o JSON do layout, rejeitando formatos estranhos', () => {
        const relido = lerLayout(serializarLayout(layoutCurto));
        expect(relido.campos).toHaveLength(9);
        expect(relido.campos[6].constante).toBe('X');
        expect(() => lerLayout('{"formato":"x"}')).toThrow('não é um layout');
        expect(() => lerLayout(serializarLayout({ ...layoutCurto, campos: [{ ...layoutCurto.campos[0], tamanho: 0 }] }))).toThrow('tamanho');
        expect(() => lerLayout(serializarLayout({ ...layoutCurto, campos: [layoutCurto.campos[0], layoutCurto.campos[0]] }))).toThrow('repetido');
        expect(validarLayout({ ...layoutCurto, campos: [{ ...layoutCurto.campos[0], origem: 'inexistente' as never }] })[0]).toContain('origem inválida');
    });
    it('formata campo isolado com erro explícito para valores não numéricos', () => {
        expect(formatarCampo({ id: 'x', rotulo: 'PIS', origem: 'pis', tamanho: 11, tipo: 'N' }, 'ABC', LAYOUT_PADRAO)).toEqual({ texto: '00000000000', erro: 'PIS: "ABC" não é numérico.' });
        expect(formatarCampo({ id: 'x', rotulo: 'Valor', origem: 'salario', tamanho: 4, tipo: 'V', decimais: 2 }, '123.45', LAYOUT_PADRAO).erro).toContain('não cabe');
        expect(formatarCampo({ id: 'x', rotulo: 'Data', origem: 'admissao', tamanho: 8, tipo: 'D' }, '', LAYOUT_PADRAO)).toEqual({ texto: '00000000' });
    });
});
