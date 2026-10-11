// services/beneficios/fornecedores.ts
//
// Administração de benefícios: os fornecedores mais usados pelos clientes (transporte no estado de São Paulo,
// alimentação/refeição e multibenefícios, saúde e odonto, bem-estar) com o site oficial, e os contratados de
// cada empresa (número do contrato ou cliente, dia do pedido/recarga, contato) para o DP fazer o pedido no prazo.
//
// Links: o domínio oficial de cada um. Os marcados `conferido` foram confirmados em busca pública em 11/10/2026 (a
// rede do ambiente de desenvolvimento não abre esses sites); os demais são os domínios conhecidos e a tela pede
// para conferir ao abrir. Marcas que mudaram: Sodexo Benefícios → Pluxee (2023), Gympass →
// Wellhub (2024), cartão BOM → TOP (o BOM deixou de ser recarregado em 2022). Endereço que mudar: o escritório
// grava o certo no contratado da empresa ("link próprio"), que vale no lugar do catálogo.

export type CategoriaFornecedor = 'transporte' | 'alimentacao' | 'saude' | 'bem-estar';
export const ROTULO_CATEGORIA: Record<CategoriaFornecedor, string> = {
    transporte: 'Transporte (vale-transporte) — estado de São Paulo',
    alimentacao: 'Alimentação, refeição e multibenefícios',
    saude: 'Saúde e odontologia',
    'bem-estar': 'Bem-estar e academia',
};

export interface Fornecedor {
    id: string;
    nome: string;
    categoria: CategoriaFornecedor;
    /** O que cobre / onde vale. */
    descricao: string;
    url: string;
    /** Nome antigo, para quem procura pela marca anterior. */
    antes?: string;
    /** Domínio confirmado em busca pública (11/10/2026); os demais são os domínios conhecidos, a conferir ao abrir. */
    conferido?: boolean;
}

export const FORNECEDORES: Fornecedor[] = [
    { id: 'sptrans', nome: 'SPTrans — Bilhete Único', categoria: 'transporte', descricao: 'Ônibus municipais da cidade de São Paulo; vale-transporte do Bilhete Único comprado pela empresa (pessoa jurídica) na loja virtual.', url: 'https://www.sptrans.com.br/', conferido: true },
    { id: 'top', nome: 'TOP', categoria: 'transporte', descricao: 'Vale-transporte metropolitano: Metrô, CPTM e ônibus da EMTU na Grande São Paulo (substituiu o cartão BOM).', url: 'https://boradetop.com.br/', antes: 'Cartão BOM', conferido: true },
    { id: 'metro', nome: 'Metrô de São Paulo', categoria: 'transporte', descricao: 'Linhas 1, 2, 3 e 15 (Companhia do Metropolitano).', url: 'https://www.metro.sp.gov.br/' },
    { id: 'cptm', nome: 'CPTM', categoria: 'transporte', descricao: 'Trens metropolitanos (Companhia Paulista de Trens Metropolitanos).', url: 'https://www.cptm.sp.gov.br/' },
    { id: 'emtu', nome: 'EMTU/SP', categoria: 'transporte', descricao: 'Ônibus intermunicipais das regiões metropolitanas do estado.', url: 'https://www.emtu.sp.gov.br/', conferido: true },
    { id: 'viaquatro', nome: 'ViaQuatro', categoria: 'transporte', descricao: 'Linha 4-Amarela do metrô (concessão).', url: 'https://www.viaquatro.com.br/' },
    { id: 'viamobilidade', nome: 'ViaMobilidade', categoria: 'transporte', descricao: 'Linha 5-Lilás do metrô e linhas 8 e 9 de trens (concessão).', url: 'https://www.viamobilidade.com.br/' },
    { id: 'pluxee', nome: 'Pluxee', categoria: 'alimentacao', descricao: 'Vale-refeição, vale-alimentação, multibenefícios, combustível e gestão de vale-transporte.', url: 'https://www.pluxee.com.br/', antes: 'Sodexo Benefícios', conferido: true },
    { id: 'alelo', nome: 'Alelo', categoria: 'alimentacao', descricao: 'Refeição, alimentação, mobilidade e multibenefícios.', url: 'https://www.alelo.com.br/' },
    { id: 'ticket', nome: 'Ticket', categoria: 'alimentacao', descricao: 'Refeição, alimentação e multibenefícios.', url: 'https://www.ticket.com.br/', conferido: true },
    { id: 'vr', nome: 'VR Benefícios', categoria: 'alimentacao', descricao: 'Refeição, alimentação, multibenefícios e marketplace de saúde.', url: 'https://www.vr.com.br/' },
    { id: 'caju', nome: 'Caju', categoria: 'alimentacao', descricao: 'Benefícios flexíveis (refeição, alimentação, mobilidade, cultura, educação, saúde) num cartão.', url: 'https://www.caju.com.br/' },
    { id: 'flash', nome: 'Flash', categoria: 'alimentacao', descricao: 'Multibenefícios e gestão de despesas.', url: 'https://flashapp.com.br/', conferido: true },
    { id: 'ifood', nome: 'iFood Benefícios', categoria: 'alimentacao', descricao: 'Refeição, alimentação e benefícios flexíveis.', url: 'https://beneficios.ifood.com.br/' },
    { id: 'swile', nome: 'Swile', categoria: 'alimentacao', descricao: 'Multibenefícios.', url: 'https://www.swile.com.br/' },
    { id: 'solides', nome: 'Sólides Benefícios', categoria: 'alimentacao', descricao: 'Cartão multibenefícios (8 categorias) integrado à gestão de pessoas da Sólides.', url: 'https://solides.com.br/beneficios-corporativos/', conferido: true },
    { id: 'porto-odonto', nome: 'Porto Seguro Odonto', categoria: 'saude', descricao: 'Plano odontológico empresarial (PME a partir de 3 vidas), contratado por corretor.', url: 'https://www.portoseguro.com.br/', conferido: true },
    { id: 'odontoprev', nome: 'Odontoprev', categoria: 'saude', descricao: 'Plano odontológico empresarial.', url: 'https://www.odontoprev.com.br/' },
    { id: 'wellhub', nome: 'Wellhub', categoria: 'bem-estar', descricao: 'Academias, atividades físicas, terapia, nutrição e mindfulness.', url: 'https://wellhub.com/pt-br/', antes: 'Gympass', conferido: true },
    { id: 'totalpass', nome: 'TotalPass', categoria: 'bem-estar', descricao: 'Rede de academias e estúdios.', url: 'https://totalpass.com.br/', conferido: true },
];

export const fornecedorPorId = (id: string) => FORNECEDORES.find(f => f.id === id);

/** Benefício contratado pela empresa com um fornecedor (do catálogo ou outro). */
export interface BeneficioContratado {
    id: string;
    /** Id do catálogo, ou '' para outro fornecedor. */
    fornecedorId: string;
    /** Outro fornecedor: o nome; do catálogo: vazio (usa o do catálogo). */
    nome: string;
    /** Link próprio (portal do cliente, por exemplo); vazio usa o do catálogo. */
    url: string;
    produto: string;
    contrato: string;
    /** Dia do mês para o pedido ou a recarga (1 a 31; vazio = sem prazo fixo). */
    diaPedido: string;
    contato: string;
    observacao: string;
}

export const contratadoVazio = (): BeneficioContratado => ({ id: '', fornecedorId: '', nome: '', url: '', produto: '', contrato: '', diaPedido: '', contato: '', observacao: '' });

export const nomeDoContratado = (b: BeneficioContratado) => b.nome.trim() || fornecedorPorId(b.fornecedorId)?.nome || 'Fornecedor';
export const linkDoContratado = (b: BeneficioContratado) => b.url.trim() || fornecedorPorId(b.fornecedorId)?.url || '';

/** Link seguro: só https, sem credenciais embutidas. */
export function linkValido(u: string): boolean {
    try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && x.hostname.includes('.'); } catch { return false; }
}

export function validarContratados(lista: BeneficioContratado[]): string[] {
    const e: string[] = [];
    lista.forEach((b, i) => {
        const n = `Benefício ${i + 1} (${nomeDoContratado(b)})`;
        if (!b.fornecedorId && b.nome.trim().length < 2) e.push(`${n}: escolha o fornecedor ou informe o nome.`);
        if (b.fornecedorId && !fornecedorPorId(b.fornecedorId)) e.push(`${n}: fornecedor desconhecido.`);
        if (b.url.trim() && !linkValido(b.url.trim())) e.push(`${n}: o link próprio precisa ser um endereço https válido.`);
        if (b.diaPedido && !/^([1-9]|[12]\d|3[01])$/.test(b.diaPedido)) e.push(`${n}: dia do pedido de 1 a 31.`);
    });
    return e;
}

/**
 * Próximo pedido a partir de hoje: o dia informado no mês (o último dia quando o mês é mais curto); se já
 * passou, o do mês seguinte. Devolve a data e os dias que faltam.
 */
export function proximoPedido(diaPedido: string, hoje: string): { data: string; dias: number } | null {
    if (!/^([1-9]|[12]\d|3[01])$/.test(diaPedido)) return null;
    const dia = Number(diaPedido);
    const noMes = (a: number, m: number) => { const ult = new Date(Date.UTC(a, m, 0)).getUTCDate(); return `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ult)).padStart(2, '0')}`; };
    let [a, m] = hoje.split('-').map(Number);
    let data = noMes(a, m);
    if (data < hoje) { m += 1; if (m > 12) { m = 1; a += 1; } data = noMes(a, m); }
    return { data, dias: Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86400000) };
}
