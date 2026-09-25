// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import CadastroIobModal from '../../../components/implantacao/CadastroIobModal';
import { consolidar, lerXml } from '../implantacao';
import { novoDossie } from '../dossie';

const baixar = vi.fn();
vi.mock('../zip', async importOriginal => ({ ...(await importOriginal<typeof import('../zip')>()), baixarBytes: (...args: unknown[]) => baixar(...args) }));
vi.mock('../lerPdf', () => ({ lerFichaPdf: vi.fn(async () => ({ cnpj: '11222333000181', cpf: '52998224725', matricula: '000123', dados: { nome: 'PESSOA TESTE', mae: 'MAE TESTE', pis: '13054012041' }, avisos: [] })) }));

const xml = `<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto><evento><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"><evtAdmissao Id="ID1112223330000002026091600000000001"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><trabalhador><cpfTrab>52998224725</cpfTrab><nmTrab>PESSOA TESTE</nmTrab><sexo>M</sexo><nascimento><dtNascto>1990-01-01</dtNascto></nascimento></trabalhador><vinculo><matricula>000123</matricula><infoRegimeTrab><infoCeletista><dtAdm>2026-09-16</dtAdm></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>AUXILIAR</nmCargo><CBOCargo>411005</CBOCargo><remuneracao><vrSalFx>2000.00</vrSalFx></remuneracao></infoContrato></vinculo></evtAdmissao></eSocial></evento><recibo><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento Id="ID1112223330000002026091600000000001"><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><processamento><cdResposta>201</cdResposta></processamento><recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo></retornoEvento></eSocial></recibo></retornoEventoCompleto></eSocial>`;
const fonte = { nome: 'adm.xml', xml, hash: 'c'.repeat(64) };
const dossie = { ...novoDossie(), cnpj: '11222333000181', corte: '2026-09-30', fontes: [fonte] };
const cadastros = consolidar(lerXml(fonte).eventos, dossie.cnpj, dossie.corte).cadastros;
const pdf = { name: 'ficha.pdf', size: 10, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 teste').buffer };

beforeEach(() => { baixar.mockClear(); localStorage.clear(); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); });
afterEach(cleanup);

describe('modal Cadastro IOB', () => {
    it('recebe XML e PDF juntos, une por identidade, registra complementos e exporta TXT, Excel e ZIP', async () => {
        const adicionar = vi.fn(async () => {}); const documento = vi.fn(); const registrar = vi.fn();
        render(<CadastroIobModal usuario="u" dossie={dossie} cadastros={cadastros} avisos={[]} onAdicionarXmls={adicionar} onDocumento={documento} onRegistrarComplementos={registrar} onFechar={vi.fn()} />);
        expect(screen.getByText('PESSOA TESTE')).toBeTruthy();
        expect(screen.getByText('não localizada')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Adicionar XMLs e PDFs'), { target: { files: [{ name: 'outro.xml', size: 5, text: async () => '' }, pdf, { name: 'nota.txt', size: 1 }] } });
        await waitFor(() => expect(screen.getByText('✔ ficha.pdf')).toBeTruthy());
        expect(adicionar).toHaveBeenCalledWith([expect.objectContaining({ name: 'outro.xml' })]);
        expect(documento).toHaveBeenCalledWith(expect.objectContaining({ nome: 'ficha.pdf' }));
        expect(screen.getByRole('alert').textContent).toContain('nota.txt');
        expect(screen.getByText('2 campo(s)')).toBeTruthy();
        fireEvent.click(screen.getByText('Registrar complementos no dossiê'));
        expect(registrar.mock.calls[0][0].map((c: { campo: string }) => c.campo).sort()).toEqual(['mae', 'pis']);

        fireEvent.click(screen.getByText('Baixar TXT de cadastro (Importação de Funcionários)'));
        const [nomeTxt, bytesTxt] = baixar.mock.calls[0] as [string, Uint8Array];
        expect(nomeTxt).toBe('cadastro-funcionarios-iob-11222333000181.txt');
        const texto = new TextDecoder('latin1').decode(bytesTxt);
        expect(texto.startsWith('000123PESSOA TESTE')).toBe(true);
        expect(texto).toContain('52998224725');
        expect(texto).toContain('MAE TESTE');
        expect(texto.endsWith('\r\n')).toBe(true);

        fireEvent.click(screen.getByText('Baixar Excel de cadastro'));
        expect(baixar.mock.calls[1][0]).toBe('template-cadastro-iob-sage-11222333000181.xlsx');
        fireEvent.click(screen.getByText('Baixar XMLs S-2200 (ZIP)'));
        expect(baixar.mock.calls[2][0]).toBe('esocial-s2200-11222333000181.zip');
        expect(new TextDecoder().decode((baixar.mock.calls[2][1] as Uint8Array).slice(0, 4))).toBe('PK\u0003\u0004');
        expect(screen.getAllByText(/não homologado/).length).toBeGreaterThan(0);
    });
    it('permite editar o layout, persiste no navegador e bloqueia exportação com layout inválido', () => {
        const props = { usuario: 'u', dossie, cadastros, avisos: [], onAdicionarXmls: vi.fn(async () => {}), onDocumento: vi.fn(), onRegistrarComplementos: vi.fn(), onFechar: vi.fn() };
        const view = render(<CadastroIobModal {...props} />);
        fireEvent.click(screen.getByText('Editar layout'));
        fireEvent.change(screen.getByLabelText('Tamanho do campo 2'), { target: { value: '30' } });
        fireEvent.click(screen.getByText('Prévia do TXT'));
        expect(screen.getByLabelText('Prévia do TXT').textContent).toContain('000123PESSOA TESTE                  5299');
        view.unmount();
        render(<CadastroIobModal {...props} />);
        fireEvent.click(screen.getByText('Editar layout'));
        expect((screen.getByLabelText('Tamanho do campo 2') as HTMLInputElement).value).toBe('30');
        fireEvent.change(screen.getByLabelText('Tamanho do campo 2'), { target: { value: '0' } });
        expect(screen.getByRole('alert').textContent).toContain('tamanho');
        expect(screen.getByText('Baixar TXT de cadastro (Importação de Funcionários)').hasAttribute('disabled')).toBe(true);
        fireEvent.click(screen.getByText('Restaurar padrão'));
        expect(screen.getByText('Baixar TXT de cadastro (Importação de Funcionários)').hasAttribute('disabled')).toBe(false);
    });
});
