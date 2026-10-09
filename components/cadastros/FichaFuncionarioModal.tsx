// components/cadastros/FichaFuncionarioModal.tsx
//
// Ficha do funcionário com as abas do IOB Office (Dados, Ident. Adm.,
// Documentos, Outros, Dependentes) e o histórico de alterações. Cada campo
// mostra de onde veio: XML do eSocial ou edição manual.

import React, { useEffect, useState } from 'react';
import {
    ABAS, ROTULO, aplicarEdicao, defCampo, depNoEsocial, ehManual, idFuncionario, normalizarFicha, rotuloAlteracao, validarFicha,
    type CampoFicha, type Dependente, type FichaFuncionario,
} from '../../services/cadastros/funcionarios';
import { historico, mensagemErro, salvarFuncionario, excluirFuncionario, type RegistroAuditoria, type Usuario } from '../../services/cadastros/cadastrosService';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import { conferirHorasSemanais, descricaoJornada, type Horario } from '../../services/cadastros/horarios';
import { duracao, rotuloMotivo, type Afastamento } from '../../services/cadastros/afastamentos';
import type { AdesaoBeneficio, Beneficio } from '../../services/calculo/beneficios';

interface Props {
    ficha: FichaFuncionario;
    nova: boolean;
    sindicatos: Sindicato[];
    horarios?: Horario[];
    afastamentos?: Afastamento[];
    /** Benefícios da empresa (parâmetros da folha): a ficha marca a adesão e as vidas. */
    beneficios?: Beneficio[];
    usuario: Usuario;
    isAdmin: boolean;
    onFechar: () => void;
    onSalvo: () => void;
}

const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const DEP_VAZIO: Dependente = { tipo: '', nome: '', nascimento: '', cpf: '', irrf: 'N', salarioFamilia: 'N', pensao: 'N', cotaPensao: '', noEsocial: 'N' };
const formatarCpf = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);

const FichaFuncionarioModal: React.FC<Props> = ({ ficha, nova, sindicatos, horarios = [], afastamentos = [], beneficios = [], usuario, isAdmin, onFechar, onSalvo }) => {
    const [f, setF] = useState<FichaFuncionario>(ficha);
    const [aba, setAba] = useState<string>(ABAS[0].id);
    const [erros, setErros] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const [hist, setHist] = useState<RegistroAuditoria[] | null>(null);
    const [histErro, setHistErro] = useState('');
    const validacao = validarFicha(normalizarFicha(f));

    useEffect(() => {
        if (aba !== 'historico' || nova || hist) return;
        historico('funcionarios', ficha.id).then(setHist).catch(e => setHistErro(mensagemErro(e)));
    }, [aba, nova, hist, ficha.id]);

    const setCampo = (c: CampoFicha, v: string) => setF(x => ({ ...x, dados: { ...x.dados, [c]: v } }));
    const setDep = (i: number, campo: keyof Dependente, v: string) => setF(x => ({ ...x, dependentes: x.dependentes.map((d, j) => (j === i ? { ...d, [campo]: v } : d)) }));

    async function salvar() {
        const n = normalizarFicha(f);
        const v = validarFicha(n);
        if (v.erros.length) { setErros(v.erros); return; }
        const pronta = aplicarEdicao(nova ? null : ficha, { ...n, id: nova ? idFuncionario(n.empresaId, n.cpf, n.matriculaEsocial) : ficha.id }, usuario.email, new Date().toISOString().slice(0, 10));
        setSalvando(true); setErros([]);
        try { await salvarFuncionario(nova ? null : ficha, pronta, usuario); onSalvo(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    async function excluir() {
        if (!window.confirm(`Excluir a ficha de ${f.dados.nome || f.cpf}? A exclusão fica registrada no histórico.`)) return;
        setSalvando(true);
        try { await excluirFuncionario(ficha, usuario); onSalvo(); }
        catch (e) { setErros([mensagemErro(e)]); setSalvando(false); }
    }

    function campo(c: CampoFicha) {
        const def = defCampo(c);
        const valor = f.dados[c] ?? '';
        const origem = f.origens[c];
        let entrada: React.ReactNode;
        if (c === 'horario') {
            entrada = (
                <select className={inp} value={valor} onChange={e => setCampo(c, e.target.value)} aria-label={ROTULO[c]}>
                    <option value="">{horarios.length ? '—' : 'Nenhum horário cadastrado'}</option>
                    {valor && !horarios.some(h => h.codigo === valor) && <option value={valor}>{valor} (não cadastrado)</option>}
                    {horarios.map(h => <option key={h.id} value={h.codigo}>{h.codigo} · {h.descricao}</option>)}
                </select>
            );
        } else if (def.tipo === 'lista') {
            const opcoes = def.opcoes!;
            entrada = (
                <select className={inp} value={valor} onChange={e => setCampo(c, e.target.value)} aria-label={ROTULO[c]}>
                    <option value="">—</option>
                    {valor && !opcoes.some(([v]) => v === valor) && <option value={valor}>{valor} (fora da tabela)</option>}
                    {opcoes.map(([v, r]) => <option key={v} value={v}>{v === r ? v : `${v} - ${r}`}</option>)}
                </select>
            );
        } else if (def.tipo === 'longo') entrada = <textarea className={inp} rows={2} value={valor} onChange={e => setCampo(c, e.target.value)} aria-label={ROTULO[c]} />;
        else entrada = <input className={inp} type={def.tipo === 'data' ? 'date' : 'text'} value={valor} onChange={e => setCampo(c, e.target.value)} aria-label={ROTULO[c]} list={c === 'sindicato' ? 'lista-sindicatos' : undefined} />;
        const hor = c === 'horario' && valor ? horarios.find(h => h.codigo === valor) : undefined;
        const difHoras = c === 'horario' && hor ? conferirHorasSemanais(f.dados.horasSemanais, hor) : null;
        const sind = c === 'sindicato' && valor ? sindicatos.find(s => s.cnpj === valor.replace(/[.\-/\s]/g, '').toUpperCase()) : undefined;
        return (
            <label key={c} className={`block ${def.tipo === 'longo' ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{ROTULO[c]}</span>
                {entrada}
                {sind && <span className="block text-xs text-green-700 dark:text-green-400">{sind.nome}</span>}
                {hor && <span className="block text-xs text-slate-500 dark:text-slate-400">{descricaoJornada(hor)}</span>}
                {difHoras && <span className="block text-xs text-amber-700 dark:text-amber-400">{difHoras}</span>}
                {c === 'sindicato' && valor && !sind && <span className="block text-xs text-amber-700 dark:text-amber-400">Sindicato não cadastrado.</span>}
                {origem && <span className={`block truncate text-[11px] ${ehManual(origem) ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400'}`} title={origem}>{origem}</span>}
            </label>
        );
    }

    const adesoes = f.beneficios ?? [];
    const setAdesao = (id: string, m: Partial<AdesaoBeneficio> | null) => setF(x => {
        const atual = x.beneficios ?? [];
        const tem = atual.some(a => a.beneficioId === id);
        const lista = m === null ? atual.filter(a => a.beneficioId !== id)
            : tem ? atual.map(a => (a.beneficioId === id ? { ...a, ...m } : a)) : [...atual, { beneficioId: id, vidas: 1, ...m }];
        return { ...x, beneficios: lista };
    });
    const abas = [...ABAS.map(a => ({ id: a.id, titulo: a.titulo })), { id: 'dependentes', titulo: `Dependentes (${f.dependentes.length})` }, { id: 'beneficios', titulo: `Benefícios (${adesoes.length})` }, ...(nova ? [] : [{ id: 'afastamentos', titulo: `Afastamentos (${afastamentos.length})` }, { id: 'historico', titulo: 'Histórico' }])];
    const atual = ABAS.find(a => a.id === aba);

    return (
        <div role="dialog" aria-modal="true" aria-label="Ficha do funcionário" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-5xl rounded-xl bg-white shadow-xl dark:bg-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
                    <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Arquivos › Funcionários › Cadastro {nova ? '(nova ficha)' : ''}</p>
                        <h3 className="truncate text-lg font-semibold text-slate-800 dark:text-white">{f.dados.nome || 'Funcionário sem nome'}</h3>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={onFechar}>×</button>
                </div>

                <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-4 dark:border-slate-700">
                    <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">CPF</span>
                        {nova ? <input className={inp} value={f.cpf} onChange={e => setF({ ...f, cpf: e.target.value })} aria-label="CPF" /> : <p className="py-1.5 font-mono text-sm dark:text-white">{formatarCpf(f.cpf)}</p>}</label>
                    <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Matrícula do eSocial</span>
                        {nova ? <input className={inp} value={f.matriculaEsocial} onChange={e => setF({ ...f, matriculaEsocial: e.target.value })} aria-label="Matrícula do eSocial" /> : <p className="py-1.5 font-mono text-sm dark:text-white">{f.matriculaEsocial}</p>}</label>
                    <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Código no IOB</span>
                        <input className={inp} value={f.dados.codigoIob ?? ''} onChange={e => setCampo('codigoIob', e.target.value)} aria-label="Código no IOB" /></label>
                    <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Situação</span>
                        <select className={inp} value={f.situacao} onChange={e => setF({ ...f, situacao: e.target.value as FichaFuncionario['situacao'] })} aria-label="Situação">
                            <option value="ativo">Ativo</option><option value="desligado">Desligado</option>
                        </select></label>
                    {!nova && <p className="text-xs text-slate-500 sm:col-span-4 dark:text-slate-400">CPF e matrícula identificam o vínculo e não mudam. Vínculo errado: exclua (admin) e cadastre de novo.</p>}
                </div>

                {f.pendenciasImportacao.length > 0 && (
                    <details className="mx-4 mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                        <summary className="cursor-pointer font-medium">Pendências da última importação do eSocial ({f.pendenciasImportacao.length})</summary>
                        <ul className="mt-1 list-disc pl-5">{f.pendenciasImportacao.map(p => <li key={p}>{p}</li>)}</ul>
                    </details>
                )}

                <nav aria-label="Abas da ficha" className="mt-2 flex flex-wrap gap-1 border-b border-slate-200 px-4 dark:border-slate-700">
                    {abas.map(a => (
                        <button key={a.id} onClick={() => setAba(a.id)}
                            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${a.id === aba ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
                            {a.titulo}
                        </button>
                    ))}
                </nav>

                <div className="min-h-[18rem] p-4">
                    {atual && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{atual.campos.filter(c => c !== 'codigoIob').map(campo)}</div>}
                    {aba === 'identAdm' && !!f.historicoSalario?.length && (
                        <div className="mt-4 space-y-1 text-sm">
                            <p className="font-medium dark:text-white">Histórico de salário (eSocial: S-2200/S-2206; sem reajuste no eSocial, o do SAGE)</p>
                            <table className="text-xs dark:text-slate-200">
                                <thead><tr className="text-left text-slate-500 dark:text-slate-400"><th className="p-1">Desde</th><th className="p-1">Salário</th><th className="p-1">Evento</th></tr></thead>
                                <tbody>{f.historicoSalario.map(h => (
                                    <tr key={h.desde}><td className="p-1">{h.desde.split('-').reverse().join('/')}</td><td className="p-1">{Number(h.salario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{h.unidade && h.unidade !== '5' ? ` (unidade ${h.unidade})` : ''}</td><td className="p-1">{h.origem}</td></tr>
                                ))}</tbody>
                            </table>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Antes do último reajuste, o cálculo usa o salário da época: na folha, o do mês; nas férias, o do início do gozo; no 13º, o de dezembro (e, no adiantamento, o do mês anterior ao pagamento); na rescisão, o do desligamento. Vem do eSocial (ou do backup do SAGE: rsalfunc/salarios) a cada importação; não se edita aqui.</p>
                        </div>
                    )}

                    {aba === 'dependentes' && (
                        <div className="space-y-2">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left text-xs text-slate-500 dark:text-slate-400"><th className="p-1">Tipo (eSocial)</th><th className="p-1">Nome</th><th className="p-1">Nascimento</th><th className="p-1">CPF</th><th className="p-1">IRRF</th><th className="p-1">Sal.-família</th><th className="p-1" title="Recebe pensão alimentícia descontada do trabalhador (alimentando): vai no S-1210 pelo CPF.">Pensão</th><th className="p-1" title="Parte da pensão do mês, quando há mais de um alimentando.">Cota %</th><th className="p-1" title="Cadastrado no eSocial (S-2200/S-2205). Se não, o S-1210 informa os dados dele.">No eSocial</th><th /></tr></thead>
                                    <tbody>
                                        {f.dependentes.map((d, i) => (
                                            <tr key={i}>
                                                <td className="p-1"><input className={`${inp} w-16`} value={d.tipo} onChange={e => setDep(i, 'tipo', e.target.value)} aria-label={`Tipo do dependente ${i + 1}`} /></td>
                                                <td className="p-1"><input className={inp} value={d.nome} onChange={e => setDep(i, 'nome', e.target.value)} aria-label={`Nome do dependente ${i + 1}`} /></td>
                                                <td className="p-1"><input className={inp} type="date" value={d.nascimento} onChange={e => setDep(i, 'nascimento', e.target.value)} aria-label={`Nascimento do dependente ${i + 1}`} /></td>
                                                <td className="p-1"><input className={inp} value={d.cpf} onChange={e => setDep(i, 'cpf', e.target.value)} aria-label={`CPF do dependente ${i + 1}`} /></td>
                                                {(['irrf', 'salarioFamilia'] as const).map(k => (
                                                    <td key={k} className="p-1"><select className={inp} value={d[k]} onChange={e => setDep(i, k, e.target.value)} aria-label={`${k === 'irrf' ? 'IRRF' : 'Salário-família'} do dependente ${i + 1}`}><option value="S">Sim</option><option value="N">Não</option></select></td>
                                                ))}
                                                <td className="p-1"><select className={inp} value={d.pensao === 'S' ? 'S' : 'N'} onChange={e => setDep(i, 'pensao', e.target.value)} aria-label={`Pensão do dependente ${i + 1}`}><option value="S">Sim</option><option value="N">Não</option></select></td>
                                                <td className="p-1"><input className={`${inp} w-16`} inputMode="decimal" disabled={d.pensao !== 'S'} value={d.cotaPensao ?? ''} onChange={e => setDep(i, 'cotaPensao', e.target.value)} aria-label={`Cota da pensão do dependente ${i + 1}`} /></td>
                                                <td className="p-1"><select className={inp} value={depNoEsocial(ficha, d) ? 'S' : 'N'} onChange={e => setDep(i, 'noEsocial', e.target.value)} aria-label={`No eSocial o dependente ${i + 1}`}><option value="S">Sim</option><option value="N">Não</option></select></td>
                                                <td className="p-1"><button className="text-xs text-red-600 underline" onClick={() => setF({ ...f, dependentes: f.dependentes.filter((_, j) => j !== i) })}>Remover</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {!f.dependentes.length && <p className="text-sm text-slate-500">Nenhum dependente.</p>}
                            <button className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-white" onClick={() => setF({ ...f, dependentes: [...f.dependentes, { ...DEP_VAZIO }] })}>Adicionar dependente</button>
                            {f.origens.dependentes && <p className="text-[11px] text-slate-400">{f.origens.dependentes}</p>}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Pensão alimentícia: marque quem recebe (com CPF). Com mais de um alimentando, a cota (%) de cada um divide a pensão do mês no S-1210. No mesmo mês, quem recebe pensão não é deduzido também como dependente (Lei 9.250/1995, art. 35, § 4º): o filho alimentando fica com IRRF = Não e Pensão = Sim.</p>
                        </div>
                    )}

                    {aba === 'beneficios' && (
                        <div className="space-y-2 text-sm dark:text-slate-100">
                            {!beneficios.length && !adesoes.length && <p className="text-slate-500">A empresa não tem benefícios cadastrados. Cadastre em Cálculo › folha mensal › "Benefícios".</p>}
                            {(beneficios.length > 0 || adesoes.length > 0) && (
                                <table className="w-full text-xs">
                                    <thead className="text-left text-slate-500"><tr><th className="p-1">Tem</th><th className="p-1">Benefício</th><th className="p-1">Valor por vida</th><th className="p-1">Vidas</th><th className="p-1">Desde (mês)</th><th className="p-1">Até (mês)</th></tr></thead>
                                    <tbody>{[...beneficios, ...adesoes.filter(a => !beneficios.some(b => b.id === a.beneficioId)).map(a => ({ id: a.beneficioId, nome: `(benefício removido da empresa: ${a.beneficioId})`, valor: 0, ativo: false } as Beneficio))].map(b => {
                                        const a = adesoes.find(x => x.beneficioId === b.id);
                                        return (
                                            <tr key={b.id} className="border-t border-slate-100 dark:border-slate-700">
                                                <td className="p-1"><input type="checkbox" aria-label={`Tem ${b.nome}`} checked={!!a} onChange={e => setAdesao(b.id, e.target.checked ? {} : null)} /></td>
                                                <td className="p-1">{b.nome}{b.codigoIob ? <span className="text-slate-400"> · evento {b.codigoIob}</span> : null}{!b.ativo && <span className="text-amber-700"> · inativo</span>}</td>
                                                <td className="p-1">{b.valor ? (b.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                                                <td className="p-1"><input aria-label={`Vidas de ${b.nome}`} className="w-16 rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900" type="number" min={1} max={20} disabled={!a} value={a?.vidas ?? ''}
                                                    onChange={e => setAdesao(b.id, { vidas: Number(e.target.value) })} /></td>
                                                <td className="p-1"><input aria-label={`Desde de ${b.nome}`} type="month" className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900" disabled={!a} value={a?.desde ?? ''}
                                                    onChange={e => setAdesao(b.id, { desde: e.target.value || undefined })} /></td>
                                                <td className="p-1"><input aria-label={`Até de ${b.nome}`} type="month" className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900" disabled={!a} value={a?.ate ?? ''}
                                                    onChange={e => setAdesao(b.id, { ate: e.target.value || undefined })} /></td>
                                            </tr>
                                        );
                                    })}</tbody>
                                </table>
                            )}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Valor no mês = valor por vida × vidas, lançado pelo motor em toda folha mensal entre "desde" e "até" (em branco, sem limite).</p>
                        </div>
                    )}

                    {aba === 'afastamentos' && (
                        <div className="space-y-2 text-sm">
                            {!afastamentos.length && <p className="text-slate-500">Nenhum afastamento. Lance em Cadastros › Afastamentos.</p>}
                            {afastamentos.length > 0 && (
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left text-xs text-slate-500 dark:text-slate-400"><th className="p-1">Início</th><th className="p-1">Término</th><th className="p-1">Dias</th><th className="p-1">Motivo</th></tr></thead>
                                    <tbody>{[...afastamentos].sort((a, b) => b.dtInicio.localeCompare(a.dtInicio)).map(a => (
                                        <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700 dark:text-slate-100">
                                            <td className="p-1">{a.dtInicio.split('-').reverse().join('/')}</td>
                                            <td className="p-1">{a.dtFim ? a.dtFim.split('-').reverse().join('/') : 'em aberto'}</td>
                                            <td className="p-1">{duracao(a) ?? '—'}</td>
                                            <td className="p-1 text-xs">{rotuloMotivo(a.motivo)}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {aba === 'historico' && (
                        <div className="space-y-2 text-sm">
                            {histErro && <p className="text-red-600">{histErro}</p>}
                            {!hist && !histErro && <p className="text-slate-500">Carregando…</p>}
                            {hist?.length === 0 && <p className="text-slate-500">Sem registros.</p>}
                            {hist?.map(h => (
                                <details key={h.id} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                                    <summary className="cursor-pointer dark:text-white">{h.quando ? h.quando.toLocaleString('pt-BR') : '—'} · {h.acao} · {h.autorEmail} · {h.totalAlteracoes} campo(s)</summary>
                                    {h.origem && <p className="mt-1 text-xs text-slate-500">{h.origem}</p>}
                                    <ul className="mt-1 space-y-0.5 text-xs dark:text-slate-300">{h.alteracoes.map((a, i) => <li key={i}><strong>{rotuloAlteracao(a.campo)}:</strong> {a.de || '∅'} → {a.para || '∅'}</li>)}</ul>
                                </details>
                            ))}
                        </div>
                    )}
                </div>

                <datalist id="lista-sindicatos">{sindicatos.map(s => <option key={s.cnpj} value={s.cnpj}>{s.nome}</option>)}</datalist>

                <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-700">
                    {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
                    {validacao.avisos.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Atenção (não impede gravar): {validacao.avisos.join(' ')}</p>}
                    <div className="flex flex-wrap justify-between gap-2">
                        <div>{!nova && isAdmin && <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:text-red-300" disabled={salvando} onClick={excluir}>Excluir ficha</button>}</div>
                        <div className="flex gap-2">
                            <button className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={onFechar}>Cancelar</button>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? 'Gravando…' : 'Gravar'}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FichaFuncionarioModal;
