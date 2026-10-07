// @vitest-environment jsdom
// Tela "Conferir com o eSocial do IOB": lê o .zip, mostra o critério e o detalhe por funcionário.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const sv = vi.hoisted(() => ({ rubricas: vi.fn(async (_id: string) => [] as unknown[]) }));
vi.mock('../../cadastros/cadastrosService', () => ({ listarRubricas: (id: string) => sv.rubricas(id), mensagemErro: (e: unknown) => String(e) }));
import ConferenciaEsocialIob from '../../../components/calculo/ConferenciaEsocialIob';
import { gerarZip } from '../../implantacao/zip';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const CNPJ = '44388152000189';
const rub = (codRubr: string, dscRubr: string, natRubr: string, tpRubr: string) => ({ id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr, natRubr, tpRubr, codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] });
const s1200 = (perApur: string, sal: string, inss: string) => `<eSocial><evtRemun Id="ID${perApur}"><ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${perApur}</perApur><tpAmb>1</tpAmb></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador><ideTrabalhador><cpfTrab>52998224725</cpfTrab></ideTrabalhador>
<dmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><remunPerApur><matricula>M1</matricula>
<itensRemun><codRubr>0001</codRubr><ideTabRubr>T1</ideTabRubr><qtdRubr>30</qtdRubr><vrRubr>${sal}</vrRubr></itensRemun><itensRemun><codRubr>0901</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${inss}</vrRubr></itensRemun>
</remunPerApur></ideEstabLot></infoPerApur></dmDev></evtRemun></eSocial>`;
const ficha = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo' as const, dados: { nome: 'ANA' } };
const motor = (): ResultadoCalculo[] => [{ fichaId: 'f1', nome: 'ANA', competencia: '', pagamento: '', situacao: 'calculado',
    verbas: [{ codigo: 'SAL', valor: 300000 }, { codigo: 'INSS', valor: 25341 }], bases: { inss: 300000, fgts: 300000, irrf: 300000 },
    totais: { proventos: 300000, descontos: 25341, liquido: 274659 }, fgts: 24000, memoria: [], avisos: [], erros: [] } as unknown as ResultadoCalculo];

describe('tela Conferir com o eSocial do IOB', () => {
    it('3 meses sem diferença atingem o critério; o mês com diferença mostra o item', async () => {
        sv.rubricas.mockResolvedValue([rub('0001', 'SALARIO', '1000', '1'), rub('0901', 'INSS', '9201', '2')]);
        const zip = gerarZip(['2026-06', '2026-07', '2026-08'].map(c => ({ nome: `${c}.xml`, conteudo: s1200(c, '3000.00', '253.41') }))
            .concat([{ nome: '2026-09.xml', conteudo: s1200('2026-09', '3000.00', '253.40') }]));
        render(<ConferenciaEsocialIob empresa={{ id: 'E1', cnpj: CNPJ, codigoSage: '1200' }} fichas={[ficha]} motor={motor} comFerias={() => new Set()} />);
        await waitFor(() => expect(sv.rubricas).toHaveBeenCalledWith('E1'));
        const arquivo = new File([zip as BlobPart], 'download.zip', { type: 'application/zip' });
        Object.defineProperty(arquivo, 'arrayBuffer', { value: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) });
        fireEvent.change(screen.getByLabelText('Arquivos do eSocial do IOB'), { target: { files: [arquivo] } });
        fireEvent.click(screen.getByText('Conferir'));
        await waitFor(() => expect(screen.getByRole('note').textContent).toMatch(/atingido\..*3 mês\(es\), de 06\/2026 a 08\/2026/));
        // Abre na última competência, que diverge no INSS.
        const tabela = screen.getByText(/Funcionários em 09\/2026/).closest('table')!;
        expect(within(tabela).getByText('diverge')).toBeTruthy();
        expect(within(tabela).getByText(/INSS \+R\$\s0,01/)).toBeTruthy();
        fireEvent.click(within(tabela).getByText('ANA'));
        expect(within(tabela).getByText('Rubricas do IOB no S-1200')).toBeTruthy();
        expect(within(tabela).getByText('SALARIO')).toBeTruthy();
    });
});
