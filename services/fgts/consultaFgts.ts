// services/fgts/consultaFgts.ts
//
// Consulta de FGTS (item 3 das sugestões), sempre da empresa ativa:
// - recolhimento mês a mês: o devido e o realizado no FGTS Digital, pelo SERPRO (certificado do escritório como
//   procurador ou o da empresa, no cofre), comparados com o FGTS da folha gravada no Consultor. A situação de cada
//   mês alimenta o popup de pendências (esocial_fgts), um registro por empresa e competência, sem duplicar;
// - extrato por funcionário: o FGTS de cada mês pela folha do Consultor e o declarado ao eSocial (S-5003), com a
//   diferença. O saldo da conta do trabalhador é dado da Caixa (app FGTS); o empregador vê só o "saldo para fins
//   rescisórios" no portal do FGTS Digital, por CPF — aqui fica a soma dos depósitos e a estimativa do contrato;
// - procuração do FGTS Digital (protocolo.gov.br): perfil e validade por empresa, com aviso de vencimento.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { FolhaGravada } from '../calculo/folhaGravada';
import type { S5003 } from '../conferencia/totalizadores';
import { diaUtilAnterior } from '../prazos/calendario';
import { saldoFgtsEstimado } from '../demissoes/previa';

const proximaCompetencia = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
export const competenciasAte = (ultima: string, n: number) => {
    const r: string[] = []; let [a, m] = ultima.split('-').map(Number);
    for (let i = 0; i < n; i++) { r.push(`${a}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; a--; } }
    return r;
};

/** Vencimento da guia mensal do FGTS Digital: dia 20 do mês seguinte, antecipado se não houver expediente bancário. */
export const vencimentoFgts = (competencia: string) => diaUtilAnterior(`${proximaCompetencia(competencia)}-20`);
/** Prazo da declaração (fechamento dos periódicos, S-1299): dia 15 do mês seguinte, antecipado. */
export const prazoDeclaracao = (competencia: string) => diaUtilAnterior(`${proximaCompetencia(competencia)}-15`);

export type SituacaoFgts = 'em_dia' | 'parcial' | 'atrasado' | 'a_vencer' | 'nao_declarado' | 'sem_movimento' | 'sem_consulta';
export const ROTULO_SITUACAO_FGTS: Record<SituacaoFgts, string> = {
    em_dia: 'Recolhido', parcial: 'Recolhido em parte', atrasado: 'Em aberto (vencido)', a_vencer: 'A vencer',
    nao_declarado: 'Folha sem declaração no eSocial', sem_movimento: 'Sem movimento', sem_consulta: 'Não consultado',
};

export interface MesFgts {
    competencia: string;
    vencimento: string;
    /** Devido e realizado no FGTS Digital (SERPRO), em centavos; nulos sem a consulta. */
    devido: number | null;
    realizado: number | null;
    /** FGTS da folha gravada no Consultor (soma dos holerites), em centavos; nulo sem folha gravada. */
    folha: number | null;
    situacao: SituacaoFgts;
    erro?: string;
}

const UM_CENTAVO = 1;
/** Situação do mês: o que o FGTS Digital diz (devido × realizado), o prazo e a folha do Consultor. */
export function situacaoDoMes(competencia: string, devido: number | null, realizado: number | null, folha: number | null, hoje: string): SituacaoFgts {
    if (devido === null || realizado === null) return 'sem_consulta';
    if (devido <= 0) {
        // A folha do Consultor tem FGTS e o eSocial não declarou nada: depois do prazo do fechamento, é pendência de envio.
        if ((folha ?? 0) > 0) return hoje > prazoDeclaracao(competencia) ? 'nao_declarado' : 'a_vencer';
        return 'sem_movimento';
    }
    if (realizado + UM_CENTAVO >= devido) return 'em_dia';
    if (hoje <= vencimentoFgts(competencia)) return 'a_vencer';
    return realizado > 0 ? 'parcial' : 'atrasado';
}

/** FGTS da folha gravada por competência (soma dos holerites com FGTS). */
export function fgtsDasFolhas(folhas: FolhaGravada[]): Map<string, number> {
    return new Map(folhas.map(f => [f.competencia, f.holerites.filter(h => h.situacao !== 'erro').reduce((s, h) => s + (h.fgts ?? 0), 0)]));
}

/**
 * O registro do popup de pendências (esocial_fgts) para o mês, ou nulo quando não há o que avisar nem o que
 * limpar. O id é fixo por empresa e competência: a consulta seguinte atualiza (o "em dia" apaga o aviso).
 */
export function registroDoPopup(empresaId: string, m: MesFgts): { id: string; dados: { empresaId: string; competencia: string; funcionarioNome: string; funcionarioCpf: string; valorDevido: number; valorRecolhido: number; status: 'em_dia' | 'parcial' | 'atrasado' | 'nao_declarado'; dataVencimento: string } } | null {
    const status = m.situacao === 'em_dia' || m.situacao === 'parcial' || m.situacao === 'atrasado' || m.situacao === 'nao_declarado' ? m.situacao : null;
    if (!status) return null;
    const devido = m.situacao === 'nao_declarado' ? (m.folha ?? 0) : (m.devido ?? 0);
    return { id: `serpro_${empresaId}_${m.competencia}`, dados: {
        empresaId, competencia: m.competencia, funcionarioNome: m.situacao === 'nao_declarado' ? 'FOLHA SEM DECLARAÇÃO NO eSOCIAL' : 'TOTAL EMPRESA (SERPRO)', funcionarioCpf: '',
        valorDevido: devido / 100, valorRecolhido: (m.realizado ?? 0) / 100, status, dataVencimento: m.vencimento,
    } };
}

// ─── Extrato por funcionário ─────────────────────────────────────────────────

export interface LinhaExtrato { competencia: string; baseFolha: number | null; fgtsFolha: number | null; declarado: number | null; diferenca: number | null }
export interface ExtratoFuncionario { fichaId: string; nome: string; cpf: string; linhas: LinhaExtrato[]; totalFolha: number; totalDeclarado: number; estimativaContrato: number }

/**
 * O FGTS de cada mês do funcionário: pela folha gravada no Consultor e pelo S-5003 (declarado ao eSocial, pela
 * matrícula; sem ela, pelo CPF), com a diferença quando os dois existem.
 */
export function extratoDoFuncionario(ficha: FichaFuncionario, competencias: string[], folhas: FolhaGravada[], s5003: S5003[], hoje: string): ExtratoFuncionario {
    const cpf = ficha.cpf.replace(/\D/g, '');
    const mat = ficha.matriculaEsocial.trim();
    const linhas: LinhaExtrato[] = [...competencias].sort().map(c => {
        const h = folhas.find(f => f.competencia === c)?.holerites.find(x => x.fichaId === ficha.id && x.situacao !== 'erro');
        const ev = s5003.filter(s => s.cpf === cpf && s.perApur === c && s.indApuracao !== '2');
        const itens = ev.flatMap(s => s.itens).filter(i => !mat || !i.matricula || i.matricula === mat);
        const declarado = ev.length ? itens.reduce((s, i) => s + i.deposito, 0) : null;
        const fgtsFolha = h ? h.fgts ?? 0 : null;
        return { competencia: c, baseFolha: h ? h.bases.fgts : null, fgtsFolha, declarado, diferenca: fgtsFolha !== null && declarado !== null ? fgtsFolha - declarado : null };
    });
    return {
        fichaId: ficha.id, nome: ficha.dados.nome || ficha.cpf, cpf, linhas,
        totalFolha: linhas.reduce((s, l) => s + (l.fgtsFolha ?? 0), 0),
        totalDeclarado: linhas.reduce((s, l) => s + (l.declarado ?? 0), 0),
        estimativaContrato: saldoFgtsEstimado(ficha, ficha.dados.dataDesligamento && ficha.dados.dataDesligamento < hoje ? ficha.dados.dataDesligamento : hoje),
    };
}

// ─── Procuração do FGTS Digital ──────────────────────────────────────────────

export interface ProcuracaoFgts { perfil: 'consulta' | 'edicao'; validaAte: string; observacao?: string }
export type SituacaoProcuracao = 'ausente' | 'vencida' | 'vencendo' | 'valida';
export function situacaoProcuracao(p: ProcuracaoFgts | undefined, hoje: string): { situacao: SituacaoProcuracao; texto: string } {
    if (!p?.validaAte) return { situacao: 'ausente', texto: 'Sem procuração do FGTS Digital registrada: o escritório só vê a empresa no portal com a procuração (protocolo.gov.br) ou com o certificado dela.' };
    const br = p.validaAte.split('-').reverse().join('/');
    if (p.validaAte < hoje) return { situacao: 'vencida', texto: `Procuração vencida em ${br}: peça a renovação ao cliente no protocolo.gov.br.` };
    const dias = Math.round((Date.parse(p.validaAte) - Date.parse(hoje)) / 86_400_000);
    const perfil = p.perfil === 'edicao' ? 'consulta e edição' : 'consulta';
    if (dias <= 30) return { situacao: 'vencendo', texto: `Procuração (${perfil}) vence em ${br} (${dias} dia(s)): peça a renovação.` };
    return { situacao: 'valida', texto: `Procuração (${perfil}) válida até ${br}.` };
}
