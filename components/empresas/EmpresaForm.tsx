import React, { useState, useEffect } from 'react';
import { consultarCnpj, validaCnpj, formatCnpj } from '../../services/brasilApiService';
import { criarEmpresa, atualizarEmpresa } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { UFS } from '../../services/cadastros/tabelasLegais';
import { listarSindicatos } from '../../services/cadastros/cadastrosService';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import type { User } from '../../types';

interface Props {
    currentUser: User;
    empresaParaEditar?: Empresa | null;
    onSalvo: () => void;
    onCancelar: () => void;
}

const EmpresaForm: React.FC<Props> = ({ currentUser, empresaParaEditar, onSalvo, onCancelar }) => {
    const editando = !!empresaParaEditar;
    const [cnpj, setCnpj]                 = useState(empresaParaEditar?.cnpj ?? '');
    const [razaoSocial, setRazaoSocial]   = useState(empresaParaEditar?.razaoSocial ?? '');
    const [nomeFantasia, setNomeFantasia] = useState(empresaParaEditar?.nomeFantasia ?? '');
    const [codigoSage, setCodigoSage]     = useState(empresaParaEditar?.codigoSage ?? '');
    const [uf, setUf]                     = useState(empresaParaEditar?.uf ?? '');
    const [municipio, setMunicipio]       = useState(empresaParaEditar?.municipio ?? '');
    const [sindicatos, setSindicatos]     = useState<string[]>(empresaParaEditar?.sindicatos ?? []);
    const [cadastroSind, setCadastroSind] = useState<Sindicato[] | null>(null);
    useEffect(() => { listarSindicatos().then(setCadastroSind).catch(() => setCadastroSind([])); }, []);
    const [busy, setBusy]                 = useState(false);
    const [erro, setErro]                 = useState('');
    const [info, setInfo]                 = useState('');

    useEffect(() => {
        if (empresaParaEditar) {
            setCnpj(formatCnpj(empresaParaEditar.cnpj));
            setRazaoSocial(empresaParaEditar.razaoSocial);
            setNomeFantasia(empresaParaEditar.nomeFantasia);
            setCodigoSage(empresaParaEditar.codigoSage);
            setUf(empresaParaEditar.uf ?? '');
            setMunicipio(empresaParaEditar.municipio ?? '');
            setSindicatos(empresaParaEditar.sindicatos ?? []);
        }
    }, [empresaParaEditar]);

    const consultar = async () => {
        setErro(''); setInfo('');
        if (!validaCnpj(cnpj)) { setErro('CNPJ invalido.'); return; }
        setBusy(true);
        try {
            const dados = await consultarCnpj(cnpj);
            setRazaoSocial(dados.razao_social ?? '');
            setNomeFantasia(dados.nome_fantasia ?? dados.razao_social ?? '');
            if (dados.uf && UFS.includes(dados.uf)) setUf(dados.uf);
            if (dados.municipio) setMunicipio(dados.municipio);
            setInfo('OK ' + dados.razao_social + (dados.municipio ? ' - ' + dados.municipio + '/' + dados.uf : ''));
        } catch (e: any) {
            setErro(e?.message ?? 'Erro ao consultar CNPJ.');
        } finally {
            setBusy(false);
        }
    };

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro(''); setInfo('');
        if (!validaCnpj(cnpj)) { setErro('CNPJ invalido.'); return; }
        if (!razaoSocial.trim()) { setErro('Razao social e obrigatoria.'); return; }
        if (!nomeFantasia.trim()) { setErro('Nome fantasia e obrigatorio.'); return; }
        if (!/^\d{1,4}$/.test(codigoSage)) { setErro('Codigo SAGE deve ter de 1 a 4 digitos.'); return; }

        setBusy(true);
        try {
            if (editando && empresaParaEditar) {
                await atualizarEmpresa(empresaParaEditar.id, { cnpj, razaoSocial, nomeFantasia, codigoSage, uf, municipio, sindicatos });
            } else {
                await criarEmpresa((currentUser as any).uid, { cnpj, razaoSocial, nomeFantasia, codigoSage, uf, municipio, sindicatos });
            }
            onSalvo();
        } catch (e: any) {
            setErro(e?.message ?? 'Erro ao salvar empresa.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={salvar} className="space-y-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <h3 className="font-semibold text-slate-800 dark:text-white">
                {editando ? 'Editar empresa' : 'Nova empresa'}
            </h3>

            <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">CNPJ</label>
                <div className="flex gap-2">
                    <input type="text" value={cnpj}
                        onChange={(e) => setCnpj(e.target.value)}
                        onBlur={(e) => { const f = formatCnpj(e.target.value); if (f) setCnpj(f); }}
                        placeholder="00.000.000/0000-00"
                        disabled={editando}
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 disabled:bg-slate-100 dark:disabled:bg-slate-800 text-slate-800 dark:text-white rounded" />
                    <button type="button" onClick={consultar} disabled={busy || editando}
                        className="px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded disabled:opacity-50">
                        Consultar
                    </button>
                </div>
                {editando && <p className="text-xs text-slate-500 mt-1">CNPJ nao pode ser alterado.</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Razao social</label>
                    <input type="text" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Nome fantasia</label>
                    <input type="text" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded" />
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Codigo SAGE (4 digitos)</label>
                <input type="text" value={codigoSage}
                    onChange={(e) => setCodigoSage(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0229" maxLength={4}
                    className="w-32 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1" htmlFor="empresa-uf">UF do local de trabalho</label>
                    <select id="empresa-uf" value={uf} onChange={(e) => setUf(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded">
                        <option value="">—</option>
                        {UFS.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1" htmlFor="empresa-municipio">Município</label>
                    <input id="empresa-municipio" type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded" />
                </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">A UF decide o salário mínimo estadual (piso regional, como o de São Paulo) conferido na folha.</p>

            <fieldset>
                <legend className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Sindicatos da categoria (convenção coletiva)</legend>
                {!cadastroSind && <p className="text-xs text-slate-500">Carregando os sindicatos…</p>}
                {cadastroSind?.length === 0 && <p className="text-xs text-slate-500">Nenhum sindicato no cadastro (Cadastros › Sindicatos).</p>}
                <div className="max-h-40 space-y-1 overflow-auto">
                    {cadastroSind?.map(s => (
                        <label key={s.cnpj} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input type="checkbox" checked={sindicatos.includes(s.cnpj)} onChange={(e) => setSindicatos(x => e.target.checked ? [...x, s.cnpj] : x.filter(c => c !== s.cnpj))} aria-label={`Sindicato ${s.nome}`} />
                            {s.nome}{s.dataBase ? ` · data-base ${s.dataBase}` : ''}
                        </label>
                    ))}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A folha confere pisos, reajuste da data-base, horas extras e obrigações pela convenção deles. Funcionário de categoria diferenciada: informe o sindicato na ficha.</p>
            </fieldset>

            {info && <p className="text-sm text-green-700 dark:text-green-400">{info}</p>}
            {erro && <p className="text-sm text-red-700 dark:text-red-400">{erro}</p>}

            <div className="flex gap-2 pt-2">
                <button type="submit" disabled={busy}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium">
                    {busy ? 'Salvando...' : (editando ? 'Salvar alteracoes' : 'Salvar empresa')}
                </button>
                <button type="button" onClick={onCancelar}
                    className="px-4 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded">
                    Cancelar
                </button>
            </div>
        </form>
    );
};

export default EmpresaForm;
