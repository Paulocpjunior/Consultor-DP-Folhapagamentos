// services/cadastros/esocialDoBackup.ts
//
// Os XMLs que o IOB (FolhaWin) transmitiu ao eSocial ficam no próprio Backup
// SQL, no schema fNNNN de cada empresa (inventário de 06/10/2026):
// - arquivoeventotransmissaoesocial (id_protoco, cod_tipeve, nome_arq,
//   dados_arq): o XML de cada evento enviado;
// - arquivoloteeventotransmissaoesocial (nome_arq, dados_arq, tipo): os lotes
//   (envio e, quando houver, o retorno do processamento);
// - eventotransmissaoesocial (id_evento, rec_esocia, sit_evento): o recibo que
//   o eSocial deu a cada evento.
// Daqui saem os S-2200/S-2205/S-2206/S-2299/S-3000 para o importador do
// eSocial que já existe (categoria, contrato, salário, horário, sindicato,
// regimes, FGTS, desligamento), com o recibo de cada um quando o IOB o guardou.
// Nada é gravado aqui. O formato de dados_arq não está no inventário: aceita
// texto, bytea (\x hexadecimal), base64, zip e gzip; o que não abrir vira aviso.

import type { Valor } from '../iobSage/backupPostgres';
import type { Restauracao, TabelaRestauracao } from '../iobSage/restauracao';
import type { FonteXml } from '../implantacao/implantacao';
import { hashArquivo } from '../implantacao/dossie';
import { lerZip } from '../implantacao/zip';
import { chaveColuna } from './cargaBackupIob';
import { codigoDoSchema, codigoIob } from './cargaEnquadramentoIob';

export const TABELAS_ARQUIVO = ['arquivoeventotransmissaoesocial', 'arquivoloteeventotransmissaoesocial'];
export const TABELA_EVENTOS = 'eventotransmissaoesocial';

/** Eventos de vínculo que o importador consolida. */
const EVENTO_CADASTRAL = /<(?:[\w-]+:)?evt(?:Admissao|AltCadastral|AltContratual|Deslig|Exclusao)[\s>]/;
const RETORNO = /<(?:[\w-]+:)?nrRecibo\s*>/;

type Bruto = { tipo: 'texto'; texto: string } | { tipo: 'bytes'; bytes: Uint8Array };

/** Conteúdo da coluna como o COPY entrega: XML direto, bytea em hexadecimal ou base64. */
export function brutoDoValor(v: Valor): Bruto | null {
    const t = (v ?? '').replace(/^﻿/, '').trim();
    if (!t) return null;
    if (t.startsWith('<')) return { tipo: 'texto', texto: t };
    if (/^\\x(?:[0-9a-f]{2})+$/i.test(t)) {
        const b = new Uint8Array((t.length - 2) / 2);
        for (let i = 0; i < b.length; i++) b[i] = parseInt(t.substr(2 + i * 2, 2), 16);
        return { tipo: 'bytes', bytes: b };
    }
    const b64 = t.replace(/\s+/g, '');
    if (b64.length >= 16 && b64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
        try { return { tipo: 'bytes', bytes: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }; } catch { return null; }
    }
    return null;
}

/** Texto do XML; respeita a declaração de codificação ISO-8859-1/Windows-1252. */
export function textoDosBytes(b: Uint8Array): string {
    const cabeca = new TextDecoder('latin1').decode(b.subarray(0, 200));
    const latin = /encoding\s*=\s*["'](?:iso-8859-1|latin-?1|windows-1252|cp1252)["']/i.test(cabeca);
    return new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(b).replace(/^﻿/, '');
}

async function gunzip(b: Uint8Array): Promise<Uint8Array> {
    const f = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(b); c.close(); } }).pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
    return new Uint8Array(await new Response(f).arrayBuffer());
}

/** Um ou mais XMLs do valor da coluna (um zip pode trazer vários). */
export async function xmlsDoValor(v: Valor): Promise<string[]> {
    const bruto = brutoDoValor(v);
    if (!bruto) return [];
    if (bruto.tipo === 'texto') return [bruto.texto];
    const b = bruto.bytes;
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03) return (await lerZip(b)).filter(i => !/\/$/.test(i.nome)).map(i => textoDosBytes(i.bytes)).filter(x => x.trimStart().startsWith('<'));
    if (b[0] === 0x1f && b[1] === 0x8b) return xmlsDoValor(textoDosBytes(await gunzip(b)));
    const x = textoDosBytes(b).trim();
    return x.startsWith('<') ? [x] : [];
}

/** Recibos de um retorno de processamento: Id do evento → nrRecibo, só os aceitos (201/202). */
export function recibosDoRetorno(xml: string): Map<string, string> {
    const r = new Map<string, string>();
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return r;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const todos = Array.from(doc.getElementsByTagName('*'));
    if (todos.some(e => e.localName === 'parsererror')) return r;
    const filho = (e: Element, nome: string) => Array.from(e.getElementsByTagName('*')).find(x => x.localName === nome);
    for (const ret of todos.filter(e => e.localName === 'retornoEvento' && e.getAttribute('Id'))) {
        const cd = filho(ret, 'cdResposta')?.textContent?.trim();
        const rec = filho(ret, 'nrRecibo')?.textContent?.trim();
        if (rec && (cd === '201' || cd === '202')) r.set(ret.getAttribute('Id')!, rec);
    }
    return r;
}

export interface EsocialDoBackup {
    fontes: FonteXml[];
    /**
     * Id do evento (chaveIdEvento) → número do recibo, como o IOB registrou.
     * `null` quando o backup não traz informação de recibo (sem a tabela de
     * eventos nem retorno de lote); mapa vazio quando traz e nenhum foi aceito.
     */
    recibos: Map<string, string> | null;
    /** Esquemas lidos (fNNNN). */
    grupos: string[];
    linhas: number;
    avisos: string[];
}

/** Id do evento como chave do recibo: com ou sem o prefixo "ID", maiúsculo. */
export const chaveIdEvento = (id: string) => id.trim().toUpperCase().replace(/^ID/, '');

const nomeTabela = (t: TabelaRestauracao) => `${t.grupo ? `${t.grupo}.` : ''}${t.tabela}`;

/**
 * Lê os XMLs e os recibos do eSocial guardados no backup. Com `codigoSage`, só o
 * schema da empresa (f1200 para o código 1200); se ele não existir, todos, com aviso.
 */
export async function esocialDoBackup(rest: Pick<Restauracao, 'tabelas' | 'lerTabela'>, codigoSage?: string, aoProgresso?: (msg: string) => void): Promise<EsocialDoBackup> {
    const avisos: string[] = [];
    const daqui = (t: TabelaRestauracao) => t.origem === 'postgres' && [...TABELAS_ARQUIVO, TABELA_EVENTOS].includes(t.tabela.toLowerCase());
    let tabelas = rest.tabelas.filter(daqui);
    if (!tabelas.length) return { fontes: [], recibos: null, grupos: [], linhas: 0, avisos: ['O backup não tem as tabelas de transmissão do eSocial do IOB (arquivoeventotransmissaoesocial).'] };
    const codigo = codigoSage ? codigoIob(codigoSage) : '';
    if (codigo) {
        const daEmpresa = tabelas.filter(t => codigoDoSchema(t.grupo) === codigo);
        if (daEmpresa.length) tabelas = daEmpresa;
        else avisos.push(`Nenhum schema f${codigo} no backup: lidos os XMLs de todas as empresas (os de outro CNPJ ficam de fora na prévia).`);
    }
    const recibos = new Map<string, string>();
    let comRecibos = false;
    const candidatos: { nome: string; valor: Valor }[] = [];
    let linhas = 0, ilegiveis = 0;
    for (const t of tabelas) {
        aoProgresso?.(`Lendo ${nomeTabela(t)}…`);
        const i = (n: string) => t.colunas.findIndex(c => chaveColuna(c) === n);
        if (t.tabela.toLowerCase() === TABELA_EVENTOS) {
            const [iId, iRec] = [i('idevento'), i('recesocia')];
            if (iId < 0 || iRec < 0) { avisos.push(`${nomeTabela(t)}: sem as colunas id_evento e rec_esocia; recibos não lidos.`); continue; }
            comRecibos = true;
            await rest.lerTabela(t, v => {
                const id = (v[iId] ?? '').trim(), rec = (v[iRec] ?? '').trim();
                if (id && /\d/.test(rec)) recibos.set(chaveIdEvento(id), rec);
            });
            continue;
        }
        const [iDados, iNome, iProt] = [i('dadosarq'), i('nomearq'), i('idprotoco')];
        if (iDados < 0) { avisos.push(`${nomeTabela(t)}: sem a coluna dados_arq.`); continue; }
        await rest.lerTabela(t, v => {
            linhas++;
            const valor = v[iDados];
            if (!valor) return;
            // Texto já legível é filtrado aqui, para não guardar na memória os S-1200 e afins.
            const bruto = brutoDoValor(valor);
            if (!bruto) { ilegiveis++; return; }
            if (bruto.tipo === 'texto' && !EVENTO_CADASTRAL.test(bruto.texto) && !RETORNO.test(bruto.texto)) return;
            const nome = `${nomeTabela(t)}/${(iNome >= 0 && v[iNome]?.trim()) || (iProt >= 0 && v[iProt]?.trim()) || `linha ${linhas}`}`;
            candidatos.push({ nome, valor });
        });
    }
    aoProgresso?.(`Abrindo ${candidatos.length} arquivo(s) do eSocial…`);
    const fontes: FonteXml[] = [];
    const vistos = new Set<string>();
    for (const c of candidatos) {
        let xmls: string[];
        try { xmls = await xmlsDoValor(c.valor); } catch { ilegiveis++; continue; }
        if (!xmls.length) { ilegiveis++; continue; }
        for (const [n, xml] of xmls.entries()) {
            if (RETORNO.test(xml)) comRecibos = true;
            if (RETORNO.test(xml)) for (const [id, rec] of recibosDoRetorno(xml)) if (!recibos.has(chaveIdEvento(id))) recibos.set(chaveIdEvento(id), rec);
            if (!EVENTO_CADASTRAL.test(xml)) continue;
            const hash = await hashArquivo(new TextEncoder().encode(xml).buffer as ArrayBuffer);
            if (vistos.has(hash)) continue;
            vistos.add(hash);
            fontes.push({ nome: xmls.length > 1 ? `${c.nome}#${n + 1}` : c.nome, xml, hash });
        }
    }
    if (ilegiveis) avisos.push(`${ilegiveis} arquivo(s) do eSocial no backup em formato não reconhecido; ficaram de fora.`);
    if (linhas && !fontes.length) avisos.push('O backup tem arquivos do eSocial, mas nenhum S-2200, S-2205, S-2206, S-2299 ou S-3000.');
    if (!comRecibos && fontes.length) avisos.push('O backup não traz os recibos do eSocial: os eventos entram como não comprovados.');
    return { fontes, recibos: comRecibos ? recibos : null, grupos: [...new Set(tabelas.map(t => t.grupo))].sort(), linhas, avisos };
}
