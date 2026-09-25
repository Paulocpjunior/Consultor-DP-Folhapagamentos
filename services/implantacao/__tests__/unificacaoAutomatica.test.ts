// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { complementosDaUnificacao, eventoXmlPuro, lerDependentes, unificar, xmlsAdmissao, type FichaLida } from '../unificacao';
import { lerXml, consolidar, type Cadastro } from '../implantacao';

// Dados fictícios (CPF válido de teste, CNPJ fictício).
const cnpj = '11222333000181';
const base: Cadastro = {
    chave: '11222333|52998224725|000123', empregador: '11222333', cpf: '52998224725', matricula: '000123',
    dados: { nome: 'PESSOA TESTE', salario: '3000.00', admissao: '2026-09-16', dependentes: '[{"tpDep":"03","nmDep":"DEP TESTE","dtNascto":"2010-01-02","cpfDep":"11111111111","depIRRF":"S","depSF":"N"}]' },
    origens: { nome: 'S-2200 · 2026-09-16 · a.xml' }, pendencias: ['Cadastro provisório'], eventos: [], desligado: false,
};
const ficha = (extra: Partial<FichaLida['ficha']> = {}): FichaLida => ({
    nome: 'ficha.pdf', hash: 'a'.repeat(64), tamanho: 10,
    ficha: { cnpj, cpf: base.cpf, matricula: base.matricula, dados: { nome: 'PESSOA TESTE', mae: 'MAE TESTE', pis: '13054012041', salario: '2000.00' }, avisos: [], ...extra },
});

describe('unificação automática XML + PDF', () => {
    it('complementa campos ausentes, mantém o XML nas divergências e lista dependentes', () => {
        const r = unificar([base], [ficha()], cnpj);
        const f = r.funcionarios[0];
        expect(f.ficha?.nome).toBe('ficha.pdf');
        expect(f.dados.mae).toBe('MAE TESTE');
        expect(f.dados.pis).toBe('13054012041');
        expect(f.dados.salario).toBe('3000.00');
        expect(f.complementosPdf.sort()).toEqual(['mae', 'pis']);
        expect(f.divergencias).toEqual([{ campo: 'salario', rotulo: 'Salário fixo (decimal com ponto)', xml: '3000.00', pdf: '2000.00' }]);
        expect(f.origens.mae).toContain('ficha.pdf');
        expect(f.pendencias.some(p => p.includes('diverge'))).toBe(true);
        expect(f.dependentes).toEqual([{ tipo: '03', nome: 'DEP TESTE', nascimento: '2010-01-02', cpf: '11111111111', irrf: 'S', salarioFamilia: 'N' }]);
        expect(r.fichasSemVinculo).toEqual([]);
        const c = complementosDaUnificacao(r.funcionarios, '2026-09-25T00:00:00.000Z');
        expect(c.map(x => x.campo).sort()).toEqual(['mae', 'pis']);
        expect(c[0].fonte).toContain('a'.repeat(64));
        expect(c[0].justificativa).toContain('conferidos');
    });
    it('não une ficha de outra empresa, CPF ou matrícula e explica o motivo', () => {
        const r = unificar([base], [ficha({ cnpj: '11222333000262' }), ficha({ cpf: '11111111111' }), ficha({ matricula: '123' })], cnpj);
        expect(r.funcionarios[0].ficha).toBeUndefined();
        expect(r.funcionarios[0].dados.mae).toBeUndefined();
        expect(r.funcionarios[0].pendencias.some(p => p.includes('não localizada'))).toBe(true);
        expect(r.fichasSemVinculo.map(x => x.motivo)).toEqual([expect.stringContaining('CNPJ'), expect.stringContaining('CPF'), expect.stringContaining('Matrícula')]);
    });
    it('ignora segunda ficha para o mesmo vínculo e tolera dependentes malformados', () => {
        const r = unificar([base], [ficha(), { ...ficha(), nome: 'outra.pdf', hash: 'b'.repeat(64) }], cnpj);
        expect(r.avisos[0]).toContain('outra.pdf');
        expect(lerDependentes('{')).toEqual([]);
        expect(lerDependentes(undefined)).toEqual([]);
    });
});

const xmlEnvelope = `<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto><evento><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"><evtAdmissao Id="ID1112223330000002026091600000000001"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><trabalhador><cpfTrab>52998224725</cpfTrab><nmTrab>PESSOA TESTE</nmTrab><sexo>M</sexo><nascimento><dtNascto>1990-01-01</dtNascto></nascimento></trabalhador><vinculo><matricula>000123</matricula><infoRegimeTrab><infoCeletista><dtAdm>2026-09-16</dtAdm></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>AUXILIAR</nmCargo><CBOCargo>411005</CBOCargo><remuneracao><vrSalFx>2000.00</vrSalFx></remuneracao></infoContrato></vinculo></evtAdmissao><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>ABC</SignatureValue></Signature></eSocial></evento><recibo><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento Id="ID1112223330000002026091600000000001"><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><processamento><cdResposta>201</cdResposta></processamento><recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo></retornoEvento></eSocial></recibo></retornoEventoCompleto></eSocial>`;

describe('XML S-2200 puro para importação por XML', () => {
    it('extrai o evento com assinatura e sem o envelope de recibo', () => {
        const fonte = { nome: 'a.xml', xml: xmlEnvelope, hash: 'c'.repeat(64) };
        const puro = eventoXmlPuro(fonte, 'ID1112223330000002026091600000000001');
        expect(puro.startsWith('<?xml version="1.0" encoding="UTF-8"?><eSocial')).toBe(true);
        expect(puro).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"');
        expect(puro).toContain('<SignatureValue>ABC</SignatureValue>');
        expect(puro).not.toContain('retornoEventoCompleto');
        expect(puro).not.toContain('nrRecibo');
        expect(() => eventoXmlPuro(fonte, 'IDX')).toThrow('não localizado');
    });
    it('gera um arquivo por vínculo a partir dos eventos aceitos', () => {
        const fonte = { nome: 'a.xml', xml: xmlEnvelope, hash: 'c'.repeat(64) };
        const { eventos } = lerXml(fonte);
        const { cadastros } = consolidar(eventos, cnpj, '2026-09-30');
        const r = xmlsAdmissao(unificar(cadastros, [], cnpj).funcionarios, [fonte]);
        expect(r.arquivos).toHaveLength(1);
        expect(r.arquivos[0].nome).toBe('S-2200_52998224725_000123.xml');
        expect(r.arquivos[0].conteudo).toContain('<evtAdmissao');
        const semFonte = xmlsAdmissao(unificar(cadastros, [], cnpj).funcionarios, []);
        expect(semFonte.arquivos).toHaveLength(0);
        expect(semFonte.avisos[0]).toContain('não está no dossiê');
    });
});
