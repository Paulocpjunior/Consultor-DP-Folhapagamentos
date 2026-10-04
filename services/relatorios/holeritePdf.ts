// services/relatorios/holeritePdf.ts
//
// Holerite (recibo de pagamento) em PDF a partir do resultado do motor: um
// funcionário por página, com as verbas, os totais, as bases e o campo de
// assinatura; e o resumo da folha. Enquanto o motor não for conferido com o
// IOB, todo PDF sai com a marca "PRÉVIA" — não é documento para entregar.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { ResumoFolha } from './resumoFolha';
import { centavosDeTexto } from '../cadastros/documentos';

export interface CabecalhoEmpresa { razaoSocial: string; cnpj: string; codigoSage?: string }
export interface OpcoesPdf { empresa: CabecalhoEmpresa; titulo: string; previa: boolean }

/** A fonte padrão do PDF (WinAnsi) não tem alguns sinais: troca pelos equivalentes. */
export const textoPdf = (t: string) => t.replace(/[−–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x20-\x7e\xa0-\xff—•]/g, '');
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const br = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d ?? '');

/** Marca d'água por cima de tudo (semitransparente), em todas as páginas. */
function marcaPrevia(doc: jsPDF) {
    const { width, height } = doc.internal.pageSize;
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
        doc.setPage(p);
        doc.saveGraphicsState();
        doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.18 }) as never);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(64);
        doc.text('PRÉVIA', width / 2, height / 2, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
    }
    doc.setTextColor(0, 0, 0);
}
const direita = (t: string) => ({ content: t, styles: { halign: 'right' as const } });

function cabecalho(doc: jsPDF, o: OpcoesPdf, subtitulo: string) {
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(textoPdf(o.empresa.razaoSocial), 14, 16);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(textoPdf(`CNPJ ${cnpjFmt(o.empresa.cnpj)}${o.empresa.codigoSage ? ` · código ${o.empresa.codigoSage}` : ''}`), 14, 21);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(textoPdf(o.titulo), 196, 16, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(textoPdf(subtitulo), 196, 21, { align: 'right' });
    if (o.previa) {
        doc.setTextColor(180, 0, 0);
        doc.text(textoPdf('Prévia do Consultor DP — confira com o IOB antes de qualquer uso.'), 14, 27);
        doc.setTextColor(0, 0, 0);
    }
}

/** Uma página por funcionário (os resultados com erro ficam de fora). */
export function holeritesPdf(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], o: OpcoesPdf): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const validos = resultados.filter(r => r.situacao !== 'erro');
    validos.forEach((r, i) => {
        if (i) doc.addPage();
        const f = fichas.find(x => x.id === r.fichaId);
        const d = f?.dados ?? {};
        cabecalho(doc, o, `Pagamento: ${r.pagamento.split('-').reverse().join('/')}`);
        doc.setFontSize(9);
        const linhas = [
            `Funcionário: ${r.nome}`,
            `CPF ${cpfFmt(f?.cpf ?? '')} · matrícula ${f?.matriculaEsocial ?? ''}${d.codigoIob ? ` · código IOB ${d.codigoIob}` : ''}`,
            `Cargo: ${d.cargo ?? ''}${d.cbo ? ` (CBO ${d.cbo})` : ''} · admissão ${br(d.admissao)}`,
        ];
        linhas.forEach((t, j) => doc.text(textoPdf(t), 14, 34 + j * 5));
        autoTable(doc, {
            startY: 50,
            head: [['Cód.', 'Descrição', 'Referência', 'Vencimentos', 'Descontos']],
            body: r.verbas.map(v => [v.codigo, textoPdf(v.descricao), textoPdf(v.referencia), v.tipo === 'provento' ? brl(v.valor) : '', v.tipo === 'desconto' ? brl(v.valor) : '']),
            foot: [['', 'Totais', '', direita(brl(r.totais.proventos)), direita(brl(r.totais.descontos))], ['', 'Líquido a receber', '', '', direita(brl(r.totais.liquido))]],
            styles: { fontSize: 8.5, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 64, 175] },
            footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 26 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 30 } },
            margin: { left: 14, right: 14 },
        });
        const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        doc.setFontSize(8.5);
        doc.text(textoPdf(`Salário-base ${brl(centavosDeTexto(d.salario ?? '') ?? 0)} · Base INSS ${brl(r.bases.inss)} · Base FGTS ${brl(r.bases.fgts)} · FGTS do mês ${brl(r.fgts)} · Base IRRF ${brl(r.bases.irrf)}`), 14, y);
        doc.text(textoPdf('Declaro ter recebido a importância líquida discriminada neste recibo.'), 14, y + 14);
        doc.line(14, y + 30, 100, y + 30);
        doc.text(textoPdf(`Data: ____/____/______`), 120, y + 30);
        doc.text(textoPdf(`Assinatura de ${r.nome}`), 14, y + 35);
    });
    if (!validos.length) { cabecalho(doc, o, ''); doc.text('Nenhum holerite calculado.', 14, 40); }
    if (o.previa) marcaPrevia(doc);
    return doc;
}

/** Resumo da folha em uma ou mais páginas. */
export function resumoPdf(resumo: ResumoFolha, o: OpcoesPdf, observacao: string): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    cabecalho(doc, o, `Resumo da folha · ${resumo.funcionarios} funcionário(s)`);
    autoTable(doc, {
        startY: 34,
        head: [['Cód.', 'Verba', 'Tipo', 'Func.', 'Valor']],
        body: resumo.porVerba.map(l => [l.codigo, textoPdf(l.descricao), l.tipo === 'provento' ? 'Provento' : 'Desconto', String(l.funcionarios), brl(l.valor)]),
        foot: [['', 'Proventos', '', '', direita(brl(resumo.totais.proventos))], ['', 'Descontos', '', '', direita(brl(resumo.totais.descontos))], ['', 'Líquido', '', '', direita(brl(resumo.totais.liquido))]],
        styles: { fontSize: 8.5, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 22 }, 3: { halign: 'right', cellWidth: 14 }, 4: { halign: 'right', cellWidth: 30 } },
        margin: { left: 14, right: 14 },
    });
    const e = resumo.encargos;
    autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
        head: [['Para conferir as guias', 'Valor']],
        body: [
            ['INSS dos segurados (descontado)', brl(e.inssSegurados)],
            ['Salário-família pago (deduzido na DCTFWeb)', brl(e.salarioFamilia)],
            ['Salário-maternidade pago (compensado na DCTFWeb)', brl(e.salarioMaternidade)],
            ['IRRF retido (DCTFWeb do mês do pagamento)', brl(e.irrf)],
            ['FGTS (FGTS Digital)', brl(e.fgts)],
            ['Base do INSS / do FGTS / rendimentos do IRRF', `${brl(resumo.bases.inss)} / ${brl(resumo.bases.fgts)} / ${brl(resumo.bases.irrf)}`],
        ].map(([a, b]) => [textoPdf(a), b]),
        styles: { fontSize: 8.5, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175] },
        columnStyles: { 1: { halign: 'right', cellWidth: 60 } }, margin: { left: 14, right: 14 },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(textoPdf(observacao), 182), 14, y);
    if (o.previa) marcaPrevia(doc);
    return doc;
}
