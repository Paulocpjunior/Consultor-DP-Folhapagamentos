// components/calculo/ConferenciaEsocialIob.tsx
//
// Aba Cálculo › "Conferir com o eSocial do IOB": o S-1200 que o IOB
// transmitiu (com o S-1010 das rubricas e, se vierem, o S-5001 e o S-5003) é
// comparado com o motor em todas as competências do arquivo, funcionário por
// funcionário. Mostra o critério da Fase 3: 3 competências seguidas sem
// diferença. Sem IA e sem gravar nada (services/conferencia/conferenciaMotorIob).

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import type { Rubrica } from '../../services/cadastros/rubricas';
import { listarRubricas, mensagemErro } from '../../services/cadastros/cadastrosService';
import { reais } from '../../services/cadastros/documentos';
import {
    conferirMotorComIob, lerEsocialIob, rubricasParaConferencia, ROTULO_SITUACAO,
    type LeituraEsocialIob, type ResultadoConferenciaIob, type SituacaoLinha,
} from '../../services/conferencia/conferenciaMotorIob';

interface Props {
    empresa: { id: string; cnpj: string; codigoSage?: string };
    fichas: FichaFuncionario[];
    /** Folha mensal pelo motor na competência (movimentos gravados). */
    motor: (competencia: string) => ResultadoCalculo[];
    comFerias: (competencia: string) => Set<string>;
}

const COR: Record<SituacaoLinha, string> = {
    confere: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    diverge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    'sem-ficha': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    'sem-s1200': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    'motor-incompleto': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    'rubrica-sem-tipo': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    'totalizador-repetido': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};
const comp = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const dif = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${reais(Math.abs(c))}`;
const TIPO: Record<string, string> = { '1': 'provento', '2': 'desconto', '3': 'informativa', '4': 'informativa dedutora' };

const ConferenciaEsocialIob: React.FC<Props> = ({ empresa, fichas, motor, comFerias }) => {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [leitura, setLeitura] = useState<LeituraEsocialIob | null>(null);
    const [gravadas, setGravadas] = useState<Rubrica[] | null>(null);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState('');
    const [competencia, setCompetencia] = useState('');
    const [aberto, setAberto] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        listarRubricas(empresa.id).then(r => { if (vivo) setGravadas(r); })
            .catch(e => { if (vivo) { setGravadas([]); setErro(`Rubricas (S-1010) da empresa não carregadas: ${mensagemErro(e)}. Inclua o S-1010 no arquivo.`); } });
        return () => { vivo = false; };
    }, [empresa.id]);

    async function ler() {
        setOcupado('Lendo os arquivos…'); setErro(''); setLeitura(null); setAberto(null);
        try {
            const l = await lerEsocialIob(await Promise.all(arquivos.map(async f => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), empresa.cnpj);
            if (!l.remuneracoes.length) setErro('Nenhum S-1200 mensal desta empresa nos arquivos. Baixe pelo eSocial › Download de eventos (empregador, S-1200) ou inclua os XMLs.');
            setLeitura(l);
            setCompetencia([...new Set(l.remuneracoes.map(r => r.perApur))].sort().pop() ?? '');
        } catch (e) { setErro(`Não foi possível ler: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    const conf = useMemo<{ r: ResultadoConferenciaIob; avisos: string[] } | null>(() => {
        if (!leitura || !gravadas || !leitura.remuneracoes.length) return null;
        const { rubricas, avisos } = rubricasParaConferencia(gravadas, leitura.rubricasDoArquivo, empresa.id);
        return { r: conferirMotorComIob({ leitura, rubricas, fichas, motor, comFerias }), avisos };
    }, [leitura, gravadas, empresa.id, fichas, motor, comFerias]);

    function exportar() {
        if (!conf) return;
        const r = conf.r;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.competencias.map(c => ({
            Competência: comp(c.competencia), Conferem: c.confere, Divergem: c.diverge, Pendentes: c.pendentes, 'Sem diferença': c.zerada ? 'sim' : 'não',
        }))), 'Resumo');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.competencias.flatMap(c => c.linhas.flatMap(l => (l.itens.length ? l.itens : [null]).map(i => ({
            Competência: comp(c.competencia), Funcionário: l.nome, CPF: l.cpf, Situação: ROTULO_SITUACAO[l.situacao],
            Item: i?.item ?? '', Motor: i ? i.motor / 100 : '', IOB: i ? i.iob / 100 : '', Diferença: i ? i.diferenca / 100 : '', Confere: i ? (i.ok ? 'sim' : 'não') : '',
            Observações: l.observacoes.join(' | '),
        }))))), 'Funcionários');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.competencias.flatMap(c => c.linhas.flatMap(l => l.rubricas.map(x => ({
            Competência: comp(c.competencia), Funcionário: l.nome, Rubrica: x.codRubr, Tabela: x.ideTabRubr, Descrição: x.descricao,
            Natureza: x.natRubr, Tipo: TIPO[x.tpRubr] ?? 'sem S-1010', Quantidade: x.qtd, Valor: x.valor / 100,
        }))))), 'Rubricas do IOB');
        const meses = r.competencias.map(c => c.competencia);
        XLSX.writeFile(wb, `conferencia-iob-${empresa.codigoSage ?? 'empresa'}-${meses[0]}-a-${meses[meses.length - 1]}.xlsx`);
    }

    const atual = conf?.r.competencias.find(c => c.competencia === competencia);
    return (
        <section aria-label="Conferência com o eSocial do IOB" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Conferir com o eSocial do IOB (S-1200)</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    Compara o motor com a folha que o IOB transmitiu: o S-1200 de cada funcionário, com o tipo e a natureza das rubricas pelo S-1010 (de Cadastros › Incidências ou do próprio arquivo). Se o arquivo trouxer o S-5001 e o S-5003, também confere o INSS descontado e o FGTS apurados pelo eSocial.
                    Use o .zip do eSocial › Download de eventos (empregador: S-1200; tabelas: S-1010; trabalhador: S-5001 e S-5003) ou os XMLs. Todas as competências do arquivo são conferidas, com os movimentos gravados de cada mês. Diferença zero; nada é gravado.
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm dark:text-white">Arquivos (.zip ou .xml)
                    <input aria-label="Arquivos do eSocial do IOB" className="block text-sm" type="file" accept=".zip,.xml,application/zip,text/xml" multiple disabled={!!ocupado} onChange={e => setArquivos(Array.from(e.target.files ?? []))} />
                </label>
                <button className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!arquivos.length || !!ocupado || !gravadas} onClick={ler}>Conferir</button>
                {conf && <button className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={exportar}>Exportar Excel</button>}
            </div>
            {ocupado && <p role="status" className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {conf && (
                <>
                    <p role="note" className={`rounded p-2 text-sm ${conf.r.criterioAtingido ? 'bg-green-50 text-green-900 dark:bg-green-900/30 dark:text-green-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'}`}>
                        <strong>Critério da Fase 3 (3 competências seguidas sem diferença): {conf.r.criterioAtingido ? 'atingido' : 'ainda não'}.</strong>{' '}
                        {conf.r.sequencia.meses ? `Maior sequência sem diferença: ${conf.r.sequencia.meses} mês(es), de ${comp(conf.r.sequencia.inicio)} a ${comp(conf.r.sequencia.fim)}.` : 'Nenhuma competência sem diferença ainda.'}
                    </p>
                    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-sm dark:text-slate-100">
                            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Competência</th><th className="p-2 text-right">Conferem</th><th className="p-2 text-right">Divergem</th><th className="p-2 text-right">Pendentes</th><th className="p-2">Sem diferença</th></tr></thead>
                            <tbody>{conf.r.competencias.map(c => (
                                <tr key={c.competencia} aria-selected={c.competencia === competencia} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-700 ${c.competencia === competencia ? 'bg-blue-50 dark:bg-slate-700' : ''}`} onClick={() => { setCompetencia(c.competencia); setAberto(null); }}>
                                    <td className="p-2 font-medium">{comp(c.competencia)}</td><td className="p-2 text-right">{c.confere}</td><td className="p-2 text-right">{c.diverge}</td><td className="p-2 text-right">{c.pendentes}</td>
                                    <td className="p-2">{c.zerada ? <span className="text-green-700 dark:text-green-300">✓ sim</span> : <span className="text-red-700 dark:text-red-300">não</span>}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                    {atual && (
                        <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm dark:text-slate-100">
                                <caption className="p-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">Funcionários em {comp(atual.competencia)} (clique para ver o detalhe)</caption>
                                <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Funcionário</th><th className="p-2">Situação</th><th className="p-2">Diferenças</th></tr></thead>
                                <tbody>{atual.linhas.map(l => {
                                    const k = `${l.cpf}|${l.fichaId}`;
                                    return (
                                        <React.Fragment key={k}>
                                            <tr className="cursor-pointer border-t border-slate-100 align-top hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-700" onClick={() => setAberto(a => (a === k ? null : k))}>
                                                <td className="p-2 font-medium">{l.nome}</td>
                                                <td className="whitespace-nowrap p-2 text-xs"><span className={`rounded px-1.5 ${COR[l.situacao]}`}>{ROTULO_SITUACAO[l.situacao]}</span></td>
                                                <td className="p-2 text-xs">{l.itens.filter(i => !i.ok).map(i => `${i.item} ${dif(i.diferenca)}`).join('; ')}</td>
                                            </tr>
                                            {aberto === k && (
                                                <tr className="bg-slate-50 dark:bg-slate-900/40"><td colSpan={3} className="space-y-2 p-3 text-xs">
                                                    {l.itens.length > 0 && (
                                                        <table className="w-full max-w-xl">
                                                            <thead className="text-left text-slate-500"><tr><th>Item</th><th className="text-right">Motor</th><th className="text-right">IOB</th><th className="text-right">Diferença</th></tr></thead>
                                                            <tbody>{l.itens.map(i => <tr key={i.item} className={i.ok ? '' : 'font-semibold text-red-700 dark:text-red-300'}><td>{i.item}</td><td className="text-right">{reais(i.motor)}</td><td className="text-right">{reais(i.iob)}</td><td className="text-right">{i.ok ? '—' : dif(i.diferenca)}</td></tr>)}</tbody>
                                                        </table>
                                                    )}
                                                    {l.rubricas.length > 0 && (
                                                        <table className="w-full max-w-2xl">
                                                            <caption className="text-left font-medium">Rubricas do IOB no S-1200</caption>
                                                            <thead className="text-left text-slate-500"><tr><th>Rubrica</th><th>Descrição</th><th>Natureza</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Valor</th></tr></thead>
                                                            <tbody>{l.rubricas.map((x, j) => <tr key={j}><td>{x.codRubr}</td><td>{x.descricao || '—'}</td><td>{x.natRubr || '—'}</td><td>{TIPO[x.tpRubr] ?? 'sem S-1010'}</td><td className="text-right">{x.qtd}</td><td className="text-right">{reais(x.valor)}</td></tr>)}</tbody>
                                                        </table>
                                                    )}
                                                    {l.observacoes.length > 0 && <ul className="list-disc pl-5 text-amber-800 dark:text-amber-200">{l.observacoes.map((o, j) => <li key={j}>{o}</li>)}</ul>}
                                                </td></tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}</tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            {leitura && [...leitura.avisos, ...(conf?.avisos ?? []), ...(conf?.r.avisos ?? [])].length > 0 && (
                <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">{[...new Set([...leitura.avisos, ...(conf?.avisos ?? []), ...(conf?.r.avisos ?? [])])].map((a, i) => <li key={i}>{a}</li>)}</ul>
            )}
        </section>
    );
};

export default ConferenciaEsocialIob;
