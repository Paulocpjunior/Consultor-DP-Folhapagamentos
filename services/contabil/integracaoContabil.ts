// services/contabil/integracaoContabil.ts
//
// Integração contábil da folha (a "Integração Contábil › Exportação" do SAGE): o lote de lançamentos da competência em
// partidas dobradas, a partir da folha gravada do mês, com as contas do plano de contas do cliente por verba e por
// encargo e o centro de custo pelo departamento do funcionário. Regime de competência:
// - proventos: D despesa (a conta da verba ou a de salários) / C salários a pagar;
// - descontos: D salários a pagar / C a conta da verba (INSS, IRRF, adiantamento, pensão…);
// - salário-família e salário-maternidade pagos: D INSS a recolher (compensados na DCTFWeb) / C salários a pagar;
// - FGTS do mês: D despesa de FGTS / C FGTS a recolher (por funcionário);
// - INSS patronal, RAT e terceiros: D despesa de INSS / C INSS a recolher, rateados pela base do INSS de cada um;
// - provisões de férias e 13º (opcional): a constituição (D despesa / C provisão, encargos em contas próprias) e a
//   baixa pelo que foi pago (D provisão / C despesa).
// O saldo de salários a pagar é o líquido da folha. Puro, sem Firebase.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Departamento } from '../departamentos/departamentos';
import { departamentoDa } from '../departamentos/departamentos';
import type { Provisao } from '../calculo/provisoes';
import type { ResumoFolha } from '../relatorios/resumoFolha';
import { repartir } from '../obras/folhaPorObra';

/** Contas fixas do lote (as das verbas vão como `V:<código>`). */
export const CONTAS_FIXAS: { chave: string; rotulo: string; grupo: 'folha' | 'encargos' | 'provisoes' }[] = [
    { chave: 'SALARIOS_A_PAGAR', rotulo: 'Salários a pagar (passivo; contrapartida de proventos e descontos)', grupo: 'folha' },
    { chave: 'DESP_SALARIOS', rotulo: 'Despesa de salários (proventos sem conta própria)', grupo: 'folha' },
    { chave: 'OUTROS_DESCONTOS', rotulo: 'Outros descontos (descontos sem conta própria)', grupo: 'folha' },
    { chave: 'INSS_A_RECOLHER', rotulo: 'INSS a recolher (passivo)', grupo: 'encargos' },
    { chave: 'IRRF_A_RECOLHER', rotulo: 'IRRF a recolher (passivo)', grupo: 'encargos' },
    { chave: 'FGTS_A_RECOLHER', rotulo: 'FGTS a recolher (passivo)', grupo: 'encargos' },
    { chave: 'DESP_INSS', rotulo: 'Despesa de INSS (patronal, RAT e terceiros)', grupo: 'encargos' },
    { chave: 'DESP_FGTS', rotulo: 'Despesa de FGTS', grupo: 'encargos' },
    { chave: 'DESP_PROV_FERIAS', rotulo: 'Despesa com provisão de férias', grupo: 'provisoes' },
    { chave: 'PROV_FERIAS', rotulo: 'Provisão de férias e 1/3 (passivo)', grupo: 'provisoes' },
    { chave: 'PROV_FERIAS_INSS', rotulo: 'INSS sobre a provisão de férias (passivo)', grupo: 'provisoes' },
    { chave: 'PROV_FERIAS_FGTS', rotulo: 'FGTS sobre a provisão de férias (passivo)', grupo: 'provisoes' },
    { chave: 'DESP_PROV_13', rotulo: 'Despesa com provisão de 13º', grupo: 'provisoes' },
    { chave: 'PROV_13', rotulo: 'Provisão de 13º salário (passivo)', grupo: 'provisoes' },
    { chave: 'PROV_13_INSS', rotulo: 'INSS sobre a provisão de 13º (passivo)', grupo: 'provisoes' },
    { chave: 'PROV_13_FGTS', rotulo: 'FGTS sobre a provisão de 13º (passivo)', grupo: 'provisoes' },
];

export interface ConfigContabil {
    empresaId: string;
    /** Chave (fixa ou `V:<verba>`) → código da conta no plano de contas do cliente. */
    contas: Record<string, string>;
    /** Lançamentos por centro de custo (o do departamento do funcionário). */
    porCentroCusto: boolean;
    atualizadoPorEmail?: string;
}
export const configVazia = (empresaId: string): ConfigContabil => ({ empresaId, contas: {}, porCentroCusto: true });

export interface LancamentoContabil { data: string; debito: string; credito: string; valor: number; historico: string; centroCusto: string }

/** Chave da verba no plano: o código sem o período (férias vencidas por período) e o lançamento avulso pela descrição. */
export const chaveDaVerba = (v: { codigo: string; descricao: string }) =>
    `V:${/^LAN\d+$/.test(v.codigo) ? `LAN:${v.descricao.trim().toUpperCase()}` : v.codigo.replace(/\d{4}-\d{2}-\d{2}$/, '')}`;

/** Conta padrão da verba quando não há conta própria: os tributos retidos e as compensações do INSS. */
function contaPadraoDaVerba(codigo: string, tipo: 'provento' | 'desconto'): string {
    if (/^INSS/.test(codigo)) return 'INSS_A_RECOLHER';
    if (/^IRRF/.test(codigo)) return 'IRRF_A_RECOLHER';
    if (codigo === 'SF' || codigo === 'MAT' || codigo === 'MATPRORR') return 'INSS_A_RECOLHER';
    return tipo === 'provento' ? 'DESP_SALARIOS' : 'OUTROS_DESCONTOS';
}

export interface EntradaLote {
    competencia: string;
    /** Holerites da folha gravada (os com erro ficam de fora). */
    resultados: ResultadoCalculo[];
    fichas: FichaFuncionario[];
    departamentos: Departamento[];
    config: ConfigContabil;
    /** Resumo da folha (resumirFolha), para a parte patronal. */
    resumo?: ResumoFolha;
    provisao?: Provisao | null;
}

export interface LoteContabil { lancamentos: LancamentoContabil[]; pendencias: string[]; avisos: string[]; total: number; data: string }

const ultimoDia = (comp: string) => { const [a, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const br = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

export function gerarLoteContabil(e: EntradaLote): LoteContabil {
    const data = ultimoDia(e.competencia);
    const pendencias = new Set<string>(); const avisos = new Set<string>();
    const brutos: LancamentoContabil[] = [];
    const conta = (chave: string, rotulo: string) => {
        const c = (e.config.contas[chave] ?? '').trim();
        if (!c) pendencias.add(`Sem conta para ${rotulo}.`);
        return c || `?${chave}`;
    };
    const rotuloFixa = (k: string) => CONTAS_FIXAS.find(x => x.chave === k)?.rotulo ?? k;
    const fixa = (k: string) => conta(k, rotuloFixa(k));
    const porFicha = new Map(e.fichas.map(f => [f.id, f]));
    const deptos = new Map(e.departamentos.map(d => [d.codigo.trim(), d]));
    const ccDe = (fichaId: string) => {
        if (!e.config.porCentroCusto) return '';
        const f = porFicha.get(fichaId);
        const cod = f ? departamentoDa(f) : '';
        const d = deptos.get(cod);
        if (cod && !d?.centroCusto.trim()) avisos.add(`Departamento ${cod} sem centro de custo no cadastro: lançado sem centro de custo.`);
        return d?.centroCusto.trim() ?? '';
    };
    const lanca = (debito: string, credito: string, valor: number, historico: string, cc: string) => { if (valor > 0) brutos.push({ data, debito, credito, valor, historico, centroCusto: cc }); };
    const hist = `Folha de pagamento ${br(e.competencia)}`;

    const validos = e.resultados.filter(r => r.situacao !== 'erro');
    if (validos.length < e.resultados.length) avisos.add(`${e.resultados.length - validos.length} holerite(s) com erro fora do lote.`);
    const salariosAPagar = fixa('SALARIOS_A_PAGAR');
    for (const r of validos) {
        const cc = ccDe(r.fichaId);
        for (const v of r.verbas) {
            if (!(v.valor > 0)) continue;
            const chave = chaveDaVerba(v);
            const propria = (e.config.contas[chave] ?? '').trim();
            const padrao = contaPadraoDaVerba(v.codigo, v.tipo);
            const c = propria || fixa(padrao);
            if (!propria && (padrao === 'DESP_SALARIOS' || padrao === 'OUTROS_DESCONTOS')) avisos.add(`Verba ${chave.slice(2)} (${v.descricao}) sem conta própria: vai na conta de ${padrao === 'DESP_SALARIOS' ? 'despesa de salários' : 'outros descontos'}.`);
            if (v.tipo === 'provento') lanca(c, salariosAPagar, v.valor, `${hist} – ${v.descricao}`, cc);
            else lanca(salariosAPagar, c, v.valor, `${hist} – ${v.descricao}`, cc);
        }
        if (r.fgts > 0) lanca(fixa('DESP_FGTS'), fixa('FGTS_A_RECOLHER'), r.fgts, `${hist} – FGTS`, cc);
    }
    // Parte patronal (patronal + RAT + terceiros), rateada pela base do INSS de cada funcionário.
    const pat = e.resumo?.encargos.patronal;
    if (pat) {
        const total = pat.patronal + pat.rat + pat.terceiros;
        const pesos = validos.map(r => r.bases.inss);
        if (total > 0 && pesos.some(p => p > 0)) {
            const partes = repartir(total, pesos);
            validos.forEach((r, i) => lanca(fixa('DESP_INSS'), fixa('INSS_A_RECOLHER'), partes[i], `${hist} – INSS patronal, RAT e terceiros`, ccDe(r.fichaId)));
        }
    } else if (e.resumo) avisos.add('Sem enquadramento previdenciário vigente: a parte patronal (INSS, RAT e terceiros) ficou fora do lote.');
    // Provisões: constituição e baixa do mês, por funcionário.
    if (e.provisao) {
        const hp = `Provisões ${br(e.competencia)}`;
        for (const l of e.provisao.linhas) {
            if (l.erro) { avisos.add(`Provisão de ${l.nome}: ${l.erro}`); continue; }
            const cc = ccDe(l.fichaId);
            for (const [m, desp, prov, ins, fg, nome] of [[l.ferias, 'DESP_PROV_FERIAS', 'PROV_FERIAS', 'PROV_FERIAS_INSS', 'PROV_FERIAS_FGTS', 'férias'], [l.decimo, 'DESP_PROV_13', 'PROV_13', 'PROV_13_INSS', 'PROV_13_FGTS', '13º']] as const) {
                lanca(fixa(desp), fixa(prov), m.constituicao.principal, `${hp} – constituição da provisão de ${nome}`, cc);
                lanca(fixa(desp), fixa(ins), m.constituicao.inss, `${hp} – INSS sobre a provisão de ${nome}`, cc);
                lanca(fixa(desp), fixa(fg), m.constituicao.fgts, `${hp} – FGTS sobre a provisão de ${nome}`, cc);
                lanca(fixa(prov), fixa(desp), m.baixa.principal, `${hp} – baixa da provisão de ${nome} (pago no mês)`, cc);
                lanca(fixa(ins), fixa(desp), m.baixa.inss, `${hp} – baixa do INSS da provisão de ${nome}`, cc);
                lanca(fixa(fg), fixa(desp), m.baixa.fgts, `${hp} – baixa do FGTS da provisão de ${nome}`, cc);
            }
        }
    }
    // Um lançamento por débito, crédito, centro de custo e histórico.
    const soma = new Map<string, LancamentoContabil>();
    for (const l of brutos) {
        const k = [l.debito, l.credito, l.centroCusto, l.historico].join('|');
        const x = soma.get(k);
        if (x) x.valor += l.valor; else soma.set(k, { ...l });
    }
    const lancamentos = [...soma.values()].sort((a, b) => a.centroCusto.localeCompare(b.centroCusto) || a.historico.localeCompare(b.historico) || a.debito.localeCompare(b.debito));
    return { lancamentos, pendencias: [...pendencias], avisos: [...avisos], total: lancamentos.reduce((s, l) => s + l.valor, 0), data };
}

/** Verbas da folha que ainda não têm conta própria (para a tela do plano). */
export function verbasDoLote(resultados: ResultadoCalculo[]): { chave: string; descricao: string; tipo: 'provento' | 'desconto' }[] {
    const m = new Map<string, { chave: string; descricao: string; tipo: 'provento' | 'desconto' }>();
    for (const r of resultados) for (const v of r.verbas) { const chave = chaveDaVerba(v); if (!m.has(chave)) m.set(chave, { chave, descricao: v.descricao, tipo: v.tipo }); }
    return [...m.values()].sort((a, b) => (a.tipo === b.tipo ? a.chave.localeCompare(b.chave) : a.tipo === 'provento' ? -1 : 1));
}

/** Saldo de salários a pagar no lote (deve ser o líquido da folha): créditos − débitos na conta. */
export function saldoDaConta(lote: LoteContabil, conta: string): number {
    return lote.lancamentos.reduce((s, l) => s + (l.credito === conta ? l.valor : 0) - (l.debito === conta ? l.valor : 0), 0);
}

const brData = (d: string) => d.split('-').reverse().join('/');
const brValor = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** Arquivo do lote: texto separado por ponto e vírgula, com cabeçalho (data dd/mm/aaaa, valor com vírgula). */
export function loteCsv(lote: LoteContabil): string {
    const linha = (xs: string[]) => xs.map(x => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(';');
    return [linha(['Data', 'Conta débito', 'Conta crédito', 'Valor', 'Histórico', 'Centro de custo']),
        ...lote.lancamentos.map(l => linha([brData(l.data), l.debito, l.credito, brValor(l.valor), l.historico, l.centroCusto]))].join('\r\n') + '\r\n';
}
