import { expect, it } from 'vitest';
import { crc32, gerarZip } from '../zip';

it('gera ZIP "stored" com assinaturas, CRC e diretório central corretos', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const zip = gerarZip([{ nome: 'a.xml', conteudo: '<a/>' }, { nome: 'dir/b.xml', conteudo: new Uint8Array([60, 98, 47, 62]) }], new Date(2026, 8, 25, 10, 30, 0));
    const u32 = (i: number) => (zip[i] | (zip[i + 1] << 8) | (zip[i + 2] << 16) | (zip[i + 3] << 24)) >>> 0;
    const u16 = (i: number) => zip[i] | (zip[i + 1] << 8);
    expect(u32(0)).toBe(0x04034b50);
    expect(u32(14)).toBe(crc32(new TextEncoder().encode('<a/>')));
    expect(u32(18)).toBe(4);
    expect(u16(26)).toBe(5);
    expect(new TextDecoder().decode(zip.slice(30, 35))).toBe('a.xml');
    expect(new TextDecoder().decode(zip.slice(35, 39))).toBe('<a/>');
    const fim = zip.length - 22;
    expect(u32(fim)).toBe(0x06054b50);
    expect(u16(fim + 10)).toBe(2);
    const central = u32(fim + 16);
    expect(u32(central)).toBe(0x02014b50);
    expect(u32(central + 42)).toBe(0);
    expect(u32(fim + 12)).toBe(fim - central);
});
