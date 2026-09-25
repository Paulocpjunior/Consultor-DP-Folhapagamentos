/** Importação local: nunca transmite eventos ou escreve no cadastro operacional. */
export const CAMPOS = {
    mae: 'Nome da mãe', pai: 'Nome do pai', pis: 'PIS/PASEP', ctps: 'CTPS', serieCtps: 'Série CTPS', rg: 'Identidade (RG/CIN)',
    naturalidade: 'Naturalidade', ufCtps: 'UF CTPS', orgaoRg: 'Órgão/UF da identidade', emissaoRg: 'Emissão da identidade',
    tituloEleitor: 'Título eleitoral', zonaEleitoral: 'Zona eleitoral', secaoEleitoral: 'Seção eleitoral',
    documentoMilitar: 'Documento militar', opcaoFgts: 'Opção FGTS', cadastroPis: 'Cadastro PIS',
    dependentes: 'Dependentes (dados do XML)', deficiencia: 'Informações de deficiência (XML)', enderecoExterior: 'Endereço no exterior (XML)',
    nome: 'Nome', nascimento: 'Nascimento', admissao: 'Admissão', sexo: 'Sexo',
    estadoCivil: 'Estado civil (eSocial)', raca: 'Raça/cor (eSocial)', escolaridade: 'Escolaridade (eSocial)',
    nacionalidade: 'Nacionalidade (eSocial)', paisNascimento: 'País de nascimento',
    logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento', bairro: 'Bairro',
    cep: 'CEP', municipio: 'Município (IBGE)', uf: 'UF', telefone: 'Telefone', email: 'E-mail',
    cargo: 'Cargo', cbo: 'CBO', categoria: 'Categoria eSocial', salario: 'Salário fixo (decimal com ponto)',
    unidadeSalario: 'Unidade salarial (eSocial)', horasSemanais: 'Horas semanais', jornada: 'Descrição da jornada',
    tipoContrato: 'Tipo de contrato (eSocial)', fimContrato: 'Fim do contrato', sindicato: 'CNPJ do sindicato',
    estabelecimento: 'Inscrição do local de trabalho', regimeTrabalhista: 'Regime trabalhista', regimePrevidenciario: 'Regime previdenciário',
    matriculaIob: 'Matrícula para IOB (original do eSocial)', departamentoIob: 'Departamento IOB',
    cargoIob: 'Código do cargo IOB', sindicatoIob: 'Código do sindicato IOB',
    funcao: 'Função', horarioTrabalho: 'Horário de trabalho (ficha)', horarioIntervalo: 'Horário de intervalo (ficha)',
} as const;
export type Campo = keyof typeof CAMPOS;
export type Dados = Partial<Record<Campo, string>>;
export interface FonteXml { nome: string; xml: string; hash: string }
export interface Evento {
    id: string; tipo: string; empregador: string; tpInsc: string; cpf: string; matricula: string;
    data: string; recibo: string; retifica: string; exclui: string; ambiente: string;
    fonte: string; hash: string; conteudo: string; dados: Dados; avisos: string[]; processado: boolean;
}
export interface Complemento {
    empregador: string; cpf: string; matricula: string; campo: Campo; valor: string;
    fonte: string; justificativa: string; registradoEm: string;
}
export interface Cadastro {
    chave: string; empregador: string; cpf: string; matricula: string; dados: Dados;
    origens: Partial<Record<Campo, string>>; pendencias: string[]; eventos: Evento[]; desligado: boolean;
}
export interface Resultado { cadastros: Cadastro[]; avisos: string[] }
export const TIPOS: Record<string, string> = {
    evtAdmissao: 'S-2200', evtAltCadastral: 'S-2205', evtAltContratual: 'S-2206',
    evtDeslig: 'S-2299', evtExclusao: 'S-3000',
};
export const digitos = (v: string) => v.replace(/\D/g, '');
export const chaveVinculo = (emp: string, cpf: string, matricula: string) => `${emp}|${cpf}|${matricula}`;
export function dataValida(v: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function cpfValido(cpf: string): boolean {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
    return [9, 10].every(n => {
        const soma = [...cpf.slice(0, n)].reduce((s, d, i) => s + Number(d) * (n + 1 - i), 0);
        const resto = (soma * 10) % 11;
        return (resto === 10 ? 0 : resto) === Number(cpf[n]);
    });
}
const children = (e: Element, name: string) => Array.from(e.children).filter(c => c.localName === name);
function node(e: Element, path: string): Element | undefined {
    return path.split('/').reduce<Element | undefined>((p, n) => p && children(p, n)[0], e);
}
function conteudoEvento(e: Element): unknown {
    return [e.localName, Array.from(e.attributes).filter(a => !a.name.startsWith('xmlns')).map(a => [a.localName, a.value]).sort(),
        e.children.length ? Array.from(e.children).filter(c => c.localName !== 'Signature').map(conteudoEvento) : e.textContent?.trim() || ''];
}
function value(e: Element, path: string): string { return node(e, path)?.textContent?.trim() || ''; }
const all = (e: Document | Element) => Array.from(e.getElementsByTagName('*'));
const PESSOA: Partial<Record<Campo, string>> = {
    nome: 'nmTrab', nascimento: 'nascimento/dtNascto', sexo: 'sexo', estadoCivil: 'estCiv', raca: 'racaCor',
    escolaridade: 'grauInstr', nacionalidade: 'nascimento/paisNac', paisNascimento: 'nascimento/paisNascto',
    logradouro: 'endereco/brasil/dscLograd', numero: 'endereco/brasil/nrLograd', complemento: 'endereco/brasil/complemento',
    bairro: 'endereco/brasil/bairro', cep: 'endereco/brasil/cep', municipio: 'endereco/brasil/codMunic', uf: 'endereco/brasil/uf',
    telefone: 'contato/fonePrinc', email: 'contato/emailPrinc',
};
const PESSOA_ALTERACAO = { ...PESSOA, nacionalidade: 'paisNac' };
delete PESSOA_ALTERACAO.nascimento;
delete PESSOA_ALTERACAO.paisNascimento;
const CONTRATO: Partial<Record<Campo, string>> = {
    cargo: 'infoContrato/nmCargo', cbo: 'infoContrato/CBOCargo', categoria: 'infoContrato/codCateg',
    salario: 'infoContrato/remuneracao/vrSalFx', unidadeSalario: 'infoContrato/remuneracao/undSalFixo',
    horasSemanais: 'infoContrato/horContratual/qtdHrsSem', jornada: 'infoContrato/horContratual/dscJorn',
    tipoContrato: 'infoContrato/duracao/tpContr', fimContrato: 'infoContrato/duracao/dtTerm',
    sindicato: 'infoRegimeTrab/infoCeletista/cnpjSindCategProf', estabelecimento: 'infoContrato/localTrabalho/localTrabGeral/nrInsc',
    regimeTrabalhista: 'tpRegTrab', regimePrevidenciario: 'tpRegPrev', admissao: 'infoRegimeTrab/infoCeletista/dtAdm',
};
function extract(e: Element | undefined, paths: Partial<Record<Campo, string>>): Dados {
    if (!e) return {};
    const dados = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, value(e, path)]).filter(([, v]) => v)) as Dados;
    if (paths === PESSOA || paths === PESSOA_ALTERACAO) {
        const grupo = (el: Element): Record<string, string> => Object.fromEntries(Array.from(el.children).map(c => [c.localName, c.textContent?.trim() || '']));
        const deps = children(e, 'dependente');
        if (deps.length) dados.dependentes = JSON.stringify(deps.map(grupo));
        const def = node(e, 'infoDeficiencia');
        if (def) dados.deficiencia = JSON.stringify(grupo(def));
        const exterior = node(e, 'endereco/exterior');
        if (exterior) dados.enderecoExterior = JSON.stringify(grupo(exterior));
    }
    return dados;
}
export function lerXml(fonte: FonteXml): { eventos: Evento[]; avisos: string[] } {
    if (fonte.xml.length > 10 * 1024 * 1024) throw new Error('XML excede 10 MB.');
    if (/<!DOCTYPE|<!ENTITY/i.test(fonte.xml)) throw new Error('XML com DTD ou entidades não é aceito.');
    const doc = new DOMParser().parseFromString(fonte.xml, 'application/xml');
    if (all(doc).some(e => e.localName === 'parsererror')) throw new Error('XML malformado.');
    const avisos: string[] = [];
    const elementos = all(doc).filter(e => e.localName.startsWith('evt') && e.hasAttribute('Id'));
    if (elementos.length > 5000) throw new Error('Limite de 5.000 eventos por arquivo.');
    if (!elementos.length) throw new Error('Nenhum evento eSocial identificado no arquivo.');
    const eventos: Evento[] = [];
    for (const el of elementos) {
        const tipo = TIPOS[el.localName];
        if (!tipo) { avisos.push(`${fonte.nome}: ${el.localName} não consolidado. Revisar situação/histórico antes de usar o cadastro.`); continue; }
        if (!/^http:\/\/www\.esocial\.gov\.br\/schema\/evt\/[^/]+\/v_S_01_0[0-3]_00$/.test(el.namespaceURI || '')) throw new Error('Versão/namespace eSocial não suportado (esperado S-1.0 a S-1.3).');
        const empregador = value(el, 'ideEmpregador/nrInsc');
        const tpInsc = value(el, 'ideEmpregador/tpInsc');
        const localAvisos: string[] = [];
        if (tpInsc !== '1' || !/^(\d{8}|\d{14})$/.test(empregador)) throw new Error('Esta versão aceita empregador CNPJ (8 ou 14 dígitos).');
        const cpf = value(el, 'ideVinculo/cpfTrab') || value(el, 'trabalhador/cpfTrab') || value(el, 'ideTrabalhador/cpfTrab');
        const matricula = value(el, 'ideVinculo/matricula') || value(el, 'vinculo/matricula');
        let dados: Dados = {};
        let data = '';
        if (tipo === 'S-2200') {
            dados = { ...extract(node(el, 'trabalhador'), PESSOA), ...extract(node(el, 'vinculo'), CONTRATO) };
            data = dados.admissao || '';
            for (const grupo of ['sucessaoVinc', 'transfDom', 'mudancaCPF', 'afastamento', 'desligamento', 'cessao']) if (node(el, `vinculo/${grupo}`)) localAvisos.push(`Admissão com ${grupo}: requer revisão específica de histórico.`);
        } else if (tipo === 'S-2205') {
            dados = extract(node(el, 'alteracao/dadosTrabalhador'), PESSOA_ALTERACAO);
            data = value(el, 'alteracao/dtAlteracao');
        } else if (tipo === 'S-2206') {
            dados = extract(node(el, 'altContratual/vinculo'), CONTRATO);
            data = value(el, 'altContratual/dtAlteracao');
            if (value(el, 'altContratual/dtEf') && value(el, 'altContratual/dtEf') !== data) localAvisos.push(`Efeitos remuneratórios em ${value(el, 'altContratual/dtEf')}: revisar retroatividade; cadastro usa a data de alteração.`);
        } else if (tipo === 'S-2299') data = value(el, 'infoDeslig/dtDeslig');
        // O recibo pertence ao mesmo retornoEventoCompleto, nunca a outro evento do lote.
        let envelope: Element | null = el.parentElement;
        while (envelope && envelope.localName !== 'retornoEventoCompleto') envelope = envelope.parentElement;
        const retorno = envelope && node(envelope, 'recibo/eSocial/retornoEvento');
        const recibo = retorno ? value(retorno, 'recibo/nrRecibo') : '';
        const processado = !!retorno && value(retorno, 'processamento/cdResposta') === '201';
        if (retorno && retorno.getAttribute('Id') && retorno.getAttribute('Id') !== el.getAttribute('Id')) throw new Error('Recibo pertence a outro ID de evento.');
        if (retorno && value(retorno, 'ideEmpregador/nrInsc') !== empregador) throw new Error('Recibo e evento possuem empregadores diferentes.');
        if (tipo === 'S-3000') data = retorno ? value(retorno, 'processamento/dhProcessamento').slice(0, 10) : '';
        if (retorno && !processado) { avisos.push(`${fonte.nome}: retorno sem sucesso; evento não incluído.`); continue; }
        if (!processado) localAvisos.push('Sem retorno de processamento 201 associado; aceitação não comprovada.');
        if (tipo !== 'S-3000' && !cpfValido(cpf)) localAvisos.push('CPF inválido ou ausente.');
        if (!dataValida(data)) localAvisos.push('Data de vigência ausente ou inválida.');
        if (tipo !== 'S-2205' && tipo !== 'S-3000' && !matricula) localAvisos.push('Matrícula eSocial ausente.');
        const indRetif = value(el, 'ideEvento/indRetif');
        const retifica = value(el, 'ideEvento/nrRecibo');
        if (indRetif === '2' && !retifica) throw new Error('Retificação sem recibo do evento retificado.');
        if (indRetif === '1' && retifica) throw new Error('Evento original contém recibo de retificação inesperado.');
        eventos.push({
            id: el.getAttribute('Id')!, tipo, empregador: empregador.slice(0, 8), tpInsc, cpf, matricula,
            data, recibo, retifica, exclui: value(el, 'infoExclusao/nrRecEvt'),
            ambiente: value(el, 'ideEvento/tpAmb'), fonte: fonte.nome, hash: fonte.hash, conteudo: JSON.stringify(conteudoEvento(el)), dados, avisos: localAvisos, processado,
        });
    }
    return { eventos, avisos };
}

export function consolidar(eventos: Evento[], empregador: string, corte: string, complementos: Complemento[] = [], opcoes: { revisarAdmissaoRetificada?: boolean } = {}): Resultado {
    const raiz = digitos(empregador).slice(0, 8);
    const avisos: string[] = [];
    if (digitos(empregador).length !== 14 || !dataValida(corte)) return { cadastros: [], avisos: ['Informe CNPJ com 14 dígitos e data de implantação válida.'] };
    const unicos = new Map<string, Evento>();
    const conflitosId = new Set<string>();
    for (const e of eventos) {
        if (e.empregador !== raiz) { avisos.push(`${e.fonte}: empregador diferente; evento não incluído.`); continue; }
        if (e.ambiente !== '1') { avisos.push(`${e.fonte}: ambiente diferente de produção; evento não incluído.`); continue; }
        const anterior = unicos.get(e.id);
        if (anterior) {
            const comparable = (x: Evento) => JSON.stringify([x.tipo, x.cpf, x.matricula, x.data, x.recibo, x.retifica, x.exclui, x.dados, x.processado, x.conteudo]);
            if (comparable(anterior) !== comparable(e)) { conflitosId.add(e.id); avisos.push(`ID ${e.id} com conteúdos divergentes; revisar os arquivos.`); }
            continue;
        }
        unicos.set(e.id, e);
    }
    const lista = [...unicos.values()];
    const retirados = new Set<string>();
    const operacoes = new Map<string, Evento[]>();
    for (const e of lista) {
        const alvo = e.retifica || e.exclui;
        if (alvo) operacoes.set(alvo, [...(operacoes.get(alvo) || []), e]);
    }
    for (const [alvo, grupo] of operacoes) if (grupo.length > 1) {
        grupo.forEach(e => conflitosId.add(e.id));
        avisos.push(`Recibo ${alvo} com múltiplas retificações/exclusões concorrentes; não aplicadas.`);
    }
    const validacao = new Map<string, boolean>();
    const alvos = new Map<string, Evento>();
    function validarOperacao(e: Evento, caminho = new Set<string>()): boolean {
        if (validacao.has(e.id)) return validacao.get(e.id)!;
        if (caminho.has(e.id) || caminho.size > 200) {
            avisos.push(`${e.fonte}: cadeia de retificações cíclica ou extensa; revisar histórico.`);
            conflitosId.add(e.id); return false;
        }
        if (conflitosId.has(e.id)) return false;
        if (!e.retifica && e.tipo !== 'S-3000') return true;
        const alvo = lista.filter(a => a.recibo && a.recibo === (e.retifica || e.exclui));
        // Exceção exclusivamente para revisão: uma admissão aceita contém o bloco cadastral completo.
        // Não aceita alvo ambíguo, admissões concorrentes nem transforma o histórico em validado.
        if (!alvo.length && opcoes.revisarAdmissaoRetificada && e.tipo === 'S-2200' && e.retifica && e.processado && e.recibo
            && cpfValido(e.cpf) && e.matricula && dataValida(e.data)
            && !lista.some(a => a.id !== e.id && a.tipo === 'S-2200' && a.cpf === e.cpf && a.matricula === e.matricula)) {
            validacao.set(e.id, true);
            avisos.push(`${e.fonte}: admissão retificada apresentada apenas para revisão; recibo anterior ${e.retifica} ausente. Histórico incompleto.`);
            return true;
        }
        let motivo = '';
        if (alvo.length !== 1) motivo = 'recibo alvo ausente ou ambíguo; histórico incompleto';
        else if (alvo[0].tipo === 'S-3000') motivo = 'exclusão não pode ser alvo desta operação';
        else if (!e.processado) motivo = 'retificação/exclusão sem processamento comprovado';
        else if (e.retifica && (alvo[0].cpf !== e.cpf || alvo[0].matricula !== e.matricula || alvo[0].tipo !== e.tipo)) motivo = 'retificação aponta para outro vínculo/tipo';
        else if (!validarOperacao(alvo[0], new Set([...caminho, e.id]))) motivo = 'cadeia contém alvo conflitante';
        if (motivo) {
            avisos.push(`${e.fonte}: ${motivo}; operação não aplicada.`);
            conflitosId.add(e.id); validacao.set(e.id, false); return false;
        }
        alvos.set(e.id, alvo[0]); validacao.set(e.id, true); return true;
    }
    for (const e of lista) validarOperacao(e);
    for (const e of lista) {
        const alvo = alvos.get(e.id);
        if (!alvo || validacao.get(e.id) !== true || conflitosId.has(e.id)) continue;
        // Retificações substituem o original inclusive quando alteram a vigência.
        retirados.add(alvo.id);
        if (e.tipo === 'S-3000' && (!dataValida(e.data) || e.data > corte)) avisos.push(`${e.fonte}: exclusão posterior ao corte ou sem data; validar reconstrução histórica.`);
    }
    const ativos = lista.filter(e => !retirados.has(e.id) && !conflitosId.has(e.id) && e.tipo !== 'S-3000');
    const cadastros = new Map<string, Cadastro>();
    for (const e of ativos) {
        if (e.tipo === 'S-2205' || !e.cpf || !e.matricula) continue;
        if (dataValida(e.data) && e.data > corte) { avisos.push(`${e.fonte}: evento posterior à implantação, não aplicado.`); continue; }
        const chave = chaveVinculo(raiz, e.cpf, e.matricula);
        if (!cadastros.has(chave)) cadastros.set(chave, { chave, empregador: raiz, cpf: e.cpf, matricula: e.matricula, dados: {}, origens: {}, pendencias: [], eventos: [], desligado: false });
    }
    for (const c of cadastros.values()) {
        const itens = ativos.filter(e => e.cpf === c.cpf && (e.matricula === c.matricula || e.tipo === 'S-2205') && (!dataValida(e.data) || e.data <= corte))
            .sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === 'S-2200' ? -1 : b.tipo === 'S-2200' ? 1 : a.id.localeCompare(b.id)));
        c.eventos = itens;
        if (!itens.some(e => e.tipo === 'S-2200')) c.pendencias.push('Falta S-2200: dados iniciais/admissão não comprovados.');
        const datasTipos = new Set<string>();
        for (const e of itens) {
            if (e.retifica && !alvos.has(e.id)) c.pendencias.push(`Cadastro provisório: recibo anterior ${e.retifica} ausente; conferir histórico antes de implantar.`);
            c.pendencias.push(...e.avisos.map(a => `${e.tipo}: ${a}`));
            if (!dataValida(e.data)) continue;
            const dt = `${e.tipo}|${e.data}`;
            if (datasTipos.has(dt)) c.pendencias.push(`${e.tipo}: mais de um evento na mesma vigência; revisar precedência.`);
            datasTipos.add(dt);
            if (e.tipo === 'S-2299') { c.desligado = true; continue; }
            // Eventos de alteração substituem o bloco, inclusive campos opcionais removidos.
            const bloco = e.tipo === 'S-2205' ? [...Object.keys(PESSOA_ALTERACAO), 'dependentes', 'deficiencia', 'enderecoExterior'] : e.tipo === 'S-2206' ? Object.keys(CONTRATO).filter(k => !['admissao', 'regimeTrabalhista'].includes(k)) : Object.keys(e.dados);
            for (const key of bloco as Campo[]) {
                delete c.dados[key];
                c.origens[key] = `${e.tipo} · ${e.data} · ${e.fonte}`;
                if (e.dados[key]) c.dados[key] = e.dados[key];
            }
        }
        for (const manual of complementos.filter(m => m.empregador === raiz && m.cpf === c.cpf && m.matricula === c.matricula)) {
            if (!manual.justificativa.trim() || !manual.fonte.trim()) continue;
            if (manual.campo === 'matriculaIob') continue;
            c.dados[manual.campo] = manual.valor;
            c.origens[manual.campo] = `Conferência: ${manual.fonte} · ${manual.justificativa}`;
        }
        // A implantação preserva a identificação do vínculo, inclusive em dossiês antigos.
        c.dados.matriculaIob = c.matricula;
        c.origens.matriculaIob = 'Matrícula original do XML eSocial — preservada sem renumeração';
        for (const key of ['nome', 'nascimento', 'admissao', 'cargo', 'cbo', 'salario', 'matriculaIob'] as Campo[]) {
            if (!c.dados[key]) c.pendencias.push(`Preencher/conferir ${CAMPOS[key]}.`);
        }
        for (const key of ['nascimento', 'admissao', 'fimContrato'] as Campo[]) if (c.dados[key] && !dataValida(c.dados[key]!)) c.pendencias.push(`${CAMPOS[key]} inválida.`);
        if (c.dados.salario && !/^\d+(\.\d{1,2})?$/.test(c.dados.salario)) c.pendencias.push('Salário inválido: use decimal com ponto, sem separador de milhares.');
        if (c.dados.matriculaIob && !/^\d{1,6}$/.test(c.dados.matriculaIob)) c.pendencias.push('Matrícula eSocial incompatível com o campo de 6 dígitos do TXT de apontamentos; a matrícula original foi preservada, sem conversão ou truncamento.');
        if (c.desligado) c.pendencias.push('Desligamento identificado: revisar situação na implantação.');
        c.pendencias = [...new Set(c.pendencias)];
    }
    for (const e of ativos.filter(e => e.tipo === 'S-2205' || !e.matricula || !e.cpf)) {
        if (![...cadastros.values()].some(c => c.eventos.includes(e))) avisos.push(`${e.fonte}: evento sem vínculo correspondente no dossiê.`);
    }
    const codigos = new Map<string, Cadastro[]>();
    for (const c of cadastros.values()) if (c.dados.matriculaIob) {
        const k = c.dados.matriculaIob.padStart(6, '0');
        codigos.set(k, [...(codigos.get(k) || []), c]);
    }
    for (const grupo of codigos.values()) if (grupo.length > 1) grupo.forEach(c => c.pendencias.push('Código IOB repetido em mais de um vínculo.'));
    return { cadastros: [...cadastros.values()], avisos: [...new Set(avisos)] };
}
