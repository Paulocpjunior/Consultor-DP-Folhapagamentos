// services/relatorios/aniversarios.ts
//
// Mensagem de aniversário no mês do aniversário do colaborador (Paulo, 12/10/2026): sai no holerite em PDF do mês,
// no e-mail do holerite e, para os aniversariantes do mês, num cartão em PDF enviado por e-mail ou pelo WhatsApp do
// escritório (SP Connect). O texto é da empresa (parâmetros da folha, com {nome} e {empresa}); sem texto gravado vale o
// padrão, e texto vazio gravado desliga. Puro, sem Firebase.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { dataValida } from '../cadastros/documentos';
import { emailValido, numeroWhatsApp } from '../pacoteCliente/envio';

export const MENSAGEM_ANIVERSARIO_PADRAO = 'Feliz aniversário, {nome}! A {empresa} deseja a você um novo ano de muita saúde, alegria e conquistas.';
export const LIMITE_MENSAGEM_ANIVERSARIO = 300;

/** Primeiro nome com a inicial maiúscula ("MARIA DA SILVA" → "Maria"). */
export const primeiroNome = (nome: string) => {
    const p = nome.trim().split(/\s+/)[0] ?? '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

/** Faz aniversário no mês da competência (AAAA-MM)? */
export const fazAniversarioNoMes = (f: FichaFuncionario | undefined, competencia: string) => {
    const n = f?.dados.nascimento ?? '';
    return dataValida(n) && n.slice(5, 7) === competencia.slice(5, 7);
};

/**
 * A mensagem com o nome e a empresa. `texto` undefined = o padrão; texto vazio = desligada (volta '').
 * Sem o nome, a vírgula do "Feliz aniversário, {nome}!" some.
 */
export function mensagemAniversario(texto: string | undefined, nome: string, empresa: string): string {
    const t = (texto ?? MENSAGEM_ANIVERSARIO_PADRAO).trim();
    if (!t) return '';
    const n = primeiroNome(nome);
    return (n ? t.replace(/\{nome\}/g, n) : t.replace(/,?\s*\{nome\}/g, '')).replace(/\{empresa\}/g, empresa.trim()).replace(/\s{2,}/g, ' ').trim();
}

/** A mensagem do holerite do mês: só para quem faz aniversário na competência. */
export function aniversarioNoHolerite(f: FichaFuncionario | undefined, competencia: string, texto: string | undefined, empresa: string): string {
    return f && fazAniversarioNoMes(f, competencia) ? mensagemAniversario(texto, f.dados.nome ?? '', empresa) : '';
}

export interface Aniversariante { ficha: FichaFuncionario; dia: string; nome: string; email: string | null; whatsapp: string | null }

/** Aniversariantes da competência entre os ativos (sem desligamento até o fim do mês), pelo dia. */
export function aniversariantesDoMes(fichas: FichaFuncionario[], competencia: string): Aniversariante[] {
    const [a, m] = competencia.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    return fichas
        .filter(f => f.situacao !== 'desligado' && !(f.dados.dataDesligamento && f.dados.dataDesligamento <= ultimo) && fazAniversarioNoMes(f, competencia))
        .map(f => ({
            ficha: f, dia: (f.dados.nascimento ?? '').slice(8, 10), nome: f.dados.nome ?? f.matriculaEsocial,
            email: emailValido(f.dados.email) ? f.dados.email!.trim() : null,
            whatsapp: numeroWhatsApp(f.dados.telefone) ?? numeroWhatsApp(f.dados.telefone2),
        }))
        .sort((x, y) => x.dia.localeCompare(y.dia) || x.nome.localeCompare(y.nome, 'pt-BR'));
}

/** Nome do cartão: aniversario-AAAA-MM-<matrícula ou CPF>.pdf, sem o nome da pessoa. */
export const arquivoCartao = (f: FichaFuncionario, competencia: string) => `aniversario-${competencia}-${(f.matriculaEsocial || f.cpf).replace(/[^\w-]/g, '')}.pdf`;
