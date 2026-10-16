// components/folha/EventosDaEmpresa.tsx
//
// Cadastros › Eventos IOB › Tabela de eventos da empresa: a tabela de eventos do SAGE da empresa ativa
// (services/calculo/eventosEmpresa.ts). Exporta o modelo em Excel, importa a planilha preenchida (ou o JSON do script do
// PDF "Relação de Eventos"), mostra o que muda em relação ao catálogo geral e só grava com confirmação. Lista os códigos
// dos lançamentos automáticos das fichas que não estão no catálogo que vale para a empresa.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { EventoIobSage } from '../../services/folha/folhaTypes';
import { codigosAusentes, compararComGeral, eventosDaEmpresa, lerTabelaEventos, planilhaEventos, type ModoTabelaEventos, type TabelaEventosEmpresa } from '../../services/calculo/eventosEmpresa';
import { apagarTabelaEventosEmpresa, gravarTabelaEventosEmpresa, lerTabelaEventosEmpresa } from '../../services/calculo/eventosEmpresaService';
import { carregarEventosIob, esquecerEventosDaEmpresa } from '../../services/calculo/catalogoEventos';

const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600 dark:text-slate-100';
const quando = (d?: Date | null) => (d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

const EventosDaEmpresa: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [geral, setGeral] = useState<EventoIobSage[]>([]);
    useEffect(() => { carregarEventosIob().then(setGeral).catch(() => setGeral([])); }, []);
    const [tabela, setTabela] = useState<TabelaEventosEmpresa | null | undefined>(undefined);
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [lida, setLida] = useState<{ nome: string; eventos: EventoIobSage[]; erros: string[] } | null>(null);
    const [modo, setModo] = useState<ModoTabelaEventos>('substitui');
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setTabela(undefined); setLida(null); setErro(''); setMsg('');
        lerTabelaEventosEmpresa(ativa.id).then(t => { if (vivo) setTabela(t); }).catch(e => { if (vivo) { setTabela(null); setErro(mensagemErro(e)); } });
        listarFuncionarios(ativa.id).then(f => { if (vivo) setFichas(f); }).catch(() => { /* sem as fichas, sem a lista de ausentes */ });
        return () => { vivo = false; };
    }, [ativa]);

    const vale = useMemo(() => eventosDaEmpresa(geral, tabela), [geral, tabela]);
    const ausentes = useMemo(() => codigosAusentes(vale, fichas), [vale, fichas]);
    const comparacao = useMemo(() => (lida?.eventos.length ? compararComGeral(geral, lida.eventos) : null), [geral, lida]);
    if (!ativa) return <p className="text-xs text-slate-500">Ative uma empresa para a tabela de eventos dela.</p>;

    function exportar() {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(planilhaEventos(vale)), 'Eventos');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['Como preencher'], ['Uma linha por evento da tabela do SAGE da empresa (Arquivos › Eventos › Cadastro ou a Relação de Eventos).'],
            ['Tipo: V = vencimento, D = desconto. R/V: R = referência, V = valor. Rotina: o código de 3 dígitos da rotina de cálculo do SAGE.'],
            ['Incidências: S ou N. Código com 4 dígitos (zeros à esquerda).'],
        ]), 'Instruções');
        XLSX.writeFile(wb, `eventos-${ativa!.codigoSage || 'empresa'}.xlsx`);
    }
    async function ler(f: File) {
        setErro(''); setMsg('');
        try { setLida({ nome: f.name, ...lerTabelaEventos(f.name, await f.arrayBuffer()) }); }
        catch (e) { setLida(null); setErro(`Não consegui ler: ${mensagemErro(e)}`); }
    }
    async function gravar() {
        if (!lida?.eventos.length) return;
        if (!window.confirm(`Gravar a tabela de eventos da ${ativa!.nome} com ${lida.eventos.length} evento(s), ${modo === 'substitui' ? 'no lugar do catálogo geral' : 'completando o catálogo geral'}? Vale para o Lançar evento, os lançamentos automáticos e a importação de valores desta empresa.`)) return;
        setOcupado(true); setErro('');
        try {
            await gravarTabelaEventosEmpresa(ativa!.id, lida.eventos, modo, lida.nome, usuario);
            esquecerEventosDaEmpresa(ativa!.id);
            setTabela(await lerTabelaEventosEmpresa(ativa!.id)); setLida(null);
            setMsg(`Tabela gravada: ${lida.eventos.length} evento(s).`);
        } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
    }
    async function apagar() {
        if (!window.confirm(`Apagar a tabela de eventos da ${ativa!.nome}? A empresa volta a usar o catálogo geral.`)) return;
        setOcupado(true); setErro('');
        try { await apagarTabelaEventosEmpresa(ativa!.id); esquecerEventosDaEmpresa(ativa!.id); setTabela(null); setMsg('Tabela apagada: vale o catálogo geral.'); }
        catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
    }

    return (
        <section aria-label="Tabela de eventos da empresa" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <div>
                <h3 className="font-semibold">Tabela de eventos da empresa: {ativa.nome}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">O catálogo geral veio de outro cliente do IOB; o mesmo código pode ser outro evento nesta empresa. Exporte o modelo, preencha pela tabela de eventos do SAGE da empresa (ou use o JSON do script do PDF "Relação de Eventos") e importe.</p>
            </div>
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            <p>{tabela === undefined ? 'Lendo…' : tabela ? <>Tabela própria: <strong>{tabela.eventos.length}</strong> evento(s), {tabela.modo === 'substitui' ? 'no lugar do catálogo geral' : 'completando o catálogo geral'} ({tabela.origem}, por {tabela.atualizadoPorEmail}{tabela.atualizadoEm ? ` em ${quando(tabela.atualizadoEm)}` : ''}).</> : <>Sem tabela própria: vale o catálogo geral ({geral.length} eventos).</>}</p>
            <div className="flex flex-wrap items-end gap-2">
                <button className={btn} onClick={exportar}>Exportar modelo (Excel)</button>
                <label className="text-xs">Importar planilha ou JSON<input aria-label="Tabela de eventos da empresa" type="file" accept=".xlsx,.xls,.csv,.json" className="block text-sm" onChange={e => { const f = e.target.files?.[0]; if (f) void ler(f); e.target.value = ''; }} /></label>
                {tabela && <button className={btn} disabled={ocupado} onClick={() => void apagar()}>Apagar a tabela da empresa</button>}
            </div>
            {lida && (
                <div className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <p><strong>{lida.nome}</strong>: {lida.eventos.length} evento(s) válidos{lida.erros.length ? `, ${lida.erros.length} linha(s) recusada(s)` : ''}.</p>
                    {comparacao && <p className="text-xs">Em relação ao catálogo geral: {comparacao.novos.length} novo(s){comparacao.novos.length ? ` (${comparacao.novos.slice(0, 15).join(', ')}${comparacao.novos.length > 15 ? '…' : ''})` : ''}, {comparacao.diferentes.length} diferente(s){comparacao.diferentes.length ? ` (${comparacao.diferentes.slice(0, 15).join(', ')}${comparacao.diferentes.length > 15 ? '…' : ''})` : ''}, {comparacao.iguais} igual(is); {comparacao.soNoGeral} só no geral.</p>}
                    {lida.erros.length > 0 && <ul className="list-disc pl-5 text-xs text-red-700 dark:text-red-300">{lida.erros.slice(0, 30).map((x, i) => <li key={i}>{x}</li>)}</ul>}
                    <fieldset className="flex flex-wrap gap-4 text-xs">
                        <label><input type="radio" name="modo-eventos" checked={modo === 'substitui'} onChange={() => setModo('substitui')} /> Substitui o catálogo geral (tabela completa da empresa)</label>
                        <label><input type="radio" name="modo-eventos" checked={modo === 'completa'} onChange={() => setModo('completa')} /> Completa o catálogo geral (só os eventos que faltam ou mudam)</label>
                    </fieldset>
                    <button className={btn} disabled={ocupado || !lida.eventos.length} onClick={() => void gravar()}>Gravar a tabela da empresa</button>
                </div>
            )}
            {ausentes.length > 0 && (
                <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">Eventos dos lançamentos automáticos fora do catálogo desta empresa ({ausentes.length})</p>
                    <ul className="list-disc pl-5 text-xs">{ausentes.slice(0, 40).map(a => <li key={a.codigo}>{a.codigo}: {a.fichas.slice(0, 5).join(', ')}{a.fichas.length > 5 ? ` e mais ${a.fichas.length - 5}` : ''}</li>)}</ul>
                </div>
            )}
        </section>
    );
};

export default EventosDaEmpresa;
