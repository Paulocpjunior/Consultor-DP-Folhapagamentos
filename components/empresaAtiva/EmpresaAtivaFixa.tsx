// components/empresaAtiva/EmpresaAtivaFixa.tsx
//
// No lugar do seletor de empresa de cada tela: mostra a empresa ativa da
// sessão e o atalho para trocar (a troca é uma só, no app inteiro).

import React from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';

const EmpresaAtivaFixa: React.FC<{ rotulo?: string }> = ({ rotulo = 'Empresa' }) => {
    const { ativa, trocar } = useEmpresaAtiva();
    if (!ativa) return null;
    return (
        <span className="text-sm dark:text-white">
            {rotulo}{' '}
            <strong aria-label="Empresa ativa">{ativa.codigoSage} · {ativa.nome}</strong>{' '}
            <button type="button" onClick={trocar} className="ml-1 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">⇄ trocar</button>
        </span>
    );
};

export default EmpresaAtivaFixa;
