// Pacote do cliente: eventos da agenda por folha e LEIA-ME (dados fictícios).
import { describe, expect, it } from 'vitest';
import { eventosDaFolha, leiaMe, nomeSeguro, type ParamsEventosFolha } from '../pacote';
import { vencimentosDaCompetencia } from '../../prazos/obrigacoes';
import { gerarRemessa } from '../../bancario/cnab240';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

const res = (fichaId: string, nome: string, liquido: number, extra: Record<string, unknown> = {}): ResultadoCalculo => ({ fichaId, nome, competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado',
    verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: liquido, descontos: 0, liquido }, fgts: 0, memoria: [], avisos: [], erros: [], ...extra } as unknown as ResultadoCalculo);
const encargos = { inssSegurados: 30000, irrf: 5000, fgts: 24000, multaFgts: 0, salarioFamilia: 0, salarioMaternidade: 0 };
const base: ParamsEventosFolha = { folha: 'mensal', empresa: { nome: 'Empresa Exemplo', cnpj: '44.388.152/0001-89' }, competencia: '2026-09', ano: 2026, pagamento: '2026-10',
    dataPagamento: '2026-10-06', resultados: [res('f1', 'Ana', 250000), res('f2', 'Bia', 180000), res('f3', 'Caio', 0, { situacao: 'erro' })], encargos };
const venc = (c: string, id: string) => vencimentosDaCompetencia(c).find(v => v.id === id)!.data;

describe('eventos da agenda da folha', () => {
    it('mensal: salário na data do arquivo, DARF do INSS da competência, IRRF no mês do pagamento e FGTS', () => {
        const ev = eventosDaFolha(base);
        const porUid = Object.fromEntries(ev.map(e => [e.uid.replace(/^folha-44388152000189-mensal-2026-09-|@consultor-dp$/g, ''), e]));
        expect(Object.keys(porUid).sort()).toEqual(['darf-2026-09', 'darf-2026-10', 'fgts-2026-09', 'salario']);
        expect(porUid.salario).toMatchObject({ inicio: '2026-10-06', lembrete: true });
        expect(porUid.salario.titulo).toMatch(/Pagar os salários de 09\/2026 \(R\$ 4\.300,00\)/);
        expect(porUid['darf-2026-09'].inicio).toBe(venc('2026-09', 'darf-2026-09'));
        expect(porUid['darf-2026-09'].descricao).toMatch(/INSS descontado dos empregados R\$ 300,00/);
        expect(porUid['darf-2026-09'].descricao).not.toMatch(/IRRF/);
        expect(porUid['darf-2026-10']).toMatchObject({ inicio: venc('2026-10', 'darf-2026-10') });
        expect(porUid['darf-2026-10'].titulo).toMatch(/IRRF \(R\$ 50,00\)/);
        expect(porUid['fgts-2026-09'].titulo).toBe('FGTS Digital 09/2026 (R$ 240,00)');
        expect(ev.map(e => e.inicio)).toEqual([...ev.map(e => e.inicio)].sort());
    });

    it('mensal pago no mesmo mês: IRRF junto no DARF; com parte patronal, o valor vai no título', () => {
        const ev = eventosDaFolha({ ...base, pagamento: '2026-09', encargos: { ...encargos, totalPrevidenciario: 90000 } });
        const darfs = ev.filter(e => e.uid.includes('darf'));
        expect(darfs).toHaveLength(1);
        expect(darfs[0].titulo).toBe('DARF da DCTFWeb 09/2026 (R$ 950,00)');
        expect(darfs[0].descricao).toMatch(/total previdenciário com a parte patronal R\$ 900,00; IRRF R\$ 50,00/);
    });

    it('13º: 1ª parcela só com FGTS de novembro; 2ª com DARF do 13º, IRRF em dezembro e FGTS de dezembro', () => {
        const p1 = eventosDaFolha({ ...base, folha: '13-1a', dataPagamento: '2026-11-30', encargos: { ...encargos, inssSegurados: 0, irrf: 0 } });
        expect(p1.map(e => e.titulo)).toEqual(['Pagar a 1ª parcela do 13º 2026 (R$ 4.300,00)', 'FGTS Digital 11/2026 (R$ 240,00)']);
        const p2 = eventosDaFolha({ ...base, folha: '13-2a', pagamento: '2026-12', dataPagamento: '2026-12-18' });
        const darf13 = p2.find(e => e.titulo.startsWith('DARF do 13º 2026'))!;
        expect(darf13.inicio).toBe(venc('2026-12', 'darf-13-2026'));
        expect(p2.find(e => e.titulo.includes('IRRF do 13º'))!.inicio).toBe(venc('2026-12', 'darf-2026-12'));
        expect(p2.find(e => e.titulo.startsWith('FGTS Digital 12/2026'))).toBeTruthy();
    });

    it('rescisão: pagamento e FGTS rescisório por funcionário, no dia útil até o prazo', () => {
        const ev = eventosDaFolha({ ...base, folha: 'rescisao', resultados: [res('f1', 'Ana', 300000, { tipo: '02', pagarAte: '2026-09-13', multaFgts: 120000, fgts: 30000 }),
            res('f2', 'Bia', 100000, { tipo: '06', pagarAte: '2026-09-15', multaFgts: 0, fgts: 8000 }),
            res('f3', 'Caio', 50000, { tipo: '07', pagarAte: '2026-09-16', multaFgts: 0, fgts: 4000 }),
            res('f4', 'Duda', 40000, { tipo: '01', pagarAte: '2026-09-16', multaFgts: 0, fgts: 2000 })] });
        const pag = ev.find(e => e.titulo.startsWith('Pagar a rescisão de Ana'))!;
        expect(pag.inicio).toBe('2026-09-11'); // 13/09/2026 é domingo: antecipa
        expect(pag.descricao).toMatch(/13\/09\/2026 não é dia útil, antecipado/);
        const fgtsAna = ev.find(e => e.titulo === 'FGTS rescisório de Ana (R$ 1.500,00)')!;
        expect(fgtsAna.inicio).toBe('2026-09-11');
        expect(fgtsAna.descricao).toMatch(/FGTS da rescisão R\$ 300,00 e multa R\$ 1\.200,00/);
        // Término do contrato a termo: saque sem multa, guia rescisória só com o FGTS.
        const fgtsBia = ev.find(e => e.titulo === 'FGTS rescisório de Bia (R$ 80,00)')!;
        expect(fgtsBia.inicio).toBe('2026-09-15');
        expect(fgtsBia.descricao).not.toMatch(/multa/);
        // Pedido de demissão e justa causa: sem guia rescisória; o FGTS vai na guia mensal (dia 20).
        expect(ev.some(e => /Caio|Duda/.test(e.titulo) && e.titulo.startsWith('FGTS'))).toBe(false);
        const mensal = ev.find(e => e.titulo === 'FGTS Digital 09/2026 (R$ 60,00)')!;
        expect(mensal.inicio).toBe(venc('2026-09', 'fgts-2026-09'));
        expect(mensal.descricao).toMatch(/rescisões sem saque/);
    });

    it('sem recibo calculado não há evento', () => {
        expect(eventosDaFolha({ ...base, resultados: [res('f1', 'Ana', 0, { situacao: 'erro' })] })).toEqual([]);
    });
});

describe('LEIA-ME', () => {
    it('arquivos, arquivo bancário (com aviso de homologação), quem pagar por fora e a agenda', () => {
        const conta = { id: 'c', banco: '341', agencia: '1234', agenciaDv: '', conta: '98765-4', contaDv: '', convenio: '', proximoNsa: 5 };
        const remessa = gerarRemessa({ conta, cnpj: '44388152000189', razaoSocial: 'Empresa Exemplo', preferirPix: false, favorecidos: [
            { ref: '1', nome: 'Ana', cpf: '52998224725', banco: '341', agencia: '0321', conta: '51234-8', tipoConta: '', pix: '', valor: 250000, dataPagamento: '2026-10-06' },
            { ref: '2', nome: 'Bia', cpf: '52998224725', banco: '237', agencia: '0001', conta: '1234-5', tipoConta: '', pix: '', valor: 180000, dataPagamento: '2026-10-06' },
        ] });
        const t = leiaMe({ empresa: { nome: 'Empresa Exemplo', cnpj: '44.388.152/0001-89' }, titulo: 'Folha mensal 09/2026', geradoEm: new Date(2026, 9, 2, 9, 0),
            arquivos: [{ nome: 'holerites.pdf', descricao: 'holerites' }, { nome: remessa.nomeArquivo, descricao: 'arquivo bancário' }],
            remessa, foraDoArquivo: [{ nome: 'Caio', motivo: 'sem banco/agência/conta nem chave PIX na ficha' }], eventos: eventosDaFolha(base) });
        expect(t.startsWith('﻿')).toBe(true);
        expect(t).toContain('\r\n');
        expect(t).toContain(`Importe ${remessa.nomeArquivo} no internet banking da empresa (BANCO ITAU), na opção de pagamentos por arquivo (remessa CNAB 240, SISPAG)`);
        expect(t).toContain('Arquivo nº 5: 2 pagamento(s), total R$ 4.300,00.');
        expect(t).toContain('Data do crédito: 06/10/2026.');
        expect(t).toContain('ATENÇÃO: TED (outro banco) ainda em homologação no BANCO ITAU');
        expect(t).toContain('- Caio: sem banco/agência/conta nem chave PIX na ficha');
        expect(t).toMatch(/- 06\/10\/2026: Pagar os salários de 09\/2026/);
    });

    it('nome de arquivo seguro', () => {
        expect(nomeSeguro('Férias José / Ávila')).toBe('ferias-jose-avila');
    });
});
