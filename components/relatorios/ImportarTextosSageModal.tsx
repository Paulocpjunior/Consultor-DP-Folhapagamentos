// components/relatorios/ImportarTextosSageModal.tsx
//
// Importa os "Textos" do SAGE (contratos, advertências, suspensões…) do backup: abre o .zip/.backup/.dbf,
// mostra as tabelas que parecem guardar textos, converte o RTF e liga os marcadores do SAGE (#NOME#…) aos
// campos do Consultor. Grava como modelos do escritório (gestor e admin) ou da empresa ativa.

import React, { useMemo, useState } from 'react';
import { abrirRestauracao, type Restauracao, type TabelaRestauracao } from '../../services/iobSage/restauracao';
import { fonteDeBlob } from '../../services/iobSage/backupPostgres';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { CAMPOS_MODELO, categoriaPeloTitulo, converterMarcadores, marcadoresEstranhos, pareceTabelaDeTextos, ROTULO_CATEGORIA, sugerirCampo, textosDaTabela, type CategoriaModelo, type TextoImportado } from '../../services/modelos/modelos';
import { salvarModelo } from '../../services/modelos/modelosService';

interface Props { empresaId: string; empresaNome: string; admin: boolean; usuario: Usuario; onFechar: () => void; onGravado: (n: number) => void }
type Item = TextoImportado & { marcado: boolean; categoria: CategoriaModelo };

const inp = 'mt-0.5 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

const ImportarTextosSageModal: React.FC<Props> = ({ empresaId, empresaNome, admin, usuario, onFechar, onGravado }) => {
    const [rest, setRest] = useState<Restauracao | null>(null);
    const [todas, setTodas] = useState(false);
    const [tabelaId, setTabelaId] = useState('');
    const [itens, setItens] = useState<Item[]>([]);
    const [ligacao, setLigacao] = useState<Record<string, string>>({});
    const [destino, setDestino] = useState<'empresa' | 'escritorio'>(admin ? 'escritorio' : 'empresa');
    const [verId, setVerId] = useState('');
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');

    const candidatas = useMemo(() => (rest?.tabelas ?? []).filter(t => todas || pareceTabelaDeTextos(t.tabela, t.colunas)), [rest, todas]);
    const marcados = itens.filter(i => i.marcado);
    const marcadores = useMemo(() => [...new Set(marcados.flatMap(i => marcadoresEstranhos(i.corpo)))].sort(), [marcados]);

    async function abrir(lista: File[]) {
        if (!lista.length) return;
        setOcupado('Abrindo o backup…'); setErro(''); setRest(null); setItens([]); setTabelaId('');
        try {
            const r = await abrirRestauracao(lista.map(f => ({ nome: f.name, fonte: fonteDeBlob(f) })));
            setRest(r);
            if (!r.tabelas.some(t => pareceTabelaDeTextos(t.tabela, t.colunas))) setTodas(true);
        } catch (e) { setErro((e as Error).message); } finally { setOcupado(''); }
    }

    async function lerTabela(t: TabelaRestauracao) {
        if (!rest) return;
        setTabelaId(t.id); setOcupado(`Lendo ${t.tabela}…`); setErro(''); setItens([]);
        try {
            const linhas: (string | null)[][] = [];
            await rest.lerTabela(t, v => { linhas.push(v); if (linhas.length >= 20000) return false; });
            const textos = textosDaTabela(t.colunas, linhas);
            if (!textos.length) setErro(`A tabela ${t.tabela} não tem textos. Escolha outra.`);
            setItens(textos.map(x => ({ ...x, marcado: true, categoria: categoriaPeloTitulo(x.titulo) })));
            const sug: Record<string, string> = {};
            for (const m of new Set(textos.flatMap(x => marcadoresEstranhos(x.corpo)))) sug[m] = sugerirCampo(m);
            setLigacao(sug);
        } catch (e) { setErro((e as Error).message); } finally { setOcupado(''); }
    }

    async function gravar() {
        if (!marcados.length) return;
        const onde = destino === 'escritorio' ? 'do escritório (todas as empresas)' : `da empresa ${empresaNome}`;
        if (!window.confirm(`Gravar ${marcados.length} modelo(s) ${onde}?`)) return;
        setErro('');
        try {
            let n = 0;
            for (const i of marcados) {
                setOcupado(`Gravando ${n + 1} de ${marcados.length}…`);
                let corpo = converterMarcadores(i.corpo, ligacao);
                if (!/^#\s/.test(corpo)) corpo = `# ${i.titulo.toUpperCase()}\n\n${corpo}`;
                await salvarModelo({ titulo: i.titulo.slice(0, 120), categoria: i.categoria, corpo: corpo.slice(0, 200000), empresaId: destino === 'escritorio' ? '' : empresaId, origem: 'sage' }, usuario);
                n++;
            }
            onGravado(n);
        } catch (e) { setErro(mensagemErro(e)); setOcupado(''); }
    }

    const ver = itens.find(i => i.chave === verId);
    return (
        <div role="dialog" aria-modal="true" aria-label="Importar textos do SAGE" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-5xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Importar textos do SAGE</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Abra o backup do SAGE (.zip do FolhaWin, .backup da folha ou o .dbf dos textos). O Consultor mostra as tabelas que parecem guardar textos (contratos, advertências, suspensões),
                            converte o RTF e liga os campos do SAGE aos do Consultor. Confira cada texto antes de gravar; depois dá para editar normalmente.
                        </p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                <input aria-label="Arquivos do backup do SAGE" type="file" multiple accept=".zip,.backup,.dbf,.fpt,.dbt" disabled={!!ocupado}
                    onChange={e => abrir(Array.from(e.target.files ?? []))} className="block text-sm" />
                {ocupado && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

                {rest && (
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{todas ? 'Todas as tabelas do backup' : 'Tabelas que parecem de textos'} ({candidatas.length})</p>
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Mostrar todas</label>
                        </div>
                        <ul className="max-h-48 space-y-1 overflow-y-auto">
                            {candidatas.map(t => (
                                <li key={t.id}>
                                    <button className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${t.id === tabelaId ? 'bg-teal-600 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200'}`} disabled={!!ocupado} onClick={() => lerTabela(t)}>
                                        {t.grupo ? `${t.grupo} › ` : ''}{t.tabela} <span className="text-xs opacity-75">({t.colunas.slice(0, 8).join(', ')}{t.colunas.length > 8 ? '…' : ''})</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {itens.length > 0 && (
                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Textos ({marcados.length} de {itens.length} marcados)</p>
                            <ul className="max-h-72 space-y-1 overflow-y-auto">
                                {itens.map((i, k) => (
                                    <li key={i.chave} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-900">
                                        <input type="checkbox" aria-label={`Importar ${i.titulo}`} checked={i.marcado} onChange={e => setItens(l => l.map((x, j) => (j === k ? { ...x, marcado: e.target.checked } : x)))} />
                                        <button className="flex-1 truncate text-left text-sm text-slate-800 underline-offset-2 hover:underline dark:text-slate-100" onClick={() => setVerId(i.chave)}>{i.titulo}</button>
                                        <select aria-label={`Categoria de ${i.titulo}`} className="rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-950" value={i.categoria}
                                            onChange={e => setItens(l => l.map((x, j) => (j === k ? { ...x, categoria: e.target.value as CategoriaModelo } : x)))}>
                                            {(Object.keys(ROTULO_CATEGORIA) as CategoriaModelo[]).map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
                                        </select>
                                    </li>
                                ))}
                            </ul>
                            {ver && <pre aria-label="Texto do SAGE" className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">{ver.corpo}</pre>}
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Campos do SAGE → campos do Consultor</p>
                            {!marcadores.length && <p className="text-xs text-slate-500">Nenhum marcador de campo (#NOME#, @NOME@, &lt;&lt;NOME&gt;&gt;, [NOME]) nos textos marcados.</p>}
                            <ul className="max-h-72 space-y-1 overflow-y-auto">
                                {marcadores.map(m => (
                                    <li key={m} className="grid grid-cols-2 items-center gap-2">
                                        <code className="truncate text-xs text-slate-700 dark:text-slate-200">{m}</code>
                                        <select aria-label={`Campo para ${m}`} className="rounded border border-slate-300 px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-950" value={ligacao[m] ?? ''} onChange={e => setLigacao(l => ({ ...l, [m]: e.target.value }))}>
                                            <option value="">Manter como está</option>
                                            {CAMPOS_MODELO.map(c => <option key={c.chave} value={c.chave}>{c.grupo} · {c.rotulo}</option>)}
                                        </select>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {itens.length > 0 && (
                    <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                        <label className="text-xs text-slate-600 dark:text-slate-300">Gravar como
                            <select aria-label="Gravar como" className={inp} value={destino} onChange={e => setDestino(e.target.value as typeof destino)}>
                                <option value="escritorio" disabled={!admin}>Modelos do escritório (todas as empresas){admin ? '' : ' — gestor ou admin'}</option>
                                <option value="empresa">Modelos só de {empresaNome}</option>
                            </select>
                        </label>
                        <button className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50" disabled={!!ocupado || !marcados.length} onClick={gravar}>Gravar {marcados.length} modelo(s)</button>
                        <button className={btn} onClick={onFechar}>Cancelar</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportarTextosSageModal;
