// components/cadastros/MensagemHoleriteEmpresa.tsx
//
// Cadastros › Enquadramento › Mensagem no holerite: o texto geral da empresa impresso em todos os holerites (a tabela
// `mensa` do IOB), gravado nos parâmetros da folha. A mensagem de cada funcionário fica na aba Holerite da ficha.

import React, { useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { atualizarParametrosFolha } from '../../services/empresas/empresasService';
import { mensagemErro } from '../../services/cadastros/cadastrosService';

export const LIMITE_MENSAGEM_HOLERITE = 300;
const inp = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

const MensagemHoleriteEmpresa: React.FC<{ empresa: Empresa }> = ({ empresa }) => {
    const [texto, setTexto] = useState(empresa.parametrosFolha?.mensagemHolerite ?? '');
    const [salvo, setSalvo] = useState(empresa.parametrosFolha?.mensagemHolerite ?? '');
    const [ocupado, setOcupado] = useState(false);
    const [msg, setMsg] = useState(''); const [erro, setErro] = useState('');
    const longo = texto.trim().length > LIMITE_MENSAGEM_HOLERITE;

    async function gravar() {
        if (longo) return;
        setOcupado(true); setErro(''); setMsg('');
        try {
            const t = texto.trim();
            await atualizarParametrosFolha(empresa.id, p => { const n = { ...p }; if (t) n.mensagemHolerite = t; else delete n.mensagemHolerite; return n; });
            setSalvo(t); setTexto(t); setMsg('Mensagem do holerite gravada.');
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setOcupado(false); }
    }

    return (
        <section aria-label="Mensagem no holerite" className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 dark:text-slate-100">
            <p className="font-medium">Mensagem no holerite</p>
            <textarea aria-label="Mensagem geral do holerite" rows={2} className={`block w-full ${inp}`} value={texto} placeholder="Ex.: Feliz aniversário aos aniversariantes do mês!" onChange={e => setTexto(e.target.value)} />
            <div className="flex items-center gap-3">
                <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={texto.trim() === salvo || ocupado || longo} onClick={gravar}>{ocupado ? 'Gravando…' : 'Gravar'}</button>
                <span className={`text-xs ${longo ? 'text-red-700 dark:text-red-300' : 'text-slate-500'}`}>{texto.trim().length}/{LIMITE_MENSAGEM_HOLERITE}</span>
            </div>
            <p className="text-xs text-slate-500">Sai em todos os holerites em PDF da empresa, antes da assinatura, com as mensagens da aba Holerite de cada ficha.</p>
            {msg && <p role="status" className="text-xs text-green-700 dark:text-green-300">{msg}</p>}
            {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
        </section>
    );
};

export default MensagemHoleriteEmpresa;
