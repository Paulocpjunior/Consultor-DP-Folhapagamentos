// services/guias/pagamentoGuiasService.ts
//
// Baixa das guias da folha (services/guias/pagamentoGuias.ts):
//   pagamentos_guias/{empresaId}_{obrigação-AAAA-MM}
//   { empresaId, obrigacao, competencia, nome, vencimento, valorDevido, numeroDocumento, pagamento, atualizadoPor, ... }
// A baixa marca a obrigação como entregue no calendário (obrigacoes_status) no mesmo lote, com o registro em
// cadastro_audit; desfazer volta as duas. A competência encerrada no Fim de mês não trava a baixa: a guia vence depois.

import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch, type Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { auditar, type Usuario } from '../cadastros/cadastrosService';
import { idMarcacao } from '../prazos/obrigacoesEmpresa';
import { idPagamento, observacaoDaBaixa, type BaixaGuia, type GuiaRegistrada } from './pagamentoGuias';

const COL = 'pagamentos_guias';
type Obrigacao = { id: string; nome: string; data: string };
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Guias registradas da empresa na competência de trabalho, pelo id da obrigação. */
export async function listarGuias(empresaId: string, competencia: string): Promise<Map<string, GuiaRegistrada>> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), where('competencia', '==', competencia)));
    return new Map(s.docs.map(d => {
        const x = d.data();
        const em = (x.atualizadoEm as Timestamp | null)?.toDate?.();
        return [x.obrigacao as string, {
            obrigacao: x.obrigacao, competencia: x.competencia, nome: x.nome, vencimento: x.vencimento, valorDevido: x.valorDevido ?? 0, numeroDocumento: x.numeroDocumento ?? '',
            pagamento: x.pagamento ?? null, atualizadoPorEmail: x.atualizadoPorEmail, atualizadoEm: em ? em.toISOString() : undefined,
        } as GuiaRegistrada];
    }));
}

function base(empresaId: string, competencia: string, o: Obrigacao, dados: { valorDevido: number; numeroDocumento: string }, u: Usuario) {
    return {
        empresaId, obrigacao: o.id, competencia, nome: o.nome, vencimento: o.data,
        valorDevido: Math.max(0, Math.round(dados.valorDevido) || 0), numeroDocumento: dados.numeroDocumento.trim().slice(0, 60),
        atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    };
}

/** Guia emitida (ex.: o DARF da DCTFWeb): grava o valor devido e o documento, sem mexer na baixa. */
export async function registrarGuiaEmitida(empresaId: string, competencia: string, o: Obrigacao, dados: { valorDevido: number; numeroDocumento: string }, u: Usuario): Promise<void> {
    const id = idPagamento(empresaId, o.id);
    const lote = writeBatch(db);
    lote.set(doc(db, COL, id), base(empresaId, competencia, o, dados, u), { merge: true });
    auditar(lote, u, COL, id, 'editar', [{ campo: o.nome, de: '', para: `emitida: ${reais(dados.valorDevido)}${dados.numeroDocumento ? ` · documento ${dados.numeroDocumento}` : ''}` }] as never, { empresaId });
    await lote.commit();
}

/** Dá baixa na guia e marca a obrigação como entregue no calendário. */
export async function darBaixa(empresaId: string, competencia: string, o: Obrigacao, dados: { valorDevido: number; numeroDocumento: string }, b: BaixaGuia, u: Usuario): Promise<void> {
    const id = idPagamento(empresaId, o.id);
    const obs = observacaoDaBaixa(b).slice(0, 500);
    const lote = writeBatch(db);
    lote.set(doc(db, COL, id), { ...base(empresaId, competencia, o, dados, u), pagamento: { data: b.data, valorPago: b.valorPago, autenticacao: b.autenticacao.trim().slice(0, 80), fonte: b.fonte } }, { merge: true });
    lote.set(doc(db, 'obrigacoes_status', idMarcacao(empresaId, o.id)), {
        empresaId, obrigacao: o.id, competencia, nome: o.nome, vencimento: o.data, status: 'entregue', observacao: obs,
        atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    }, { merge: true });
    auditar(lote, u, COL, id, 'editar', [{ campo: o.nome, de: 'em aberto', para: obs }] as never, { empresaId });
    await lote.commit();
}

/** Desfaz a baixa: a guia volta a aberta (fica o valor e o documento) e a obrigação volta a pendente. */
export async function desfazerBaixa(empresaId: string, competencia: string, o: Obrigacao, antes: GuiaRegistrada, u: Usuario): Promise<void> {
    const id = idPagamento(empresaId, o.id);
    const lote = writeBatch(db);
    lote.set(doc(db, COL, id), { ...base(empresaId, competencia, o, antes, u), pagamento: null }, { merge: true });
    lote.delete(doc(db, 'obrigacoes_status', idMarcacao(empresaId, o.id)));
    auditar(lote, u, COL, id, 'editar', [{ campo: o.nome, de: antes.pagamento ? observacaoDaBaixa(antes.pagamento) : 'paga', para: 'em aberto' }] as never, { empresaId });
    await lote.commit();
}
