import { expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { gerarModeloCadastroIobXlsx, HEADERS_FIXOS_CADASTRO, nomeArquivoModeloCadastro } from '../modeloCadastroExcel';
import { LAYOUT_PADRAO } from '../layoutCadastroIob';
import { HEADERS_LANCAMENTOS } from '../../folha/templateApontamentoIobSage';
import type { FuncionarioUnificado } from '../unificacao';

const f: FuncionarioUnificado = {
    chave: 'k', empregador: '11222333', cpf: '52998224725', matricula: '000123',
    dados: { matriculaIob: '000123', nome: '=PESSOA()', mae: 'MAE TESTE', nascimento: '1990-01-31', admissao: '2026-09-16', cargo: 'AUXILIAR', salario: '3243.65', cep: '01234567' },
    origens: { mae: 'Ficha PDF: ficha.pdf · SHA-256 abc' }, ficha: { nome: 'ficha.pdf', hash: 'abc' },
    complementosPdf: ['mae'], divergencias: [{ campo: 'salario', rotulo: 'Salário', xml: '3243.65', pdf: '3000.00' }],
    dependentes: [{ tipo: '03', nome: 'DEP TESTE', nascimento: '2010-01-02', cpf: '11111111111', irrf: 'S', salarioFamilia: 'N' }],
    pendencias: ['Histórico incompleto'], desligado: false,
    cadastro: { chave: 'k', empregador: '11222333', cpf: '52998224725', matricula: '000123', dados: {}, origens: {}, pendencias: [], eventos: [], desligado: false },
};

it('gera modelo cadastral com colunas do layout, sem colunas de apontamento e com células de texto', () => {
    const wb = XLSX.read(gerarModeloCadastroIobXlsx('11222333000181', '2026-09-30', [f], LAYOUT_PADRAO, ['Aviso geral'], [{ nome: 'x.pdf', motivo: 'CPF não localizado' }]), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Funcionários', 'Dependentes', 'Origem dos campos', 'Pendências', 'Layout TXT', 'Instruções']);
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Funcionários'], { header: 1, defval: '' });
    expect(rows[3].slice(0, 3)).toEqual(HEADERS_FIXOS_CADASTRO);
    expect(rows[3]).toContain('Nome da mãe');
    expect(rows[3]).toContain('Salário fixo (decimal com ponto)');
    for (const h of ['Código Evento', 'Tipo (R/V)', 'Referência', 'Valor (R$)']) expect(rows[3]).not.toContain(h);
    expect(rows[3].filter(h => HEADERS_LANCAMENTOS.includes(h))).toEqual(['Nome do Funcionário']);
    expect(rows[4][0]).toBe('000123');
    expect(rows[4][1]).toBe('=PESSOA()');
    expect(wb.Sheets['Funcionários'].B5.f).toBeUndefined();
    expect(wb.Sheets['Funcionários'].A5).toMatchObject({ t: 's', v: '000123' });
    expect(rows[4][rows[3].indexOf('Nascimento')]).toBe('31/01/1990');
    expect(rows[4][rows[3].indexOf('CEP')]).toBe('01234567');
    expect(rows[4][rows[3].indexOf('Ficha PDF')]).toBe('ficha.pdf');
    expect(rows[4][rows[3].indexOf('Divergências XML × PDF')]).toContain('3000.00');
    const deps = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets['Dependentes']);
    expect(deps[0]['Nome do dependente']).toBe('DEP TESTE');
    expect(deps[0]['Nascimento']).toBe('02/01/2010');
    const todas = wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    expect(todas).toContain('Aviso geral');
    expect(todas).toContain('x.pdf não unida: CPF não localizado');
    expect(todas).toContain('Histórico incompleto');
    expect(todas).toContain('ficha.pdf · SHA-256 abc');
    expect(todas).toContain('Importação de Funcionários/Base de Cálculo');
    expect(todas).not.toContain('JOÃO DA SILVA');
    const layoutRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Layout TXT'], { header: 1, defval: '' });
    const cab = layoutRows.findIndex(l => l[0] === 'Ordem');
    expect(layoutRows[cab + 1].slice(0, 6)).toEqual(['1', 'Código do funcionário (matrícula eSocial)', 'codigoIob', '1', '6', '6']);
    expect(nomeArquivoModeloCadastro('11.222.333/0001-81')).toBe('template-cadastro-iob-sage-11222333000181.xlsx');
});
