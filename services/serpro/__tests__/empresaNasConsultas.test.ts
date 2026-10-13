// Toda rota do túnel ao serviço "governo" leva o empresaId (a empresa do DP da tela) junto com o CNPJ. As seis
// consultas por CNPJ não levavam: na plataforma comum elas passam a conferir a carteira (400 sem empresaId, 403 fora
// dela), e o CFI ignora o campo. Dados fictícios: CNPJ 11.222.333/0001-81.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/tokenCfi', () => ({
    comTokenCfi: (f: (t: string) => Promise<unknown>) => f('tok'),
    erroCfi: (m: string, status: number) => Object.assign(new Error(m), { status }),
}));

import * as api from '../serproIntegrationService';
import { HOST_CFI_INTEGRACAO } from '../../plataforma/servicos';

const CNPJ = '11222333000181';
const pedidos: { url: string; corpo: Record<string, unknown> }[] = [];
afterEach(() => { pedidos.length = 0; vi.unstubAllGlobals(); });
function stub() {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        pedidos.push({ url, corpo: JSON.parse(String(init.body)) });
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }));
}

describe('consultas por CNPJ do governo levam a empresa do DP', () => {
    it.each([
        ['/fgts/recolhimento', () => api.consultarFgtsRecolhimento('emp-1', CNPJ, '2026-09'), { competencia: '2026-09' }],
        ['/fgts/crf', () => api.consultarCrfFgts('emp-1', CNPJ), {}],
        ['/esocial/status', () => api.consultarESocialFechamento('emp-1', CNPJ, '2026-09'), { competencia: '2026-09' }],
        ['/dctfweb/status', () => api.consultarDctfWebStatus('emp-1', CNPJ, '2026-09'), { competencia: '2026-09' }],
        ['/dctfweb/debitos', () => api.consultarDctfWebDebitos('emp-1', CNPJ, '2026-09'), { competencia: '2026-09' }],
        ['/empresa-completo', () => api.consultarEmpresaCompleto('emp-1', CNPJ, '2026-09'), { competencia: '2026-09' }],
    ] as const)('%s', async (rota, chamar, resto) => {
        stub();
        await chamar();
        expect(pedidos).toEqual([{ url: `${HOST_CFI_INTEGRACAO}/api/dp-integration${rota}`, corpo: { empresaId: 'emp-1', cnpj: CNPJ, ...resto } }]);
    });

    it('empresa-completo sem competência continua sem o campo (o servidor usa o mês corrente)', async () => {
        stub();
        await api.consultarEmpresaCompleto('emp-1', CNPJ);
        expect(pedidos[0].corpo).toEqual({ empresaId: 'emp-1', cnpj: CNPJ });
    });

    it('as rotas da carteira continuam levando a empresa (nada regrediu)', async () => {
        stub();
        await api.consultarInsumosDctfweb('emp-1', CNPJ, '2026-09');
        await api.situacaoDarfsNaReceita('emp-1', CNPJ);
        await api.consultarPagamentosReceita('emp-1', CNPJ, ['07202629300000011']);
        expect(pedidos.every(p => p.corpo.empresaId === 'emp-1' && p.corpo.cnpj === CNPJ)).toBe(true);
    });
});
