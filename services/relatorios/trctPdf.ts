// services/relatorios/trctPdf.ts
//
// Termo de Rescisão do Contrato de Trabalho (TRCT) no layout do Consultor.
//
// O modelo oficial único (Portaria MTE 1.621/2010 e alterações) foi revogado pela Portaria MTP 671/2021: o TRCT
// continua obrigatório, em modelo do empregador, com a natureza e o valor de cada parcela discriminados
// (CLT, art. 477, § 2º — a quitação vale só para as parcelas e valores especificados). Por isso o termo sai com as
// seções de sempre (empregador, trabalhador, contrato, verbas, deduções, FGTS e quitação), sem a numeração de
// campos do modelo revogado.

import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { centavosDeTexto } from '../cadastros/documentos';
import type { ResultadoRescisao } from '../calculo/motorRescisao';
import { TIPOS_RESCISAO } from '../calculo/motorRescisao';
import { cabecalhoPadrao, cnpjFmt, finalizar, novoDocumento, textoPdf, type OpcoesPdf } from './layoutPdf';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d ?? '');
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const AZUL_CLARO: [number, number, number] = [29, 78, 216];
const CINZA: [number, number, number] = [241, 245, 249];

export interface LinhaTrct { rotulo: string; valor: string }
export interface SecaoTrct { titulo: string; linhas: LinhaTrct[] }

/** Seções de identificação do TRCT (parte pura, para a tela e os testes). */
export function secoesDoTrct(r: ResultadoRescisao, f: FichaFuncionario | undefined, empresa: { razaoSocial: string; cnpj: string }): SecaoTrct[] {
    const d = f?.dados ?? {};
    const tipo = r.tipo ? `${TIPOS_RESCISAO[r.tipo]} (motivo ${r.tipo} da Tabela 19 do eSocial)` : '';
    const indenizado = r.verbas.some(v => v.codigo === 'AVISO');
    const naoCumprido = r.verbas.some(v => v.codigo === 'AVISODESC');
    const endereco = [[d.logradouro, d.numero].filter(Boolean).join(', '), d.complemento, d.bairro, [d.municipio, d.uf].filter(Boolean).join('/'), d.cep && `CEP ${d.cep}`].filter(Boolean).join(' – ');
    return [
        { titulo: 'Empregador', linhas: [{ rotulo: 'Razão social', valor: empresa.razaoSocial }, { rotulo: 'CNPJ', valor: cnpjFmt(empresa.cnpj) }] },
        {
            titulo: 'Trabalhador', linhas: [
                { rotulo: 'Nome', valor: r.nome }, { rotulo: 'CPF', valor: cpfFmt(f?.cpf ?? '') }, { rotulo: 'PIS/NIS', valor: d.pis ?? '' },
                { rotulo: 'CTPS', valor: [d.ctps, d.serieCtps && `série ${d.serieCtps}`, d.ufCtps].filter(Boolean).join(' ') || 'digital' },
                { rotulo: 'Nascimento', valor: br(d.nascimento) }, { rotulo: 'Nome da mãe', valor: d.mae ?? '' }, { rotulo: 'Endereço', valor: endereco },
                { rotulo: 'Matrícula', valor: f?.matriculaEsocial ?? '' },
            ],
        },
        {
            titulo: 'Contrato', linhas: [
                { rotulo: 'Cargo', valor: [d.cargo, d.cbo && `CBO ${d.cbo}`].filter(Boolean).join(' · ') }, { rotulo: 'Categoria', valor: d.categoria ?? '' },
                { rotulo: 'Admissão', valor: br(d.admissao) }, { rotulo: 'Desligamento', valor: br(r.data) },
                { rotulo: 'Causa do afastamento', valor: tipo },
                { rotulo: 'Aviso prévio', valor: indenizado ? `indenizado, ${r.diasAviso} dias (projeção até ${br(r.dataProjetada)})` : naoCumprido ? 'não cumprido pelo empregado (descontado)' : r.diasAviso ? `${r.diasAviso} dias` : 'não se aplica' },
                { rotulo: 'Salário contratual', valor: d.salario ? `R$ ${brl(centavosDeTexto(d.salario) ?? 0)}` : '' }, { rotulo: 'Sindicato (CNPJ)', valor: d.sindicato ? cnpjFmt(d.sindicato) : '' },
                { rotulo: 'Pagamento até', valor: `${br(r.pagarAte)} (CLT, art. 477, § 6º)` },
            ],
        },
    ];
}

/** TRCT de cada rescisão calculada (uma ou mais páginas por trabalhador). */
export function trctPdf(resultados: ResultadoRescisao[], fichas: FichaFuncionario[], o: OpcoesPdf): jsPDF {
    const doc = novoDocumento({ orientacao: 'retrato' });
    const largura = doc.internal.pageSize.getWidth(); const altura = doc.internal.pageSize.getHeight();
    const topo = o.previa ? 31 : 27;
    const validos = resultados.filter(r => r.situacao !== 'erro');
    if (!validos.length) { cabecalhoPadrao(doc, o, ''); doc.setFontSize(9); doc.text('Nenhuma rescisão calculada.', 14, 40); }
    validos.forEach((r, i) => {
        if (i > 0) doc.addPage();
        const f = fichas.find(x => x.id === r.fichaId);
        const sub = r.nome;
        cabecalhoPadrao(doc, o, sub);
        const desenhar = { didDrawPage: () => cabecalhoPadrao(doc, o, sub), margin: { left: 14, right: 14, top: topo + 2, bottom: 16 } };
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
        doc.text(textoPdf('TERMO DE RESCISÃO DO CONTRATO DE TRABALHO'), largura / 2, topo + 4, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        let y = topo + 8;
        for (const s of secoesDoTrct(r, f, o.empresa)) {
            autoTable(doc, {
                startY: y, head: [[{ content: textoPdf(s.titulo), colSpan: 4 }]],
                body: pares(s.linhas).map(([a, b]) => [textoPdf(a.rotulo), textoPdf(a.valor), textoPdf(b?.rotulo ?? ''), textoPdf(b?.valor ?? '')]),
                styles: { fontSize: 7.6, cellPadding: 1.1 }, headStyles: { fillColor: AZUL_CLARO, fontSize: 8 },
                columnStyles: { 0: { cellWidth: 30, textColor: [71, 85, 105] }, 2: { cellWidth: 30, textColor: [71, 85, 105] } }, ...desenhar,
            });
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
        }
        const proventos = r.verbas.filter(v => v.tipo === 'provento');
        const descontos = r.verbas.filter(v => v.tipo === 'desconto');
        autoTable(doc, {
            startY: y + 1, head: [['Verbas rescisórias', 'Referência', 'Valor (R$)']],
            body: proventos.map(v => [textoPdf(v.descricao), textoPdf(v.referencia), brl(v.valor)]),
            foot: [['Total bruto', '', brl(r.totais.proventos)]],
            styles: { fontSize: 7.8, cellPadding: 1.1 }, headStyles: { fillColor: AZUL_CLARO }, footStyles: { fillColor: CINZA, textColor: 20, fontStyle: 'bold' },
            columnStyles: { 1: { cellWidth: 34 }, 2: { cellWidth: 30, halign: 'right' } },
            didParseCell: dd => { if (dd.section !== 'body' && dd.column.index === 2) dd.cell.styles.halign = 'right'; }, ...desenhar,
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
        autoTable(doc, {
            startY: y, head: [['Deduções', 'Referência', 'Valor (R$)']],
            body: descontos.length ? descontos.map(v => [textoPdf(v.descricao), textoPdf(v.referencia), brl(v.valor)]) : [['Sem deduções', '', '0,00']],
            foot: [['Total das deduções', '', brl(r.totais.descontos)], ['VALOR LÍQUIDO A RECEBER', '', brl(r.totais.liquido)]].map(l => l.map(textoPdf)),
            styles: { fontSize: 7.8, cellPadding: 1.1 }, headStyles: { fillColor: [153, 27, 27] }, footStyles: { fillColor: CINZA, textColor: 20, fontStyle: 'bold' },
            columnStyles: { 1: { cellWidth: 34 }, 2: { cellWidth: 30, halign: 'right' } },
            didParseCell: dd => { if (dd.section !== 'body' && dd.column.index === 2) dd.cell.styles.halign = 'right'; }, ...desenhar,
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
        const baseFgtsRescisorio = r.verbas.filter(v => v.tipo === 'provento' && v.fgts).reduce((s, v) => s + v.valor, 0);
        autoTable(doc, {
            startY: y, head: [[{ content: 'FGTS e bases', colSpan: 4 }]],
            body: pares([
                { rotulo: 'Base do INSS', valor: brl(r.bases.inss) }, { rotulo: 'Base do IRRF', valor: brl(r.bases.irrf) },
                { rotulo: 'Base do FGTS (rescisão)', valor: brl(baseFgtsRescisorio) }, { rotulo: 'FGTS da rescisão', valor: brl(r.fgts) },
                { rotulo: 'Multa do FGTS', valor: r.percentualMulta ? `${r.percentualMulta}% · R$ ${brl(r.multaFgts)}` : 'não se aplica' }, { rotulo: 'Saque do FGTS', valor: r.saqueFgts },
            ]).map(([a, b]) => [textoPdf(a.rotulo), textoPdf(a.valor), textoPdf(b?.rotulo ?? ''), textoPdf(b?.valor ?? '')]),
            styles: { fontSize: 7.6, cellPadding: 1.1 }, headStyles: { fillColor: AZUL_CLARO, fontSize: 8 },
            columnStyles: { 0: { cellWidth: 36, textColor: [71, 85, 105] }, 2: { cellWidth: 36, textColor: [71, 85, 105] } }, ...desenhar,
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
        if (y > altura - 62) { doc.addPage(); cabecalhoPadrao(doc, o, sub); y = topo + 6; }
        doc.setFontSize(8.5);
        const quitacao = `Recebi de ${o.empresa.razaoSocial} a importância líquida de R$ ${brl(r.totais.liquido)}, referente às verbas discriminadas neste termo. A quitação se limita às parcelas e valores aqui especificados (CLT, art. 477, § 2º).`;
        const ls = doc.splitTextToSize(textoPdf(quitacao), largura - 28) as string[];
        doc.text(ls, 14, y); y += ls.length * 4.2 + 6;
        doc.text(textoPdf('Local e data: ______________________________, ____/____/______'), 14, y); y += 16;
        const meia = (largura - 28 - 12) / 2;
        doc.line(14, y, 14 + meia, y); doc.line(14 + meia + 12, y, largura - 14, y);
        doc.setFont('helvetica', 'bold');
        doc.text(textoPdf(o.empresa.razaoSocial), 14 + meia / 2, y + 4, { align: 'center', maxWidth: meia });
        doc.text(textoPdf(r.nome), 14 + meia + 12 + meia / 2, y + 4, { align: 'center', maxWidth: meia });
        doc.setFont('helvetica', 'normal');
        doc.text('Empregador(a)', 14 + meia / 2, y + 8, { align: 'center' });
        doc.text(textoPdf('Trabalhador(a) (ou responsável legal, se menor)'), 14 + meia + 12 + meia / 2, y + 8, { align: 'center' });
    });
    return finalizar(doc, o);
}

function pares<T>(l: T[]): [T, T | undefined][] {
    const out: [T, T | undefined][] = [];
    for (let i = 0; i < l.length; i += 2) out.push([l[i], l[i + 1]]);
    return out;
}
