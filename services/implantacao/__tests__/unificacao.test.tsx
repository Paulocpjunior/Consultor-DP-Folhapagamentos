// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ConferenciaPdf from '../../../components/implantacao/ConferenciaPdf';
import ExportacaoIobModal from '../../../components/folha/ExportacaoIobModal';
import type { Cadastro } from '../implantacao';
afterEach(cleanup);
const cadastro: Cadastro = { chave: 'x', empregador: '11222333', cpf: '52998224725', matricula: '001', dados: { nome: 'TESTE', salario: '1000.00' }, origens: {}, eventos: [], pendencias: [], desligado: false };
const ficha = { cnpj: '11222333000181', cpf: cadastro.cpf, matricula: cadastro.matricula, dados: { nome: 'TESTE', mae: 'MAE TESTE', salario: '2000.00' }, avisos: [] };
it('exige confirmação; divergência não é aplicada por padrão', () => {
    const aplicar = vi.fn(); render(<ConferenciaPdf ficha={ficha} cadastro={cadastro} cnpj={ficha.cnpj} nome="ficha.pdf" onAplicar={aplicar} />);
    const botao = screen.getByText('Aplicar campos conferidos'); expect(botao.hasAttribute('disabled')).toBe(true);
    expect((screen.getByLabelText('Aplicar Salário fixo (decimal com ponto)') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText(/Conferi os campos/)); fireEvent.click(botao);
    expect(aplicar.mock.calls[0][0]).toEqual([{ campo: 'mae', valor: 'MAE TESTE' }]);
});
it('exige justificativa para divergência e bloqueia outro CPF', () => {
    const aplicar = vi.fn(); const v = render(<ConferenciaPdf ficha={ficha} cadastro={cadastro} cnpj={ficha.cnpj} nome="ficha.pdf" onAplicar={aplicar} />);
    fireEvent.click(screen.getByLabelText('Aplicar Salário fixo (decimal com ponto)'));
    fireEvent.click(screen.getByLabelText(/Conferi os campos/)); expect(screen.getByText('Aplicar campos conferidos').hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Justificativa para substituir dados divergentes'), { target: { value: 'Documento atualizado confirmado' } });
    fireEvent.click(screen.getByLabelText(/Conferi os campos/)); fireEvent.click(screen.getByText('Aplicar campos conferidos'));
    expect(aplicar.mock.calls[0][0]).toContainEqual({ campo: 'salario', valor: '2000.00' });
    v.unmount(); render(<ConferenciaPdf ficha={{ ...ficha, cpf: '11111111111' }} cadastro={cadastro} cnpj={ficha.cnpj} nome="outra.pdf" onAplicar={aplicar} />);
    expect(screen.getByRole('alert').textContent).toContain('CPF'); expect(screen.queryByText('Aplicar campos conferidos')).toBeNull();
});
it('mesmo modal oferece pacote cadastral sem alegar compatibilidade ou chamar TXT mensal', () => {
    const exportar = vi.fn(), modo = vi.fn(); render(<ExportacaoIobModal modo="cadastro" quantidade={1} onFechar={vi.fn()} onExportar={exportar} onModo={modo} />);
    expect(screen.getByText(/Compatibilidade cadastral IOB pendente/)).toBeTruthy();
    expect(screen.queryByText('Confirmar exportação dos TXTs')).toBeNull();
    fireEvent.click(screen.getByText('Baixar pacote cadastral (JSON)')); expect(exportar).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Modo de exportação'), { target: { value: 'apontamentos' } }); expect(modo).toHaveBeenCalledWith('apontamentos');
});
it('modo mensal conserva ação de TXT e não oferece pacote cadastral', () => {
    const exportar = vi.fn(); render(<ExportacaoIobModal modo="apontamentos" quantidade={2} onFechar={vi.fn()} onExportar={exportar} />);
    expect(screen.queryByText('Baixar pacote cadastral (JSON)')).toBeNull();
    fireEvent.click(screen.getByText('Confirmar exportação dos TXTs')); expect(exportar).toHaveBeenCalledOnce();
});
it('oferece Excel preenchido apenas na implantação e impede download vazio', () => {
    const excel = vi.fn();
    const props = { onFechar: vi.fn(), onExportar: vi.fn(), onModeloExcel: excel };
    const view = render(<ExportacaoIobModal {...props} modo="cadastro" quantidade={1} />);
    fireEvent.click(screen.getByText('Baixar Excel preenchido (conferência)'));
    expect(excel).toHaveBeenCalledOnce();
    view.rerender(<ExportacaoIobModal {...props} modo="cadastro" quantidade={0} />);
    expect(screen.getByText('Baixar Excel preenchido (conferência)').hasAttribute('disabled')).toBe(true);
    view.rerender(<ExportacaoIobModal {...props} modo="apontamentos" quantidade={1} />);
    expect(screen.queryByText('Baixar Excel preenchido (conferência)')).toBeNull();
});
