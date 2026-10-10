// services/demissoes/orientacoesPdf.ts
//
// "Orientações ao trabalhador" no desligamento: o que ele recebe e até quando, o saque do FGTS, o seguro-desemprego
// (quando cabe: o requerimento sai pelo Empregador Web e ele pede do 7º ao 120º dia) e os documentos. Linguagem
// simples, para entregar junto com o TRCT.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { TIPOS_RESCISAO, type ResultadoRescisao } from '../calculo/motorRescisao';
import { cabecalhoPadrao, finalizar, novoDocumento, textoPdf, type OpcoesPdf } from '../relatorios/layoutPdf';
import { sacaFgts } from './previa';
import type { SeguroDesemprego } from './efetivacao';
import { diaUtilAnterior } from '../prazos/calendario';

const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '—');

export function orientacoesPdf(ficha: FichaFuncionario, r: ResultadoRescisao, seguro: SeguroDesemprego, o: Omit<OpcoesPdf, 'previa'>, requerimento = '') {
    const opcoes: OpcoesPdf = { ...o, previa: false, orientacao: 'retrato' };
    const doc = novoDocumento(opcoes);
    cabecalhoPadrao(doc, opcoes, ficha.dados.nome || ficha.cpf);
    const largura = doc.internal.pageSize.getWidth() - 28;
    let y = 32;
    const titulo = (t: string) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(textoPdf(t), 14, y); y += 5.5; doc.setFont('helvetica', 'normal'); };
    const texto = (t: string) => { doc.setFontSize(9); const l = doc.splitTextToSize(textoPdf(t), largura) as string[]; doc.text(l, 14, y); y += l.length * 4.2 + 1.5; };
    const tipo = r.tipo as keyof typeof TIPOS_RESCISAO;
    const saque = r.tipo ? sacaFgts(tipo) : '';
    titulo('Seu desligamento');
    texto(`Motivo: ${r.tipo ? TIPOS_RESCISAO[tipo] : '—'}. Último dia do contrato: ${br(r.data)}.${r.diasAviso && r.dataProjetada !== r.data ? ` Aviso prévio indenizado: ${r.diasAviso} dias (o contrato conta até ${br(r.dataProjetada)} para 13º e férias).` : ''}`);
    titulo('O que você recebe');
    texto(`Valor líquido da rescisão: ${brl(r.totais.liquido)}, a ser pago até ${br(r.pagarAte ? diaUtilAnterior(r.pagarAte) : '')} (CLT, art. 477, § 6º). O detalhe de cada verba está no Termo de Rescisão (TRCT).`);
    titulo('FGTS');
    if (saque.startsWith('Saca')) texto(`${saque === 'Saca 80% do FGTS' ? 'Você pode sacar 80% do saldo do FGTS (acordo, art. 484-A).' : 'Você pode sacar o saldo do FGTS'}${r.percentualMulta ? `, com a multa de ${r.percentualMulta}% paga pela empresa na guia do FGTS Digital` : ''}. O saque é pelo aplicativo FGTS (Caixa): depois que a empresa informar o desligamento ao eSocial e pagar a guia, o valor aparece liberado no app; indique uma conta bancária em seu nome para o crédito.`);
    else texto('Neste motivo de desligamento não há saque do FGTS: o saldo continua na sua conta e rende até um saque permitido por lei (aposentadoria, compra da casa própria, entre outros). A empresa deposita o FGTS do mês.');
    titulo('Seguro-desemprego');
    if (seguro.cabe) {
        texto(`Pelo tempo de trabalho nesta empresa (${seguro.meses} meses), você pode ter direito a ${seguro.parcelas} parcelas do seguro-desemprego. O valor é calculado pelo governo a partir da média dos seus três últimos salários.`);
        texto(`Como pedir: do 7º ao 120º dia depois da dispensa, pelo aplicativo Carteira de Trabalho Digital ou pelo portal gov.br (também nas unidades do SINE).${requerimento ? ` Número do requerimento: ${requerimento}.` : ''} O governo confere os outros empregos que você teve, e é ele quem decide o direito.`);
    } else texto(`${seguro.motivo.charAt(0).toUpperCase()}${seguro.motivo.slice(1)}`);
    titulo('Documentos');
    texto('Guarde o TRCT assinado e o comprovante do pagamento. A Carteira de Trabalho Digital é atualizada pelo eSocial: confira a data de saída no aplicativo em alguns dias.');
    doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    texto('Dúvidas: fale com a empresa ou com o departamento pessoal do escritório de contabilidade dela.');
    doc.setTextColor(0, 0, 0);
    return finalizar(doc, opcoes);
}
