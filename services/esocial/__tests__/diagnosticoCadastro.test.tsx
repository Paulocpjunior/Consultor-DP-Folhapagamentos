// @vitest-environment jsdom
// Diagnóstico do cadastro antes de gerar os eventos: apto ou não apto, por área, e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { escalaPronta, horarioVazio, type Horario } from '../../cadastros/horarios';
import { afastamentoVazio } from '../../cadastros/afastamentos';
import { enquadramentoVazio } from '../../cadastros/enquadramento';
import type { Rubrica } from '../../cadastros/rubricas';
import { diagnosticarCadastro, planilhaDiagnostico, type EntradaDiagnostico } from '../diagnosticoCadastro';

const CNPJ = '44388152000189';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'E1_52998224725_A-10', cpf: '52998224725', matriculaEsocial: 'A-10', situacao: 'ativo',
    dados: { nome: 'ANA TESTE', nascimento: '1990-01-01', sexo: 'F', raca: '1', estadoCivil: '2', escolaridade: '07', nacionalidade: '105', paisNascimento: '105',
        logradouro: 'RUA A', numero: '10', bairro: 'CENTRO', cep: '01001000', municipio: '3550308', uf: 'SP', admissao: '2025-03-02', categoria: '101', cargo: 'AUXILIAR', cbo: '411005',
        salario: '2500.00', unidadeSalario: '5', horasSemanais: '44', tipoContrato: '1', regimeTrabalhista: '1', regimePrevidenciario: '1', sindicato: '11222333000181', estabelecimento: CNPJ } };
const rub = (cod: string, nat: string, tp: '1' | '2', ini = '2020-01', extra: Partial<Rubrica['vigencias'][number]['dados']> = {}): Rubrica => ({ id: cod, empresaId: 'E1', codRubr: cod, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: ini, fimValid: '', recibo: '', dados: { dscRubr: `RUBRICA ${cod}`, natRubr: nat, tpRubr: tp, codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '', ...extra } }] });
const H44: Horario = { ...horarioVazio('E1'), id: 'E1_H1', codigo: 'H1', descricao: 'COMERCIAL',
    dias: { ...horarioVazio('E1').dias, ...Object.fromEntries((['seg', 'ter', 'qua', 'qui', 'sex'] as const).map(d => [d, { tipo: 'trabalho', entrada: '08:00', saidaIntervalo: '12:00', retornoIntervalo: '13:00', saida: '17:48' }])) } as Horario['dias'] };
const base = (x: Partial<EntradaDiagnostico> = {}): EntradaDiagnostico => ({
    competencia: '2026-10', empresa: { id: 'E1', cnpj: CNPJ, esocialFolha: { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: '0001', ideTabRubr: 'T1' } } } },
    fichas: [FICHA], rubricas: [rub('0001', '1000', '1')], horarios: [], afastamentos: [], enquadramentos: [{ ...enquadramentoVazio('E1'), id: 'E1_2020-01', vigencia: '2020-01', fpas: '515', rat: 1 }], ...x,
});

describe('diagnóstico do cadastro', () => {
    it('cadastro completo: apto, com o que foi verificado em cada área', () => {
        const d = diagnosticarCadastro(base());
        expect(d.itens.filter(x => x.nivel === 'erro')).toEqual([]);
        expect(d.apto).toBe(true);
        expect([d.porArea.Empresa.verificados, d.porArea.Trabalhador.verificados, d.porArea.Rubrica.verificados]).toEqual([1, 1, 1]);
    });
    it('não apto: empresa sem parâmetros, enquadramento e S-1010 vigente; de/para para rubrica inexistente', () => {
        const d = diagnosticarCadastro(base({ empresa: { id: 'E1', cnpj: '11111111111111' }, enquadramentos: [], rubricas: [rub('0001', '1000', '1', '2027-01')] }));
        expect(d.apto).toBe(false);
        const t = d.itens.filter(x => x.area === 'Empresa').map(x => x.mensagem).join(' | ');
        for (const m of [/CNPJ 11111111111111 inválido/, /Estabelecimento e lotação do S-1200/, /sem enquadramento/i, /Nenhuma rubrica \(S-1010\) vigente em 10\/2026/]) expect(t).toMatch(m);
        const deParaQuebrado = diagnosticarCadastro(base({ empresa: { id: 'E1', cnpj: CNPJ, esocialFolha: { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: '0001', ideTabRubr: 'T1' }, INSS: { codRubr: '9999', ideTabRubr: 'T1' } } } } }));
        expect(deParaQuebrado.itens.map(x => x.mensagem).join(' ')).toMatch(/A verba INSS aponta a rubrica 9999, que não está no cadastro/);
    });
    it('trabalhadores da competência: ficha, matrícula e horário; desligados antes do mês ficam de fora', () => {
        const sem = { ...FICHA, id: 'E1_2', cpf: '11144477735', matriculaEsocial: '', dados: { ...FICHA.dados, nome: 'BRUNO', cbo: '12', horario: 'X9' } };
        const saiu = { ...FICHA, id: 'E1_3', cpf: '39053344705', dados: { ...FICHA.dados, nome: 'CAIO', cbo: '', dataDesligamento: '2026-08-31' } };
        const comHorario = { ...FICHA, id: 'E1_4', dados: { ...FICHA.dados, nome: 'DORA', horario: 'H1', horasSemanais: '40' } };
        const d = diagnosticarCadastro(base({ fichas: [FICHA, sem, saiu, comHorario], horarios: [H44] }));
        expect(d.porArea.Trabalhador.verificados).toBe(3);
        const bruno = d.itens.filter(x => x.alvo.startsWith('BRUNO')).map(x => x.mensagem).join(' | ');
        expect(bruno).toMatch(/Sem a matrícula do eSocial/);
        expect(bruno).toMatch(/Horário X9 não cadastrado/);
        expect(d.itens.some(x => x.alvo.startsWith('CAIO'))).toBe(false);
        expect(d.itens.filter(x => x.alvo.startsWith('DORA')).map(x => x.mensagem).join(' | ')).toMatch(/Horas semanais da ficha \(40:00\) diferentes do horário H1 \(44:00\)/);
        expect(d.apto).toBe(false);
    });
    it('rubricas, horários e afastamentos do mês; erros antes dos avisos; planilha', () => {
        const d = diagnosticarCadastro(base({
            rubricas: [rub('0001', '1000', '1'), rub('0002', '', '1')],
            horarios: [{ ...H44, id: 'E1_H2', codigo: 'H2', descricao: '' }, { ...horarioVazio('E1'), id: 'E1_H3', codigo: 'H3', descricao: '12X36', escala: escalaPronta('12x36', '2026-10-01') }],
            afastamentos: [{ ...afastamentoVazio(), id: 'a1', fichaId: FICHA.id, cpf: FICHA.cpf, dtInicio: '2026-10-05', dtFim: '2026-10-02', motivo: '03' },
                { ...afastamentoVazio(), id: 'a2', fichaId: FICHA.id, cpf: FICHA.cpf, dtInicio: '2025-01-05', dtFim: '2025-01-10', motivo: '03' }],
        }));
        expect(d.porArea.Rubrica.erros).toBeGreaterThan(0);
        expect(d.itens.find(x => x.area === 'Horário' && x.nivel === 'erro')?.mensagem).toMatch(/descrição/);
        expect(d.itens.some(x => x.area === 'Horário' && x.alvo.startsWith('H3') && /59-A/.test(x.mensagem))).toBe(true);
        expect(d.porArea.Afastamento.verificados).toBe(1);
        expect(d.itens.find(x => x.area === 'Afastamento')?.mensagem).toMatch(/Término anterior ao início/);
        const niveis = d.itens.map(x => x.nivel);
        expect(niveis.indexOf('aviso')).toBeGreaterThan(niveis.lastIndexOf('erro'));
        const p = planilhaDiagnostico(d, '2026-10');
        expect(p[0]).toEqual(['Diagnóstico do cadastro · 10/2026', 'NÃO APTO']);
        expect(p[2]).toEqual(['Situação', 'Área', 'Onde', 'O que corrigir']);
        expect(p).toHaveLength(3 + d.itens.length);
    });
});

vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [{ ...FICHA, matriculaEsocial: '' }], listarRubricas: async () => [rub('0001', '1000', '1')], listarHorarios: async () => [],
    listarAfastamentos: async () => [], listarEnquadramentos: async () => [{ ...enquadramentoVazio('E1'), id: 'x', vigencia: '2020-01' }], mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'E1', cnpj: CNPJ, esocialFolha: { nrInscEstab: CNPJ, codLotacao: 'L1', rubricas: {} } }] }));
vi.mock('xlsx', () => ({ utils: { book_new: () => ({}), book_append_sheet: () => undefined, aoa_to_sheet: () => ({}) }, writeFile: vi.fn() }));
import DiagnosticoCadastroPanel from '../../../components/esocial/DiagnosticoCadastroPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
afterEach(() => cleanup());

describe('tela', () => {
    it('não apto com o erro da matrícula; filtra por área', async () => {
        render(<EmpresaAtivaProvider ativa={{ id: 'E1', nome: 'ALFA', cnpj: CNPJ, codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 }} trocar={() => {}}><DiagnosticoCadastroPanel /></EmpresaAtivaProvider>);
        const r = await screen.findByLabelText('Resultado do diagnóstico');
        expect(r.textContent).toMatch(/Não apto · \d+ erro/);
        expect(screen.getByLabelText('Itens do diagnóstico').textContent).toMatch(/Sem a matrícula do eSocial/);
        fireEvent.click(screen.getByRole('button', { name: /^Rubrica/ }));
        await waitFor(() => expect(screen.getByText('Nada a corrigir em Rubrica.')).toBeTruthy());
    });
});
