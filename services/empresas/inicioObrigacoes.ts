// services/empresas/inicioObrigacoes.ts
//
// Início da DCTFWeb e do FGTS Digital da empresa (Gerenciador de Sistemas › Empresas › Parâmetros do SAGE): as
// competências a partir das quais as contribuições previdenciárias vão pela DCTFWeb (antes: GFIP e GPS) e o FGTS
// pelo FGTS Digital (antes: SEFIP e GRF). O FGTS Digital é obrigatório para todos os empregadores desde a
// competência março de 2024 (Edital MTE 4/2023, pagamento em abril); a DCTFWeb entrou por grupos de empregadores,
// então o início é o da empresa, informado. Competência anterior ao início: o Consultor avisa que aquele mês é do
// sistema antigo (folha complementar de anos anteriores, processos trabalhistas, conferências). Puro.

export const INICIO_FGTS_DIGITAL = '2024-03';
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const br = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

export interface IniciosObrigacoes { inicioDctfweb?: string; inicioFgtsDigital?: string }

/** O início do FGTS Digital da empresa: o informado ou o geral (03/2024). */
export const inicioFgtsDigital = (p?: IniciosObrigacoes) => (p?.inicioFgtsDigital && COMP.test(p.inicioFgtsDigital) ? p.inicioFgtsDigital : INICIO_FGTS_DIGITAL);

export function validarInicios(p: IniciosObrigacoes): { erros: string[]; avisos: string[] } {
    const erros: string[] = []; const avisos: string[] = [];
    if (p.inicioDctfweb && !COMP.test(p.inicioDctfweb)) erros.push('Início da DCTFWeb: competência no formato AAAA-MM.');
    if (p.inicioFgtsDigital && !COMP.test(p.inicioFgtsDigital)) erros.push('Início do FGTS Digital: competência no formato AAAA-MM.');
    if (p.inicioFgtsDigital && COMP.test(p.inicioFgtsDigital) && p.inicioFgtsDigital < INICIO_FGTS_DIGITAL) erros.push(`O FGTS Digital começou na competência ${br(INICIO_FGTS_DIGITAL)}: não há início antes disso.`);
    if (p.inicioFgtsDigital && COMP.test(p.inicioFgtsDigital) && p.inicioFgtsDigital > INICIO_FGTS_DIGITAL) avisos.push(`Início do FGTS Digital depois de ${br(INICIO_FGTS_DIGITAL)}: só para empregador que passou a ter empregados depois disso (ou órgão público, que teve transição). Confira.`);
    if (!p.inicioDctfweb) avisos.push('Sem o início da DCTFWeb da empresa: as competências antigas não são conferidas (informe o mês em que a empresa passou a declarar na DCTFWeb).');
    return { erros, avisos };
}

export interface SistemaDaCompetencia { previdencia: 'dctfweb' | 'gfip' | 'indefinido'; fgts: 'fgts-digital' | 'sefip'; avisos: string[] }

/** Por qual sistema a competência foi (ou é) declarada e recolhida, pelo início da empresa. */
export function sistemaDaCompetencia(p: IniciosObrigacoes | undefined, competencia: string): SistemaDaCompetencia {
    const r: SistemaDaCompetencia = { previdencia: 'indefinido', fgts: 'fgts-digital', avisos: [] };
    const dctf = p?.inicioDctfweb && COMP.test(p.inicioDctfweb) ? p.inicioDctfweb : '';
    if (dctf) r.previdencia = competencia >= dctf ? 'dctfweb' : 'gfip';
    if (competencia < inicioFgtsDigital(p)) r.fgts = 'sefip';
    if (r.previdencia === 'gfip') r.avisos.push(`Competência ${br(competencia)} anterior à DCTFWeb da empresa (desde ${br(dctf)}): as contribuições previdenciárias desse mês são da GFIP e da GPS, não da DCTFWeb.`);
    if (r.fgts === 'sefip') r.avisos.push(`Competência ${br(competencia)} anterior ao FGTS Digital (desde ${br(inicioFgtsDigital(p))}): o FGTS desse mês é da SEFIP e da GRF, não da guia do FGTS Digital.`);
    return r;
}
