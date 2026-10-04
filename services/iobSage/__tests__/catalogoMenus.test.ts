import { describe, expect, it } from 'vitest';
import { MENUS_IOB, resumoSituacao } from '../catalogoMenus';

const itens = MENUS_IOB.flatMap(m => m.itens);

describe('catálogo IOB SAGE × Consultor DP', () => {
    it('ids únicos e todo item com fonte, descrição e situação no Consultor DP', () => {
        expect(new Set(itens.map(i => i.id)).size).toBe(itens.length);
        for (const i of itens) {
            expect(i.fonte.trim(), i.id).not.toBe('');
            expect(i.descricao.trim(), i.id).not.toBe('');
            expect(i.noConsultor.trim(), i.id).not.toBe('');
        }
    });

    it('item disponível sempre aponta para a tela onde está; planejado sempre diz a fase', () => {
        for (const i of itens) {
            if (i.situacao === 'disponivel') expect(i.destino, i.id).toBeTruthy();
            if (i.situacao === 'planejado') expect(i.fase, i.id).toBeTruthy();
        }
    });

    it('SST fica fora do escopo (decisão de 03/10/2026) e a restauração do backup está disponível', () => {
        expect(itens.find(i => i.id === 'es-sst')?.situacao).toBe('fora');
        expect(itens.find(i => i.id === 'ut-restaurar')).toMatchObject({ situacao: 'disponivel', destino: 'iobsage:restaurar' });
    });

    it('funcionários, horários, afastamentos, sindicatos e tabelas legais apontam para o módulo Cadastros', () => {
        expect(itens.find(i => i.id === 'arq-funcionarios')?.destino).toBe('cadastros:funcionarios');
        expect(itens.find(i => i.id === 'arq-sindicatos')?.destino).toBe('cadastros:sindicatos');
        expect(itens.find(i => i.id === 'arq-tabelas')?.destino).toBe('cadastros:tabelas');
        expect(itens.find(i => i.id === 'arq-horarios')?.destino).toBe('cadastros:horarios');
        expect(itens.find(i => i.id === 'arq-afastamentos')?.destino).toBe('cadastros:afastamentos');
    });

    it('o resumo soma todos os itens', () => {
        const r = resumoSituacao();
        expect(r.disponivel + r.parcial + r.planejado + r.fora).toBe(itens.length);
    });
});
