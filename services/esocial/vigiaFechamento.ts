// services/esocial/vigiaFechamento.ts
//
// O vigia da Saúde do eSocial importa sozinho o S-1299/S-1298 transmitido fora do Consultor (IOB/Folhamatic)
// — o mesmo que o clique "Conciliar com o eSocial" já faz (fechamentoGoverno.ts) — para o selo do eSocial no
// semáforo da DCTFWeb não depender de alguém lembrar de conciliar (Paulo, 13/10/2026).
//
// O vigia roda no navegador de cada colaborador logado, na empresa ativa, a cada 20 s (useVigiaEsocial). Para não
// virar uma tempestade de consultas ao eSocial, a tentativa é marcada no Firestore, por empresa e competência:
//   esocial_vigia_fechamento/{empresaId}_{AAAA-MM}  { empresaId, competencia, dia, estado, tentativas, tentativaEm, por, … }
// A marca é tomada numa transação antes de qualquer consulta: com duas abas ou dois usuários, só um consulta.
//   · 'feito' no dia: ninguém consulta de novo até o dia seguinte;
//   · 'cota': o empregador já gastou a reserva de pedidos do dia — o automático só volta amanhã;
//   · 'falhou' (identificadores, download ou gravação): nova tentativa depois de 1 h, até 3 no dia;
//   · 'rodando' há mais de 10 min: a aba fechou no meio, outra pode assumir.
// Só produção. Competências: a aberta (empresa ativa) e a anterior. Por competência, 2 consultas de identificadores
// (S-1299 e S-1298); o download (recibo, para a data da recepção) só quando há fechamento novo a importar.

import { doc, runTransaction, serverTimestamp, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { consultarIdentificadores, type PedidoIdentificadores, type RetornoIdentificadores } from './downloadEventos';
import { baixarRecibosDoGoverno, importarFechamentosDoGoverno, TIPOS_FECHAMENTO, type DepsImportacao, type ResultadoImportacao } from './fechamentoGoverno';
import type { TpAmb } from './transmissao';
import { listarEnvios, registrarFechamentoDoGoverno, type Envio } from './transmissaoService';

export const COL_MARCA = 'esocial_vigia_fechamento';
export type EstadoMarca = 'rodando' | 'feito' | 'falhou' | 'cota';
export interface MarcaVigia { dia: string; estado: EstadoMarca; tentativas: number; tentativaEm: number | null }

/** Nova tentativa depois de uma falha. */
export const ESPERA_NOVA_TENTATIVA_MS = 60 * 60_000;
/** Marca "rodando" mais velha que isto é de uma aba que fechou no meio. */
export const RODANDO_EXPIRA_MS = 10 * 60_000;
export const MAX_TENTATIVAS_DIA = 3;
/**
 * Reserva da cota diária de download do eSocial (pedidos do empregador no dia, contados pelo CFI em
 * dp_esocial_download_log): o automático para quando o dia já tem esta quantidade, e deixa o resto para a equipe.
 */
export const RESERVA_PEDIDOS_DIA = 10;
/** Cada aba relê a marca no máximo a cada 15 min (o vigia gira a cada 20 s). */
export const RELEITURA_MS = 15 * 60_000;

/** Dia de Brasília (AAAA-MM-DD). */
export const diaBrasilia = (agora = Date.now()) => new Date(agora).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const anterior = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; };
/** A competência aberta e a anterior. */
export const competenciasDoVigia = (aberta: string) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(aberta) ? [aberta, anterior(aberta)] : []);

/** A marca permite tentar agora? */
export function podeTentar(m: MarcaVigia | null, hoje: string, agora: number): boolean {
    if (!m || m.dia !== hoje) return true;
    if (m.estado === 'feito' || m.estado === 'cota') return false;
    if ((m.tentativas ?? 0) >= MAX_TENTATIVAS_DIA) return false;
    const desde = agora - (m.tentativaEm ?? 0);
    return m.estado === 'rodando' ? desde > RODANDO_EXPIRA_MS : desde >= ESPERA_NOVA_TENTATIVA_MS;
}

/** Onde a marca fica: a transação do Firestore (ou um substituto no teste). */
export interface MarcasVigia {
    /** Toma a marca para tentar agora; false quando outro já tentou/está tentando ou não é hora. */
    reivindicar(empresaId: string, competencia: string, u: Usuario, hoje: string, agora: number): Promise<boolean>;
    concluir(empresaId: string, competencia: string, estado: Exclude<EstadoMarca, 'rodando'>, info: { importados: number; motivo?: string }): Promise<void>;
}

const ms = (t: unknown) => (t as Timestamp | null)?.toMillis?.() ?? null;

export const marcasFirestore: MarcasVigia = {
    async reivindicar(empresaId, competencia, u, hoje, agora) {
        const ref = doc(db, COL_MARCA, `${empresaId}_${competencia}`);
        return runTransaction(db, async tx => {
            const s = await tx.get(ref);
            const x = s.exists() ? s.data() : null;
            const m: MarcaVigia | null = x ? { dia: String(x.dia ?? ''), estado: x.estado, tentativas: Number(x.tentativas ?? 0), tentativaEm: ms(x.tentativaEm) } : null;
            if (!podeTentar(m, hoje, agora)) return false;
            tx.set(ref, { empresaId, competencia, dia: hoje, estado: 'rodando', tentativas: (m?.dia === hoje ? m.tentativas : 0) + 1, tentativaEm: serverTimestamp(), por: u.id, porEmail: u.email });
            return true;
        });
    },
    async concluir(empresaId, competencia, estado, info) {
        await updateDoc(doc(db, COL_MARCA, `${empresaId}_${competencia}`), { estado, importados: info.importados, motivo: (info.motivo ?? '').slice(0, 300), concluidoEm: serverTimestamp() });
    },
};

export interface DepsVigiaFechamento extends DepsImportacao {
    marcas: MarcasVigia;
    consultar: (p: PedidoIdentificadores) => Promise<RetornoIdentificadores>;
    listarEnvios: (empresaId: string) => Promise<Envio[]>;
}

export interface ResultadoCompetencia { competencia: string; situacao: 'nao-era-hora' | EstadoMarca | 'homologacao'; importacao?: ResultadoImportacao; motivo?: string }

/**
 * Uma competência: toma a marca, consulta os identificadores de S-1299 e S-1298 e grava os que faltam.
 * Falha (consulta, download ou gravação) volta 'falhou' — não marca como feito.
 */
export async function importarCompetencia(p: { empresa: { id: string; cnpj: string }; competencia: string; usuario: Usuario; tpAmb: TpAmb; hoje: string; agora: number }, deps: DepsVigiaFechamento): Promise<ResultadoCompetencia> {
    const { empresa, competencia } = p;
    if (p.tpAmb !== 1) return { competencia, situacao: 'homologacao' };
    let tomou = false;
    try { tomou = await deps.marcas.reivindicar(empresa.id, competencia, p.usuario, p.hoje, p.agora); } catch { tomou = false; }
    if (!tomou) return { competencia, situacao: 'nao-era-hora' };
    const concluir = async (estado: Exclude<EstadoMarca, 'rodando'>, importados: number, motivo?: string) => {
        await deps.marcas.concluir(empresa.id, competencia, estado, { importados, motivo }).catch(() => { /* a marca "rodando" expira em 10 min */ });
    };
    try {
        const governo: Partial<Record<string, { id: string; nrRec: string }[]>> = {};
        for (const tpEvt of TIPOS_FECHAMENTO) {
            const r = await deps.consultar({ cnpj: empresa.cnpj, tipo: 'empregador', tpEvt, perApur: competencia, certificado: 'escritorio', tpAmb: 1 });
            governo[tpEvt] = r.identificadores ?? [];
            // Reserva da cota atingida: para aqui, sem gravar nada (um S-1299 sem o S-1298 acenderia o selo à toa).
            if ((r.pedidosHoje ?? 0) >= RESERVA_PEDIDOS_DIA) {
                const motivo = `${r.pedidosHoje} pedidos de download hoje no empregador: o automático deixa a cota para a equipe`;
                await concluir('cota', 0, motivo);
                return { competencia, situacao: 'cota', motivo };
            }
        }
        const envios = await deps.listarEnvios(empresa.id);
        const importacao = await importarFechamentosDoGoverno({ empresa, perApur: competencia, tpAmb: 1, governo, envios, usuario: p.usuario }, { gravar: deps.gravar, baixar: deps.baixar });
        const naoGravados = importacao.ignorados.filter(x => x.motivo.startsWith('não gravado'));
        if (importacao.erro || naoGravados.length) {
            const motivo = importacao.erro ?? naoGravados.map(x => `${x.nrRecibo}: ${x.motivo}`).join('; ');
            await concluir('falhou', importacao.importados.length, motivo);
            return { competencia, situacao: 'falhou', importacao, motivo };
        }
        await concluir('feito', importacao.importados.length);
        return { competencia, situacao: 'feito', importacao };
    } catch (e) {
        const motivo = (e as Error)?.message ?? String(e);
        await concluir('falhou', 0, motivo);
        return { competencia, situacao: 'falhou', motivo };
    }
}

/** Última releitura da marca por aba (não relê a cada 20 s). */
const releitura = new Map<string, number>();
export const esquecerReleituras = () => releitura.clear();

/**
 * Rodada do vigia para os fechamentos: a competência aberta e a anterior da empresa ativa, só produção.
 * `deps` e o relógio são injetáveis para teste.
 */
export async function importarFechamentosAutomatico(empresa: { id: string; cnpj: string; competencia: string }, usuario: Usuario, deps: DepsVigiaFechamento,
    opcoes: { tpAmb?: TpAmb; agora?: number } = {}): Promise<ResultadoCompetencia[]> {
    const tpAmb = opcoes.tpAmb ?? 1;
    if (tpAmb !== 1 || !empresa.id || !empresa.cnpj) return [];
    const agora = opcoes.agora ?? Date.now();
    const hoje = diaBrasilia(agora);
    const out: ResultadoCompetencia[] = [];
    for (const competencia of competenciasDoVigia(empresa.competencia)) {
        const k = `${empresa.id}_${competencia}`;
        if (agora - (releitura.get(k) ?? -Infinity) < RELEITURA_MS) continue;
        releitura.set(k, agora);
        const r = await importarCompetencia({ empresa, competencia, usuario, tpAmb, hoje, agora }, deps);
        out.push(r);
        if (r.situacao === 'cota') break; // a cota é do empregador: a outra competência fica para amanhã
    }
    return out;
}

/** As dependências de verdade (CFI e Firestore). */
export const depsDoVigiaFechamento = (): DepsVigiaFechamento => ({
    marcas: marcasFirestore, consultar: consultarIdentificadores, listarEnvios, baixar: baixarRecibosDoGoverno, gravar: registrarFechamentoDoGoverno,
});
