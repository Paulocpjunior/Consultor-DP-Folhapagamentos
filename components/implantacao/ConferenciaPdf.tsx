import React, { useState } from 'react';
import { CAMPOS, type Cadastro, type Campo } from '../../services/implantacao/implantacao';
import { compararFicha, conferirIdentidade, type FichaExtraida } from '../../services/implantacao/fichaPdf';
export default function ConferenciaPdf({ ficha, cadastro, cnpj, nome, onAplicar }: {
    ficha: FichaExtraida; cadastro: Cadastro; cnpj: string; nome: string;
    onAplicar: (campos: { campo: Campo; valor: string }[], motivo: string) => void;
}) {
    const comparacao = compararFicha(ficha, cadastro);
    const erros = conferirIdentidade(ficha, cadastro, cnpj);
    const [campos, setCampos] = useState<Campo[]>(comparacao.filter(c => c.situacao === 'complemento').map(c => c.campo));
    const [confirmado, setConfirmado] = useState(false);
    const [motivo, setMotivo] = useState('');
    const divergente = comparacao.some(c => c.situacao === 'divergencia' && campos.includes(c.campo));
    return <div className="my-4 space-y-3 rounded border border-blue-300 p-4">
        <h5 className="font-bold">Unificar ficha PDF e eSocial</h5><p className="text-sm">{nome} · CPF {ficha.cpf || 'não identificado'} · matrícula {ficha.matricula || 'não identificada'}</p>
        {!!erros.length ? <div role="alert" className="text-sm text-red-700">{erros.map(e => <p key={e}>{e}</p>)}<p>Nenhum campo pode ser aplicado a este vínculo.</p></div> : <>
            <p className="text-sm">Empresa, CPF e matrícula correspondem. Campos divergentes exigem escolha e justificativa; o XML original é preservado.</p>
            <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Aplicar</th><th>Campo</th><th>Cadastro atual</th><th>Ficha PDF</th><th>Situação</th></tr></thead><tbody>{comparacao.map(c => <tr key={c.campo} className="border-t"><td className="p-2"><input aria-label={`Aplicar ${CAMPOS[c.campo]}`} type="checkbox" disabled={c.situacao === 'igual'} checked={c.situacao !== 'igual' && campos.includes(c.campo)} onChange={e => { setCampos(e.target.checked ? [...campos, c.campo] : campos.filter(k => k !== c.campo)); setConfirmado(false); }} /></td><td className="p-2">{CAMPOS[c.campo]}</td><td className="p-2">{c.atual || 'Não informado'}</td><td className="p-2">{c.valor}</td><td className="p-2">{c.situacao === 'igual' ? 'Coincide' : c.situacao === 'divergencia' ? 'Divergência' : 'Complemento'}</td></tr>)}</tbody></table></div>
            {divergente && <label className="block text-sm">Justificativa para substituir dados divergentes<input className="block w-full rounded border p-2 text-slate-900" maxLength={500} value={motivo} onChange={e => { setMotivo(e.target.value); setConfirmado(false); }} /></label>}
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />Conferi os campos selecionados e confirmo a união neste vínculo.</label>
            <button className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={!confirmado || !campos.length || (divergente && !motivo.trim())} onClick={() => { onAplicar(comparacao.filter(c => c.situacao !== 'igual' && campos.includes(c.campo)).map(({ campo, valor }) => ({ campo, valor })), divergente ? motivo.trim() : 'Complemento de campo ausente; ficha e identidade conferidas.'); setCampos([]); setConfirmado(false); }}>Aplicar campos conferidos</button>
        </>}
        {ficha.avisos.map(a => <p key={a} className="text-xs text-slate-500">{a}</p>)}
    </div>;
}
