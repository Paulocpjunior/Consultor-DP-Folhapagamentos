# Mapa de menus da folha IOB/SAGE

> Levantamento de 03/10/2026, feito só com busca na web: as páginas de ajuda
> da IOB (ajudaonline.ebs.com.br, ajudaonline.iob.com.br, aprendo.iob.com.br)
> estão bloqueadas para leitura direta neste ambiente. Cada item saiu do título
> ou do resumo de um resultado de busca; nada foi inventado. "(citado)" = item
> mencionado num resumo, sem página própria encontrada.
>
> **Dois produtos, que não podem ser confundidos:**
> - **[SGC]** IOB Gestão Contábil / SAGE — ajuda em `ajudaonline.ebs.com.br/sgc/`.
>   Tem a árvore de menus completa nos títulos.
> - **[Office]** IOB Office Folha de Pagamento — o sistema do escritório
>   (R2026.08.20). Ajuda no portal Aprendo
>   (`aprendo.iob.com.br/ajudaonline/artigo.aspx?artigo=N`), cujos títulos não
>   trazem o caminho do menu. Os caminhos do Office abaixo vieram dos resumos e
>   dos prints do escritório.
>
> URLs [SGC]: `http://ajudaonline.ebs.com.br/sgc/<arquivo>`; "(iob)" =
> `https://ajudaonline.iob.com.br/sgc/<arquivo>`.

## Menus de primeiro nível

| [Office] (confirmado em print de 04/10/2026) | [SGC] |
| --- | --- |
| Arquivos | Cadastros |
| Processos | Módulos |
| Relatórios | Relatórios |
| Listagens | (em Relatórios) |
| Impressos | (em Relatórios) |
| Diversos (Integração Contábil) | Tributos, Integrações, Consultas |
| Contratos | — |
| Utilitários | Utilitários |
| eSocial | eSocial |
| Saúde e Segurança do Trabalho | SST (fora do escopo: decisão de 03/10/2026) |
| Ajuda | — |

**Tela principal do Office** (print do Paulo, 04/10/2026, empresa 1405 2XR
ENGENHARIA LTDA, mês 10/2026):
- **Instalação:** Release R2026.08.20, Essenciais 2.04.0259, servidor do banco
  10.0.0.10 e **versão do banco 12.22**, a mesma do PostgreSQL usado nos testes
  da restauração. eSocial Simplificado S-1.3, com o serviço de comunicação
  com o eSocial ATIVO (PRODUÇÃO).
- **Barra de atalhos:** Alertas, IOB Diagnóstico, Ativar Empresa, Funcionários,
  Eventos, Holerite, Processamento, Backup, Backup Online, Posso ajudar?,
  Suporte Remoto e Sair. Na segunda linha ficam os atalhos de IOB Plataforma
  Contábil e IOB Abordo.
- **Alertas na abertura:**
  - "empresas com pendências de envios dos eventos periódicos e não
    periódicos";
  - **"Auto Backup/Backup Online: Ocorreram problemas com o Backup"**.

Confirmado em print do Office: Utilitários › Importações tem só RAIS, SEFIP,
Ponto, Valores e Digitação Diária. Cadastro de Funcionários com as abas Dados,
Ident. Adm., Documentos, Outros, Complementos, Dependentes, Lanç. Automático,
Holerite e Pesquisa; botões Contatos, Características e Tipo de deficiência;
IOB Diagnóstico eSocial; IOB eSocial Online; IOB Abordo (holerite eletrônico).

## [Office] Arquivos e Processos (dos resumos do Aprendo)

**Arquivos**
- Funcionários › Cadastro Básico — abas Ident. Adm. (e-Social: Dados Admissionais), Complementos (Histórico de Férias, tabela de horários), Dependentes, Outros (vale-transporte). Artigos 2904, 10980, 2733, 9303, 11178, 1299, 8951, 16566, 2992.
- Eventos › Cadastro (vencimentos na faixa 1000–4900). Artigos 10801, 17428, 6327.
- Afastamentos/Retorno › Cadastro. Artigos 2786, 2789, 14408, 15921.
- Horários › Tabela de Horários. Artigos 1299, 4144.
- Sindicatos: cadastro (4175), parametrização de desconto sindical (4167), tabela de enquadramento para aviso prévio (17257).

**Processos**
- Digitação de Holerites, tipo Mensal (17289, 13373).
- Adiantamento de Salário › Cálculo (17289, 12861, 807).
- Férias › Cálculo (2760); Férias › Férias Coletivas › Novas Férias (2346).
- 13º Salário › Cálculo — Configurações Básicas, Parcela Única, Complemento (13816, 2111, 2037, 4147).
- Rescisão › Cálculo (17264, 6723, 2747); Rescisão › Cálculo › Impressos, modelo Novo TRCT (2931).
- Folha Complementar › Listagem Analítica, para dissídio (2765, 2773, 2775).
- Trabalho Intermitente: Convocação, Recibos, Impressão de Holerites (13831, 13269, 13289, 13373, 13376).
- Empréstimo Consignado/Crédito do Trabalhador: cadastro e importação (16978, 17186, 17428, 17561, 17366, 17356, 2794).
- Vale Transporte: empresa, passagens, configurações, lançamento (2992, 4114).
- Controle de Benefícios › Operadoras de Plano de Saúde/Fornecedor (citado; 17184, 8951).

**Relatórios**
- Mensais › Folha de Pagamento / Folha Mensal / Resumo da Folha Mensal (15204, 16993).
- Listagens › Sindicatos (8441); Listagens › Funcionários › Resumida (citado).
- Demonstrativo de valores SEFIP (5204); Informe de Rendimentos (11459).

**eSocial** (mesmos caminhos do SGC nos artigos 15053, 15204, 12178, 16466)
- Movimento eSocial › Geração e acompanhamento de Periódicos (inclusive Anual — 13º).
- Fechamento de Movimento.
- Conferência de Tributos › Trabalhadores; › Relatório de Conferência para FGTS Digital.

**Diversos** › Integração Contábil › Exportação (4685, 5402).

## [Office] Artigos por tema

| Tema | Artigos |
| --- | --- |
| Painéis (IOB Online Dashboards: Folha Mensal, Férias, eSocial, Mapa) | 17533 |
| Cadastros (funcionário, diretor, autônomo, sindicato, horário, horista, aprendiz, estagiário, temporário, MEI, dependentes, transferência, duplo vínculo) | 11178, 4194, 5752, 4175, 4144, 1299, 4145, 2904, 2733, 10980, 2850, 8951, 16566, 14909, 43, 15379 |
| Cálculo mensal (estorno, arredondamento, importação de horas e valores, ponto, faltas e HE, assiduidade, desoneração, salário-família, adiantamento, pró-labore, tomador, plano de saúde, não calcular IRRF) | 4968, 15620, 4098, 2781, 4096, 6199, 5978, 135, 14074, 807, 12861, 5017, 14903, 4650, 4677, 17184, 6185 |
| Férias (provisão, configuração, adiantamento de 13º, coletivas, perda de período, interrompidas, S-2230) | 4566, 2804, 4086, 12159, 12700, 11671, 12823, 2760 |
| 13º salário (1ª parcela, parcela única, complemento, faltas, INSS, eventos 984/119/120, maternidade, acidente, eSocial, PIS) | 4147, 13816, 2037, 2111, 14473, 11117, 11167, 4149, 4150, 15204, 17072 |
| Rescisão (justa causa, acordo, impressão, pensão, FGTS rescisório, FGTS Digital, docentes, complementar, S-2299) | 17264, 6723, 2931, 16525, 232, 16636, 16896, 3196, 5046, 2747, 15231, 14898 |
| PLR | 10801, 2802 |
| Intermitente | 13269, 13310, 13404, 13416, 13831, 13373, 13376, 15130 |
| Crédito do Trabalhador | 16978, 17186, 17231, 17232, 17250, 17251, 17289, 17356, 17366, 17428, 17561, 17566 |
| eSocial (fechamento, S-1298/1299, conferência de tributos, S-5011, S-5003, DCTFWeb automática, recibos, transmissão, carga inicial, migração, qualificação cadastral, S-1010, incidências, S-1070, S-3000, retificação, S-2240, S-2210) | 15053, 8961, 12178, 15203, 15283, 15202, 15083, 9420, 12084, 12669, 14073, 4085, 10947, 9685, 8475, 8602, 14476, 15232, 15054, 14999 |
| Guias e FGTS Digital (conferência, tomador, DAE do MEI) | 16466, 16658, 15322 |
| Obrigações (DIRF, comprovante, MANAD, SEFIP, EFD-Reinf R-4010/R-4099/R-1050) | 15984, 15961, 11725, 15996, 4230, 2777, 2950, 5038, 5780, 5646, 5855, 15624, 16469, 16483, 16026, 16102, 16471, 16005, 16025 |
| Integração contábil | 4685, 5402, 11372, 251, 15135 |
| Relatórios e impressão (matricial, e-mail, Fator R) | 5031, 4802, 16993, 7523 |

## [SGC] Árvore completa

### Cadastros
- **Cadastro de Funcionários** (`crhcadfunc.htm`): Dados Pessoais › Geral, Dependentes; Dados Funcionais › Informações Obrigatórias, Dados Complementares, Depósitos Bancários; Registro Preliminar eSocial; Função; Salário; Horário; Eventos Fixos; Valores Fixos (hora-aula); Vale Transporte; Vale Refeição; Assistência à Saúde; Estabilidade; Registro do ASO; Relatórios Admissionais; Admissão Digital (abordo³); Movimentação › Afastamento (S-2230), Desligamento.
- **Funções** (CBO) › Histórico eSocial.
- Horários › Jornadas de Trabalho; Adicional por Tempo de Serviço; Bancos; Parâmetros da Empresa (DSR, adiantamento); Processos Judiciais/Administrativos; Ano-Calendário – PLR.
- **Genéricos**: Eventos (203 pré-cadastrados, cada um com rubrica eSocial; Integrações = médias de 13º, férias e aviso); Sindicato (dados, parâmetros gerais, adiantamento, rescisão, ATS, descontos, aviso, nomeações, salário profissional); Textos (contratos, advertência, suspensão); Tabelas Legais (IRRF, INSS, salário mínimo).
- **Contabilização**: Contas por Eventos (por centro de custo); Apropriação de Impostos (citado).

### Módulos
- **Pagamento Mensal**: Cálculo da Folha; Digitação de Eventos; Digitação para Múltiplos Vínculos; Importação de horas/valores; apuração de tributos, guias, holerite e relatório (citados).
- **Adiantamento Salarial** › Cálculo.
- **Férias**: Normais (pré-cálculo, conferência, confirmação); reflexo de afastamentos; Coletivas; Manutenção; Recibos; Relatório; Provisão (cálculo, relatório).
- **13º Salário**: parcelas; adiantamento nas férias; provisão.
- **Rescisão**: Aviso Prévio; Cálculo individual e agrupado; férias indenizadas; Simulação; Emissão do TRCT; Alteração; Memória de Cálculo; GRRF; Complementar (termo, SEFIP, acordo/convenção/dissídio).
- **Processamento Agrupado**: pagamento mensal, adiantamento, provisões, relatórios admissionais, VT/VR, rotinas anuais.
- **Autônomos**: cadastro, pagamentos (RPA, IRRF, INSS), recibos.
- **Retiradas/Pró-labore**: diretores, dependentes, cálculo, plano de saúde, informe de rendimentos.
- **Administração de Salários**: reajuste, complemento, projeção.
- **Cargos e Salários**: reajuste, enquadramento e atualização (citados), listagem.
- **Trabalho Intermitente**: convocação, recibos, consulta.
- **Empréstimo crédito do trabalhador** (MP 1.292/2025; S-1200 e S-2299).
- **Benefícios**: VT (evento 75), VR (evento 62; Sodexo, Alelo, VR, Ticket), recibos, arquivo Sodexo, plano de saúde (coparticipação).
- **Crédito em Conta**: Banco do Brasil, Santander, Bradesco, Itaú (DEB473, CNAB240, contracheque).
- **Tomadores de Serviço**: cadastro, cessão de mão de obra, obras (rateio).
- **SEFIP**; **SST** (configuração de envio, ASO, CAT); **Registro Informatizado de Empregados**.
- **Rotinas Anuais**: Informe de Rendimentos, DIRF, RAIS, SCP.
- **Integração Contábil**: lote contábil (agrupado/individual), arquivo texto FPGSAI.TXT e layout, lote remoto.

### Tributos
- Pagamento de Guias (baixa total/parcial; baixa pelo e-CAC); Guias de Recolhimento › Tributos Mensais; Contribuição Sindical Patronal; Apuração Mensal.

### eSocial
- Movimento eSocial › Geração e Acompanhamento de Periódicos (S-1200, S-1210, S-2299); aba Com Erro.
- Fechamento de Movimento (S-1299, transmissão automática da DCTFWeb); Totalização em Contingência (S-1295); Reabertura de Movimento.
- **Conferência de Tributos** (S-5001, S-5002, S-5011 × sistema): Trabalhadores, Relação de Conferência, Empresa, Ajuste de INSS Patronal, Relatório de Conferência para FGTS Digital.
- Consulta de Recibos; Situação de Envio das Empresas; IOB Diagnóstico eSocial (semáforo).
- Rotinas Auxiliares: relacionamento de rubricas, incidência de IRRF, matrículas e recibos, ajuste de demonstrativos, exclusão de empresa, exportação XML (eSocial e Reinf), retificação S-1005, exclusão de periódicos sem recibo.

### Integrações
- abordo³ (admissão digital e SST); IOB Gestão Financeira; Pontomais (fechamento do ponto); IOB Ponto (citado).

### Relatórios
- Mensais: Folha Mensal, Holerite, Admitidos e Demitidos, Crédito em Conta, Memória de Cálculo do INSS, Resumo da Folha (citado).
- Funcionários: Ficha Financeira, Relatório Especial, Folha de Ponto, Contratos de Experiência, Recibo de CTPS.
- Etiquetas: Registro de Empregados, Contrato de Experiência.

### Consultas
- Holerite: base de IRRF, contribuição sindical, horas extras.

### Utilitários
- Alteração de Processamento; Estorno do Cálculo da Folha Mensal; Importação de Funcionários/Base de Cálculo (layout de funções); MANAD; Cadastramento PIS/NIS; Envio de Holerite por e-mail; Transferência entre Empresas; Rotinas Anteriores (CAT, Tributos Mensais); Integração Contábil SAP (só SAGE).

### Fora do menu Folha, mas parametrizam a folha
- Gerenciador de Sistemas › Empresas › Parâmetros: Folha (Essenciais I, Tributos), eSocial/REINF (início da DCTFWeb e do FGTS Digital), Gerais, Integração Contábil; Estabelecimento › Cálculos/eSocial.
- Informações Gerais › Rotinas Comuns: Centro de Custo, Feriados.

## Lacunas

1. Primeiro nível do Office confirmado em print (04/10/2026). Faltam os submenus de cada um: prints com cada menu aberto.
2. Nenhum item de Utilitários › Importações do Office apareceu na busca.
3. Abas Documentos, Holerite, Pesquisa e Lanç. Automático e os botões Contatos, Características e Tipo de deficiência: sem artigo.
4. IOB eSocial Online e IOB Abordo no Office: sem artigo específico.
5. Artigos do Aprendo com caminho "Módulos/Cadastros/Tributos" podem ser do SGC: conferir no Office antes de copiar.
6. Para fechar as lacunas: prints dos menus do Office instalado, ou o manual do Office em PDF.
