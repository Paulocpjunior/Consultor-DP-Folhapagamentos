// services/relatorios/relatoriosAnuaisPdf.ts
//
// PDFs da R3 no layout padrão: ficha financeira (paisagem, um funcionário por página) e aviso de férias
// (retrato, um aviso por página, com o ciente do empregado).

import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cabecalhoPadrao, finalizar, novoDocumento, textoPdf, type OpcoesPdf } from './layoutPdf';
import { MESES_CURTOS, type AvisoFerias, type FichaFinanceira } from './relatoriosAnuais';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d);
const AZUL_CLARO: [number, number, number] = [29, 78, 216];

export function fichaFinanceiraPdf(fichas: FichaFinanceira[], ano: string, o: OpcoesPdf, observacao: string, dadosDe: (fichaId: string) => string): jsPDF {
    const doc = novoDocumento({ orientacao: 'paisagem' });
    const topo = o.previa ? 31 : 27;
    if (!fichas.length) { cabecalhoPadrao(doc, o, `Ano ${ano}`); doc.setFontSize(9); doc.text('Nenhuma folha gravada no ano.', 14, 40); }
    fichas.forEach((f, i) => {
        if (i > 0) doc.addPage();
        const sub = `Ano ${ano} · ${f.nome}`;
        cabecalhoPadrao(doc, o, sub);
        doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text(textoPdf(dadosDe(f.fichaId)), 14, topo + 1);
        doc.setTextColor(0, 0, 0);
        autoTable(doc, {
            startY: topo + 4,
            head: [['Cód.', 'Descrição', ...MESES_CURTOS, 'Total'].map(textoPdf)],
            body: f.linhas.map(l => [l.codigo, textoPdf(l.descricao), ...l.meses.map(v => (v === null ? '' : brl(v))), brl(l.total)]),
            styles: { fontSize: 6.3, cellPadding: 0.9 },
            headStyles: { fillColor: AZUL_CLARO, halign: 'center' },
            columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 46 }, ...Object.fromEntries(Array.from({ length: 13 }, (_, k) => [k + 2, { halign: 'right' as const }])) },
            margin: { left: 10, right: 10, top: topo + 2, bottom: 16 },
            didParseCell: d => {
                if (d.section !== 'body') return;
                const l = f.linhas[d.row.index];
                if (l.tipo === 'total') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [241, 245, 249]; }
                if (l.tipo === 'base') d.cell.styles.textColor = [71, 85, 105];
                if (l.tipo === 'desconto' && d.column.index > 1) d.cell.styles.textColor = [153, 27, 27];
            },
            didDrawPage: () => cabecalhoPadrao(doc, o, sub),
        });
    });
    if (observacao) {
        const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
        doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
        doc.text(doc.splitTextToSize(textoPdf(observacao), doc.internal.pageSize.getWidth() - 20) as string[], 10, Math.min(y + 6, doc.internal.pageSize.getHeight() - 20));
        doc.setTextColor(0, 0, 0);
    }
    return finalizar(doc, o);
}

export function avisoFeriasPdf(avisos: AvisoFerias[], o: OpcoesPdf, empresa: { razaoSocial: string; cidade?: string }): jsPDF {
    const doc = novoDocumento({ orientacao: 'retrato' });
    const largura = doc.internal.pageSize.getWidth();
    const util = largura - 40;
    if (!avisos.length) { cabecalhoPadrao(doc, o, ''); doc.setFontSize(9); doc.text('Nenhum gozo de férias começa na competência ou no mês seguinte.', 14, 40); }
    avisos.forEach((a, i) => {
        if (i > 0) doc.addPage();
        cabecalhoPadrao(doc, o, a.nome);
        let y = 42;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text('AVISO DE FÉRIAS', largura / 2, y, { align: 'center' }); y += 10;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        const par = (t: string) => { const ls = doc.splitTextToSize(textoPdf(t), util) as string[]; ls.forEach((l, k) => doc.text(l, 20, y + k * 5, k < ls.length - 1 ? { align: 'justify', maxWidth: util } : undefined)); y += ls.length * 5 + 4; };
        par(`Ao(À) Sr.(a) ${a.nome}${a.cargo ? `, ${a.cargo}` : ''}${a.matricula ? `, matrícula ${a.matricula}` : ''}, CTPS ${a.ctps}.`);
        par(`Nos termos do art. 135 da Consolidação das Leis do Trabalho, comunicamos que as suas férias relativas ao período aquisitivo de ${br(a.perAquisInicio)} a ${br(a.perAquisFim)} serão concedidas de ${br(a.inicio)} a ${br(a.fim)}, num total de ${a.dias} dia(s) de descanso, devendo V.Sa. retornar ao trabalho em ${br(a.retorno)}.`);
        if (a.abonoDias > 0) par(`Conforme requerido, ${a.abonoDias} dia(s) do período serão convertidos em abono pecuniário (art. 143 da CLT).`);
        par('A remuneração das férias, acrescida do terço constitucional, será paga até 2 (dois) dias antes do início do período de gozo (art. 145 da CLT). Solicitamos apresentar a Carteira de Trabalho para as anotações, quando física.');
        y += 4;
        doc.text(textoPdf(`${empresa.cidade || 'São Paulo'}, ${br(a.dataAviso)}.`), 20, y); y += 22;
        const meia = (util - 12) / 2;
        doc.line(20, y, 20 + meia, y); doc.line(20 + meia + 12, y, 20 + util, y);
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
        doc.text(textoPdf(empresa.razaoSocial), 20 + meia / 2, y + 4, { align: 'center', maxWidth: meia });
        doc.text(textoPdf(a.nome), 20 + meia + 12 + meia / 2, y + 4, { align: 'center', maxWidth: meia });
        doc.setFont('helvetica', 'normal');
        doc.text('Empregador(a)', 20 + meia / 2, y + 8, { align: 'center' });
        doc.text(textoPdf('Ciente do(a) empregado(a) em ___/___/______'), 20 + meia + 12 + meia / 2, y + 8, { align: 'center' });
    });
    return finalizar(doc, o);
}
