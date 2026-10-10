// services/navegacao/menu.ts
//
// Menu do app em grupos, na ordem do trabalho do DP: primeiro a empresa (e o período),
// depois os cadastros, a folha do mês, as conferências, o eSocial, os prazos e o fim de mês;
// as configurações ficam à direita. Cada item leva a uma tela (aba) e, quando há, à sub-aba dela.

export type Aba = 'folha' | 'cadastros' | 'calculo' | 'prazos' | 'certificados' | 'empresas' | 'esocial' | 'iobsage' | 'admin' | 'fimdemes';

export type SubFolha = 'eventos' | 'apontamento' | 'validador-ponto' | 'implantacao' | 'conferencia';
export type SubCadastroMenu = 'funcionarios' | 'horarios' | 'afastamentos' | 'incidencias' | 'enquadramento' | 'sindicatos' | 'tabelas';
export type SubEsocial = 'dashboard' | 'eventos' | 'transmissao' | 'download' | 'fgts' | 'calendario' | 'teses' | 'ponto' | 'ponto_eletronico' | 'relatorio' | 'audit';
export type FolhaCalculo = 'mensal' | 'adiantamento' | '13-1a' | '13-2a' | 'ferias' | 'rescisao';

export type Destino =
    | { aba: 'folha'; sub: SubFolha }
    | { aba: 'cadastros'; sub: SubCadastroMenu }
    | { aba: 'esocial'; sub: SubEsocial }
    | { aba: 'calculo'; folha: FolhaCalculo }
    | { aba: 'fimdemes'; sub: 'fechamento' | 'pedidos' }
    | { aba: 'empresas' | 'certificados' | 'prazos' | 'iobsage' | 'admin' }
    | { aba: 'trocar' };

export type Icone = 'empresa' | 'cadastro' | 'folha' | 'conferencia' | 'esocial' | 'prazo' | 'fim' | 'config';

export interface ItemMenu { id: string; rotulo: string; descricao: string; destino: Destino; soAdmin?: boolean }
export interface GrupoMenu { id: string; rotulo: string; icone: Icone; itens: ItemMenu[]; direita?: boolean }

export const MENU: GrupoMenu[] = [
    { id: 'empresas', rotulo: 'Empresas', icone: 'empresa', itens: [
        { id: 'trocar', rotulo: 'Ativar empresa e período', descricao: 'Escolher a empresa da carteira e a competência de trabalho', destino: { aba: 'trocar' } },
        { id: 'empresas', rotulo: 'Cadastro de empresas', descricao: 'Dados da empresa, parâmetros da folha e contas', destino: { aba: 'empresas' } },
        { id: 'certificados', rotulo: 'Certificados digitais', descricao: 'Cofre do A1: vencimentos e renovação', destino: { aba: 'certificados' } },
    ] },
    { id: 'cadastros', rotulo: 'Cadastros', icone: 'cadastro', itens: [
        { id: 'funcionarios', rotulo: 'Funcionários', descricao: 'Fichas, salários e dependentes', destino: { aba: 'cadastros', sub: 'funcionarios' } },
        { id: 'horarios', rotulo: 'Horários', descricao: 'Jornadas e escalas', destino: { aba: 'cadastros', sub: 'horarios' } },
        { id: 'afastamentos', rotulo: 'Afastamentos e férias', descricao: 'Licenças, atestados e gozos de férias', destino: { aba: 'cadastros', sub: 'afastamentos' } },
        { id: 'sindicatos', rotulo: 'Sindicatos', descricao: 'Convenções, pisos e contribuições', destino: { aba: 'cadastros', sub: 'sindicatos' } },
        { id: 'eventos', rotulo: 'Eventos IOB', descricao: 'Catálogo de eventos (código, rotina e incidências)', destino: { aba: 'folha', sub: 'eventos' } },
        { id: 'incidencias', rotulo: 'Incidências', descricao: 'Eventos IOB × rubricas do S-1010', destino: { aba: 'cadastros', sub: 'incidencias' } },
        { id: 'enquadramento', rotulo: 'Enquadramento', descricao: 'FPAS, RAT/FAP e terceiros da empresa', destino: { aba: 'cadastros', sub: 'enquadramento' } },
        { id: 'tabelas', rotulo: 'Tabelas legais', descricao: 'INSS, IRRF, salário-família e mínimo', destino: { aba: 'cadastros', sub: 'tabelas' } },
        { id: 'implantacao', rotulo: 'Implantação de funcionários', descricao: 'Primeiro acesso: unificar eSocial e ficha', destino: { aba: 'folha', sub: 'implantacao' } },
    ] },
    { id: 'folha', rotulo: 'Folha do mês', icone: 'folha', itens: [
        { id: 'apontamento', rotulo: 'Apontamento', descricao: 'Planilha do cliente para o IOB', destino: { aba: 'folha', sub: 'apontamento' } },
        { id: 'adiantamento', rotulo: 'Adiantamento', descricao: 'Cálculo, recibos e arquivo do banco', destino: { aba: 'calculo', folha: 'adiantamento' } },
        { id: 'mensal', rotulo: 'Cálculo mensal', descricao: 'Movimento, holerites e resumo da folha', destino: { aba: 'calculo', folha: 'mensal' } },
        { id: 'ferias', rotulo: 'Férias', descricao: 'Programar e calcular o recibo de férias', destino: { aba: 'calculo', folha: 'ferias' } },
        { id: 'rescisao', rotulo: 'Rescisão', descricao: 'Simular e calcular o TRCT', destino: { aba: 'calculo', folha: 'rescisao' } },
        { id: '13-1a', rotulo: '13º salário — 1ª parcela', descricao: 'Adiantamento do 13º até 30/11', destino: { aba: 'calculo', folha: '13-1a' } },
        { id: '13-2a', rotulo: '13º salário — 2ª parcela', descricao: 'Parcela final até 20/12', destino: { aba: 'calculo', folha: '13-2a' } },
    ] },
    { id: 'conferencia', rotulo: 'Conferência', icone: 'conferencia', itens: [
        { id: 'pos-folha', rotulo: 'Conferência pós-folha', descricao: 'Totalizadores do eSocial, DCTFWeb e FGTS', destino: { aba: 'folha', sub: 'conferencia' } },
        { id: 'ponto', rotulo: 'Validador de ponto (ACJEF)', descricao: 'Arquivo do ponto eletrônico', destino: { aba: 'folha', sub: 'validador-ponto' } },
        { id: 'relatorio', rotulo: 'Relatório do eSocial', descricao: 'Eventos por competência', destino: { aba: 'esocial', sub: 'relatorio' } },
    ] },
    { id: 'esocial', rotulo: 'eSocial', icone: 'esocial', itens: [
        { id: 'dashboard', rotulo: 'Painel', descricao: 'Situação dos eventos e pendências', destino: { aba: 'esocial', sub: 'dashboard' } },
        { id: 'transmissao', rotulo: 'Transmissão', descricao: 'Enviar lotes, S-1299 e S-1298', destino: { aba: 'esocial', sub: 'transmissao' } },
        { id: 'eventos', rotulo: 'Eventos', descricao: 'Eventos registrados e recibos', destino: { aba: 'esocial', sub: 'eventos' } },
        { id: 'download', rotulo: 'Download', descricao: 'Baixar eventos do governo', destino: { aba: 'esocial', sub: 'download' } },
        { id: 'fgts', rotulo: 'FGTS Digital', descricao: 'Guias e conferência do FGTS', destino: { aba: 'esocial', sub: 'fgts' } },
        { id: 'ponto-editor', rotulo: 'Ponto (editor)', descricao: 'Layouts e marcações do ponto', destino: { aba: 'esocial', sub: 'ponto' } },
        { id: 'ponto-eletronico', rotulo: 'Ponto eletrônico', descricao: 'Espelho e apuração', destino: { aba: 'esocial', sub: 'ponto_eletronico' } },
        { id: 'teses', rotulo: 'Recuperação', descricao: 'Teses e créditos', destino: { aba: 'esocial', sub: 'teses' } },
        { id: 'audit', rotulo: 'Registro de auditoria', descricao: 'Quem enviou o quê', destino: { aba: 'esocial', sub: 'audit' } },
    ] },
    { id: 'prazos', rotulo: 'Prazos', icone: 'prazo', itens: [
        { id: 'prazos', rotulo: 'Prazos do DP', descricao: 'Obrigações do mês e prazos dos funcionários', destino: { aba: 'prazos' } },
        { id: 'calendario', rotulo: 'Calendário do eSocial', descricao: 'Vencimentos por competência', destino: { aba: 'esocial', sub: 'calendario' } },
    ] },
    { id: 'fimdemes', rotulo: 'Fim de mês', icone: 'fim', itens: [
        { id: 'fechamento', rotulo: 'Fechamento do mês', descricao: 'Conferir e encerrar a competência (fica somente leitura)', destino: { aba: 'fimdemes', sub: 'fechamento' } },
        { id: 'pedidos', rotulo: 'Pedidos de reabertura', descricao: 'Alterar um período encerrado: o gestor do DP aprova', destino: { aba: 'fimdemes', sub: 'pedidos' } },
    ] },
    { id: 'config', rotulo: 'Configurações', icone: 'config', direita: true, itens: [
        { id: 'iobsage', rotulo: 'IOB SAGE', descricao: 'Backup, restauração e menus do IOB × Consultor', destino: { aba: 'iobsage' } },
        { id: 'admin', rotulo: 'Usuários e carteiras', descricao: 'Papéis e empresas de cada pessoa', destino: { aba: 'admin' }, soAdmin: true },
    ] },
];

/** Menu visível para o papel (itens só de admin somem; grupo vazio também). */
export const menuDoPapel = (admin: boolean): GrupoMenu[] =>
    MENU.map(g => ({ ...g, itens: g.itens.filter(i => !i.soAdmin || admin) })).filter(g => g.itens.length > 0);

const mesmoDestino = (a: Destino, b: Destino) => JSON.stringify(a) === JSON.stringify(b);

/** Grupo e item do destino atual (para destacar o grupo e mostrar o caminho). */
export function ondeEsta(destino: Destino, menu: GrupoMenu[] = MENU): { grupo: GrupoMenu; item: ItemMenu } | null {
    for (const grupo of menu) for (const item of grupo.itens) if (mesmoDestino(item.destino, destino)) return { grupo, item };
    // Sub-aba sem item próprio (ex.: Cálculo aberto por outra tela): o primeiro item da mesma aba.
    for (const grupo of menu) for (const item of grupo.itens) if (item.destino.aba === destino.aba) return { grupo, item };
    return null;
}
