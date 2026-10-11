// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { lerTotalizadoresXml, type S5002 } from '../../conferencia/totalizadores';
import { montarInformes, s5002sValidos } from '../informeRendimentos';
import { informePdf } from '../informePdf';

const evt = (id: string, perApur: string, rec: string, cons: string, compl = '') => `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtIrrfBenef/v_S_01_03_00"><evtIrrfBenef Id="${id}">
<ideEvento><nrRecArqBase>${rec}</nrRecArqBase><perApur>${perApur}</perApur></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador>
<ideTrabalhador><cpfBenef>52998224725</cpfBenef><totInfoIR>${cons}</totInfoIR>${compl}</ideTrabalhador></evtIrrfBenef></eSocial>`;
const cons = (cr: string, campos: Record<string, string>) => `<consolidApurMen><CRMen>${cr}</CRMen>${Object.entries(campos).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</consolidApurMen>`;
const ler = (xml: string) => lerTotalizadoresXml(xml, 'x.xml') as S5002[];
const PEN = (tp: string, v: string) => `<penAlim><tpRend>${tp}</tpRend><cpfDep>11144477735</cpfDep><vlrDedPenAlim>${v}</vlrDedPenAlim></penAlim>`;
const compl = (pens: string) => `<infoIRComplem><ideDep><cpfDep>11144477735</cpfDep><depIRRF>N</depIRRF><nome>FILHO</nome><tpDep>03</tpDep></ideDep><infoIRCR><tpCR>056107</tpCR>${pens}</infoIRCR>
<planSaude><cnpjOper>11222333000181</cnpjOper><regANS>123456</regANS><vlrSaudeTit>150.00</vlrSaudeTit><infoDepSau><cpfDep>11144477735</cpfDep><vlrSaudeDep>80.00</vlrSaudeDep></infoDepSau></planSaude></infoIRComplem>`;

const eventos = [
    ...ler(evt('ID1', '2026-01', '1.1.1', cons('056107', { vlrRendTrib: '5000.00', vlrPrevOficial: '550.00', vlrCRMen: '300.00' }), compl(PEN('11', '500.00')))),
    // Retificado: o de recibo maior vale.
    ...ler(evt('ID2', '2026-02', '1.1.2', cons('056107', { vlrRendTrib: '4000.00', vlrPrevOficial: '450.00', vlrCRMen: '200.00' }))),
    ...ler(evt('ID3', '2026-02', '1.1.9', cons('056107', { vlrRendTrib: '5000.00', vlrPrevOficial: '550.00', vlrCRMen: '300.00', vlrAbonoPec: '1000.00', vlrIndResContrato: '2000.00' }))),
    ...ler(evt('ID4', '2026-12', '1.1.4', cons('056107', { vlrRendTrib: '5000.00', vlrRendTrib13: '5000.00', vlrPrevOficial: '550.00', vlrPrevOficial13: '550.00', vlrCRMen: '300.00', vlrCR13Men: '250.00' }) + cons('356201', { vlrRendTrib: '3000.00', vlrCRMen: '0.00' }), compl(PEN('12', '400.00')))),
    // Outro ano e outra empresa ficam de fora.
    ...ler(evt('ID5', '2025-12', '1.1.5', cons('056107', { vlrRendTrib: '9.00' }))),
    ...ler(evt('ID6', '2026-03', '1.1.6', cons('056107', { vlrRendTrib: '9.00' })).replace('44388152', '99999999')),
];

describe('informe de rendimentos pelos S-5002', () => {
    it('lê isentos e complementos do S-5002', () => {
        const s = eventos.find(e => e.id === 'ID3')!;
        expect(s.apuracoes[0].isentos).toEqual({ vlrAbonoPec: 100000, vlrIndResContrato: 200000 });
        expect(eventos.find(e => e.id === 'ID1')!.complemento?.penAlim).toEqual([{ tpRend: '11', cpf: '11144477735', valor: 50000 }]);
    });
    it('um por mês (retificação: o recibo mais recente) e só do ano e da empresa', () => {
        const { validos, avisos } = s5002sValidos(eventos.map(e => (e.id === 'ID6' ? { ...e, empregador: '99999999' } : e)), '2026', '44388152000189');
        expect(validos.map(v => v.id).sort()).toEqual(['ID1', 'ID3', 'ID4']);
        expect(avisos[0]).toContain('02/2026: 2 S-5002');
    });
    it('quadros 3, 4, 5 e 7', () => {
        const { informes } = montarInformes('2026', eventos.map(e => (e.id === 'ID6' ? { ...e, empregador: '99999999' } : e)), '44388152000189', new Map([['52998224725', 'ANA SOUZA']]));
        expect(informes).toHaveLength(1);
        const i = informes[0];
        expect(i.nome).toBe('ANA SOUZA');
        expect(i.quadro3.map(l => l.valor)).toEqual([1500000, 165000, 0, 50000, 90000]);
        expect(i.quadro4.find(l => l.rotulo.startsWith('Indenizações'))!.valor).toBe(200000);
        expect(i.quadro4.find(l => l.rotulo.startsWith('Outros'))!.valor).toBe(100000);
        // 13º líquido: 5.000 − 550 (INSS 13º) − 400 (pensão do 13º) = 4.050; PLR 3.000 sem IRRF.
        expect(i.quadro5.map(l => l.valor)).toEqual([405000, 25000, 300000]);
        expect(i.quadro7.join('\n')).toContain('Pensão alimentícia paga ao alimentando CPF 111.444.777-35: R$ 900,00 (inclui a do 13º salário)');
        expect(i.quadro7.join('\n')).toContain('Plano de saúde (operadora CNPJ 11.222.333/0001-81, ANS 123456): titular R$ 300,00; dependente CPF 111.444.777-35 R$ 160,00');
        expect(i.quadro7.join('\n')).toContain('Abono pecuniário de férias: R$ 1.000,00');
        expect(i.avisos[0]).toContain('S-5002 de 3 mês(es)');
        const doc = informePdf(informes, { empresa: { razaoSocial: 'EMPRESA UM LTDA', cnpj: '44388152000189' }, titulo: 'Informe de rendimentos', previa: false });
        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });

    it('RRA (CR 1889): sai do quadro 3 e vai no quadro 6 com o processo, os meses e as despesas', () => {
        const dm = `<dmDev><perRef>2026-03</perRef><ideDmDev>COMP202603CR-M1</ideDmDev><tpPgto>1</tpPgto><dtPgto>2026-03-30</dtPgto><codCateg>101</codCateg>`
            + `<totApurMen><CRMen>188951</CRMen><vlrRendTrib>7200.00</vlrRendTrib><vlrPrevOficial>500.00</vlrPrevOficial><vlrCRMen>120.00</vlrCRMen></totApurMen>`
            + `<infoRRA><tpProcRRA>1</tpProcRRA><descRRA>Diferenças de 2025 - Convenção</descRRA><qtdMesesRRA>2.0</qtdMesesRRA><despProcJud><vlrDespCustas>0.00</vlrDespCustas><vlrDespAdvogados>0.00</vlrDespAdvogados></despProcJud></infoRRA></dmDev>`;
        const xml = evt('ID7', '2026-03', '1.1.7', cons('056107', { vlrRendTrib: '5000.00', vlrPrevOficial: '550.00', vlrCRMen: '300.00' }) + cons('188951', { vlrRendTrib: '7200.00', vlrPrevOficial: '500.00', vlrCRMen: '120.00' }))
            .replace('<totInfoIR>', `${dm}<totInfoIR>`);
        const [s] = ler(xml);
        expect(s.rra).toEqual([{ descRRA: 'Diferenças de 2025 - Convenção', qtdMeses: 2, tpProcRRA: '1', nrProcRRA: '', despesas: 0 }]);
        const { informes } = montarInformes('2026', [s], '44388152000189', new Map());
        const i = informes[0];
        expect(i.quadro3.map(l => l.valor)).toEqual([500000, 55000, 0, 0, 30000]);
        expect(i.quadro6).toEqual({ processo: 'Sem processo (convenção, acordo ou pagamento do empregador)', meses: 2, natureza: 'Diferenças de 2025 - Convenção', linhas: [
            expect.objectContaining({ valor: 720000 }), expect.objectContaining({ valor: 0 }), expect.objectContaining({ valor: 50000 }), expect.objectContaining({ valor: 0 }), expect.objectContaining({ valor: 12000 }), expect.objectContaining({ valor: 0 }),
        ] });
        expect(i.avisos.join()).not.toMatch(/infoRRA/);
        // Judicial, com advogado; sem o demonstrativo, aviso para completar à mão.
        const jud = ler(xml.replace('<tpProcRRA>1</tpProcRRA>', '<tpProcRRA>2</tpProcRRA><nrProcRRA>00012345620255020001</nrProcRRA>').replace('<vlrDespAdvogados>0.00', '<vlrDespAdvogados>800.00'))[0];
        const q = montarInformes('2026', [jud], '44388152000189', new Map()).informes[0].quadro6!;
        expect(q.processo).toBe('00012345620255020001'); expect(q.linhas[1].valor).toBe(80000);
        const sem = montarInformes('2026', ler(evt('ID8', '2026-03', '1.1.8', cons('188951', { vlrRendTrib: '100.00' }))), '44388152000189', new Map()).informes[0];
        expect(sem.quadro6?.linhas[0].valor).toBe(10000);
        expect(sem.avisos.join()).toMatch(/complete o quadro 6/);
        expect(montarInformes('2026', eventos.filter(e => e.id === 'ID1'), '44388152000189', new Map()).informes[0].quadro6).toBeUndefined();
        const doc = informePdf([i], { empresa: { razaoSocial: 'EMPRESA UM LTDA', cnpj: '44388152000189' }, titulo: 'Informe de rendimentos', previa: false });
        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });
});

