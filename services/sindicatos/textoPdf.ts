// services/sindicatos/textoPdf.ts
//
// Texto de um PDF lido no navegador (PDF.js, carregado só quando usado; nada vai para a rede).

export async function lerTextoPdf(bytes: ArrayBuffer, maxPaginas = 60): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    const tarefa = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    try {
        const doc = await tarefa.promise;
        const partes: string[] = [];
        for (let n = 1; n <= Math.min(doc.numPages, maxPaginas); n++) {
            const p = await doc.getPage(n);
            const t = await p.getTextContent();
            partes.push(t.items.map(i => ('str' in i ? i.str : '')).join(' '));
        }
        return partes.join('\n');
    } finally { await tarefa.destroy(); }
}
