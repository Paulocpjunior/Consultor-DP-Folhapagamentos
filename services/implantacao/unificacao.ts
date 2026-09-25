// services/implantacao/unificacao.ts
// Une automaticamente o cadastro consolidado dos XMLs eSocial com as fichas
// PDF do cliente. A identidade (CNPJ, CPF e matrícula eSocial) é conferida
// antes de aproveitar qualquer campo; o XML prevalece e o PDF só complementa
// campos ausentes. Divergências ficam registradas para revisão, nunca são
// resolvidas em silêncio.

import { CAMPOS, digitos, type Cadastro, type Campo, type Complemento, type Dados, type FonteXml } from './implantacao';
import { compararFicha, conferirIdentidade, type FichaExtraida } from './fichaPdf';

export interface FichaLida { nome: string; hash: string; tamanho: number; ficha: FichaExtraida }
export interface Divergencia { campo: Campo; rotulo: string; xml: string; pdf: string }
export interface Dependente { tipo: string; nome: string; nascimento: string; cpf: string; irrf: string; salarioFamilia: string }
export interface FuncionarioUnificado {
    chave: string; empregador: string; cpf: string; matricula: string;
    dados: Dados; origens: Partial<Record<Campo, string>>;
    ficha?: { nome: string; hash: string };
    complementosPdf: Campo[]; divergencias: Divergencia[]; dependentes: Dependente[];
    pendencias: string[]; desligado: boolean; cadastro: Cadastro;
}
export interface FichaSemVinculo { nome: string; motivo: string }
export interface ResultadoUnificacao { funcionarios: FuncionarioUnificado[]; fichasSemVinculo: FichaSemVinculo[]; avisos: string[] }

export function lerDependentes(json: string | undefined): Dependente[] {
    if (!json) return [];
    try {
        const lista = JSON.parse(json);
        if (!Array.isArray(lista)) return [];
        return lista.map((d: Record<string, string>) => ({
            tipo: d.tpDep || '', nome: d.nmDep || '', nascimento: d.dtNascto || '', cpf: d.cpfDep || '',
            irrf: d.depIRRF || '', salarioFamilia: d.depSF || '',
        }));
    } catch { return []; }
}

const fontePdf = (f: FichaLida) => `Ficha PDF: ${f.nome} · SHA-256 ${f.hash.slice(0, 12)}`;

/** Une cada ficha ao vínculo cuja identidade confere. Nenhum campo é aplicado sem CNPJ, CPF e matrícula iguais. */
export function unificar(cadastros: Cadastro[], fichas: FichaLida[], cnpj: string): ResultadoUnificacao {
    const avisos: string[] = [];
    const fichasSemVinculo: FichaSemVinculo[] = [];
    const porVinculo = new Map<string, FichaLida>();
    for (const f of fichas) {
        const candidatos = cadastros.filter(c => conferirIdentidade(f.ficha, c, cnpj).length === 0);
        if (candidatos.length === 1) {
            const c = candidatos[0];
            if (porVinculo.has(c.chave)) { avisos.push(`${f.nome}: outra ficha já foi unida ao vínculo ${c.matricula}; esta foi ignorada.`); continue; }
            porVinculo.set(c.chave, f);
            continue;
        }
        if (candidatos.length > 1) { fichasSemVinculo.push({ nome: f.nome, motivo: 'Mais de um vínculo com a mesma identidade; revisar matrícula.' }); continue; }
        const cnpjFicha = f.ficha.cnpj;
        const motivo = cnpjFicha.length !== 14 || cnpjFicha !== digitos(cnpj) ? `CNPJ da ficha (${cnpjFicha || 'não identificado'}) difere da empresa da implantação.`
            : !cadastros.some(c => c.cpf === f.ficha.cpf) ? `CPF ${f.ficha.cpf || 'não identificado'} não localizado nos XMLs importados.`
                : `Matrícula eSocial da ficha (${f.ficha.matricula || 'não identificada'}) não corresponde ao vínculo do CPF.`;
        fichasSemVinculo.push({ nome: f.nome, motivo });
    }
    const funcionarios = cadastros.map<FuncionarioUnificado>(c => {
        const f = porVinculo.get(c.chave);
        const dados: Dados = { ...c.dados };
        const origens = { ...c.origens };
        const complementosPdf: Campo[] = [];
        const divergencias: Divergencia[] = [];
        const pendencias = [...c.pendencias];
        if (f) {
            for (const item of compararFicha(f.ficha, c)) {
                if (item.situacao === 'complemento') { dados[item.campo] = item.valor; origens[item.campo] = fontePdf(f); complementosPdf.push(item.campo); }
                else if (item.situacao === 'divergencia') divergencias.push({ campo: item.campo, rotulo: CAMPOS[item.campo], xml: item.atual, pdf: item.valor });
            }
            if (divergencias.length) pendencias.push(`Ficha PDF diverge do XML em: ${divergencias.map(d => d.rotulo).join(', ')}. O XML foi mantido; revisar antes de importar.`);
        } else pendencias.push('Ficha PDF não localizada para este vínculo; campos exclusivos da ficha (mãe, RG, CTPS, PIS…) ficam em branco.');
        return {
            chave: c.chave, empregador: c.empregador, cpf: c.cpf, matricula: c.matricula, dados, origens,
            ficha: f ? { nome: f.nome, hash: f.hash } : undefined, complementosPdf, divergencias,
            dependentes: lerDependentes(dados.dependentes), pendencias: [...new Set(pendencias)], desligado: c.desligado, cadastro: c,
        };
    });
    return { funcionarios, fichasSemVinculo, avisos };
}

/** Complementos prontos para o dossiê: apenas campos ausentes no XML, com identidade conferida. */
export function complementosDaUnificacao(funcionarios: FuncionarioUnificado[], registradoEm = new Date().toISOString()): Complemento[] {
    return funcionarios.flatMap(f => !f.ficha ? [] : f.complementosPdf.map(campo => ({
        empregador: f.empregador, cpf: f.cpf, matricula: f.matricula, campo, valor: f.dados[campo] || '',
        fonte: `${f.ficha!.nome} · SHA-256 ${f.ficha!.hash}`,
        justificativa: 'Unificação automática: CNPJ, CPF e matrícula eSocial conferidos; campo ausente no XML.', registradoEm,
    })).filter(c => c.valor));
}

/**
 * Extrai o evento eSocial puro (elemento <eSocial> do evento, com assinatura)
 * de um envelope retornoEventoCompleto ou de um arquivo já puro. O conteúdo
 * transmitido não é alterado: rotinas de "Importação de Dados por XML"
 * validam a assinatura e o ID originais.
 */
export function eventoXmlPuro(fonte: FonteXml, id: string): string {
    const doc = new DOMParser().parseFromString(fonte.xml, 'application/xml');
    const evento = Array.from(doc.getElementsByTagName('*')).find(e => e.localName.startsWith('evt') && e.getAttribute('Id') === id);
    if (!evento) throw new Error(`Evento ${id} não localizado em ${fonte.nome}.`);
    const raiz = evento.parentElement && evento.parentElement.localName === 'eSocial' ? evento.parentElement : evento;
    const xml = new XMLSerializer().serializeToString(raiz);
    return `<?xml version="1.0" encoding="UTF-8"?>${xml}`;
}

export function nomeArquivoXmlEvento(f: FuncionarioUnificado, tipo: string): string {
    return `${tipo}_${f.cpf}_${f.matricula.replace(/[^A-Za-z0-9_-]+/g, '_')}.xml`;
}

/** Eventos S-2200 aceitos que compõem cada vínculo, para a rotina de importação por XML. */
export function xmlsAdmissao(funcionarios: FuncionarioUnificado[], fontes: FonteXml[]): { arquivos: { nome: string; conteudo: string }[]; avisos: string[] } {
    const arquivos: { nome: string; conteudo: string }[] = [];
    const avisos: string[] = [];
    for (const f of funcionarios) {
        const admissoes = f.cadastro.eventos.filter(e => e.tipo === 'S-2200');
        if (!admissoes.length) { avisos.push(`${f.dados.nome || f.cpf}: sem S-2200 aceito; nenhum XML de admissão gerado.`); continue; }
        for (const e of admissoes) {
            const fonte = fontes.find(x => x.hash === e.hash);
            if (!fonte) { avisos.push(`${f.dados.nome || f.cpf}: fonte do evento ${e.id} não está no dossiê.`); continue; }
            try { arquivos.push({ nome: nomeArquivoXmlEvento(f, e.tipo), conteudo: eventoXmlPuro(fonte, e.id) }); }
            catch (err) { avisos.push((err as Error).message); }
        }
    }
    return { arquivos, avisos };
}
