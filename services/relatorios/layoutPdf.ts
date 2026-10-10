// services/relatorios/layoutPdf.ts
//
// Layout único dos relatórios do Consultor DP (holerites, recibos, resumo e a Central de relatórios):
// faixa do escritório com a marca, empresa e título no cabeçalho; rodapé com emissão, usuário e
// "página x de y"; marca d'água de PRÉVIA enquanto o motor não está ativo na empresa.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CabecalhoEmpresa { razaoSocial: string; cnpj: string; codigoSage?: string }
export interface OpcoesPdf {
    empresa: CabecalhoEmpresa;
    titulo: string;
    previa: boolean;
    /** Quem emitiu (vai no rodapé). */
    emitidoPor?: string;
    orientacao?: 'retrato' | 'paisagem';
}

export const ESCRITORIO = { nome: 'SP Assessoria Contábil', departamento: 'Departamento Pessoal' };
const AZUL: [number, number, number] = [15, 29, 77];
const AZUL_CLARO: [number, number, number] = [29, 78, 216];

/** A fonte padrão do PDF (WinAnsi) não tem alguns sinais: troca pelos equivalentes. */
export const textoPdf = (t: string) => t.replace(/[−–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x20-\x7e\xa0-\xff—•]/g, '');
export const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);

export function novoDocumento(o: Pick<OpcoesPdf, 'orientacao'>): jsPDF {
    return new jsPDF({ unit: 'mm', format: 'a4', orientation: o.orientacao === 'paisagem' ? 'landscape' : 'portrait' });
}

/** Cabeçalho padrão (até y ≈ 28): marca do escritório, empresa à esquerda, título e subtítulo à direita. */
export function cabecalhoPadrao(doc: jsPDF, o: OpcoesPdf, subtitulo: string) {
    const largura = doc.internal.pageSize.getWidth();
    // Marca: monograma SP em azul.
    doc.setFillColor(...AZUL); doc.roundedRect(14, 9, 10, 10, 1.6, 1.6, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text('SP', 19, 15.4, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11.5); doc.setFont('helvetica', 'bold');
    doc.text(textoPdf(o.empresa.razaoSocial), 27, 13.5);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(textoPdf(`CNPJ ${cnpjFmt(o.empresa.cnpj)}${o.empresa.codigoSage ? ` · código ${o.empresa.codigoSage}` : ''}`), 27, 18.5);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(textoPdf(o.titulo), largura - 14, 13.5, { align: 'right' });
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    if (subtitulo) doc.text(textoPdf(subtitulo), largura - 14, 18.5, { align: 'right' });
    doc.setDrawColor(...AZUL_CLARO); doc.setLineWidth(0.6); doc.line(14, 22, largura - 14, 22); doc.setLineWidth(0.2); doc.setDrawColor(0, 0, 0);
    if (o.previa) {
        doc.setTextColor(180, 0, 0); doc.setFontSize(8.5);
        doc.text(textoPdf('Prévia do Consultor DP — confira com o IOB antes de qualquer uso.'), 14, 27);
        doc.setTextColor(0, 0, 0);
    }
}

/** Marca d'água por cima de tudo (semitransparente), em todas as páginas. */
function marcaPrevia(doc: jsPDF) {
    const largura = doc.internal.pageSize.getWidth(); const altura = doc.internal.pageSize.getHeight();
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
        doc.setPage(p);
        doc.saveGraphicsState();
        doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.18 }) as never);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(64);
        doc.text('PRÉVIA', largura / 2, altura / 2, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
    }
    doc.setTextColor(0, 0, 0);
}

const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Rodapé em todas as páginas e, na prévia, a marca d'água. Chamar ao terminar o documento. */
export function finalizar(doc: jsPDF, o: OpcoesPdf): jsPDF {
    const largura = doc.internal.pageSize.getWidth(); const altura = doc.internal.pageSize.getHeight();
    const total = doc.getNumberOfPages();
    const emissao = textoPdf(`Consultor DP · ${ESCRITORIO.nome} · ${ESCRITORIO.departamento} — emitido em ${agora()}${o.emitidoPor ? ` por ${o.emitidoPor}` : ''}`);
    for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setDrawColor(203, 213, 225); doc.line(14, altura - 11, largura - 14, altura - 11); doc.setDrawColor(0, 0, 0);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(emissao, 14, altura - 7);
        doc.text(`Página ${p} de ${total}`, largura - 14, altura - 7, { align: 'right' });
        doc.setTextColor(0, 0, 0);
    }
    if (o.previa) marcaPrevia(doc);
    return doc;
}

export interface ColunaRelatorio { titulo: string; alinhar?: 'direita'; largura?: number }
export interface TabelaRelatorio { colunas: ColunaRelatorio[]; linhas: string[][]; totais?: string[]; observacao?: string }

/** Relatório em tabela no layout padrão (cabeçalho repetido em cada página). */
export function tabelaPdf(t: TabelaRelatorio, o: OpcoesPdf, subtitulo: string): jsPDF {
    const doc = novoDocumento(o);
    const colunaStyles = Object.fromEntries(t.colunas.map((c, i) => [i, { ...(c.alinhar === 'direita' ? { halign: 'right' as const } : {}), ...(c.largura ? { cellWidth: c.largura } : {}) }]));
    autoTable(doc, {
        startY: o.previa ? 31 : 27,
        head: [t.colunas.map(c => textoPdf(c.titulo))],
        body: t.linhas.map(l => l.map(textoPdf)),
        ...(t.totais ? { foot: [t.totais.map(textoPdf)] } : {}),
        styles: { fontSize: 8, cellPadding: 1.4 },
        headStyles: { fillColor: AZUL_CLARO },
        footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: colunaStyles,
        margin: { left: 14, right: 14, top: o.previa ? 31 : 27, bottom: 16 },
        didDrawPage: () => cabecalhoPadrao(doc, o, subtitulo),
        // Títulos e totais das colunas de valor alinhados como os valores.
        didParseCell: d => { if (d.section !== 'body' && t.colunas[d.column.index]?.alinhar === 'direita') d.cell.styles.halign = 'right'; },
    });
    if (!t.linhas.length) { cabecalhoPadrao(doc, o, subtitulo); doc.setFontSize(9); doc.text('Nada a relacionar.', 14, 40); }
    if (t.observacao) {
        const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
        doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
        doc.text(doc.splitTextToSize(textoPdf(t.observacao), doc.internal.pageSize.getWidth() - 28) as string[], 14, y + 6);
        doc.setTextColor(0, 0, 0);
    }
    return finalizar(doc, o);
}
