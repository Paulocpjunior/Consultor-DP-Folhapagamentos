// @vitest-environment jsdom
// Conferência motor × S-1200 do IOB (dados fictícios).
import { describe, expect, it } from 'vitest';
import { conferirMotorComIob, lerEsocialIob, lerS1200Xml, rubricasParaConferencia, ultimaRemuneracao, type RemuneracaoIob } from '../conferenciaMotorIob';
import { gerarZip } from '../../implantacao/zip';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

const CNPJ = '44388152000189';
const s1200 = (perApur: string, cpf: string, itens: [string, string][], extra = '') => `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00"><evtRemun Id="ID1${cpf}${perApur.replace('-', '')}${extra.length}">
<ideEvento><indRetif>${extra ? 2 : 1}</indRetif><indApuracao>1</indApuracao><perApur>${perApur}</perApur><tpAmb>1</tpAmb></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>
<dmDev><ideDmDev>1</ideDmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${CNPJ}</nrInsc><codLotacao>01</codLotacao>
<remunPerApur><matricula>M${cpf.slice(0, 3)}</matricula>${itens.map(([c, v]) => `<itensRemun><codRubr>${c}</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>${v}</vrRubr></itensRemun>`).join('')}</remunPerApur>
</ideEstabLot></infoPerApur></dmDev></evtRemun></eSocial>`;
const s1010 = (cod: string, dsc: string, nat: string, tp: string) => `<retornoEventoCompleto><evento><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00"><evtTabRubrica Id="IDR${cod}">
<ideEvento><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador>
<infoRubrica><inclusao><ideRubrica><codRubr>${cod}</codRubr><ideTabRubr>T1</ideTabRubr><iniValid>2020-01</iniValid></ideRubrica>
<dadosRubrica><dscRubr>${dsc}</dscRubr><natRubr>${nat}</natRubr><tpRubr>${tp}</tpRubr><codIncCP>11</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>11</codIncFGTS></dadosRubrica></inclusao></infoRubrica></evtTabRubrica></eSocial></evento>
<recibo><eSocial><retornoEvento><recibo><nrRecibo>1.1</nrRecibo></recibo><processamento><cdResposta>201</cdResposta><dhProcessamento>2020-01-10T10:00:00</dhProcessamento></processamento></retornoEvento></eSocial></recibo></retornoEventoCompleto>`;

const rub = (codRubr: string, dscRubr: string, natRubr: string, tpRubr: string): Rubrica => ({ id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr, natRubr, tpRubr, codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] });
const RUBRICAS = [rub('0001', 'SALARIO', '1000', '1'), rub('0050', 'HORAS EXTRAS 50%', '1003', '1'), rub('0901', 'INSS', '9201', '2'), rub('0902', 'IRRF', '9203', '2')];
const ficha = (id: string, cpf: string, nome: string) => ({ ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id, cpf, matriculaEsocial: `M${cpf.slice(0, 3)}`, situacao: 'ativo' as const, dados: { nome } });
const FICHAS = [ficha('f1', '52998224725', 'ANA'), ficha('f2', '11144477735', 'BRUNO')];
const motor = (fichaId: string, sal: number, he: number, inss: number, irrf = 0, situacao = 'calculado'): ResultadoCalculo => {
    const verbas = [{ codigo: 'SAL', valor: sal, tipo: 'provento' }, { codigo: 'HE50', valor: he, tipo: 'provento' }, { codigo: 'INSS', valor: inss, tipo: 'desconto' }, { codigo: 'IRRF', valor: irrf, tipo: 'desconto' }].filter(x => x.valor);
    const prov = sal + he; const desc = inss + irrf;
    return { fichaId, nome: ({ f1: 'ANA', f2: 'BRUNO', f3: 'CAIO' } as Record<string, string>)[fichaId], competencia: '', pagamento: '', situacao, verbas, bases: { inss: prov, fgts: prov, irrf: prov }, totais: { proventos: prov, descontos: desc, liquido: prov - desc }, fgts: Math.round(prov * 0.08), memoria: [], avisos: [], erros: [] } as unknown as ResultadoCalculo;
};
const ler = (xml: string) => lerS1200Xml(xml, 'a.xml', '44388152').remuneracoes;

describe('leitura do S-1200 do IOB', () => {
    it('itens em centavos, matrícula e categoria; 13º e outro empregador ficam de fora', () => {
        const [r] = ler(s1200('2026-09', '52998224725', [['0001', '3000.00'], ['0901', '253.41']]));
        expect(r).toMatchObject({ perApur: '2026-09', cpf: '52998224725', matriculas: ['M529'], categorias: ['101'], periodoAnterior: false });
        expect(r.itens.map(i => [i.codRubr, i.valor])).toEqual([['0001', 300000], ['0901', 25341]]);
        expect(ler(s1200('2026-09', '1', []).replace('<indApuracao>1', '<indApuracao>2'))).toEqual([]);
        expect(lerS1200Xml(s1200('2026-09', '1', []), 'a.xml', '12345678').avisos[0]).toMatch(/outro empregador/);
    });
    it('retificador vale sobre o original', () => {
        const o = ler(s1200('2026-09', '52998224725', [['0001', '3000.00']]))[0];
        const ret = ler(s1200('2026-09', '52998224725', [['0001', '3100.00']], 'r'))[0];
        expect(ultimaRemuneracao([ret, o] as RemuneracaoIob[]).map(r => r.itens[0].valor)).toEqual([310000]);
        expect(ultimaRemuneracao([o, ret] as RemuneracaoIob[]).map(r => r.itens[0].valor)).toEqual([310000]);
    });
    it('zip do download com S-1200 e S-1010', async () => {
        const zip = gerarZip([{ nome: 's1200.xml', conteudo: s1200('2026-09', '52998224725', [['0001', '3000.00']]) }, { nome: 's1010.xml', conteudo: s1010('0001', 'SALARIO', '1000', '1') }, { nome: 'outro.xml', conteudo: '<eSocial/>' }]);
        const l = await lerEsocialIob([{ nome: 'download.zip', bytes: zip }], CNPJ);
        expect(l.remuneracoes).toHaveLength(1);
        expect(l.rubricasDoArquivo.map(r => [r.codRubr, r.dados?.natRubr])).toEqual([['0001', '1000']]);
        expect(l.avisos.join(' ')).toMatch(/1 arquivo\(s\) sem S-1200/);
        const { rubricas } = rubricasParaConferencia([rub('0901', 'INSS', '9201', '2')], l.rubricasDoArquivo, 'E1');
        expect(rubricas.map(r => r.codRubr).sort()).toEqual(['0001', '0901']);
    });
});

describe('conferência motor × IOB', () => {
    const rems = (c: string, anaHe = '150.00') => [
        ...ler(s1200(c, '52998224725', [['0001', '3000.00'], ['0050', anaHe], ['0901', '253.41']])),
        ...ler(s1200(c, '11144477735', [['0001', '2000.00'], ['0901', '160.00']])),
    ];
    const motorDe = (c: string) => [motor('f1', 300000, 15000, 25341), motor('f2', 200000, 0, c === '2026-08' ? 16001 : 16000)];

    it('por funcionário: proventos, descontos, líquido e as naturezas; diferença aponta o item', () => {
        const r = conferirMotorComIob({ leitura: { remuneracoes: [...rems('2026-07'), ...rems('2026-08')], s5001: [], s5003: [] }, rubricas: RUBRICAS, fichas: FICHAS, motor: motorDe });
        const [jul, ago] = r.competencias;
        expect([jul.zerada, jul.confere, jul.diverge]).toEqual([true, 2, 0]);
        const bruno = ago.linhas.find(l => l.nome === 'BRUNO')!;
        expect(bruno.situacao).toBe('diverge');
        expect(bruno.itens.filter(i => !i.ok).map(i => [i.item, i.diferenca])).toEqual([['Descontos', 1], ['Líquido', -1], ['INSS', 1]]);
        expect(bruno.rubricas.map(x => [x.codRubr, x.descricao, x.natRubr])).toEqual([['0001', 'SALARIO', '1000'], ['0901', 'INSS', '9201']]);
        expect(r.criterioAtingido).toBe(false);
    });

    it('3 competências seguidas sem diferença atingem o critério; mês com divergência quebra a sequência', () => {
        const meses = ['2026-04', '2026-05', '2026-06', '2026-07'];
        const ok = conferirMotorComIob({ leitura: { remuneracoes: meses.flatMap(c => rems(c)), s5001: [], s5003: [] }, rubricas: RUBRICAS, fichas: FICHAS, motor: motorDe });
        expect(ok.sequencia).toEqual({ inicio: '2026-04', fim: '2026-07', meses: 4 });
        expect(ok.criterioAtingido).toBe(true);
        const quebra = conferirMotorComIob({ leitura: { remuneracoes: [...rems('2026-05'), ...rems('2026-06', '149.99'), ...rems('2026-07'), ...rems('2026-08')], s5001: [], s5003: [] }, rubricas: RUBRICAS, fichas: FICHAS, motor: motorDe });
        expect(quebra.sequencia.meses).toBe(1);
        // Mês faltando no arquivo também quebra a sequência.
        const buraco = conferirMotorComIob({ leitura: { remuneracoes: [...rems('2026-04'), ...rems('2026-05'), ...rems('2026-07')], s5001: [], s5003: [] }, rubricas: RUBRICAS, fichas: FICHAS, motor: motorDe });
        expect(buraco.sequencia.meses).toBe(2);
    });

    it('pendências: sem ficha, sem S-1200, motor incompleto, rubrica sem S-1010 e férias no mês', () => {
        const remuneracoes = [
            ...ler(s1200('2026-07', '52998224725', [['0001', '3000.00'], ['0777', '10.00']])),
            ...ler(s1200('2026-07', '39053344705', [['0001', '1000.00']])),
        ];
        const r = conferirMotorComIob({ leitura: { remuneracoes, s5001: [], s5003: [] }, rubricas: RUBRICAS, fichas: [...FICHAS, ficha('f3', '22233344405', 'CAIO')],
            motor: () => [motor('f1', 300000, 0, 0), motor('f2', 200000, 0, 16000), motor('f3', 0, 0, 0, 0, 'incompleto')] });
        const s = Object.fromEntries(r.competencias[0].linhas.map(l => [l.nome, l.situacao]));
        expect(s).toEqual({ ANA: 'rubrica-sem-tipo', BRUNO: 'sem-s1200', CAIO: 'sem-s1200', '39053344705': 'sem-ficha' });
        expect(r.competencias[0].zerada).toBe(false);
        expect(r.avisos[0]).toMatch(/0777 \(tabela T1\)/);
        const f = conferirMotorComIob({ leitura: { remuneracoes: rems('2026-07'), s5001: [], s5003: [] }, rubricas: RUBRICAS, fichas: FICHAS, motor: motorDe, comFerias: () => new Set(['f1']) });
        const ana = f.competencias[0].linhas.find(l => l.nome === 'ANA')!;
        expect(ana.situacao).toBe('confere');
        expect(ana.observacoes.join(' ')).toMatch(/Férias no mês/);
    });

    it('S-5001 e S-5003, quando vierem: INSS descontado e FGTS do eSocial', () => {
        const s5001 = [{ tipo: 'S-5001', id: 'x', perApur: '2026-07', cpf: '52998224725', calculos: [{ tpCR: '108201', calculado: 25341, descontado: 25341 }], vinculos: [] }] as never;
        const s5003 = [{ tipo: 'S-5003', id: 'y', perApur: '2026-07', cpf: '52998224725', itens: [{ estab: '', matricula: '', codCateg: '101', tpValor: '11', indIncid: '1', remuneracao: 315000, deposito: 25200, periodoAnterior: false }] }] as never;
        const r = conferirMotorComIob({ leitura: { remuneracoes: rems('2026-07'), s5001, s5003 }, rubricas: RUBRICAS, fichas: FICHAS, motor: motorDe });
        const ana = r.competencias[0].linhas.find(l => l.nome === 'ANA')!;
        expect(ana.itens.filter(i => /S-500/.test(i.item)).map(i => [i.item, i.iob, i.ok])).toEqual([['INSS (S-5001)', 25341, true], ['Base FGTS (S-5003)', 315000, true], ['FGTS (S-5003)', 25200, true]]);
    });
});
