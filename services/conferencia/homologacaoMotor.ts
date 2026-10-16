// services/conferencia/homologacaoMotor.ts
//
// Homologação do motor por empresa (o que ainda prende ao SAGE, item 1): o resultado da conferência motor × S-1200 do
// IOB fica gravado por competência (conferencias_motor/{empresa}_{AAAA-MM}), e a empresa sai da prévia com 3
// competências seguidas sem diferença. A ativação continua com o administrador; sem o critério, ela pede confirmação
// reforçada e fica registrada assim. Puro.

/** Resultado gravado da conferência de uma competência. */
export interface RegistroConferenciaMotor {
    empresaId: string;
    competencia: string;
    zerada: boolean;
    confere: number; diverge: number; pendentes: number;
    /** Arquivos conferidos (nomes), para a auditoria. */
    arquivos: string[];
    atualizadoPor: string; atualizadoPorEmail: string;
    atualizadoEm?: Date | null;
}
export interface SequenciaHomologacao { inicio: string; fim: string; meses: number }
export const MESES_HOMOLOGACAO = 3;

const proxima = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
const br = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;

/** Maior sequência de competências seguidas sem diferença entre as gravadas. */
export function sequenciaHomologacao(registros: Pick<RegistroConferenciaMotor, 'competencia' | 'zerada'>[]): SequenciaHomologacao {
    let melhor: SequenciaHomologacao = { inicio: '', fim: '', meses: 0 };
    let atual: SequenciaHomologacao = { inicio: '', fim: '', meses: 0 };
    for (const r of [...registros].sort((a, b) => a.competencia.localeCompare(b.competencia))) {
        if (!r.zerada) { atual = { inicio: '', fim: '', meses: 0 }; continue; }
        atual = atual.meses && proxima(atual.fim) === r.competencia ? { ...atual, fim: r.competencia, meses: atual.meses + 1 } : { inicio: r.competencia, fim: r.competencia, meses: 1 };
        if (atual.meses > melhor.meses) melhor = atual;
    }
    return melhor;
}

/** Uma linha para a faixa do cálculo e para a confirmação da ativação. */
export function textoHomologacao(registros: Pick<RegistroConferenciaMotor, 'competencia' | 'zerada'>[]): { atingido: boolean; texto: string } {
    if (!registros.length) return { atingido: false, texto: 'Nenhuma conferência com o eSocial do IOB gravada ainda (Conferir com o eSocial do IOB › Gravar o resultado).' };
    const s = sequenciaHomologacao(registros);
    const ultimas = [...registros].sort((a, b) => b.competencia.localeCompare(a.competencia)).slice(0, 6).map(r => `${br(r.competencia)} ${r.zerada ? 'sem diferença' : 'com diferença'}`).join('; ');
    const atingido = s.meses >= MESES_HOMOLOGACAO;
    return {
        atingido,
        texto: `${atingido ? 'Critério atingido' : `Critério ainda não atingido (${MESES_HOMOLOGACAO} competências seguidas sem diferença)`}: ${s.meses ? `maior sequência de ${s.meses} mês(es), de ${br(s.inicio)} a ${br(s.fim)}` : 'nenhuma competência sem diferença'}. Conferências gravadas: ${ultimas}.`,
    };
}
