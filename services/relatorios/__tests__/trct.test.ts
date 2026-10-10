import { describe, expect, it } from 'vitest';
import { calcularRescisao } from '../../calculo/motorRescisao';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { secoesDoTrct, trctPdf } from '../trctPdf';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA SOUZA', admissao: '2023-03-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', pis: '12345678901', mae: 'MARIA SOUZA', cargo: 'AUXILIAR', cbo: '411010', logradouro: 'Rua A', numero: '10', municipio: 'São Paulo', uf: 'SP' } };
const resc = (tipo: '02' | '07') => calcularRescisao({ ficha, data: '2026-10-15', tipo, aviso: tipo === '02' ? 'indenizado' : 'trabalhado', afastamentos: [], tabelas: TAB, movimentos: {}, saldoFgts: 500000 });
const valor = (s: ReturnType<typeof secoesDoTrct>, titulo: string, rotulo: string) => s.find(x => x.titulo === titulo)!.linhas.find(l => l.rotulo === rotulo)!.valor;

describe('TRCT (modelo do empregador)', () => {
    it('identificação, causa, aviso e prazo de pagamento', () => {
        const r = resc('02');
        expect(r.situacao).not.toBe('erro');
        const s = secoesDoTrct(r, ficha, { razaoSocial: 'EMPRESA UM LTDA', cnpj: '44388152000189' });
        expect(s.map(x => x.titulo)).toEqual(['Empregador', 'Trabalhador', 'Contrato']);
        expect(valor(s, 'Empregador', 'CNPJ')).toBe('44.388.152/0001-89');
        expect(valor(s, 'Trabalhador', 'CPF')).toBe('529.982.247-25');
        expect(valor(s, 'Trabalhador', 'Nome da mãe')).toBe('MARIA SOUZA');
        expect(valor(s, 'Contrato', 'Causa do afastamento')).toBe('Sem justa causa, por iniciativa do empregador (motivo 02 da Tabela 19 do eSocial)');
        expect(valor(s, 'Contrato', 'Aviso prévio')).toMatch(/^indenizado, 39 dias \(projeção até /);
        expect(valor(s, 'Contrato', 'Salário contratual')).toBe('R$ 3.000,00');
        expect(valor(s, 'Contrato', 'Pagamento até')).toBe('25/10/2026 (CLT, art. 477, § 6º)');
        expect(valor(secoesDoTrct(resc('07'), ficha, { razaoSocial: 'E', cnpj: '44388152000189' }), 'Contrato', 'Aviso prévio')).not.toContain('indenizado');
    });
    it('PDF com verbas, deduções, FGTS e quitação; prévia com marca', () => {
        const r = resc('02');
        const doc = trctPdf([r, { ...r, situacao: 'erro' }], [ficha], { empresa: { razaoSocial: 'EMPRESA UM LTDA', cnpj: '44388152000189' }, titulo: 'TRCT', previa: true });
        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
        expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000);
    });
});
