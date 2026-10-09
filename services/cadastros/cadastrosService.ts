// services/cadastros/cadastrosService.ts
//
// Persistência dos cadastros no Firestore (projeto consultor-dp-folha):
//   cadastro_funcionarios/{empresaId_cpf_matrícula}
//   cadastro_sindicatos/{cnpj}
//   cadastro_tabelas_legais/{auto}  (oficiais: oficial_{tipo}_{vigência})
//   cadastro_audit/{auto}   (só inclusão; ninguém altera nem apaga)
// Toda gravação vai num lote junto com o registro de auditoria: ou grava os
// dois, ou nenhum. As regras estão em firestore.rules.

import {
    collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where, writeBatch, type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { diffFicha, type Alteracao, type FichaFuncionario, type ResultadoMescla } from './funcionarios';
import { sindicatoVazio, type Sindicato } from './sindicatos';
import { tabelaVazia, type TabelaLegal } from './tabelasLegais';
import { horarioVazio, type Horario } from './horarios';
import { afastamentoVazio, type Afastamento, type MesclaAfastamento } from './afastamentos';
import { rubricaVazia, type MesclaRubrica, type Rubrica } from './rubricas';
import { enquadramentoVazio, idEnquadramento, type Enquadramento } from './enquadramento';
import { consultarPorEmpresas } from '../carteira/carteiraService';

export interface Usuario { id: string; email: string }

const FUNC = 'cadastro_funcionarios';
const SIND = 'cadastro_sindicatos';
const TAB = 'cadastro_tabelas_legais';
const HOR = 'cadastro_horarios';
const AFA = 'cadastro_afastamentos';
const RUB = 'cadastro_rubricas';
const ENQ = 'cadastro_enquadramentos';
const AUDIT = 'cadastro_audit';

export const COMANDO_REGRAS = 'firebase deploy --only firestore:rules --project consultor-dp-folha';

/** Mensagem para o usuário; permissão negada quase sempre é regra ainda não publicada. */
export function mensagemErro(e: unknown): string {
    const code = (e as { code?: string })?.code;
    if (code === 'permission-denied') return `Sem permissão no Firestore. Se for o primeiro uso dos cadastros, as regras ainda não foram publicadas: o administrador deve rodar \`${COMANDO_REGRAS}\`. Exclusões são só para administradores.`;
    if (code === 'unavailable') return 'Firestore indisponível: verifique a conexão e tente de novo.';
    return (e as Error)?.message || String(e);
}

// O Firestore recusa undefined; JSON elimina e mantém null.
export const limpo = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

const registroAuditoria = (u: Usuario, colecao: string, docId: string, acao: string, alteracoes: Alteracao[], extra: Record<string, string>) => ({
    ...limpo({ colecao, docId, acao, alteracoes: alteracoes.slice(0, 300), totalAlteracoes: alteracoes.length, autor: u.id, autorEmail: u.email, ...extra }),
    quando: serverTimestamp(),
});

export function auditar(lote: WriteBatch, u: Usuario, colecao: string, docId: string, acao: string, alteracoes: Alteracao[], extra: Record<string, string> = {}) {
    lote.set(doc(collection(db, AUDIT)), registroAuditoria(u, colecao, docId, acao, alteracoes, extra));
}

/** Mantém só as chaves do modelo (descarta carimbos lidos do documento). */
const soCampos = <T extends object>(o: T, modelo: T): T => Object.fromEntries(Object.keys(modelo).map(k => [k, (o as Record<string, unknown>)[k]])) as T;

const semId = <T extends { id: string }>(o: T) => { const { id: _id, ...resto } = o; return resto; };

// ---------- Funcionários ----------

export async function listarFuncionarios(empresaId: string): Promise<FichaFuncionario[]> {
    const snap = await getDocs(query(collection(db, FUNC), where('empresaId', '==', empresaId)));
    return snap.docs.map(d => ({ dependentes: [], origens: {}, pendenciasImportacao: [], dados: {}, ...(d.data() as Omit<FichaFuncionario, 'id'>), id: d.id }))
        .sort((a, b) => (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR'));
}

// Só os campos da ficha (o documento lido traz também criadoEm/atualizadoEm).
// Na alteração, update substitui cada mapa inteiro: campo apagado na ficha
// some do documento, o que set com merge não faria.
function setFicha(lote: WriteBatch, f: FichaFuncionario, u: Usuario, nova: boolean) {
    const { empresaId, cnpj, cpf, matriculaEsocial, situacao, dados, dependentes, origens, pendenciasImportacao, historicoSalario, beneficios } = f;
    // Sem histórico na ficha em memória, o gravado fica como está (limpo tira o undefined).
    const campos = { ...limpo({ empresaId, cnpj, cpf, matriculaEsocial, situacao, dados, dependentes, origens, pendenciasImportacao, historicoSalario, beneficios }), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() };
    if (nova) lote.set(doc(db, FUNC, f.id), { ...campos, criadoPor: u.id, criadoEm: serverTimestamp() });
    else lote.update(doc(db, FUNC, f.id), campos);
}

export async function salvarFuncionario(antes: FichaFuncionario | null, f: FichaFuncionario, u: Usuario): Promise<void> {
    if (!antes && (await getDoc(doc(db, FUNC, f.id))).exists()) throw new Error('Já existe ficha desta empresa com este CPF e esta matrícula do eSocial.');
    const lote = writeBatch(db);
    setFicha(lote, f, u, !antes);
    auditar(lote, u, FUNC, f.id, antes ? 'editar' : 'criar', diffFicha(antes, f), { empresaId: f.empresaId });
    await lote.commit();
}

/** Grava a prévia confirmada, em lotes (ficha + auditoria = 2 escritas por funcionário). */
export async function gravarImportacao(resultados: ResultadoMescla[], u: Usuario, arquivos: string[], aoProgresso?: (feitos: number) => void, fonte = 'XML eSocial'): Promise<void> {
    const origem = arquivos.slice(0, 20).join(', ') + (arquivos.length > 20 ? ` e mais ${arquivos.length - 20}` : '');
    for (let i = 0; i < resultados.length; i += 200) {
        const lote = writeBatch(db);
        for (const r of resultados.slice(i, i + 200)) {
            setFicha(lote, r.ficha, u, r.novo);
            auditar(lote, u, FUNC, r.ficha.id, r.novo ? 'importar (novo)' : 'importar (atualizar)', r.alteracoes, { empresaId: r.ficha.empresaId, origem: `${fonte}: ${origem}` });
        }
        await lote.commit();
        aoProgresso?.(Math.min(i + 200, resultados.length));
    }
}

export async function excluirFuncionario(f: FichaFuncionario, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, FUNC, f.id));
    auditar(lote, u, FUNC, f.id, 'excluir', [{ campo: 'cpf', de: f.cpf, para: '' }, { campo: 'matriculaEsocial', de: f.matriculaEsocial, para: '' }], { empresaId: f.empresaId });
    await lote.commit();
}

export interface RegistroAuditoria { id: string; acao: string; alteracoes: Alteracao[]; totalAlteracoes: number; autorEmail: string; origem?: string; quando?: Date }

export async function historico(colecao: 'funcionarios' | 'sindicatos' | 'tabelas' | 'horarios' | 'afastamentos' | 'rubricas' | 'enquadramentos', docId: string): Promise<RegistroAuditoria[]> {
    const nome = { funcionarios: FUNC, sindicatos: SIND, tabelas: TAB, horarios: HOR, afastamentos: AFA, rubricas: RUB, enquadramentos: ENQ }[colecao];
    const snap = await getDocs(query(collection(db, AUDIT), where('docId', '==', docId)));
    return snap.docs.map(d => {
        const x = d.data();
        return { id: d.id, acao: x.acao, alteracoes: x.alteracoes ?? [], totalAlteracoes: x.totalAlteracoes ?? 0, autorEmail: x.autorEmail ?? '', origem: x.origem, quando: x.quando?.toDate?.(), colecao: x.colecao };
    }).filter(r => r.colecao === nome).sort((a, b) => (b.quando?.getTime() ?? 0) - (a.quando?.getTime() ?? 0));
}

// ---------- Sindicatos ----------

export async function listarSindicatos(): Promise<Sindicato[]> {
    const snap = await getDocs(collection(db, SIND));
    return snap.docs.map(d => ({ ...(d.data() as Sindicato), id: d.id })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const diffObjeto = (antes: object | null, depois: object): Alteracao[] => {
    const a = (antes ?? {}) as Record<string, unknown>; const d = depois as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(d)])].filter(k => k !== 'id' && JSON.stringify(a[k] ?? '') !== JSON.stringify(d[k] ?? ''))
        .map(k => ({ campo: k as Alteracao['campo'], de: a[k] == null ? '' : typeof a[k] === 'object' ? JSON.stringify(a[k]) : String(a[k]), para: d[k] == null ? '' : typeof d[k] === 'object' ? JSON.stringify(d[k]) : String(d[k]) }));
};

export async function salvarSindicato(antes: Sindicato | null, s: Sindicato, u: Usuario): Promise<void> {
    if (!antes && (await getDoc(doc(db, SIND, s.cnpj))).exists()) throw new Error('Já existe um sindicato com este CNPJ.');
    const lote = writeBatch(db);
    lote.set(doc(db, SIND, s.cnpj), { ...limpo(semId(soCampos(s, sindicatoVazio()))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    auditar(lote, u, SIND, s.cnpj, antes ? 'editar' : 'criar', diffObjeto(antes && soCampos(antes, sindicatoVazio()), soCampos(s, sindicatoVazio())));
    await lote.commit();
}

export async function excluirSindicato(s: Sindicato, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, SIND, s.id));
    auditar(lote, u, SIND, s.id, 'excluir', diffObjeto(soCampos(s, sindicatoVazio()), {}));
    await lote.commit();
}

// ---------- Tabelas legais ----------

export async function listarTabelas(): Promise<TabelaLegal[]> {
    const snap = await getDocs(collection(db, TAB));
    return snap.docs.map(d => ({ observacao: '', valores: {}, faixas: [], ...(d.data() as TabelaLegal), id: d.id }))
        .sort((a, b) => a.tipo.localeCompare(b.tipo) || b.vigencia.localeCompare(a.vigencia));
}

/** Inclusão por qualquer usuário aprovado; alteração e exclusão só por administrador (regras). */
export async function salvarTabela(antes: TabelaLegal | null, t: TabelaLegal, u: Usuario): Promise<string> {
    const lote = writeBatch(db);
    const ref = antes ? doc(db, TAB, antes.id) : doc(collection(db, TAB));
    lote.set(ref, { ...limpo(semId(soCampos(t, tabelaVazia(t.tipo)))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    auditar(lote, u, TAB, ref.id, antes ? 'editar' : 'criar', diffObjeto(antes && soCampos(antes, tabelaVazia(t.tipo)), soCampos(t, tabelaVazia(t.tipo))));
    await lote.commit();
    return ref.id;
}

export const idTabelaOficial = (t: TabelaLegal) => `oficial_${t.tipo}_${t.vigencia}`;

/**
 * Tabela oficial com id fixo por tipo e vigência, numa transação: dois cliques
 * ao mesmo tempo (ou duas pessoas) não criam duplicata; quem chega depois
 * recebe false e nada é gravado.
 */
export async function gravarTabelaOficial(t: TabelaLegal, u: Usuario): Promise<boolean> {
    const ref = doc(db, TAB, idTabelaOficial(t));
    return runTransaction(db, async tx => {
        if ((await tx.get(ref)).exists()) return false;
        tx.set(ref, { ...limpo(semId(soCampos(t, tabelaVazia(t.tipo)))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
        tx.set(doc(collection(db, AUDIT)), registroAuditoria(u, TAB, ref.id, 'criar', diffObjeto(null, soCampos(t, tabelaVazia(t.tipo))), {}));
        return true;
    });
}

export async function excluirTabela(t: TabelaLegal, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, TAB, t.id));
    auditar(lote, u, TAB, t.id, 'excluir', diffObjeto(soCampos(t, tabelaVazia(t.tipo)), {}));
    await lote.commit();
}

// ---------- Horários ----------

export async function listarHorarios(empresaId: string): Promise<Horario[]> {
    const snap = await getDocs(query(collection(db, HOR), where('empresaId', '==', empresaId)));
    return snap.docs.map(d => ({ ...soCampos(d.data() as Horario, horarioVazio(empresaId)), id: d.id }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

export async function salvarHorario(antes: Horario | null, h: Horario, u: Usuario): Promise<void> {
    if (!antes && (await getDoc(doc(db, HOR, h.id))).exists()) throw new Error('Já existe um horário com este código nesta empresa.');
    const lote = writeBatch(db);
    lote.set(doc(db, HOR, h.id), { ...limpo(semId(soCampos(h, horarioVazio(h.empresaId)))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    auditar(lote, u, HOR, h.id, antes ? 'editar' : 'criar', diffObjeto(antes && soCampos(antes, horarioVazio(h.empresaId)), soCampos(h, horarioVazio(h.empresaId))), { empresaId: h.empresaId });
    await lote.commit();
}

export async function excluirHorario(h: Horario, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, HOR, h.id));
    auditar(lote, u, HOR, h.id, 'excluir', diffObjeto(soCampos(h, horarioVazio(h.empresaId)), {}), { empresaId: h.empresaId });
    await lote.commit();
}

// ---------- Afastamentos ----------

export async function listarAfastamentos(empresaId: string): Promise<Afastamento[]> {
    const snap = await getDocs(query(collection(db, AFA), where('empresaId', '==', empresaId)));
    return snap.docs.map(d => ({ ...soCampos(d.data() as Afastamento, afastamentoVazio()), id: d.id }))
        .sort((a, b) => b.dtInicio.localeCompare(a.dtInicio));
}

export async function salvarAfastamento(antes: Afastamento | null, a: Afastamento, u: Usuario): Promise<void> {
    if (!antes && (await getDoc(doc(db, AFA, a.id))).exists()) throw new Error('Já existe afastamento deste funcionário com esta data de início.');
    const lote = writeBatch(db);
    lote.set(doc(db, AFA, a.id), { ...limpo(semId(soCampos(a, afastamentoVazio()))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    auditar(lote, u, AFA, a.id, antes ? 'editar' : 'criar', diffObjeto(antes && soCampos(antes, afastamentoVazio()), soCampos(a, afastamentoVazio())), { empresaId: a.empresaId });
    await lote.commit();
}

/** Grava a prévia confirmada da importação do S-2230 (afastamento + auditoria = 2 escritas). */
export async function gravarAfastamentosImportados(itens: MesclaAfastamento[], antes: Afastamento[], u: Usuario, arquivos: string[]): Promise<void> {
    const porId = new Map(antes.map(a => [a.id, a]));
    const origem = arquivos.slice(0, 20).join(', ') + (arquivos.length > 20 ? ` e mais ${arquivos.length - 20}` : '');
    for (let i = 0; i < itens.length; i += 200) {
        const lote = writeBatch(db);
        for (const { afastamento: a, novo } of itens.slice(i, i + 200)) {
            lote.set(doc(db, AFA, a.id), { ...limpo(semId(soCampos(a, afastamentoVazio()))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
            const ant = porId.get(a.id);
            auditar(lote, u, AFA, a.id, novo ? 'importar (novo)' : 'importar (atualizar)', diffObjeto(ant ? soCampos(ant, afastamentoVazio()) : null, soCampos(a, afastamentoVazio())), { empresaId: a.empresaId, origem: `XML eSocial: ${origem}` });
        }
        await lote.commit();
    }
}

export async function excluirAfastamento(a: Afastamento, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, AFA, a.id));
    auditar(lote, u, AFA, a.id, 'excluir', diffObjeto(soCampos(a, afastamentoVazio()), {}), { empresaId: a.empresaId });
    await lote.commit();
}

// ---------- Rubricas (S-1010) ----------

export async function listarRubricas(empresaId: string): Promise<Rubrica[]> {
    const snap = await getDocs(query(collection(db, RUB), where('empresaId', '==', empresaId)));
    return snap.docs.map(d => ({ ...soCampos(d.data() as Rubrica, rubricaVazia()), id: d.id }))
        .sort((a, b) => a.codRubr.localeCompare(b.codRubr, 'pt-BR', { numeric: true }));
}

/** Grava a prévia confirmada do S-1010 (rubrica + auditoria = 2 escritas). */
export async function gravarRubricasImportadas(itens: MesclaRubrica[], antes: Rubrica[], u: Usuario, arquivos: string[]): Promise<void> {
    const porId = new Map(antes.map(r => [r.id, r]));
    const origem = arquivos.slice(0, 20).join(', ') + (arquivos.length > 20 ? ` e mais ${arquivos.length - 20}` : '');
    for (let i = 0; i < itens.length; i += 200) {
        const lote = writeBatch(db);
        for (const { rubrica: r, novo } of itens.slice(i, i + 200)) {
            lote.set(doc(db, RUB, r.id), { ...limpo(semId(soCampos(r, rubricaVazia()))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
            const ant = porId.get(r.id);
            auditar(lote, u, RUB, r.id, novo ? 'importar (novo)' : 'importar (atualizar)', diffObjeto(ant ? soCampos(ant, rubricaVazia()) : null, soCampos(r, rubricaVazia())), { empresaId: r.empresaId, origem: `XML eSocial: ${origem}` });
        }
        await lote.commit();
    }
}

/** Liga a rubrica a outro evento do IOB (ou volta ao vínculo pelo código, com vazio). */
export async function salvarVinculoRubrica(r: Rubrica, eventoIob: string, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.update(doc(db, RUB, r.id), { eventoIob, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    auditar(lote, u, RUB, r.id, 'editar', diffObjeto({ eventoIob: r.eventoIob }, { eventoIob }), { empresaId: r.empresaId });
    await lote.commit();
}

export async function excluirRubrica(r: Rubrica, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, RUB, r.id));
    auditar(lote, u, RUB, r.id, 'excluir', diffObjeto(soCampos(r, rubricaVazia()), {}), { empresaId: r.empresaId });
    await lote.commit();
}

// ---------- Todas as empresas da carteira (painel de prazos) ----------

export async function listarTodosFuncionariosAtivos(): Promise<FichaFuncionario[]> {
    const docs = await consultarPorEmpresas(FUNC, where('situacao', '==', 'ativo'));
    return docs.map(d => ({ dependentes: [], origens: {}, pendenciasImportacao: [], dados: {}, ...(d.data() as Omit<FichaFuncionario, 'id'>), id: d.id }));
}

export async function listarTodosAfastamentos(): Promise<Afastamento[]> {
    const docs = await consultarPorEmpresas(AFA);
    return docs.map(d => ({ ...soCampos(d.data() as Afastamento, afastamentoVazio()), id: d.id }));
}

// ---------- Enquadramento previdenciário (parte patronal) ----------

export async function listarEnquadramentos(empresaId: string): Promise<Enquadramento[]> {
    const snap = await getDocs(query(collection(db, ENQ), where('empresaId', '==', empresaId)));
    return snap.docs.map(d => ({ ...enquadramentoVazio(empresaId), ...(d.data() as Enquadramento), id: d.id }))
        .sort((a, b) => b.vigencia.localeCompare(a.vigencia));
}

/** id = empresa_vigência. A vigência não muda na edição: outra vigência é outro enquadramento (o antigo continua valendo até ser excluído pelo admin). */
export async function salvarEnquadramento(antes: Enquadramento | null, e: Enquadramento, u: Usuario): Promise<void> {
    const id = idEnquadramento(e.empresaId, e.vigencia);
    if (antes && antes.id !== id) throw new Error('A vigência de um enquadramento não muda. Crie um novo enquadramento com a nova vigência.');
    if (!antes && (await getDoc(doc(db, ENQ, id))).exists()) throw new Error('Já existe enquadramento desta empresa com esta vigência.');
    const lote = writeBatch(db);
    lote.set(doc(db, ENQ, id), { ...limpo(semId(soCampos(e, enquadramentoVazio()))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    auditar(lote, u, ENQ, id, antes ? 'editar' : 'criar', diffObjeto(antes && soCampos(antes, enquadramentoVazio()), soCampos(e, enquadramentoVazio())), { empresaId: e.empresaId });
    await lote.commit();
}

/** Enquadramentos de todas as empresas da carteira (o gestor vê todos). */
export async function listarTodosEnquadramentos(): Promise<Enquadramento[]> {
    const docs = await consultarPorEmpresas(ENQ);
    return docs.map(d => ({ ...enquadramentoVazio(), ...(d.data() as Enquadramento), id: d.id }));
}

/**
 * Grava vários enquadramentos novos (carga do backup do IOB), cada um com o
 * registro na auditoria, em lotes de até 200 (o Firestore aceita 500 escritas).
 */
export async function gravarEnquadramentosEmLote(lista: Enquadramento[], u: Usuario, origem: string, aoProgresso?: (feitos: number) => void): Promise<void> {
    for (let i = 0; i < lista.length; i += 200) {
        const lote = writeBatch(db);
        for (const e of lista.slice(i, i + 200)) {
            const id = idEnquadramento(e.empresaId, e.vigencia);
            lote.set(doc(db, ENQ, id), { ...limpo(semId(soCampos(e, enquadramentoVazio()))), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
            auditar(lote, u, ENQ, id, 'criar', diffObjeto(null, soCampos(e, enquadramentoVazio())), { empresaId: e.empresaId, origem });
        }
        await lote.commit();
        aoProgresso?.(Math.min(i + 200, lista.length));
    }
}

export async function excluirEnquadramento(e: Enquadramento, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, ENQ, e.id));
    auditar(lote, u, ENQ, e.id, 'excluir', diffObjeto(soCampos(e, enquadramentoVazio()), {}), { empresaId: e.empresaId });
    await lote.commit();
}
