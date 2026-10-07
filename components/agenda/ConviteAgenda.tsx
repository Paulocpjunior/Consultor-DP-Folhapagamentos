// components/agenda/ConviteAgenda.tsx
//
// "Baixar convite de agenda": o .ics com os vencimentos para anexar ao envio
// ao cliente (e-mail ou WhatsApp), o texto pronto para o WhatsApp com os
// links do Google Agenda e a lista dos eventos.

import React, { useState } from 'react';
import { gerarIcs, linkGoogleAgenda, textoWhatsApp, type EventoAgenda } from '../../services/agenda/convite';

const br = (d: string) => d.split('-').reverse().join('/');

interface Props { eventos: EventoAgenda[]; nomeArquivo: string; titulo: string }

const ConviteAgenda: React.FC<Props> = ({ eventos, nomeArquivo, titulo }) => {
    const [msg, setMsg] = useState('');
    if (!eventos.length) return null;

    function baixar() {
        const blob = new Blob([gerarIcs(eventos, titulo)], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nomeArquivo.endsWith('.ics') ? nomeArquivo : `${nomeArquivo}.ics`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMsg('Convite baixado: anexe o .ics ao e-mail ou ao WhatsApp do cliente.');
    }

    async function copiar() {
        try { await navigator.clipboard.writeText(textoWhatsApp(eventos, titulo)); setMsg('Texto copiado: cole na conversa do WhatsApp.'); }
        catch { setMsg('Não foi possível copiar; selecione os links abaixo.'); }
    }

    return (
        <div aria-label="Convite de agenda" className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Agenda do cliente</span>
                <button type="button" className="rounded bg-blue-700 px-2 py-1 text-white" onClick={baixar}>Baixar convite de agenda (.ics)</button>
                <button type="button" className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={copiar}>Copiar texto para WhatsApp</button>
            </div>
            <ul className="list-disc pl-5">
                {eventos.map(e => (
                    <li key={e.uid}>{br(e.inicio)}{e.fim && e.fim !== e.inicio ? ` a ${br(e.fim)}` : ''}: {e.titulo} · <a className="text-blue-700 underline dark:text-blue-300" href={linkGoogleAgenda(e)} target="_blank" rel="noopener noreferrer">Google Agenda</a></li>
                ))}
            </ul>
            <p className="text-slate-500 dark:text-slate-400">No e-mail ou no WhatsApp, o cliente abre o .ics e os eventos entram na agenda com lembrete na véspera. Os valores de INSS, IRRF e FGTS vão nas guias do mês, junto com a folha.</p>
            {msg && <p role="status" className="text-green-700 dark:text-green-400">{msg}</p>}
        </div>
    );
};

export default ConviteAgenda;
