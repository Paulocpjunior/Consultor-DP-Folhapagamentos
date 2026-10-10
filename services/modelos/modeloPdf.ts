// services/modelos/modeloPdf.ts
//
// Contrato ou modelo preenchido em PDF no layout padrão do Consultor (cabeçalho com a empresa, rodapé com
// emissão e páginas): título centralizado, cláusulas, parágrafos justificados e os campos de assinatura.

import type jsPDF from 'jspdf';
import { cabecalhoPadrao, finalizar, novoDocumento, textoPdf, type OpcoesPdf } from '../relatorios/layoutPdf';
import type { Bloco } from './modelos';

export interface Assinantes { empregador: string; empregado: string; testemunhas: boolean }

export function modeloPdf(blocos: Bloco[], o: OpcoesPdf, subtitulo: string, assinantes: Assinantes): jsPDF {
    const doc = novoDocumento(o);
    const largura = doc.internal.pageSize.getWidth(); const altura = doc.internal.pageSize.getHeight();
    const util = largura - 40; const topo = o.previa ? 36 : 32; const fim = altura - 20;
    let y = topo;
    cabecalhoPadrao(doc, o, subtitulo);
    const novaPagina = () => { doc.addPage(); cabecalhoPadrao(doc, o, subtitulo); y = topo; };
    const garantir = (h: number) => { if (y + h > fim) novaPagina(); };
    const linha = 4.6;

    for (const b of blocos) {
        if (b.tipo === 'assinaturas') {
            const meia = (util - 12) / 2;
            const assinatura = (x: number, nome: string, papel: string) => {
                doc.line(x, y, x + meia, y);
                doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
                doc.text(doc.splitTextToSize(textoPdf(nome), meia) as string[], x + meia / 2, y + 4, { align: 'center' });
                doc.setFont('helvetica', 'normal'); doc.text(textoPdf(papel), x + meia / 2, y + 8, { align: 'center' });
            };
            garantir(assinantes.testemunhas ? 46 : 22);
            y += 12;
            assinatura(20, assinantes.empregador, 'Empregador(a)');
            assinatura(20 + meia + 12, assinantes.empregado, 'Empregado(a)');
            y += 10;
            if (assinantes.testemunhas) {
                y += 12;
                assinatura(20, 'Testemunha 1', 'Nome e CPF:');
                assinatura(20 + meia + 12, 'Testemunha 2', 'Nome e CPF:');
                y += 10;
            }
            continue;
        }
        if (b.tipo === 'titulo') {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
            const ls = doc.splitTextToSize(textoPdf(b.texto), util) as string[];
            garantir(ls.length * 5.5 + 4);
            doc.text(ls, largura / 2, y, { align: 'center' });
            y += ls.length * 5.5 + 4;
            continue;
        }
        if (b.tipo === 'subtitulo') {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
            garantir(linha * 3);
            y += 1.5;
            doc.text(textoPdf(b.texto), 20, y);
            y += linha + 0.5;
            continue;
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        const ls = doc.splitTextToSize(textoPdf(b.texto), util) as string[];
        for (let i = 0; i < ls.length; i++) {
            garantir(linha);
            // Justifica todas as linhas do parágrafo menos a última.
            if (i < ls.length - 1) doc.text(ls[i], 20, y, { align: 'justify', maxWidth: util });
            else doc.text(ls[i], 20, y);
            y += linha;
        }
        y += 2.6;
    }
    return finalizar(doc, o);
}
