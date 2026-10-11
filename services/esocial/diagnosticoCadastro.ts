// services/esocial/diagnosticoCadastro.ts
//
// Diagnóstico do cadastro inteiro antes de gerar os eventos (o IOB Diagnóstico eSocial do SAGE): a empresa
// (CNPJ, parâmetros do eSocial da folha, enquadramento vigente, tabela de rubricas e de/para), cada trabalhador da
// competência (a mesma validação da ficha, o horário ligado e a matrícula), as rubricas vigentes (S-1010), os horários
// e os afastamentos do mês. Com erro, "não apto": o evento seria recusado pelo pré-voo ou pelo governo; os avisos não
// impedem. Junta as validações que já existem em cada cadastro, sem regra nova. Puro, sem Firebase.

import { cnpjValido } from '../cadastros/documentos';
import { validarFicha, type FichaFuncionario } from '../cadastros/funcionarios';
import { conferirHorasSemanais, validarHorario, type Horario } from '../cadastros/horarios';
import { validarAfastamento, type Afastamento } from '../cadastros/afastamentos';
import { vigenciaEm, type Rubrica } from '../cadastros/rubricas';
import { enquadramentoVigente, type Enquadramento } from '../cadastros/enquadramento';
import { noMes } from '../calculo/motorMensal';
import { validarDados } from './tabelaRubricas';
import type { ParametrosEsocialFolha } from './eventosFolha';
import { validarInicios, type IniciosObrigacoes } from '../empresas/inicioObrigacoes';

export type AreaDiagnostico = 'Empresa' | 'Trabalhador' | 'Rubrica' | 'Horário' | 'Afastamento';
export const AREAS_DIAGNOSTICO: AreaDiagnostico[] = ['Empresa', 'Trabalhador', 'Rubrica', 'Horário', 'Afastamento'];
export interface ItemDiagnostico { area: AreaDiagnostico; alvo: string; nivel: 'erro' | 'aviso'; mensagem: string }
export interface DiagnosticoCadastro {
    apto: boolean;
    itens: ItemDiagnostico[];
    porArea: Record<AreaDiagnostico, { verificados: number; erros: number; avisos: number }>;
}

export interface EntradaDiagnostico {
    competencia: string;
    empresa: { id: string; cnpj: string; esocialFolha?: ParametrosEsocialFolha; inicios?: IniciosObrigacoes };
    fichas: FichaFuncionario[];
    rubricas: Rubrica[];
    horarios: Horario[];
    afastamentos: Afastamento[];
    enquadramentos: Enquadramento[];
}

const br = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const ultimoDia = (c: string) => { const [a, m] = c.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };

export function diagnosticarCadastro(e: EntradaDiagnostico): DiagnosticoCadastro {
    const itens: ItemDiagnostico[] = [];
    const porArea = Object.fromEntries(AREAS_DIAGNOSTICO.map(a => [a, { verificados: 0, erros: 0, avisos: 0 }])) as DiagnosticoCadastro['porArea'];
    const add = (area: AreaDiagnostico, alvo: string, nivel: 'erro' | 'aviso', mensagens: string[]) => {
        for (const mensagem of mensagens) { itens.push({ area, alvo, nivel, mensagem }); porArea[area][nivel === 'erro' ? 'erros' : 'avisos']++; }
    };
    const c = e.competencia;

    // Empresa: CNPJ, parâmetros do eSocial da folha, enquadramento (S-1000/S-1005) e a tabela de rubricas.
    porArea.Empresa.verificados = 1;
    const cnpj = e.empresa.cnpj.replace(/\D/g, '');
    if (!cnpjValido(cnpj)) add('Empresa', 'CNPJ', 'erro', [`CNPJ ${e.empresa.cnpj} inválido.`]);
    const p = e.empresa.esocialFolha;
    if (!p || !/^\d{14}$/.test(p.nrInscEstab ?? '') || !(p.codLotacao ?? '').trim()) add('Empresa', 'Parâmetros do eSocial da folha', 'erro', ['Estabelecimento e lotação do S-1200 não gravados (Cálculo › S-1200 e S-1210 › parâmetros).']);
    // Início da DCTFWeb e do FGTS Digital (Cadastros › Enquadramento).
    const inicios = validarInicios(e.empresa.inicios ?? {});
    add('Empresa', 'Início das obrigações', 'erro', inicios.erros);
    add('Empresa', 'Início das obrigações', 'aviso', inicios.avisos);
    const enq = enquadramentoVigente(e.enquadramentos, e.empresa.id, c);
    if (!('enquadramento' in enq)) add('Empresa', 'Enquadramento', 'erro', [enq.erro]);
    const vigentes = e.rubricas.filter(r => vigenciaEm(r, c));
    if (!vigentes.length) add('Empresa', 'Tabela de rubricas', 'erro', [`Nenhuma rubrica (S-1010) vigente em ${br(c)}: importe ou gere a tabela de rubricas.`]);
    else if (p) {
        const porChave = new Map(e.rubricas.map(r => [`${r.ideTabRubr}|${r.codRubr}`, r]));
        for (const [verba, rub] of Object.entries(p.rubricas ?? {})) {
            const r = porChave.get(`${rub.ideTabRubr}|${rub.codRubr}`);
            if (!r) add('Empresa', `De/para ${verba}`, 'erro', [`A verba ${verba} aponta a rubrica ${rub.codRubr}, que não está no cadastro de rubricas.`]);
            else if (!vigenciaEm(r, c)) add('Empresa', `De/para ${verba}`, 'erro', [`A verba ${verba} aponta a rubrica ${rub.codRubr}, sem S-1010 vigente em ${br(c)}.`]);
        }
    }

    // Trabalhadores da competência: a validação da ficha, a matrícula do eSocial e o horário ligado.
    const daCompetencia = noMes(e.fichas.filter(f => f.empresaId === e.empresa.id), c);
    const horarioDe = (cod: string) => e.horarios.find(h => h.codigo === cod || h.id === cod);
    for (const f of daCompetencia) {
        porArea.Trabalhador.verificados++;
        const alvo = `${f.dados.nome || f.cpf} (matr. ${f.matriculaEsocial || '—'})`;
        const v = validarFicha(f);
        add('Trabalhador', alvo, 'erro', v.erros);
        add('Trabalhador', alvo, 'aviso', v.avisos);
        if (!f.matriculaEsocial.trim()) add('Trabalhador', alvo, 'erro', ['Sem a matrícula do eSocial (a do S-2200).']);
        if (f.dados.horario) {
            const h = horarioDe(f.dados.horario);
            if (!h) add('Trabalhador', alvo, 'erro', [`Horário ${f.dados.horario} não cadastrado em Cadastros › Horários.`]);
            else { const dif = conferirHorasSemanais(f.dados.horasSemanais, h); if (dif) add('Trabalhador', alvo, 'aviso', [dif]); }
        }
    }

    // Rubricas vigentes: os dados do S-1010 (natureza, tipo, incidências).
    for (const r of vigentes) {
        porArea.Rubrica.verificados++;
        add('Rubrica', `${r.codRubr} ${vigenciaEm(r, c)!.dados.dscRubr}`, 'erro', validarDados(vigenciaEm(r, c)!.dados));
    }

    // Horários da empresa.
    for (const h of e.horarios.filter(x => x.empresaId === e.empresa.id)) {
        porArea['Horário'].verificados++;
        const v = validarHorario(h, e.horarios);
        add('Horário', `${h.codigo} ${h.descricao}`, 'erro', v.erros);
        add('Horário', `${h.codigo} ${h.descricao}`, 'aviso', v.avisos);
    }

    // Afastamentos que tocam a competência.
    const ini = `${c}-01`; const fim = ultimoDia(c);
    const fichaDe = new Map(e.fichas.map(f => [f.id, f]));
    for (const a of e.afastamentos.filter(x => x.dtInicio <= fim && (!x.dtFim || x.dtFim >= ini))) {
        porArea.Afastamento.verificados++;
        const f = fichaDe.get(a.fichaId);
        const v = validarAfastamento(a, f, e.afastamentos.filter(x => x.fichaId === a.fichaId && x.id !== a.id));
        const alvo = `${f?.dados.nome || a.cpf} · motivo ${a.motivo} desde ${a.dtInicio.split('-').reverse().join('/')}`;
        add('Afastamento', alvo, 'erro', v.erros);
        add('Afastamento', alvo, 'aviso', v.avisos);
    }

    const ordem = (x: ItemDiagnostico) => `${x.nivel === 'erro' ? 0 : 1}|${AREAS_DIAGNOSTICO.indexOf(x.area)}|${x.alvo}`;
    itens.sort((a, b) => ordem(a).localeCompare(ordem(b), 'pt-BR'));
    return { apto: !itens.some(x => x.nivel === 'erro'), itens, porArea };
}

/** Linhas da planilha (Excel) do diagnóstico. */
export function planilhaDiagnostico(d: DiagnosticoCadastro, competencia: string): (string | number)[][] {
    return [[`Diagnóstico do cadastro · ${br(competencia)}`, d.apto ? 'APTO' : 'NÃO APTO'], [],
        ['Situação', 'Área', 'Onde', 'O que corrigir'], ...d.itens.map(x => [x.nivel === 'erro' ? 'Erro' : 'Aviso', x.area, x.alvo, x.mensagem])];
}
