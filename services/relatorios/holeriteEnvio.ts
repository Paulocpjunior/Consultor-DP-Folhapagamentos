// services/relatorios/holeriteEnvio.ts
//
// Holerite por e-mail (Impressos › Holerite › Envio para email do Funcionário do IOB SAGE): a seleção dos holerites a
// enviar a cada funcionário. Os campos do SAGE: código inicial e final, departamento, tipo (mensal, adiantamento,
// férias, 13º, rescisão), data do crédito, período, imprimir demitidos, informação do departamento e a mensagem.
// O envio em si é o de holeritePorEmail.ts (e-mail do escritório ou WhatsApp, para o contato da própria ficha). Puro.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { TipoEnvio } from './enviosFuncionario';

export type TipoHoleriteEnvio = 'mensal' | 'adiantamento' | 'ferias' | '13-1a' | '13-2a' | 'rescisao';
export const TIPOS_HOLERITE_ENVIO: { tipo: TipoHoleriteEnvio; rotulo: string; titulo: string }[] = [
    { tipo: 'mensal', rotulo: 'Mensal', titulo: 'Holerite' },
    { tipo: 'adiantamento', rotulo: 'Adiantamento', titulo: 'Recibo de adiantamento' },
    { tipo: 'ferias', rotulo: 'Férias', titulo: 'Recibo de férias' },
    { tipo: '13-1a', rotulo: '13º salário — 1ª parcela', titulo: 'Holerite do 13º (1ª parcela)' },
    { tipo: '13-2a', rotulo: '13º salário — 2ª parcela', titulo: 'Holerite do 13º (2ª parcela)' },
    { tipo: 'rescisao', rotulo: 'Rescisão', titulo: 'Recibo da rescisão' },
];
/** O tipo do histórico de envios (o mensal é o "holerite" de sempre). */
export const tipoDoHistorico = (t: TipoHoleriteEnvio): TipoEnvio => (t === 'mensal' ? 'holerite' : `holerite-${t}` as TipoEnvio);

export interface SelecaoHolerites {
    /** Código do funcionário (o do IOB, ou a matrícula): inicial e final; vazio = sem limite. */
    codigoDe: string;
    codigoAte: string;
    /** Departamento da ficha; vazio = todos. */
    departamento: string;
    /** Imprimir demitidos (desligados): sem marcar, ficam de fora. */
    demitidos: boolean;
}
export const SELECAO_PADRAO: SelecaoHolerites = { codigoDe: '', codigoAte: '', departamento: '', demitidos: true };

/** Código do funcionário para a seleção: o do IOB (sem os zeros à esquerda) ou a matrícula. */
export const codigoDaFicha = (f: FichaFuncionario) => (f.dados.codigoIob || f.matriculaEsocial || '').replace(/^0+(?=\d)/, '');
const comparar = (a: string, b: string) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : a.localeCompare(b, 'pt-BR', { numeric: true }));

/** Os holerites da seleção (sem erro), na ordem do nome. */
export function selecionarHolerites(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], s: SelecaoHolerites): ResultadoCalculo[] {
    const porId = new Map(fichas.map(f => [f.id, f]));
    const de = s.codigoDe.trim().replace(/^0+(?=\d)/, ''); const ate = s.codigoAte.trim().replace(/^0+(?=\d)/, '');
    return resultados.filter(r => {
        if (r.situacao === 'erro') return false;
        const f = porId.get(r.fichaId);
        if (!f) return false;
        const cod = codigoDaFicha(f);
        if (de && comparar(cod, de) < 0) return false;
        if (ate && comparar(cod, ate) > 0) return false;
        if (s.departamento && (f.dados.departamento || f.dados.departamentoIob || '') !== s.departamento) return false;
        if (!s.demitidos && (f.situacao === 'desligado' || !!f.dados.dataDesligamento)) return false;
        return true;
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Departamentos das fichas (para o filtro). */
export const departamentosDasFichas = (fichas: FichaFuncionario[]) =>
    [...new Set(fichas.map(f => f.dados.departamento || f.dados.departamentoIob || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
