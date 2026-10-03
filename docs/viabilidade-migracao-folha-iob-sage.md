# Viabilidade: migração da folha de pagamento IOB/SAGE → Consultor DP

> Pedido do Paulo em 03/10/2026 (prompt completo em `docs/historico-claude.md`):
> análise de viabilidade, *"como fizemos nos outros app"*, para migrar a folha
> de pagamento do IOB/SAGE para o Consultor DP. Pontos pedidos: prós e contras,
> impactos, opções de importação do IOB/SAGE (PostgreSQL 12) para o nosso banco,
> melhorias, conectividade com o eSocial, atualização legal, entrega de
> obrigações e geração de guias e impostos.
>
> Segue o formato das análises anteriores: `plano-contas-iob/docs/migracao-sage-cci.md`
> (SAGE Contábil → CCI) e `consultor-fiscal-inteligente/docs/plano-migracao-ondas.md`
> (E-Fiscal → CFI).

## Veredito

**A migração é tecnicamente viável, mas não como troca de sistema no curto prazo.**
Hoje o Consultor DP **alimenta** a folha do IOB. Ele **não calcula** a folha.
Substituir o IOB significa construir, e depois manter todo mês, um motor de
cálculo trabalhista e previdenciário completo, com todos os eventos do eSocial e
a integração com DCTFWeb e FGTS Digital. Isso é outro produto, e não uma
extensão do que existe.

**Recomendação: migrar em ondas, pelo mesmo caminho do E-Fiscal e do SAGE Contábil.**

1. O IOB continua como **sistema de registro**. Ele calcula a folha, transmite
   ao eSocial e gera as guias.
2. O Consultor DP assume o que está **antes e depois** do cálculo. Antes:
   apontamento, implantação e cadastro. Depois: conferência, auditoria e
   controle de prazos. Esse ganho é imediato e de baixo risco.
3. O cálculo próprio só entra depois de um **piloto em paralelo** numa empresa
   simples. A regra é a mesma das outras ondas: no primeiro mês a folha roda
   nos dois sistemas e o IOB serve de gabarito.
4. O IOB só é desligado, e passa a servir apenas de **acervo de consulta**,
   depois de um aceite formal por empresa.

## O que o Consultor DP faz hoje

Levantamento feito no código em 03/10/2026.

| Área | Situação | Onde |
| --- | --- | --- |
| Apontamento mensal → TXT de ponto IOB | **Em produção.** Layouts Windows-3 e Windows-4, mapeamento por cliente e diagnóstico de colunas | `services/folha/`, `components/folha/ApontamentoFolhaPanel.tsx` |
| Catálogo de eventos IOB por cliente | **Em produção** | `components/folha/EventosIobSagePanel.tsx` |
| Ponto eletrônico (AFD/ACJEF) | **Em produção** | `services/ponto/`, `components/ponto/` |
| Implantação de funcionários (XML eSocial + ficha PDF) | **Em produção.** Lê S-2200, S-2205, S-2206 e S-3000. Gera o Excel de cadastro e a carga pela RAIS, homologada em 28/09/2026 | `services/implantacao/` |
| Certificados digitais por empresa | **Em produção** | `services/empresas/certificadoService.ts` |
| FGTS: consulta de recolhimento e CRF via SERPRO | **Em produção**, por meio da API do CFI | `services/serpro/serproIntegrationService.ts` |
| Transmissão ao eSocial | **Esqueleto.** Há assinatura XML, envio SOAP, consulta de protocolo e polling | `functions/src/` |
| Geração de eventos eSocial | **Esqueleto, não transmitível.** Só S-1200, S-1210, S-1299, S-2200, S-2299 e S-2300. O S-1200 sai sem estabelecimento, rubricas e valores, e seria rejeitado pelo XSD | `functions/src/xmlGenerator.ts` |
| Cálculo da folha (INSS, IRRF, FGTS, férias, 13º, rescisão) | **Não existe** | — |
| Tabelas do eSocial (S-1000, S-1005, S-1010, S-1020) | **Não existem** | — |
| DCTFWeb e DARF, guia do FGTS Digital | **Não existem** | — |
| Holerite, folha analítica, TRCT, informe de rendimentos | **Não existem** | — |

O banco do Consultor DP é o **Firestore**, um banco de documentos. A folha
do IOB está num **PostgreSQL 12**, um banco relacional.

## Prós da migração completa

- **Um só sistema** para apontamento, cálculo, conferência e obrigações. Acabam
  o TXT intermediário, o mapeamento de colunas e a digitação dupla. Os problemas
  dos últimos meses vêm justamente da costura entre os dois sistemas: código
  sequencial do IOB, campos travados após a importação e lançamentos que somem
  na exportação.
- **Custo de licença do IOB** deixa de existir, depois da migração da última
  empresa.
- **Controle total sobre regras e telas.** Regras por cliente, como as de
  EDUCATI, INPLAF e Waldesa, deixam de ser contornos no TXT e viram regra do
  cálculo.
- **Auditoria nativa.** Cada valor é rastreável até o apontamento e a regra que o
  gerou, o mesmo padrão de rastreabilidade já usado no CCI e no CFI.
- **Integração com os outros apps.** A contabilização da folha iria direto
  para o CCI. Prazos e guias entrariam no calendário de obrigações do CFI.

## Contras e riscos

- **Responsabilidade legal muda de mãos.** Hoje a IOB mantém as tabelas e o
  cálculo por contrato. Depois, qualquer erro de INSS, IRRF ou FGTS é do
  escritório, com reflexo no salário do trabalhador, multa do eSocial e
  passivo trabalhista.
- **Manutenção permanente, todo ano e todo mês.** Exemplos do que muda sem aviso
  ao sistema:
  - tabela do INSS e teto, por portaria anual;
  - tabela do IRRF. Para 2026, a Lei 15.270/2025 criou a redução que zera o
    imposto até R$ 5.000 e a reduz gradualmente até R$ 7.350, com uma regra
    de cálculo nova;
  - salário mínimo, salário-família e piso regional;
  - **convenções coletivas** de cada sindicato da carteira, com pisos,
    adicionais, reajustes e datas-base;
  - **notas técnicas e novas versões do leiaute do eSocial.** O gerador atual
    aponta para o leiaute S-1.2, e isso precisa ser conferido com a versão
    vigente.
- **Escopo grande.** O mínimo para rodar uma folha mensal de verdade é este:
  - motor de cálculo com rubricas e incidências (`natRubr`, `codIncCP`,
    `codIncIRRF`, `codIncFGTS`);
  - folha mensal, adiantamento, férias, 13º, rescisão e afastamentos;
  - pensão alimentícia, consignado, vale-transporte e PLR;
  - eventos do eSocial completos, de tabelas, não periódicos, periódicos e SST;
  - leitura dos totalizadores S-5001, S-5002, S-5003, S-5011 e S-5013;
  - holerite, TRCT, recibos e informe de rendimentos.
- **Firestore não é a base natural para a folha.** Histórico de rubricas,
  bases, médias de férias e 13º e recálculos retroativos pedem consultas
  relacionais. Um motor de cálculo próprio deveria ter um PostgreSQL próprio,
  como o Cloud SQL, com o Firestore ficando para telas e cadastros.
- **Dependência de poucas pessoas.** O conhecimento do cálculo passaria a morar
  no código e no time, e não mais no fornecedor.

## Principais impactos

| Impacto | Quem sente | Mitigação |
| --- | --- | --- |
| Folha calculada errado no primeiro mês | Trabalhador, cliente, escritório | Paralelo obrigatório no primeiro mês, com diferença zero por rubrica antes do aceite |
| Evento recusado ou duplicado no eSocial | Cliente, com risco de multa | Validar no XSD antes do envio, transmitir primeiro em produção restrita e nunca enviar pelos dois sistemas |
| Guia com valor divergente | Cliente | Conferir o DARF da DCTFWeb e a guia do FGTS Digital contra os totalizadores do eSocial |
| Treinamento da equipe de DP | Equipe | Guias passo a passo, como os já feitos para apontamento e implantação |
| Período de convivência com dois sistemas | Equipe | Ondas pequenas. Cada empresa fica num sistema só depois do aceite |
| Histórico para férias, 13º e rescisão | DP | Importar pelo menos os 12 meses anteriores de rubricas e bases antes do corte |

## Opções de importação do IOB/SAGE (PostgreSQL 12)

A ordem de preferência segue a hierarquia de fontes já decidida para o SAGE
Contábil: **primeiro as fontes oficiais, por último o banco**.

### 1. O próprio eSocial: a melhor fonte para cadastro e histórico

Tudo o que o IOB transmitiu está no eSocial, assinado e com recibo. Os
webservices de **consulta de identificadores** e **download de eventos** do
eSocial devolvem os XMLs oficiais por empregador, trabalhador e período. O
acesso usa o certificado da empresa, que o app já gerencia.

- **Traz:** cadastro e contrato (S-2200, S-2205, S-2206), afastamentos (S-2230),
  desligamentos (S-2299), remuneração (S-1200) e os totalizadores.
- **Vantagem:** já é o que o Consultor DP lê na implantação. Foi a decisão do
  Paulo de que *"o código correto é o do eSocial"*.
- **Limite:** não traz o que o IOB não transmite, como parâmetros internos,
  provisões e rubricas sem incidência.

### 2. Arquivos e relatórios que o IOB já gera

- Arquivo RAIS em layout GDRAIS. O IOB ainda o gera, e foi ele que serviu de
  gabarito para o gerador atual.
- Folha analítica, ficha financeira, histórico de rubricas e relatório de
  eventos, em Excel ou PDF. Servem para conferir valores, e não como fonte de
  lançamento.
- Lista de rubricas com incidências, para montar a tabela S-1010 e o de/para.

### 3. Leitura do PostgreSQL 12 somente leitura: só para o que faltar

O mesmo protocolo do E-Fiscal (`consultor-fiscal-inteligente/docs/pg12/`):

1. **Só a estrutura transita primeiro.** Um `pg_dump --schema-only` dos schemas
   da folha, a lista de tabelas e a volumetria. Nenhum dado de trabalhador passa
   pelo chat.
2. Com o dicionário validado, a extração usa **consultas versionadas** num
   usuário somente leitura, numa réplica ou cópia de backup, nunca no banco em
   produção.
3. Os dados vão direto para um **bucket privado** do projeto, com hash SHA-256
   por arquivo, e depois para uma área de preparação. Nada vai direto para o
   cadastro oficial.

Alternativas descartadas: `postgres_fdw` ou replicação lógica direto do
servidor do IOB. Criariam acoplamento com um banco de terceiro sem contrato
de estrutura. A estrutura pode mudar numa atualização da IOB sem aviso.

> ⚠️ **O PostgreSQL 12 está fora de suporte desde novembro de 2024.** Isso não
> impede a extração. Mas é um risco de segurança do ambiente do IOB e vale
> perguntar à IOB qual o plano de atualização.

### Regras que valem para qualquer opção

- De/para explícito, com estado `PENDENTE`, `VALIDADO`, `BLOQUEADO` ou
  `NAO_APLICAVEL`, para empresa, funcionário, rubrica, sindicato, cargo e
  departamento. Item pendente não é importado.
- Chave do funcionário = **CPF + matrícula do eSocial**. O código sequencial
  do IOB entra só como referência.
- Importação idempotente, com `origem=MIGRACAO_IOB_FOLHA`, lote, hash do
  arquivo e chave original.

## Conectividade com o eSocial

**O que já existe:** certificado por empresa, assinatura XML RSA-SHA256, envio
e consulta de lote por SOAP nos ambientes de produção e produção restrita,
polling de status e transmissão em lote por empresa.

**O que falta para transmitir de verdade:**

- eventos completos conforme o XSD da versão vigente, com validação local antes
  do envio;
- eventos de tabela S-1000, S-1005, S-1010 e S-1020;
- eventos não periódicos S-2205, S-2206, S-2230, S-2298, S-2299, S-2300 e
  S-2399, e os de SST S-2210, S-2220 e S-2240, se o escritório assumir SST;
- periódicos S-1200, S-1202, S-1207, S-1210, S-1260, S-1270, S-1280, S-1298 e
  S-1299, e os de processo trabalhista S-2500 e S-2501;
- leitura e conciliação dos totalizadores S-5001, S-5002, S-5003, S-5011 e
  S-5013 contra o cálculo;
- procuração eletrônica do escritório ou certificado de cada cliente, com
  controle de vencimento.

## Atualização de acordo com a legislação

Sem fornecedor, o escritório precisa de uma **rotina formal** de atualização:

- calendário anual de tabelas (INSS, IRRF, salário mínimo, salário-família,
  teto), com vigência registrada e nunca editando a vigência antiga. É a mesma
  regra já usada no calendário de prazos do CFI;
- cadastro de convenções coletivas por sindicato e data-base;
- acompanhamento das notas técnicas e versões do leiaute do eSocial, da
  DCTFWeb e do FGTS Digital;
- testes de regressão do cálculo com casos reais anonimizados, como já é feito
  com os layouts da IOB.

## Entrega de obrigações

| Obrigação | Situação legal | O que o app precisaria |
| --- | --- | --- |
| eSocial | Ativa, base de todas as demais | Eventos completos (seção acima) |
| DCTFWeb | Ativa, alimentada pelo eSocial (S-1299) e pela EFD-Reinf | Transmissão e emissão do DARF pela API Integra Contador do SERPRO, já usada pelo CFI |
| FGTS Digital | Ativa desde 03/2024, alimentada pelo eSocial | Emissão da guia pelo portal. A disponibilidade de API para o escritório precisa ser confirmada |
| EFD-Reinf | Ativa, mais ligada a serviços tomados e pagamentos a PJ | Já tratada no CCI e no CFI |
| RAIS, CAGED e DIRF | Substituídas pelo eSocial e pela EFD-Reinf | Nada a gerar. A RAIS só serve hoje como carga de cadastro no IOB |
| Informe de rendimentos | Ativo, montado a partir do S-5002 | Gerar a partir dos totalizadores |

## Geração de guias e impostos

- **INSS, IRRF e contribuições de terceiros:** DARF único emitido na DCTFWeb,
  que fecha com os dados do eSocial e da EFD-Reinf. O caminho é a API Integra
  Contador do SERPRO, que o CFI já consome.
- **FGTS:** guia do FGTS Digital (GFD), calculada pelo próprio sistema do
  governo a partir do eSocial. O app emitiria e conferiria a guia, mas não
  calcularia por conta própria. Recolhimento e CRF já são consultados via SERPRO.
- **Contribuição sindical e assistencial:** boleto da entidade, conforme a
  convenção.
- **Conferência cruzada**, que é a melhoria de maior valor e já é possível com
  o IOB: base de cálculo da folha × S-5011 × DCTFWeb × guia do FGTS Digital.

## Melhorias possíveis sem esperar a migração

Todas aproveitam o que já existe e não mexem no cálculo do IOB:

1. **Conferência pós-folha:** comparar o resultado do IOB com os totalizadores
   do eSocial, com o DARF da DCTFWeb e com a guia do FGTS Digital, por empresa e
   competência. Uma divergência vira pendência antes do vencimento.
2. **Download de eventos do eSocial:** trazer os XMLs oficiais por empresa, sem
   depender do cliente ou da equipe enviar arquivos. Isso alimenta a implantação
   e a conferência.
3. **Painel de prazos do DP** no calendário de obrigações do CFI, para eSocial,
   DCTFWeb, FGTS Digital, férias a vencer, fim de contrato de experiência e ASO.
4. **Contabilização da folha no CCI**, a partir do resumo da folha do IOB.
5. **Inventário do PG12 da folha**, só estrutura, como foi feito no E-Fiscal,
   para fechar o dicionário antes de qualquer decisão sobre o cálculo.

## Plano em fases

| Fase | Entrega | Critério para seguir |
| --- | --- | --- |
| 0. Inventário | DDL e volumetria do PG12 da folha, lista de rubricas com incidências, lista de sindicatos e convenções da carteira | Dicionário validado |
| 1. Conferência | Melhorias 1 a 3, com o IOB ainda como sistema de registro | Equipe usando no fechamento mensal |
| 2. Base de dados | Importação de cadastro e histórico (eSocial + IOB) para área de preparação, com de/para | Cadastro e 12 meses de histórico conciliados com o IOB |
| 3. Motor de cálculo | Folha mensal de uma empresa simples (CLT mensalista, sem convenção complexa) | Diferença zero por rubrica contra o IOB por 3 competências |
| 4. Piloto transmitindo | A empresa piloto transmite pelo app, e o IOB fica só como gabarito | Totalizadores do eSocial e guias iguais ao cálculo |
| 5. Ondas | Grupos de empresas por complexidade: simples, com convenção, com horistas e professores, com SST | Aceite formal por empresa |
| 6. Corte | IOB somente leitura para consulta histórica | Última empresa aceita |

## Critérios mínimos de aceite por empresa

- Bruto, descontos, líquido e bases de INSS, IRRF e FGTS iguais ao IOB por
  funcionário e rubrica, no paralelo.
- Totalizadores S-5001, S-5003 e S-5011 iguais ao cálculo.
- DARF da DCTFWeb e guia do FGTS Digital iguais aos totalizadores.
- Nenhuma rubrica sem incidência validada na tabela S-1010.
- Cadastro de cada funcionário com CPF e matrícula do eSocial conferidos.
- Aprovação assinada pelo responsável do DP.

## Premissas a confirmar

- A versão do PostgreSQL da folha IOB/SAGE (informada como 12) e se a folha
  fica no mesmo servidor e no mesmo padrão de schemas do E-Fiscal.
- Se o contrato com a IOB permite acesso de leitura ao banco e se ele prevê a
  exportação dos dados ao fim do contrato.
- Quantas empresas, funcionários e convenções coletivas a carteira tem, para
  dimensionar as ondas.
- Se o escritório assume SST (S-2210, S-2220 e S-2240) ou se isso fica com a
  medicina do trabalho dos clientes.
- A versão vigente do leiaute do eSocial e a disponibilidade de API do FGTS
  Digital para emissão de guia pelo escritório.
