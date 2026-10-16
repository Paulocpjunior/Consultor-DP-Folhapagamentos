// components/relatorios/HoleriteEnvioPanel.tsx
//
// Relatórios › Holerite por e-mail (Impressos › Holerite › Envio para email do Funcionário do IOB SAGE): escolhe os
// holerites (código inicial e final, departamento, demitidos), o tipo (mensal, adiantamento, férias, 13º, rescisão), o
// período e o crédito; "Vídeo" abre o PDF, "Gerar holerite" baixa, e o envio vai a cada funcionário, por e-mail ou
// WhatsApp, só com o documento dele (HoleritePorEmail). Mensal e adiantamento saem da folha gravada; férias, 13º e
// rescisão, dos processos gravados na tela de Cálculo.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import { lerFolhaGravada } from '../../services/calculo/folhaGravadaService';
import { lerProcesso } from '../../services/calculo/processosGravadosService';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { motorHomologadoNoMes } from '../../services/calculo/arredondamento';
import { temAdiantamento } from '../../services/calculo/motorMensal';
import { historicoDeEnvios } from '../../services/relatorios/enviosFuncionarioService';
import type { OpcoesPdf } from '../../services/relatorios/layoutPdf';
import {
    departamentosDasFichas, SELECAO_PADRAO, selecionarHolerites, tipoDoHistorico, TIPOS_HOLERITE_ENVIO, type SelecaoHolerites, type TipoHoleriteEnvio,
} from '../../services/relatorios/holeriteEnvio';
import { quintoDiaUtilSalario, somarMeses } from '../../services/prazos/calendario';
import HoleritePorEmail from './HoleritePorEmail';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const relatoriosPdf = () => import('../../services/relatorios/holeritePdf');
const creditoPadrao = (c: string) => { const [a, m] = somarMeses(`${c}-01`, 1).slice(0, 7).split('-').map(Number); return quintoDiaUtilSalario(a, m); };

const HoleriteEnvioPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [periodo, setPeriodo] = useState(ativa?.competencia ?? '');
    const [tipo, setTipo] = useState<TipoHoleriteEnvio>('mensal');
    const [credito, setCredito] = useState(ativa ? creditoPadrao(ativa.competencia) : '');
    const [sel, setSel] = useState<SelecaoHolerites>(SELECAO_PADRAO);
    const [comDepto, setComDepto] = useState(true);
    const [mensagem, setMensagem] = useState('');
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [resultados, setResultados] = useState<ResultadoCalculo[] | null>(null);
    const [erro, setErro] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [enviar, setEnviar] = useState(false);

    useEffect(() => { if (ativa?.competencia) { setPeriodo(ativa.competencia); setCredito(creditoPadrao(ativa.competencia)); } }, [ativa?.competencia]);
    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        Promise.all([listarEmpresasVisiveis(), listarFuncionarios(ativa.id)])
            .then(([emps, fs]) => { if (vivo) { setEmpresa(emps.find(e => e.id === ativa.id) ?? null); setFichas(fs); } })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa]);
    // Os holerites do tipo e do período: da folha gravada (mensal, adiantamento) ou do processo gravado.
    useEffect(() => {
        if (!ativa || !/^\d{4}-\d{2}$/.test(periodo)) return;
        let vivo = true;
        setResultados(null); setErro(''); setEnviar(false);
        const ler = tipo === 'mensal' || tipo === 'adiantamento'
            ? lerFolhaGravada(ativa.id, periodo).then(f => f?.holerites ?? [])
            : lerProcesso(ativa.id, tipo, periodo).then(p => p?.holerites ?? []);
        ler.then(rs => { if (vivo) setResultados(tipo === 'adiantamento' ? rs.filter(r => temAdiantamento(r)) : rs); })
            .catch(e => { if (vivo) { setErro(mensagemErro(e)); setResultados([]); } });
        return () => { vivo = false; };
    }, [ativa, periodo, tipo]);

    const selecionados = useMemo(() => selecionarHolerites(resultados ?? [], fichas, sel), [resultados, fichas, sel]);
    const deptos = useMemo(() => departamentosDasFichas(fichas), [fichas]);
    const info = TIPOS_HOLERITE_ENVIO.find(t => t.tipo === tipo)!;
    const historico = useMemo(() => (ativa ? historicoDeEnvios(ativa.id, periodo, tipoDoHistorico(tipo), usuario) : undefined), [ativa?.id, periodo, tipo, usuario.id]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa.</p>;

    const opcoes: OpcoesPdf = {
        empresa: { razaoSocial: empresa?.razaoSocial || ativa.nome, cnpj: ativa.cnpj.replace(/\D/g, ''), codigoSage: ativa.codigoSage },
        titulo: info.titulo, previa: !motorHomologadoNoMes(empresa?.parametrosFolha, periodo), emitidoPor: usuario.email,
        mensagemHolerite: [empresa?.parametrosFolha?.mensagemHolerite, mensagem].filter(x => x?.trim()).join('\n'),
        mensagemAniversario: empresa?.parametrosFolha?.mensagemAniversario, departamento: comDepto, dataCredito: credito || undefined,
    };
    async function pdfDe(rs: ResultadoCalculo[]) {
        const m = await relatoriosPdf();
        return tipo === 'adiantamento' ? m.recibosAdiantamentoPdf(rs, fichas, opcoes, credito) : m.holeritesPdf(rs, fichas, opcoes);
    }
    async function video() {
        setOcupado(true);
        try { window.open(URL.createObjectURL((await pdfDe(selecionados)).output('blob')), '_blank'); }
        catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
    }
    async function gerar() {
        setOcupado(true);
        try { (await pdfDe(selecionados)).save(`${tipo}-${ativa!.codigoSage || 'empresa'}-${periodo}.pdf`); }
        catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
    }

    const fonte = tipo === 'mensal' || tipo === 'adiantamento' ? 'a folha do mês gravada (Cálculo mensal › Gravar)' : `o processo de ${info.rotulo.toLowerCase()} gravado (tela de Cálculo › Gravar)`;
    return (
        <div className="space-y-4 text-sm dark:text-slate-100">
            <div>
                <h2 className="text-lg font-semibold">Holerite por e-mail e WhatsApp</h2>
                <p className="text-slate-600 dark:text-slate-300">Como o "Envio para email do Funcionário" do SAGE: escolha os funcionários, o tipo e o período. Cada funcionário recebe só o documento dele, no e-mail ou no celular da própria ficha.</p>
            </div>
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

            <section className="grid gap-3 rounded-sm border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
                <div className="flex flex-wrap items-end gap-2">
                    <label>Código inicial<input aria-label="Código inicial" className={`block w-28 ${inp}`} value={sel.codigoDe} placeholder="000001" onChange={e => setSel({ ...sel, codigoDe: e.target.value })} /></label>
                    <label>Código final<input aria-label="Código final" className={`block w-28 ${inp}`} value={sel.codigoAte} placeholder="999999" onChange={e => setSel({ ...sel, codigoAte: e.target.value })} /></label>
                    <button className={btn} onClick={() => setSel({ ...sel, codigoDe: '', codigoAte: '' })}>Todos os funcionários</button>
                </div>
                <label>Departamento<select aria-label="Departamento" className={`block w-full ${inp}`} value={sel.departamento} onChange={e => setSel({ ...sel, departamento: e.target.value })}>
                    <option value="">Todos os departamentos</option>
                    {deptos.map(d => <option key={d} value={d}>{d}</option>)}
                </select></label>
                <div className="flex flex-wrap gap-3 text-xs">
                    <label className="flex items-center gap-1"><input type="checkbox" checked={sel.demitidos} onChange={e => setSel({ ...sel, demitidos: e.target.checked })} />Imprimir demitidos</label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={comDepto} onChange={e => setComDepto(e.target.checked)} />Imprimir informação do departamento</label>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                    <label>Tipo<select aria-label="Tipo" className={`block ${inp}`} value={tipo} onChange={e => setTipo(e.target.value as TipoHoleriteEnvio)}>
                        {TIPOS_HOLERITE_ENVIO.map(t => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
                    </select></label>
                    <label>Crédito<input aria-label="Crédito" type="date" className={`block ${inp}`} value={credito} onChange={e => setCredito(e.target.value)} /></label>
                    <label>Período<input aria-label="Período" type="month" className={`block ${inp}`} value={periodo} onChange={e => e.target.value && setPeriodo(e.target.value)} /></label>
                </div>
                <label className="sm:col-span-2">Mensagem<input aria-label="Mensagem" maxLength={300} className={`block w-full ${inp}`} value={mensagem} placeholder="Vai no holerite e no e-mail" onChange={e => setMensagem(e.target.value)} /></label>
            </section>

            <div className="flex flex-wrap items-center gap-2">
                <span>{resultados === null ? 'Carregando…' : `${selecionados.length} de ${resultados.length} documento(s) na seleção.`}</span>
                <button className={btn} disabled={!selecionados.length || ocupado} onClick={video}>Vídeo</button>
                <button className={btn} disabled={!selecionados.length || ocupado} onClick={gerar}>Gerar holerite</button>
                <button className="rounded-sm bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40" disabled={!selecionados.length} aria-pressed={enviar} onClick={() => setEnviar(x => !x)}>Enviar</button>
            </div>
            {resultados !== null && !resultados.length && <p className="text-amber-800 dark:text-amber-200">Nada de {info.rotulo.toLowerCase()} em {periodo.slice(5)}/{periodo.slice(0, 4)}: o envio usa {fonte}.</p>}
            {enviar && selecionados.length > 0 && (
                <HoleritePorEmail key={`${tipo}-${periodo}`} empresa={{ id: ativa.id, cnpj: ativa.cnpj.replace(/\D/g, ''), nome: empresa?.nomeFantasia || empresa?.razaoSocial || ativa.nome }}
                    competencia={periodo} folha={selecionados} fichas={fichas} titulo={info.titulo} mensagemExtra={mensagem} chave={tipoDoHistorico(tipo)}
                    mensagemAniversario={tipo === 'mensal' ? empresa?.parametrosFolha?.mensagemAniversario : ''} historico={historico}
                    gerarPdf={async r => new Uint8Array((await pdfDe([r])).output('arraybuffer'))} />
            )}
        </div>
    );
};

export default HoleriteEnvioPanel;
