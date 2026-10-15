// services/cadastros/cargos.ts
//
// Cadastro de Cargos do IOB SAGE (Arquivos › Cargos / Carreira › Cargos), por empresa: código, nome do cargo,
// descrição para os relatórios, validade, inativo, os dados do cargo/emprego público, CBO, função e as atividades
// desempenhadas. A ficha do funcionário escolhe o cargo pelo código (o "Código do cargo IOB") e recebe dele o nome
// e o CBO, que vão ao S-2200/S-2206 (nmCargo e CBOCargo).
//
// O eSocial S-1.x não tem mais a tabela de cargos (o S-1030 saiu): o cadastro é do Consultor, como no SAGE, e o
// que vai ao governo continua saindo da ficha. Escolher o cargo na ficha só troca os campos dela quando a pessoa
// escolhe; o cadastro não muda ficha já gravada sozinho (as diferenças aparecem na tela de Cargos).

import type { FichaFuncionario } from './funcionarios';
import type { TabelaLida } from './cargaBackupIob';

export interface Atividade { codigo: string; descricao: string }

export type SituacaoCargo = '' | '1' | '2' | '3';
export type AcumuloCargo = '' | '1' | '2' | '3' | '4';
export type TempoEspecial = '' | '1' | '2' | '3' | '4';

export interface Cargo {
    id: string;
    empresaId: string;
    /** Código do cargo (o do SAGE, ex.: 000001); é o "Código do cargo IOB" da ficha. */
    codigo: string;
    /** Nome do cargo (vai ao eSocial como nmCargo). */
    nome: string;
    /** Descrição para os relatórios (vazio = o nome). */
    descricao: string;
    inativo: boolean;
    /** Início e final da validade (AAAA-MM; final vazio = sem fim). */
    inicioValidade: string;
    finalValidade: string;
    /** Cargo/emprego público: lei de criação, situação, acúmulo, dedicação exclusiva e contagem de tempo especial. */
    cargoPublico: boolean;
    nrLei: string;
    dtLei: string;
    situacao: SituacaoCargo;
    acumulo: AcumuloCargo;
    dedicacaoExclusiva: '' | 'S' | 'N';
    tempoEspecial: TempoEspecial;
    /** CBO do cargo, 6 dígitos (vai ao eSocial como CBOCargo). */
    cbo: string;
    /** Função (texto livre, como na ficha). */
    funcao: string;
    atividades: Atividade[];
}

export const SITUACOES_CARGO: Record<Exclude<SituacaoCargo, ''>, string> = { 1: 'Criação', 2: 'Extinção', 3: 'Reestruturação' };
export const ACUMULOS_CARGO: Record<Exclude<AcumuloCargo, ''>, string> = { 1: 'Não acumulável', 2: 'Profissional de saúde', 3: 'Professor', 4: 'Técnico/científico' };
export const TEMPOS_ESPECIAIS: Record<Exclude<TempoEspecial, ''>, string> = { 1: 'Não', 2: 'Professor (infantil, fundamental e médio)', 3: 'Profissional de saúde', 4: 'Aposentadoria especial' };

export function cargoVazio(empresaId: string): Cargo {
    return {
        id: '', empresaId, codigo: '', nome: '', descricao: '', inativo: false, inicioValidade: '', finalValidade: '',
        cargoPublico: false, nrLei: '', dtLei: '', situacao: '', acumulo: '', dedicacaoExclusiva: '', tempoEspecial: '',
        cbo: '', funcao: '', atividades: [],
    };
}

/** Código do cargo como o SAGE mostra: só dígitos vira 6 dígitos (4 → 000004); com letras, em maiúsculas. */
export function normalizarCodigoCargo(c: string): string {
    const t = (c ?? '').trim().toUpperCase();
    return /^\d{1,6}$/.test(t) ? t.padStart(6, '0') : t;
}

export const idCargo = (empresaId: string, codigo: string) => `${empresaId}_${normalizarCodigoCargo(codigo)}`;

const mesValido = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const cboValido = (c: string) => /^\d{6}$/.test(c);
/** "4110-10" ou "411010" → "411010". */
export const normalizarCbo = (c: string) => (c ?? '').replace(/\D/g, '');
/** "411010" → "4110-10", como o SAGE mostra. */
export const cboFormatado = (c: string) => (cboValido(c) ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

export function validarCargo(c: Cargo, outros: Cargo[] = []): string[] {
    const erros: string[] = [];
    const codigo = normalizarCodigoCargo(c.codigo);
    if (!/^[A-Z0-9._-]{1,20}$/.test(codigo)) erros.push('Código do cargo: de 1 a 20 caracteres (letras, números, ponto, hífen ou sublinhado).');
    else if (outros.some(o => o.id !== c.id && normalizarCodigoCargo(o.codigo) === codigo)) erros.push(`Já existe o cargo ${codigo} nesta empresa.`);
    if (!c.nome.trim()) erros.push('Informe o nome do cargo.');
    else if (c.nome.trim().length > 100) erros.push('Nome do cargo: até 100 caracteres (limite do nmCargo no eSocial).');
    if (!cboValido(c.cbo)) erros.push('CBO do cargo: 6 dígitos (ex.: 4110-10).');
    if (c.inicioValidade && !mesValido(c.inicioValidade)) erros.push('Início da validade: mês no formato AAAA-MM.');
    if (c.finalValidade && !mesValido(c.finalValidade)) erros.push('Final da validade: mês no formato AAAA-MM.');
    if (c.inicioValidade && c.finalValidade && c.finalValidade < c.inicioValidade) erros.push('Final da validade antes do início.');
    if (c.cargoPublico) {
        if (!c.nrLei.trim()) erros.push('Cargo público: informe o número da lei que criou o cargo.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dtLei)) erros.push('Cargo público: informe a data da lei.');
        if (!c.situacao) erros.push('Cargo público: informe a situação (criação, extinção ou reestruturação).');
        if (!c.acumulo) erros.push('Cargo público: informe o acúmulo de cargos.');
    }
    c.atividades.forEach((a, i) => { if (!a.descricao.trim()) erros.push(`Atividade ${i + 1}: informe a descrição.`); });
    return erros;
}

/** Cargo pronto para gravar: código, CBO e textos acertados, sem atividade vazia. */
export function normalizarCargo(c: Cargo): Cargo {
    const codigo = normalizarCodigoCargo(c.codigo);
    return {
        ...c, id: idCargo(c.empresaId, codigo), codigo, nome: c.nome.trim().toUpperCase(), descricao: c.descricao.trim().toUpperCase(),
        cbo: normalizarCbo(c.cbo), funcao: c.funcao.trim().toUpperCase(), nrLei: c.nrLei.trim(),
        atividades: c.atividades.filter(a => a.codigo.trim() || a.descricao.trim()).map(a => ({ codigo: a.codigo.trim(), descricao: a.descricao.trim() })),
        ...(c.cargoPublico ? {} : { nrLei: '', dtLei: '', situacao: '' as const, acumulo: '' as const, dedicacaoExclusiva: '' as const, tempoEspecial: '' as const }),
    };
}

/** Cargo vigente na competência (AAAA-MM): ativo e dentro da validade. */
export const cargoVigente = (c: Cargo, competencia: string) => !c.inativo && (!c.inicioValidade || c.inicioValidade <= competencia) && (!c.finalValidade || competencia <= c.finalValidade);

/** O cargo da ficha, pelo código do cargo IOB. */
export function cargoDaFicha(cargos: Cargo[], d: Pick<FichaFuncionario['dados'], 'cargoIob'>): Cargo | undefined {
    const cod = d.cargoIob ? normalizarCodigoCargo(d.cargoIob) : '';
    return cod ? cargos.find(c => normalizarCodigoCargo(c.codigo) === cod) : undefined;
}

/** Campos da ficha que o cargo escolhido preenche: código, nome e CBO (e a função, se a ficha não tem). */
export function camposDoCargo(c: Cargo, d: Pick<FichaFuncionario['dados'], 'funcao'>): Partial<Record<'cargoIob' | 'cargo' | 'cbo' | 'funcao', string>> {
    return { cargoIob: c.codigo, cargo: c.nome, cbo: c.cbo, ...(c.funcao && !d.funcao?.trim() ? { funcao: c.funcao } : {}) };
}

export interface DivergenciaCargo { fichaId: string; nome: string; codigo: string; campo: 'cargo' | 'cbo' | 'codigo'; naFicha: string; noCadastro: string }

/** Fichas cujo cargo (código, nome ou CBO) não bate com o cadastro: a tela lista, ninguém muda sozinho. */
export function divergenciasDeCargo(fichas: Pick<FichaFuncionario, 'id' | 'cpf' | 'dados' | 'situacao'>[], cargos: Cargo[]): DivergenciaCargo[] {
    const r: DivergenciaCargo[] = [];
    for (const f of fichas) {
        if (f.situacao === 'desligado' || !f.dados.cargoIob?.trim()) continue;
        const nome = f.dados.nome || f.cpf;
        const c = cargoDaFicha(cargos, f.dados);
        if (!c) { r.push({ fichaId: f.id, nome, codigo: f.dados.cargoIob, campo: 'codigo', naFicha: f.dados.cargoIob, noCadastro: '' }); continue; }
        if ((f.dados.cargo ?? '').trim().toUpperCase() !== c.nome) r.push({ fichaId: f.id, nome, codigo: c.codigo, campo: 'cargo', naFicha: f.dados.cargo ?? '', noCadastro: c.nome });
        if (normalizarCbo(f.dados.cbo ?? '') !== c.cbo) r.push({ fichaId: f.id, nome, codigo: c.codigo, campo: 'cbo', naFicha: f.dados.cbo ?? '', noCadastro: c.cbo });
    }
    return r;
}

/** Funcionários ativos por código de cargo (para a contagem na tela). */
export function contarPorCargo(fichas: Pick<FichaFuncionario, 'dados' | 'situacao'>[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const f of fichas) {
        if (f.situacao === 'desligado' || !f.dados.cargoIob?.trim()) continue;
        const k = normalizarCodigoCargo(f.dados.cargoIob);
        m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
}

/**
 * Cargos que estão nas fichas (código do cargo IOB, nome e CBO) e ainda não estão no cadastro: para criar de uma vez.
 * Fichas com o mesmo código e nomes ou CBO diferentes ficam de fora, com aviso: a equipe decide qual é o certo.
 */
export function cargosDasFichas(fichas: Pick<FichaFuncionario, 'dados' | 'situacao'>[], cadastrados: Cargo[], empresaId: string): { cargos: Cargo[]; avisos: string[] } {
    const ja = new Set(cadastrados.map(c => normalizarCodigoCargo(c.codigo)));
    const porCodigo = new Map<string, { nomes: Set<string>; cbos: Set<string>; funcoes: Set<string> }>();
    for (const f of fichas) {
        const cod = f.dados.cargoIob ? normalizarCodigoCargo(f.dados.cargoIob) : '';
        if (!cod || ja.has(cod) || !/^[A-Z0-9._-]{1,20}$/.test(cod)) continue;
        const g = porCodigo.get(cod) ?? { nomes: new Set(), cbos: new Set(), funcoes: new Set() };
        if (f.dados.cargo?.trim()) g.nomes.add(f.dados.cargo.trim().toUpperCase());
        if (cboValido(normalizarCbo(f.dados.cbo ?? ''))) g.cbos.add(normalizarCbo(f.dados.cbo));
        if (f.dados.funcao?.trim()) g.funcoes.add(f.dados.funcao.trim().toUpperCase());
        porCodigo.set(cod, g);
    }
    const cargos: Cargo[] = []; const avisos: string[] = [];
    for (const [cod, g] of [...porCodigo].sort(([a], [b]) => a.localeCompare(b))) {
        if (g.nomes.size !== 1 || g.cbos.size !== 1) {
            const partes: string[] = [];
            if (g.nomes.size > 1) partes.push(`nomes diferentes nas fichas (${[...g.nomes].join(' / ')})`); else if (!g.nomes.size) partes.push('sem nome nas fichas');
            if (g.cbos.size > 1) partes.push(`CBOs diferentes nas fichas (${[...g.cbos].join(' / ')})`); else if (!g.cbos.size) partes.push('sem CBO válido nas fichas');
            avisos.push(`Cargo ${cod}: ${partes.join('; ')}; cadastre à mão.`);
            continue;
        }
        cargos.push(normalizarCargo({ ...cargoVazio(empresaId), codigo: cod, nome: [...g.nomes][0], cbo: [...g.cbos][0], funcao: g.funcoes.size === 1 ? [...g.funcoes][0] : '' }));
    }
    return { cargos, avisos };
}

const chave = (c: string) => c.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

/** Data do SAGE (AAAA-MM-DD, DD/MM/AAAA ou AAAAMMDD) → AAAA-MM; vazio se não der. */
function mesDoIob(v: string | null | undefined): string {
    const t = (v ?? '').trim();
    let m = /^(\d{4})-(\d{2})-\d{2}/.exec(t); if (m) return `${m[1]}-${m[2]}`;
    m = /^\d{2}\/(\d{2})\/(\d{4})/.exec(t); if (m) return `${m[2]}-${m[1]}`;
    m = /^(\d{4})(\d{2})\d{2}$/.exec(t); if (m) return `${m[1]}-${m[2]}`;
    return '';
}

/**
 * Tabela `cargos` do backup do SAGE → cargos do Consultor, só os que ainda não estão no cadastro (o que já está,
 * inclusive o digitado à mão, é mantido). Colunas: codcargo, cargo (ou descricao), cbo e, se houver, a validade
 * e o inativo. Sem CBO válido o cargo fica de fora, com aviso.
 */
export function cargosDoBackup(t: TabelaLida | null, empresaId: string, cadastrados: Cargo[] = []): { cargos: Cargo[]; avisos: string[] } {
    if (!t) return { cargos: [], avisos: [] };
    const idx = (...nomes: string[]) => t.colunas.findIndex(c => nomes.includes(chave(c)));
    const iCod = idx('codcargo', 'cdcargo', 'codigo');
    const iNome = idx('cargo', 'nomecargo', 'desccargo');
    const iDesc = idx('descricao', 'descrelatorio', 'descricaorelatorio');
    const iCbo = idx('cbo', 'codcbo');
    const iIni = idx('dtinivalid', 'inivalid', 'iniciovalidade', 'dtiniciovalidade', 'dtinicio');
    const iFim = idx('dtfimvalid', 'fimvalid', 'finalvalidade', 'dtfinalvalidade', 'dtfim');
    const iInat = idx('inativo');
    const iFun = idx('funcao', 'nomefuncao');
    if (iCod < 0) return { cargos: [], avisos: ['Tabela cargos do backup sem a coluna do código (codcargo).'] };
    const ja = new Set(cadastrados.map(c => normalizarCodigoCargo(c.codigo)));
    const cargos: Cargo[] = []; const avisos: string[] = []; const vistos = new Set<string>();
    for (const l of t.linhas) {
        const v = (i: number) => (i >= 0 ? (l[i] ?? '').trim() : '');
        const codigo = normalizarCodigoCargo(v(iCod));
        if (!codigo || ja.has(codigo) || vistos.has(codigo)) continue;
        vistos.add(codigo);
        const nome = v(iNome) || v(iDesc);
        const cbo = normalizarCbo(v(iCbo));
        if (!nome) { avisos.push(`Cargo ${codigo} do backup sem nome: fora.`); continue; }
        if (!cboValido(cbo)) { avisos.push(`Cargo ${codigo} (${nome}) do backup sem CBO válido: cadastre à mão.`); continue; }
        const inativo = /^(s|t|true|1|sim)$/i.test(v(iInat));
        cargos.push(normalizarCargo({
            ...cargoVazio(empresaId), codigo, nome, descricao: v(iDesc) && v(iDesc) !== nome ? v(iDesc) : '', cbo, inativo,
            inicioValidade: mesDoIob(v(iIni)), finalValidade: mesDoIob(v(iFim)), funcao: /[a-zA-ZÀ-ú]{3}/.test(v(iFun)) ? v(iFun) : '',
        }));
    }
    return { cargos, avisos };
}
