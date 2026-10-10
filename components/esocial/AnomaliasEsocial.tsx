// components/esocial/AnomaliasEsocial.tsx
//
// Saúde do eSocial, etapa 3: anomalias da empresa e conciliação da competência com o eSocial (identificadores
// do governo × lotes do Consultor), com a ação de cada achado e as ocorrências que mais se repetem.

import React, { useEffect, useMemo, useState } from 'react';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { listarFuncionarios } from '../../services/cadastros/cadastrosService';
import { lerFolhaGravada } from '../../services/calculo/folhaGravadaService';
import { cofreDaMinhaCarteira, diasDaLinha } from '../../services/certificados/cofreCertificados';
import { registrarVerificacao, type Envio } from '../../services/esocial/transmissaoService';
import { anomaliasDaEmpresa, ocorrenciasFrequentes, prazoPeriodicos, type Anomalia, type Conciliacao } from '../../services/esocial/anomalias';
import { conciliarComEsocial } from '../../services/esocial/vigiaEsocial';

interface Props {
    empresa: { id: string; cnpj: string; nome: string; competencia: string };
    envios: Envio[];
    usuario?: Usuario;
    onMudou: () => void;
    onVerLote: (envioId: string) => void;
    /** Etapa 4: diagnóstico da ocorrência (a tela abre o lote com o diagnóstico). */
    onDiagnosticar?: (envioId: string) => void;
}

const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const COR = {
    critico: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100',
    atencao: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100',
    info: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
} as const;
const ICONE = { critico: '⛔', atencao: '⚠️', info: 'ℹ️' } as const;
const DICA: Partial<Record<Anomalia['acao'], string>> = {
    cofre: 'Empresas › Certificados (cofre).',
    fechamento: 'eSocial › Transmissão › Transmitir fechamento (S-1299).',
    'eventos-folha': 'Folha do mês › Cálculo mensal › S-1200 e S-1210.',
};

const AnomaliasEsocial: React.FC<Props> = ({ empresa, envios, usuario, onMudou, onVerLote, onDiagnosticar }) => {
    const [folha, setFolha] = useState<{ cpf: string; nome: string }[] | null>(null);
    const [certDias, setCertDias] = useState<number | null | undefined>(undefined);
    const [conc, setConc] = useState<Conciliacao | null>(null);
    const [pedidosHoje, setPedidosHoje] = useState<number | null>(null);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');
    const hoje = new Date().toLocaleDateString('sv-SE');

    useEffect(() => {
        let vivo = true;
        setFolha(null); setConc(null);
        Promise.all([lerFolhaGravada(empresa.id, empresa.competencia).catch(() => null), listarFuncionarios(empresa.id).catch(() => [])])
            .then(([f, fichas]) => {
                if (!vivo) return;
                const porId = new Map((fichas as { id: string; cpf: string }[]).map(x => [x.id, x] as const));
                setFolha(f ? f.holerites.map(h => ({ cpf: porId.get(h.fichaId)?.cpf ?? '', nome: h.nome })).filter(x => x.cpf) : []);
            });
        cofreDaMinhaCarteira().then(p => {
            if (!vivo) return;
            const d = empresa.cnpj.replace(/\D/g, '');
            const linha = p.linhas.find(l => l.cnpj.replace(/\D/g, '') === d);
            setCertDias(linha ? diasDaLinha(linha) : null);
        }).catch(() => { /* cofre fora do ar: sem o indicador */ });
        return () => { vivo = false; };
    }, [empresa.id, empresa.cnpj, empresa.competencia]);

    const anomalias = useMemo(() => anomaliasDaEmpresa({ competencia: empresa.competencia, hoje, envios, folhaGravada: folha, certificadoDias: certDias, conciliacao: conc }), [empresa.competencia, hoje, envios, folha, certDias, conc]);
    const frequentes = useMemo(() => ocorrenciasFrequentes(envios, hoje), [envios, hoje]);

    const agir = async (rotulo: string, f: () => Promise<string>) => {
        setOcupado(rotulo); setErro(''); setMsg('');
        try { setMsg(await f()); } catch (e) { setErro(`${rotulo.replace(/…$/, '')}: ${(e as Error).message}`); } finally { setOcupado(''); }
    };
    const conciliarAgora = () => agir('Conciliando com o eSocial…', async () => {
        const r = await conciliarComEsocial(empresa, empresa.competencia, envios);
        setConc(r.conciliacao); setPedidosHoje(r.pedidosHoje);
        const k = r.conciliacao;
        return `Conciliado: ${k.confirmados} evento(s) do Consultor confirmados no eSocial, ${k.naoEncontrados.length} não encontrado(s), ${k.foraDoConsultor.length} de outro sistema.`;
    });
    const resolverSemResposta = () => agir('Gravando os recibos achados…', async () => {
        if (!usuario || !conc) throw new Error('entre com seu usuário e concilie de novo.');
        for (const x of conc.semRespostaAchados) await registrarVerificacao(x.envio, x.achados, usuario);
        onMudou();
        return `${conc.semRespostaAchados.length} lote(s) "sem resposta" resolvido(s) com os recibos do eSocial: nada a reenviar.`;
    });

    const acao = (a: Anomalia) => {
        if (a.acao === 'conciliar') return <button className={btn} disabled={!!ocupado || !usuario} onClick={conciliarAgora}>Conciliar com o eSocial</button>;
        if (a.acao === 'resolver-sem-resposta') return <button className={btn} disabled={!!ocupado || !usuario} onClick={resolverSemResposta}>Gravar os recibos</button>;
        if (a.acao === 'diagnosticar' && a.envioId) return <button className={btn} onClick={() => (onDiagnosticar ?? onVerLote)(a.envioId!)}>Ver diagnóstico</button>;
        if (a.envioId) return <button className={btn} onClick={() => onVerLote(a.envioId!)}>Ver lote</button>;
        return DICA[a.acao] ? <span className="text-xs opacity-80">{DICA[a.acao]}</span> : null;
    };

    return (
        <section aria-label="Anomalias e conciliação" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-800 dark:text-white">Anomalias e conciliação · {empresa.competencia.split('-').reverse().join('/')}</h3>
                <button className={btn} disabled={!!ocupado || !usuario} onClick={conciliarAgora} title="Compara os S-1200, S-1210, S-1299 e S-1298 da competência no eSocial (produção) com os lotes do Consultor, pelos identificadores (sem baixar os XMLs).">Conciliar com o eSocial</button>
            </div>
            <p className="text-xs text-slate-500">Prazo dos periódicos desta competência: {prazoPeriodicos(empresa.competencia).split('-').reverse().join('/')} (antecipa para o dia útil anterior).{pedidosHoje !== null && ` Pedidos de download hoje nesta empresa: ${pedidosHoje}.`}</p>
            {ocupado && <p className="text-sm text-slate-500">{ocupado}</p>}
            {erro && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{msg}</p>}
            {folha && !anomalias.length && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">✓ Nenhuma anomalia encontrada{conc ? ' e a competência confere com o eSocial' : ''}.</p>}
            {anomalias.map(a => (
                <div key={a.id} className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm ${COR[a.gravidade]}`}>
                    <div className="min-w-0 flex-1"><p className="font-medium">{ICONE[a.gravidade]} {a.titulo}</p><p className="opacity-90">{a.detalhe}</p></div>
                    {acao(a)}
                </div>
            ))}
            {frequentes.length > 0 && (
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <p className="font-medium text-slate-800 dark:text-slate-100">Ocorrências que mais se repetem (30 dias)</p>
                    <ul className="mt-1 space-y-0.5 text-slate-700 dark:text-slate-300">
                        {frequentes.map(o => <li key={o.codigo}><strong>{o.codigo}</strong> · {o.vezes}× · {o.tipos.join(', ')} — {o.descricao}</li>)}
                    </ul>
                </div>
            )}
        </section>
    );
};

export default AnomaliasEsocial;
