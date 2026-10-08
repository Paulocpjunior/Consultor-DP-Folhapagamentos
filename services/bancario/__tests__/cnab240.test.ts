// Remessa CNAB 240 de salários (dados fictícios). Posições do padrão FEBRABAN.
import { describe, expect, it } from 'vitest';
import { alfa, classificar, gerarRemessa, num, separarDv, tipoChavePix, type ContaPagamento, type Favorecido } from '../cnab240';

const conta: ContaPagamento = { id: 'c1', banco: '237', agencia: '1234-5', agenciaDv: '', conta: '0012345-6', contaDv: '', convenio: '123456', proximoNsa: 7,
    logradouro: 'Rua Ação', numero: '100', complemento: 'Sala 2', cidade: 'São Paulo', cep: '01310-100', uf: 'SP' };
const fav = (p: Partial<Favorecido>): Favorecido => ({ ref: 'f1', nome: 'José Ávila', cpf: '529.982.247-25', banco: '237', agencia: '0987', conta: '55555-0', tipoConta: 'corrente', pix: '',
    valor: 461940, dataPagamento: '2026-11-06', ...p });
const agora = new Date(2026, 10, 3, 14, 5, 9);
const pos = (l: string, de: number, ate: number) => l.slice(de - 1, ate);

describe('campos', () => {
    it('alfa sem acento, maiúsculo, com brancos; numérico com zeros; estouro é erro', () => {
        expect(alfa('José Ávila, ç', 15)).toBe('JOSE AVILA, C  ');
        expect(num('12.3', 6)).toBe('000123');
        expect(() => num('1234567', 6, 'NSA')).toThrow(/NSA/);
        expect(separarDv('12345-x')).toEqual({ numero: '12345', dv: 'X' });
        expect(separarDv('12345')).toEqual({ numero: '12345', dv: '' });
    });
    it('tipo da chave PIX', () => {
        expect(['+55 11 98888-7777', 'ana@x.com.br', '529.982.247-25', '123e4567-e89b-12d3-a456-426614174000', 'abc'].map(tipoChavePix))
            .toEqual(['telefone', 'email', 'cpf', 'aleatoria', null]);
    });
    it('chave PIX de celular sem +55 não vira CPF; CPF/CNPJ só com dígito verificador; ambígua fica de fora com o motivo', () => {
        // Celular só com dígitos ou com máscara (não é CPF válido): telefone, e vai no arquivo com +55.
        expect(['11987654321', '(11) 98765-4321', '11 98765-4321', '5511987654321'].map(tipoChavePix)).toEqual(['telefone', 'telefone', 'telefone', 'telefone']);
        // CPF válido que não parece celular; CNPJ válido; DV errado não é CPF/CNPJ.
        expect(['12345678909', '11.222.333/0001-81', '11222333000182', '52998224726'].map(tipoChavePix)).toEqual(['cpf', 'cpf', null, null]);
        // CPF válido que também parece celular: ambíguo, não entra.
        expect(tipoChavePix('11987654374')).toBeNull();
        expect(classificar(fav({ banco: '', conta: '', pix: '11987654374' }), conta, false)).toEqual({ forma: null, motivo: expect.stringMatching(/pode ser CPF ou celular: informe o celular com \+55/) });
        expect(classificar(fav({ banco: '', conta: '', pix: '52998224726' }), conta, false).motivo).toMatch(/não é CPF\/CNPJ válido nem telefone/);
        // No Segmento B do PIX, o celular sem +55 sai com +55 e iniciação 01.
        const r = gerarRemessa({ conta, cnpj: '44388152000189', razaoSocial: 'EMPRESA', favorecidos: [fav({ banco: '', conta: '', pix: '(11) 98765-4321' })], preferirPix: false, agora: new Date('2026-10-05T12:00:00Z') });
        const b = r.conteudo.split('\r\n').find(l => l[13] === 'B')!;
        expect([b.slice(14, 17), b.slice(127, 226).trim()]).toEqual(['01 ', '+5511987654321']);
    });
    it('forma: mesmo banco = crédito em conta (ou poupança); outro banco = TED; sem conta = PIX; sem nada = fora', () => {
        expect(classificar(fav({}), conta, false).forma).toBe('conta');
        expect(classificar(fav({ tipoConta: 'poupanca' }), conta, false).forma).toBe('poupanca');
        expect(classificar(fav({ banco: '341' }), conta, false).forma).toBe('ted');
        expect(classificar(fav({ banco: '', conta: '', pix: 'ana@x.com.br' }), conta, false).forma).toBe('pix');
        expect(classificar(fav({ pix: 'ana@x.com.br' }), conta, true).forma).toBe('pix');
        expect(classificar(fav({ conta: '55555' }), conta, false).motivo).toMatch(/sem dígito/);
        expect(classificar(fav({ banco: '', agencia: '', conta: '' }), conta, false).motivo).toMatch(/sem banco/);
        expect(classificar(fav({ valor: 0 }), conta, false).motivo).toMatch(/sem líquido/);
    });
});

describe('remessa CNAB 240 de salários', () => {
    const r = gerarRemessa({ conta, cnpj: '44.388.152/0001-89', razaoSocial: 'S&P Assessoria Contábil S/S', agora, preferirPix: false, favorecidos: [
        fav({}), fav({ ref: 'f2', nome: 'Ana', banco: '341', agencia: '0001-9', conta: '1234-5', valor: 100000 }),
        fav({ ref: 'f3', nome: 'Bia', banco: '', agencia: '', conta: '', pix: '+55 11 98888-7777', valor: 50000 }),
        fav({ ref: 'f4', nome: 'Caio', banco: '', agencia: '', conta: '' }),
    ] });
    const l = r.conteudo.split('\r\n').filter(Boolean);

    it('todas as linhas com 240 posições, CRLF; lotes por forma; quem não tem conta fica de fora', () => {
        expect(l.every(x => x.length === 240)).toBe(true);
        expect(r.conteudo.endsWith('\r\n')).toBe(true);
        // header + (lote conta: H, A, B, T) + (TED: H, A, B, T) + (PIX: H, A, B, T) + trailer
        expect(l.map(x => x[7] + (x[7] === '3' ? x[13] : ''))).toEqual(['0', '1', '3A', '3B', '5', '1', '3A', '3B', '5', '1', '3A', '3B', '5', '9']);
        expect(r.lotes).toEqual([{ forma: 'conta', quantidade: 1, total: 461940 }, { forma: 'ted', quantidade: 1, total: 100000 }, { forma: 'pix', quantidade: 1, total: 50000 }]);
        expect(r.excluidos.map(e => [e.favorecido.ref, e.motivo])).toEqual([['f4', 'sem banco/agência/conta nem chave PIX na ficha']]);
        expect(r.total).toBe(611940);
        expect(r.nomeArquivo).toMatch(/^CNAB240_237_\d{8}_000007\.REM$/);
    });

    it('header de arquivo', () => {
        const h = l[0];
        expect([pos(h, 1, 3), pos(h, 4, 7), pos(h, 8, 8), pos(h, 18, 18), pos(h, 19, 32), pos(h, 33, 52)]).toEqual(['237', '0000', '0', '2', '44388152000189', '123456'.padEnd(20)]);
        expect([pos(h, 53, 57), pos(h, 58, 58), pos(h, 59, 70), pos(h, 71, 71)]).toEqual(['01234', '5', '000000012345', '6']);
        expect(pos(h, 73, 102)).toBe('S P ASSESSORIA CONTABIL S/S'.padEnd(30));
        expect([pos(h, 143, 143), pos(h, 144, 151), pos(h, 152, 157), pos(h, 158, 163), pos(h, 164, 166)]).toEqual(['1', '03112026', '140509', '000007', '107']);
    });

    it('header de lote: salários (30) e forma de lançamento', () => {
        expect([pos(l[1], 4, 7), pos(l[1], 8, 8), pos(l[1], 9, 9), pos(l[1], 10, 11), pos(l[1], 12, 13), pos(l[1], 14, 16)]).toEqual(['0001', '1', 'C', '30', '01', '046']);
        expect([pos(l[5], 12, 13), pos(l[9], 12, 13)]).toEqual(['41', '45']);
        expect([pos(l[1], 143, 172).trim(), pos(l[1], 173, 177), pos(l[1], 193, 212).trim(), pos(l[1], 213, 217), pos(l[1], 218, 220), pos(l[1], 221, 222)])
            .toEqual(['RUA ACAO', '00100', 'SAO PAULO', '01310', '100', 'SP']);
    });

    it('segmento A: crédito em conta, TED (câmara 018, finalidade) e PIX (câmara 009, sem conta)', () => {
        const a = l[2];
        expect([pos(a, 9, 13), pos(a, 14, 14), pos(a, 18, 20), pos(a, 21, 23), pos(a, 24, 28), pos(a, 29, 29), pos(a, 30, 41), pos(a, 42, 42)])
            .toEqual(['00001', 'A', '000', '237', '00987', ' ', '000000055555', '0']);
        expect([pos(a, 44, 73).trim(), pos(a, 74, 93).trim(), pos(a, 94, 101), pos(a, 102, 104), pos(a, 120, 134)]).toEqual(['JOSE AVILA', 'F1', '06112026', 'BRL', '000000000461940']);
        const ted = l[6];
        expect([pos(ted, 18, 20), pos(ted, 21, 23), pos(ted, 24, 28), pos(ted, 29, 29), pos(ted, 220, 224), pos(ted, 225, 226)]).toEqual(['018', '341', '00001', '9', '00004', 'CC']);
        const pix = l[10];
        expect([pos(pix, 18, 20), pos(pix, 21, 23), pos(pix, 30, 41)]).toEqual(['009', '000', '000000000000']);
    });

    it('segmento B: CPF e endereço; no PIX, a forma de iniciação e a chave', () => {
        const b = l[3];
        expect([pos(b, 14, 14), pos(b, 18, 18), pos(b, 19, 32)]).toEqual(['B', '1', '00052998224725']);
        const pb = l[11];
        expect([pos(pb, 15, 17), pos(pb, 128, 226).trim()]).toEqual(['01 ', '+5511988887777']);
    });

    it('trailers: registros e somas', () => {
        expect([pos(l[4], 8, 8), pos(l[4], 18, 23), pos(l[4], 24, 41)]).toEqual(['5', '000004', '000000000000461940']);
        const t = l[13];
        expect([pos(t, 4, 7), pos(t, 8, 8), pos(t, 18, 23), pos(t, 24, 29)]).toEqual(['9999', '9', '000003', '000014']);
    });

    it('banco sem layout e conta da empresa incompleta são recusados', () => {
        expect(() => gerarRemessa({ conta: { ...conta, banco: '999' }, cnpj: '44388152000189', razaoSocial: 'X', favorecidos: [], preferirPix: false })).toThrow(/sem layout/);
        expect(() => gerarRemessa({ conta: { ...conta, conta: '12345' }, cnpj: '44388152000189', razaoSocial: 'X', favorecidos: [], preferirPix: false })).toThrow(/incompleta/);
    });
});

describe('Itaú SISPAG (posições do arquivo da SAGE, dados fictícios)', () => {
    const itau: ContaPagamento = { ...conta, banco: '341', agencia: '1234', conta: '98765-4', convenio: 'ignorado', proximoNsa: 3, complemento: '', cep: '01310-100' };
    const r = gerarRemessa({ conta: itau, cnpj: '44.388.152/0001-89', razaoSocial: 'Empresa Exemplo Ltda', agora, preferirPix: false, favorecidos: [
        fav({ ref: '412', nome: 'Ana Souza', banco: '341', agencia: '0321', conta: '51234-8', valor: 65432 }),
        fav({ ref: '12', nome: 'Bia', banco: '237', agencia: '0001', conta: '1234-5', valor: 10000 }),
    ] });
    const l = r.conteudo.split('\r\n').filter(Boolean);

    it('crédito em conta Itaú sem Segmento B; TED fica como não conferida', () => {
        expect(l.every(x => x.length === 240)).toBe(true);
        expect(l.map(x => x[7] + (x[7] === '3' ? x[13] : ''))).toEqual(['0', '1', '3A', '5', '1', '3A', '5', '9']);
        expect(r.naoConferidas).toEqual(['ted']);
        expect(r.perfil.layout).toBe('sispag');
    });

    it('header de arquivo: versão 080, sem convênio nem NSA, agência/conta com brancos e DAC', () => {
        const h = l[0];
        expect([pos(h, 1, 8), pos(h, 15, 17), pos(h, 18, 18), pos(h, 19, 32), pos(h, 33, 52)]).toEqual(['34100000', '080', '2', '44388152000189', ' '.repeat(20)]);
        expect(pos(h, 53, 72)).toBe('01234 000000098765 4');
        expect([pos(h, 73, 102).trim(), pos(h, 103, 132).trim(), pos(h, 143, 143), pos(h, 144, 151), pos(h, 152, 157), pos(h, 158, 166), pos(h, 167, 171)])
            .toEqual(['EMPRESA EXEMPLO LTDA', 'BANCO ITAU', '1', '03112026', '140509', '000000000', '00000']);
    });

    it('header de lote: versão 040, finalidade 01, endereço com CEP de 8 dígitos', () => {
        const h = l[1];
        expect([pos(h, 1, 8), pos(h, 9, 13), pos(h, 14, 16), pos(h, 53, 72), pos(h, 103, 104)]).toEqual(['34100011', 'C3001', '040', '01234 000000098765 4', '01']);
        expect([pos(h, 143, 172).trim(), pos(h, 173, 177), pos(h, 193, 212).trim(), pos(h, 213, 220), pos(h, 221, 222)]).toEqual(['RUA ACAO', '00100', 'SAO PAULO', '01310100', 'SP']);
    });

    it('segmento A: seu número com zeros, moeda REA, CPF em 204-217; TED com câmara 018 e finalidade', () => {
        const a = l[2];
        expect([pos(a, 1, 14), pos(a, 15, 20), pos(a, 21, 23), pos(a, 24, 43)]).toEqual(['3410001300001A', '000000', '341', '00321 000000051234 8']);
        expect([pos(a, 44, 73).trim(), pos(a, 74, 93), pos(a, 94, 101), pos(a, 102, 104), pos(a, 105, 119), pos(a, 120, 134)])
            .toEqual(['ANA SOUZA', '00000000000000000412', '06112026', 'REA', '0'.repeat(15), '000000000065432']);
        expect([pos(a, 155, 162), pos(a, 163, 177), pos(a, 198, 203), pos(a, 204, 217), pos(a, 220, 224)]).toEqual(['0'.repeat(8), '0'.repeat(15), '000000', '00052998224725', '     ']);
        const ted = l[5];
        expect([pos(ted, 18, 20), pos(ted, 21, 23), pos(ted, 24, 43), pos(ted, 220, 224)]).toEqual(['018', '237', '00001 000000001234 5', '00004']);
    });

    it('trailers: registros, soma e brancos', () => {
        expect([pos(l[3], 1, 8), pos(l[3], 18, 23), pos(l[3], 24, 41), pos(l[3], 42, 59), pos(l[3], 60, 240).trim()]).toEqual(['34100015', '000003', '000000000000065432', '0'.repeat(18), '']);
        expect([pos(l[7], 1, 8), pos(l[7], 18, 23), pos(l[7], 24, 29), pos(l[7], 30, 240).trim()]).toEqual(['34199999', '000002', '000008', '']);
    });
});
