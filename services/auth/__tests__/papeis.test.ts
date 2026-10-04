import { describe, expect, it } from 'vitest';
import { ehAdmin, ehAprovado, ehGestor, ehMaster, papelEfetivo, papeisPermitidos, podeMudarPapel } from '../papeis';

describe('hierarquia de papéis', () => {
    it('gestor > admin > colaborador > pendente', () => {
        expect([ehGestor('gestor'), ehAdmin('gestor'), ehAprovado('gestor')]).toEqual([true, true, true]);
        expect([ehGestor('admin'), ehAdmin('admin'), ehAprovado('admin')]).toEqual([false, true, true]);
        expect([ehGestor('colaborador'), ehAdmin('colaborador'), ehAprovado('colaborador')]).toEqual([false, false, true]);
        expect([ehAdmin('pendente'), ehAprovado('pendente')]).toEqual([false, false]);
        expect(papelEfetivo('owner')).toBe('pendente');
        expect(papelEfetivo(undefined)).toBe('pendente');
    });

    it('master pelo e-mail, sem diferenciar maiúsculas', () => {
        expect(ehMaster(' Junior@SPAssessoriaContabil.com.br ')).toBe(true);
        expect(ehMaster('outro@spassessoriacontabil.com.br')).toBe(false);
    });

    it('ninguém muda o próprio papel', () => {
        expect(podeMudarPapel('gestor', true, 'gestor', 'admin')).toBe(false);
        expect(papeisPermitidos('admin', true, 'admin')).toEqual([]);
    });

    it('gestor muda qualquer um para qualquer papel', () => {
        expect(papeisPermitidos('gestor', false, 'admin')).toEqual(['gestor', 'colaborador', 'pendente']);
        expect(papeisPermitidos('gestor', false, 'pendente')).toEqual(['gestor', 'admin', 'colaborador']);
    });

    it('admin só entre pendente e colaborador; não toca em admin nem gestor', () => {
        expect(papeisPermitidos('admin', false, 'pendente')).toEqual(['colaborador']);
        expect(papeisPermitidos('admin', false, 'colaborador')).toEqual(['pendente']);
        expect(papeisPermitidos('admin', false, 'admin')).toEqual([]);
        expect(papeisPermitidos('admin', false, 'gestor')).toEqual([]);
        expect(papeisPermitidos('colaborador', false, 'pendente')).toEqual([]);
    });
});
