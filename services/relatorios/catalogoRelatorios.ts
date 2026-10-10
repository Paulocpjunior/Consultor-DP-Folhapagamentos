// services/relatorios/catalogoRelatorios.ts
//
// Central de relatórios: os modelos do menu Relatórios do SAGE (Mensais, Funcionários, Férias) montados
// com os dados do Consultor. Os da folha usam a folha GRAVADA do mês (a que vale, a mesma do Fim de mês).
// Aqui fica a parte pura: cada modelo devolve a tabela; o PDF sai no layout padrão (layoutPdf.ts).

import type { ResultadoCalculo } from '../calculo/motorMensal';
import { noMes } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { MOTIVOS_DESLIGAMENTO } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { centavosDeTexto } from '../cadastros/documentos';
import { periodosFerias, prazosFuncionarios } from '../prazos/prazosFuncionarios';
import type { TabelaRelatorio } from './layoutPdf';
import type { TabelaLegal } from '../cadastros/tabelasLegais';
import type { Enquadramento } from '../cadastros/enquadramento';
import type { Movimento } from '../calculo/motorMensal';
import { calcularProvisao, totalSaldo, type Movimentacao, type Provisao } from '../calculo/provisoes';

export type GrupoRelatorio = 'Mensais' | 'Funcionários' | 'Férias' | 'Anuais';
export type TipoRelatorio = 'tabela' | 'holerites' | 'resumo' | 'adiantamento' | 'ficha-financeira' | 'aviso-ferias' | 'informe';

export interface ContextoRelatorio {
    competencia: string;
    hoje: string;
    fichas: FichaFuncionario[];
    afastamentos: Afastamento[];
    /** Holerites da folha gravada do mês (null: ainda não gravada). */
    folha: ResultadoCalculo[] | null;
    /** Para as provisões: tabelas legais, movimentos gravados (por ficha e competência) e enquadramentos. */
    calculo?: { empresaId: string; tabelas: TabelaLegal[]; movimentos: Record<string, Record<string, Movimento>>; enquadramentos: Enquadramento[] };
}

export interface DefRelatorio {
    id: string;
    grupo: GrupoRelatorio;
    titulo: string;
    descricao: string;
    tipo: TipoRelatorio;
    /** Precisa da folha gravada do mês. */
    precisaFolha: boolean;
    /** Precisa das tabelas legais, dos movimentos e do enquadramento (provisões). */
    precisaCalculo?: boolean;
    orientacao?: 'retrato' | 'paisagem';
    montar?: (c: ContextoRelatorio) => TabelaRelatorio;
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d ?? '');
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const somaV = (r: ResultadoCalculo, ...codigos: string[]) => r.verbas.filter(v => codigos.includes(v.codigo)).reduce((s, v) => s + v.valor, 0);
const INSS = ['INSS', 'INSS13', 'INSSFER', 'INSSFERRET'];
const IRRF = ['IRRF', 'IRRF13', 'IRRFFER', 'IRRFFERRET'];
const porNome = <T extends { nome: string }>(l: T[]) => [...l].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const validos = (f: ResultadoCalculo[] | null) => porNome((f ?? []).filter(r => r.situacao !== 'erro'));
const ultimoDia = (c: string) => { const [a, m] = c.split('-').map(Number); return `${c}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`; };

function folhaAnalitica(c: ContextoRelatorio): TabelaRelatorio {
    const porId = new Map(c.fichas.map(f => [f.id, f]));
    const rs = validos(c.folha);
    const t = { prov: 0, desc: 0, liq: 0, bInss: 0, inss: 0, bIr: 0, ir: 0, fgts: 0 };
    const linhas = rs.map(r => {
        const f = porId.get(r.fichaId);
        const inss = somaV(r, ...INSS); const ir = somaV(r, ...IRRF);
        t.prov += r.totais.proventos; t.desc += r.totais.descontos; t.liq += r.totais.liquido; t.bInss += r.bases.inss; t.inss += inss; t.bIr += r.bases.irrf; t.ir += ir; t.fgts += r.fgts;
        return [f?.matriculaEsocial ?? '', r.nome, brl(centavosDeTexto(f?.dados.salario ?? '') ?? 0), brl(r.totais.proventos), brl(r.totais.descontos), brl(r.totais.liquido), brl(r.bases.inss), brl(inss), brl(r.bases.irrf), brl(ir), brl(r.fgts)];
    });
    return {
        colunas: [{ titulo: 'Matr.', largura: 16 }, { titulo: 'Funcionário' }, ...['Salário-base', 'Proventos', 'Descontos', 'Líquido', 'Base INSS', 'INSS', 'Base IRRF', 'IRRF', 'FGTS'].map(titulo => ({ titulo, alinhar: 'direita' as const, largura: 23 }))],
        linhas,
        totais: ['', `${rs.length} funcionário(s)`, '', brl(t.prov), brl(t.desc), brl(t.liq), brl(t.bInss), brl(t.inss), brl(t.bIr), brl(t.ir), brl(t.fgts)],
    };
}

function relacaoBancaria(c: ContextoRelatorio): TabelaRelatorio {
    const porId = new Map(c.fichas.map(f => [f.id, f]));
    const rs = validos(c.folha).filter(r => r.totais.liquido > 0);
    let total = 0; let semConta = 0;
    const linhas = rs.map(r => {
        const d = porId.get(r.fichaId)?.dados ?? {};
        total += r.totais.liquido;
        if (!d.conta && !d.pix) semConta++;
        return [r.nome, cpfFmt(porId.get(r.fichaId)?.cpf ?? ''), d.banco ?? '', d.agencia ?? '', d.conta ?? '', d.tipoConta ?? '', d.pix ?? '', brl(r.totais.liquido)];
    });
    return {
        colunas: [{ titulo: 'Funcionário' }, { titulo: 'CPF', largura: 26 }, { titulo: 'Banco', largura: 14 }, { titulo: 'Agência', largura: 16 }, { titulo: 'Conta', largura: 22 }, { titulo: 'Tipo', largura: 18 }, { titulo: 'PIX', largura: 30 }, { titulo: 'Líquido', alinhar: 'direita', largura: 22 }],
        linhas, totais: [`${rs.length} crédito(s)`, '', '', '', '', '', '', brl(total)],
        ...(semConta ? { observacao: `${semConta} funcionário(s) sem conta nem PIX na ficha (Cadastros › Funcionários › Outros).` } : {}),
    };
}

function admitidosDemitidos(c: ContextoRelatorio): TabelaRelatorio {
    const motivo = (m?: string) => MOTIVOS_DESLIGAMENTO.find(([k]) => k === m)?.[1] ?? m ?? '';
    const linhas: string[][] = [];
    for (const f of c.fichas) {
        const d = f.dados;
        if (d.admissao?.startsWith(c.competencia)) linhas.push(['Admissão', br(d.admissao), d.nome ?? '', cpfFmt(f.cpf), d.cargo ?? '', '']);
        if (d.dataDesligamento?.startsWith(c.competencia)) linhas.push(['Desligamento', br(d.dataDesligamento), d.nome ?? '', cpfFmt(f.cpf), d.cargo ?? '', motivo(d.motivoDesligamento)]);
    }
    linhas.sort((a, b) => a[1].split('/').reverse().join('').localeCompare(b[1].split('/').reverse().join('')));
    return { colunas: [{ titulo: 'Movimento', largura: 24 }, { titulo: 'Data', largura: 20 }, { titulo: 'Funcionário' }, { titulo: 'CPF', largura: 26 }, { titulo: 'Cargo' }, { titulo: 'Motivo' }], linhas };
}

function funcionarios(c: ContextoRelatorio): TabelaRelatorio {
    const ult = ultimoDia(c.competencia);
    const afastado = (f: FichaFuncionario) => c.afastamentos.some(a => a.fichaId === f.id && a.dtInicio <= ult && (!a.dtFim || a.dtFim >= ult));
    const lista = porNome(noMes(c.fichas, c.competencia).map(f => ({ f, nome: f.dados.nome || f.cpf })));
    return {
        colunas: [{ titulo: 'Matr.', largura: 16 }, { titulo: 'Funcionário' }, { titulo: 'CPF', largura: 26 }, { titulo: 'Admissão', largura: 20 }, { titulo: 'Cargo' }, { titulo: 'CBO', largura: 14 }, { titulo: 'Salário', alinhar: 'direita', largura: 22 }, { titulo: 'Situação', largura: 22 }],
        linhas: lista.map(({ f, nome }) => [f.matriculaEsocial, nome, cpfFmt(f.cpf), br(f.dados.admissao), f.dados.cargo ?? '', f.dados.cbo ?? '', brl(centavosDeTexto(f.dados.salario ?? '') ?? 0),
            f.dados.dataDesligamento && f.dados.dataDesligamento <= ult ? 'Desligado' : afastado(f) ? 'Afastado' : 'Ativo']),
        totais: ['', `${lista.length} funcionário(s)`, '', '', '', '', '', ''],
    };
}

function feriasAVencer(c: ContextoRelatorio): TabelaRelatorio {
    const linhas: { nome: string; l: string[]; ordem: string }[] = [];
    for (const f of noMes(c.fichas, c.competencia)) {
        if (!f.dados.admissao || f.dados.dataDesligamento) continue;
        const gozos = c.afastamentos.filter(a => a.fichaId === f.id && a.motivo === '15');
        for (const p of periodosFerias(f.dados.admissao, c.hoje, gozos)) {
            if (p.completo) continue;
            const situacao = p.fimConcessivo < c.hoje ? 'Vencidas (dobra)' : p.fim < c.hoje ? 'A vencer' : 'Em aquisição';
            linhas.push({ nome: f.dados.nome || f.cpf, ordem: p.inicioGozoAte, l: [f.dados.nome || f.cpf, `${br(p.inicio)} a ${br(p.fim)}`, br(p.fimConcessivo), br(p.inicioGozoAte), String(p.diasGozados), situacao] });
        }
    }
    linhas.sort((a, b) => a.ordem.localeCompare(b.ordem));
    return {
        colunas: [{ titulo: 'Funcionário' }, { titulo: 'Período aquisitivo', largura: 42 }, { titulo: 'Fim do concessivo', largura: 28 }, { titulo: 'Iniciar o gozo até', largura: 28 }, { titulo: 'Dias gozados', alinhar: 'direita', largura: 22 }, { titulo: 'Situação', largura: 28 }],
        linhas: linhas.map(x => x.l),
        observacao: 'Pelos gozos lançados em Cadastros › Afastamentos (motivo 15). Vencidas: pagamento em dobro dos dias fora do concessivo (CLT, art. 137).',
    };
}

function contratosExperiencia(c: ContextoRelatorio): TabelaRelatorio {
    const ate = `${Number(c.hoje.slice(0, 4)) + 1}${c.hoje.slice(4)}`;
    const prazos = prazosFuncionarios(c.fichas, c.afastamentos, c.hoje, ate).filter(p => p.tipo === 'contrato').sort((a, b) => a.data.localeCompare(b.data));
    const porId = new Map(c.fichas.map(f => [f.id, f]));
    return {
        colunas: [{ titulo: 'Funcionário' }, { titulo: 'Admissão', largura: 22 }, { titulo: 'Fim do contrato', largura: 26 }, { titulo: 'Prazo', largura: 50 }, { titulo: 'Situação', largura: 24 }],
        linhas: prazos.map(p => [p.nome ?? '', br(porId.get(p.fichaId ?? '')?.dados.admissao), br(p.data), p.titulo, p.gravidade === 'vencido' ? 'Vencido' : p.gravidade === 'urgente' ? 'Urgente' : 'No prazo']),
        observacao: 'Contrato de experiência: até 90 dias, prorrogável uma vez dentro desse limite (CLT, arts. 445 e 451).',
    };
}

function aniversariantes(c: ContextoRelatorio): TabelaRelatorio {
    const mes = c.competencia.slice(5, 7);
    const lista = noMes(c.fichas, c.competencia).filter(f => f.dados.nascimento?.slice(5, 7) === mes && !f.dados.dataDesligamento)
        .sort((a, b) => (a.dados.nascimento ?? '').slice(8).localeCompare((b.dados.nascimento ?? '').slice(8)));
    return { colunas: [{ titulo: 'Dia', largura: 14 }, { titulo: 'Funcionário' }, { titulo: 'Cargo' }], linhas: lista.map(f => [(f.dados.nascimento ?? '').slice(8, 10), f.dados.nome ?? '', f.dados.cargo ?? '']) };
}

// ---------- Provisões de férias e 13º (services/calculo/provisoes.ts) ----------

const provisaoDo = (c: ContextoRelatorio): Provisao | null => (c.calculo ? calcularProvisao({ competencia: c.competencia, fichas: c.fichas, afastamentos: c.afastamentos, ...c.calculo }) : null);
const sinal = (v: number) => (v < 0 ? `(${brl(-v)})` : brl(v));

function tabelaProvisao(c: ContextoRelatorio, qual: 'ferias' | 'decimo'): TabelaRelatorio {
    const p = provisaoDo(c);
    const colunas = [{ titulo: 'Funcionário' }, { titulo: 'Remuneração', alinhar: 'direita' as const, largura: 24 }, { titulo: qual === 'ferias' ? 'Vencidos / avos' : 'Avos', largura: qual === 'ferias' ? 24 : 14 },
        { titulo: 'Saldo anterior', alinhar: 'direita' as const, largura: 24 }, { titulo: 'Constituição', alinhar: 'direita' as const, largura: 24 }, { titulo: 'Baixas', alinhar: 'direita' as const, largura: 22 },
        { titulo: 'Saldo atual', alinhar: 'direita' as const, largura: 24 }, { titulo: 'INSS', alinhar: 'direita' as const, largura: 20 }, { titulo: 'FGTS', alinhar: 'direita' as const, largura: 20 }, { titulo: 'Total', alinhar: 'direita' as const, largura: 24 }];
    if (!p) return { colunas, linhas: [], observacao: 'Carregando as tabelas, os movimentos e o enquadramento…' };
    const linha = (nome: string, rem: string, ref: string, m: Movimentacao) => [nome, rem, ref, sinal(m.anterior.principal), sinal(m.constituicao.principal), brl(m.baixa.principal), brl(m.atual.principal), brl(m.atual.inss), brl(m.atual.fgts), brl(totalSaldo(m.atual))];
    const validas = p.linhas.filter(l => !l.erro);
    const linhas = validas.map(l => linha(`${l.nome}${l.situacao === 'desligado' ? ' (desligado)' : l.situacao === 'admitido' ? ' (admitido)' : ''}`, brl(l.remuneracao),
        qual === 'ferias' ? `${l.diasVencidos} d · ${l.avosFerias}/12` : `${l.avos13}/12`, l[qual]));
    const t = p.totais[qual];
    const enc = (k: 'inss' | 'fgts') => `${sinal(t.constituicao[k])} (baixa ${brl(t.baixa[k])})`;
    const nome = qual === 'ferias' ? 'férias e 1/3' : '13º salário';
    return {
        colunas, linhas, totais: linha(`Total (${validas.length})`, '', '', t),
        observacao: [
            `Método do saldo: saldo anterior + constituição − baixas = saldo atual, no fim de ${c.competencia.split('-').reverse().join('/')}. Valores entre parênteses: reversão.`,
            qual === 'ferias' ? 'Férias vencidas (em dobro fora do concessivo, sem encargos) e proporcionais (15 dias ou mais no mês), com 1/3, pela remuneração do fim do mês (salário, adicional de risco e média das variáveis). Baixa: gozos e abonos que começam no mês e desligamentos.'
                : '13º pelos avos do ano (15 dias ou mais no mês) e a remuneração do fim do mês. A 1ª parcela é adiantamento e não baixa a provisão; a baixa é em dezembro e nos desligamentos.',
            `Encargos: ${p.encargos?.memoria ?? 'sem enquadramento vigente (Cadastros › Enquadramento): INSS patronal 0%'}.`,
            `Lançamento do mês — ${nome}: constituição ${sinal(t.constituicao.principal)}, baixa ${brl(t.baixa.principal)}; INSS ${enc('inss')}; FGTS ${enc('fgts')}.`,
            ...p.avisos,
        ].join(' '),
    };
}

export const RELATORIOS: DefRelatorio[] = [
    { id: 'folha-analitica', grupo: 'Mensais', titulo: 'Folha mensal (analítica)', descricao: 'Proventos, descontos, líquido, bases e encargos de cada funcionário, com os totais.', tipo: 'tabela', precisaFolha: true, orientacao: 'paisagem', montar: folhaAnalitica },
    { id: 'holerites', grupo: 'Mensais', titulo: 'Holerites', descricao: 'Recibo de pagamento de cada funcionário, para assinatura.', tipo: 'holerites', precisaFolha: true },
    { id: 'resumo', grupo: 'Mensais', titulo: 'Resumo da folha', descricao: 'Totais por verba e o quadro para conferir as guias.', tipo: 'resumo', precisaFolha: true },
    { id: 'relacao-bancaria', grupo: 'Mensais', titulo: 'Relação bancária (crédito em conta)', descricao: 'Líquido de cada funcionário com banco, agência, conta e PIX.', tipo: 'tabela', precisaFolha: true, orientacao: 'paisagem', montar: relacaoBancaria },
    { id: 'provisao-ferias', grupo: 'Mensais', titulo: 'Provisão de férias', descricao: 'Saldo de férias (vencidas, em dobro e proporcionais, com 1/3) de cada funcionário no fim do mês, com INSS patronal e FGTS, e o movimento do mês para a contabilidade.', tipo: 'tabela', precisaFolha: false, precisaCalculo: true, orientacao: 'paisagem', montar: c => tabelaProvisao(c, 'ferias') },
    { id: 'provisao-13', grupo: 'Mensais', titulo: 'Provisão de 13º salário', descricao: 'Saldo do 13º (avos do ano) de cada funcionário no fim do mês, com INSS patronal e FGTS, e o movimento do mês para a contabilidade.', tipo: 'tabela', precisaFolha: false, precisaCalculo: true, orientacao: 'paisagem', montar: c => tabelaProvisao(c, 'decimo') },
    { id: 'admitidos-demitidos', grupo: 'Mensais', titulo: 'Admitidos e demitidos', descricao: 'Admissões e desligamentos da competência.', tipo: 'tabela', precisaFolha: false, montar: admitidosDemitidos },
    { id: 'funcionarios', grupo: 'Funcionários', titulo: 'Relação de funcionários', descricao: 'Quem está na folha da competência, com cargo, salário e situação.', tipo: 'tabela', precisaFolha: false, orientacao: 'paisagem', montar: funcionarios },
    { id: 'experiencia', grupo: 'Funcionários', titulo: 'Contratos de experiência', descricao: 'Fim dos contratos de experiência e por prazo determinado.', tipo: 'tabela', precisaFolha: false, montar: contratosExperiencia },
    { id: 'aniversariantes', grupo: 'Funcionários', titulo: 'Aniversariantes do mês', descricao: 'Para o cliente lembrar a equipe.', tipo: 'tabela', precisaFolha: false, montar: aniversariantes },
    { id: 'aviso-ferias', grupo: 'Férias', titulo: 'Aviso de férias', descricao: 'Comunicado ao empregado (CLT, art. 135), dos gozos que começam na competência ou no mês seguinte, com o ciente.', tipo: 'aviso-ferias', precisaFolha: false },
    { id: 'ferias-vencer', grupo: 'Férias', titulo: 'Férias a vencer e vencidas', descricao: 'Períodos aquisitivos em aberto e o último dia para iniciar o gozo.', tipo: 'tabela', precisaFolha: false, orientacao: 'paisagem', montar: feriasAVencer },
    { id: 'ficha-financeira', grupo: 'Anuais', titulo: 'Ficha financeira', descricao: 'O ano de cada funcionário mês a mês e verba a verba, com totais, bases e FGTS, pelas folhas gravadas.', tipo: 'ficha-financeira', precisaFolha: false, orientacao: 'paisagem' },
    { id: 'informe', grupo: 'Anuais', titulo: 'Informe de rendimentos', descricao: 'Comprovante de rendimentos pagos e de IRRF (IN RFB 2.060/2021) de cada trabalhador, pelos S-5002 do ano-calendário baixados do eSocial.', tipo: 'informe', precisaFolha: false },
];

export const GRUPOS_RELATORIO: GrupoRelatorio[] = ['Mensais', 'Funcionários', 'Férias', 'Anuais'];
