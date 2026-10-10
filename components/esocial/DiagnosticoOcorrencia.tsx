// components/esocial/DiagnosticoOcorrencia.tsx
//
// Saúde do eSocial, etapa 4: diagnóstico de uma ocorrência de recusa, com a correção assistida (um clique, sempre
// pelo pré-voo e com confirmação) e a sugestão da MIA (Gemini), que nunca é aplicada sozinha.

import React, { useState } from 'react';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { gerarS1298, type Ocorrencia } from '../../services/esocial/transmissao';
import type { Envio } from '../../services/esocial/transmissaoService';
import { diagnosticar, perguntaParaMia } from '../../services/esocial/diagnostico';
import { mensagemDaTransmissao, transmitirVerificado, verificarAntesDeEnviar } from '../../services/esocial/envioSeguro';
import { avisos, bloqueios, textoAchados } from '../../services/esocial/preVoo';
import { conciliarComEsocial } from '../../services/esocial/vigiaEsocial';
import { perguntarMia, type MensagemMia } from '../../services/mia/mia';

interface Props {
    ocorrencia: Ocorrencia;
    tipoEvento: string;
    perApur: string | null;
    envio: Envio;
    empresa: { id: string; cnpj: string; nome: string };
    envios: Envio[];
    usuario?: Usuario;
    onMudou: () => void;
}

const btn = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const primario = 'rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50';
const DICAS: Record<string, string> = {
    'cadastro-rubrica': 'Abra Cadastros › Incidências.', 'cadastro-trabalhador': 'Abra Cadastros › Funcionários.', 'cadastro-empresa': 'Abra Cadastros › Enquadramento e os parâmetros do eSocial da empresa.',
    cofre: 'Abra Empresas › Certificados.', 'transmitir-s1200-antes': 'Abra Folha do mês › Cálculo mensal › S-1200 e S-1210.', 'gerar-de-novo': 'Gere o evento de novo na tela de origem; o pré-voo aponta o campo.',
};

const DiagnosticoOcorrencia: React.FC<Props> = ({ ocorrencia, tipoEvento, perApur, envio, empresa, envios, usuario, onMudou }) => {
    const d = diagnosticar(ocorrencia, tipoEvento);
    const [ocupado, setOcupado] = useState('');
    const [msg, setMsg] = useState('');
    const [erro, setErro] = useState('');
    const [mia, setMia] = useState<MensagemMia | null>(null);

    const agir = async (rotulo: string, f: () => Promise<string>) => {
        setOcupado(rotulo); setErro(''); setMsg('');
        try { const m = await f(); if (m) setMsg(m); } catch (e) { setErro((e as Error).message); } finally { setOcupado(''); }
    };
    const reabrir = () => agir('Conferindo a reabertura…', async () => {
        if (!usuario || !perApur) throw new Error('Sem usuário ou sem a competência do evento.');
        const ev = gerarS1298({ cnpj: empresa.cnpj, perApur, tpAmb: envio.tpAmb });
        const pv = await verificarAntesDeEnviar({ empresa, eventos: [{ xml: ev.xml, nome: 'S-1298' }], tpAmb: envio.tpAmb });
        if (!pv.ok) throw new Error(`O pré-voo barrou a reabertura:\n${textoAchados(bloqueios(pv.achados))}`);
        const av = avisos(pv.achados);
        if (!window.confirm(`Transmitir a REABERTURA (S-1298) da competência ${perApur} de ${empresa.nome}${envio.tpAmb === 1 ? ' em PRODUÇÃO' : ''}?${av.length ? `\n\n${textoAchados(av)}` : ''}\n\nDepois, transmita de novo os eventos recusados e feche com o S-1299.`)) return '';
        setOcupado('Transmitindo o S-1298…');
        const r = await transmitirVerificado(pv, { empresa, certificado: envio.certificado, usuario });
        onMudou();
        return mensagemDaTransmissao(r).texto;
    });
    const conciliar = () => agir('Consultando o eSocial…', async () => {
        if (!perApur || !/^\d{4}-\d{2}$/.test(perApur)) throw new Error('A conciliação é por competência mensal; use eSocial › Download para este evento.');
        if (envio.tpAmb !== 1) throw new Error('A conciliação é só em produção.');
        const { conciliacao } = await conciliarComEsocial(empresa, perApur, envios);
        const doTipo = conciliacao.foraDoConsultor.filter(x => x.tipo === tipoEvento);
        return `${tipoEvento} de ${perApur} no eSocial: ${conciliacao.confirmados} confirmado(s) do Consultor${doTipo.length ? `; de outro sistema: ${doTipo.slice(0, 8).map(x => `recibo ${x.nrRec}`).join(', ')}${doTipo.length > 8 ? '…' : ''}` : ''}. Use o recibo vigente na retificação.`;
    });
    const perguntar = () => agir('A MIA está analisando…', async () => {
        const r = await perguntarMia([{ papel: 'usuaria', texto: perguntaParaMia(ocorrencia, tipoEvento, perApur) }],
            { tela: 'Saúde do eSocial', texto: `Lote ${envio.protocolo || '(sem protocolo)'} · ${tipoEvento} · ambiente ${envio.tpAmb === 1 ? 'produção' : 'produção restrita'} · diagnóstico do Consultor: ${d.causa}` }, 'esocial');
        setMia(r);
        return '';
    });

    return (
        <div aria-label={`Diagnóstico da ocorrência ${ocorrencia.codigo}`} className="mt-1 space-y-1 rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            <p><strong>Diagnóstico:</strong> {d.causa}</p>
            <ol className="list-decimal pl-5">{d.passos.map(p => <li key={p}>{p}</li>)}</ol>
            <div className="flex flex-wrap items-center gap-2 pt-1">
                {d.acao === 'reabrir-periodo' && <button className={primario} disabled={!!ocupado || !usuario || !perApur} onClick={reabrir}>{d.rotuloAcao}</button>}
                {d.acao === 'conciliar' && <button className={primario} disabled={!!ocupado} onClick={conciliar}>{d.rotuloAcao}</button>}
                {DICAS[d.acao] && <span className="opacity-80">{DICAS[d.acao]}</span>}
                <button className={btn} disabled={!!ocupado} onClick={perguntar}>Perguntar à MIA</button>
            </div>
            {ocupado && <p className="opacity-80">{ocupado}</p>}
            {msg && <p role="status" className="whitespace-pre-line text-emerald-800 dark:text-emerald-300">{msg}</p>}
            {erro && <p role="alert" className="whitespace-pre-line text-red-700 dark:text-red-300">{erro}</p>}
            {mia && (
                <div className="rounded border border-violet-200 bg-white p-2 text-slate-800 dark:border-violet-900 dark:bg-slate-900 dark:text-slate-100">
                    <p className="mb-1 font-medium text-violet-800 dark:text-violet-300">MIA (Gemini) — sugestão para conferir; nada foi aplicado</p>
                    <p className="whitespace-pre-line">{mia.texto}</p>
                    {!!mia.fontes?.length && <p className="mt-1 opacity-80">Fontes: {mia.fontes.map(f => <a key={f.uri} href={f.uri} target="_blank" rel="noopener noreferrer" className="underline">{f.titulo}</a>).reduce<React.ReactNode[]>((l, a, i) => (i ? [...l, ' · ', a] : [a]), [])}</p>}
                </div>
            )}
        </div>
    );
};

export default DiagnosticoOcorrencia;
