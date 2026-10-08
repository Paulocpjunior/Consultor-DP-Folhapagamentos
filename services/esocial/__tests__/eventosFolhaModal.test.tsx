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
    envios: [] as unknown[],
    consultar: vi.fn(async (..._a: unknown[]) => ({})),
    registrarConsulta: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock('../../cadastros/cadastrosService', () => ({ listarRubricas: (id: string) => sv.rubricas(id), mensagemErro: (e: unknown) => String(e) }));
vi.mock('../../empresas/empresasService', () => ({ salvarParametrosEsocialFolha: (...a: unknown[]) => sv.salvar(...a) }));
vi.mock('../transmissaoService', async orig => ({ ...(await orig<typeof import('../transmissaoService')>()), registrarEnvio: (...a: unknown[]) => sv.registrar(...a), listarEnvios: async () => sv.envios,
    registrarConsulta: (...a: unknown[]) => sv.registrarConsulta(...a) }));
vi.mock('../transmissao', async orig => ({ ...(await orig<typeof import('../transmissao')>()), enviarLote: (p: { eventos: string[]; tpAmb: number }) => sv.enviar(p), consultarLote: (...a: unknown[]) => sv.consultar(...a) }));
vi.mock('../../implantacao/zip', async orig => ({ ...(await orig<typeof import('../../implantacao/zip')>()), baixarBytes: (nome: string) => { sv.baixados.push(nome); } }));
import EventosFolhaModal from '../../../components/esocial/EventosFolhaModal';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

afterEach(() => { cleanup(); vi.clearAllMocks(); sv.baixados.length = 0; sv.envios = []; });
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

    it('produção com S-1210 aceito: 1. exclui (com cópia), consulta e só então libera o S-1200 e o S-1210', async () => {
        const REC = '1.1.0000000000000000002';
        sv.rubricas.mockResolvedValue([rub('0001', 'SALARIO', '1000', '1'), rub('0901', 'INSS', '9201', '2')]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const gravado = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: '0001', ideTabRubr: 'T1' }, INSS: { codRubr: '0901', ideTabRubr: 'T1' } } };
        render(<EventosFolhaModal empresa={{ ...empresa, esocialFolha: gravado }} competencia="2026-09" fichas={[ficha]} resultados={[res]} dataSugerida="2026-10-06" usuario={{ id: 'u', email: 'u@x' }} onFechar={() => {}} />);
        await waitFor(() => expect(screen.getByText(/trabalhador\(es\) com S-1200/)).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: '1' } });
        fireEvent.click(screen.getByText(/Confirmo o envio em produção/));
        const s1210 = `<retornoEventoCompleto><evento><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00"><evtPgtos Id="IDY"><ideEvento><indRetif>1</indRetif><perApur>2026-10</perApur><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador><ideBenef><cpfBenef>52998224725</cpfBenef><infoPgto><dtPgto>2026-10-20</dtPgto><tpPgto>1</tpPgto><perRef>2026-10</perRef><ideDmDev>ADT-10</ideDmDev><vrLiq>500.00</vrLiq></infoPgto></ideBenef></evtPgtos></eSocial></evento><recibo><eSocial><retornoEvento><recibo><nrRecibo>${REC}</nrRecibo></recibo><processamento><cdResposta>201</cdResposta><dhProcessamento>2026-10-06T10:00:00</dhProcessamento></processamento></retornoEvento></eSocial></recibo></retornoEventoCompleto>`;
        fireEvent.change(screen.getByLabelText('Eventos já transmitidos'), { target: { files: [Object.assign(new File([s1210], 's1210.xml'), { arrayBuffer: async () => new TextEncoder().encode(s1210).buffer })] } });
        const excluir = await screen.findByText('1. Excluir S-1210 aceito (1)') as HTMLButtonElement;
        await waitFor(() => expect(excluir.disabled).toBe(false));
        expect((screen.getByText('2. Transmitir S-1200 (1)') as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByText('3. Transmitir S-1210 (1)') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/volta com mais 1 pagamento\(s\) que não são desta folha/)).toBeTruthy();
        fireEvent.click(excluir);
        await waitFor(() => expect(sv.registrar).toHaveBeenCalled());
        expect(sv.baixados).toEqual(['S-1210-antes-da-exclusao-1200-2026-10.zip']);
        const p = sv.enviar.mock.calls[0][0];
        expect([p.tpAmb, p.eventos[0]]).toEqual([1, expect.stringContaining(`<nrRecEvt>${REC}</nrRecEvt>`)]);
        const refs = (sv.registrar.mock.calls[0][0] as { refs: Record<string, string> }).refs;
        expect(Object.values(refs)).toEqual([`exclui:${REC}:52998224725:2026-10`]);
        // Consulta: o S-3000 aceito libera os passos 2 e 3; o S-1210 volta com o adiantamento.
        const idEv = Object.keys(refs)[0];
        sv.envios = [{ id: 'x', tpAmb: 1, protocolo: 'P1', situacao: 'enviado', certificado: 'escritorio', consultadoEm: null, enviadoEm: '2026-10-08', eventos: [{ id: idEv, tipo: 'S-3000', perApur: null, ref: `exclui:${REC}:52998224725:2026-10` }] }];
        sv.consultar.mockImplementation(async () => {
            sv.envios = [{ ...(sv.envios[0] as object), situacao: 'processado', consultadoEm: '2026-10-08T10:00:00', eventos: [{ id: idEv, tipo: 'S-3000', perApur: null, ref: `exclui:${REC}:52998224725:2026-10`, cdResposta: 201, nrRecibo: '1.1.0000000000000000009' }] }];
            return { situacao: 'processado', eventos: [{ id: idEv, cdResposta: 201, descResposta: '', ocorrencias: [], nrRecibo: '1.1.0000000000000000009', totalizadores: [] }] };
        });
        fireEvent.click(screen.getByText('Consultar resultado'));
        await waitFor(() => expect((screen.getByText('2. Transmitir S-1200 (1)') as HTMLButtonElement).disabled).toBe(false));
        expect(sv.registrarConsulta).toHaveBeenCalled();
        expect((screen.getByText('1. Excluir S-1210 aceito (0)') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(/já excluído, volta com mais 1 pagamento/)).toBeTruthy();
        fireEvent.click(screen.getByText('3. Transmitir S-1210 (1)'));
        await waitFor(() => expect(sv.enviar).toHaveBeenCalledTimes(2));
        const s = sv.enviar.mock.calls[1][0].eventos[0];
        expect([s.includes('<indRetif>1</indRetif>'), s.includes('<ideDmDev>ADT-10</ideDmDev>')]).toEqual([true, true]);
    });
});
