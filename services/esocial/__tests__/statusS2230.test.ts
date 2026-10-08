// S-2230 gerado pelo DP e situação do evento por afastamento (dados fictícios).
import { describe, expect, it } from 'vitest';
import { gerarS2230 } from '../transmissao';
import { statusS2230 } from '../statusEvento';
import type { Envio } from '../transmissaoService';

const CNPJ = '29463877000109';
const ID = 'ID1294638770000002026100512000000001';
const FERIAS = { cpf: '529.982.247-25', matriculaEsocial: '000353', dtInicio: '2026-11-09', dtFim: '2026-11-28', motivo: '15', perAquisInicio: '2025-10-30', perAquisFim: '2026-10-29' };

describe('S-2230 gerado pelo DP', () => {
    it('férias: início, término e período aquisitivo no mesmo evento (validado no XSD S-1.3, falta só a assinatura)', () => {
        expect(gerarS2230({ cnpj: CNPJ, tpAmb: 1, afastamento: FERIAS, id: ID }).xml).toBe(
            '<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAfastTemp/v_S_01_03_00"><evtAfastTemp Id="ID1294638770000002026100512000000001">'
            + '<ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb><procEmi>1</procEmi><verProc>ConsultorDP_1.0</verProc></ideEvento>'
            + '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>'
            + '<ideVinculo><cpfTrab>52998224725</cpfTrab><matricula>000353</matricula></ideVinculo>'
            + '<infoAfastamento><iniAfastamento><dtIniAfast>2026-11-09</dtIniAfast><codMotAfast>15</codMotAfast>'
            + '<perAquis><dtInicio>2025-10-30</dtInicio><dtFim>2026-10-29</dtFim></perAquis></iniAfastamento>'
            + '<fimAfastamento><dtTermAfast>2026-11-28</dtTermAfast></fimAfastamento></infoAfastamento></evtAfastTemp></eSocial>');
    });
    it('doença em aberto: sem término; observação escapada', () => {
        const x = gerarS2230({ cnpj: CNPJ, tpAmb: 2, afastamento: { ...FERIAS, motivo: '03', dtFim: '', infoMesmoMtv: 'N', observacao: 'Atestado <15d> & retorno', perAquisInicio: '' }, id: ID }).xml;
        expect(x).toContain('<codMotAfast>03</codMotAfast><infoMesmoMtv>N</infoMesmoMtv><observacao>Atestado &lt;15d&gt; &amp; retorno</observacao></iniAfastamento>');
        expect(x).not.toContain('fimAfastamento');
    });
    it('recusa antes de enviar o que o eSocial recusaria', () => {
        expect(() => gerarS2230({ cnpj: CNPJ, tpAmb: 1, afastamento: { ...FERIAS, perAquisInicio: '' } })).toThrow(/período aquisitivo/);
        expect(() => gerarS2230({ cnpj: CNPJ, tpAmb: 1, afastamento: { ...FERIAS, matriculaEsocial: ' ' } })).toThrow(/matrícula/);
        expect(() => gerarS2230({ cnpj: CNPJ, tpAmb: 1, afastamento: { ...FERIAS, dtFim: '2026-11-01' } })).toThrow(/término/);
    });
});

const envio = (p: Partial<Envio>): Envio => ({ id: 'L1', empresaId: 'E1', cnpj: CNPJ, tpAmb: 1, grupo: 2, protocolo: '1.2.3', dhRecepcao: '', transmissor: '', certificado: 'escritorio',
    situacao: 'enviado', cdResposta: 201, descResposta: '', ocorrencias: [], eventos: [], enviadoPorEmail: 'a@x', enviadoEm: '2026-10-07T10:00:00.000Z', consultadoEm: null, ...p });

describe('situação do S-2230 de um afastamento', () => {
    const a = { id: 'f1_2026-11-09', recibos: [] as string[] };
    it('teste na produção restrita fica à parte: não marca aceito nem esconde o envio à produção', () => {
        const teste = envio({ id: 'T1', tpAmb: 2, situacao: 'processado', eventos: [{ id: 'ID7', tipo: 'S-2230', perApur: null, ref: a.id, cdResposta: 201, nrRecibo: '1.2.0000000000000000007' }] });
        const s = statusS2230(a, [teste]);
        expect([s.situacao, s.teste?.situacao, s.envio]).toEqual(['nao-enviado', 'aceito', null]);
        const prod = envio({ id: 'P1', enviadoEm: '2026-10-06T10:00:00.000Z', eventos: [{ id: 'ID9', tipo: 'S-2230', perApur: null, ref: a.id }] });
        const s2 = statusS2230(a, [teste, prod]);
        expect([s2.situacao, s2.envio?.id, s2.teste?.envio?.id, s2.historico.length]).toEqual(['aguardando', 'P1', 'T1', 2]);
    });
    it('não enviado; enviado pelo IOB (recibo importado)', () => {
        expect(statusS2230(a, []).situacao).toBe('nao-enviado');
        expect(statusS2230({ ...a, recibos: ['1.1.999'] }, [])).toMatchObject({ situacao: 'iob', recibo: '1.1.999' });
    });
    it('aguardando, aceito com recibo e rejeitado com ocorrências; vale o envio mais recente', () => {
        const aguardando = envio({ eventos: [{ id: 'ID9', tipo: 'S-2230', perApur: null, ref: a.id }] });
        expect(statusS2230(a, [aguardando])).toMatchObject({ situacao: 'aguardando', detalhe: 'Protocolo 1.2.3. Consulte o retorno.' });
        const aceito = envio({ situacao: 'processado', eventos: [{ id: 'ID9', tipo: 'S-2230', perApur: null, ref: a.id, cdResposta: 201, nrRecibo: '1.2.0000000000000000001' }] });
        expect(statusS2230(a, [aceito])).toMatchObject({ situacao: 'aceito', recibo: '1.2.0000000000000000001' });
        const recusado = envio({ id: 'L0', enviadoEm: '2026-10-06T10:00:00.000Z', situacao: 'processado',
            eventos: [{ id: 'ID8', tipo: 'S-2230', perApur: null, ref: a.id, cdResposta: 401, descResposta: 'Erro', ocorrencias: [{ tipo: 1, codigo: '1234', descricao: 'Matrícula inexistente', localizacao: '' }] }] });
        expect(statusS2230(a, [recusado]).detalhe).toBe('401 Erro — 1234 Matrícula inexistente');
        const s = statusS2230(a, [recusado, aceito]);
        expect(s.situacao).toBe('aceito');
        expect(s.historico.map(h => h.envio.id)).toEqual(['L1', 'L0']);
        // Evento de outro afastamento não conta.
        expect(statusS2230({ ...a, id: 'outro' }, [aceito]).situacao).toBe('nao-enviado');
    });
    it('lote recusado na recepção', () => {
        const l = envio({ situacao: 'recusado', cdResposta: 402, descResposta: 'Lote inválido', eventos: [{ id: 'ID9', tipo: 'S-2230', perApur: null, ref: a.id }] });
        expect(statusS2230(a, [l])).toMatchObject({ situacao: 'recusado', detalhe: 'Lote recusado: 402 Lote inválido' });
    });
});
