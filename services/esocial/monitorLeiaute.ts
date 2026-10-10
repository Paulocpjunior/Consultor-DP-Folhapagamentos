// services/esocial/monitorLeiaute.ts
//
// Saúde do eSocial, etapa 5: o que o job agendado (scripts/esocial/monitorLeiaute.mjs) gravou sobre a
// documentação técnica do eSocial, e os alertas para o painel: versão de leiaute mais nova que a em uso pelo
// pré-voo, novidades recentes e monitor parado ou com erro.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ROTULO_VERSAO_XSD } from './validadorXsd';

export interface ItemDocumentacao { titulo: string; url: string }
export interface NovidadeDocumentacao extends ItemDocumentacao { detectadoEm: string; resumo: string | null; resumoModelo: string | null }
export interface MonitorLeiaute { verificadoEm: string | null; versoes: string[]; novidades: NovidadeDocumentacao[]; itens: ItemDocumentacao[]; erro: string | null }

export async function lerMonitorLeiaute(): Promise<MonitorLeiaute | null> {
    const s = await getDoc(doc(db, 'esocial_monitor', 'documentacao'));
    if (!s.exists()) return null;
    const x = s.data();
    return { verificadoEm: x.verificadoEm?.toDate?.()?.toISOString?.() ?? null, versoes: x.versoes ?? [], novidades: x.novidades ?? [], itens: x.itens ?? [], erro: x.erro ?? null };
}

const numero = (v: string) => { const [a, b] = v.replace('S-', '').split('.').map(Number); return a * 100 + b; };

export interface SituacaoMonitor { gravidade: 'critico' | 'atencao' | 'ok'; titulo: string; detalhe: string }

export function situacaoDoMonitor(m: MonitorLeiaute | null, agora: number, versaoEmUso = ROTULO_VERSAO_XSD): SituacaoMonitor[] {
    if (!m) return [{ gravidade: 'atencao', titulo: 'Monitor do leiaute ainda não rodou', detalhe: 'O job "Monitor do leiaute do eSocial" (GitHub Actions) precisa do segredo FIREBASE_SERVICE_ACCOUNT com gravação no Firestore.' }];
    const out: SituacaoMonitor[] = [];
    const maior = m.versoes.filter(v => /^S-\d+\.\d+$/.test(v)).sort((a, b) => numero(b) - numero(a))[0];
    if (maior && numero(maior) > numero(versaoEmUso)) out.push({ gravidade: 'critico', titulo: `Leiaute ${maior} citado na documentação do eSocial`, detalhe: `O pré-voo valida pelo ${versaoEmUso}. Confira a vigência e, quando valer, troque os XSDs (public/esocial-xsd/LEIAME.md) e rode os testes.` });
    if (m.erro) out.push({ gravidade: 'atencao', titulo: 'A última verificação falhou', detalhe: m.erro });
    const idade = m.verificadoEm ? agora - new Date(m.verificadoEm).getTime() : Infinity;
    if (idade > 8 * 86400000) out.push({ gravidade: 'atencao', titulo: 'Monitor do leiaute parado', detalhe: `Última verificação ${m.verificadoEm ? new Date(m.verificadoEm).toLocaleDateString('pt-BR') : 'nunca'}. Confira o job no GitHub Actions.` });
    const recentes = m.novidades.filter(n => agora - new Date(n.detectadoEm).getTime() < 30 * 86400000);
    if (recentes.length) out.push({ gravidade: 'atencao', titulo: `${recentes.length} novidade(s) na documentação técnica (30 dias)`, detalhe: recentes.slice(0, 3).map(n => n.titulo).join(' · ') });
    if (!out.length) out.push({ gravidade: 'ok', titulo: `Leiaute em uso ${versaoEmUso} em dia`, detalhe: `Sem novidades na documentação técnica nos últimos 30 dias.` });
    return out;
}
