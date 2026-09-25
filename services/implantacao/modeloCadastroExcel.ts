// services/implantacao/modeloCadastroExcel.ts
// Modelo Excel de cadastro de funcionários, no mesmo espírito do template de
// apontamentos: uma aba principal com uma linha por funcionário e uma coluna
// por campo do layout IOB, sem eventos, referências ou valores de apontamento.

import * as XLSX from 'xlsx';
import { CAMPOS, type Campo } from './implantacao';
import { formatarData, posicoes, TIPOS_CAMPO, type LayoutCadastroIob } from './layoutCadastroIob';
import type { FichaSemVinculo, FuncionarioUnificado } from './unificacao';

export const HEADERS_FIXOS_CADASTRO = ['Matrícula eSocial (código IOB)', 'Nome do Funcionário', 'CPF'];

const dataBr = (iso: string) => formatarData(iso, 'DD/MM/AAAA') || iso;

function valorPlanilha(f: FuncionarioUnificado, origem: string, constante: string | undefined, cnpj: string): string {
    switch (origem) {
        case 'codigoIob': return f.dados.matriculaIob || f.matricula;
        case 'cpf': return f.cpf;
        case 'cnpj': return cnpj.replace(/\D/g, '');
        case 'cnpjRaiz': return cnpj.replace(/\D/g, '').slice(0, 8);
        case 'constante': return constante || '';
        case 'branco': return '';
        default: {
            const v = f.dados[origem as Campo] || '';
            return ['nascimento', 'admissao', 'emissaoRg', 'fimContrato', 'opcaoFgts', 'cadastroPis'].includes(origem) ? dataBr(v) : v;
        }
    }
}

export function gerarModeloCadastroIobXlsx(cnpj: string, corte: string, funcionarios: FuncionarioUnificado[], layout: LayoutCadastroIob, avisos: string[], fichasSemVinculo: FichaSemVinculo[] = []): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    const adicionar = (nome: string, linhas: string[][], larguras: number[], filtroDesde?: number) => {
        // Strings viram células de texto: zeros iniciais e fórmulas não são interpretados.
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws['!cols'] = larguras.map(wch => ({ wch }));
        if (filtroDesde != null && linhas.length > filtroDesde + 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: filtroDesde, c: 0 }, e: { r: linhas.length - 1, c: linhas[filtroDesde].length - 1 } }) };
        XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    const colunasLayout = layout.campos.filter(c => !['codigoIob', 'cpf'].includes(c.origem) && !(c.origem === 'nome'));
    const headers = [...HEADERS_FIXOS_CADASTRO, ...colunasLayout.map(c => c.rotulo), 'Ficha PDF', 'Divergências XML × PDF', 'Pendências'];
    adicionar('Funcionários', [
        [`CADASTRO DE FUNCIONÁRIOS — ${cnpj || 'EMPRESA'}`],
        [`Implantação em ${dataBr(corte)} · unificação XML eSocial + ficha PDF · sem eventos, referências ou valores de apontamento`],
        [],
        headers,
        ...funcionarios.map(f => [
            f.dados.matriculaIob || f.matricula, f.dados.nome || '', f.cpf,
            ...colunasLayout.map(c => valorPlanilha(f, c.origem, c.constante, cnpj)),
            f.ficha?.nome || 'não localizada',
            f.divergencias.map(d => `${d.rotulo}: XML "${d.xml}" × PDF "${d.pdf}"`).join(' | '),
            f.pendencias.join(' | '),
        ]),
    ], [22, 40, 16, ...colunasLayout.map(c => Math.min(40, Math.max(12, c.rotulo.length + 2))), 30, 50, 60], 3);
    wb.Sheets['Funcionários']['!merges'] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: Math.min(headers.length - 1, 9) } }));
    adicionar('Dependentes', [
        ['Matrícula eSocial', 'Nome do Funcionário', 'CPF do funcionário', 'Tipo (eSocial)', 'Nome do dependente', 'Nascimento', 'CPF do dependente', 'Dependente IRRF', 'Salário-família'],
        ...funcionarios.flatMap(f => f.dependentes.map(d => [f.matricula, f.dados.nome || '', f.cpf, d.tipo, d.nome, dataBr(d.nascimento), d.cpf, d.irrf, d.salarioFamilia])),
    ], [18, 40, 18, 14, 40, 14, 18, 14, 14], 0);
    adicionar('Origem dos campos', [
        ['Matrícula eSocial', 'CPF', 'Campo', 'Valor', 'Origem'],
        ...funcionarios.flatMap(f => (Object.keys(CAMPOS) as Campo[]).filter(k => f.dados[k] || f.origens[k]).map(k => [f.matricula, f.cpf, CAMPOS[k], f.dados[k] || '', f.origens[k] || ''])),
    ], [18, 18, 38, 60, 70], 0);
    adicionar('Pendências', [
        ['Matrícula eSocial', 'CPF', 'Pendência / aviso'],
        ...avisos.map(a => ['', '', a]),
        ...fichasSemVinculo.map(x => ['', '', `Ficha ${x.nome} não unida: ${x.motivo}`]),
        ...funcionarios.flatMap(f => f.pendencias.map(p => [f.matricula, f.cpf, p])),
    ], [18, 18, 120], 0);
    adicionar('Layout TXT', [
        [layout.nome],
        [`Homologado: ${layout.homologado ? 'sim' : 'NÃO — conferir na IOB'} · Datas: ${layout.formatoData} · Codificação: ${layout.codificacao} · Quebra: ${layout.quebraLinha} · ${layout.separador ? `Separador "${layout.separador}"` : 'Posições fixas'} · Extensão .${layout.extensao}`],
        [layout.fonte],
        [],
        ['Ordem', 'Campo', 'Origem', 'Início', 'Fim', 'Tamanho', 'Tipo', 'Decimais', 'Obrigatório', 'Observação'],
        ...posicoes(layout).map((p, i) => [String(i + 1), p.rotulo, p.origem, String(p.inicio), String(p.fim), String(p.tamanho), TIPOS_CAMPO[p.tipo], p.decimais == null ? '' : String(p.decimais), p.obrigatorio ? 'sim' : '', p.observacao || (p.origem === 'constante' ? `Constante "${p.constante || ''}"` : '')]),
    ], [8, 44, 20, 8, 8, 10, 16, 10, 12, 60]);
    adicionar('Instruções', [
        ['MODELO DE CADASTRO — IOB SAGE FOLHAMATIC (Importação de Funcionários/Base de Cálculo)'],
        [''],
        ['1. A aba "Funcionários" traz uma linha por vínculo, com a matrícula original do eSocial como código do funcionário na IOB.'],
        ['2. As colunas seguem a ordem do layout do TXT (aba "Layout TXT"). Não há colunas de evento, referência ou valor: este modelo é cadastral.'],
        ['3. Campos vindos da ficha PDF constam em "Origem dos campos" com o nome e o hash do arquivo. Divergências entre XML e PDF mantêm o XML e ficam listadas para decisão.'],
        ['4. Revise "Pendências" antes de importar. Complete no próprio Excel os campos que a IOB exigir (departamento, código de cargo e sindicato IOB) ou registre-os como complementos no Consultor DP.'],
        ['5. No Consultor DP, o botão "Baixar TXT" gera o arquivo texto neste mesmo layout. Se a IOB apontar posições diferentes, ajuste o layout no editor e gere novamente — sem alterar o código do app.'],
        ['6. O salário contratual é dado cadastral do vínculo; não é lançamento mensal.'],
        ['7. Para apontamentos mensais continue usando o modelo de apontamentos e o TXT de 40 posições.'],
        [`CNPJ: ${cnpj} | Data da implantação: ${dataBr(corte)} | ${funcionarios.length} vínculo(s)`],
    ], [130]);
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function nomeArquivoModeloCadastro(cnpj: string): string {
    return `template-cadastro-iob-sage-${cnpj.replace(/\D/g, '') || 'EMPRESA'}.xlsx`;
}
