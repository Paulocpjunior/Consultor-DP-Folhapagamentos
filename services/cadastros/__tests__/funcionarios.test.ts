// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
    ABAS, ROTULO, aplicarEdicao, diffFicha, fichaVazia, idFuncionario, linhasPlanilha, mesclarComEsocial,
    normalizarFicha, validarFicha, type FichaFuncionario,
} from '../funcionarios';
import { cnpjValido, centavosDeTexto, pisValido } from '../documentos';
import { paraGravar, prepararImportacao } from '../importacaoEsocial';

// Dados fictícios: CPF e PIS de teste com dígitos válidos, CNPJ fictício.
const empresa = { id: 'emp1', cnpj: '11222333000181' };
const CPF = '52998224725';

const recibo = (id: string, n: string) => `<recibo><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento Id="${id}"><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><processamento><cdResposta>201</cdResposta></processamento><recibo><nrRecibo>${n}</nrRecibo></recibo></retornoEvento></eSocial></recibo>`;
const envelope = (evento: string, id: string, n: string) => `<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto><evento>${evento}</evento>${recibo(id, n)}</retornoEventoCompleto></eSocial>`;
const ID_ADM = 'ID1112223330000002026010500000000001';
const admissao = envelope(`<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"><evtAdmissao Id="${ID_ADM}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><trabalhador><cpfTrab>${CPF}</cpfTrab><nmTrab>PESSOA TESTE</nmTrab><sexo>F</sexo><racaCor>3</racaCor><estCiv>2</estCiv><grauInstr>07</grauInstr><nascimento><dtNascto>1990-01-01</dtNascto></nascimento><endereco><brasil><dscLograd>RUA TESTE</dscLograd><nrLograd>10</nrLograd><bairro>CENTRO</bairro><cep>01001000</cep><codMunic>3550308</codMunic><uf>SP</uf></brasil></endereco><dependente><tpDep>03</tpDep><nmDep>FILHO TESTE</nmDep><dtNascto>2015-05-05</dtNascto><depIRRF>S</depIRRF><depSF>S</depSF></dependente></trabalhador><vinculo><matricula>E-77</matricula><tpRegTrab>1</tpRegTrab><tpRegPrev>1</tpRegPrev><infoRegimeTrab><infoCeletista><dtAdm>2026-01-05</dtAdm><cnpjSindCategProf>11222333000181</cnpjSindCategProf></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>AUXILIAR</nmCargo><CBOCargo>411005</CBOCargo><codCateg>101</codCateg><remuneracao><vrSalFx>2000.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><duracao><tpContr>1</tpContr></duracao></infoContrato></vinculo></evtAdmissao></eSocial>`, ID_ADM, '1.1.0000000000000000001');
const ID_DES = 'ID1112223330000002026090100000000002';
const desligamento = envelope(`<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtDeslig/v_S_01_03_00"><evtDeslig Id="${ID_DES}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>${CPF}</cpfTrab><matricula>E-77</matricula></ideVinculo><infoDeslig><mtvDeslig>02</mtvDeslig><dtDeslig>2026-09-01</dtDeslig></infoDeslig></evtDeslig></eSocial>`, ID_DES, '1.1.0000000000000000002');

const fonte = (nome: string, xml: string) => ({ nome, xml, hash: nome.padEnd(64, '0') });

function fichaBase(): FichaFuncionario {
    return { ...fichaVazia(empresa), id: idFuncionario('emp1', CPF, 'E-77'), cpf: CPF, matriculaEsocial: 'E-77', dados: { nome: 'PESSOA', admissao: '2026-01-05', cargo: 'X', cbo: '411005', salario: '2000.00', categoria: '101', codigoIob: '000001' } };
}

describe('documentos', () => {
    it('CNPJ numérico e alfanumérico (exemplo da Receita), PIS e valores digitados', () => {
        expect(cnpjValido('11.222.333/0001-81')).toBe(true);
        expect(cnpjValido('11222333000182')).toBe(false);
        expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
        expect(cnpjValido('00000000000000')).toBe(false);
        expect(pisValido('130.54012.04-1')).toBe(true);
        expect(pisValido('13054012042')).toBe(false);
        expect(centavosDeTexto('R$ 1.518,00')).toBe(151800);
        expect(centavosDeTexto('1518.5')).toBe(151850);
        expect(centavosDeTexto('1.518')).toBe(151800);
        expect(centavosDeTexto('abc')).toBeNull();
    });
});

describe('ficha do funcionário', () => {
    it('todo campo da ficha está em exatamente uma aba', () => {
        const usados = ABAS.flatMap(a => a.campos);
        expect(new Set(usados).size).toBe(usados.length);
        expect(usados.sort()).toEqual(Object.keys(ROTULO).sort());
    });

    it('id determinístico por empresa, CPF e matrícula, sem barra', () => {
        expect(idFuncionario('emp1', CPF, 'A/1')).toBe(`emp1_${CPF}_A%2F1`);
    });

    it('normaliza e valida: erros bloqueiam, avisos não', () => {
        const f = normalizarFicha({ ...fichaBase(), cpf: '529.982.247-25', dados: { ...fichaBase().dados, salario: '2.500,50', cep: '01001-000', uf: 'sp', pis: '130.54012.04-1' } });
        expect(f.cpf).toBe(CPF);
        expect(f.dados).toMatchObject({ salario: '2500.50', cep: '01001000', uf: 'SP', pis: '13054012041' });
        expect(validarFicha(f)).toEqual({ erros: [], avisos: [] });

        const ruim = normalizarFicha({ ...fichaBase(), cpf: '123', matriculaEsocial: '', dados: { nascimento: '2020-02-30', email: 'x@', cbo: '12', sindicato: '11222333000182', admissao: '2026-01-05', fimContrato: '2025-12-31' }, dependentes: [{ tipo: '03', nome: '', nascimento: 'x', cpf: '1', irrf: '', salarioFamilia: '' }] });
        const v = validarFicha(ruim);
        expect(v.erros).toEqual(expect.arrayContaining([
            'CPF inválido.', 'Informe a matrícula do eSocial.', 'Informe o nome.', 'Nascimento: data inválida.', 'E-mail inválido.',
            'CBO deve ter 6 dígitos.', 'CNPJ do sindicato inválido.', 'Fim do contrato anterior à admissão.',
            'Dependente 1: informe o nome.', 'Dependente 1: nascimento inválido.', 'Dependente 1: CPF inválido.',
        ]));
        expect(v.avisos).toContain('Código no IOB em branco: o TXT de ponto usa esse código.');
    });

    it('avisa admissão antes dos 14 anos e desligado sem data', () => {
        const f = { ...fichaBase(), situacao: 'desligado' as const, dados: { ...fichaBase().dados, nascimento: '2015-06-10' } };
        expect(validarFicha(f).avisos).toEqual(['Desligado sem data de desligamento.', 'Admissão antes dos 14 anos de idade: conferir as datas.']);
    });

    it('diff para auditoria e origem "Manual" no que foi editado', () => {
        const antes = fichaBase();
        const depois = { ...antes, dados: { ...antes.dados, salario: '2100.00', banco: '341' }, dependentes: [{ tipo: '03', nome: 'F', nascimento: '2015-01-01', cpf: '', irrf: 'S', salarioFamilia: 'N' }] };
        expect(diffFicha(antes, depois)).toEqual([
            { campo: 'salario', de: '2000.00', para: '2100.00' },
            { campo: 'banco', de: '', para: '341' },
            { campo: 'dependentes', de: '', para: 'F (2015-01-01)' },
        ]);
        const editada = aplicarEdicao(antes, depois, 'ana@sp', '2026-10-04');
        expect(editada.origens.salario).toBe('Manual · ana@sp · 2026-10-04');
        expect(editada.origens.dependentes).toBe('Manual · ana@sp · 2026-10-04');
        expect(editada.origens.nome).toBeUndefined();
    });

    it('planilha: uma coluna por campo, salário como número e código do eSocial com rótulo', () => {
        const [l] = linhasPlanilha([{ ...fichaBase(), dados: { ...fichaBase().dados, sexo: 'F' } }]);
        expect(l.CPF).toBe(CPF);
        expect(l['Salário fixo']).toBe(2000);
        expect(l.Sexo).toBe('F - Feminino');
        expect(Object.keys(l)).toHaveLength(3 + Object.keys(ROTULO).length + 1);
    });
});

describe('importação do eSocial', () => {
    it('monta a ficha a partir do S-2200: dados, contrato, dependentes e origens', () => {
        const p = prepararImportacao([fonte('adm.xml', admissao)], empresa, '2026-10-04', []);
        expect(p.resultados).toHaveLength(1);
        const r = p.resultados[0];
        expect(r.novo).toBe(true);
        expect(r.ficha).toMatchObject({
            id: `emp1_${CPF}_E-77`, cpf: CPF, matriculaEsocial: 'E-77', situacao: 'ativo',
            dados: { nome: 'PESSOA TESTE', sexo: 'F', raca: '3', estadoCivil: '2', escolaridade: '07', cep: '01001000', admissao: '2026-01-05', cargo: 'AUXILIAR', cbo: '411005', categoria: '101', salario: '2000.00', unidadeSalario: '5', sindicato: '11222333000181' },
        });
        expect(r.ficha.dados).not.toHaveProperty('matriculaIob');
        expect(r.ficha.dependentes).toEqual([{ tipo: '03', nome: 'FILHO TESTE', nascimento: '2015-05-05', cpf: '', irrf: 'S', salarioFamilia: 'S' }]);
        expect(r.ficha.origens.nome).toMatch(/^eSocial: S-2200 · 2026-01-05 · adm\.xml/);
        expect(r.ficha.pendenciasImportacao.some(x => /Matrícula|Código IOB/.test(x))).toBe(false);
        expect(paraGravar(p)).toHaveLength(1);
    });

    it('S-2299 marca desligado com a data; reimportar igual não grava nada', () => {
        const p = prepararImportacao([fonte('adm.xml', admissao), fonte('des.xml', desligamento)], empresa, '2026-10-04', []);
        expect(p.resultados[0].ficha).toMatchObject({ situacao: 'desligado', dados: { dataDesligamento: '2026-09-01', motivoDesligamento: '02' }, origens: { motivoDesligamento: 'eSocial: S-2299' } });
        expect(p.resultados[0].ficha.dados.dataProjetadaAviso).toBeUndefined();
        const de_novo = prepararImportacao([fonte('adm.xml', admissao), fonte('des.xml', desligamento)], empresa, '2026-10-04', [p.resultados[0].ficha]);
        expect(de_novo.resultados[0].novo).toBe(false);
        expect(de_novo.resultados[0].alteracoes).toEqual([]);
        expect(paraGravar(de_novo)).toEqual([]);
    });

    it('corte antes do desligamento deixa ativo; empresa de outro CNPJ não importa', () => {
        const p = prepararImportacao([fonte('adm.xml', admissao), fonte('des.xml', desligamento)], empresa, '2026-08-31', []);
        expect(p.resultados[0].ficha.situacao).toBe('ativo');
        expect(p.avisos.some(a => a.includes('posterior à implantação'))).toBe(true);
        const outra = prepararImportacao([fonte('adm.xml', admissao)], { id: 'e2', cnpj: '99888777000100' }, '2026-10-04', []);
        expect(outra.resultados).toEqual([]);
        expect(outra.avisos[0]).toContain('empregador diferente');
    });

    it('reimportação preserva o que foi editado à mão e lista a divergência; campos só do app ficam intactos', () => {
        const [primeira] = prepararImportacao([fonte('adm.xml', admissao)], empresa, '2026-10-04', []).resultados;
        const editada = aplicarEdicao(primeira.ficha, { ...primeira.ficha, dados: { ...primeira.ficha.dados, salario: '2200.00', codigoIob: '000007' } }, 'ana', '2026-10-04');
        const xml2 = admissao.replace('<nmCargo>AUXILIAR</nmCargo>', '<nmCargo>ASSISTENTE</nmCargo>');
        const [r] = prepararImportacao([fonte('adm2.xml', xml2)], empresa, '2026-10-04', [editada]).resultados;
        expect(r.novo).toBe(false);
        expect(r.ficha.dados).toMatchObject({ salario: '2200.00', codigoIob: '000007', cargo: 'ASSISTENTE' });
        expect(r.alteracoes).toEqual([{ campo: 'cargo', de: 'AUXILIAR', para: 'ASSISTENTE' }]);
        expect(r.preservados).toEqual([{ campo: 'salario', manual: '2200.00', esocial: '2000.00' }]);
    });

    it('campo que saiu do eSocial é removido se veio do eSocial, e mantido se é manual', () => {
        const base = { ...fichaBase(), dados: { ...fichaBase().dados, telefone: '1199', email: 'a@b.com' }, origens: { telefone: 'eSocial: S-2200', email: 'Manual · ana · 2026-10-01' } };
        const importada = { ...fichaBase(), dados: { ...fichaBase().dados }, origens: {} };
        const r = mesclarComEsocial(base, importada);
        expect(r.ficha.dados.telefone).toBeUndefined();
        expect(r.ficha.dados.email).toBe('a@b.com');
        expect(r.preservados).toEqual([]);
    });

    it('desligado pela data do IOB e sem S-2299: o eSocial não reativa, e fica pendência', () => {
        const base = { ...fichaBase(), situacao: 'desligado' as const, dados: { ...fichaBase().dados, dataDesligamento: '2025-03-10' }, origens: { dataDesligamento: 'IOB: f1200.func', situacao: 'IOB: f1200.func' } };
        const importada = { ...fichaBase(), situacao: 'ativo' as const, dados: { ...fichaBase().dados }, origens: { situacao: 'eSocial' } };
        const r = mesclarComEsocial(base, importada);
        expect(r.ficha.situacao).toBe('desligado');
        expect(r.ficha.pendenciasImportacao.join(' ')).toMatch(/Desligado em 2025-03-10 .* sem S-2299/);        // A pendência nova conta como alteração (senão não seria gravada).
        expect(r.alteracoes).toEqual([{ campo: 'pendencias', de: '0', para: '1' }]);
        // Situação digitada à mão como ativa: não muda.
        const manual = mesclarComEsocial({ ...base, situacao: 'ativo', origens: { ...base.origens, situacao: 'Manual · ana · 2026-10-01' } }, importada);
        expect(manual.ficha.situacao).toBe('ativo');
        expect(manual.alteracoes).toEqual([]);
    });

    it('S-2299 com aviso indenizado traz o fim projetado', () => {
        const comAviso = desligamento.replace('<mtvDeslig>02</mtvDeslig><dtDeslig>2026-09-01</dtDeslig>', '<mtvDeslig>07</mtvDeslig><dtDeslig>2026-09-01</dtDeslig><dtProjFimAPI>2026-10-06</dtProjFimAPI>');
        const p = prepararImportacao([fonte('adm.xml', admissao), fonte('des.xml', comAviso)], empresa, '2026-10-04', []);
        expect(p.resultados[0].ficha.dados).toMatchObject({ motivoDesligamento: '07', dataProjetadaAviso: '2026-10-06' });
    });
});
