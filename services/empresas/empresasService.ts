import {
    collection, doc, getDocs, getDoc, setDoc, updateDoc, writeBatch,
    query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import app, { db } from '../firebaseConfig';
import type { Empresa, EmpresaInput } from './empresasTypes';
import { escopoAtual, esquecerEscopo, lerEmpresasPorId } from '../carteira/carteiraService';
import { chaveCnpj, chaveSage, mensagemConflito, normalizarSage, repetidas, type ChaveUnica } from './chavesUnicas';

// Código SAGE e CNPJ únicos: cada empresa reserva as suas chaves aqui, no mesmo
// lote da gravação; as regras do Firestore recusam a chave já reservada.
const UNICOS = 'empresas_unicos';

async function donoDaChave(chave: string): Promise<string | null> {
    const s = await getDoc(doc(db, UNICOS, chave));
    return s.exists() ? (s.data() as ChaveUnica).empresaId : null;
}

/** Recusa antes de gravar, com mensagem clara (as regras recusam de qualquer jeito). */
async function conferirLivre(tipo: 'sage' | 'cnpj', valor: string, empresaId: string | null, visiveis: Empresa[]): Promise<void> {
    const chave = tipo === 'sage' ? chaveSage(valor) : chaveCnpj(valor);
    const dono = await donoDaChave(chave);
    const igual = visiveis.find(e => e.id !== empresaId && (tipo === 'sage' ? normalizarSage(e.codigoSage) === normalizarSage(valor) : e.cnpj === valor));
    if ((dono && dono !== empresaId) || igual) throw new Error(mensagemConflito(tipo, valor, visiveis.find(e => e.id === dono) ?? igual));
}

const negado = (e: unknown) => (e as { code?: string })?.code === 'permission-denied';

export async function listarMinhasEmpresas(uid: string): Promise<Empresa[]> {
    const q = query(
        collection(db, 'empresas'),
        where('criadoPor', '==', uid),
        orderBy('nomeFantasia', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** Todas as empresas, sem filtro: só o gestor consegue (regras do Firestore). */
export async function listarTodasEmpresas(): Promise<Empresa[]> {
    const q = query(collection(db, 'empresas'), orderBy('nomeFantasia', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/**
 * As empresas que o usuário logado enxerga: o gestor, todas; os demais, as
 * da carteira mais as que ele mesmo cadastrou.
 */
export async function listarEmpresasVisiveis(): Promise<Empresa[]> {
    const e = await escopoAtual();
    if (e.todas) return listarTodasEmpresas();
    const docs = await lerEmpresasPorId(e.empresaIds);
    return docs.map(d => ({ id: d.id, ...(d.data() as any) }) as Empresa).sort((a, b) => (a.nomeFantasia || '').localeCompare(b.nomeFantasia || '', 'pt-BR'));
}

export async function criarEmpresa(uid: string, input: EmpresaInput): Promise<string> {
    const cnpjLimpo = input.cnpj.replace(/\D/g, '');
    const codigoSage = normalizarSage(input.codigoSage);
    const visiveis = await listarEmpresasVisiveis();
    await conferirLivre('cnpj', cnpjLimpo, null, visiveis);
    await conferirLivre('sage', codigoSage, null, visiveis);
    const ref = doc(collection(db, 'empresas'));
    const lote = writeBatch(db);
    lote.set(ref, {
        cnpj: cnpjLimpo,
        razaoSocial: input.razaoSocial.trim(),
        nomeFantasia: input.nomeFantasia.trim(),
        codigoSage,
        criadoPor: uid,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
    });
    for (const chave of [chaveSage(codigoSage), chaveCnpj(cnpjLimpo)]) lote.set(doc(db, UNICOS, chave), { chave, empresaId: ref.id, criadoPor: uid, criadoEm: serverTimestamp() });
    try { await lote.commit(); }
    catch (e) { if (negado(e)) throw new Error('O código SAGE ou o CNPJ já está em uso por outra empresa (fora da sua carteira).'); throw e; }
    // A empresa criada entra no escopo de quem cadastrou: esquece o escopo guardado.
    esquecerEscopo();
    return ref.id;
}

export async function atualizarEmpresa(id: string, input: Partial<EmpresaInput> & Record<string, any>): Promise<void> {
    const uid = getAuth(app!).currentUser?.uid ?? '';
    const atual = await buscarEmpresa(id);
    if (!atual) throw new Error('Empresa não encontrada.');
    const patch: any = { atualizadoEm: serverTimestamp() };
    if (input.cnpj         !== undefined) patch.cnpj         = input.cnpj.replace(/\D/g, '');
    if (input.razaoSocial  !== undefined) patch.razaoSocial  = input.razaoSocial.trim();
    if (input.nomeFantasia !== undefined) patch.nomeFantasia = input.nomeFantasia.trim();
    if (input.codigoSage   !== undefined) patch.codigoSage   = normalizarSage(input.codigoSage);
    if ('certificado' in input) patch.certificado = input.certificado;
    const trocas: { tipo: 'sage' | 'cnpj'; antes: string; depois: string }[] = [];
    // Compara com o gravado como está: empresa antiga com "93" passa a "0093" e precisa da chave.
    if (patch.codigoSage !== undefined && patch.codigoSage !== atual.codigoSage) trocas.push({ tipo: 'sage', antes: atual.codigoSage, depois: patch.codigoSage });
    if (patch.cnpj !== undefined && patch.cnpj !== atual.cnpj) trocas.push({ tipo: 'cnpj', antes: atual.cnpj, depois: patch.cnpj });
    const visiveis = trocas.length ? await listarEmpresasVisiveis() : [];
    for (const t of trocas) await conferirLivre(t.tipo, t.depois, id, visiveis);
    const lote = writeBatch(db);
    lote.update(doc(db, 'empresas', id), patch);
    for (const t of trocas) {
        const nova = t.tipo === 'sage' ? chaveSage(t.depois) : chaveCnpj(t.depois);
        const velha = t.tipo === 'sage' ? chaveSage(t.antes) : chaveCnpj(t.antes);
        // Chave já desta empresa (só normalizou o formato): não regrava nem libera.
        if (await donoDaChave(nova) === id) continue;
        lote.set(doc(db, UNICOS, nova), { chave: nova, empresaId: id, criadoPor: uid, criadoEm: serverTimestamp() });
        // Libera a chave antiga só se for desta empresa (a de outra continua dela).
        if (await donoDaChave(velha) === id) lote.delete(doc(db, UNICOS, velha));
    }
    try { await lote.commit(); }
    catch (e) { if (negado(e) && trocas.length) throw new Error('O código SAGE ou o CNPJ já está em uso por outra empresa (fora da sua carteira).'); throw e; }
    // Empresa antiga, de antes da trava: reserva as chaves que ainda estão livres.
    if (!trocas.length) await reservarChaves({ ...atual, ...patch, id }, uid).catch(() => undefined);
}

/** Reserva as chaves ainda livres de uma empresa já gravada. Devolve as que estão com outra empresa. */
async function reservarChaves(e: Pick<Empresa, 'id' | 'cnpj' | 'codigoSage'>, uid: string): Promise<string[]> {
    const conflitos: string[] = [];
    for (const chave of [e.codigoSage ? chaveSage(e.codigoSage) : '', e.cnpj ? chaveCnpj(e.cnpj) : ''].filter(Boolean)) {
        const dono = await donoDaChave(chave);
        if (dono === e.id) continue;
        if (dono) { conflitos.push(chave); continue; }
        await setDoc(doc(db, UNICOS, chave), { chave, empresaId: e.id, criadoPor: uid, criadoEm: serverTimestamp() });
    }
    return conflitos;
}

/**
 * Protege uma empresa de antes da trava. As regras conferem a chave contra o
 * valor gravado ("sage_" + codigoSage, "cnpj_" + cnpj): empresa antiga com o
 * código sem os zeros ("93") ou o CNPJ com pontuação tem o cadastro
 * normalizado no mesmo lote em que a chave é reservada. Chave de outra
 * empresa (cadastro repetido) fica para a equipe corrigir.
 */
async function protegerUma(e: Empresa, uid: string): Promise<{ reservadas: number; normalizada: boolean }> {
    const valores = { codigoSage: e.codigoSage ? normalizarSage(e.codigoSage) : '', cnpj: String(e.cnpj ?? '').replace(/\D/g, '') };
    const lote = writeBatch(db);
    const patch: Partial<Record<'codigoSage' | 'cnpj', string>> = {};
    let reservadas = 0;
    for (const campo of ['codigoSage', 'cnpj'] as const) {
        const valor = valores[campo];
        if (!valor) continue;
        const chave = campo === 'codigoSage' ? chaveSage(valor) : chaveCnpj(valor);
        const dono = await donoDaChave(chave);
        if (dono && dono !== e.id) continue;
        if (!dono) { lote.set(doc(db, UNICOS, chave), { chave, empresaId: e.id, criadoPor: uid, criadoEm: serverTimestamp() }); reservadas++; }
        if (e[campo] !== valor) patch[campo] = valor;
    }
    const normalizada = Object.keys(patch).length > 0;
    if (!reservadas && !normalizada) return { reservadas: 0, normalizada: false };
    if (normalizada) lote.update(doc(db, 'empresas', e.id), { ...patch, atualizadoEm: serverTimestamp() });
    await lote.commit();
    return { reservadas, normalizada };
}

/**
 * Gestor: protege as empresas cadastradas antes da trava. Reserva as chaves
 * livres (a mais antiga fica com a chave) e devolve o que continua repetido
 * para a equipe corrigir o cadastro. Uma empresa recusada não interrompe as
 * outras: vai para a lista de falhas.
 */
export async function protegerEmpresasExistentes(empresas: Empresa[], aoProgresso?: (feitas: number) => void): Promise<{ reservadas: number; normalizadas: number; repetidas: ReturnType<typeof repetidas>; falhas: string[] }> {
    const uid = getAuth(app!).currentUser?.uid ?? '';
    const ordem = [...empresas].sort((a, b) => ((a as any).criadoEm?.toMillis?.() ?? 0) - ((b as any).criadoEm?.toMillis?.() ?? 0));
    let reservadas = 0; let normalizadas = 0;
    const falhas: string[] = [];
    for (let i = 0; i < ordem.length; i++) {
        const e = ordem[i];
        try {
            const r = await protegerUma(e, uid);
            reservadas += r.reservadas;
            if (r.normalizada) normalizadas++;
        } catch (err) {
            falhas.push(`${e.nomeFantasia || e.razaoSocial} (SAGE ${e.codigoSage || '—'}, CNPJ ${e.cnpj || '—'}): ${negado(err) ? 'sem permissão para gravar' : (err as Error).message}`);
        }
        aoProgresso?.(i + 1);
    }
    return { reservadas, normalizadas, repetidas: repetidas(empresas), falhas };
}

/** Contas da empresa para o arquivo bancário (lista inteira; conta, convênio e próximo NSA). */
export async function salvarContasPagamento(empresaId: string, contas: import('../bancario/cnab240').ContaPagamento[]): Promise<void> {
    await updateDoc(doc(db, 'empresas', empresaId), { contasPagamento: contas.map(c => JSON.parse(JSON.stringify(c))), atualizadoEm: serverTimestamp() });
}

export async function salvarContatoEnvio(empresaId: string, contato: import('../pacoteCliente/envio').ContatoEnvio): Promise<void> {
    const limpo = Object.fromEntries(Object.entries(contato).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v));
    await updateDoc(doc(db, 'empresas', empresaId), { contatoEnvio: limpo, atualizadoEm: serverTimestamp() });
}

export async function excluirEmpresa(id: string): Promise<void> {
    const atual = await buscarEmpresa(id);
    const lote = writeBatch(db);
    lote.delete(doc(db, 'empresas', id));
    for (const chave of atual ? [chaveSage(atual.codigoSage), chaveCnpj(atual.cnpj)] : []) {
        if (await donoDaChave(chave) === id) lote.delete(doc(db, UNICOS, chave));
    }
    await lote.commit();
}

export async function buscarEmpresa(id: string): Promise<Empresa | null> {
    const snap = await getDoc(doc(db, 'empresas', id));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null;
}
