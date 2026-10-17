// components/transferencia/TransferenciaPanel.tsx
//
// Cadastros › Transferência de funcionários, em dois modos:
// - troca de estabelecimento da mesma empresa (services/cadastros/locaisTrabalho.ts): o local de trabalho por vigência
//   na ficha (o S-1200 sai no estabelecimento de cada mês e, no mês da troca, nos dois) e o S-2206 pelo Consultor;
// - para outra empresa do mesmo grupo, sem rescisão (services/transferencia/transferencia.ts), em dois passos:
// 1) no Consultor: a ficha no destino (nova matrícula, mesmo contrato), as férias, os afastamentos terminados e os
//    movimentos para as médias, e a ficha de origem desligada com o motivo 11;
// 2) no eSocial: o S-2299 da origem (motivo 11, sem verbas) e depois o S-2200 do destino (tpAdmissao 2, sucessão),
//    com o pré-voo, o envio pelo CFI e a situação de cada um.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarFuncionarios, listarHorarios, mensagemErro, salvarFuncionario, type Usuario } from '../../services/cadastros/cadastrosService';
import { estabelecimentoNoDia, trocarEstabelecimento, validarTrocaDeEstabelecimento } from '../../services/cadastros/locaisTrabalho';
import { gerarS2206, refTrocaEstabelecimento } from '../../services/esocial/alteracaoContratual';
import { validarContrato } from '../../services/esocial/admissao';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { contratoPadrao, gerarS2200, TIPOS_JORNADA, validarS2200, type ContratoS2200 } from '../../services/esocial/admissao';
import { listarEnvios, type Envio } from '../../services/esocial/transmissaoService';
import { statusPorRef, type StatusEvento } from '../../services/esocial/statusEvento';
import { verificarAntesDeEnviar, transmitirVerificado, mensagemDaTransmissao } from '../../services/esocial/envioSeguro';
import type { TpAmb } from '../../services/esocial/transmissao';
import { baixarBytes } from '../../services/implantacao/zip';
import { fichaNoDestino, gerarS2299Transferencia, refTransferenciaEntrada, refTransferenciaSaida, ultimoDiaNaOrigem, validarTransferencia, type Transferencia } from '../../services/transferencia/transferencia';
import { efetivarTransferencia, listarTransferencias, type RegistroTransferencia } from '../../services/transferencia/transferenciaService';
import { digitarCnpj, limparInscricao, formatoCnpj, raizCnpj } from '../../services/cadastros/documentos';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (d: string) => d.split('-').reverse().join('/');
const nomeDe = (e: Empresa) => e.nomeFantasia || e.razaoSocial;
const raiz = (c: string) => raizCnpj(c);
const cor = (s: StatusEvento) => (s.situacao === 'aceito' ? 'text-green-700 dark:text-green-300' : s.situacao === 'recusado' ? 'text-red-700 dark:text-red-300' : s.situacao === 'aguardando' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500');
const proximoDia1 = () => { const d = new Date(); return `${d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()}-${String((d.getMonth() + 1) % 12 + 1).padStart(2, '0')}-01`; };

const TransferenciaPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [fichasDestino, setFichasDestino] = useState<FichaFuncionario[]>([]);
    const [registros, setRegistros] = useState<RegistroTransferencia[]>([]);
    const [envios, setEnvios] = useState<Record<string, Envio[]>>({});
    const [modo, setModo] = useState<'estab' | 'empresa'>('empresa');
    const [fichaId, setFichaId] = useState('');
    const [destinoId, setDestinoId] = useState('');
    const [data, setData] = useState(proximoDia1());
    const [matricula, setMatricula] = useState('');
    const [estab, setEstab] = useState('');
    const [contrato, setContrato] = useState<ContratoS2200>(contratoPadrao());
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [recarga, setRecarga] = useState(0);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        Promise.all([listarEmpresasVisiveis(), listarFuncionarios(ativa.id), listarTransferencias(ativa.id).catch(() => [])])
            .then(([es, fs, rs]) => { if (vivo) { setEmpresas(es); setFichas(fs); setRegistros(rs); } })
            .catch(e => { if (vivo) setErro(`Dados não carregados: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa, recarga]);
    // Envios das empresas das transferências (situação do S-2299 e do S-2200).
    useEffect(() => {
        const ids = [...new Set([...(ativa ? [ativa.id] : []), ...registros.flatMap(r => [r.empresaId, r.destinoId])])];
        let vivo = true;
        Promise.all(ids.map(id => listarEnvios(id).then(l => [id, l] as const).catch(() => [id, [] as Envio[]] as const)))
            .then(ls => { if (vivo) setEnvios(Object.fromEntries(ls)); });
        return () => { vivo = false; };
    }, [registros, ativa]);
    useEffect(() => {
        setFichasDestino([]);
        if (!destinoId) return;
        let vivo = true;
        listarFuncionarios(destinoId).then(fs => { if (vivo) setFichasDestino(fs); }).catch(() => undefined);
        return () => { vivo = false; };
    }, [destinoId, recarga]);

    const origem = empresas.find(e => e.id === ativa?.id);
    const destino = empresas.find(e => e.id === destinoId);
    const ficha = fichas.find(f => f.id === fichaId);
    const ativos = fichas.filter(f => f.situacao === 'ativo' && !f.dados.dataDesligamento).sort((a, b) => (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR'));
    const doGrupo = empresas.filter(e => e.id !== ativa?.id && origem && raiz(e.cnpj) !== raiz(origem.cnpj)).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));
    const t: Transferencia | null = ficha && origem && destino ? { ficha, origem: { id: origem.id, cnpj: origem.cnpj, nome: nomeDe(origem) }, destino: { id: destino.id, cnpj: destino.cnpj, nome: nomeDe(destino) }, data, matricula, estabelecimento: estab } : null;
    // Troca de estabelecimento: o novo local (outro CNPJ da mesma raiz) e a data (qualquer dia).
    const estabsConhecidos = useMemo(() => [...new Set([origem?.cnpj ?? '', origem?.esocialFolha?.nrInscEstab ?? '', ...(origem?.esocialFolha?.estabelecimentos ?? []).map(x => x.nrInsc), ...fichas.map(f => f.dados.estabelecimento ?? '')]
        .map(x => limparInscricao(x)).filter(x => formatoCnpj(x) && origem && x.slice(0, 8) === raiz(origem.cnpj)))], [origem, fichas]);
    const errosTroca = useMemo(() => (modo === 'estab' && ficha && origem ? [...validarTrocaDeEstabelecimento(ficha, estab, data, origem.cnpj), ...validarContrato(ficha, contrato, estab).map(x => `S-2206: ${x}`)] : []), [modo, ficha, origem, estab, data, contrato]);
    const erros = useMemo(() => {
        if (!t) return [];
        const e = validarTransferencia(t, fichasDestino);
        // O S-2200 sai da ficha copiada: o que faltar nela (sindicato, endereço…) aparece já.
        const s = validarS2200({ cnpj: t.destino.cnpj, tpAmb, ficha: fichaNoDestino(t), contrato, sucessao: { cnpjAnterior: t.origem.cnpj, matriculaAnterior: t.ficha.matriculaEsocial, dtTransf: t.data } });
        return [...e, ...s.map(x => `S-2200: ${x}`)];
    }, [t, fichasDestino, contrato, tpAmb]); // eslint-disable-line react-hooks/exhaustive-deps

    function escolherFicha(id: string) {
        setFichaId(id);
        const f = fichas.find(x => x.id === id);
        setMatricula(f?.matriculaEsocial ?? ''); setContrato(contratoPadrao(f));
        // Com o horário da ficha (Cadastros › Horários), a jornada do S-2200 vem dele, inclusive a escala.
        if (f?.dados.horario) listarHorarios(f.empresaId).then(hs => { const h = hs.find(x => x.codigo === f.dados.horario || x.id === f.dados.horario); if (h) setContrato(c => ({ ...c, ...contratoPadrao(f, h) })); }).catch(() => { /* sem horários: fica a jornada da ficha */ });
    }
    async function gravarTroca() {
        if (!ficha || !origem || errosTroca.length) return;
        if (!window.confirm(`Trocar ${ficha.dados.nome} para o estabelecimento ${estab} a partir de ${br(data)}?`)) return;
        setOcupado('Gravando a troca…'); setErro(''); setMsg('');
        try {
            await salvarFuncionario(ficha, trocarEstabelecimento(ficha, estab, data, contrato), usuario);
            setMsg('Troca gravada na ficha. Agora transmita o S-2206 (lista abaixo).'); setFichaId(''); setRecarga(n => n + 1);
        } catch (x) { setErro(`Troca não gravada: ${mensagemErro(x)}`); }
        finally { setOcupado(''); }
    }
    // As trocas registradas nas fichas (com o contrato do S-2206).
    const trocas = fichas.flatMap(f => (f.locais ?? []).filter(x => x.contrato).map(x => ({ f, x })));
    function s2206De(f: FichaFuncionario, x: NonNullable<FichaFuncionario['locais']>[number]) {
        const st = statusPorRef(refTrocaEstabelecimento(f.id, x.desde), 'S-2206', envios[ativa?.id ?? ''] ?? []);
        const recibo = tpAmb === 1 && st.situacao === 'aceito' ? st.recibo : undefined;
        return { st, g: gerarS2206({ cnpj: origem?.cnpj ?? '', tpAmb, ficha: f, contrato: x.contrato!, dtAlteracao: x.desde, estabelecimento: x.estabelecimento, dscAlt: 'Troca de estabelecimento', recibo }) };
    }
    async function transmitirS2206(f: FichaFuncionario, x: NonNullable<FichaFuncionario['locais']>[number]) {
        if (!origem) return;
        const { g } = s2206De(f, x);
        if (!g.evento) { setErro(`S-2206: ${g.erros.join(' ')}`); return; }
        if (tpAmb === 1 && !window.confirm(`Transmitir o S-2206 de ${f.dados.nome} em PRODUÇÃO?`)) return;
        setOcupado('Transmitindo o S-2206…'); setErro(''); setMsg('');
        try {
            const pv = await verificarAntesDeEnviar({ empresa: origem, eventos: [{ xml: g.evento.xml, ref: refTrocaEstabelecimento(f.id, x.desde) }], tpAmb });
            if (!pv.ok) { setErro(`O pré-voo barrou: ${pv.achados.filter(a => a.nivel === 'bloqueio').map(a => a.mensagem).join(' · ')}`); return; }
            const m = mensagemDaTransmissao(await transmitirVerificado(pv, { empresa: origem, certificado: 'escritorio', usuario }));
            (m.ok ? setMsg : setErro)(`S-2206 de ${f.dados.nome}: ${m.texto}`);
            setRecarga(n => n + 1);
        } catch (e) { setErro(`S-2206: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    function escolherDestino(id: string) {
        setDestinoId(id);
        setEstab(limparInscricao(empresas.find(e => e.id === id)?.cnpj));
    }
    async function efetivar() {
        if (!t || erros.length) return;
        if (!window.confirm(`Transferir ${t.ficha.dados.nome} de ${t.origem.nome} para ${t.destino.nome} em ${br(t.data)}?\n\nA ficha de origem fica desligada em ${br(ultimoDiaNaOrigem(t.data))} (motivo 11) e a do destino é criada com a matrícula ${matricula}.`)) return;
        setOcupado('Gravando a transferência…'); setErro(''); setMsg('');
        try {
            const r = await efetivarTransferencia(t, contrato, usuario);
            setMsg(`Transferência gravada.${r.avisos.length ? ` Avisos: ${r.avisos.join(' · ')}` : ''} Agora transmita o S-2299 (origem) e depois o S-2200 (destino).`);
            setFichaId(''); setRecarga(n => n + 1);
        } catch (x) { setErro(`Transferência não gravada: ${mensagemErro(x)}`); }
        finally { setOcupado(''); }
    }

    // eSocial de uma transferência gravada: a ficha de origem e a do destino como estão no cadastro hoje.
    async function eventoDe(r: RegistroTransferencia, tipo: 'S-2299' | 'S-2200') {
        const emp = empresas.find(e => e.id === (tipo === 'S-2299' ? r.empresaId : r.destinoId));
        if (!emp) throw new Error('Empresa fora da sua carteira.');
        const fs = await listarFuncionarios(emp.id);
        const f = fs.find(x => x.id === (tipo === 'S-2299' ? r.fichaId : r.fichaDestinoId));
        if (!f) throw new Error('Ficha não encontrada.');
        if (tipo === 'S-2299') {
            const g = gerarS2299Transferencia({ cnpj: emp.cnpj, tpAmb, t: { ficha: f, origem: { id: r.empresaId, cnpj: r.origem.cnpj, nome: r.origem.nome }, destino: { id: r.destinoId, cnpj: r.destino.cnpj, nome: r.destino.nome }, data: r.data, matricula: r.matricula, estabelecimento: r.estabelecimento } });
            return { emp, g: { evento: g.evento, erros: g.erros }, ref: refTransferenciaSaida(r.fichaId, r.data) };
        }
        const g = gerarS2200({ cnpj: emp.cnpj, tpAmb, ficha: f, contrato: r.contrato, sucessao: { cnpjAnterior: r.origem.cnpj, matriculaAnterior: r.matriculaOrigem, dtTransf: r.data } });
        return { emp, g, ref: refTransferenciaEntrada(r.fichaId, r.data) };
    }
    async function baixar(r: RegistroTransferencia, tipo: 'S-2299' | 'S-2200') {
        try {
            const { g } = await eventoDe(r, tipo);
            if (!g.evento) { setErro(`${tipo}: ${g.erros.join(' ')}`); return; }
            baixarBytes(`${tipo}-${r.cpf}.xml`, new TextEncoder().encode(g.evento.xml), 'application/xml');
        } catch (x) { setErro(`${tipo}: ${(x as Error).message}`); }
    }
    async function transmitir(r: RegistroTransferencia, tipo: 'S-2299' | 'S-2200') {
        if (tpAmb === 1 && !window.confirm(`Transmitir o ${tipo} da transferência de ${r.nome} em PRODUÇÃO?`)) return;
        setOcupado(`Transmitindo o ${tipo}…`); setErro(''); setMsg('');
        try {
            const { emp, g, ref } = await eventoDe(r, tipo);
            if (!g.evento) { setErro(`${tipo}: ${g.erros.join(' ')}`); return; }
            const pv = await verificarAntesDeEnviar({ empresa: emp, eventos: [{ xml: g.evento.xml, ref }], tpAmb });
            if (!pv.ok) { setErro(`O pré-voo barrou: ${pv.achados.filter(a => a.nivel === 'bloqueio').map(a => a.mensagem).join(' · ')}`); return; }
            const res = await transmitirVerificado(pv, { empresa: emp, certificado: 'escritorio', usuario });
            const m = mensagemDaTransmissao(res);
            (m.ok ? setMsg : setErro)(`${tipo} de ${r.nome}: ${m.texto}`);
            setRecarga(n => n + 1);
        } catch (x) { setErro(`${tipo}: ${(x as Error).message}`); }
        finally { setOcupado(''); }
    }

    if (!ativa) return <p className="rounded-sm border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative a empresa de origem.</p>;
    const mc = (x: Partial<ContratoS2200>) => setContrato(c => ({ ...c, ...x }));
    const contratoCampos = (
        <fieldset className="grid gap-2 rounded-sm border border-slate-200 p-2 sm:grid-cols-4 dark:border-slate-700">
                    <legend className="px-1 text-xs font-medium">Contrato no {modo === 'estab' ? 'S-2206' : 'S-2200'} (o que a ficha não guarda)</legend>
                    <label>Regime de jornada<select aria-label="Regime de jornada" className={`block w-full ${inp}`} value={contrato.tpRegJor} onChange={e => mc({ tpRegJor: e.target.value as ContratoS2200['tpRegJor'] })}>
                        <option value="1">Submetido a horário</option><option value="2">Atividade externa (art. 62, I)</option><option value="3">Cargo de gestão (art. 62, II)</option><option value="4">Teletrabalho (art. 62, III)</option></select></label>
                    <label>Natureza<select aria-label="Natureza da atividade" className={`block w-full ${inp}`} value={contrato.natAtividade} onChange={e => mc({ natAtividade: e.target.value as '1' | '2' })}><option value="1">Urbana</option><option value="2">Rural</option></select></label>
                    <label>Tipo de jornada<select aria-label="Tipo de jornada" className={`block w-full ${inp}`} value={contrato.tpJornada} onChange={e => mc({ tpJornada: e.target.value })}>{TIPOS_JORNADA.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
                    <label>Tempo parcial<select aria-label="Tempo parcial" className={`block w-full ${inp}`} value={contrato.tmpParc} onChange={e => mc({ tmpParc: e.target.value as ContratoS2200['tmpParc'] })}>
                        <option value="0">Não</option><option value="1">Até 25 h</option><option value="3">Até 26 h</option><option value="2">Até 30 h</option></select></label>
                    <label>Horário noturno<select aria-label="Horário noturno" className={`block w-full ${inp}`} value={contrato.horNoturno} onChange={e => mc({ horNoturno: e.target.value as 'S' | 'N' })}><option value="N">Não</option><option value="S">Sim</option></select></label>
                    <label>Data-base (mês)<input aria-label="Data-base" className={`block w-full ${inp}`} value={contrato.dtBase} placeholder="ex.: 05" onChange={e => mc({ dtBase: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
                    <label className="sm:col-span-2">Jornada (dias, entrada, saída e intervalos)<input aria-label="Descrição da jornada" className={`block w-full ${inp}`} value={contrato.dscJorn} onChange={e => mc({ dscJorn: e.target.value })} /></label>
                    {modo !== 'estab' && ['2', '3'].includes(ficha?.dados.tipoContrato ?? '') && (
                        <label>Cláusula assecuratória<select aria-label="Cláusula assecuratória" className={`block w-full ${inp}`} value={contrato.clauAssec ?? ''} onChange={e => mc({ clauAssec: (e.target.value || undefined) as ContratoS2200['clauAssec'] })}>
                            <option value="">— escolha —</option><option value="S">Sim</option><option value="N">Não</option></select></label>
                    )}
                    {modo !== 'estab' && ficha?.dados.tipoContrato === '3' && (
                        <label className="sm:col-span-3">Objeto determinante (obra, serviço, safra…)<input aria-label="Objeto determinante" maxLength={255} className={`block w-full ${inp}`} value={contrato.objDet ?? ''} onChange={e => mc({ objDet: e.target.value })} /></label>
                    )}
                    {ficha?.dados.categoria === '103' && (() => {
                        const a = contrato.aprend ?? { indAprend: '1' as const };
                        const ma = (x: Partial<NonNullable<ContratoS2200['aprend']>>) => mc({ aprend: { ...a, ...x } });
                        return (<>
                            <label>Aprendiz: contratação<select aria-label="Contratação do aprendiz" className={`block w-full ${inp}`} value={a.indAprend} onChange={e => ma({ indAprend: e.target.value as '1' | '2' })}>
                                <option value="1">Direta (entidade qualificadora)</option><option value="2">Indireta (estabelecimento da cota)</option></select></label>
                            {a.indAprend === '1'
                                ? <label>CNPJ da entidade qualificadora<input aria-label="CNPJ da entidade qualificadora" className={`block w-full ${inp}`} value={a.cnpjEntQual ?? ''} onChange={e => ma({ cnpjEntQual: e.target.value })} /></label>
                                : <><label>Tipo de inscrição<select aria-label="Inscrição do estabelecimento da cota" className={`block w-full ${inp}`} value={a.tpInsc ?? '1'} onChange={e => ma({ tpInsc: e.target.value as '1' | '2' })}><option value="1">CNPJ</option><option value="2">CPF</option></select></label>
                                    <label>Estabelecimento cumpridor da cota<input aria-label="Estabelecimento cumpridor da cota" className={`block w-full ${inp}`} value={a.nrInsc ?? ''} onChange={e => ma({ nrInsc: e.target.value, tpInsc: a.tpInsc ?? '1' })} /></label></>}
                            <label>CNPJ das atividades práticas (opcional)<input aria-label="CNPJ das atividades práticas" className={`block w-full ${inp}`} value={a.cnpjPrat ?? ''} onChange={e => ma({ cnpjPrat: e.target.value })} /></label>
                        </>);
                    })()}
                    {modo !== 'estab' && ficha?.dados.categoria === '106' && (() => {
                        const t = contrato.trabTemporario ?? { hipLeg: '2' as const, justContr: '', ideEstabVinc: { tpInsc: '1' as const, nrInsc: '' }, cpfSubstituidos: [] };
                        const mt = (x: Partial<NonNullable<ContratoS2200['trabTemporario']>>) => mc({ trabTemporario: { ...t, ...x } });
                        return (<>
                            <label>Temporário: hipótese legal<select aria-label="Hipótese legal do temporário" className={`block w-full ${inp}`} value={t.hipLeg} onChange={e => mt({ hipLeg: e.target.value as '1' | '2' })}>
                                <option value="1">Substituição de pessoal permanente</option><option value="2">Demanda complementar de serviços</option></select></label>
                            <label className="sm:col-span-3">Fato que justifica a contratação<input aria-label="Justificativa do temporário" maxLength={999} className={`block w-full ${inp}`} value={t.justContr} onChange={e => mt({ justContr: e.target.value })} /></label>
                            <label>Tomador: CNPJ ou CPF<input aria-label="Inscrição do tomador" className={`block w-full ${inp}`} value={t.ideEstabVinc.nrInsc} onChange={e => mt({ ideEstabVinc: { tpInsc: e.target.value.replace(/\D/g, '').length === 11 ? '2' : '1', nrInsc: e.target.value } })} /></label>
                            {t.hipLeg === '1' && <label className="sm:col-span-3">CPF de quem é substituído (separe por vírgula)<input aria-label="CPF substituído" className={`block w-full ${inp}`} value={t.cpfSubstituidos.join(', ')} onChange={e => mt({ cpfSubstituidos: e.target.value.split(/[,;\s]+/).filter(Boolean) })} /></label>}
                        </>);
                    })()}
                </fieldset>
    );
    return (
        <div className="space-y-4 text-sm">
            <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Transferência de funcionários</h2>
                <p className="text-slate-600 dark:text-slate-300">Para outra empresa do mesmo grupo, sem rescisão (CLT, arts. 10 e 448): o contrato continua com a data de admissão, as férias e o 13º, agora a cargo da empresa de destino. No eSocial, o S-2299 da origem (motivo 11, sem verbas) e o S-2200 do destino (transferência, com a sucessão). Troca de estabelecimento da mesma empresa é alteração contratual (S-2206), não esta tela.</p>
            </div>

            <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Tipo de transferência">
                <label className="flex items-center gap-2"><input type="radio" checked={modo === 'estab'} onChange={() => { setModo('estab'); setFichaId(''); setEstab(''); }} />Troca de estabelecimento (mesma empresa)</label>
                <label className="flex items-center gap-2"><input type="radio" checked={modo === 'empresa'} onChange={() => { setModo('empresa'); setFichaId(''); setEstab(''); setData(proximoDia1()); }} />Para outra empresa do grupo</label>
            </div>

            {modo === 'estab' && (
                <section aria-label="Troca de estabelecimento" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <p className="font-medium">Troca de estabelecimento em {origem ? nomeDe(origem) : ativa.nome}</p>
                    <div className="grid gap-2 sm:grid-cols-4">
                        <label className="sm:col-span-2">Funcionário<select aria-label="Funcionário da troca" className={`block w-full ${inp}`} value={fichaId} onChange={e => escolherFicha(e.target.value)}>
                            <option value="">— escolha —</option>{ativos.map(f => <option key={f.id} value={f.id}>{f.dados.nome} · {f.matriculaEsocial} · {estabelecimentoNoDia(f, data) || 'sem estabelecimento'}</option>)}</select></label>
                        <label>Novo estabelecimento (CNPJ)<input aria-label="Novo estabelecimento" list="estabs-empresa" className={`block w-full ${inp}`} value={estab} onChange={e => setEstab(digitarCnpj(e.target.value))} />
                            <datalist id="estabs-empresa">{estabsConhecidos.map(x => <option key={x} value={x} />)}</datalist></label>
                        <label>A partir de<input aria-label="Data da troca" type="date" className={`block w-full ${inp}`} value={data} onChange={e => setData(e.target.value)} /></label>
                    </div>
                    {ficha && <p className="text-xs text-slate-500">Hoje no estabelecimento {estabelecimentoNoDia(ficha, data) || '—'}. No mês da troca, o S-1200 sai nos dois estabelecimentos, com os proventos pelos dias em cada um.</p>}
                    {ficha && contratoCampos}
                    {ficha && errosTroca.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-amber-50 p-2 pl-6 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{errosTroca.map(x => <li key={x}>{x}</li>)}</ul>}
                    <div className="flex justify-end"><button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!ficha || errosTroca.length > 0 || !!ocupado} onClick={gravarTroca}>Gravar a troca</button></div>
                </section>
            )}

            {modo === 'estab' && trocas.length > 0 && (
                <section aria-label="Trocas de estabelecimento" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Trocas de estabelecimento e o S-2206</p>
                        <select aria-label="Ambiente do S-2206" className={inp} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}><option value={2}>Produção restrita</option><option value={1}>Produção</option></select>
                    </div>
                    <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Funcionário</th><th className="p-1">Estabelecimento</th><th className="p-1">Desde</th><th className="p-1">S-2206</th></tr></thead>
                        <tbody>{trocas.map(({ f, x }) => {
                            const { st, g } = s2206De(f, x);
                            return (
                                <tr key={`${f.id}_${x.desde}`} className="border-t border-slate-100 align-top dark:border-slate-700">
                                    <td className="p-1">{f.dados.nome}</td><td className="p-1 font-mono">{x.estabelecimento}</td><td className="p-1">{br(x.desde)}</td>
                                    <td className="space-x-2 p-1"><span className={cor(st)}>{st.rotulo}</span>{st.recibo ? ` · ${st.recibo}` : ''}
                                        {g.erros.map(e => <span key={e} className="block text-red-700 dark:text-red-300">✗ {e}</span>)}
                                        <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!!ocupado || !g.evento || st.situacao === 'aguardando'} onClick={() => transmitirS2206(f, x)}>{tpAmb === 1 && st.situacao === 'aceito' ? 'Retificar' : 'Transmitir'}</button>
                                        <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!g.evento} onClick={() => g.evento && baixarBytes(`S-2206-${f.cpf}-${x.desde}.xml`, new TextEncoder().encode(g.evento.xml), 'application/xml')}>XML</button></td>
                                </tr>
                            );
                        })}</tbody></table>
                </section>
            )}

            {modo === 'empresa' && <section aria-label="Nova transferência" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                <p className="font-medium">Nova transferência a partir de {origem ? nomeDe(origem) : ativa.nome}</p>
                <div className="grid gap-2 sm:grid-cols-4">
                    <label className="sm:col-span-2">Funcionário<select aria-label="Funcionário a transferir" className={`block w-full ${inp}`} value={fichaId} onChange={e => escolherFicha(e.target.value)}>
                        <option value="">— escolha —</option>{ativos.map(f => <option key={f.id} value={f.id}>{f.dados.nome} · {f.matriculaEsocial}</option>)}</select></label>
                    <label className="sm:col-span-2">Empresa de destino<select aria-label="Empresa de destino" className={`block w-full ${inp}`} value={destinoId} onChange={e => escolherDestino(e.target.value)}>
                        <option value="">— escolha —</option>{doGrupo.map(e => <option key={e.id} value={e.id}>{e.codigoSage} · {nomeDe(e)}</option>)}</select></label>
                    <label>Data (1º dia no destino)<input aria-label="Data da transferência" type="date" className={`block w-full ${inp}`} value={data} onChange={e => setData(e.target.value)} /></label>
                    <label>Matrícula no destino<input aria-label="Matrícula no destino" className={`block w-full ${inp}`} value={matricula} onChange={e => setMatricula(e.target.value.slice(0, 30))} /></label>
                    <label className="sm:col-span-2">Estabelecimento de destino (CNPJ)<input aria-label="Estabelecimento de destino" className={`block w-full ${inp}`} value={estab} onChange={e => setEstab(digitarCnpj(e.target.value))} /></label>
                </div>
                {ficha && contratoCampos}
                {t && erros.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-amber-50 p-2 pl-6 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{erros.map(x => <li key={x}>{x}</li>)}</ul>}
                {t && !erros.length && <p className="text-xs text-slate-500">Último dia na origem: {br(ultimoDiaNaOrigem(data))}. Vão para o destino: a ficha (sem horário, lotação, departamento e código do IOB, que são da empresa), os dependentes, o histórico de salário, as férias e os afastamentos terminados e os movimentos dos meses anteriores.</p>}
                <div className="flex justify-end"><button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!t || erros.length > 0 || !!ocupado} onClick={efetivar}>Gravar a transferência</button></div>
            </section>}

            {modo === 'empresa' && registros.length > 0 && (
                <section aria-label="Transferências" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Transferências desta empresa (saídas e entradas)</p>
                        <select aria-label="Ambiente do eSocial" className={inp} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}><option value={2}>Produção restrita</option><option value={1}>Produção</option></select>
                    </div>
                    <p className="text-xs text-slate-500">Ordem: o S-2299 da origem e, depois de aceito, o S-2200 do destino. O S-2200 sai da ficha do destino como está no cadastro: complete-a lá antes, se faltar algo.</p>
                    <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Funcionário</th><th className="p-1">De → para</th><th className="p-1">Data</th><th className="p-1">S-2299 (origem)</th><th className="p-1">S-2200 (destino)</th></tr></thead>
                        <tbody>{registros.map(r => {
                            const s1 = statusPorRef(refTransferenciaSaida(r.fichaId, r.data), 'S-2299', envios[r.empresaId] ?? []);
                            const s2 = statusPorRef(refTransferenciaEntrada(r.fichaId, r.data), 'S-2200', envios[r.destinoId] ?? []);
                            const naCarteira = (id: string) => empresas.some(e => e.id === id);
                            return (
                                <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-700">
                                    <td className="p-1">{r.nome}<br /><span className="text-slate-500">{r.matriculaOrigem} → {r.matricula}</span>{r.avisos.length ? <span className="block text-amber-700 dark:text-amber-300">⚠ {r.avisos.join(' · ')}</span> : null}</td>
                                    <td className="p-1">{r.origem.nome} → {r.destino.nome}{r.situacao !== 'efetivada' ? <span className="block text-red-700 dark:text-red-300">Gravação incompleta: confira as fichas.</span> : null}</td>
                                    <td className="p-1">{br(r.data)}</td>
                                    <td className="space-x-2 p-1"><span className={cor(s1)}>{s1.rotulo}</span>
                                        <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!!ocupado || !naCarteira(r.empresaId) || s1.situacao === 'aceito' || s1.situacao === 'aguardando'} onClick={() => transmitir(r, 'S-2299')}>Transmitir</button>
                                        <button className="text-blue-700 underline dark:text-blue-300" onClick={() => baixar(r, 'S-2299')}>XML</button></td>
                                    <td className="space-x-2 p-1"><span className={cor(s2)}>{s2.rotulo}</span>
                                        <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!!ocupado || !naCarteira(r.destinoId) || s2.situacao === 'aceito' || s2.situacao === 'aguardando' || (tpAmb === 1 && s1.situacao !== 'aceito')} title={tpAmb === 1 && s1.situacao !== 'aceito' ? 'Depois do S-2299 aceito.' : ''} onClick={() => transmitir(r, 'S-2200')}>Transmitir</button>
                                        <button className="text-blue-700 underline dark:text-blue-300" onClick={() => baixar(r, 'S-2200')}>XML</button></td>
                                </tr>
                            );
                        })}</tbody></table>
                </section>
            )}

            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
        </div>
    );
};

export default TransferenciaPanel;
