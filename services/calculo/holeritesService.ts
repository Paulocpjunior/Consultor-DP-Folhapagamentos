// services/calculo/holeritesService.ts
//
// Leitura dos holerites do IOB em PDF pelo Gemini, pelo túnel do CFI
// (/api/dp-integration/holerites/extrair): a chave e o modelo (família 3.8)
// ficam no Cloud Run do CFI. O PDF não é gravado em lugar nenhum; cada
// leitura deixa um registro em cadastro_audit (quem, quando, quantos), sem
// nomes nem valores.

import { writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { callFiscal } from '../serpro/serproIntegrationService';
import { auditar, type Usuario } from '../cadastros/cadastrosService';
import type { HoleriteIob } from './conferenciaHolerites';

export interface RetornoHolerites { ok: boolean; modelo: string | null; holerites: HoleriteIob[]; avisos: string[] }

/** Limite do CFI para o PDF (o corpo aceita 20 MB e o base64 cresce 1/3). */
export const MAX_PDF_MB = 14;

export async function base64DoArquivo(f: Blob): Promise<string> {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

export async function lerHolerites(arquivo: File, competencia: string): Promise<RetornoHolerites> {
    if (arquivo.size > MAX_PDF_MB * 1048576) throw new Error(`${arquivo.name}: ${(arquivo.size / 1048576).toFixed(1)} MB; o limite é ${MAX_PDF_MB} MB. Divida o PDF.`);
    return callFiscal<RetornoHolerites>('/holerites/extrair', { pdfBase64: await base64DoArquivo(arquivo), competencia });
}

export async function registrarLeitura(u: Usuario, empresaId: string, competencia: string, arquivos: string[], quantidade: number, modelo: string): Promise<void> {
    const lote = writeBatch(db);
    auditar(lote, u, 'holerites_iob', `${empresaId}_${competencia}`, 'ler holerites com IA', [], {
        empresaId, competencia, arquivos: arquivos.join(', ').slice(0, 500), holerites: String(quantidade), modelo: modelo || 'padrão do CFI',
    });
    await lote.commit();
}
