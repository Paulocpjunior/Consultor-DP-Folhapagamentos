// services/esocial/diagnostico.ts
//
// Saúde do eSocial, etapa 4: diagnóstico das ocorrências e autocorreção ASSISTIDA. Cada ocorrência de recusa
// é reconhecida pelo texto que o eSocial devolve e vira: causa em português, passos para resolver e, quando
// existe, uma ação de um clique (reabrir o período com o S-1298, conciliar para achar o recibo, abrir o cadastro).
// Nada é corrigido sozinho: toda ação passa pelo pré-voo e pela confirmação de quem transmite. O que não é
// reconhecido vai para a MIA (Gemini), como sugestão para conferir — nunca aplicada automaticamente.

import type { Ocorrencia } from './transmissao';

export type AcaoCorrecao = 'reabrir-periodo' | 'conciliar' | 'cadastro-rubrica' | 'cadastro-trabalhador' | 'cadastro-empresa' | 'cofre' | 'transmitir-s1200-antes' | 'gerar-de-novo' | 'mia';
export interface Diagnostico { regra: string; causa: string; passos: string[]; acao: AcaoCorrecao; rotuloAcao: string }

interface Regra { id: string; teste: RegExp; diagnostico: (o: Ocorrencia, tipo: string) => Omit<Diagnostico, 'regra'> }

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Regras na ordem: a primeira que reconhecer o texto da ocorrência vale. */
const REGRAS: Regra[] = [
    {
        id: 'periodo-fechado', teste: /(periodo|movimento|competencia).{0,40}(fechad|encerrad)|ja (houve|existe) (o )?fechamento|evtfechaevper/,
        diagnostico: () => ({
            causa: 'A competência já está fechada no eSocial (S-1299 aceito): periódicos novos ou retificações são recusados.',
            passos: ['Transmita a reabertura (S-1298) da competência.', 'Transmita de novo os eventos recusados.', 'Feche de novo com o S-1299 (o DCTFWeb depende dele).'],
            acao: 'reabrir-periodo', rotuloAcao: 'Reabrir o período (S-1298)',
        }),
    },
    {
        id: 'duplicado', teste: /duplicid|ja (foi )?(recebid|transmitid|processad|enviad)|ja existe (um |o )?evento|evento (identico|igual)|mesmo (id|identificador)/,
        diagnostico: () => ({
            causa: 'O eSocial já tem este evento (ou um igual para o mesmo trabalhador e período). Reenviar não resolve.',
            passos: ['Concilie a competência com o eSocial para achar o recibo que vale.', 'Se o valor precisa mudar, gere uma retificação (indRetif 2) com esse recibo.'],
            acao: 'conciliar', rotuloAcao: 'Conciliar com o eSocial',
        }),
    },
    {
        id: 'recibo', teste: /recibo.{0,40}(nao|inval|inexist|incorret|diverg)|nrrecibo|nrrecevt/,
        diagnostico: () => ({
            causa: 'O recibo informado (retificação ou exclusão) não é o que está valendo no eSocial.',
            passos: ['Concilie a competência para obter o recibo vigente do evento.', 'Gere de novo a retificação ou a exclusão com esse recibo e transmita.'],
            acao: 'conciliar', rotuloAcao: 'Conciliar com o eSocial',
        }),
    },
    {
        id: 'demonstrativo', teste: /demonstrativo|idedmdev|dmdev/,
        diagnostico: (_o, tipo) => ({
            causa: tipo === 'S-1210' ? 'O pagamento (S-1210) aponta para um demonstrativo que o eSocial ainda não tem: o S-1200 desse demonstrativo não foi aceito.' : 'Problema no identificador do demonstrativo (ideDmDev).',
            passos: tipo === 'S-1210' ? ['Confirme que o S-1200 da competência do demonstrativo foi aceito.', 'Transmita o S-1210 depois do S-1200 aceito (o pré-voo já espera por ele).'] : ['Confira o ideDmDev do demonstrativo e gere o evento de novo.'],
            acao: tipo === 'S-1210' ? 'transmitir-s1200-antes' : 'gerar-de-novo', rotuloAcao: tipo === 'S-1210' ? 'Abrir o S-1200 da competência' : 'Gerar de novo',
        }),
    },
    {
        id: 'rubrica', teste: /rubrica|codrubr|idetabrubr|s-1010|tabela de rubricas/,
        diagnostico: () => ({
            causa: 'A rubrica usada não existe (ou não estava vigente) na tabela de rubricas da empresa no eSocial (S-1010).',
            passos: ['Em Cadastros › Incidências, confira a rubrica e a vigência.', 'Se faltar, cadastre-a no eSocial (S-1010) antes; depois transmita de novo.'],
            acao: 'cadastro-rubrica', rotuloAcao: 'Cadastros › Incidências',
        }),
    },
    {
        id: 'trabalhador', teste: /(trabalhador|vinculo|matricula|cpf).{0,50}(nao|sem).{0,20}(cadastr|encontr|localiz|exist)|s-2200|s-2300|admissao.{0,30}nao/,
        diagnostico: () => ({
            causa: 'O eSocial não reconhece o vínculo do trabalhador (admissão S-2200/S-2300 ausente, matrícula ou CPF diferentes).',
            passos: ['Confira CPF e matrícula do eSocial na ficha (Cadastros › Funcionários).', 'Se a admissão não foi transmitida, transmita-a antes; depois envie de novo.'],
            acao: 'cadastro-trabalhador', rotuloAcao: 'Cadastros › Funcionários',
        }),
    },
    {
        id: 'empresa', teste: /(empregador|contribuinte|estabelecimento|lotacao|codlotacao|s-1000|s-1005|s-1020).{0,60}(nao|sem|inval|inexist)/,
        diagnostico: () => ({
            causa: 'Falta ou está inválido um cadastro da empresa no eSocial (empregador S-1000, estabelecimento S-1005 ou lotação S-1020).',
            passos: ['Confira estabelecimento e lotação nos parâmetros do eSocial da empresa.', 'Se a tabela não existe no eSocial, ela precisa ser enviada antes.'],
            acao: 'cadastro-empresa', rotuloAcao: 'Cadastros › Enquadramento',
        }),
    },
    {
        id: 'certificado', teste: /certificad|assinatura|procurac|nao (esta )?autoriz|sem permiss|perfil/,
        diagnostico: () => ({
            causa: 'O certificado ou a procuração eletrônica não autorizam este envio para a empresa.',
            passos: ['Confira no cofre o certificado da empresa e a validade.', 'Com o certificado do escritório, a procuração no e-CAC precisa cobrir o eSocial.'],
            acao: 'cofre', rotuloAcao: 'Empresas › Certificados',
        }),
    },
    {
        id: 'schema', teste: /schema|xsd|estrutura do xml|xml (mal|inval)|leiaute|layout/,
        diagnostico: () => ({
            causa: 'O XML não passou na estrutura do leiaute do eSocial.',
            passos: ['Gere o evento de novo: o pré-voo do Consultor valida pelo XSD oficial e aponta o campo.', 'Se o leiaute mudou, veja o monitor de leiaute na Saúde do eSocial.'],
            acao: 'gerar-de-novo', rotuloAcao: 'Gerar de novo',
        }),
    },
];

export function diagnosticar(o: Ocorrencia, tipoEvento: string): Diagnostico {
    const t = sem(`${o.descricao} ${o.localizacao}`);
    for (const r of REGRAS) if (r.teste.test(t)) return { regra: r.id, ...r.diagnostico(o, tipoEvento) };
    return {
        regra: 'desconhecida', causa: 'Ocorrência sem regra conhecida no Consultor.',
        passos: ['Peça o diagnóstico da MIA (sugestão para conferir).', 'Corrija na origem e transmita de novo pelo pré-voo.'],
        acao: 'mia', rotuloAcao: 'Perguntar à MIA',
    };
}

/** Pergunta à MIA sobre uma ocorrência (sem CPF: a MIA mascara). */
export function perguntaParaMia(o: Ocorrencia, tipoEvento: string, perApur: string | null): string {
    return [
        `O eSocial recusou um evento ${tipoEvento}${perApur ? ` da competência ${perApur}` : ''} com a ocorrência ${o.codigo}: "${o.descricao}"${o.localizacao ? ` (localização: ${o.localizacao})` : ''}.`,
        'Explique em português simples a causa provável e os passos para corrigir no Consultor DP (sem inventar códigos; se não tiver certeza, diga). Não aplique nada: é uma sugestão para a equipe conferir.',
    ].join(' ');
}
