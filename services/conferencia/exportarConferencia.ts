// services/conferencia/exportarConferencia.ts
// Excel da conferência pós-folha: o registro do que foi conferido e do que
// ficou pendente, por empresa e competência.

import * as XLSX from 'xlsx';
import { DESCRICAO_CR_SEGURADO, type Gravidade, type ResultadoConferencia } from './conferenciaPosFolha';

const GRAVIDADE: Record<Gravidade, string> = { critica: 'Crítica', atencao: 'Atenção', info: 'Informativa' };
const r$ = (c: number | null) => (c === null ? '' : c / 100);

export const rotuloApuracao = (indApuracao: string) => (indApuracao === '2' ? '13º salário' : 'Mensal');

export function nomeArquivoConferencia(r: ResultadoConferencia): string {
    return `conferencia-pos-folha-${r.empregador}-${r.perApur}${r.indApuracao === '2' ? '-13' : ''}.xlsx`;
}

export function gerarExcelConferencia(r: ResultadoConferencia, empresaNome: string, avisosLeitura: string[], geradoEm = new Date()): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    const aba = (nome: string, linhas: (string | number)[][], larguras: number[]) => {
        const ws = XLSX.utils.aoa_to_sheet(linhas);
        ws['!cols'] = larguras.map(wch => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    const criticas = r.pendencias.filter(p => p.gravidade === 'critica').length;
    const atencao = r.pendencias.filter(p => p.gravidade === 'atencao').length;

    aba('Resumo', [
        ['CONFERÊNCIA PÓS-FOLHA — totalizadores do eSocial'],
        ['Empresa', empresaNome || r.empregador],
        ['Inscrição do empregador', r.empregador],
        ['Competência', r.perApur],
        ['Apuração', rotuloApuracao(r.indApuracao)],
        ['Gerado em', geradoEm.toLocaleString('pt-BR')],
        [],
        ['Totalizadores no lote', 'Quantidade'],
        ['S-5001 (INSS por trabalhador)', r.contagem.s5001],
        ['S-5003 (FGTS por trabalhador)', r.contagem.s5003],
        ['S-5011 (contribuições da empresa)', r.contagem.s5011],
        ['S-5013 (FGTS da empresa)', r.contagem.s5013],
        [],
        ['Pendências', 'Quantidade'],
        ['Críticas', criticas],
        ['Atenção', atencao],
        ['Informativas', r.pendencias.length - criticas - atencao],
        [],
        ['Valores (R$)', 'Trabalhadores (S-5001/S-5003)', 'Empresa (S-5011/S-5013)', 'Informado pela equipe'],
        ['INSS descontado dos segurados', r$(r.consolidacaoInss.descontadoTrabalhadores), r$(r.consolidacaoInss.descontadoEmpresa), ''],
        ['INSS calculado pelo eSocial', r$(r.consolidacaoInss.calculadoTrabalhadores), r$(r.consolidacaoInss.calculadoEmpresa), ''],
        ['DCTFWeb — débitos previdenciários a recolher', '', r$(r.dctfweb.totalARecolher), r$(r.dctfweb.informado)],
        ['FGTS Digital — guia mensal', '', r$(r.fgtsDigital.mensal), r$(r.fgtsDigital.informado)],
        ['FGTS Digital — rescisório', '', r$(r.fgtsDigital.rescisorio), ''],
        [],
        ['O IOB continua sendo o sistema de registro. Esta conferência aponta divergências; ela não corrige valores.'],
    ], [46, 30, 26, 24]);

    aba('Pendências', [
        ['Gravidade', 'Regra', 'CPF', 'Matrícula', 'Diferença (R$)', 'O que conferir'],
        ...r.pendencias.map(p => [GRAVIDADE[p.gravidade], p.regra, p.cpf ?? '', p.matricula ?? '', p.diferenca === undefined ? '' : p.diferenca / 100, p.mensagem]),
    ], [12, 22, 14, 14, 14, 120]);

    aba('INSS por trabalhador', [
        ['CPF', 'Matrícula', 'Categoria', 'Código de receita', 'Descrição', 'Descontado pela folha (R$)', 'Calculado pelo eSocial (R$)', 'Diferença (R$)'],
        ...r.inss.map(l => [l.cpf, l.matriculas, l.categorias, l.tpCR, DESCRICAO_CR_SEGURADO[l.tpCR] ?? '', l.descontado / 100, l.calculado / 100, l.diferenca / 100]),
    ], [14, 14, 10, 16, 34, 24, 26, 14]);

    aba('FGTS por trabalhador', [
        ['CPF', 'Matrícula', 'Categoria', 'Base do FGTS (R$)', 'Depósito (R$)'],
        ...r.fgts.map(l => [l.cpf, l.matriculas, l.categorias, l.remuneracao / 100, l.deposito / 100]),
    ], [14, 14, 10, 18, 14]);

    aba('DCTFWeb', [
        ['Código de receita', 'Apurado (R$)', 'Suspenso (R$)', 'A recolher (R$)'],
        ...r.dctfweb.creditos.map(c => [c.tpCR, c.valor / 100, c.suspenso / 100, c.aRecolher / 100]),
        ['Total', '', '', r.dctfweb.totalARecolher / 100],
        [],
        ['Fonte: S-5011, grupo infoCRContrib. É o que o eSocial envia à DCTFWeb. Não inclui IRRF, EFD-Reinf, multa e juros.'],
    ], [18, 14, 14, 16]);

    aba('FGTS consolidado', [
        ['Tipo de valor', 'Descrição', 'Soma dos S-5003 (R$)', 'S-5013 (R$)', 'Diferença (R$)'],
        ...r.consolidacaoFgts.map(c => [c.tpValor, c.descricao, c.somaTrabalhadores / 100, r$(c.empresa), r$(c.diferenca)]),
    ], [12, 46, 20, 14, 14]);

    if (avisosLeitura.length) aba('Avisos de leitura', [['Aviso'], ...avisosLeitura.map(a => [a])], [120]);

    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
