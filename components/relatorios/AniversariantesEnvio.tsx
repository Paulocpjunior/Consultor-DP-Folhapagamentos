// components/relatorios/AniversariantesEnvio.tsx
//
// Relatórios › Central › Aniversariantes do mês: o cartão de aniversário de cada aniversariante (PDF com a mensagem da
// empresa), para baixar ou enviar a ele, por e-mail (do escritório, para o e-mail da ficha) ou pelo WhatsApp do
// escritório (SP Connect, modelo do DP com documento, para o celular da ficha). Um por vez, com o resultado de cada um.
// Com o histórico, cada envio fica gravado e quem já recebeu pelo canal no mês fica de fora (a não ser que se marque
// "incluir quem já recebeu").

import React, { useEffect, useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { enviarEmailPeloEscritorio, enviarPeloSpConnect, templatesDoDp, type TemplateWhatsApp } from '../../services/pacoteCliente/spConnect';
import { aniversariantesDoMes, arquivoCartao, mensagemAniversario, primeiroNome } from '../../services/relatorios/aniversarios';
import { variaveisDoFuncionario } from '../../services/relatorios/holeritePorEmail';
import { separarPorHistorico, textoDoEnvio, type CanalEnvio, type HistoricoDeEnvios, type HistoricoEnvios } from '../../services/relatorios/enviosFuncionario';
import { ESCRITORIO } from '../../services/relatorios/layoutPdf';

interface Props {
    empresa: { id: string; cnpj: string; nome: string };
    competencia: string;
    fichas: FichaFuncionario[];
    /** Texto da empresa (parâmetros da folha): undefined = o padrão; vazio = desligada. */
    mensagem?: string;
    /** O cartão em PDF (layout dos relatórios). */
    gerarCartao: (nome: string, mensagem: string) => Promise<Uint8Array>;
    baixar: (nome: string, bytes: Uint8Array) => void;
    /** Histórico dos envios do mês (cartão de aniversário); sem ele, não grava nem filtra. */
    historico?: HistoricoDeEnvios;
}

const btn = 'rounded-lg px-3 py-1.5 text-white disabled:opacity-50';

const AniversariantesEnvio: React.FC<Props> = ({ empresa, competencia, fichas, mensagem, gerarCartao, baixar, historico }) => {
    const lista = useMemo(() => aniversariantesDoMes(fichas, competencia), [fichas, competencia]);
    const [resultado, setResultado] = useState<Record<string, string>>({});
    const [andamento, setAndamento] = useState('');
    const [templates, setTemplates] = useState<TemplateWhatsApp[] | null>(null);
    const [template, setTemplate] = useState('');
    const [erro, setErro] = useState('');
    const desligada = mensagem !== undefined && !mensagem.trim();
    const texto = (nome: string) => mensagemAniversario(mensagem, nome, empresa.nome);
    const [hist, setHist] = useState<HistoricoEnvios | null>(null);
    const [erroHist, setErroHist] = useState('');
    const [incluir, setIncluir] = useState(false);
    useEffect(() => {
        let vivo = true;
        setHist(null); setErroHist('');
        historico?.listar().then(h => { if (vivo) setHist(h); }).catch(e => { if (vivo) setErroHist(`Histórico dos envios: ${(e as Error).message}`); });
        return () => { vivo = false; };
    }, [historico]);
    const porCanalEmail = separarPorHistorico(lista.filter(a => a.email), a => a.ficha.id, hist, 'email', incluir);
    const porCanalWhats = separarPorHistorico(lista.filter(a => a.whatsapp), a => a.ficha.id, hist, 'whatsapp', incluir);
    const comEmail = porCanalEmail.enviar; const comWhats = porCanalWhats.enviar;
    const algumJaEnviado = porCanalEmail.jaEnviados.length + porCanalWhats.jaEnviados.length > 0;
    const t = templates?.find(x => x.nome === template);
    const faltando = t ? variaveisDoFuncionario(t, { nome: 'X', empresa: empresa.nome, titulo: 'Feliz aniversário', competencia }).faltando : [];

    async function gravar(fichaId: string, canal: CanalEnvio, destino: string, erro?: string) {
        if (!historico) return;
        try { await historico.registrar(fichaId, canal, destino, erro); }
        catch (e) { setErroHist(`Envio feito, mas não gravado no histórico: ${(e as Error).message}`); }
    }

    async function recarregar() {
        if (!historico) return;
        try { setHist(await historico.listar()); } catch (e) { setErroHist(`Histórico dos envios: ${(e as Error).message}`); }
    }

    async function cartao(nome: string, ficha: FichaFuncionario) {
        try { baixar(arquivoCartao(ficha, competencia), await gerarCartao(nome, texto(nome))); }
        catch (e) { setErro((e as Error).message); }
    }

    async function porEmail() {
        if (!comEmail.length || !window.confirm(`Enviar o cartão de aniversário a ${comEmail.length} aniversariante(s) do mês, cada um para o e-mail da ficha?`)) return;
        setResultado({}); setErro('');
        for (const [i, a] of comEmail.entries()) {
            setAndamento(`Enviando ${i + 1} de ${comEmail.length}: ${a.nome}…`);
            try {
                await enviarEmailPeloEscritorio({
                    empresaId: empresa.id, cnpj: empresa.cnpj, empresaNome: empresa.nome, titulo: 'Feliz aniversário', competencia, para: a.email!,
                    assunto: `Feliz aniversário, ${primeiroNome(a.nome)}! · ${empresa.nome}`,
                    mensagem: `${texto(a.nome)}\n\n${ESCRITORIO.departamento} · ${ESCRITORIO.nome}`,
                    anexos: [{ nome: arquivoCartao(a.ficha, competencia), bytes: await gerarCartao(a.nome, texto(a.nome)), mime: 'application/pdf' }],
                });
                setResultado(x => ({ ...x, [a.ficha.id]: `✓ e-mail para ${a.email}` }));
                await gravar(a.ficha.id, 'email', a.email!);
            } catch (e) {
                setResultado(x => ({ ...x, [a.ficha.id]: `✗ ${(e as Error).message}` }));
                await gravar(a.ficha.id, 'email', a.email!, (e as Error).message);
            }
        }
        setAndamento('');
        await recarregar();
    }

    async function carregarTemplates() {
        setErro('');
        try { const ts = await templatesDoDp(); setTemplates(ts); if (ts.length === 1) setTemplate(ts[0].nome); }
        catch (e) { setErro((e as Error).message); setTemplates([]); }
    }

    async function porWhatsApp() {
        if (!t || faltando.length || !comWhats.length) return;
        if (!window.confirm(`Enviar o cartão de aniversário a ${comWhats.length} aniversariante(s) pelo WhatsApp do escritório (modelo ${t.nome}), cada um para o celular da ficha?`)) return;
        setResultado({}); setErro('');
        for (const [i, a] of comWhats.entries()) {
            setAndamento(`Enviando ${i + 1} de ${comWhats.length}: ${a.nome}…`);
            try {
                const { variaveis } = variaveisDoFuncionario(t, { nome: a.nome, empresa: empresa.nome, titulo: 'Feliz aniversário', competencia });
                const r = await enviarPeloSpConnect({ para: a.whatsapp!, template: t.nome, variaveis, pdf: { nome: arquivoCartao(a.ficha, competencia), bytes: await gerarCartao(a.nome, texto(a.nome)) }, referencia: `aniversario:${empresa.id}:${competencia}:${a.ficha.id}` });
                setResultado(x => ({ ...x, [a.ficha.id]: `✓ WhatsApp para ${r.numeroEnviado || a.whatsapp}` }));
                await gravar(a.ficha.id, 'whatsapp', a.whatsapp!);
            } catch (e) {
                setResultado(x => ({ ...x, [a.ficha.id]: `✗ ${(e as Error).message}` }));
                await gravar(a.ficha.id, 'whatsapp', a.whatsapp!, (e as Error).message);
            }
        }
        setAndamento('');
        await recarregar();
    }

    return (
        <section aria-label="Cartão de aniversário" className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <p><strong>Cartão de aniversário</strong> · {lista.length} aniversariante(s) no mês</p>
            {desligada
                ? <p className="text-xs text-amber-800 dark:text-amber-200">A mensagem de aniversário está desligada nesta empresa (Cadastros › Enquadramento › Mensagem no holerite).</p>
                : lista.length > 0 && (<>
                    <p className="text-xs text-slate-500">“{texto(lista[0].nome)}”</p>
                    <ul className="space-y-0.5 text-xs">
                        {lista.map(a => (
                            <li key={a.ficha.id} className="flex flex-wrap items-center gap-2">
                                <span className="w-6 text-right font-mono">{a.dia}</span><span>{a.nome}</span>
                                <span className="text-slate-500">{[a.email && 'e-mail', a.whatsapp && 'WhatsApp'].filter(Boolean).join(' e ') || 'sem e-mail nem celular na ficha'}</span>
                                <button className="text-blue-700 underline dark:text-blue-300" onClick={() => cartao(a.nome, a.ficha)}>Cartão (PDF)</button>
                                {!resultado[a.ficha.id] && (['email', 'whatsapp'] as const).filter(c => hist?.get(a.ficha.id)?.[c]?.ok).map(c => (
                                    <span key={c} className="text-green-700 dark:text-green-300">✓ {textoDoEnvio(c, hist!.get(a.ficha.id)![c]!)}</span>
                                ))}
                                {resultado[a.ficha.id] && <span className={resultado[a.ficha.id].startsWith('✓') ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>{resultado[a.ficha.id]}</span>}
                            </li>
                        ))}
                    </ul>
                    {historico && algumJaEnviado && (
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={incluir} onChange={e => setIncluir(e.target.checked)} /> Incluir quem já recebeu (reenviar)</label>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <button className={`${btn} bg-teal-600`} disabled={!comEmail.length || !!andamento} onClick={porEmail}>Enviar {comEmail.length} por e-mail</button>
                        {templates === null
                            ? <button className={`${btn} bg-green-700`} disabled={!comWhats.length || !!andamento} onClick={carregarTemplates}>Enviar pelo WhatsApp…</button>
                            : (<>
                                <select aria-label="Modelo do WhatsApp do aniversário" className="rounded-sm border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={template} onChange={e => setTemplate(e.target.value)}>
                                    <option value="">— modelo do DP com documento —</option>
                                    {templates.map(x => <option key={x.nome} value={x.nome}>{x.nome}</option>)}
                                </select>
                                <button className={`${btn} bg-green-700`} disabled={!t || faltando.length > 0 || !comWhats.length || !!andamento} onClick={porWhatsApp}>Enviar {comWhats.length} pelo WhatsApp</button>
                            </>)}
                    </div>
                </>)}
            {templates !== null && !templates.length && !erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">Nenhum modelo do Departamento Pessoal com documento no SP Connect.</p>}
            {faltando.length > 0 && <p role="alert" className="text-xs text-red-700 dark:text-red-300">O modelo {t?.nome} tem variáveis que o Consultor não preenche ({faltando.join(', ')}).</p>}
            {erroHist && <p role="alert" className="text-xs text-amber-800 dark:text-amber-200">{erroHist}</p>}
            {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
            {andamento && <p role="status" className="text-blue-700 dark:text-blue-300">{andamento}</p>}
        </section>
    );
};

export default AniversariantesEnvio;
