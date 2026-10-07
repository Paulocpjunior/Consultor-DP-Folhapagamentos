// @vitest-environment jsdom
// Férias e afastamentos pelo Backup SQL do IOB (dados fictícios).
import { describe, expect, it } from 'vitest';
import { fonteDeBytes } from '../../iobSage/backupPostgres';
import { abrirRestauracao } from '../../iobSage/restauracao';
import { periodosAquisitivos } from '../../calculo/motorFerias';
import { afastamentoVazio, consolidarAfastamentos, idAfastamento, lerXmlAfastamentos, mesclarAfastamentos } from '../afastamentos';
import { chaveIdEvento, esocialDoBackup } from '../esocialDoBackup';
import { gozosDoHistorico, juntarComHistorico } from '../feriasDoBackup';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../funcionarios';

const empresa = { id: 'emp1', cnpj: '11222333000181' };
const CPF = '52998224725';
const ficha = (codigoIob: string, matricula = '000052'): FichaFuncionario => ({
    ...fichaVazia(empresa), id: idFuncionario(empresa.id, CPF, matricula), cpf: CPF, matriculaEsocial: matricula, situacao: 'ativo',
    dados: { nome: 'ALEXANDRE', codigoIob, admissao: '2022-05-02' },
});
const HIST = ['nchave', 'codfun', 'canomes', 'ctipfer', 'cstatus', 'daquisiini', 'daquisifim', 'dconceini', 'dconcefim', 'dgozoini', 'dgozofim', 'dabonoini', 'dabonofim', 'drecibo', 'ntotferias', 'ntotgozo', 'ntotabono'];
const linha = (o: Partial<Record<string, string>>) => HIST.map(c => o[c] ?? null);

describe('férias anteriores pelo hist_ferias', () => {
    it('cada gozo vira afastamento de motivo 15 com o período aquisitivo e o abono', () => {
        const t = { colunas: HIST, linhas: [
            linha({ codfun: '000052', cstatus: 'Q', daquisiini: '2022-05-02', daquisifim: '2023-05-01', dgozoini: '2023-07-03', dgozofim: '2023-07-22', ntotabono: '10' }),
            linha({ codfun: '52', daquisiini: '2023-05-02', daquisifim: '2024-05-01', dgozoini: '02/09/2024', dgozofim: '01/10/2024', dabonoini: '', dabonofim: '' }),
            linha({ codfun: '52', daquisiini: '2024-05-02', daquisifim: '2025-05-01' }), // período sem gozo
            linha({ codfun: '999', dgozoini: '2024-01-02', dgozofim: '2024-01-31' }), // sem ficha
            linha({ codfun: '52', dgozoini: '2023-07-03', dgozofim: '2023-07-22' }), // repetido
        ] };
        const r = gozosDoHistorico(t, empresa, [ficha('000052')]);
        expect(r.afastamentos.map(a => [a.motivo, a.dtInicio, a.dtFim, a.perAquisInicio, a.perAquisFim, a.abonoDias])).toEqual([
            ['15', '2023-07-03', '2023-07-22', '2022-05-02', '2023-05-01', '10'],
            ['15', '2024-09-02', '2024-10-01', '2023-05-02', '2024-05-01', ''],
        ]);
        expect(r.afastamentos[0].id).toBe(idAfastamento(ficha('1').id, '2023-07-03'));
        expect(r.afastamentos[0].observacao).toContain('situação Q');
        expect([r.semFicha, r.semGozo]).toEqual([1, 1]);
        expect(r.avisos.join(' ')).toMatch(/repetido/);
    });

    it('com os gozos anteriores, o motor acha sozinho o período com saldo', () => {
        const t = { colunas: HIST, linhas: [
            linha({ codfun: '52', daquisiini: '2022-05-02', daquisifim: '2023-05-01', dgozoini: '2023-07-03', dgozofim: '2023-07-22', ntotabono: '10' }),
            linha({ codfun: '52', daquisiini: '2023-05-02', daquisifim: '2024-05-01', dgozoini: '2024-09-02', dgozofim: '2024-10-01' }),
        ] };
        const gozos = gozosDoHistorico(t, empresa, [ficha('52')]).afastamentos;
        const ps = periodosAquisitivos('2022-05-02', '2026-11-03', ficha('52').id, gozos, {}, gozos);
        const comSaldo = ps.find(p => !p.perdido && p.fim < '2026-11-03' && p.consumido < p.direito);
        expect(comSaldo?.inicio).toBe('2024-05-02');
        expect(ps.slice(0, 2).map(p => p.consumido)).toEqual([30, 30]);
    });

    it('junta com o S-2230: fica o do eSocial, completado com o aquisitivo e o abono do histórico', () => {
        const base = { ...afastamentoVazio(), empresaId: empresa.id, fichaId: 'f1', motivo: '15', dtFim: '2023-07-22' };
        const doEsocial = [{ ...base, id: 'f1_2023-07-03', dtInicio: '2023-07-03', origem: 'eSocial: S-2230' }];
        const doHist = [{ ...base, id: 'f1_2023-07-03', dtInicio: '2023-07-03', perAquisInicio: '2022-05-02', perAquisFim: '2023-05-01', abonoDias: '10', origem: 'Backup IOB: hist_ferias' },
            { ...base, id: 'f1_2024-09-02', dtInicio: '2024-09-02', origem: 'Backup IOB: hist_ferias' }];
        const j = juntarComHistorico(doEsocial, doHist);
        expect(j.map(a => [a.id, a.origem, a.perAquisInicio, a.abonoDias])).toEqual([
            ['f1_2023-07-03', 'eSocial: S-2230', '2022-05-02', '10'], ['f1_2024-09-02', 'Backup IOB: hist_ferias', '', ''],
        ]);
        // O abono que chega do histórico conta como mudança (senão não seria gravado).
        expect(mesclarAfastamentos([j[0]], [doEsocial[0]])[0].mudou).toBe(true);
        expect(mesclarAfastamentos([doEsocial[0]], [j[0]])[0]).toMatchObject({ mudou: false, afastamento: { abonoDias: '10' } });
    });
});

const ID_AF = 'ID1112223330000002025031000000000001';
const afast = (ns = 'v_S_01_02_00', id = ID_AF) => `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAfastTemp/${ns}"><evtAfastTemp Id="${id}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>${CPF}</cpfTrab><matricula>000052</matricula></ideVinculo><infoAfastamento><iniAfastamento><dtIniAfast>2025-03-10</dtIniAfast><codMotAfast>03</codMotAfast></iniAfastamento><fimAfastamento><dtTermAfast>2025-06-30</dtTermAfast></fimAfastamento></infoAfastamento></evtAfastTemp></eSocial>`;

describe('S-2230 transmitido pelo IOB (no backup, sem o retorno no XML)', () => {
    it('vale o recibo do IOB; sem recibo fica de fora; sem a tabela de recibos entra; leiaute 2.x aceito', () => {
        const recibos = new Map([[chaveIdEvento(ID_AF), '1.1.9']]);
        expect(lerXmlAfastamentos('a.xml', afast(), '11222333', { recibos }).eventos[0]).toMatchObject({ recibo: '1.1.9', inicio: { motivo: '03', dt: '2025-03-10' }, fim: '2025-06-30' });
        expect(lerXmlAfastamentos('a.xml', afast(), '11222333', { recibos: new Map() }).eventos).toEqual([]);
        expect(lerXmlAfastamentos('a.xml', afast(), '11222333', { recibos: null }).eventos).toHaveLength(1);
        expect(lerXmlAfastamentos('a.xml', afast(), '11222333').avisos[0]).toMatch(/sem recibo de processamento/);
        expect(lerXmlAfastamentos('a.xml', afast('v02_05_00'), '11222333', { recibos, leiautesAntigos: true }).eventos).toHaveLength(1);
        expect(lerXmlAfastamentos('a.xml', afast('v02_05_00'), '11222333', { recibos }).avisos[0]).toMatch(/v02_05_00/);
        const c = consolidarAfastamentos(lerXmlAfastamentos('a.xml', afast(), '11222333', { recibos }).eventos, empresa, [ficha('52')]);
        expect(c.afastamentos.map(a => [a.motivo, a.dtInicio, a.dtFim])).toEqual([['03', '2025-03-10', '2025-06-30']]);
    });

    it('o backup separa os S-2230 (e as exclusões deles) dos eventos de vínculo', async () => {
        const hex = (s: string) => '\\\\x' + Buffer.from(s, 'utf8').toString('hex');
        const exclusao = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtExclusao/v_S_01_02_00"><evtExclusao Id="ID2"><ideEvento><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><infoExclusao><tpEvento>S-2230</tpEvento><nrRecEvt>1.1.8</nrRecEvt><ideTrabalhador><cpfTrab>${CPF}</cpfTrab></ideTrabalhador></infoExclusao></evtExclusao></eSocial>`;
        const sql = ['--', 'COPY f1200.arquivoeventotransmissaoesocial (id_protoco, nome_arq, dados_arq) FROM stdin;',
            ['1', 'S2230.xml', hex(afast())].join('\t'), ['2', 'S3000.xml', hex(exclusao)].join('\t'), '\\.',
            'COPY f1200.eventotransmissaoesocial (id_protoco, id_evento, rec_esocia) FROM stdin;', ['1', ID_AF, '1.1.9'].join('\t'), '\\.', ''].join('\n');
        const rest = await abrirRestauracao([{ nome: 'f.backup', fonte: fonteDeBytes(new TextEncoder().encode(sql)) }]);
        const b = await esocialDoBackup(rest, '1200');
        expect(b.fontes).toEqual([]);
        expect(b.fontesAfastamento.map(f => f.nome)).toEqual(['f1200.arquivoeventotransmissaoesocial/S2230.xml', 'f1200.arquivoeventotransmissaoesocial/S3000.xml']);
        expect(b.recibos?.get(chaveIdEvento(ID_AF))).toBe('1.1.9');
    });
});

describe('revisão do Codex no PR #79', () => {
    it('readmissão: cada gozo vai para o vínculo em vigor na data; sem vínculo na data, fica de fora', () => {
        const antigo: FichaFuncionario = { ...ficha('52', '000010'), situacao: 'desligado', dados: { codigoIob: '52', admissao: '2018-03-01', dataDesligamento: '2021-12-31' } };
        const novo = ficha('52', '000052');
        const t = { colunas: HIST, linhas: [
            linha({ codfun: '52', daquisiini: '2019-03-01', dgozoini: '2020-07-01', dgozofim: '2020-07-30' }),
            linha({ codfun: '52', daquisiini: '2022-05-02', dgozoini: '2023-07-03', dgozofim: '2023-07-22' }),
            linha({ codfun: '52', dgozoini: '2022-02-01', dgozofim: '2022-02-10' }),
        ] };
        const r = gozosDoHistorico(t, empresa, [antigo, novo]);
        expect(r.afastamentos.map(a => [a.fichaId, a.dtInicio])).toEqual([[antigo.id, '2020-07-01'], [novo.id, '2023-07-03']]);
        expect(r.avisos.join(' ')).toMatch(/2022-02-01 fora do período de todos os vínculos/);
        // Sem o fim do aquisitivo no histórico: 12 meses desde o início.
        expect(r.afastamentos[0]).toMatchObject({ perAquisInicio: '2019-03-01', perAquisFim: '2020-02-29' });
    });

    it('período aquisitivo é um par: início igual sem fim mantém o fim gravado', () => {
        const atual = { ...afastamentoVazio(), id: 'f1_2023-07-03', fichaId: 'f1', motivo: '15', dtInicio: '2023-07-03', dtFim: '2023-07-22', perAquisInicio: '2022-05-02', perAquisFim: '2023-05-01', origem: 'Backup IOB: hist_ferias' };
        expect(mesclarAfastamentos([{ ...atual, perAquisFim: '' }], [atual])[0]).toMatchObject({ mudou: false, afastamento: { perAquisFim: '2023-05-01' } });
        expect(mesclarAfastamentos([{ ...atual, perAquisInicio: '2023-05-02', perAquisFim: '' }], [atual])[0].afastamento).toMatchObject({ perAquisInicio: '2023-05-02', perAquisFim: '' });
    });

    it('backup sem tabela de recibos, com S-2230 retificador: os eventos entram como não comprovados', async () => {
        const hex = (s: string) => '\\\\x' + Buffer.from(s, 'utf8').toString('hex');
        const retificador = afast().replace('<indRetif>1</indRetif>', '<indRetif>2</indRetif><nrRecibo>1.1.7</nrRecibo>');
        const sql = ['--', 'COPY f1200.arquivoeventotransmissaoesocial (id_protoco, nome_arq, dados_arq) FROM stdin;',
            ['1', 'S2230.xml', hex(retificador)].join('\t'), '\\.', ''].join('\n');
        const rest = await abrirRestauracao([{ nome: 'f.backup', fonte: fonteDeBytes(new TextEncoder().encode(sql)) }]);
        const b = await esocialDoBackup(rest, '1200');
        expect(b.recibos).toBeNull();
        expect(lerXmlAfastamentos(b.fontesAfastamento[0].nome, b.fontesAfastamento[0].xml, '11222333', { recibos: b.recibos }).eventos).toHaveLength(1);
    });
});
