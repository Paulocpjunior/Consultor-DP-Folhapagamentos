// components/esocial/StatusEsocialAfastamento.tsx
//
// Retorno visual do S-2230 de um afastamento (férias, licenças): situação no
// eSocial com cor, recibo ou ocorrências, e as ações de transmitir pelo cofre
// do CFI e consultar o retorno. Sem a tela de lotes: o S-2230 é gerado aqui
// a partir do afastamento gravado.

import React, { useState } from 'react';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { ROTULO_AMBIENTE, consultarLote, enviarLote, gerarS2230, type Certificado, type TpAmb } from '../../services/esocial/transmissao';
import { registrarConsulta, registrarEnvio, type Envio } from '../../services/esocial/transmissaoService';
import { statusS2230, type SituacaoEvento } from '../../services/esocial/statusEvento';

const COR: Record<SituacaoEvento, string> = {
    'nao-enviado': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    iob: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    aguardando: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    aceito: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    recusado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};
const ICONE: Record<SituacaoEvento, string> = { 'nao-enviado': '○', iob: '✓', aguardando: '⏳', aceito: '✓', recusado: '✕' };

/** Selo compacto para listas. */
export const SeloEsocial: React.FC<{ afastamento: Pick<Afastamento, 'id' | 'recibos'>; envios: Envio[] | null }> = ({ afastamento, envios }) => {
    if (!envios) return <span className="text-xs text-slate-400">…</span>;
    const s = statusS2230(afastamento, envios);
    return <span title={s.detalhe} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COR[s.situacao]}`}>{ICONE[s.situacao]} {s.rotulo}</span>;
};

interface Props {
    afastamento: Afastamento;
    empresa: { id: string; cnpj: string; nome: string };
    usuario?: Usuario;
    envios: Envio[] | null;
    onAtualizado: () => void;
}

const StatusEsocialAfastamento: React.FC<Props> = ({ afastamento, empresa, usuario, envios, onAtualizado }) => {
    const [tpAmb, setTpAmb] = useState<TpAmb>(1);
    const [certificado, setCertificado] = useState<Certificado>('escritorio');
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [verHistorico, setVerHistorico] = useState(false);
    if (!envios) return <p className="text-xs text-slate-500">eSocial: carregando a situação…</p>;
    const s = statusS2230(afastamento, envios);
    const podeTransmitir = !!usuario && !ocupado && (s.situacao === 'nao-enviado' || s.situacao === 'recusado');

    async function transmitir() {
        if (!usuario) return;
        setErro('');
        let ev: { id: string; xml: string };
        try { ev = gerarS2230({ cnpj: empresa.cnpj, tpAmb, afastamento }); } catch (e) { setErro((e as Error).message); return; }
        if (!window.confirm(`Transmitir o S-2230 (${afastamento.dtInicio.split('-').reverse().join('/')}${afastamento.dtFim ? ` a ${afastamento.dtFim.split('-').reverse().join('/')}` : ''}) de ${empresa.nome} em ${ROTULO_AMBIENTE[tpAmb].toUpperCase()}?${tpAmb === 1 ? '\n\nEntrega em produção vale para a empresa e não se desfaz.' : ''}`)) return;
        setOcupado('Transmitindo o S-2230…');
        try {
            const r = await enviarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, eventos: [ev.xml], tpAmb, certificado, ...(tpAmb === 1 ? { confirmoProducao: true } : {}) });
            await registrarEnvio({ empresaId: empresa.id, cnpj: empresa.cnpj, certificado, retorno: r, refs: { [ev.id]: afastamento.id } }, usuario);
            if (!r.recebido) setErro(`eSocial recusou o lote: ${r.cdResposta ?? ''} ${r.descResposta}`);
            onAtualizado();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function consultar(envio: Envio) {
        if (!usuario) return;
        setErro(''); setOcupado('Consultando o retorno…');
        try {
            const r = await consultarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, protocolo: envio.protocolo, tpAmb: envio.tpAmb, certificado: envio.certificado });
            await registrarConsulta(envio, r, usuario);
            if (r.situacao === 'em-processamento') setErro(`Ainda em processamento no eSocial${r.tempoEstimadoConclusao ? ` (previsão: ${r.tempoEstimadoConclusao} s)` : ''}. Consulte de novo em instantes.`);
            onAtualizado();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    return (
        <div aria-label="Situação no eSocial" className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">eSocial · S-2230</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${COR[s.situacao]}`}>{ICONE[s.situacao]} {s.rotulo}</span>
                {s.envio && <span className="text-slate-500">{ROTULO_AMBIENTE[s.envio.tpAmb]}</span>}
            </div>
            <p className={s.situacao === 'recusado' ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}>{s.detalhe}</p>
            {s.situacao === 'aguardando' && s.envio && (
                <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600" disabled={!!ocupado || !usuario} onClick={() => consultar(s.envio!)}>Consultar retorno</button>
            )}
            {(s.situacao === 'nao-enviado' || s.situacao === 'recusado') && (
                <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Ambiente do eSocial" className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900" value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}>
                        <option value={1}>{ROTULO_AMBIENTE[1]}</option><option value={2}>{ROTULO_AMBIENTE[2]}</option>
                    </select>
                    <select aria-label="Certificado" className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900" value={certificado} onChange={e => setCertificado(e.target.value as Certificado)}>
                        <option value="escritorio">Certificado do escritório (procurador)</option><option value="empresa">Certificado da empresa</option>
                    </select>
                    <button type="button" className="rounded bg-blue-700 px-2 py-1 text-white disabled:opacity-50" disabled={!podeTransmitir} onClick={transmitir}>{s.situacao === 'recusado' ? 'Corrigir e transmitir de novo' : 'Transmitir S-2230'}</button>
                </div>
            )}
            {ocupado && <p className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="text-red-700 dark:text-red-300">{erro}</p>}
            {s.historico.length > 0 && (
                <div>
                    <button type="button" className="text-blue-700 underline dark:text-blue-300" onClick={() => setVerHistorico(v => !v)}>Histórico de protocolos ({s.historico.length})</button>
                    {verHistorico && (
                        <ul className="mt-1 list-disc pl-5">
                            {s.historico.map(({ envio, evento }) => (
                                <li key={`${envio.id}-${evento.id}`}>{envio.enviadoEm ? new Date(envio.enviadoEm).toLocaleString('pt-BR') : '—'} · protocolo {envio.protocolo || '—'} · {ROTULO_AMBIENTE[envio.tpAmb]} · {evento.nrRecibo ? `recibo ${evento.nrRecibo}` : evento.cdResposta ? `${evento.cdResposta} ${evento.descResposta ?? ''}` : envio.situacao} · por {envio.enviadoPorEmail}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default StatusEsocialAfastamento;
