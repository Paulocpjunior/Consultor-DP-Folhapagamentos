// services/folha/apontamentoMapper.ts
// Aplica o mapeamento (coluna → evento) e gera os lançamentos.
//
// v1.6 — CONSOLIDAÇÃO POR EVENTO:
//   - Quando duas ou mais colunas apontam pro mesmo evento (origem='coluna')
//     para o mesmo funcionário, os lançamentos são SOMADOS em uma única linha.
//   - Caso de uso: VALUE PROJETOS — "Plano celular" + "Ilimitada assessoria"
//     ambos mapeados pra evento 5006 (OUTROS DESCONTOS). Antes geravam 2 linhas
//     no TXT; agora geram 1 linha com o valor somado.
//   - A consolidação respeita rv: só consolida se rv coincidir. Diferenças de
//     rv geram alerta e mantêm separadas.
//   - DESCONTOS EMPRESA e SALÁRIO (regra própria) NÃO entram na consolidação.
//
// v1.5 — exporta `resolverEmpresa` para o painel.
// v1.4 — suporte a matrícula "PJ".
// v1.3 — seleção de colunas e matrícula obrigatória.
// v1.2 — fallback funciona independente de quantas abas o parser leu.
// v1.1 — resolução tolerante do nome de aba.

import type {
    ApontamentoParseado,
    CatalogoEventos,
    EmpresaApontamento,
    EventoIobSage,
    FuncionarioApontamento,
    Lancamento,
    MapeamentoApontamento,
    RegraColuna,
    ResultadoMapeamento,
} from './folhaTypes';
import { norm, round2, toNumber, extrairValor, chaveComparacaoHeader, horasDecimalParaHHMM, horasDeCelulaTempo } from './apontamentoParser';

export function resolverEmpresa(
    abaParser: EmpresaApontamento,
    mapa: MapeamentoApontamento,
): {
    cfg: { codigo_sage: string; ativa: boolean };
    nomeMapa: string;
    alerta?: string;
} | null {
    const empresasMapa = mapa.empresas ?? {};
    const chaves = Object.keys(empresasMapa);

    if (empresasMapa[abaParser.nome]) {
        return { cfg: empresasMapa[abaParser.nome], nomeMapa: abaParser.nome };
    }

    const abaNorm = norm(abaParser.nome);
    const chaveAprox = chaves.find((k) => norm(k) === abaNorm);
    if (chaveAprox) {
        return {
            cfg: empresasMapa[chaveAprox],
            nomeMapa: chaveAprox,
            alerta: `Aba "${abaParser.nome}" associada ao mapeamento "${chaveAprox}" (match aproximado).`,
        };
    }

    const ativas = chaves.filter((k) => empresasMapa[k].ativa !== false);
    if (ativas.length === 1) {
        const k = ativas[0];
        return {
            cfg: empresasMapa[k],
            nomeMapa: k,
            alerta:
                `Aba "${abaParser.nome}" não tem entrada explícita no mapeamento. ` +
                `Como o cliente tem só 1 empresa ativa ("${k}"), ela foi usada como destino.`,
        };
    }

    return null;
}

/**
 * Resultado da leitura de UMA célula sob UMA regra de coluna.
 *   - 'ok'             → gera lançamento com `valor`
 *   - 'ignorado'       → célula vazia / não-numérica / zero com ignorar_se_zero
 *   - 'sem_valor_fixo' → regra com condicao_celula bateu mas falta valor_fixo
 *
 * Extraído de `gerarLancamentosFuncionario` para que o DIAGNÓSTICO de colunas
 * (por que nada foi gerado?) use exatamente a mesma lógica da exportação —
 * sem risco de divergir e apontar o motivo errado.
 */
type ValorColuna =
    | { tipo: 'ok'; valor: number }
    | { tipo: 'ignorado' }
    | { tipo: 'sem_valor_fixo' };

function calcularValorColuna(regra: RegraColuna, celula: unknown): ValorColuna {
    // Coluna marcadora (ex.: CONTRIBUIÇÃO ASSISTENCIAL SIM/NÃO):
    // só gera lançamento quando o texto da célula bate, e usa valor_fixo.
    if (regra.condicao_celula) {
        const valorCelula = norm(celula ?? '');
        const bate = regra.condicao_celula.igual_a.some((v) => norm(v) === valorCelula);
        if (!bate) return { tipo: 'ignorado' };
        if (regra.valor_fixo === undefined || regra.valor_fixo === null) {
            return { tipo: 'sem_valor_fixo' };
        }
        return { tipo: 'ok', valor: regra.valor_fixo };
    }

    // valor_fixo sem condição: usa o fixo sempre que a célula tiver algo
    if (regra.valor_fixo !== undefined) {
        if (celula === null || celula === undefined || celula === '') return { tipo: 'ignorado' };
        return { tipo: 'ok', valor: regra.valor_fixo };
    }

    // Campo de HORA em referência posicional HH,MM (convenção Waldesa no
    // IOB SAGE: 1:15 -> 1,15 ; 28:46 -> 28,46 ; 6:32 -> 6,32).
    if (regra.ref_hhmm && regra.rv === 'R') {
        const horasDecimais = horasDeCelulaTempo(celula);
        if (horasDecimais === null) return { tipo: 'ignorado' };
        const valor = horasDecimalParaHHMM(horasDecimais);
        if (regra.ignorar_se_zero && valor === 0) return { tipo: 'ignorado' };
        return { tipo: 'ok', valor };
    }

    let valor = extrairValor(celula, regra.rv);
    if (valor === null) return { tipo: 'ignorado' };
    if (regra.excelTime && typeof valor === 'number') valor = round2(valor * 24);
    if (regra.ignorar_se_zero && valor === 0) return { tipo: 'ignorado' };
    return { tipo: 'ok', valor };
}

/**
 * v1.6 — Consolida lançamentos de mesma origem 'coluna' que apontam pro mesmo
 * evento + rv dentro de um mesmo funcionário. Soma os valores.
 *
 * Lançamentos de outras origens ('obs', 'padrao', 'salario') ficam de fora —
 * cada um tem seu motivo de existir como linha separada.
 */
function consolidarPorEvento(
    lancamentos: Lancamento[],
    nomeFuncionario: string,
): { consolidados: Lancamento[]; alertasConsolidacao: string[] } {
    const alertas: string[] = [];
    const consolidaveis: Lancamento[] = [];
    const naoConsolidaveis: Lancamento[] = [];

    for (const l of lancamentos) {
        if (l.origem === 'coluna') {
            consolidaveis.push(l);
        } else {
            naoConsolidaveis.push(l);
        }
    }

    // Agrupa por evento+rv
    const grupos = new Map<string, Lancamento[]>();
    for (const l of consolidaveis) {
        const chave = `${l.evento}__${l.rv}`;
        const lista = grupos.get(chave) ?? [];
        lista.push(l);
        grupos.set(chave, lista);
    }

    const consolidados: Lancamento[] = [...naoConsolidaveis];
    for (const [_, lista] of grupos) {
        if (lista.length === 1) {
            consolidados.push(lista[0]);
            continue;
        }
        // Soma valores das colunas no mesmo evento
        const base = lista[0];
        const total = lista.reduce((acc, l) => acc + l.valor, 0);
        const colunas = lista.map((l) => `"${l.coluna}"`).join(' + ');
        alertas.push(
            `"${nomeFuncionario}": evento ${base.evento} consolidado de ${lista.length} colunas (${colunas}) ` +
            `= ${round2(total).toFixed(2)}.`,
        );
        consolidados.push({
            ...base,
            valor: round2(total),
            coluna: lista.map((l) => l.coluna).join(' + '),
        });
    }

    return { consolidados, alertasConsolidacao: alertas };
}

function gerarLancamentosFuncionario(
    funcionario: FuncionarioApontamento,
    empresaNomeParser: string,
    cfgEmpresa: { codigo_sage: string; ativa: boolean },
    nomeNoMapa: string,
    mapa: MapeamentoApontamento,
    catalogoMap: Map<string, EventoIobSage>,
    colunasAtivas: Set<string> | null,
): { lancamentos: Lancamento[]; alertas: string[] } {
    const lancamentos: Lancamento[] = [];
    const alertas: string[] = [];
    const celulas = funcionario.celulas;
    const codigoSage = cfgEmpresa?.codigo_sage ?? mapa.empresa_base;

    const codigoSalario = mapa.regra_salario?.evento;

    // 1) Colunas simples → evento direto
    // Cria índice das células do funcionário com chave normalizada (NBSP→space,
    // colapsa whitespace) para permitir lookup tolerante quando o mapeamento
    // foi salvo com whitespace ligeiramente diferente da planilha real.
    // Índice das células por chave de COMPARAÇÃO (insensível a espaços: NBSP,
    // espaços múltiplos e "H. E" vs "H.E" colapsam todos). Permite casar o
    // mapeamento com o cabeçalho real mesmo com grafias diferentes do mesmo campo.
    const celulasNormalizadas: Record<string, unknown> = {};
    for (const k of Object.keys(celulas)) {
        celulasNormalizadas[chaveComparacaoHeader(k)] = celulas[k];
    }
    // colunasAtivas (UI/perfil) também comparado pela chave de comparação.
    const colunasAtivasComp = colunasAtivas
        ? new Set([...colunasAtivas].map(chaveComparacaoHeader))
        : null;
    for (const [coluna, regra] of Object.entries(mapa.mapeamento_colunas)) {
        // chaveNorm passa a ser a chave de COMPARAÇÃO (sem espaços). Resolve o
        // caso da Waldesa empresa 27: mapa "H. E 60%" x arquivo "H.E 60%".
        const chaveNorm = chaveComparacaoHeader(coluna);
        if (!(chaveNorm in celulasNormalizadas)) continue;
        if (colunasAtivasComp && !colunasAtivasComp.has(chaveNorm)) continue;

        // Leitura da célula sob a regra (mesma função usada pelo diagnóstico).
        const lido = calcularValorColuna(regra, celulasNormalizadas[chaveNorm]);
        if (lido.tipo === 'sem_valor_fixo') {
            alertas.push(
                `Coluna "${coluna}" tem condicao_celula mas falta valor_fixo no mapeamento. ` +
                `Lançamento ignorado para "${funcionario.nome}".`,
            );
            continue;
        }
        if (lido.tipo === 'ignorado') continue;
        const valor = lido.valor;

        const eventoCat = catalogoMap.get(regra.evento);
        if (!eventoCat) {
            alertas.push(
                `Evento ${regra.evento} (coluna "${coluna}") não existe no catálogo.`
            );
            continue;
        }

        if (codigoSalario && regra.evento === codigoSalario) {
            alertas.push(
                `Coluna "${coluna}" mapeada para evento ${regra.evento} foi ignorada — ` +
                `o evento de salário é gerado pela regra_salario (com dias trabalhados). ` +
                `Remova essa coluna do mapeamento para evitar este aviso.`
            );
            continue;
        }

        if (regra.rv !== eventoCat.rv) {
            alertas.push(
                `Coluna "${coluna}" → evento ${regra.evento}: rv da regra ("${regra.rv}") ` +
                `difere do catálogo IOB ("${eventoCat.rv}"). Aplicando o do catálogo.`
            );
        }

        lancamentos.push({
            empresa: empresaNomeParser,
            codigoSage,
            funcionario: funcionario.nome,
            matricula: null,
            coluna,
            evento: regra.evento,
            descricao_evento: regra.descricao_evento,
            tipo: eventoCat.tipo,
            rv: eventoCat.rv,
            valor: round2(valor),
            origem: 'coluna',
        });
    }

    // 2) DESCONTOS EMPRESA → depende do OBS
    const regrasDE = mapa.regras_descontos_empresa;
    if (regrasDE && (!colunasAtivasComp || colunasAtivasComp.has(chaveComparacaoHeader(regrasDE.coluna)))) {
        const valorDE = toNumber(celulas[regrasDE.coluna]);
        if (valorDE !== null && valorDE > 0) {
            const obsNorm = norm(
                funcionario.obs ?? (celulas[regrasDE.campo_obs] as string | undefined) ?? ''
            );

            let escolhida = regrasDE.evento_padrao;
            for (const r of regrasDE.regras ?? []) {
                const matches = (r.quando_obs_contem ?? []).some((t) =>
                    obsNorm.includes(norm(t))
                );
                if (matches) {
                    escolhida = r;
                    break;
                }
            }

            const eventoCat = catalogoMap.get(escolhida.evento);
            if (!eventoCat) {
                alertas.push(
                    `Evento ${escolhida.evento} (DESCONTOS EMPRESA) não existe no catálogo.`
                );
            } else {
                lancamentos.push({
                    empresa: empresaNomeParser,
                    codigoSage,
                    funcionario: funcionario.nome,
                    matricula: null,
                    coluna: regrasDE.coluna,
                    evento: escolhida.evento,
                    descricao_evento: escolhida.descricao_evento,
                    tipo: eventoCat.tipo,
                    rv: eventoCat.rv,
                    valor: round2(valorDE),
                    obs: funcionario.obs,
                    origem: funcionario.obs ? 'obs' : 'padrao',
                });

                if (!funcionario.obs) {
                    alertas.push(
                        `"${funcionario.nome}" tem DESCONTOS EMPRESA = ${valorDE.toFixed(
                            2
                        )} sem OBS — mapeado para evento padrão ${escolhida.evento}.`
                    );
                }
            }
        }
    }

    // 3) SALÁRIO — gerado pela regra própria (NÃO entra na consolidação por coluna)
    if (mapa.regra_salario) {
        const cfg = mapa.regra_salario;
        const eventoCat = catalogoMap.get(cfg.evento);
        if (!eventoCat) {
            alertas.push(
                `Evento de salário ${cfg.evento} (regra_salario) não existe no catálogo.`
            );
        } else {
            let dias = cfg.dias_padrao;
            let celulaNaoNumerica = false;
            if (cfg.coluna_dias && cfg.coluna_dias in celulas) {
                const raw = celulas[cfg.coluna_dias];
                const v = toNumber(raw);
                if (v !== null) {
                    dias = v;
                } else if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
                    celulaNaoNumerica = true;
                }
            }
            dias = round2(dias);

            const pularPorZero = cfg.ignorar_se_dias_zero && dias === 0;
            const pularPorTexto = cfg.ignorar_se_coluna_nao_numerica && celulaNaoNumerica;
            const pular = pularPorZero || pularPorTexto;
            if (!pular) {
                lancamentos.push({
                    empresa: empresaNomeParser,
                    codigoSage,
                    funcionario: funcionario.nome,
                    matricula: null,
                    coluna: cfg.coluna_dias ?? '__regra_salario__',
                    evento: cfg.evento,
                    descricao_evento: cfg.descricao_evento,
                    tipo: eventoCat.tipo,
                    rv: eventoCat.rv,
                    valor: dias,
                    origem: 'salario',
                });
            }
        }
    }

    // ─── v1.6: CONSOLIDAÇÃO POR EVENTO ───
    const { consolidados, alertasConsolidacao } = consolidarPorEvento(lancamentos, funcionario.nome);
    alertas.push(...alertasConsolidacao);

    // 4) Matrícula — prefer campo_matricula (coluna do XLSX) se disponível
    let matricula: string | null = null;
    if (mapa.campo_matricula) {
        const celulasNorm = Object.fromEntries(
            Object.entries(funcionario.celulas).map(([k, v]) => [norm(k), v]),
        );
        const chaveMatr = norm(mapa.campo_matricula);
        const raw = celulasNorm[chaveMatr];
        if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
            const n = Number(raw);
            matricula = Number.isFinite(n) ? String(Math.floor(n)) : String(raw).trim();
        }
    }
    if (!matricula) {
        const matriculas =
            mapa.matriculas?.[nomeNoMapa] ??
            mapa.matriculas?.[empresaNomeParser] ??
            {};
        matricula = matriculas[funcionario.nome] ?? null;
    }

    const ehPJ = typeof matricula === 'string' && matricula.trim().toUpperCase() === 'PJ';
    if (ehPJ) {
        if (consolidados.length > 0) {
            alertas.push(
                `"${funcionario.nome}" marcado como PJ — ${consolidados.length} lançamento(s) descartado(s), não vai para o TXT SAGE.`
            );
        }
        return { lancamentos: [], alertas };
    }

    consolidados.forEach((l) => { l.matricula = matricula; });

    return { lancamentos: consolidados, alertas };
}

export function montarLancamentos(
    parsed: ApontamentoParseado,
    mapa: MapeamentoApontamento,
    catalogo: CatalogoEventos,
    opts?: {
        colunasAtivas?: Set<string> | null;
        exigirMatricula?: boolean;
    },
): ResultadoMapeamento & { funcionariosSemMatricula: string[] } {
    const colunasAtivas = opts?.colunasAtivas ?? null;
    const exigirMatricula = opts?.exigirMatricula ?? true;

    const catalogoMap = new Map<string, EventoIobSage>(
        catalogo.eventos.map((e) => [e.codigo, e])
    );
    const todos: Lancamento[] = [];
    const alertas: string[] = [];
    const semMatricula: string[] = [];

    for (const empresa of parsed.empresas) {
        const resolvido = resolverEmpresa(empresa, mapa);

        if (!resolvido) {
            alertas.push(
                `Empresa "${empresa.nome}" não está ativa no mapeamento; ignorada.`
            );
            continue;
        }

        if (resolvido.cfg.ativa === false) {
            alertas.push(
                `Empresa "${empresa.nome}" (mapeada como "${resolvido.nomeMapa}") está marcada como inativa; ignorada.`
            );
            continue;
        }

        if (resolvido.alerta) {
            alertas.push(resolvido.alerta);
        }

        let gerouNaAba = 0;
        for (const func of empresa.funcionarios) {
            const out = gerarLancamentosFuncionario(
                func,
                empresa.nome,
                resolvido.cfg,
                resolvido.nomeMapa,
                mapa,
                catalogoMap,
                colunasAtivas,
            );
            const algumLancamento = out.lancamentos.length > 0;
            const matriculaCadastrada = out.lancamentos[0]?.matricula;
            // Conta ANTES do filtro de matrícula: se a aba só falhou por
            // matrícula faltando, quem explica isso é a mensagem específica.
            gerouNaAba += out.lancamentos.length;
            if (exigirMatricula && algumLancamento && !matriculaCadastrada) {
                semMatricula.push(`${empresa.nome} / ${func.nome}`);
            } else {
                todos.push(...out.lancamentos);
            }
            alertas.push(...out.alertas);
        }

        // Aba que não produziu NADA: diz por quê (coluna fora do mapeamento,
        // nada marcado, colunas sem valor…). Sem isto o usuário só via
        // "Nenhum lançamento foi gerado", sem pista do motivo.
        if (gerouNaAba === 0) {
            alertas.push(resumoZeroLancamentos(diagnosticarColunas(empresa, mapa, colunasAtivas)));
        }
    }

    if (semMatricula.length > 0) {
        alertas.unshift(
            `${semMatricula.length} funcionário(s) sem matrícula cadastrada — exportação bloqueada para esses. ` +
            `Cadastre as matrículas pendentes (campo amarelo) e exporte novamente.`
        );
    }

    const alertasDedup = Array.from(new Set(alertas));

    return {
        lancamentos: todos,
        alertas: alertasDedup,
        funcionariosSemMatricula: semMatricula,
    };
}

// ─── Diagnóstico de colunas ────────────────────────────────────────────────
//
// Por que isto existe: quando o layout da planilha muda (a empresa renomeia
// uma coluna, manda a aba com outro nome, troca "ATRASOS 5850" por "Atraso"…),
// o mapeamento gravado deixa de casar com o cabeçalho e a exportação sai com
// ZERO lançamentos — sem nenhum alerta, porque o laço simplesmente não acha a
// coluna. A operadora via só "Nenhum lançamento foi gerado" e não tinha como
// saber o motivo. As funções abaixo respondem "por quê" em português claro.

export interface DiagnosticoColunasAba {
    aba: string;
    /** Colunas de dados que a planilha tem nesta aba. */
    totalColunasAba: number;
    /** Quantas colunas o mapeamento do cliente conhece (coluna → evento). */
    totalRegras: number;
    /** Colunas marcadas na UI que existem nesta aba. */
    selecionadas: string[];
    /** Marcadas, mas sem regra no mapeamento → nunca viram lançamento. */
    selecionadasSemRegra: string[];
    /** Marcadas e mapeadas, mas nenhuma célula tem valor aproveitável. */
    selecionadasSemValor: string[];
    /** Marcadas, mapeadas e com pelo menos 1 valor → geram lançamento. */
    selecionadasOk: string[];
    /** Mapeadas e com dado na planilha, porém DESmarcadas na UI. */
    mapeadasNaoSelecionadas: string[];
}

/**
 * Conjunto de chaves de comparação de todas as colunas que o mapeamento
 * "conhece" — inclusive as que não geram evento (matrícula, dias de salário).
 * Usado pela UI para marcar no cabeçalho as colunas fora do mapeamento.
 */
export function chavesDeColunasMapeadas(mapa: MapeamentoApontamento): Set<string> {
    const chaves = new Set<string>();
    for (const k of Object.keys(mapa.mapeamento_colunas ?? {})) {
        chaves.add(chaveComparacaoHeader(k));
    }
    const colunaDE = mapa.regras_descontos_empresa?.coluna;
    if (colunaDE) chaves.add(chaveComparacaoHeader(colunaDE));
    const colunaDias = mapa.regra_salario?.coluna_dias;
    if (colunaDias) chaves.add(chaveComparacaoHeader(colunaDias));
    if (mapa.campo_matricula) chaves.add(chaveComparacaoHeader(mapa.campo_matricula));
    return chaves;
}

/**
 * Classifica as colunas de UMA aba em relação ao mapeamento e à seleção da UI.
 * `colunasAtivas` null = todas as colunas contam como marcadas.
 */
export function diagnosticarColunas(
    empresa: EmpresaApontamento,
    mapa: MapeamentoApontamento,
    colunasAtivas?: Set<string> | null,
): DiagnosticoColunasAba {
    const regras = mapa.mapeamento_colunas ?? {};
    const regraPorChave = new Map<string, RegraColuna>();
    for (const [coluna, regra] of Object.entries(regras)) {
        regraPorChave.set(chaveComparacaoHeader(coluna), regra);
    }
    const ativasComp = colunasAtivas
        ? new Set([...colunasAtivas].map(chaveComparacaoHeader))
        : null;
    const outrasUsadas = new Set<string>();
    const colunaDE = mapa.regras_descontos_empresa?.coluna;
    if (colunaDE) outrasUsadas.add(chaveComparacaoHeader(colunaDE));
    const colunaDias = mapa.regra_salario?.coluna_dias;
    if (colunaDias) outrasUsadas.add(chaveComparacaoHeader(colunaDias));
    if (mapa.campo_matricula) outrasUsadas.add(chaveComparacaoHeader(mapa.campo_matricula));

    const d: DiagnosticoColunasAba = {
        aba: empresa.nome,
        totalColunasAba: empresa.colunas.length,
        totalRegras: Object.keys(regras).length,
        selecionadas: [],
        selecionadasSemRegra: [],
        selecionadasSemValor: [],
        selecionadasOk: [],
        mapeadasNaoSelecionadas: [],
    };

    for (const coluna of empresa.colunas) {
        const chave = chaveComparacaoHeader(coluna);
        const marcada = !ativasComp || ativasComp.has(chave);
        const regra = regraPorChave.get(chave);

        if (marcada) d.selecionadas.push(coluna);

        if (!regra) {
            if (marcada && !outrasUsadas.has(chave)) d.selecionadasSemRegra.push(coluna);
            continue;
        }

        // A coluna produz lançamento se ao menos 1 funcionário tiver valor.
        const temValor = empresa.funcionarios.some(
            (f) => calcularValorColuna(regra, acharCelula(f, chave)).tipo === 'ok',
        );

        if (marcada) {
            if (temValor) d.selecionadasOk.push(coluna);
            else d.selecionadasSemValor.push(coluna);
        } else if (temValor) {
            d.mapeadasNaoSelecionadas.push(coluna);
        }
    }

    return d;
}

/** Lê a célula do funcionário pela chave de COMPARAÇÃO do cabeçalho. */
function acharCelula(f: FuncionarioApontamento, chaveComp: string): unknown {
    for (const k of Object.keys(f.celulas)) {
        if (chaveComparacaoHeader(k) === chaveComp) return f.celulas[k];
    }
    return undefined;
}

function listar(nomes: string[], max = 8): string {
    const mostra = nomes.slice(0, max).map((n) => `"${n}"`).join(', ');
    return nomes.length > max ? `${mostra} e mais ${nomes.length - max}` : mostra;
}

/**
 * Resumo de 1 linha do motivo de uma aba não ter gerado nada. Vai pros alertas.
 */
export function resumoZeroLancamentos(d: DiagnosticoColunasAba): string {
    if (d.totalRegras === 0) {
        return `Aba "${d.aba}": o cliente não tem nenhuma coluna mapeada (coluna → evento IOB). ` +
            `Parametrize o layout antes de exportar.`;
    }
    if (d.selecionadas.length === 0) {
        return `Aba "${d.aba}": nenhuma coluna marcada na pré-visualização — nada a exportar.`;
    }
    if (d.selecionadasSemRegra.length > 0 && d.selecionadasOk.length === 0) {
        return `Aba "${d.aba}": nenhum lançamento gerado. As colunas marcadas ` +
            `(${listar(d.selecionadasSemRegra)}) não existem no mapeamento deste cliente — ` +
            `o título da coluna na planilha mudou ou nunca foi parametrizado.`;
    }
    if (d.selecionadasSemValor.length > 0 && d.selecionadasOk.length === 0) {
        return `Aba "${d.aba}": nenhum lançamento gerado. As colunas marcadas e mapeadas ` +
            `(${listar(d.selecionadasSemValor)}) estão sem valor numérico aproveitável ` +
            `(células vazias, com "-" ou zeradas).`;
    }
    return `Aba "${d.aba}": nenhum lançamento gerado a partir das colunas marcadas.`;
}

/**
 * Explicação completa (multi-linha) de por que a exportação saiu vazia.
 * Mostrada na caixa de erro do painel — é o texto que a operadora lê.
 */
export function explicarZeroLancamentos(
    parsed: ApontamentoParseado,
    mapa: MapeamentoApontamento,
    colunasAtivas?: Set<string> | null,
): string {
    const linhas: string[] = ['Nenhum lançamento foi gerado a partir do apontamento.'];

    for (const empresa of parsed.empresas) {
        const d = diagnosticarColunas(empresa, mapa, colunasAtivas);
        linhas.push('');
        linhas.push(
            `Aba "${d.aba}" — ${empresa.funcionarios.length} funcionário(s), ` +
            `${d.totalColunasAba} coluna(s) na planilha, ${d.selecionadas.length} marcada(s). ` +
            `Mapeamento do cliente: ${d.totalRegras} coluna(s) cadastrada(s).`,
        );

        if (d.totalRegras === 0) {
            linhas.push(
                '• O cliente não tem nenhuma coluna mapeada. Use "Ajustar mapeamento de colunas" ' +
                'para dizer qual coluna vira qual evento do IOB SAGE.',
            );
            continue;
        }
        if (d.selecionadas.length === 0) {
            linhas.push('• Nenhuma coluna está marcada na pré-visualização. Marque as que quer exportar.');
            continue;
        }
        if (d.selecionadasSemRegra.length > 0) {
            linhas.push(
                `• ${d.selecionadasSemRegra.length} coluna(s) marcada(s) NÃO estão no mapeamento e ` +
                `foram ignoradas: ${listar(d.selecionadasSemRegra)}.`,
            );
            linhas.push(
                '  → É este o motivo mais comum: o título da coluna na planilha mudou (ou a empresa ' +
                'mandou o arquivo em outro layout). Clique em "Ajustar mapeamento de colunas" e ' +
                'aponte cada uma delas para o evento IOB correspondente.',
            );
        }
        if (d.selecionadasSemValor.length > 0) {
            linhas.push(
                `• ${d.selecionadasSemValor.length} coluna(s) marcada(s) e mapeada(s) estão sem valor ` +
                `aproveitável neste mês (vazias, com "-" ou zeradas): ${listar(d.selecionadasSemValor)}.`,
            );
        }
        if (d.mapeadasNaoSelecionadas.length > 0) {
            linhas.push(
                `• Há coluna(s) mapeada(s) COM dados que estão desmarcadas: ` +
                `${listar(d.mapeadasNaoSelecionadas)}. Marque no cabeçalho da tabela se quiser exportá-las.`,
            );
        }
    }

    linhas.push('');
    linhas.push(
        'Obs.: planilha protegida por senha não causa este erro — se a importação funcionou, ' +
        'o arquivo foi lido. O que falta é o mapeamento das colunas.',
    );
    return linhas.join('\n');
}
