import { limparSessaoImplantacao } from '../services/implantacao/sessao';
import { ROTULO_PAPEL, ehAdmin, ehMaster, papelEfetivo } from '../services/auth/papeis';
import { VerificarEmail, VerificarMaster } from './auth/PendingScreen';
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import * as authService from '../services/auth/authService';
import { consultarGateDepartamento, type GateDepartamento } from '../services/departamentoGate';
import { getAuth } from 'firebase/auth';
import LoginScreen from './auth/LoginScreen';
import PendingScreen from './auth/PendingScreen';
import AdminUsersPanel from './auth/AdminUsersPanel';
import FolhaPanel, { type SubTabFolha } from './folha/FolhaPanel';
import type { Destino } from '../services/iobSage/catalogoMenus';
const IobSagePanel = lazy(() => import('./iobSage/IobSagePanel'));
const CadastrosPanel = lazy(() => import('./cadastros/CadastrosPanel'));
const PrazosPanel = lazy(() => import('./prazos/PrazosPanel'));
const CalculoPanel = lazy(() => import('./calculo/CalculoPanel'));
const CofreCertificadosPanel = lazy(() => import('./certificados/CofreCertificadosPanel'));
const FimDeMesPanel = lazy(() => import('./fimDeMes/FimDeMesPanel'));
const RelatoriosPanel = lazy(() => import('./relatorios/RelatoriosPanel'));
const ModelosPanel = lazy(() => import('./relatorios/ModelosPanel'));
import { SeloSituacao } from './fimDeMes/SeloSituacao';
import { lerFechamento, listarPedidosPendentes } from '../services/fimDeMes/fechamentoService';
import { situacaoDe, type SituacaoPeriodo } from '../services/fimDeMes/fechamento';
import type { SubCadastro } from './cadastros/CadastrosPanel';
import EmpresasPanel from './empresas/EmpresasPanel';
import ESocialMonitorPanel from './esocial/ESocialMonitorPanel';
import AlertaPendenciasPopup from './AlertaPendenciasPopup';
import Cabecalho, { Ico } from './layout/Cabecalho';
import { corDoGrupo } from './layout/cores';
import ParticularidadesEmpresa from './crm/ParticularidadesEmpresa';
import { menuDoPapel, ondeEsta, type Destino as DestinoMenu } from '../services/navegacao/menu';
import UpdateBanner from './UpdateBanner';
import MiaAssistente from './mia/MiaAssistente';
import { listarEmpresasVisiveis } from '../services/empresas/empresasService';
import { esquecerEscopo } from '../services/carteira/carteiraService';
import type { Empresa } from '../services/empresas/empresasTypes';
import type { User } from '../types';
import AtivarEmpresaScreen from './empresaAtiva/AtivarEmpresaScreen';
import { EmpresaAtivaProvider } from '../services/empresaAtiva/empresaAtivaContext';
import {
    ativacaoAindaValida, competenciaBr, competenciaPadrao, exigeEmpresaAtiva,
    gravarEmpresaAtiva, lerEmpresaAtiva, limparEmpresaAtiva, type EmpresaAtiva,
} from '../services/empresaAtiva/empresaAtiva';

type Tab = 'folha' | 'cadastros' | 'calculo' | 'prazos' | 'certificados' | 'empresas' | 'esocial' | 'iobsage' | 'admin' | 'fimdemes' | 'relatorios';

/** Tema escuro guardado no navegador (preferência de cada pessoa). */
const CHAVE_TEMA = 'consultor-dp:tema';
const temaGuardado = () => { try { return localStorage.getItem(CHAVE_TEMA) === 'escuro'; } catch { return false; } };

const SUB_FOLHA: Partial<Record<Destino, SubTabFolha>> = {
    'folha:apontamento': 'apontamento', 'folha:implantacao': 'implantacao', 'folha:conferencia': 'conferencia',
    'folha:eventos': 'eventos', 'folha:ponto': 'validador-ponto',
};
const SUB_CADASTRO: Partial<Record<Destino, SubCadastro>> = {
    'cadastros:funcionarios': 'funcionarios', 'cadastros:horarios': 'horarios', 'cadastros:afastamentos': 'afastamentos', 'cadastros:incidencias': 'incidencias',
    'cadastros:sindicatos': 'sindicatos', 'cadastros:tabelas': 'tabelas', 'cadastros:enquadramento': 'enquadramento',
};

function extrairNomeAmigavel(user: any): string {
    if (!user) return 'Usuário';
    const candidato = user.nome || user.displayName;
    if (candidato && typeof candidato === 'string' && candidato.trim()) {
        // Pega só o primeiro nome
        return candidato.trim().split(/\s+/)[0];
    }
    if (user.email && typeof user.email === 'string') {
        // junior@spassessoriacontabil.com.br -> "Junior"
        const local = user.email.split('@')[0];
        if (local) {
            return local.charAt(0).toUpperCase() + local.slice(1);
        }
    }
    return 'Usuário';
}

function saudacaoPorHora(): string {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
}

const MainTabs: React.FC<{ children?: React.ReactNode }> = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    // Onde a pessoa está (grupo e item do menu); n remonta o painel ao escolher de novo pelo menu.
    const [nav, setNav] = useState<{ d: Exclude<DestinoMenu, { aba: 'trocar' }>; n: number }>({ d: { aba: 'folha', sub: 'apontamento' }, n: 0 });
    const activeTab: Tab = nav.d.aba;
    const navegar = useCallback((d: DestinoMenu) => { if (d.aba !== 'trocar') setNav(x => ({ d, n: x.n + 1 })); }, []);
    const setActiveTab = useCallback((t: Tab) => navegar(
        t === 'folha' ? { aba: 'folha', sub: 'apontamento' } : t === 'cadastros' ? { aba: 'cadastros', sub: 'funcionarios' }
            : t === 'esocial' ? { aba: 'esocial', sub: 'dashboard' } : t === 'calculo' ? { aba: 'calculo', folha: 'mensal' }
                : t === 'fimdemes' ? { aba: 'fimdemes', sub: 'fechamento' } : t === 'relatorios' ? { aba: 'relatorios', sub: 'central' } : { aba: t }), [navegar]);
    const irFolha = (sub: SubTabFolha) => navegar({ aba: 'folha', sub });
    const irCadastro = (sub: SubCadastro) => navegar({ aba: 'cadastros', sub });
    // Fim de mês: situação da competência ativa (no cabeçalho) e pedidos de reabertura esperando o gestor.
    const [situacaoPeriodo, setSituacaoPeriodo] = useState<SituacaoPeriodo | null>(null);
    const [pedidosGestor, setPedidosGestor] = useState(0);
    const [versaoFim, setVersaoFim] = useState(0);
    const [escuro, setEscuro] = useState(temaGuardado);
    useEffect(() => {
        document.documentElement.classList.toggle('dark', escuro);
        try { localStorage.setItem(CHAVE_TEMA, escuro ? 'escuro' : 'claro'); } catch { /* sem armazenamento: vale só nesta aba */ }
    }, [escuro]);
    const [empresasCount, setEmpresasCount] = useState<number | null>(null);
    // Empresa e período ativos da sessão (services/empresaAtiva): portão antes de qualquer ação.
    const [visiveis, setVisiveis] = useState<Empresa[] | null>(null);
    const [erroVisiveis, setErroVisiveis] = useState('');
    const [ativa, setAtiva] = useState<EmpresaAtiva | null>(null);
    const [trocando, setTrocando] = useState(false);
    const uidAtual = currentUser ? ((currentUser as any).uid || currentUser.id) : '';
    const [showWelcome, setShowWelcome] = useState(false);
    const [showPendencias, setShowPendencias] = useState(false);
    const prevUserUidRef = useRef<string | null>(null);

    // Outro usuário na mesma aba: começa sem ativação (a dele é lida do navegador).
    useEffect(() => { setAtiva(null); setVisiveis(null); setTrocando(false); }, [uidAtual]);

    useEffect(() => {
        if (!currentUser) return;
        (async () => {
            try {
                const list = await listarEmpresasVisiveis();
                setEmpresasCount(list.length);
                setVisiveis(list); setErroVisiveis('');
                // A ativação guardada (F5) só vale se a empresa continua na carteira.
                setAtiva(a => ativacaoAindaValida(a ?? lerEmpresaAtiva(uidAtual), list));
            } catch (e) {
                console.warn('Falha ao carregar contagem de empresas:', e);
                setEmpresasCount(0);
                setVisiveis([]); setErroVisiveis(`Não foi possível carregar as empresas da sua carteira: ${(e as Error)?.message ?? e}`);
            }
        })();
    }, [currentUser, activeTab]);

    // Boas-vindas: mostra overlay no primeiro login da sessão.
    // sessionStorage evita re-exibição em F5 / navegação SPA.
    useEffect(() => {
        if (!currentUser) {
            prevUserUidRef.current = null;
            return;
        }
        const uid = (currentUser as any).uid || currentUser.email || 'anon';
        // Comportamento B: mostra welcome a cada login (transição !logado -> logado).
        if (prevUserUidRef.current === null) {
            setShowWelcome(true);
        }
        prevUserUidRef.current = uid;
    }, [currentUser]);

    useEffect(() => {
        const unsub = authService.subscribeAuthState((user: User | null) => {
            if (!user) limparSessaoImplantacao();
            // Entrada ou saída (mesmo na mesma aba): papel e carteira são lidos de novo,
            // antes de qualquer tela montar, para valer na hora uma mudança de perfil.
            esquecerEscopo();
            setCurrentUser(user);
            setAuthReady(true);
        });
        return () => { if (typeof unsub === 'function') unsub(); };
    }, []);

    // Gate de departamento do SaaS (08/08): pergunta ao cadastro central do
    // CFI se este e-mail abre o módulo DP/Folha. Em modo aviso nunca bloqueia;
    // falha do túnel LIBERA (indeterminado é log, não banner).
    const [gate, setGate] = useState<GateDepartamento | null>(null);
    useEffect(() => {
        if (!currentUser || currentUser.role === 'pendente') { setGate(null); return; }
        let vivo = true;
        consultarGateDepartamento(
            currentUser.email || '',
            async () => {
                const u = getAuth().currentUser;
                if (!u) throw new Error('sem sessão');
                return await u.getIdToken();
            },
        ).then((g) => {
            if (!vivo) return;
            if (g.indeterminado) console.warn('[departamento-gate] indeterminado:', g.motivo);
            setGate(g);
        });
        return () => { vivo = false; };
    }, [currentUser]);

    const handleLogout = async () => {
        // Sair limpa a ativação: quem entra de novo ativa de propósito.
        if (uidAtual) limparEmpresaAtiva(uidAtual);
        setAtiva(null); setVisiveis(null); setTrocando(false);
        try { await authService.logout(); } catch {}
        setCurrentUser(null);
    };

    const ehGestorDp = !!currentUser && (ehMaster(currentUser.email) || papelEfetivo(currentUser.role) === 'gestor');
    useEffect(() => {
        setSituacaoPeriodo(null);
        if (!ativa) return;
        let vivo = true;
        lerFechamento(ativa.id, ativa.competencia).then(f => { if (vivo) setSituacaoPeriodo(situacaoDe(f)); }).catch(() => { /* sem leitura: sem selo */ });
        return () => { vivo = false; };
    }, [ativa, versaoFim]);
    useEffect(() => {
        setPedidosGestor(0);
        if (!ehGestorDp) return;
        let vivo = true;
        listarPedidosPendentes().then(l => { if (vivo) setPedidosGestor(l.length); }).catch(() => {});
        return () => { vivo = false; };
    }, [ehGestorDp, versaoFim, nav]);

    const ativarEmpresa = (e: EmpresaAtiva) => {
        gravarEmpresaAtiva(uidAtual, e);
        setAtiva(e);
        setTrocando(false);
    };
    const abrirTroca = useCallback(() => setTrocando(true), []);

    if (!authReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
            </div>
        );
    }

    if (!currentUser) return (<><UpdateBanner /><LoginScreen /></>);
    if (currentUser.role === 'pendente') return (<><UpdateBanner /><PendingScreen user={currentUser} /></>);
    if (gate && !gate.permitido) {
        // Modo bloqueio: quem vincula é o admin, no Gerenciar Usuários do CFI.
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6 text-center">
                <div className="max-w-lg">
                    <div className="text-5xl mb-3">{gate.bloqueio === 'horario' ? '⏰' : '🔒'}</div>
                    <h2 className="text-xl font-extrabold mb-2 text-slate-800 dark:text-slate-100">{gate.titulo || 'Sem vínculo com o módulo DP/Folha'}</h2>
                    <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{gate.motivo}</p>
                    <button onClick={handleLogout} className="mt-4 px-4 py-2 rounded-lg text-sm font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">Sair</button>
                </div>
            </div>
        );
    }

    const isAdmin = ehAdmin(currentUser.role);

    if (!isAdmin && activeTab === 'admin') {
        setNav({ d: { aba: 'folha', sub: 'apontamento' }, n: nav.n + 1 });
    }

    // Boas-vindas a cada login: vem ANTES do portão de empresa e período
    // (login → boas-vindas → ativar empresa e período → pendências).
    const boasVindas = showWelcome && currentUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-2xl shrink-0">
                            👋
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                                {saudacaoPorHora()}
                            </div>
                            <div className="text-xl font-bold text-slate-900 dark:text-white truncate">
                                {extrairNomeAmigavel(currentUser)}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5">
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
                        Você está em <strong>Consultor DP · SP Assessoria</strong>.
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        {ativa
                            ? <>Pronto para iniciar o apontamento de folha no <strong>IOB SAGE FOLHAMATIC</strong>?</>
                            : <>Para começar, escolha a empresa da sua carteira e o período em que vai trabalhar.</>}
                    </p>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 py-3 border-y border-slate-200 dark:border-slate-700">
                        <span>
                            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <span className="font-mono font-semibold">
                            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>

                <div className="px-6 pb-6 pt-2">
                    <button
                        onClick={() => { setShowWelcome(false); setShowPendencias(true); }}
                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {ativa ? 'Iniciar Folha de Pagamento' : 'Escolher empresa e período'}
                        <span aria-hidden>→</span>
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    // Portão: tela que trabalha sobre um cliente exige empresa e período ativos.
    if (trocando || (!ativa && exigeEmpresaAtiva(activeTab))) {
        return (
            <><UpdateBanner />
            {boasVindas}
            <AtivarEmpresaScreen
                empresas={visiveis} erro={erroVisiveis} competenciaInicial={competenciaPadrao()} atual={ativa}
                usuarioEmail={currentUser.email}
                papel={ROTULO_PAPEL[papelEfetivo(currentUser.role)]}
                onAtivar={ativarEmpresa}
                onCancelar={ativa ? () => setTrocando(false) : undefined}
                onIrParaEmpresas={() => { setTrocando(false); setActiveTab('empresas'); }}
                onIrParaUsuarios={isAdmin ? () => { setTrocando(false); setActiveTab('admin'); } : undefined}
                onSair={handleLogout}
            /></>
        );
    }

    const menu = menuDoPapel(isAdmin);
    const local = ondeEsta(nav.d, menu);
    // Sem empresa na carteira, as telas da Folha ficam fechadas (como a aba antiga).
    const bloqueados: Record<string, string> = empresasCount === 0
        ? Object.fromEntries(menu.flatMap(g => g.itens).filter(i => i.destino.aba === 'folha').map(i => [i.id, 'Nenhuma empresa na sua carteira: peça ao gestor ou admin']))
        : {};

    return (
        <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950">
            {gate?.aviso && (
                <div className="px-4 py-2 text-center text-[13px] bg-amber-50 text-amber-800 border-b border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
                    ⚠ {gate.aviso}
                </div>
            )}
            {boasVindas}

            {showPendencias && currentUser && !showWelcome && (
                <AlertaPendenciasPopup
                    currentUser={currentUser}
                    onNavigateEsocial={() => { setShowPendencias(false); setActiveTab('esocial'); }}
                    onDismiss={() => setShowPendencias(false)}
                />
            )}

            <UpdateBanner />
            {/* Master ainda sem o papel de gestor: o e-mail precisa estar verificado. */}
            {ehMaster(currentUser.email) && papelEfetivo(currentUser.role) !== 'gestor' ? (
                <div className="mx-auto max-w-7xl px-4 pt-3"><VerificarMaster email={currentUser.email} /></div>
            ) : getAuth().currentUser?.emailVerified === false && (
                // Sem e-mail verificado o CFI recusa o token (cofre de certificados, transmissão ao eSocial).
                <div className="mx-auto max-w-7xl px-4 pt-3"><VerificarEmail email={currentUser.email} /></div>
            )}
            <Cabecalho menu={menu} destino={nav.d} onNavegar={navegar} ativa={ativa} onTrocar={abrirTroca}
                usuario={currentUser.name || currentUser.email} papel={isAdmin ? ROTULO_PAPEL[papelEfetivo(currentUser.role)] : undefined}
                escuro={escuro} onTema={() => setEscuro(e => !e)} onSair={handleLogout} bloqueados={bloqueados}
                situacaoPeriodo={situacaoPeriodo ? <button onClick={() => navegar({ aba: 'fimdemes', sub: 'fechamento' })} title="Fim de mês desta competência"><SeloSituacao situacao={situacaoPeriodo} /></button> : undefined}
                contadores={pedidosGestor ? { fimdemes: pedidosGestor } : undefined}
                extraEmpresa={ativa ? <ParticularidadesEmpresa cnpj={ativa.cnpj} /> : undefined} />
            {pedidosGestor > 0 && nav.d.aba !== 'fimdemes' && (
                <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
                        <span>{pedidosGestor} pedido(s) de reabertura de período encerrado aguardando você.</span>
                        <button className="rounded-lg border border-amber-400 px-2 py-0.5 text-xs font-medium" onClick={() => navegar({ aba: 'fimdemes', sub: 'pedidos' })}>Ver pedidos</button>
                    </div>
                </div>
            )}
            {isAdmin && (
                <div className="mx-auto flex max-w-7xl justify-end px-4 pt-2 sm:px-6">
                    <a href="https://consultor-fiscal-inteligente-631239634290.us-west1.run.app/?painel=comunicacao&departamento=dp-folha" target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300" title="Administração central de comunicação (templates e agendamentos) — acesso de admin no CFI">Templates e agendamentos ↗</a>
                </div>
            )}

            <EmpresaAtivaProvider ativa={ativa} trocar={abrirTroca} ativar={ativarEmpresa}>
            {/* Trocar de empresa ou de período remonta as telas: dado de um cliente (ou de um mês) nunca fica na tela de outro. */}
            <main key={ativa ? `${ativa.id}_${ativa.competencia}` : 'sem-empresa'} className="max-w-7xl mx-auto p-4 sm:p-6">
                {local && (
                    <div className="mb-5 border-b border-slate-200 pb-4 dark:border-slate-700/60">
                        <div className="flex items-center gap-3">
                            <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-md ${corDoGrupo(local.grupo.id).solido}`}><Ico nome={local.item.icone} className="h-6 w-6" /></span>
                            <div className="min-w-0">
                                <nav aria-label="Você está em" className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${corDoGrupo(local.grupo.id).barra}`}>
                                    <span>{local.grupo.rotulo}</span><span aria-hidden className="text-slate-300 dark:text-slate-600">/</span><span>{local.item.rotulo}</span>
                                </nav>
                                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{local.item.rotulo}</h1>
                            </div>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{local.item.descricao}</p>
                    </div>
                )}
                {activeTab === 'folha' && (empresasCount && empresasCount > 0
                    ? <FolhaPanel
                        key={`folha-${nav.n}`}
                        subInicial={nav.d.aba === 'folha' ? nav.d.sub : undefined} embutido
                        currentUser={currentUser as any}
                        onIrParaEmpresas={() => setActiveTab('empresas')}
                      />
                    : (
                        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                            <h3 className="text-base font-semibold text-amber-800 dark:text-amber-200">Nenhuma empresa na sua carteira</h3>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                Você só trabalha nas empresas da sua carteira. Peça ao gestor (ou ao admin) para incluir
                                suas empresas em Usuários › Carteira, ou cadastre uma empresa nova.
                            </p>
                            <button onClick={() => setActiveTab('empresas')}
                                className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded font-medium">
                                Ir para cadastro de empresas
                            </button>
                        </div>
                    )
                )}
                {activeTab === 'empresas' && <EmpresasPanel currentUser={currentUser as any} embutido />}
                {activeTab === 'esocial' && <ESocialMonitorPanel key={`esocial-${nav.n}`} currentUser={currentUser as any} subInicial={nav.d.aba === 'esocial' ? nav.d.sub : undefined} embutido />}
                {activeTab === 'iobsage' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <IobSagePanel usuario={{ id: uidAtual, email: currentUser.email }} ehGestor={papelEfetivo(currentUser.role) === 'gestor'} ehAdmin={isAdmin} embutido onNavegar={d => {
                            const sub = SUB_FOLHA[d];
                            const cad = SUB_CADASTRO[d];
                            if (sub) irFolha(sub);
                            else if (cad) irCadastro(cad);
                            else if (d === 'relatorios:central' || d === 'relatorios:modelos') navegar({ aba: 'relatorios', sub: d === 'relatorios:modelos' ? 'modelos' : 'central' });
                            else if (d === 'empresas' || d === 'esocial' || d === 'calculo') setActiveTab(d);
                        }} />
                    </Suspense>
                )}
                {activeTab === 'calculo' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <CalculoPanel key={`calculo-${nav.n}`} currentUser={currentUser} folhaInicial={nav.d.aba === 'calculo' ? nav.d.folha : undefined} embutido />
                    </Suspense>
                )}
                {activeTab === 'prazos' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <PrazosPanel embutido onAbrirCadastros={() => setActiveTab('cadastros')} usuario={currentUser ? { id: uidAtual, email: currentUser.email } : undefined}
                            onAbrirConferencia={() => irFolha('conferencia')} />
                    </Suspense>
                )}
                {activeTab === 'cadastros' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <CadastrosPanel key={`cadastros-${nav.n}`} currentUser={currentUser} subInicial={nav.d.aba === 'cadastros' ? nav.d.sub : undefined} embutido
                            onAbrirEventos={() => irFolha('eventos')} />
                    </Suspense>
                )}
                {activeTab === 'fimdemes' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <FimDeMesPanel key={`fim-${nav.n}`} currentUser={currentUser} sub={nav.d.aba === 'fimdemes' ? nav.d.sub : 'fechamento'} onMudou={() => setVersaoFim(v => v + 1)} />
                    </Suspense>
                )}
                {activeTab === 'relatorios' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        {nav.d.aba === 'relatorios' && nav.d.sub === 'modelos'
                            ? <ModelosPanel key={`mod-${nav.n}`} currentUser={currentUser} />
                            : <RelatoriosPanel key={`rel-${nav.n}`} currentUser={currentUser} />}
                    </Suspense>
                )}
                {activeTab === 'certificados' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <CofreCertificadosPanel embutido />
                    </Suspense>
                )}
                {activeTab === 'admin' && isAdmin && <AdminUsersPanel currentUser={currentUser as any} embutido />}
            </main>
            <MiaAssistente aba={local?.item.rotulo ?? activeTab} />
            </EmpresaAtivaProvider>
        </div>
    );
};

export default MainTabs;
