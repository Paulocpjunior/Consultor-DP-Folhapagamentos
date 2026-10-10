// services/demissoes/previaPdf.ts
//
// "Prévia de rescisão" em PDF para o cliente: um funcionário por página, os cenários lado a lado (verbas, líquido
// do trabalhador e custo da empresa), o que cada um dá de FGTS e seguro-desemprego e os alertas. Marca d'água
// PRÉVIA e o aviso de que não tem valor de quitação: é simulação, nada foi ao eSocial.

import autoTable from 'jspdf-autotable';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { cabecalhoPadrao, finalizar, novoDocumento, textoPdf, type OpcoesPdf } from '../relatorios/layoutPdf';
import { podeSeguroDesemprego, rotuloCenario, sacaFgts, type ResultadoCenario } from './previa';

const AZUL: [number, number, number] = [29, 78, 216];
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '—');
/** Verbas com período no código (férias vencidas por período) somam numa linha. */
const chave = (codigo: string, descricao: string) => `${codigo.replace(/\d{4}-\d{2}-\d{2}$/, '')}|${descricao.replace(/\s\d{4}\/\d{4}$/, '')}`;

export interface PreviaFuncionario { ficha: FichaFuncionario; cenarios: ResultadoCenario[]; saldoFgtsInformado: boolean }

export function previaRescisaoPdf(lista: PreviaFuncionario[], o: Omit<OpcoesPdf, 'previa' | 'orientacao'>) {
    const opcoes: OpcoesPdf = { ...o, previa: false, orientacao: 'paisagem' };
    const doc = novoDocumento(opcoes);
    lista.forEach((p, i) => {
        if (i > 0) doc.addPage();
        const d = p.ficha.dados;
        const sub = `${d.nome || p.ficha.cpf} · admissão ${br(d.admissao ?? '')}`;
        const cab = () => {
            cabecalhoPadrao(doc, opcoes, sub);
            doc.setTextColor(180, 0, 0); doc.setFontSize(8.5);
            doc.text(textoPdf('Simulação — sem valor de quitação. Nada foi enviado ao eSocial; os valores se confirmam no desligamento.'), 14, 27);
            doc.setTextColor(0, 0, 0);
        };
        const cs = p.cenarios;
        // Verbas na ordem em que aparecem; proventos antes dos descontos.
        const linhas = new Map<string, { descricao: string; tipo: 'provento' | 'desconto'; valores: number[] }>();
        cs.forEach((c, j) => {
            for (const v of c.r.verbas) {
                const k = chave(v.codigo, v.descricao);
                const l = linhas.get(k) ?? { descricao: v.descricao.replace(/\s\d{4}\/\d{4}$/, ''), tipo: v.tipo, valores: cs.map(() => 0) };
                l.valores[j] += v.valor; linhas.set(k, l);
            }
        });
        const verbas = [...linhas.values()].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'provento' ? -1 : 1));
        const linha = (rotulo: string, f: (c: ResultadoCenario) => string) => [rotulo, ...cs.map(f)];
        const corpo = [
            ...verbas.map(v => [`${v.tipo === 'desconto' ? '(−) ' : ''}${v.descricao}`, ...v.valores.map(x => (x ? brl(x) : '—'))]),
        ];
        const totais = [
            linha('Total de proventos', c => brl(c.custo.proventos)),
            linha('Total de descontos', c => brl(c.custo.descontos)),
            linha('LÍQUIDO DO TRABALHADOR', c => brl(c.custo.liquido)),
            linha('FGTS do mês e rescisório (guia)', c => brl(c.custo.fgts)),
            linha(`Multa do FGTS${p.saldoFgtsInformado ? '' : ' (estimada*)'}`, c => (c.custo.multaFgts ? brl(c.custo.multaFgts) : '—')),
            linha('Encargos patronais (INSS empresa, RAT, terceiros)', c => (c.custo.patronal ? brl(c.custo.patronal.patronal + c.custo.patronal.rat + c.custo.patronal.terceiros) : 'sem enquadramento')),
            ...(cs.some(c => c.custo.indenizacaoDataBase) ? [linha('Indenização adicional da data-base', c => (c.custo.indenizacaoDataBase ? brl(c.custo.indenizacaoDataBase) : '—'))] : []),
            linha('CUSTO TOTAL PARA A EMPRESA', c => brl(c.custo.total)),
        ];
        const info = [
            linha('Data do desligamento', c => br(c.cenario.data)),
            linha('Aviso prévio', c => (c.r.diasAviso ? `${c.r.diasAviso} dias · fim projetado ${br(c.r.dataProjetada)}` : '—')),
            linha('Pagar até', c => br(c.r.pagarAte)),
            linha('FGTS', c => sacaFgts(c.cenario.tipo)),
            linha('Seguro-desemprego', c => (podeSeguroDesemprego(c.cenario.tipo) ? 'Pode ter direito (conforme meses trabalhados)' : 'Não tem direito')),
        ];
        const largura = (doc.internal.pageSize.getWidth() - 28 - 70) / Math.max(1, cs.length);
        const colunas = Object.fromEntries(cs.map((_, j) => [j + 1, { halign: 'right' as const, cellWidth: largura }]));
        autoTable(doc, {
            startY: 31,
            head: [['', ...cs.map(c => textoPdf(rotuloCenario(c.cenario)))]],
            body: [...corpo, ...totais, ...info].map(l => l.map(textoPdf)),
            styles: { fontSize: 7.8, cellPadding: 1.2 },
            headStyles: { fillColor: AZUL, halign: 'center' },
            columnStyles: { 0: { cellWidth: 70 }, ...colunas },
            margin: { left: 14, right: 14, top: 31, bottom: 16 },
            didDrawPage: cab,
            didParseCell: c => {
                if (c.section !== 'body') return;
                const idx = c.row.index - corpo.length;
                if (idx >= 0 && idx < totais.length) { c.cell.styles.fillColor = [241, 245, 249]; c.cell.styles.fontStyle = /LÍQUIDO|CUSTO TOTAL/.test(String(totais[idx][0])) ? 'bold' : 'normal'; }
                if (idx >= totais.length && c.column.index > 0) c.cell.styles.halign = 'center';
            },
        });
        let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40) + 5;
        const altura = doc.internal.pageSize.getHeight();
        const escrever = (t: string, tam = 7.5) => {
            const partes = doc.splitTextToSize(textoPdf(t), doc.internal.pageSize.getWidth() - 28) as string[];
            if (y + partes.length * 3.4 > altura - 16) { doc.addPage(); cab(); y = 33; }
            doc.setFontSize(tam); doc.text(partes, 14, y); y += partes.length * 3.4 + 1;
        };
        const alertas = [...new Set(cs.flatMap(c => c.alertas.map(a => `${rotuloCenario(c.cenario).split(' · ')[0]}: ${a}`)))];
        if (alertas.length) { doc.setFont('helvetica', 'bold'); escrever('Pontos de atenção', 8); doc.setFont('helvetica', 'normal'); alertas.forEach(a => escrever(`• ${a}`)); }
        doc.setTextColor(71, 85, 105);
        if (!p.saldoFgtsInformado && cs.some(c => c.custo.multaFgts)) escrever('* Multa do FGTS estimada pelos depósitos do contrato (salário × 8%, com 13º e 1/3 de férias), sem a correção e sem saques: o valor certo sai do saldo para fins rescisórios no FGTS Digital.');
        escrever('Cálculo pela ficha e pelos movimentos gravados no Consultor (salário, médias, faltas, férias e afastamentos). Mudanças até o desligamento (horas extras, faltas, reajuste) alteram os valores.');
        doc.setTextColor(0, 0, 0);
    });
    return finalizar(doc, { ...opcoes, previa: true });
}
