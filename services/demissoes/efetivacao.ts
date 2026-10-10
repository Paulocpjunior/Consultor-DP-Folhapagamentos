// services/demissoes/efetivacao.ts
//
// Efetivador de rescisões (item 2 das sugestões): depois que o cliente decide, a demissão vira um roteiro com prazo,
// do registro na ficha ao seguro-desemprego. O Consultor faz o que é dele (S-2299, S-1210, TRCT, orientações) e,
// no que é de outro sistema, entrega os dados e o atalho:
// - guia rescisória do FGTS: o FGTS Digital gera a partir do S-2299 (com a multa), em até 10 dias;
// - seguro-desemprego: o requerimento é feito no Empregador Web (Paulo, 10/10/2026), com certificado ICP-Brasil;
//   o trabalhador pede o benefício do 7º ao 120º dia (CTPS Digital / gov.br);
// - saque do FGTS: pelo app FGTS, depois que o desligamento é informado.
// Os passos manuais (pagamento, guia, requerimento, documentos) ficam marcados no Consultor, com quem e quando.

import { salarioContratual } from '../calculo/motorMensal';
import { PERMITE_SAQUE_FGTS, TIPOS_RESCISAO, type ResultadoRescisao, type TipoRescisao } from '../calculo/motorRescisao';
import { fichaNaData, type FichaFuncionario } from '../cadastros/funcionarios';
import { diaUtilAnterior, diasEntre, somarDias, somarMeses } from '../prazos/calendario';
import { prazoS2299 } from '../esocial/desligamento';

export const LINK_FGTS_DIGITAL = 'https://fgtsdigital.sistema.gov.br/';
export const LINK_EMPREGADOR_WEB = 'https://sd.maisemprego.mte.gov.br/sdweb/empregadorweb/';

/** Meses de trabalho no vínculo (fração de 15 dias ou mais conta como mês, como no seguro-desemprego), até `ate`. */
export function mesesTrabalhados(admissao: string, ate: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(admissao) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < admissao) return 0;
    let n = 0;
    for (let m = 0; m < 600; m++) {
        const ini = somarMeses(admissao, m);
        if (ini > ate) break;
        const fim = somarDias(somarMeses(admissao, m + 1), -1);
        if (ate >= fim || diasEntre(ini, ate) + 1 >= 15) n++;
    }
    return n;
}

export type Solicitacao = 1 | 2 | 3;
export interface SeguroDesemprego {
    cabe: boolean;
    motivo: string;
    meses: number;
    /** Meses exigidos nesta solicitação (Lei 7.998/1990, art. 3º, I, com a Lei 13.134/2015). */
    exigidos: number;
    parcelas: number;
    /** Média dos três últimos salários pela ficha (o valor da parcela sai da tabela do Codefat do ano). */
    mediaSalarios: number;
    observacoes: string[];
}

/**
 * Seguro-desemprego pelo vínculo do Consultor (Lei 7.998/1990, arts. 3º e 4º, red. Lei 13.134/2015): dispensa sem
 * justa causa; 1ª solicitação, 12 meses nos últimos 18; 2ª, 9 nos últimos 12; da 3ª em diante, 6 meses. Parcelas:
 * 1ª: 4 (12 a 23 meses) ou 5 (24+); 2ª: 3 (9 a 11), 4 (12 a 23) ou 5; 3ª+: 3 (6 a 11), 4 (12 a 23) ou 5.
 * Só este vínculo é contado: outros empregos no período somam, e quem decide é o MTE.
 */
export function seguroDesemprego(ficha: FichaFuncionario, r: Pick<ResultadoRescisao, 'tipo' | 'data'>, solicitacao: Solicitacao = 1): SeguroDesemprego {
    const obs: string[] = [];
    const meses = mesesTrabalhados(ficha.dados.admissao ?? '', r.data);
    const exigidos = solicitacao === 1 ? 12 : solicitacao === 2 ? 9 : 6;
    const media = mediaUltimosSalarios(ficha, r.data);
    const base = { meses, exigidos, mediaSalarios: media, observacoes: obs };
    if (r.tipo !== '02' && r.tipo !== '03') {
        const porque = r.tipo === '33' ? 'acordo (art. 484-A, § 4º): não dá direito ao seguro-desemprego' : `${(TIPOS_RESCISAO as Record<string, string>)[r.tipo] ?? 'este motivo'} não dá direito ao seguro-desemprego`;
        return { ...base, cabe: false, motivo: porque, parcelas: 0 };
    }
    const contados = solicitacao === 1 ? Math.min(meses, 18) : solicitacao === 2 ? Math.min(meses, 12) : meses;
    if (contados < exigidos) {
        obs.push('Outros empregos nos meses anteriores também contam: o MTE confere pelo CNIS.');
        return { ...base, cabe: false, motivo: `${contados} mês(es) neste vínculo; a ${solicitacao}ª solicitação exige ${exigidos}.`, parcelas: 0 };
    }
    const parcelas = meses >= 24 ? 5 : meses >= 12 ? 4 : 3;
    obs.push('O valor da parcela sai da média dos três últimos salários pela tabela do Codefat do ano (com piso de um salário mínimo).');
    obs.push('O trabalhador pede do 7º ao 120º dia depois da dispensa, pela CTPS Digital ou pelo gov.br.');
    return { ...base, cabe: true, motivo: `${meses} mês(es) neste vínculo: ${parcelas} parcelas na ${solicitacao}ª solicitação.`, parcelas };
}

/** Média dos três salários contratuais antes do desligamento (pelo histórico da ficha). */
export function mediaUltimosSalarios(ficha: FichaFuncionario, data: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return 0;
    const valores = [1, 2, 3].map(n => {
        const sc = salarioContratual(fichaNaData(ficha, somarMeses(`${data.slice(0, 7)}-01`, -n)).ficha.dados);
        return 'erro' in sc ? 0 : sc.mensal;
    }).filter(v => v > 0);
    return valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : 0;
}

/** Os passos da efetivação, na ordem, com o prazo de cada um. Os automáticos vêm do eSocial; os demais, marcados. */
export type PassoId = 'ficha' | 's2299' | 'pagamento' | 's1210' | 'fgts' | 'seguro' | 'documentos';
export interface Passo { id: PassoId; titulo: string; prazo: string; manual: boolean; aplica: boolean; detalhe: string }

export function passosDaEfetivacao(r: Pick<ResultadoRescisao, 'tipo' | 'data' | 'pagarAte'>): Passo[] {
    const tipo = r.tipo as TipoRescisao;
    const prazo10 = r.data ? diaUtilAnterior(somarDias(r.data, 10)) : '';
    const saque = PERMITE_SAQUE_FGTS.includes(tipo);
    return [
        { id: 'ficha', titulo: 'Desligamento registrado na ficha', prazo: '', manual: false, aplica: true, detalhe: 'Data e motivo do desligamento na ficha (Cadastros › Funcionários).' },
        { id: 's2299', titulo: 'S-2299 transmitido e aceito', prazo: prazoS2299(r.data), manual: false, aplica: true, detalhe: 'Até 10 dias do desligamento. O FGTS Digital e o seguro-desemprego partem dele.' },
        { id: 'pagamento', titulo: 'Verbas pagas ao trabalhador', prazo: r.pagarAte ? diaUtilAnterior(r.pagarAte) : '', manual: true, aplica: true, detalhe: 'Até 10 dias do término (CLT, art. 477, § 6º); atraso gera a multa do § 8º (um salário).' },
        { id: 's1210', titulo: 'S-1210 do pagamento transmitido', prazo: '', manual: false, aplica: true, detalhe: 'No mês do pagamento, antes do fechamento (S-1299).' },
        { id: 'fgts', titulo: 'Guia rescisória do FGTS paga (FGTS Digital)', prazo: prazo10, manual: true, aplica: true,
            detalhe: `FGTS do mês, 13º, aviso indenizado${saque && tipo !== '06' ? ' e a multa' : ''}: o FGTS Digital gera a guia a partir do S-2299. ${saque ? `O trabalhador ${tipo === '33' ? 'saca 80% do saldo' : 'saca o saldo'} pelo app FGTS.` : 'Sem saque neste motivo.'}` },
        { id: 'seguro', titulo: 'Requerimento do seguro-desemprego (Empregador Web)', prazo: prazo10, manual: true, aplica: tipo === '02' || tipo === '03',
            detalhe: 'Feito no Empregador Web com certificado ICP-Brasil. Entregue ao trabalhador o número do requerimento e as orientações.' },
        { id: 'documentos', titulo: 'TRCT e documentos assinados e entregues', prazo: r.pagarAte ? diaUtilAnterior(r.pagarAte) : '', manual: true, aplica: true,
            detalhe: `TRCT, comprovante de pagamento${tipo === '33' ? ', termo do acordo (art. 484-A)' : tipo === '07' ? ', pedido de demissão' : ', aviso prévio'} e as orientações ao trabalhador.` },
    ];
}

/** Dados do trabalhador para o requerimento no Empregador Web (copiar e colar). */
export function dadosEmpregadorWeb(ficha: FichaFuncionario, r: Pick<ResultadoRescisao, 'data' | 'dataProjetada' | 'diasAviso' | 'verbas'>, empresa: { cnpj: string; razaoSocial: string }): [string, string][] {
    const d = ficha.dados;
    const br = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x.split('-').reverse().join('/') : '');
    const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const salarios = [3, 2, 1].map(n => {
        const mes = somarMeses(`${r.data.slice(0, 7)}-01`, -n);
        const sc = salarioContratual(fichaNaData(ficha, mes).ficha.dados);
        return [`Salário de ${mes.slice(5, 7)}/${mes.slice(0, 4)}`, 'erro' in sc ? '' : reais(sc.mensal)] as [string, string];
    });
    const indenizado = r.verbas.some(v => v.codigo === 'AVISO' && v.valor > 0);
    const endereco = [d.logradouro, d.numero, d.complemento, d.bairro].filter(Boolean).join(', ');
    return [
        ['CNPJ do empregador', empresa.cnpj], ['Razão social', empresa.razaoSocial],
        ['CPF', ficha.cpf], ['PIS/PASEP/NIT', d.pis ?? ''], ['Nome', d.nome ?? ''], ['Nome da mãe', d.mae ?? ''],
        ['Nascimento', br(d.nascimento)], ['Sexo', d.sexo ?? ''], ['Escolaridade', d.escolaridade ?? ''],
        ['Endereço', endereco], ['CEP', d.cep ?? ''], ['Município/UF', [d.municipio, d.uf].filter(Boolean).join('/')], ['Telefone', d.telefone ?? ''], ['E-mail', d.email ?? ''],
        ['CBO', d.cbo ?? ''], ['Admissão', br(d.admissao)], ['Dispensa', br(r.data)],
        ['Aviso prévio indenizado', indenizado ? `Sim (${r.diasAviso} dias, fim projetado ${br(r.dataProjetada)})` : 'Não'],
        ...salarios,
    ];
}
