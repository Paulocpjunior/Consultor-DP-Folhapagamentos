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
    ResultadoMapeamento,
} from './folhaTypes';
import { norm, round2, toNumber, extrairValor } from './apontamentoParser';

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
    for (const [coluna, regra] of Object.entries(mapa.mapeamento_colunas)) {
        if (!(coluna in celulas)) continue;
        if (colunasAtivas && !colunasAtivas.has(coluna)) continue;

        const valor = extrairValor(celulas[coluna], regra.rv);
        if (valor === null) continue;
        if (regra.ignorar_se_zero && valor === 0) continue;

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
    if (regrasDE && (!colunasAtivas || colunasAtivas.has(regrasDE.coluna))) {
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

    // 4) Matrícula
    const matriculas =
        mapa.matriculas?.[nomeNoMapa] ??
        mapa.matriculas?.[empresaNomeParser] ??
        {};
    const matricula = matriculas[funcionario.nome] ?? null;

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
            if (exigirMatricula && algumLancamento && !matriculaCadastrada) {
                semMatricula.push(`${empresa.nome} / ${func.nome}`);
            } else {
                todos.push(...out.lancamentos);
            }
            alertas.push(...out.alertas);
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
