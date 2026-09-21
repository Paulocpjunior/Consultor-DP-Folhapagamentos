// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import ImplantacaoPanel from '../../../components/implantacao/ImplantacaoPanel';
import { limparSessaoImplantacao } from '../sessao';

vi.mock('../../folha/apontamentoExporter', () => ({ downloadFile: vi.fn() }));
beforeEach(() => { limparSessaoImplantacao(); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); });
afterEach(cleanup);
const xml = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAltContratual/v_S_01_03_00"><evtAltContratual Id="IDTEST"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>52998224725</cpfTrab><matricula>ABC-0001</matricula></ideVinculo><altContratual><dtAlteracao>2026-08-01</dtAlteracao><vinculo><infoContrato><nmCargo>PEDREIRO</nmCargo><remuneracao><vrSalFx>2801.98</vrSalFx></remuneracao></infoContrato></vinculo></altContratual></evtAltContratual></eSocial>`;
describe('implantação na interface', () => {
    it('importa, confere, complementa e preserva dossiê ao navegar sem escrever no backend', async () => {
        const view = render(<ImplantacaoPanel usuario="teste" />);
        fireEvent.change(screen.getByLabelText('CNPJ da empresa na implantação'), { target: { value: '11222333000181' } });
        fireEvent.change(screen.getByLabelText('Data da implantação'), { target: { value: '2026-09-21' } });
        fireEvent.change(screen.getByLabelText('Adicionar XMLs'), { target: { files: [{ name: 'teste.xml', size: xml.length, text: async () => xml }] } });
        await waitFor(() => expect(screen.getByText('ABC-0001')).toBeTruthy());
        fireEvent.click(screen.getByText('Conferir ficha'));
        expect(screen.getByText(/Falta S-2200/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Valor confirmado'), { target: { value: 'PESSOA CONFERIDA' } });
        fireEvent.change(screen.getByLabelText('Documento ou responsável pela informação'), { target: { value: 'Cliente' } });
        fireEvent.change(screen.getByLabelText('Justificativa da inclusão/alteração'), { target: { value: 'Ficha conferida pelo CPF' } });
        expect(screen.getByText('Registrar complemento').hasAttribute('disabled')).toBe(true);
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByText('Registrar complemento'));
        expect(screen.getAllByText('PESSOA CONFERIDA').length).toBeGreaterThan(0);
        view.unmount();
        const second = render(<ImplantacaoPanel usuario="teste" />);
        expect(screen.getByText('PESSOA CONFERIDA')).toBeTruthy();
        expect(screen.getByText(/Exportação cadastral IOB pendente/)).toBeTruthy();
        second.unmount(); render(<ImplantacaoPanel usuario="outro" />);
        expect(screen.queryByText('PESSOA CONFERIDA')).toBeNull();
    });
});
