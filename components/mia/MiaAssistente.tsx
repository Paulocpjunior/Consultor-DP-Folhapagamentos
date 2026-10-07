// components/mia/MiaAssistente.tsx
//
// MiA, a agente de IA do DP: botão flutuante em todas as telas. Ela responde
// legislação trabalhista e previdenciária (com a base legal e as fontes da
// busca), explica o cálculo e as divergências da tela aberta e guia pelo app.
// A conversa fica só nesta aba do navegador; nada é gravado.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { contextoMiaAtual, ouvirContextoMia, perguntarMia, type MensagemMia } from '../../services/mia/mia';

const SUGESTOES = [
    'Qual o prazo para pagar as férias?',
    'Como fica o INSS de quem ganha acima do teto?',
    'Explique o cálculo do holerite aberto',
    'Onde gero o arquivo bancário?',
];

/** Negrito com **texto** e quebras de linha; o resto como texto puro (sem HTML vindo da IA). */
function Texto({ t }: { t: string }) {
    return <>{t.split('\n').map((linha, i) => (
        <React.Fragment key={i}>{i > 0 && <br />}{linha.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <React.Fragment key={j}>{p}</React.Fragment>))}</React.Fragment>
    ))}</>;
}

const MiaAssistente: React.FC<{ aba: string }> = ({ aba }) => {
    const [aberta, setAberta] = useState(false);
    const [conversa, setConversa] = useState<MensagemMia[]>([]);
    const [texto, setTexto] = useState('');
    const [pensando, setPensando] = useState(false);
    const [erro, setErro] = useState('');
    const [usarTela, setUsarTela] = useState(true);
    const contexto = useSyncExternalStore(ouvirContextoMia, contextoMiaAtual);
    const fim = useRef<HTMLDivElement>(null);
    // Cada conversa tem um número: resposta pedida antes de "Nova conversa" é descartada.
    const geracao = useRef(0);
    useEffect(() => { fim.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [conversa, pensando, aberta]);

    async function enviar(pergunta = texto) {
        const p = pergunta.trim();
        if (!p || pensando) return;
        // A tela guarda a conversa inteira; o pedido leva só as últimas trocas completas (perguntarMia).
        const nova = [...conversa, { papel: 'usuaria' as const, texto: p }];
        const minha = geracao.current;
        setConversa(nova); setTexto(''); setErro(''); setPensando(true);
        try { const r = await perguntarMia(nova, usarTela ? contexto : null, aba); if (minha === geracao.current) setConversa(c => [...c, r]); }
        catch (e) {
            if (minha !== geracao.current) return;
            const m = (e as Error).message;
            // Rota ainda não publicada no CFI: o Express devolve 404 sem corpo JSON.
            setErro(/HTTP 404/.test(m) ? 'A MiA ainda não está no ar: falta publicar a rota dela no CFI.' : `A MiA não respondeu: ${m}`);
        }
        finally { if (minha === geracao.current) setPensando(false); }
    }
    function novaConversa() { geracao.current++; setConversa([]); setErro(''); setPensando(false); }

    return (
        <>
            <button type="button" aria-label={aberta ? 'Fechar a MiA' : 'Falar com a MiA'} onClick={() => setAberta(a => !a)}
                className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:scale-105 transition-transform print:hidden">
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-base">{aberta ? '✕' : '👩🏻‍💼'}</span>
                {!aberta && <span>MiA</span>}
            </button>
            {aberta && (
                <section role="dialog" aria-label="MiA, agente de IA do DP" className="fixed bottom-20 right-5 z-50 flex h-[32rem] max-h-[80vh] w-[24rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl dark:border-violet-800 dark:bg-slate-800 print:hidden">
                    <header className="flex items-start justify-between gap-2 bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-3 text-white">
                        <div>
                            <p className="font-semibold">MiA</p>
                            <p className="text-xs text-white/85">Agente de IA do DP · legislação, cálculo, conferência e o app</p>
                        </div>
                        {conversa.length > 0 && <button type="button" className="rounded bg-white/15 px-2 py-1 text-xs hover:bg-white/25" onClick={novaConversa}>Nova conversa</button>}
                    </header>
                    <div className="flex-1 space-y-3 overflow-y-auto bg-violet-50/40 p-3 text-sm dark:bg-slate-900/40">
                        {!conversa.length && (
                            <div className="space-y-2 text-slate-700 dark:text-slate-200">
                                <p>Oi! Eu sou a <strong>MiA</strong>, a agente de IA do DP. Posso tirar dúvidas de legislação trabalhista e previdenciária, explicar o cálculo e as divergências da tela aberta e mostrar onde fica cada coisa no app.</p>
                                <div className="flex flex-wrap gap-1">{SUGESTOES.map(s => <button key={s} type="button" className="rounded-full border border-violet-300 bg-white px-2 py-1 text-xs text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-800 dark:text-violet-200" onClick={() => enviar(s)}>{s}</button>)}</div>
                            </div>
                        )}
                        {conversa.map((m, i) => (
                            <div key={i} className={m.papel === 'usuaria' ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600 px-3 py-2 text-white' : 'max-w-[92%] rounded-2xl rounded-bl-sm border border-violet-100 bg-white px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}>
                                <Texto t={m.texto} />
                                {m.fontes && m.fontes.length > 0 && (
                                    <ul className="mt-2 space-y-0.5 border-t border-violet-100 pt-1 text-xs dark:border-slate-700">
                                        <li className="text-slate-500">Fontes:</li>
                                        {m.fontes.map(f => <li key={f.uri}><a className="text-violet-700 underline dark:text-violet-300" href={f.uri} target="_blank" rel="noopener noreferrer">{f.titulo}</a></li>)}
                                    </ul>
                                )}
                            </div>
                        ))}
                        {pensando && <p role="status" className="text-xs text-violet-700 dark:text-violet-300">MiA está pensando…</p>}
                        {erro && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                        <div ref={fim} />
                    </div>
                    <div className="space-y-1 border-t border-violet-100 p-2 dark:border-slate-700">
                        <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300" title="O que está aberto na tela vai junto da pergunta (sem CPF).">
                            <input type="checkbox" checked={usarTela} onChange={e => setUsarTela(e.target.checked)} />
                            Usar a tela aberta{contexto ? `: ${contexto.tela}` : ` (${aba})`}
                        </label>
                        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); enviar(); }}>
                            <textarea aria-label="Pergunta para a MiA" rows={2} value={texto} onChange={e => setTexto(e.target.value)} maxLength={4000}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                                placeholder="Pergunte à MiA…" className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                            <button type="submit" disabled={!texto.trim() || pensando} className="rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Enviar</button>
                        </form>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">A MiA pode errar: confira a base legal. Ela não grava nem transmite nada no sistema; a pergunta e a tela vão ao Gemini (Google) da conta do escritório só para responder.</p>
                    </div>
                </section>
            )}
        </>
    );
};

export default MiaAssistente;
