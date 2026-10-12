import { describe, expect, it } from 'vitest';
import { extrairFicha, extrairPaginasFicha, conferirIdentidade, compararFicha, type ItemFicha } from '../fichaPdf';
import type { Cadastro } from '../implantacao';
// Dados fictícios; geometria de uma ficha em colunas, sem documento real versionado.
const item = (texto: string, x: number, y: number): ItemFicha => ({ texto, x, y, largura: 30 });
const itens = [item('REGISTRO DE EMPREGADO', 0, 900),
    item('Matrícula eSocial', 0, 880), item('000123', 2, 870), item('Nº', 300, 880), item('000002', 302, 870),
    item('CNPJ', 0, 840), item('11.222.333/0001-81', 2, 830),
    item('Empregado', 0, 800), item('PESSOA TESTE', 2, 790), item('Beneficiários', 300, 800), item('OUTRA PESSOA', 302, 790),
    item('CPF', 0, 760), item('529.982.247-25', 2, 750),
    item('Pai', 0, 720), item('PAI TESTE', 2, 710), item('Mãe', 0, 700), item('MAE TESTE', 2, 690),
    item('Cédula de Identidade', 0, 660), item('1234567', 2, 650), item('Data de emissão', 150, 660), item('01/02/2020', 152, 650),
    item('CTPS', 0, 620), item('0001234', 2, 610), item('Série', 100, 620), item('0099', 102, 610),
    item('Data de Admissão', 0, 580), item('16/09/2026', 2, 570), item('Salário', 150, 580), item('R$', 152, 570), item('3.243,65', 200, 570), item('Por', 300, 580), item('Mês', 302, 570),
    item('Sob nº', 0, 540), item('130.54012.04-1', 2, 530),
    item('Salário', 0, 500), item('1.000,00', 2, 490),
];
const c: Cadastro = { chave: 'x', empregador: '11222333', cpf: '52998224725', matricula: '000123', dados: { nome: 'PESSOA TESTE', salario: '3000.00' }, origens: {}, eventos: [], pendencias: [], desligado: false };
describe('ficha PDF e união por identidade', () => {
    it('lê por colunas e separa matrícula eSocial do número da ficha; ignora salário histórico', () => {
        const f = extrairFicha(itens);
        expect(f.matricula).toBe('000123'); expect(f.dados.matriculaIob).toBeUndefined();
        expect(f.dados.nome).toBe('PESSOA TESTE'); expect(f.dados.salario).toBe('3243.65');
        expect(f.dados.ctps).toBe('0001234'); expect(f.dados.serieCtps).toBe('0099');
        expect(f.dados.admissao).toBe('2026-09-16'); expect(f.dados.pis).toBe('13054012041');
        expect(conferirIdentidade(f, c, '11222333000181')).toEqual([]);
    });
    it('não une outra empresa, CPF ou matrícula, inclusive quando só difere o zero inicial', () => {
        const f = extrairFicha(itens);
        expect(conferirIdentidade({ ...f, cnpj: '11222333000262', cpf: '123', matricula: '123' }, c, '11222333000181')).toHaveLength(3);
    });
    it('separa campos iguais, ausentes e divergentes sem sobrescrever o cadastro', () => {
        const f = extrairFicha(itens); const r = compararFicha(f, c);
        expect(r.find(x => x.campo === 'nome')?.situacao).toBe('igual');
        expect(r.find(x => x.campo === 'mae')?.situacao).toBe('complemento');
        expect(r.find(x => x.campo === 'salario')?.situacao).toBe('divergencia');
        expect(c.dados.salario).toBe('3000.00');
    });
    it('recusa modelo desconhecido e preserva campos vazios sem ler a próxima linha', () => {
        expect(() => extrairFicha([])).toThrow('Modelo');
        expect(extrairFicha(itens.filter(x => x.texto !== 'MAE TESTE')).dados.mae).toBeUndefined();
    });
});

it('aceita cabeçalho repetido na continuação de jornada e rejeita duas fichas cadastrais', () => {
    const continuacao = [item('REGISTRO DE EMPREGADO', 0, 900), item('DISCRIMINAÇÃO DO HORÁRIO DE TRABALHO', 0, 850)];
    expect(extrairPaginasFicha([itens, continuacao]).dados.nome).toBe('PESSOA TESTE');
    expect(() => extrairPaginasFicha([itens, itens])).toThrow('várias fichas');
});
