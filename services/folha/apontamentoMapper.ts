// services/folha/apontamentoMapper.ts
// Aplica o mapeamento (coluna → evento) e gera os lançamentos.
//
// v1.1 — resolução tolerante do nome de aba:
//   Se a aba do parser ("FOPAG", "Planilha1", "Sheet1"…) não casar exatamente
//   com nenhuma chave em `mapa.empresas`, tenta:
//     1. Match case/acento-insensitive
//     2. Se houver exatamente UMA empresa ativa no mapa, usa ela como fallback
//        (caso típico: cliente com 1 só empresa cuja aba tem nome diferente
//        do dia em que o mapeamento foi salvo — ex.: SPA Saúde "FOPAG").
//   Caso contrário, mantém o comportamento estrito (alerta + ignora).

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
import { norm, round2, toNumber } from './apontamentoParser';

/**
 * Resolve a config da empresa no mapa para uma aba do parser.
 * Retorna { cfg, nomeMapa, alerta? } ou null se não conseguir resolver.
 *
 * - cfg     → a config { codigo_sage, ativa } do mapa
 * - nomeMapa → o nome real (chave do mapa.empresas) que casou
 * - alerta   → mensagem informativa quando o match foi tolerante
 */
function resolverEmpresa(
    abaParser: EmpresaApontamento,
    mapa: MapeamentoApontamento,
    qtdAbasParser: number,
): {
    cfg: { codigo_sage: string; ativa: boolean };
    nomeMapa: string;
    alerta?: string;
} | null {
    const empresasMapa = mapa.empresas ?? {};
    const chaves = Object.keys(empresasMapa);

    // 1. Match exato (caminho feliz)
    if (empresasMapa[abaParser.nome]) {
        return { cfg: empresasMapa[abaParser.nome], nomeMapa: abaParser.nome };
    }

    // 2. Match tolerante (case + acento insensitive)
    const abaNorm = norm(abaParser.nome);
    const chaveAprox = chaves.find((k) => norm(k) === abaNorm);
    if (chaveAprox) {
        return {
            cfg: empresasMapa[chaveAprox],
            nomeMapa: chaveAprox,
            alerta: `Aba "${abaParser.nome}" foi associada ao mapeamento "${chaveAprox}" (match aproximado).`,
        };
    }

    // 3. Fallback: 1 só empresa ativa no mapa, parser também só achou 1 aba real → usa
    const ativas = chaves.filter((k) => empresasMapa[k].ativa !== false);
    if (ativas.length === 1 && qtdAbasParser === 1) {
        const k = ativas[0];
        return {
            cfg: empresasMapa[k],
            nomeMapa: k,
            alerta:
                `Aba "${abaParser.nome}" não tem entrada explícita no mapeamento, ` +
                `mas o cliente tem só 1 empresa ativa ("${k}") — usando essa.`,
        };
    }

    // 4. Sem solução
    return null;
}

/**
 * Gera os lançamentos de um funcionário aplicando todas as regras.
 * O `rv` (Referência ou Valor) do lançamento vem SEMPRE do catálogo IOB
 * — não do mapeamento — porque é o IOB que decide pelo código do evento.
 */
function gerarLancamentosFuncionario(
    funcionario: FuncionarioApontamento,
    empresaNomeParser: string,
    cfgEmpresa: { codigo_sage: string; ativa: boolean },
    nomeNoMapa: string,
    mapa: MapeamentoApontamento,
    catalogoMap: Map<string, EventoIobSage>,
): { lancamentos: Lancamento[]; alertas: string[] } {
    const lancamentos: Lancamento[] = [];
    const alertas: string[] = [];
    const celulas = funcionario.celulas;
    const codigoSage = cfgEmpresa?.codigo_sage ?? mapa.empresa_base;

    const codigoSalario = mapa.regra_salario?.evento;

    // 1) Colunas simples → evento direto
    for (const [coluna, regra] of Object.entries(mapa.mapeamento_colunas)) {
        if (!(coluna in celulas)) continue;
        const valor = toNumber(celulas[coluna]);
        if (valor === null) continue;
        if (regra.ignorar_se_zero && valor === 0) continue;

        const eventoCat = catalogoMap.get(regra.evento);
        if (!eventoCat) {
            alertas.push(
                `Evento ${regra.evento} (coluna "${coluna}") não existe no catálogo.`
            );
            continue;
        }

        // Bloqueia coluna mapeada para o evento de salário — o lançamento
        // de salário é gerado pela `regra_salario` (com dias, não com R$).
        if (codigoSalario && regra.evento === codigoSalario) {
            alertas.push(
                `Coluna "${coluna}" mapeada para evento ${regra.evento} foi ignorada — ` +
                `o evento de salário é gerado pela regra_salario (com dias trabalhados). ` +
                `Remova essa coluna do mapeamento para evitar este aviso.`
            );
            continue;
        }

        // Diverge `rv` do catálogo? Ainda assim usa o do catálogo, mas alerta.
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
    if (regrasDE) {
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

    // 3) SALÁRIO — sempre gerado para todo funcionário, com dias na referência.
    if (mapa.regra_salario) {
        const cfg = mapa.regra_salario;
        const eventoCat = catalogoMap.get(cfg.evento);
        if (!eventoCat) {
            alertas.push(
                `Evento de salário ${cfg.evento} (regra_salario) não existe no catálogo.`
            );
        } else {
            let dias = cfg.dias_padrao;
            if (cfg.coluna_dias && cfg.coluna_dias in celulas) {
                const v = toNumber(celulas[cfg.coluna_dias]);
                if (v !== null) dias = v;
            }
            dias = round2(dias);

            const pular = cfg.ignorar_se_dias_zero && dias === 0;
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

    // 4) Preenche matrícula a partir do cadastro — busca no nome real do mapa
    //    (e fallback para o nome da aba, caso não encontre)
    const matriculas =
        mapa.matriculas?.[nomeNoMapa] ??
        mapa.matriculas?.[empresaNomeParser] ??
        {};
    const matricula = matriculas[funcionario.nome] ?? null;
    if (!matricula && lancamentos.length > 0) {
        alertas.push(
            `"${funcionario.nome}" sem matrícula cadastrada em ${empresaNomeParser}.`
        );
    }
    lancamentos.forEach((l) => {
        l.matricula = matricula;
    });

    return { lancamentos, alertas };
}

/**
 * Processa o parsed + mapa + catálogo e devolve todos os lançamentos.
 */
export function montarLancamentos(
    parsed: ApontamentoParseado,
    mapa: MapeamentoApontamento,
    catalogo: CatalogoEventos,
): ResultadoMapeamento {
    const catalogoMap = new Map<string, EventoIobSage>(
        catalogo.eventos.map((e) => [e.codigo, e])
    );
    const todos: Lancamento[] = [];
    const alertas: string[] = [];

    // Quantas abas o parser realmente extraiu (não conta as ignoradas)
    const qtdAbasParser = parsed.empresas.length;

    for (const empresa of parsed.empresas) {
        const resolvido = resolverEmpresa(empresa, mapa, qtdAbasParser);

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
            );
            todos.push(...out.lancamentos);
            alertas.push(...out.alertas);
        }
    }

    // Dedup de alertas idênticos (regra_salario alerta uma vez por linha;
    // outros alertas globais também podem repetir).
    const alertasDedup = Array.from(new Set(alertas));

    return { lancamentos: todos, alertas: alertasDedup };
}
