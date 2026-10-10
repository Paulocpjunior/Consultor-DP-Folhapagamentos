import { describe, expect, it } from 'vitest';
import { compararVersao, linksRelevantes, novidades, textoDaPagina, versoesCitadas } from '../../../scripts/esocial/leiauteEsocial.mjs';
import { situacaoDoMonitor, type MonitorLeiaute } from '../monitorLeiaute';

const HTML = `<html><body><nav><a href="/esocial/pt-br/assuntos">Assuntos</a></nav>
<a href="/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-s-1-3">Leiautes do eSocial versão S-1.3</a>
<a href="https://www.gov.br/esocial/pt-br/documentacao-tecnica/notas-tecnicas/nt-01-2026.pdf">Nota Técnica S-1.3 nº 01/2026</a>
<a href="/arquivos/esquemas-xsd-v_S_01_03_00.zip"><span>Esquemas XSD</span> (pacote)</a>
<a href="/esocial/pt-br/noticias">Notícias</a>
<a href="/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-s-1-3">Leiautes do eSocial versão S-1.3</a></body></html>`;
const BASE = 'https://www.gov.br/esocial/pt-br/documentacao-tecnica';

describe('monitor do leiaute (parte pura do job)', () => {
    it('links relevantes, absolutos e sem repetir', () => {
        const l = linksRelevantes(HTML, BASE);
        expect(l.map((x: { titulo: string }) => x.titulo)).toEqual(['Esquemas XSD (pacote)', 'Leiautes do eSocial versão S-1.3', 'Nota Técnica S-1.3 nº 01/2026']);
        expect(l[0].url).toBe('https://www.gov.br/arquivos/esquemas-xsd-v_S_01_03_00.zip');
    });
    it('versões citadas e novidades', () => {
        const l = linksRelevantes(HTML, BASE);
        expect(versoesCitadas(l)).toEqual(['S-1.3']);
        expect(versoesCitadas([...l, { titulo: 'Leiautes do eSocial versão S-1.4 (em produção restrita)', url: 'x' }])).toEqual(['S-1.4', 'S-1.3']);
        expect(compararVersao('S-1.10', 'S-1.9')).toBeGreaterThan(0);
        expect(novidades(l, l.slice(1)).map((x: { titulo: string }) => x.titulo)).toEqual(['Esquemas XSD (pacote)']);
        expect(textoDaPagina('<p>Olá <script>x()</script><b>DP</b></p>')).toBe('Olá DP');
    });
});

describe('situação do monitor no painel', () => {
    const agora = Date.parse('2026-10-10T12:00:00Z');
    const m = (o: Partial<MonitorLeiaute>): MonitorLeiaute => ({ verificadoEm: '2026-10-09T11:10:00Z', versoes: ['S-1.3'], novidades: [], itens: [], erro: null, ...o });
    it('em dia, versão nova, parado, com erro e sem rodar', () => {
        expect(situacaoDoMonitor(m({}), agora)).toEqual([expect.objectContaining({ gravidade: 'ok' })]);
        expect(situacaoDoMonitor(m({ versoes: ['S-1.4', 'S-1.3'] }), agora)[0]).toMatchObject({ gravidade: 'critico', titulo: 'Leiaute S-1.4 citado na documentação do eSocial' });
        expect(situacaoDoMonitor(m({ verificadoEm: '2026-09-01T11:10:00Z' }), agora)[0].titulo).toBe('Monitor do leiaute parado');
        expect(situacaoDoMonitor(m({ erro: 'HTTP 503' }), agora)[0]).toMatchObject({ titulo: 'A última verificação falhou', detalhe: 'HTTP 503' });
        expect(situacaoDoMonitor(m({ novidades: [{ titulo: 'NT 02/2026', url: 'u', detectadoEm: '2026-10-08T11:00:00Z', resumo: null, resumoModelo: null }] }), agora)[0].titulo).toBe('1 novidade(s) na documentação técnica (30 dias)');
        expect(situacaoDoMonitor(null, agora)[0].titulo).toBe('Monitor do leiaute ainda não rodou');
    });
});
