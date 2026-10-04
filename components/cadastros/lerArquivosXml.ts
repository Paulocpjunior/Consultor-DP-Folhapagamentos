// components/cadastros/lerArquivosXml.ts
//
// XMLs do eSocial escolhidos pelo usuário, soltos ou dentro de .zip, sem
// repetir arquivo de mesmo conteúdo (SHA-256 do texto).

import { hashArquivo } from '../../services/implantacao/dossie';
import { lerZip } from '../../services/implantacao/zip';
import type { FonteXml } from '../../services/implantacao/implantacao';

export async function fontesDosArquivos(files: File[]): Promise<{ fontes: FonteXml[]; problemas: string[] }> {
    const fontes: FonteXml[] = []; const problemas: string[] = [];
    const vistos = new Set<string>();
    const add = async (nome: string, xml: string) => {
        const hash = await hashArquivo(new TextEncoder().encode(xml).buffer as ArrayBuffer);
        if (!vistos.has(hash)) { vistos.add(hash); fontes.push({ nome, xml, hash }); }
    };
    for (const f of files) {
        try {
            if (/\.zip$/i.test(f.name)) {
                const itens = (await lerZip(new Uint8Array(await f.arrayBuffer()))).filter(i => /\.xml$/i.test(i.nome));
                if (!itens.length) problemas.push(`${f.name}: nenhum XML dentro do zip.`);
                for (const i of itens) await add(`${f.name}/${i.nome}`, new TextDecoder().decode(i.bytes));
            } else if (/\.xml$/i.test(f.name)) await add(f.name, await f.text());
            else problemas.push(`${f.name}: envie XML do eSocial ou um .zip com os XMLs.`);
        } catch (e) { problemas.push(`${f.name}: ${(e as Error).message}`); }
    }
    return { fontes, problemas };
}
