// components/cadastros/CadastrosPanel.tsx
//
// Módulo Cadastros (menu Arquivos do IOB Office): Funcionários, Sindicatos,
// Tabelas legais e o atalho para o Catálogo de Eventos que já existe na Folha.
// Dados no Firestore (services/cadastros/cadastrosService.ts), com auditoria.

import React, { useCallback, useEffect, useState } from 'react';
import type { User } from '../../types';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import { listarAfastamentos, listarHorarios, listarSindicatos, listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { Horario } from '../../services/cadastros/horarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import FuncionariosCadastro from './FuncionariosCadastro';
import SindicatosCadastro from './SindicatosCadastro';
import TabelasLegaisCadastro from './TabelasLegaisCadastro';
import HorariosCadastro from './HorariosCadastro';
import AfastamentosCadastro from './AfastamentosCadastro';
import IncidenciasCadastro from './IncidenciasCadastro';

export type SubCadastro = 'funcionarios' | 'horarios' | 'afastamentos' | 'incidencias' | 'sindicatos' | 'tabelas';

interface Props { currentUser: User; subInicial?: SubCadastro; onAbrirEventos?: () => void }

const SUBS: { id: SubCadastro; titulo: string; caminho: string }[] = [
    { id: 'funcionarios', titulo: 'Funcionários', caminho: 'Arquivos › Funcionários › Cadastro Básico' },
    { id: 'horarios', titulo: 'Horários', caminho: 'Arquivos › Horários › Tabela de Horários' },
    { id: 'afastamentos', titulo: 'Afastamentos', caminho: 'Arquivos › Afastamentos/Retorno (S-2230)' },
    { id: 'incidencias', titulo: 'Incidências', caminho: 'eSocial › Rotinas Auxiliares › Relacionamento de Rubricas (SGC) · Arquivos › Eventos' },
    { id: 'sindicatos', titulo: 'Sindicatos', caminho: 'Arquivos › Sindicatos' },
    { id: 'tabelas', titulo: 'Tabelas legais', caminho: 'Cadastros › Genéricos › Tabelas Legais (SGC)' },
];

const CadastrosPanel: React.FC<Props> = ({ currentUser, subInicial, onAbrirEventos }) => {
    const [sub, setSub] = useState<SubCadastro>(subInicial ?? 'funcionarios');
    const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
    const [empresaId, setEmpresaId] = useState('');
    const [erroEmpresas, setErroEmpresas] = useState('');
    const [sindicatos, setSindicatos] = useState<Sindicato[] | null>(null);
    const [erroSind, setErroSind] = useState('');
    const [tabelas, setTabelas] = useState<TabelaLegal[] | null>(null);
    const [erroTab, setErroTab] = useState('');
    const [horarios, setHorarios] = useState<Horario[] | null>(null);
    const [erroHor, setErroHor] = useState('');
    const [afastamentos, setAfastamentos] = useState<Afastamento[] | null>(null);
    const [erroAfa, setErroAfa] = useState('');
    const usuario: Usuario = { id: currentUser.uid ?? currentUser.id, email: currentUser.email };
    const isAdmin = currentUser.role === 'admin';

    useEffect(() => { listarTodasEmpresas().then(setEmpresas).catch(e => { setErroEmpresas(mensagemErro(e)); setEmpresas([]); }); }, []);
    const carregarSindicatos = useCallback(() => { setErroSind(''); listarSindicatos().then(setSindicatos).catch(e => { setErroSind(mensagemErro(e)); setSindicatos([]); }); }, []);
    const carregarTabelas = useCallback(() => { setErroTab(''); listarTabelas().then(setTabelas).catch(e => { setErroTab(mensagemErro(e)); setTabelas([]); }); }, []);
    useEffect(carregarSindicatos, [carregarSindicatos]);
    useEffect(carregarTabelas, [carregarTabelas]);
    const carregarHorarios = useCallback(() => {
        setErroHor(''); setHorarios(null);
        if (empresaId) listarHorarios(empresaId).then(setHorarios).catch(e => { setErroHor(mensagemErro(e)); setHorarios([]); });
    }, [empresaId]);
    const carregarAfastamentos = useCallback(() => {
        setErroAfa(''); setAfastamentos(null);
        if (empresaId) listarAfastamentos(empresaId).then(setAfastamentos).catch(e => { setErroAfa(mensagemErro(e)); setAfastamentos([]); });
    }, [empresaId]);
    useEffect(carregarHorarios, [carregarHorarios]);
    useEffect(carregarAfastamentos, [carregarAfastamentos]);
    const porEmpresa = sub === 'funcionarios' || sub === 'horarios' || sub === 'afastamentos' || sub === 'incidencias';

    const empresa = empresas?.find(e => e.id === empresaId);
    const atual = SUBS.find(s => s.id === sub)!;

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Cadastros</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Os cadastros do menu Arquivos do IOB Office, mantidos no Consultor DP. Cada gravação fica no histórico com autor e data.</p>
            </header>

            <nav aria-label="Cadastros" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
                {SUBS.map(s => (
                    <button key={s.id} onClick={() => setSub(s.id)}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${s.id === sub ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
                        {s.titulo}
                    </button>
                ))}
                {onAbrirEventos && <button onClick={onAbrirEventos} className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400" title="Abre Folha › Catálogo de Eventos">Eventos ↗</button>}
            </nav>
            <p className="text-xs text-slate-500 dark:text-slate-400">No IOB: {atual.caminho}</p>

            {porEmpresa && (
                <div className="space-y-3">
                    <label className="block max-w-md text-sm font-medium text-slate-700 dark:text-slate-200">Empresa
                        <select className="mt-1 block w-full rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={empresaId} onChange={e => setEmpresaId(e.target.value)} aria-label="Empresa">
                            <option value="">{empresas ? 'Selecione a empresa' : 'Carregando…'}</option>
                            {empresas?.map(e => <option key={e.id} value={e.id}>{e.codigoSage} · {e.nomeFantasia || e.razaoSocial}</option>)}
                        </select>
                    </label>
                    {erroEmpresas && <p role="alert" className="text-sm text-red-700">{erroEmpresas}</p>}
                    {!empresa && <p className="text-sm text-slate-500">Selecione a empresa.</p>}
                    {empresa && sub === 'funcionarios' && <FuncionariosCadastro key={empresa.id} empresa={empresa} usuario={usuario} isAdmin={isAdmin} sindicatos={sindicatos ?? []} horarios={horarios ?? []} afastamentos={afastamentos ?? []} />}
                    {empresa && sub === 'horarios' && <HorariosCadastro key={empresa.id} empresa={empresa} horarios={horarios} erroLista={erroHor} usuario={usuario} isAdmin={isAdmin} onRecarregar={carregarHorarios} />}
                    {empresa && sub === 'incidencias' && <IncidenciasCadastro key={empresa.id} empresa={empresa} usuario={usuario} />}
                    {empresa && sub === 'afastamentos' && <AfastamentosCadastro key={empresa.id} empresa={empresa} afastamentos={afastamentos} erroLista={erroAfa} usuario={usuario} isAdmin={isAdmin} onRecarregar={carregarAfastamentos} />}
                </div>
            )}
            {sub === 'sindicatos' && <SindicatosCadastro sindicatos={sindicatos} erroLista={erroSind} usuario={usuario} isAdmin={isAdmin} onRecarregar={carregarSindicatos} />}
            {sub === 'tabelas' && <TabelasLegaisCadastro tabelas={tabelas} erroLista={erroTab} usuario={usuario} isAdmin={isAdmin} onRecarregar={carregarTabelas} />}
        </div>
    );
};

export default CadastrosPanel;
