// components/prazos/LembreteAniversariantes.tsx
//
// Prazos do DP: lembrete dos aniversariantes do mês da empresa ativa (Paulo, 12/10/2026), com quem já recebeu o
// cartão (histórico dos envios) e o atalho para Relatórios › Aniversariantes do mês, onde saem os cartões.

import React, { useEffect, useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { aniversariantesDoMes } from '../../services/relatorios/aniversarios';
import { jaRecebeu, type HistoricoDeEnvios, type HistoricoEnvios } from '../../services/relatorios/enviosFuncionario';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

interface Props {
    empresa: { id: string; nome: string; competencia: string };
    /** Fichas ativas (de todas as empresas: o lembrete filtra a da empresa). */
    fichas: FichaFuncionario[];
    /** Hoje, AAAA-MM-DD (o mês do lembrete). */
    hoje: string;
    /** Envios do cartão no mês (sem ele, não mostra quem já recebeu). */
    historico?: HistoricoDeEnvios;
    onAbrir?: () => void;
}

const LembreteAniversariantes: React.FC<Props> = ({ empresa, fichas, hoje, historico, onAbrir }) => {
    const mes = hoje.slice(0, 7);
    const lista = useMemo(() => aniversariantesDoMes(fichas.filter(f => f.empresaId === empresa.id), mes), [fichas, empresa.id, mes]);
    const [hist, setHist] = useState<HistoricoEnvios | null>(null);
    useEffect(() => {
        let vivo = true;
        setHist(null);
        historico?.listar().then(h => { if (vivo) setHist(h); }).catch(() => { /* sem o histórico, o lembrete sai sem a contagem */ });
        return () => { vivo = false; };
    }, [historico]);
    if (!lista.length) return null;

    const recebeu = (id: string) => jaRecebeu(hist, id, 'email') || jaRecebeu(hist, id, 'whatsapp');
    const enviados = hist ? lista.filter(a => recebeu(a.ficha.id)).length : null;
    const dia = hoje.slice(8, 10);
    const nomeMes = MESES[Number(mes.slice(5, 7)) - 1];
    return (
        <section aria-label="Aniversariantes do mês" className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm dark:border-pink-900 dark:bg-pink-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-slate-800 dark:text-slate-100">
                    <strong>{lista.length} aniversariante(s) em {nomeMes}</strong> · {empresa.nome}
                    {enviados !== null && <span className="text-slate-600 dark:text-slate-300"> · {enviados} de {lista.length} já receberam o cartão</span>}
                </p>
                {onAbrir && <button className="rounded-lg bg-pink-600 px-3 py-1.5 text-white hover:bg-pink-500" onClick={onAbrir}>Enviar os cartões</button>}
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-700 dark:text-slate-200">
                {lista.map(a => (
                    <li key={a.ficha.id} className={a.dia < dia ? 'opacity-60' : ''}>
                        <span className="font-mono">{a.dia}</span> {a.nome}
                        {a.dia === dia && <strong className="text-pink-700 dark:text-pink-300"> · hoje</strong>}
                        {hist && recebeu(a.ficha.id) && <span className="text-green-700 dark:text-green-300"> ✓</span>}
                    </li>
                ))}
            </ul>
            {empresa.competencia !== mes && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                    A tela dos cartões usa a competência ativa ({empresa.competencia.slice(5)}/{empresa.competencia.slice(0, 4)}): para os de {nomeMes}, troque o período para {mes.slice(5)}/{mes.slice(0, 4)}.
                </p>
            )}
        </section>
    );
};

export default LembreteAniversariantes;
