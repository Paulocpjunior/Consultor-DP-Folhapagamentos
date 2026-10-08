// services/mia/mia.ts
//
// MiA, a agente de IA do DP (Paulo, 07/10/2026: "nossa agente de IA dentro do
// app, agente mulher, porque este depto é composto só de mulheres"). Ela roda
// no CFI (Gemini com a conta do escritório, busca do Google para a base
// legal), pelo túnel: POST /api/dp-integration/assistente/mia. Aqui ficam o
// que a tela manda para ela (o contexto, o mapa do app) e a conversa, que não
// é gravada.

import { callFiscal } from '../serpro/serproIntegrationService';
import type { ResultadoCalculo } from '../calculo/motorMensal';
import { cpfValido } from '../implantacao/implantacao';

export type Papel = 'usuaria' | 'mia';
export interface MensagemMia { papel: Papel; texto: string; fontes?: { titulo: string; uri: string }[] }
export interface ContextoMia { tela: string; texto: string }

/** Limites do CFI (sefaz-backend/dp-assistente-mia.js). */
export const MAX_MENSAGENS = 20;
export const MAX_TEXTO = 4000;
export const MAX_CONTEXTO = 24000;

/**
 * CPF fora do texto que vai para a IA: com máscara (000.000.000-00) sempre;
 * só dígitos, quando os 11 formam um CPF válido (auditoria de 08/10/2026).
 */
export const mascararCpf = (t: string) => t.replace(/(?<![\d.])(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?![\d-])/g,
    m => (m.length === 14 || cpfValido(m) ? '***.***.***-**' : m));

// Cada mensagem cabe no limite do CFI: da pergunta fica o fim (a mais recente, quando foram juntadas); da resposta, o começo.
const caber = (m: { papel: Papel; texto: string }) => m.texto.length <= MAX_TEXTO ? m
    : { ...m, texto: m.papel === 'usuaria' ? `[…] ${m.texto.slice(-(MAX_TEXTO - 4))}` : `${m.texto.slice(0, MAX_TEXTO - 4)} […]` };

/** Mapa do app para a MiA guiar a equipe (onde fica cada coisa). */
export const GUIA_DO_APP = [
    'Mapa do Consultor DP (abas no topo):',
    '- Folha: conferência pós-folha (totalizadores S-5001/S-5003/S-5011/S-5013 do eSocial), eventos e relatórios.',
    '- Cadastros: funcionários (fichas), sindicatos, tabelas legais (INSS, IRRF, salário mínimo; botão para carregar as oficiais de 2026), horários, afastamentos, incidências (rubricas do S-1010) e enquadramento patronal.',
    '- Cálculo: escolha a folha (mensal, 13º 1ª/2ª parcela, férias, rescisão) e a competência. Botões: Salvar movimento, Conferir com holerites do IOB (PDF lido pelo Gemini), Conferir com o eSocial do IOB (S-1200, critério de 3 meses sem diferença), Resumo da folha, Holerites (PDF), Arquivo bancário (CNAB 240), Pacote do cliente (.zip com PDFs, .REM, agenda .ics e LEIA-ME, com envio por WhatsApp/e-mail), S-1200 e S-1210 (gerar e transmitir pelo CFI), Exportar Excel. Clicar no funcionário abre o holerite com a memória de cálculo; nas férias, Programar férias, IRRF das férias, convite de agenda e envio do S-2230.',
    '- Prazos: calendário de obrigações da folha por empresa (salário, DARF, FGTS Digital, DCTFWeb, S-1299).',
    '- Certificados: cofre único de certificados A1 (o mesmo do CFI e do app Legal); a renovação sobe pelo app Legal.',
    '- Empresas: cadastro das empresas (código SAGE e CNPJ únicos), contas para o arquivo bancário.',
    '- eSocial: monitor, transmissão (lotes enviados e "Consultar resultado"), download de eventos pelo CFI.',
    '- IOB SAGE: restauração do backup do SAGE (empresa piloto e as demais), registro de guarda dos backups.',
    '- Usuários (só admin): papéis e carteira de empresas. O vínculo com o módulo DP/Folha é no Gerenciar Usuários do CFI.',
    '- Pensão alimentícia: o valor do mês entra no movimento do Cálculo; quem recebe (alimentando) se marca na ficha, aba Dependentes (colunas Pensão, Cota % e No eSocial). O S-1210 informa a pensão pelo CPF de cada alimentando; com mais de um, a cota divide o valor.',
    'Antes de qualquer ação o app pede a empresa e o período ativos ("Trocar empresa ou período" no topo).',
].join('\n');

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const comp = (c: string) => (/^\d{4}-\d{2}$/.test(c) ? `${c.slice(5)}/${c.slice(0, 4)}` : c);

/** O holerite aberto na tela, para a MiA explicar o cálculo (sem CPF). */
export function contextoDoHolerite(r: ResultadoCalculo, titulo: string): string {
    return [
        `${titulo} · ${r.nome} · competência ${comp(r.competencia)} · pagamento ${comp(r.pagamento)} · situação: ${r.situacao}`,
        'Verbas:',
        ...r.verbas.map(v => `- ${v.codigo} ${v.descricao}${v.referencia ? ` (${v.referencia})` : ''}: ${v.tipo} ${reais(v.valor)}`),
        `Totais: proventos ${reais(r.totais.proventos)}, descontos ${reais(r.totais.descontos)}, líquido ${reais(r.totais.liquido)}.`,
        `Bases: INSS ${reais(r.bases.inss)}, FGTS ${reais(r.bases.fgts)}, IRRF ${reais(r.bases.irrf)}; FGTS do mês ${reais(r.fgts)}.`,
        'Memória de cálculo do motor:',
        ...r.memoria.map((m, i) => `${i + 1}. ${m}`),
        ...(r.avisos.length ? ['Avisos:', ...r.avisos.map(a => `- ${a}`)] : []),
        ...(r.erros.length ? ['Erros:', ...r.erros.map(a => `- ${a}`)] : []),
    ].join('\n');
}

// ─── contexto da tela (cada tela publica o seu; a MiA lê o mais recente) ───

const camadas = new Map<string, ContextoMia>();
let atual: ContextoMia | null = null;
const ouvintes = new Set<() => void>();
/**
 * Publica (ou retira, com null) o contexto de uma parte da tela. Vale o
 * publicado por último: o holerite aberto vale sobre a lista do Cálculo, e a
 * linha aberta da conferência vale sobre os dois enquanto estiver aberta.
 */
export function definirContextoMia(origem: string, c: ContextoMia | null): void {
    const antes = camadas.get(origem);
    if (c && antes && antes.tela === c.tela && antes.texto === c.texto) return;
    camadas.delete(origem);
    if (c) camadas.set(origem, c);
    const novo = [...camadas.values()].pop() ?? null;
    if (novo === atual) return;
    atual = novo;
    ouvintes.forEach(f => f());
}
export const contextoMiaAtual = () => atual;
export function ouvirContextoMia(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }

/** Pergunta à MiA: as últimas mensagens da conversa e, se a usuária deixar, o contexto da tela + o mapa do app. */
export async function perguntarMia(conversa: MensagemMia[], contexto: ContextoMia | null, aba: string): Promise<MensagemMia> {
    // O CFI exige turnos alternados (usuária, MiA, usuária…): perguntas seguidas (ex.: repetida depois de um erro) viram uma só.
    const alternadas: { papel: Papel; texto: string }[] = [];
    for (const m of conversa) {
        const ult = alternadas[alternadas.length - 1];
        if (ult && ult.papel === m.papel) ult.texto = `${ult.texto}\n\n${m.texto}`;
        else alternadas.push({ papel: m.papel, texto: m.texto });
    }
    const mensagens = alternadas.slice(-MAX_MENSAGENS).map(caber);
    while (mensagens.length && mensagens[0].papel !== 'usuaria') mensagens.shift();
    const partes = [`Aba aberta: ${aba}.`, GUIA_DO_APP, ...(contexto ? [`Tela "${contexto.tela}":`, mascararCpf(contexto.texto)] : [])];
    let texto = partes.join('\n\n');
    if (texto.length > MAX_CONTEXTO) texto = `${texto.slice(0, MAX_CONTEXTO - 40)}\n[contexto cortado por tamanho]`;
    const r = await callFiscal<{ texto: string; fontes?: { titulo: string; uri: string }[] }>('/assistente/mia', { mensagens, contexto: { tela: contexto?.tela ?? aba, texto } });
    return { papel: 'mia', texto: r.texto, fontes: r.fontes ?? [] };
}
