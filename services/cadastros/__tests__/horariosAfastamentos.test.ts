// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { calcularDia, conferirHorasSemanais, descricaoJornada, horarioVazio, idHorario, noturnoReduzido, resumirHorario, validarHorario, type Horario } from '../horarios';
import {
    afastamentoVazio, consolidarAfastamentos, diasNaCompetencia, idAfastamento, inicioBeneficio, lerXmlAfastamentos, mesclarAfastamentos,
    rotuloMotivo, validarAfastamento, type Afastamento,
} from '../afastamentos';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../funcionarios';

const dia = (entrada: string, si: string, ri: string, saida: string) => ({ tipo: 'trabalho' as const, entrada, saidaIntervalo: si, retornoIntervalo: ri, saida });

function comercial(): Horario {
    const h = { ...horarioVazio('emp1'), codigo: '001', descricao: 'Comercial 44h' };
    for (const d of ['seg', 'ter', 'qua', 'qui', 'sex'] as const) h.dias[d] = dia('08:00', '12:00', '13:00', '17:48');
    return h;
}

describe('horários', () => {
    it('jornada comercial de 44 h: total, descrição da jornada e sem avisos', () => {
        const h = comercial();
        const r = resumirHorario(h);
        expect(r.semanal).toBe(44 * 60);
        expect(r.porDia.seg).toMatchObject({ trabalhado: 8 * 60 + 48, intervalo: 60, noturno: 0 });
        expect(validarHorario(h)).toEqual({ erros: [], avisos: [] });
        expect(descricaoJornada(h)).toBe('Seg a Sex: 08:00-12:00 e 13:00-17:48; Sáb: folga; Dom: DSR');
        expect(conferirHorasSemanais('44', h)).toBeNull();
        expect(conferirHorasSemanais('40.00', h)).toBe('Horas semanais da ficha (40:00) diferentes do horário 001 (44:00).');
        expect(idHorario('emp1', ' 1/A ')).toBe('emp1_1%2FA');
    });

    it('turno que vira a noite: horas noturnas das 22h às 5h, fora o intervalo, e hora reduzida', () => {
        const c = calcularDia(dia('22:00', '02:00', '03:00', '06:00'));
        expect(c).toMatchObject({ trabalhado: 7 * 60, intervalo: 60, noturno: 6 * 60 });
        expect(noturnoReduzido(6 * 60)).toBe(411);
    });

    it('erros de preenchimento bloqueiam; limites da CLT viram avisos', () => {
        const h = { ...horarioVazio('emp1') };
        h.dias.seg = dia('08:00', '13:00', '12:00', '17:00');
        h.dias.ter = dia('25:00', '', '', '17:00');
        h.dias.qua = dia('08:00', '12:00', '', '17:00');
        expect(validarHorario(h).erros).toEqual([
            'Informe o código do horário.', 'Informe a descrição.',
            'Seg: intervalo fora da jornada.', 'Ter: informe entrada e saída (HH:MM).', 'Qua: intervalo incompleto ou inválido.',
            'Qui: informe entrada e saída (HH:MM).', 'Sex: informe entrada e saída (HH:MM).',
        ]);
        const pesado: Horario = { ...comercial(), codigo: '002', descricao: 'Pesado' };
        pesado.dias.seg = dia('07:00', '12:00', '12:30', '19:00');
        pesado.dias.ter = dia('06:00', '', '', '11:30');
        pesado.dias.dom = dia('08:00', '', '', '12:00');
        expect(validarHorario(pesado).avisos).toEqual([
            'Seg: mais de 6 h com intervalo menor que 1 h (CLT art. 71).',
            'Seg: mais de 10 h no dia (CLT arts. 58 e 59); só com regime especial, como 12x36.',
            'Ter: de 4 h a 6 h exige intervalo de 15 min (CLT art. 71, §1º).',
            'Total semanal de 47:24 acima de 44 h (CF art. 7º, XIII).',
            'Nenhum dia marcado como DSR (CLT art. 67).',
        ]);
    });

    it('interjornada menor que 11 h e código repetido', () => {
        const h = comercial();
        h.dias.seg = dia('14:00', '18:00', '19:00', '23:00');
        h.dias.ter = dia('06:00', '10:00', '11:00', '14:48');
        const v = validarHorario(h, [{ ...comercial(), id: 'x' }]);
        expect(v.erros).toEqual(['Já existe um horário com este código nesta empresa.']);
        expect(v.avisos).toContain('De Seg para Ter: 07:00 entre jornadas, menos de 11 h (CLT art. 66).');
    });
});

// ---------- Afastamentos ----------

const empresa = { id: 'emp1', cnpj: '11222333000181' };
const CPF = '52998224725';
const ficha: FichaFuncionario = { ...fichaVazia(empresa), id: idFuncionario('emp1', CPF, 'M1'), cpf: CPF, matriculaEsocial: 'M1', dados: { nome: 'X', admissao: '2026-01-05' } };

const env = (ev: string, id: string, recibo: string, cd = '201') => `<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto><evento>${ev}</evento><recibo><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento Id="${id}"><processamento><cdResposta>${cd}</cdResposta></processamento><recibo><nrRecibo>${recibo}</nrRecibo></recibo></retornoEvento></eSocial></recibo></retornoEventoCompleto></eSocial>`;
const s2230 = (id: string, recibo: string, corpo: string, retifica = '') => env(`<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAfastTemp/v_S_01_03_00"><evtAfastTemp Id="${id}"><ideEvento><indRetif>${retifica ? 2 : 1}</indRetif>${retifica ? `<nrRecibo>${retifica}</nrRecibo>` : ''}<tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>${CPF}</cpfTrab><matricula>M1</matricula></ideVinculo><infoAfastamento>${corpo}</infoAfastamento></evtAfastTemp></eSocial>`, id, recibo);
const inicio = (dt: string, mot: string, extra = '') => `<iniAfastamento><dtIniAfast>${dt}</dtIniAfast><codMotAfast>${mot}</codMotAfast>${extra}</iniAfastamento>`;
const termino = (dt: string) => `<fimAfastamento><dtTermAfast>${dt}</dtTermAfast></fimAfastamento>`;
const exclusao = (id: string, recibo: string, alvo: string) => env(`<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtExclusao/v_S_01_03_00"><evtExclusao Id="${id}"><ideEvento><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><infoExclusao><tpEvento>S-2230</tpEvento><nrRecEvt>${alvo}</nrRecEvt><ideTrabalhador><cpfTrab>${CPF}</cpfTrab></ideTrabalhador></infoExclusao></evtExclusao></eSocial>`, id, recibo);

function importar(...arquivos: string[]) {
    const eventos = arquivos.flatMap((x, i) => lerXmlAfastamentos(`a${i}.xml`, x, '11222333').eventos);
    return consolidarAfastamentos(eventos, empresa, [ficha]);
}

describe('afastamentos (S-2230)', () => {
    it('junta início e término de eventos separados', () => {
        const r = importar(s2230('ID1', '1.1', inicio('2026-03-10', '03', '<infoMesmoMtv>N</infoMesmoMtv>')), s2230('ID2', '1.2', termino('2026-04-08')));
        expect(r.avisos).toEqual([]);
        expect(r.afastamentos).toEqual([expect.objectContaining({ id: idAfastamento(ficha.id, '2026-03-10'), dtInicio: '2026-03-10', dtFim: '2026-04-08', motivo: '03', infoMesmoMtv: 'N', recibos: ['1.1', '1.2'] })]);
        expect(inicioBeneficio(r.afastamentos[0])).toBe('2026-03-25');
        expect(diasNaCompetencia(r.afastamentos[0], '2026-03')).toBe(22);
        expect(diasNaCompetencia(r.afastamentos[0], '2026-04')).toBe(8);
        expect(diasNaCompetencia(r.afastamentos[0], '2026-05')).toBe(0);
    });

    it('retificação substitui o original; S-3000 exclui; sem recibo 201 não entra', () => {
        const r = importar(
            s2230('ID1', '1.1', inicio('2026-03-10', '03')),
            s2230('ID3', '1.3', inicio('2026-03-10', '01'), '1.1'),
            s2230('ID4', '1.4', inicio('2026-06-01', '15', '<perAquis><dtInicio>2025-01-05</dtInicio><dtFim>2026-01-04</dtFim></perAquis>') + termino('2026-06-30')),
            exclusao('ID5', '1.5', '1.4'),
        );
        expect(r.afastamentos.map(a => [a.dtInicio, a.motivo])).toEqual([['2026-03-10', '01']]);
        const semRecibo = lerXmlAfastamentos('x.xml', s2230('ID9', '9', inicio('2026-01-10', '15')).replace('<cdResposta>201', '<cdResposta>401'), '11222333');
        expect(semRecibo.eventos).toEqual([]);
        expect(semRecibo.avisos[0]).toContain('sem recibo');
    });

    it('vínculo sem ficha e término sem início viram aviso', () => {
        const outro = s2230('ID1', '1.1', inicio('2026-03-10', '03')).replace(`<matricula>M1`, '<matricula>M2');
        const r = importar(outro, s2230('ID2', '1.2', termino('2026-04-08')));
        expect(r.afastamentos).toEqual([]);
        expect(r.avisos).toEqual([expect.stringContaining('sem ficha nesta empresa'), expect.stringContaining('término em 2026-04-08 sem o início')]);
    });

    it('validação: datas, motivo, campos que só valem para 01/03 ou 15, admissão e sobreposição', () => {
        const base: Afastamento = { ...afastamentoVazio(), id: 'a1', empresaId: 'emp1', fichaId: ficha.id, dtInicio: '2026-03-10', dtFim: '2026-03-20', motivo: '15' };
        expect(validarAfastamento(base, ficha, [])).toEqual({ erros: [], avisos: [] });
        expect(validarAfastamento({ ...base, dtInicio: '2025-12-01', dtFim: '2025-11-01', motivo: '15', tpAcidTransito: '1' }, ficha, []).erros)
            .toEqual(['Término anterior ao início.', 'Acidente de trânsito só com motivo 01 ou 03.', 'Início anterior à admissão.']);
        expect(validarAfastamento({ ...base, motivo: '27', perAquisInicio: '2025-01-05' }, ficha, []))
            .toEqual({ erros: ['Período aquisitivo só para férias (motivo 15).'], avisos: ['Motivo 27 sem descrição neste cadastro: conferir na Tabela 18 do eSocial.'] });
        const aberto = { ...base, id: 'a2', dtInicio: '2026-03-01', dtFim: '' };
        expect(validarAfastamento(base, ficha, [aberto]).erros).toEqual(['Sobrepõe o afastamento iniciado em 01/03/2026.']);
        expect(rotuloMotivo('17')).toBe('17 - Licença-maternidade (120 dias)');
        expect(rotuloMotivo('27')).toBe('27 - conferir na Tabela 18 do eSocial');
    });

    it('importação não troca afastamento lançado à mão', () => {
        const imp: Afastamento = { ...afastamentoVazio(), id: 'a1', dtInicio: '2026-03-10', dtFim: '2026-03-20', motivo: '03', origem: 'eSocial: S-2230' };
        const manual = { ...imp, dtFim: '2026-03-25', origem: 'Manual · ana · 2026-10-04' };
        expect(mesclarAfastamentos([imp], [manual])).toEqual([{ afastamento: manual, novo: false, mudou: false, preservado: true }]);
        expect(mesclarAfastamentos([imp], [{ ...imp, dtFim: '' }])).toEqual([{ afastamento: imp, novo: false, mudou: true, preservado: false }]);
        expect(mesclarAfastamentos([imp], [])[0].novo).toBe(true);
    });
});
