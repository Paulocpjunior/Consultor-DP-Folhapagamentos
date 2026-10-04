// services/cadastros/cadastrosService.ts
//
// Persistência dos cadastros no Firestore (projeto consultor-dp-folha):
//   cadastro_funcionarios/{empresaId_cpf_matrícula}
//   cadastro_sindicatos/{cnpj}
//   cadastro_tabelas_legais/{auto}
//   cadastro_audit/{auto}   (só inclusão; ninguém altera nem apaga)
// Toda gravação vai num lote junto com o registro de auditoria: ou grava os
// dois, ou nenhum. As regras estão em firestore.rules.

import {
    collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch, type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { diffFicha, type Alteracao, type FichaFuncionario, type ResultadoMescla } from './funcionarios';
import { sindicatoVazio, type Sindicato } from './sindicatos';
import { tabelaVazia, type TabelaLegal } from './tabelasLegais';

export interface Usuario { id: string; email: string }

const FUNC = 'cadastro_funcionarios';
const SIND = 'cadastro_sindicatos';
const TAB = 'cadastro_tabelas_legais';
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
const limpo = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

function auditar(lote: WriteBatch, u: Usuario, colecao: string, docId: string, acao: string, alteracoes: Alteracao[], extra: Record<string, string> = {}) {
    lote.set(doc(collection(db, AUDIT)), {
        ...limpo({ colecao, docId, acao, alteracoes: alteracoes.slice(0, 300), totalAlteracoes: alteracoes.length, autor: u.id, autorEmail: u.email, ...extra }),
        quando: serverTimestamp(),
    });
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
    const { empresaId, cnpj, cpf, matriculaEsocial, situacao, dados, dependentes, origens, pendenciasImportacao } = f;
    const campos = { ...limpo({ empresaId, cnpj, cpf, matriculaEsocial, situacao, dados, dependentes, origens, pendenciasImportacao }), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() };
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
export async function gravarImportacao(resultados: ResultadoMescla[], u: Usuario, arquivos: string[], aoProgresso?: (feitos: number) => void): Promise<void> {
    const origem = arquivos.slice(0, 20).join(', ') + (arquivos.length > 20 ? ` e mais ${arquivos.length - 20}` : '');
    for (let i = 0; i < resultados.length; i += 200) {
        const lote = writeBatch(db);
        for (const r of resultados.slice(i, i + 200)) {
            setFicha(lote, r.ficha, u, r.novo);
            auditar(lote, u, FUNC, r.ficha.id, r.novo ? 'importar (novo)' : 'importar (atualizar)', r.alteracoes, { empresaId: r.ficha.empresaId, origem: `XML eSocial: ${origem}` });
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

export async function historico(colecao: 'funcionarios' | 'sindicatos' | 'tabelas', docId: string): Promise<RegistroAuditoria[]> {
    const nome = { funcionarios: FUNC, sindicatos: SIND, tabelas: TAB }[colecao];
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

const diffObjeto = (antes: object | null, depois: object): Alteracao[] => {
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

export async function excluirTabela(t: TabelaLegal, u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    lote.delete(doc(db, TAB, t.id));
    auditar(lote, u, TAB, t.id, 'excluir', diffObjeto(soCampos(t, tabelaVazia(t.tipo)), {}));
    await lote.commit();
}
