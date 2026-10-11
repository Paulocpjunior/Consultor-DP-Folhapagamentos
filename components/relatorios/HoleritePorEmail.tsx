// components/relatorios/HoleritePorEmail.tsx
//
// Relatórios › Central › Holerites › "Enviar a cada funcionário": um e-mail do escritório (CFI) por funcionário, para
// o e-mail da ficha, com só o holerite dele (services/relatorios/holeritePorEmail.ts). Envia um por vez e mostra o
// resultado de cada um; quem está sem e-mail na ficha fica de fora.

import React, { useMemo, useState } from 'react';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { enviarEmailPeloEscritorio } from '../../services/pacoteCliente/spConnect';
import { arquivoHolerite, assuntoHolerite, destinatariosHolerite, mensagemHolerite } from '../../services/relatorios/holeritePorEmail';

interface Props {
    empresa: { id: string; cnpj: string; nome: string };
    competencia: string;
    folha: ResultadoCalculo[];
    fichas: FichaFuncionario[];
    /** PDF do holerite de um funcionário (o mesmo layout do relatório Holerites). */
    gerarPdf: (r: ResultadoCalculo) => Promise<Uint8Array>;
}

const HoleritePorEmail: React.FC<Props> = ({ empresa, competencia, folha, fichas, gerarPdf }) => {
    const { comEmail, semEmail } = useMemo(() => destinatariosHolerite(folha, fichas), [folha, fichas]);
    const [resultado, setResultado] = useState<Record<string, string>>({});
    const [andamento, setAndamento] = useState('');
    const comp = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;

    async function enviar() {
        if (!comEmail.length || !window.confirm(`Enviar ${comEmail.length} holerite(s) de ${comp}, cada um para o e-mail da ficha do funcionário?\n\nCada e-mail leva só o holerite da pessoa.`)) return;
        setResultado({});
        for (const [i, d] of comEmail.entries()) {
            setAndamento(`Enviando ${i + 1} de ${comEmail.length}: ${d.nome}…`);
            try {
                const bytes = await gerarPdf(d.resultado);
                await enviarEmailPeloEscritorio({
                    empresaId: empresa.id, cnpj: empresa.cnpj, empresaNome: empresa.nome, titulo: 'Holerite', competencia,
                    para: d.email, assunto: assuntoHolerite(competencia, empresa.nome), mensagem: mensagemHolerite(d.nome, competencia, empresa.nome),
                    anexos: [{ nome: arquivoHolerite(d, competencia), bytes, mime: 'application/pdf' }],
                });
                setResultado(x => ({ ...x, [d.ficha.id]: `✓ enviado para ${d.email}` }));
            } catch (e) {
                setResultado(x => ({ ...x, [d.ficha.id]: `✗ ${(e as Error).message}` }));
            }
        }
        setAndamento('');
    }

    const enviados = Object.values(resultado).filter(v => v.startsWith('✓')).length;
    return (
        <section aria-label="Holerite por e-mail" className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p><strong>Enviar a cada funcionário</strong> · {comEmail.length} com e-mail na ficha{semEmail.length ? ` · ${semEmail.length} sem e-mail` : ''}</p>
                <button className="rounded-lg bg-teal-600 px-3 py-1.5 text-white disabled:opacity-50" disabled={!comEmail.length || !!andamento} onClick={enviar}>Enviar {comEmail.length} holerite(s) por e-mail</button>
            </div>
            <p className="text-xs text-slate-500">Pelo e-mail do escritório (Configurações › Serviços externos), um e-mail por pessoa, para o e-mail cadastrado na ficha (Cadastros › Funcionários › Dados), com só o holerite dela.</p>
            {semEmail.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-200">Sem e-mail válido na ficha (não recebem): {semEmail.join(', ')}.</p>}
            {andamento && <p role="status" className="text-blue-700 dark:text-blue-300">{andamento}</p>}
            {Object.keys(resultado).length > 0 && (
                <ul aria-label="Resultado do envio" className="max-h-48 space-y-0.5 overflow-auto text-xs">
                    {comEmail.filter(d => resultado[d.ficha.id]).map(d => <li key={d.ficha.id} className={resultado[d.ficha.id].startsWith('✓') ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>{d.nome}: {resultado[d.ficha.id]}</li>)}
                </ul>
            )}
            {!andamento && Object.keys(resultado).length > 0 && <p role="status">{enviados} de {comEmail.length} enviado(s).</p>}
        </section>
    );
};

export default HoleritePorEmail;
