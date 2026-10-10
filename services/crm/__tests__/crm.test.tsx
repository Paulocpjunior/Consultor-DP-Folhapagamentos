// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { consolidar, empresaDaLinha } from '../../../scripts/crm/jotformDp.mjs';
import { empresaDoCrm, idsDoUsuario, sugestaoCarteira, type EmpresaCrm } from '../crmDp';
import CarteiraModal from '../../../components/auth/CarteiraModal';

const crmSrv = vi.hoisted(() => ({ empresa: null as unknown }));
vi.mock('../crmService', () => ({ lerCrmDaEmpresa: async () => crmSrv.empresa }));
import ParticularidadesEmpresa from '../../../components/crm/ParticularidadesEmpresa';

afterEach(cleanup);

// Linhas sintéticas no formato da API do Jotform (answers por id da pergunta).
const opcoes = JSON.stringify({ '__OWNER__': { value: { text: 'Gestor' }, resourceDetails: { email: 'gestor@escritorio.com.br' } }, '777': { value: { text: 'Ana DP', subText: 'ana@escritorio.com.br' }, isDeleted: false } });
const linha = (id: string, p: Record<string, unknown>, status = 'CUSTOM', updated = '2026-10-01 10:00:00') => ({
    id, status, created_at: '2026-01-01 10:00:00', updated_at: updated,
    answers: {
        1: { name: 'codigo', answer: p.codigo }, 2: { name: 'empresa', answer: p.empresa }, 4: { name: 'tributaCAo', answer: 'SIMPLES NACIONAL' },
        5: { name: 'fechamento', answer: ['FOLHA'] }, 7: { name: 'sindicato', answer: ['COMERCIARIOS SP'] }, 9: { name: 'dissidio', answer: 'Data base: maio' },
        12: { name: 'adiantamento', answer: 'SIM' }, 43: { name: 'observaCAoFechamento', answer: p.obs ?? '' }, 45: { name: 'dataPagamento45', answer: ['DIA 05'] },
        48: { name: 'colaborador', answer: p.colab ? [`{${p.colab}}`] : undefined, options_array: opcoes },
        56: { name: 'insiraUma', answer: p.cnpj },
    },
});

describe('CRM do DP: linhas do Jotform', () => {
    it('vira empresa por CNPJ, com responsável resolvido pela lista do campo', () => {
        const e = empresaDaLinha(linha('1', { codigo: '1200', empresa: 'EMPRESA UM', cnpj: '11.222.333/0001-81', colab: '777', obs: 'Paga dia 5; VT em dinheiro' }), { '777': { nome: 'Ana DP', email: 'ana@escritorio.com.br' } });
        expect(e).toMatchObject({ documento: '11222333000181', codigoSage: '1200', nome: 'EMPRESA UM', fechamento: ['FOLHA'], adiantamento: 'SIM', diaPagamento: 'DIA 05', sindicatos: ['COMERCIARIOS SP'], particularidades: 'Paga dia 5; VT em dinheiro' });
        expect(e?.colaborador).toEqual({ jotformId: '777', nome: 'Ana DP', email: 'ana@escritorio.com.br' });
    });

    it('ignora apagadas, arquivadas e sem CNPJ/CPF; CNPJ repetido fica com a linha mais recente; resume os responsáveis', () => {
        const r = consolidar([
            linha('1', { codigo: '1200', empresa: 'ANTIGA', cnpj: '11222333000181', colab: '777' }, 'CUSTOM', '2026-01-01 10:00:00'),
            linha('2', { codigo: '1200', empresa: 'EMPRESA UM', cnpj: '11222333000181', colab: '777' }, 'CUSTOM', '2026-09-01 10:00:00'),
            linha('3', { codigo: '13', empresa: 'APAGADA', cnpj: '99888777000166', colab: '777' }, 'DELETED'),
            linha('4', { codigo: '14', empresa: 'SEM CNPJ', cnpj: '' }),
            linha('5', { codigo: '15', empresa: 'DOMÉSTICA', cnpj: '123.456.789-09', colab: '999' }),
        ]);
        expect(r.empresas.map(e => e.nome).sort()).toEqual(['DOMÉSTICA', 'EMPRESA UM']);
        expect(r.colaboradores).toEqual([
            { jotformId: '777', nome: 'Ana DP', email: 'ana@escritorio.com.br', empresas: 1, exemplos: ['EMPRESA UM'] },
            { jotformId: '999', nome: '', email: '', empresas: 1, exemplos: ['DOMÉSTICA'] },
        ]);
    });
});

const EMPRESAS = [
    { id: 'E1', cnpj: '11222333000181', codigoSage: '1200', razaoSocial: 'EMPRESA UM LTDA', nomeFantasia: 'Um', criadoPor: 'g' },
    { id: 'E2', cnpj: '22333444000155', codigoSage: '0042', razaoSocial: 'EMPRESA DOIS LTDA', nomeFantasia: 'Dois', criadoPor: 'g' },
    { id: 'E3', cnpj: '33444555000122', codigoSage: '0077', razaoSocial: 'EMPRESA TRES LTDA', nomeFantasia: 'Três', criadoPor: 'g' },
] as never[];
const crmEmp = (documento: string, codigoSage: string, nome: string, colab: string | null): EmpresaCrm => ({ documento, codigoSage, nome, tributacao: '', fechamento: [], adiantamento: '', diaPagamento: '', valeTransporte: '', desoneracao: '', sindicatos: [], dissidio: '', particularidades: '', colaborador: colab ? { jotformId: colab, nome: '', email: '' } : null, ativoNoCrm: true });
const CRM = [crmEmp('11222333000181', '1200', 'EMPRESA UM', '777'), crmEmp('00000000000000', '42', 'EMPRESA DOIS', '777'), crmEmp('44555666000199', '900', 'NOVA', '777'), crmEmp('33444555000122', '77', 'EMPRESA TRES', '888')];

describe('CRM do DP: sugestão de carteira', () => {
    it('liga pelo CNPJ e, sem ele, pelo código SAGE; separa as não cadastradas', () => {
        expect(empresaDoCrm({ documento: '00000000000000', codigoSage: '42' }, EMPRESAS)?.id).toBe('E2');
        const s = sugestaoCarteira(CRM, EMPRESAS, ['777']);
        expect(s.empresaIds).toEqual(['E1', 'E2']);
        expect(s.naoCadastradas.map(c => c.nome)).toEqual(['NOVA']);
    });
    it('a pessoa é o responsável ligado pelo gestor ou o do mesmo e-mail (se não ligado a outro)', () => {
        const cols = [{ jotformId: '777', nome: 'Ana', email: 'ana@escritorio.com.br' }, { jotformId: '888', nome: 'Bia', email: 'bia@escritorio.com.br' }];
        expect(idsDoUsuario(cols, {}, { uid: 'u1', email: 'ANA@escritorio.com.br' })).toEqual(['777']);
        expect(idsDoUsuario(cols, { '888': 'u1' }, { uid: 'u1', email: 'x@y.com' })).toEqual(['888']);
        expect(idsDoUsuario(cols, { '777': 'u2' }, { uid: 'u1', email: 'ana@escritorio.com.br' })).toEqual([]);
    });
});

describe('CRM do DP: telas', () => {
    it('carteira: liga o responsável e marca as empresas do CRM', async () => {
        const ligar = vi.fn(async () => undefined);
        render(<CarteiraModal alvo={{ uid: 'u1', nome: 'Ana', email: 'ana@escritorio.com.br', papel: 'colaborador' }} ator="gestor" atorUid="g" usuario={{ id: 'g', email: 'g@x' }}
            empresas={EMPRESAS} atual={['E3']} minhas={[]} onFechar={() => {}} onSalvo={() => {}} onLigarCrm={ligar}
            crm={{ empresas: CRM, colaboradores: [{ jotformId: '777', nome: 'Ana DP', email: '', empresas: 3, exemplos: ['EMPRESA UM'] }, { jotformId: '888', nome: 'Bia', email: '', empresas: 1 }], mapa: {}, sincronizadoEm: new Date('2026-10-10T10:00:00') }} />);
        fireEvent.change(screen.getByLabelText('Responsável no CRM'), { target: { value: '777' } });
        await waitFor(() => expect(ligar).toHaveBeenCalledWith('777', 'u1'));
        expect(screen.getByText(/O CRM aponta 3 empresa\(s\) para Ana: 2 no Consultor, 2 fora desta carteira, 1 ainda não cadastrada/)).toBeTruthy();
        fireEvent.click(screen.getByText('Marcar as 2 do CRM'));
        fireEvent.click(screen.getByText('Desmarcar as 1 que não estão no CRM'));
        expect(screen.getByText('Ao salvar: 2 incluída(s), 1 retirada(s).')).toBeTruthy();
    });

    it('particularidades da empresa ativa', async () => {
        crmSrv.empresa = { ...crmEmp('11222333000181', '1200', 'EMPRESA UM', '777'), colaborador: { jotformId: '777', nome: 'Ana DP', email: '' }, adiantamento: 'SIM', diaPagamento: 'DIA 05', particularidades: 'VT pago em dinheiro' };
        render(<ParticularidadesEmpresa cnpj="11.222.333/0001-81" />);
        fireEvent.click(await screen.findByTitle('Particularidades da empresa (CRM do DP)'));
        const d = screen.getByRole('dialog', { name: 'Particularidades da empresa' });
        expect(d.textContent).toContain('Ana DP');
        expect(d.textContent).toContain('DIA 05');
        expect(d.textContent).toContain('VT pago em dinheiro');
    });
});
