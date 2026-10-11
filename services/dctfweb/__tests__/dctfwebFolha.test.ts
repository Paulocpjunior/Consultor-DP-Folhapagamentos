// DCTFWeb da folha, a parte do DP (dados fictícios).
import { describe, expect, it } from 'vitest';
import { acoesDaFolha, bytesDoBase64, lerSemaforo, nomeArquivoDarf, validarPedidoTransmissao, vencimentoDarfFolha } from '../dctfwebFolha';

const selo = (rotulo: string, estado: string) => ({ departamento: 'x', rotulo, estado, detalhe: 'd' });
const tres = (reinf: string, mit: string, esocial = 'recebido') => [selo('eSocial', esocial), selo('Reinf', reinf), selo('MIT', mit)];

describe('semáforo dos insumos', () => {
    it('pronto só com os três lidos e nenhum pendente; resposta torta vira incerto', () => {
        expect(lerSemaforo({ ok: true, selos: tres('sem-movimento', 'recebido'), veredito: 'pronto', frase: 'ok' }).veredito).toBe('pronto');
        expect(lerSemaforo({ ok: true, selos: tres('pendente', 'recebido'), veredito: 'pronto' }).veredito).toBe('incerto');
        expect(lerSemaforo({ ok: true, selos: tres('recebido', 'recebido').slice(0, 2), veredito: 'pronto' }).veredito).toBe('incerto');
        expect(lerSemaforo({ ok: true, selos: [selo('eSocial', 'qualquer')], veredito: 'xpto' })).toMatchObject({ veredito: 'incerto', selos: [{ estado: 'indeterminado' }] });
        expect(lerSemaforo({ ok: false, error: 'HTTP 404' })).toMatchObject({ ok: false, erro: 'HTTP 404' });
    });
});

describe('o que a tela oferece', () => {
    const pronto = lerSemaforo({ ok: true, selos: tres('sem-movimento', 'recebido'), veredito: 'pronto' });
    const pendente = lerSemaforo({ ok: true, selos: tres('pendente', 'recebido'), veredito: 'incompleto', frase: 'Falta insumo de: Reinf.' });

    it('em andamento e pronto: DARF em andamento e o DP transmite', () => {
        expect(acoesDaFolha({ ok: true, entregue: false, situacao: 'EM_ANDAMENTO' }, pronto)).toMatchObject({ darfEmAndamento: true, podeEmitirDarf: true, podeTransmitir: true, retificadora: false });
    });
    it('com pendência: DARF sim, transmissão é do Fiscal', () => {
        const a = acoesDaFolha({ ok: true, entregue: false, situacao: 'EM_ANDAMENTO' }, pendente);
        expect(a).toMatchObject({ podeEmitirDarf: true, podeTransmitir: false });
        expect(a.motivo).toMatch(/Fiscal.*Falta insumo de: Reinf/);
    });
    it('já transmitida: DARF da ativa e só a retificadora', () => {
        expect(acoesDaFolha({ ok: true, entregue: true, situacao: 'ATIVA' }, pronto)).toMatchObject({ darfEmAndamento: false, retificadora: true });
    });
    it('situação indisponível: nada de DARF nem transmissão', () => {
        expect(acoesDaFolha({ ok: false, entregue: false, situacao: 'indisponível', erro: 'HTTP 502' }, pronto)).toMatchObject({ podeEmitirDarf: false, podeTransmitir: false });
        expect(acoesDaFolha({ ok: true, entregue: false, situacao: 'X' }, lerSemaforo({ ok: false })).podeTransmitir).toBe(false);
    });
});

describe('DARF e pedido', () => {
    it('vence no dia 20 do mês seguinte, antecipado para o dia útil anterior', () => {
        expect(vencimentoDarfFolha('2026-09')).toBe('2026-10-20');
        expect(vencimentoDarfFolha('2026-10')).toBe('2026-11-19'); // 20/11 é feriado nacional (Consciência Negra)
        expect(vencimentoDarfFolha('2026-12')).toBe('2027-01-20');
        expect(vencimentoDarfFolha('2026-05')).toBe('2026-06-19'); // 20/06/2026 é sábado
    });
    it('retificadora e justificativa com o mínimo do CFI', () => {
        expect(validarPedidoTransmissao({ retificadora: true, motivo: 'curto' })).toHaveLength(1);
        expect(validarPedidoTransmissao({ retificadora: false, comPendencia: true, justificativa: 'MIT entra amanhã cedo, prazo hoje' })).toEqual([]);
    });
    it('PDF em base64 vira bytes; nome do arquivo diz se é em andamento', () => {
        expect([...bytesDoBase64('JVBERg==')]).toEqual([37, 80, 68, 70]);
        expect(nomeArquivoDarf('1200', '2026-09', true)).toBe('DARF-DCTFWeb-1200-2026-09-em-andamento.pdf');
    });
});
