// Relação de depósito bancário (Valores de Salários para Bancos do SAGE): dados fictícios.
import { describe, expect, it } from 'vitest';
import { relacaoDeposito, OPCOES_RELACAO_PADRAO } from '../relacaoDeposito';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Favorecido } from '../cnab240';

const ficha = (id: string, nome: string, cpf: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({
    ...fichaVazia({ id: 'E', cnpj: '44388152000189' }), id, cpf, matriculaEsocial: id, dados: { nome, codigoIob: id, rg: '12.345.678-9', orgaoRg: 'SSP', ...dados } });
const fav = (ref: string, nome: string, cpf: string, banco: string, valor: number, x: Partial<Favorecido> = {}): Favorecido => ({
    ref, nome, cpf, banco, agencia: '3145', conta: '22755-3', tipoConta: 'corrente', pix: '', valor, dataPagamento: '2026-10-20', ...x });

const FICHAS = [ficha('000052', 'BRUNO', '22319243828'), ficha('000002', 'ANA', '30372239870'), ficha('000010', 'CAIO', '37678021801', { dataDesligamento: '2026-10-05' })];
const FAVS = [fav('000052', 'BRUNO', '22319243828', '341', 125600), fav('000002', 'ANA', '30372239870', '001', 372000), fav('000010', 'CAIO', '37678021801', '341', 177200)];

describe('relação de depósito bancário', () => {
    it('por nome, com banco, agência, conta, CPF, funcionário, código e valor; total geral', () => {
        const t = relacaoDeposito(FAVS, FICHAS, OPCOES_RELACAO_PADRAO);
        expect(t.colunas.map(c => c.titulo)).toEqual(['Banco', 'Agência', 'Conta/DV', 'C.P.F.', 'Funcionário', 'Código', 'Valor dep.']);
        expect(t.linhas.map(l => l[4])).toEqual(['ANA', 'BRUNO', 'CAIO']);
        expect(t.linhas[1]).toEqual(['341', '3145', '22755-3', '223.192.438-28', 'BRUNO', '000052', '1.256,00']);
        expect(t.totais?.slice(-2)).toEqual(['3 funcionário(s)', '6.748,00']);
    });
    it('RG ou sem documento; sem os demitidos', () => {
        expect(relacaoDeposito(FAVS, FICHAS, { ...OPCOES_RELACAO_PADRAO, documento: 'rg' }).linhas[0][3]).toBe('12.345.678-9 SSP');
        expect(relacaoDeposito(FAVS, FICHAS, { ...OPCOES_RELACAO_PADRAO, documento: 'nenhum' }).colunas).toHaveLength(6);
        const semDem = relacaoDeposito(FAVS, FICHAS, { ...OPCOES_RELACAO_PADRAO, imprimirDemitidos: false });
        expect(semDem.linhas.map(l => l[4])).toEqual(['ANA', 'BRUNO']);
        expect(semDem.observacao).toMatch(/1 demitido/);
    });
    it('separar bancos com o total de cada um; somente totais', () => {
        const t = relacaoDeposito(FAVS, FICHAS, { ...OPCOES_RELACAO_PADRAO, separarBancos: true });
        expect(t.linhas.map(l => l[4] || l[0])).toEqual(['ANA', 'Total do banco 001', 'BRUNO', 'CAIO', 'Total do banco 341']);
        expect(t.linhas[4].slice(-1)).toEqual(['3.028,00']);
        const tot = relacaoDeposito(FAVS, FICHAS, { ...OPCOES_RELACAO_PADRAO, separarBancos: true, somenteTotais: true });
        expect(tot.linhas.map(l => l[0])).toEqual(['Total do banco 001', 'Total do banco 341']);
    });
    it('PIX sem conta aparece na conta', () => {
        const t = relacaoDeposito([fav('000002', 'ANA', '30372239870', '', 1000, { conta: '', agencia: '', pix: 'ana@x.com' })], FICHAS, OPCOES_RELACAO_PADRAO);
        expect(t.linhas[0].slice(0, 3)).toEqual(['—', '', 'PIX ana@x.com']);
    });
});
