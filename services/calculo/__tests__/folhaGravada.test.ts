import { describe, expect, it } from 'vitest';
import { diferencasDaGravada, errosParaGravar, prepararHolerite, totaisDaFolha } from '../folhaGravada';
import type { ResultadoCalculo } from '../motorMensal';

const r = (fichaId: string, nome: string, liquido: number, extra: Partial<ResultadoCalculo> = {}): ResultadoCalculo => ({
    fichaId, nome, competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado', verbas: [], bases: { inss: liquido + 100, fgts: liquido + 100, irrf: liquido },
    totais: { proventos: liquido + 100, descontos: 100, liquido }, fgts: 80, memoria: [], avisos: [], erros: [], ...extra,
});

describe('folha gravada', () => {
    it('totais sem os funcionários com erro; erros listados para quem grava', () => {
        const rs = [r('a', 'ANA', 200000), r('b', 'BIA', 100000), r('c', 'CAIO', 0, { situacao: 'erro', erros: ['Ficha sem salário fixo.'] })];
        expect(totaisDaFolha(rs)).toEqual({ funcionarios: 2, proventos: 300200, descontos: 200, liquido: 300000, fgts: 160 });
        expect(errosParaGravar(rs)).toEqual(['CAIO: Ficha sem salário fixo.']);
    });
    it('o holerite vai sem campos indefinidos (o Firestore recusa undefined)', () => {
        const h = prepararHolerite(r('a', 'ANA', 1, { irrfAdiantamento: undefined }));
        expect('irrfAdiantamento' in h).toBe(false);
    });
    it('diferenças entre a gravada e o cálculo de hoje: valores, quem saiu e quem entrou', () => {
        const d = diferencasDaGravada([r('a', 'ANA', 200000), r('b', 'BIA', 100000)], [r('a', 'ANA', 210000), r('c', 'CAIO', 50000)]);
        expect(d.map(x => x.nome)).toEqual(['ANA', 'BIA', 'CAIO']);
        expect(d[0].detalhe).toContain('líquido 2.000,00 → 2.100,00');
        expect(d[1].detalhe).toBe('não aparece mais no cálculo de hoje');
        expect(d[2].detalhe).toBe('não estava na folha gravada');
        expect(diferencasDaGravada([r('a', 'ANA', 1)], [r('a', 'ANA', 1)])).toEqual([]);
    });
});
