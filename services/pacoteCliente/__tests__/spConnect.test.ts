// SP Connect pelo CFI: templates do DP e envio por template com o PDF (rota dos apps irmãos).
import { afterEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({ user: { emailVerified: true, reload: async () => {}, getIdToken: async () => 'tok' } }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: fb.user }) }));
import { enviarPeloSpConnect, paraBase64, templatesDoDp, valoresSugeridos } from '../spConnect';

afterEach(() => vi.restoreAllMocks());
const resposta = (status: number, corpo: unknown) => ({ ok: status < 400, status, json: async () => corpo }) as Response;

describe('SP Connect', () => {
    it('lê só os templates ativos do dp-folha com documento, com o token do usuário', async () => {
        const f = vi.fn(async () => resposta(200, { ok: true, templates: [{ nome: 'a', ativo: true, temDocumento: true }, { nome: 'b', ativo: true }, { nome: 'c', ativo: false, temDocumento: true }] }));
        expect((await templatesDoDp(f as unknown as typeof fetch)).map(t => t.nome)).toEqual(['a']);
        const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toMatch(/\/api\/admin\/whatsapp\/templates\?departamento=dp-folha$/);
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    });

    it('envia pelo gateway dos irmãos (departamento dp-folha, PDF em base64) e a recusa traz o que fazer', async () => {
        const f = vi.fn(async () => resposta(200, { ok: true, messageId: 'wamid.1', numeroEnviado: '5511988887777', template: 'dp_pacote' }));
        const r = await enviarPeloSpConnect({ para: '5511988887777', template: 'dp_pacote', variaveis: { cliente: 'Marta' }, pdf: { nome: 'h.pdf', bytes: new Uint8Array([37, 80, 68, 70]) }, referencia: '1200 · pacote.zip' }, f as unknown as typeof fetch);
        expect(r).toEqual({ messageId: 'wamid.1', numeroEnviado: '5511988887777', template: 'dp_pacote' });
        const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
        expect([url.endsWith('/api/admin/whatsapp/enviar'), init.method]).toEqual([true, 'POST']);
        expect(JSON.parse(init.body as string)).toEqual({ departamento: 'dp-folha', template: 'dp_pacote', para: '5511988887777', variaveis: { cliente: 'Marta' }, pdfBase64: 'JVBERg==', nomeArquivo: 'h.pdf', referencia: '1200 · pacote.zip' });
        const recusa = vi.fn(async () => resposta(400, { ok: false, error: 'O template "x" NÃO tem cabeçalho de documento', acao: 'Adicione um cabeçalho do tipo DOCUMENTO.' }));
        await expect(enviarPeloSpConnect({ para: '5511988887777', template: 'x', variaveis: {}, pdf: { nome: 'h.pdf', bytes: new Uint8Array([1]) }, referencia: '' }, recusa as unknown as typeof fetch))
            .rejects.toThrow('O template "x" NÃO tem cabeçalho de documento Adicione um cabeçalho do tipo DOCUMENTO.');
    });

    it('base64 em blocos e sugestão das variáveis pela chave', () => {
        const grande = new Uint8Array(100_000).map((_, i) => i % 256);
        expect(paraBase64(grande)).toBe(Buffer.from(grande).toString('base64'));
        expect(valoresSugeridos(['cliente', 'Empresa', 'competência', 'titulo', 'outra'], { contato: 'Marta', empresa: 'Exemplo', titulo: 'Folha mensal 09/2026', competencia: '09/2026' }))
            .toEqual({ cliente: 'Marta', Empresa: 'Exemplo', 'competência': '09/2026', titulo: 'Folha mensal 09/2026', outra: '' });
    });
});
