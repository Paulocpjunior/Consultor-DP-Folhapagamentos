// components/folha/ConferenciaPosFolhaPanel.tsx
//
// Fase 1 da migração: conferência pós-folha. A equipe carrega os
// totalizadores que o eSocial devolveu (S-5001, S-5003, S-5011, S-5013) e
// informa os valores da DCTFWeb e da guia do FGTS Digital. O painel aponta
// as divergências; o IOB continua sendo o sistema de registro.

import React, { useEffect, useMemo, useState } from 'react';
import { agruparPorApuracao, lerTotalizadores, type LeituraTotalizadores } from '../../services/conferencia/totalizadores';
import { conferirPosFolha, lerValorDigitado, reais, DESCRICAO_CR_SEGURADO, type Gravidade } from '../../services/conferencia/conferenciaPosFolha';
import { gerarExcelConferencia, nomeArquivoConferencia, rotuloApuracao } from '../../services/conferencia/exportarConferencia';
import { baixarBytes } from '../../services/implantacao/zip';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { cnpjParaSerpro, consultarSerproConferencia, type ConsultaSerpro } from '../../services/conferencia/serproConferencia';
import { consultarDctfWebStatus, consultarESocialFechamento, consultarFgtsRecolhimento } from '../../services/serpro/serproIntegrationService';

const botao = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';
const botaoSec = 'rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-slate-200 disabled:opacity-40';
const cartao = 'rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const th = 'px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300';
const td = 'px-2 py-1 text-slate-800 dark:text-slate-100';

const ESTILO: Record<Gravidade, { rotulo: string; cls: string }> = {
    critica: { rotulo: 'Crítica', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
    atencao: { rotulo: 'Atenção', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    info: { rotulo: 'Informativa', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
};

const formatarCpf = (c: string) => (/^\d{11}$/.test(c) ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : c);
const diferencaTexto = (d: number) => `${reais(Math.abs(d))} ${d > 0 ? 'a mais' : 'a menos'} que o esperado`;
const competencia = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${p.slice(5)}/${p.slice(0, 4)}` : p);

const ConferenciaPosFolhaPanel: React.FC = () => {
    const [leitura, setLeitura] = useState<LeituraTotalizadores | null>(null);
    const [lendo, setLendo] = useState(false);
    const [erro, setErro] = useState('');
    const [grupoChave, setGrupoChave] = useState('');
    const [dctf, setDctf] = useState('');
    const [fgts, setFgts] = useState('');
    const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
    const [empresasErro, setEmpresasErro] = useState(false);
    // Uma consulta por empresa/competência (chave do grupo).
    const [serpro, setSerpro] = useState<Record<string, ConsultaSerpro>>({});
    const [consultando, setConsultando] = useState(false);
    const [serproErro, setSerproErro] = useState('');

    useEffect(() => {
        listarTodasEmpresas().then(setEmpresas).catch(() => setEmpresasErro(true));
    }, []);

    const grupos = useMemo(() => (leitura ? agruparPorApuracao(leitura.totalizadores) : []), [leitura]);
    const grupo = grupos.find(g => g.chave === grupoChave) ?? grupos[0];
    const dctfValor = lerValorDigitado(dctf);
    const fgtsValor = lerValorDigitado(fgts);
    const serproGrupo = grupo ? serpro[grupo.chave] ?? null : null;
    const cnpjSerpro = grupo ? cnpjParaSerpro(grupo, empresas) : null;
    const resultado = useMemo(
        () => (grupo ? conferirPosFolha(grupo, { dctfwebInformado: dctfValor, fgtsDigitalInformado: fgtsValor, serpro: serproGrupo }) : null),
        [grupo, dctfValor, fgtsValor, serproGrupo],
    );

    async function consultarSerpro() {
        if (!grupo || !cnpjSerpro) return;
        setConsultando(true); setSerproErro('');
        try {
            const r = await consultarSerproConferencia({ consultarFgtsRecolhimento, consultarESocialFechamento, consultarDctfWebStatus }, cnpjSerpro, grupo.perApur);
            setSerpro(prev => ({ ...prev, [grupo.chave]: r }));
        } catch (e) {
            setSerproErro((e as Error).message);
        } finally {
            setConsultando(false);
        }
    }

    const nomeEmpresa = (inscricao: string) => {
        const raiz = inscricao.replace(/\D/g, '').slice(0, 8);
        const e = empresas?.find(x => x.cnpj.replace(/\D/g, '').startsWith(raiz));
        return e ? `${e.codigoSage ? e.codigoSage + ' — ' : ''}${e.nomeFantasia || e.razaoSocial}` : '';
    };

    async function carregar(lista: FileList | null) {
        if (!lista?.length) return;
        setLendo(true); setErro('');
        try {
            const arquivos = await Promise.all(Array.from(lista).map(async f => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
            const nova = await lerTotalizadores(arquivos);
            setLeitura(prev => prev ? { totalizadores: [...prev.totalizadores, ...nova.totalizadores.filter(t => !prev.totalizadores.some(p => p.id && p.id === t.id))], avisos: [...prev.avisos, ...nova.avisos] } : nova);
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setLendo(false);
        }
    }

    function limpar() { setLeitura(null); setGrupoChave(''); setDctf(''); setFgts(''); setErro(''); setSerpro({}); setSerproErro(''); }

    function baixarExcel() {
        if (!resultado) return;
        baixarBytes(nomeArquivoConferencia(resultado), gerarExcelConferencia(resultado, nomeEmpresa(resultado.empregador), leitura?.avisos ?? []),
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    const contagem = (g: Gravidade) => resultado?.pendencias.filter(p => p.gravidade === g).length ?? 0;
    const inssComDiferenca = resultado?.inss.filter(l => l.diferenca !== 0) ?? [];

    return (
        <div className="space-y-4">
            <div className={cartao}>
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-slate-800 dark:text-white">Conferência pós-folha</h3><a className="text-sm font-semibold text-blue-700 underline dark:text-blue-300" href={`${import.meta.env.BASE_URL}manuais/conferencia-pos-folha.html`} target="_blank" rel="noopener noreferrer">Manual passo a passo ↗</a></div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Confere a folha que o IOB calculou e transmitiu com o que o eSocial devolveu. Carregue os XMLs dos totalizadores
                    S-5001, S-5003, S-5011 e S-5013 da competência, soltos ou em .zip. O IOB continua sendo o sistema oficial: aqui só se apontam divergências.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className={`${botao} cursor-pointer`}>
                        {lendo ? 'Lendo…' : leitura ? 'Adicionar mais arquivos' : 'Carregar totalizadores'}
                        <input aria-label="Carregar totalizadores" type="file" multiple accept=".xml,.zip" className="sr-only" disabled={lendo}
                            onChange={e => { void carregar(e.target.files); e.target.value = ''; }} />
                    </label>
                    {leitura && <button className={botaoSec} onClick={limpar}>Limpar</button>}
                    {resultado && <button className={botaoSec} onClick={baixarExcel}>Baixar Excel da conferência</button>}
                </div>
                {erro && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{erro}</p>}
                {empresasErro && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Não foi possível ler o cadastro de empresas; as empresas aparecem só pela inscrição.</p>}
            </div>

            {leitura && leitura.avisos.length > 0 && (
                <details className={cartao}>
                    <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">Avisos de leitura ({leitura.avisos.length})</summary>
                    <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">{leitura.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </details>
            )}

            {leitura && !grupos.length && (
                <div className={cartao}><p className="text-sm text-slate-700 dark:text-slate-200">Nenhum totalizador encontrado nos arquivos carregados. Veja os avisos de leitura.</p></div>
            )}

            {resultado && grupo && (
                <>
                    <div className={`${cartao} grid gap-3 md:grid-cols-3`}>
                        <label className="text-sm text-slate-700 dark:text-slate-200">Empresa e competência
                            <select aria-label="Empresa e competência" className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                value={grupo.chave} onChange={e => setGrupoChave(e.target.value)}>
                                {grupos.map(g => <option key={g.chave} value={g.chave}>{nomeEmpresa(g.empregador) || g.empregador} · {competencia(g.perApur)} · {rotuloApuracao(g.indApuracao)}</option>)}
                            </select>
                        </label>
                        <label className="text-sm text-slate-700 dark:text-slate-200">Débitos previdenciários na DCTFWeb (sem IRRF, multa e juros)
                            <input aria-label="Valor da DCTFWeb" inputMode="decimal" placeholder="0,00" className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                value={dctf} onChange={e => setDctf(e.target.value)} />
                        </label>
                        <label className="text-sm text-slate-700 dark:text-slate-200">Guia do FGTS Digital (sem multa e juros)
                            <input aria-label="Valor da guia do FGTS Digital" inputMode="decimal" placeholder="0,00" className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                value={fgts} onChange={e => setFgts(e.target.value)} />
                        </label>
                    </div>

                    <div className={cartao}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-800 dark:text-white">SERPRO</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {grupo.indApuracao === '2' ? 'A consulta ao SERPRO vale só para a folha mensal.'
                                        : cnpjSerpro ? `Fechamento do eSocial, DCTFWeb e FGTS Digital do CNPJ ${cnpjSerpro.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}, pelo Consultor Fiscal.`
                                        : 'CNPJ completo não encontrado no cadastro de empresas nem nos totalizadores.'}
                                </p>
                            </div>
                            <button className={botaoSec} disabled={consultando || !cnpjSerpro || grupo.indApuracao === '2'} onClick={() => void consultarSerpro()}>
                                {consultando ? 'Consultando…' : serproGrupo ? 'Consultar de novo' : 'Consultar SERPRO'}
                            </button>
                        </div>
                        {serproErro && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{serproErro}</p>}
                        {serproGrupo && (
                            <ul className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                                <li className="text-slate-800 dark:text-slate-100"><span className="text-xs text-slate-500 dark:text-slate-400">Fechamento do eSocial</span><br />
                                    {serproGrupo.esocial.ok ? `${serproGrupo.esocial.entregue ? 'Transmitido' : 'Não transmitido'} · ${serproGrupo.esocial.situacao}${serproGrupo.esocial.dataEntrega ? ` · ${serproGrupo.esocial.dataEntrega}` : ''}` : `Indisponível: ${serproGrupo.esocial.erro}`}</li>
                                <li className="text-slate-800 dark:text-slate-100"><span className="text-xs text-slate-500 dark:text-slate-400">DCTFWeb</span><br />
                                    {serproGrupo.dctfweb.ok ? `${serproGrupo.dctfweb.entregue ? 'Entregue' : 'Não entregue'} · ${serproGrupo.dctfweb.situacao}${serproGrupo.dctfweb.dataEntrega ? ` · ${serproGrupo.dctfweb.dataEntrega}` : ''}` : `Indisponível: ${serproGrupo.dctfweb.erro}`}</li>
                                <li className="text-slate-800 dark:text-slate-100"><span className="text-xs text-slate-500 dark:text-slate-400">FGTS Digital</span><br />
                                    {!serproGrupo.fgts.ok ? `Indisponível: ${serproGrupo.fgts.erro}` : serproGrupo.fgts.devido === null ? 'Sem valor devido informado' : `Devido ${reais(serproGrupo.fgts.devido)} · recolhido ${reais(serproGrupo.fgts.realizado ?? 0)}`}</li>
                            </ul>
                        )}
                        {serproGrupo && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Consultado em {new Date(serproGrupo.consultadoEm).toLocaleString('pt-BR')}. O valor dos débitos da DCTFWeb ainda é digitado: o SERPRO devolve aqui só a situação da declaração.</p>}
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                        <div className={cartao}><p className="text-xs text-slate-500 dark:text-slate-400">Pendências</p>
                            <p className="mt-1 text-sm text-slate-800 dark:text-slate-100"><b className="text-red-700 dark:text-red-300">{contagem('critica')}</b> críticas · <b className="text-amber-700 dark:text-amber-300">{contagem('atencao')}</b> atenção · {contagem('info')} informativas</p></div>
                        <div className={cartao}><p className="text-xs text-slate-500 dark:text-slate-400">INSS dos segurados</p>
                            <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">Descontado {reais(resultado.consolidacaoInss.descontadoTrabalhadores)}<br />Calculado {reais(resultado.consolidacaoInss.calculadoTrabalhadores)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{resultado.contagem.s5001} trabalhador(es) no S-5001</p></div>
                        <div className={cartao}><p className="text-xs text-slate-500 dark:text-slate-400">DCTFWeb esperada (S-5011)</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{resultado.contagem.s5011 ? reais(resultado.dctfweb.totalARecolher) : 'S-5011 não carregado'}</p>
                            {resultado.dctfweb.diferenca !== null && <p className={`text-xs ${resultado.dctfweb.diferenca ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{resultado.dctfweb.diferenca ? `Informado: ${diferencaTexto(resultado.dctfweb.diferenca)}` : 'Confere com o informado'}</p>}</div>
                        <div className={cartao}><p className="text-xs text-slate-500 dark:text-slate-400">FGTS Digital esperado (S-5013)</p>
                            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{resultado.contagem.s5013 ? reais(resultado.fgtsDigital.mensal) : 'S-5013 não carregado'}</p>
                            {resultado.fgtsDigital.rescisorio > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Rescisório {reais(resultado.fgtsDigital.rescisorio)}</p>}
                            {resultado.fgtsDigital.diferenca !== null && <p className={`text-xs ${resultado.fgtsDigital.diferenca ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{resultado.fgtsDigital.diferenca ? `Informado: ${diferencaTexto(resultado.fgtsDigital.diferenca)}` : 'Confere com o informado'}</p>}</div>
                    </div>

                    <div className={cartao}>
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Pendências</h4>
                        {resultado.pendencias.length === 0
                            ? <p className="mt-2 text-sm text-green-700 dark:text-green-300">Nenhuma divergência nos totalizadores carregados.</p>
                            : <div className="mt-2 overflow-x-auto"><table className="min-w-full text-sm">
                                <thead><tr><th className={th}>Gravidade</th><th className={th}>Regra</th><th className={th}>CPF</th><th className={th}>Matrícula</th><th className={th}>O que conferir</th></tr></thead>
                                <tbody>{resultado.pendencias.map((p, i) => (
                                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className={td}><span className={`rounded px-2 py-0.5 text-xs ${ESTILO[p.gravidade].cls}`}>{ESTILO[p.gravidade].rotulo}</span></td>
                                        <td className={td}>{p.regra}</td><td className={`${td} whitespace-nowrap`}>{p.cpf ? formatarCpf(p.cpf) : ''}</td><td className={td}>{p.matricula ?? ''}</td><td className={td}>{p.mensagem}</td>
                                    </tr>))}</tbody>
                            </table></div>}
                    </div>

                    {inssComDiferenca.length > 0 && (
                        <div className={cartao}>
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">INSS descontado × calculado ({inssComDiferenca.length} com diferença)</h4>
                            <div className="mt-2 overflow-x-auto"><table className="min-w-full text-sm">
                                <thead><tr><th className={th}>CPF</th><th className={th}>Matrícula</th><th className={th}>Receita</th><th className={th}>Descontado</th><th className={th}>Calculado</th><th className={th}>Diferença</th></tr></thead>
                                <tbody>{inssComDiferenca.map((l, i) => (
                                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className={`${td} whitespace-nowrap`}>{formatarCpf(l.cpf)}</td><td className={td}>{l.matriculas}</td><td className={td}>{DESCRICAO_CR_SEGURADO[l.tpCR] ?? l.tpCR}</td>
                                        <td className={td}>{reais(l.descontado)}</td><td className={td}>{reais(l.calculado)}</td><td className={td}>{reais(l.diferenca)}</td>
                                    </tr>))}</tbody>
                            </table></div>
                        </div>
                    )}

                    {resultado.dctfweb.creditos.length > 0 && (
                        <div className={cartao}>
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Composição esperada da DCTFWeb (S-5011)</h4>
                            <table className="mt-2 min-w-full text-sm">
                                <thead><tr><th className={th}>Código de receita</th><th className={th}>Apurado</th><th className={th}>Suspenso</th><th className={th}>A recolher</th></tr></thead>
                                <tbody>{resultado.dctfweb.creditos.map((c, i) => (
                                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700"><td className={td}>{c.tpCR}</td><td className={td}>{reais(c.valor)}</td><td className={td}>{reais(c.suspenso)}</td><td className={td}>{reais(c.aRecolher)}</td></tr>))}</tbody>
                            </table>
                        </div>
                    )}

                    {resultado.consolidacaoFgts.length > 0 && (
                        <div className={cartao}>
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">FGTS: trabalhadores (S-5003) × empresa (S-5013)</h4>
                            <table className="mt-2 min-w-full text-sm">
                                <thead><tr><th className={th}>Tipo</th><th className={th}>Soma dos S-5003</th><th className={th}>S-5013</th><th className={th}>Diferença</th></tr></thead>
                                <tbody>{resultado.consolidacaoFgts.map(c => (
                                    <tr key={c.tpValor} className="border-t border-slate-100 dark:border-slate-700"><td className={td}>{c.descricao}</td><td className={td}>{reais(c.somaTrabalhadores)}</td>
                                        <td className={td}>{c.empresa === null ? '—' : reais(c.empresa)}</td><td className={td}>{c.diferenca === null ? '—' : reais(c.diferenca)}</td></tr>))}</tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ConferenciaPosFolhaPanel;
