// services/empresas/duplicadasService.ts
//
// Firestore da análise das empresas repetidas (services/empresas/duplicadas): conta, sem ler os documentos, o que
// está ligado a cada cadastro. Só o gestor enxerga todas as coleções; nada é gravado aqui.

import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { DadosDaEmpresa } from './duplicadas';

const COLECOES: Record<Exclude<keyof DadosDaEmpresa, 'carteiras'>, string> = {
    funcionarios: 'cadastro_funcionarios', movimentos: 'calculo_movimentos', folhas: 'folhas_gravadas', processos: 'processos_gravados',
    esocial: 'esocial_envios', afastamentos: 'cadastro_afastamentos', rubricas: 'cadastro_rubricas', historico: 'historico_sage',
    fechamentos: 'fechamentos', guias: 'pagamentos_guias', enquadramentos: 'cadastro_enquadramentos',
};

const contar = async (colecao: string, campo: string, op: '==' | 'array-contains', valor: string) =>
    (await getCountFromServer(query(collection(db, colecao), where(campo, op, valor)))).data().count;

export async function dadosDaEmpresa(empresaId: string): Promise<DadosDaEmpresa> {
    const chaves = Object.keys(COLECOES) as (keyof typeof COLECOES)[];
    const [carteiras, ...n] = await Promise.all([
        contar('carteira_acessos', 'empresaIds', 'array-contains', empresaId),
        ...chaves.map(k => contar(COLECOES[k], 'empresaId', '==', empresaId)),
    ]);
    return { ...Object.fromEntries(chaves.map((k, i) => [k, n[i]])), carteiras } as DadosDaEmpresa;
}
