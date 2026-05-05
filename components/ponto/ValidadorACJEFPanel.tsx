// components/ponto/ValidadorACJEFPanel.tsx
//
// Painel de VALIDACAO TECNICA do parser ACJEF.
// NAO envia eventos pro IOB SAGE. So mostra o que o parser leu do arquivo.
// Ferramenta de diagnostico pra confirmar que o schema da Portaria 1510 esta
// alinhado com o arquivo real do cliente.

import React, { useState, useEffect, useCallback } from 'react';
import type { User } from '../../types';
import type { Empresa } from '../../services/empresas/empresasTypes';
import {
  listarMinhasEmpresas,
  listarTodasEmpresas,
} from '../../services/empresas/empresasService';
import { buscarModelo } from '../../services/ponto/pontoModelosService';
import { buscarLayout } from '../../services/ponto/pontoLayoutsService';
import {
  parsearArquivoFixedWidth,
  decodeBuffer,
} from '../../services/ponto/pontoFixedWidthParser';
import type {
  ResultadoParsingPonto,
  ModeloPonto,
  LayoutPonto,
} from '../../types/ponto';

const MODELO_ID_PADRAO = 'acjef_p1510_v1';

interface Props {
  currentUser: User;
}

const ValidadorACJEFPanel: React.FC<Props> = ({ currentUser }) => {
  const [carregandoCtx, setCarregandoCtx] = useState(true);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaCnpj, setEmpresaCnpj] = useState<string>('');
  const [modelo, setModelo] = useState<ModeloPonto | null>(null);
  const [layout, setLayout] = useState<LayoutPonto | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoParsingPonto | null>(null);
  const [erroSetup, setErroSetup] = useState<string | null>(null);

  // ----- Carregar contexto: empresas + modelo padrao -----
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const role = (currentUser as any)?.role;
        const isAdmin = role === 'admin' || role === 'owner';
        const fnEmpresas = isAdmin
          ? listarTodasEmpresas()
          : listarMinhasEmpresas((currentUser as any)?.uid);
        const [emps, mod] = await Promise.all([fnEmpresas, buscarModelo(MODELO_ID_PADRAO)]);
        if (!ativo) return;
        setEmpresas(emps || []);
        if (!mod) {
          setErroSetup(
            `Modelo "${MODELO_ID_PADRAO}" nao encontrado no Firestore. Cadastre o modelo (rodar seed-ponto.mjs) antes de usar este validador.`
          );
        } else {
          setModelo(mod);
        }
      } catch (e: any) {
        if (!ativo) return;
        setErroSetup(`Erro ao carregar contexto: ${e?.message ?? String(e)}`);
      } finally {
        if (ativo) setCarregandoCtx(false);
      }
    })();
    return () => { ativo = false; };
  }, [currentUser]);

  // ----- Recarregar layout quando empresa muda -----
  useEffect(() => {
    if (!empresaCnpj) { setLayout(null); return; }
    const empresa = empresas.find((e) => (e as any).cnpj === empresaCnpj);
    if (!empresa) { setLayout(null); return; }
    const sage =
      (empresa as any).codigoSage ||
      (empresa as any).cadastroSAGE ||
      (empresa as any).empresaSAGE ||
      (empresa as any).codigoSAGE ||
      '';
    if (!sage) { setLayout(null); return; }
    buscarLayout(empresaCnpj, String(sage))
      .then((l) => setLayout(l))
      .catch(() => setLayout(null));
  }, [empresaCnpj, empresas]);

  // ----- Handlers -----

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setArquivo(f ?? null);
    setResultado(null);
  };

  const handleValidar = useCallback(async () => {
    if (!arquivo || !modelo || !empresaCnpj) return;
    setProcessando(true);
    setResultado(null);
    try {
      const buf = await arquivo.arrayBuffer();
      const conteudo = decodeBuffer(buf, modelo.encoding ?? 'iso-8859-1');
      const r = parsearArquivoFixedWidth(conteudo, modelo, layout, {
        nomeArquivo: arquivo.name,
        cnpjEsperado: empresaCnpj.replace(/\D/g, ''),
      });
      setResultado(r);
    } catch (e: any) {
      setResultado({
        empresaCnpj: '',
        totalRegistros: 0,
        eventos: [],
        pisSemMatricula: [],
        avisos: [],
        erros: [`Erro ao processar arquivo: ${e?.message ?? String(e)}`],
      });
    } finally {
      setProcessando(false);
    }
  }, [arquivo, modelo, layout, empresaCnpj]);

  const copiarLog = () => {
    if (!resultado) return;
    const txt = JSON.stringify(
      {
        modeloId: modelo?.id,
        modeloVersao: modelo?.versao,
        empresaCnpj,
        arquivo: arquivo?.name,
        tamanhoArquivoBytes: arquivo?.size,
        timestamp: new Date().toISOString(),
        resultado,
      },
      null,
      2
    );
    navigator.clipboard
      .writeText(txt)
      .then(() => alert('Log JSON copiado para a area de transferencia. Cole no chat com o desenvolvedor.'))
      .catch(() => alert('Nao foi possivel copiar. Selecione o texto e copie manualmente.'));
  };

  // ----- Render -----

  if (carregandoCtx) {
    return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Carregando contexto...</div>;
  }

  if (erroSetup) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
        <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">
          ⚠️ Configuracao incompleta
        </h3>
        <p className="text-red-700 dark:text-red-300 text-sm">{erroSetup}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
          🕐 Validador ACJEF — Ponto Eletronico (teste)
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Tela de validacao tecnica do parser ACJEF (Portaria 1510). Faca upload de um
          arquivo real do cliente e analise se o schema esta lendo corretamente.
        </p>
      </header>

      <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded">
        <p className="text-amber-800 dark:text-amber-200 text-sm">
          <strong>Modo de teste.</strong> Os eventos lidos aqui NAO sao enviados ao IOB SAGE
          nem persistidos. Esta tela serve apenas para conferir se o parser esta extraindo
          corretamente cabecalho, eventos e codigos do arquivo do cliente. Use o botao
          &quot;Copiar log JSON&quot; ao final e envie ao desenvolvedor.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4 p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            1. Empresa
          </label>
          <select
            value={empresaCnpj}
            onChange={(e) => setEmpresaCnpj(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
          >
            <option value="">— Selecionar empresa —</option>
            {empresas.map((e) => (
              <option key={(e as any).cnpj} value={(e as any).cnpj}>
                {(e as any).razaoSocial} — CNPJ {(e as any).cnpj}
              </option>
            ))}
          </select>
          {empresaCnpj && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Layout salvo desta empresa em ponto_layouts:{' '}
              {layout
                ? '✅ existe (usa pisToMatricula salvo)'
                : 'nao existe (validador funciona com modelo padrao apenas)'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            2. Arquivo ACJEF
          </label>
          <input
            type="file"
            accept=".txt,.acjef,.dat,.AFD,.afd"
            onChange={handleFile}
            className="block w-full text-sm text-slate-600 dark:text-slate-300
                       file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
                       file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
                       hover:file:bg-blue-100 dark:file:bg-blue-900/40 dark:file:text-blue-300"
          />
          {arquivo && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {arquivo.name} ({(arquivo.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <button
          onClick={handleValidar}
          disabled={!arquivo || !modelo || !empresaCnpj || processando}
          className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processando ? 'Processando...' : '3. Validar parser'}
        </button>
      </div>

      {/* Resultado */}
      {resultado && (
        <ResultadoView
          resultado={resultado}
          modelo={modelo!}
          arquivoNome={arquivo?.name ?? ''}
          onCopiar={copiarLog}
        />
      )}

      {modelo && (
        <details className="text-xs text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300">
            Modelo em uso: {modelo.id} v{modelo.versao}
          </summary>
          <div className="mt-2 ml-4 space-y-1">
            <p>Encoding: {modelo.encoding ?? 'iso-8859-1'}</p>
            <p>Schemas: {modelo.schemas?.length ?? 0} tipos de registro</p>
            <p>De-para de eventos: {Object.keys(modelo.deParaEventos ?? {}).length} mapeamentos</p>
          </div>
        </details>
      )}
    </div>
  );
};

// ===== Subcomponente: visao do resultado =====

const ResultadoView: React.FC<{
  resultado: ResultadoParsingPonto;
  modelo: ModeloPonto;
  arquivoNome: string;
  onCopiar: () => void;
}> = ({ resultado, modelo, onCopiar }) => {
  const tipo4Count = resultado.eventos.length;
  const codigosUnicos = new Set(resultado.eventos.map((e) => e.evento));

  // Extrai codigos sem mapeamento dos avisos
  const codigosSemMapeamento = Array.from(
    new Set(
      resultado.avisos
        .map((a) => a.match(/codigo de evento "([^"]+)"/)?.[1])
        .filter((c): c is string => Boolean(c))
    )
  ).sort();

  return (
    <div className="space-y-4">
      {/* Erros (se houver) */}
      {resultado.erros.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
          <h4 className="text-red-800 dark:text-red-200 font-semibold mb-2">
            ❌ Erros ({resultado.erros.length})
          </h4>
          <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
            {resultado.erros.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total registros" value={resultado.totalRegistros} />
        <Stat label="Eventos extraidos" value={tipo4Count} />
        <Stat label="PIS sem matricula" value={resultado.pisSemMatricula.length} />
        <Stat label="Codigos unicos" value={codigosUnicos.size} />
      </div>

      {/* Cabecalho */}
      <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
        <h4 className="font-semibold text-slate-800 dark:text-white mb-2">
          📋 Cabecalho extraido (registro tipo 1)
        </h4>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <dt className="text-slate-500 dark:text-slate-400 text-xs">CNPJ</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">
              {resultado.empresaCnpj || <span className="text-red-600">(vazio — schema desalinhado?)</span>}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400 text-xs">Razao social</dt>
            <dd className="text-slate-800 dark:text-slate-200">
              {resultado.empresaRazaoSocial || <span className="text-red-600">(vazio)</span>}
            </dd>
          </div>
        </dl>
      </div>

      {/* Codigos sem mapeamento */}
      {codigosSemMapeamento.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
          <h4 className="text-amber-800 dark:text-amber-200 font-semibold mb-2">
            ⚠️ Codigos sem mapeamento ({codigosSemMapeamento.length})
          </h4>
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
            Estes codigos aparecem no arquivo mas nao tem mapeamento para evento IOB SAGE.
            Cadastre em <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
            ponto_modelos/{modelo.id}/deParaEventos</code> ou no layout da empresa.
          </p>
          <code className="text-xs bg-amber-100 dark:bg-amber-900/40 p-2 rounded block break-all">
            {codigosSemMapeamento.join(', ')}
          </code>
        </div>
      )}

      {/* Primeiros eventos */}
      {resultado.eventos.length > 0 && (
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
          <h4 className="font-semibold text-slate-800 dark:text-white mb-2">
            📊 Primeiros 20 eventos extraidos
          </h4>
          <table className="w-full text-xs">
            <thead className="bg-slate-100 dark:bg-slate-700">
              <tr>
                <th className="text-left p-2">PIS</th>
                <th className="text-left p-2">Cod. SAGE</th>
                <th className="text-left p-2">Descricao</th>
                <th className="text-right p-2">Valor</th>
                <th className="text-left p-2">Unidade</th>
                <th className="text-center p-2">R/V</th>
              </tr>
            </thead>
            <tbody>
              {resultado.eventos.slice(0, 20).map((e, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                  <td className="p-2 font-mono">{e.pis || '—'}</td>
                  <td className="p-2 font-mono">{e.evento}</td>
                  <td className="p-2">{e.descricao}</td>
                  <td className="p-2 text-right font-mono">{e.valor.toFixed(2)}</td>
                  <td className="p-2 text-slate-500 dark:text-slate-400">{e.unidade}</td>
                  <td className="p-2 text-center">{e.rv}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resultado.eventos.length > 20 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
              ... e mais {resultado.eventos.length - 20} eventos. Ver log completo no JSON.
            </p>
          )}
        </div>
      )}

      {/* PIS sem matricula */}
      {resultado.pisSemMatricula.length > 0 && (
        <details className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <summary className="cursor-pointer text-sm text-slate-700 dark:text-slate-300">
            👥 {resultado.pisSemMatricula.length} PIS sem matricula cadastrada — clique para ver
          </summary>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 mb-1">
            Estes PIS aparecem no arquivo mas nao tem matricula SAGE mapeada no LayoutPonto.
            Na producao (Fase 2), o app vai pedir cadastro deles.
          </p>
          <ul className="mt-2 text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5 max-h-40 overflow-y-auto">
            {resultado.pisSemMatricula.slice(0, 100).map((pis) => (
              <li key={pis}>{pis}</li>
            ))}
            {resultado.pisSemMatricula.length > 100 && (
              <li className="italic">... e mais {resultado.pisSemMatricula.length - 100}</li>
            )}
          </ul>
        </details>
      )}

      {/* Avisos */}
      {resultado.avisos.length > 0 && (
        <details className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <summary className="cursor-pointer text-sm text-slate-700 dark:text-slate-300">
            ℹ️ {resultado.avisos.length} aviso(s) do parser — clique para ver
          </summary>
          <ul className="mt-2 text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside max-h-60 overflow-y-auto">
            {resultado.avisos.slice(0, 50).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
            {resultado.avisos.length > 50 && (
              <li className="italic text-slate-500">
                ... e mais {resultado.avisos.length - 50} avisos. Ver no log JSON.
              </li>
            )}
          </ul>
        </details>
      )}

      {/* Botao copiar */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onCopiar}
          className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 text-sm font-medium"
        >
          📋 Copiar log JSON (envie ao desenvolvedor)
        </button>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-center">
    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{value}</div>
    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
  </div>
);

export default ValidadorACJEFPanel;
