// services/empresas/duplicadasService.ts
//
// Firestore da análise das empresas repetidas (services/empresas/duplicadas): conta, sem ler os documentos, o que
// está ligado a cada cadastro. Só o gestor enxerga todas as coleções; nada é gravado aqui. Coleção que não pôde ser
// contada volta em naoConferidas (na dúvida, o cadastro não é vazio).

import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { configuracoesDoCadastro, ROTULO_COLECAO, type DadosDaEmpresa } from './duplicadas';

/** Coleções da empresa com o campo empresaId. */
const POR_CAMPO = Object.keys(ROTULO_COLECAO).filter(c => !['contabil_folha', 'eventos_empresa'].includes(c));
/** Coleções com um documento por empresa (id = id da empresa). */
const POR_ID = ['contabil_folha', 'eventos_empresa'];

export async function dadosDaEmpresa(empresaId: string): Promise<DadosDaEmpresa> {
    const naoConferidas: string[] = [];
    const tentar = async (colecao: string, f: () => Promise<number>) => {
        try { return [colecao, await f()] as const; } catch { naoConferidas.push(colecao); return [colecao, 0] as const; }
    };
    const [cadastro, carteiras, ...contagens] = await Promise.all([
        getDoc(doc(db, 'empresas', empresaId)),
        tentar('carteira_acessos', async () => (await getCountFromServer(query(collection(db, 'carteira_acessos'), where('empresaIds', 'array-contains', empresaId)))).data().count),
        ...POR_CAMPO.map(c => tentar(c, async () => (await getCountFromServer(query(collection(db, c), where('empresaId', '==', empresaId)))).data().count)),
        ...POR_ID.map(c => tentar(c, async () => ((await getDoc(doc(db, c, empresaId))).exists() ? 1 : 0))),
    ]);
    return {
        porColecao: Object.fromEntries(contagens),
        configuracoes: cadastro.exists() ? configuracoesDoCadastro(cadastro.data()) : [],
        carteiras: carteiras[1],
        naoConferidas,
    };
}
