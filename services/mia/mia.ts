// services/mia/mia.ts
//
// MiA, a agente de IA do DP (Paulo, 07/10/2026: "nossa agente de IA dentro do
// app, agente mulher, porque este depto é composto só de mulheres"). Ela roda
// no serviço de IA do DP (a plataforma do DP, ou o CFI se VITE_SERVICO_IA_URL
// voltar para lá): Gemini com a conta do escritório e a busca do Google para a
// base legal, em POST /api/dp-integration/assistente/mia. Aqui ficam o que a
// tela manda para ela (o contexto, o mapa do app) e a conversa, que não é
// gravada.

import { callFiscal } from '../serpro/serproIntegrationService';
import type { ResultadoCalculo } from '../calculo/motorMensal';
import { cpfValido } from '../implantacao/implantacao';
import { MENU } from '../navegacao/menu';
import { ABAS as ABAS_DA_FICHA } from '../cadastros/funcionarios';

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

/**
 * Mapa do app para a MiA guiar a equipe (onde fica cada coisa). A lista de telas sai do próprio menu
 * (services/navegacao/menu.ts), para nunca ficar velha: em 14/10/2026 a MiA respondeu que não havia onde cadastrar
 * plano de saúde porque o mapa escrito à mão ainda era o das abas antigas. O resto são as rotinas que o menu não
 * explica.
 */
export const GUIA_DO_APP = [
    'Mapa do Consultor DP (menu no topo, "grupo › item: o que faz"):',
    ...MENU.flatMap(g => g.itens.map(i => `- ${g.rotulo} › ${i.rotulo}${i.soAdmin ? ' (só admin)' : ''}: ${i.descricao}.`)),
    '',
    'Rotinas dentro das telas:',
    `- Ficha do funcionário (Cadastros › Funcionários, clicar no nome), abas: ${ABAS_DA_FICHA.map(a => a.titulo).join(', ')}, Dependentes, Benefícios, Consignado, Lanç. automático, Afastamentos e Histórico.`,
    '- Plano de saúde e odontológico (e outros benefícios descontados em folha): 1) a empresa cadastra o plano em Folha do mês › Cálculo mensal › botão "Benefícios" (nome, evento IOB, valor por vida, incidências e, se for plano de saúde coletivo, o CNPJ da operadora e o registro na ANS); 2) na ficha do funcionário, aba Benefícios, entra a adesão: o plano, o número de vidas (titular + dependentes) e os meses "desde" e "até"; 3) o motor desconta valor por vida × vidas em toda folha mensal do período; 4) a coparticipação do mês vem da planilha da operadora em Folha do mês › Administração de benefícios. Com o CNPJ da operadora, o que o empregado pagou (mensalidade e coparticipação) vai no S-1210 gerado pelo Consultor (infoIRComplem/planSaude, valor todo no titular) e no informe de rendimentos. Não há campo de número de carteirinha.',
    '- Cálculo (Folha do mês › Cálculo mensal, Férias, Rescisão, 13º): botões Salvar movimento, Benefícios, Conferir com holerites do IOB, Conferir com o eSocial do IOB (S-1200), Resumo da folha, Holerites (PDF), Arquivo bancário (CNAB 240), Pacote do cliente, S-1200 e S-1210 (gerar e transmitir), Exportar Excel. Clicar no funcionário abre o holerite com a memória de cálculo.',
    '- Rescisão (Folha do mês › Rescisão, clicar no funcionário): tipo do desligamento, aviso prévio e datas; os eventos da rescisão (proventos e descontos, como vale-transporte ou refeição não utilizados) se digitam ali mesmo, em "Lançar evento" ou "Lançamentos avulsos", e se gravam em "Salvar movimento". No motivo 04 (término antecipado do contrato a termo pelo empregado), marque "Indenização do art. 480" para descontar metade da remuneração dos dias que faltavam. Se os descontos passarem dos proventos, entra a "Insuficiência de saldo rescisório" e o líquido fica zero, como no SAGE. Os avisos (prévio indenizado, término do contrato, término antecipado pelo empregador ou pelo empregado, justa causa) estão em Relatórios › Contratos e modelos.',
    '- Tabelas legais (Cadastros › Tabelas legais): INSS progressivo por faixa (a tela mostra a parcela a deduzir de cada faixa e a contribuição no teto), IRRF com parcela a deduzir, dependente, desconto simplificado e redutor, salário-família e mínimos. O botão carrega as tabelas oficiais de 2026.',
    '- Tributação da empresa para a folha (no SAGE: Cadastro de Empresas › Folha de Pagto., "Configurar RAT e FAP" e Dados e-Social/REINF): no Consultor fica em Cadastros › Enquadramento, por vigência. Ali vão o regime (normal = lucro presumido ou real; Simples Nacional Anexo IV, que paga 20% + RAT × FAP na folha; Simples dos demais anexos, com a patronal no DAS), a desoneração (CPRB, com a reoneração gradual), a contribuição patronal, o RAT, o FAP (o RAT ajustado = RAT × FAP aparece na tela), o FPAS, o código e o percentual de terceiros. O botão do backup do IOB carrega esses dados. A classificação tributária do eSocial é a do S-1000 da empresa.',
    '- PLR (SAGE: Digitação PLR): Folha do mês › PLR; valor ou o do ano com "Calcular proporcional"; desligados também. IRRF pela tabela da PLR (Tabelas legais).',
    '- Seguro-desemprego: Folha do mês › Rescisão › o desligado › Efetivação › etapa do seguro: "Dados para o Empregador Web" (copiar) e o atalho do site. Não há arquivo TXT.',
    '- Dissídio (SAGE: Folha Complementar): Folha complementar › "Usar a convenção" (percentual, meses e sindicato da ficha).',
    '- Duplo vínculo (no SAGE: Arquivos › Duplo Vínculo; no eSocial: múltiplos vínculos, grupo infoMV do S-1200): na ficha do funcionário (Cadastros › Funcionários, clicar no nome), aba Duplo vínculo. Informe o CNPJ ou CPF do outro empregador, a categoria, a remuneração mensal lá e o período. O cálculo do mês faz o INSS sobre o total (aqui + lá), limitado ao teto, e desconta aqui a parte desta empresa; se lá já chega ao teto, não desconta aqui. O S-1200 vai com o infoMV. Para pró-labore e autônomos, as outras fontes ficam no lançamento do Contribuinte individual.',
    '- Tabela para D.S.R. (Cadastros › Tabelas legais, no fim da tela), como a do SAGE: por empresa e ano, dias úteis e domingos/feriados de cada mês (o Nº horas D.S.R. = domingos/feriados × 220 ÷ 30). "Cópia padrão" monta o ano pelo calendário com os feriados nacionais; acerte os feriados estaduais, municipais e pontos facultativos. "Cópia entre empresas" traz a de outra empresa. O DSR das horas extras usa a tabela no mês inteiro; "Descontar faltas pelos dias do mês" desconta a falta por salário ÷ dias do mês. Mês encerrado só muda depois de reaberto no Fim de mês.',
    '- Pensão alimentícia: o valor do mês entra no movimento do Cálculo; quem recebe (alimentando) se marca na ficha, aba Dependentes (colunas Pensão, Cota % e No eSocial). O S-1210 informa a pensão pelo CPF de cada alimentando; com mais de um, a cota divide o valor.',
    '- Férias no eSocial (MOS S-1.3, S-1010 item 23 e S-1200 item 29): o recibo vai no S-1200 do mês em que é pago, em demonstrativo próprio, inteiro como adiantamento (natureza 1015) com o INSS e o IRRF retidos, e no S-1210 desse mês (data do recibo). A folha de cada mês do gozo traz as férias e o 1/3 do mês (1016 e 1017) e abate o adiantamento (9221) e o retido. Gera-se pelo Cálculo › Mensal › "S-1200 e S-1210" da competência do pagamento.',
    '- O Consultor gera e transmite os eventos do eSocial (S-1010, S-1200, S-1210, S-2200, S-2230, S-2299, S-1299 e outros); o IOB SAGE é a origem dos dados importados e a base de conferência, não o lugar onde se resolve o que o Consultor já faz.',
    'Antes de qualquer ação o app pede a empresa e o período ativos ("Ativar empresa e período", no grupo Empresas).',
    'Se o que perguntarem não estiver neste mapa, diga que não encontrou no mapa e peça para confirmar com o gestor do DP; não afirme que o app não tem a função.',
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
