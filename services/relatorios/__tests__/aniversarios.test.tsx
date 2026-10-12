// @vitest-environment jsdom
// Mensagem de aniversário: o texto, os aniversariantes do mês, o holerite do mês e o envio do cartão (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { aniversariantesDoMes, aniversarioNoHolerite, arquivoCartao, fazAniversarioNoMes, MENSAGEM_ANIVERSARIO_PADRAO, mensagemAniversario } from '../aniversarios';
import { cartaoAniversarioPdf, mensagensDoHolerite } from '../holeritePdf';

const ficha = (id: string, nome: string, nascimento: string, extra: Partial<FichaFuncionario['dados']> = {}, situacao: FichaFuncionario['situacao'] = 'ativo'): FichaFuncionario =>
    ({ ...fichaVazia({ id: 'E1', cnpj: '11222333000181' }), id, cpf: '52998224725', matriculaEsocial: `M${id}`, situacao, dados: { nome, nascimento, ...extra } });

describe('texto e aniversariantes', () => {
    it('padrão com o primeiro nome e a empresa; texto próprio; vazio desliga', () => {
        expect(mensagemAniversario(undefined, 'MARIA DA SILVA', 'ALFA LTDA')).toBe('Feliz aniversário, Maria! A ALFA LTDA deseja a você um novo ano de muita saúde, alegria e conquistas.');
        expect(mensagemAniversario('Parabéns, {nome}! Um abraço da {empresa}.', 'joão', 'BETA')).toBe('Parabéns, João! Um abraço da BETA.');
        expect(mensagemAniversario('', 'MARIA', 'ALFA')).toBe('');
        expect(mensagemAniversario(MENSAGEM_ANIVERSARIO_PADRAO, '', 'ALFA')).toMatch(/^Feliz aniversário! A ALFA/);
    });

    it('aniversariantes do mês: ativos, pelo dia; contatos da ficha', () => {
        const fs = [
            ficha('1', 'BRUNO', '1990-09-20', { email: 'b@x.com' }), ficha('2', 'ANA', '1985-09-03', { telefone: '(11) 98888-7777' }),
            ficha('3', 'CAIO', '1980-10-03'), ficha('4', 'DORA', '1991-09-10', { dataDesligamento: '2026-09-05' }), ficha('5', 'EVA', 'x'),
        ];
        const a = aniversariantesDoMes(fs, '2026-09');
        expect(a.map(x => [x.dia, x.nome, x.email, x.whatsapp])).toEqual([['03', 'ANA', null, '5511988887777'], ['20', 'BRUNO', 'b@x.com', null]]);
        expect(fazAniversarioNoMes(fs[2], '2026-10')).toBe(true);
        expect(arquivoCartao(fs[0], '2026-09')).toBe('aniversario-2026-09-M1.pdf');
    });

    it('holerite: a mensagem só no mês do aniversário, antes das demais', () => {
        const f = ficha('1', 'BRUNO SOUZA', '1990-09-20', { mensagemHolerite1: 'Lembrete do RH' });
        expect(aniversarioNoHolerite(f, '2026-08', undefined, 'ALFA')).toBe('');
        const msg = aniversarioNoHolerite(f, '2026-09', undefined, 'ALFA');
        expect(mensagensDoHolerite(f, 'Mensagem geral', msg)).toEqual([msg, 'Mensagem geral', 'Lembrete do RH']);
        expect(aniversarioNoHolerite(f, '2026-09', '', 'ALFA')).toBe('');
    });

    it('cartão em PDF', () => {
        const doc = cartaoAniversarioPdf('BRUNO SOUZA', 'Feliz aniversário, Bruno!', { empresa: { razaoSocial: 'ALFA LTDA', cnpj: '11222333000181' }, titulo: 'x', previa: true });
        expect(doc.getNumberOfPages()).toBe(1);
        expect(Array.from(new Uint8Array(doc.output('arraybuffer')).slice(0, 4))).toEqual([37, 80, 68, 70]); // %PDF
    });
});

const srv = vi.hoisted(() => ({ emails: [] as { para: string; assunto: string; anexos: { nome: string }[] }[] }));
vi.mock('../../pacoteCliente/spConnect', async (orig) => ({
    ...(await orig<typeof import('../../pacoteCliente/spConnect')>()),
    enviarEmailPeloEscritorio: async (e: { para: string; assunto: string; anexos: { nome: string }[] }) => { srv.emails.push(e); return {}; },
    templatesDoDp: async () => [],
}));
import AniversariantesEnvio from '../../../components/relatorios/AniversariantesEnvio';
afterEach(() => { cleanup(); srv.emails.length = 0; vi.restoreAllMocks(); });

describe('tela do cartão', () => {
    const fs = [ficha('1', 'BRUNO SOUZA', '1990-09-20', { email: 'b@x.com' }), ficha('2', 'ANA', '1985-09-03', { telefone: '11988887777' }), ficha('3', 'CAIO', '1985-09-28')];
    it('lista, baixa o cartão e envia por e-mail a quem tem e-mail', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const gerar = vi.fn(async () => new Uint8Array([1])); const baixar = vi.fn();
        render(<AniversariantesEnvio empresa={{ id: 'E1', cnpj: '11222333000181', nome: 'ALFA' }} competencia="2026-09" fichas={fs} gerarCartao={gerar} baixar={baixar} />);
        expect(screen.getByText(/3 aniversariante\(s\) no mês/)).toBeTruthy();
        expect(screen.getByText(/sem e-mail nem celular na ficha/)).toBeTruthy();
        fireEvent.click(screen.getAllByText('Cartão (PDF)')[1]);
        await waitFor(() => expect(baixar).toHaveBeenCalledWith('aniversario-2026-09-M1.pdf', expect.any(Uint8Array)));
        expect(gerar).toHaveBeenCalledWith('BRUNO SOUZA', 'Feliz aniversário, Bruno! A ALFA deseja a você um novo ano de muita saúde, alegria e conquistas.');
        fireEvent.click(screen.getByText('Enviar 1 por e-mail'));
        await waitFor(() => expect(srv.emails).toHaveLength(1));
        expect(srv.emails[0]).toMatchObject({ para: 'b@x.com', assunto: 'Feliz aniversário, Bruno! · ALFA', anexos: [{ nome: 'aniversario-2026-09-M1.pdf' }] });
        fireEvent.click(screen.getByText('Enviar pelo WhatsApp…'));
        expect((await screen.findByRole('alert')).textContent).toMatch(/Nenhum modelo do Departamento Pessoal com documento/);
    });

    it('mensagem desligada na empresa: avisa e não envia', () => {
        render(<AniversariantesEnvio empresa={{ id: 'E1', cnpj: '11222333000181', nome: 'ALFA' }} competencia="2026-09" fichas={fs} mensagem="" gerarCartao={vi.fn()} baixar={vi.fn()} />);
        expect(screen.getByText(/A mensagem de aniversário está desligada nesta empresa/)).toBeTruthy();
        expect(screen.queryByText(/por e-mail/)).toBeNull();
    });
});
