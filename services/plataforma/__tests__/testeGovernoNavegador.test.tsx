// @vitest-environment jsdom
// Teste do governo pela plataforma SÓ NESTE NAVEGADOR (services/plataforma/servicos.ts): precedência build > teste > CFI,
// só gestor/admin e só o usuário que ligou, leituras e produção restrita na plataforma, envio em produção, transmissão
// da DCTFWeb e DARF no CFI. Dados fictícios: CNPJ 11.222.333/0001-81.
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/tokenCfi', () => ({
    tokenParaCfi: async () => 'tok-teste',
    comTokenCfi: (f: (t: string) => Promise<unknown>) => f('tok-teste'),
    erroCfi: (m: string, status: number) => Object.assign(new Error(m), { status }),
}));

import {
    CHAVE_TESTE_GOVERNO, HOST_CFI, HOST_CFI_INTEGRACAO, PREFIXO_INTEGRACAO, configuracaoDoServico, definirSessaoDosServicos, desligarTesteGoverno,
    enderecoDoTeste, ligarTesteGoverno, lerTesteGoverno, rotaVaiAoTeste, testeGovernoAplicado, urlDoServico, type SessaoServicos,
} from '../servicos';
import { enviarLote, consultarLote } from '../../esocial/transmissao';
import {
    consultarDctfWebStatus, consultarDctfWebDebitos, consultarInsumosDctfweb, gerarDarfDctfweb, situacaoDarfsNaReceita, transmitirDctfweb,
} from '../../serpro/serproIntegrationService';
import ServicosExternosPanel from '../../../components/plataforma/ServicosExternosPanel';
import { FaixaTesteGoverno } from '../../../components/plataforma/TesteGovernoNavegador';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const PLATAFORMA = 'https://plataforma.exemplo.com.br';
const PAULO: SessaoServicos = { uid: 'uid-paulo', email: 'paulo@exemplo.com.br', papel: 'gestor' };
const JULIANA: SessaoServicos = { uid: 'uid-juliana', email: 'juliana@exemplo.com.br', papel: 'colaborador' };
const ATIVA = { id: 'emp-1', nome: 'EMPRESA TESTE LTDA', cnpj: '11.222.333/0001-81', codigoSage: '1', competencia: '2026-09', ativadaPor: 'u', ativadaEm: 0 };
const caminho = (r: string) => `${PREFIXO_INTEGRACAO}${r}`;

let pedidos: string[] = [];
beforeEach(() => {
    localStorage.clear();
    definirSessaoDosServicos(null);
    pedidos = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { pedidos.push(url); return new Response('{"ok":true}', { status: 200 }); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); definirSessaoDosServicos(null); });

const ligarComoPaulo = () => { definirSessaoDosServicos(PAULO); expect(ligarTesteGoverno(PLATAFORMA)).toMatchObject({ ok: true }); };

describe('precedência: build > teste no navegador > CFI', () => {
    it('sem teste, o CFI de sempre', () => {
        definirSessaoDosServicos(PAULO);
        expect(urlDoServico('governo', caminho('/dctfweb/status'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/dctfweb/status')}`);
    });
    it('com o teste ligado, a leitura vai à plataforma; o build vence o teste', () => {
        ligarComoPaulo();
        expect(urlDoServico('governo', caminho('/dctfweb/status'), {})).toBe(`${PLATAFORMA}${caminho('/dctfweb/status')}`);
        const proprio = { VITE_SERVICO_GOVERNO_URL: 'https://gov.exemplo.com.br' };
        expect(urlDoServico('governo', caminho('/dctfweb/status'), proprio)).toBe(`https://gov.exemplo.com.br${caminho('/dctfweb/status')}`);
        expect(testeGovernoAplicado(proprio)).toBeNull();
        const plataforma = { VITE_PLATAFORMA_URL: 'https://p.com.br' };
        expect(urlDoServico('governo', caminho('/dctfweb/status'), plataforma)).toBe(`https://p.com.br${caminho('/dctfweb/status')}`);
        // A configuração do build (tela, comparador) não muda com o teste.
        expect(configuracaoDoServico('governo', {})).toEqual({ servico: 'governo', origem: 'cfi', base: null, avisos: [] });
    });
    it('só o governo: os outros serviços seguem no CFI', () => {
        ligarComoPaulo();
        expect(urlDoServico('email', caminho('/email/enviar'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/email/enviar')}`);
        expect(urlDoServico('ia', caminho('/assistente/mia'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/assistente/mia')}`);
        expect(urlDoServico('cofre', '/api/admin/cadastro/certificados', {})).toBe(`${HOST_CFI}/api/admin/cadastro/certificados`);
    });
});

describe('quem: só gestor/admin, e só quem ligou', () => {
    it.each([['colaborador'], ['pendente'], [undefined]])('%s não liga', (papel) => {
        definirSessaoDosServicos({ ...JULIANA, papel });
        expect(ligarTesteGoverno(PLATAFORMA)).toEqual({ ok: false, aviso: 'Só gestor ou admin liga o teste.' });
        expect(localStorage.getItem(CHAVE_TESTE_GOVERNO)).toBeNull();
    });
    it('colaborador com teste guardado no navegador (de outro papel, ou rebaixado) não aplica', () => {
        ligarComoPaulo();
        definirSessaoDosServicos({ ...PAULO, papel: 'colaborador' });
        expect(urlDoServico('governo', caminho('/dctfweb/status'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/dctfweb/status')}`);
    });
    it('outro usuário no mesmo navegador não aplica, mesmo sendo gestor', () => {
        ligarComoPaulo();
        definirSessaoDosServicos({ uid: 'uid-outro', email: 'outro@exemplo.com.br', papel: 'gestor' });
        expect(testeGovernoAplicado({})).toBeNull();
        definirSessaoDosServicos(JULIANA);
        expect(urlDoServico('governo', caminho('/esocial/envio/consulta'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/esocial/envio/consulta')}`);
        // Mesmo uid com outro e-mail também não.
        definirSessaoDosServicos({ ...PAULO, email: 'outro@exemplo.com.br' });
        expect(testeGovernoAplicado({})).toBeNull();
        // Sem ninguém logado, também não.
        definirSessaoDosServicos(null);
        expect(testeGovernoAplicado({})).toBeNull();
        // Paulo volta: aplica de novo.
        definirSessaoDosServicos({ ...PAULO, email: 'Paulo@Exemplo.com.br' });
        expect(testeGovernoAplicado({})).toBe(PLATAFORMA);
    });
});

describe('o que vai e o que não vai à plataforma no teste', () => {
    const base = { empresaId: 'emp-1', cnpj: '11222333000181', certificado: 'escritorio' as const };
    it('envio de lote: produção (tpAmb 1) no CFI; produção restrita (tpAmb 2) na plataforma', async () => {
        ligarComoPaulo();
        await enviarLote({ ...base, eventos: ['<eSocial/>'], tpAmb: 1, confirmoProducao: true });
        await enviarLote({ ...base, eventos: ['<eSocial/>'], tpAmb: 2 });
        expect(pedidos).toEqual([`${HOST_CFI_INTEGRACAO}${caminho('/esocial/envio/lote')}`, `${PLATAFORMA}${caminho('/esocial/envio/lote')}`]);
        // tpAmb ausente ou em texto: no CFI (na dúvida, produção).
        expect(rotaVaiAoTeste(caminho('/esocial/envio/lote'), {})).toBe(false);
        expect(rotaVaiAoTeste(caminho('/esocial/envio/lote'), { tpAmb: '2' })).toBe(false);
        expect(rotaVaiAoTeste(caminho('/esocial/envio/lote'))).toBe(false);
    });
    it('transmissão da DCTFWeb, DARF e insumos ficam no CFI', async () => {
        ligarComoPaulo();
        await transmitirDctfweb('emp-1', base.cnpj, '2026-09');
        await gerarDarfDctfweb('emp-1', base.cnpj, '2026-09', false);
        await consultarInsumosDctfweb('emp-1', base.cnpj, '2026-09');
        expect(pedidos).toEqual(['/dctfweb/transmitir', '/dctfweb/darf', '/dctfweb/insumos'].map(r => `${HOST_CFI_INTEGRACAO}${caminho(r)}`));
    });
    it('leituras vão à plataforma: consulta do lote, DCTFWeb situação e débitos, situação dos DARF', async () => {
        ligarComoPaulo();
        await consultarLote({ ...base, protocolo: '1.2.3', tpAmb: 1 });
        await consultarDctfWebStatus('emp-1', base.cnpj, '2026-09');
        await consultarDctfWebDebitos('emp-1', base.cnpj, '2026-09');
        await situacaoDarfsNaReceita('emp-1', base.cnpj);
        expect(pedidos).toEqual(['/esocial/envio/consulta', '/dctfweb/status', '/dctfweb/debitos', '/pagamentos/situacao-darf'].map(r => `${PLATAFORMA}${caminho(r)}`));
        for (const r of ['/esocial/download/identificadores', '/esocial/download/eventos', '/esocial/status', '/fgts/recolhimento', '/fgts/crf', '/empresa-completo', '/pagamentos/consultar', '/pagamentos/comprovante']) {
            expect(urlDoServico('governo', caminho(r), {})).toBe(`${PLATAFORMA}${caminho(r)}`);
        }
        // Rota do governo fora da lista fica no CFI.
        expect(urlDoServico('governo', caminho('/esocial/rota-nova'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/esocial/rota-nova')}`);
    });
    it('desligar volta tudo ao CFI', async () => {
        ligarComoPaulo();
        desligarTesteGoverno();
        expect(lerTesteGoverno()).toBeNull();
        await enviarLote({ ...base, eventos: ['<eSocial/>'], tpAmb: 2 });
        await consultarDctfWebStatus('emp-1', base.cnpj, '2026-09');
        expect(pedidos.every(u => u.startsWith(HOST_CFI_INTEGRACAO))).toBe(true);
    });
});

describe('endereço', () => {
    it.each([
        ['http://plataforma.exemplo.com.br', 'não é https'],
        ['plataforma.exemplo.com.br', 'não é um endereço'],
        ['https://x.com.br/?a=1', 'parâmetros'],
        ['', 'Informe'],
        [HOST_CFI_INTEGRACAO, 'próprio CFI'],
        [`${HOST_CFI}/`, 'próprio CFI'],
        ['https://tag---consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app', 'próprio CFI'],
    ])('%s é recusado', (v, motivo) => {
        definirSessaoDosServicos(PAULO);
        expect(enderecoDoTeste(v).url).toBeNull();
        const r = ligarTesteGoverno(v);
        expect(r.ok).toBe(false);
        expect('aviso' in r ? r.aviso : '').toContain(motivo);
        expect(localStorage.getItem(CHAVE_TESTE_GOVERNO)).toBeNull();
    });
    it('guardado adulterado (host do CFI, http, lixo) conta como desligado', () => {
        definirSessaoDosServicos(PAULO);
        for (const url of [HOST_CFI_INTEGRACAO, 'http://p.com.br', 'javascript:alert(1)']) {
            localStorage.setItem(CHAVE_TESTE_GOVERNO, JSON.stringify({ url, uid: PAULO.uid, email: PAULO.email }));
            expect(testeGovernoAplicado({})).toBeNull();
        }
        localStorage.setItem(CHAVE_TESTE_GOVERNO, '{lixo');
        expect(urlDoServico('governo', caminho('/dctfweb/status'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/dctfweb/status')}`);
    });
    it('armazenamento bloqueado: não liga e tudo segue no CFI, sem erro', () => {
        definirSessaoDosServicos(PAULO);
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
        expect(ligarTesteGoverno(PLATAFORMA)).toMatchObject({ ok: false });
        expect(urlDoServico('governo', caminho('/dctfweb/status'), {})).toBe(`${HOST_CFI_INTEGRACAO}${caminho('/dctfweb/status')}`);
        expect(() => desligarTesteGoverno()).not.toThrow();
    });
});

describe('na tela', () => {
    const tela = (papel?: string) => render(
        <EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><FaixaTesteGoverno /><ServicosExternosPanel papel={papel} /></EmpresaAtivaProvider>,
    );
    it.each([['colaborador'], ['pendente'], [undefined]])('bloco escondido para %s', (papel) => {
        definirSessaoDosServicos({ ...JULIANA, papel });
        tela(papel);
        expect(screen.queryByText('Testar o governo pela plataforma neste navegador')).toBeNull();
    });
    it('gestor: pré-preenche com o endereço do comparador, liga (faixa no topo) e desliga', () => {
        definirSessaoDosServicos(PAULO);
        tela('gestor');
        expect(screen.getByText('Testar o governo pela plataforma neste navegador')).toBeTruthy();
        expect(screen.getByText(/envio de lote do eSocial em produção restrita/)).toBeTruthy();
        expect(screen.getByText(/envio de lote do eSocial em produção$/)).toBeTruthy();
        expect(screen.getByText('transmissão da DCTFWeb')).toBeTruthy();
        expect(screen.getByText('emissão de DARF da DCTFWeb')).toBeTruthy();
        const campo = screen.getByLabelText('Endereço da plataforma para o teste') as HTMLInputElement;
        expect(campo.value).toBe('');
        fireEvent.change(screen.getByLabelText('Endereço da plataforma'), { target: { value: `${PLATAFORMA}/` } });
        expect(campo.value).toBe(PLATAFORMA);
        expect(screen.queryByRole('status', { name: 'Teste do governo pela plataforma' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Ligar' }));
        const faixa = screen.getByRole('status', { name: 'Teste do governo pela plataforma' });
        expect(faixa.textContent).toContain('Governo pela plataforma neste navegador — teste');
        expect(screen.getByText(/Neste navegador \(teste\)/)).toBeTruthy();
        expect(lerTesteGoverno()).toMatchObject({ url: PLATAFORMA, uid: PAULO.uid, email: PAULO.email });
        // Outro usuário entra no mesmo navegador: a faixa some (o teste não vale para ele).
        act(() => definirSessaoDosServicos(JULIANA));
        expect(screen.queryByRole('status', { name: 'Teste do governo pela plataforma' })).toBeNull();
        act(() => definirSessaoDosServicos(PAULO));
        const desligar = screen.getAllByRole('button', { name: 'Desligar' });
        expect(desligar).toHaveLength(2);
        fireEvent.click(desligar[0]);
        expect(screen.queryByRole('status', { name: 'Teste do governo pela plataforma' })).toBeNull();
        expect(lerTesteGoverno()).toBeNull();
    });
    it('endereço do CFI no campo: Ligar desabilitado', () => {
        definirSessaoDosServicos(PAULO);
        tela('admin');
        fireEvent.change(screen.getByLabelText('Endereço da plataforma para o teste'), { target: { value: HOST_CFI_INTEGRACAO } });
        expect(screen.getByText('Este é o endereço do próprio CFI.')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Ligar' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
