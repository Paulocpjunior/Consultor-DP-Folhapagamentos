// services/navegacao/menu.ts
//
// Menu do app em grupos, na ordem do trabalho do DP: primeiro a empresa (e o período),
// depois os cadastros, a folha do mês, as conferências, o eSocial, os prazos e o fim de mês;
// as configurações ficam à direita. Cada item leva a uma tela (aba) e, quando há, à sub-aba dela.

export type Aba = 'folha' | 'cadastros' | 'calculo' | 'prazos' | 'certificados' | 'empresas' | 'esocial' | 'iobsage' | 'admin' | 'fimdemes' | 'relatorios' | 'servicos' | 'demissoes' | 'beneficios' | 'contribuintes' | 'dctfweb' | 'processos' | 'intermitentes' | 'obras' | 'departamentos' | 'agrupado' | 'transferencia' | 'contabil' | 'processosjud' | 'sindicalpatronal' | 'importacao';

export type SubFolha = 'eventos' | 'apontamento' | 'validador-ponto' | 'implantacao' | 'conferencia';
export type SubCadastroMenu = 'funcionarios' | 'horarios' | 'afastamentos' | 'incidencias' | 'enquadramento' | 'sindicatos' | 'tabelas' | 'conformidade';
export type SubEsocial = 'dashboard' | 'saude' | 'diagnostico' | 'eventos' | 'transmissao' | 'download' | 'fgts' | 'calendario' | 'teses' | 'ponto' | 'ponto_eletronico' | 'relatorio' | 'audit';
export type FolhaCalculo = 'mensal' | 'adiantamento' | '13-1a' | '13-2a' | 'ferias' | 'rescisao';

export type Destino =
    | { aba: 'folha'; sub: SubFolha }
    | { aba: 'cadastros'; sub: SubCadastroMenu }
    | { aba: 'esocial'; sub: SubEsocial }
    | { aba: 'calculo'; folha: FolhaCalculo }
    | { aba: 'fimdemes'; sub: 'fechamento' | 'pedidos' }
    | { aba: 'relatorios'; sub: 'central' | 'modelos' }
    | { aba: 'empresas' | 'certificados' | 'prazos' | 'iobsage' | 'admin' | 'servicos' | 'demissoes' | 'beneficios' | 'contribuintes' | 'dctfweb' | 'processos' | 'intermitentes' | 'obras' | 'departamentos' | 'agrupado' | 'transferencia' | 'contabil' | 'processosjud' | 'sindicalpatronal' | 'importacao' }
    | { aba: 'trocar' };

import type { NomeIcone } from '../../components/layout/icones';

export type Icone = NomeIcone;

export interface ItemMenu { id: string; rotulo: string; descricao: string; icone: Icone; destino: Destino; soAdmin?: boolean }
export interface GrupoMenu { id: string; rotulo: string; icone: Icone; itens: ItemMenu[]; direita?: boolean }

export const MENU: GrupoMenu[] = [
    { id: 'empresas', rotulo: 'Empresas', icone: 'empresa', itens: [
        { id: 'trocar', rotulo: 'Ativar empresa e período', descricao: 'Escolher a empresa da carteira e a competência de trabalho', icone: 'trocar', destino: { aba: 'trocar' } },
        { id: 'empresas', rotulo: 'Cadastro de empresas', descricao: 'Dados da empresa, parâmetros da folha e contas', icone: 'empresa', destino: { aba: 'empresas' } },
        { id: 'certificados', rotulo: 'Certificados digitais', descricao: 'Cofre do A1: vencimentos e renovação', icone: 'certificado', destino: { aba: 'certificados' } },
    ] },
    { id: 'cadastros', rotulo: 'Cadastros', icone: 'cadastro', itens: [
        { id: 'funcionarios', rotulo: 'Funcionários', descricao: 'Fichas, salários e dependentes', icone: 'pessoas', destino: { aba: 'cadastros', sub: 'funcionarios' } },
        { id: 'horarios', rotulo: 'Horários', descricao: 'Jornadas e escalas', icone: 'relogio', destino: { aba: 'cadastros', sub: 'horarios' } },
        { id: 'afastamentos', rotulo: 'Afastamentos e férias', descricao: 'Licenças, atestados e gozos de férias', icone: 'calendarioX', destino: { aba: 'cadastros', sub: 'afastamentos' } },
        { id: 'sindicatos', rotulo: 'Sindicatos', descricao: 'Convenções em PDF, pisos, reajuste e contribuições', icone: 'sindicato', destino: { aba: 'cadastros', sub: 'sindicatos' } },
        { id: 'eventos', rotulo: 'Eventos IOB', descricao: 'Catálogo de eventos (código, rotina e incidências)', icone: 'lista', destino: { aba: 'folha', sub: 'eventos' } },
        { id: 'incidencias', rotulo: 'Incidências', descricao: 'Eventos IOB × rubricas do S-1010 e o S-1010 pelo Consultor', icone: 'elo', destino: { aba: 'cadastros', sub: 'incidencias' } },
        { id: 'obras', rotulo: 'Obras e lotações', descricao: 'Obras (CNO), empreitadas e tomadores: S-1005 e S-1020, FPAS e terceiros por lotação, para a folha por obra', icone: 'camadas', destino: { aba: 'obras' } },
        { id: 'departamentos', rotulo: 'Departamentos', descricao: 'Departamentos e centros de custo da empresa, para a folha, os holerites e o resumo por departamento', icone: 'camadas', destino: { aba: 'departamentos' } },
        { id: 'transferencia', rotulo: 'Transferência de funcionários', descricao: 'Para outra empresa do grupo, sem rescisão: ficha, férias e históricos no destino, S-2299 (motivo 11) e S-2200 com a sucessão', icone: 'trocar', destino: { aba: 'transferencia' } },
        { id: 'processosjud', rotulo: 'Processos judiciais e administrativos', descricao: 'S-1070: processos que suspendem INSS, IRRF ou FGTS e os do RAT, do FAP e de terceiros, com o envio pelo Consultor', icone: 'balanca', destino: { aba: 'processosjud' } },
        { id: 'enquadramento', rotulo: 'Enquadramento', descricao: 'FPAS, RAT/FAP e terceiros da empresa', icone: 'camadas', destino: { aba: 'cadastros', sub: 'enquadramento' } },
        { id: 'tabelas', rotulo: 'Tabelas legais', descricao: 'INSS, IRRF, salário-família e mínimo federal e estadual', icone: 'tabela', destino: { aba: 'cadastros', sub: 'tabelas' } },
        { id: 'conformidade', rotulo: 'Conformidade', descricao: 'Salário mínimo e convenção coletiva: pisos, reajuste e obrigações', icone: 'sindicato', destino: { aba: 'cadastros', sub: 'conformidade' } },
        { id: 'implantacao', rotulo: 'Implantação de funcionários', descricao: 'Primeiro acesso: unificar eSocial e ficha', icone: 'pessoaMais', destino: { aba: 'folha', sub: 'implantacao' } },
    ] },
    { id: 'folha', rotulo: 'Folha do mês', icone: 'folha', itens: [
        { id: 'apontamento', rotulo: 'Apontamento', descricao: 'Planilha do cliente para o IOB', icone: 'prancheta', destino: { aba: 'folha', sub: 'apontamento' } },
        { id: 'importacao', rotulo: 'Importação de valores', descricao: 'TXT de lançamentos no layout do IOB (Windows 3 ou 4) direto no movimento do mês', icone: 'baixar', destino: { aba: 'importacao' } },
        { id: 'adiantamento', rotulo: 'Adiantamento', descricao: 'Cálculo, recibos e arquivo do banco', icone: 'dinheiro', destino: { aba: 'calculo', folha: 'adiantamento' } },
        { id: 'mensal', rotulo: 'Cálculo mensal', descricao: 'Movimento, holerites e resumo da folha', icone: 'calculadora', destino: { aba: 'calculo', folha: 'mensal' } },
        { id: 'agrupado', rotulo: 'Processamento agrupado', descricao: 'A folha mensal de várias empresas da carteira de uma vez: situação, totais, adiantamento, encargos e provisões, com a gravação da folha e a planilha', icone: 'camadas', destino: { aba: 'agrupado' } },
        { id: 'intermitentes', rotulo: 'Trabalho intermitente', descricao: 'Convocações (prazo de 3 dias, resposta em 1 dia útil), dias e horas trabalhados, e a folha da convocação com DSR, férias + 1/3 e 13º proporcionais', icone: 'calendarioX', destino: { aba: 'intermitentes' } },
        { id: 'ferias', rotulo: 'Férias', descricao: 'Programar e calcular o recibo de férias', icone: 'sol', destino: { aba: 'calculo', folha: 'ferias' } },
        { id: 'rescisao', rotulo: 'Rescisão', descricao: 'Simular e calcular o TRCT', icone: 'saida', destino: { aba: 'calculo', folha: 'rescisao' } },
        { id: 'beneficios', rotulo: 'Administração de benefícios', descricao: 'Fornecedores e contratados, pedido de vale-transporte (quantidade do mês por operadora) e coparticipação do plano de saúde na folha', icone: 'presente', destino: { aba: 'beneficios' } },
        { id: 'contribuintes', rotulo: 'Pró-labore e autônomos (RPA)', descricao: 'Sócios e autônomos: INSS de 11% até o teto, 20% da empresa, IRRF, ISS, recibos e o S-1200 e o S-1210', icone: 'dinheiro', destino: { aba: 'contribuintes' } },
        { id: 'sindicalpatronal', rotulo: 'Contribuição sindical patronal', descricao: 'Adesão, capital social e tabela da confederação: o valor da GRCSU de janeiro, as filiais e o atraso', icone: 'sindicato', destino: { aba: 'sindicalpatronal' } },
        { id: 'demissoes', rotulo: 'Demissões (prévia)', descricao: 'Cenários de demissão lado a lado, custo para a empresa, PDF e envio ao cliente, sem ir ao eSocial', icone: 'saida', destino: { aba: 'demissoes' } },
        { id: '13-1a', rotulo: '13º salário — 1ª parcela', descricao: 'Adiantamento do 13º até 30/11', icone: 'presente', destino: { aba: 'calculo', folha: '13-1a' } },
        { id: '13-2a', rotulo: '13º salário — 2ª parcela', descricao: 'Parcela final até 20/12', icone: 'presente', destino: { aba: 'calculo', folha: '13-2a' } },
    ] },
    { id: 'conferencia', rotulo: 'Conferência', icone: 'conferencia', itens: [
        { id: 'pos-folha', rotulo: 'Conferência pós-folha', descricao: 'Totalizadores do eSocial, DCTFWeb e FGTS', icone: 'conferencia', destino: { aba: 'folha', sub: 'conferencia' } },
        { id: 'ponto', rotulo: 'Validador de ponto (ACJEF)', descricao: 'Arquivo do ponto eletrônico', icone: 'checkCirculo', destino: { aba: 'folha', sub: 'validador-ponto' } },
        { id: 'relatorio', rotulo: 'Relatório do eSocial', descricao: 'Eventos por competência', icone: 'grafico', destino: { aba: 'esocial', sub: 'relatorio' } },
    ] },
    { id: 'relatorios', rotulo: 'Relatórios', icone: 'grafico', itens: [
        { id: 'central', rotulo: 'Central de relatórios', descricao: 'Folha, holerites, resumo, relação bancária, funcionários, férias: imprimir, PDF, Excel, e-mail e WhatsApp', icone: 'grafico', destino: { aba: 'relatorios', sub: 'central' } },
        { id: 'contabil', rotulo: 'Integração contábil', descricao: 'Lote de lançamentos da folha gravada para a contabilidade: plano de contas por verba e encargo, centro de custo pelo departamento, provisões, conferência e arquivo', icone: 'tabela', destino: { aba: 'contabil' } },
        { id: 'modelos', rotulo: 'Contratos e modelos', descricao: 'Contrato de experiência, prorrogação, advertência, suspensão, aviso, declarações: personalizar, importar do SAGE e enviar', icone: 'contrato', destino: { aba: 'relatorios', sub: 'modelos' } },
    ] },
    { id: 'esocial', rotulo: 'eSocial', icone: 'esocial', itens: [
        { id: 'dashboard', rotulo: 'Painel', descricao: 'Situação dos eventos e pendências', icone: 'painel', destino: { aba: 'esocial', sub: 'dashboard' } },
        { id: 'saude', rotulo: 'Saúde do eSocial', descricao: 'Fila dos lotes, consulta automática, alertas e pré-voo', icone: 'saude', destino: { aba: 'esocial', sub: 'saude' } },
        { id: 'diagnostico', rotulo: 'Diagnóstico do cadastro', descricao: 'Empresa, trabalhadores, rubricas, horários e afastamentos: apto ou não apto antes de gerar os eventos', icone: 'conferencia', destino: { aba: 'esocial', sub: 'diagnostico' } },
        { id: 'transmissao', rotulo: 'Transmissão', descricao: 'Enviar lotes, S-1299 e S-1298', icone: 'enviar', destino: { aba: 'esocial', sub: 'transmissao' } },
        { id: 'eventos', rotulo: 'Eventos', descricao: 'Eventos registrados e recibos', icone: 'lista', destino: { aba: 'esocial', sub: 'eventos' } },
        { id: 'download', rotulo: 'Download', descricao: 'Baixar eventos do governo', icone: 'baixar', destino: { aba: 'esocial', sub: 'download' } },
        { id: 'fgts', rotulo: 'FGTS Digital', descricao: 'Recolhimento mês a mês, extrato por funcionário, CRF e procuração do FGTS Digital', icone: 'moeda', destino: { aba: 'esocial', sub: 'fgts' } },
        { id: 'dctfweb', rotulo: 'DCTFWeb da folha', descricao: 'Insumos (eSocial, Reinf e MIT), débitos, DARF e transmissão pelo SERPRO', icone: 'moeda', destino: { aba: 'dctfweb' } },
        { id: 'processos', rotulo: 'Processos trabalhistas', descricao: 'Decisões e acordos trabalhistas: S-2500 (processo e bases) e S-2501 (contribuições e IRRF)', icone: 'balanca', destino: { aba: 'processos' } },
        { id: 'ponto-editor', rotulo: 'Ponto (editor)', descricao: 'Layouts e marcações do ponto', icone: 'lapis', destino: { aba: 'esocial', sub: 'ponto' } },
        { id: 'ponto-eletronico', rotulo: 'Ponto eletrônico', descricao: 'Espelho e apuração', icone: 'relogio', destino: { aba: 'esocial', sub: 'ponto_eletronico' } },
        { id: 'teses', rotulo: 'Recuperação', descricao: 'Teses e créditos', icone: 'balanca', destino: { aba: 'esocial', sub: 'teses' } },
        { id: 'audit', rotulo: 'Registro de auditoria', descricao: 'Quem enviou o quê', icone: 'historico', destino: { aba: 'esocial', sub: 'audit' } },
    ] },
    { id: 'prazos', rotulo: 'Prazos', icone: 'prazo', itens: [
        { id: 'prazos', rotulo: 'Prazos do DP', descricao: 'Obrigações do mês, baixa das guias pagas (DARF, FGTS, sindicais) e prazos dos funcionários', icone: 'prazo', destino: { aba: 'prazos' } },
        { id: 'calendario', rotulo: 'Calendário do eSocial', descricao: 'Vencimentos por competência', icone: 'calendario', destino: { aba: 'esocial', sub: 'calendario' } },
    ] },
    { id: 'fimdemes', rotulo: 'Fim de mês', icone: 'fim', itens: [
        { id: 'fechamento', rotulo: 'Fechamento do mês', descricao: 'Conferir e encerrar a competência (fica somente leitura)', icone: 'fim', destino: { aba: 'fimdemes', sub: 'fechamento' } },
        { id: 'pedidos', rotulo: 'Pedidos de reabertura', descricao: 'Alterar um período encerrado: o gestor do DP aprova', icone: 'cadeadoAberto', destino: { aba: 'fimdemes', sub: 'pedidos' } },
    ] },
    { id: 'config', rotulo: 'Configurações', icone: 'config', direita: true, itens: [
        { id: 'iobsage', rotulo: 'IOB SAGE', descricao: 'Backup, restauração e menus do IOB × Consultor', icone: 'banco', destino: { aba: 'iobsage' } },
        { id: 'admin', rotulo: 'Usuários e carteiras', descricao: 'Papéis e empresas de cada pessoa', icone: 'pessoas', destino: { aba: 'admin' }, soAdmin: true },
        { id: 'servicos', rotulo: 'Serviços externos', descricao: 'Quem atende o cofre, o governo, o e-mail, o WhatsApp e a IA (CFI, plataforma comum ou SP Connect)', icone: 'elo', destino: { aba: 'servicos' } },
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
