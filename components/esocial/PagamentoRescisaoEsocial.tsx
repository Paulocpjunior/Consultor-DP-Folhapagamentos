// components/esocial/PagamentoRescisaoEsocial.tsx
//
// Cálculo › Rescisão › S-1210: o pagamento das verbas do S-2299 (services/esocial/pagamentoRescisao.ts). Só depois
// do S-2299 do Consultor aceito (o demonstrativo é o dele). Com S-1210 aceito no mês do pagamento (a folha anterior
// paga no mesmo mês), primeiro a exclusão dele (S-3000), depois o S-1210 com todos os pagamentos.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoRescisao } from '../../services/calculo/motorRescisao';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { ideDmDevRescisao, refDesligamento } from '../../services/esocial/desligamento';
import { gerarS1210Rescisao, refPagamentoRescisao } from '../../services/esocial/pagamentoRescisao';
import { ROTULO_AMBIENTE, consultarLote, type Certificado, type TpAmb } from '../../services/esocial/transmissao';
import { registrarConsulta, type Envio } from '../../services/esocial/transmissaoService';
import { mensagemDaTransmissao, transmitirVerificado, verificarAntesDeEnviar } from '../../services/esocial/envioSeguro';
import { avisos as avisosDoPreVoo, bloqueios, textoAchados, type Achado } from '../../services/esocial/preVoo';
import { statusPorRef } from '../../services/esocial/statusEvento';
import { exclusoesDosEnvios, lerRecibosArquivos, recibosDosEnvios, recibosVigentes, type ReciboEvento } from '../../services/esocial/recibosEsocial';
import { diaUtilAnterior } from '../../services/prazos/calendario';
import AchadosPreVoo from './AchadosPreVoo';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const br = (d: string) => d.split('-').reverse().join('/');

interface Props { empresa: Empresa; ficha: FichaFuncionario; rescisao: ResultadoRescisao; usuario: Usuario; envios: Envio[] | null; onAtualizado: () => void }

const PagamentoRescisaoEsocial: React.FC<Props> = ({ empresa, ficha, rescisao: r, usuario, envios, onAtualizado }) => {
    const [aberto, setAberto] = useState(false);
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [certificado, setCertificado] = useState<Certificado>('escritorio');
    const [data, setData] = useState(() => (r.pagarAte ? diaUtilAnterior(r.pagarAte) : ''));
    const [arquivo, setArquivo] = useState<ReciboEvento[]>([]);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');
    const [achados, setAchados] = useState<Achado[]>([]);
    useEffect(() => { setAchados([]); }, [tpAmb]);
    const ide = ideDmDevRescisao(r.data, ficha.matriculaEsocial.trim());
    const perApur = data.slice(0, 7);
    const cpf = ficha.cpf.replace(/\D/g, '');
    const existente = useMemo(() => {
        if (!envios || tpAmb !== 1 || !/^\d{4}-\d{2}$/.test(perApur)) return undefined;
        return recibosVigentes([...recibosDosEnvios(envios, [ficha]), ...arquivo], 'S-1210', perApur, exclusoesDosEnvios(envios)).get(cpf);
    }, [tpAmb, perApur, envios, ficha, arquivo, cpf]);
    const g = useMemo(() => gerarS1210Rescisao({ cnpj: empresa.cnpj, tpAmb, ficha, rescisao: r, ideDmDev: ide, dataPagamento: data, existente }), [empresa.cnpj, tpAmb, ficha, r, ide, data, existente]);
    if (!envios) return null;

    const s2299 = statusPorRef(refDesligamento(ficha.id, r.data), 'S-2299', envios);
    const ref = refPagamentoRescisao(ficha.id, r.data);
    const s = statusPorRef(ref, 'S-1210', envios);
    // O S-2299 que vale para o ambiente escolhido: produção (situação principal) ou o teste na produção restrita.
    const desligAceito = tpAmb === 1 ? s2299.situacao === 'aceito' : (s2299.teste?.situacao === 'aceito' || s2299.situacao === 'aceito');
    const pendente = s.situacao === 'nao-enviado' || s.situacao === 'recusado';

    async function lerDownload(lista: File[]) {
        if (!lista.length) return;
        setErro('');
        try { setArquivo(await lerRecibosArquivos(await Promise.all(lista.map(async f => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), empresa.cnpj)); setMsg('Download lido.'); }
        catch (e) { setErro(`Não foi possível ler: ${(e as Error).message}`); }
    }
    async function transmitir(qual: 'S-3000' | 'S-1210') {
        const ev = qual === 'S-3000' ? g.exclusao : g.s1210;
        if (!ev) return;
        setErro(''); setMsg(''); setAchados([]); setOcupado('Conferindo antes de enviar (pré-voo)…');
        try {
            const emp = { id: empresa.id, cnpj: empresa.cnpj };
            const refEv = qual === 'S-3000' ? `exclui:${existente!.nrRecibo}:${cpf}:${perApur}` : ref;
            const pv = await verificarAntesDeEnviar({ empresa: emp, eventos: [{ xml: ev.xml, nome: qual, ref: refEv }], tpAmb });
            setAchados(pv.achados);
            if (!pv.ok) { setErro(`O pré-voo barrou o envio (nada foi enviado):\n${textoAchados(bloqueios(pv.achados))}`); return; }
            const av = avisosDoPreVoo(pv.achados);
            const texto = qual === 'S-3000' ? `Excluir o S-1210 de ${perApur.split('-').reverse().join('/')} aceito (recibo ${existente!.nrRecibo}) de ${r.nome}? Ele volta no passo 2 com todos os pagamentos do mês e o da rescisão.`
                : `Transmitir o S-1210 do pagamento da rescisão de ${r.nome} (pago em ${br(data)})?`;
            if (!window.confirm(`${texto}\n\nAmbiente: ${ROTULO_AMBIENTE[tpAmb].toUpperCase()}.${av.length ? `\n\nAvisos do pré-voo:\n${textoAchados(av)}` : ''}`)) return;
            setOcupado(`Transmitindo o ${qual}…`);
            const t = await transmitirVerificado(pv, { empresa: emp, certificado, usuario });
            const m = mensagemDaTransmissao(t);
            if (m.ok) setMsg(m.texto); else setErro(m.texto);
            onAtualizado();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }
    async function consultar(envio: Envio) {
        setErro(''); setOcupado('Consultando o retorno…');
        try {
            const x = await consultarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, protocolo: envio.protocolo, tpAmb: envio.tpAmb, certificado: envio.certificado });
            await registrarConsulta(envio, x, usuario);
            onAtualizado();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    return (
        <section aria-label="eSocial · S-1210 da rescisão" className="space-y-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">eSocial · S-1210 (pagamento da rescisão)</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">{s.rotulo}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">{s.detalhe}</p>
            {s.situacao === 'aguardando' && s.envio?.protocolo && <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600" disabled={!!ocupado} onClick={() => consultar(s.envio!)}>Consultar retorno</button>}
            {s.teste && <p className="text-slate-500">Teste na produção restrita: {s.teste.rotulo.toLowerCase()} · {s.teste.detalhe}</p>}
            {s2299.situacao === 'iob' && <p className="text-slate-500">O S-2299 foi transmitido pelo IOB: o S-1210 do pagamento vai pelo IOB (o demonstrativo é o dele).</p>}
            {pendente && s2299.situacao !== 'iob' && <button type="button" className="text-blue-700 underline dark:text-blue-300" onClick={() => setAberto(a => !a)}>{aberto ? 'Fechar o S-1210' : 'Gerar e transmitir o S-1210 do pagamento'}</button>}
            {aberto && pendente && (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-end gap-2">
                        <label>Data do pagamento<input aria-label="Data do pagamento da rescisão" type="date" className={`block ${inp}`} value={data} onChange={e => setData(e.target.value)} /></label>
                        <label>Ambiente<select aria-label="Ambiente do S-1210" className={`block ${inp}`} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}>
                            <option value={2}>{ROTULO_AMBIENTE[2]}</option><option value={1}>{ROTULO_AMBIENTE[1]}</option></select></label>
                        <label>Certificado<select aria-label="Certificado do S-1210" className={`block ${inp}`} value={certificado} onChange={e => setCertificado(e.target.value as Certificado)}>
                            <option value="escritorio">Certificado do escritório (procurador)</option><option value="empresa">Certificado da empresa</option></select></label>
                    </div>
                    {tpAmb === 1 && (
                        <label className="block">S-1210 já transmitidos no mês (.zip ou .xml do download do eSocial), se a folha anterior foi paga em {perApur ? perApur.split('-').reverse().join('/') : '—'}
                            <input aria-label="Download do S-1210 do mês" type="file" accept=".zip,.xml" multiple className="block" onChange={e => lerDownload(Array.from(e.target.files ?? []))} /></label>
                    )}
                    {!desligAceito && <p className="text-amber-700 dark:text-amber-300">O S-1210 libera depois que o S-2299 for aceito {tpAmb === 1 ? 'na produção' : '(produção restrita ou produção)'}: o pagamento aponta para o demonstrativo dele.</p>}
                    {existente && <p>Já há S-1210 de {perApur.split('-').reverse().join('/')} aceito (recibo {existente.nrRecibo}, {existente.origem}): passo 1, excluir; passo 2, o S-1210 com {g.outrosPagamentos} pagamento(s) dele e o da rescisão.</p>}
                    {g.erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{g.erros.map(x => <li key={x}>{x}</li>)}</ul>}
                    {g.avisos.length > 0 && <ul className="list-disc pl-6 text-amber-900 dark:text-amber-100">{g.avisos.map(x => <li key={x}>{x}</li>)}</ul>}
                    <div className="flex flex-wrap gap-2">
                        {g.exclusao && <button className="rounded bg-red-700 px-2 py-1 text-white disabled:opacity-50" disabled={!!ocupado || !desligAceito} onClick={() => transmitir('S-3000')}>1. Excluir o S-1210 aceito</button>}
                        <button className="rounded bg-green-700 px-2 py-1 text-white disabled:opacity-50" disabled={!!ocupado || !desligAceito || !g.s1210 || !!g.exclusao} onClick={() => transmitir('S-1210')}>{g.exclusao ? '2. ' : ''}Transmitir S-1210</button>
                    </div>
                    {g.exclusao && <p className="text-slate-500">Depois de aceita a exclusão (Saúde do eSocial), carregue de novo o download: o passo 2 libera.</p>}
                </div>
            )}
            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="whitespace-pre-line text-red-700 dark:text-red-300">{erro}</p>}
            <AchadosPreVoo achados={achados} />
            {msg && <p role="status" className="text-green-700 dark:text-green-300">{msg}</p>}
        </section>
    );
};

export default PagamentoRescisaoEsocial;
