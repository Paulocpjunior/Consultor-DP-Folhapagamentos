import { describe, expect, it } from 'vitest';
import { sindicatoVazio } from '../../cadastros/sindicatos';
import { prazosSindicatos } from '../../prazos/prazosFuncionarios';
import { avisosConvencao, convencaoVazia, renovacaoDoSindicato, type ConvencaoColetiva } from '../convencao';

const S = '11222333000181';
const conv = (ini: string, fim: string, extra: Partial<ConvencaoColetiva> = {}): ConvencaoColetiva => ({ ...convencaoVazia(S), id: `${S}_${ini}`, vigenciaInicio: ini, vigenciaFim: fim, dataBase: '5', ...extra });
const C25 = conv('2025-05-01', '2026-04-30');
const C26 = conv('2026-05-01', '2027-04-30');

describe('renovação da convenção', () => {
    it('em dia, a vencer, em atraso (com a contagem de dias) e sem convenção', () => {
        expect(renovacaoDoSindicato([C25, C26], S, '2026-10-11')).toMatchObject({ situacao: 'em-dia', renovacao: '2027-05-01', dias: 202, sinal: 'verde', rotulo: 'vigente; renova em 01/05/2027 (faltam 202 dias)' });
        expect(renovacaoDoSindicato([C26], S, '2027-04-30')).toMatchObject({ situacao: 'a-vencer', dias: 1, sinal: 'amarelo', rotulo: 'renovação em 01/05/2027 (falta 1 dia)' });
        expect(renovacaoDoSindicato([C26], S, '2027-05-01')).toMatchObject({ situacao: 'em-atraso', dias: 1, sinal: 'laranja', rotulo: 'nova convenção em atraso há 1 dia (deveria valer desde 01/05/2027)' });
        expect(renovacaoDoSindicato([C26], S, '2027-06-15')).toMatchObject({ situacao: 'em-atraso', dias: 46, sinal: 'vermelho' });
        // A nova cadastrada (mesmo depois do vencimento) zera o atraso.
        expect(renovacaoDoSindicato([C25, C26], S, '2026-06-15').situacao).toBe('em-dia');
        expect(renovacaoDoSindicato([], S, '2026-10-11')).toMatchObject({ situacao: 'sem-convencao', sinal: 'cinza' });
    });
    it('avisos ao gravar: data-base, intervalo, sobreposição e convenção já vencida', () => {
        expect(avisosConvencao(C26, [C25], '2026-10-11')).toEqual([]);
        expect(avisosConvencao(conv('2026-05-01', '2027-05-31'), [C25], '2026-10-11')[0]).toMatch(/A renovação \(01\/06\/2027\) não cai no mês da data-base \(5\)/);
        expect(avisosConvencao(conv('2026-07-01', '2027-04-30'), [C25], '2026-10-11')).toContain('Intervalo sem convenção de 01/05/2026 a 30/06/2026 (a anterior venceu em 30/04/2026).');
        expect(avisosConvencao(conv('2026-03-01', '2027-04-30'), [conv('2025-03-01', '2026-04-30')], '2026-10-11')).toContain('Vigência sobrepõe a anterior (que vai até 30/04/2026).');
        expect(avisosConvencao(C25, [], '2026-10-11')).toContain('Esta convenção já venceu em 30/04/2026: a nova está 164 dia(s) em atraso.');
    });
    it('no painel de prazos: atraso sempre listado; renovação dentro do horizonte; sem convenção, a vigência do cadastro', () => {
        const sind = { ...sindicatoVazio(), id: S, cnpj: S, nome: 'SINDICATO X' };
        const atraso = prazosSindicatos([sind], '2027-09-01', '2027-10-31', [C26]);
        expect(atraso).toEqual([expect.objectContaining({ tipo: 'convencao', gravidade: 'vencido', data: '2027-05-01', titulo: 'Nova convenção em atraso há 124 dias' })]);
        expect(prazosSindicatos([sind], '2027-04-10', '2027-05-31', [C26])[0]).toMatchObject({ titulo: 'Renovação da convenção coletiva', gravidade: 'urgente', detalhe: expect.stringMatching(/faltam 21 dias/) });
        expect(prazosSindicatos([sind], '2026-10-11', '2026-12-31', [C26])).toEqual([]);
        expect(prazosSindicatos([{ ...sind, vigenciaFim: '2026-11-30' }], '2026-10-11', '2026-12-31', [])[0]).toMatchObject({ titulo: 'Convenção coletiva vence' });
    });
});
