import { describe, expect, it } from 'vitest';
import { blocosDoTexto, camposDoTexto, categoriaPeloTitulo, textosDaTabela, converterMarcadores, dataPorExtenso, marcadoresEstranhos, numeroPorExtenso, pareceTabelaDeTextos, preencherModelo, reaisPorExtenso, rtfParaTexto, sugerirCampo, type ContextoModelo } from '../modelos';
import { MODELOS_BASE } from '../modelosBase';
import type { FichaFuncionario } from '../../cadastros/funcionarios';

const ficha = { id: 'f1', empresaId: 'e1', cnpj: '12345678000190', cpf: '12345678909', matriculaEsocial: '0042', situacao: 'ativo', dependentes: [], origens: {}, pendenciasImportacao: [],
    dados: { nome: 'Fulana de Tal', admissao: '2026-10-01', salario: '2.150,50', cargo: 'Auxiliar administrativo', cbo: '411010', estadoCivil: '1', logradouro: 'Rua A', numero: '10', bairro: 'Centro', municipio: 'São Paulo', uf: 'SP' } } as unknown as FichaFuncionario;
const ctx: ContextoModelo = { ficha, empresa: { razaoSocial: 'Empresa Teste Ltda', cnpj: '12345678000190' }, hoje: '2026-10-10' };

describe('por extenso', () => {
    it('números', () => {
        expect(numeroPorExtenso(0)).toBe('zero');
        expect(numeroPorExtenso(100)).toBe('cem');
        expect(numeroPorExtenso(101)).toBe('cento e um');
        expect(numeroPorExtenso(1200)).toBe('mil e duzentos');
        expect(numeroPorExtenso(3000)).toBe('três mil');
        expect(numeroPorExtenso(1520)).toBe('mil quinhentos e vinte');
        expect(numeroPorExtenso(1050)).toBe('mil e cinquenta');
        expect(numeroPorExtenso(21345)).toBe('vinte e um mil trezentos e quarenta e cinco');
        expect(numeroPorExtenso(2_000_000)).toBe('dois milhões');
        expect(numeroPorExtenso(1_500_000)).toBe('um milhão e quinhentos mil');
    });
    it('reais', () => {
        expect(reaisPorExtenso(300000)).toBe('três mil reais');
        expect(reaisPorExtenso(152050)).toBe('mil quinhentos e vinte reais e cinquenta centavos');
        expect(reaisPorExtenso(100)).toBe('um real');
        expect(reaisPorExtenso(1)).toBe('um centavo');
        expect(reaisPorExtenso(0)).toBe('zero reais');
        expect(reaisPorExtenso(100_000_000)).toBe('um milhão de reais');
    });
    it('data', () => {
        expect(dataPorExtenso('2026-03-05')).toBe('5 de março de 2026');
    });
});

describe('preencher', () => {
    it('troca os campos e marca os vazios', () => {
        const { texto, vazios } = preencherModelo('{{funcionario.nome}}, CPF {{funcionario.cpf}}, {{contrato.salario}} ({{contrato.salarioExtenso}}), PIS {{funcionario.pis}}, {{empresa.cnpj}}', ctx);
        expect(texto).toContain('Fulana de Tal, CPF 123.456.789-09');
        expect(texto).toContain('dois mil cento e cinquenta reais e cinquenta centavos');
        expect(texto).toContain('PIS ________________');
        expect(texto).toContain('12.345.678/0001-90');
        expect(vazios).toEqual(['PIS']);
    });
    it('experiência: 45 dias por padrão e o digitado', () => {
        expect(preencherModelo('{{contrato.fimExperiencia}}', ctx).texto).toBe('14/11/2026');
        expect(preencherModelo('{{contrato.fimExperiencia}}', { ...ctx, extras: { diasExperiencia: '30' } }).texto).toBe('30/10/2026');
        expect(preencherModelo('{{contrato.fimProrrogacao}}', ctx).texto).toBe('29/12/2026');
    });
    it('endereço e estado civil', () => {
        expect(preencherModelo('{{funcionario.endereco}} · {{funcionario.estadoCivil}}', ctx).texto).toBe('Rua A, 10 – Centro – São Paulo/SP · solteiro(a)');
    });
    it('campos do texto', () => {
        expect(camposDoTexto('{{funcionario.nome}} {{x.y}} {{assinaturas}} {{ funcionario.nome }}')).toEqual({ conhecidos: ['funcionario.nome'], desconhecidos: ['x.y'] });
    });
    it('blocos', () => {
        expect(blocosDoTexto('# TÍTULO\n\n## Cláusula 1\n\nTexto\ncontinua.\n\n{{assinaturas}}')).toEqual([
            { tipo: 'titulo', texto: 'TÍTULO' }, { tipo: 'subtitulo', texto: 'Cláusula 1' }, { tipo: 'paragrafo', texto: 'Texto continua.' }, { tipo: 'assinaturas' },
        ]);
    });
});

describe('modelos-base', () => {
    it('só usam campos conhecidos e têm assinaturas', () => {
        expect(MODELOS_BASE.length).toBeGreaterThanOrEqual(8);
        for (const m of MODELOS_BASE) {
            expect(camposDoTexto(m.corpo).desconhecidos, m.titulo).toEqual([]);
            expect(m.corpo, m.titulo).toContain('{{assinaturas}}');
            expect(blocosDoTexto(m.corpo)[0].tipo, m.titulo).toBe('titulo');
        }
        expect(new Set(MODELOS_BASE.map(m => m.id)).size).toBe(MODELOS_BASE.length);
    });
});

describe('textos do SAGE', () => {
    it('RTF em texto', () => {
        const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}\f0\fs20 CONTRATO DE EXPERI\'caNCIA\par\par Empregado: #NOME#\par Sal\'e1rio: #SALARIO#\par}`;
        expect(rtfParaTexto(rtf)).toBe('CONTRATO DE EXPERIÊNCIA\n\nEmpregado: #NOME#\nSalário: #SALARIO#');
        expect(rtfParaTexto('texto simples')).toBe('texto simples');
    });
    it('marcadores e sugestões', () => {
        const t = 'Eu, #NOME#, CPF @CPF@, cargo <<Cargo>>, salário [SALARIO_EXTENSO], em #DATA_EXTENSO#';
        expect(marcadoresEstranhos(t)).toEqual(['#NOME#', '#DATA_EXTENSO#', '@CPF@', '<<Cargo>>', '[SALARIO_EXTENSO]']);
        expect(sugerirCampo('#NOME#')).toBe('funcionario.nome');
        expect(sugerirCampo('<<Cargo>>')).toBe('contrato.cargo');
        expect(sugerirCampo('[SALARIO_EXTENSO]')).toBe('contrato.salarioExtenso');
        expect(sugerirCampo('#DATA_EXTENSO#')).toBe('data.extenso');
        expect(sugerirCampo('#XPTO#')).toBe('');
        expect(converterMarcadores(t, { '#NOME#': 'funcionario.nome', '@CPF@': '' })).toContain('Eu, {{funcionario.nome}}, CPF @CPF@');
    });
    it('tabela de textos', () => {
        expect(pareceTabelaDeTextos('textos', ['codigo'])).toBe(true);
        expect(pareceTabelaDeTextos('xyz', ['codigo', 'conteudo'])).toBe(true);
        expect(pareceTabelaDeTextos('funcionarios', ['codigo', 'nome'])).toBe(false);
    });
});

describe('RTF com grupos', () => {
    it('ignora \\* e unicode', () => {
        const rtf = String.raw`{\rtf1{\*\generator Msftedit;}{\stylesheet{\s0 Normal;}}\pard A\u231?\u227?o\par{\b negrito}\par}`;
        expect(rtfParaTexto(rtf)).toBe('Ação\nnegrito');
    });
});

describe('textos da tabela do backup', () => {
    it('um texto por linha (RTF), com título', () => {
        const t = textosDaTabela(['codigo', 'descricao', 'texto'], [['1', 'Contrato de experiência', String.raw`{\rtf1 Eu, #NOME#\par fim}`], ['2', 'Advertência', 'Fica advertido #NOME#'], ['3', 'Vazio', '']]);
        expect(t).toEqual([{ chave: '1', titulo: 'Contrato de experiência', corpo: 'Eu, #NOME#\nfim' }, { chave: '2', titulo: 'Advertência', corpo: 'Fica advertido #NOME#' }]);
    });
    it('texto em várias linhas, juntado pela sequência', () => {
        const t = textosDaTabela(['codigo', 'nome', 'seq', 'linha'], [['7', 'Suspensão', '2', 'segunda linha'], ['7', 'Suspensão', '1', 'primeira linha do texto da suspensão'], ['8', 'Outro', '1', 'só uma linha comprida o bastante']]);
        expect(t[0]).toEqual({ chave: '7', titulo: 'Suspensão', corpo: 'primeira linha do texto da suspensão\nsegunda linha' });
        expect(t).toHaveLength(2);
    });
    it('categoria pelo título', () => {
        expect(categoriaPeloTitulo('ADVERTÊNCIA')).toBe('disciplinar');
        expect(categoriaPeloTitulo('Prorrogação do contrato')).toBe('termo');
        expect(categoriaPeloTitulo('Contrato de experiência')).toBe('contrato');
        expect(categoriaPeloTitulo('Aviso prévio')).toBe('desligamento');
        expect(categoriaPeloTitulo('Opção de vale-transporte')).toBe('declaracao');
    });
});
