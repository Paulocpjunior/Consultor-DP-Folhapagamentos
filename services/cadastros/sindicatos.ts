// services/cadastros/sindicatos.ts
//
// Arquivos › Sindicatos do IOB Office: identificação do sindicato, data-base e
// os dados da convenção coletiva que o DP consulta. Os parâmetros que entram no
// cálculo (piso, adicionais, desconto sindical) passam a ser usados pelo motor
// da Fase 3; até lá o cadastro é a referência única do escritório.
// O id do documento é o CNPJ: o mesmo sindicato serve a várias empresas, e o
// funcionário aponta para ele pelo CNPJ que vem do S-2200.

import { UFS, cnpjValido, dataValida, limparCnpj } from './documentos';

export interface Sindicato {
    id: string;
    cnpj: string;
    nome: string;
    codigoIob: string;
    categoria: string;
    dataBase: string; // mês, "1" a "12"
    uf: string;
    municipio: string;
    pisoSalarial: number | null; // centavos
    registroMte: string;
    vigenciaInicio: string;
    vigenciaFim: string;
    contribuicao: string;
    observacoes: string;
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function sindicatoVazio(): Sindicato {
    return { id: '', cnpj: '', nome: '', codigoIob: '', categoria: '', dataBase: '', uf: '', municipio: '', pisoSalarial: null, registroMte: '', vigenciaInicio: '', vigenciaFim: '', contribuicao: '', observacoes: '' };
}

export function normalizarSindicato(s: Sindicato): Sindicato {
    const cnpj = limparCnpj(s.cnpj);
    return {
        ...s, cnpj, id: cnpj, nome: s.nome.trim(), codigoIob: s.codigoIob.trim(), categoria: s.categoria.trim(),
        uf: s.uf.trim().toUpperCase(), municipio: s.municipio.trim(), registroMte: s.registroMte.trim().toUpperCase(),
        contribuicao: s.contribuicao.trim(), observacoes: s.observacoes.trim(),
    };
}

export function validarSindicato(s: Sindicato, existentes: Sindicato[] = [], editandoId = ''): string[] {
    const erros: string[] = [];
    if (!cnpjValido(s.cnpj)) erros.push('CNPJ inválido.');
    else if (!editandoId && existentes.some(e => e.cnpj === s.cnpj)) erros.push('Já existe um sindicato com este CNPJ.');
    if (editandoId && editandoId !== s.cnpj) erros.push('O CNPJ identifica o sindicato e não pode ser trocado; cadastre outro.');
    if (!s.nome) erros.push('Informe o nome.');
    if (s.dataBase && !/^([1-9]|1[0-2])$/.test(s.dataBase)) erros.push('Data-base deve ser um mês de 1 a 12.');
    if (s.uf && !UFS.includes(s.uf)) erros.push('UF inválida.');
    if (s.pisoSalarial !== null && (!Number.isInteger(s.pisoSalarial) || s.pisoSalarial <= 0)) erros.push('Piso salarial inválido.');
    for (const [k, r] of [['vigenciaInicio', 'Início'], ['vigenciaFim', 'Fim']] as const) if (s[k] && !dataValida(s[k])) erros.push(`${r} da vigência da convenção: data inválida.`);
    if (s.vigenciaInicio && s.vigenciaFim && dataValida(s.vigenciaInicio) && dataValida(s.vigenciaFim) && s.vigenciaFim < s.vigenciaInicio) erros.push('Fim da vigência anterior ao início.');
    if ((s.pisoSalarial !== null || s.registroMte) && !s.vigenciaInicio) erros.push('Informe o início da vigência da convenção de onde saiu o piso ou o registro.');
    return erros;
}

/** Convenção vencida ou a vencer em até 30 dias, na data informada (AAAA-MM-DD). */
export function situacaoConvencao(s: Sindicato, hoje: string): 'sem' | 'vigente' | 'a vencer' | 'vencida' {
    if (!s.vigenciaFim || !dataValida(s.vigenciaFim)) return 'sem';
    if (s.vigenciaFim < hoje) return 'vencida';
    const limite = new Date(`${hoje}T00:00:00Z`); limite.setUTCDate(limite.getUTCDate() + 30);
    return s.vigenciaFim <= limite.toISOString().slice(0, 10) ? 'a vencer' : 'vigente';
}
