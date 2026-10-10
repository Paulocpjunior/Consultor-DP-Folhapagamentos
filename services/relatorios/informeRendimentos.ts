// services/relatorios/informeRendimentos.ts
//
// Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte (IN RFB 2.060/2021, Anexo I),
// o "informe de rendimentos" que o empregador entrega até o último dia útil de fevereiro.
//
// Fonte: os S-5002 (evtIrrfBenef) do ano-calendário, que o eSocial devolve por trabalhador e por mês de
// PAGAMENTO (regime de caixa), com os totais por código de receita, os isentos e as deduções do S-1210. Assim o
// informe cobre o ano inteiro — inclusive os meses transmitidos pelo IOB, férias, 13º e rescisões —, e não só
// as folhas calculadas no Consultor.

import type { ComplementoIrrf, S5002 } from '../conferencia/totalizadores';

export interface LinhaInforme { rotulo: string; valor: number }
export interface Informe {
    cpf: string; nome: string; ano: string;
    /** Quadro 3: rendimentos tributáveis, deduções e IRRF. */
    quadro3: LinhaInforme[];
    /** Quadro 4: rendimentos isentos e não tributáveis. */
    quadro4: LinhaInforme[];
    /** Quadro 5: rendimentos sujeitos à tributação exclusiva (rendimento líquido). */
    quadro5: LinhaInforme[];
    /** Quadro 7: informações complementares. */
    quadro7: string[];
    meses: string[];
    avisos: string[];
}

const somaCampos = (s: S5002[], f: (a: S5002['apuracoes'][number]) => number) => s.reduce((t, x) => t + x.apuracoes.reduce((u, a) => u + f(a), 0), 0);
const isento = (s: S5002[], ...campos: string[]) => somaCampos(s, a => campos.reduce((t, c) => t + (a.isentos?.[c] ?? 0), 0));
const ehPlr = (cr: string) => cr.startsWith('3562');
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const comp = (p: string) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;

/** Um S-5002 por trabalhador e mês: retificado, vale o de recibo mais recente (com aviso). */
export function s5002sValidos(lista: S5002[], ano: string, cnpj: string): { validos: S5002[]; avisos: string[] } {
    const raiz = cnpj.replace(/\D/g, '').slice(0, 8);
    const avisos: string[] = [];
    const porChave = new Map<string, S5002[]>();
    const vistos = new Set<string>();
    for (const s of lista) {
        if (!s.perApur.startsWith(`${ano}-`) || !s.cpf) continue;
        if (s.empregador && !s.empregador.replace(/\D/g, '').startsWith(raiz)) continue;
        if (s.id && vistos.has(s.id)) continue;
        if (s.id) vistos.add(s.id);
        const k = `${s.cpf}|${s.perApur}`;
        porChave.set(k, [...(porChave.get(k) ?? []), s]);
    }
    const validos: S5002[] = [];
    for (const [k, l] of porChave) {
        const ordenados = [...l].sort((a, b) => b.nrRecArqBase.localeCompare(a.nrRecArqBase, 'pt-BR', { numeric: true }));
        if (ordenados.length > 1) avisos.push(`CPF ${cpfFmt(k.split('|')[0])}, ${comp(k.split('|')[1])}: ${ordenados.length} S-5002 (retificação). Usado o do recibo ${ordenados[0].nrRecArqBase || '(sem recibo)'}; confira.`);
        validos.push(ordenados[0]);
    }
    return { validos, avisos };
}

function somaComplemento<K extends keyof ComplementoIrrf>(s: S5002[], k: K): ComplementoIrrf[K] {
    return s.flatMap(x => (x.complemento?.[k] ?? []) as unknown[]) as ComplementoIrrf[K];
}

/** Informe de cada trabalhador com S-5002 no ano. */
export function montarInformes(ano: string, lista: S5002[], cnpj: string, nomes: Map<string, string>): { informes: Informe[]; avisos: string[] } {
    const { validos, avisos } = s5002sValidos(lista, ano, cnpj);
    const porCpf = new Map<string, S5002[]>();
    for (const s of validos) porCpf.set(s.cpf, [...(porCpf.get(s.cpf) ?? []), s]);
    const informes: Informe[] = [];
    for (const [cpf, s] of porCpf) {
        const penAlim = somaComplemento(s, 'penAlim');
        const dedDepen = somaComplemento(s, 'dedDepen');
        const previd = somaComplemento(s, 'previdCompl');
        const plano = somaComplemento(s, 'planSaude');
        const deps = somaComplemento(s, 'dependentes');
        const pensao = (f: (tp: string) => boolean) => penAlim.filter(p => f(p.tpRend)).reduce((t, p) => t + p.valor, 0);
        const rendTrib = somaCampos(s, a => (ehPlr(a.crMen) ? 0 : a.rendTrib));
        const plr = somaCampos(s, a => (ehPlr(a.crMen) ? a.rendTrib : 0));
        const irrfPlr = somaCampos(s, a => (ehPlr(a.crMen) ? a.irrf : 0));
        const r13 = somaCampos(s, a => a.rendTrib13);
        const prev13 = somaCampos(s, a => a.prevOficial13);
        const dep13 = dedDepen.filter(d => d.tpRend === '12').reduce((t, d) => t + d.valor, 0);
        const pen13 = pensao(tp => tp === '12');
        const pc13 = previd.reduce((t, p) => t + p.valor13, 0);
        const liquido13 = Math.max(0, r13 - prev13 - dep13 - pen13 - pc13);
        const outrosIsentos: [string, number][] = ([['Abono pecuniário de férias', isento(s, 'vlrAbonoPec')], ['Auxílio-moradia', isento(s, 'vlrAuxMoradia')], ['Bolsa de médico residente', isento(s, 'vlrBolsaMedico', 'vlrBolsaMedico13')], ['Outros isentos', isento(s, 'vlrIsenOutros')]] as [string, number][]).filter(([, v]) => v > 0);

        const quadro7: string[] = [];
        for (const [cpfDep, valor] of agrupar(penAlim.map(p => [p.cpf, p.valor]))) quadro7.push(`Pensão alimentícia paga ao alimentando CPF ${cpfFmt(cpfDep)}: R$ ${brl(valor)}${penAlim.some(p => p.cpf === cpfDep && p.tpRend === '12') ? ' (inclui a do 13º salário)' : ''}.`);
        for (const [cnpjPc, valor] of agrupar(previd.map(p => [p.cnpj, p.valor + p.valor13]))) quadro7.push(`Previdência complementar (entidade CNPJ ${cnpjFmt(cnpjPc)}): R$ ${brl(valor)}.`);
        for (const [cnpjOp, tit] of agrupar(plano.map(p => [`${p.cnpj}|${p.regANS}`, p.titular]))) {
            const [c, ans] = cnpjOp.split('|');
            const dDeps = agrupar(plano.filter(p => `${p.cnpj}|${p.regANS}` === cnpjOp).flatMap(p => p.dependentes.map(d => [d.cpf, d.valor] as [string, number])));
            quadro7.push(`Plano de saúde (operadora CNPJ ${cnpjFmt(c)}${ans ? `, ANS ${ans}` : ''}): titular R$ ${brl(tit)}${dDeps.length ? `; ${dDeps.map(([cp, v]) => `dependente CPF ${cpfFmt(cp)} R$ ${brl(v)}`).join('; ')}` : ''}.`);
        }
        if (r13) quadro7.push(`13º salário: bruto R$ ${brl(r13)} − previdência oficial R$ ${brl(prev13)}${dep13 ? ` − dependentes R$ ${brl(dep13)}` : ''}${pen13 ? ` − pensão R$ ${brl(pen13)}` : ''}${pc13 ? ` − previdência complementar R$ ${brl(pc13)}` : ''} = líquido R$ ${brl(liquido13)} (quadro 5, linha 1).`);
        if (plr) quadro7.push(`Participação nos lucros ou resultados: R$ ${brl(plr)}, IRRF R$ ${brl(irrfPlr)} (quadro 5, linha 3, pelo líquido).`);
        for (const [rot, v] of outrosIsentos) quadro7.push(`Rendimentos isentos — ${rot}: R$ ${brl(v)} (quadro 4, outros).`);
        const depsUnicos = [...new Map(deps.map(d => [d.cpf, d])).values()];
        if (depsUnicos.length) quadro7.push(`Dependentes informados no eSocial: ${depsUnicos.map(d => `${d.nome || 'sem nome'} (CPF ${cpfFmt(d.cpf)})`).join('; ')}.`);

        const meses = [...new Set(s.map(x => x.perApur))].sort();
        const avisosCpf: string[] = [];
        if (meses.length < 12) avisosCpf.push(`S-5002 de ${meses.length} mês(es): ${meses.map(comp).join(', ')}. Confira se faltam meses com pagamento.`);
        informes.push({
            cpf, nome: nomes.get(cpf) ?? '', ano, meses, avisos: avisosCpf, quadro7,
            quadro3: [
                { rotulo: 'Total dos rendimentos (inclusive férias)', valor: rendTrib },
                { rotulo: 'Contribuição previdenciária oficial', valor: somaCampos(s, a => a.prevOficial) },
                { rotulo: 'Contribuições a entidades de previdência complementar, pública ou privada, e a fundos de aposentadoria programada individual (Fapi) (preencher também o quadro 7)', valor: previd.reduce((t, p) => t + p.valor, 0) },
                { rotulo: 'Pensão alimentícia (preencher também o quadro 7)', valor: pensao(tp => tp !== '12' && tp !== '14') },
                { rotulo: 'Imposto sobre a renda retido na fonte', valor: somaCampos(s, a => (ehPlr(a.crMen) ? 0 : a.irrf)) },
            ],
            quadro4: [
                { rotulo: 'Parcela isenta dos proventos de aposentadoria, reserva remunerada, reforma e pensão (65 anos ou mais), exceto a parcela isenta do 13º salário', valor: isento(s, 'vlrParcIsenta65') },
                { rotulo: 'Parcela isenta do 13º salário de aposentadoria, reserva remunerada, reforma e pensão (65 anos ou mais)', valor: isento(s, 'vlrParcIsenta65Dec') },
                { rotulo: 'Diárias e ajudas de custo', valor: isento(s, 'vlrDiarias', 'vlrAjudaCusto') },
                { rotulo: 'Pensão e proventos de aposentadoria ou reforma por moléstia grave; proventos de aposentadoria ou reforma por acidente em serviço', valor: isento(s, 'vlrRendMoleGrave', 'vlrRendMoleGrave13') },
                { rotulo: 'Lucros e dividendos, apurados a partir de 1996, pagos por pessoa jurídica (lucro real, presumido ou arbitrado)', valor: 0 },
                { rotulo: 'Valores pagos ao titular ou sócio da microempresa ou empresa de pequeno porte, exceto pró-labore, aluguéis ou serviços prestados', valor: 0 },
                { rotulo: 'Indenizações por rescisão de contrato de trabalho, inclusive a título de PDV, e por acidente de trabalho', valor: isento(s, 'vlrIndResContrato') },
                { rotulo: 'Juros de mora recebidos, devidos pelo atraso no pagamento de remuneração por exercício de emprego, cargo ou função', valor: isento(s, 'vlrJurosMora') },
                { rotulo: 'Outros (especificar no quadro 7)', valor: outrosIsentos.reduce((t, [, v]) => t + v, 0) },
            ],
            quadro5: [
                { rotulo: 'Décimo terceiro salário', valor: liquido13 },
                { rotulo: 'Imposto sobre a renda retido na fonte sobre 13º salário', valor: somaCampos(s, a => a.irrf13) },
                { rotulo: 'Outros (participação nos lucros ou resultados, pelo líquido)', valor: Math.max(0, plr - irrfPlr - pensao(tp => tp === '14')) },
            ],
        });
    }
    return { informes: informes.sort((a, b) => (a.nome || a.cpf).localeCompare(b.nome || b.cpf, 'pt-BR')), avisos };
}

function agrupar(l: [string, number][]): [string, number][] {
    const m = new Map<string, number>();
    for (const [k, v] of l) m.set(k, (m.get(k) ?? 0) + v);
    return [...m].filter(([, v]) => v > 0);
}
