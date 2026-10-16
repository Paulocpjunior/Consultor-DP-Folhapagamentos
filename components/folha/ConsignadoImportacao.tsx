// components/folha/ConsignadoImportacao.tsx
//
// Folha do mês › Crédito do Trabalhador › Importar o arquivo do Portal (etapa 3 do estudo): lê o arquivo de empréstimos
// da competência (CSV, XLS/XLSX ou JSON), sugere a coluna de cada campo (conferida e ajustável na tela), mostra a prévia
// por ficha e só grava nas fichas o que o usuário marcar e confirmar, com auditoria. Competência encerrada não grava.
// Etapa 6: "Buscar na Dataprev" traz as mesmas consignações pela API (plataforma do DP, A1 do cofre) para a mesma prévia.

import React, { useEffect, useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { diffFicha } from '../../services/cadastros/funcionarios';
import { gravarImportacao, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { validarContratos } from '../../services/calculo/consignado';
import { aplicarImportacao, CAMPOS_ARQUIVO, lerArquivoEmprestimos, previaImportacao, ROTULO_ACAO, sugerirColunas, type ArquivoLido, type MapaColunas } from '../../services/calculo/importacaoConsignado';
import { lerFechamento } from '../../services/fimDeMes/fechamentoService';
import { MSG_ENCERRADO, situacaoDe } from '../../services/fimDeMes/fechamento';
import { arquivoDaDataprev, buscarConsignacoesDataprev, type CertificadoDataprev } from '../../services/folha/creditoTrabalhadorDataprev';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const th = 'px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300';
const td = 'px-2 py-1 align-top';
const reais = (c?: number) => (c === undefined ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const br = (c: string) => c.split('-').reverse().join('/');

interface Props {
    empresaId: string; cnpj: string; competencia: string;
    fichas: FichaFuncionario[];
    usuario?: Usuario;
    onGravado: () => void;
}

const ConsignadoImportacao: React.FC<Props> = ({ empresaId, cnpj, competencia, fichas, usuario, onGravado }) => {
    const [arquivo, setArquivo] = useState<{ nome: string; lido: ArquivoLido; dataprev?: boolean } | null>(null);
    const [certificado, setCertificado] = useState<CertificadoDataprev>('empresa');
    const [buscando, setBuscando] = useState(false);
    const [mapa, setMapa] = useState<MapaColunas>({});
    const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());
    const [encerrada, setEncerrada] = useState<boolean | null>(null);
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');
    const [gravando, setGravando] = useState(false);
    const [erroFechamento, setErroFechamento] = useState('');
    const [releitura, setReleitura] = useState(0);

    // Sem saber se a competência está encerrada, não grava: a ficha não tem trava por mês nas regras (Codex #277).
    useEffect(() => {
        let vivo = true;
        setEncerrada(null); setErroFechamento('');
        lerFechamento(empresaId, competencia).then(f => { if (vivo) setEncerrada(situacaoDe(f) === 'encerrado'); })
            .catch(e => { if (vivo) setErroFechamento(`Não consegui ler a situação da competência no Fim de mês (${mensagemErro(e)}): a gravação fica bloqueada até ler.`); });
        return () => { vivo = false; };
    }, [empresaId, competencia, releitura]);
    // Outra empresa ou competência: o arquivo lido não vale mais.
    useEffect(() => { setArquivo(null); setMapa({}); setDesmarcadas(new Set()); setMsg(''); setErro(''); }, [empresaId, competencia]);

    const previa = useMemo(() => (arquivo ? previaImportacao(arquivo.lido, mapa, competencia, fichas, cnpj) : null), [arquivo, mapa, competencia, fichas, cnpj]);
    const mudancas = previa?.acoes.filter(a => a.tipo !== 'igual') ?? [];
    const iguais = (previa?.acoes.length ?? 0) - mudancas.length;
    const escolhidas = mudancas.filter(a => !desmarcadas.has(a.id));

    async function ler(f: File) {
        setErro(''); setMsg('');
        try {
            const lido = lerArquivoEmprestimos(f.name, await f.arrayBuffer());
            setArquivo({ nome: f.name, lido }); setMapa(sugerirColunas(lido.colunas)); setDesmarcadas(new Set());
        } catch (e) { setArquivo(null); setErro(`Não consegui ler o arquivo: ${mensagemErro(e)}`); }
    }

    async function buscarNaDataprev() {
        setErro(''); setMsg(''); setBuscando(true);
        try {
            const r = await buscarConsignacoesDataprev({ empresaId, cnpj, competencia, certificado });
            const lido = arquivoDaDataprev(r.consignacoes);
            setArquivo({ nome: `Dataprev, competência ${br(competencia)}`, lido, dataprev: true }); setMapa(sugerirColunas(lido.colunas)); setDesmarcadas(new Set());
            if (r.semRegistros) setMsg(`A Dataprev não tem consignações da empresa em ${br(competencia)}.`);
        } catch (e) { setArquivo(null); setErro(`Dataprev: ${mensagemErro(e)}`); } finally { setBuscando(false); }
    }

    async function gravar() {
        if (!usuario || !arquivo || !escolhidas.length) return;
        if (encerrada !== false) { setErro(encerrada ? MSG_ENCERRADO(competencia) : 'A situação da competência no Fim de mês ainda não foi lida.'); return; }
        const mudadas = aplicarImportacao(fichas, escolhidas, competencia);
        const invalidas = mudadas.flatMap(f => validarContratos(f.consignados ?? []).map(e => `${f.dados.nome || f.cpf}: ${e}`));
        if (invalidas.length) { setErro(invalidas.join(' ')); return; }
        if (!window.confirm(`Gravar ${escolhidas.length} alteração(ões) nos contratos de ${mudadas.length} ficha(s), a partir de ${br(competencia)}? Os meses anteriores não mudam.`)) return;
        setGravando(true); setErro('');
        try {
            const antes = new Map(fichas.map(f => [f.id, f]));
            await gravarImportacao(mudadas.map(f => ({ ficha: f, novo: false, alteracoes: diffFicha(antes.get(f.id)!, f), preservados: [] })), usuario, [arquivo.nome], undefined, arquivo.dataprev ? 'Consignações da Dataprev (API do Crédito do Trabalhador)' : 'Arquivo de empréstimos do Portal Emprega Brasil');
            setMsg(`Gravado: ${escolhidas.length} alteração(ões) em ${mudadas.length} ficha(s). Recalcule a folha da competência.`);
            setArquivo(null);
            onGravado();
        } catch (e) { setErro(mensagemErro(e)); } finally { setGravando(false); }
    }

    return (
        <section className="space-y-3 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
            <div>
                <h3 className="font-semibold">Importar o arquivo do Portal Emprega Brasil ({br(competencia)})</h3>
                <p className="text-slate-600 dark:text-slate-300">Baixe o arquivo de empréstimos da competência (dias 21 a 25) em CSV, XLS ou JSON, sem abrir nem editar no Excel. O Consultor compara com os contratos das fichas e mostra o que muda; só grava o que você marcar.</p>
            </div>
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p className="rounded-sm bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erroFechamento && <p role="alert" className="rounded-sm bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{erroFechamento} <button className="underline" onClick={() => setReleitura(n => n + 1)}>Tentar de novo</button></p>}
            {encerrada && <p className="rounded-sm bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{MSG_ENCERRADO(competencia)}</p>}
            <div className="flex flex-wrap items-end gap-3">
                <label className="block">Arquivo<input aria-label="Arquivo de empréstimos" type="file" accept=".csv,.txt,.json,.xls,.xlsx" className={`block ${inp}`}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void ler(f); e.target.value = ''; }} /></label>
                <span className="pb-1 text-xs text-slate-500">ou</span>
                <label className="text-xs">Certificado<select aria-label="Certificado para a Dataprev" className={`block ${inp}`} value={certificado} onChange={e => setCertificado(e.target.value as CertificadoDataprev)}>
                    <option value="empresa">da empresa (cofre)</option><option value="escritorio">do escritório (procuração no e-CAC)</option>
                </select></label>
                <button className={btn} disabled={buscando || !cnpj} onClick={() => void buscarNaDataprev()}>{buscando ? 'Buscando…' : 'Buscar na Dataprev'}</button>
            </div>
            <p className="text-xs text-slate-500">A Dataprev libera a competência do dia 21 ao 25. Usa o A1 da própria empresa no cofre; o do escritório só serve com procuração da empresa no e-CAC (códigos 00137, 00142 ou 88888).</p>
            {arquivo && previa && <>
                <div>
                    <p className="text-xs text-slate-500">{arquivo.nome}: {previa.lidas} linha(s). {arquivo.dataprev ? 'Campos da API da Dataprev (manual v1.7), já ligados a cada coluna.' : 'Confira a coluna de cada campo: o Consultor sugere pelo nome, e o leiaute oficial ainda não foi conferido.'}</p>
                    <div className="mt-1 grid gap-2 sm:grid-cols-4">
                        {CAMPOS_ARQUIVO.map(c => (
                            <label key={c.campo} className="text-xs">{c.rotulo}{c.obrigatorio ? ' *' : ''}
                                <select aria-label={`Coluna: ${c.rotulo}`} className={`block w-full ${inp}`} value={mapa[c.campo] ?? ''} onChange={e => setMapa(m => ({ ...m, [c.campo]: e.target.value || undefined }))}>
                                    <option value="">{c.obrigatorio ? '(escolha)' : '(não tem)'}</option>
                                    {arquivo.lido.colunas.map(col => <option key={col} value={col}>{col}</option>)}
                                </select></label>))}
                    </div>
                </div>
                {previa.avisos.length > 0 && <ul className="list-disc pl-5 text-amber-800 dark:text-amber-200">{previa.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                {mudancas.length > 0 ? (
                    <div className="overflow-x-auto"><table className="min-w-full text-sm">
                        <thead><tr><th className={th}><input type="checkbox" aria-label="Marcar todas" checked={!desmarcadas.size} onChange={e => setDesmarcadas(e.target.checked ? new Set() : new Set(mudancas.map(a => a.id)))} /></th>
                            <th className={th}>Nome</th><th className={th}>Instituição</th><th className={th}>Contrato</th><th className={th}>Antes</th><th className={th}>Arquivo</th><th className={th}>Mudança</th><th className={th}>O que acontece</th></tr></thead>
                        <tbody>{mudancas.map(a => (
                            <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700">
                                <td className={td}><input type="checkbox" aria-label={`Aplicar ${a.nome} ${a.nrDoc}`} checked={!desmarcadas.has(a.id)} onChange={e => setDesmarcadas(s => { const n = new Set(s); if (e.target.checked) n.delete(a.id); else n.add(a.id); return n; })} /></td>
                                <td className={td}>{a.nome}</td><td className={td}>{a.instFinanc}</td><td className={td}>{a.nrDoc}</td>
                                <td className={td}>{reais(a.parcelaAntes)}</td><td className={td}>{reais(a.parcela)}</td>
                                <td className={`${td} whitespace-nowrap ${a.tipo === 'ausente' ? 'text-amber-700 dark:text-amber-300' : ''}`}>{ROTULO_ACAO[a.tipo]}</td>
                                <td className={`${td} text-xs text-slate-600 dark:text-slate-300`}>{a.descricao}</td>
                            </tr>))}</tbody>
                    </table></div>
                ) : <p className="text-slate-500">Nenhuma mudança nos contratos das fichas.</p>}
                {iguais > 0 && <p className="text-xs text-slate-500">{iguais} contrato(s) iguais aos da ficha.</p>}
                {previa.pendencias.length > 0 && <div>
                    <p className="font-medium text-red-700 dark:text-red-300">Linhas não importadas ({previa.pendencias.length})</p>
                    <ul className="list-disc pl-5 text-xs text-slate-700 dark:text-slate-300">{previa.pendencias.map((p, i) => <li key={i}>Linha {p.linha}{p.nrDoc ? `, contrato ${p.nrDoc}` : ''}: {p.motivo}</li>)}</ul>
                </div>}
                <button className={btn} disabled={!usuario || !escolhidas.length || gravando || encerrada !== false} onClick={() => void gravar()}>
                    {gravando ? 'Gravando…' : `Gravar ${escolhidas.length} alteração(ões) nas fichas`}</button>
            </>}
        </section>
    );
};

export default ConsignadoImportacao;
