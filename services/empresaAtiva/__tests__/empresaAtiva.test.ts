// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ativacaoAindaValida, competenciaBr, competenciaPadrao, exigeEmpresaAtiva, gravarEmpresaAtiva, lerEmpresaAtiva, limparEmpresaAtiva, type EmpresaAtiva } from '../empresaAtiva';

const e: EmpresaAtiva = { id: 'E1', nome: 'Alfa', cnpj: '11222333000181', codigoSage: '0001', competencia: '2026-09', ativadaPor: 'a@x', ativadaEm: 1 };
afterEach(() => localStorage.clear());

describe('empresa e período ativos', () => {
    it('competência padrão é o mês anterior; formato brasileiro', () => {
        expect(competenciaPadrao(new Date(2026, 9, 4))).toBe('2026-09');
        expect(competenciaPadrao(new Date(2026, 0, 15))).toBe('2025-12');
        expect(competenciaBr('2026-09')).toBe('09/2026');
    });
    it('guarda por usuário; F5 mantém, sair limpa; dado inválido é ignorado', () => {
        gravarEmpresaAtiva('u1', e);
        expect(lerEmpresaAtiva('u1')).toEqual(e);
        expect(lerEmpresaAtiva('u2')).toBeNull();
        limparEmpresaAtiva('u1');
        expect(lerEmpresaAtiva('u1')).toBeNull();
        localStorage.setItem('dp_empresa_ativa:u3', '{"id":"x","nome":"y","competencia":"2026-13"}');
        expect(lerEmpresaAtiva('u3')).toBeNull();
        localStorage.setItem('dp_empresa_ativa:u4', 'não é json');
        expect(lerEmpresaAtiva('u4')).toBeNull();
    });
    it('ativação guardada some se a empresa saiu da carteira', () => {
        expect(ativacaoAindaValida(e, [{ id: 'E1' }])).toEqual(e);
        expect(ativacaoAindaValida(e, [{ id: 'E2' }])).toBeNull();
    });
    it('Usuários, Empresas e Certificados não exigem ativação; o resto exige', () => {
        expect(exigeEmpresaAtiva('certificados')).toBe(false);
        expect(exigeEmpresaAtiva('admin')).toBe(false);
        expect(exigeEmpresaAtiva('empresas')).toBe(false);
        expect(exigeEmpresaAtiva('calculo')).toBe(true);
        expect(exigeEmpresaAtiva('prazos')).toBe(true);
    });
});
