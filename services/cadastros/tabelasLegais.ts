// services/cadastros/tabelasLegais.ts
//
// Tabelas legais com vigência (Cadastros › Genéricos › Tabelas Legais do SGC):
// INSS do segurado, IRRF mensal, salário mínimo e salário-família.
//
// Nenhum valor vem pré-carregado: quem cadastra digita a tabela da norma
// oficial e informa a norma (portaria, lei, IN). Sem norma não grava. A tabela
// que vale numa competência é a de maior vigência até ela; duas tabelas do
// mesmo tipo com a mesma vigência é erro, nunca escolha silenciosa.
// O redutor mensal do IRRF (Lei 15.270/2025, a partir de 01/2026) fica na
// tabela do IRRF, como campos opcionais: tabela anterior a 2026 não tem.
// O cálculo em si fica no motor (services/calculo).

export type TipoTabela = 'inss' | 'irrf' | 'salario_minimo' | 'salario_familia';
export type ChaveValor = 'deducaoDependente' | 'descontoSimplificado' | 'salarioMinimo' | 'cotaSalarioFamilia' | 'limiteSalarioFamilia'
    | 'redutorAte' | 'redutorMaximo' | 'redutorLimite' | 'redutorConstante' | 'redutorCoeficiente';

/** Valores em centavos; alíquota em percentual (7,5% = 7.5). `ate` nulo = "acima de" (só na última faixa do IRRF). */
export interface Faixa { ate: number | null; aliquota: number; deducao: number }

export interface TabelaLegal {
    id: string;
    tipo: TipoTabela;
    vigencia: string; // AAAA-MM
    faixas: Faixa[];
    valores: Partial<Record<ChaveValor, number>>;
    norma: string;
    observacao: string;
}

/**
 * Valores em centavos, menos o formato 'coeficiente', guardado em milionésimos
 * (0,133145 → 133145) para continuar inteiro. `grupo`: os campos opcionais do
 * mesmo grupo vêm todos ou nenhum.
 */
export interface DefValor { chave: ChaveValor; rotulo: string; formato?: 'reais' | 'coeficiente'; grupo?: string }
export interface DefTabela { titulo: string; faixas: false | { deducao: boolean; ultimaAberta: boolean }; valores: DefValor[] }

export const DEF_TABELAS: Record<TipoTabela, DefTabela> = {
    inss: { titulo: 'INSS do segurado (progressiva)', faixas: { deducao: false, ultimaAberta: false }, valores: [] },
    irrf: {
        titulo: 'IRRF mensal', faixas: { deducao: true, ultimaAberta: true },
        valores: [
            { chave: 'deducaoDependente', rotulo: 'Dedução por dependente' }, { chave: 'descontoSimplificado', rotulo: 'Desconto simplificado mensal' },
            { chave: 'redutorAte', rotulo: 'Redutor: rendimentos até (redução total)', grupo: 'redutor' },
            { chave: 'redutorMaximo', rotulo: 'Redutor: redução máxima nessa faixa', grupo: 'redutor' },
            { chave: 'redutorLimite', rotulo: 'Redutor: rendimentos até (redução parcial)', grupo: 'redutor' },
            { chave: 'redutorConstante', rotulo: 'Redutor parcial: parcela fixa', grupo: 'redutor' },
            { chave: 'redutorCoeficiente', rotulo: 'Redutor parcial: coeficiente sobre os rendimentos', formato: 'coeficiente', grupo: 'redutor' },
        ],
    },
    salario_minimo: { titulo: 'Salário mínimo nacional', faixas: false, valores: [{ chave: 'salarioMinimo', rotulo: 'Salário mínimo mensal' }] },
    salario_familia: {
        titulo: 'Salário-família', faixas: false,
        valores: [{ chave: 'cotaSalarioFamilia', rotulo: 'Valor da cota por filho' }, { chave: 'limiteSalarioFamilia', rotulo: 'Remuneração máxima para ter direito' }],
    },
};

export const TIPOS_TABELA = Object.keys(DEF_TABELAS) as TipoTabela[];

export function tabelaVazia(tipo: TipoTabela): TabelaLegal {
    const def = DEF_TABELAS[tipo];
    return { id: '', tipo, vigencia: '', faixas: def.faixas ? [{ ate: null, aliquota: 0, deducao: 0 }] : [], valores: {}, norma: '', observacao: '' };
}

const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c);

export function validarTabela(t: TabelaLegal, existentes: TabelaLegal[] = []): string[] {
    const erros: string[] = [];
    const def = DEF_TABELAS[t.tipo];
    if (!def) return ['Tipo de tabela desconhecido.'];
    if (!competenciaValida(t.vigencia)) erros.push('Vigência deve ser um mês no formato AAAA-MM.');
    if (t.norma.trim().length < 5) erros.push('Informe a norma de onde saíram os valores (ex.: portaria, lei, instrução normativa).');
    if (existentes.some(e => e.id !== t.id && e.tipo === t.tipo && e.vigencia === t.vigencia)) erros.push('Já existe uma tabela deste tipo com esta vigência.');
    const cfg = def.faixas;
    if (cfg) {
        if (!t.faixas.length) erros.push('Informe as faixas.');
        let anterior = -1;
        t.faixas.forEach((f, i) => {
            const n = `Faixa ${i + 1}`;
            const ultima = i === t.faixas.length - 1;
            if (f.ate === null) {
                if (!ultima) erros.push(`${n}: informe o limite; só a última faixa pode ficar sem limite.`);
                else if (!cfg.ultimaAberta) erros.push(`${n}: informe o teto.`);
            } else if (!Number.isInteger(f.ate) || f.ate <= anterior) erros.push(`${n}: limite deve ser maior que o da faixa anterior.`);
            else anterior = f.ate;
            if (!(f.aliquota >= 0 && f.aliquota <= 100)) erros.push(`${n}: alíquota entre 0 e 100.`);
            if (!Number.isInteger(f.deducao) || f.deducao < 0) erros.push(`${n}: parcela a deduzir inválida.`);
            if (t.tipo === 'inss' && f.aliquota === 0) erros.push(`${n}: alíquota do INSS não pode ser zero.`);
        });
    }
    const grupoUsado = (g?: string) => !!g && def.valores.some(v => v.grupo === g && t.valores[v.chave] !== undefined);
    for (const v of def.valores) {
        const x = t.valores[v.chave];
        if (v.grupo && !grupoUsado(v.grupo)) continue;
        if (x === undefined || !Number.isInteger(x) || x <= 0) erros.push(`Informe ${v.rotulo.toLowerCase()}${v.grupo ? ' (o redutor vai completo ou fica em branco)' : ''}.`);
        else if (v.formato === 'coeficiente' && x >= 1_000_000) erros.push(`${v.rotulo}: deve ser menor que 1.`);
    }
    const r = t.valores;
    if (grupoUsado('redutor') && r.redutorAte && r.redutorLimite && r.redutorLimite <= r.redutorAte)
        erros.push('Redutor: o limite da redução parcial deve ser maior que o da redução total.');
    return erros;
}

export type ResultadoVigencia = { tabela: TabelaLegal } | { erro: string };

/** Tabela que vale na competência: a de maior vigência até ela. */
export function tabelaVigente(tabelas: TabelaLegal[], tipo: TipoTabela, competencia: string): ResultadoVigencia {
    if (!competenciaValida(competencia)) return { erro: 'Competência inválida.' };
    const candidatas = tabelas.filter(t => t.tipo === tipo && t.vigencia <= competencia);
    if (!candidatas.length) return { erro: `Nenhuma tabela de ${DEF_TABELAS[tipo].titulo} vigente em ${rotuloCompetencia(competencia)}.` };
    const maior = candidatas.reduce((m, t) => (t.vigencia > m ? t.vigencia : m), '');
    const mesma = candidatas.filter(t => t.vigencia === maior);
    if (mesma.length > 1) return { erro: `Duas tabelas de ${DEF_TABELAS[tipo].titulo} com vigência ${rotuloCompetencia(maior)}: corrija antes de usar.` };
    return { tabela: mesma[0] };
}

/**
 * Contribuição do segurado pela tabela progressiva, faixa a faixa, com base
 * limitada ao teto. Serve para conferir a tabela digitada contra o valor
 * máximo publicado na portaria; não é o cálculo da folha.
 */
export function inssProgressivo(baseCentavos: number, t: TabelaLegal): number {
    let total = 0; let piso = 0;
    for (const f of t.faixas) {
        if (f.ate === null) break;
        const parte = Math.min(baseCentavos, f.ate) - piso;
        if (parte <= 0) break;
        total += parte * f.aliquota / 100;
        piso = f.ate;
    }
    return Math.round(total);
}

export const tetoInss = (t: TabelaLegal) => t.faixas[t.faixas.length - 1]?.ate ?? null;

export const rotuloCompetencia = (c: string) => (competenciaValida(c) ? `${c.slice(5)}/${c.slice(0, 4)}` : c);

/** Coeficiente guardado em milionésimos → texto "0,133145". */
export const textoCoeficiente = (n: number) => (n / 1_000_000).toFixed(6).replace('.', ',');
/** "0,133145" → 133145; null se não for número entre 0 e 1. */
export function coeficienteDeTexto(t: string): number | null {
    const v = t.trim().replace(',', '.');
    if (!/^0?\.\d{1,6}$/.test(v)) return null;
    return Math.round(Number(v) * 1_000_000);
}
