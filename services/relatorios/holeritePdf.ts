// services/relatorios/holeritePdf.ts
//
// Holerite (recibo de pagamento) em PDF a partir do resultado do motor: um
// funcionário por página, com as verbas, os totais, as bases e o campo de
// assinatura; o recibo do adiantamento salarial; e o resumo da folha. Enquanto
// o motor não for conferido com o IOB, todo PDF sai com a marca "PRÉVIA" — não
// é documento para entregar.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { ResumoFolha } from './resumoFolha';
import { centavosDeTexto } from '../cadastros/documentos';
import type { InfoIrrfFerias } from '../calculo/motorFerias';
import { verbasDoAdiantamento } from '../esocial/eventosFolha';
import { foraDoAdiantamento } from '../bancario/favorecidos';

export interface CabecalhoEmpresa { razaoSocial: string; cnpj: string; codigoSage?: string }
export interface OpcoesPdf { empresa: CabecalhoEmpresa; titulo: string; previa: boolean }

/** A fonte padrão do PDF (WinAnsi) não tem alguns sinais: troca pelos equivalentes. */
export const textoPdf = (t: string) => t.replace(/[−–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x20-\x7e\xa0-\xff—•]/g, '');
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const br = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d ?? '');

/** Marca d'água por cima de tudo (semitransparente), em todas as páginas. */
function marcaPrevia(doc: jsPDF) {
    const { width, height } = doc.internal.pageSize;
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
        doc.setPage(p);
        doc.saveGraphicsState();
        doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.18 }) as never);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(64);
        doc.text('PRÉVIA', width / 2, height / 2, { align: 'center', angle: 35 });
        doc.restoreGraphicsState();
    }
    doc.setTextColor(0, 0, 0);
}
const direita = (t: string) => ({ content: t, styles: { halign: 'right' as const } });

function cabecalho(doc: jsPDF, o: OpcoesPdf, subtitulo: string) {
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(textoPdf(o.empresa.razaoSocial), 14, 16);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(textoPdf(`CNPJ ${cnpjFmt(o.empresa.cnpj)}${o.empresa.codigoSage ? ` · código ${o.empresa.codigoSage}` : ''}`), 14, 21);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(textoPdf(o.titulo), 196, 16, { align: 'right' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(textoPdf(subtitulo), 196, 21, { align: 'right' });
    if (o.previa) {
        doc.setTextColor(180, 0, 0);
        doc.text(textoPdf('Prévia do Consultor DP — confira com o IOB antes de qualquer uso.'), 14, 27);
        doc.setTextColor(0, 0, 0);
    }
}

/** Uma página por funcionário (os resultados com erro ficam de fora). */
/** IRRF das férias no recibo em PDF, também quando não há retenção (o desconto zerado não vira verba). */
export function linhasIrrfFerias(r: ResultadoCalculo): string[] {
    const i = (r as ResultadoCalculo & { irrf?: InfoIrrfFerias | null }).irrf;
    if (!i) return [];
    const pct = `${i.aliquota.toLocaleString('pt-BR')}%`;
    return [
        `IRRF sobre férias: rendimento ${brl(i.tributavel)} - ${i.usouSimplificado ? 'desconto simplificado' : `INSS${i.dependentes ? ` e ${i.dependentes} dependente(s)` : ''}`} ${brl(i.deducoes)} = base ${brl(i.base)} · ${pct}${i.parcelaDeduzir ? ` - ${brl(i.parcelaDeduzir)}` : ''} = ${brl(i.calculado)}${i.redutor ? ` · redutor 2026 -${brl(i.redutor)}` : ''}${i.dispensado ? ` · dispensado -${brl(i.dispensado)}` : ''} · devido ${brl(i.devido)}`,
        ...(i.semRetencao ? [`Sem retenção de IRRF: ${i.semRetencao}.`] : []),
    ];
}

/** Declaração e campo de assinatura, abaixo de `y`. */
function assinatura(doc: jsPDF, y: number, nome: string) {
    doc.text(textoPdf('Declaro ter recebido a importância líquida discriminada neste recibo.'), 14, y + 14);
    doc.line(14, y + 30, 100, y + 30);
    doc.text(textoPdf(`Data: ____/____/______`), 120, y + 30);
    doc.text(textoPdf(`Assinatura de ${nome}`), 14, y + 35);
}

/** Cabeçalho do funcionário (nome, CPF, matrícula, cargo e admissão), a partir de y = 34. */
function dadosDoFuncionario(doc: jsPDF, nome: string, f: FichaFuncionario | undefined) {
    const d = f?.dados ?? {};
    doc.setFontSize(9);
    [
        `Funcionário: ${nome}`,
        `CPF ${cpfFmt(f?.cpf ?? '')} · matrícula ${f?.matriculaEsocial ?? ''}${d.codigoIob ? ` · código IOB ${d.codigoIob}` : ''}`,
        `Cargo: ${d.cargo ?? ''}${d.cbo ? ` (CBO ${d.cbo})` : ''} · admissão ${br(d.admissao)}`,
    ].forEach((t, j) => doc.text(textoPdf(t), 14, 34 + j * 5));
}

export function holeritesPdf(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], o: OpcoesPdf): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const validos = resultados.filter(r => r.situacao !== 'erro');
    validos.forEach((r, i) => {
        if (i) doc.addPage();
        const f = fichas.find(x => x.id === r.fichaId);
        const d = f?.dados ?? {};
        cabecalho(doc, o, `Pagamento: ${r.pagamento.split('-').reverse().join('/')}`);
        dadosDoFuncionario(doc, r.nome, f);
        autoTable(doc, {
            startY: 50,
            head: [['Cód.', 'Descrição', 'Referência', 'Vencimentos', 'Descontos']],
            body: r.verbas.map(v => [v.codigo, textoPdf(v.descricao), textoPdf(v.referencia), v.tipo === 'provento' ? brl(v.valor) : '', v.tipo === 'desconto' ? brl(v.valor) : '']),
            foot: [['', 'Totais', '', direita(brl(r.totais.proventos)), direita(brl(r.totais.descontos))], ['', 'Líquido a receber', '', '', direita(brl(r.totais.liquido))]],
            styles: { fontSize: 8.5, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 64, 175] },
            footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 26 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 30 } },
            margin: { left: 14, right: 14 },
        });
        let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        doc.setFontSize(8.5);
        const irrf: string[] = linhasIrrfFerias(r).flatMap(t => doc.splitTextToSize(textoPdf(t), 182) as string[]);
        const extra = irrf.length * 4;
        // Bases + IRRF + declaração + assinatura: se não couber, vão para a página seguinte.
        if (y + 40 + extra > doc.internal.pageSize.height - 10) { doc.addPage(); y = 20; }
        doc.text(textoPdf(`Salário-base ${brl(centavosDeTexto(d.salario ?? '') ?? 0)} · Base INSS ${brl(r.bases.inss)} · Base FGTS ${brl(r.bases.fgts)} · FGTS do mês ${brl(r.fgts)} · Base IRRF ${brl(r.bases.irrf)}`), 14, y);
        irrf.forEach((t, j) => doc.text(t, 14, y + 4.5 + j * 4));
        y += extra;
        assinatura(doc, y, r.nome);
    });
    if (!validos.length) { cabecalho(doc, o, ''); doc.text('Nenhum holerite calculado.', 14, 40); }
    if (o.previa) marcaPrevia(doc);
    return doc;
}

/**
 * Recibo do adiantamento salarial: um funcionário por página, com as verbas do demonstrativo do adiantamento (as
 * mesmas do S-1200 e do S-1210): o adiantamento, o IRRF dele (com o saldo da folha em outro mês) e o arredondamento.
 * O líquido é o valor do arquivo do adiantamento. Fica fora quem não está com o cálculo completo ou não pode receber
 * na data (as regras do arquivo bancário); a última página lista quem ficou fora e por quê.
 */
export function recibosAdiantamentoPdf(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], o: OpcoesPdf, dataPagamento: string): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const fora: { nome: string; motivo: string }[] = [];
    let paginas = 0;
    for (const r of resultados) {
        const verbas = verbasDoAdiantamento(r);
        if (!verbas.length) continue;
        const f = fichas.find(x => x.id === r.fichaId);
        if (r.situacao !== 'calculado') { fora.push({ nome: r.nome, motivo: `cálculo ${r.situacao === 'erro' ? 'com erro' : 'incompleto'} (veja os avisos no holerite)` }); continue; }
        const motivo = foraDoAdiantamento(r, f, dataPagamento);
        if (motivo) { fora.push({ nome: r.nome, motivo }); continue; }
        if (paginas++) doc.addPage();
        cabecalho(doc, o, `Pagamento: ${br(dataPagamento)}`);
        dadosDoFuncionario(doc, r.nome, f);
        const prov = verbas.filter(v => v.tipo === 'provento').reduce((t, v) => t + v.valor, 0);
        const desc = verbas.filter(v => v.tipo === 'desconto').reduce((t, v) => t + v.valor, 0);
        autoTable(doc, {
            startY: 50,
            head: [['Cód.', 'Descrição', 'Referência', 'Vencimentos', 'Descontos']],
            body: verbas.map(v => [v.codigo, textoPdf(v.descricao.replace(' (pagamento)', '')), textoPdf(v.referencia), v.tipo === 'provento' ? brl(v.valor) : '', v.tipo === 'desconto' ? brl(v.valor) : '']),
            foot: [['', 'Totais', '', direita(brl(prov)), direita(brl(desc))], ['', 'Líquido a receber', '', '', direita(brl(prov - desc))]],
            styles: { fontSize: 8.5, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 64, 175] },
            footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 26 }, 3: { halign: 'right', cellWidth: 30 }, 4: { halign: 'right', cellWidth: 30 } },
            margin: { left: 14, right: 14 },
        });
        let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        doc.setFontSize(8.5);
        // A conta do IRRF do adiantamento (a memória do motor) e o salário-base de referência.
        const notas = [`Salário-base ${brl(centavosDeTexto(f?.dados.salario ?? '') ?? 0)} · o adiantamento é descontado na folha de ${r.competencia.slice(5)}/${r.competencia.slice(0, 4)}.`,
            ...r.memoria.filter(m => m.startsWith('IRRF do adiantamento'))].flatMap(t => doc.splitTextToSize(textoPdf(t), 182) as string[]);
        notas.forEach((t, j) => doc.text(t, 14, y + j * 4));
        y += (notas.length - 1) * 4;
        assinatura(doc, y, r.nome);
    }
    if (fora.length) {
        if (paginas) doc.addPage();
        cabecalho(doc, o, `Pagamento: ${br(dataPagamento)}`);
        autoTable(doc, {
            startY: 34,
            head: [[`Sem recibo do adiantamento (${fora.length}): confira antes de pagar`, 'Motivo']],
            body: fora.map(x => [textoPdf(x.nome), textoPdf(x.motivo)]),
            styles: { fontSize: 8.5, cellPadding: 1.5 }, headStyles: { fillColor: [180, 83, 9] },
            columnStyles: { 0: { cellWidth: 70 } }, margin: { left: 14, right: 14 },
        });
    }
    if (!paginas && !fora.length) { cabecalho(doc, o, ''); doc.text('Nenhum adiantamento no mês.', 14, 40); }
    if (o.previa) marcaPrevia(doc);
    return doc;
}

/** Resumo da folha em uma ou mais páginas. */
export function resumoPdf(resumo: ResumoFolha, o: OpcoesPdf, observacao: string): jsPDF {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    cabecalho(doc, o, `Resumo da folha · ${resumo.funcionarios} funcionário(s)${resumo.registros !== resumo.funcionarios ? ` em ${resumo.registros} cálculos` : ''}`);
    autoTable(doc, {
        startY: 34,
        head: [['Cód.', 'Verba', 'Tipo', 'Func.', 'Valor']],
        body: resumo.porVerba.map(l => [l.codigo, textoPdf(l.descricao), l.tipo === 'provento' ? 'Provento' : 'Desconto', String(l.funcionarios), brl(l.valor)]),
        foot: [['', 'Proventos', '', '', direita(brl(resumo.totais.proventos))], ['', 'Descontos', '', '', direita(brl(resumo.totais.descontos))], ['', 'Líquido', '', '', direita(brl(resumo.totais.liquido))]],
        styles: { fontSize: 8.5, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 22 }, 3: { halign: 'right', cellWidth: 14 }, 4: { halign: 'right', cellWidth: 30 } },
        margin: { left: 14, right: 14 },
    });
    const e = resumo.encargos;
    autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
        head: [['Para conferir as guias', 'Valor']],
        body: [
            ['INSS dos segurados (descontado)', brl(e.inssSegurados)],
            ['Salário-família pago (deduzido na DCTFWeb)', brl(e.salarioFamilia)],
            ['Salário-maternidade pago (compensado na DCTFWeb)', brl(e.salarioMaternidade)],
            ...(e.patronal ? [
                ['Contribuição patronal', brl(e.patronal.patronal)],
                [`RAT ajustado (RAT × FAP = ${e.patronal.aliquotaRat.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)`, brl(e.patronal.rat)],
                ['Terceiros', brl(e.patronal.terceiros)],
                ['Total previdenciário na DCTFWeb (segurados + patronal + RAT + terceiros − salário-família − salário-maternidade)', brl(e.totalPrevidenciario ?? 0)],
            ] : [['Parte patronal', 'sem enquadramento cadastrado']]),
            ['IRRF retido (DCTFWeb do mês do pagamento)', brl(e.irrf)],
            ...(e.irrfAdiantamento ? [['IRRF retido no adiantamento (DCTFWeb do mês do adiantamento)', brl(e.irrfAdiantamento)]] : []),
            ['FGTS (FGTS Digital)', brl(e.fgts)],
            ...(e.multaFgts ? [['Multa rescisória do FGTS (FGTS Digital)', brl(e.multaFgts)]] : []),
            ['Base do INSS / do FGTS / rendimentos do IRRF', `${brl(resumo.bases.inss)} / ${brl(resumo.bases.fgts)} / ${brl(resumo.bases.irrf)}`],
        ].map(([a, b]) => [textoPdf(a), b]),
        styles: { fontSize: 8.5, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175] },
        columnStyles: { 1: { halign: 'right', cellWidth: 60 } }, margin: { left: 14, right: 14 },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(textoPdf(observacao), 182), 14, y);
    if (o.previa) marcaPrevia(doc);
    return doc;
}
