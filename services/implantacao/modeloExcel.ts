import * as XLSX from 'xlsx';
import { HEADERS_LANCAMENTOS, montarTemplateApontamento } from '../folha/templateApontamentoIobSage';
import { CAMPOS, type Cadastro, type Campo } from './implantacao';
import type { Dossie } from './dossie';

/** Modelo preenchido para conferência no app; não é um layout cadastral homologado pela SAGE. */
export function gerarModeloCadastroXlsx(dossie: Dossie, cadastros: Cadastro[], avisos: string[]): ArrayBuffer {
    const wb = montarTemplateApontamento({ nomeEmpresa: dossie.cnpj });
    const campos = (Object.keys(CAMPOS) as Campo[]).filter(c => c !== 'nome' && c !== 'matriculaIob');
    const adicionar = (nome: string, linhas: string[][], larguras: number[]) => {
        // Strings são células de texto: preserva zeros iniciais e não interpreta fórmulas.
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws['!cols'] = larguras.map(wch => ({ wch }));
        if (linhas.length > 1) ws['!autofilter'] = { ref: ws['!ref']! };
        if (wb.SheetNames.includes(nome)) wb.Sheets[nome] = ws;
        else XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    adicionar('Lançamentos', [
        [`IMPLANTAÇÃO CADASTRAL — ${dossie.cnpj}`],
        ['Conferência XML + PDF. Sem eventos ou valores mensais. Não importar esta planilha na SAGE.'],
        [], HEADERS_LANCAMENTOS,
        ...cadastros.map(c => [c.matricula, c.dados.nome || '', '', '', '', '', '', 'Dados completos na aba Cadastro']),
    ], [18, 40, 14, 34, 11, 14, 14, 44]);
    delete wb.Sheets['Lançamentos']['!autofilter'];
    wb.Sheets['Lançamentos']['!merges'] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: 7 } }));
    adicionar('Cadastro', [
        ['Matrícula eSocial', 'Nome do Funcionário', 'CPF', 'Empregador (XML)', 'CNPJ da implantação', 'Situação', ...campos.map(c => CAMPOS[c])],
        ...cadastros.map(c => [c.matricula, c.dados.nome || '', c.cpf, c.empregador, dossie.cnpj,
            c.desligado ? 'Desligado' : 'Sem desligamento nos eventos fornecidos', ...campos.map(k => c.dados[k] || '')]),
    ], [18, 40, 18, 20, 22, 42, ...campos.map(() => 28)]);
    adicionar('Origem dos campos', [
        ['Matrícula eSocial', 'CPF', 'Campo', 'Valor', 'Origem'],
        ...cadastros.flatMap(c => (Object.keys(CAMPOS) as Campo[]).filter(k => c.dados[k] || c.origens[k])
            .map(k => [c.matricula, c.cpf, CAMPOS[k], k === 'matriculaIob' ? c.matricula : c.dados[k] || '', c.origens[k] || ''])),
    ], [18, 18, 38, 60, 70]);
    adicionar('Pendências', [
        ['Matrícula eSocial', 'CPF', 'Pendência / aviso'],
        ['', '', 'Compatibilidade cadastral IOB pendente. Este Excel é de conferência; não cria funcionários na SAGE.'],
        ...avisos.map(a => ['', '', a]),
        ...cadastros.flatMap(c => c.pendencias.map(p => [c.matricula, c.cpf, p])),
    ], [18, 18, 110]);
    adicionar('Instruções', [
        ['MODELO PREENCHIDO — XML eSocial + ficha PDF'],
        ['1. Confira Cadastro: matrícula original do eSocial, identificação e dados cadastrais consolidados.'],
        ['2. Origem dos campos identifica a fonte de cada valor. Campos ausentes permanecem em branco.'],
        ['3. Revise Pendências antes de utilizar as informações. Os códigos e datas conservam os valores das fontes.'],
        ['4. Lançamentos mantém as oito colunas do modelo existente, sem exemplos, eventos, referências ou valores mensais.'],
        ['5. O salário contratual fica em Cadastro; ele não é um valor de apontamento.'],
        ['6. Este Excel é para conferência. Não é arquivo homologado para criar funcionários na SAGE.'],
        ['7. Para apontamentos mensais, use o modelo mensal no Consultor DP, confira e exporte os TXTs pelo app.'],
        [`CNPJ: ${dossie.cnpj} | Data da implantação: ${dossie.corte}`],
    ], [110]);
    // A tabela de eventos é exclusiva da rotina mensal.
    wb.SheetNames = ['Lançamentos', 'Cadastro', 'Origem dos campos', 'Pendências', 'Instruções'];
    delete wb.Sheets['Tabela de Eventos'];
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function baixarModeloCadastro(dossie: Dossie, cadastros: Cadastro[], avisos: string[]): void {
    const blob = new Blob([gerarModeloCadastroXlsx(dossie, cadastros, avisos)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conferencia-cadastro-${dossie.cnpj.replace(/\D/g, '') || 'empresa'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
