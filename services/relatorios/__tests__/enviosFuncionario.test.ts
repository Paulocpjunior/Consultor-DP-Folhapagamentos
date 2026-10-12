// Histórico dos envios ao funcionário: id, destino mascarado, registro, texto e a separação de quem já recebeu.
import { describe, expect, it } from 'vitest';
import { idEnvio, jaRecebeu, mascararDestino, registroDoEnvio, separarPorHistorico, textoDoEnvio, type HistoricoEnvios } from '../enviosFuncionario';

describe('histórico dos envios', () => {
    it('id e destino mascarado', () => {
        expect(idEnvio('E1', '2026-10', 'holerite', 'F9')).toBe('E1_2026-10_holerite_F9');
        expect(mascararDestino('email', ' bruno@ex.com ')).toBe('b***@ex.com');
        expect(mascararDestino('email', 'sem-arroba')).toBe('***');
        expect(mascararDestino('whatsapp', '5511988887777')).toBe('(**) *****-7777');
        expect(mascararDestino('whatsapp', '12')).toBe('***');
    });
    it('registro: certo sem erro; falha com o erro curto', () => {
        const agora = new Date('2026-10-12T13:00:00Z');
        expect(registroDoEnvio('email', 'ana@ex.com', 'col@x', undefined, agora)).toEqual({ ok: true, destino: 'a***@ex.com', em: '2026-10-12T13:00:00.000Z', porEmail: 'col@x' });
        const f = registroDoEnvio('whatsapp', '5511977776666', 'col@x', 'x'.repeat(400), agora);
        expect([f.ok, f.destino, f.erro?.length]).toEqual([false, '(**) *****-6666', 300]);
        expect(textoDoEnvio('whatsapp', { ...f, erro: 'número sem WhatsApp' })).toMatch(/^WhatsApp falhou em \d{2}\/10\/2026 \d{2}:\d{2} \(\(\*\*\) \*\*\*\*\*-6666, por col@x\): número sem WhatsApp$/);
    });
    it('separa quem já recebeu pelo canal (falha não conta)', () => {
        const ok = { ok: true, destino: '', em: '', porEmail: '' };
        const h: HistoricoEnvios = new Map([['1', { email: ok }], ['2', { email: { ...ok, ok: false }, whatsapp: ok }]]);
        const lista = [{ id: '1' }, { id: '2' }, { id: '3' }];
        expect(separarPorHistorico(lista, x => x.id, h, 'email', false)).toEqual({ enviar: [{ id: '2' }, { id: '3' }], jaEnviados: [{ id: '1' }] });
        expect(separarPorHistorico(lista, x => x.id, h, 'email', true).enviar).toHaveLength(3);
        expect(separarPorHistorico(lista, x => x.id, null, 'whatsapp', false).enviar).toHaveLength(3);
        expect([jaRecebeu(h, '2', 'whatsapp'), jaRecebeu(h, '2', 'email'), jaRecebeu(undefined, '1', 'email')]).toEqual([true, false, false]);
    });
});
