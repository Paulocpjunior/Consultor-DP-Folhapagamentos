// @vitest-environment jsdom
// Restauração de uma empresa pelo Backup SQL do IOB (dados fictícios).
import { describe, expect, it } from 'vitest';
import { fonteDeBytes } from '../backupPostgres';
import { abrirRestauracao } from '../restauracao';
import { empresasDoBackup, parametrosPadrao, planejarRestauracao } from '../restaurarEmpresa';
import type { Empresa } from '../../empresas/empresasTypes';

const CPF = '52998224725';
const ID = 'ID1112223330000002022050200000000001';
const empresa = { id: 'emp1', cnpj: '11222333000181', razaoSocial: 'SP LTDA', nomeFantasia: 'SP', codigoSage: '1200', criadoPor: 'g' } as Empresa;
const admissao = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_00_00"><evtAdmissao Id="${ID}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><trabalhador><cpfTrab>${CPF}</cpfTrab><nmTrab>ALEXANDRE TESTE</nmTrab><sexo>M</sexo><nascimento><dtNascto>1990-01-01</dtNascto></nascimento></trabalhador><vinculo><matricula>000052</matricula><tpRegTrab>1</tpRegTrab><tpRegPrev>1</tpRegPrev><infoRegimeTrab><infoCeletista><dtAdm>2022-05-02</dtAdm></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>ASSISTENTE</nmCargo><CBOCargo>411010</CBOCargo><codCateg>101</codCateg><remuneracao><vrSalFx>3000.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><duracao><tpContr>1</tpContr></duracao></infoContrato></vinculo></evtAdmissao></eSocial>`;
const hex = (s: string) => '\\\\x' + Buffer.from(s, 'utf8').toString('hex');
const copy = (t: string, cols: string, linhas: string[][]) => [`COPY ${t} (${cols}) FROM stdin;`, ...linhas.map(l => l.join('\t')), '\\.', ''];

function backup(): Uint8Array {
    return new TextEncoder().encode(['--',
        ...copy('f1200.arquivoeventotransmissaoesocial', 'id_protoco, nome_arq, dados_arq', [['1', 'S2200.xml', hex(admissao)]]),
        ...copy('f1200.eventotransmissaoesocial', 'id_protoco, id_evento, rec_esocia', [['1', ID, '1.1.1']]),
        ...copy('f1200.func', 'codfun, nome, cpf, dtadm, pis, cep', [['000052', 'ALEXANDRE TESTE', CPF, '2022-05-02', '12345678900', '1310100']]),
        ...copy('f1200.hist_ferias', 'codfun, daquisiini, daquisifim, dgozoini, dgozofim, ntotabono', [['52', '2022-05-02', '2023-05-01', '2023-07-03', '2023-07-22', '10']]),
        ...copy('f1200.holerith', 'codfun, anomes, codeven, ref, descricao', [['52', '202501', '50', '10,5', 'HORAS EXTRAS 50%'], ['52', '202502', '120', '2', 'FALTAS']]),
        ...copy('f1200.eventos_esocial', 'codeven, rubesocial', [['50', '50'], ['120', '120']]),
        ...copy('f1200.esocialdadosficha_s1010', 'codrubr, natrubr, inivalid, fimvalid', [['50', '1003', '2018-01', ''], ['120', '9207', '2018-01', '']]),
        ...copy('f1200.esocialdadosficha_s1000', 'pk_padrao, nrinsc, classtrib', [['1', '11222333', '99']]),
        ...copy('f0300.func', 'codfun, nome, cpf', [['1', 'OUTRA', '11144477735']]),
    ].join('\n'));
}

describe('restaurar a empresa pelo backup', () => {
    it('lista as empresas do backup com a do Consultor de mesmo código', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        expect(empresasDoBackup(rest, [empresa]).map(x => [x.codigo, x.empresa?.id ?? null])).toEqual([['300', null], ['1200', 'emp1']]);
    });

    it('código SAGE repetido no Consultor: uma opção por empresa, marcada (não fica só com a última)', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        const antiga = { ...empresa, id: 'emp0', cnpj: '04896300000100', nomeFantasia: 'SP ASSESSORIA CONTABIL' } as Empresa;
        const r = empresasDoBackup(rest, [empresa, antiga]).filter(x => x.codigo === '1200');
        expect(r.map(x => [x.empresa?.id, x.repetido])).toEqual([['emp0', true], ['emp1', true]]);
    });

    it('encadeia eSocial → func → férias → histórico, sobre as fichas da etapa anterior', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        const p = await planejarRestauracao(rest, empresa, { fichas: [], afastamentos: [], enquadramentos: [], movimentos: {} }, { ...parametrosPadrao(), historicoDesde: '2024-01' });
        // Uma ficha, criada pelo eSocial e completada pela func (código IOB, PIS, CEP com o zero).
        expect(p.fichas).toHaveLength(1);
        expect(p.fichas[0]).toMatchObject({ novo: true, ficha: { cpf: CPF, matriculaEsocial: '000052', dados: { nome: 'ALEXANDRE TESTE', codigoIob: '000052', categoria: '101', salario: '3000.00', pis: '12345678900', cep: '01310100' } } });
        // Férias do histórico ligadas pelo código IOB que a func trouxe.
        expect(p.afastamentos.map(a => [a.afastamento.motivo, a.afastamento.dtInicio, a.afastamento.perAquisInicio, a.afastamento.abonoDias])).toEqual([['15', '2023-07-03', '2022-05-02', '10']]);
        // Histórico da folha pela natureza da rubrica.
        expect(p.movimentos.map(m => [m.competencia, m.depois])).toEqual([['2025-01', { horasExtras50: 10.5 }], ['2025-02', { faltasDias: 2 }]]);
        expect(p.etapas.map(e => e.titulo)).toEqual(['Vínculos pelo eSocial', 'Funcionários (func)', 'Enquadramento', 'Afastamentos e férias', 'Histórico da folha']);
        expect(p.origem).toEqual(['f1200.arquivoeventotransmissaoesocial', 'f1200.func', 'f1200.hist_ferias', 'f1200.holerith']);
    });

    it('não repete o que já está gravado', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        const primeira = await planejarRestauracao(rest, empresa, { fichas: [], afastamentos: [], enquadramentos: [], movimentos: {} }, { ...parametrosPadrao(), historicoDesde: '2024-01' });
        const gravado = {
            fichas: primeira.fichas.map(r => r.ficha), afastamentos: primeira.afastamentos.map(a => a.afastamento), enquadramentos: [],
            movimentos: { [primeira.fichas[0].ficha.id]: Object.fromEntries(primeira.movimentos.map(m => [m.competencia, m.depois])) },
        };
        const segunda = await planejarRestauracao(rest, empresa, gravado, { ...parametrosPadrao(), historicoDesde: '2024-01' });
        expect([segunda.fichas.length, segunda.afastamentos.length, segunda.movimentos.length]).toEqual([0, 0, 0]);
    });

    it('regime informado na tela vale sobre o S-1000 do backup; o erro aparece no resumo', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        const vazio = { fichas: [], afastamentos: [], enquadramentos: [], movimentos: {} };
        const pelo = await planejarRestauracao(rest, empresa, vazio, { ...parametrosPadrao(), historicoDesde: '2024-01' });
        expect(pelo.enquadramentos).toHaveLength(0);
        expect(pelo.etapas[2].resumo).toMatch(/1 com erro \(Normal \(lucro presumido ou real\): .*FPAS: 3 dígitos\./);
        const simples = await planejarRestauracao(rest, empresa, vazio, { ...parametrosPadrao(), historicoDesde: '2024-01', fpas: '515', codigoTerceiros: '0115', terceiros: 5.8, regimes: { emp1: 'simples' } });
        expect(simples.enquadramentos.map(({ enquadramento: e }) => [e.regime, e.fpas, e.terceiros])).toEqual([['simples', '', 0]]);
        expect(simples.etapas[2].resumo).toMatch(/1 para gravar.*0 com erro$/);
    });

    it('empresa que mudou de CNPJ: as fichas gravadas passam para o CNPJ atual', async () => {
        const rest = await abrirRestauracao([{ nome: 'folha.backup', fonte: fonteDeBytes(backup()) }]);
        const vazio = { fichas: [], afastamentos: [], enquadramentos: [], movimentos: {} };
        const primeira = await planejarRestauracao(rest, empresa, vazio, { ...parametrosPadrao(), historicoDesde: '2024-01' });
        const antiga = { ...primeira.fichas[0].ficha, cnpj: '04896300000100' };
        const p = await planejarRestauracao(rest, empresa, { ...vazio, fichas: [antiga], afastamentos: primeira.afastamentos.map(a => a.afastamento) }, { ...parametrosPadrao(), historicoDesde: '2024-01' });
        expect(p.fichas).toHaveLength(1);
        expect(p.fichas[0].ficha.cnpj).toBe('11222333000181');
        expect(p.fichas[0].alteracoes).toContainEqual({ campo: 'cnpj', de: '04896300000100', para: '11222333000181' });
        expect(p.etapas[0].avisos[0]).toMatch(/1 ficha\(s\) com outro CNPJ \(04896300000100\): passam para o CNPJ atual da empresa \(11222333000181\)/);
    });
});
