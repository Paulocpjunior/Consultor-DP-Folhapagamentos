// @vitest-environment jsdom
// S-1070 e o uso dos processos no S-1010, no S-1005 e no S-1020; a tela (dados fictícios).
import React from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { gerarS1070, idProcesso, processoVazio, processosVigentes, validarProcesso, type ProcessoJudAdm } from '../processosJud';
import { gerarS1010, pedidoVazio, validarDados } from '../../esocial/tabelaRubricas';
import { lerXmlRubricas } from '../../cadastros/rubricas';
import { gerarS1005, gerarS1020, lotacaoVazia, validarLotacao } from '../../obras/lotacoes';

const srv = vi.hoisted(() => ({ processos: [] as unknown[], salvos: [] as unknown[], envios: [] as { xml: string; ref: string }[] }));
vi.mock('../processosJudService', () => ({ listarProcessos: async () => srv.processos, salvarProcesso: async (p: unknown) => { srv.salvos.push(p); return 'id'; } }));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'E1', cnpj: '44388152000189', razaoSocial: 'ALFA', nomeFantasia: 'ALFA', codigoSage: '1', criadoPor: 'u' }] }));
vi.mock('../../esocial/transmissaoService', () => ({ listarEnvios: async () => [] }));
vi.mock('../../esocial/envioSeguro', () => ({
    verificarAntesDeEnviar: async (x: { eventos: { xml: string; ref: string }[] }) => { srv.envios.push(...x.eventos); return { ok: true, achados: [] }; },
    transmitirVerificado: async () => ({ situacao: 'enviado' }), mensagemDaTransmissao: () => ({ ok: true, texto: 'Lote recebido.' }),
}));
import ProcessosS1070Panel from '../../../components/processosJud/ProcessosS1070Panel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const CNPJ = '44388152000189';
const AGORA = new Date('2026-10-11T12:00:00Z');
const JUD: ProcessoJudAdm = { ...processoVazio('E1'), id: 'E1_2_00012345620264036100', tpProc: '2', nrProc: '00012345620264036100', iniValid: '2026-01', indAutoria: '1', observacao: 'Terço de férias',
    vara: { uf: 'SP', codMunic: '3550308', idVara: '12' }, suspensoes: [{ codSusp: '1', indSusp: '01', dtDecisao: '2026-01-15', indDeposito: 'N' }] };
const ADM: ProcessoJudAdm = { ...processoVazio('E1'), tpProc: '1', nrProc: '12345678901234567', iniValid: '2026-01', indAutoria: '', suspensoes: [{ codSusp: '7', indSusp: '03', dtDecisao: '2026-02-01', indDeposito: 'S' }] };
const FAP: ProcessoJudAdm = { ...processoVazio('E1'), tpProc: '4', nrProc: '1234567890123456', iniValid: '2026-01', indAutoria: '', suspensoes: [{ codSusp: '1', indSusp: '14', dtDecisao: '2026-03-01', indDeposito: 'N' }] };
afterEach(() => { cleanup(); srv.processos = []; srv.salvos.length = 0; srv.envios.length = 0; });

describe('S-1070', () => {
    it('inclusão (judicial, administrativo, FAP e só FGTS), alteração com nova validade e exclusão passam no XSD', async () => {
        const casos = [
            { processo: JUD, acao: 'inclusao' as const }, { processo: ADM, acao: 'inclusao' as const }, { processo: FAP, acao: 'inclusao' as const },
            { processo: { ...JUD, indMatProc: '7' as const, suspensoes: [] }, acao: 'inclusao' as const },
            { processo: JUD, acao: 'alteracao' as const, novaValidade: { iniValid: '2026-01', fimValid: '2026-12' } },
            { processo: JUD, acao: 'exclusao' as const },
        ];
        for (const c of casos) {
            const g = gerarS1070({ cnpj: CNPJ, tpAmb: 2, agora: AGORA, ...c });
            expect(g.erros).toEqual([]);
            expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        }
        const x = gerarS1070({ cnpj: CNPJ, tpAmb: 2, processo: JUD, acao: 'inclusao', agora: AGORA }).evento!.xml;
        expect(x).toContain('<dadosProc><indAutoria>1</indAutoria><indMatProc>1</indMatProc><observacao>Terço de férias</observacao><dadosProcJud><ufVara>SP</ufVara><codMunic>3550308</codMunic><idVara>12</idVara></dadosProcJud><infoSusp><codSusp>1</codSusp><indSusp>01</indSusp><dtDecisao>2026-01-15</dtDecisao><indDeposito>N</indDeposito></infoSusp></dadosProc>');
        expect(gerarS1070({ cnpj: CNPJ, tpAmb: 2, processo: ADM, acao: 'inclusao', agora: AGORA }).evento!.xml).not.toContain('indAutoria');
    });

    it('validações: número por tipo, autoria, vara, indicativos por tipo e o depósito', () => {
        const e = validarProcesso({ ...JUD, nrProc: '123', indAutoria: '', vara: { uf: '', codMunic: '1', idVara: '' }, suspensoes: [{ codSusp: '1', indSusp: '03', dtDecisao: '', indDeposito: 'N' }, { codSusp: '1', indSusp: '02', dtDecisao: '2026-01-01', indDeposito: 'N' }] }).join(' ');
        for (const m of [/20 algarismos/, /autoria/, /Vara: UF/, /Vara: código IBGE/, /Vara: código de identificação/, /indicativo 03 não vale/, /data da decisão/, /código 1 repetido/, /pede "depósito = sim"/]) expect(e).toMatch(m);
        expect(validarProcesso({ ...ADM, suspensoes: [] }).join(' ')).toMatch(/ao menos uma suspensão/);
        expect(validarProcesso({ ...FAP, indMatProc: '7' }).join(' ')).toMatch(/FAP é matéria tributária/);
        expect(idProcesso('E1', '2', '0001234-56.2026.4.03.6100')).toBe('E1_2_00012345620264036100');
        expect(processosVigentes([JUD, { ...ADM, fimValid: '2026-05' }, { ...FAP, ativo: false }], '2026-10').map(p => p.tpProc)).toEqual(['2']);
    });
});

describe('os processos nos eventos de tabela', () => {
    it('S-1010 com incidência suspensa leva o processo e passa no XSD; o importado traz os processos de volta', async () => {
        const d = { ...pedidoVazio('E1').dados!, dscRubr: 'Terço de férias', natRubr: '1020', tpRubr: '1', codIncCP: '91', codIncIRRF: '11', codIncFGTS: '91',
            processosCP: [{ tpProc: '2' as const, nrProc: JUD.nrProc, extDecisao: '1' as const, codSusp: '1' }], processosFGTS: [{ nrProc: JUD.nrProc }] };
        expect(validarDados(d)).toEqual([]);
        const { xml } = gerarS1010({ cnpj: CNPJ, tpAmb: 2, pedido: { ...pedidoVazio('E1'), codRubr: 'TERCO', ideTabRubr: 'T1', iniValid: '2026-10', dados: d }, agora: AGORA, seq: 1 });
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(xml).toContain(`<ideProcessoCP><tpProc>2</tpProc><nrProc>${JUD.nrProc}</nrProc><extDecisao>1</extDecisao><codSusp>1</codSusp></ideProcessoCP><ideProcessoFGTS><nrProc>${JUD.nrProc}</nrProc></ideProcessoFGTS>`);
        // Como vem do download do eSocial: o evento de produção com o recibo (201).
        const prod = gerarS1010({ cnpj: CNPJ, tpAmb: 1, pedido: { ...pedidoVazio('E1'), codRubr: 'TERCO', ideTabRubr: 'T1', iniValid: '2026-10', dados: d }, agora: AGORA, seq: 1 }).xml;
        const env = `<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto><evento>${prod}</evento><recibo><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento><processamento><cdResposta>201</cdResposta><dhProcessamento>2026-10-11T12:00:00</dhProcessamento></processamento><recibo><nrRecibo>1.1.1</nrRecibo></recibo></retornoEvento></eSocial></recibo></retornoEventoCompleto></eSocial>`;
        const lido = lerXmlRubricas('s1010.xml', env, CNPJ.slice(0, 8)).eventos[0].dados!;
        expect(lido.processosCP).toEqual(d.processosCP);
        expect(lido.processosFGTS).toEqual(d.processosFGTS);
        expect(validarDados({ ...d, processosCP: undefined }).join(' ')).toMatch(/codIncCP 91 \(suspensa\)/);
        expect(validarDados({ ...d, codIncCP: '11' }).join(' ')).toMatch(/só com codIncCP suspenso/);
    });

    it('S-1005 com o processo do RAT e do FAP; S-1020 com terceiros suspensos; passam no XSD', async () => {
        const ref = { tpProc: '2' as const, nrProc: JUD.nrProc, codSusp: '1' };
        const obra = { ...lotacaoVazia('E1'), codigo: 'OBRA01', descricao: 'Obra', iniValid: '2026-10', cno: '900012345678', cnaePrep: '4120400', aliqRat: '1' as const, fap: '0,8', procRat: ref, procFap: ref,
            codTercsSusp: '0064', procTerceiros: [{ codTerc: '0064', nrProcJud: JUD.nrProc, codSusp: '1' }] };
        expect(validarLotacao(obra, CNPJ).erros).toEqual([]);
        const s1005 = gerarS1005({ cnpj: CNPJ, tpAmb: 2, lotacao: obra, agora: AGORA, seq: 1 }).xml;
        expect(s1005).toContain(`<aliqGilrat><aliqRat>1</aliqRat><fap>0.8000</fap><procAdmJudRat><tpProc>2</tpProc><nrProc>${JUD.nrProc}</nrProc><codSusp>1</codSusp></procAdmJudRat><procAdmJudFap>`);
        expect(await validarPeloXsd(s1005, lerXsd)).toEqual({ valido: true, erros: [] });
        const s1020 = gerarS1020({ cnpj: CNPJ, tpAmb: 2, lotacao: obra, agora: AGORA, seq: 2 }).xml;
        expect(s1020).toContain(`<codTercsSusp>0064</codTercsSusp><infoProcJudTerceiros><procJudTerceiro><codTerc>0064</codTerc><nrProcJud>${JUD.nrProc}</nrProcJud><codSusp>1</codSusp></procJudTerceiro></infoProcJudTerceiros></fpasLotacao>`);
        expect(await validarPeloXsd(s1020, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(validarLotacao({ ...obra, procRat: null, procFap: null }, CNPJ).erros.join(' ')).toMatch(/RAT da obra diferente.*processo/);
    });
});

describe('tela dos processos', () => {
    it('cadastra o processo judicial e transmite a inclusão do S-1070', async () => {
        const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: CNPJ, codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
        const { rerender } = render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ProcessosS1070Panel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('+ Processo'));
        fireEvent.change(screen.getByLabelText('Número do processo'), { target: { value: JUD.nrProc } });
        fireEvent.change(screen.getByLabelText('Início da validade'), { target: { value: '2026-01' } });
        fireEvent.change(screen.getByLabelText('UF da vara'), { target: { value: 'sp' } });
        fireEvent.change(screen.getByLabelText('Município da vara'), { target: { value: '3550308' } });
        fireEvent.change(screen.getByLabelText('Código da vara'), { target: { value: '12' } });
        fireEvent.change(screen.getByLabelText('Indicativo da suspensão 1'), { target: { value: '01' } });
        fireEvent.change(screen.getByLabelText('Data da decisão 1'), { target: { value: '2026-01-15' } });
        await waitFor(() => expect((screen.getByText('Gravar processo') as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByText('Gravar processo'));
        await waitFor(() => expect(srv.salvos).toHaveLength(1));
        expect(srv.salvos[0]).toMatchObject({ empresaId: 'E1', tpProc: '2', nrProc: JUD.nrProc, vara: { uf: 'SP' } });
        srv.processos = [{ ...(srv.salvos[0] as object), id: JUD.id }];
        rerender(<EmpresaAtivaProvider ativa={{ ...ATIVA, ativadaEm: 2 }} trocar={() => {}}><ProcessosS1070Panel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(await screen.findByText('Transmitir inclusão'));
        await waitFor(() => expect(srv.envios).toHaveLength(1));
        expect(srv.envios[0].ref).toBe(`s1070:${JUD.id}:inclusao`);
        expect(srv.envios[0].xml).toContain('<inclusao>');
    });
});
