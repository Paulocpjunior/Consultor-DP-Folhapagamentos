// services/guias/avisoDarfReceita.ts
//
// Aviso de DARF vencido sem pagamento (Paulo, 12/10/2026): todo dia útil o CFI confere na Receita os DARF da DCTFWeb
// que o Consultor DP emitiu pelo túnel e grava a situação (sefaz-backend/dp-darf-nao-pago.js no CFI). Aqui a situação
// vira aviso no calendário da empresa, cruzada com a baixa já dada no DP:
//   - sem pagamento localizado depois da carência e sem baixa no DP → aviso para conferir com o cliente;
//   - pago na Receita e sem baixa no DP → aviso para dar a baixa ("Conferir na Receita");
//   - com baixa no DP, ou ainda aguardando → nada.
// "Não localizado" não é "não pago": o texto diz o que a Receita mostrou até a data da conferência. Puro.

import type { SituacaoDarfReceita } from '../serpro/serproIntegrationService';
import type { GuiaRegistrada } from './pagamentoGuias';

export interface AvisoDarfReceita { competencia: string; tipo: 'sem-pagamento' | 'pago-sem-baixa'; texto: string }

const br = (d: string | null) => (d ? d.split('-').reverse().join('/') : '?');
const mesAno = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const reais = (v: number | null) => (v === null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Id da obrigação do DARF da DCTFWeb da competência (services/prazos/obrigacoes.ts). */
export const obrigacaoDoDarf = (competencia: string) => `darf-${competencia}`;

/** Competências que pedem a leitura das guias do DP (para saber se já há baixa). */
export const competenciasParaCruzar = (s: SituacaoDarfReceita[]) =>
    [...new Set(s.filter(x => x.situacao !== 'aguardando').map(x => x.competencia))];

/** `guias`: as guias do DP por competência (id da obrigação → guia). */
export function avisosDarfReceita(situacoes: SituacaoDarfReceita[], guias: Map<string, Map<string, GuiaRegistrada>>): AvisoDarfReceita[] {
    const avisos: AvisoDarfReceita[] = [];
    for (const s of situacoes) {
        const baixa = guias.get(s.competencia)?.get(obrigacaoDoDarf(s.competencia))?.pagamento;
        if (baixa) continue;
        const valor = s.valor !== null ? ` de ${reais(s.valor)}` : '';
        if (s.situacao === 'nao_localizado') {
            avisos.push({
                competencia: s.competencia, tipo: 'sem-pagamento',
                texto: `DARF da DCTFWeb de ${mesAno(s.competencia)}${valor}, vencido em ${br(s.vencimento)}: sem pagamento localizado na Receita até ${br(s.conferidoEm)}. Confira com o cliente.${s.aviso ? ` ${s.aviso}` : ''}`,
            });
        } else if (s.situacao === 'pago' && s.pagamento) {
            const p = s.pagamento;
            avisos.push({
                competencia: s.competencia, tipo: 'pago-sem-baixa',
                texto: `A Receita registra o pagamento do DARF de ${mesAno(s.competencia)} em ${br(p.dataArrecadacao)}${p.valorTotal !== null ? ` (${reais(p.valorTotal)})` : ''}${p.outroDocumento ? `, com outro documento (${p.numeroDocumento ?? '?'})` : ''}: falta a baixa no DP ("Conferir na Receita" na competência ${mesAno(s.competencia)}).`,
            });
        }
    }
    return avisos.sort((a, b) => b.competencia.localeCompare(a.competencia));
}
