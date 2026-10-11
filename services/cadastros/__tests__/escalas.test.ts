// Escalas em ciclo (12x36, 24x48, revezamento, folga variável): dia da escala, média semanal, avisos da CLT, o mês e o
// S-2200 (tpJornada, dscJorn e horNoturno) conferido no XSD oficial (dados fictícios).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    conferirHorasSemanais, descricaoJornada, diaDaEscala, escalaPronta, horarioVazio, mesDaEscala, resumirEscala, resumirHorario, tpJornadaDoHorario,
    validarEscala, validarHorario, type Horario,
} from '../horarios';
import { fichaVazia, type FichaFuncionario } from '../funcionarios';
import { contratoPadrao, gerarS2200 } from '../../esocial/admissao';
import { validarPeloXsd } from '../../esocial/validadorXsd';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const com = (escala: Horario['escala']): Horario => ({ ...horarioVazio('E1'), id: 'E1_H1', codigo: 'H1', descricao: 'ESCALA', escala });

describe('escalas', () => {
    it('12x36: um dia sim, um não, a partir da referência (e para trás); média semanal de 38h30', () => {
        const e = escalaPronta('12x36', '2026-10-01');
        expect(['2026-10-01', '2026-10-02', '2026-10-03', '2026-09-30', '2026-09-29'].map(d => diaDaEscala(e, d).dia.tipo)).toEqual(['trabalho', 'folga', 'trabalho', 'folga', 'trabalho']);
        const r = resumirEscala(e);
        expect([r.noCiclo, r.semanal, r.diasTrabalho]).toEqual([11 * 60, Math.round(11 * 60 * 7 / 2), 1]);
        expect(resumirHorario(com(e)).semanal).toBe(r.semanal);
        const v = validarEscala(e);
        expect(v.erros).toEqual([]);
        expect(v.avisos.join(' ')).toMatch(/CLT, art\. 59-A/);
        // Mês de outubro de 2026: dias ímpares (31 dias, 16 de trabalho).
        const m = mesDaEscala(e, '2026-10');
        expect([m.trabalhados, m.folgas, m.horas]).toEqual([16, 15, 16 * 11 * 60]);
        expect(m.dias.filter(d => d.dia.tipo === 'trabalho').slice(0, 3).map(d => d.data)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05']);
    });
    it('12x36 fora do padrão e escala sem descanso semanal ou com interjornada curta: avisos', () => {
        const longa = escalaPronta('12x36', '2026-10-01');
        longa.ciclo[0] = { ...longa.ciclo[0], saida: '20:00' };
        expect(validarEscala(longa).avisos.join(' ')).toMatch(/13:00 da entrada à saída; a 12 x 36 tem 12 h seguidas/);
        const semFolga = { ...escalaPronta('ciclo', '2026-10-01'), ciclo: Array.from({ length: 7 }, () => ({ tipo: 'trabalho' as const, entrada: '08:00', saidaIntervalo: '', retornoIntervalo: '', saida: '14:00' })) };
        expect(validarEscala(semFolga).avisos.join(' ')).toMatch(/7 dias seguidos de trabalho.*art\. 67/);
        const curta = { ...escalaPronta('ciclo', '2026-10-01'), ciclo: [{ tipo: 'trabalho' as const, entrada: '14:00', saidaIntervalo: '', retornoIntervalo: '', saida: '23:00' }, { tipo: 'trabalho' as const, entrada: '06:00', saidaIntervalo: '', retornoIntervalo: '', saida: '12:00' }, { tipo: 'folga' as const, entrada: '', saidaIntervalo: '', retornoIntervalo: '', saida: '' }] };
        expect(validarEscala(curta).avisos.join(' ')).toMatch(/do dia 1 para o 2: 07:00 entre jornadas.*art\. 66/);
        expect(validarEscala({ ...curta, referencia: '' }).erros.join(' ')).toMatch(/data de referência/);
        expect(validarEscala({ ...curta, ciclo: curta.ciclo.slice(0, 1) }).erros.join(' ')).toMatch(/de 2 a 42 dias/);
    });
    it('revezamento de 6 h com noturno; 24x48; o horário usa a escala na validação, descrição e horas da ficha', () => {
        const rev = escalaPronta('revezamento', '2026-10-01');
        const r = resumirEscala(rev);
        expect(r.semanal).toBe(Math.round(36 * 60 * 7 / 8));
        expect(r.noturnoSemanal).toBeGreaterThan(0);
        expect(validarEscala(rev).avisos.join(' ')).not.toMatch(/CF, art\. 7º, XIV/);
        expect(resumirEscala(escalaPronta('24x48', '2026-10-01')).noCiclo).toBe(23 * 60);
        const h = com(rev);
        expect(validarHorario(h).erros).toEqual([]);
        expect(descricaoJornada(h)).toMatch(/^Escala Turno ininterrupto de revezamento, ciclo de 8 dias a partir de 01\/10\/2026: 1º 06:00-12:00; 2º 06:00-12:00; 3º 12:00-18:00/);
        expect(conferirHorasSemanais('31.5', h)).toBeNull();
        expect([tpJornadaDoHorario(h), tpJornadaDoHorario(com(escalaPronta('12x36', '2026-10-01'))), tpJornadaDoHorario(com(escalaPronta('ciclo', '2026-10-01'))), tpJornadaDoHorario({ ...horarioVazio('E1') })]).toEqual(['7', '2', '3', '4']);
    });
});

describe('S-2200 pela escala', () => {
    it('tpJornada 2, dscJorn da escala e horNoturno; passa no XSD', async () => {
        const f: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'E1_52998224725_A-10', cpf: '52998224725', matriculaEsocial: 'A-10',
            dados: { nome: 'ANA TESTE', nascimento: '1990-01-01', sexo: 'F', raca: '1', estadoCivil: '2', escolaridade: '07', nacionalidade: '105', paisNascimento: '105',
                logradouro: 'RUA A', numero: '10', bairro: 'CENTRO', cep: '01001000', municipio: '3550308', uf: 'SP', admissao: '2026-10-01', categoria: '101', cargo: 'VIGIA', cbo: '517420',
                salario: '2500.00', unidadeSalario: '5', horasSemanais: '38.5', tipoContrato: '1', regimeTrabalhista: '1', regimePrevidenciario: '1', horario: 'H1', sindicato: '11222333000181', estabelecimento: '44388152000189' } };
        const noturna = escalaPronta('12x36', '2026-10-01');
        noturna.ciclo[0] = { tipo: 'trabalho', entrada: '19:00', saidaIntervalo: '00:00', retornoIntervalo: '01:00', saida: '07:00' };
        const c = contratoPadrao(f, com(noturna));
        expect([c.tpJornada, c.horNoturno]).toEqual(['2', 'S']);
        const g = gerarS2200({ cnpj: '44388152000189', tpAmb: 2, ficha: f, contrato: { ...c, dtBase: '05' }, agora: new Date('2026-10-11T12:00:00Z') });
        expect(g.erros).toEqual([]);
        expect(g.evento!.xml).toContain('<tpJornada>2</tpJornada>');
        expect(g.evento!.xml).toContain('<dscJorn>Escala 12 x 36, ciclo de 2 dias a partir de 01/10/2026: 1º 19:00-00:00 e 01:00-07:00; 2º folga</dscJorn>');
        expect(await validarPeloXsd(g.evento!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        // Sem horário, o contrato segue como antes.
        expect(contratoPadrao(f).tpJornada).toBe('9');
    });
});
