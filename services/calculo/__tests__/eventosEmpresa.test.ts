// Tabela de eventos da empresa (o que ainda prende ao SAGE, item 2): modelo em Excel, leitura da planilha e do JSON,
// catálogo que vale para a empresa e códigos dos automáticos fora dele (dados fictícios).
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { codigosAusentes, compararComGeral, eventosDaEmpresa, lerTabelaEventos, planilhaEventos } from '../eventosEmpresa';
import type { EventoIobSage } from '../../folha/folhaTypes';

const inc = (s: 'S' | 'N') => ({ ir: s, in: s, irf: s, inf: s, fg: s, rt: s, vr: s });
const E = (codigo: string, descricao: string, extra: Partial<EventoIobSage> = {}): EventoIobSage => ({ codigo, descricao, tipo: 'V', rv: 'R', coeficiente: 1, ro: '040', incidencias: inc('S'), ...extra });
const GERAL = [E('0001', 'SALÁRIO'), E('1015', 'OUTRO EVENTO DO OUTRO CLIENTE', { tipo: 'D' }), E('2000', 'SÓ NO GERAL')];
const xlsx = (aoa: (string | number)[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'E'); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer; };

describe('tabela de eventos da empresa', () => {
    it('o modelo exportado volta igual pela importação', () => {
        const lida = lerTabelaEventos('eventos.xlsx', xlsx(planilhaEventos(GERAL)));
        expect(lida.erros).toEqual([]);
        expect(lida.eventos).toEqual(GERAL);
    });

    it('planilha preenchida à mão: zeros à esquerda, S/N, vírgula decimal; linhas ruins recusadas com o motivo', () => {
        const cab = planilhaEventos([])[0];
        const lida = lerTabelaEventos('e.xlsx', xlsx([cab,
            ['15', 'Triênio', 'v', 'R', '0,5', '40', 'S', 'S', 'S', 'n', 'n', 'S', 'S'],
            ['', 'Sem código', 'V', 'V', 0, '000', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
            ['0020', '', 'V', 'V', 0, '000', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
            ['0021', 'Tipo errado', 'X', 'V', 0, '000', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
            ['15', 'Repetido', 'D', 'V', 0, '000', 'N', 'N', 'N', 'N', 'N', 'N', 'N'],
        ]));
        expect(lida.eventos).toEqual([E('0015', 'Triênio', { coeficiente: 0.5, incidencias: { ir: 'S', in: 'S', fg: 'S', inf: 'N', irf: 'N', rt: 'S', vr: 'S' } })]);
        expect(lida.erros).toEqual([expect.stringMatching(/Linha 3: código/), expect.stringMatching(/Linha 4 \(0020\): sem descrição/), expect.stringMatching(/Linha 5 \(0021\): tipo "X"/), 'Linha 6: código 0015 repetido (linha 2).']);
        expect(() => lerTabelaEventos('e.xlsx', xlsx([['A', 'B'], [1, 2]]))).toThrow(/colunas do modelo/);
    });

    it('JSON do script do PDF (catálogo ou lista)', () => {
        const buf = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer;
        expect(lerTabelaEventos('eventos.json', buf({ cliente: 'X', eventos: GERAL })).eventos).toEqual(GERAL);
        expect(lerTabelaEventos('eventos.json', buf(GERAL)).eventos).toHaveLength(3);
        expect(() => lerTabelaEventos('eventos.json', buf({ a: 1 }))).toThrow(/lista "eventos"/);
    });

    it('catálogo da empresa: substitui ou completa o geral; sem tabela, vale o geral', () => {
        const triênio = E('1015', 'TRIÊNIO');
        expect(eventosDaEmpresa(GERAL, null)).toBe(GERAL);
        expect(eventosDaEmpresa(GERAL, { modo: 'substitui', eventos: [triênio] })).toEqual([triênio]);
        expect(eventosDaEmpresa(GERAL, { modo: 'completa', eventos: [triênio, E('3000', 'NOVO')] }).map(e => `${e.codigo} ${e.descricao}`)).toEqual(['0001 SALÁRIO', '1015 TRIÊNIO', '2000 SÓ NO GERAL', '3000 NOVO']);
    });

    it('prévia em relação ao geral e códigos dos automáticos fora do catálogo', () => {
        expect(compararComGeral(GERAL, [E('0001', 'SALÁRIO'), E('1015', 'TRIÊNIO'), E('3000', 'NOVO')])).toEqual({ novos: ['3000'], diferentes: ['1015'], iguais: 1, soNoGeral: 1 });
        const fichas = [{ dados: { nome: 'ANA' }, lancamentosAutomaticos: [{ codigoEvento: '1015' }, { codigoEvento: '77' }] }, { dados: { nome: 'BRUNO' }, lancamentosAutomaticos: [{ codigoEvento: '0077' }] }];
        expect(codigosAusentes(GERAL, fichas)).toEqual([{ codigo: '0077', fichas: ['ANA', 'BRUNO'] }]);
    });
});
