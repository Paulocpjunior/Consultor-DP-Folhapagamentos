// SP Connect pelo CFI: templates do DP e envio por template com o PDF (rota dos apps irmãos).
import { afterEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({ user: { emailVerified: true, reload: async () => {}, getIdToken: async () => 'tok' } }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: fb.user }) }));
import { enviarEmailPeloEscritorio, enviarPeloSpConnect, paraBase64, templatesDoDp, valoresSugeridos } from '../spConnect';

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
        // O específico vence o genérico "nome" (Codex #112).
        expect(valoresSugeridos(['nome_empresa', 'nome_documento', 'nome_cliente', 'nome'], { contato: 'Marta', empresa: 'Exemplo', titulo: 'Folha', competencia: '09/2026' }))
            .toEqual({ nome_empresa: 'Exemplo', nome_documento: 'Folha', nome_cliente: 'Marta', nome: 'Marta' });
    });

    it('e-mail pelo escritório: rota do DP no CFI com o .zip em base64; antes da publicação (404) diz o caminho', async () => {
        const pedido = { empresaId: 'E1', cnpj: '44.388.152/0001-89', empresaNome: 'Exemplo', titulo: 'Folha mensal 09/2026', competencia: '2026-09',
            para: 'marta@cliente.com.br', assunto: 'Folha · Exemplo', mensagem: 'Olá', anexos: [{ nome: 'p.zip', bytes: new Uint8Array([80, 75, 3, 4]), mime: 'application/zip' }] };
        const ok = { remetente: 'ana@sp.com.br', fonteRemetente: 'colaborador' as const, copiaPara: [] };
        const chamar = vi.fn(async () => ok);
        expect(await enviarEmailPeloEscritorio(pedido, chamar as never)).toEqual(ok);
        expect(chamar).toHaveBeenCalledWith('/email/enviar', { empresaId: 'E1', cnpj: '44388152000189', empresaNome: 'Exemplo', titulo: 'Folha mensal 09/2026', competencia: '2026-09',
            para: 'marta@cliente.com.br', assunto: 'Folha · Exemplo', mensagem: 'Olá', anexos: [{ nome: 'p.zip', base64: 'UEsDBA==', mime: 'application/zip' }] });
        const sem = vi.fn(async () => { throw Object.assign(new Error('HTTP 404'), { status: 404 }); });
        await expect(enviarEmailPeloEscritorio(pedido, sem as never)).rejects.toThrow(/ainda não está publicado no CFI\. Use "E-mail deste computador"/);
        const recusa = vi.fn(async () => { throw Object.assign(new Error('Anexos com 3.4 MB'), { status: 413 }); });
        await expect(enviarEmailPeloEscritorio(pedido, recusa as never)).rejects.toThrow('Anexos com 3.4 MB');
    });
});
