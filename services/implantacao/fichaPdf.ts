import { cpfValido, digitos, type Cadastro, type Campo, type Dados } from './implantacao';

export interface ItemFicha { texto: string; x: number; y: number; largura: number }
export interface FichaExtraida { cnpj: string; cpf: string; matricula: string; dados: Dados; avisos: string[] }
const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
/** Somente o modelo Registro de Empregado identificado por seus rótulos. Sem inferir valores vazios. */
export function extrairFicha(itens: ItemFicha[]): FichaExtraida {
    const labels = new Map<string, ItemFicha[]>();
    for (const i of itens) labels.set(normal(i.texto), [...(labels.get(normal(i.texto)) || []), i]);
    if (!labels.has('REGISTRO DE EMPREGADO') || !labels.has('MATRICULA ESOCIAL') || !labels.has('CEDULA DE IDENTIDADE')) {
        throw new Error('Modelo de ficha não reconhecido. Use a conferência visual e registre os complementos manualmente.');
    }
    function abaixo(label: string, alinhado?: string): string {
        const ancora = alinhado ? labels.get(normal(alinhado)) : undefined;
        const encontrados = (labels.get(normal(label)) || []).filter(i => !alinhado || (ancora?.length === 1 && Math.abs(i.y - ancora[0].y) < 2));
        if (encontrados.length !== 1) return '';
        const l = encontrados[0];
        const direita = Math.min(...itens.filter(i => Math.abs(i.y - l.y) < 2 && i.x > l.x + 5).map(i => i.x), Infinity);
        const candidatos = itens.filter(i => i.y < l.y - 3 && i.y >= l.y - 15 && i.x >= l.x - 2 && i.x < direita - 2);
        if (!candidatos.length) return '';
        const linha = Math.max(...candidatos.map(i => i.y));
        return candidatos.filter(i => Math.abs(i.y - linha) < 2).sort((a, b) => a.x - b.x).map(i => i.texto).join(' ').trim();
    }
    const data = (s: string) => /^(\d{2})\/(\d{2})\/(\d{4})$/.test(s) ? s.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1') : '';
    const dados: Dados = {};
    const campos: Partial<Record<Campo, string>> = {
        nome: 'Empregado', pai: 'Pai', mae: 'Mãe', ctps: 'CTPS', serieCtps: 'Série', rg: 'Cédula de Identidade',
        naturalidade: 'Local do nascimento', ufCtps: 'UF CTPS', orgaoRg: 'Órgão/UF emissor', tituloEleitor: 'Título Eleitoral',
        zonaEleitoral: 'Zona', secaoEleitoral: 'Seção', documentoMilitar: 'Doc. militar', cargo: 'Cargo', cbo: 'C.B.O.',
    };
    for (const [campo, label] of Object.entries(campos)) { const v = abaixo(label); if (v) dados[campo as Campo] = v; }
    for (const [campo, label] of Object.entries({ nascimento: 'Data de nascimento', admissao: 'Data de Admissão', emissaoRg: 'Data de emissão', opcaoFgts: 'Opção em', cadastroPis: 'Cadastrado em' })) {
        const v = data(abaixo(label)); if (v) dados[campo as Campo] = v;
    }
    const pis = digitos(abaixo('Sob nº')); if (pis.length === 11) dados.pis = pis;
    const telefone = digitos(abaixo('Telefone Celular')); if (/^\d{10,11}$/.test(telefone)) dados.telefone = telefone;
    const salario = abaixo('Salário', 'Data de Admissão').replace(/R\$\s*/g, '').trim();
    if (/^\d{1,3}(\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(salario)) dados.salario = salario.replace(/\./g, '').replace(',', '.');
    return { cnpj: digitos(abaixo('CNPJ')), cpf: digitos(abaixo('CPF')), matricula: abaixo('Matrícula eSocial'), dados,
        avisos: ['Extração do modelo Registro de Empregado. Confira os campos antes de aplicar.', 'Número de registro na ficha não é convertido em código interno IOB.'] };
}
export function conferirIdentidade(f: FichaExtraida, c: Cadastro, cnpj: string): string[] {
    const problemas: string[] = [];
    if (f.cnpj.length !== 14 || f.cnpj !== digitos(cnpj) || f.cnpj.slice(0, 8) !== c.empregador) problemas.push('CNPJ da ficha não corresponde à empresa selecionada.');
    if (!cpfValido(f.cpf) || f.cpf !== c.cpf) problemas.push('CPF da ficha não corresponde ao funcionário.');
    if (!f.matricula || f.matricula !== c.matricula) problemas.push('Matrícula eSocial da ficha não corresponde ao vínculo.');
    return problemas;
}
export function compararFicha(f: FichaExtraida, c: Cadastro) {
    return (Object.keys(f.dados) as Campo[]).map(campo => {
        const atual = c.dados[campo] || ''; const valor = f.dados[campo]!;
        const equivalente = campo === 'salario' ? Number(atual) === Number(valor) : normal(atual) === normal(valor);
        return { campo, atual, valor, situacao: !atual ? 'complemento' as const : equivalente ? 'igual' as const : 'divergencia' as const };
    });
}


export function extrairPaginasFicha(paginas: ItemFicha[][]): FichaExtraida {
    const principais = paginas.filter(p => p.some(i => normal(i.texto) === 'MATRICULA ESOCIAL'));
    if (principais.length > 1) throw new Error('O PDF contém várias fichas. Separe um funcionário por arquivo.');
    if (!paginas.flat().length) throw new Error('PDF sem texto selecionável. Confira visualmente e registre os complementos; OCR não disponível.');
    const ficha = extrairFicha(paginas[0] || []);
    if (paginas.length > 1) ficha.avisos.push('Dados extraídos da primeira página. Confira visualmente as páginas complementares, incluindo a jornada.');
    return ficha;
}
