// Obras e lotações tributárias: validação e S-1005/S-1020 no XSD oficial (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { estabelecimentoDa, gerarS1005, gerarS1020, lotacaoVazia, validarLotacao, type Lotacao } from '../lotacoes';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const CNPJ = '44388152000189';
const agora = new Date('2026-10-11T12:00:00Z');
const l = (x: Partial<Lotacao>): Lotacao => ({ ...lotacaoVazia('E1'), codigo: 'OBRA01', descricao: 'Edifício Aurora', iniValid: '2026-10', ...x });

describe('lotações e obras', () => {
    it('obra própria (01 com CNO): S-1005 com o CNO, o CNAE, o CNPJ responsável e a substituição; S-1020 sem inscrição', async () => {
        const o = l({ cno: '900012345678', cnaePrep: '4120400', substituida: true });
        expect(validarLotacao(o, CNPJ)).toEqual({ erros: [], avisos: [] });
        expect(estabelecimentoDa(o, CNPJ)).toEqual({ tpInsc: '4', nrInsc: '900012345678' });
        const s1005 = gerarS1005({ cnpj: CNPJ, tpAmb: 2, lotacao: o, agora, seq: 1 }).xml;
        expect(s1005).toContain('<ideEstab><tpInsc>4</tpInsc><nrInsc>900012345678</nrInsc><iniValid>2026-10</iniValid></ideEstab><dadosEstab><cnaePrep>4120400</cnaePrep><cnpjResp>44388152000189</cnpjResp><infoObra><indSubstPatrObra>1</indSubstPatrObra></infoObra>');
        expect(await validarPeloXsd(s1005, lerXsd)).toEqual({ valido: true, erros: [] });
        const s1020 = gerarS1020({ cnpj: CNPJ, tpAmb: 2, lotacao: o, agora, seq: 2 }).xml;
        expect(s1020).toContain('<dadosLotacao><tpLotacao>01</tpLotacao><fpasLotacao><fpas>507</fpas><codTercs>0079</codTercs></fpasLotacao></dadosLotacao>');
        expect(await validarPeloXsd(s1020, lerXsd)).toEqual({ valido: true, erros: [] });
        // Aceito: o envio seguinte é alteração; RAT/FAP diferentes vão no aliqGilrat.
        const alt = gerarS1005({ cnpj: CNPJ, tpAmb: 2, lotacao: { ...o, recibo1005: '1.2.3', fap: '0,85' }, agora, seq: 3 }).xml;
        expect(alt).toContain('<alteracao>'); expect(alt).toContain('<aliqGilrat><fap>0.8500</fap></aliqGilrat>');
        expect(await validarPeloXsd(alt, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('empreitada parcial (02): CNO da obra, contratante e proprietário', async () => {
        const o = l({ tipo: '02', cno: '900099988877', contratante: { tpInsc: '1', nrInsc: '11222333000181' }, proprietario: { tpInsc: '2', nrInsc: '52998224725' } });
        expect(validarLotacao(o, CNPJ).erros).toEqual([]);
        expect(estabelecimentoDa(o, CNPJ)).toEqual({ tpInsc: '1', nrInsc: CNPJ });
        const xml = gerarS1020({ cnpj: CNPJ, tpAmb: 2, lotacao: o, agora, seq: 4 }).xml;
        expect(xml).toContain('<tpLotacao>02</tpLotacao><tpInsc>4</tpInsc><nrInsc>900099988877</nrInsc>');
        expect(xml).toContain('<infoEmprParcial><tpInscContrat>1</tpInscContrat><nrInscContrat>11222333000181</nrInscContrat><tpInscProp>2</tpInscProp><nrInscProp>52998224725</nrInscProp></infoEmprParcial>');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('cessão de mão de obra (04): CNPJ do tomador; aviso da retenção', async () => {
        const o = l({ tipo: '04', tomador: '11.222.333/0001-81', descricao: 'Tomador X' });
        const v = validarLotacao(o, CNPJ);
        expect(v.erros).toEqual([]); expect(v.avisos.join()).toMatch(/retenção de 11%.*3,5%/);
        const xml = gerarS1020({ cnpj: CNPJ, tpAmb: 2, lotacao: o, agora, seq: 5 }).xml;
        expect(xml).toContain('<tpLotacao>04</tpLotacao><tpInsc>1</tpInsc><nrInsc>11222333000181</nrInsc>');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('erros por campo', () => {
        const e = validarLotacao(l({ codigo: 'eSocial1', descricao: '', tipo: '02', cno: '123', contratante: { tpInsc: '1', nrInsc: CNPJ }, fpas: '5', iniValid: '2026-13' }), CNPJ).erros.join(' | ');
        expect(e).toMatch(/começar com "eSocial"/); expect(e).toMatch(/Descreva/); expect(e).toMatch(/12 dígitos/); expect(e).toMatch(/própria empresa/); expect(e).toMatch(/FPAS/); expect(e).toMatch(/Início da validade/);
        expect(validarLotacao(l({ tipo: '04', tomador: CNPJ }), CNPJ).erros.join()).toMatch(/tomador.*própria empresa/);
        expect(validarLotacao(l({ cno: '900012345678', cnaePrep: '' }), CNPJ).erros.join()).toMatch(/CNAE/);
    });
});
