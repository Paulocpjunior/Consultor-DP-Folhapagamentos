// @vitest-environment jsdom
// Início da DCTFWeb e do FGTS Digital da empresa: validação, o sistema de cada competência, o diagnóstico e a tela.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { INICIO_FGTS_DIGITAL, inicioFgtsDigital, sistemaDaCompetencia, validarInicios } from '../inicioObrigacoes';
import { diagnosticarCadastro } from '../../esocial/diagnosticoCadastro';

describe('início das obrigações', () => {
    it('validação: formato, FGTS Digital não antes de 03/2024, aviso sem a DCTFWeb', () => {
        expect(validarInicios({ inicioDctfweb: '2019-01', inicioFgtsDigital: '2024-03' })).toEqual({ erros: [], avisos: [] });
        expect(validarInicios({ inicioDctfweb: '2019-13' }).erros.join(' ')).toMatch(/AAAA-MM/);
        expect(validarInicios({ inicioDctfweb: '2019-01', inicioFgtsDigital: '2023-12' }).erros.join(' ')).toMatch(/começou na competência 03\/2024/);
        expect(validarInicios({ inicioDctfweb: '2019-01', inicioFgtsDigital: '2025-02' }).avisos.join(' ')).toMatch(/Confira/);
        expect(validarInicios({}).avisos.join(' ')).toMatch(/Sem o início da DCTFWeb/);
        expect([INICIO_FGTS_DIGITAL, inicioFgtsDigital(undefined), inicioFgtsDigital({ inicioFgtsDigital: '2025-01' })]).toEqual(['2024-03', '2024-03', '2025-01']);
    });
    it('sistema da competência: GFIP/SEFIP antes, DCTFWeb/FGTS Digital depois; sem a DCTFWeb, indefinido', () => {
        const p = { inicioDctfweb: '2021-10' };
        expect(sistemaDaCompetencia(p, '2021-09')).toMatchObject({ previdencia: 'gfip', fgts: 'sefip' });
        const antiga = sistemaDaCompetencia(p, '2021-09').avisos.join(' ');
        expect(antiga).toMatch(/09\/2021 anterior à DCTFWeb da empresa \(desde 10\/2021\).*GFIP e da GPS/);
        expect(antiga).toMatch(/anterior ao FGTS Digital \(desde 03\/2024\).*SEFIP e da GRF/);
        expect(sistemaDaCompetencia(p, '2024-03')).toEqual({ previdencia: 'dctfweb', fgts: 'fgts-digital', avisos: [] });
        expect(sistemaDaCompetencia(undefined, '2024-02')).toMatchObject({ previdencia: 'indefinido', fgts: 'sefip' });
    });
    it('diagnóstico do cadastro mostra o início em branco como aviso e o inválido como erro', () => {
        const base = { competencia: '2026-10', fichas: [], rubricas: [], horarios: [], afastamentos: [], enquadramentos: [] };
        const sem = diagnosticarCadastro({ ...base, empresa: { id: 'E1', cnpj: '44388152000189' } });
        expect(sem.itens.find(x => x.alvo === 'Início das obrigações')).toMatchObject({ nivel: 'aviso' });
        const ruim = diagnosticarCadastro({ ...base, empresa: { id: 'E1', cnpj: '44388152000189', inicios: { inicioDctfweb: '2019-01', inicioFgtsDigital: '2020-01' } } });
        expect(ruim.itens.find(x => x.alvo === 'Início das obrigações')).toMatchObject({ nivel: 'erro' });
    });
});

const srv = vi.hoisted(() => ({ gravado: null as unknown }));
vi.mock('../empresasService', () => ({ atualizarParametrosFolha: async (_id: string, mudar: (p: unknown) => unknown) => { srv.gravado = mudar({ arredondarLiquido: true }); return srv.gravado; } }));
import InicioObrigacoesEmpresa from '../../../components/cadastros/InicioObrigacoesEmpresa';
afterEach(() => { cleanup(); srv.gravado = null; });

describe('tela', () => {
    it('grava os dois inícios sem apagar os outros parâmetros; bloqueia o FGTS Digital antes de 03/2024', async () => {
        render(<InicioObrigacoesEmpresa empresa={{ id: 'E1', parametrosFolha: {} } as never} />);
        fireEvent.change(screen.getByLabelText('Início da DCTFWeb'), { target: { value: '2019-01' } });
        fireEvent.change(screen.getByLabelText('Início do FGTS Digital'), { target: { value: '2023-10' } });
        expect((screen.getByText('Gravar') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole('alert').textContent).toMatch(/03\/2024/);
        fireEvent.change(screen.getByLabelText('Início do FGTS Digital'), { target: { value: '2024-03' } });
        fireEvent.click(screen.getByText('Gravar'));
        await waitFor(() => expect(srv.gravado).toEqual({ arredondarLiquido: true, inicioDctfweb: '2019-01', inicioFgtsDigital: '2024-03' }));
        expect(screen.getByRole('status').textContent).toMatch(/gravado/);
    });
});
