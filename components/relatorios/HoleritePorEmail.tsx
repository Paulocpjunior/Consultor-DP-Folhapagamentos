// components/relatorios/HoleritePorEmail.tsx
//
// Relatórios › Central › Holerites › "Enviar a cada funcionário": o holerite de cada um, só para ele, por e-mail (do
// escritório, CFI, para o e-mail da ficha) ou pelo WhatsApp do escritório (SP Connect, template do DP com documento,
// para o celular da ficha) (services/relatorios/holeritePorEmail.ts). Envia um por vez e mostra o resultado de cada
// um; quem está sem e-mail ou sem celular na ficha fica de fora. No mês do aniversário, o e-mail leva a mensagem de
// aniversário da empresa.

import React, { useMemo, useState } from 'react';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { enviarEmailPeloEscritorio, enviarPeloSpConnect, templatesDoDp, type TemplateWhatsApp } from '../../services/pacoteCliente/spConnect';
import {
    arquivoHolerite, assuntoHolerite, destinatariosHolerite, destinatariosWhatsApp, mensagemHolerite, variaveisDoFuncionario,
} from '../../services/relatorios/holeritePorEmail';
import { aniversarioNoHolerite } from '../../services/relatorios/aniversarios';

interface Props {
    empresa: { id: string; cnpj: string; nome: string };
    competencia: string;
    folha: ResultadoCalculo[];
    fichas: FichaFuncionario[];
    /** PDF do holerite de um funcionário (o mesmo layout do relatório Holerites). */
    gerarPdf: (r: ResultadoCalculo) => Promise<Uint8Array>;
    /** Texto da mensagem de aniversário da empresa (parâmetros da folha): undefined = o padrão; vazio = desligada. */
    mensagemAniversario?: string;
}

const btn = 'rounded-lg px-3 py-1.5 text-white disabled:opacity-50';

const HoleritePorEmail: React.FC<Props> = ({ empresa, competencia, folha, fichas, gerarPdf, mensagemAniversario }) => {
    const { comEmail, semEmail } = useMemo(() => destinatariosHolerite(folha, fichas), [folha, fichas]);
    const { comWhatsApp, semWhatsApp } = useMemo(() => destinatariosWhatsApp(folha, fichas), [folha, fichas]);
    const [resultado, setResultado] = useState<Record<string, string>>({});
    const [andamento, setAndamento] = useState('');
    const [templates, setTemplates] = useState<TemplateWhatsApp[] | null>(null);
    const [template, setTemplate] = useState('');
    const [erroWa, setErroWa] = useState('');
    const comp = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
    const t = templates?.find(x => x.nome === template);
    const faltando = t ? variaveisDoFuncionario(t, { nome: 'X', empresa: empresa.nome, titulo: 'Holerite', competencia }).faltando : [];

    async function enviar() {
        if (!comEmail.length || !window.confirm(`Enviar ${comEmail.length} holerite(s) de ${comp}, cada um para o e-mail da ficha do funcionário?\n\nCada e-mail leva só o holerite da pessoa.`)) return;
        setResultado({});
        for (const [i, d] of comEmail.entries()) {
            setAndamento(`Enviando ${i + 1} de ${comEmail.length}: ${d.nome}…`);
            try {
                const bytes = await gerarPdf(d.resultado);
                await enviarEmailPeloEscritorio({
                    empresaId: empresa.id, cnpj: empresa.cnpj, empresaNome: empresa.nome, titulo: 'Holerite', competencia,
                    para: d.email, assunto: assuntoHolerite(competencia, empresa.nome),
                    mensagem: mensagemHolerite(d.nome, competencia, empresa.nome, aniversarioNoHolerite(d.ficha, competencia, mensagemAniversario, empresa.nome)),
                    anexos: [{ nome: arquivoHolerite(d, competencia), bytes, mime: 'application/pdf' }],
                });
                setResultado(x => ({ ...x, [d.ficha.id]: `✓ e-mail para ${d.email}` }));
            } catch (e) {
                setResultado(x => ({ ...x, [d.ficha.id]: `✗ ${(e as Error).message}` }));
            }
        }
        setAndamento('');
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
                const { variaveis } = variaveisDoFuncionario(t, { nome: d.nome, empresa: empresa.nome, titulo: 'Holerite', competencia });
                const r = await enviarPeloSpConnect({ para: d.numero, template: t.nome, variaveis, pdf: { nome: arquivoHolerite(d, competencia), bytes }, referencia: `holerite:${empresa.id}:${competencia}:${d.ficha.id}` });
                setResultado(x => ({ ...x, [d.ficha.id]: `✓ WhatsApp para ${r.numeroEnviado || d.numero}` }));
            } catch (e) {
                setResultado(x => ({ ...x, [d.ficha.id]: `✗ ${(e as Error).message}` }));
            }
        }
        setAndamento('');
    }

    const nomes = new Map([...comEmail, ...comWhatsApp].map(d => [d.ficha.id, d.nome]));
    const enviados = Object.values(resultado).filter(v => v.startsWith('✓')).length;
    return (
        <section aria-label="Holerite por e-mail" className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <p><strong>Enviar a cada funcionário</strong> · só o holerite da pessoa, para o contato da própria ficha</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p>E-mail: {comEmail.length} com e-mail na ficha{semEmail.length ? ` · ${semEmail.length} sem e-mail` : ''}</p>
                <button className={`${btn} bg-teal-600`} disabled={!comEmail.length || !!andamento} onClick={enviar}>Enviar {comEmail.length} holerite(s) por e-mail</button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p>WhatsApp: {comWhatsApp.length} com celular na ficha{semWhatsApp.length ? ` · ${semWhatsApp.length} sem celular` : ''}</p>
                {templates === null
                    ? <button className={`${btn} bg-green-700`} disabled={!comWhatsApp.length || !!andamento} onClick={carregarTemplates}>Enviar pelo WhatsApp…</button>
                    : (
                        <span className="flex flex-wrap items-center gap-2">
                            <select aria-label="Modelo do WhatsApp" className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={template} onChange={e => setTemplate(e.target.value)}>
                                <option value="">— modelo do DP com documento —</option>
                                {templates.map(x => <option key={x.nome} value={x.nome}>{x.nome}{x.descricao ? ` · ${x.descricao}` : ''}</option>)}
                            </select>
                            <button className={`${btn} bg-green-700`} disabled={!t || faltando.length > 0 || !comWhatsApp.length || !!andamento} onClick={enviarWhatsApp}>Enviar {comWhatsApp.length} pelo WhatsApp</button>
                        </span>
                    )}
            </div>
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
