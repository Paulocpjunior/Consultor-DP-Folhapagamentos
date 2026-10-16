// services/sindicatos/sindicalPatronal.ts
//
// Contribuição sindical patronal (a "Contribuição Sindical Patronal" do SAGE):
// - facultativa desde a Lei 13.467/2017: só de quem aderiu, prévia e expressamente (CLT, arts. 578, 579 e 587; STF,
//   ADI 5794);
// - proporcional ao capital social, pela tabela progressiva da confederação da atividade (CLT, art. 580, III): cada
//   classe tem a alíquota e a parcela a adicionar; a primeira e a última são o valor mínimo e o máximo;
// - recolhida em janeiro de cada ano (CLT, art. 587), na guia da Caixa (GRCSU), com o código da entidade sindical;
// - capital atribuído às filiais em outra base territorial: cada uma recolhe ao seu sindicato sobre a parte dela,
//   na proporção das operações (CLT, art. 581);
// - em atraso: multa de 10% nos 30 primeiros dias e mais 2% por mês seguinte, juros de 1% ao mês (CLT, art. 600; a
//   correção monetária fica de fora, com aviso);
// - dispensadas as microempresas e empresas de pequeno porte do Simples Nacional (LC 123/2006, art. 13, § 3º; STF,
//   ADI 4033).
// Tabela padrão: a do comércio (CNC) de 2026, publicada pelos sindicatos da categoria. Outras confederações (CNI, CNT,
// CNS…) têm tabelas próprias: a empresa informa as faixas. Puro, sem Firebase.

import { cnpjValido, normalizarCnpj, reais } from '../cadastros/documentos';

export interface FaixaPatronal {
    /** Capital até este valor (centavos); null = acima da última. */
    ate: number | null;
    /** Alíquota sobre o capital (%); 0 com `fixo` = valor mínimo ou máximo. */
    aliquota: number;
    /** Parcela a adicionar (centavos). */
    adicionar: number;
    /** Valor fixo da classe (mínimo ou máximo), em centavos. */
    fixo?: number;
}
export interface TabelaPatronal { id: string; nome: string; ano: number; faixas: FaixaPatronal[]; fonte: string }

/** Comércio (CNC), 2026: mínimo de R$ 338,50 até R$ 42.312,75 de capital; máximo de R$ 159.321,61 acima de R$ 451.336.000,00. */
export const TABELA_CNC_2026: TabelaPatronal = {
    id: 'CNC-2026', nome: 'Comércio (CNC) 2026', ano: 2026, fonte: 'Tabela da CNC para 2026, reajustada pelo INPC (5,05%), publicada pelos sindicatos do comércio',
    faixas: [
        { ate: 4231275, aliquota: 0, adicionar: 0, fixo: 33850 },
        { ate: 8462550, aliquota: 0.8, adicionar: 0 },
        { ate: 84625500, aliquota: 0.2, adicionar: 50775 },
        { ate: 8462550000, aliquota: 0.1, adicionar: 135401 },
        { ate: 45133600000, aliquota: 0.02, adicionar: 6905441 },
        { ate: null, aliquota: 0, adicionar: 0, fixo: 15932161 },
    ],
};
export const TABELAS_PATRONAIS: TabelaPatronal[] = [TABELA_CNC_2026];

export interface FilialPatronal { cnpj: string; percentual: number; entidade: string; codigoSindical: string }

export interface ConfigSindicalPatronal {
    /** A empresa aderiu (autorização prévia e expressa): sem ela, não há contribuição. */
    aderiu: boolean;
    /** Capital social (centavos), o do contrato social ou da última alteração. */
    capitalSocial: number;
    /** Tabela da confederação: uma das prontas ou 'propria' (as faixas abaixo). */
    tabelaId: string;
    faixasProprias: FaixaPatronal[];
    /** Entidade sindical da atividade preponderante e o código dela na GRCSU. */
    entidade: string;
    cnpjEntidade: string;
    codigoSindical: string;
    /** Filiais em outra base territorial, com a parte do capital (%) e o sindicato delas (CLT, art. 581). */
    filiais: FilialPatronal[];
}
export const configPatronalVazia = (): ConfigSindicalPatronal => ({ aderiu: false, capitalSocial: 0, tabelaId: TABELA_CNC_2026.id, faixasProprias: [], entidade: '', cnpjEntidade: '', codigoSindical: '', filiais: [] });

/** Valor da contribuição para um capital, pela tabela (centavos). */
export function valorPelaTabela(capital: number, faixas: FaixaPatronal[]): { valor: number; memoria: string } {
    const f = faixas.find(x => x.ate === null || capital <= x.ate) ?? faixas[faixas.length - 1];
    if (!f) return { valor: 0, memoria: 'Tabela sem faixas.' };
    if (f.fixo !== undefined) return { valor: f.fixo, memoria: `capital de ${reais(capital)} na classe de valor ${f.ate === null ? 'máximo' : 'mínimo'}: ${reais(f.fixo)}` };
    const v = Math.round(capital * f.aliquota / 100) + f.adicionar;
    return { valor: v, memoria: `${reais(capital)} × ${f.aliquota.toLocaleString('pt-BR')}%${f.adicionar ? ` + ${reais(f.adicionar)}` : ''} = ${reais(v)}` };
}

export interface ResultadoPatronal {
    situacao: 'sem-adesao' | 'dispensada' | 'devida' | 'erro';
    ano: number;
    vencimento: string;
    valor: number;
    /** O que vai para cada entidade (a da matriz e as das filiais). */
    guias: { estabelecimento: string; entidade: string; codigoSindical: string; capital: number; valor: number }[];
    atraso?: { dias: number; multa: number; juros: number; total: number };
    memoria: string[];
    avisos: string[];
    erros: string[];
}

const ultimoDiaUtilDeJaneiro = (ano: number) => {
    const d = new Date(Date.UTC(ano, 0, 31));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};
const meses = (de: string, ate: string) => {
    const [a1, m1, d1] = de.split('-').map(Number); const [a2, m2, d2] = ate.split('-').map(Number);
    return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
};

export interface EntradaPatronal {
    config: ConfigSindicalPatronal;
    ano: number;
    /** Regime da empresa (enquadramento): no Simples, dispensada. */
    simples: boolean;
    temEmpregados: boolean;
    /** Data do pagamento (para o atraso); vazio = no prazo. */
    pagamento?: string;
}

export function calcularSindicalPatronal(e: EntradaPatronal): ResultadoPatronal {
    const c = e.config;
    const vencimento = ultimoDiaUtilDeJaneiro(e.ano);
    const r: ResultadoPatronal = { situacao: 'devida', ano: e.ano, vencimento, valor: 0, guias: [], memoria: [], avisos: [], erros: [] };
    if (!c.aderiu) { r.situacao = 'sem-adesao'; r.memoria.push('A empresa não aderiu: desde a Lei 13.467/2017 a contribuição sindical patronal depende de autorização prévia e expressa (CLT, arts. 578, 579 e 587; STF, ADI 5794).'); return r; }
    if (e.simples) { r.situacao = 'dispensada'; r.memoria.push('Simples Nacional: microempresa e empresa de pequeno porte dispensadas da contribuição sindical patronal (LC 123/2006, art. 13, § 3º; STF, ADI 4033).'); return r; }
    if (!e.temEmpregados) r.avisos.push('Empresa sem empregados no cadastro: há entendimento do TST de que a contribuição patronal só é devida por quem é empregador. Confira antes de recolher.');
    const tabela = c.tabelaId === 'propria' ? { id: 'propria', nome: 'Tabela própria da confederação', ano: e.ano, faixas: c.faixasProprias, fonte: 'informada no cadastro' } : TABELAS_PATRONAIS.find(t => t.id === c.tabelaId);
    if (!tabela || !tabela.faixas.length) { r.situacao = 'erro'; r.erros.push('Escolha a tabela da confederação ou informe as faixas.'); return r; }
    if (tabela.ano !== e.ano && c.tabelaId !== 'propria') r.avisos.push(`Tabela de ${tabela.ano} usada para ${e.ano}: confira se a confederação já publicou a de ${e.ano} (o reajuste é anual).`);
    if (!(c.capitalSocial > 0)) r.erros.push('Informe o capital social.');
    if (!c.entidade.trim() || !c.codigoSindical.trim()) r.erros.push('Informe a entidade sindical e o código dela na guia (GRCSU).');
    if (c.cnpjEntidade && !cnpjValido(normalizarCnpj(c.cnpjEntidade))) r.erros.push('CNPJ da entidade sindical inválido.');
    const soma = c.filiais.reduce((s, f) => s + f.percentual, 0);
    if (soma >= 100) r.erros.push('A parte do capital das filiais tem de ser menor que 100% (o resto fica com a matriz).');
    c.filiais.forEach((f, i) => {
        if (!cnpjValido(normalizarCnpj(f.cnpj))) r.erros.push(`Filial ${i + 1}: CNPJ.`);
        if (!(f.percentual > 0)) r.erros.push(`Filial ${i + 1}: a parte do capital (%).`);
        if (!f.entidade.trim() || !f.codigoSindical.trim()) r.erros.push(`Filial ${i + 1}: a entidade sindical e o código dela.`);
    });
    if (r.erros.length) { r.situacao = 'erro'; return r; }
    r.memoria.push(`Tabela: ${tabela.nome} (${tabela.fonte}).`);
    // Capital da matriz e das filiais (art. 581), cada parte pela tabela.
    const partes = c.filiais.map(f => ({ ...f, capital: Math.round(c.capitalSocial * f.percentual / 100) }));
    const daMatriz = c.capitalSocial - partes.reduce((s, p) => s + p.capital, 0);
    const matriz = valorPelaTabela(daMatriz, tabela.faixas);
    r.guias.push({ estabelecimento: 'matriz', entidade: c.entidade.trim(), codigoSindical: c.codigoSindical.trim(), capital: daMatriz, valor: matriz.valor });
    r.memoria.push(`${c.filiais.length ? 'Matriz' : 'Capital social'}: ${matriz.memoria}.`);
    for (const p of partes) {
        const v = valorPelaTabela(p.capital, tabela.faixas);
        r.guias.push({ estabelecimento: normalizarCnpj(p.cnpj), entidade: p.entidade.trim(), codigoSindical: p.codigoSindical.trim(), capital: p.capital, valor: v.valor });
        r.memoria.push(`Filial ${p.cnpj} (${p.percentual.toLocaleString('pt-BR')}% do capital, CLT art. 581): ${v.memoria}.`);
    }
    r.valor = r.guias.reduce((s, g) => s + g.valor, 0);
    r.memoria.push(`Vencimento: ${vencimento.split('-').reverse().join('/')} (janeiro, CLT art. 587), na GRCSU da Caixa.`);
    // Atraso (art. 600): multa de 10% nos 30 primeiros dias e 2% por mês seguinte; juros de 1% ao mês.
    if (e.pagamento && e.pagamento > vencimento) {
        const dias = Math.round((Date.parse(`${e.pagamento}T00:00:00Z`) - Date.parse(`${vencimento}T00:00:00Z`)) / 86400000);
        const m = Math.max(0, meses(vencimento, e.pagamento));
        const pctMulta = 10 + (dias > 30 ? 2 * Math.max(1, m) : 0);
        const multa = Math.round(r.valor * pctMulta / 100);
        const juros = Math.round(r.valor * Math.max(1, m) / 100);
        r.atraso = { dias, multa, juros, total: r.valor + multa + juros };
        r.memoria.push(`Atraso de ${dias} dia(s): multa de ${pctMulta}% (${reais(multa)}) e juros de ${Math.max(1, m)}% (${reais(juros)}) — CLT, art. 600.`);
        r.avisos.push('A correção monetária do art. 600 não está no cálculo: confira o valor na emissão da guia.');
    }
    return r;
}
