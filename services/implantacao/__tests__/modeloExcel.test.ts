import { expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { gerarModeloCadastroXlsx } from '../modeloExcel';
import { novoDossie } from '../dossie';
import type { Cadastro } from '../implantacao';
import { gerarTemplateApontamentoXlsx, HEADERS_LANCAMENTOS } from '../../folha/templateApontamentoIobSage';

const cadastro: Cadastro = {
    chave: 'teste', empregador: '11222333', cpf: '01234567890', matricula: '000123',
    dados: { nome: '=TESTE()', mae: 'MAE TESTE', cep: '01234567', salario: '3243.65',
        matriculaIob: '999999', dependentes: '[{"nmDep":"DEPENDENTE TESTE"}]' },
    origens: { nome: 'evento.xml', mae: 'ficha.pdf' },
    pendencias: ['Histórico incompleto'], eventos: [], desligado: false,
};
it('preserva colunas do modelo, identidade textual e cadastro completo sem gerar apontamentos fictícios', () => {
    const d = { ...novoDossie(), cnpj: '11222333000181' };
    const wb = XLSX.read(gerarModeloCadastroXlsx(d, [cadastro], ['Revisar fontes']), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Lançamentos'], { header: 1, defval: '' });
    expect(rows[3]).toEqual(HEADERS_LANCAMENTOS);
    expect(rows).toHaveLength(5);
    expect(rows[4].slice(0, 7)).toEqual(['000123', '=TESTE()', '', '', '', '', '']);
    const ws = wb.Sheets.Cadastro;
    expect(ws.A2).toMatchObject({ t: 's', v: '000123' });
    expect(ws.C2).toMatchObject({ t: 's', v: '01234567890' });
    expect(ws.B2.f).toBeUndefined();
    const registros = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
    expect(registros[0]['Nome da mãe']).toBe('MAE TESTE');
    expect(registros[0]['CEP']).toBe('01234567');
    expect(registros[0]['Salário fixo (decimal com ponto)']).toBe('3243.65');
    expect(registros[0]['Dependentes (dados do XML)']).toContain('DEPENDENTE TESTE');
    const todas = wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    expect(todas).toContain('ficha.pdf');
    expect(todas).toContain('evento.xml');
    expect(todas).toContain('Histórico incompleto');
    expect(todas).toContain('Revisar fontes');
    expect(todas).toContain('não cria funcionários na SAGE');
    expect(todas).not.toContain('999999');
    expect(todas).not.toContain('JOÃO DA SILVA');
});
it('não trunca matrículas longas ou alfanuméricas no Excel', () => {
    const wb = XLSX.read(gerarModeloCadastroXlsx(novoDossie(), [{ ...cadastro, matricula: 'AB000123456' }], []), { type: 'array' });
    expect(wb.Sheets.Cadastro.A2.v).toBe('AB000123456');
    expect(wb.Sheets['Lançamentos'].A5.v).toBe('AB000123456');
});
it('mantém o modelo mensal com seus exemplos e orienta importar Excel no app', () => {
    const wb = XLSX.read(gerarTemplateApontamentoXlsx(), { type: 'array' });
    expect(wb.Sheets['Lançamentos'].C5.v).toBe('0080');
    const inst = XLSX.utils.sheet_to_csv(wb.Sheets['Instruções']);
    expect(inst).toContain('No Consultor DP');
    expect(inst).not.toContain('Selecione este arquivo .xlsx e confirme');
});
