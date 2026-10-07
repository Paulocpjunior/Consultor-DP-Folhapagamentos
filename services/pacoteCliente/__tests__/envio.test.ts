// Envio do pacote: WhatsApp, e-mail e mensagem (dados fictícios).
import { describe, expect, it } from 'vitest';
import { emailValido, linkEmail, linkWhatsApp, mensagemEnvio, numeroWhatsApp } from '../envio';

describe('envio do pacote', () => {
    it('WhatsApp com DDI 55 e e-mail válido', () => {
        expect(['(11) 98888-7777', '11 3333-4444', '+55 11 98888-7777', '98888-7777', ''].map(numeroWhatsApp))
            .toEqual(['5511988887777', '551133334444', '5511988887777', null, null]);
        expect([emailValido('a@b.com'), emailValido('a@b'), emailValido(undefined)]).toEqual([true, false, false]);
    });
    it('links: wa.me com o texto e mailto com CRLF no corpo', () => {
        expect(linkWhatsApp('5511988887777', 'Olá\nok')).toBe('https://wa.me/5511988887777?text=Ol%C3%A1%0Aok');
        expect(linkEmail('a@b.com', 'Folha 09/2026', 'linha 1\nlinha 2')).toBe('mailto:a@b.com?subject=Folha%2009%2F2026&body=linha%201%0D%0Alinha%202');
    });
    it('mensagem sem arquivo bancário nem agenda, com quem pagar por fora', () => {
        const t = mensagemEnvio({ empresa: 'Exemplo', titulo: 'Folha mensal 09/2026', nomeZip: 'p.zip', arquivos: ['holerites'], foraDoArquivo: [{ nome: 'Caio' }], eventos: [], assinatura: 'DP' });
        expect(t.split('\n')).toEqual(['Olá!', '', 'Segue o pacote da Folha mensal 09/2026 da Exemplo (p.zip), com:', '• holerites', '',
            'Pagar por fora do arquivo: Caio (motivo no LEIA-ME).', '', 'Qualquer dúvida, estamos à disposição.', 'DP']);
    });
});
