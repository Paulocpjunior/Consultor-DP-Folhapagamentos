// components/contribuintes/ContribuintesPanel.tsx
//
// Folha do mês › Pró-labore e autônomos (RPA), da empresa ativa: o cadastro dos sócios, diretores e autônomos, os
// pagamentos do mês com o cálculo (services/contribuintes/contribuinteIndividual.ts), os recibos em PDF, o resumo
// (o que vai na DCTFWeb) e o S-1200 e o S-1210 de cada um (services/esocial/eventosCI.ts), com o pré-voo e o envio
// pelo CFI, como na folha. O S-2300 (início) e o S-2399 (término) do sócio e do diretor saem daqui também
// (services/esocial/eventosTSV.ts); o S-2300 aceito na produção libera o S-1200 sem marcar nada no cadastro.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis, salvarParametrosEsocialFolha } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarEnquadramentos, listarRubricas, listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { enquadramentoVigente, type Enquadramento } from '../../services/cadastros/enquadramento';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import { vigenciaEm, type Rubrica } from '../../services/cadastros/rubricas';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { normalizar, parametrosVazios, type ParametrosEsocialFolha } from '../../services/esocial/eventosFolha';
import { CHAVES_CI, gerarEventosCI, tpRubrDoTipo } from '../../services/esocial/eventosCI';
import { listarEnvios, type Envio } from '../../services/esocial/transmissaoService';
import { exclusoesDosEnvios, recibosCIDosEnvios, recibosVigentes } from '../../services/esocial/recibosEsocial';
import { listarFuncionarios } from '../../services/cadastros/cadastrosService';
import { verificarAntesDeEnviar, transmitirVerificado, mensagemDaTransmissao } from '../../services/esocial/envioSeguro';
import type { TpAmb } from '../../services/esocial/transmissao';
import { baixarBytes, gerarZip } from '../../services/implantacao/zip';
import { statusPorRef, type StatusEvento } from '../../services/esocial/statusEvento';
import { ESTADO_CIVIL, GRAU_INSTRUCAO, MOTIVOS_TERMINO_721, RACA_COR, gerarS2300, gerarS2399, refInicioTSV, refTerminoTSV } from '../../services/esocial/eventosTSV';
import { lerFechamento } from '../../services/fimDeMes/fechamentoService';
import { quintoDiaUtilSalario, somarMeses } from '../../services/prazos/calendario';
import {
    CATEGORIAS_CI, calcularCI, contribuinteVazio, idContribuinte, totaisCI, validarContribuinte, validarLancamentos,
    type CategoriaCI, type ContribuinteIndividual, type DadosTSV, type LancamentoCI, type OutraFonte, type ResultadoCI,
} from '../../services/contribuintes/contribuinteIndividual';
import { excluirPagamentosCI, gravarPagamentosCI, lerPagamentosCI, listarContribuintes, salvarContribuinte } from '../../services/contribuintes/contribuintesService';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const txt = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
const hojeLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const corSituacao = (s: StatusEvento) => (s.situacao === 'aceito' || s.situacao === 'iob' ? 'text-green-700 dark:text-green-300' : s.situacao === 'recusado' ? 'text-red-700 dark:text-red-300' : s.situacao === 'aguardando' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500');

interface Linha { contribuinteId: string; valor: string; descricao: string; dataPagamento: string; iss: string; outras: { tpInsc: '1' | '2'; nrInsc: string; codCateg: string; valor: string }[] }
const paraLinha = (l: LancamentoCI): Linha => ({ contribuinteId: l.contribuinteId, valor: txt(l.valor), descricao: l.descricao, dataPagamento: l.dataPagamento, iss: l.issAliquota ? String(l.issAliquota).replace('.', ',') : '',
    outras: l.outrasFontes.map(o => ({ tpInsc: o.tpInsc, nrInsc: o.nrInsc, codCateg: o.codCateg, valor: txt(o.valor) })) });
const deLinha = (l: Linha): LancamentoCI => ({ contribuinteId: l.contribuinteId, valor: centavosDeTexto(l.valor) ?? 0, descricao: l.descricao.trim(), dataPagamento: l.dataPagamento,
    issAliquota: Number(l.iss.replace(',', '.')) || 0, outrasFontes: l.outras.map((o): OutraFonte => ({ tpInsc: o.tpInsc, nrInsc: o.nrInsc.replace(/\D/g, ''), codCateg: o.codCateg, valor: centavosDeTexto(o.valor) ?? 0 })) });

const ContribuintesPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const competencia = ativa?.competencia ?? '';
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [contribuintes, setContribuintes] = useState<ContribuinteIndividual[]>([]);
    const [tabelas, setTabelas] = useState<TabelaLegal[]>([]);
    const [enquadramentos, setEnquadramentos] = useState<Enquadramento[]>([]);
    const [rubricas, setRubricas] = useState<Rubrica[]>([]);
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [gravadoPor, setGravadoPor] = useState('');
    const [encerrado, setEncerrado] = useState(false);
    const [edicao, setEdicao] = useState<ContribuinteIndividual | null>(null);
    const [aberto, setAberto] = useState('');
    const [recarga, setRecarga] = useState(0);
    const [params, setParams] = useState<ParametrosEsocialFolha | null>(null);
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [envios, setEnvios] = useState<Envio[]>([]);
    const [cpfsEmpregados, setCpfsEmpregados] = useState<Set<string>>(new Set());
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setErro('');
        Promise.all([listarEmpresasVisiveis(), listarContribuintes(ativa.id), listarTabelas(), listarEnquadramentos(ativa.id).catch(() => []), listarRubricas(ativa.id).catch(() => []),
            competencia ? lerPagamentosCI(ativa.id, competencia).catch(() => null) : Promise.resolve(null), competencia ? lerFechamento(ativa.id, competencia).catch(() => null) : Promise.resolve(null),
            listarEnvios(ativa.id).catch(() => [] as Envio[]), listarFuncionarios(ativa.id).catch(() => [])])
            .then(([emps, cs, tabs, enqs, rubs, gravado, fech, envs, fichas]) => {
                if (!vivo) return;
                setEnvios(envs); setCpfsEmpregados(new Set(fichas.map(f => f.cpf.replace(/\D/g, ''))));
                const emp = emps.find(e => e.id === ativa.id) ?? null;
                setEmpresa(emp); setContribuintes(cs); setTabelas(tabs); setEnquadramentos(enqs); setRubricas(rubs);
                setParams(emp?.esocialFolha ?? parametrosVazios(emp?.cnpj ?? ativa.cnpj));
                setLinhas(gravado ? gravado.lancamentos.map(paraLinha) : []); setGravadoPor(gravado ? gravado.gravadoPorEmail : '');
                setEncerrado(fech?.situacao === 'encerrado');
            })
            .catch(e => { if (vivo) setErro(`Dados não carregados: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa, competencia, recarga]);

    // S-2300 e S-2399 pelo Consultor: a situação de cada um pelos lotes; o S-2300 aceito na produção vale como enviado.
    const stInicio = (c: ContribuinteIndividual) => statusPorRef(refInicioTSV(c.id), 'S-2300', envios, c.s2300 ? { recibo: '', detalhe: 'marcado como enviado no cadastro' } : null);
    const stTermino = (c: ContribuinteIndividual) => statusPorRef(refTerminoTSV(c.id), 'S-2399', envios);
    const cadastro = useMemo(() => contribuintes.map(c => (!c.s2300 && statusPorRef(refInicioTSV(c.id), 'S-2300', envios).situacao === 'aceito' ? { ...c, s2300: true } : c)), [contribuintes, envios]);
    const enquadramento = useMemo(() => {
        if (!ativa || !competencia) return undefined;
        const v = enquadramentoVigente(enquadramentos, ativa.id, competencia);
        return v && 'enquadramento' in v ? v.enquadramento : undefined;
    }, [enquadramentos, ativa, competencia]);
    const lancamentos = linhas.map(deLinha);
    const errosLanc = competencia ? validarLancamentos(competencia, lancamentos, cadastro) : ['Ative a empresa e a competência.'];
    const resultados: ResultadoCI[] = useMemo(() => (errosLanc.length ? [] : lancamentos.map(l => calcularCI(cadastro.find(c => c.id === l.contribuinteId)!, l, competencia, tabelas, enquadramento))),
        [JSON.stringify(lancamentos), cadastro, competencia, tabelas, enquadramento, errosLanc.length]); // eslint-disable-line react-hooks/exhaustive-deps
    const tot = totaisCI(resultados);
    const ativos = cadastro.filter(c => c.ativo);
    const comTSV = cadastro.filter(c => CATEGORIAS_CI[c.categoria]?.exigeS2300 || c.tsv.dtInicio);
    const pagamentoPadrao = () => { if (!competencia) return ''; const [a, m] = somarMeses(`${competencia}-01`, 1).split('-').map(Number); return quintoDiaUtilSalario(a, m); };

    async function gravarCadastro() {
        if (!edicao || !ativa) return;
        const c = { ...edicao, cpf: edicao.cpf.replace(/\D/g, ''), cbo: edicao.cbo.replace(/\D/g, ''), empresaId: ativa.id, matricula: edicao.matricula.trim() };
        const e = validarContribuinte(c);
        if (!edicao.id && contribuintes.some(x => x.id === idContribuinte(ativa.id, c.cpf))) e.push('Já há cadastro com este CPF: edite o existente.');
        if (e.length) { setErro(e.join(' ')); return; }
        setOcupado('Gravando o cadastro…'); setErro('');
        try { await salvarContribuinte(c, usuario); setEdicao(null); setMsg(`${c.nome} gravado.`); setRecarga(n => n + 1); }
        catch (x) { setErro(`Não foi possível gravar (${mensagemErro(x)}).`); }
        finally { setOcupado(''); }
    }
    async function gravarMes() {
        if (!ativa || errosLanc.length) return;
        setOcupado('Gravando o mês…'); setErro('');
        try { await gravarPagamentosCI(ativa.id, competencia, lancamentos, resultados, usuario); setMsg('Pagamentos do mês gravados.'); setRecarga(n => n + 1); }
        catch (x) { setErro(`Não foi possível gravar (${mensagemErro(x)}).`); }
        finally { setOcupado(''); }
    }
    async function excluirMes() {
        if (!ativa || !window.confirm(`Excluir os pagamentos gravados de ${br(competencia)}?`)) return;
        setOcupado('Excluindo…');
        try { await excluirPagamentosCI(ativa.id, competencia); setMsg('Gravação excluída.'); setRecarga(n => n + 1); }
        catch (x) { setErro(`Não foi possível excluir (${mensagemErro(x)}).`); }
        finally { setOcupado(''); }
    }
    async function recibos() {
        if (!ativa) return;
        try {
            const { recibosCIPdf } = await import('../../services/contribuintes/recibosCIPdf');
            recibosCIPdf(resultados, cadastro, { empresa: { razaoSocial: empresa?.razaoSocial || ativa.nome, cnpj: ativa.cnpj.replace(/\D/g, ''), codigoSage: ativa.codigoSage }, titulo: 'Recibos', previa: false, emitidoPor: usuario.email })
                .save(`recibos-prolabore-rpa-${ativa.codigoSage || 'empresa'}-${competencia}.pdf`);
        } catch (x) { setErro(`PDF não gerado: ${(x as Error).message}`); }
    }

    // eSocial: o de/para do pró-labore, do RPA e do ISS (o INSS e o IRRF são os da folha).
    const vigentes = useMemo(() => rubricas.map(r => ({ r, v: vigenciaEm(r, competencia) })).filter(x => x.v), [rubricas, competencia]);
    const sugestao = (k: typeof CHAVES_CI[number]) => {
        const tp = tpRubrDoTipo(k.tipo);
        const doTipo = vigentes.filter(x => x.v!.dados.tpRubr === tp && (!k.codIncCP || x.v!.dados.codIncCP === k.codIncCP));
        const porNat = k.naturezas.length ? doTipo.filter(x => k.naturezas.includes(x.v!.dados.natRubr)) : [];
        const cand = porNat.length ? porNat : doTipo.filter(x => k.dica.test(normalizar(x.v!.dados.dscRubr)));
        return cand.length === 1 ? { codRubr: cand[0].r.codRubr, ideTabRubr: cand[0].r.ideTabRubr } : null;
    };
    const efetivos = useMemo(() => {
        if (!params) return null;
        const r = { ...params.rubricas };
        for (const k of CHAVES_CI) if (!r[k.chave]) { const s = sugestao(k); if (s) r[k.chave] = s; }
        return { ...params, rubricas: r };
    }, [params, vigentes]); // eslint-disable-line react-hooks/exhaustive-deps
    // Retificação: o recibo vigente de cada CPF (envios aceitos em produção), do S-1200 da competência e do S-1210 do mês do pagamento.
    const recibosVigentesCI = useMemo(() => {
        if (tpAmb !== 1) return undefined;
        const todos = recibosCIDosEnvios(envios); const ex = exclusoesDosEnvios(envios);
        const s1200 = new Map([...recibosVigentes(todos, 'S-1200', competencia, ex)].map(([cpf, r]) => [cpf, r.nrRecibo]));
        const s1210 = new Map<string, string>();
        for (const mes of new Set(resultados.map(r => r.dataPagamento.slice(0, 7)))) for (const [cpf, r] of recibosVigentes(todos, 'S-1210', mes, ex)) if (!r.excluidoEm) s1210.set(cpf, r.nrRecibo);
        return { s1200, s1210 };
    }, [envios, competencia, resultados, tpAmb]);
    const geracao = useMemo(() => (empresa && efetivos && resultados.length ? gerarEventosCI({ cnpj: empresa.cnpj, tpAmb, competencia, contribuintes: cadastro, resultados, rubricas, parametros: efetivos, recibos: recibosVigentesCI, cpfsEmpregados }) : null),
        [empresa, efetivos, resultados, tpAmb, competencia, cadastro, rubricas, recibosVigentesCI, cpfsEmpregados]);
    const prontos = geracao?.eventos.filter(t => t.s1200) ?? [];
    async function gravarDePara() {
        if (!empresa || !efetivos) return;
        setOcupado('Gravando o de/para…');
        try { await salvarParametrosEsocialFolha(empresa.id, efetivos, empresa.esocialFolha); setEmpresa({ ...empresa, esocialFolha: efetivos }); setParams(efetivos); setMsg('De/para gravado na empresa.'); }
        catch (x) { setErro(`Não foi possível gravar o de/para (${mensagemErro(x)}).`); }
        finally { setOcupado(''); }
    }
    function baixarXmls() {
        const arquivos = prontos.flatMap(t => [{ nome: `S-1200-${t.cpf}.xml`, conteudo: t.s1200!.xml }, ...(t.s1210 ? [{ nome: `S-1210-${t.cpf}.xml`, conteudo: t.s1210.xml }] : [])]);
        baixarBytes(`prolabore-rpa-${competencia}.zip`, gerarZip(arquivos), 'application/zip');
    }
    async function transmitir(tipo: 'S-1200' | 'S-1210') {
        if (!empresa || !prontos.length) return;
        if (tpAmb === 1 && !window.confirm(`Transmitir o ${tipo} de ${prontos.length} pessoa(s) em PRODUÇÃO?`)) return;
        setOcupado(`Transmitindo o ${tipo}…`); setErro(''); setMsg('');
        try {
            const eventos = prontos.filter(t => (tipo === 'S-1200' ? t.s1200 : t.s1210)).map(t => ({ xml: tipo === 'S-1200' ? t.s1200!.xml : t.s1210!.xml, ref: `ci:${t.cpf}:${competencia}` }));
            if (!eventos.length) { setErro(`Nenhum ${tipo} para transmitir.`); return; }
            const pv = await verificarAntesDeEnviar({ empresa, eventos, tpAmb });
            if (!pv.ok) { setErro(`O pré-voo barrou: ${pv.achados.filter(a => a.nivel === 'bloqueio').map(a => a.mensagem).join(' · ')}`); return; }
            const r = await transmitirVerificado(pv, { empresa, certificado: 'escritorio', usuario });
            const m = mensagemDaTransmissao(r);
            (m.ok ? setMsg : setErro)(`${tipo}: ${m.texto}`);
        } catch (x) { setErro(`${tipo}: ${(x as Error).message}`); }
        finally { setOcupado(''); }
    }

    function eventoTSV(c: ContribuinteIndividual, tipo: 'S-2300' | 'S-2399') {
        const st = tipo === 'S-2300' ? stInicio(c) : stTermino(c);
        const recibo = tpAmb === 1 && st.situacao === 'aceito' && st.recibo ? st.recibo : undefined;
        return tipo === 'S-2300' ? gerarS2300({ cnpj: empresa?.cnpj ?? ativa?.cnpj ?? '', tpAmb, contribuinte: c, nrInscEstab: params?.nrInscEstab ?? '', recibo })
            : gerarS2399({ cnpj: empresa?.cnpj ?? ativa?.cnpj ?? '', tpAmb, contribuinte: c, hoje: hojeLocal(), recibo });
    }
    function baixarTSV(c: ContribuinteIndividual, tipo: 'S-2300' | 'S-2399') {
        const g = eventoTSV(c, tipo);
        if (!g.evento) { setErro(`${tipo} de ${c.nome}: ${g.erros.join(' ')}`); return; }
        baixarBytes(`${tipo}-${c.cpf}.xml`, new TextEncoder().encode(g.evento.xml), 'application/xml');
    }
    async function transmitirTSV(c: ContribuinteIndividual, tipo: 'S-2300' | 'S-2399') {
        if (!empresa) return;
        const g = eventoTSV(c, tipo);
        if (!g.evento) { setErro(`${tipo} de ${c.nome}: ${g.erros.join(' ')}`); return; }
        if (tpAmb === 1 && !window.confirm(`Transmitir o ${tipo} de ${c.nome} em PRODUÇÃO?${g.avisos.length ? `\n\n${g.avisos.join('\n')}` : ''}`)) return;
        setOcupado(`Transmitindo o ${tipo}…`); setErro(''); setMsg('');
        try {
            const pv = await verificarAntesDeEnviar({ empresa, eventos: [{ xml: g.evento.xml, ref: tipo === 'S-2300' ? refInicioTSV(c.id) : refTerminoTSV(c.id) }], tpAmb });
            if (!pv.ok) { setErro(`O pré-voo barrou: ${pv.achados.filter(a => a.nivel === 'bloqueio').map(a => a.mensagem).join(' · ')}`); return; }
            const r = await transmitirVerificado(pv, { empresa, certificado: 'escritorio', usuario });
            const m = mensagemDaTransmissao(r);
            (m.ok ? setMsg : setErro)(`${tipo} de ${c.nome}: ${m.texto}`);
            setRecarga(n => n + 1);
        } catch (x) { setErro(`${tipo}: ${(x as Error).message}`); }
        finally { setOcupado(''); }
    }

    if (!ativa) return <p className="rounded-sm border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative uma empresa para lançar pró-labore e RPA.</p>;
    const muda = (i: number, x: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...x } : l)));
    return (
        <div className="space-y-4 text-sm">
            <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Pró-labore e autônomos (RPA) · {competencia ? br(competencia) : '—'}</h2>
                <p className="text-slate-600 dark:text-slate-300">INSS de 11% até o teto (com outras fontes no mês, só até completar), 20% da empresa (no Simples fora do Anexo IV, no DAS), IRRF pela tabela do mês do pagamento e ISS retido do autônomo não inscrito no município. Sem férias e 13º; FGTS de 8% só do diretor equiparado (721). O S-2300 e o S-2399 do sócio e do diretor saem daqui.</p>
            </div>

            <section className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between"><p className="font-medium">Sócios, diretores e autônomos</p>
                    <button className={btn} onClick={() => setEdicao({ ...contribuinteVazio(ativa.id) })}>+ Cadastrar</button></div>
                {contribuintes.length === 0 && <p className="text-slate-500">Ninguém cadastrado nesta empresa.</p>}
                {contribuintes.length > 0 && (
                    <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Nome</th><th className="p-1">CPF</th><th className="p-1">Categoria</th><th className="p-1">S-2300</th><th className="p-1" /></tr></thead>
                        <tbody>{cadastro.map(c => (
                            <tr key={c.id} className={`border-t border-slate-100 dark:border-slate-700 ${c.ativo ? '' : 'opacity-50'}`}>
                                <td className="p-1">{c.nome}{c.ativo ? '' : ' (inativo)'}</td><td className="p-1 font-mono">{c.cpf}</td><td className="p-1">{CATEGORIAS_CI[c.categoria]?.rotulo ?? c.categoria}</td>
                                <td className="p-1">{c.s2300 ? 'enviado' : CATEGORIAS_CI[c.categoria]?.exigeS2300 ? stInicio(c).situacao === 'nao-enviado' ? 'falta' : stInicio(c).rotulo : 'dispensado'}{c.tsv.dtTermino ? ` · término ${c.tsv.dtTermino.split('-').reverse().join('/')}` : ''}</td>
                                <td className="p-1 text-right"><button className="text-blue-700 underline dark:text-blue-300" onClick={() => setEdicao({ ...(contribuintes.find(x => x.id === c.id) ?? c) })}>Editar</button></td>
                            </tr>))}</tbody></table>
                )}
                {edicao && (
                    <div aria-label="Cadastro do contribuinte" className="grid gap-2 rounded-sm bg-slate-50 p-2 sm:grid-cols-4 dark:bg-slate-900/40">
                        <label>CPF<input aria-label="CPF do contribuinte" className={`block w-full ${inp}`} value={edicao.cpf} disabled={!!edicao.id} onChange={e => setEdicao({ ...edicao, cpf: e.target.value })} /></label>
                        <label className="sm:col-span-2">Nome<input aria-label="Nome do contribuinte" className={`block w-full ${inp}`} value={edicao.nome} onChange={e => setEdicao({ ...edicao, nome: e.target.value })} /></label>
                        <label>Nascimento<input aria-label="Nascimento do contribuinte" type="date" className={`block w-full ${inp}`} value={edicao.nascimento} onChange={e => setEdicao({ ...edicao, nascimento: e.target.value })} /></label>
                        <label className="sm:col-span-2">Categoria<select aria-label="Categoria do contribuinte" className={`block w-full ${inp}`} value={edicao.categoria} onChange={e => setEdicao({ ...edicao, categoria: e.target.value as CategoriaCI })}>
                            {(Object.keys(CATEGORIAS_CI) as CategoriaCI[]).map(k => <option key={k} value={k}>{CATEGORIAS_CI[k].rotulo}</option>)}</select></label>
                        <label>CBO<input aria-label="CBO do contribuinte" className={`block w-full ${inp}`} value={edicao.cbo} onChange={e => setEdicao({ ...edicao, cbo: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>
                        <label>PIS/NIT<input aria-label="NIT do contribuinte" className={`block w-full ${inp}`} value={edicao.nit} onChange={e => setEdicao({ ...edicao, nit: e.target.value.replace(/\D/g, '').slice(0, 11) })} /></label>
                        <label className="flex items-center gap-2" title="Marque se o S-2300 já foi enviado por outro sistema (IOB). O enviado pelo Consultor é reconhecido sozinho."><input type="checkbox" checked={edicao.s2300} onChange={e => setEdicao({ ...edicao, s2300: e.target.checked })} />S-2300 já enviado (IOB)</label>
                        <label>Matrícula (S-2300)<input aria-label="Matrícula do contribuinte" className={`block w-full ${inp}`} value={edicao.matricula} disabled={!edicao.s2300 && !CATEGORIAS_CI[edicao.categoria]?.exigeS2300} onChange={e => setEdicao({ ...edicao, matricula: e.target.value.slice(0, 30) })} /></label>
                        {CATEGORIAS_CI[edicao.categoria]?.tipo === 'rpa' && !CATEGORIAS_CI[edicao.categoria]?.transportador && <label className="flex items-center gap-2"><input type="checkbox" checked={edicao.inscritoIss} onChange={e => setEdicao({ ...edicao, inscritoIss: e.target.checked })} />Inscrito no município (sem retenção de ISS)</label>}
                        <label className="flex items-center gap-2"><input type="checkbox" checked={edicao.ativo} onChange={e => setEdicao({ ...edicao, ativo: e.target.checked })} />Ativo</label>
                        {(CATEGORIAS_CI[edicao.categoria]?.exigeS2300 || edicao.tsv.dtInicio) && <DadosS2300 key={edicao.id || 'novo'} edicao={edicao} muda={x => setEdicao({ ...edicao, tsv: { ...edicao.tsv, ...x } })} />}
                        <div className="sm:col-span-4">
                            <p className="text-xs font-medium">Dependentes para o IRRF</p>
                            {edicao.dependentes.map((d, i) => {
                                const md = (x: Partial<typeof d>) => setEdicao({ ...edicao, dependentes: edicao.dependentes.map((y, j) => (j === i ? { ...y, ...x } : y)) });
                                return (
                                    <div key={i} className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-[1fr_9rem_9rem_5rem_auto]">
                                        <input aria-label={`Nome do dependente ${i + 1}`} className={inp} value={d.nome} placeholder="nome" onChange={e => md({ nome: e.target.value })} />
                                        <input aria-label={`CPF do dependente ${i + 1}`} className={inp} value={d.cpf} placeholder="CPF" onChange={e => md({ cpf: e.target.value })} />
                                        <input aria-label={`Nascimento do dependente ${i + 1}`} type="date" className={inp} value={d.nascimento} onChange={e => md({ nascimento: e.target.value })} />
                                        <input aria-label={`Tipo do dependente ${i + 1}`} className={inp} value={d.tipo} placeholder="tipo" title="Tabela 07 do eSocial (01 a 12)" onChange={e => md({ tipo: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                                        <button className="text-xs text-red-600 underline" onClick={() => setEdicao({ ...edicao, dependentes: edicao.dependentes.filter((_, j) => j !== i) })}>Remover</button>
                                    </div>
                                );
                            })}
                            <button className="mt-1 text-xs text-blue-700 underline dark:text-blue-300" onClick={() => setEdicao({ ...edicao, dependentes: [...edicao.dependentes, { cpf: '', nome: '', nascimento: '', tipo: '' }] })}>Adicionar dependente</button>
                        </div>
                        <div className="flex justify-end gap-2 sm:col-span-4">
                            <button className={btn} onClick={() => setEdicao(null)}>Cancelar</button>
                            <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!!ocupado} onClick={gravarCadastro}>Gravar cadastro</button>
                        </div>
                    </div>
                )}
            </section>

            {comTSV.length > 0 && (
                <section aria-label="S-2300 e S-2399" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">eSocial do sócio e do diretor: S-2300 (início) e S-2399 (término)</p>
                        <select aria-label="Ambiente do S-2300 e S-2399" className={inp} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}><option value={2}>Produção restrita</option><option value={1}>Produção</option></select>
                    </div>
                    <p className="text-xs text-slate-500">O S-2300 vai antes do primeiro S-1200 (dados no cadastro: Editar). O S-2399 vai com a data do término, até 10 dias à frente; o pró-labore do mês da saída vai no S-1200. Com o evento aceito na produção, um novo envio é retificação.</p>
                    <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Nome</th><th className="p-1">S-2300</th><th className="p-1">S-2399</th><th className="p-1" /></tr></thead>
                        <tbody>{comTSV.map(c => {
                            const i = stInicio(c); const t = stTermino(c);
                            const g = eventoTSV(c, 'S-2300');
                            const iniciado = c.s2300;
                            return (
                                <tr key={c.id} className="border-t border-slate-100 align-top dark:border-slate-700">
                                    <td className="p-1">{c.nome}<br /><span className="text-slate-500">{CATEGORIAS_CI[c.categoria]?.rotulo}</span></td>
                                    <td className="p-1"><span className={corSituacao(i)}>{i.rotulo}</span>{i.recibo ? ` · ${i.recibo}` : ''}{i.teste ? <span className="block text-slate-500">teste: {i.teste.rotulo}</span> : null}
                                        {!iniciado && g.erros.map(x => <span key={x} className="block text-red-700 dark:text-red-300">✗ {x}</span>)}</td>
                                    <td className="p-1">{c.tsv.dtTermino ? <><span className={corSituacao(t)}>{t.rotulo}</span>{t.recibo ? ` · ${t.recibo}` : ''}</> : <span className="text-slate-500">sem término</span>}</td>
                                    <td className="space-x-2 whitespace-nowrap p-1 text-right">
                                        <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!!ocupado || (i.situacao === 'iob')} onClick={() => transmitirTSV(c, 'S-2300')}>{tpAmb === 1 && i.situacao === 'aceito' ? 'Retificar S-2300' : 'Transmitir S-2300'}</button>
                                        <button className="text-blue-700 underline dark:text-blue-300" onClick={() => baixarTSV(c, 'S-2300')}>XML</button>
                                        {c.tsv.dtTermino && <>
                                            <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!!ocupado || (!iniciado && tpAmb === 1)} title={!iniciado ? 'Depois do S-2300.' : ''} onClick={() => transmitirTSV(c, 'S-2399')}>{tpAmb === 1 && t.situacao === 'aceito' ? 'Retificar S-2399' : 'Transmitir S-2399'}</button>
                                            <button className="text-blue-700 underline dark:text-blue-300" onClick={() => baixarTSV(c, 'S-2399')}>XML</button></>}
                                    </td>
                                </tr>
                            );
                        })}</tbody></table>
                </section>
            )}

            <section className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Pagamentos de {competencia ? br(competencia) : '—'}{gravadoPor ? ` · gravado por ${gravadoPor}` : ''}{encerrado ? ' · competência encerrada' : ''}</p>
                    <button className={btn} disabled={!ativos.length || encerrado} onClick={() => setLinhas(l => [...l, { contribuinteId: '', valor: '', descricao: '', dataPagamento: pagamentoPadrao(), iss: '', outras: [] }])}>+ Lançamento</button>
                </div>
                {linhas.map((l, i) => {
                    const c = contribuintes.find(x => x.id === l.contribuinteId);
                    return (
                        <div key={i} className="space-y-1 border-t border-slate-100 pt-2 dark:border-slate-700">
                            <div className="grid items-end gap-2 sm:grid-cols-12">
                                <label className="sm:col-span-3">Sócio ou autônomo<select aria-label={`Contribuinte do lançamento ${i + 1}`} className={`block w-full ${inp}`} value={l.contribuinteId} onChange={e => muda(i, { contribuinteId: e.target.value })}>
                                    <option value="">— escolha —</option>{ativos.map(x => <option key={x.id} value={x.id}>{x.nome} · {CATEGORIAS_CI[x.categoria]?.transportador ? 'frete' : CATEGORIAS_CI[x.categoria]?.tipo === 'rpa' ? 'RPA' : 'pró-labore'}</option>)}</select></label>
                                <label className="sm:col-span-2">Valor bruto<input aria-label={`Valor do lançamento ${i + 1}`} inputMode="decimal" className={`block w-full ${inp}`} value={l.valor} onChange={e => muda(i, { valor: e.target.value })} /></label>
                                <label className="sm:col-span-2">Pagamento<input aria-label={`Data do pagamento ${i + 1}`} type="date" className={`block w-full ${inp}`} value={l.dataPagamento} onChange={e => muda(i, { dataPagamento: e.target.value })} /></label>
                                <label className="sm:col-span-3">Serviço<input aria-label={`Serviço do lançamento ${i + 1}`} className={`block w-full ${inp}`} value={l.descricao} disabled={CATEGORIAS_CI[c?.categoria ?? '701']?.tipo !== 'rpa'} onChange={e => muda(i, { descricao: e.target.value })} /></label>
                                <label>ISS %<input aria-label={`ISS do lançamento ${i + 1}`} inputMode="decimal" className={`block w-full ${inp}`} value={l.iss} disabled={!c || CATEGORIAS_CI[c.categoria].tipo !== 'rpa' || !!CATEGORIAS_CI[c.categoria].transportador || c.inscritoIss} onChange={e => muda(i, { iss: e.target.value })} /></label>
                                <button aria-label={`Remover o lançamento ${i + 1}`} className="text-red-600" onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))}>×</button>
                            </div>
                            {l.outras.map((o, j) => {
                                const mo = (x: Partial<typeof o>) => muda(i, { outras: l.outras.map((y, k) => (k === j ? { ...y, ...x } : y)) });
                                return (
                                    <div key={j} className="grid grid-cols-2 gap-1 pl-4 text-xs sm:grid-cols-[6rem_12rem_6rem_8rem_auto]">
                                        <select aria-label={`Tipo da outra fonte ${j + 1}`} className={inp} value={o.tpInsc} onChange={e => mo({ tpInsc: e.target.value as '1' | '2' })}><option value="1">CNPJ</option><option value="2">CPF</option></select>
                                        <input aria-label={`Inscrição da outra fonte ${j + 1}`} className={inp} value={o.nrInsc} placeholder="CNPJ ou CPF" onChange={e => mo({ nrInsc: e.target.value })} />
                                        <input aria-label={`Categoria da outra fonte ${j + 1}`} className={inp} value={o.codCateg} placeholder="categ." onChange={e => mo({ codCateg: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                                        <input aria-label={`Remuneração da outra fonte ${j + 1}`} className={inp} value={o.valor} placeholder="R$" onChange={e => mo({ valor: e.target.value })} />
                                        <button className="text-red-600" onClick={() => muda(i, { outras: l.outras.filter((_, k) => k !== j) })}>×</button>
                                    </div>
                                );
                            })}
                            <button className="pl-4 text-xs text-blue-700 underline dark:text-blue-300" onClick={() => muda(i, { outras: [...l.outras, { tpInsc: '1', nrInsc: '', codCateg: '101', valor: '' }] })}>+ Remuneração em outra fonte no mês (para o teto do INSS)</button>
                        </div>
                    );
                })}
                {linhas.length > 0 && errosLanc.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{errosLanc.map(x => <li key={x}>{x}</li>)}</ul>}
                {resultados.length > 0 && (
                    <table className="w-full text-xs">
                        <thead className="text-left text-slate-500"><tr><th className="p-1">Nome</th><th className="p-1 text-right">Bruto</th><th className="p-1 text-right">INSS</th><th className="p-1 text-right">IRRF</th><th className="p-1 text-right">ISS</th><th className="p-1 text-right">Líquido</th><th className="p-1 text-right">Empresa (20%)</th></tr></thead>
                        <tbody>{resultados.map(r => {
                            const v = (k: string) => r.verbas.find(x => x.codigo === k)?.valor ?? 0;
                            return (
                                <React.Fragment key={r.fichaId}>
                                    <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40" onClick={() => setAberto(a => (a === r.fichaId ? '' : r.fichaId))}>
                                        <td className="p-1">{r.nome}{r.situacao === 'erro' ? ' (erro)' : ''}</td><td className="p-1 text-right">{reais(r.totais.proventos)}</td><td className="p-1 text-right">{reais(v('INSS'))}</td>
                                        <td className="p-1 text-right">{reais(v('IRRF'))}</td><td className="p-1 text-right">{reais(v('ISS'))}</td><td className="p-1 text-right font-medium">{reais(r.totais.liquido)}</td><td className="p-1 text-right">{r.patronal ? reais(r.patronal.valor) : '—'}</td>
                                    </tr>
                                    {aberto === r.fichaId && <tr><td colSpan={7} className="bg-slate-50 p-2 dark:bg-slate-900/50">
                                        <ul className="list-disc pl-5">{r.memoria.map((m, k) => <li key={k}>{m}</li>)}</ul>
                                        {[...r.erros, ...r.avisos].map(x => <p key={x} className="mt-1 text-amber-800 dark:text-amber-200">⚠ {x}</p>)}
                                    </td></tr>}
                                </React.Fragment>
                            );
                        })}</tbody>
                        <tfoot className="border-t border-slate-200 font-medium dark:border-slate-700"><tr><td className="p-1">{tot.quantidade} pagamento(s)</td><td className="p-1 text-right">{reais(tot.bruto)}</td><td className="p-1 text-right">{reais(tot.inssRetido)}</td>
                            <td className="p-1 text-right">{reais(tot.irrf)}</td><td className="p-1 text-right">{reais(tot.iss)}</td><td className="p-1 text-right">{reais(tot.liquido)}</td><td className="p-1 text-right">{reais(tot.patronal)}</td></tr></tfoot>
                    </table>
                )}
                {resultados.length > 0 && <p className="text-xs text-slate-500">Na DCTFWeb (pelo eSocial): INSS retido {reais(tot.inssRetido)} + parte da empresa {reais(tot.patronal)}; IRRF {reais(tot.irrf)}. O ISS retido vai na guia do município.{tot.fgts > 0 ? ` FGTS do diretor (721): ${reais(tot.fgts)} na guia do FGTS Digital.` : ''}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                    {gravadoPor && !encerrado && <button className={btn} disabled={!!ocupado} onClick={excluirMes}>Excluir a gravação</button>}
                    <button className={btn} disabled={!resultados.some(r => r.situacao !== 'erro')} onClick={recibos}>Recibos (PDF)</button>
                    <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={encerrado || !!ocupado || !resultados.length || errosLanc.length > 0} onClick={gravarMes}>{gravadoPor ? 'Regravar o mês' : 'Gravar o mês'}</button>
                </div>
            </section>

            {resultados.length > 0 && efetivos && (
                <section aria-label="eSocial do pró-labore e RPA" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <p className="font-medium">eSocial: S-1200 e S-1210</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                        {CHAVES_CI.map(k => (
                            <label key={k.chave} className="text-xs">{k.descricao}<select aria-label={`Rubrica de ${k.descricao}`} className={`block w-full ${inp}`} value={efetivos.rubricas[k.chave] ? `${efetivos.rubricas[k.chave].ideTabRubr}|${efetivos.rubricas[k.chave].codRubr}` : ''}
                                onChange={e => { const [t, c] = e.target.value.split('|'); setParams(p => p && ({ ...p, rubricas: { ...efetivos.rubricas, ...(c ? { [k.chave]: { codRubr: c, ideTabRubr: t } } : {}) } })); }}>
                                <option value="">— rubrica do S-1010 —</option>
                                {vigentes.filter(x => x.v!.dados.tpRubr === tpRubrDoTipo(k.tipo)).map(x => <option key={`${x.r.ideTabRubr}|${x.r.codRubr}`} value={`${x.r.ideTabRubr}|${x.r.codRubr}`}>{x.r.codRubr} · {x.v!.dados.dscRubr} ({x.v!.dados.natRubr})</option>)}
                            </select></label>
                        ))}
                    </div>
                    <p className="text-xs text-slate-500">O INSS e o IRRF usam as rubricas do de/para da folha. RPA na natureza 3501 e ISS na 9222 (MOS, S-1200, item 13). Transportador: o frete numa rubrica que não é base, as bases de 20% (codIncCP 11) e de 10%/60% (IRRF) em rubricas informativas, e o SEST e o SENAT nas de incidência 34 e 35. Em produção, quem já tem o S-1200 ou o S-1210 aceito vai como retificação.</p>
                    {geracao?.erros.map(x => <p key={x} role="alert" className="text-red-700 dark:text-red-300">{x}</p>)}
                    {geracao?.eventos.map(t => (t.erros.length || t.avisos.length ? (
                        <div key={t.cpf} className="text-xs"><strong>{t.nome}</strong>{t.erros.map(x => <p key={x} className="text-red-700 dark:text-red-300">✗ {x}</p>)}{t.avisos.map(x => <p key={x} className="text-amber-800 dark:text-amber-200">⚠ {x}</p>)}</div>
                    ) : null))}
                    <div className="flex flex-wrap items-center gap-2">
                        <select aria-label="Ambiente do eSocial" className={inp} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}><option value={2}>Produção restrita</option><option value={1}>Produção</option></select>
                        <button className={btn} disabled={!!ocupado} onClick={gravarDePara}>Gravar o de/para</button>
                        <button className={btn} disabled={!prontos.length} onClick={baixarXmls}>Baixar XMLs (.zip)</button>
                        <button className={btn} disabled={!prontos.length || !!ocupado} onClick={() => transmitir('S-1200')}>Transmitir S-1200 ({prontos.length})</button>
                        <button className={btn} disabled={!prontos.length || !!ocupado} title="Depois do S-1200 aceito." onClick={() => transmitir('S-1210')}>Transmitir S-1210 ({prontos.length})</button>
                    </div>
                </section>
            )}

            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
        </div>
    );
};

/** Dados do S-2300 e do S-2399 no cadastro do sócio ou diretor. */
const DadosS2300: React.FC<{ edicao: ContribuinteIndividual; muda: (x: Partial<DadosTSV>) => void }> = ({ edicao, muda }) => {
    const t = edicao.tsv;
    const en = t.endereco;
    const end = (x: Partial<DadosTSV['endereco']>) => muda({ endereco: { ...en, ...x } });
    const fgts = !!CATEGORIAS_CI[edicao.categoria]?.fgts;
    return (
        <fieldset aria-label="Dados do S-2300" className="grid gap-2 rounded-sm border border-slate-200 p-2 sm:col-span-4 sm:grid-cols-4 dark:border-slate-700">
            <legend className="px-1 text-xs font-medium">S-2300 e S-2399 (gerados pelo Consultor)</legend>
            <label>Sexo<select aria-label="Sexo" className={`block w-full ${inp}`} value={t.sexo} onChange={e => muda({ sexo: e.target.value as DadosTSV['sexo'] })}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option></select></label>
            <label>Raça/cor<select aria-label="Raça/cor" className={`block w-full ${inp}`} value={t.racaCor} onChange={e => muda({ racaCor: e.target.value })}><option value="">—</option>{RACA_COR.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
            <label>Estado civil<select aria-label="Estado civil" className={`block w-full ${inp}`} value={t.estCiv} onChange={e => muda({ estCiv: e.target.value })}><option value="">—</option>{ESTADO_CIVIL.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
            <label>Instrução<select aria-label="Grau de instrução" className={`block w-full ${inp}`} value={t.grauInstr} onChange={e => muda({ grauInstr: e.target.value })}><option value="">—</option>{GRAU_INSTRUCAO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
            <label className="sm:col-span-2">Logradouro<input aria-label="Logradouro" className={`block w-full ${inp}`} value={en.logradouro} onChange={e => end({ logradouro: e.target.value })} /></label>
            <label>Número<input aria-label="Número do endereço" className={`block w-full ${inp}`} value={en.numero} onChange={e => end({ numero: e.target.value.slice(0, 10) })} /></label>
            <label>Complemento<input aria-label="Complemento" className={`block w-full ${inp}`} value={en.complemento} onChange={e => end({ complemento: e.target.value.slice(0, 30) })} /></label>
            <label>Bairro<input aria-label="Bairro" className={`block w-full ${inp}`} value={en.bairro} onChange={e => end({ bairro: e.target.value })} /></label>
            <label>CEP<input aria-label="CEP" className={`block w-full ${inp}`} value={en.cep} onChange={e => end({ cep: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></label>
            <label title="Código IBGE com 7 dígitos">Município (IBGE)<input aria-label="Código do município" className={`block w-full ${inp}`} value={en.codMunic} onChange={e => end({ codMunic: e.target.value.replace(/\D/g, '').slice(0, 7) })} /></label>
            <label>UF<input aria-label="UF" className={`block w-full ${inp}`} value={en.uf} onChange={e => end({ uf: e.target.value.toUpperCase().slice(0, 2) })} /></label>
            <label>{edicao.categoria === '723' ? 'Entrada na sociedade' : 'Posse (início)'}<input aria-label="Data de início" type="date" className={`block w-full ${inp}`} value={t.dtInicio} onChange={e => muda({ dtInicio: e.target.value, ...(fgts && !t.dtOpcFGTS ? { dtOpcFGTS: e.target.value } : {}) })} /></label>
            <label className="sm:col-span-2">Cargo<input aria-label="Cargo" className={`block w-full ${inp}`} value={t.cargo} placeholder="ex.: Sócio administrador" onChange={e => muda({ cargo: e.target.value.slice(0, 100) })} /></label>
            <label title="Em branco: pró-labore variável">Pró-labore fixo (R$)<input aria-label="Pró-labore fixo" inputMode="decimal" className={`block w-full ${inp}`} defaultValue={txt(t.remuneracao)} onBlur={e => muda({ remuneracao: centavosDeTexto(e.target.value) ?? 0 })} /></label>
            {fgts && <label>Opção pelo FGTS<input aria-label="Data de opção pelo FGTS" type="date" className={`block w-full ${inp}`} value={t.dtOpcFGTS} onChange={e => muda({ dtOpcFGTS: e.target.value })} /></label>}
            <label className="flex items-center gap-2 sm:col-span-2" title="Início antes da obrigatoriedade dos eventos não periódicos do eSocial na empresa"><input type="checkbox" checked={t.cadastramentoInicial} onChange={e => muda({ cadastramentoInicial: e.target.checked })} />Cadastramento inicial (anterior ao eSocial na empresa)</label>
            <label>Término (S-2399)<input aria-label="Data do término" type="date" className={`block w-full ${inp}`} value={t.dtTermino} onChange={e => muda({ dtTermino: e.target.value })} /></label>
            {fgts && <label className="sm:col-span-2">Motivo do término<select aria-label="Motivo do término" className={`block w-full ${inp}`} value={t.mtvDesligTSV} onChange={e => muda({ mtvDesligTSV: e.target.value })}><option value="">—</option>{MOTIVOS_TERMINO_721.map(([k, r]) => <option key={k} value={k}>{k} · {r}</option>)}</select></label>}
        </fieldset>
    );
};

export default ContribuintesPanel;
