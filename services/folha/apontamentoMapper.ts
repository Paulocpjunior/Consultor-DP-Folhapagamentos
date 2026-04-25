// services/folha/apontamentoMapper.ts
// Aplica o mapeamento (coluna → evento) e gera os lançamentos.

import type {
    ApontamentoParseado,
    CatalogoEventos,
    FuncionarioApontamento,
    Lancamento,
    MapeamentoApontamento,
    ResultadoMapeamento,
} from './folhaTypes';
import { norm, round2, toNumber } from './apontamentoParser';

/**
 * Gera os lançamentos de um funcionário aplicando todas as regras.
 */
function gerarLancamentosFuncionario(
    funcionario: FuncionarioApontamento,
    empresaNome: string,
    mapa: MapeamentoApontamento,
    codigosValidos: Set<string>,
): { lancamentos: Lancamento[]; alertas: string[] } {
    const lancamentos: Lancamento[] = [];
    const alertas: string[] = [];
    const celulas = funcionario.celulas;
    const empresaCfg = mapa.empresas[empresaNome];
    const codigoSage = empresaCfg?.codigo_sage ?? mapa.empresa_base;

    // 1) Colunas simples → evento direto
    for (const [coluna, regra] of Object.entries(mapa.mapeamento_colunas)) {
        if (!(coluna in celulas)) continue;
        const valor = toNumber(celulas[coluna]);
        if (valor === null) continue;
        if (regra.ignorar_se_zero && valor === 0) continue;

        if (!codigosValidos.has(regra.evento)) {
            alertas.push(
                `Evento ${regra.evento} (coluna "${coluna}") não existe no catálogo.`
            );
            continue;
        }

        lancamentos.push({
            empresa: empresaNome,
            codigoSage,
            funcionario: funcionario.nome,
            matricula: null,
            coluna,
            evento: regra.evento,
            descricao_evento: regra.descricao_evento,
            tipo: regra.tipo,
            rv: regra.rv,
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

            if (!codigosValidos.has(escolhida.evento)) {
                alertas.push(
                    `Evento ${escolhida.evento} (DESCONTOS EMPRESA) não existe no catálogo.`
                );
            } else {
                lancamentos.push({
                    empresa: empresaNome,
                    codigoSage,
                    funcionario: funcionario.nome,
                    matricula: null,
                    coluna: regrasDE.coluna,
                    evento: escolhida.evento,
                    descricao_evento: escolhida.descricao_evento,
                    tipo: escolhida.tipo,
                    rv: escolhida.rv,
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

    // 3) Preenche matrícula a partir do cadastro
    const matriculas = mapa.matriculas?.[empresaNome] ?? {};
    const matricula = matriculas[funcionario.nome] ?? null;
    if (!matricula && lancamentos.length > 0) {
        alertas.push(
            `"${funcionario.nome}" sem matrícula cadastrada em ${empresaNome}.`
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
    const codigosValidos = new Set(catalogo.eventos.map((e) => e.codigo));
    const todos: Lancamento[] = [];
    const alertas: string[] = [];

    for (const empresa of parsed.empresas) {
        const cfg = mapa.empresas?.[empresa.nome];
        if (!cfg || cfg.ativa === false) {
            alertas.push(
                `Empresa "${empresa.nome}" não está ativa no mapeamento; ignorada.`
            );
            continue;
        }
        for (const func of empresa.funcionarios) {
            const out = gerarLancamentosFuncionario(
                func,
                empresa.nome,
                mapa,
                codigosValidos
            );
            todos.push(...out.lancamentos);
            alertas.push(...out.alertas);
        }
    }
    return { lancamentos: todos, alertas };
}
