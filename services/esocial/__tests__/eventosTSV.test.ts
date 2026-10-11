// S-2300 e S-2399 do sócio e do diretor gerados pelo Consultor (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contribuinteVazio, tsvVazio, type ContribuinteIndividual } from '../../contribuintes/contribuinteIndividual';
import { gerarS2300, gerarS2399, refInicioTSV, refTerminoTSV, validarS2300 } from '../eventosTSV';
import { validarPeloXsd } from '../validadorXsd';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const CNPJ = '44388152000189';
const AGORA = new Date('2026-10-11T12:00:00Z');
const diretor: ContribuinteIndividual = {
    ...contribuinteVazio('E1'), id: 'E1_52998224725', cpf: '52998224725', nome: 'ANA DIRETORA', nascimento: '1980-04-10', categoria: '721', cbo: '121010', matricula: 'DIR-01',
    dependentes: [{ cpf: '39053344705', nome: 'FILHO TESTE', nascimento: '2012-03-03', tipo: '03' }],
    tsv: { ...tsvVazio(), sexo: 'F', racaCor: '1', estCiv: '2', grauInstr: '09', endereco: { logradouro: 'RUA DAS FLORES', numero: '100', complemento: 'SALA 2', bairro: 'CENTRO', cep: '01001-000', codMunic: '3550308', uf: 'sp' },
        dtInicio: '2026-10-01', cargo: 'Diretora financeira', remuneracao: 1500000, dtOpcFGTS: '2026-10-01' },
};
const socio: ContribuinteIndividual = { ...diretor, id: 'E1_39053344705', cpf: '39053344705', nome: 'BRUNO SOCIO', categoria: '723', dependentes: [], matricula: 'SOC-01',
    tsv: { ...diretor.tsv, sexo: 'M', remuneracao: 0, dtOpcFGTS: '', cargo: 'Sócio administrador' } };

describe('S-2300 pelo Consultor', () => {
    it('diretor com FGTS (721): remuneração, opção pelo FGTS, local de trabalho e dependente; passa no XSD', async () => {
        const g = gerarS2300({ cnpj: CNPJ, tpAmb: 2, contribuinte: diretor, nrInscEstab: CNPJ, agora: AGORA });
        expect(g.erros).toEqual([]);
        const xml = g.evento!.xml;
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(xml).toContain('<cadIni>N</cadIni><matricula>DIR-01</matricula><codCateg>721</codCateg><dtInicio>2026-10-01</dtInicio>');
        expect(xml).toContain('<remuneracao><vrSalFx>15000.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><FGTS><dtOpcFGTS>2026-10-01</dtOpcFGTS></FGTS>');
        expect(xml).toContain(`<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${CNPJ}</nrInsc></localTrabGeral>`);
        expect(xml).toContain('<depIRRF>S</depIRRF><depSF>N</depSF><incTrab>N</incTrab>');
        expect(xml).toContain('<cep>01001000</cep><codMunic>3550308</codMunic><uf>SP</uf>');
        expect(xml).not.toContain('natAtividade');
    });

    it('sócio (723) sem pró-labore fixo: sem remuneração e sem FGTS; diretor 722 variável vai com a unidade 7', async () => {
        const s = gerarS2300({ cnpj: CNPJ, tpAmb: 2, contribuinte: socio, nrInscEstab: CNPJ, agora: AGORA });
        expect(s.erros).toEqual([]);
        expect(await validarPeloXsd(s.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(s.evento!.xml).not.toContain('<remuneracao>');
        expect(s.evento!.xml).not.toContain('<FGTS>');
        const d = gerarS2300({ cnpj: CNPJ, tpAmb: 2, contribuinte: { ...socio, categoria: '722' }, nrInscEstab: CNPJ, agora: AGORA });
        expect(await validarPeloXsd(d.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(d.evento!.xml).toContain('<vrSalFx>0.00</vrSalFx><undSalFixo>7</undSalFixo>');
        expect(d.avisos.join(' ')).toMatch(/remuneração variável/);
    });

    it('retificação pelo recibo; autônomo sem local de trabalho', async () => {
        const g = gerarS2300({ cnpj: CNPJ, tpAmb: 1, contribuinte: { ...diretor, s2300: true }, nrInscEstab: CNPJ, recibo: '1.1.0000000000000000001', agora: AGORA });
        expect(g.evento!.xml).toContain('<indRetif>2</indRetif><nrRecibo>1.1.0000000000000000001</nrRecibo>');
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const a = gerarS2300({ cnpj: CNPJ, tpAmb: 2, contribuinte: { ...socio, categoria: '701', cbo: '317110' }, nrInscEstab: CNPJ, agora: AGORA });
        expect(a.evento!.xml).not.toContain('localTrabGeral');
        expect(await validarPeloXsd(a.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });

    it('cobra o que falta: sexo, instrução, endereço, matrícula, cargo, opção pelo FGTS e o estabelecimento', () => {
        const e = validarS2300({ ...diretor, matricula: 'eSocial1', tsv: { ...tsvVazio(), dtInicio: '2026-10-01', racaCor: '6' } }, '').join(' ');
        for (const m of [/sexo/, /não informado" não é aceita/, /grau de instrução/, /logradouro/, /CEP/, /município/, /UF/, /sem começar por "eSocial"/, /cargo/, /opção pelo FGTS/, /CNPJ do estabelecimento/]) expect(e).toMatch(m);
        expect(gerarS2300({ cnpj: CNPJ, tpAmb: 2, contribuinte: { ...diretor, tsv: tsvVazio() }, nrInscEstab: CNPJ }).evento).toBeNull();
        expect(refInicioTSV('X')).toBe('tsv:X:inicio');
        expect(refTerminoTSV('X')).toBe('tsv:X:termino');
    });
});

describe('S-2399 pelo Consultor', () => {
    it('diretor com FGTS: motivo e pensAlim; passa no XSD', async () => {
        const g = gerarS2399({ cnpj: CNPJ, tpAmb: 2, contribuinte: { ...diretor, tsv: { ...diretor.tsv, dtTermino: '2026-10-15', mtvDesligTSV: '02' } }, hoje: '2026-10-11', agora: AGORA });
        expect(g.erros).toEqual([]);
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<ideTrabSemVinculo><cpfTrab>52998224725</cpfTrab><matricula>DIR-01</matricula></ideTrabSemVinculo>');
        expect(g.evento!.xml).toContain('<infoTSVTermino><dtTerm>2026-10-15</dtTerm><mtvDesligTSV>02</mtvDesligTSV><pensAlim>0</pensAlim></infoTSVTermino>');
    });

    it('sócio: sem motivo; sem matrícula vai pela categoria; prazo de 10 dias e motivo do 721 cobrados', async () => {
        const g = gerarS2399({ cnpj: CNPJ, tpAmb: 2, contribuinte: { ...socio, matricula: '', tsv: { ...socio.tsv, dtTermino: '2026-10-11' } }, hoje: '2026-10-11', agora: AGORA });
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(g.evento!.xml).toContain('<codCateg>723</codCateg></ideTrabSemVinculo><infoTSVTermino><dtTerm>2026-10-11</dtTerm></infoTSVTermino>');
        expect(g.avisos.join(' ')).toMatch(/vai pela categoria/);
        const e = gerarS2399({ cnpj: CNPJ, tpAmb: 2, contribuinte: { ...diretor, tsv: { ...diretor.tsv, dtTermino: '2026-10-30' } }, hoje: '2026-10-11' });
        expect(e.evento).toBeNull();
        expect(e.erros.join(' ')).toMatch(/até 10 dias/);
        expect(e.erros.join(' ')).toMatch(/motivo do término/);
    });
});
