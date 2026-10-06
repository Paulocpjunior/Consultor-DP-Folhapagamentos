// services/empresaAtiva/empresaAtivaContext.tsx
//
// A empresa e a competência ativas chegam em qualquer tela por contexto (as
// abas são carregadas por lazy e ficam longe do MainTabs). Fora do Provider
// (testes isolados) o valor é nulo e as telas mantêm o seletor próprio.

import React, { createContext, useContext, useMemo } from 'react';
import type { EmpresaAtiva } from './empresaAtiva';

interface Ctx {
    ativa: EmpresaAtiva | null;
    /** Abre a tela de ativação para trocar de empresa ou de período. */
    trocar: () => void;
    /** Ativa outra empresa (ou período) direto, sem passar pela tela de ativação. */
    ativar?: (e: EmpresaAtiva) => void;
}

const EmpresaAtivaCtx = createContext<Ctx>({ ativa: null, trocar: () => {} });

export const EmpresaAtivaProvider: React.FC<Ctx & { children: React.ReactNode }> = ({ ativa, trocar, ativar, children }) => {
    const valor = useMemo(() => ({ ativa, trocar, ativar }), [ativa, trocar, ativar]);
    return <EmpresaAtivaCtx.Provider value={valor}>{children}</EmpresaAtivaCtx.Provider>;
};

export const useEmpresaAtiva = () => useContext(EmpresaAtivaCtx);
