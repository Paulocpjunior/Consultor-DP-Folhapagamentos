import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { calcularRescisao } from '../../calculo/motorRescisao';
import { dadosEmpregadorWeb, mediaUltimosSalarios, mesesTrabalhados, passosDaEfetivacao, seguroDesemprego } from '../efetivacao';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (admissao: string): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao, salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', pis: '12345678919', mae: 'MARIA', cbo: '411010', logradouro: 'RUA A', numero: '10' } });

describe('efetivação da rescisão', () => {
    it('meses trabalhados: fração de 15 dias conta', () => {
        expect(mesesTrabalhados('2025-06-01', '2026-05-31')).toBe(12);
        expect(mesesTrabalhados('2025-06-01', '2026-06-15')).toBe(13);
        expect(mesesTrabalhados('2025-06-01', '2026-06-14')).toBe(12);
        expect(mesesTrabalhados('', '2026-06-13')).toBe(0);
    });

    it('seguro-desemprego pela Lei 7.998/1990 (red. Lei 13.134/2015)', () => {
        // 16 meses, 1ª solicitação: cabe, 4 parcelas.
        const s1 = seguroDesemprego(ficha('2025-06-01'), { tipo: '02', data: '2026-10-05' }, 1);
        expect(s1).toMatchObject({ cabe: true, meses: 16, exigidos: 12, parcelas: 4 });
        // 10 meses: 1ª não cabe (exige 12); 2ª cabe com 3 parcelas.
        expect(seguroDesemprego(ficha('2025-12-01'), { tipo: '02', data: '2026-10-05' }, 1).cabe).toBe(false);
        expect(seguroDesemprego(ficha('2025-12-01'), { tipo: '02', data: '2026-10-05' }, 2)).toMatchObject({ cabe: true, parcelas: 3 });
        // 7 meses na 3ª: cabe com 3; 30 meses: 5 parcelas.
        expect(seguroDesemprego(ficha('2026-03-01'), { tipo: '02', data: '2026-10-05' }, 3)).toMatchObject({ cabe: true, parcelas: 3 });
        expect(seguroDesemprego(ficha('2024-04-01'), { tipo: '02', data: '2026-10-05' }, 1).parcelas).toBe(5);
        // Pedido de demissão e acordo não dão direito.
        expect(seguroDesemprego(ficha('2024-04-01'), { tipo: '07', data: '2026-10-05' }).cabe).toBe(false);
        expect(seguroDesemprego(ficha('2024-04-01'), { tipo: '33', data: '2026-10-05' }).motivo).toContain('484-A');
        expect(mediaUltimosSalarios(ficha('2024-04-01'), '2026-10-05')).toBe(300000);
    });

    it('passos com prazo; o seguro só na dispensa sem justa causa', () => {
        const p = passosDaEfetivacao({ tipo: '02', data: '2026-10-05', pagarAte: '2026-10-15' });
        expect(p.map(x => x.id)).toEqual(['ficha', 's2299', 'pagamento', 's1210', 'fgts', 'seguro', 'documentos']);
        expect(p.find(x => x.id === 's2299')!.prazo).toBe('2026-10-15');
        expect(p.find(x => x.id === 'fgts')!.detalhe).toContain('multa');
        expect(passosDaEfetivacao({ tipo: '07', data: '2026-10-05', pagarAte: '2026-10-15' }).find(x => x.id === 'seguro')!.aplica).toBe(false);
        expect(passosDaEfetivacao({ tipo: '33', data: '2026-10-05', pagarAte: '2026-10-15' }).find(x => x.id === 'documentos')!.detalhe).toContain('484-A');
    });

    it('dados para o Empregador Web e orientações ao trabalhador em PDF', async () => {
        const f = ficha('2025-06-01');
        const r = calcularRescisao({ ficha: f, data: '2026-10-05', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
        const dados = Object.fromEntries(dadosEmpregadorWeb(f, r, { cnpj: '29463877000109', razaoSocial: 'EMPRESA X' }));
        expect(dados).toMatchObject({ CPF: '52998224725', 'PIS/PASEP/NIT': '12345678919', 'Nome da mãe': 'MARIA', CBO: '411010', Dispensa: '05/10/2026', 'Salário de 09/2026': '3.000,00' });
        expect(dados['Aviso prévio indenizado']).toContain('33 dias');
        const { orientacoesPdf } = await import('../orientacoesPdf');
        const doc = orientacoesPdf(f, r, seguroDesemprego(f, r), { empresa: { razaoSocial: 'EMPRESA X', cnpj: '29463877000109' }, titulo: 'Orientações de desligamento' }, '123456');
        const texto = doc.output();
        expect(texto).toContain('4 parcelas');
        expect(texto).toContain('123456');
        expect(texto).toContain('Seguro-desemprego');
    });
});
