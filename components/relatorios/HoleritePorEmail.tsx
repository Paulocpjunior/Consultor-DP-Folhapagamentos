// components/relatorios/HoleritePorEmail.tsx
//
// Relatórios › Central › Holerites › "Enviar a cada funcionário": o holerite de cada um, só para ele, por e-mail (do
// escritório, CFI, para o e-mail da ficha) ou pelo WhatsApp do escritório (SP Connect, template do DP com documento,
// para o celular da ficha) (services/relatorios/holeritePorEmail.ts). Envia um por vez e mostra o resultado de cada
// um; quem está sem e-mail ou sem celular na ficha fica de fora. No mês do aniversário, o e-mail leva a mensagem de
// aniversário da empresa. Com o histórico, quem já recebeu pelo canal na competência fica de fora (a não ser que se
// marque "incluir quem já recebeu") e cada envio fica gravado (services/relatorios/enviosFuncionario.ts).

import React, { useEffect, useMemo, useState } from 'react';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { enviarEmailPeloEscritorio, enviarPeloSpConnect, templatesDoDp, type TemplateWhatsApp } from '../../services/pacoteCliente/spConnect';
import {
    arquivoHolerite, assuntoHolerite, destinatariosHolerite, destinatariosWhatsApp, mensagemHolerite, variaveisDoFuncionario,
} from '../../services/relatorios/holeritePorEmail';
import { aniversarioNoHolerite } from '../../services/relatorios/aniversarios';
import { separarPorHistorico, textoDoEnvio, type CanalEnvio, type HistoricoDeEnvios, type HistoricoEnvios } from '../../services/relatorios/enviosFuncionario';

interface Props {
    empresa: { id: string; cnpj: string; nome: string };
    competencia: string;
    folha: ResultadoCalculo[];
    fichas: FichaFuncionario[];
    /** PDF do holerite de um funcionário (o mesmo layout do relatório Holerites). */
    gerarPdf: (r: ResultadoCalculo) => Promise<Uint8Array>;
    /** Texto da mensagem de aniversário da empresa (parâmetros da folha): undefined = o padrão; vazio = desligada. */
    mensagemAniversario?: string;
    /** Histórico dos envios da competência (holerite); sem ele, não grava nem filtra. */
    historico?: HistoricoDeEnvios;
    /** Título do documento ("Holerite", "Recibo de férias"…), no assunto, no texto e no WhatsApp. */
    titulo?: string;
    /** Mensagem da tela (o campo Mensagem do SAGE), no fim do e-mail. */
    mensagemExtra?: string;
    /** Chave do tipo no envio pelo WhatsApp (referência única por documento): holerite, holerite-ferias… */
    chave?: string;
}

const btn = 'rounded-lg px-3 py-1.5 text-white disabled:opacity-50';

const HoleritePorEmail: React.FC<Props> = ({ empresa, competencia, folha, fichas, gerarPdf, mensagemAniversario, historico, titulo = 'Holerite', mensagemExtra = '', chave = 'holerite' }) => {
    const todosEmail = useMemo(() => destinatariosHolerite(folha, fichas), [folha, fichas]);
    const todosWhats = useMemo(() => destinatariosWhatsApp(folha, fichas), [folha, fichas]);
    const [hist, setHist] = useState<HistoricoEnvios | null>(null);
    const [erroHist, setErroHist] = useState('');
    const [incluir, setIncluir] = useState(false);
    useEffect(() => {
        let vivo = true;
        setHist(null); setErroHist('');
        historico?.listar().then(h => { if (vivo) setHist(h); }).catch(e => { if (vivo) setErroHist(`Histórico dos envios: ${(e as Error).message}`); });
        return () => { vivo = false; };
    }, [historico]);
    const email = separarPorHistorico(todosEmail.comEmail, d => d.ficha.id, hist, 'email', incluir);
    const whats = separarPorHistorico(todosWhats.comWhatsApp, d => d.ficha.id, hist, 'whatsapp', incluir);
    const comEmail = email.enviar; const semEmail = todosEmail.semEmail;
    const comWhatsApp = whats.enviar; const semWhatsApp = todosWhats.semWhatsApp;
    const jaEnviados = [...new Set([...email.jaEnviados, ...whats.jaEnviados].map(d => d.ficha.id))];
    const [resultado, setResultado] = useState<Record<string, string>>({});
    const [andamento, setAndamento] = useState('');
    const [templates, setTemplates] = useState<TemplateWhatsApp[] | null>(null);
    const [template, setTemplate] = useState('');
    const [erroWa, setErroWa] = useState('');
    const comp = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
    const t = templates?.find(x => x.nome === template);
    const faltando = t ? variaveisDoFuncionario(t, { nome: 'X', empresa: empresa.nome, titulo, competencia }).faltando : [];

    /** Grava o envio no histórico; se a gravação falhar, o envio vale e a tela avisa. */
    async function gravar(fichaId: string, canal: CanalEnvio, destino: string, erro?: string) {
        if (!historico) return;
        try {
            await historico.registrar(fichaId, canal, destino, erro);
        } catch (e) { setErroHist(`Envio feito, mas não gravado no histórico: ${(e as Error).message}`); }
    }

    /** Depois do lote, relê o histórico: quem recebeu sai da próxima rodada. */
    async function recarregar() {
        if (!historico) return;
        try { setHist(await historico.listar()); } catch (e) { setErroHist(`Histórico dos envios: ${(e as Error).message}`); }
    }

    async function enviar() {
        if (!comEmail.length || !window.confirm(`Enviar ${comEmail.length} ${titulo.toLowerCase()}(s) de ${comp}, cada um para o e-mail da ficha do funcionário?\n\nCada e-mail leva só o documento da pessoa.`)) return;
        setResultado({});
        for (const [i, d] of comEmail.entries()) {
            setAndamento(`Enviando ${i + 1} de ${comEmail.length}: ${d.nome}…`);
            try {
                const bytes = await gerarPdf(d.resultado);
                await enviarEmailPeloEscritorio({
                    empresaId: empresa.id, cnpj: empresa.cnpj, empresaNome: empresa.nome, titulo, competencia,
                    para: d.email, assunto: assuntoHolerite(competencia, empresa.nome, titulo),
                    mensagem: mensagemHolerite(d.nome, competencia, empresa.nome, aniversarioNoHolerite(d.ficha, competencia, mensagemAniversario, empresa.nome), titulo, mensagemExtra),
                    anexos: [{ nome: arquivoHolerite(d, competencia), bytes, mime: 'application/pdf' }],
                });
                setResultado(x => ({ ...x, [d.ficha.id]: `✓ e-mail para ${d.email}` }));
                await gravar(d.ficha.id, 'email', d.email);
            } catch (e) {
                setResultado(x => ({ ...x, [d.ficha.id]: `✗ ${(e as Error).message}` }));
                await gravar(d.ficha.id, 'email', d.email, (e as Error).message);
            }
        }
        setAndamento('');
        await recarregar();
    }

    async function carregarTemplates() {
        setErroWa('');
        try { const ts = await templatesDoDp(); setTemplates(ts); if (ts.length === 1) setTemplate(ts[0].nome); }
        catch (e) { setErroWa((e as Error).message); setTemplates([]); }
    }

    async function enviarWhatsApp() {
        if (!t || faltando.length || !comWhatsApp.length) return;
        if (!window.confirm(`Enviar ${comWhatsApp.length} holerite(s) de ${comp} pelo WhatsApp do escritório, cada um para o celular da ficha do funcionário?\n\nModelo: ${t.nome}. Cada mensagem leva só o holerite da pessoa.`)) return;
        setResultado({});
        for (const [i, d] of comWhatsApp.entries()) {
            setAndamento(`Enviando ${i + 1} de ${comWhatsApp.length}: ${d.nome}…`);
            try {
                const bytes = await gerarPdf(d.resultado);
                const { variaveis } = variaveisDoFuncionario(t, { nome: d.nome, empresa: empresa.nome, titulo, competencia });
                const r = await enviarPeloSpConnect({ para: d.numero, template: t.nome, variaveis, pdf: { nome: arquivoHolerite(d, competencia), bytes }, referencia: `${chave}:${empresa.id}:${competencia}:${d.ficha.id}` });
                setResultado(x => ({ ...x, [d.ficha.id]: `✓ WhatsApp para ${r.numeroEnviado || d.numero}` }));
                await gravar(d.ficha.id, 'whatsapp', d.numero);
            } catch (e) {
                setResultado(x => ({ ...x, [d.ficha.id]: `✗ ${(e as Error).message}` }));
                await gravar(d.ficha.id, 'whatsapp', d.numero, (e as Error).message);
            }
        }
        setAndamento('');
        await recarregar();
    }

    const nomes = new Map([...todosEmail.comEmail, ...todosWhats.comWhatsApp].map(d => [d.ficha.id, d.nome]));
    const enviados = Object.values(resultado).filter(v => v.startsWith('✓')).length;
    return (
        <section aria-label="Holerite por e-mail" className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <p><strong>Enviar a cada funcionário</strong> · só o holerite da pessoa, para o contato da própria ficha</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p>E-mail: {todosEmail.comEmail.length} com e-mail na ficha{email.jaEnviados.length ? ` · ${email.jaEnviados.length} já recebeu(ram)` : ''}{semEmail.length ? ` · ${semEmail.length} sem e-mail` : ''}</p>
                <button className={`${btn} bg-teal-600`} disabled={!comEmail.length || !!andamento} onClick={enviar}>Enviar {comEmail.length} holerite(s) por e-mail</button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p>WhatsApp: {todosWhats.comWhatsApp.length} com celular na ficha{whats.jaEnviados.length ? ` · ${whats.jaEnviados.length} já recebeu(ram)` : ''}{semWhatsApp.length ? ` · ${semWhatsApp.length} sem celular` : ''}</p>
                {templates === null
                    ? <button className={`${btn} bg-green-700`} disabled={!comWhatsApp.length || !!andamento} onClick={carregarTemplates}>Enviar pelo WhatsApp…</button>
                    : (
                        <span className="flex flex-wrap items-center gap-2">
                            <select aria-label="Modelo do WhatsApp" className="rounded-sm border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={template} onChange={e => setTemplate(e.target.value)}>
                                <option value="">— modelo do DP com documento —</option>
                                {templates.map(x => <option key={x.nome} value={x.nome}>{x.nome}{x.descricao ? ` · ${x.descricao}` : ''}</option>)}
                            </select>
                            <button className={`${btn} bg-green-700`} disabled={!t || faltando.length > 0 || !comWhatsApp.length || !!andamento} onClick={enviarWhatsApp}>Enviar {comWhatsApp.length} pelo WhatsApp</button>
                        </span>
                    )}
            </div>
            {historico && jaEnviados.length > 0 && (
                <details className="text-xs">
                    <summary className="cursor-pointer">
                        {jaEnviados.length} já recebeu(ram) o holerite de {comp} · {incluir ? 'vão de novo' : 'ficam de fora deste envio'}
                    </summary>
                    <ul aria-label="Já enviados" className="mt-1 space-y-0.5">
                        {jaEnviados.map(id => (
                            <li key={id}>{nomes.get(id)}: {(['email', 'whatsapp'] as const).filter(c => hist?.get(id)?.[c]?.ok).map(c => textoDoEnvio(c, hist!.get(id)![c]!)).join(' · ')}</li>
                        ))}
                    </ul>
                </details>
            )}
            {historico && jaEnviados.length > 0 && (
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={incluir} onChange={e => setIncluir(e.target.checked)} /> Incluir quem já recebeu (reenviar)</label>
            )}
            {erroHist && <p role="alert" className="text-xs text-amber-800 dark:text-amber-200">{erroHist}</p>}
            <p className="text-xs text-slate-500">E-mail do escritório para o e-mail da ficha; WhatsApp do escritório (SP Connect) para o Telefone ou o Telefone 2 da ficha, com um modelo do Departamento Pessoal aprovado na Meta com cabeçalho de documento. No mês do aniversário, o e-mail leva a mensagem de aniversário da empresa.</p>
            {templates !== null && !templates.length && !erroWa && <p role="alert" className="text-xs text-red-700 dark:text-red-300">Nenhum modelo do Departamento Pessoal com documento no SP Connect: cadastre um no CFI (WhatsApp › Templates, departamento dp-folha) com o cabeçalho de documento aprovado na Meta.</p>}
            {faltando.length > 0 && <p role="alert" className="text-xs text-red-700 dark:text-red-300">O modelo {t?.nome} tem variáveis que o Consultor não preenche ({faltando.join(', ')}): escolha outro ou ajuste o cadastro do modelo (nome, empresa, competência ou título).</p>}
            {erroWa && <p role="alert" className="text-xs text-red-700 dark:text-red-300">WhatsApp: {erroWa}</p>}
            {semEmail.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-200">Sem e-mail válido na ficha: {semEmail.join(', ')}.</p>}
            {templates !== null && semWhatsApp.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-200">Sem celular na ficha: {semWhatsApp.join(', ')}.</p>}
            {andamento && <p role="status" className="text-blue-700 dark:text-blue-300">{andamento}</p>}
            {Object.keys(resultado).length > 0 && (
                <ul aria-label="Resultado do envio" className="max-h-48 space-y-0.5 overflow-auto text-xs">
                    {Object.entries(resultado).map(([id, v]) => <li key={id} className={v.startsWith('✓') ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>{nomes.get(id)}: {v}</li>)}
                </ul>
            )}
            {!andamento && Object.keys(resultado).length > 0 && <p role="status">{enviados} de {Object.keys(resultado).length} enviado(s).</p>}
        </section>
    );
};

export default HoleritePorEmail;
