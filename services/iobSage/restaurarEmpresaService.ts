// services/iobSage/restaurarEmpresaService.ts
//
// Grava o plano de restauração da empresa, na ordem em que um depende do
// outro: fichas → enquadramento → afastamentos e férias → movimentos. Cada
// gravação usa o serviço de sempre (com auditoria e as mesmas regras).
// Os parâmetros da restauração ficam no navegador e valem para as próximas.

import type { Empresa } from '../empresas/empresasTypes';
import { gravarAfastamentosImportados, gravarEnquadramentosEmLote, gravarImportacao, listarAfastamentos, listarFuncionarios, listarTodosEnquadramentos, type Usuario } from '../cadastros/cadastrosService';
import { listarMovimentosDaEmpresa, salvarMovimentos } from '../calculo/movimentosService';
import { parametrosPadrao, type Existentes, type ParametrosRestauracao, type PlanoRestauracao } from './restaurarEmpresa';

const CHAVE = 'dp_restauracao_parametros';

export function lerParametros(): ParametrosRestauracao {
    try { return { ...parametrosPadrao(), ...JSON.parse(localStorage.getItem(CHAVE) ?? '{}') }; } catch { return parametrosPadrao(); }
}
export function salvarParametros(p: ParametrosRestauracao) { try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* sem armazenamento: segue */ } }

export async function carregarExistentes(empresaId: string): Promise<Existentes> {
    const [fichas, afastamentos, enquadramentos, movimentos] = await Promise.all([
        listarFuncionarios(empresaId), listarAfastamentos(empresaId), listarTodosEnquadramentos(), listarMovimentosDaEmpresa(empresaId),
    ]);
    return { fichas, afastamentos, enquadramentos: enquadramentos.filter(e => e.empresaId === empresaId), movimentos };
}

export async function gravarRestauracao(plano: PlanoRestauracao, empresa: Empresa, existentes: Existentes, u: Usuario, arquivos: string[], aoProgresso: (msg: string) => void): Promise<void> {
    const origem = [...arquivos, ...plano.origem];
    if (plano.fichas.length) {
        aoProgresso(`Gravando fichas: 0 de ${plano.fichas.length}…`);
        await gravarImportacao(plano.fichas, u, origem, n => aoProgresso(`Gravando fichas: ${n} de ${plano.fichas.length}…`), 'Backup IOB (restauração)');
    }
    if (plano.enquadramentos.length) {
        aoProgresso('Gravando o enquadramento…');
        await gravarEnquadramentosEmLote(plano.enquadramentos.map(p => p.enquadramento), u, `Backup IOB (restauração): ${origem.join(', ')}`);
    }
    if (plano.afastamentos.length) {
        aoProgresso(`Gravando ${plano.afastamentos.length} afastamento(s) e férias…`);
        await gravarAfastamentosImportados(plano.afastamentos, existentes.afastamentos, u, origem);
    }
    const porComp = new Map<string, PlanoRestauracao['movimentos']>();
    for (const m of plano.movimentos) porComp.set(m.competencia, [...(porComp.get(m.competencia) ?? []), m]);
    let n = 0;
    for (const [c, itens] of porComp) {
        aoProgresso(`Gravando o histórico da folha: ${n} de ${plano.movimentos.length} mês(es)…`);
        await salvarMovimentos(empresa.id, c, itens.map(i => ({ fichaId: i.fichaId, antes: i.antes, depois: i.depois })), u);
        n += itens.length;
    }
}
