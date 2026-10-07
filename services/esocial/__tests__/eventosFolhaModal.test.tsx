// @vitest-environment jsdom
// Tela "S-1200 e S-1210": de/para sugerido, gravação e transmissão pelo CFI (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sv = vi.hoisted(() => ({
    rubricas: vi.fn(async (_id: string) => [] as unknown[]),
    salvar: vi.fn(async (..._a: unknown[]) => undefined),
    enviar: vi.fn(async (_p: { eventos: string[]; tpAmb: number }) => ({ recebido: true, protocolo: 'P1', cdResposta: 201, descResposta: '', ocorrencias: [], dhRecepcao: '', grupo: 3, eventos: [], tpAmb: 2, transmissor: '' })),
    registrar: vi.fn(async (..._a: unknown[]) => 'x'),
    baixados: [] as string[],
}));
vi.mock('../../cadastros/cadastrosService', () => ({ listarRubricas: (id: string) => sv.rubricas(id), mensagemErro: (e: unknown) => String(e) }));
vi.mock('../../empresas/empresasService', () => ({ salvarParametrosEsocialFolha: (...a: unknown[]) => sv.salvar(...a) }));
vi.mock('../transmissaoService', () => ({ registrarEnvio: (...a: unknown[]) => sv.registrar(...a), listarEnvios: async () => [] }));
vi.mock('../transmissao', async orig => ({ ...(await orig<typeof import('../transmissao')>()), enviarLote: (p: { eventos: string[]; tpAmb: number }) => sv.enviar(p) }));
vi.mock('../../implantacao/zip', async orig => ({ ...(await orig<typeof import('../../implantacao/zip')>()), baixarBytes: (nome: string) => { sv.baixados.push(nome); } }));
import EventosFolhaModal from '../../../components/esocial/EventosFolhaModal';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

afterEach(() => { cleanup(); vi.clearAllMocks(); sv.baixados.length = 0; });
const CNPJ = '44388152000189';
const rub = (codRubr: string, dscRubr: string, natRubr: string, tpRubr: string) => ({ id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr, natRubr, tpRubr, codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] });
const empresa = { id: 'E1', cnpj: CNPJ, razaoSocial: 'EMPRESA EXEMPLO', nomeFantasia: 'Exemplo', codigoSage: '1200', criadoPor: 'g', esocialFolha: { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: {} } };
const ficha = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M001', situacao: 'ativo' as const, dados: { nome: 'ANA', categoria: '101' } };
const res = { fichaId: 'f1', nome: 'ANA', competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado', fgts: 0, memoria: [], avisos: [], erros: [],
    verbas: [{ codigo: 'SAL', descricao: 'Salário', referencia: '30 dias', tipo: 'provento', valor: 300000 }, { codigo: 'INSS', descricao: 'INSS', referencia: '', tipo: 'desconto', valor: 25341 }],
    bases: { inss: 300000, fgts: 300000, irrf: 300000 }, totais: { proventos: 300000, descontos: 25341, liquido: 274659 } } as unknown as ResultadoCalculo;

describe('tela S-1200 e S-1210', () => {
    it('sugere o de/para, exige gravar antes de transmitir e transmite o S-1200 pelo CFI', async () => {
        sv.rubricas.mockResolvedValue([rub('0001', 'SALARIO', '1000', '1'), rub('0901', 'INSS', '9201', '2')]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onSalvos = vi.fn();
        render(<EventosFolhaModal empresa={empresa} competencia="2026-09" fichas={[ficha]} resultados={[res]} dataSugerida="2026-10-06" usuario={{ id: 'u', email: 'u@x' }} onFechar={() => {}} onParametrosSalvos={onSalvos} />);
        await waitFor(() => expect(screen.getByText(/1<\/strong>|trabalhador\(es\) com S-1200/)).toBeTruthy());
        expect((screen.getByLabelText('Rubrica de Salário') as HTMLSelectElement).value).toBe('T1|0001');
        expect(screen.getAllByText('sugerida')).toHaveLength(2);
        const transmitir = screen.getByText('Transmitir S-1200 (1)') as HTMLButtonElement;
        expect(transmitir.disabled).toBe(true);
        fireEvent.click(screen.getByText('Gravar parâmetros e de/para'));
        await waitFor(() => expect(sv.salvar).toHaveBeenCalled());
        expect((sv.salvar.mock.calls[0][1] as { rubricas: Record<string, unknown> }).rubricas).toEqual({ SAL: { codRubr: '0001', ideTabRubr: 'T1' }, INSS: { codRubr: '0901', ideTabRubr: 'T1' } });
        expect(onSalvos).toHaveBeenCalled();
        await waitFor(() => expect(transmitir.disabled).toBe(false));
        fireEvent.click(transmitir);
        await waitFor(() => expect(sv.registrar).toHaveBeenCalled());
        const p = sv.enviar.mock.calls[0][0];
        expect([p.tpAmb, p.eventos.length, p.eventos[0]]).toEqual([2, 1, expect.stringContaining('<evtRemun')]);
        expect(screen.getByText('S-1200: lote recebido, protocolo P1')).toBeTruthy();
        fireEvent.click(screen.getByText('Baixar XMLs (.zip)'));
        expect(sv.baixados).toEqual(['eventos-folha-1200-2026-09.zip']);
    });

    it('pendência aparece por trabalhador e, sem evento pronto, não há o que transmitir', async () => {
        sv.rubricas.mockResolvedValue([rub('0001', 'SALARIO', '1000', '1')]);
        render(<EventosFolhaModal empresa={{ ...empresa, esocialFolha: { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: '0001', ideTabRubr: 'T1' } } } }} competencia="2026-09" fichas={[ficha]} resultados={[res]} dataSugerida="2026-10-06" usuario={{ id: 'u', email: 'u@x' }} onFechar={() => {}} />);
        await waitFor(() => expect(screen.getByText(/ANA/)).toBeTruthy());
        expect(screen.getByText(/"INSS" sem rubrica no de\/para/)).toBeTruthy();
        expect((screen.getByText('Transmitir S-1200 (0)') as HTMLButtonElement).disabled).toBe(true);
    });
});
