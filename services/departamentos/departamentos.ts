// services/departamentos/departamentos.ts
//
// Departamentos (e centros de custo) da empresa, para a folha por departamento (Paulo, 11/10/2026: "gerar folha de
// pagamentos por Departamentos e Obras dentro da mesma empresa"; cadastro próprio, a partir do código do IOB).
// O departamento do funcionário é o da ficha (campo "departamento") ou, sem ele, o código de departamento do IOB.

import type { FichaFuncionario } from '../cadastros/funcionarios';

export interface Departamento {
    empresaId: string;
    /** Código do departamento (o do IOB, quando veio de lá). */
    codigo: string;
    nome: string;
    /** Centro de custo da contabilidade (integração contábil). */
    centroCusto: string;
    ativo: boolean;
    atualizadoPor?: string;
}

export const departamentoVazio = (empresaId: string): Departamento => ({ empresaId, codigo: '', nome: '', centroCusto: '', ativo: true });
export const idDepartamento = (empresaId: string, codigo: string) => `${empresaId}_${codigo.trim()}`;

/** Departamento do funcionário: o da ficha ou, sem ele, o do IOB. */
export const departamentoDa = (f: Pick<FichaFuncionario, 'dados'>) => (f.dados.departamento || f.dados.departamentoIob || '').trim();

export function validarDepartamento(d: Departamento, outros: Departamento[] = []): string[] {
    const erros: string[] = [];
    if (!/^[A-Za-z0-9._-]{1,20}$/.test(d.codigo.trim())) erros.push('Código do departamento: de 1 a 20 caracteres (letras, números, ponto, hífen ou sublinhado).');
    if (outros.some(o => o.codigo.trim() === d.codigo.trim() && o !== d)) erros.push(`Já existe o departamento ${d.codigo.trim()}.`);
    if (!d.nome.trim()) erros.push('Informe o nome do departamento.');
    if (d.centroCusto.length > 30) erros.push('Centro de custo: até 30 caracteres.');
    return erros;
}

/** Departamentos que estão nas fichas (o do IOB) e ainda não estão no cadastro: para criar de uma vez. */
export function departamentosDasFichas(fichas: Pick<FichaFuncionario, 'dados'>[], cadastrados: Departamento[], empresaId: string): Departamento[] {
    const ja = new Set(cadastrados.map(d => d.codigo.trim()));
    const codigos = [...new Set(fichas.map(departamentoDa).filter(c => c && /^[A-Za-z0-9._-]{1,20}$/.test(c) && !ja.has(c)))].sort();
    return codigos.map(c => ({ ...departamentoVazio(empresaId), codigo: c, nome: `Departamento ${c}` }));
}

/** Funcionários por departamento (para a contagem na tela). */
export function contarPorDepartamento(fichas: Pick<FichaFuncionario, 'dados'>[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const f of fichas) { const d = departamentoDa(f) || '(sem departamento)'; m.set(d, (m.get(d) ?? 0) + 1); }
    return m;
}
