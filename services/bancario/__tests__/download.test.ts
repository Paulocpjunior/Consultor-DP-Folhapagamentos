// Download da remessa: no Safari o .REM vai dentro de um .zip (o Safari acrescenta .txt e o Itaú recusa o nome).
import { describe, expect, it } from 'vitest';
import { ehSafari, remessaParaBaixar } from '../download';
import { lerZip } from '../../implantacao/zip';

const UA = {
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    safariIpad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
    firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
};

describe('download da remessa', () => {
    it('reconhece só o Safari (Chrome, Edge e Chrome do iPhone também dizem "Safari")', () => {
        expect(Object.fromEntries(Object.entries(UA).map(([k, v]) => [k, ehSafari(v)])))
            .toEqual({ safariMac: true, safariIpad: true, chromeMac: false, edgeWin: false, chromeIos: false, firefoxMac: false });
    });

    it('no Safari: PG081010.zip com o PG081010.REM de nome exato e conteúdo intacto; fora dele, o .REM direto', async () => {
        const conteudo = '34100000         2'.padEnd(240, ' ') + '\r\n';
        const z = remessaParaBaixar('PG081010.REM', conteudo, UA.safariMac);
        expect([z.nome, z.mime, z.dentroDoZip]).toEqual(['PG081010.zip', 'application/zip', true]);
        const dentro = await lerZip(z.bytes);
        expect(dentro.map(a => a.nome)).toEqual(['PG081010.REM']);
        expect(new TextDecoder().decode(dentro[0].bytes)).toBe(conteudo);
        const d = remessaParaBaixar('PG081010.REM', conteudo, UA.chromeMac);
        expect([d.nome, d.mime, d.dentroDoZip, new TextDecoder().decode(d.bytes)]).toEqual(['PG081010.REM', 'application/octet-stream', false, conteudo]);
    });
});
