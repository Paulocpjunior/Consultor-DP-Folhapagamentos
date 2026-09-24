// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { consolidar, lerXml, type Evento } from '../implantacao';
import { csvConferencia, pacoteCadastral, lerDossie, novoDossie } from '../dossie';

const cnpj = '11222333000181';
const cpf = '52998224725';
const hash = 'a'.repeat(64);
function xml(tag: string, corpo: string, options: { id?: string; recibo?: string; retifica?: string; raiz?: string; ambiente?: string; status?: string } = {}) {
    const id = options.id || 'IDTESTE1'; const raiz = options.raiz || '11222333';
    const evento = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/${tag}/v_S_01_03_00"><${tag} Id="${id}"><ideEvento><indRetif>${options.retifica ? '2' : '1'}</indRetif>${options.retifica ? `<nrRecibo>${options.retifica}</nrRecibo>` : ''}<tpAmb>${options.ambiente || '1'}</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz}</nrInsc></ideEmpregador>${corpo}</${tag}></eSocial>`;
    return options.recibo ? `<eSocial><retornoEventoCompleto><evento>${evento}</evento><recibo><eSocial><retornoEvento Id="${id}"><ideEmpregador><nrInsc>${raiz}</nrInsc></ideEmpregador><processamento><cdResposta>${options.status || '201'}</cdResposta><dhProcessamento>2026-08-02T12:00:00</dhProcessamento></processamento><recibo><nrRecibo>${options.recibo}</nrRecibo></recibo></retornoEvento></eSocial></recibo></retornoEventoCompleto></eSocial>` : evento;
}
function ler(text: string) { return lerXml({ nome: 'fonte.xml', xml: text, hash }); }
const ident = `<ideVinculo><cpfTrab>${cpf}</cpfTrab><matricula>ABC-000123</matricula></ideVinculo>`;
function admissao() {
    return ler(xml('evtAdmissao', `<trabalhador><cpfTrab>${cpf}</cpfTrab><nmTrab>PESSOA TESTE</nmTrab><nascimento><dtNascto>1990-01-01</dtNascto><paisNac>105</paisNac></nascimento><endereco><brasil><complemento>APTO 1</complemento></brasil></endereco><dependente><nmDep>DEPENDENTE TESTE</nmDep><dtNascto>2020-01-01</dtNascto></dependente></trabalhador><vinculo><matricula>ABC-000123</matricula><infoRegimeTrab><infoCeletista><dtAdm>2020-01-01</dtAdm></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>Auxiliar</nmCargo><remuneracao><vrSalFx>2000.00</vrSalFx></remuneracao><duracao><dtTerm>2026-12-01</dtTerm></duracao></infoContrato></vinculo>`, { recibo: 'R1' })).eventos[0];
}
function alteracao(data = '2026-08-01', options = {}) {
    return ler(xml('evtAltContratual', `${ident}<altContratual><dtAlteracao>${data}</dtAlteracao><vinculo><infoContrato><nmCargo>Pedreiro</nmCargo><CBOCargo>715210</CBOCargo><remuneracao><vrSalFx>2801.98</vrSalFx><undSalFixo>5</undSalFixo></remuneracao><horContratual><qtdHrsSem>44.00</qtdHrsSem></horContratual></infoContrato></vinculo></altContratual>`, { id: 'IDALT', recibo: 'R2', ...options })).eventos[0];
}
const consolidado = (eventos: Evento[]) => consolidar(eventos, cnpj, '2026-09-01');
describe('leitura e consolidação cadastral', () => {
    it('lê S-2206 envelopado sem inventar nome/admissão nem alterar matrícula', () => {
        const e = alteracao();
        expect(e.dados.salario).toBe('2801.98'); expect(e.recibo).toBe('R2');
        expect(e.dados.nome).toBeUndefined(); expect(e.matricula).toBe('ABC-000123');
        expect(consolidado([e]).cadastros[0].pendencias.join()).toContain('Falta S-2200');
    });
    it('ordena pela vigência e limpa opcionais removidos na alteração de contrato', () => {
        const c = consolidado([alteracao(), admissao()]).cadastros[0];
        expect(c.dados.nome).toBe('PESSOA TESTE'); expect(c.dados.admissao).toBe('2020-01-01');
        expect(c.dados.salario).toBe('2801.98'); expect(c.dados.fimContrato).toBeUndefined();
        expect(c.dados.dependentes).toContain('DEPENDENTE TESTE');
    });
    it('S-2205 preserva nascimento e lê paisNac fora do grupo nascimento', () => {
        const e = ler(xml('evtAltCadastral', `<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><alteracao><dtAlteracao>2026-08-01</dtAlteracao><dadosTrabalhador><nmTrab>NOME CONFERIDO</nmTrab><paisNac>105</paisNac></dadosTrabalhador></alteracao>`, { id: 'IDPESSOA', recibo: 'R3' })).eventos[0];
        const c = consolidado([e, admissao()]).cadastros[0];
        expect(c.dados.nome).toBe('NOME CONFERIDO'); expect(c.dados.nascimento).toBe('1990-01-01');
        expect(c.dados.nacionalidade).toBe('105'); expect(c.dados.complemento).toBeUndefined(); expect(c.dados.dependentes).toBeUndefined();
    });
    it('não une empresas, ambientes ou matrículas diferentes', () => {
        const a = admissao(); const b = { ...alteracao(), empregador: '99999999' }; const h = { ...alteracao(), ambiente: '2' };
        expect(consolidado([a, b, h]).cadastros).toHaveLength(1);
        expect(consolidado([a, b, h]).cadastros[0].dados.salario).toBe('2000.00');
        expect(consolidado([a, { ...alteracao(), matricula: 'OUTRO' }]).cadastros).toHaveLength(2);
    });
    it('deduplica evento repetido e detecta ID com conteúdo conflitante', () => {
        const a = admissao(); expect(consolidado([a, a]).cadastros[0].eventos).toHaveLength(1);
        const r = consolidado([a, { ...a, dados: { nome: 'OUTRA PESSOA' } }]);
        expect(r.avisos.join()).toContain('divergentes'); expect(r.cadastros).toHaveLength(0);
    });
    it('não aplica evento posterior à data da implantação', () => {
        expect(consolidado([admissao(), alteracao('2026-10-01')]).cadastros[0].dados.salario).toBe('2000.00');
    });
    it('retificação posterior substitui original, sem manter vigência antiga', () => {
        const original = alteracao(); const ret = alteracao('2026-10-01', { id: 'IDRET', recibo: 'R3', retifica: 'R2' });
        const r = consolidado([admissao(), original, ret]);
        expect(r.cadastros[0].dados.salario).toBe('2000.00');
    });
    it('não aplica retificação com alvo ausente ou outro vínculo', () => {
        const ret = alteracao('2026-08-01', { id: 'IDRET', recibo: 'R3', retifica: 'AUSENTE' });
        expect(consolidado([admissao(), ret]).cadastros[0].dados.salario).toBe('2000.00');
        expect(consolidado([admissao(), ret]).avisos.join()).toContain('histórico incompleto');
    });
    it('exclusão aceita retira apenas o recibo indicado', () => {
        const ex = ler(xml('evtExclusao', '<infoExclusao><tpEvento>S-2206</tpEvento><nrRecEvt>R2</nrRecEvt></infoExclusao>', { id: 'IDEX', recibo: 'R4' })).eventos[0];
        expect(consolidado([admissao(), alteracao(), ex]).cadastros[0].dados.salario).toBe('2000.00');
    });
    it('não toma exclusão sem comprovante como aplicada', () => {
        const ex = ler(xml('evtExclusao', '<infoExclusao><nrRecEvt>R2</nrRecEvt></infoExclusao>', { id: 'IDEX' })).eventos[0];
        expect(consolidado([admissao(), alteracao(), ex]).cadastros[0].dados.salario).toBe('2801.98');
    });
    it('rejeita entidade, XML quebrado e recibo de outro empregador', () => {
        expect(() => ler('<!DOCTYPE a><a/>')).toThrow(); expect(() => ler('<a>')).toThrow();
        const x = xml('evtAltContratual', ident, { recibo: 'R' }).replace('<retornoEvento Id="IDTESTE1"><ideEmpregador><nrInsc>11222333', '<retornoEvento Id="IDTESTE1"><ideEmpregador><nrInsc>99999999');
        expect(() => ler(x)).toThrow('empregadores diferentes');
    });
    it('retorno rejeitado não fornece cadastro vigente', () => {
        expect(ler(xml('evtAltContratual', ident, { recibo: 'R', status: '401' })).eventos).toHaveLength(0);
    });
    it('complemento só altera vínculo exato e mantém pendências de base', () => {
        const e = alteracao();
        const comp = { empregador: '11222333', cpf, matricula: 'OUTRO', campo: 'nome' as const, valor: 'NOME', fonte: 'ficha.pdf', justificativa: 'Conferido', registradoEm: '2026-09-01' };
        expect(consolidar([e], cnpj, '2026-09-01', [comp]).cadastros[0].dados.nome).toBeUndefined();
        const r = consolidar([e], cnpj, '2026-09-01', [{ ...comp, matricula: e.matricula }]);
        expect(r.cadastros[0].dados.nome).toBe('NOME'); expect(r.cadastros[0].pendencias.join()).toContain('Falta S-2200');
    });
    it('CSV protege fórmulas e inclui avisos gerais', () => {
        const c = consolidado([admissao()]).cadastros[0]; c.dados.nome = '=1+1';
        const csv = csvConferencia([c], ['Arquivo de outra empresa']);
        expect(csv).toContain("'=1+1"); expect(csv).toContain('Arquivo de outra empresa');
    });
    it('detecta diferença em campo não resumido no cadastro', () => {
        const a = admissao();
        const r = consolidado([a, { ...a, conteudo: a.conteudo + 'alterado' }]);
        expect(r.avisos.join()).toContain('divergentes'); expect(r.cadastros).toHaveLength(0);
    });
    it('não aplica cadeias cíclicas de retificação', () => {
        const a = alteracao('2026-08-01', { id: 'IDA', recibo: 'RA', retifica: 'RB' });
        const b = alteracao('2026-08-02', { id: 'IDB', recibo: 'RB', retifica: 'RA' });
        const r = consolidado([admissao(), a, b]);
        expect(r.avisos.join()).toContain('cíclica'); expect(r.cadastros[0].dados.salario).toBe('2000.00');
    });
    it('não escolhe entre retificações concorrentes do mesmo recibo', () => {
        const a = alteracao('2026-08-02', { id: 'IDA', recibo: 'RA', retifica: 'R2' });
        const b = alteracao('2026-08-03', { id: 'IDB', recibo: 'RB', retifica: 'R2' });
        const r = consolidado([admissao(), alteracao(), a, b]);
        expect(r.avisos.join()).toContain('concorrentes'); expect(r.cadastros[0].eventos).toHaveLength(2);
    });
    it('não retroage cargo pela data dos efeitos remuneratórios', () => {
        const e = ler(xml('evtAltContratual', `${ident}<altContratual><dtAlteracao>2026-10-01</dtAlteracao><dtEf>2026-08-01</dtEf><vinculo><infoContrato><nmCargo>OUTRO CARGO</nmCargo></infoContrato></vinculo></altContratual>`, { id: 'IDRETRO', recibo: 'RR' })).eventos[0];
        expect(e.data).toBe('2026-10-01'); expect(e.avisos.join()).toContain('Efeitos remuneratórios');
        expect(consolidado([admissao(), e]).cadastros[0].dados.cargo).toBe('Auxiliar');
    });
    it('dossiê valida versão e campos antes de reabrir', () => {
        expect(lerDossie(JSON.stringify(novoDossie())).versao).toBe(1);
        expect(() => lerDossie('{"versao":9}')).toThrow();
        expect(() => lerDossie(JSON.stringify({ ...novoDossie(), complementos: [{ campo: '__proto__' }] }))).toThrow();
    });
});


describe('implantação em modo de revisão', () => {
    it('admissão retificadora isolada aceita só aparece com opção de revisão e mantém pendência', () => {
        const a = { ...admissao(), retifica: 'ANTERIOR' };
        expect(consolidado([a]).cadastros).toHaveLength(0);
        const r = consolidar([a], cnpj, '2026-09-01', [], { revisarAdmissaoRetificada: true });
        expect(r.cadastros).toHaveLength(1);
        expect(r.cadastros[0].pendencias.join()).toContain('Cadastro provisório');
        expect(r.avisos.join()).toContain('Histórico incompleto');
        expect(a.avisos).toEqual([]);
        expect(consolidar([{ ...a, processado: false }], cnpj, '2026-09-01', [], { revisarAdmissaoRetificada: true }).cadastros).toHaveLength(0);
    });
    it('não usa a exceção de revisão em admissões concorrentes', () => {
        const a = { ...admissao(), retifica: 'ANTERIOR' };
        const b = { ...a, id: 'OUTRO', recibo: 'OUTRO', retifica: 'OUTROALVO' };
        expect(consolidar([a, b], cnpj, '2026-09-01', [], { revisarAdmissaoRetificada: true }).cadastros).toHaveLength(0);
    });
    it('pacote cadastral contém salário contratual, fontes e pendências, sem lançamentos mensais', () => {
        const r = consolidado([admissao()]);
        const pacote = JSON.parse(pacoteCadastral({ ...novoDossie(), cnpj, corte: '2026-09-01' }, r.cadastros, ['histórico a conferir']));
        expect(pacote.importavelIob).toBe(false);
        expect(pacote.funcionarios[0].dados.salario).toBe('2000.00');
        expect(pacote.funcionarios[0].matriculaEsocial).toBe('ABC-000123');
        expect(pacote.funcionarios[0].pendencias.length).toBeGreaterThan(0);
        expect(pacote.lancamentos).toBeUndefined(); expect(pacote.funcionarios[0].eventos).toBeUndefined();
    });
});

 describe('matrícula original na implantação', () => {
    it.each(['836292', '000123', '1234567', 'ABC-000123'])('preserva %s no cadastro e nos arquivos de conferência', matricula => {
        const e = { ...admissao(), matricula };
        const c = consolidado([e]).cadastros[0];
        expect(c.dados.matriculaIob).toBe(matricula);
        const pacote = JSON.parse(pacoteCadastral(novoDossie(), [c], []));
        expect(pacote.funcionarios[0].matriculaEsocial).toBe(matricula);
        expect(pacote.funcionarios[0].dados.matriculaIob).toBe(matricula);
        expect(csvConferencia([c])).toContain('"' + matricula + '"');
        if (!/^\d{1,6}$/.test(matricula)) expect(c.pendencias.join()).toContain('sem conversão ou truncamento');
    });
    it('ignora renumeração de complemento antigo ao reabrir o dossiê', () => {
        const e = { ...admissao(), matricula: '836292' };
        const c = consolidar([e], cnpj, '2026-09-01', [{
            empregador: '11222333', cpf, matricula: '836292', campo: 'matriculaIob',
            valor: '000001', fonte: 'conferência antiga', justificativa: 'código manual', registradoEm: '2026-09-01',
        }]).cadastros[0];
        expect(c.dados.matriculaIob).toBe('836292');
        expect(c.origens.matriculaIob).toContain('XML eSocial');
    });
});
