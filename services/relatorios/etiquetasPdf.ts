// services/relatorios/etiquetasPdf.ts
//
// Etiquetas (Listagens › Etiquetas do SAGE) em folha A4 de 21 etiquetas de 63,5 × 38,1 mm, 3 colunas por 7 linhas
// (a geometria da Avery L7160): margem superior 15,15 mm, esquerda 7,25 mm, passo de 66,04 mm na horizontal. Sem
// cabeçalho nem rodapé, que sairiam impressos em cima das etiquetas. `pular` deixa em branco as primeiras posições de
// uma folha já usada.

import { novoDocumento, textoPdf } from './layoutPdf';
import type jsPDF from 'jspdf';

export const ETIQUETA = { colunas: 3, linhas: 7, largura: 63.5, altura: 38.1, margemTopo: 15.15, margemEsquerda: 7.25, passoH: 66.04, passoV: 38.1 };

/** Posição (mm) do canto superior esquerdo da etiqueta n (0 a 20) da folha. */
export function posicaoEtiqueta(n: number): { x: number; y: number } {
    const col = n % ETIQUETA.colunas; const lin = Math.floor(n / ETIQUETA.colunas);
    return { x: ETIQUETA.margemEsquerda + col * ETIQUETA.passoH, y: ETIQUETA.margemTopo + lin * ETIQUETA.passoV };
}

export function etiquetasPdf(etiquetas: string[][], pular = 0): jsPDF {
    const doc = novoDocumento({ orientacao: 'retrato' });
    const porFolha = ETIQUETA.colunas * ETIQUETA.linhas;
    const inicio = Math.max(0, Math.min(porFolha - 1, Math.floor(pular)));
    etiquetas.forEach((linhas, i) => {
        const k = inicio + i;
        if (k > 0 && k % porFolha === 0) doc.addPage();
        const { x, y } = posicaoEtiqueta(k % porFolha);
        let yy = y + 7;
        linhas.slice(0, 5).forEach((t, j) => {
            doc.setFont('helvetica', j === 0 ? 'bold' : 'normal'); doc.setFontSize(j === 0 ? 10 : 8.5);
            const [primeira] = doc.splitTextToSize(textoPdf(t), ETIQUETA.largura - 8) as string[];
            doc.text(primeira ?? '', x + 4, yy);
            yy += j === 0 ? 5.5 : 4.6;
        });
    });
    return doc;
}
