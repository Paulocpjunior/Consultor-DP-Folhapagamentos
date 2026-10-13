// components/plataforma/TesteGovernoNavegador.tsx
//
// Teste do serviço "governo" pela plataforma comum SÓ NESTE NAVEGADOR (services/plataforma/servicos.ts), antes da
// troca para todos no build (VITE_SERVICO_GOVERNO_URL). A equipe continua no CFI.
// - BlocoTesteGoverno: Configurações › Serviços externos (o painel só o mostra para gestor/admin);
// - FaixaTesteGoverno: faixa no topo do app enquanto o teste vale para quem está logado, com o botão Desligar.

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
    ROTAS_TESTE_PLATAFORMA, assinarTesteGoverno, configuracaoDoServico, desligarTesteGoverno,
    enderecoDoTeste, ligarTesteGoverno, testeGovernoAplicado,
} from '../../services/plataforma/servicos';

const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';

type Env = Record<string, string | undefined>;

/** Endereço do teste que vale agora para quem está logado (null = desligado ou não se aplica). */
export function useTesteGoverno(env?: Env): string | null {
    return useSyncExternalStore(assinarTesteGoverno, () => testeGovernoAplicado(env), () => null);
}

export const FaixaTesteGoverno: React.FC<{ env?: Env }> = ({ env }) => {
    const ativo = useTesteGoverno(env);
    if (!ativo) return null;
    return (
        <div role="status" aria-label="Teste do governo pela plataforma"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-blue-200 bg-blue-50 px-4 py-1.5 text-center text-[13px] text-blue-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-100">
            <span><b>Governo pela plataforma neste navegador — teste</b> · <code className="break-all text-[12px]">{ativo}</code> · envio em produção, transmissão da DCTFWeb e DARF seguem no CFI</span>
            <button className="rounded border border-blue-300 bg-white px-2 py-0.5 text-xs text-blue-900 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100" onClick={() => desligarTesteGoverno()}>Desligar</button>
        </div>
    );
};

const ROTULO_ROTA: Record<string, string> = {
    '/esocial/envio/consulta': 'consulta do lote do eSocial (protocolo)',
    '/esocial/download/identificadores': 'identificadores do eSocial',
    '/esocial/download/eventos': 'download de eventos do eSocial',
    '/esocial/status': 'situação do eSocial (SERPRO)',
    '/fgts/recolhimento': 'recolhimento do FGTS',
    '/fgts/crf': 'CRF do FGTS',
    '/dctfweb/status': 'situação da DCTFWeb',
    '/dctfweb/debitos': 'débitos da DCTFWeb',
    '/empresa-completo': 'dados da empresa (SERPRO)',
    '/pagamentos/consultar': 'consulta de pagamentos',
    '/pagamentos/situacao-darf': 'situação dos DARF',
    '/pagamentos/comprovante': 'comprovante de pagamento',
};

/**
 * Configurações › Serviços externos › Testar o governo pela plataforma neste navegador.
 * `sugestao`: o endereço colado no comparador (pré-preenche o campo enquanto a pessoa não digitou).
 */
export const BlocoTesteGoverno: React.FC<{ sugestao?: string; env?: Env }> = ({ sugestao = '', env }) => {
    const ativo = useTesteGoverno(env);
    const doBuild = configuracaoDoServico('governo', env).base;
    const [endereco, setEndereco] = useState(ativo ?? sugestao);
    const [editado, setEditado] = useState(false);
    const [aviso, setAviso] = useState('');
    useEffect(() => { if (!editado) setEndereco(ativo ?? sugestao); }, [sugestao, ativo, editado]);
    const valido = enderecoDoTeste(endereco);

    const ligar = () => {
        const r = ligarTesteGoverno(endereco);
        setAviso('aviso' in r ? r.aviso : '');
        if (r.ok) setEditado(false);
    };

    return (
        <section aria-label="Testar o governo pela plataforma neste navegador" className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div>
                <h3 className="font-medium text-slate-800 dark:text-slate-100">Testar o governo pela plataforma neste navegador</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vale só neste navegador e só para o seu login: a equipe continua no CFI. A troca para todos é feita depois,
                    no build (<code>VITE_SERVICO_GOVERNO_URL</code>).
                </p>
            </div>
            {doBuild ? (
                <p className="text-sm text-slate-700 dark:text-slate-200">Este build já leva o governo para <code className="break-all">{doBuild}</code>; o teste no navegador não se aplica.</p>
            ) : (
                <>
                    <div className="grid gap-3 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                        <div className="rounded border border-blue-200 bg-blue-50/60 p-2 dark:border-blue-800 dark:bg-blue-900/20">
                            <p className="font-medium text-blue-900 dark:text-blue-100">Vai para a plataforma</p>
                            <ul className="mt-1 list-disc pl-4">
                                <li><b>envio de lote do eSocial em produção restrita</b> (tpAmb 2)</li>
                                {ROTAS_TESTE_PLATAFORMA.map(r => <li key={r}>{ROTULO_ROTA[r] ?? r}</li>)}
                            </ul>
                        </div>
                        <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                            <p className="font-medium text-slate-800 dark:text-slate-100">Continua no CFI</p>
                            <ul className="mt-1 list-disc pl-4">
                                <li><b>envio de lote do eSocial em produção</b> (tpAmb 1)</li>
                                <li>transmissão da DCTFWeb</li>
                                <li>emissão de DARF da DCTFWeb</li>
                                <li>insumos da DCTFWeb (a trava da transmissão)</li>
                                <li>cadastro, cofre, e-mail, WhatsApp e IA (fora deste teste)</li>
                            </ul>
                        </div>
                    </div>
                    {ativo ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm text-slate-700 dark:text-slate-200">Ligado: <code className="break-all">{ativo}</code></p>
                            <button className={btn} onClick={() => desligarTesteGoverno()}>Desligar</button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                                Endereço da plataforma para o teste
                                <input type="url" placeholder="https://…"
                                    className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                                    value={endereco} onChange={e => { setEndereco(e.target.value); setEditado(true); setAviso(''); }} />
                                {endereco.trim() && valido.aviso && <span className="text-xs text-red-700 dark:text-red-300">{valido.aviso}</span>}
                            </label>
                            <button className={btn} disabled={!valido.url} onClick={ligar}>Ligar</button>
                        </div>
                    )}
                    {aviso && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{aviso}</p>}
                </>
            )}
        </section>
    );
};
