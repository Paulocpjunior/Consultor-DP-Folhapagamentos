// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const st = vi.hoisted(() => ({ listar: vi.fn(), marcar: vi.fn(), desmarcar: vi.fn() }));
vi.mock('../obrigacoesStatusService', () => ({ listarMarcacoes: st.listar, marcarObrigacao: st.marcar, desmarcarObrigacao: st.desmarcar }));
vi.mock('../../cadastros/cadastrosService', () => ({ mensagemErro: (e: Error) => e.message }));
const gu = vi.hoisted(() => ({ listar: vi.fn(), baixa: vi.fn(), desfazer: vi.fn(), fgts: vi.fn(), receita: vi.fn(), comprovante: vi.fn(), baixar: vi.fn() }));
vi.mock('../../guias/pagamentoGuiasService', () => ({ listarGuias: gu.listar, darBaixa: gu.baixa, desfazerBaixa: gu.desfazer }));
vi.mock('../../serpro/serproIntegrationService', () => ({ consultarFgtsRecolhimento: gu.fgts, consultarPagamentosReceita: gu.receita, emitirComprovanteReceita: gu.comprovante }));
vi.mock('../../implantacao/zip', () => ({ baixarBytes: gu.baixar }));
import CalendarioEmpresa from '../../../components/prazos/CalendarioEmpresa';
import { sindicatoVazio } from '../../cadastros/sindicatos';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); gu.listar.mockReset(); gu.listar.mockResolvedValue(new Map()); });
gu.listar.mockResolvedValue(new Map());

const ficha = (cpf: string, sindicato: string) => ({ empresaId: 'E1', cpf, situacao: 'ativo', dados: { sindicato } }) as never;
const sind = (cnpj: string, nome: string, extra = {}) => ({ ...sindicatoVazio(), id: cnpj, cnpj, nome, ...extra });
const usuario = { id: 'u1', email: 'ana@x.com' };
const props = {
    empresa: { id: 'E1', nome: 'ALFA', competencia: '2026-09' },
    fichas: [ficha('1', '11222333000181'), ficha('2', '11444777000161'), ficha('3', '99999999000191')],
    sindicatos: [sind('11222333000181', 'SIND COMERCIO', { guiaDia: '10', guiaMeses: 'todos', guiaDescricao: 'Assistencial' }), sind('11444777000161', 'SIND SEM GUIA')],
    usuario, hoje: '2026-10-21',
};

describe('calendário da empresa ativa', () => {
    it('lista as obrigações da competência, destaca atraso, guia do sindicato e marcações', async () => {
        st.listar.mockResolvedValue(new Map([['s1299-2026-09', { status: 'entregue', atualizadoPorEmail: 'bia@x.com', atualizadoEm: '2026-10-14T12:00:00Z' }]]));
        render(<CalendarioEmpresa {...props} />);
        await waitFor(() => expect(st.listar).toHaveBeenCalledWith('E1', '2026-09'));
        expect(screen.getByText(/Calendário da empresa: ALFA · competência 09\/2026/)).toBeTruthy();
        const fgts = screen.getByText('FGTS Digital: guia mensal').closest('tr')!;
        expect(within(fgts).getByText('20/10/2026')).toBeTruthy();
        expect(within(fgts).getByText('atrasada há 1 dia(s)')).toBeTruthy();
        const guia = screen.getByText(/Guia sindical: Assistencial — SIND COMERCIO/).closest('tr')!;
        expect(within(guia).getByText('09/10/2026')).toBeTruthy(); // 10/10/2026 é sábado: antecipa
        const reinf = screen.getByText('EFD-Reinf: fechamento do mês').closest('tr')!;
        expect(within(reinf).getByText('Fiscal (o DP acompanha)')).toBeTruthy();
        const s1299 = screen.getByText('eSocial: fechamento dos periódicos (S-1299)').closest('tr')!;
        await waitFor(() => expect(within(s1299).getByText('entregue')).toBeTruthy());
        expect(within(s1299).getByText(/bia@x.com · 14\/10\/2026/)).toBeTruthy();
        expect(screen.getByText(/sem guia no cadastro: SIND SEM GUIA/)).toBeTruthy();
        expect(screen.getByText(/não está cadastrado: 99.999.999\/0001-91/)).toBeTruthy();
        expect(screen.getByText('Entregues: 1')).toBeTruthy();
    });

    it('marca entregue, "não se aplica" com motivo e desfaz', async () => {
        st.listar.mockResolvedValue(new Map([['s1299-2026-09', { status: 'entregue' }]]));
        st.marcar.mockResolvedValue(undefined);
        st.desmarcar.mockResolvedValue(undefined);
        render(<CalendarioEmpresa {...props} />);
        await screen.findByRole('button', { name: 'Marcar entregue: DCTFWeb: transmissão' });
        expect(screen.queryByRole('button', { name: 'Marcar entregue: FGTS Digital: guia mensal' })).toBeNull(); // guia: é "Dar baixa"
        fireEvent.click(screen.getByRole('button', { name: 'Marcar entregue: DCTFWeb: transmissão' }));
        await waitFor(() => expect(st.marcar).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'dctfweb-2026-09' }), 'entregue', '', undefined, usuario));

        vi.spyOn(window, 'prompt').mockReturnValueOnce('').mockReturnValueOnce('sem retenção no mês');
        fireEvent.click(screen.getByRole('button', { name: 'Não se aplica: EFD-Reinf: fechamento do mês' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Informe o motivo'));
        fireEvent.click(screen.getByRole('button', { name: 'Não se aplica: EFD-Reinf: fechamento do mês' }));
        await waitFor(() => expect(st.marcar).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'reinf-2026-09' }), 'nao-se-aplica', 'sem retenção no mês', undefined, usuario));

        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(within(screen.getByText('eSocial: fechamento dos periódicos (S-1299)').closest('tr')!).getByRole('button', { name: 'Desfazer' }));
        await waitFor(() => expect(st.desmarcar).toHaveBeenCalledWith('E1', expect.objectContaining({ id: 's1299-2026-09' }), { status: 'entregue' }, usuario));
    });

    it('sem usuário não mostra os botões; erro de leitura aparece', async () => {
        st.listar.mockRejectedValue(new Error('Sem permissão nesta empresa.'));
        render(<CalendarioEmpresa {...props} usuario={undefined} />);
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sem permissão'));
        expect(screen.queryByRole('button', { name: /Marcar entregue/ })).toBeNull();
    });

    it('baixa da guia: valor pelo FGTS Digital, aviso de atraso, grava e desfaz', async () => {
        gu.listar.mockResolvedValue(new Map());
        st.listar.mockResolvedValue(new Map());
        gu.fgts.mockResolvedValue({ ok: true, regular: true, depositoDevido: 1234.56, depositoRealizado: 1234.56 });
        gu.baixa.mockResolvedValue(undefined);
        render(<CalendarioEmpresa {...props} empresa={{ ...props.empresa, cnpj: '44.388.152/0001-89' }} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Dar baixa: FGTS Digital: guia mensal' }));
        const grupo = screen.getByRole('group', { name: 'Baixa de FGTS Digital: guia mensal' });
        fireEvent.click(within(grupo).getByText('Conferir no FGTS Digital'));
        await waitFor(() => expect((screen.getByLabelText('Valor pago') as HTMLInputElement).value).toBe('1234,56'));
        expect(gu.fgts).toHaveBeenCalledWith('44388152000189', '2026-09');
        fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2026-10-21' } });
        fireEvent.change(screen.getByLabelText('Autenticação'), { target: { value: 'ABC123' } });
        expect(screen.getByText(/Pago 1 dia\(s\) depois do vencimento \(20\/10\/2026\)/)).toBeTruthy();
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(within(grupo).getByText('Gravar a baixa'));
        await waitFor(() => expect(gu.baixa).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'fgts-2026-09' }), { valorDevido: 123456, numeroDocumento: '' },
            { data: '2026-10-21', valorPago: 123456, autenticacao: 'ABC123', fonte: 'fgts-digital' }, usuario));
        expect(confirmar.mock.calls[0][0]).toMatch(/Lei 8.036\/1990/);
    });

    it('baixa do DARF: data e valor pagos pela Receita (PAGTOWEB), pelo número do documento', async () => {
        const guiaDarf = { obrigacao: 'darf-2026-09', competencia: '2026-09', nome: 'DARF', vencimento: '2026-10-20', valorDevido: 100000, numeroDocumento: '07.20.26252.7312345-6', pagamento: null };
        gu.listar.mockResolvedValue(new Map([['darf-2026-09', guiaDarf]]));
        st.listar.mockResolvedValue(new Map());
        gu.receita.mockResolvedValue({ ok: true, fonte: 'serpro', situacoes: [{ numeroDocumento: '07202625273123456', localizado: true,
            pagamento: { numeroDocumento: '07202625273123456', dataArrecadacao: '2026-10-21', valorTotal: 1020.5, valorPrincipal: 1000, valorMulta: 6.6, valorJuros: 13.9 } }] });
        gu.baixa.mockResolvedValue(undefined);
        render(<CalendarioEmpresa {...props} empresa={{ ...props.empresa, cnpj: '44.388.152/0001-89' }} />);
        await waitFor(() => expect(gu.listar).toHaveBeenCalled());
        fireEvent.click(await screen.findByRole('button', { name: 'Dar baixa: DARF da DCTFWeb (INSS e IRRF)' }));
        const grupo = screen.getByRole('group', { name: 'Baixa de DARF da DCTFWeb (INSS e IRRF)' });
        await waitFor(() => expect((screen.getByLabelText('Número do documento') as HTMLInputElement).value).toBe('07.20.26252.7312345-6'));
        fireEvent.click(within(grupo).getByText('Conferir na Receita'));
        await waitFor(() => expect((screen.getByLabelText('Valor pago') as HTMLInputElement).value).toBe('1020,50'));
        expect(gu.receita).toHaveBeenCalledWith('E1', '44388152000189', ['07.20.26252.7312345-6']);
        expect((screen.getByLabelText('Data do pagamento') as HTMLInputElement).value).toBe('2026-10-21');
        expect(screen.getByRole('status').textContent).toMatch(/arrecadados em 21\/10\/2026 \(multa R\$\s6,60, juros R\$\s13,90\)/);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(within(grupo).getByText('Gravar a baixa'));
        await waitFor(() => expect(gu.baixa).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'darf-2026-09' }), { valorDevido: 100000, numeroDocumento: '07.20.26252.7312345-6' },
            { data: '2026-10-21', valorPago: 102050, autenticacao: '', fonte: 'receita' }, usuario));
    });

    it('DARF não localizado na Receita: a baixa continua manual, com o motivo', async () => {
        gu.listar.mockResolvedValue(new Map());
        st.listar.mockResolvedValue(new Map());
        gu.receita.mockResolvedValue({ ok: true, fonte: 'serpro', situacoes: [{ numeroDocumento: '123', localizado: false, pagamento: null, observacao: 'Não localizado no PAGTOWEB. A arrecadação leva alguns dias para aparecer; isto não quer dizer que não foi pago.' }] });
        render(<CalendarioEmpresa {...props} empresa={{ ...props.empresa, cnpj: '44.388.152/0001-89' }} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Dar baixa: DARF da DCTFWeb (INSS e IRRF)' }));
        const grupo = screen.getByRole('group', { name: 'Baixa de DARF da DCTFWeb (INSS e IRRF)' });
        expect((within(grupo).getByText('Conferir na Receita') as HTMLButtonElement).disabled).toBe(true); // sem número do documento
        fireEvent.change(screen.getByLabelText('Número do documento'), { target: { value: '123' } });
        fireEvent.click(within(grupo).getByText('Conferir na Receita'));
        expect((await screen.findByRole('alert')).textContent).toMatch(/não quer dizer que não foi pago/);
        expect((screen.getByLabelText('Valor pago') as HTMLInputElement).value).toBe('');
    });

    it('confere todos os DARF na Receita numa consulta e dá baixa nos localizados', async () => {
        const g = (obrigacao: string, numeroDocumento: string) => ({ obrigacao, competencia: '2026-09', nome: 'DARF', vencimento: '2026-10-20', valorDevido: 100000, numeroDocumento, pagamento: null });
        gu.listar.mockResolvedValue(new Map([['darf-2026-09', g('darf-2026-09', '07.20.26252.7312345-6')]]));
        st.listar.mockResolvedValue(new Map());
        gu.receita.mockResolvedValue({ ok: true, fonte: 'serpro', situacoes: [{ numeroDocumento: '07202625273123456', localizado: true,
            pagamento: { numeroDocumento: '07202625273123456', dataArrecadacao: '2026-10-20', valorTotal: 1000, valorPrincipal: 1000, valorMulta: null, valorJuros: null } }] });
        gu.baixa.mockResolvedValue(undefined);
        render(<CalendarioEmpresa {...props} empresa={{ ...props.empresa, cnpj: '44.388.152/0001-89' }} />);
        await waitFor(() => expect(gu.listar).toHaveBeenCalled());
        await screen.findByText(/documento 07.20.26252.7312345-6/);
        fireEvent.click(screen.getByText('Conferir os DARF na Receita'));
        const painel = await screen.findByRole('region', { name: 'DARF na Receita' });
        expect(gu.receita).toHaveBeenCalledWith('E1', '44388152000189', ['07202625273123456']);
        expect(within(painel).getByText('paga na Receita, sem baixa no DP')).toBeTruthy();
        expect(within(painel).getAllByRole('row')).toHaveLength(2); // cabeçalho + o DARF da competência
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(within(painel).getByText('Dar baixa nas 1 localizada(s)'));
        await waitFor(() => expect(gu.baixa).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'darf-2026-09' }),
            { valorDevido: 100000, numeroDocumento: '07.20.26252.7312345-6' }, { data: '2026-10-20', valorPago: 100000, autenticacao: '', fonte: 'receita' }, usuario));
        expect(await within(painel).findByText('confere com a baixa')).toBeTruthy();
    });

    it('guia DARF paga baixa o comprovante de arrecadação da Receita em PDF', async () => {
        const paga = { obrigacao: 'darf-2026-09', competencia: '2026-09', nome: 'DARF', vencimento: '2026-10-20', valorDevido: 50000, numeroDocumento: '07.20.26252.7312345-6', pagamento: { data: '2026-10-19', valorPago: 50000, autenticacao: '', fonte: 'receita' } };
        gu.listar.mockResolvedValue(new Map([['darf-2026-09', paga]]));
        st.listar.mockResolvedValue(new Map([['darf-2026-09', { status: 'entregue' }]]));
        gu.comprovante.mockResolvedValueOnce({ ok: true, fonte: 'serpro', pdfBase64: 'JVBERi0x' }).mockResolvedValueOnce({ ok: false, fonte: 'serpro', error: 'O SERPRO não devolveu o PDF do comprovante: Documento não encontrado.' });
        render(<CalendarioEmpresa {...props} empresa={{ ...props.empresa, cnpj: '44.388.152/0001-89' }} />);
        const darf = (await screen.findByText('DARF da DCTFWeb (INSS e IRRF)')).closest('tr')!;
        fireEvent.click(await within(darf).findByText('Comprovante da Receita'));
        await waitFor(() => expect(gu.baixar).toHaveBeenCalledWith('comprovante-arrecadacao-darf-2026-09-07202625273123456.pdf', expect.any(Uint8Array), 'application/pdf'));
        expect(gu.comprovante).toHaveBeenCalledWith('E1', '44388152000189', '07.20.26252.7312345-6');
        fireEvent.click(within(darf).getByText('Comprovante da Receita'));
        expect((await screen.findByRole('alert')).textContent).toMatch(/Documento não encontrado/);
        expect(gu.baixar).toHaveBeenCalledTimes(1);
    });

    it('guia paga mostra a baixa e o resumo; data futura é recusada', async () => {
        const paga = { obrigacao: 'darf-2026-09', competencia: '2026-09', nome: 'DARF', vencimento: '2026-10-20', valorDevido: 50000, numeroDocumento: '07.01', pagamento: { data: '2026-10-19', valorPago: 50000, autenticacao: 'X9', fonte: 'manual' }, atualizadoPorEmail: 'bia@x.com' };
        gu.listar.mockResolvedValue(new Map([['darf-2026-09', paga]]));
        st.listar.mockResolvedValue(new Map([['darf-2026-09', { status: 'entregue' }]]));
        gu.desfazer.mockResolvedValue(undefined);
        render(<CalendarioEmpresa {...props} />);
        const darf = (await screen.findByText('DARF da DCTFWeb (INSS e IRRF)')).closest('tr')!;
        await waitFor(() => expect(within(darf).getByText('paga')).toBeTruthy());
        expect(within(darf).getByText(/paga em 19\/10\/2026 · R\$\s500,00 · aut. X9/)).toBeTruthy();
        expect(within(darf).getByText(/Guia: R\$\s500,00 · documento 07.01/)).toBeTruthy();
        expect(screen.getByLabelText('Resumo das guias').textContent).toMatch(/Guias: 1 de 3 com baixa · R\$\s500,00 pagos · 2 vencida\(s\) sem baixa/);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(within(darf).getByText('Desfazer a baixa'));
        await waitFor(() => expect(gu.desfazer).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'darf-2026-09' }), paga, usuario));

        fireEvent.click(screen.getByRole('button', { name: 'Dar baixa: FGTS Digital: guia mensal' }));
        fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2026-11-01' } });
        fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '10,00' } });
        fireEvent.click(screen.getByText('Gravar a baixa'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/não pode ser futura/));
        expect(gu.baixa).not.toHaveBeenCalled();
    });
});
