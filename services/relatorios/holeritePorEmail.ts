// services/relatorios/holeritePorEmail.ts
//
// Envio do holerite a cada funcionário por e-mail (Utilitários › Envio de Relatórios por E-mail do SAGE): um e-mail por
// funcionário, para o e-mail da própria ficha, com só o holerite dele em PDF. Quem não tem e-mail válido na ficha
// fica de fora, com o aviso (o holerite nunca vai para outro endereço). Puro, sem Firebase.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { emailValido, numeroWhatsApp } from '../pacoteCliente/envio';
import { valoresSugeridos, type TemplateWhatsApp } from '../pacoteCliente/spConnect';
import { primeiroNome } from './aniversarios';
import { ESCRITORIO } from './layoutPdf';

export interface DestinatarioHolerite { resultado: ResultadoCalculo; ficha: FichaFuncionario; email: string; nome: string }

/** Quem recebe (holerite da folha gravada sem erro e e-mail válido na ficha) e quem fica de fora (sem e-mail). */
export function destinatariosHolerite(folha: ResultadoCalculo[], fichas: FichaFuncionario[]): { comEmail: DestinatarioHolerite[]; semEmail: string[] } {
    const porId = new Map(fichas.map(f => [f.id, f]));
    const comEmail: DestinatarioHolerite[] = []; const semEmail: string[] = [];
    for (const r of folha) {
        if (r.situacao === 'erro') continue;
        const f = porId.get(r.fichaId);
        const nome = f?.dados.nome || r.nome;
        const email = (f?.dados.email ?? '').trim();
        if (f && emailValido(email)) comEmail.push({ resultado: r, ficha: f, email, nome });
        else semEmail.push(nome);
    }
    const ordem = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    return { comEmail: comEmail.sort((a, b) => ordem(a.nome, b.nome)), semEmail: semEmail.sort(ordem) };
}

const mesAno = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
/** Nome do arquivo: holerite-AAAA-MM-<matrícula ou CPF>.pdf, sem o nome da pessoa. */
export const arquivoHolerite = (d: { ficha: FichaFuncionario }, competencia: string) => `holerite-${competencia}-${(d.ficha.matriculaEsocial || d.ficha.cpf).replace(/[^\w-]/g, '')}.pdf`;
export const assuntoHolerite = (competencia: string, empresa: string) => `Holerite ${mesAno(competencia)} · ${empresa}`;
/** Texto do e-mail; no mês do aniversário, a mensagem de aniversário da empresa vem antes do holerite. */
export function mensagemHolerite(nome: string, competencia: string, empresa: string, aniversario = ''): string {
    const tratado = primeiroNome(nome);
    return `${tratado ? `Olá, ${tratado}!` : 'Olá!'}\n\n${aniversario.trim() ? `${aniversario.trim()}\n\n` : ''}Segue em anexo o seu holerite de ${mesAno(competencia)} da ${empresa}.\n\nEste e-mail é pessoal: não o encaminhe. Dúvidas sobre os valores, fale com o RH da empresa.\n${ESCRITORIO.departamento} · ${ESCRITORIO.nome}`;
}

export interface DestinatarioWhatsApp { resultado: ResultadoCalculo; ficha: FichaFuncionario; numero: string; nome: string }

/** Quem recebe pelo WhatsApp (holerite sem erro e celular do Brasil na ficha, Telefone ou Telefone 2) e quem fica de fora. */
export function destinatariosWhatsApp(folha: ResultadoCalculo[], fichas: FichaFuncionario[]): { comWhatsApp: DestinatarioWhatsApp[]; semWhatsApp: string[] } {
    const porId = new Map(fichas.map(f => [f.id, f]));
    const comWhatsApp: DestinatarioWhatsApp[] = []; const semWhatsApp: string[] = [];
    for (const r of folha) {
        if (r.situacao === 'erro') continue;
        const f = porId.get(r.fichaId);
        const nome = f?.dados.nome || r.nome;
        const numero = numeroWhatsApp(f?.dados.telefone) ?? numeroWhatsApp(f?.dados.telefone2);
        if (f && numero) comWhatsApp.push({ resultado: r, ficha: f, numero, nome });
        else semWhatsApp.push(nome);
    }
    const ordem = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    return { comWhatsApp: comWhatsApp.sort((a, b) => ordem(a.nome, b.nome)), semWhatsApp: semWhatsApp.sort(ordem) };
}

/**
 * Variáveis do template do DP para um funcionário: o nome é o primeiro nome dele (nunca o da empresa); a empresa, a
 * competência e o título como no pacote. `faltando`: chaves que o Consultor não sabe preencher (o CFI recusaria).
 */
export function variaveisDoFuncionario(t: TemplateWhatsApp, d: { nome: string; empresa: string; titulo: string; competencia: string }): { variaveis: Record<string, string>; faltando: string[] } {
    const chaves = (t.variaveis ?? []).map(v => v.chave);
    const variaveis = valoresSugeridos(chaves, { contato: primeiroNome(d.nome) || d.nome, empresa: d.empresa, titulo: d.titulo, competencia: mesAno(d.competencia) });
    return { variaveis, faltando: chaves.filter(k => !variaveis[k]) };
}
