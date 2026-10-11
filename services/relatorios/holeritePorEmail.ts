// services/relatorios/holeritePorEmail.ts
//
// Envio do holerite a cada funcionário por e-mail (Utilitários › Envio de Relatórios por E-mail do SAGE): um e-mail por
// funcionário, para o e-mail da própria ficha, com só o holerite dele em PDF. Quem não tem e-mail válido na ficha
// fica de fora, com o aviso (o holerite nunca vai para outro endereço). Puro, sem Firebase.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { emailValido } from '../pacoteCliente/envio';
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
export const arquivoHolerite = (d: DestinatarioHolerite, competencia: string) => `holerite-${competencia}-${(d.ficha.matriculaEsocial || d.ficha.cpf).replace(/[^\w-]/g, '')}.pdf`;
export const assuntoHolerite = (competencia: string, empresa: string) => `Holerite ${mesAno(competencia)} · ${empresa}`;
export function mensagemHolerite(nome: string, competencia: string, empresa: string): string {
    const primeiro = nome.trim().split(/\s+/)[0] ?? '';
    const tratado = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : '';
    return `${tratado ? `Olá, ${tratado}!` : 'Olá!'}\n\nSegue em anexo o seu holerite de ${mesAno(competencia)} da ${empresa}.\n\nEste e-mail é pessoal: não o encaminhe. Dúvidas sobre os valores, fale com o RH da empresa.\n${ESCRITORIO.departamento} · ${ESCRITORIO.nome}`;
}
