// components/cadastros/InicioObrigacoesEmpresa.tsx
//
// Cadastros › Enquadramento › Início das obrigações: a competência em que a empresa passou a declarar na DCTFWeb e a
// do FGTS Digital (services/empresas/inicioObrigacoes.ts), gravadas nos parâmetros da folha da empresa.

import React, { useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { atualizarParametrosFolha } from '../../services/empresas/empresasService';
import { mensagemErro } from '../../services/cadastros/cadastrosService';
import { INICIO_FGTS_DIGITAL, validarInicios } from '../../services/empresas/inicioObrigacoes';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

const InicioObrigacoesEmpresa: React.FC<{ empresa: Empresa }> = ({ empresa }) => {
    const [dctf, setDctf] = useState(empresa.parametrosFolha?.inicioDctfweb ?? '');
    const [fgts, setFgts] = useState(empresa.parametrosFolha?.inicioFgtsDigital ?? '');
    const [salvo, setSalvo] = useState({ dctf: empresa.parametrosFolha?.inicioDctfweb ?? '', fgts: empresa.parametrosFolha?.inicioFgtsDigital ?? '' });
    const [ocupado, setOcupado] = useState(false);
    const [msg, setMsg] = useState(''); const [erro, setErro] = useState('');
    const v = validarInicios({ inicioDctfweb: dctf || undefined, inicioFgtsDigital: fgts || undefined });
    const mudou = dctf !== salvo.dctf || fgts !== salvo.fgts;

    async function gravar() {
        if (v.erros.length) return;
        setOcupado(true); setErro(''); setMsg('');
        try {
            await atualizarParametrosFolha(empresa.id, p => {
                const n = { ...p };
                if (dctf) n.inicioDctfweb = dctf; else delete n.inicioDctfweb;
                if (fgts) n.inicioFgtsDigital = fgts; else delete n.inicioFgtsDigital;
                return n;
            });
            setSalvo({ dctf, fgts }); setMsg('Início das obrigações gravado.');
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setOcupado(false); }
    }

    return (
        <section aria-label="Início das obrigações" className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 dark:text-slate-100">
            <p className="font-medium">Início das obrigações da empresa</p>
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs">DCTFWeb desde (competência)<input aria-label="Início da DCTFWeb" type="month" className={`mt-0.5 block ${inp}`} value={dctf} onChange={e => setDctf(e.target.value)} /></label>
                <label className="text-xs">FGTS Digital desde (competência)<input aria-label="Início do FGTS Digital" type="month" className={`mt-0.5 block ${inp}`} value={fgts} placeholder={INICIO_FGTS_DIGITAL} onChange={e => setFgts(e.target.value)} /></label>
                <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!mudou || ocupado || v.erros.length > 0} onClick={gravar}>{ocupado ? 'Gravando…' : 'Gravar'}</button>
            </div>
            <p className="text-xs text-slate-500">Antes do início, as contribuições previdenciárias são da GFIP/GPS e o FGTS da SEFIP/GRF: o Consultor avisa nas competências antigas (DCTFWeb da folha e consulta do FGTS Digital). O FGTS Digital vale para todos os empregadores desde a competência 03/2024 (em branco, vale esse); a DCTFWeb entrou por grupos, então informe o mês da empresa.</p>
            {v.erros.length > 0 && <ul role="alert" className="list-disc pl-5 text-xs text-red-700 dark:text-red-300">{v.erros.map(x => <li key={x}>{x}</li>)}</ul>}
            {v.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">{v.avisos.map(x => <li key={x}>{x}</li>)}</ul>}
            {msg && <p role="status" className="text-xs text-green-700 dark:text-green-300">{msg}</p>}
            {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
        </section>
    );
};

export default InicioObrigacoesEmpresa;
