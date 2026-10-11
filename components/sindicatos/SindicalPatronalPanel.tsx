// components/sindicatos/SindicalPatronalPanel.tsx
//
// Folha do mês › Contribuição sindical patronal da empresa ativa (services/sindicatos/sindicalPatronal.ts): adesão,
// capital social, tabela da confederação (a do comércio de 2026 pronta ou as faixas da confederação), entidade e código
// na GRCSU, filiais em outra base territorial; o valor de cada guia, o vencimento de janeiro e o atraso.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { atualizarParametrosFolha, listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { listarEnquadramentos, listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { enquadramentoVigente, type Enquadramento } from '../../services/cadastros/enquadramento';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { TABELAS_PATRONAIS, calcularSindicalPatronal, configPatronalVazia, type ConfigSindicalPatronal, type FaixaPatronal } from '../../services/sindicatos/sindicalPatronal';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const txt = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
const br = (d: string) => d.split('-').reverse().join('/');

const SindicalPatronalPanel: React.FC<{ usuario: Usuario }> = ({ usuario: _u }) => {
    const { ativa } = useEmpresaAtiva();
    const [config, setConfig] = useState<ConfigSindicalPatronal>(configPatronalVazia());
    const [gravado, setGravado] = useState('');
    const [enqs, setEnqs] = useState<Enquadramento[]>([]);
    const [temEmpregados, setTemEmpregados] = useState(true);
    const [ano, setAno] = useState(() => Number((ativa?.competencia ?? '').slice(0, 4)) || new Date().getFullYear());
    const [pagamento, setPagamento] = useState('');
    const [ocupado, setOcupado] = useState(false); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        Promise.all([listarEmpresasVisiveis(), listarEnquadramentos(ativa.id).catch(() => []), listarFuncionarios(ativa.id).catch(() => [])])
            .then(([es, en, fs]) => {
                if (!vivo) return;
                const c = { ...configPatronalVazia(), ...(es.find(e => e.id === ativa.id)?.parametrosFolha?.sindicalPatronal ?? {}) };
                setConfig(c); setGravado(JSON.stringify(c)); setEnqs(en); setTemEmpregados(fs.some(f => f.situacao !== 'desligado'));
            })
            .catch(e => { if (vivo) setErro(`Dados não carregados: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa]);

    const simples = useMemo(() => {
        if (!ativa) return false;
        const v = enquadramentoVigente(enqs, ativa.id, `${ano}-01`);
        return 'enquadramento' in v && v.enquadramento.regime !== 'normal' && /simples/.test(v.enquadramento.regime);
    }, [enqs, ativa, ano]);
    const r = calcularSindicalPatronal({ config, ano, simples, temEmpregados, pagamento: pagamento || undefined });

    async function gravar() {
        if (!ativa) return;
        setOcupado(true); setErro('');
        try { await atualizarParametrosFolha(ativa.id, p => ({ ...(p ?? {}), sindicalPatronal: config })); setGravado(JSON.stringify(config)); setMsg('Dados da contribuição patronal gravados.'); }
        catch (x) { setErro(`Não foi possível gravar (${mensagemErro(x)}).`); }
        finally { setOcupado(false); }
    }
    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative uma empresa.</p>;
    const muda = (x: Partial<ConfigSindicalPatronal>) => setConfig(c => ({ ...c, ...x }));
    const mudaFaixa = (i: number, x: Partial<FaixaPatronal>) => muda({ faixasProprias: config.faixasProprias.map((f, j) => (j === i ? { ...f, ...x } : f)) });
    return (
        <div className="space-y-4 text-sm">
            <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Contribuição sindical patronal · {ano}</h2>
                <p className="text-slate-600 dark:text-slate-300">Facultativa desde a Lei 13.467/2017: só de quem aderiu. Proporcional ao capital social pela tabela da confederação (CLT, art. 580, III), recolhida em janeiro na GRCSU (art. 587). Simples Nacional dispensado (LC 123/2006, art. 13, § 3º).</p>
            </div>
            <section aria-label="Dados da contribuição patronal" className="grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-4 dark:border-slate-700">
                <label className="flex items-center gap-2 sm:col-span-4"><input type="checkbox" checked={config.aderiu} onChange={e => muda({ aderiu: e.target.checked })} />A empresa aderiu à contribuição (autorização prévia e expressa)</label>
                <label>Capital social (R$)<input aria-label="Capital social" inputMode="decimal" className={`block w-full ${inp}`} defaultValue={txt(config.capitalSocial)} key={`cap${gravado.length}`} onBlur={e => muda({ capitalSocial: centavosDeTexto(e.target.value) ?? 0 })} /></label>
                <label>Tabela<select aria-label="Tabela da confederação" className={`block w-full ${inp}`} value={config.tabelaId} onChange={e => muda({ tabelaId: e.target.value })}>
                    {TABELAS_PATRONAIS.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}<option value="propria">Outra confederação (faixas próprias)</option></select></label>
                <label>Ano<input aria-label="Ano da contribuição" type="number" className={`block w-full ${inp}`} value={ano} onChange={e => setAno(Number(e.target.value))} /></label>
                <label>Pago em (atraso)<input aria-label="Data do pagamento" type="date" className={`block w-full ${inp}`} value={pagamento} onChange={e => setPagamento(e.target.value)} /></label>
                <label className="sm:col-span-2">Entidade sindical<input aria-label="Entidade sindical" className={`block w-full ${inp}`} value={config.entidade} onChange={e => muda({ entidade: e.target.value })} /></label>
                <label>CNPJ da entidade<input aria-label="CNPJ da entidade" className={`block w-full ${inp}`} value={config.cnpjEntidade} onChange={e => muda({ cnpjEntidade: e.target.value.replace(/\D/g, '').slice(0, 14) })} /></label>
                <label>Código sindical (GRCSU)<input aria-label="Código sindical" className={`block w-full ${inp}`} value={config.codigoSindical} onChange={e => muda({ codigoSindical: e.target.value.slice(0, 20) })} /></label>
                {config.tabelaId === 'propria' && <div className="space-y-1 sm:col-span-4">
                    <p className="text-xs font-medium">Faixas da confederação (capital até; alíquota; parcela a adicionar; ou valor fixo para o mínimo e o máximo)</p>
                    {config.faixasProprias.map((f, i) => (
                        <div key={i} className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-[1fr_6rem_1fr_1fr_auto]">
                            <input aria-label={`Capital até ${i + 1}`} className={inp} placeholder="até (vazio = acima)" defaultValue={f.ate === null ? '' : txt(f.ate)} onBlur={e => mudaFaixa(i, { ate: e.target.value.trim() ? centavosDeTexto(e.target.value) ?? 0 : null })} />
                            <input aria-label={`Alíquota ${i + 1}`} className={inp} placeholder="%" defaultValue={f.aliquota ? String(f.aliquota).replace('.', ',') : ''} onBlur={e => mudaFaixa(i, { aliquota: Number(e.target.value.replace(',', '.')) || 0 })} />
                            <input aria-label={`Adicionar ${i + 1}`} className={inp} placeholder="parcela a adicionar" defaultValue={txt(f.adicionar)} onBlur={e => mudaFaixa(i, { adicionar: centavosDeTexto(e.target.value) ?? 0 })} />
                            <input aria-label={`Valor fixo ${i + 1}`} className={inp} placeholder="valor fixo (mín./máx.)" defaultValue={f.fixo ? txt(f.fixo) : ''} onBlur={e => mudaFaixa(i, { fixo: e.target.value.trim() ? centavosDeTexto(e.target.value) ?? 0 : undefined })} />
                            <button className="text-red-600" onClick={() => muda({ faixasProprias: config.faixasProprias.filter((_, j) => j !== i) })}>×</button>
                        </div>
                    ))}
                    <button className="text-xs text-blue-700 underline dark:text-blue-300" onClick={() => muda({ faixasProprias: [...config.faixasProprias, { ate: null, aliquota: 0, adicionar: 0 }] })}>+ Faixa</button>
                </div>}
                <div className="space-y-1 sm:col-span-4">
                    <p className="text-xs font-medium">Filiais em outra base territorial (CLT, art. 581: a parte do capital vai ao sindicato da filial)</p>
                    {config.filiais.map((f, i) => {
                        const mf = (x: Partial<typeof f>) => muda({ filiais: config.filiais.map((y, j) => (j === i ? { ...y, ...x } : y)) });
                        return (
                            <div key={i} className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-[10rem_5rem_1fr_8rem_auto]">
                                <input aria-label={`CNPJ da filial ${i + 1}`} className={inp} placeholder="CNPJ" value={f.cnpj} onChange={e => mf({ cnpj: e.target.value.replace(/\D/g, '').slice(0, 14) })} />
                                <input aria-label={`Parte do capital ${i + 1}`} className={inp} placeholder="%" value={f.percentual || ''} onChange={e => mf({ percentual: Number(e.target.value.replace(',', '.')) || 0 })} />
                                <input aria-label={`Entidade da filial ${i + 1}`} className={inp} placeholder="sindicato da filial" value={f.entidade} onChange={e => mf({ entidade: e.target.value })} />
                                <input aria-label={`Código sindical da filial ${i + 1}`} className={inp} placeholder="código" value={f.codigoSindical} onChange={e => mf({ codigoSindical: e.target.value.slice(0, 20) })} />
                                <button className="text-red-600" onClick={() => muda({ filiais: config.filiais.filter((_, j) => j !== i) })}>×</button>
                            </div>
                        );
                    })}
                    <button className="text-xs text-blue-700 underline dark:text-blue-300" onClick={() => muda({ filiais: [...config.filiais, { cnpj: '', percentual: 0, entidade: '', codigoSindical: '' }] })}>+ Filial</button>
                </div>
                <div className="flex justify-end sm:col-span-4"><button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={ocupado || JSON.stringify(config) === gravado} onClick={gravar}>{JSON.stringify(config) === gravado ? 'Gravado' : 'Gravar'}</button></div>
            </section>

            <section aria-label="Cálculo da contribuição patronal" className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                <p className="font-medium">{r.situacao === 'devida' ? `Contribuição de ${ano}: ${reais(r.valor)} · vencimento ${br(r.vencimento)}` : r.situacao === 'dispensada' ? 'Dispensada' : r.situacao === 'sem-adesao' ? 'Sem adesão: não há contribuição' : 'Faltam dados'}</p>
                {r.erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{r.erros.map(x => <li key={x}>{x}</li>)}</ul>}
                <ul className="list-disc pl-5 text-xs">{r.memoria.map((m, i) => <li key={i}>{m}</li>)}</ul>
                {r.avisos.map(a => <p key={a} className="text-xs text-amber-800 dark:text-amber-200">⚠ {a}</p>)}
                {r.guias.length > 0 && <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Estabelecimento</th><th className="p-1">Entidade</th><th className="p-1">Código (GRCSU)</th><th className="p-1 text-right">Capital</th><th className="p-1 text-right">Valor</th></tr></thead>
                    <tbody>{r.guias.map(g => <tr key={g.estabelecimento} className="border-t border-slate-100 dark:border-slate-700"><td className="p-1">{g.estabelecimento}</td><td className="p-1">{g.entidade}</td><td className="p-1 font-mono">{g.codigoSindical}</td><td className="p-1 text-right">{reais(g.capital)}</td><td className="p-1 text-right font-medium">{reais(g.valor)}</td></tr>)}</tbody></table>}
                {r.atraso && <p className="text-xs">Com o atraso de {r.atraso.dias} dia(s): multa {reais(r.atraso.multa)} + juros {reais(r.atraso.juros)} = <strong>{reais(r.atraso.total)}</strong>.</p>}
            </section>
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
        </div>
    );
};

export default SindicalPatronalPanel;
