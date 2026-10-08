// services/bancario/download.ts
//
// Download do arquivo de remessa com o nome que o banco exige (8.3).
// O Safari do Mac acrescenta ".txt" a qualquer download cujo conteúdo é
// texto, mesmo como application/octet-stream: o Itaú recusou
// "PG081010.REM.txt" (Paulo, 08/10/2026, print do app Itaú). No Safari o .REM
// vai dentro de um .zip: o Safari abre o .zip sozinho ("abrir arquivos
// seguros") e o Utilitário de Compressão extrai o nome exato, sem .txt. Nos
// demais navegadores o .REM sai direto.

import { gerarZip } from '../implantacao/zip';

/** Safari (Mac ou iPad), e não Chrome, Edge, Firefox ou Opera, que também trazem "Safari" no user agent. */
export const ehSafari = (ua: string) => /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|opr|android/i.test(ua);

export interface Download { nome: string; bytes: Uint8Array; mime: string; dentroDoZip: boolean }

export function remessaParaBaixar(nomeArquivo: string, conteudo: string, ua: string, agora = new Date()): Download {
    if (!ehSafari(ua)) return { nome: nomeArquivo, bytes: new TextEncoder().encode(conteudo), mime: 'application/octet-stream', dentroDoZip: false };
    return { nome: nomeArquivo.replace(/\.[^.]*$/, '') + '.zip', bytes: gerarZip([{ nome: nomeArquivo, conteudo }], agora), mime: 'application/zip', dentroDoZip: true };
}
