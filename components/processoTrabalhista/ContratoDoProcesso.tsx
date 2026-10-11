// components/processoTrabalhista/ContratoDoProcesso.tsx
//
// O contrato do trabalhador no S-2500: tipo (1 a 7), indicativos da decisão, mudança de categoria ou natureza da
// atividade e, quando o contrato não está no eSocial (reconhecimento de vínculo, vínculo anterior ao eSocial ou TSVE
// sem S-2300), os dados do vínculo que vão no próprio evento.

import React from 'react';
import { centavosDeTexto } from '../../services/cadastros/documentos';
import {
    contratoVazio, DURACAO, indContrDe, MOTIVOS_TSV, PENSAO_ALIM, TEMPO_PARCIAL, TIPOS_CONTRATO, tpContrDe, UNIDADES_SALARIO,
    type ContratoNovo, type MudancaCategoria, type TpContrProc, type TrabalhadorProcesso,
} from '../../services/processoTrabalhista/processoTrabalhista';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600';

const Opcoes: React.FC<{ mapa: Record<string, string>; vazio?: boolean }> = ({ mapa, vazio }) => (
    <>{vazio && <option value="">—</option>}{Object.entries(mapa).map(([k, r]) => <option key={k} value={k}>{k} · {r}</option>)}</>
);

const Marca: React.FC<{ rotulo: string; valor?: 'S' | 'N'; onChange: (v: 'S' | 'N') => void }> = ({ rotulo, valor, onChange }) => (
    <label className="flex items-center gap-1"><input type="checkbox" aria-label={rotulo} checked={valor === 'S'} onChange={e => onChange(e.target.checked ? 'S' : 'N')} />{rotulo}</label>
);

const ContratoDoProcesso: React.FC<{ t: TrabalhadorProcesso; muda: (x: Partial<TrabalhadorProcesso>) => void }> = ({ t, muda }) => {
    const tp = tpContrDe(t);
    const ind = indContrDe(t);
    const c = t.contrato ?? contratoVazio();
    const mudaC = (x: Partial<ContratoNovo>) => muda({ contrato: { ...c, ...x } });
    const mud = t.mudancas ?? [];
    const mudaM = (i: number, x: Partial<MudancaCategoria>) => muda({ mudancas: mud.map((m, j) => (j === i ? { ...m, ...x } : m)) });
    const nomeT = t.nome || t.cpf;
    const data = (rotulo: string, valor: string, set: (v: string) => void) => (
        <label>{rotulo}<input aria-label={`${rotulo} de ${nomeT}`} type="date" className={`block ${inp}`} value={valor} onChange={e => set(e.target.value)} /></label>
    );

    return (
        <div className="space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
            <div className="flex flex-wrap items-end gap-3">
                <label>Tipo de contrato<select aria-label={`Tipo de contrato de ${nomeT}`} className={`block ${inp}`} value={tp} onChange={e => muda({ tpContr: e.target.value as TpContrProc, contrato: ['5', '6', '7'].includes(e.target.value) ? t.contrato ?? contratoVazio() : t.contrato })}>
                    <Opcoes mapa={TIPOS_CONTRATO} />
                </select></label>
                {tp === '6' && (
                    <label>Está no eSocial (S-2300)?<select aria-label={`TSVE no eSocial de ${nomeT}`} className={`block ${inp}`} value={ind} onChange={e => muda({ indContr: e.target.value as 'S' | 'N' })}>
                        <option value="S">Sim</option><option value="N">Não</option>
                    </select></label>
                )}
                {(tp === '2' || tp === '4') && data('Admissão original', t.dtAdmOrig ?? '', v => muda({ dtAdmOrig: v }))}
                <label>Categoria<input aria-label={`Categoria de ${nomeT}`} className={`block w-16 ${inp}`} value={t.codCateg ?? ''} onChange={e => muda({ codCateg: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
                <label>Grau de exposição<select aria-label={`Grau de exposição de ${nomeT}`} className={`block ${inp}`} value={t.grauExp ?? '1'} onChange={e => muda({ grauExp: e.target.value })}>
                    {['1', '2', '3', '4'].map(g => <option key={g} value={g}>{g}</option>)}
                </select></label>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
                {ind === 'S' && tp !== '6' && <Marca rotulo="Reintegração" valor={t.indReint} onChange={v => muda({ indReint: v })} />}
                <Marca rotulo="Nova categoria" valor={t.indCateg} onChange={v => muda({ indCateg: v, mudancas: v === 'S' && !mud.length ? [{ codCateg: t.codCateg ?? '', natAtividade: '', data: '' }] : mud })} />
                <Marca rotulo="Nova natureza da atividade" valor={t.indNatAtiv} onChange={v => muda({ indNatAtiv: v, mudancas: v === 'S' && !mud.length ? [{ codCateg: t.codCateg ?? '', natAtividade: '', data: '' }] : mud })} />
                {ind === 'S' && <Marca rotulo="Novo motivo de desligamento" valor={t.indMotDeslig} onChange={v => muda({ indMotDeslig: v })} />}
                <label className="flex items-center gap-1"><input type="checkbox" aria-label="Indenização do seguro-desemprego" checked={!!t.indenSD} onChange={e => muda({ indenSD: e.target.checked })} />Indenização do seguro-desemprego</label>
                <label className="flex items-center gap-1"><input type="checkbox" aria-label="Indenização do abono salarial" checked={!!t.indenAbono} onChange={e => muda({ indenAbono: e.target.checked })} />Indenização do abono salarial</label>
                {t.indenAbono && <label>Anos-base<input aria-label={`Anos-base do abono de ${nomeT}`} placeholder="2023, 2024" className={`ml-1 w-28 ${inp}`} value={(t.anosAbono ?? []).join(', ')} onChange={e => muda({ anosAbono: e.target.value.split(/[^\d]+/).filter(Boolean) })} /></label>}
            </div>

            {(t.indCateg === 'S' || t.indNatAtiv === 'S') && (
                <div className="space-y-1">
                    {mud.map((m, i) => (
                        <div key={i} className="flex flex-wrap items-end gap-2">
                            <label>Nova categoria<input aria-label="Categoria da mudança" className={`block w-16 ${inp}`} value={m.codCateg} onChange={e => mudaM(i, { codCateg: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
                            <label>Natureza<select aria-label="Natureza da mudança" className={`block ${inp}`} value={m.natAtividade} onChange={e => mudaM(i, { natAtividade: e.target.value as MudancaCategoria['natAtividade'] })}><option value="">—</option><option value="1">Urbana</option><option value="2">Rural</option></select></label>
                            <label>A partir de<input aria-label="Data da mudança" type="date" className={`block ${inp}`} value={m.data} onChange={e => mudaM(i, { data: e.target.value })} /></label>
                            <button className={btn} onClick={() => muda({ mudancas: mud.filter((_, j) => j !== i) })}>Tirar</button>
                        </div>
                    ))}
                    <button className={btn} onClick={() => muda({ mudancas: [...mud, { codCateg: t.codCateg ?? '', natAtividade: '', data: '' }] })}>+ Mudança</button>
                </div>
            )}

            {ind === 'N' && (
                <div className="space-y-2 rounded border border-dashed border-slate-300 p-2 dark:border-slate-600">
                    <p className="text-xs text-slate-600 dark:text-slate-300">O contrato não está no eSocial: os dados do vínculo vão no próprio S-2500. A matrícula é nova (não pode começar com "eSocial").</p>
                    <div className="flex flex-wrap items-end gap-3">
                        <label>Nome<input aria-label={`Nome de ${t.cpf || 'trabalhador'}`} className={`block w-56 ${inp}`} value={t.nome} onChange={e => muda({ nome: e.target.value.toUpperCase() })} /></label>
                        {data('Nascimento', t.dtNascto ?? '', v => muda({ dtNascto: v }))}
                        <label>Matrícula nova<input aria-label={`Matrícula nova de ${nomeT}`} className={`block w-32 ${inp}`} value={t.matricula} onChange={e => muda({ matricula: e.target.value })} /></label>
                        {tp === '6' && data('Início', t.dtInicio ?? '', v => muda({ dtInicio: v }))}
                        <label>CBO<input aria-label={`CBO de ${nomeT}`} className={`block w-20 ${inp}`} value={c.codCBO} onChange={e => mudaC({ codCBO: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>
                        <label>Natureza<select aria-label={`Natureza da atividade de ${nomeT}`} className={`block ${inp}`} value={c.natAtividade} onChange={e => mudaC({ natAtividade: e.target.value as ContratoNovo['natAtividade'] })}><option value="">—</option><option value="1">Urbana</option><option value="2">Rural</option></select></label>
                        <label>Salário fixo<input aria-label={`Salário de ${nomeT}`} className={`block w-28 text-right ${inp}`} inputMode="decimal" defaultValue={c.salario ? (c.salario / 100).toFixed(2).replace('.', ',') : ''} onBlur={e => mudaC({ salario: centavosDeTexto(e.target.value) ?? 0 })} /></label>
                        <label>Unidade<select aria-label={`Unidade do salário de ${nomeT}`} className={`block ${inp}`} value={c.undSalFixo} onChange={e => mudaC({ undSalFixo: e.target.value })}><Opcoes mapa={UNIDADES_SALARIO} /></select></label>
                        {(c.undSalFixo === '6' || c.undSalFixo === '7') && <label>Salário variável<input aria-label={`Salário variável de ${nomeT}`} className={`block w-48 ${inp}`} value={c.dscSalVar} onChange={e => mudaC({ dscSalVar: e.target.value })} /></label>}
                    </div>
                    {tp === '6' ? (
                        <div className="flex flex-wrap items-end gap-3">
                            {data('Término', c.dtTermTsv, v => mudaC({ dtTermTsv: v }))}
                            {t.codCateg === '721' && <label>Motivo do término<select aria-label={`Motivo do término de ${nomeT}`} className={`block ${inp}`} value={c.mtvDesligTSV} onChange={e => mudaC({ mtvDesligTSV: e.target.value })}><Opcoes mapa={MOTIVOS_TSV} vazio /></select></label>}
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-end gap-3">
                            <label>Regime<select aria-label={`Regime trabalhista de ${nomeT}`} className={`block ${inp}`} value={c.tpRegTrab} onChange={e => mudaC({ tpRegTrab: e.target.value as ContratoNovo['tpRegTrab'] })}><option value="1">CLT</option><option value="2">Estatutário</option></select></label>
                            <label>Previdência<select aria-label={`Regime previdenciário de ${nomeT}`} className={`block ${inp}`} value={c.tpRegPrev} onChange={e => mudaC({ tpRegPrev: e.target.value as ContratoNovo['tpRegPrev'] })}><option value="1">RGPS</option><option value="2">RPPS</option><option value="3">No exterior</option></select></label>
                            {data('Admissão', c.dtAdm, v => mudaC({ dtAdm: v }))}
                            {c.tpRegTrab === '1' && (
                                <>
                                    <label>Tempo parcial<select aria-label={`Tempo parcial de ${nomeT}`} className={`block ${inp}`} value={c.tmpParc} onChange={e => mudaC({ tmpParc: e.target.value })}><Opcoes mapa={TEMPO_PARCIAL} /></select></label>
                                    <label>Duração<select aria-label={`Duração do contrato de ${nomeT}`} className={`block ${inp}`} value={c.duracao} onChange={e => mudaC({ duracao: e.target.value as ContratoNovo['duracao'] })}><Opcoes mapa={DURACAO} /></select></label>
                                    {c.duracao === '2' && data('Término do prazo', c.dtTerm, v => mudaC({ dtTerm: v }))}
                                    {c.duracao !== '1' && <label>Cláusula assecuratória<select aria-label={`Cláusula assecuratória de ${nomeT}`} className={`block ${inp}`} value={c.clauAssec} onChange={e => mudaC({ clauAssec: e.target.value as ContratoNovo['clauAssec'] })}><option value="">—</option><option value="S">Sim</option><option value="N">Não</option></select></label>}
                                    {c.duracao === '3' && <label>Fato determinante<input aria-label={`Fato determinante de ${nomeT}`} className={`block w-40 ${inp}`} value={c.objDet} onChange={e => mudaC({ objDet: e.target.value })} /></label>}
                                </>
                            )}
                            {data('Desligamento', c.dtDeslig, v => mudaC({ dtDeslig: v }))}
                            <label>Motivo (Tabela 19)<input aria-label={`Motivo do desligamento de ${nomeT}`} className={`block w-14 ${inp}`} value={c.mtvDeslig} onChange={e => mudaC({ mtvDeslig: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
                            {data('Fim projetado do aviso', c.dtProjFimAPI, v => mudaC({ dtProjFimAPI: v }))}
                            {c.tpRegTrab === '1' && <label>Pensão alimentícia<select aria-label={`Pensão alimentícia de ${nomeT}`} className={`block ${inp}`} value={c.pensAlim} onChange={e => mudaC({ pensAlim: e.target.value })}><Opcoes mapa={PENSAO_ALIM} /></select></label>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ContratoDoProcesso;
