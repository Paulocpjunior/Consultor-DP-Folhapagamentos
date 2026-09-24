import { describe, expect, it } from 'vitest';
import { exportarTXT } from '../apontamentoExporter';
import type { Lancamento } from '../folhaTypes';
const lancamento = (matricula: string | null): Lancamento => ({
    empresa: 'TESTE', codigoSage: '1405', funcionario: 'FUNCIONARIO TESTE',
    matricula, evento: '1280', coluna: '', descricao_evento: '', tipo: 'V', rv: 'V', valor: 0, origem: 'padrao',
});
describe('identificação no TXT IOB', () => {
    it('preserva matrícula e estrutura do layout existente sem valores', () => {
        expect(exportarTXT([lancamento('836292')])).toBe('8362921280' + '0'.repeat(14) + '  ' + '0'.repeat(14) + '\r\n');
    });
    it('preserva zeros e completa apenas o campo numérico de seis posições', () => {
        expect(exportarTXT([lancamento('000123')]).slice(0, 6)).toBe('000123');
        expect(exportarTXT([lancamento('123')]).slice(0, 6)).toBe('000123');
    });
    it.each(['1234567', 'ABC123', '', null])('bloqueia matrícula %s sem truncar ou remover letras', matricula => {
        expect(() => exportarTXT([lancamento(matricula)])).toThrow('não alterar');
    });
});
