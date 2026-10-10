// services/ferias/comunicacaoColetivaPdf.ts
//
// Comunicações das férias coletivas (CLT, art. 139, §§ 2º e 3º), com 15 dias de antecedência:
// ao órgão local do Ministério do Trabalho (dispensada para ME e EPP: LC 123/2006, art. 51, V), ao sindicato
// da categoria e o aviso para afixar nos locais de trabalho, com os empregados e os dias de cada um.

import autoTable from 'jspdf-autotable';
import { cabecalhoPadrao, cnpjFmt, finalizar, novoDocumento, textoPdf, type OpcoesPdf } from '../relatorios/layoutPdf';
import type { PlanoColetiva, ResultadoColetiva } from './feriasColetivas';

const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');

export interface DadosComunicacao { razaoSocial: string; cnpj: string; cidade: string; sindicato: string; setor: string }

export function comunicacaoColetivaPdf(p: PlanoColetiva, r: ResultadoColetiva, d: DadosComunicacao, o: Omit<OpcoesPdf, 'previa' | 'titulo'>) {
    const opcoes: OpcoesPdf = { ...o, titulo: 'Férias coletivas', previa: false, orientacao: 'retrato' };
    const doc = novoDocumento(opcoes);
    const largura = doc.internal.pageSize.getWidth() - 28;
    const periodo = `de ${br(p.inicio)} a ${br(r.fim)} (${p.dias} dias)`;
    const abrangencia = d.setor ? `os empregados do setor ${d.setor}` : 'todos os empregados';
    const empresa = `${d.razaoSocial}, CNPJ ${cnpjFmt(d.cnpj)}`;
    const data = `${d.cidade ? `${d.cidade}, ` : ''}${br(p.hoje)}.`;
    let primeira = true;
    const carta = (subtitulo: string, destinatario: string, corpo: string[]) => {
        if (!primeira) doc.addPage();
        primeira = false;
        cabecalhoPadrao(doc, opcoes, subtitulo);
        let y = 36;
        const texto = (t: string, negrito = false) => { doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(10); const l = doc.splitTextToSize(textoPdf(t), largura) as string[]; doc.text(l, 14, y); y += l.length * 5 + 3; };
        texto(destinatario, true);
        y += 2;
        for (const c of corpo) texto(c);
        y += 4; texto(data);
        y += 14; doc.line(14, y, 100, y); y += 5; texto(d.razaoSocial);
        return y;
    };
    const lei = 'nos termos do art. 139 da Consolidação das Leis do Trabalho';
    if (!p.meEpp) carta('Comunicação ao Ministério do Trabalho', 'Ao órgão local do Ministério do Trabalho e Emprego',
        [`${empresa}, comunica, ${lei}, que concederá férias coletivas a ${abrangencia}, no período ${periodo}.`, 'A comunicação é feita com a antecedência mínima de 15 (quinze) dias da data de início (art. 139, § 2º).']);
    carta('Comunicação ao sindicato', `Ao ${d.sindicato || 'sindicato representativo da categoria profissional'}`,
        [`${empresa}, comunica, ${lei}, que concederá férias coletivas a ${abrangencia}, no período ${periodo}.`, `Em cumprimento ao art. 139, § 3º, da CLT, encaminha cópia da comunicação${p.meEpp ? '' : ' feita ao Ministério do Trabalho e Emprego'} e informa que o aviso será afixado nos locais de trabalho.`]);
    const y = carta('Aviso aos empregados', 'Aviso de férias coletivas',
        [`A ${empresa}, comunica que concederá férias coletivas a ${abrangencia}, no período ${periodo}, com retorno ao trabalho em ${br(nextDay(r.fim))}.`,
            'O pagamento das férias e do 1/3 constitucional será feito até 2 (dois) dias antes do início (CLT, art. 145). Quem tem menos de 12 meses de contrato goza as férias proporcionais e inicia novo período aquisitivo (art. 140); os dias que excedem o saldo de férias são de licença remunerada.']);
    const itens = r.itens.filter(i => i.situacao !== 'excluido');
    autoTable(doc, {
        startY: y + 6, margin: { left: 14, right: 14 },
        head: [['Empregado', 'Férias', 'Antecipadas', 'Licença remunerada', 'Observação']],
        body: itens.map(i => [textoPdf(i.nome), String(i.diasGozo), String(i.diasAntecipados || ''), String(i.diasLicenca || ''), textoPdf(i.situacao === 'proporcionais' ? 'Proporcionais (art. 140)' : '')]),
        styles: { fontSize: 8.5, cellPadding: 1.4 }, headStyles: { fillColor: [15, 29, 77] },
    });
    return finalizar(doc, opcoes);
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
