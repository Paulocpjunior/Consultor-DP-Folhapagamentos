// components/demissoes/EfetivacaoRescisao.tsx
//
// Cálculo › Rescisão › Efetivação: o roteiro do desligamento registrado, com prazo e situação de cada passo (S-2299 e
// S-1210 pelo eSocial; pagamento, guia do FGTS, seguro-desemprego e documentos marcados pela equipe), o seguro-
// desemprego com os dados para o Empregador Web e as orientações ao trabalhador em PDF.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoRescisao } from '../../services/calculo/motorRescisao';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { Envio } from '../../services/esocial/transmissaoService';
import { statusPorRef } from '../../services/esocial/statusEvento';
import { refDesligamento } from '../../services/esocial/desligamento';
import { refPagamentoRescisao } from '../../services/esocial/pagamentoRescisao';
import { dadosEmpregadorWeb, LINK_EMPREGADOR_WEB, LINK_FGTS_DIGITAL, passosDaEfetivacao, seguroDesemprego, type PassoId, type Solicitacao } from '../../services/demissoes/efetivacao';
import { lerEfetivacao, marcarPasso, type Efetivacao } from '../../services/demissoes/efetivacaoService';
import { reais } from '../../services/cadastros/documentos';

const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

interface Props { empresa: Empresa; ficha: FichaFuncionario; rescisao: ResultadoRescisao; usuario: Usuario; envios: Envio[] | null }

const EfetivacaoRescisao: React.FC<Props> = ({ empresa, ficha, rescisao: r, usuario, envios }) => {
    const [ef, setEf] = useState<Efetivacao | null>(null);
    const [erro, setErro] = useState('');
    const [obs, setObs] = useState<Partial<Record<PassoId, string>>>({});
    const [solicitacao, setSolicitacao] = useState<Solicitacao>(1);
    const [verDados, setVerDados] = useState(false);
    const [copiado, setCopiado] = useState('');
    useEffect(() => {
        let vivo = true;
        lerEfetivacao(empresa.id, ficha.id, r.data).then(x => { if (vivo) setEf(x); }).catch(e => { if (vivo) { setErro(`Passos não carregados: ${mensagemErro(e)}`); setEf({ empresaId: empresa.id, fichaId: ficha.id, data: r.data, passos: {} }); } });
        return () => { vivo = false; };
    }, [empresa.id, ficha.id, r.data]);

    const passos = useMemo(() => passosDaEfetivacao(r).filter(p => p.aplica), [r]);
    const seguro = useMemo(() => seguroDesemprego(ficha, r, solicitacao), [ficha, r, solicitacao]);
    const hoje = hojeSp();
    const s2299 = envios ? statusPorRef(refDesligamento(ficha.id, r.data), 'S-2299', envios, ficha.dados.dataDesligamento === r.data && (ficha.origens?.dataDesligamento ?? '').startsWith('eSocial') ? { recibo: '', detalhe: 'pelo IOB' } : null) : null;
    const s1210 = envios ? statusPorRef(refPagamentoRescisao(ficha.id, r.data), 'S-1210', envios) : null;
    const automatico = (id: PassoId): { feito: boolean; texto: string } | null => {
        if (id === 'ficha') return ficha.dados.dataDesligamento === r.data ? { feito: true, texto: 'Registrado' } : { feito: false, texto: 'A ficha não tem este desligamento' };
        if (id === 's2299') return s2299 ? { feito: s2299.situacao === 'aceito' || s2299.situacao === 'iob', texto: s2299.rotulo } : null;
        // S-2299 pelo IOB: o S-1210 também vai por lá (e é marcado à mão).
        if (id === 's1210' && s2299?.situacao !== 'iob') return s1210 ? { feito: s1210.situacao === 'aceito', texto: s1210.rotulo } : null;
        return null;
    };
    const feito = (id: PassoId) => automatico(id)?.feito ?? !!ef?.passos[id]?.feito;
    const concluidos = passos.filter(p => feito(p.id)).length;

    async function marcar(id: PassoId, valor: boolean) {
        if (!ef) return;
        setErro('');
        try { setEf(await marcarPasso(ef, id, valor, obs[id] ?? ef.passos[id]?.obs ?? '', usuario)); } catch (e) { setErro(`Não foi possível marcar: ${mensagemErro(e)}`); }
    }
    async function orientacoes() {
        try {
            const { orientacoesPdf } = await import('../../services/demissoes/orientacoesPdf');
            orientacoesPdf(ficha, r, seguro, { empresa: { razaoSocial: empresa.razaoSocial, cnpj: empresa.cnpj, codigoSage: empresa.codigoSage }, titulo: 'Orientações de desligamento', emitidoPor: usuario.email }, ef?.passos.seguro?.obs ?? '')
                .save(`orientacoes-desligamento-${(ficha.dados.nome || ficha.cpf).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.pdf`);
        } catch (e) { setErro(`PDF não gerado: ${(e as Error).message}`); }
    }
    const copiar = (rotulo: string, valor: string) => { navigator.clipboard?.writeText(valor).then(() => setCopiado(rotulo)).catch(() => setCopiado('')); };

    return (
        <section aria-label="Efetivação da rescisão" className="space-y-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Efetivação da rescisão · {concluidos} de {passos.length} passos</span>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={orientacoes}>Orientações ao trabalhador (PDF)</button>
                    <a className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" href={LINK_FGTS_DIGITAL} target="_blank" rel="noopener noreferrer">FGTS Digital ↗</a>
                </div>
            </div>
            <ol className="space-y-1">
                {passos.map(p => {
                    const auto = automatico(p.id);
                    const ok = feito(p.id);
                    const marcado = ef?.passos[p.id];
                    const vencido = !ok && !!p.prazo && hoje > p.prazo;
                    return (
                        <li key={p.id} className={`rounded border p-1.5 ${ok ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : vencido ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                            <div className="flex flex-wrap items-center gap-2">
                                {auto ? <span aria-hidden>{ok ? '✓' : '○'}</span>
                                    : <input type="checkbox" aria-label={p.titulo} checked={!!marcado?.feito} disabled={!ef} onChange={e => marcar(p.id, e.target.checked)} />}
                                <span className="font-medium">{p.titulo}</span>
                                {p.prazo && <span className={vencido ? 'font-medium text-red-700 dark:text-red-300' : 'text-slate-500'}>até {br(p.prazo)}{vencido ? ' (vencido)' : ''}</span>}
                                {auto && <span className="text-slate-500">· {auto.texto}</span>}
                                {marcado?.feito && <span className="text-slate-500">· marcado por {marcado.porEmail} em {new Date(marcado.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{marcado.obs ? ` · ${marcado.obs}` : ''}</span>}
                            </div>
                            <p className="text-slate-600 dark:text-slate-300">{p.detalhe}</p>
                            {!auto && !marcado?.feito && (
                                <input aria-label={`Observação de ${p.titulo}`} placeholder={p.id === 'seguro' ? 'Número do requerimento' : p.id === 'fgts' ? 'Data do pagamento da guia' : 'Observação (opcional)'} maxLength={300}
                                    className="mt-1 w-full rounded border border-slate-300 px-2 py-0.5 dark:border-slate-600 dark:bg-slate-900" value={obs[p.id] ?? ''} onChange={e => setObs(o => ({ ...o, [p.id]: e.target.value }))} />
                            )}
                            {p.id === 'seguro' && (
                                <div className="mt-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <label>Solicitação do trabalhador<select aria-label="Solicitação do seguro-desemprego" className="ml-1 rounded border border-slate-300 px-1 dark:border-slate-600 dark:bg-slate-900" value={solicitacao} onChange={e => setSolicitacao(Number(e.target.value) as Solicitacao)}>
                                            <option value={1}>1ª</option><option value={2}>2ª</option><option value={3}>3ª ou mais</option></select></label>
                                        <span className={seguro.cabe ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}>{seguro.motivo}</span>
                                        {seguro.mediaSalarios > 0 && <span className="text-slate-500">média dos 3 últimos salários: {reais(seguro.mediaSalarios)}</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" className="text-blue-700 underline dark:text-blue-300" onClick={() => setVerDados(v => !v)}>{verDados ? 'Esconder' : 'Dados para o Empregador Web'}</button>
                                        <a className="text-blue-700 underline dark:text-blue-300" href={LINK_EMPREGADOR_WEB} target="_blank" rel="noopener noreferrer">Abrir o Empregador Web ↗</a>
                                    </div>
                                    {verDados && (
                                        <table className="w-full"><tbody>{dadosEmpregadorWeb(ficha, r, { cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial }).map(([k, v]) => (
                                            <tr key={k} className="border-t border-slate-100 dark:border-slate-700"><td className="p-0.5 text-slate-500">{k}</td><td className="p-0.5">{v || <span className="text-amber-700 dark:text-amber-300">em branco na ficha</span>}</td>
                                                <td className="p-0.5">{v && <button type="button" className="text-blue-700 underline dark:text-blue-300" onClick={() => copiar(k, v)}>{copiado === k ? 'copiado' : 'copiar'}</button>}</td></tr>
                                        ))}</tbody></table>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
            {erro && <p role="alert" className="text-red-700 dark:text-red-300">{erro}</p>}
        </section>
    );
};

export default EfetivacaoRescisao;
