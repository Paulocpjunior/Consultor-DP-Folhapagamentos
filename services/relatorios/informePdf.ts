// services/relatorios/informePdf.ts
//
// Informe de rendimentos em PDF (IN RFB 2.060/2021, Anexo I), um trabalhador por página, no layout do Consultor.

import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cabecalhoPadrao, cnpjFmt, finalizar, novoDocumento, textoPdf, type OpcoesPdf } from './layoutPdf';
import type { Informe, LinhaInforme } from './informeRendimentos';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const AZUL_CLARO: [number, number, number] = [29, 78, 216];
const fimY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export function informePdf(informes: Informe[], o: OpcoesPdf): jsPDF {
    const doc = novoDocumento({ orientacao: 'retrato' });
    const largura = doc.internal.pageSize.getWidth();
    const topo = o.previa ? 31 : 27;
    if (!informes.length) { cabecalhoPadrao(doc, o, ''); doc.setFontSize(9); doc.text('Nenhum S-5002 do ano-calendário nos arquivos.', 14, 40); }
    informes.forEach((inf, i) => {
        if (i > 0) doc.addPage();
        const sub = inf.nome || cpfFmt(inf.cpf);
        cabecalhoPadrao(doc, o, sub);
        const base = { margin: { left: 14, right: 14, top: topo + 2, bottom: 16 }, didDrawPage: () => cabecalhoPadrao(doc, o, sub), styles: { fontSize: 7.4, cellPadding: 1 }, headStyles: { fillColor: AZUL_CLARO, fontSize: 7.8 } };
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(textoPdf('COMPROVANTE DE RENDIMENTOS PAGOS E DE IMPOSTO SOBRE A RENDA RETIDO NA FONTE'), largura / 2, topo + 4, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(textoPdf(`Imposto sobre a Renda da Pessoa Física · Ano-calendário ${inf.ano} · Exercício ${Number(inf.ano) + 1}`), largura / 2, topo + 8.5, { align: 'center' });
        let y = topo + 11;
        const pares = (titulo: string, l: [string, string][]) => {
            autoTable(doc, { ...base, startY: y, head: [[{ content: textoPdf(titulo), colSpan: 2 }]], body: l.map(([a, b]) => [textoPdf(a), textoPdf(b)]), columnStyles: { 0: { cellWidth: 46, textColor: [71, 85, 105] } } });
            y = fimY(doc) + 1.5;
        };
        const valores = (titulo: string, l: LinhaInforme[]) => {
            autoTable(doc, {
                ...base, startY: y, head: [[textoPdf(titulo), 'Valores em reais']],
                body: l.map((x, k) => [textoPdf(`${String(k + 1).padStart(2, '0')}. ${x.rotulo}`), brl(x.valor)]),
                columnStyles: { 1: { cellWidth: 30, halign: 'right' } },
                didParseCell: d => { if (d.section === 'head' && d.column.index === 1) d.cell.styles.halign = 'right'; },
            });
            y = fimY(doc) + 1.5;
        };
        pares('1. Fonte pagadora pessoa jurídica', [['CNPJ', cnpjFmt(o.empresa.cnpj)], ['Nome empresarial', o.empresa.razaoSocial]]);
        pares('2. Pessoa física beneficiária dos rendimentos', [['CPF', cpfFmt(inf.cpf)], ['Nome completo', inf.nome], ['Natureza do rendimento', 'Rendimento do trabalho assalariado']]);
        valores('3. Rendimentos tributáveis, deduções e imposto sobre a renda retido na fonte', inf.quadro3);
        valores('4. Rendimentos isentos e não tributáveis', inf.quadro4);
        valores('5. Rendimentos sujeitos à tributação exclusiva (rendimento líquido)', inf.quadro5);
        pares('6. Rendimentos recebidos acumuladamente (art. 12-A da Lei nº 7.713/1988)', [['Situação', 'Sem rendimentos recebidos acumuladamente neste comprovante']]);
        autoTable(doc, { ...base, startY: y, head: [[textoPdf('7. Informações complementares')]], body: (inf.quadro7.length ? inf.quadro7 : ['Sem informações complementares.']).map(t => [textoPdf(t)]) });
        y = fimY(doc) + 1.5;
        pares('8. Responsável pelas informações', [['Nome', ''], ['Data', '____/____/______'], ['Assinatura', '']]);
    });
    return finalizar(doc, o);
}
