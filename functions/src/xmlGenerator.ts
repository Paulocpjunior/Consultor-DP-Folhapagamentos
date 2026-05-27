import { create } from 'xmlbuilder2';

export type EventoTipo = 'S-1200' | 'S-1210' | 'S-1299' | 'S-2200' | 'S-2300' | 'S-2299';

interface DadosEvento {
  tipo: EventoTipo;
  empresaCnpj: string;
  competencia: string;
  funcionarioNome?: string;
  funcionarioCpf?: string;
  dados?: Record<string, any>; // indRetif, nrRecibo for retificações
}

const NAMESPACE = 'http://www.esocial.gov.br/schema/evt';

function getTpAmb(): string {
  return process.env.ESOCIAL_AMBIENTE || '2';
}

function gerarIdEvento(tipo: string, cnpj: string): string {
  const agora = new Date();
  const ts = agora.toISOString().replace(/[-T:\.Z]/g, '').slice(0, 14);
  const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `ID${tipo.replace('-', '')}${cnpj.padStart(14, '0')}${ts}${seq}`;
}

export function gerarXmlEvento(dados: DadosEvento): string {
  const id = gerarIdEvento(dados.tipo, dados.empresaCnpj);
  const [ano, mes] = dados.competencia.split('-');
  const perApur = `${ano}-${mes}`;

  switch (dados.tipo) {
    case 'S-1200':
      return gerarS1200(id, dados, perApur);
    case 'S-1210':
      return gerarS1210(id, dados, perApur);
    case 'S-1299':
      return gerarS1299(id, dados, perApur);
    case 'S-2200':
      return gerarS2200(id, dados);
    case 'S-2299':
      return gerarS2299(id, dados);
    case 'S-2300':
      return gerarS2300(id, dados);
    default:
      throw new Error(`Tipo de evento não suportado: ${dados.tipo}`);
  }
}

function getIndRetif(dados: DadosEvento): string {
  return dados.dados?.indRetif || '1';
}

function addNrRecibo(node: any, dados: DadosEvento): any {
  if (dados.dados?.indRetif === '2' && dados.dados?.nrRecibo) {
    return node.ele('nrRecibo').txt(dados.dados.nrRecibo).up();
  }
  return node;
}

function gerarS1200(id: string, dados: DadosEvento, perApur: string): string {
  let ideEvento = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('eSocial', { xmlns: `${NAMESPACE}/evtRemun/v_S_01_02_00` })
      .ele('evtRemun', { Id: id })
        .ele('ideEvento')
          .ele('indRetif').txt(getIndRetif(dados)).up();
  ideEvento = addNrRecibo(ideEvento, dados);
  const doc = ideEvento
          .ele('perApur').txt(perApur).up()
          .ele('tpAmb').txt(getTpAmb()).up()
          .ele('procEmi').txt('1').up()
          .ele('verProc').txt('ConsultorDP_1.0').up()
        .up()
        .ele('ideEmpregador')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(dados.empresaCnpj.slice(0, 8)).up()
        .up()
        .ele('ideTrabalhador')
          .ele('cpfTrab').txt(dados.funcionarioCpf || '').up()
        .up()
        .ele('dmDev')
          .ele('ideDmDev').txt('1').up()
        .up()
      .up()
    .up();
  return doc.end({ prettyPrint: true });
}

function gerarS1210(id: string, dados: DadosEvento, perApur: string): string {
  let ideEvt = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('eSocial', { xmlns: `${NAMESPACE}/evtPgtos/v_S_01_02_00` })
      .ele('evtPgtos', { Id: id })
        .ele('ideEvento')
          .ele('indRetif').txt(getIndRetif(dados)).up();
  ideEvt = addNrRecibo(ideEvt, dados);
  const doc = ideEvt
          .ele('perApur').txt(perApur).up()
          .ele('tpAmb').txt(getTpAmb()).up()
          .ele('procEmi').txt('1').up()
          .ele('verProc').txt('ConsultorDP_1.0').up()
        .up()
        .ele('ideEmpregador')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(dados.empresaCnpj.slice(0, 8)).up()
        .up()
        .ele('ideBenef')
          .ele('cpfBenef').txt(dados.funcionarioCpf || '').up()
        .up()
      .up()
    .up();
  return doc.end({ prettyPrint: true });
}

function gerarS1299(id: string, dados: DadosEvento, perApur: string): string {
  let ideEvt1299 = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('eSocial', { xmlns: `${NAMESPACE}/evtFechaEvPer/v_S_01_02_00` })
      .ele('evtFechaEvPer', { Id: id })
        .ele('ideEvento')
          .ele('indRetif').txt(getIndRetif(dados)).up();
  ideEvt1299 = addNrRecibo(ideEvt1299, dados);
  const doc = ideEvt1299
          .ele('perApur').txt(perApur).up()
          .ele('tpAmb').txt(getTpAmb()).up()
          .ele('procEmi').txt('1').up()
          .ele('verProc').txt('ConsultorDP_1.0').up()
        .up()
        .ele('ideEmpregador')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(dados.empresaCnpj.slice(0, 8)).up()
        .up()
        .ele('ideRespInf')
          .ele('nmResp').txt('Sistema ConsultorDP').up()
          .ele('cpfResp').txt(dados.funcionarioCpf || dados.empresaCnpj).up()
          .ele('telefone').txt('').up()
          .ele('email').txt('').up()
        .up()
      .up()
    .up();
  return doc.end({ prettyPrint: true });
}

function gerarS2200(id: string, dados: DadosEvento): string {
  let ideEvt2200 = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('eSocial', { xmlns: `${NAMESPACE}/evtAdmissao/v_S_01_02_00` })
      .ele('evtAdmissao', { Id: id })
        .ele('ideEvento')
          .ele('indRetif').txt(getIndRetif(dados)).up();
  ideEvt2200 = addNrRecibo(ideEvt2200, dados);
  const doc = ideEvt2200
          .ele('tpAmb').txt(getTpAmb()).up()
          .ele('procEmi').txt('1').up()
          .ele('verProc').txt('ConsultorDP_1.0').up()
        .up()
        .ele('ideEmpregador')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(dados.empresaCnpj.slice(0, 8)).up()
        .up()
        .ele('trabalhador')
          .ele('cpfTrab').txt(dados.funcionarioCpf || '').up()
          .ele('nmTrab').txt(dados.funcionarioNome || '').up()
        .up()
      .up()
    .up();
  return doc.end({ prettyPrint: true });
}

function gerarS2299(id: string, dados: DadosEvento): string {
  let ideEvt2299 = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('eSocial', { xmlns: `${NAMESPACE}/evtDeslig/v_S_01_02_00` })
      .ele('evtDeslig', { Id: id })
        .ele('ideEvento')
          .ele('indRetif').txt(getIndRetif(dados)).up();
  ideEvt2299 = addNrRecibo(ideEvt2299, dados);
  const doc = ideEvt2299
          .ele('tpAmb').txt(getTpAmb()).up()
          .ele('procEmi').txt('1').up()
          .ele('verProc').txt('ConsultorDP_1.0').up()
        .up()
        .ele('ideEmpregador')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(dados.empresaCnpj.slice(0, 8)).up()
        .up()
        .ele('ideVinculo')
          .ele('cpfTrab').txt(dados.funcionarioCpf || '').up()
        .up()
      .up()
    .up();
  return doc.end({ prettyPrint: true });
}

function gerarS2300(id: string, dados: DadosEvento): string {
  let ideEvt2300 = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('eSocial', { xmlns: `${NAMESPACE}/evtTSVInicio/v_S_01_02_00` })
      .ele('evtTSVInicio', { Id: id })
        .ele('ideEvento')
          .ele('indRetif').txt(getIndRetif(dados)).up();
  ideEvt2300 = addNrRecibo(ideEvt2300, dados);
  const doc = ideEvt2300
          .ele('tpAmb').txt(getTpAmb()).up()
          .ele('procEmi').txt('1').up()
          .ele('verProc').txt('ConsultorDP_1.0').up()
        .up()
        .ele('ideEmpregador')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(dados.empresaCnpj.slice(0, 8)).up()
        .up()
        .ele('trabalhador')
          .ele('cpfTrab').txt(dados.funcionarioCpf || '').up()
          .ele('nmTrab').txt(dados.funcionarioNome || '').up()
        .up()
      .up()
    .up();
  return doc.end({ prettyPrint: true });
}

export function gerarLoteEventos(
  cnpj: string,
  eventos: string[],
  grupo: number = 1,
): string {
  const loteId = `LOTE_${cnpj}_${Date.now()}`;

  let loteXml = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('eSocial', { xmlns: 'http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1' })
      .ele('envioLoteEventos', { grupo: String(grupo) })
        .ele('ideEmpregador')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(cnpj.slice(0, 8)).up()
        .up()
        .ele('ideTransmissor')
          .ele('tpInsc').txt('1').up()
          .ele('nrInsc').txt(cnpj.slice(0, 8)).up()
        .up()
        .ele('eventos');

  eventos.forEach((evtXml, idx) => {
    loteXml = loteXml
      .ele('evento', { Id: `EVT_${idx + 1}` })
        .dat(evtXml)
      .up();
  });

  return loteXml.up().up().up().end({ prettyPrint: true });
}
