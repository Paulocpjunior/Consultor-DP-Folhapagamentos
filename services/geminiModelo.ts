/**
 * geminiModelo.ts — QUAL Gemini o app pede (dono único).
 *
 * Paulo, 06/09: *"precisamos alterar nosso motor em todos os apps, do gemini,
 * 3.7 para 3.8 em todos"*. Antes o ID vivia escrito em NOVE chamadas de dois
 * serviços (`gemini-2.5-flash` e `gemini-2.5-pro`) — trocar de versão era
 * caçar string, e uma esquecida ficaria para trás em silêncio.
 *
 * Um modelo só, na linha Flash: é nela que a Google publica as versões novas
 * (o Pro ficou na 3.1 — print da conta no CFI, 16/08), e o Paulo aceitou o
 * Flash "desde que seja a última versão". Para voltar a dois degraus, é aqui.
 */
export const GEMINI_MODEL = 'gemini-3.8-flash';
