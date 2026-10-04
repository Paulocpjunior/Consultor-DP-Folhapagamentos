// services/prazos/prazosFuncionarios.ts
//
// Prazos que saem dos cadastros: fim de contrato por prazo determinado,
// férias (período concessivo), retorno de afastamento, 16º dia de
// doença/acidente e convenção coletiva a vencer. ASO fica fora: SST é da
// medicina do trabalho dos clientes (decisão de 03/10/2026).
//
// Férias: período aquisitivo de 12 meses desde a admissão e concessão nos
// 12 meses seguintes (CLT art. 130 e 134). Dia gozado fora do concessivo é
// pago em dobro (art. 137; Súmula 81 do TST), então o último dia para
// COMEÇAR 30 dias de férias é o fim do concessivo menos 29 dias. Gozo
// reconhecido: afastamentos com motivo 15. Não considera redução por faltas
// (art. 130) nem perda do direito (art. 133): a tela avisa.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import type { Sindicato } from '../cadastros/sindicatos';
import { MESES } from '../cadastros/sindicatos';
import { dataValida } from '../cadastros/documentos';
import { br, diasEntre, somarDias, somarMeses, type Data } from './calendario';

export type TipoPrazo = 'contrato' | 'ferias' | 'retorno' | 'inss' | 'convencao' | 'database';
export interface Prazo {
    id: string; tipo: TipoPrazo; data: Data; titulo: string; detalhe: string;
    empresaId?: string; fichaId?: string; nome?: string; gravidade: 'vencido' | 'urgente' | 'normal';
}

export const ROTULO_TIPO: Record<TipoPrazo, string> = {
    contrato: 'Fim de contrato', ferias: 'Férias', retorno: 'Retorno de afastamento', inss: '16º dia (INSS)', convencao: 'Convenção coletiva', database: 'Data-base',
};

const gravidade = (data: Data, hoje: Data, urgenteDias = 15): Prazo['gravidade'] => (data < hoje ? 'vencido' : diasEntre(hoje, data) <= urgenteDias ? 'urgente' : 'normal');

export interface PeriodoFerias { inicio: Data; fim: Data; fimConcessivo: Data; inicioGozoAte: Data; diasGozados: number; completo: boolean }

/** Períodos aquisitivos desde a admissão até hoje, com o gozo reconhecido pelos afastamentos de motivo 15. */
export function periodosFerias(admissao: Data, hoje: Data, ferias: Afastamento[]): PeriodoFerias[] {
    const periodos: PeriodoFerias[] = [];
    for (let k = 0; ; k++) {
        const inicio = somarMeses(admissao, 12 * k);
        if (inicio > hoje) break;
        const fim = somarDias(somarMeses(admissao, 12 * (k + 1)), -1);
        const fimConcessivo = somarDias(somarMeses(admissao, 12 * (k + 2)), -1);
        periodos.push({ inicio, fim, fimConcessivo, inicioGozoAte: somarDias(fimConcessivo, -29), diasGozados: 0, completo: false });
    }
    const dur = (a: Afastamento) => (a.dtFim && dataValida(a.dtFim) ? diasEntre(a.dtInicio, a.dtFim) + 1 : 0);
    const semPeriodo: Afastamento[] = [];
    for (const a of ferias) {
        const p = a.perAquisInicio && periodos.find(x => x.inicio === a.perAquisInicio);
        if (p) p.diasGozados += dur(a); else semPeriodo.push(a);
    }
    // Férias sem período aquisitivo informado: abatem o período completo mais antigo ainda em aberto.
    for (const a of semPeriodo.sort((x, y) => x.dtInicio.localeCompare(y.dtInicio))) {
        const p = periodos.find(x => x.fim < a.dtInicio && x.diasGozados < 30);
        if (p) p.diasGozados += dur(a);
    }
    for (const p of periodos) p.completo = p.diasGozados >= 30;
    return periodos;
}

export function prazosFuncionarios(fichas: FichaFuncionario[], afastamentos: Afastamento[], hoje: Data, ate: Data): Prazo[] {
    const r: Prazo[] = [];
    const porFicha = new Map<string, Afastamento[]>();
    for (const a of afastamentos) porFicha.set(a.fichaId, [...(porFicha.get(a.fichaId) ?? []), a]);
    for (const f of fichas) {
        if (f.situacao !== 'ativo') continue;
        const nome = f.dados.nome || f.cpf;
        const base = { empresaId: f.empresaId, fichaId: f.id, nome };
        const adm = f.dados.admissao;
        const fimC = f.dados.fimContrato;
        if (f.dados.tipoContrato === '2' && fimC && dataValida(fimC) && fimC <= ate && fimC >= somarDias(hoje, -30)) {
            const dias = adm && dataValida(adm) ? diasEntre(adm, fimC) + 1 : 0;
            r.push({ ...base, id: `contrato-${f.id}`, tipo: 'contrato', data: fimC, gravidade: gravidade(fimC, hoje, 7),
                titulo: dias && dias <= 90 ? 'Fim do contrato de experiência' : 'Fim do contrato por prazo determinado',
                detalhe: `${dias ? `${dias} dias de contrato; ` : ''}decidir efetivação, prorrogação (uma vez, até 90 dias no total na experiência — CLT arts. 445 e 451) ou desligamento.` });
        }
        const lista = porFicha.get(f.id) ?? [];
        if (adm && dataValida(adm)) {
            for (const p of periodosFerias(adm, hoje, lista.filter(a => a.motivo === '15'))) {
                if (p.completo || p.fim >= hoje || p.inicioGozoAte > ate) continue;
                const vencido = p.fimConcessivo < hoje;
                r.push({ ...base, id: `ferias-${f.id}-${p.inicio}`, tipo: 'ferias', data: p.inicioGozoAte, gravidade: vencido ? 'vencido' : gravidade(p.inicioGozoAte, hoje, 30),
                    titulo: vencido ? 'Férias vencidas (pagamento em dobro)' : 'Férias: último dia para iniciar o gozo',
                    detalhe: `Período aquisitivo ${br(p.inicio)} a ${br(p.fim)}; concessivo até ${br(p.fimConcessivo)}${p.diasGozados ? `; ${p.diasGozados} dia(s) já gozado(s)` : ''}.` });
            }
        }
        for (const a of lista) {
            if (a.dtFim && dataValida(a.dtFim) && a.dtFim >= somarDias(hoje, -1) && a.dtFim < ate && a.motivo !== '15') {
                const volta = somarDias(a.dtFim, 1);
                r.push({ ...base, id: `retorno-${a.id}`, tipo: 'retorno', data: volta, gravidade: gravidade(volta, hoje, 7), titulo: 'Retorno previsto do afastamento', detalhe: `Motivo ${a.motivo}, afastado desde ${br(a.dtInicio)}.` });
            }
            if (['01', '03'].includes(a.motivo) && a.infoMesmoMtv !== 'S' && dataValida(a.dtInicio)) {
                const dia16 = somarDias(a.dtInicio, 15);
                if (dia16 >= hoje && dia16 <= ate && (!a.dtFim || a.dtFim >= dia16)) r.push({ ...base, id: `inss-${a.id}`, tipo: 'inss', data: dia16, gravidade: gravidade(dia16, hoje, 5), titulo: 'Afastamento passa ao INSS (16º dia)', detalhe: `Afastado desde ${br(a.dtInicio)}: requerer o benefício; a empresa paga até o 15º dia (Lei 8.213/1991, art. 60).` });
            }
        }
    }
    return r;
}

export function prazosSindicatos(sindicatos: Sindicato[], hoje: Data, ate: Data): Prazo[] {
    const r: Prazo[] = [];
    for (const s of sindicatos) {
        if (s.vigenciaFim && dataValida(s.vigenciaFim) && s.vigenciaFim <= ate && s.vigenciaFim >= somarDias(hoje, -60))
            r.push({ id: `convencao-${s.id}`, tipo: 'convencao', data: s.vigenciaFim, gravidade: gravidade(s.vigenciaFim, hoje, 30), nome: s.nome, titulo: 'Convenção coletiva vence', detalhe: `${s.nome}: acompanhar a nova convenção e atualizar piso e cláusulas.` });
        if (/^([1-9]|1[0-2])$/.test(s.dataBase)) {
            const mes = String(s.dataBase).padStart(2, '0');
            let d = `${hoje.slice(0, 4)}-${mes}-01`;
            if (d < hoje.slice(0, 7) + '-01') d = `${Number(hoje.slice(0, 4)) + 1}-${mes}-01`;
            if (d <= ate) r.push({ id: `database-${s.id}-${d}`, tipo: 'database', data: d, gravidade: gravidade(d, hoje, 30), nome: s.nome, titulo: 'Data-base da categoria', detalhe: `${s.nome}: data-base em ${MESES[Number(s.dataBase) - 1]}; reajuste conforme a nova convenção.` });
        }
    }
    return r;
}
