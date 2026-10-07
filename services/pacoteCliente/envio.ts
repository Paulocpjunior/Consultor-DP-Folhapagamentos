// services/pacoteCliente/envio.ts
//
// Envio do pacote ao cliente pelo próprio app (Paulo, 07/10/2026: "porque
// cada módulo não usa um túnel para acesso mas envia do seu próprio app").
// O Consultor DP é um site estático: não guarda senha de e-mail nem token de
// WhatsApp (tudo no navegador é público). Então o envio sai do WhatsApp e do
// e-mail de quem está usando: o app monta a mensagem e abre o compartilhamento
// do aparelho com o .zip, ou o WhatsApp/e-mail com o texto pronto.

import type { Data } from '../prazos/calendario';
import type { EventoAgenda } from '../agenda/convite';
import { ROTULO_FORMA, type ResultadoRemessa } from '../bancario/cnab240';

export interface ContatoEnvio { nome?: string; email?: string; whatsapp?: string }

const reais = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d: Data) => d.split('-').reverse().join('/');

/** WhatsApp com DDI 55: "(11) 98888-7777" → "5511988887777"; null se não for número do Brasil. */
export function numeroWhatsApp(t: string | undefined): string | null {
    const d = (t ?? '').replace(/\D/g, '');
    const n = d.length === 10 || d.length === 11 ? `55${d}` : d;
    return /^55\d{10,11}$/.test(n) ? n : null;
}

export const emailValido = (t: string | undefined) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((t ?? '').trim());

/** Mensagem do envio: o que vai no pacote, o arquivo bancário e as datas. Curta, para caber no link do e-mail. */
export function mensagemEnvio(p: {
    contato?: ContatoEnvio;
    empresa: string;
    titulo: string;
    nomeZip: string;
    arquivos: string[];
    remessa?: ResultadoRemessa;
    foraDoArquivo: { nome: string }[];
    eventos: EventoAgenda[];
    assinatura: string;
}): string {
    const l: string[] = [];
    l.push(p.contato?.nome?.trim() ? `Olá, ${p.contato.nome.trim()}!` : 'Olá!', '');
    l.push(`Segue o pacote da ${p.titulo} da ${p.empresa} (${p.nomeZip}), com:`);
    l.push(...p.arquivos.map(a => `• ${a}`), '');
    const r = p.remessa;
    if (r) {
        const datas = [...new Set(r.incluidos.map(i => i.favorecido.dataPagamento))].sort().map(br).join(', ');
        l.push(`Arquivo bancário (${r.perfil.nome}): ${r.incluidos.length} pagamento(s), total ${reais(r.total)}, crédito em ${datas}. Importe no internet banking da empresa, na opção de pagamentos por arquivo, e autorize até o dia útil anterior.`);
        if (r.lotes.length > 1) l.push(r.lotes.map(x => `${ROTULO_FORMA[x.forma]}: ${x.quantidade} · ${reais(x.total)}`).join(' | '));
        if (r.naoConferidas.length) l.push('Confira os pagamentos na tela do banco antes de autorizar.');
        l.push('');
    }
    if (p.foraDoArquivo.length) l.push(`Pagar por fora do arquivo: ${p.foraDoArquivo.map(f => f.nome).join(', ')} (motivo no LEIA-ME).`, '');
    if (p.eventos.length) {
        l.push('Datas (o arquivo .ics do pacote coloca na sua agenda com lembrete):');
        l.push(...p.eventos.map(e => `• ${br(e.inicio)}: ${e.titulo}`), '');
    }
    l.push('Qualquer dúvida, estamos à disposição.', p.assinatura);
    return l.join('\n');
}

export const linkWhatsApp = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

/** mailto com assunto e corpo (CRLF, como pede a RFC 6068). O anexo o usuário põe no e-mail. */
export const linkEmail = (para: string, assunto: string, corpo: string) =>
    `mailto:${encodeURIComponent(para.trim()).replace(/%40/g, '@')}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo.replace(/\r?\n/g, '\r\n'))}`;
