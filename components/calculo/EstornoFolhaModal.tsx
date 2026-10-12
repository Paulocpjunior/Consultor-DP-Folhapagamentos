// components/calculo/EstornoFolhaModal.tsx
//
// Utilitários › Estorno do cálculo (Cálculo › Folha mensal › "Estornar o cálculo…"): apaga a folha gravada da
// competência aberta e, se marcado, os lançamentos do movimento do mês, com o motivo na auditoria. Antes, mostra o que
// já foi aceito no eSocial (services/calculo/estornoFolha.ts), que o estorno não desfaz.

import React, { useEffect, useMemo, useState } from 'react';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { listarEnvios, type Envio } from '../../services/esocial/transmissaoService';
import { listarMovimentos, salvarMovimentos } from '../../services/calculo/movimentosService';
import type { MovimentoGravado } from '../../services/calculo/movimento';
import { estornarFolha } from '../../services/calculo/folhaGravadaService';
import type { FolhaGravada } from '../../services/calculo/folhaGravada';
import { movimentoEstornado, planoDoEstorno } from '../../services/calculo/estornoFolha';

const inp = 'rounded-sm border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white';
const br = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

interface Props {
    empresaId: string; empresaNome: string; competencia: string; encerrado: boolean;
    gravada: FolhaGravada | null; fichas: FichaFuncionario[]; usuario: Usuario;
    onFechar: () => void; onEstornado: (zerouMovimento: boolean) => void;
}

const EstornoFolhaModal: React.FC<Props> = ({ empresaId, empresaNome, competencia, encerrado, gravada, fichas, usuario, onFechar, onEstornado }) => {
    const [envios, setEnvios] = useState<Envio[] | null>(null);
    const [movimentos, setMovimentos] = useState<MovimentoGravado[] | null>(null);
    const [motivo, setMotivo] = useState('');
    const [zerar, setZerar] = useState(false);
    const [confirmacao, setConfirmacao] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        // Sem os envios não dá para avisar do eSocial: o estorno fica bloqueado até a leitura.
        Promise.all([listarEnvios(empresaId), listarMovimentos(empresaId, competencia)])
            .then(([e, m]) => { if (vivo) { setEnvios(e); setMovimentos(m); } })
            .catch(e => { if (vivo) setErro(`Não foi possível ler os envios do eSocial e o movimento (o estorno fica bloqueado): ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [empresaId, competencia]);

    const plano = useMemo(() => (envios && movimentos ? planoDoEstorno({ competencia, encerrado, gravada, movimentos, envios, fichas }) : null), [envios, movimentos, competencia, encerrado, gravada, fichas]);
    const nada = !!plano && !gravada && !zerar;
    const pode = !!plano && !plano.bloqueio && motivo.trim().length >= 5 && confirmacao.trim().toUpperCase() === 'ESTORNAR' && !nada && !ocupado;

    async function estornar() {
        if (!plano || !pode || !movimentos) return;
        setOcupado(true); setErro('');
        try {
            if (gravada) await estornarFolha(empresaId, competencia, motivo, usuario);
            if (zerar && plano.movimentos.length) await salvarMovimentos(empresaId, competencia, plano.movimentos.map(m => ({ fichaId: m.fichaId, antes: m.movimento, depois: movimentoEstornado(m.movimento) })), usuario);
            onEstornado(zerar && plano.movimentos.length > 0);
        } catch (e) { setErro(`Estorno não concluído: ${mensagemErro(e)}`); }
        finally { setOcupado(false); }
    }

    return (
        <div role="dialog" aria-modal="true" aria-label="Estorno do cálculo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-auto rounded-lg bg-white p-4 text-sm text-slate-700 shadow-xl dark:bg-slate-800 dark:text-slate-200">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Estornar o cálculo de {br(competencia)}</h2>
                <p>{empresaNome}. Apaga a folha gravada{gravada ? ` (${gravada.holerites.length} holerite(s), gravada por ${gravada.gravadoPorEmail})` : ''} para recalcular e gravar de novo. A ficha, os afastamentos e o eSocial não mudam.</p>
                {!plano && !erro && <p role="status">Lendo os envios do eSocial e o movimento…</p>}
                {plano?.bloqueio && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{plano.bloqueio}</p>}
                {plano && !plano.bloqueio && (
                    <>
                        <ul aria-label="Avisos do estorno" className="list-disc space-y-1 rounded-sm bg-amber-50 p-2 pl-6 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{plano.avisos.map(a => <li key={a}>{a}</li>)}</ul>
                        <label className="flex items-start gap-2">
                            <input type="checkbox" className="mt-0.5" checked={zerar} disabled={!plano.movimentos.length} onChange={e => setZerar(e.target.checked)} aria-label="Zerar também o movimento" />
                            <span>Zerar também o movimento do mês{plano.movimentos.length ? ` (${plano.movimentos.length} funcionário(s) com lançamentos: horas, faltas, pensões, lançamentos avulsos)` : ' (nenhum lançamento)'}.
                                <span className="block text-xs text-slate-500">O encadeamento do arredondamento e o IRRF gravado de outro sistema ficam. Cada movimento zerado fica na auditoria.</span></span>
                        </label>
                        <label className="block">Motivo do estorno (vai para a auditoria)
                            <textarea aria-label="Motivo do estorno" className={`mt-0.5 block w-full ${inp}`} rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
                        <label className="block">Digite ESTORNAR para confirmar
                            <input aria-label="Confirmação do estorno" className={`mt-0.5 block w-40 ${inp}`} value={confirmacao} onChange={e => setConfirmacao(e.target.value)} /></label>
                        {nada && <p className="text-xs text-slate-500">Sem folha gravada: marque "zerar o movimento" para estornar os lançamentos.</p>}
                    </>
                )}
                {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className="rounded-sm border border-slate-300 px-3 py-1.5 dark:border-slate-600" onClick={onFechar} disabled={ocupado}>Cancelar</button>
                    <button type="button" className="rounded-sm bg-red-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!pode} onClick={estornar}>{ocupado ? 'Estornando…' : 'Estornar'}</button>
                </div>
            </div>
        </div>
    );
};

export default EstornoFolhaModal;
