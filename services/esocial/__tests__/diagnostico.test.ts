import { describe, expect, it } from 'vitest';
import { diagnosticar, perguntaParaMia } from '../diagnostico';

const oc = (descricao: string, localizacao = '') => ({ tipo: 1, codigo: '999', descricao, localizacao });

describe('diagnóstico das ocorrências', () => {
    it('reconhece pelo texto e propõe a correção assistida', () => {
        expect(diagnosticar(oc('O período de apuração informado já está fechado.'), 'S-1200')).toMatchObject({ regra: 'periodo-fechado', acao: 'reabrir-periodo' });
        expect(diagnosticar(oc('Movimento encerrado para a competência'), 'S-1210').acao).toBe('reabrir-periodo');
        expect(diagnosticar(oc('Evento em duplicidade.'), 'S-1200')).toMatchObject({ regra: 'duplicado', acao: 'conciliar' });
        expect(diagnosticar(oc('O recibo informado não corresponde ao evento vigente.'), 'S-1200')).toMatchObject({ regra: 'recibo', acao: 'conciliar' });
        expect(diagnosticar(oc('Não existe demonstrativo de valores para o ideDmDev informado.'), 'S-1210')).toMatchObject({ regra: 'demonstrativo', acao: 'transmitir-s1200-antes' });
        expect(diagnosticar(oc('A rubrica informada não está cadastrada na tabela de rubricas.', 'codRubr'), 'S-1200')).toMatchObject({ regra: 'rubrica', acao: 'cadastro-rubrica' });
        expect(diagnosticar(oc('Trabalhador não cadastrado no eSocial para a matrícula informada.'), 'S-1200').acao).toBe('cadastro-trabalhador');
        expect(diagnosticar(oc('Lotação tributária não cadastrada.', 'codLotacao'), 'S-1200').acao).toBe('cadastro-empresa');
        expect(diagnosticar(oc('Certificado digital sem procuração para o empregador.'), 'S-1299').acao).toBe('cofre');
        expect(diagnosticar(oc('XML não confere com o schema.'), 'S-2230').acao).toBe('gerar-de-novo');
    });
    it('sem regra: vai para a MIA, sem inventar', () => {
        const d = diagnosticar(oc('Situação inesperada XPTO.'), 'S-1200');
        expect(d).toMatchObject({ regra: 'desconhecida', acao: 'mia' });
        const p = perguntaParaMia(oc('Situação inesperada XPTO.'), 'S-1200', '2026-09');
        expect(p).toContain('ocorrência 999: "Situação inesperada XPTO."');
        expect(p).toContain('sem inventar códigos');
    });
});
