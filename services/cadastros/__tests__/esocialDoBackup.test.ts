// @vitest-environment jsdom
// XMLs do eSocial que o IOB transmitiu, lidos do Backup SQL (dados fictícios).
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fonteDeBytes } from '../../iobSage/backupPostgres';
import { abrirRestauracao } from '../../iobSage/restauracao';
import { gerarZip } from '../../implantacao/zip';
import { brutoDoValor, chaveIdEvento, esocialDoBackup, recibosDoRetorno, xmlsDoValor } from '../esocialDoBackup';
import { agruparAvisos, prepararImportacao } from '../importacaoEsocial';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../funcionarios';

const empresa = { id: 'emp1', cnpj: '11222333000181' };
const CPF = '52998224725';
const ID_ADM = 'ID1112223330000002026010500000000001';
const ID_ADM_RECUSADO = 'ID1112223330000002026010500000000009';
const ID_ALT = 'ID1112223330000002026030100000000002';

const admissao = (id: string, salario = '2000.00') => `<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"><evtAdmissao Id="${id}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><trabalhador><cpfTrab>${CPF}</cpfTrab><nmTrab>JOSÉ TESTE</nmTrab><sexo>M</sexo><nascimento><dtNascto>1990-01-01</dtNascto></nascimento></trabalhador><vinculo><matricula>59</matricula><tpRegTrab>1</tpRegTrab><tpRegPrev>1</tpRegPrev><infoRegimeTrab><infoCeletista><dtAdm>2026-01-05</dtAdm><cnpjSindCategProf>11222333000181</cnpjSindCategProf></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>AUXILIAR</nmCargo><CBOCargo>411005</CBOCargo><codCateg>101</codCateg><remuneracao><vrSalFx>${salario}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><duracao><tpContr>1</tpContr></duracao></infoContrato></vinculo></evtAdmissao></eSocial>`;
const alteracao = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAltContratual/v_S_01_03_00"><evtAltContratual Id="${ID_ALT}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>${CPF}</cpfTrab><matricula>59</matricula></ideVinculo><altContratual><dtAlteracao>2026-03-01</dtAlteracao><vinculo><tpRegPrev>1</tpRegPrev><infoRegimeTrab><infoCeletista><tpRegJor>1</tpRegJor><natAtividade>1</natAtividade><cnpjSindCategProf>11222333000181</cnpjSindCategProf></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>ASSISTENTE</nmCargo><CBOCargo>411010</CBOCargo><codCateg>101</codCateg><remuneracao><vrSalFx>2500.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><duracao><tpContr>1</tpContr></duracao></infoContrato></vinculo></altContratual></evtAltContratual></eSocial>`;
const remuneracao = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00"><evtRemun Id="ID9"><ideEvento><indRetif>1</indRetif></ideEvento></evtRemun></eSocial>`;
const hex = (s: string) => '\\\\x' + Buffer.from(s, 'utf8').toString('hex');

/** Backup SQL em texto (pg_dump -Fp) com o schema da empresa 1200 e o de outra empresa. */
function backup(): Uint8Array {
    const copy = (tabela: string, colunas: string, linhas: string[]) => [`COPY ${tabela} (${colunas}) FROM stdin;`, ...linhas, '\\.', ''];
    const sql = [
        '--', '-- PostgreSQL database dump', '--', '',
        ...copy('f1200.arquivoeventotransmissaoesocial', 'id_protoco, cd_empresa, cod_tipeve, nome_arq, tam_arq, dados_arq, pk_padrao', [
            ['101', '1200', '22', 'S2200_59.xml', '1', hex(admissao(ID_ADM)), '1'].join('\t'),
            ['102', '1200', '22', 'S2200_59_recusado.xml', '1', hex(admissao(ID_ADM_RECUSADO, '1.00')), '2'].join('\t'),
            ['103', '1200', '24', 'S2206_59.xml', '1', alteracao.replace(/\t/g, ' '), '3'].join('\t'),
            ['104', '1200', '12', 'S1200.xml', '1', hex(remuneracao), '4'].join('\t'),
            ['105', '1200', '22', 'vazio.xml', '0', '\\N', '5'].join('\t'),
        ]),
        ...copy('f1200.eventotransmissaoesocial', 'id_protoco, desc_ident, cod_tipeve, rec_esocia, sit_evento, mes, ano, id_evento, v_leiaute', [
            ['101', 'JOSE', '22', '1.1.0000000000000000001', '4', '1', '2026', ID_ADM, 'S_01_03_00'].join('\t'),
            ['102', 'JOSE', '22', '\\N', '5', '1', '2026', ID_ADM_RECUSADO, 'S_01_03_00'].join('\t'),
            ['103', 'JOSE', '24', '1.1.0000000000000000002', '4', '3', '2026', ID_ALT.slice(2), 'S_01_03_00'].join('\t'),
        ]),
        ...copy('f0300.arquivoeventotransmissaoesocial', 'id_protoco, cd_empresa, cod_tipeve, nome_arq, tam_arq, dados_arq, pk_padrao', [
            ['900', '300', '22', 'outra.xml', '1', hex(admissao('ID1999888770000002026010500000000001')), '1'].join('\t'),
        ]),
    ].join('\n');
    return new TextEncoder().encode(sql);
}

describe('conteúdo de dados_arq', () => {
    it('aceita XML em texto, bytea hexadecimal, base64, gzip e zip', async () => {
        const x = admissao(ID_ADM);
        expect(brutoDoValor(null)).toBeNull();
        expect(brutoDoValor('lixo sem xml')).toBeNull();
        expect(await xmlsDoValor(x)).toEqual([x]);
        expect(await xmlsDoValor('\\x' + Buffer.from(x).toString('hex'))).toEqual([x]);
        expect(await xmlsDoValor(Buffer.from(x).toString('base64'))).toEqual([x]);
        expect(await xmlsDoValor('\\x' + gzipSync(Buffer.from(x)).toString('hex'))).toEqual([x]);
        const zip = gerarZip([{ nome: 'a.xml', conteudo: x }, { nome: 'b.xml', conteudo: alteracao }]);
        expect(await xmlsDoValor('\\x' + Buffer.from(zip).toString('hex'))).toEqual([x, alteracao]);
    });

    it('XML declarado em ISO-8859-1 sai com os acentos certos', async () => {
        const x = '<?xml version="1.0" encoding="ISO-8859-1"?><a>JOSÉ</a>';
        expect(await xmlsDoValor('\\x' + Buffer.from(x, 'latin1').toString('hex'))).toEqual([x]);
    });

    it('recibos de um retorno de lote: só os aceitos', () => {
        const ret = (id: string, cd: string, n: string) => `<evento Id="${id}"><retornoEvento><eSocial><retornoEvento Id="${id}"><processamento><cdResposta>${cd}</cdResposta></processamento><recibo><nrRecibo>${n}</nrRecibo></recibo></retornoEvento></eSocial></retornoEvento></evento>`;
        const xml = `<eSocial><retornoProcessamentoLoteEventos><retornoEventos>${ret('IDA', '201', '1.1.1')}${ret('IDB', '401', '1.1.2')}</retornoEventos></retornoProcessamentoLoteEventos></eSocial>`;
        expect([...recibosDoRetorno(xml)]).toEqual([['IDA', '1.1.1']]);
        expect(chaveIdEvento(' idABC ')).toBe('ABC');
    });
});

describe('XMLs transmitidos pelo IOB, no Backup SQL', () => {
    it('lê só o schema da empresa, só os eventos de vínculo, e liga os recibos pelo Id', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        const b = await esocialDoBackup(rest, '1200');
        expect(b.grupos).toEqual(['f1200']);
        expect(b.fontes.map(f => f.nome)).toEqual([
            'f1200.arquivoeventotransmissaoesocial/S2200_59.xml',
            'f1200.arquivoeventotransmissaoesocial/S2200_59_recusado.xml',
            'f1200.arquivoeventotransmissaoesocial/S2206_59.xml',
        ]);
        expect(b.recibos?.get(chaveIdEvento(ID_ADM))).toBe('1.1.0000000000000000001');
        expect(b.recibos?.get(chaveIdEvento(ID_ALT))).toBe('1.1.0000000000000000002');
        expect(b.recibos?.has(chaveIdEvento(ID_ADM_RECUSADO))).toBe(false);
        expect(b.avisos).toEqual([]);

        // A ficha que veio da carga do backup (sem contrato) é completada pelo eSocial; o envio recusado fica de fora.
        const existente: FichaFuncionario = { ...fichaVazia(empresa), id: idFuncionario(empresa.id, CPF, '59'), cpf: CPF, matriculaEsocial: '59', situacao: 'ativo',
            dados: { nome: 'JOSE TESTE', codigoIob: '59', cbo: '01105' }, origens: { nome: 'Backup IOB', codigoIob: 'Backup IOB', cbo: 'Backup IOB' } };
        const p = prepararImportacao(b.fontes, empresa, '2026-10-06', [existente], { recibos: b.recibos });
        expect(p.resultados).toHaveLength(1);
        const r = p.resultados[0];
        expect(r.novo).toBe(false);
        expect(r.ficha.dados).toMatchObject({ codigoIob: '59', cargo: 'ASSISTENTE', cbo: '411010', salario: '2500.00', unidadeSalario: '5', categoria: '101', tipoContrato: '1', sindicato: '11222333000181', regimeTrabalhista: '1', regimePrevidenciario: '1', admissao: '2026-01-05' });
        expect(r.ficha.pendenciasImportacao.join(' ')).not.toMatch(/aceitação não comprovada/);
        expect(p.avisos).toContain('1 evento(s) sem recibo no IOB (envio recusado ou não concluído) ficaram de fora.');
    });

    it('sem o schema da empresa lê todos, com aviso; sem as tabelas, avisa', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        const b = await esocialDoBackup(rest, '0777');
        expect(b.grupos).toEqual(['f0300', 'f1200']);
        expect(b.avisos[0]).toMatch(/Nenhum schema f777/);
        const vazio = await esocialDoBackup({ tabelas: [], lerTabela: async () => 0 }, '1200');
        expect(vazio.avisos[0]).toMatch(/não tem as tabelas de transmissão/);
    });

    it('backup com a tabela de recibos e nenhum aceito: nada entra; sem informação de recibo: entra como não comprovado', async () => {
        const fonte = [{ nome: 'a.xml', xml: admissao(ID_ADM_RECUSADO), hash: 'h1' }];
        const vazio = prepararImportacao(fonte, empresa, '2026-10-06', [], { recibos: new Map() });
        expect(vazio.resultados).toEqual([]);
        expect(vazio.avisos).toContain('1 evento(s) sem recibo no IOB (envio recusado ou não concluído) ficaram de fora.');
        expect(prepararImportacao(fonte, empresa, '2026-10-06', [], { recibos: null }).resultados).toHaveLength(1);

        // Backup só com os XMLs (sem eventotransmissaoesocial): recibos = null, com aviso.
        const sql = ['--', 'COPY f1200.arquivoeventotransmissaoesocial (id_protoco, dados_arq) FROM stdin;', ['1', hex(admissao(ID_ADM))].join('\t'), '\\.', ''].join('\n');
        const rest = await abrirRestauracao([{ nome: 'f.backup', fonte: fonteDeBytes(new TextEncoder().encode(sql)) }]);
        const b = await esocialDoBackup(rest, '1200');
        expect(b.fontes).toHaveLength(1);
        expect(b.recibos).toBeNull();
        expect(b.avisos).toContain('O backup não traz os recibos do eSocial: os eventos entram como não comprovados.');
    });

    it('sem recibos (XML baixado do portal) nada muda na importação', () => {
        const p = prepararImportacao([{ nome: 'a.xml', xml: admissao(ID_ADM), hash: 'h1' }], empresa, '2026-10-06', []);
        expect(p.resultados).toHaveLength(1);
        expect(p.resultados[0].ficha.pendenciasImportacao.join(' ')).toMatch(/aceitação não comprovada/);
    });
});

describe('leiautes antigos guardados pelo IOB (só na importação pelo backup)', () => {
    const v25 = (xml: string) => xml.replace(/v_S_01_03_00/g, 'v02_05_00');
    const alt25 = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAltContratual/v02_05_00"><evtAltContratual Id="${ID_ALT}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>${CPF}</cpfTrab><matricula>59</matricula></ideVinculo><altContratual><dtAlteracao>2026-03-01</dtAlteracao><vinculo><tpRegPrev>1</tpRegPrev></vinculo><infoRegimeTrab><infoCeletista><cnpjSindCategProf>11222333000181</cnpjSindCategProf></infoCeletista></infoRegimeTrab><infoContrato><codCateg>101</codCateg><remuneracao><vrSalFx>2700.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><duracao><tpContr>1</tpContr></duracao><horContratual><qtdHrsSem>44</qtdHrsSem></horContratual></infoContrato></altContratual></evtAltContratual></eSocial>`;
    const recibos = new Map([[chaveIdEvento(ID_ADM), '1.1.1'], [chaveIdEvento(ID_ALT), '1.1.2']]);

    it('leiaute 2.5: aceito com aviso; o contrato do S-2206 2.x (ao lado do vinculo) é lido', () => {
        const fontes = [{ nome: 'adm.xml', xml: v25(admissao(ID_ADM)), hash: 'a' }, { nome: 'alt.xml', xml: alt25, hash: 'b' }];
        const p = prepararImportacao(fontes, empresa, '2026-10-06', [], { recibos, leiautesAntigos: true });
        expect(p.resultados).toHaveLength(1);
        expect(p.resultados[0].ficha.dados).toMatchObject({ categoria: '101', salario: '2700.00', horasSemanais: '44', sindicato: '11222333000181', tipoContrato: '1' });
        expect(p.resultados[0].ficha.pendenciasImportacao.join(' ')).toMatch(/Leiaute v02_05_00/);
        // Sem a opção (importação de XML baixado): recusa e diz o namespace que veio.
        const sem = prepararImportacao(fontes, empresa, '2026-10-06', [], { recibos });
        expect(sem.resultados).toEqual([]);
        expect(sem.avisos.join(' ')).toContain('veio "http://www.esocial.gov.br/schema/evt/evtAdmissao/v02_05_00"');
    });

    it('XML sem namespace (cópia do IOB, com recibo): aceito sem pendência na ficha', () => {
        const x = admissao(ID_ADM).replace(/ xmlns="[^"]+"/, '');
        const p = prepararImportacao([{ nome: 'a.xml', xml: x, hash: 'a' }], empresa, '2026-10-06', [], { recibos, leiautesAntigos: true });
        expect(p.resultados).toHaveLength(1);
        expect(p.resultados[0].ficha.pendenciasImportacao.join(' ')).not.toMatch(/sem namespace/);
    });

    it('avisos repetidos viram uma linha com a quantidade', () => {
        const msg = 'Versão/namespace eSocial não suportado.';
        expect(agruparAvisos([...Array.from({ length: 5 }, (_, i) => `f1200.arquivo/ID${i}.xml: ${msg}`), 'x.xml: outro', 'Backup do IOB: 3 XML(s)'])).toEqual([
            'Backup do IOB: 3 XML(s)', `5 arquivo(s): ${msg} Ex.: f1200.arquivo/ID0.xml`, 'x.xml: outro',
        ]);
    });
});
