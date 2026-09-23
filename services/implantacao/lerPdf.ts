import { extrairPaginasFicha, type FichaExtraida, type ItemFicha } from './fichaPdf';
/** PDF.js e worker são carregados somente ao abrir um PDF, sem enviar o arquivo à rede. */
export async function lerFichaPdf(bytes: ArrayBuffer, progresso: (texto: string) => void): Promise<FichaExtraida> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    const tarefa = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    let timer: ReturnType<typeof setTimeout>;
    const leitura = async () => {
        const doc = await tarefa.promise;
        if (doc.numPages > 30) throw new Error('Limite de 30 páginas por ficha. Separe os funcionários em arquivos individuais.');
        const paginas: ItemFicha[][] = [];
        for (let n = 1; n <= doc.numPages; n++) {
            progresso(`Lendo ficha: página ${n} de ${doc.numPages}…`);
            const p = await doc.getPage(n); const text = await p.getTextContent();
            paginas.push(text.items.flatMap(i => 'str' in i && i.str.trim() ? [{ texto: i.str, x: i.transform[4], y: i.transform[5], largura: i.width }] : []));
        }
        return extrairPaginasFicha(paginas);
    };
    try {
        return await Promise.race([leitura(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Leitura excedeu 45 segundos. Tente novamente ou confira o PDF visualmente.')), 45000); })]);
    } finally { clearTimeout(timer!); await tarefa.destroy(); }
}
