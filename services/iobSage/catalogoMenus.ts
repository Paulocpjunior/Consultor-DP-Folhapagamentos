// services/iobSage/catalogoMenus.ts
//
// Catálogo comparativo: menus da folha IOB/SAGE × o que o Consultor DP faz.
// Fonte dos menus: docs/mapa-menus-iob-folha.md (levantamento de 03/10/2026,
// só com títulos e resumos de busca; nada inventado). A situação de cada item
// no Consultor DP é a REAL nesta data — "planejado" não é promessa de tela
// pronta, e nenhum item marcado como disponível depende de algo que não existe.
//
// Produto: Office = IOB Office Folha de Pagamento (o do escritório);
// SGC = IOB Gestão Contábil / SAGE (árvore completa na ajuda online).

export type Situacao = 'disponivel' | 'parcial' | 'planejado' | 'fora';
export type Produto = 'Office' | 'SGC' | 'Office e SGC';
export type Destino = 'folha:apontamento' | 'folha:implantacao' | 'folha:conferencia' | 'folha:eventos' | 'folha:ponto' | 'cadastros:funcionarios' | 'cadastros:horarios' | 'cadastros:afastamentos' | 'cadastros:incidencias' | 'cadastros:sindicatos' | 'cadastros:tabelas' | 'calculo' | 'empresas' | 'esocial' | 'iobsage:restaurar';

export interface ItemMenu {
    id: string;
    caminho: string[];
    produto: Produto;
    descricao: string;
    fonte: string;
    situacao: Situacao;
    noConsultor: string;
    destino?: Destino;
    fase?: string;
}

export interface MenuIob { id: string; titulo: string; descricao: string; itens: ItemMenu[] }

const SGC = (arq: string) => `ajudaonline.ebs.com.br/sgc/${arq}`;
const APRENDO = (...n: number[]) => `aprendo.iob.com.br, artigo${n.length > 1 ? 's' : ''} ${n.join(', ')}`;

export const ROTULO_SITUACAO: Record<Situacao, string> = {
    disponivel: 'Disponível', parcial: 'Parcial', planejado: 'Planejado', fora: 'Fora do escopo',
};

export const MENUS_IOB: MenuIob[] = [
    {
        id: 'arquivos', titulo: 'Arquivos', descricao: 'Cadastros: funcionários, eventos, afastamentos, horários e sindicatos (no SGC, menu Cadastros).',
        itens: [
            { id: 'arq-funcionarios', caminho: ['Arquivos', 'Funcionários', 'Cadastro Básico'], produto: 'Office e SGC', descricao: 'Ficha do funcionário: Dados, Ident. Adm., Documentos, Outros, Complementos, Dependentes, Lanç. Automático, Holerite, Pesquisa.', fonte: `print do IOB Office; ${APRENDO(11178, 2904, 9303)}`, situacao: 'parcial', noConsultor: 'Cadastros › Funcionários: ficha por empresa com Dados, Ident. Adm., Documentos, Outros e Dependentes, gravada no Firestore com histórico; carga pelo XML do eSocial sem apagar edição manual; complemento pelo backup do IOB (de/para assistido, só preenche campo vazio e lista divergências); Excel. Faltam Complementos, Lanç. Automático e Holerite (aguardam os prints do Office).', destino: 'cadastros:funcionarios', fase: 'Fase 2 (base de dados)' },
            { id: 'arq-eventos', caminho: ['Arquivos', 'Eventos', 'Cadastro'], produto: 'Office e SGC', descricao: 'Eventos de vencimento e desconto, base de todos os cálculos; cada evento ligado a uma rubrica do eSocial.', fonte: `${APRENDO(10801, 17428)}; ${SGC('crhcadgenevecad.htm')}`, situacao: 'parcial', noConsultor: 'Catálogo de eventos IOB com as marcas de incidência (IN, IR, FG) e, em Cadastros › Incidências, a conferência com a rubrica do S-1010. Sem fórmulas de cálculo.', destino: 'folha:eventos', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'arq-afastamentos', caminho: ['Arquivos', 'Afastamentos/Retorno', 'Cadastro'], produto: 'Office', descricao: 'Afastamentos e retornos (S-2230).', fonte: APRENDO(2786, 2789, 14408), situacao: 'parcial', noConsultor: 'Cadastros › Afastamentos: lançamento manual e importação do S-2230 (início e término, retificação e exclusão pelo recibo), motivos da Tabela 18, dias por competência, 16º dia para o INSS em doença/acidente e "Afastado" na lista de funcionários. Não transmite o S-2230.', destino: 'cadastros:afastamentos', fase: 'Fase 4 (transmissão)' },
            { id: 'arq-horarios', caminho: ['Arquivos', 'Horários', 'Tabela de Horários'], produto: 'Office e SGC', descricao: 'Jornadas e tabela de horários do eSocial.', fonte: `${APRENDO(1299, 4144)}; ${SGC('crhcadhorjorn.htm')}`, situacao: 'parcial', noConsultor: 'Cadastros › Horários: jornada de cada dia por empresa, total semanal, horas noturnas, avisos da CLT e descrição da jornada para o S-2200; a ficha liga o horário e confere as horas semanais. Escalas e revezamento ainda não. O validador de ponto lê AFD e ACJEF.', destino: 'cadastros:horarios', fase: 'Fase 2 (base de dados)' },
            { id: 'arq-sindicatos', caminho: ['Arquivos', 'Sindicatos'], produto: 'Office e SGC', descricao: 'Sindicato, parâmetros da convenção, desconto sindical, aviso prévio, salário profissional.', fonte: `${APRENDO(4175, 4167, 17257)}; ${SGC('crhcadgensinpar.htm')}`, situacao: 'parcial', noConsultor: 'Cadastros › Sindicatos: CNPJ, código IOB, data-base, piso, registro e vigência da convenção (com alerta de vencimento) e contribuição. O uso no cálculo vem com o motor.', destino: 'cadastros:sindicatos', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'arq-tabelas', caminho: ['Cadastros', 'Genéricos', 'Tabelas Legais'], produto: 'SGC', descricao: 'IRRF, INSS e salário mínimo, com vigência.', fonte: SGC('crhcadgentab.htm'), situacao: 'parcial', noConsultor: 'Cadastros › Tabelas legais: INSS, IRRF, salário mínimo e salário-família por vigência, digitados da norma oficial (norma obrigatória); correção só pelo admin. Usadas pela prévia da aba Cálculo (INSS, IRRF com redutor, salário-família).', destino: 'cadastros:tabelas', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'arq-empresas', caminho: ['Gerenciador de Sistemas', 'Empresas', 'Parâmetros'], produto: 'SGC', descricao: 'Parâmetros da empresa para a folha, eSocial/REINF, início da DCTFWeb e do FGTS Digital.', fonte: SGC('csgcadempparrhesocial.htm'), situacao: 'parcial', noConsultor: 'Cadastro de empresas com código SAGE e certificado digital. Sem parâmetros de cálculo.', destino: 'empresas' },
            { id: 'arq-processos-jud', caminho: ['Cadastros', 'Processos Judiciais/Administrativos'], produto: 'SGC', descricao: 'Processos que suspendem incidências (S-1070).', fonte: SGC('rh_cad_processos.htm'), situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 3 (motor de cálculo)' },
        ],
    },
    {
        id: 'processos', titulo: 'Processos', descricao: 'Cálculos: folha mensal, adiantamento, férias, 13º, rescisão e rotinas especiais (no SGC, menu Módulos).',
        itens: [
            { id: 'proc-digitacao', caminho: ['Processos', 'Digitação de Holerites'], produto: 'Office', descricao: 'Lançamento dos eventos variáveis do mês.', fonte: APRENDO(17289, 13373), situacao: 'disponivel', noConsultor: 'Apontamento: lê a planilha do cliente e gera o TXT de ponto que o IOB importa (Windows-3 e Windows-4).', destino: 'folha:apontamento' },
            { id: 'proc-folha', caminho: ['Processos', 'Pagamento Mensal', 'Cálculo da Folha'], produto: 'Office e SGC', descricao: 'Cálculo mensal com movimento automático, tributos, guias, holerite.', fonte: SGC('crhmodpagatu.htm'), situacao: 'parcial', noConsultor: 'Aba Cálculo: prévia do cálculo mensal por empresa (salário proporcional, afastamentos, horas extras com DSR, faltas, INSS, IRRF com redutor de 2026, salário-família, FGTS) com memória de cálculo e Excel; o movimento do mês é gravado por funcionário, com auditoria. O resultado do cálculo ainda não é gravado; férias, 13º, rescisão, adicionais e médias ainda não. O cálculo oficial continua no IOB até a conferência.', destino: 'calculo', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-adiantamento', caminho: ['Processos', 'Adiantamento de Salário', 'Cálculo'], produto: 'Office e SGC', descricao: 'Adiantamento salarial.', fonte: `${APRENDO(17289, 12861, 807)}; ${SGC('crhmodadical.htm')}`, situacao: 'planejado', noConsultor: 'O apontamento exporta o arquivo do adiantamento. O cálculo continua no IOB.', destino: 'folha:apontamento', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-ferias', caminho: ['Processos', 'Férias', 'Cálculo'], produto: 'Office e SGC', descricao: 'Férias normais e coletivas, recibos, provisão.', fonte: `${APRENDO(2760, 2346, 4566)}; ${SGC('crhmodfernor.htm')}`, situacao: 'parcial', noConsultor: 'Aba Cálculo › Folha Férias: recibo de cada gozo lançado em Afastamentos (motivo 15) — período aquisitivo e concessivo, direito pelas faltas (art. 130), perda do direito (art. 133), média de horas extras, 1/3, abono pecuniário, dobra (art. 137), INSS por competência, IRRF em separado, FGTS e data-limite do pagamento. Faltam férias coletivas e antecipadas, a integração do INSS com a folha do mês e o aviso de férias.', destino: 'calculo', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-13', caminho: ['Processos', '13º Salário', 'Cálculo'], produto: 'Office e SGC', descricao: '1ª parcela, parcela única, complemento, provisão.', fonte: `${APRENDO(13816, 4147, 2037)}; ${SGC('crhmod13.htm')}`, situacao: 'parcial', noConsultor: 'Aba Cálculo › Folha 13º: prévia da 1ª e da 2ª parcela (avos com a regra dos 15 dias, afastamentos do INSS, faltas, média de horas extras com DSR pelos movimentos gravados, INSS e IRRF do 13º em separado, FGTS de cada parcela), com memória e Excel. Falta o 13º na rescisão, a provisão e outras médias. A conferência lê os totalizadores do 13º (apuração anual).', destino: 'calculo', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-rescisao', caminho: ['Processos', 'Rescisão', 'Cálculo'], produto: 'Office e SGC', descricao: 'Aviso prévio, cálculo, simulação, TRCT, complementar, FGTS rescisório.', fonte: `${APRENDO(17264, 6723, 2931)}; ${SGC('crhmodrescalind.htm')}`, situacao: 'parcial', noConsultor: 'Aba Cálculo › Folha Rescisão: TRCT em prévia dos desligados do mês e simulação para ativos — saldo de salário, aviso prévio proporcional (indenizado, trabalhado, não cumprido) com projeção, 13º proporcional e sobre o aviso, férias vencidas (com dobra) e proporcionais, art. 479, FGTS rescisório, multa de 40%/20% sobre o saldo informado e prazo de 10 dias. Faltam TRCT impresso, rescisão complementar e homologação. A conferência separa o FGTS rescisório no S-5013.', destino: 'calculo', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-complementar', caminho: ['Processos', 'Folha Complementar'], produto: 'Office', descricao: 'Complemento por dissídio, com listagem analítica.', fonte: APRENDO(2765, 2773, 2775), situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-intermitente', caminho: ['Processos', 'Trabalho Intermitente'], produto: 'Office e SGC', descricao: 'Convocação, recibos, holerites.', fonte: `${APRENDO(13831, 13269)}; ${SGC('trabalho_intermitente.htm')}`, situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 5 (ondas)' },
            { id: 'proc-consignado', caminho: ['Processos', 'Empréstimo Consignado/Crédito do Trabalhador'], produto: 'Office e SGC', descricao: 'Contratos do crédito do trabalhador, desconto em folha e rescisão (S-1200, S-2299).', fonte: `${APRENDO(16978, 17186)}; ${SGC('crhmodemp_cred_trad.htm')}`, situacao: 'parcial', noConsultor: 'A conferência separa o consignado (CR 160601) do INSS. Não há cadastro de contratos.', destino: 'folha:conferencia', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-beneficios', caminho: ['Processos', 'Vale Transporte / Controle de Benefícios'], produto: 'Office e SGC', descricao: 'VT, VR, plano de saúde com coparticipação.', fonte: `${APRENDO(2992, 4114, 17184)}; ${SGC('crhmodvtfor.htm')}`, situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 5 (ondas)' },
            { id: 'proc-autonomos', caminho: ['Módulos', 'Autônomos', 'Pagamentos'], produto: 'SGC', descricao: 'RPA de autônomos, IRRF e INSS.', fonte: SGC('crhmodautrpa.htm'), situacao: 'parcial', noConsultor: 'O apontamento lê a planilha de autônomos de clientes que usam esse modelo.', destino: 'folha:apontamento', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-prolabore', caminho: ['Módulos', 'Retiradas/Pró-labore'], produto: 'SGC', descricao: 'Diretores, cálculo de pró-labore, informe de rendimentos.', fonte: SGC('crhmoddiretores.htm'), situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'proc-agrupado', caminho: ['Módulos', 'Processamento Agrupado'], produto: 'SGC', descricao: 'Várias empresas de uma vez: mensal, adiantamento, provisões, rotinas anuais.', fonte: SGC('crhmodprocagrup.htm'), situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 5 (ondas)' },
        ],
    },
    {
        id: 'relatorios', titulo: 'Relatórios', descricao: 'Folha mensal, holerite, resumo, ficha financeira, listagens, informe.',
        itens: [
            { id: 'rel-folha', caminho: ['Relatórios', 'Mensais', 'Folha Mensal / Resumo da Folha'], produto: 'Office e SGC', descricao: 'Relação analítica da folha e resumo mensal.', fonte: `${APRENDO(15204, 16993)}; ${SGC('crhrelmenfol.htm')}`, situacao: 'planejado', noConsultor: 'Não existe. Com o backup restaurado, pode ser montado a partir das tabelas de movimento do SAGE.', destino: 'iobsage:restaurar', fase: 'Fase 2 (base de dados)' },
            { id: 'rel-holerite', caminho: ['Relatórios', 'Mensais', 'Holerite'], produto: 'Office e SGC', descricao: 'Holerite, também por e-mail e pelo IOB Abordo.', fonte: SGC('crhrelmenhol.htm'), situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'rel-ficha', caminho: ['Relatórios', 'Funcionários', 'Ficha Financeira'], produto: 'SGC', descricao: 'Valores do ano, mês a mês e evento a evento.', fonte: SGC('crhrelfuncfic.htm'), situacao: 'planejado', noConsultor: 'Não existe. É o primeiro relatório candidato a sair do backup restaurado.', destino: 'iobsage:restaurar', fase: 'Fase 2 (base de dados)' },
            { id: 'rel-listagens', caminho: ['Listagens'], produto: 'Office', descricao: 'Listagens de funcionários e sindicatos.', fonte: APRENDO(8441), situacao: 'parcial', noConsultor: 'A implantação exporta o Excel de cadastro dos funcionários do eSocial.', destino: 'folha:implantacao' },
            { id: 'rel-informe', caminho: ['Relatórios', 'Informe de Rendimentos'], produto: 'Office e SGC', descricao: 'Comprovante anual de rendimentos.', fonte: `${APRENDO(11459, 2950)}; ${SGC('crhmodanoinf.htm')}`, situacao: 'planejado', noConsultor: 'Não existe. Pode sair do S-5002.', fase: 'Fase 4' },
            { id: 'rel-experiencia', caminho: ['Relatórios', 'Funcionários', 'Controle de Contratos de Experiência'], produto: 'SGC', descricao: 'Vencimento dos contratos de experiência.', fonte: SGC('crhrelfuncexp.htm'), situacao: 'planejado', noConsultor: 'Não existe. Entra no painel de prazos.', fase: 'Fase 1 (painel de prazos)' },
        ],
    },
    {
        id: 'tributos', titulo: 'Guias, impostos e obrigações', descricao: 'DCTFWeb, FGTS Digital, IRRF, DIRF/informe, EFD-Reinf, contribuição sindical (no SGC, menu Tributos e Rotinas Anuais).',
        itens: [
            { id: 'trib-dctfweb', caminho: ['eSocial', 'Fechamento de Movimento', 'DCTFWeb'], produto: 'Office e SGC', descricao: 'O S-1299 alimenta a DCTFWeb; o DARF sai dela.', fonte: `${APRENDO(15202, 15053)}; ${SGC('fechamento_de_movimento.htm')}`, situacao: 'parcial', noConsultor: 'Conferência pós-folha: S-5011 × débitos da DCTFWeb por código de receita, pelo SERPRO. Não transmite nem emite DARF.', destino: 'folha:conferencia', fase: 'Fase 4 (transmissão)' },
            { id: 'trib-fgts', caminho: ['eSocial', 'Conferência de Tributos', 'Relatório de Conferência para FGTS Digital'], produto: 'Office e SGC', descricao: 'Conferência da base e da guia do FGTS Digital.', fonte: `${APRENDO(16466)}; ${SGC('crhesocialconftribconffgts.htm')}`, situacao: 'disponivel', noConsultor: 'Conferência pós-folha: S-5003 × S-5013 × guia, mais devido e recolhido pelo SERPRO.', destino: 'folha:conferencia' },
            { id: 'trib-pagamento', caminho: ['Tributos', 'Pagamento de Guias'], produto: 'SGC', descricao: 'Baixa das guias pagas, inclusive pelo e-CAC.', fonte: SGC('crhtribpagguias.htm'), situacao: 'parcial', noConsultor: 'A conferência mostra o FGTS recolhido pelo SERPRO. DARF pago ainda não.', destino: 'folha:conferencia', fase: 'Fase 1' },
            { id: 'trib-sindical', caminho: ['Tributos', 'Contribuição Sindical Patronal'], produto: 'SGC', descricao: 'Guia da contribuição sindical patronal.', fonte: SGC('crhtriconsinpat.htm'), situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 5 (ondas)' },
            { id: 'trib-dirf', caminho: ['Rotinas Anuais', 'DIRF / Informe de Rendimentos'], produto: 'Office e SGC', descricao: 'DIRF (substituída pelo eSocial e pela EFD-Reinf) e informe.', fonte: `${APRENDO(15984, 11459)}; ${SGC('crhmodanodirf.htm')}`, situacao: 'planejado', noConsultor: 'DIRF não se aplica mais. O informe entra na Fase 4.', fase: 'Fase 4' },
            { id: 'trib-reinf', caminho: ['EFD-Reinf', 'R-4010 / R-4099 / R-1050'], produto: 'Office', descricao: 'Retenções na fonte.', fonte: APRENDO(16469, 16471, 16005), situacao: 'fora', noConsultor: 'Tratada no Consultor Contábil (CCI) e no Consultor Fiscal (CFI).' },
            { id: 'trib-sefip', caminho: ['Módulos', 'SEFIP / GRRF'], produto: 'SGC', descricao: 'Arquivos do Conectividade Social, substituídos pelo eSocial e pelo FGTS Digital.', fonte: SGC('crhoutsefip.htm'), situacao: 'fora', noConsultor: 'Obrigação substituída; nada a gerar.' },
        ],
    },
    {
        id: 'esocial', titulo: 'eSocial', descricao: 'Periódicos, fechamento, conferência de tributos, consultas e rotinas auxiliares.',
        itens: [
            { id: 'es-conferencia', caminho: ['eSocial', 'Conferência de Tributos'], produto: 'Office e SGC', descricao: 'Totalizadores S-5001, S-5002 e S-5011 × sistema.', fonte: `${APRENDO(12178, 15203, 15283)}; ${SGC('conferencia_de_tributos.htm')}`, situacao: 'disponivel', noConsultor: 'Conferência pós-folha: S-5001, S-5003, S-5011 e S-5013, e o IRRF pelo S-5002 × S-5012 × DCTFWeb (mês do pagamento), com pendências e Excel.', destino: 'folha:conferencia' },
            { id: 'es-periodicos', caminho: ['eSocial', 'Movimento eSocial', 'Geração e Acompanhamento de Periódicos'], produto: 'Office e SGC', descricao: 'S-1200, S-1210, S-2299 em lote.', fonte: `${APRENDO(15053)}; ${SGC('geracao_de_eventos_periodicos2.htm')}`, situacao: 'planejado', noConsultor: 'O módulo eSocial tem só o esqueleto de geração; não transmite.', destino: 'esocial', fase: 'Fase 4 (transmissão)' },
            { id: 'es-fechamento', caminho: ['eSocial', 'Fechamento / Reabertura de Movimento'], produto: 'Office e SGC', descricao: 'S-1299 e S-1298, com transmissão automática da DCTFWeb.', fonte: `${APRENDO(8961, 15202)}; ${SGC('fechamento_de_movimento.htm')}`, situacao: 'parcial', noConsultor: 'A conferência consulta pelo SERPRO se o fechamento foi transmitido.', destino: 'folha:conferencia', fase: 'Fase 4 (transmissão)' },
            { id: 'es-recibos', caminho: ['eSocial', 'Consulta de Recibos / Situação de Envio'], produto: 'Office e SGC', descricao: 'Recibos e situação dos envios por empresa.', fonte: `${APRENDO(15083)}; ${SGC('consulta_situacao_de_envio_das.htm')}`, situacao: 'parcial', noConsultor: 'Monitor eSocial com eventos, certificados e calendário.', destino: 'esocial' },
            { id: 'es-diagnostico', caminho: ['eSocial', 'IOB Diagnóstico eSocial'], produto: 'Office e SGC', descricao: 'Pré-análise do cadastro antes de gerar eventos (apto/não apto).', fonte: `${APRENDO(9420, 12084)}; ${SGC('crhmodesocialiobdiag.htm')}`, situacao: 'parcial', noConsultor: 'A implantação aponta pendências do cadastro vindo do eSocial.', destino: 'folha:implantacao' },
            { id: 'es-rubricas', caminho: ['eSocial', 'Rotinas Auxiliares', 'Relacionamento de Rubricas'], produto: 'SGC', descricao: 'Eventos × rubricas e incidências (S-1010).', fonte: SGC('relacionamento_de_rubricas_par.htm'), situacao: 'parcial', noConsultor: 'Cadastros › Incidências: importa o S-1010 da empresa (vigências, inclusão, alteração e exclusão), liga cada rubrica ao evento do IOB pelo código ou à mão e confere tipo, INSS, IRRF e FGTS na competência; Excel. Não gera nem transmite o S-1010.', destino: 'cadastros:incidencias', fase: 'Fase 4 (transmissão)' },
            { id: 'es-sst', caminho: ['Saúde e Segurança do Trabalho (ASO, CAT, S-2210, S-2220, S-2240)'], produto: 'Office e SGC', descricao: 'Saúde e segurança do trabalho.', fonte: `${APRENDO(15054, 14999)}; ${SGC('configuracao_envio_sst_esocial.htm')}`, situacao: 'fora', noConsultor: 'Decisão de 03/10/2026: SST fica com a medicina do trabalho dos clientes.' },
        ],
    },
    {
        id: 'utilitarios', titulo: 'Utilitários', descricao: 'Importações, estorno, alteração de processamento, envio por e-mail, transferência, backup.',
        itens: [
            { id: 'ut-restaurar', caminho: ['Utilitários', 'Restaurar backup do IOB SAGE (.zip + .backup)'], produto: 'Office e SGC', descricao: 'No modo SQL, o Backup SQL da linha Office tem duas partes: .zip com o cadastro das empresas e .backup com os dados da folha (PostgreSQL).', fonte: 'Ajuda Aprendo³, artigo 4898; formatos pg_dump e DBF', situacao: 'disponivel', noConsultor: 'Lê as duas partes no navegador: tabelas DBF do .zip e tabelas PostgreSQL do .backup, com prévia, CSV e inventário. Nada é enviado.', destino: 'iobsage:restaurar' },
            { id: 'ut-imp-ponto', caminho: ['Utilitários', 'Importações', 'Ponto'], produto: 'Office', descricao: 'Importa o TXT de ponto (layouts Windows-3 e Windows-4).', fonte: 'print do IOB Office; layout oficial da IOB de 25/09/2026', situacao: 'disponivel', noConsultor: 'O apontamento gera esse arquivo.', destino: 'folha:apontamento' },
            { id: 'ut-imp-rais', caminho: ['Utilitários', 'Importações', 'RAIS'], produto: 'Office', descricao: 'Importação de dados da RAIS2009 (cria empresa e vínculos).', fonte: 'print do IOB Office; homologado em 28/09/2026', situacao: 'disponivel', noConsultor: 'A implantação gera o arquivo RAIS de 584 posições.', destino: 'folha:implantacao' },
            { id: 'ut-imp-valores', caminho: ['Utilitários', 'Importações', 'Valores / Digitação Diária / SEFIP'], produto: 'Office', descricao: 'Outras importações do Office.', fonte: 'print do IOB Office', situacao: 'planejado', noConsultor: 'Layout não levantado. Precisa do manual ou de um arquivo de exemplo.', fase: 'A definir' },
            { id: 'ut-estorno', caminho: ['Utilitários', 'Estorno do Cálculo / Alteração de Processamento'], produto: 'Office e SGC', descricao: 'Desfaz ou ajusta um cálculo já processado.', fonte: `${APRENDO(4968)}; ${SGC('crhmodpagest.htm')}`, situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 3 (motor de cálculo)' },
            { id: 'ut-email', caminho: ['Utilitários', 'Envio de Relatórios por E-mail'], produto: 'SGC', descricao: 'Holerite e informe por e-mail.', fonte: SGC('crhutiholeporemail.htm'), situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 5 (ondas)' },
            { id: 'ut-transferencia', caminho: ['Utilitários', 'Transferência de Funcionários'], produto: 'Office e SGC', descricao: 'Entre empresas e estabelecimentos.', fonte: `${APRENDO(14909)}; ${SGC('crhutitrafuncempindiv.htm')}`, situacao: 'planejado', noConsultor: 'Não existe.', fase: 'Fase 5 (ondas)' },
        ],
    },
    {
        id: 'diversos', titulo: 'Diversos', descricao: 'Integração contábil e painéis.',
        itens: [
            { id: 'div-contabil', caminho: ['Diversos', 'Integração Contábil', 'Exportação'], produto: 'Office e SGC', descricao: 'Lote contábil da folha, contas por evento e centro de custo.', fonte: `${APRENDO(4685, 5402)}; ${SGC('crhmodint.htm')}`, situacao: 'planejado', noConsultor: 'Não existe. O destino é o Consultor Contábil (CCI).', fase: 'Fase 5 (ondas)' },
            { id: 'div-paineis', caminho: ['IOB Online', 'Dashboards da Folha'], produto: 'Office', descricao: 'Folha mensal, férias a vencer, eSocial, mapa de admissões e desligamentos.', fonte: APRENDO(17533), situacao: 'parcial', noConsultor: 'Dashboard do eSocial. Painel de prazos do DP está planejado.', destino: 'esocial', fase: 'Fase 1 (painel de prazos)' },
        ],
    },
];

export function resumoSituacao(menus: MenuIob[] = MENUS_IOB): Record<Situacao, number> {
    const r: Record<Situacao, number> = { disponivel: 0, parcial: 0, planejado: 0, fora: 0 };
    for (const m of menus) for (const i of m.itens) r[i.situacao]++;
    return r;
}
