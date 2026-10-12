// Transferência entre empresas do mesmo grupo: S-2299 (motivo 11) e S-2200 com sucessão (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio } from '../../cadastros/afastamentos';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { contratoPadrao, gerarS2200, validarS2200 } from '../../esocial/admissao';
import { afastamentosParaODestino, fichaNaOrigem, fichaNoDestino, gerarS2299Transferencia, ultimoDiaNaOrigem, validarTransferencia, type Transferencia } from '../transferencia';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const AGORA = new Date('2026-10-11T12:00:00Z');
const ORIGEM = { id: 'E1', cnpj: '44388152000189', nome: 'ALFA LTDA' };
const DESTINO = { id: 'E2', cnpj: '29463877000109', nome: 'BETA LTDA' };
const FICHA: FichaFuncionario = {
    ...fichaVazia(ORIGEM), id: idFuncionario('E1', '52998224725', 'A-10'), cpf: '52998224725', matriculaEsocial: 'A-10',
    dados: { nome: 'ANA TESTE', nascimento: '1990-01-01', sexo: 'F', raca: '1', estadoCivil: '2', escolaridade: '07', nacionalidade: '105', paisNascimento: '105',
        logradouro: 'RUA A', numero: '10', bairro: 'CENTRO', cep: '01001000', municipio: '3550308', uf: 'SP', telefone: '11999998888', email: 'ana@exemplo.com',
        admissao: '2020-03-02', categoria: '101', cargo: 'AUXILIAR', cbo: '411005', salario: '2500.00', unidadeSalario: '5', horasSemanais: '44', tipoContrato: '1',
        sindicato: '11222333000181', estabelecimento: '44388152000189', regimeTrabalhista: '1', regimePrevidenciario: '1', jornada: 'Seg a sex 8h às 17h', horario: 'H1', lotacao: 'LOT1', codigoIob: '7' },
    dependentes: [{ tipo: '03', nome: 'FILHO TESTE', nascimento: '2015-05-05', cpf: '39053344705', irrf: 'S', salarioFamilia: 'S' }],
    historicoSalario: [{ desde: '2020-03-02', salario: '2000.00', origem: 'eSocial' }, { desde: '2024-01-01', salario: '2500.00', origem: 'eSocial' }],
};
const T: Transferencia = { ficha: FICHA, origem: ORIGEM, destino: DESTINO, data: '2026-11-01', matricula: 'B-77', estabelecimento: '29463877000109' };

describe('transferência entre empresas do grupo', () => {
    it('S-2299 da origem: motivo 11, véspera, sucessaoVinc e sem verbas; passa no XSD', async () => {
        const g = gerarS2299Transferencia({ cnpj: ORIGEM.cnpj, tpAmb: 2, t: T, agora: AGORA });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<mtvDeslig>11</mtvDeslig><dtDeslig>2026-10-31</dtDeslig><indPagtoAPI>N</indPagtoAPI><pensAlim>0</pensAlim>');
        expect(g.evento!.xml).toContain(`<sucessaoVinc><tpInsc>1</tpInsc><nrInsc>${DESTINO.cnpj}</nrInsc></sucessaoVinc>`);
        expect(g.evento!.xml).not.toContain('verbasResc');
        expect(ultimoDiaNaOrigem('2026-03-01')).toBe('2026-02-28');
    });

    it('S-2200 do destino: admissão original, tpAdmissao 2 e sucessaoVinc; passa no XSD', async () => {
        const nova = fichaNoDestino(T);
        const g = gerarS2200({ cnpj: DESTINO.cnpj, tpAmb: 2, ficha: nova, contrato: contratoPadrao(nova), sucessao: { cnpjAnterior: ORIGEM.cnpj, matriculaAnterior: 'A-10', dtTransf: T.data }, agora: AGORA });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<matricula>B-77</matricula><tpRegTrab>1</tpRegTrab><tpRegPrev>1</tpRegPrev><cadIni>N</cadIni>');
        expect(g.evento!.xml).toContain('<dtAdm>2020-03-02</dtAdm><tpAdmissao>2</tpAdmissao><indAdmissao>1</indAdmissao>');
        expect(g.evento!.xml).toContain(`<sucessaoVinc><tpInsc>1</tpInsc><nrInsc>${ORIGEM.cnpj}</nrInsc><matricAnt>A-10</matricAnt><dtTransf>2026-11-01</dtTransf></sucessaoVinc>`);
        expect(g.evento!.xml).toContain(`<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${DESTINO.cnpj}</nrInsc></localTrabGeral>`);
        expect(g.evento!.xml).toContain('<depIRRF>S</depIRRF><depSF>S</depSF><incTrab>N</incTrab>');
        expect(g.evento!.xml).not.toContain('<FGTS>');
    });

    it('S-2200 de admissão comum e contrato por prazo; cobra o que falta', async () => {
        const det = { ...FICHA, dados: { ...FICHA.dados, tipoContrato: '2', fimContrato: '2026-12-31', raca: '6', admissao: '2026-10-01' } };
        const g = gerarS2200({ cnpj: ORIGEM.cnpj, tpAmb: 2, ficha: { ...det, dados: { ...det.dados, raca: '3' } }, contrato: { ...contratoPadrao(det), dtBase: '05', tpJornada: '4', clauAssec: 'N' }, agora: AGORA });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<tpAdmissao>1</tpAdmissao>');
        expect(g.evento!.xml).toContain('<dtBase>5</dtBase>');
        expect(g.evento!.xml).toContain('<duracao><tpContr>2</tpContr><dtTerm>2026-12-31</dtTerm><clauAssec>N</clauAssec></duracao>');
        const e = validarS2200({ cnpj: ORIGEM.cnpj, tpAmb: 2, ficha: { ...det, dados: { ...det.dados, sindicato: '', municipio: '', categoria: '104' } }, contrato: { ...contratoPadrao(), dscJorn: '' } }).join(' ');
        for (const m of [/sindicato/, /município/, /Categoria 104 \(doméstico\): o vínculo vai pelo eSocial Doméstico/, /Descrição da jornada/, /não informado/, /cláusula assecuratória/]) expect(e).toMatch(m);
    });

    it('fichas: destino com nova matrícula, histórico e sem os dados da empresa; origem desligada com o motivo 11', () => {
        const n = fichaNoDestino(T);
        expect(n).toMatchObject({ id: idFuncionario('E2', '52998224725', 'B-77'), empresaId: 'E2', cnpj: DESTINO.cnpj, matriculaEsocial: 'B-77', situacao: 'ativo' });
        expect(n.dados).toMatchObject({ admissao: '2020-03-02', inicioNaEmpresa: '2026-11-01', salario: '2500.00', estabelecimento: DESTINO.cnpj });
        expect(n.dados.horario).toBeUndefined(); expect(n.dados.lotacao).toBeUndefined(); expect(n.dados.codigoIob).toBeUndefined();
        expect(n.historicoSalario).toHaveLength(2);
        expect(n.dependentes).toHaveLength(1);
        expect(n.origens.estabelecimento).toMatch(/Transferência de ALFA LTDA \(matrícula A-10\) em 01\/11\/2026/);
        const o = fichaNaOrigem(T);
        expect(o).toMatchObject({ situacao: 'desligado', dados: { dataDesligamento: '2026-10-31', motivoDesligamento: '11' } });
    });

    it('validações: mesma raiz, datas, matrícula, estabelecimento e CPF já ativo no destino', () => {
        expect(validarTransferencia(T)).toEqual([]);
        const e = validarTransferencia({ ...T, destino: { ...DESTINO, cnpj: '44388152000270' }, data: '2019-01-01', matricula: 'eSocial-1', estabelecimento: '11222333000181' },
            [{ ...fichaVazia(DESTINO), cpf: '52998224725', matriculaEsocial: 'X', situacao: 'ativo' }]).join(' ');
        for (const m of [/Mesma raiz/, /depois da admissão/, /Matrícula no destino/, /estabelecimento de destino tem de ser/, /já tem ficha ativa/]) expect(e).toMatch(m);
        expect(validarTransferencia({ ...T, ficha: { ...FICHA, situacao: 'desligado' } }).join(' ')).toMatch(/Só se transfere quem está ativo/);
        expect(validarTransferencia({ ...T, data: '2026-11-15' })).toEqual([]);
    });

    it('afastamentos: férias e os terminados vão, sem recibos; o em curso e o posterior não', () => {
        const af = (dtInicio: string, dtFim: string, motivo: string) => ({ ...afastamentoVazio(), id: `${FICHA.id}_${dtInicio}`, empresaId: 'E1', fichaId: FICHA.id, cpf: FICHA.cpf, dtInicio, dtFim, motivo, recibos: ['1.1.1'] });
        const r = afastamentosParaODestino(T, [af('2025-01-06', '2025-02-04', '15'), af('2026-10-20', '2026-11-20', '01'), af('2026-11-10', '2026-11-12', '01')]);
        expect(r.copiar).toHaveLength(1);
        expect(r.copiar[0]).toMatchObject({ fichaId: idFuncionario('E2', '52998224725', 'B-77'), empresaId: 'E2', matriculaEsocial: 'B-77', recibos: [], id: `${idFuncionario('E2', '52998224725', 'B-77')}_2025-01-06` });
        expect(r.avisos).toHaveLength(2);
        expect(r.avisos.join(' ')).toMatch(/em curso/);
    });

    it('no meio do mês: cada empresa paga os seus dias; o destino não tem o funcionário antes da transferência', async () => {
        const { calcularMensal, noMes } = await import('../../calculo/motorMensal');
        const { TABELAS_OFICIAIS_2026 } = await import('../../cadastros/tabelasOficiais');
        const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
        const meio = { ...T, data: '2026-11-16' };
        const origem = fichaNaOrigem(meio); const destino = fichaNoDestino(meio);
        const ro = calcularMensal({ competencia: '2026-11', pagamento: '2026-12', ficha: origem, tabelas: TAB, afastamentos: [], folhaPagaNoAdiantamento: null });
        const rd = calcularMensal({ competencia: '2026-11', pagamento: '2026-12', ficha: destino, tabelas: TAB, afastamentos: [], folhaPagaNoAdiantamento: null });
        expect([ro.situacao, rd.situacao]).toEqual(['calculado', 'calculado']);
        const sal = (r: typeof ro) => r.verbas.find(v => v.codigo === 'SAL')?.valor ?? 0;
        expect(sal(ro)).toBe(Math.round(250000 / 30 * 15));
        expect(sal(rd)).toBe(Math.round(250000 / 30 * 15));
        expect(ro.memoria.join(' ')).toMatch(/sem rescisão/);
        expect(rd.memoria.join(' ')).toMatch(/Transferido de outra empresa do grupo em 16\/11\/2026/);
        expect(noMes([destino], '2026-10')).toEqual([]);
        expect(noMes([destino], '2026-11')).toHaveLength(1);
    });
});

describe('S-2200 e S-2206 por categoria (XSD S-1.3)', () => {
    const adm = (dados: Partial<FichaFuncionario['dados']>) => ({ ...FICHA, dados: { ...FICHA.dados, admissao: '2026-10-01', ...dados } });
    const s2200 = (f: FichaFuncionario, c: Partial<ReturnType<typeof contratoPadrao>> = {}) =>
        gerarS2200({ cnpj: ORIGEM.cnpj, tpAmb: 2, ficha: f, contrato: { ...contratoPadrao(f), ...c }, agora: AGORA });

    it('intermitente (111): sem horas semanais; passa no XSD', async () => {
        const g = s2200(adm({ categoria: '111', horasSemanais: '' }));
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<codCateg>111</codCateg>');
        expect(g.evento!.xml).toMatch(/<horContratual><tpJornada>/);
        expect(validarS2200({ cnpj: ORIGEM.cnpj, tpAmb: 2, ficha: adm({ categoria: '101', horasSemanais: '' }), contrato: contratoPadrao() }).join(' ')).toMatch(/Horas semanais/);
    });

    it('aprendiz (103): grupo aprend, prazo determinado; passa no XSD', async () => {
        const f = adm({ categoria: '103', tipoContrato: '2', fimContrato: '2027-09-30' });
        expect(validarS2200({ cnpj: ORIGEM.cnpj, tpAmb: 2, ficha: { ...f, dados: { ...f.dados, tipoContrato: '1' } }, contrato: contratoPadrao(f) }).join(' ')).toMatch(/Aprendiz admitido desde 22\/04\/2024: contrato por prazo determinado/);
        expect(validarS2200({ cnpj: ORIGEM.cnpj, tpAmb: 2, ficha: f, contrato: { ...contratoPadrao(f), clauAssec: 'N' } }).join(' ')).toMatch(/CNPJ da entidade qualificadora/);
        const g = s2200(f, { clauAssec: 'N', aprend: { indAprend: '1', cnpjEntQual: '11222333000181' } });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<cnpjSindCategProf>11222333000181</cnpjSindCategProf><aprend><indAprend>1</indAprend><cnpjEntQual>11222333000181</cnpjEntQual></aprend></infoCeletista>');
        const ind = s2200(f, { clauAssec: 'S', aprend: { indAprend: '2', tpInsc: '1', nrInsc: '29463877000109' } });
        expect(ind.erros).toEqual([]);
        expect(ind.evento!.xml).toContain('<aprend><indAprend>2</indAprend><tpInsc>1</tpInsc><nrInsc>29463877000109</nrInsc></aprend>');
        expect(s2200(f, { clauAssec: 'S', aprend: { indAprend: '2', tpInsc: '1', nrInsc: '44388152000189' } }).erros.join(' ')).toMatch(/outra empresa/);
    });

    it('temporário (106): trabTemporario com tomador e substituídos; passa no XSD', async () => {
        const f = adm({ categoria: '106', tipoContrato: '2', fimContrato: '2027-01-31' });
        expect(s2200(f, { clauAssec: 'N' }).erros.join(' ')).toMatch(/o fato que justifica a contratação/);
        const t = { hipLeg: '1' as const, justContr: 'Substituição de empregada em licença-maternidade', ideEstabVinc: { tpInsc: '1' as const, nrInsc: '29463877000109' }, cpfSubstituidos: [] as string[] };
        expect(s2200(f, { clauAssec: 'N', trabTemporario: t }).erros.join(' ')).toMatch(/CPF de quem é substituído/);
        const g = s2200(f, { clauAssec: 'N', trabTemporario: { ...t, cpfSubstituidos: ['39053344705'] } });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<trabTemporario><hipLeg>1</hipLeg><justContr>Substituição de empregada em licença-maternidade</justContr><ideEstabVinc><tpInsc>1</tpInsc><nrInsc>29463877000109</nrInsc></ideEstabVinc><ideTrabSubstituido><cpfTrabSubst>39053344705</cpfTrabSubst></ideTrabSubstituido></trabTemporario>');
    });

    it('contrato vinculado a fato (tpContr 3): objeto determinante e cláusula; passa no XSD', async () => {
        const f = adm({ tipoContrato: '3' });
        expect(s2200(f).erros.join(' ')).toMatch(/objeto determinante/);
        const g = s2200(f, { clauAssec: 'N', objDet: 'Obra da sede nova' });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<duracao><tpContr>3</tpContr><clauAssec>N</clauAssec><objDet>Obra da sede nova</objDet></duracao>');
    });

    it('contrato verde e amarelo (107/108) continua com o IOB', () => {
        expect(validarS2200({ cnpj: ORIGEM.cnpj, tpAmb: 2, ficha: adm({ categoria: '107' }), contrato: contratoPadrao() }).join(' ')).toMatch(/Categoria 107 \(contrato verde e amarelo\): o S-2200 dela fica com o IOB/);
    });
});
