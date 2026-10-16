// components/prazos/CalendarioEmpresa.tsx
//
// Calendário de obrigações da folha da empresa e competência ativas (etapa 5):
// FGTS, eSocial, DCTFWeb/DARF, EFD-Reinf, guias sindicais, 13º e anuais, com
// a marcação de entregue / não se aplica gravada para toda a equipe. As guias (DARF, FGTS, sindicais) têm a baixa
// do pagamento (Tributos › Pagamento de Guias do SAGE): data, valor pago e autenticação, e a guia fica entregue.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { br, diasEntre } from '../../services/prazos/calendario';
import {
    cnpjsSindicatosDaEmpresa, guiaDoSindicato, obrigacoesDaEmpresa, situacao,
    type GuiaSindical, type MarcacaoObrigacao, type ObrigacaoEmpresa,
} from '../../services/prazos/obrigacoesEmpresa';
import { desmarcarObrigacao, listarMarcacoes, marcarObrigacao } from '../../services/prazos/obrigacoesStatusService';
import { centavosDeTexto, normalizarCnpj } from '../../services/cadastros/documentos';
import {
    baixaPelaReceita, conferenciaNaReceita, ehGuia, nomeArquivoComprovante, numerosParaConferir, observacaoDaBaixa, resumoGuias, ROTULO_GUIA, ROTULO_NA_RECEITA, situacaoDaGuia, validarBaixa, valorPagoNoFgts,
    type BaixaGuia, type GuiaRegistrada, type LinhaConferenciaReceita,
} from '../../services/guias/pagamentoGuias';
import { darBaixa, desfazerBaixa, listarGuias } from '../../services/guias/pagamentoGuiasService';
import { consultarFgtsRecolhimento, consultarPagamentosReceita, emitirComprovanteReceita, situacaoDarfsNaReceita } from '../../services/serpro/serproIntegrationService';
import { avisosDarfReceita, competenciasParaCruzar, type AvisoDarfReceita } from '../../services/guias/avisoDarfReceita';
import { bytesDoBase64 } from '../../services/dctfweb/dctfwebFolha';
import { baixarBytes } from '../../services/implantacao/zip';

interface Props {
    empresa: { id: string; nome: string; competencia: string; cnpj?: string };
    fichas: FichaFuncionario[];
    sindicatos: Sindicato[];
    usuario?: Usuario;
    hoje: string;
    onTrocar?: () => void;
    onAbrirCadastros?: () => void;
}

const compBr = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const ROTULO = { pendente: 'pendente', entregue: 'entregue', 'nao-se-aplica': 'não se aplica' } as const;
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const texto = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
interface FormBaixa { data: string; valorPago: string; autenticacao: string; valorDevido: string; numeroDocumento: string; fonte: BaixaGuia['fonte'] }

const CalendarioEmpresa: React.FC<Props> = ({ empresa, fichas, sindicatos, usuario, hoje, onTrocar, onAbrirCadastros }) => {
    const [marcacoes, setMarcacoes] = useState<Map<string, MarcacaoObrigacao> | null>(null);
    const [erro, setErro] = useState('');
    const [gravando, setGravando] = useState('');
    const [guias, setGuias] = useState<Map<string, GuiaRegistrada>>(new Map());
    const [baixa, setBaixa] = useState<{ id: string; f: FormBaixa } | null>(null);
    const [aviso, setAviso] = useState('');
    const [naReceita, setNaReceita] = useState<LinhaConferenciaReceita[] | null>(null);
    const [conferindo, setConferindo] = useState(false);

    const carregar = useCallback(() => {
        setErro('');
        listarMarcacoes(empresa.id, empresa.competencia).then(setMarcacoes).catch(e => { setErro(mensagemErro(e)); setMarcacoes(new Map()); });
        listarGuias(empresa.id, empresa.competencia).then(setGuias).catch(e => setErro(mensagemErro(e)));
    }, [empresa.id, empresa.competencia]);
    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => { setNaReceita(null); }, [empresa.id, empresa.competencia]);

    // Aviso de DARF vencido sem pagamento: o que o CFI conferiu na Receita (cron diário), cruzado com a baixa no DP.
    // Sem resposta do CFI, não há aviso (o calendário segue normal).
    const [avisosDarf, setAvisosDarf] = useState<AvisoDarfReceita[]>([]);
    const [recargaDarf, setRecargaDarf] = useState(0);
    const temUsuario = !!usuario;
    useEffect(() => {
        let vivo = true;
        setAvisosDarf([]);
        const cnpj = normalizarCnpj(empresa.cnpj);
        if (!temUsuario || cnpj.length !== 14) return;
        (async () => {
            const r = await situacaoDarfsNaReceita(empresa.id, cnpj);
            if (!r.ok || !r.situacoes?.length) return;
            const comps = competenciasParaCruzar(r.situacoes);
            const guiasPorComp = new Map(await Promise.all(comps.map(async c => [c, await listarGuias(empresa.id, c)] as const)));
            if (vivo) setAvisosDarf(avisosDarfReceita(r.situacoes, guiasPorComp));
        })().catch(() => { /* sem o CFI, sem aviso */ });
        return () => { vivo = false; };
    }, [empresa.id, empresa.cnpj, temUsuario, recargaDarf]);

    const { obrigacoes, semGuia, foraDoCadastro } = useMemo(() => {
        const cnpjs = cnpjsSindicatosDaEmpresa(fichas, empresa.id);
        const porCnpj = new Map(sindicatos.map(s => [s.cnpj, s]));
        const guias: GuiaSindical[] = [];
        const semGuia: string[] = [];
        const foraDoCadastro: string[] = [];
        for (const c of cnpjs) {
            const s = porCnpj.get(c);
            if (!s) { foraDoCadastro.push(c); continue; }
            const g = guiaDoSindicato(s);
            if (g) guias.push(g); else semGuia.push(s.nome);
        }
        const temEmpregados = fichas.some(f => f.empresaId === empresa.id && f.situacao !== 'desligado');
        return { obrigacoes: obrigacoesDaEmpresa({ competencia: empresa.competencia, temEmpregados, guias }), semGuia, foraDoCadastro };
    }, [fichas, sindicatos, empresa.id, empresa.competencia]);

    const linhas = obrigacoes.map(o => ({ o, m: marcacoes?.get(o.id), ...situacao(o, marcacoes?.get(o.id), hoje) }));
    const cont = linhas.reduce((c, l) => ({ ...c, [l.atrasada ? 'atrasada' : l.status]: (c[l.atrasada ? 'atrasada' : l.status] ?? 0) + 1 }), {} as Record<string, number>);

    async function marcar(o: ObrigacaoEmpresa, status: MarcacaoObrigacao['status']) {
        if (!usuario) return;
        let obs = '';
        if (status === 'nao-se-aplica') {
            const r = window.prompt(`Por que "${o.nome}" não se aplica a ${empresa.nome} em ${compBr(empresa.competencia)}?`);
            if (r === null) return;
            obs = r.trim();
            if (!obs) { setErro('Informe o motivo de "não se aplica".'); return; }
        }
        setGravando(o.id); setErro('');
        try { await marcarObrigacao(empresa.id, empresa.competencia, o, status, obs, marcacoes?.get(o.id), usuario); carregar(); }
        catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    function abrirBaixa(o: ObrigacaoEmpresa) {
        const g = guias.get(o.id);
        setAviso(''); setErro('');
        setBaixa({ id: o.id, f: { data: hoje, valorPago: texto(g?.valorDevido ?? 0), autenticacao: '', valorDevido: texto(g?.valorDevido ?? 0), numeroDocumento: g?.numeroDocumento ?? '', fonte: 'manual' } });
    }
    const mudaBaixa = (x: Partial<FormBaixa>) => setBaixa(b => (b ? { ...b, f: { ...b.f, ...x } } : b));
    const lerBaixa = (f: FormBaixa): BaixaGuia => ({ data: f.data, valorPago: centavosDeTexto(f.valorPago) ?? 0, autenticacao: f.autenticacao, fonte: f.fonte });

    async function conferirFgts() {
        if (!empresa.cnpj) return;
        setAviso('Consultando o FGTS Digital…'); setErro('');
        try {
            const r = valorPagoNoFgts(await consultarFgtsRecolhimento(empresa.id, normalizarCnpj(empresa.cnpj), empresa.competencia));
            // SERPRO sem a consulta: a baixa segue manual, pelo comprovante (nada é preenchido como se tivesse sido consultado).
            if ('erro' in r) { if (r.manual) { setAviso(r.erro); mudaBaixa({ fonte: 'manual' }); } else { setAviso(''); setErro(r.erro); } return; }
            mudaBaixa({ valorPago: texto(r.valorPago), valorDevido: texto(r.valorDevido), fonte: 'fgts-digital' });
            setAviso(`FGTS Digital: ${reais(r.valorPago)} recolhidos. Informe a data do pagamento do comprovante.`);
        } catch (e) { setAviso(''); setErro(mensagemErro(e)); }
    }

    async function conferirReceita() {
        if (!empresa.cnpj || !baixa) return;
        const numero = baixa.f.numeroDocumento;
        setAviso('Consultando o pagamento na Receita…'); setErro('');
        try {
            const r = baixaPelaReceita(await consultarPagamentosReceita(empresa.id, normalizarCnpj(empresa.cnpj), [numero]), numero);
            if ('erro' in r) { setAviso(''); setErro(r.erro); return; }
            mudaBaixa({ data: r.data, valorPago: texto(r.valorPago), fonte: 'receita' });
            setAviso(`${r.detalhe} Informe a autenticação do comprovante, se tiver.`);
        } catch (e) { setAviso(''); setErro(mensagemErro(e)); }
    }

    /** Todos os DARF da competência numa consulta só à Receita (PAGTOWEB pelo CFI). */
    async function conferirTodasNaReceita() {
        if (!empresa.cnpj) return;
        const itens = obrigacoes.filter(o => o.id.startsWith('darf-')).map(o => ({ obrigacao: o.id, nome: o.nome, guia: guias.get(o.id) }));
        const numeros = numerosParaConferir(itens);
        setErro(''); setAviso('');
        if (!numeros.length) { setNaReceita(conferenciaNaReceita(itens, { ok: true, fonte: 'serpro', situacoes: [] })); return; }
        setConferindo(true);
        try {
            const r = await consultarPagamentosReceita(empresa.id, normalizarCnpj(empresa.cnpj), numeros);
            if (!r.ok) { setErro(r.error || 'A Receita não respondeu.'); setNaReceita(null); return; }
            setNaReceita(conferenciaNaReceita(itens, r));
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setConferindo(false); }
    }

    async function baixarPelaReceita(linhas: LinhaConferenciaReceita[]) {
        if (!usuario) return;
        const prontas = linhas.filter(l => l.estado === 'baixar' && l.baixa);
        const avisos: string[] = [];
        for (const l of prontas) {
            const o = obrigacoes.find(x => x.id === l.obrigacao)!;
            const v = validarBaixa(l.baixa!, { obrigacao: o.id, vencimento: o.data, valorDevido: guias.get(o.id)?.valorDevido ?? 0 }, hoje);
            if (v.erros.length) { setErro(`${o.nome}: ${v.erros.join(' ')}`); return; }
            avisos.push(...v.avisos.map(a => `${o.nome}: ${a}`));
        }
        const pergunta = `Dar baixa em ${prontas.length} guia(s) com a data e o valor registrados na Receita?${avisos.length ? `\n\n${avisos.join('\n')}` : ''}`;
        if (!prontas.length || !window.confirm(pergunta)) return;
        setGravando('receita'); setErro('');
        try {
            for (const l of prontas) {
                const o = obrigacoes.find(x => x.id === l.obrigacao)!;
                const g = guias.get(o.id);
                await darBaixa(empresa.id, empresa.competencia, o, { valorDevido: g?.valorDevido ?? 0, numeroDocumento: g?.numeroDocumento ?? l.numeroDocumento }, l.baixa!, usuario);
            }
            setNaReceita(ls => ls && ls.map(l => (prontas.includes(l) ? { ...l, estado: 'confere' as const, baixa: null } : l)));
            setAviso(`${prontas.length} baixa(s) gravada(s) pela Receita.`);
            carregar(); setRecargaDarf(x => x + 1);
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    async function baixarComprovante(o: ObrigacaoEmpresa, g: GuiaRegistrada) {
        if (!empresa.cnpj) return;
        setGravando(`comprovante-${o.id}`); setErro(''); setAviso('');
        try {
            const r = await emitirComprovanteReceita(empresa.id, normalizarCnpj(empresa.cnpj), g.numeroDocumento);
            if (!r.ok || r.fonte !== 'serpro' || !r.pdfBase64) { setErro(r.error || 'A Receita não devolveu o comprovante.'); return; }
            baixarBytes(nomeArquivoComprovante(o.id, g.numeroDocumento), bytesDoBase64(r.pdfBase64), 'application/pdf');
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    async function gravarBaixa(o: ObrigacaoEmpresa) {
        if (!usuario || !baixa) return;
        const b = lerBaixa(baixa.f);
        const dados = { valorDevido: centavosDeTexto(baixa.f.valorDevido) ?? 0, numeroDocumento: baixa.f.numeroDocumento };
        const v = validarBaixa(b, { obrigacao: o.id, vencimento: o.data, valorDevido: dados.valorDevido }, hoje);
        if (v.erros.length) { setErro(v.erros.join(' ')); return; }
        if (v.avisos.length && !window.confirm(`${v.avisos.join('\n')}\n\nDar baixa assim mesmo?`)) return;
        setGravando(o.id); setErro('');
        try { await darBaixa(empresa.id, empresa.competencia, o, dados, b, usuario); setBaixa(null); setAviso(''); carregar(); setRecargaDarf(x => x + 1); }
        catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    async function desfazerPagamento(o: ObrigacaoEmpresa, g: GuiaRegistrada) {
        if (!usuario || !window.confirm(`Desfazer a baixa de "${o.nome}"? A guia volta a ficar em aberto.`)) return;
        setGravando(o.id); setErro('');
        try { await desfazerBaixa(empresa.id, empresa.competencia, o, g, usuario); carregar(); setRecargaDarf(x => x + 1); }
        catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    async function desfazer(o: ObrigacaoEmpresa, m: MarcacaoObrigacao) {
        if (!usuario || !window.confirm(`Voltar "${o.nome}" para pendente?`)) return;
        setGravando(o.id); setErro('');
        try { await desmarcarObrigacao(empresa.id, o, m, usuario); carregar(); }
        catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    const btn = 'rounded-sm border px-2 py-0.5 text-xs disabled:opacity-50';
    const inp = 'mt-0.5 block rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900';
    const daGuia = obrigacoes.filter(o => ehGuia(o.id));
    const rg = resumoGuias(daGuia.map(o => ({ vencimento: o.data, guia: guias.get(o.id) })), hoje);
    return (
        <section aria-label="Calendário da empresa" className="rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-800 dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white">Calendário da empresa: {empresa.nome} · competência {compBr(empresa.competencia)}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">O que a folha desta competência gera e até quando. A marcação vale para toda a equipe que atende a empresa.</p>
                </div>
                {onTrocar && <button className="text-sm text-blue-700 underline dark:text-blue-300" onClick={onTrocar}>Trocar empresa ou período</button>}
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {cont.atrasada > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 dark:bg-red-900/40 dark:text-red-200">Atrasadas: {cont.atrasada}</span>}
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Pendentes: {cont.pendente ?? 0}</span>
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800 dark:bg-green-900/40 dark:text-green-200">Entregues: {cont.entregue ?? 0}</span>
                {cont['nao-se-aplica'] > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-700 dark:text-slate-200">Não se aplica: {cont['nao-se-aplica']}</span>}
                {daGuia.length > 0 && <span aria-label="Resumo das guias" className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">Guias: {daGuia.length - rg.abertas} de {daGuia.length} com baixa{rg.pago > 0 ? ` · ${reais(rg.pago)} pagos` : ''}{rg.vencidas > 0 ? ` · ${rg.vencidas} vencida(s) sem baixa` : ''}</span>}
            </div>

            {avisosDarf.length > 0 && (
                <ul aria-label="DARF sem baixa conferidos na Receita" className="mt-2 space-y-1 text-sm">
                    {avisosDarf.map(a => (
                        <li key={`${a.tipo}-${a.competencia}`} className={`rounded-sm p-2 ${a.tipo === 'sem-pagamento' ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200' : 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'}`}>
                            {a.tipo === 'sem-pagamento' ? '🚨 ' : '💸 '}{a.texto}
                            {a.competencia !== empresa.competencia && onTrocar && <> <button className="underline" onClick={onTrocar}>Trocar o período</button></>}
                        </li>
                    ))}
                </ul>
            )}

            {usuario && empresa.cnpj && daGuia.some(o => o.id.startsWith('darf-')) && (
                <div className="mt-2">
                    <button className={`${btn} border-blue-600 text-blue-700 dark:text-blue-300`} disabled={conferindo || !!gravando} onClick={conferirTodasNaReceita}>{conferindo ? 'Consultando a Receita…' : 'Conferir os DARF na Receita'}</button>
                    {naReceita && (
                        <div role="region" aria-label="DARF na Receita" className="mt-2 rounded-sm border border-blue-100 p-2 text-xs dark:border-blue-900 dark:text-slate-100">
                            <table className="w-full">
                                <thead className="text-left text-slate-500"><tr><th className="p-1">Guia</th><th className="p-1">Documento</th><th className="p-1">Situação</th><th className="p-1">Detalhe</th></tr></thead>
                                <tbody>{naReceita.map(l => (
                                    <tr key={l.obrigacao} className="border-t border-slate-100 align-top dark:border-slate-700">
                                        <td className="p-1">{l.nome}</td><td className="p-1">{l.numeroDocumento || '—'}</td>
                                        <td className={`p-1 font-medium ${l.estado === 'confere' ? 'text-green-700 dark:text-green-300' : l.estado === 'baixar' ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}`}>{ROTULO_NA_RECEITA[l.estado]}</td>
                                        <td className="p-1">{l.motivo}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                            {naReceita.some(l => l.estado === 'baixar') && <button className={`${btn} mt-2 border-green-700 bg-green-700 text-white`} disabled={!!gravando} onClick={() => baixarPelaReceita(naReceita)}>{gravando === 'receita' ? 'Gravando…' : `Dar baixa nas ${naReceita.filter(l => l.estado === 'baixar').length} localizada(s)`}</button>}
                            <p className="mt-1 text-slate-500">Não localizado não quer dizer não pago: a arrecadação leva alguns dias para aparecer na Receita.</p>
                        </div>
                    )}
                </div>
            )}
            {erro && <p role="alert" className="mt-2 rounded-sm bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {aviso && <p role="status" className="mt-2 rounded-sm bg-blue-50 p-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">{aviso}</p>}
            {!usuario && <p className="mt-2 text-xs text-slate-500">Entre com seu usuário para marcar as entregas.</p>}

            <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-left text-xs text-slate-500 dark:text-slate-400"><tr><th className="p-2">Vence</th><th className="p-2">Obrigação</th><th className="p-2">Responsável</th><th className="p-2">Base legal</th><th className="p-2">Situação</th></tr></thead>
                    <tbody>
                        {linhas.map(({ o, m, status, atrasada }) => {
                            const d = diasEntre(hoje, o.data);
                            const guia = ehGuia(o.id);
                            const g = guias.get(o.id);
                            const aberta = baixa?.id === o.id ? baixa.f : null;
                            return (
                                <React.Fragment key={o.id}>
                                <tr className={`border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100 ${atrasada ? 'bg-red-50 dark:bg-red-900/20' : status !== 'pendente' ? 'opacity-70' : ''}`}>
                                    <td className="whitespace-nowrap p-2"><strong>{br(o.data)}</strong>
                                        <span className={`block text-xs ${atrasada ? 'font-medium text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}>{status !== 'pendente' ? '' : atrasada ? `atrasada há ${-d} dia(s)` : d === 0 ? 'vence hoje' : `em ${d} dia(s)`}</span></td>
                                    <td className="p-2">{o.nome}
                                        {o.condicao && <span className="block text-xs text-slate-500 dark:text-slate-400">{o.condicao}</span>}
                                        {o.observacao && <span className="block text-xs text-amber-700 dark:text-amber-300">{o.observacao}</span>}
                                        {guia && g && (g.valorDevido > 0 || g.numeroDocumento) && <span className="block text-xs text-slate-500">Guia: {g.valorDevido > 0 ? reais(g.valorDevido) : ''}{g.numeroDocumento ? ` · documento ${g.numeroDocumento}` : ''}</span>}</td>
                                    <td className="p-2 text-xs">{o.responsavel === 'Fiscal' ? 'Fiscal (o DP acompanha)' : 'DP'}</td>
                                    <td className="p-2 text-xs text-slate-500 dark:text-slate-400">{o.base}</td>
                                    <td className="p-2 text-xs">
                                        {marcacoes === null ? '…' : guia && g?.pagamento ? (
                                            <>
                                                <span className={`rounded-sm px-1.5 py-0.5 font-medium ${situacaoDaGuia(o.data, g, hoje) === 'paga' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>{ROTULO_GUIA[situacaoDaGuia(o.data, g, hoje)]}</span>
                                                <span className="mt-0.5 block text-slate-500">{observacaoDaBaixa(g.pagamento)}</span>
                                                <span className="block text-slate-500">{[g.atualizadoPorEmail, g.atualizadoEm && br(g.atualizadoEm.slice(0, 10))].filter(Boolean).join(' · ')}</span>
                                                {usuario && <button className={`${btn} mt-1 border-slate-300 dark:border-slate-600`} disabled={!!gravando} onClick={() => desfazerPagamento(o, g)}>Desfazer a baixa</button>}
                                                {usuario && o.id.startsWith('darf-') && empresa.cnpj && g.numeroDocumento.trim() && <button className={`${btn} ml-1 mt-1 border-blue-600 text-blue-700 dark:text-blue-300`} disabled={!!gravando} onClick={() => baixarComprovante(o, g)}>{gravando === `comprovante-${o.id}` ? 'Baixando…' : 'Comprovante da Receita'}</button>}
                                            </>
                                        ) : m ? (
                                            <>
                                                <span className={`rounded-sm px-1.5 py-0.5 font-medium ${m.status === 'entregue' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{ROTULO[m.status]}</span>
                                                <span className="mt-0.5 block text-slate-500">{[m.atualizadoPorEmail, m.atualizadoEm && br(m.atualizadoEm.slice(0, 10))].filter(Boolean).join(' · ')}</span>
                                                {m.observacao && <span className="block text-slate-500">{m.observacao}</span>}
                                                {usuario && <button className={`${btn} mt-1 border-slate-300 dark:border-slate-600`} disabled={!!gravando} onClick={() => desfazer(o, m)}>Desfazer</button>}
                                            </>
                                        ) : usuario ? (
                                            <span className="flex flex-wrap gap-1">
                                                {guia ? <button aria-label={`Dar baixa: ${o.nome}`} className={`${btn} border-green-600 text-green-700 dark:text-green-300`} disabled={!!gravando} onClick={() => abrirBaixa(o)}>Dar baixa</button> : <button aria-label={`Marcar entregue: ${o.nome}`} className={`${btn} border-green-600 text-green-700 dark:text-green-300`} disabled={!!gravando} onClick={() => marcar(o, 'entregue')}>{gravando === o.id ? 'Gravando…' : 'Entregue'}</button>}
                                                <button aria-label={`Não se aplica: ${o.nome}`} className={`${btn} border-slate-300 dark:border-slate-600`} disabled={!!gravando} onClick={() => marcar(o, 'nao-se-aplica')}>Não se aplica</button>
                                            </span>
                                        ) : ROTULO.pendente}
                                    </td>
                                </tr>
                                {aberta && (
                                    <tr className="bg-green-50/50 dark:bg-green-900/10">
                                        <td colSpan={5} className="p-2">
                                            <div role="group" aria-label={`Baixa de ${o.nome}`} className="flex flex-wrap items-end gap-2 text-xs dark:text-slate-100">
                                                <label>Data do pagamento<input aria-label="Data do pagamento" type="date" className={inp} value={aberta.data} max={hoje} onChange={e => mudaBaixa({ data: e.target.value, ...(aberta.fonte === 'receita' ? { fonte: 'manual' as const } : {}) })} /></label>
                                                <label>Valor pago (R$)<input aria-label="Valor pago" inputMode="decimal" className={`${inp} w-28 text-right`} value={aberta.valorPago} onChange={e => mudaBaixa({ valorPago: e.target.value, fonte: 'manual' })} /></label>
                                                <label>Autenticação<input aria-label="Autenticação" className={`${inp} w-44`} value={aberta.autenticacao} placeholder="do comprovante" onChange={e => mudaBaixa({ autenticacao: e.target.value })} /></label>
                                                <label>Valor da guia (R$)<input aria-label="Valor da guia" inputMode="decimal" className={`${inp} w-28 text-right`} value={aberta.valorDevido} onChange={e => mudaBaixa({ valorDevido: e.target.value })} /></label>
                                                <label>Nº do documento<input aria-label="Número do documento" className={`${inp} w-48`} value={aberta.numeroDocumento} onChange={e => mudaBaixa({ numeroDocumento: e.target.value, ...(aberta.fonte === 'receita' ? { fonte: 'manual' as const } : {}) })} /></label>
                                                {o.id.startsWith('fgts-') && empresa.cnpj && <button className={`${btn} border-blue-600 text-blue-700 dark:text-blue-300`} disabled={!!gravando} onClick={conferirFgts}>Conferir no FGTS Digital</button>}
                                                {o.id.startsWith('darf-') && empresa.cnpj && <button className={`${btn} border-blue-600 text-blue-700 dark:text-blue-300`} disabled={!!gravando || !aberta.numeroDocumento.trim()} title={aberta.numeroDocumento.trim() ? 'Pagamento registrado na Receita pelo número do documento' : 'Informe o número do documento do DARF'} onClick={conferirReceita}>Conferir na Receita</button>}
                                                <button className={`${btn} border-green-700 bg-green-700 text-white`} disabled={!!gravando} onClick={() => gravarBaixa(o)}>{gravando === o.id ? 'Gravando…' : 'Gravar a baixa'}</button>
                                                <button className={`${btn} border-slate-300 dark:border-slate-600`} onClick={() => { setBaixa(null); setAviso(''); }}>Cancelar</button>
                                            </div>
                                            {(() => {
                                                const v = validarBaixa(lerBaixa(aberta), { obrigacao: o.id, vencimento: o.data, valorDevido: centavosDeTexto(aberta.valorDevido) ?? 0 }, hoje);
                                                return v.avisos.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">{v.avisos.map(a => <li key={a}>{a}</li>)}</ul>;
                                            })()}
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {(semGuia.length > 0 || foraDoCadastro.length > 0) && (
                <p className="mt-2 rounded-sm bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                    {semGuia.length > 0 && <>Sindicato(s) dos empregados sem guia no cadastro: {semGuia.join('; ')}. Informe o dia da guia da convenção para ela entrar no calendário. </>}
                    {foraDoCadastro.length > 0 && <>CNPJ de sindicato nas fichas que não está cadastrado: {foraDoCadastro.map(cnpjFmt).join('; ')}. </>}
                    {onAbrirCadastros && <button className="text-blue-700 underline dark:text-blue-300" onClick={onAbrirCadastros}>Abrir Cadastros</button>}
                </p>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Datas com o ajuste de dia útil (feriados nacionais, Carnaval e Sexta-feira Santa); feriado estadual ou municipal pode mudar a data. A EFD-Reinf é transmitida pelo fiscal: o DP marca quando confirmar com ele. A baixa da guia (data, valor pago e autenticação do comprovante) marca a guia como entregue; o DARF emitido na DCTFWeb da folha já traz o valor e o documento, e "Conferir na Receita" traz a data e o valor arrecadados pelo número do documento (o pagamento leva alguns dias para aparecer).
            </p>
        </section>
    );
};

export default CalendarioEmpresa;
