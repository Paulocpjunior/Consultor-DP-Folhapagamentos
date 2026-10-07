// @vitest-environment jsdom
// MiA, a agente de IA do DP: contexto da tela, pedido ao CFI e o painel.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sv = vi.hoisted(() => ({ chamar: vi.fn(async (_p: string, _b: unknown) => ({ texto: 'Até **2 dias** antes do início (CLT, art. 145).', fontes: [{ titulo: 'CLT', uri: 'https://www.planalto.gov.br/clt' }] })) }));
vi.mock('../../serpro/serproIntegrationService', () => ({ callFiscal: (p: string, b: unknown) => sv.chamar(p, b) }));
import { contextoDoHolerite, contextoMiaAtual, definirContextoMia, perguntarMia, GUIA_DO_APP, type MensagemMia } from '../mia';
import MiaAssistente from '../../../components/mia/MiaAssistente';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

afterEach(() => { cleanup(); vi.clearAllMocks(); definirContextoMia('a', null); definirContextoMia('b', null); });
const r = { fichaId: 'f1', nome: 'ANA', competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado', fgts: 24000, erros: [], avisos: ['Confira o DSR.'],
    verbas: [{ codigo: 'SAL', descricao: 'Salário', referencia: '30 dias', tipo: 'provento', valor: 300000 }], bases: { inss: 300000, fgts: 300000, irrf: 300000 },
    totais: { proventos: 300000, descontos: 0, liquido: 300000 }, memoria: ['Salário mensal: R$ 3.000,00.'] } as unknown as ResultadoCalculo;

describe('MiA', () => {
    it('contexto em camadas: vale o publicado por último; ao retirar, volta o anterior', () => {
        definirContextoMia('a', { tela: 'Cálculo', texto: 'lista' });
        definirContextoMia('b', { tela: 'Conferência', texto: 'linha' });
        expect(contextoMiaAtual()?.tela).toBe('Conferência');
        definirContextoMia('b', null);
        expect(contextoMiaAtual()?.tela).toBe('Cálculo');
        definirContextoMia('a', null);
        expect(contextoMiaAtual()).toBeNull();
    });

    it('holerite como contexto: verbas, totais, memória e avisos, sem CPF', () => {
        const t = contextoDoHolerite(r, 'Folha mensal 09/2026');
        expect(t).toContain('Folha mensal 09/2026 · ANA · competência 09/2026');
        expect(t).toMatch(/SAL Salário \(30 dias\): provento R\$\s3\.000,00/);
        expect(t).toContain('1. Salário mensal: R$ 3.000,00.');
        expect(t).toContain('- Confira o DSR.');
    });

    it('pede ao CFI pela rota da MiA com as últimas 20 mensagens, começando por uma pergunta, e o mapa do app', async () => {
        const conversa: MensagemMia[] = Array.from({ length: 25 }, (_, i) => ({ papel: i % 2 ? 'mia' : 'usuaria', texto: `m${i}` }));
        const resp = await perguntarMia(conversa, { tela: 'Cálculo', texto: 'holerite' }, 'Cálculo');
        const [rota, corpo] = sv.chamar.mock.calls[0] as [string, { mensagens: MensagemMia[]; contexto: { tela: string; texto: string } }];
        expect(rota).toBe('/assistente/mia');
        expect(corpo.mensagens[0].papel).toBe('usuaria');
        expect(corpo.mensagens.length).toBeLessThanOrEqual(20);
        expect(corpo.mensagens[corpo.mensagens.length - 1].texto).toBe('m24');
        expect(corpo.contexto.tela).toBe('Cálculo');
        expect(corpo.contexto.texto).toContain(GUIA_DO_APP.split('\n')[0]);
        expect(corpo.contexto.texto).toContain('Tela "Cálculo":\n\nholerite');
        expect(resp).toMatchObject({ papel: 'mia', fontes: [{ titulo: 'CLT' }] });
    });

    it('painel: sugestão vira pergunta, resposta com negrito e fontes; sem a tela, vai só o mapa do app', async () => {
        definirContextoMia('a', { tela: 'Cálculo · ANA', texto: 'holerite da ANA' });
        render(<MiaAssistente aba="Cálculo" />);
        fireEvent.click(screen.getByLabelText('Falar com a MiA'));
        expect(screen.getByText(/Usar a tela aberta: Cálculo · ANA/)).toBeTruthy();
        fireEvent.click(screen.getByText('Qual o prazo para pagar as férias?'));
        await waitFor(() => expect(screen.getByText('2 dias').tagName).toBe('STRONG'));
        expect(screen.getByRole('link', { name: 'CLT' }).getAttribute('href')).toBe('https://www.planalto.gov.br/clt');
        expect((sv.chamar.mock.calls[0][1] as { contexto: { texto: string } }).contexto.texto).toContain('holerite da ANA');
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.change(screen.getByLabelText('Pergunta para a MiA'), { target: { value: 'E o 13º?' } });
        fireEvent.click(screen.getByText('Enviar'));
        await waitFor(() => expect(sv.chamar).toHaveBeenCalledTimes(2));
        expect((sv.chamar.mock.calls[1][1] as { contexto: { texto: string } }).contexto.texto).not.toContain('holerite da ANA');
        fireEvent.click(screen.getByText('Nova conversa'));
        expect(screen.queryByText('E o 13º?')).toBeNull();
    });

    it('antes da publicação no CFI (404), avisa que a MiA ainda não está no ar', async () => {
        sv.chamar.mockRejectedValueOnce(new Error('HTTP 404'));
        render(<MiaAssistente aba="Cálculo" />);
        fireEvent.click(screen.getByLabelText('Falar com a MiA'));
        fireEvent.click(screen.getByText('Onde gero o arquivo bancário?'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('A MiA ainda não está no ar: falta publicar a rota dela no CFI.'));
    });
});
