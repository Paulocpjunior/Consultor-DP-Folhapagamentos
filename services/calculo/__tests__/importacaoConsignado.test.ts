// Crédito do Trabalhador, etapa 3: leitura do arquivo de empréstimos do Portal Emprega Brasil (CSV, XLSX e JSON), sugestão
// das colunas, prévia por ficha e aplicação nos contratos sem mexer nos meses anteriores (dados fictícios).
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { aplicarImportacao, centavos, competenciaDoArquivo, dataDoArquivo, lerArquivoEmprestimos, previaImportacao, sugerirColunas } from '../importacaoConsignado';
import { validarContratos, type ContratoConsignado } from '../consignado';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const C = (instFinanc: string, nrDoc: string, parcela: number, extra: Partial<ContratoConsignado> = {}): ContratoConsignado => ({ instFinanc, nrDoc, parcela, inicio: '2026-03', ...extra });
const ficha = (id: string, cpf: string, nome: string, consignados: ContratoConsignado[] = [], dados: FichaFuncionario['dados'] = {}, matricula = `M${id}`): FichaFuncionario =>
    ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf, matriculaEsocial: matricula, situacao: 'ativo', dados: { nome, admissao: '2024-01-02', ...dados }, consignados });

describe('leitura do arquivo', () => {
    it('CSV com ponto e vírgula, BOM e aspas; colunas sugeridas pelo nome (ifConcessora.nome não vira o nome do trabalhador)', () => {
        const a = lerArquivoEmprestimos('emprestimos.csv', buf('﻿competencia;cpf;matricula;ifConcessora.codigo;ifConcessora.nome;contrato;valorParcela\r\n2026-10;"012.345.678-90";M1;341;"BANCO X; S.A.";CT-1;"1.234,56"\r\n'));
        expect(a.colunas).toEqual(['competencia', 'cpf', 'matricula', 'ifConcessora.codigo', 'ifConcessora.nome', 'contrato', 'valorParcela']);
        expect(a.linhas[0]).toMatchObject({ cpf: '012.345.678-90', 'ifConcessora.nome': 'BANCO X; S.A.', valorParcela: '1.234,56' });
        expect(sugerirColunas(a.colunas)).toEqual({ cpf: 'cpf', instFinanc: 'ifConcessora.codigo', nrDoc: 'contrato', parcela: 'valorParcela', competencia: 'competencia', matricula: 'matricula' });
    });

    it('JSON aninhado (lista dentro de um objeto) vira linhas planas', () => {
        const a = lerArquivoEmprestimos('emprestimos.json', buf(JSON.stringify({ emprestimos: [{ cpf: '01234567890', ifConcessora: { codigo: 341, nome: 'X' }, contrato: 'CT-1', valorParcela: 1234.56, competencia: '202610' }] })));
        expect(a.linhas[0]).toEqual({ cpf: '01234567890', 'ifConcessora.codigo': '341', 'ifConcessora.nome': 'X', contrato: 'CT-1', valorParcela: '1234.56', competencia: '202610' });
        expect(() => lerArquivoEmprestimos('x.json', buf('{"a":1}'))).toThrow(/lista de empréstimos/);
        expect(() => lerArquivoEmprestimos('x.json', buf('{quebrado'))).toThrow(/JSON inválido/);
    });

    it('XLSX: CPF com zero à esquerda segue como texto', () => {
        const ws = XLSX.utils.aoa_to_sheet([['CPF', 'Contrato', 'Valor Parcela', 'Código IF'], ['01234567890', 'CT-1', '700,00', '001']]);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'P');
        const a = lerArquivoEmprestimos('e.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
        expect(a.linhas[0]).toMatchObject({ CPF: '01234567890', 'Código IF': '001' });
        expect(sugerirColunas(a.colunas)).toMatchObject({ cpf: 'CPF', nrDoc: 'Contrato', parcela: 'Valor Parcela', instFinanc: 'Código IF' });
    });

    it('valores e competências', () => {
        expect(['1.234,56', '1234,56', '1234.56', '1,234.56', '1234', '1.234', 'R$ 700,00', 'abc', ''].map(centavos)).toEqual([123456, 123456, 123456, 123456, 123400, 123400, 70000, null, null]);
        expect(['2026-10', '202610', '10/2026', '1/2026', '2026/10', '2026-10-01', '2026-13', 'out/26'].map(competenciaDoArquivo)).toEqual(['2026-10', '2026-10', '2026-10', '2026-01', '2026-10', '2026-10', null, null]);
    });
});

describe('prévia e aplicação', () => {
    const fichas = [
        ficha('a', '11144477735', 'ANA', [C('341', 'A1', 40000)]),
        ficha('b', '22255588846', 'BRUNO', [C('341', 'B1', 30000, { garantiaRescisao: 10, saldoRescisao: 500000, consultaRescisao: '2026-09-30', fim: '2027-06' })]),
        ficha('c', '33366699957', 'CARLA'),
        ficha('d', '44477700083', 'DIEGO', [C('104', 'D1', 20000), C('001', 'D2', 15000, { inicio: '2026-10' })]),
        ficha('e', '55588811194', 'ELIS', [C('341', 'E1', 10000)], { dataDesligamento: '2026-08-31' }),
        ficha('f1', '66699922203', 'FABIO (contrato 1)', [], {}, 'X1'),
        ficha('f2', '66699922203', 'FABIO (contrato 2)', [], {}, 'X2'),
        ficha('g', '77700033340', 'GIL', [C('033', 'G1', 9000, { inicio: '2026-01', fim: '2026-05' })]),
    ];
    const csv = ['cpf;matricula;cnpj;ifConcessora.codigo;contrato;valorParcela;competencia',
        '11144477735;;29463877000109;341;A1;400,00;2026-10', // igual
        '22255588846;;29463877000280;341;B1;350,00;10/2026', // parcela nova; CNPJ de filial (mesma raiz)
        '33366699957;;;1;C1;250,00;2026-10', // novo (instituição 001)
        '66699922203;X2;;237;F1;100,00;2026-10', // duplo vínculo resolvido pela matrícula
        '77700033340;;;033;G1;90,00;2026-10', // contrato encerrado que volta
        '12345678909;;;341;Z1;100,00;2026-10', // CPF sem ficha
        '11144477735;;;341;A9;100,00;2026-09', // outra competência
        '11144477735;;;3410;A8;100,00;2026-10', // instituição inválida
        '11144477735;;;341;A;100,00;2026-10', // contrato fora do padrão
        '11144477735;;11222333000181;341;A7;100,00;2026-10', // outro empregador
        '33366699957;;;001;C1;260,00;2026-10', // repetido com outra parcela
        '66699922203;;;237;F2;100,00;2026-10', // dois vínculos ativos, sem matrícula
    ].join('\n');
    const arq = lerArquivoEmprestimos('e.csv', buf(csv));
    const p = previaImportacao(arq, sugerirColunas(arq.colunas), '2026-10', fichas, '29.463.877/0001-09');
    const acao = (nr: string) => p.acoes.find(a => a.nrDoc === nr)!;

    it('classifica cada contrato e lista as linhas recusadas', () => {
        expect(p.lidas).toBe(12);
        expect([acao('A1').tipo, acao('B1').tipo, acao('C1').tipo, acao('F1').tipo, acao('G1').tipo, acao('D1').tipo, acao('D2').tipo]).toEqual(['igual', 'parcela', 'novo', 'novo', 'reativado', 'ausente', 'ausente']);
        expect(acao('B1')).toMatchObject({ parcelaAntes: 30000, parcela: 35000 });
        expect(acao('C1')).toMatchObject({ instFinanc: '001', parcela: 25000 });
        expect(acao('F1').fichaId).toBe('f2');
        expect(acao('D1').descricao).toMatch(/termina em 09\/2026/);
        expect(acao('D2').descricao).toMatch(/sai da ficha/);
        expect(p.acoes.some(a => a.nrDoc === 'E1')).toBe(false); // desligada antes da competência
        expect(p.pendencias.map(x => [x.linha, x.motivo])).toEqual([
            [7, 'CPF sem ficha nesta empresa.'], [8, 'Linha da competência 09/2026, não de 10/2026.'],
            [9, expect.stringMatching(/3 dígitos/)], [10, expect.stringMatching(/padrão do eSocial/)], [11, 'CNPJ de outro empregador.'],
            [12, 'Contrato repetido no arquivo com outra parcela (linha 4).'], [13, expect.stringMatching(/Mais de um vínculo/)],
        ]);
        expect(p.acoes.map(a => a.tipo).slice(0, 3)).toEqual(['novo', 'novo', 'parcela']);
    });

    it('sem as colunas obrigatórias, só o aviso', () => {
        expect(previaImportacao(arq, { cpf: 'cpf' }, '2026-10', fichas, '').avisos[0]).toMatch(/Instituição .* Número do contrato, Valor da parcela/);
    });

    it('aplica sem mexer nos meses anteriores e mantém garantia e saldo do contrato', () => {
        const mudadas = aplicarImportacao(fichas, p.acoes, '2026-10');
        const de = (id: string) => mudadas.find(f => f.id === id)?.consignados;
        expect(mudadas.map(f => f.id).sort()).toEqual(['b', 'c', 'd', 'f2', 'g']);
        expect(de('b')).toEqual([
            C('341', 'B1', 30000, { garantiaRescisao: 10, saldoRescisao: 500000, consultaRescisao: '2026-09-30', fim: '2026-09' }),
            { instFinanc: '341', nrDoc: 'B1', parcela: 35000, inicio: '2026-10', fim: '2027-06', garantiaRescisao: 10, saldoRescisao: 500000, consultaRescisao: '2026-09-30' },
        ]);
        expect(de('c')).toEqual([{ instFinanc: '001', nrDoc: 'C1', parcela: 25000, inicio: '2026-10' }]);
        expect(de('d')).toEqual([C('104', 'D1', 20000, { fim: '2026-09' })]);
        expect(de('g')).toEqual([C('033', 'G1', 9000, { inicio: '2026-01', fim: '2026-05' }), { instFinanc: '033', nrDoc: 'G1', parcela: 9000, inicio: '2026-10' }]);
        for (const f of mudadas) expect(validarContratos(f.consignados ?? [])).toEqual([]);
        // Só o que foi marcado: sem a ação do Diego, a ficha dele não muda.
        expect(aplicarImportacao(fichas, p.acoes.filter(a => a.fichaId !== 'd'), '2026-10').some(f => f.id === 'd')).toBe(false);
    });

    it('arquivo de outra competência inteiro: aviso e nada a gravar (nem os contratos como fora do arquivo)', () => {
        const outro = lerArquivoEmprestimos('e.csv', buf('cpf;ifConcessora.codigo;contrato;valorParcela;competencia\n11144477735;341;A1;400,00;2026-09'));
        const q = previaImportacao(outro, sugerirColunas(outro.colunas), '2026-10', fichas, '');
        expect(q.avisos.join(' ')).toMatch(/não é da competência 10\/2026.*Nada a gravar/);
        expect(q.acoes).toEqual([]);
    });

    it('linha recusada de um CPF não faz os contratos dele saírem como fora do arquivo (Codex #277)', () => {
        const cab = 'cpf;ifConcessora.codigo;contrato;valorParcela;competencia\n';
        const q = previaImportacao(lerArquivoEmprestimos('e.csv', buf(`${cab}44477700083;104;D1;abc;2026-10\n11144477735;341;A1;400,00;2026-10`)), sugerirColunas(['cpf', 'ifConcessora.codigo', 'contrato', 'valorParcela', 'competencia']), '2026-10', fichas, '');
        expect(q.acoes.filter(a => a.fichaId === 'd')).toEqual([]);
        expect(q.acoes.find(a => a.nrDoc === 'B1')?.tipo).toBe('ausente'); // quem não teve linha recusada segue a regra
        expect(q.avisos.join(' ')).toMatch(/linha recusada não foram dados como fora do arquivo/);
        // CPF ilegível: a linha pode ser de qualquer um, nenhum contrato sai por ausência.
        const r = previaImportacao(lerArquivoEmprestimos('e.csv', buf(`${cab}123;104;D1;200,00;2026-10\n11144477735;341;A1;400,00;2026-10`)), sugerirColunas(['cpf', 'ifConcessora.codigo', 'contrato', 'valorParcela', 'competencia']), '2026-10', fichas, '');
        expect(r.acoes.some(a => a.tipo === 'ausente')).toBe(false);
        expect(r.avisos.join(' ')).toMatch(/CPF ilegível/);
    });

    it('leiaute 1.4: a data de admissão separa os vínculos do mesmo CPF; CNPJ alfanumérico pela raiz', () => {
        expect(['14/02/2020', '2020-02-14', '31/02/2020', '2020'].map(dataDoArquivo)).toEqual(['2020-02-14', '2020-02-14', null, null]);
        expect(sugerirColunas(['cpf', 'dataAdmissao']).admissao).toBe('dataAdmissao');
        const dois = [ficha('h1', '12345678909', 'HELENA (1)', [], { admissao: '2024-01-02' }), ficha('h2', '12345678909', 'HELENA (2)', [], { admissao: '2026-05-04' })];
        const cols = ['cpf', 'ifConcessora.codigo', 'contrato', 'valorParcela', 'competencia', 'cnpj', 'dataAdmissao'];
        const arq2 = lerArquivoEmprestimos('e.csv', buf(`${cols.join(';')}\n12345678909;341;H1;100,00;2026-10;"12ABC34501DE35";04/05/2026\n12345678909;341;H2;100,00;2026-10;"12ABC34501DE35";\n12345678909;341;H3;100,00;2026-10;"99XYZ34501DE35";04/05/2026\n12345678909;341;H4;100,00;2026-10;;99/99/2026`));
        const q = previaImportacao(arq2, sugerirColunas(cols), '2026-10', dois, '12.ABC.345/01DE-35');
        expect(q.acoes.map(a => [a.nrDoc, a.fichaId])).toEqual([['H1', 'h2']]);
        // Admissão ilegível é ignorada com aviso (a coluna é opcional): com dois vínculos, a linha fica sem ficha certa.
        expect(q.pendencias.map(x => x.motivo)).toEqual([expect.stringMatching(/matrícula ou da admissão/), 'CNPJ de outro empregador.', expect.stringMatching(/matrícula ou da admissão/)]);
        expect(q.avisos.join(' ')).toMatch(/1 linha\(s\) com a data de admissão ilegível/);
    });

    // Exemplos fictícios do guia oficial do MTE, versão 1.4 (servicos.mte.gov.br/empregador/manuais/leiauteArquivoEmprestimos1.4.html),
    // copiados como estão, inclusive o valor a mais depois de "competencia" no exemplo CSV.
    describe('guia oficial do leiaute 1.4 (exemplos do MTE)', () => {
        const CAB = 'ifConcessora.codigo;ifConcessora.descricao;contrato;cpf;matricula;inscricaoEmpregador.codigo;inscricaoEmpregador.descricao;numeroInscricaoEmpregador;nomeTrabalhador;nomeEmpregador;dataInicioContrato;dataFimContrato;competenciaInicioDesconto;competenciaFimDesconto;totalParcelas;valorParcela;valorEmprestimo;valorLiberado;qtdPagamentos;qtdEscrituracoes;categoriaTrabalhador.codigo;categoriaTrabalhador.descricao;competencia;inscricaoEstabelecimento.codigo;inscricaoEstabelecimento.descricao;numeroInscricaoEstabelecimento;dataAdmissao';
        const CSV = `${CAB}\n341;DTP BANCO 341;134173700000;99973734130;MATCEN737;1;CNPJ;42422253000101;Teste Homo_737341;Nome empregador;14/02/2025;;01/2025;12/2025;12;100;1000;990;;;101;Empregado - Geral, inclusive o empregado público da administração direta ou indireta contratado pela CLT;01/2025;02/2025;1;CNPJ;"42422253000101";14/02/2020\n`;
        const JSON_MTE = [{ 'ifConcessora.codigo': 999, 'ifConcessora.descricao': 'DTP BANCO 999', contrato: '199972600000123', cpf: '99972699935', matricula: 'MATCEN726',
            'inscricaoEmpregador.codigo': 1, 'inscricaoEmpregador.descricao': 'CNPJ', numeroInscricaoEmpregador: '42422253000101', nomeTrabalhador: 'Teste Homo_726999', nomeEmpregador: 'Nome Empregador',
            dataInicioContrato: '28/02/2025', dataFimContrato: '', competenciaInicioDesconto: '01/2025', competenciaFimDesconto: '03/2025', totalParcelas: 12, valorParcela: 100, valorEmprestimo: 1000,
            valorLiberado: 990, qtdPagamentos: null, qtdEscrituracoes: null, 'categoriaTrabalhador.codigo': 101, 'categoriaTrabalhador.descricao': 'Empregado - Geral', competencia: '01/2025',
            'inscricaoEstabelecimento.codigo': 1, 'inscricaoEstabelecimento.descricao': 'CNPJ', numeroInscricaoEstabelecimento: '42422253000101', dataAdmissao: '28/02/2020' }];
        const CNPJ_MTE = '42422253000101';
        const fichaMte = (id: string, cpf: string, matricula: string, admissao: string) =>
            ({ ...fichaVazia({ id: 'E1', cnpj: CNPJ_MTE }), id, cpf, matriculaEsocial: matricula, situacao: 'ativo', dados: { nome: id, admissao }, consignados: [] }) as FichaFuncionario;

        it('CSV: todas as colunas reconhecidas e o valor a mais depois da competência não desalinha a admissão', () => {
            const a = lerArquivoEmprestimos('emprestimos.csv', buf(CSV));
            expect(a.linhas[0]).toMatchObject({ competencia: '01/2025', 'inscricaoEstabelecimento.codigo': '1', numeroInscricaoEstabelecimento: '42422253000101', dataAdmissao: '14/02/2020' });
            const mapa = sugerirColunas(a.colunas);
            expect(mapa).toEqual({ cpf: 'cpf', matricula: 'matricula', admissao: 'dataAdmissao', instFinanc: 'ifConcessora.codigo', nrDoc: 'contrato', parcela: 'valorParcela',
                competencia: 'competencia', nome: 'nomeTrabalhador', cnpj: 'numeroInscricaoEmpregador' });
            const p = previaImportacao(a, mapa, '2025-01', [fichaMte('f1', '99973734130', 'MATCEN737', '2020-02-14')], CNPJ_MTE);
            expect(p.pendencias).toEqual([]);
            expect(p.acoes).toEqual([expect.objectContaining({ tipo: 'novo', instFinanc: '341', nrDoc: '134173700000', parcela: 10000 })]);
        });

        it('JSON com as chaves achatadas ("ifConcessora.codigo"), como no guia', () => {
            const a = lerArquivoEmprestimos('emprestimos.json', buf(JSON.stringify(JSON_MTE)));
            const p = previaImportacao(a, sugerirColunas(a.colunas), '2025-01', [fichaMte('f2', '99972699935', 'MATCEN726', '2020-02-28')], CNPJ_MTE);
            expect(p.pendencias).toEqual([]);
            expect(p.acoes).toEqual([expect.objectContaining({ tipo: 'novo', instFinanc: '999', nrDoc: '199972600000123', parcela: 10000 })]);
        });

        it('XLS: as mesmas colunas, sem o valor a mais', () => {
            const ws = XLSX.utils.aoa_to_sheet([CAB.split(';'), ['341', 'DTP BANCO 341', '134173700000', '99973734130', 'MATCEN737', '1', 'CNPJ', '42422253000101', 'Teste Homo_737341', '', '14/02/2025', '',
                '01/2025', '12/2025', '12', '100', '1000', '990', '', '', '101', 'Empregado - Geral', '01/2025', '1', 'CNPJ', '42422253000101', '14/02/2020']]);
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'P');
            const a = lerArquivoEmprestimos('e.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
            const p = previaImportacao(a, sugerirColunas(a.colunas), '2025-01', [fichaMte('f1', '99973734130', 'MATCEN737', '2020-02-14')], CNPJ_MTE);
            expect(p.pendencias).toEqual([]);
            expect(p.acoes.map(x => x.nrDoc)).toEqual(['134173700000']);
        });

        it('numeroInscricaoEmpregador pela raiz de 8 com zeros à esquerda, como o guia permite', () => {
            const a = lerArquivoEmprestimos('emprestimos.json', buf(JSON.stringify([{ ...JSON_MTE[0], numeroInscricaoEmpregador: '42422253' }])));
            expect(previaImportacao(a, sugerirColunas(a.colunas), '2025-01', [fichaMte('f2', '99972699935', 'MATCEN726', '2020-02-28')], CNPJ_MTE).pendencias).toEqual([]);
        });
    });

    it('validação: o mesmo contrato em períodos que não se sobrepõem é aceito; sobrepostos, não', () => {
        expect(validarContratos([C('341', 'X1', 100, { fim: '2026-09' }), C('341', 'X1', 200, { inicio: '2026-10' })])).toEqual([]);
        expect(validarContratos([C('341', 'X1', 100), C('341', 'X1', 200, { inicio: '2026-10' })]).join(' ')).toMatch(/repetido no mesmo período/);
    });
});
