import React, { useEffect, useMemo, useState } from 'react';
import { ehAdmin, ehGestor } from '../../services/auth/papeis';
import { listarEmpresasVisiveis, excluirEmpresa, protegerEmpresasExistentes } from '../../services/empresas/empresasService';
import { chaveCnpj, chaveSage, repetidas } from '../../services/empresas/chavesUnicas';
import { filtrarEmpresas } from '../../services/empresas/buscaEmpresas';
import { formatCnpj } from '../../services/brasilApiService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { User } from '../../types';
import EmpresaForm from './EmpresaForm';
import { ROTULO_SITUACAO, cofreDaMinhaCarteira, diasDaLinha, precisaAtencao, type LinhaCofre } from '../../services/certificados/cofreCertificados';
import { buscarCadastroCentral, conferirEmpresas, type ConferenciaCadastroCentral } from '../../services/cadastroCentralConferencia';
import { tokenParaCfi } from '../../services/auth/tokenCfi';

interface Props { currentUser: User; /** Aberto pelo menu do app: o título vem do cabeçalho da página. */ embutido?: boolean }

const EmpresasPanel: React.FC<Props> = ({ currentUser, embutido = false }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading]   = useState(true);
    const [erro, setErro]         = useState('');
    const [showForm, setShowForm] = useState(false);
    const [empresaEditando, setEmpresaEditando] = useState<Empresa | null>(null);
    const [expandedCert, setExpandedCert] = useState<string | null>(null);
    const [busca, setBusca] = useState('');

    const isAdmin = ehAdmin(currentUser.role);
    const isGestor = ehGestor(currentUser.role);
    // Mesma condição das regras: gestor; quem cadastrou; admin nas empresas que enxerga (carteira ou cadastradas por ele).
    const podeEditar = (e: Empresa) => isGestor || isAdmin || e.criadoPor === ((currentUser as any).uid ?? currentUser.id);

    // Certificados vêm do cofre único (CFI + Legal); falha aqui não esconde as empresas.
    const [cofre, setCofre] = useState<Map<string, LinhaCofre> | null>(null);
    const [erroCofre, setErroCofre] = useState('');
    const carregarCofre = () => {
        setErroCofre('');
        cofreDaMinhaCarteira().then(r => setCofre(new Map(r.linhas.map(l => [l.cnpj, l])))).catch(e => setErroCofre((e as Error).message));
    };

    const reload = async () => {
        carregarCofre(); // "Atualizar" também traz a situação do cofre (renovação pode ter acontecido no Legal)
        setLoading(true); setErro('');
        try {
            const list = await listarEmpresasVisiveis();
            setEmpresas(list);
        } catch (e: any) {
            setErro(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); }, []);

    // Conferência com o cadastro central do CFI (08/08): as empresas daqui
    // cruzadas com as de lá, pelo túnel. Falha do túnel não acende nada —
    // vigilância, não pré-requisito.
    const [confCentral, setConfCentral] = useState<ConferenciaCadastroCentral | null>(null);
    useEffect(() => {
        if (!empresas.length) { setConfCentral(null); return; }
        let vivo = true;
        buscarCadastroCentral(() => tokenParaCfi()).then((central) => {
            if (!vivo || !central) return;
            setConfCentral(conferirEmpresas(empresas as any, central));
        });
        return () => { vivo = false; };
    }, [empresas]);

    // Código SAGE ou CNPJ repetido entre as empresas visíveis (cadastro de antes da trava).
    const dup = useMemo(() => repetidas(empresas), [empresas]);
    const chavesRepetidas = useMemo(() => new Set(dup.map(d => `${d.tipo}_${d.valor}`)), [dup]);
    const [protegendo, setProtegendo] = useState('');
    const [msgProtecao, setMsgProtecao] = useState('');
    const [falhasProtecao, setFalhasProtecao] = useState<string[]>([]);
    const visiveis = useMemo(() => filtrarEmpresas(empresas, busca), [empresas, busca]);
    const proteger = async () => {
        setProtegendo('Protegendo 0 de ' + empresas.length + '…'); setMsgProtecao(''); setFalhasProtecao([]);
        try {
            const r = await protegerEmpresasExistentes(empresas, n => setProtegendo(`Protegendo ${n} de ${empresas.length}…`));
            setMsgProtecao(`Códigos e CNPJs protegidos: ${r.reservadas} chave(s) reservada(s)${r.normalizadas ? `, ${r.normalizadas} cadastro(s) com o código ou o CNPJ acertado para o formato padrão` : ''}.${r.repetidas.length ? ` Continuam repetidos ${r.repetidas.length}: corrija o cadastro (a empresa mais antiga ficou com a chave).` : ''}${r.falhas.length ? ` ${r.falhas.length} empresa(s) não puderam ser protegidas (lista abaixo).` : ''}`);
            setFalhasProtecao(r.falhas);
            if (r.normalizadas) reload();
        } catch (e) { setMsgProtecao((e as Error).message); }
        finally { setProtegendo(''); }
    };

    const apagar = async (id: string, nome: string) => {
        if (!confirm(`Excluir a empresa "${nome}"?\nIsso não pode ser desfeito.`)) return;
        await excluirEmpresa(id);
        reload();
    };

    return (
        <div>
            {confCentral && (confCentral.foraDoCadastro.length > 0 || confCentral.nomesDivergentes.length > 0) && (
                <div className="mb-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm">
                    <div className="font-extrabold text-red-800 dark:text-red-300 mb-1">
                        🧭 Cadastro central: {confCentral.foraDoCadastro.length > 0
                            ? `${confCentral.foraDoCadastro.length} CNPJ(s) que o Consultor Fiscal não conhece`
                            : `${confCentral.nomesDivergentes.length} nome(s) divergente(s)`}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                        A empresa se cadastra no Consultor Fiscal — 1 vez cadastrada, todos os módulos enxergam.
                        CNPJ que só existe aqui ou está digitado errado, ou a empresa está fora do cadastro central
                        (e de todos os módulos). Quem arruma é gente, na fonte: o app não corrige cadastro.
                    </p>
                    {confCentral.foraDoCadastro.slice(0, 8).map((f) => (
                        <div key={f.cnpj} className="text-xs py-0.5 text-slate-700 dark:text-slate-300">
                            <strong>{f.cnpj}</strong> — {f.nome || 'sem nome'}
                        </div>
                    ))}
                    {confCentral.foraDoCadastro.length > 8 && (
                        <div className="text-xs text-slate-500">mostrando 8 de {confCentral.foraDoCadastro.length}</div>
                    )}
                    {confCentral.nomesDivergentes.slice(0, 5).map((d) => (
                        <div key={d.cnpj} className="text-xs py-0.5 text-slate-500 dark:text-slate-400">
                            {d.cnpj}: aqui “{d.nomeAqui}” · CFI “{d.nomeCentral}”
                        </div>
                    ))}
                </div>
            )}
            <header className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                    {!embutido && <h2 className="text-xl font-bold text-slate-800 dark:text-white">🏢 Empresas</h2>}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {empresas.length} empresa(s) {isGestor ? '(todas — gestor)' : '(sua carteira e as que você cadastrou)'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={reload}
                        className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                        ↻ Atualizar
                    </button>
                    {!showForm && (
                        <button onClick={() => setShowForm(true)}
                            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium">
                            + Nova empresa
                        </button>
                    )}
                </div>
            </header>

            {erro && <div className="mb-3 p-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded">{erro}</div>}

            {dup.length > 0 && (
                <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                    <strong>Cadastro repetido:</strong> o código SAGE e o CNPJ são únicos por empresa. Corrija em "Editar" (o código certo está no IOB):
                    <ul className="mt-1 list-disc pl-5 text-xs">
                        {dup.map(d => <li key={`${d.tipo}${d.valor}`}>{d.tipo === 'sage' ? `Código SAGE ${d.valor}` : `CNPJ ${formatCnpj(d.valor)}`}: {d.empresas.map(e => e.nomeFantasia || e.razaoSocial).join(' · ')}</li>)}
                    </ul>
                </div>
            )}
            {isGestor && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <button onClick={proteger} disabled={!!protegendo || !empresas.length} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600">🔒 Proteger códigos e CNPJs das empresas existentes</button>
                    <span>{protegendo || msgProtecao || 'Empresa nova já nasce protegida; as cadastradas antes da trava precisam disto uma vez.'}</span>
                    {falhasProtecao.length > 0 && (
                        <ul className="w-full list-disc pl-5 text-red-700 dark:text-red-300">{falhasProtecao.map(f => <li key={f}>{f}</li>)}</ul>
                    )}
                </div>
            )}

            {empresas.length > 0 && (
                <div className="mb-3 flex items-center gap-2">
                    <input type="search" aria-label="Buscar empresa" value={busca} onChange={ev => setBusca(ev.target.value)}
                        placeholder="Buscar por nome, razão social, CNPJ ou código SAGE"
                        className="w-full max-w-md rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                    {busca && <span className="text-xs text-slate-500 dark:text-slate-400">{visiveis.length} de {empresas.length}</span>}
                </div>
            )}

            {showForm && (
                <div className="mb-4">
                    <EmpresaForm
                        currentUser={currentUser}
                        empresaParaEditar={empresaEditando}
                        onSalvo={() => { setShowForm(false); setEmpresaEditando(null); reload(); }}
                        onCancelar={() => { setShowForm(false); setEmpresaEditando(null); }}
                    />
                </div>
            )}

            {loading ? (
                <div className="py-8 text-center text-slate-500">Carregando empresas…</div>
            ) : empresas.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                    Nenhuma empresa cadastrada. Clique em "+ Nova empresa" para começar.
                </div>
            ) : (
                <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                            <tr className="text-left">
                                <th className="px-3 py-2">Nome fantasia</th>
                                <th className="px-3 py-2">Razão social</th>
                                <th className="px-3 py-2">CNPJ</th>
                                <th className="px-3 py-2 text-center">SAGE</th>
                                <th className="px-3 py-2 text-center">Certificado</th>
                                <th className="px-3 py-2 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visiveis.length === 0 && (
                                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Nenhuma empresa encontrada para "{busca}".</td></tr>
                            )}
                            {visiveis.map((e) => (
                                <React.Fragment key={e.id}>
                                    <tr className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{e.nomeFantasia}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{e.razaoSocial}</td>
                                        <td className={`px-3 py-2 font-mono text-xs ${chavesRepetidas.has(chaveCnpj(e.cnpj)) ? 'font-bold text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-400'}`} title={chavesRepetidas.has(chaveCnpj(e.cnpj)) ? 'CNPJ repetido em outra empresa' : undefined}>{formatCnpj(e.cnpj)}</td>
                                        <td className="px-3 py-2 text-center"><code className={`px-1.5 py-0.5 rounded text-xs ${chavesRepetidas.has(chaveSage(e.codigoSage)) ? 'bg-red-100 font-bold text-red-800 dark:bg-red-900/40 dark:text-red-200' : 'bg-slate-100 dark:bg-slate-700'}`} title={chavesRepetidas.has(chaveSage(e.codigoSage)) ? 'Código SAGE repetido em outra empresa' : undefined}>{e.codigoSage}</code></td>
                                        <td className="px-3 py-2 text-center">
                                            {(() => {
                                                // Situação no cofre único (CFI + Legal); só leitura.
                                                const l = cofre?.get(e.cnpj.replace(/\D/g, ''));
                                                if (!cofre) return <span className="text-xs text-slate-400" title={erroCofre || 'Carregando o cofre…'}>{erroCofre ? '—' : '…'}</span>;
                                                const cls = !l || !l.apto ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                                                    : precisaAtencao(l) ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                                    : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
                                                const d = l ? diasDaLinha(l) : null;
                                                return (
                                                    <button onClick={() => setExpandedCert(expandedCert === e.id ? null : e.id)}
                                                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 ${cls}`}>
                                                        🔐 {l ? ROTULO_SITUACAO[l.situacao] ?? l.situacao : 'Fora do cadastro central'}{d !== null && l?.apto ? ` · ${d} dia(s)` : ''}
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-3 py-2 text-right space-x-1">
                                            {podeEditar(e) && <button onClick={() => { setEmpresaEditando(e); setShowForm(true); }}
                                                className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-300 rounded">
                                                Editar
                                            </button>}
                                            {isGestor && (
                                                <button onClick={() => apagar(e.id, e.nomeFantasia)}
                                                    className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-300 rounded">
                                                    🗑 Excluir
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedCert === e.id && (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50">
                                                <DetalheCofre linha={cofre?.get(e.cnpj.replace(/\D/g, ''))} />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const DetalheCofre: React.FC<{ linha?: LinhaCofre }> = ({ linha }) => {
    const c = linha ? linha.certificado ?? linha.certificadoDaRaiz : null;
    const br = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
    return (
        <div className="space-y-1 text-xs text-slate-700 dark:text-slate-200">
            {!linha && <p>Empresa fora do cadastro central do Consultor Fiscal: não há certificado no cofre. Cadastre-a no CFI.</p>}
            {linha && <p>{linha.motivo}{linha.acao ? ` ${linha.acao}` : ''}</p>}
            {c && <p>Titular: {c.titular ?? '—'} · {c.tipo} · emissor {c.emissor ?? '—'} · válido até {br(c.validoAte)}{linha?.certificadoDaRaiz ? ' (certificado da matriz)' : ''}</p>}
            {linha?.legal && <p>Departamento Legal: vencimento acompanhado {br(linha.legal.vencimentoInformado)}{linha.legal.ultimaRenovacao ? ` · última renovação ${br(linha.legal.ultimaRenovacao.dataAntiga)} → ${br(linha.legal.ultimaRenovacao.dataNova)}` : ''}</p>}
            {linha?.divergenciaLegal === 'renovado-sem-upload' && <p className="font-medium text-red-700 dark:text-red-300">Renovado no Legal, mas o A1 novo não subiu ao cofre.</p>}
            <p className="text-slate-500">O certificado novo (.pfx) sobe pelo app Legal, direto no cofre. Este app não envia nem baixa certificado.</p>
        </div>
    );
};

export default EmpresasPanel;
