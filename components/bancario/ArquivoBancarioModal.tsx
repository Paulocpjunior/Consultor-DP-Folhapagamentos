// components/bancario/ArquivoBancarioModal.tsx
//
// "Arquivo Bancário" (como na SAGE): conta da empresa no banco (convênio e
// número sequencial do arquivo) e a remessa CNAB 240 de salários da folha
// calculada, com a prévia de quem entra, por qual forma, e quem fica de fora.

import React, { useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import { reservarNsa, salvarContasPagamento } from '../../services/empresas/empresasService';
import {
    BANCOS_SUPORTADOS, PERFIS_BANCO, ROTULO_FORMA, contaPagamentoVazia, gerarRemessa, tipoChavePix,
    avisoConferencia, type ContaPagamento,
} from '../../services/bancario/cnab240';
import { favorecidosDaFolha } from '../../services/bancario/favorecidos';
import { remessaParaBaixar } from '../../services/bancario/download';
import { baixarBytes } from '../../services/implantacao/zip';
import { reais } from '../../services/cadastros/documentos';

const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');

interface Props {
    empresa: Empresa;
    resultados: ResultadoCalculo[];
    fichas: FichaFuncionario[];
    titulo: string;
    /** Data de pagamento sugerida (AAAA-MM-DD). */
    dataSugerida: string;
    /** Data própria de cada recibo (férias: até 2 dias antes do gozo), por chave do resultado. */
    dataPorResultado?: (r: ResultadoCalculo) => string | undefined;
    /** Valor a pagar de cada recibo, no lugar do líquido (arquivo do adiantamento), e o nome da coluna. */
    valorPorResultado?: (r: ResultadoCalculo) => number;
    rotuloValor?: string;
    onFechar: () => void;
    onContasSalvas?: (contas: ContaPagamento[]) => void;
}

const ArquivoBancarioModal: React.FC<Props> = ({ empresa, resultados, fichas, titulo, dataSugerida, dataPorResultado, valorPorResultado, rotuloValor = 'Líquido', onFechar, onContasSalvas }) => {
    const [contas, setContas] = useState<ContaPagamento[]>(empresa.contasPagamento ?? []);
    const [contaId, setContaId] = useState(contas[0]?.id ?? '');
    const [edicao, setEdicao] = useState<ContaPagamento | null>(contas.length ? null : { ...contaPagamentoVazia(), id: `c${Date.now()}` });
    const [data, setData] = useState(dataSugerida);
    const [usarDataDoRecibo, setUsarDataDoRecibo] = useState(!!dataPorResultado);
    const [preferirPix, setPreferirPix] = useState(false);
    const [msg, setMsg] = useState(''); const [erro, setErro] = useState(''); const [salvando, setSalvando] = useState(false);
    const conta = contas.find(c => c.id === contaId) ?? null;
    const perfil = conta ? PERFIS_BANCO[conta.banco] : undefined;

    const { favorecidos, foraDoCalculo } = useMemo(
        () => favorecidosDaFolha(resultados, fichas, data, usarDataDoRecibo ? dataPorResultado : undefined, valorPorResultado),
        [resultados, fichas, data, usarDataDoRecibo, dataPorResultado, valorPorResultado]);

    const previa = useMemo(() => {
        if (!conta) return null;
        try { return { r: gerarRemessa({ conta, cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial, favorecidos, preferirPix }), erro: '' }; }
        catch (e) { return { r: null, erro: (e as Error).message }; }
    }, [conta, empresa, favorecidos, preferirPix]);

    async function gravarContas(novas: ContaPagamento[]) {
        setSalvando(true); setErro('');
        try { await salvarContasPagamento(empresa.id, novas); setContas(novas); onContasSalvas?.(novas); return true; }
        catch (e) { setErro(`Não foi possível gravar a conta (${(e as Error).message}).`); return false; }
        finally { setSalvando(false); }
    }

    async function salvarConta() {
        if (!edicao) return;
        if (!PERFIS_BANCO[edicao.banco]) { setErro('Escolha o banco.'); return; }
        if (!/^\d{1,5}(-[0-9X])?$/i.test(edicao.agencia.trim()) || !/^\d{1,12}-[0-9X]$/i.test(edicao.conta.trim())) { setErro('Agência (ex.: 1234 ou 1234-5) e conta com dígito (ex.: 12345-6).'); return; }
        const novas = contas.some(c => c.id === edicao.id) ? contas.map(c => (c.id === edicao.id ? edicao : c)) : [...contas, edicao];
        if (await gravarContas(novas)) { setContaId(edicao.id); setEdicao(null); }
    }

    async function baixar() {
        if (!previa?.r || !conta) return;
        const p = previa.r;
        if (!p.incluidos.length) { setErro('Nenhum funcionário com dados bancários para o arquivo.'); return; }
        if (p.naoConferidas.length && !window.confirm(`${avisoConferencia(p.perfil, p.naoConferidas)}\n\nBaixe para conferência ou homologação; envie ao banco só depois da conferência. Continuar?`)) return;
        // O número do arquivo é reservado antes de baixar: sem a reserva gravada, o próximo sairia repetido.
        setSalvando(true); setErro('');
        let r: typeof p;
        try {
            const res = await reservarNsa(empresa.id, conta.id);
            setContas(res.contas); onContasSalvas?.(res.contas);
            r = gerarRemessa({ conta: { ...conta, proximoNsa: res.nsa }, cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial, favorecidos, preferirPix });
        } catch (e) { setErro(`Arquivo não gerado: não foi possível reservar o número do arquivo (${(e as Error).message}).`); return; }
        finally { setSalvando(false); }
        // Safari acrescenta .txt a arquivo de texto e o banco recusa o nome: lá o .REM vai dentro de um .zip.
        const d = remessaParaBaixar(r.nomeArquivo, r.conteudo, navigator.userAgent);
        baixarBytes(d.nome, d.bytes, d.mime);
        setMsg(`${r.nomeArquivo} baixado${d.dentroDoZip ? ` dentro de ${d.nome}` : ''}: ${r.incluidos.length} pagamento(s), ${reais(r.total)}. Próximo arquivo: nº ${r.nsa + 1}.`
            + (d.dentroDoZip ? ` No Safari o arquivo vai compactado porque o Safari acrescentaria ".txt" ao nome e o banco recusaria. O Safari abre o .zip sozinho; envie ao banco o ${r.nomeArquivo} da pasta Downloads (se o .zip não abrir, dê dois cliques nele).` : ''));
    }

    const setE = (k: keyof ContaPagamento, v: string | number) => setEdicao(e => (e ? { ...e, [k]: v } : e));
    return (
        <div role="dialog" aria-label="Arquivo Bancário" className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4">
            <div className="w-full max-w-4xl space-y-3 rounded-lg bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className="text-lg font-semibold">Arquivo Bancário</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{empresa.nomeFantasia || empresa.razaoSocial} · {titulo} · remessa CNAB 240 (FEBRABAN) de pagamento de salários</p>
                    </div>
                    <button className="text-slate-500" aria-label="Fechar" onClick={onFechar}>✕</button>
                </div>

                <section className="space-y-2 rounded border border-slate-200 p-2 dark:border-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Conta da empresa</span>
                        {contas.length > 0 && (
                            <select aria-label="Conta da empresa" className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={contaId} onChange={e => setContaId(e.target.value)}>
                                {contas.map(c => <option key={c.id} value={c.id}>{c.banco} · {PERFIS_BANCO[c.banco]?.nome ?? ''} · ag. {c.agencia} · c/c {c.conta}</option>)}
                            </select>
                        )}
                        {conta && !edicao && <button className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600" onClick={() => setEdicao({ ...conta })}>Editar conta</button>}
                        {!edicao && <button className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600" onClick={() => setEdicao({ ...contaPagamentoVazia(), id: `c${Date.now()}` })}>Nova conta</button>}
                    </div>
                    {edicao && (
                        <div className="grid gap-2 sm:grid-cols-4">
                            <label className="text-xs">Banco<select aria-label="Banco da empresa" className={inp} value={edicao.banco} onChange={e => setE('banco', e.target.value)}>
                                <option value="">—</option>{BANCOS_SUPORTADOS.map(b => <option key={b} value={b}>{b} · {PERFIS_BANCO[b].nome}</option>)}</select></label>
                            <label className="text-xs">Agência<input aria-label="Agência da empresa" className={inp} placeholder="1234-5" value={edicao.agencia} onChange={e => setE('agencia', e.target.value)} /></label>
                            <label className="text-xs">Conta com dígito<input aria-label="Conta da empresa" className={inp} placeholder="12345-6" value={edicao.conta} onChange={e => setE('conta', e.target.value)} /></label>
                            <label className="text-xs">Próximo nº do arquivo<input aria-label="Próximo número do arquivo" className={inp} inputMode="numeric" value={String(edicao.proximoNsa)} onChange={e => setE('proximoNsa', Number(e.target.value.replace(/\D/g, '')) || 1)} /></label>
                            <label className="text-xs sm:col-span-2">Código do convênio no banco<input aria-label="Convênio" className={inp} maxLength={20} value={edicao.convenio} onChange={e => setE('convenio', e.target.value)} /></label>
                            <label className="text-xs sm:col-span-2">Endereço da empresa (opcional)<input aria-label="Logradouro da empresa" className={inp} value={edicao.logradouro ?? ''} onChange={e => setE('logradouro', e.target.value)} /></label>
                            <label className="text-xs">Número<input aria-label="Número do endereço" className={inp} value={edicao.numero ?? ''} onChange={e => setE('numero', e.target.value)} /></label>
                            <label className="text-xs">Cidade<input aria-label="Cidade da empresa" className={inp} value={edicao.cidade ?? ''} onChange={e => setE('cidade', e.target.value)} /></label>
                            <label className="text-xs">CEP<input aria-label="CEP da empresa" className={inp} value={edicao.cep ?? ''} onChange={e => setE('cep', e.target.value)} /></label>
                            <label className="text-xs">UF<input aria-label="UF da empresa" className={inp} maxLength={2} value={edicao.uf ?? ''} onChange={e => setE('uf', e.target.value.toUpperCase())} /></label>
                            {PERFIS_BANCO[edicao.banco] && <p className="text-xs text-slate-500 sm:col-span-4">{PERFIS_BANCO[edicao.banco].observacao}</p>}
                            <div className="flex gap-2 sm:col-span-4">
                                <button className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50" disabled={salvando} onClick={salvarConta}>{salvando ? 'Gravando…' : 'Gravar conta'}</button>
                                {contas.length > 0 && <button className="rounded border border-slate-300 px-3 py-1 dark:border-slate-600" onClick={() => setEdicao(null)}>Cancelar</button>}
                            </div>
                        </div>
                    )}
                    {perfil && !edicao && (
                        <p role="note" className={`rounded p-2 text-xs ${perfil.formasConferidas.length ? 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300' : 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'}`}>
                            {perfil.formasConferidas.length
                                ? `Layout ${perfil.layout === 'sispag' ? 'SISPAG' : 'FEBRABAN 240'} do ${perfil.nome}. ${perfil.observacao}`
                                : `Layout do ${perfil.nome} no padrão FEBRABAN 240, ainda não conferido com o arquivo gerado pela SAGE. ${perfil.observacao}`}
                        </p>
                    )}
                </section>

                {conta && !edicao && (
                    <section className="space-y-2">
                        <div className="flex flex-wrap items-end gap-3 text-xs">
                            <label>Data do pagamento<input aria-label="Data do pagamento" type="date" className={`block ${inp}`} value={data} onChange={e => setData(e.target.value)} disabled={usarDataDoRecibo} /></label>
                            {dataPorResultado && <label className="flex items-center gap-1"><input type="checkbox" checked={usarDataDoRecibo} onChange={e => setUsarDataDoRecibo(e.target.checked)} />Data de cada recibo (até 2 dias antes do gozo)</label>}
                            <label className="flex items-center gap-1"><input type="checkbox" checked={preferirPix} onChange={e => setPreferirPix(e.target.checked)} />Pagar por PIX quando a ficha tiver chave</label>
                        </div>
                        {previa?.erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{previa.erro}</p>}
                        {previa?.r && (
                            <>
                                {previa.r.naoConferidas.length > 0 && previa.r.perfil.formasConferidas.length > 0 && (
                                    <p role="note" className="rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{avisoConferencia(previa.r.perfil, previa.r.naoConferidas)}</p>
                                )}
                                <p>{previa.r.lotes.map(l => `${ROTULO_FORMA[l.forma]}: ${l.quantidade} · ${reais(l.total)}`).join(' | ') || 'Nenhum pagamento no arquivo.'} · <strong>Total {reais(previa.r.total)}</strong> · arquivo nº {previa.r.nsa}</p>
                                <div className="max-h-72 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 text-left dark:bg-slate-900"><tr><th className="p-1">Funcionário</th><th className="p-1">Forma</th><th className="p-1">Destino</th><th className="p-1">Data</th><th className="p-1 text-right">{rotuloValor}</th></tr></thead>
                                        <tbody>
                                            {previa.r.incluidos.map(({ favorecido: f, forma }) => (
                                                <tr key={`${f.ref}-${f.nome}-${f.dataPagamento}`} className="border-t border-slate-100 dark:border-slate-700">
                                                    <td className="p-1">{f.nome}</td><td className="p-1">{ROTULO_FORMA[forma]}</td>
                                                    <td className="p-1">{forma === 'pix' ? `PIX ${tipoChavePix(f.pix)}: ${f.pix}` : `${f.banco} · ag. ${f.agencia} · ${f.tipoConta === 'poupanca' ? 'poup.' : 'c/c'} ${f.conta}`}</td>
                                                    <td className="p-1">{br(f.dataPagamento)}</td><td className="p-1 text-right">{reais(f.valor)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {(previa.r.excluidos.length > 0 || foraDoCalculo.length > 0) && (
                                    <div className="rounded border border-red-200 p-2 text-xs text-red-800 dark:border-red-800 dark:text-red-200">
                                        <p className="font-medium">Fora do arquivo ({previa.r.excluidos.length + foraDoCalculo.length}): acerte a ficha e gere de novo, ou pague por fora.</p>
                                        <ul className="list-disc pl-5">
                                            {[...foraDoCalculo, ...previa.r.excluidos.map(e => ({ nome: e.favorecido.nome, motivo: e.motivo }))].map((e, i) => <li key={i}>{e.nome}: {e.motivo}</li>)}
                                        </ul>
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                    <button className="rounded bg-green-700 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={!previa.r.incluidos.length || salvando} onClick={baixar}>Gerar arquivo (.REM)</button>
                                    <span className="text-xs text-slate-500">Envie ao banco pelo internet banking da empresa (ou junto com os arquivos do cliente).</span>
                                </div>
                            </>
                        )}
                    </section>
                )}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            </div>
        </div>
    );
};

export default ArquivoBancarioModal;
