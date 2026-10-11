// services/transferencia/transferenciaService.ts
//
// Efetivação da transferência entre empresas do grupo (services/transferencia/transferencia.ts) no banco:
// o registro (transferencias/{fichaDeOrigem}_{data}), a ficha no destino, as férias e os afastamentos terminados,
// os movimentos da origem (para as médias; mês encerrado no destino fica de fora, com aviso) e a ficha de origem
// desligada com o motivo 11. Cada passo que falha vira aviso no registro; a ficha nova é o passo que não pode falhar.

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { listarAfastamentos, mensagemErro, salvarAfastamento, salvarFuncionario, type Usuario } from '../cadastros/cadastrosService';
import { listarMovimentosDaEmpresa, salvarMovimentos } from '../calculo/movimentosService';
import type { ContratoS2200 } from '../esocial/admissao';
import { afastamentosParaODestino, fichaNaOrigem, fichaNoDestino, type Transferencia } from './transferencia';

const COL = 'transferencias';
const limpo = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export interface RegistroTransferencia {
    id: string;
    empresaId: string; destinoId: string;
    fichaId: string; fichaDestinoId: string;
    cpf: string; nome: string;
    origem: { cnpj: string; nome: string }; destino: { cnpj: string; nome: string };
    data: string; matricula: string; matriculaOrigem: string; estabelecimento: string;
    contrato: ContratoS2200;
    situacao: 'efetivando' | 'efetivada';
    avisos: string[];
    atualizadoPorEmail?: string;
}

export const idTransferencia = (fichaId: string, data: string) => `${fichaId}_${data}`;

export async function listarTransferencias(empresaId: string): Promise<RegistroTransferencia[]> {
    const [saidas, entradas] = await Promise.all([
        getDocs(query(collection(db, COL), where('empresaId', '==', empresaId))),
        getDocs(query(collection(db, COL), where('destinoId', '==', empresaId))),
    ]);
    const todos = new Map<string, RegistroTransferencia>();
    for (const d of [...saidas.docs, ...entradas.docs]) todos.set(d.id, { ...(d.data() as RegistroTransferencia), id: d.id });
    return [...todos.values()].sort((a, b) => b.data.localeCompare(a.data));
}

async function gravarRegistro(r: RegistroTransferencia, u: Usuario) {
    const { id, ...dados } = r;
    await setDoc(doc(db, COL, id), { ...limpo(dados), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
}

/** Grava a transferência no Consultor. Devolve o registro com os avisos do que não foi copiado. */
export async function efetivarTransferencia(t: Transferencia, contrato: ContratoS2200, u: Usuario): Promise<RegistroTransferencia> {
    const nova = fichaNoDestino(t);
    const r: RegistroTransferencia = {
        id: idTransferencia(t.ficha.id, t.data), empresaId: t.origem.id, destinoId: t.destino.id, fichaId: t.ficha.id, fichaDestinoId: nova.id,
        cpf: nova.cpf, nome: nova.dados.nome ?? '', origem: { cnpj: t.origem.cnpj, nome: t.origem.nome }, destino: { cnpj: t.destino.cnpj, nome: t.destino.nome },
        data: t.data, matricula: nova.matriculaEsocial, matriculaOrigem: t.ficha.matriculaEsocial, estabelecimento: nova.dados.estabelecimento ?? '', contrato,
        situacao: 'efetivando', avisos: [],
    };
    await gravarRegistro(r, u);
    await salvarFuncionario(null, nova, u);
    // Férias e afastamentos terminados.
    try {
        const { copiar, avisos } = afastamentosParaODestino(t, await listarAfastamentos(t.origem.id));
        r.avisos.push(...avisos);
        for (const a of copiar) {
            try { await salvarAfastamento(null, a, u); } catch (x) { r.avisos.push(`Afastamento de ${a.dtInicio} não copiado: ${mensagemErro(x)}`); }
        }
    } catch (x) { r.avisos.push(`Afastamentos não lidos: ${mensagemErro(x)}`); }
    // Movimentos (médias de férias, 13º e rescisão); mês encerrado no destino não recebe.
    try {
        const movs = (await listarMovimentosDaEmpresa(t.origem.id))[t.ficha.id] ?? {};
        const falhas: string[] = [];
        for (const [comp, m] of Object.entries(movs).sort(([a], [b]) => a.localeCompare(b))) {
            if (comp >= t.data.slice(0, 7)) continue;
            try { await salvarMovimentos(t.destino.id, comp, [{ fichaId: nova.id, antes: null, depois: m }], u); } catch { falhas.push(comp); }
        }
        if (falhas.length) r.avisos.push(`Movimentos não copiados (mês encerrado no destino ou sem permissão): ${falhas.join(', ')}.`);
    } catch (x) { r.avisos.push(`Movimentos não lidos: ${mensagemErro(x)}`); }
    await salvarFuncionario(t.ficha, fichaNaOrigem(t), u);
    r.situacao = 'efetivada';
    await gravarRegistro(r, u);
    return r;
}
