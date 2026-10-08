// Convite de agenda (.ics) com os vencimentos das férias (dados fictícios).
import { describe, expect, it } from 'vitest';
import { dobrar, escaparIcs, eventosDoReciboFerias, gerarIcs, linkGoogleAgenda, textoWhatsApp } from '../convite';
import { calcularFerias } from '../../calculo/motorFerias';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { afastamentoVazio } from '../../cadastros/afastamentos';
import { fichaVazia } from '../../cadastros/funcionarios';

const ficha = (salario: string) => ({ ...fichaVazia({ id: 'emp1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: '000353', situacao: 'ativo' as const,
    dados: { nome: 'JOSE', admissao: '2025-10-30', salario, unidadeSalario: '5', horasSemanais: '44', categoria: '101' } });
const empresa = { nome: 'SP', cnpj: '44388152000189' };

describe('arquivo .ics', () => {
    it('escapa texto e dobra linhas em 75 octetos sem partir acento', () => {
        // RFC 5545: o ponto e vírgula também leva barra ("a;b" vira "a\;b").
        expect(escaparIcs('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
        const longa = `DESCRIPTION:${'é'.repeat(60)}`;
        const d = dobrar(longa);
        for (const l of d.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
        expect(d.replace(/\r\n /g, '')).toBe(longa);
    });
    it('evento de dia inteiro (DTEND no dia seguinte) com lembrete na véspera', () => {
        const ics = gerarIcs([{ uid: 'u1@x', titulo: 'Pagar férias', inicio: '2026-11-06', descricao: 'R$ 4.619,40', lembrete: true }], 'SP', new Date('2026-10-07T12:00:00Z'));
        expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
        expect(ics).toContain('DTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261107\r\n');
        expect(ics).toContain('DTSTAMP:20261007T120000Z');
        expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Pagar férias\r\nTRIGGER:-PT15H\r\nEND:VALARM');
        expect(ics).toContain('DESCRIPTION:R$ 4.619\\,40');
        expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    });
});

describe('eventos do recibo de férias', () => {
    it('José (1200): pagamento antecipado do sábado, gozo, DARF e FGTS de 11/2026; sem IRRF', () => {
        const g = { ...afastamentoVazio(), id: 'g1', fichaId: 'f1', motivo: '15', dtInicio: '2026-11-09', dtFim: '2026-11-28', abonoDias: '10' };
        const r = calcularFerias({ ficha: ficha('3675.00'), gozo: g, afastamentos: [g], tabelas: TABELAS_OFICIAIS_2026, movimentos: {} });
        const ev = eventosDoReciboFerias(r, empresa, g);
        expect(ev.map(e => [e.inicio, e.fim ?? '', e.titulo])).toEqual([
            ['2026-11-06', '', expect.stringMatching(/^Pagar as férias de JOSE \(R\$\s4\.619,40\)$/)],
            ['2026-11-09', '2026-11-28', 'Férias de JOSE'],
            ['2026-12-18', '', expect.stringMatching(/^DARF da DCTFWeb 11\/2026 \(inclui INSS das férias R\$\s280,60\)$/)],
            ['2026-12-18', '', expect.stringMatching(/^FGTS Digital 11\/2026 \(inclui R\$\s261,33 das férias\)$/)],
        ]);
        expect(ev[0].descricao).toMatch(/07\/11\/2026 não é dia útil, antecipado/);
        expect(ev.filter(e => e.lembrete).length).toBe(3);
        expect(linkGoogleAgenda(ev[1])).toContain('dates=20261109%2F20261129');
        expect(textoWhatsApp(ev, 'SP: férias de JOSE')).toContain('• 09/11/2026 a 28/11/2026: Férias de JOSE');
    });
    it('com IRRF retido: o DARF da competência do pagamento leva o IRRF', () => {
        const g = { ...afastamentoVazio(), id: 'g2', fichaId: 'f1', motivo: '15', dtInicio: '2026-12-01', dtFim: '2026-12-30' };
        const r = calcularFerias({ ficha: ficha('9000.00'), gozo: g, afastamentos: [g], tabelas: TABELAS_OFICIAIS_2026, movimentos: {} });
        expect(r.pagamento).toBe('2026-11');
        const darfs = eventosDoReciboFerias(r, empresa, g).filter(e => e.titulo.startsWith('DARF'));
        expect(darfs.map(e => e.titulo.replace(/\s/g, ' '))).toEqual([
            expect.stringMatching(/^DARF da DCTFWeb 11\/2026 \(inclui IRRF das férias R\$ [\d.,]+\)$/),
            expect.stringMatching(/^DARF da DCTFWeb 12\/2026 \(inclui INSS das férias R\$ [\d.,]+\)$/),
        ]);
    });
});
