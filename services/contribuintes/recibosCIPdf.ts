// services/contribuintes/recibosCIPdf.ts
//
// Recibos do mês: RPA (recibo de pagamento a autônomo) e recibo de pró-labore, uma página por pessoa, com as
// retenções (INSS, IRRF, ISS), o líquido e a declaração para assinatura.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cabecalhoPadrao, finalizar, textoPdf, type OpcoesPdf } from '../relatorios/layoutPdf';
import { reais } from '../cadastros/documentos';
import { CATEGORIAS_CI, type ContribuinteIndividual, type ResultadoCI } from './contribuinteIndividual';

const brl = (c: number) => textoPdf(reais(c));
const br = (d: string) => d.split('-').reverse().join('/');
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);

export function recibosCIPdf(resultados: ResultadoCI[], contribuintes: ContribuinteIndividual[], o: OpcoesPdf): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let paginas = 0;
    for (const r of resultados.filter(x => x.situacao !== 'erro')) {
        const c = contribuintes.find(x => x.id === r.fichaId);
        const rpa = CATEGORIAS_CI[r.categoria]?.tipo === 'rpa';
        if (paginas++) doc.addPage();
        cabecalhoPadrao(doc, { ...o, titulo: rpa ? 'Recibo de pagamento a autônomo (RPA)' : 'Recibo de pró-labore' }, `Competência ${r.competencia.slice(5)}/${r.competencia.slice(0, 4)} · pagamento ${br(r.dataPagamento)}`);
        doc.setFontSize(9);
        const linhas = [`${rpa ? 'Prestador' : 'Sócio/diretor'}: ${r.nome}`, `CPF ${cpfFmt(c?.cpf ?? '')}${c?.nit ? ` · NIT ${c.nit}` : ''} · categoria ${CATEGORIAS_CI[r.categoria]?.rotulo ?? r.categoria}${c?.cbo ? ` · CBO ${c.cbo}` : ''}`];
        linhas.forEach((t, i) => doc.text(textoPdf(t), 14, 34 + i * 5));
        autoTable(doc, {
            startY: 46,
            head: [['Descrição', 'Referência', 'Valor', 'Descontos']],
            body: r.verbas.map(v => [textoPdf(v.descricao), textoPdf(v.referencia), v.tipo === 'provento' ? brl(v.valor) : '', v.tipo === 'desconto' ? brl(v.valor) : '']),
            foot: [['Totais', '', brl(r.totais.proventos), brl(r.totais.descontos)], ['Líquido a receber', '', '', brl(r.totais.liquido)]],
            styles: { fontSize: 8.5, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
            columnStyles: { 1: { cellWidth: 26 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 32 } }, margin: { left: 14, right: 14 },
        });
        let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        const notas = [
            `Base do INSS ${brl(r.bases.inss)} (11%, até o teto)${r.patronal ? ` · parte da empresa ${brl(r.patronal.valor)} (não descontada)` : ''}.`,
            `Recebi de ${o.empresa.razaoSocial} a importância líquida de ${reais(r.totais.liquido)}, ${rpa ? 'pelos serviços prestados' : 'a título de pró-labore'} na competência acima, com as retenções discriminadas.`,
        ].flatMap(t => doc.splitTextToSize(textoPdf(t), 182) as string[]);
        notas.forEach((t, j) => doc.text(t, 14, y + j * 4.5));
        y += notas.length * 4.5;
        doc.line(14, y + 18, 100, y + 18);
        doc.text(textoPdf('Data: ____/____/______'), 120, y + 18);
        doc.text(textoPdf(`Assinatura de ${r.nome}`), 14, y + 23);
    }
    if (!paginas) { cabecalhoPadrao(doc, o, ''); doc.text('Nenhum recibo no mês.', 14, 40); }
    return finalizar(doc, o);
}
