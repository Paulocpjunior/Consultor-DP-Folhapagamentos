# Consultor DP Folha de Pagamentos — SP Assessoria Contábil

Memória de trabalho para sessões do Claude neste repositório. Atualize ao
assumir compromissos com o Paulo (admin/dono). É daqui que a próxima sessão
retoma. Mesmo formato do `docs/historico-claude.md` do CFI e do plano-contas-iob.
Criado em 03/10/2026.

## Prompts salvos

### 03/10/2026 — Viabilidade da migração da folha IOB/SAGE → Consultor DP

Prompt do Paulo, na íntegra:

> faça uma analise de viabilidade , como fizemos nos outros app, para possivel
> migracao do sistema de folha de pagamentos usado hoje da IOB / SAGE para o
> Consultor DP Folha de Pagamentos, aponte os pros e contras , quais principais
> impactos , quais opcoes de importacao da IOB/SAGe que usa postgresql 12 para
> nosso BD , principais melhorias se houver ? conectividade com esocial,
> atualizacoes de acordo com a legislacao , entrega de obrigacoes , geracao de
> guias e impostos , entre outros , salve este prompt

Resposta: `docs/viabilidade-migracao-folha-iob-sage.md`. Veredito: viável em
ondas, não como troca imediata. O IOB segue como sistema de registro até um
piloto em paralelo provar o cálculo próprio.

## Decisões permanentes

- **O código correto do funcionário é a matrícula do eSocial** (Paulo, 09/2026).
  A RAIS foi extinta e substituída pelo eSocial, e o XML do eSocial é a fonte do
  cadastro.
- **No IOB Office, o código do funcionário importado fica sequencial (000001)**
  e não pode ser editado. Paulo, 29/09/2026: *"este codigo nao interfere pode
  deixar desta forma"*. A matrícula do eSocial vai no campo Matrícula da ficha.
  No TXT de ponto, a matrícula do app tem de ser o código que está no IOB.
- **Carga de cadastro no IOB Office pela RAIS2009** (Utilitários › Importações),
  homologada em 28/09/2026. Só funciona com código de empresa que ainda não
  existe. O que a RAIS não traz é completado à mão pela aba "Completar após
  RAIS" do Excel de cadastro. Detalhes em `docs/implantacao-funcionarios.md`.
- **SST fica com a medicina do trabalho dos clientes** (Paulo, 03/10/2026).
  Os eventos S-2210, S-2220 e S-2240 estão fora do escopo do Consultor DP.
- **Atualização legal: toda atualização aplicada no SAGE tem de ser aplicada
  também no Consultor DP** (Paulo, 03/10/2026). Os apps já têm travas e agentes
  de validação governamental para isso.
- **Banco de dados: Firebase, como nos outros apps** (03/10/2026). A folha usa o
  Firestore com um documento por funcionário e competência, relatórios no
  BigQuery e região confirmada.
- **Backup: todo o SaaS já nasceu com backup no UNAS Pro 4 do escritório**
  (Paulo, 03/10/2026). Não propor outra rotina de backup.
- **Comparativo IOB SAGE × Consultor sempre atualizado** (Paulo, 10/10/2026:
  "atualize sempre que houver necessidade, não precisa da minha autorização").
  A cada entrega, revisar `services/iobSage/catalogoMenus.ts` (tela IOB SAGE).
- **Carteiras do DP vêm do CRM no Jotform** (Paulo, 10/10/2026): tabela do
  formulário "Controle DP RH_2022" (213255365041650), com empresa, código SAGE,
  CNPJ, colaborador responsável e particularidades (observações do fechamento).
- **Pontos fortes do SAGE a construir no Consultor, nesta ordem** (Paulo,
  10/10/2026: "memorize os pontos fortes da SAGE e vamos construir na sequência"):
  1. Paridade de cálculo provada (divergências da 09/2026 da 1200).
  2. ~~Resultado da folha gravado no encerramento do mês~~ — feito em 10/10/2026
     ("Gravar a folha do mês"; o Fim de mês exige a folha gravada).
  3. Médias de variáveis (adicionais, comissões, lançamentos) em férias, 13º e
     rescisão; insalubridade e periculosidade automáticas; pensão no IRRF de
     férias, 13º e rescisão.
  4. Eventos não periódicos: S-2200, S-2206 e S-2299 gerados pelo Consultor.
  5. Informe de rendimentos (prazo: fevereiro de 2027).
  6. Atualização legal com rotina: tabelas de janeiro de 2027 (INSS, mínimo,
     IRRF) e novo leiaute do eSocial.
  7. Outros bancos no arquivo bancário (hoje só Itaú), conforme entrarem empresas.
  8. Depois: folha complementar e dissídio, rescisão complementar e TRCT oficial,
     aviso de férias, provisões e integração contábil (CCI), pró-labore,
     autônomos, intermitente, consignado, ficha financeira, transferência de
     funcionários e cálculo em lote de várias empresas.
  Onde já somos superiores (manter): conferência pós-folha com SERPRO, memória
  de cálculo, carteira e trilha de auditoria, Fim de mês com reabertura pelo
  gestor, validação antes do envio ao eSocial, prazos do DP, pacote do cliente.

## Fase 1 — conferência pós-folha

- **03/10/2026, Paulo: *"pode comecar a fase 1, conferencia pos folha"*.**
  Primeira entrega: `services/conferencia/` (leitor dos totalizadores e regras)
  e a aba Folha › Conferência pós-folha. O leitor segue os XSDs do leiaute
  S-1.3, tirados da biblioteca pública nfephp-org/sped-esocial
  (`schemes/v_S_01_03_00`). Os testes usam XML montado nessa estrutura: o
  primeiro lote real de totalizadores deve virar teste de regressão.
- Regras: INSS descontado (`vrDescSeg`) × calculado (`vrCpSeg`) por trabalhador,
  com até R$ 1,00 como arredondamento; CR 160601 (consignado) fica fora; empregado
  (categoria 1xx) com S-5001 e sem S-5003; soma dos trabalhadores × S-5011 e
  S-5013; DCTFWeb = `infoCRContrib` do S-5011 menos a parte suspensa; FGTS
  Digital = S-5013, mensal ou mensal + rescisório. Totalizador duplicado do
  mesmo trabalhador sai da conta e vira pendência, nunca é somado duas vezes.
- Pendente na fase 1: DCTFWeb e FGTS Digital pelo SERPRO (via túnel do CFI),
  download de eventos do eSocial, comparação com o resumo da folha do IOB
  (precisa de um exemplo do relatório exportado), IRRF e painel de prazos.
- **03/10/2026, Paulo: *"pode seguir com a integracao serpro"*.** A conferência
  ganhou o botão Consultar SERPRO, pelo túnel do CFI (`/api/dp-integration`):
  fechamento do eSocial, situação da DCTFWeb e FGTS Digital devido × recolhido
  (`services/conferencia/serproConferencia.ts`). O valor do SERPRO não
  sobrescreve o digitado: são duas fontes, cada uma comparada com o S-5013.
  Consulta que falha vira pendência informativa, nunca "entregue" ou "pago";
  FGTS com devido 0 e recolhido 0 é "sem valor", porque o CFI devolve 0 quando
  o campo não vem.
- **Débitos da DCTFWeb por código de receita.** O CFI já lia esses débitos do
  XML da declaração (`consultarXmlDeclaracao` + `extrairDebitosDctfweb`, usados
  nas guias separadas). A rota nova do túnel `POST /api/dp-integration/dctfweb/debitos`
  (branch `claude/dp-dctfweb-debitos` no CFI) devolve esses débitos, com a
  identificação conferida pelo próprio XML. O DP compara com o S-5011 por
  código de receita, como atenção, porque a DCTFWeb traz o saldo a pagar já
  com deduções e compensações. Resposta em modo mock do CFI ou rota não
  publicada (404) ficam indisponíveis, nunca viram número.
- **04/10/2026, Paulo: *"pode seguir com o resumo da folha do IOB"*.** A
  conferência compara o relatório da folha exportado do IOB (Excel/CSV) com os
  totalizadores (`services/conferencia/resumoFolhaIob.ts`), por funcionário e
  no total. Sem exemplo real do relatório, o leitor NÃO assume layout: acha o
  cabeçalho pelos nomes (até a 30ª linha, mínimo 3 colunas reconhecidas),
  propõe o mapeamento por sinônimos e a equipe corrige na tela. Liga por CPF;
  sem CPF, pela matrícula do eSocial (o código sequencial do IOB não casa).
  Calculado no IOB e sem totalizador = crítica ("calculada e não transmitida").
  O primeiro relatório real deve virar teste de regressão. PDF ainda não.
- **Motor de cálculo: código determinístico, não IA** (resposta ao Paulo,
  03/10/2026). O Gemini fica como assistente: explicar divergência, ler
  convenção coletiva para sugerir parâmetros que um humano valida.

## Módulo IOB SAGE e restauração do backup PostgreSQL 12

- **03/10/2026, Paulo: *"vamos trabalhar em um modal que seja capaz de efetuar o
  restore dos backups feitos em PostgreSQL 12 usado na iob sage ... análises
  comparativas no módulo iob sage, criando os menus, submenus, os devidos
  modais"*.** Paulo também pediu para cortar os passos que fizeram perder
  tempo: o inventário "só estrutura primeiro" da fase 0 virou a própria
  restauração, que já entrega o inventário.
- **Restauração = leitura no navegador** (`services/iobSage/backupPostgres.ts`):
  formatos custom, tar, plain e plain.gz do pg_dump; nada sai do computador
  nem é gravado no Firestore. Gravar no Consultor DP depende do de/para da
  fase 2. Testado com dumps REAIS de pg_dump 12.3 e 16 sobre PostgreSQL 12.22
  (`services/iobSage/__tests__/fixtures/`), e em escala: 500 esquemas e 10 mil
  tabelas abrem em ~0,8 s, 1 milhão de linhas são lidas em ~0,8 s.
  Como os fixtures foram gerados: PostgreSQL 12.22 do pacote npm
  `@embedded-postgres/linux-x64@12.22.0-beta.15` e pg_dump 12.3 do conda-forge
  (`postgresql-12.3-hc2f5b80_3`), porque a rede deste ambiente só libera
  registros de pacotes.
- **Mapa de menus** em `docs/mapa-menus-iob-folha.md`. A ajuda da IOB é
  bloqueada para leitura direta aqui; o mapa saiu de títulos e resumos de
  busca. O SGC (Gestão Contábil) tem árvore completa; o Office (o do
  escritório) só tem os menus de primeiro nível confirmados. Fechar as
  lacunas pede prints dos menus do Office ou o manual em PDF.
- **Catálogo comparativo** (`services/iobSage/catalogoMenus.ts`) com situação
  REAL por item: disponível, parcial, planejado (com fase) ou fora do escopo.
  Teste trava: item disponível aponta para a tela; planejado diz a fase.
- **Backup do IOB Office em duas partes** (pesquisa de 03/10/2026, a pedido do
  Paulo, que lembrou que a linha Office nasceu em DBF). Confirmado em fontes
  da IOB/Folhamatic: a linha Office nasceu em DBF e migra para PostgreSQL
  (driver ODBC); o cliente roda em DBF ou SQL conforme a "base ativada";
  Backup DBF = .zip, Backup SQL = .backup; e o Backup SQL tem DUAS partes:
  .zip com o cadastro das empresas e .backup com a folha (Ajuda Aprendo³,
  artigo 4898). NÃO confirmado ainda: que o .zip contém DBF (muito provável)
  e a versão do PostgreSQL (o modal mostra a de origem). Paulo: *"Pode seguir"*.
- **Leitor DBF** (`services/iobSage/dbf.ts`): dBASE III/IV, FoxPro e Visual
  FoxPro; tipos C, N, F, D, L, M, I, Y, B, T, V; memo .FPT e .DBT; code pages
  850, 437 e 1252, com dedução pelo conteúdo quando o cabeçalho não diz;
  registros apagados ficam fora. Fixtures reais geradas com a biblioteca
  Python `dbf` 0.99.11 (nome com extensão `.DBF`, senão ela quebra; memo nulo
  em dBASE III também quebra a biblioteca).
- **Restauração em duas partes** (`services/iobSage/restauracao.ts`): vários
  arquivos de uma vez, cada um reconhecido pela ASSINATURA (zip com extensão
  .SBAK/.SBKP também abre); o conteúdo do .zip é listado inteiro; DBF casa com
  o memo da mesma pasta; tabelas DBF e PostgreSQL na mesma lista.

## Cadastros (menu Arquivos do IOB Office)

- **04/10/2026, Paulo: *"pode mergear o pr #41 e comecar pelos cadastros"*.**
  Isso veio depois de ele notar que *"nao foram construidos os modulos como os existentes na iob"*.
  Nova aba **Cadastros** com dados no Firestore e auditoria
  (`services/cadastros/`, `components/cadastros/`):
  - **Funcionários:** ficha por empresa com as abas do Office (Dados, Ident.
    Adm., Documentos, Outros, Dependentes e Histórico).
    - A chave é empresa + CPF + matrícula do eSocial. O código sequencial do
      IOB fica num campo próprio, porque é ele que o TXT de ponto usa.
    - A carga vem do XML do eSocial, pela mesma consolidação da implantação,
      com prévia antes de gravar.
    - Campo editado à mão vira origem "Manual" e uma reimportação não o
      sobrescreve: a divergência aparece na prévia. Campo que veio do eSocial e
      sumiu do XML é removido. Código IOB, banco e observações nunca são
      tocados pela importação.
    - Exporta Excel.
  - **Sindicatos:** id = CNPJ, com data-base, piso, registro e vigência da
    convenção (alerta a 30 dias do fim) e contribuição.
  - **Tabelas legais:** INSS, IRRF, salário mínimo e salário-família por
    vigência (AAAA-MM).
    - **Nenhum valor vem pronto.** Sem norma não grava.
    - Qualquer aprovado inclui; corrigir ou excluir é só do admin (regra no
      Firestore).
    - Tabela que vale = a de maior vigência até a competência. Duas com a mesma
      vigência é erro.
    - O INSS mostra a contribuição no teto, para conferir com a portaria.
    - O redutor mensal do IRRF e as demais regras de cálculo entram com o motor
      (Fase 3).
  - **Eventos:** o atalho leva ao Catálogo de Eventos que já existe na Folha.
    Incidências ficam para a próxima entrega.
- **Coleções novas:** `cadastro_funcionarios`, `cadastro_sindicatos`,
  `cadastro_tabelas_legais` e `cadastro_audit` (esta só aceita inclusão).
  - As regras estão em `firestore.rules`. Foram testadas no emulador do
    Firestore (firebase-tools 14 + @firebase/rules-unit-testing) e cobrem
    colaborador, pendente, admin, id do documento, autor e auditoria imutável.
  - **O deploy das regras é manual:** `firebase deploy --only firestore:rules
    --project consultor-dp-folha`. Sem ele, a tela mostra "Sem permissão" com
    o comando.
- **Faltam:**
  - abas Complementos, Lanç. Automático e Holerite (aguardam os prints do
    Office);
  - Horários e Afastamentos;
  - incidências dos eventos;
  - carga a partir do backup restaurado (de/para das tabelas do SAGE).
- **Pendente de teste real:** o XML do André na pasta de testes é uma
  retificação (indRetif 2) sem recibo nem original, e a importação a recusa,
  como a implantação. Para importar, é preciso o XML com o recibo
  (retornoEventoCompleto) ou o S-2200 original.
- **04/10/2026, Paulo: *"regras publicadas, pode seguir com horarios e afastamentos"*.**
  As regras dos cadastros foram publicadas pelo Paulo.
  - **Horários** (`services/cadastros/horarios.ts`): cada empresa tem seus
    horários, com id = empresa_código.
    - Para cada dia da semana: tipo (trabalho, folga/compensado ou DSR),
      entrada, intervalo e saída. Uma saída antes da entrada conta como o dia
      seguinte.
    - Calcula o total semanal e as horas noturnas (22h–5h, também na hora
      reduzida de 52min30s), e gera a descrição da jornada no formato do
      `dscJorn` do S-2200.
    - Limites da CLT (arts. 58/59, 66, 67, 71 e CF 7º XIII) aparecem como
      AVISO, não bloqueiam, porque há exceções legais como 12x36,
      compensação e norma coletiva.
    - A ficha (Ident. Adm.) tem o campo Horário e confere as horas semanais
      do S-2200 com o total do horário.
  - **Afastamentos** (`services/cadastros/afastamentos.ts`): o S-2230, com
    id = empresa_cpf_matrícula_início.
    - A importação lê o XML com o recibo (201).
    - Junta início e término que vêm em eventos separados.
    - Retificação substitui o original pelo recibo, e um S-3000 com tpEvento
      S-2230 exclui o evento.
    - Vínculo sem ficha vira aviso.
    - Lançamento manual valida datas, admissão e desligamento, sobreposição, e
      os campos que só valem para os motivos 01/03 (mesmo motivo,
      acidente de trânsito) ou 15 (período aquisitivo).
    - Afastamento manual não é trocado por uma reimportação.
    - Mostra os dias por competência e o 16º dia para o INSS em
      doença/acidente sem "mesmo motivo" (Lei 8.213, art. 60). A lista de
      funcionários mostra "Afastado desde".
  - **Tabela 18:** só tem rótulo o que foi conferido em busca pública
    (01, 03, 06, 07, 11, 14–21, 24, 25, 29, 30, 33, 35 e os 43–45 da
    NT 04/2025, com a nova descrição do 21). Qualquer outro código de 2
    dígitos é aceito como "conferir na Tabela 18".
    - O portal gov.br e os PDFs da tabela estão bloqueados neste ambiente;
      falta conferir a tabela inteira na fonte oficial.
  - **Regras novas:** `cadastro_horarios` e `cadastro_afastamentos`, testadas
    no emulador. **Precisam de novo deploy das regras.**
  - **Faltam:** escalas e revezamento (12x36 como escala, não só como aviso),
    transmissão do S-2230 e férias com cálculo (Fase 3).

## Incidências dos eventos (S-1010)

- **04/10/2026, Paulo: *"podem seguir com a incidencia de eventos"*.**
  As regras de horários e afastamentos foram publicadas.
  - **O que já existia:** o catálogo de eventos (vindo do PDF do IOB) já trazia
    as marcas de incidência do IOB (IN, INF, IR, IRF, FG, RT, VR).
  - **O que faltava:** o lado eSocial, isto é, a rubrica do S-1010 com tpRubr,
    natRubr, codIncCP, codIncIRRF e codIncFGTS. É ela que monta as bases dos
    totalizadores S-5001 e S-5003.
- **Cadastros › Incidências** (`services/cadastros/rubricas.ts`):
  - Importa o S-1010 com recibo (201). Inclusão, alteração (inclusive
    novaValidade) e exclusão são aplicadas na ordem de dhProcessamento.
  - Guarda as vigências e escolhe a vigente na competência.
  - Liga cada rubrica ao evento do IOB pelo código (4 dígitos) ou por vínculo
    manual. O vínculo manual sobrevive à reimportação.
  - Confere tipo, INSS, FGTS e IRRF e exporta Excel.
- **Regras da conferência:**
  - V ↔ tpRubr 1; D ↔ tpRubr 2 ou 4.
  - IN ou INF ↔ codIncCP de base (11–16, 21, 22).
  - FG ↔ codIncFGTS 11, 12 ou 21.
  - IR ou IRF ↔ Tabela 21 nas faixas 11–15, 4x ou 51–55.
  - Ficam para conferir: suspensão judicial (9x/9xxx), salário-maternidade
    pago pelo INSS (CP 25/26) e código IRRF fora dessas faixas.
  - A natureza 9253 exige desconto e FGTS 31 (validação do XSD).
- **Fontes dos códigos:**
  - codIncCP e codIncFGTS: enumerações do XSD oficial do S-1010 (S-1.3).
  - Tabela 21: só 11, 12, 13, 14, 31, 41 e 51 foram conferidos em busca
    pública e têm rótulo; os demais aparecem como "conferir na Tabela 21".
- **Regra nova:** `cadastro_rubricas`, testada no emulador. Precisa de novo
  deploy das regras.

## Banco de dados: PostgreSQL 12 do SAGE × Firebase (pergunta do Paulo, 04/10/2026)

- **Recomendação:** manter o Firebase como banco do Consultor DP, a mesma
  decisão de 03/10/2026, e tratar o PostgreSQL 12 do SAGE como FONTE de
  dados, não como banco a copiar.
  - Migra-se dado (cadastros, rubricas, saldos de que a operação precisa),
    remodelado em documentos.
  - O histórico antigo fica consultável no backup restaurado ou no BigQuery.
- **Riscos do Firestore para a folha:** não tem JOIN, a leitura é cobrada
  por documento, os lotes têm limite de escritas e relatórios que varrem anos
  (ficha financeira, resumo) ficam caros e lentos.
- **Mitigação:** um documento por funcionário × competência com os
  lançamentos e os totais gravados junto; relatórios pesados pela extensão
  oficial Firestore → BigQuery.
- **Plano B, sem sair do Firebase:** Firebase Data Connect (PostgreSQL
  gerenciado) só para a parte de cálculo, se um teste de carga na Fase 3
  mostrar que o Firestore não dá conta. O PostgreSQL 12 está sem suporte da
  comunidade desde nov/2024, então não faz sentido adotá-lo como base própria.

## Painel de prazos do DP (Fase 1, item 3)

- **04/10/2026, Paulo: *"pode seguir com a proxima etapa"*.**
  - O download de eventos do eSocial depende do webservice com certificado,
    ou seja, do servidor ou do túnel do CFI.
  - O inventário e o de/para da Fase 2 dependem do backup real.
  - Por isso a próxima entrega possível agora foi o painel de prazos.
- **Nova aba Prazos** (`services/prazos/`, `components/prazos/PrazosPanel.tsx`).
- **Vencimentos mensais com ajuste de dia útil** (regras conferidas em
  04/10/2026):
  - S-1299 e DCTFWeb no dia 15, e dia não útil ADIA para o dia útil
    seguinte (IN RFB 2.162/2023; Manual do eSocial S-1.3);
  - DARF da DCTFWeb e FGTS Digital no dia 20, e dia não útil ANTECIPA;
  - salário no 5º dia útil, com o sábado contando como dia útil;
  - 13º: 30/11 e 20/12; S-1299 anual e DARF do 13º em 20/12.
- **Feriados considerados:** nacionais (incluindo o 20/11 desde 2024),
  Carnaval e Sexta-feira Santa. Estaduais e municipais não entram, e a tela
  avisa.
- **Prazos que saem dos cadastros, de todas as empresas:**
  - fim de contrato por prazo determinado (experiência quando tem até 90
    dias);
  - férias, com o último dia para começar o gozo (fim do concessivo − 29) e
    "vencidas = dobra". O gozo vem dos afastamentos com motivo 15, com ou sem
    período aquisitivo; não considera os arts. 130 e 133;
  - retorno de afastamento e 16º dia para o INSS em doença/acidente;
  - convenção coletiva a vencer e data-base.
  - Exporta Excel. ASO fica fora (SST é da medicina do trabalho).
- **Correção:** o calendário que já existia na aba eSocial mostrava o dia 15
  ou 20 no mês da competência e não ajustava dia útil. Agora usa as mesmas
  regras, e "atrasada" virou "prazo passou (conferir entrega)", porque a
  entrega não é verificada ali.

## Download de eventos do eSocial (Fase 1, item 2)

- **04/10/2026, Paulo: *"pode seguir com download dos eventos do esocial"*.**
  - **CFI, PR #1370:** rotas do túnel
    `/api/dp-integration/esocial/download/{identificadores,eventos}`. O CFI
    assina o pedido e abre o mTLS com o A1 do cofre (por padrão o do
    escritório, como procurador).
  - **DP:** aba eSocial › Download (`components/esocial/ESocialDownload.tsx`,
    `services/esocial/downloadEventos.ts`).
- **Na tela:**
  - **Consulta por trabalhador:** CPF e período, com sugestão dos CPFs da
    empresa e da admissão como início. Tem "consultar os próximos" a partir
    do `dhUltimoEvtRetornado`.
  - **Consulta por competência:** tpEvt + perApur, sem continuação; acima de 50
    eventos, consultar por trabalhador.
  - **Consulta de tabelas:** S-1010 e outras.
  - Baixa até 50 eventos por vez e acumula na sessão.
  - **Salvar .zip:** cada evento é remontado no formato do portal
    (retornoEventoCompleto: evento + recibo), e o zip entra direto em
    Cadastros (Funcionários, Afastamentos, Incidências) e na Conferência
    pós-folha. Os testes provam a leitura pelas quatro importações.
  - Os XMLs não são gravados no app.
  - A tela mostra quantos pedidos foram feitos hoje para a empresa, porque o
    eSocial limita por dia. O limite exato não foi confirmado em fonte
    oficial: as fontes falam em cerca de 10 a 12 por dia e 50 por resposta.
- **Pendente de teste real:** depende do deploy do CFI depois do merge do
  #1370 e de o A1 do escritório estar no cofre. O primeiro uso vai mostrar se
  a procuração cobre o download; se não cobrir, usar a opção "da própria
  empresa".
- **Ajuste de teste:** o teste do editor de layout do Cadastro IOB levava
  ~4,3 s, contra o limite padrão de 5 s, e estourava com a suíte cheia. O
  limite dele subiu para 15 s.

## IRRF na conferência pós-folha e telas do IOB Office (04/10/2026)

- **Paulo: *"pode seguir para proxima etapa"*.**
  - A Fase 2 ainda depende do backup real. O próximo item possível era fechar
    a conferência com o IRRF.
  - **Leitor:** S-5002 (evtIrrfBenef) e S-5012 (evtIrrf), conforme o XSD S-1.3.
    - No S-5002, `dmDev` e `totInfoIR` ficam dentro de `ideTrabalhador`. A
      leitura usa `totInfoIR/consolidApurMen` e, sem ele, soma
      `dmDev/totApurMen` por CRMen.
    - No S-5012, a leitura usa `infoIRRF/infoCRMen`.
  - **Regra 8 da conferência:**
    - soma dos S-5002 × S-5012 por código de receita;
    - S-5012 × débitos de IRRF da DCTFWeb (SERPRO) do mesmo mês;
    - duplicado fica fora;
    - lote só de IRRF não cobra S-5011 nem S-5013.
  - **Regime de caixa:** o IRRF segue o mês do PAGAMENTO (S-1210), por isso
    não é cruzado com o S-5001 nem com o relatório da folha.
  - Os códigos CRMen (056107 etc.) vêm do XSD.
  - O cálculo do imposto em si (tabela, dependentes, redutor) fica para o
    motor (Fase 3).
- **Prints do IOB Office enviados pelo Paulo:**
  - **Primeiro nível confirmado:** Arquivos, Processos, Relatórios,
    Listagens, Impressos, Diversos, Contratos, Utilitários, eSocial, Saúde e
    Segurança do Trabalho e Ajuda.
  - **Versão do banco: 12.22**, a mesma dos testes da restauração; servidor
    10.0.0.10.
  - Release R2026.08.20.
  - **Alertas na abertura:** "Auto Backup/Backup Online: Ocorreram problemas
    com o Backup" e empresas com pendências de eventos.
  - Mapa e catálogo atualizados. Faltam os submenus: prints com cada menu
    aberto.

## Fase 2: completar o cadastro pelo backup do IOB (04/10/2026)

- **Paulo: *"pode seguir, me dê o status de como e aonde estamos"*.**
  - Primeiro passo da Fase 2 que não precisa esperar o backup real: a carga
    pelo backup restaurado no navegador.
- **Onde fica:** Cadastros › Funcionários › "Completar pelo backup do IOB".
  - Aceita o Backup SQL do Office: o .zip com DBF e/ou o .backup do
    PostgreSQL. Usa a mesma leitura da restauração; nada sai do computador
    antes de gravar.
- **De/para assistido:** o dicionário do IOB Office ainda não é conhecido.
  - O app escolhe a tabela com mais colunas reconhecidas.
  - Propõe a coluna de cada campo pelo nome (CPF, PIS, DTADMISSAO, CODIGO,
    MATRICULA, SALARIO, BANCO etc.), e a equipe confere campo a campo.
  - Se a tabela tiver várias empresas, filtra por coluna e código. O
    código SAGE vem como sugestão; zeros à esquerda não contam.
- **Regras da carga** (`services/cadastros/cargaBackupIob.ts`):
  - **Ligação:** pelo CPF; sem CPF, pela matrícula do eSocial. Matrícula
    que pertence a outro CPF não liga e fica listada.
  - **Campo vazio** é preenchido, com origem "IOB: tabela".
  - **Campo com valor diferente** vira divergência listada; o valor do
    Consultor fica.
  - **Ficha nova:** só com a opção marcada, CPF válido e matrícula do
    eSocial. O resto vai para "sem ficha", com o motivo.
  - **Normalização:** datas em dd/mm/aaaa, aaaammdd ou ISO; CPF que perdeu
    o zero à esquerda; salário com vírgula.
  - **Gravação:** a mesma da importação do eSocial (ficha + auditoria em
    lote), com origem "Backup IOB: arquivos".
- **Falta, quando o backup real chegar:**
  - confirmar a tabela e as colunas do IOB Office e fixar o de/para;
  - trazer dependentes, sindicatos, horários e eventos pelo mesmo caminho.

## Fase 3: motor do cálculo mensal, em prévia (04/10/2026)

- **Paulo: *"pode seguir com a próxima etapa"*.**
  - A Fase 2 espera o backup real. Por isso começou a Fase 3 pelo cálculo
    mensal, usando as tabelas legais já cadastradas.
- **Motor** (`services/calculo/motorMensal.ts`): é puro, sem Firebase, e
  devolve cada verba com a memória de cálculo.
  - **Salário:** mensal, por hora (horas semanais × 5) ou por dia/quinzena.
  - **Mês comercial:**
    - mês inteiro sem afastamento vale 30 dias;
    - com afastamento, pagam-se os dias trabalhados, até 30;
    - em fevereiro, 30 menos os dias afastados;
    - na admissão ou no desligamento, os dias do vínculo, com aviso para
      conferir a regra com o IOB.
  - **Afastamentos:**
    - doença ou acidente: a empresa paga 15 dias e o INSS paga a partir do
      16º. Se for o mesmo motivo de um afastamento anterior (infoMesmoMtv),
      não há dias pagos pela empresa;
    - acidente do trabalho mantém o FGTS sobre os dias pagos pelo INSS
      (Lei 8.036, art. 15, § 5º);
    - licença-maternidade entra como salário-maternidade;
    - férias deixam o cálculo "incompleto";
    - licença remunerada (16) é paga; os outros motivos não são pagos, e os
      motivos 14, 24 e 25 geram aviso.
  - **Movimento:**
    - horas extras 50% e 100%, com DSR (dias úteis de segunda a sábado;
      descanso = domingos e feriados nacionais por lei, mais os feriados
      locais informados);
    - faltas e DSR descontado;
    - pensão alimentícia de valor fixo;
    - lançamentos avulsos, com incidências marcadas.
  - **INSS:** progressivo pela tabela da competência, limitado ao teto.
  - **Salário-família:**
    - devido até o mês em que o filho completa 14 anos, com remuneração até
      o limite;
    - proporcional na admissão e no desligamento.
  - **IRRF:**
    - tabela do **mês do pagamento** (regime de caixa); o padrão é o mês
      seguinte à competência;
    - usa o maior entre as deduções legais (INSS + dependentes + pensão) e
      o desconto simplificado;
    - aplica o **redutor da Lei 15.270/2025** sobre os rendimentos
      tributáveis: redução total até o primeiro limite e parcial (parcela
      fixa − coeficiente × rendimentos) até o segundo;
    - imposto de até R$ 10,00 não é retido (Lei 9.430/1996, art. 67).
  - **FGTS:** 8%; aprendiz (categoria 103) 2%.
  - **Fora desta versão:** férias, 13º, rescisão, adicionais (noturno,
    insalubridade, periculosidade), médias e categorias que não são de
    empregado.
- **Tabelas legais:** a tabela do IRRF ganhou os cinco campos do redutor.
  - São opcionais e vão completos ou ficam em branco.
  - O coeficiente é guardado em milionésimos (0,133145 → 133145).
- **Aba nova "Cálculo":**
  - escolha da empresa, da competência e do mês do pagamento;
  - lista com proventos, INSS, IRRF, salário-família, líquido e FGTS;
  - holerite com a memória de cálculo;
  - movimento digitado na tela, que **não é gravado**;
  - Excel com as abas Resumo, Verbas e Memória.
- **Próximos passos:**
  - conferir contra holerites reais do IOB (uma empresa, um mês);
  - gravar o movimento;
  - ligar as verbas aos eventos do IOB e às rubricas (Incidências);
  - férias e 13º.

## Cálculo: gravação do movimento do mês (04/10/2026)

- **Paulo: *"pode seguir com a gravação do movimento, e qual motor iremos
  usar?"*.**
- **Coleção nova:** `calculo_movimentos/{idDaFicha}_{AAAA-MM}`, com
  `empresaId`, `fichaId`, `competencia`, `movimento` e o autor.
  - **Regras:**
    - autor = usuário logado;
    - competência no formato AAAA-MM;
    - id = ficha + competência, e a ficha começa pelo id da empresa;
    - exclusão só pelo admin.
  - Testadas no emulador (9 testes, scratchpad `/regras`).
  - **Precisa publicar:** `firebase deploy --only firestore:rules --project
    consultor-dp-folha`.
- **Gravação:** em lote, junto com o registro em `cadastro_audit` ("lançar
  movimento" / "editar movimento"), com a diferença campo a campo.
  - Antes de gravar, o movimento é limpo: sem zeros, sem lançamentos em
    branco, valores arredondados.
- **Validação:**
  - horas extras até 300 por mês;
  - faltas, DSR e feriados até o número de dias do mês;
  - nenhum valor negativo;
  - lançamento com descrição e valor maior que zero.
- **Tela (aba Cálculo):**
  - carrega o movimento gravado da empresa e da competência;
  - marca "(não salvo)" no que mudou; o botão "Salvar movimento (n)" grava
    só o que mudou;
  - o holerite mostra quem salvou e quando;
  - pergunta antes de trocar de empresa ou competência e avisa ao fechar a
    página com algo não salvo.
- **Pergunta "qual motor":** o próprio motor do Consultor
  (`services/calculo`), em TypeScript, puro e testado, com memória de
  cálculo.
  - Hoje roda no navegador, como prévia.
  - Quando o cálculo virar oficial (fechamento da folha), o MESMO código
    roda no servidor (Cloud Functions ou no Cloud Run do CFI) e grava o
    resultado com a versão do motor. O resultado oficial fica fora do
    alcance do navegador.
  - Não há motor de terceiros: o IOB continua sendo a referência até a
    conferência com os holerites reais.

## Cálculo: conferência com os holerites do IOB pelo Gemini (04/10/2026)

- **Paulo:** *"o motor que digo é o de cálculo, nos outros apps usamos
  gemini 3.8"* e *"pode seguir com a conferência dos holerites pelo Gemini"*.
- **Decisão:** as contas da folha ficam no motor próprio, em código, que dá
  sempre o mesmo resultado e é auditável. O Gemini 3.8 fica em volta dele:
  aqui, só para TRANSCREVER o holerite em PDF.
- **CFI** (branch `claude/dp-holerites-gemini`): rota
  `POST /api/dp-integration/holerites/extrair`, no túnel do DP.
  - **Antes de chamar a IA:** confere o PDF (assinatura `%PDF-`, até 14 MB).
  - **Chamada:** Gemini Flash da família resolvida no CFI (3.8), com
    `responseSchema`, temperatura 0 e prompt de transcrição ("não calcule
    nada").
  - **Retorno:** holerites em centavos, com aviso quando a soma das verbas,
    os totais e o líquido não fecham.
  - **LGPD:** nada é gravado e o log não leva nomes nem valores.
  - A rota está declarada em `rotaTemChamada` como túnel do DP.
- **DP** (`services/calculo/conferenciaHolerites.ts`, sem IA):
  - **Classificação das verbas pela descrição:** salário, maternidade,
    horas extras 50%/100%, DSR sobre horas extras, faltas, DSR descontado,
    salário-família, pensão, INSS, IRRF e outros.
  - **Ligação holerite → ficha:** pelo CPF; senão pelo código do IOB (sem
    zeros à esquerda); senão pelo nome, com aviso.
  - **Comparação item a item, com tolerância de R$ 0,01:** cada classe,
    totais, líquido, base do INSS, base do FGTS e FGTS do mês. Verbas do
    IOB sem correspondente no motor deixam o resultado como "diverge".
  - **Movimento sugerido pelo holerite:**
    - horas e faltas pela referência ("10,50" ou "10:30");
    - pensão pelo valor;
    - as outras verbas viram lançamentos avulsos (provento incidindo em
      tudo, desconto em nada, com aviso para conferir).
- **Tela (aba Cálculo › "Conferir com holerites do IOB"):**
  - escolha de um ou mais PDFs e leitura pelo Gemini;
  - resumo: conferem, divergem, sem ficha, sem holerite;
  - por funcionário: as diferenças e o detalhe motor × IOB;
  - botão **"Aplicar movimento do holerite"**, que entra como "não salvo";
  - aba "Conferência IOB" no Excel;
  - cada leitura deixa registro em `cadastro_audit` (`holerites_iob`, com
    quem, quantos, arquivos e modelo).
- **Depende do deploy do CFI** com a rota nova. Não há regra nova do
  Firestore.
- **Revisão do PR #52 (Codex), corrigida antes do merge:**
  - **P1:** um holerite de outra competência não é comparado (situação
    "outra competência") nem vira movimento. Competência não lida gera aviso.
  - **P1:** um holerite sem nenhum valor lido fica como "ilegível", nunca
    como "confere". "Confere" exige pelo menos um item comparado.
  - **P1:** um holerite ligado a uma ficha sem cálculo na competência mantém
    o `fichaId` e não oferece "Aplicar movimento" (`podeAplicar`). A
    gravação ignora movimento sem ficha.
  - **P2:** DSR pago só conta como reflexo das horas extras quando diz isso
    ou vem sem qualificação. "DSR s/ comissões" e "DSR s/ adicional noturno"
    ficam em "outros" e viram lançamento avulso.

## Cálculo: 13º salário em prévia (04/10/2026)

- **Paulo: *"pode seguir próxima etapa"*.** Veio o 13º, pela urgência: a 1ª
  parcela vence em 30/11 e a 2ª em 20/12.
- **Motor** (`services/calculo/motor13.ts`; base legal: Lei 4.090/1962 e Lei
  4.749/1965):
  - **Avos, mês a mês** (mês com 15 dias ou mais trabalhados conta):
    - saem os dias pagos pelo INSS (doença ou acidente do 16º dia em diante;
      com infoMesmoMtv, desde o início), as suspensões e licenças não
      remuneradas e as faltas do movimento do mês;
    - contam férias, licença remunerada e licença-maternidade;
    - na 1ª parcela, os meses depois do pagamento são projetados como
      trabalhados.
  - **Média de horas extras:**
    - horas dos movimentos gravados nos meses antes do pagamento (1ª:
      janeiro a outubro; 2ª: janeiro a novembro);
    - valor da hora atual × adicional, mais o DSR de cada mês;
    - dividida pelos meses com vínculo no período.
  - **1ª parcela:** metade; sem INSS e sem IRRF; FGTS no mês do pagamento.
  - **2ª parcela:**
    - 13º integral menos o adiantamento. O adiantamento é o valor da 1ª
      calculada para novembro, ou o valor informado na tela (por exemplo,
      quando foi pago nas férias);
    - INSS do 13º em separado, pela tabela de dezembro;
    - IRRF exclusivo na fonte sobre o 13º integral, com dependentes, pela
      tabela do mês do pagamento;
    - FGTS sobre o integral menos a 1ª parcela.
  - **IRRF do 13º:** o redutor de 2026 (padrão: ligado) e o desconto
    simplificado (padrão: desligado) são OPÇÕES da tela, com aviso. A regra
    precisa ser confirmada na norma e na conferência com o IOB.
  - **Fora desta versão:** o 13º na rescisão (desligados no ano dão erro
    explicando), a provisão e médias de comissões e adicionais.
- **Movimentos do ano:** `listarMovimentosDoAno` filtra o ano no app (consulta
  só por `empresaId`, sem índice composto).
- **Tela (aba Cálculo):**
  - seletor "Folha": Mensal, 13º — 1ª parcela, 13º — 2ª parcela;
  - campo do ano; o pagamento padrão é 11 ou 12;
  - opções do IRRF do 13º;
  - "1ª parcela paga" por funcionário (não é gravada);
  - Excel `calculo-<código>-<ano>-13-<parcela>.xlsx`.
  - No 13º, não aparecem "Salvar movimento" nem a conferência com os
    holerites: as verbas de 13º ainda não estão na classificação.
- **Revisão do PR #53 (Codex), corrigida antes do merge:**
  - **P1:** o divisor da média de horas extras usa só os meses que dão avo
    (15 dias ou mais), não qualquer mês com algum dia.
  - **P1:** na 1ª parcela, quem foi admitido depois do mês do pagamento fica
    fora (`com13` com `admitidosAte`; o motor dá erro explicando). Quem foi
    admitido no ano recebe metade dos avos já cumpridos até o mês do
    pagamento (Decreto 10.854/2021, arts. 76 a 78). Quem tem o ano inteiro
    continua com os avos projetados (metade da remuneração).
  - **Na 2ª parcela:** sem 1ª parcela em novembro (por exemplo, admitido em
    dezembro), o adiantamento é zero.
  - **P2:** a resposta antiga dos movimentos do ano (troca rápida de empresa
    ou ano) é descartada e não sobrescreve a atual.

## Cálculo: férias em prévia (04/10/2026)

- **Paulo: *"pode seguir com férias"*.**
- **Motor** (`services/calculo/motorFerias.ts`): calcula o recibo de cada gozo
  lançado em Cadastros › Afastamentos com o **motivo 15** (gozo de férias,
  como no S-2230). Assim, a programação de férias é o próprio afastamento.
  - **Período aquisitivo:** o informado no afastamento; senão, o mais antigo
    em aberto, pela mesma `periodosFerias` do painel de Prazos (que também
    desconta os gozos anteriores). Concessivo de 12 meses.
  - **Direito pelas faltas do período**, conforme os movimentos gravados
    (art. 130): até 5 → 30 dias; 6 a 14 → 24; 15 a 23 → 18; 24 a 32 → 12;
    mais de 32 → nenhum. O saldo desconta os gozos anteriores do mesmo
    período.
  - **Perda do direito (art. 133):** mais de 180 dias de INSS ou mais de 30
    dias de licença remunerada no período.
  - **Remuneração:** salário atual mais a média das horas extras do período
    aquisitivo (÷ 12, com o DSR de cada mês); diária = remuneração ÷ 30.
  - **Verbas:**
    - férias e 1/3 constitucional;
    - **dobra** dos dias gozados depois do concessivo (art. 137), com o seu
      1/3, sem INSS e FGTS (Lei 8.212, art. 28, § 9º, "d");
    - **abono pecuniário** de até 1/3 dos dias de direito (art. 143), com o
      seu 1/3, sem INSS, FGTS e IRRF.
  - **INSS por competência do gozo**, pela tabela de cada mês. Quando o gozo
    pega dois meses, o motor avisa que a folha ajusta com o salário.
  - **IRRF em separado**, pela tabela do mês do pagamento. Desconto
    simplificado e redutor de 2026 são opções (padrão: os dois ligados), a
    confirmar com o IOB.
  - **FGTS** por competência. **Pagamento até 2 dias antes do início**
    (art. 145).
  - **Fora desta versão:** férias coletivas e antecipadas (antes de 12
    meses), a integração do INSS das férias com a folha do mês (o mensal
    segue "incompleto" com aviso) e o aviso de férias.
- **Movimentos:** `listarMovimentosDaEmpresa` busca todos os movimentos da
  empresa (consulta só pela empresa, sem índice composto);
  `listarMovimentosDoAno` passou a usá-la.
- **Tela (aba Cálculo):** opção "Férias" no seletor de folha.
  - Mostra o mês de início, os gozos daquele mês, as opções do IRRF e o
    recibo com período, direito, saldo, dobra, data-limite e a tabela por
    competência.
  - Os dias de abono são digitados na tela e não são gravados.
  - Excel `calculo-<código>-ferias-AAAA-MM.xlsx`.
- **Revisão do PR #54 (Codex), corrigida antes do merge:**
  - **P1:** depois de uma perda do direito (art. 133), o próximo período
    começa na volta ao trabalho (§ 2º). Novo `periodosAquisitivos` no motor:
    - recalcula os períodos marcando os perdidos;
    - se o funcionário ainda está afastado, não há período seguinte;
    - o período informado no afastamento casa com os novos inícios.
  - **P1:** as faltas e as médias usam todas as competências que o período
    toca. São 13 quando o período começa depois do dia 1º, e o motor avisa
    que o movimento é mensal.
  - **P1:** o abono pecuniário é gravado no afastamento (campo `abonoDias`,
    só no Consultor e fora do S-2230):
    - preenchido em Cadastros › Afastamentos ou pelo botão "Gravar abono no
      afastamento" no recibo;
    - o saldo do período desconta gozos E abonos anteriores;
    - a reimportação do eSocial não apaga o abono;
    - validação de 1 a 10 dias, só no motivo 15.
  - **P2:** um período com direito reduzido pelas faltas e já usado fica
    fechado, e o próximo gozo vai para o período seguinte.

## Cálculo: rescisão em prévia (04/10/2026)

- **Paulo: *"pode seguir com rescisão"*.**
- **Motor** (`services/calculo/motorRescisao.ts`): monta o TRCT sobre os
  outros motores.
  - **Saldo de salário e movimento do mês:** motor mensal com a data do
    desligamento (INSS e IRRF do mês).
  - **Aviso prévio:**
    - **proporcional** (Lei 12.506/2011): 30 dias + 3 por ano completo, até
      90. Indenizado na dispensa sem justa causa (02); pela metade no acordo
      (33, art. 484-A);
    - **trabalhado:** só os dias além de 30 são indenizados;
    - **pedido de demissão sem cumprir o aviso:** desconto de 30 dias
      (art. 487, § 2º);
    - **indenizado:** sem INSS e sem IRRF, com FGTS (Súmula 305 do TST).
      **Projeta** o fim do contrato para 13º e férias (OJ 82 da SDI-1).
  - **13º:**
    - proporcional até a data real, com INSS em separado e IRRF exclusivo;
    - 13º sobre o aviso indenizado (avos da projeção), sem INSS e com aviso
      de que a regra precisa de confirmação;
    - desconto do adiantamento informado;
    - na justa causa, não há 13º.
  - **Férias:**
    - **vencidas**, pelos `periodosAquisitivos` das férias: saldo do período
      (direito − gozos e abonos); em dobro quando o concessivo passou;
    - **proporcionais** em avos (fração de 15 dias), com o direito pelas
      faltas;
    - todas indenizadas: sem INSS, FGTS e IRRF;
    - na justa causa, só as vencidas;
    - **mais de um período vencido, ou com dobra, gera aviso e situação
      "incompleto"**: costuma ser histórico de férias que não foi lançado em
      Afastamentos.
  - **Contrato a termo:** art. 479 (metade dos dias restantes até o
    `fimContrato` da ficha) no término antecipado pelo empregador (03). O
    art. 480 (04) fica como aviso, para lançar como desconto.
  - **FGTS e prazo:**
    - FGTS do mês e rescisório;
    - **multa** de 40% (02 e 03) ou 20% (33) sobre o saldo informado mais o
      FGTS da rescisão, informativa (paga por guia);
    - regra de saque por motivo;
    - **pagamento em até 10 dias** (art. 477, § 6º).
  - **Motivos cobertos (Tabela 19):** 01, 02, 03, 04, 06, 07 e 33.
- **`services/calculo/tributos.ts`:** INSS e IRRF detalhados com memória
  (simplificado, redutor e mínimo de R$ 10), usados pela rescisão.
- **Tela (aba Cálculo):**
  - "Folha › Rescisão" mostra os desligados do mês pela ficha (S-2299)
    mais as **simulações** de funcionários ativos (funcionário, data, tipo,
    aviso);
  - no detalhe: tipo, aviso, data (na simulação), saldo do FGTS e
    adiantamento do 13º; aviso, projeção, prazo, multa e saque;
  - nada é gravado; Excel `calculo-<código>-rescisao-AAAA-MM.xlsx`.
- **Fora desta versão:** TRCT impresso, rescisão complementar,
  indenização adicional (Lei 7.238), estabilidades e categorias que não são
  de empregado.
- **Revisão do PR #55 (Codex), corrigida antes do merge:**
  - **P1:** os desligados do mês não recebem mais "sem justa causa" por
    padrão. O motivo do S-2299 ainda não é importado para a ficha, então o
    tipo é OBRIGATÓRIO: sem ele, a rescisão dá erro pedindo a escolha.
    Importar o `mtvDeslig` e a `dtProjFimAPI` do S-2299 fica como melhoria.
  - **P1:** quando a projeção do aviso entra no ano seguinte, os avos desse
    ano (fração de 15 dias) entram no 13º sobre o aviso.
  - **P2:** o adiantamento do 13º sai da base do FGTS rescisório, porque já
    teve FGTS quando foi pago. Corrige também a multa.
  - **P2:** o mês do pagamento da rescisão pode ser informado (tabela do
    IRRF pelo mês efetivo do pagamento). O padrão é o mês do prazo de 10
    dias, com aviso quando esse mês é diferente do mês do desligamento.
  - **P2:** as opções do IRRF da tela valem só para o 13º da rescisão, e o
    texto agora diz isso. O saldo de salário segue a regra mensal
    (simplificado e redutor, que são regra certa no mensal).

## Motor: motivo do S-2299 e férias na folha do mês (04/10/2026)

- **Paulo: *"pode seguir com a próxima etapa"*.** Duas pontas abertas do
  motor, sem depender de dados reais.
- **Motivo e fim projetado do S-2299 na ficha:**
  - `fichaDoEsocial` lê `infoDeslig/mtvDeslig` e `infoDeslig/dtProjFimAPI`
    do conteúdo do último S-2299 e grava `motivoDesligamento` e
    `dataProjetadaAviso` (campos novos na aba Ident. Adm., com origem
    "eSocial: S-2299").
  - **Na rescisão, o tipo vem do motivo da ficha** quando é um dos cobertos.
    Motivo não coberto dá erro explicando.
  - **A rescisão confere com o eSocial:** avisa se o tipo usado difere do
    motivo do S-2299, ou se o fim projetado calculado difere do
    `dtProjFimAPI`.
- **Férias integradas à folha do mês:**
  - `feriasDaCompetencia` soma, da competência, a parte de cada recibo de
    férias que toca o mês. Se algum recibo dá erro, a folha volta a ficar
    "incompleto" e aponta o recibo.
  - **Na folha mensal:**
    - entra "Férias + 1/3 do mês (pagas no recibo)" (soma no INSS e no
      FGTS, fora do IRRF) e o desconto de igual valor "Férias pagas no
      recibo";
    - o INSS do mês é calculado sobre salário + férias, **menos o INSS já
      retido no recibo**;
    - o mês deixa de ficar "incompleto".
  - **Mês comercial com férias:** o salário passa a ser 30 menos os dias
    fora (com 20 dias de férias num mês de 31, paga 10 de salário, e não
    11). Assim salário e férias fecham 30 dias.
  - A aba Cálculo carrega os movimentos da empresa na folha mensal, para as
    médias dos recibos. A rescisão também soma as férias do mês do
    desligamento.
  - **Conferência dos holerites:** as linhas de férias do holerite mensal
    do IOB são reconhecidas ("Férias + 1/3 do mês" e "Férias pagas no
    recibo"). "INSS s/ férias" continua como INSS e o abono como "outros".
- **Revisão do PR #56 (Codex), corrigida:**
  - **P1:** se a leitura dos movimentos da empresa falhar, a tela mostra o
    erro e fica sem histórico (o mês com férias fica "incompleto"). Antes,
    usava um histórico vazio, com médias e faltas zeradas, e marcava
    "calculado". O mesmo vale para o 13º e as férias.
  - **P2:** depois de salvar um movimento, os movimentos usados pelas
    férias são relidos.
  - **P2:** na folha do mês, o desconto do que o recibo já pagou é o
    **líquido das férias** (férias + 1/3 − INSS − IRRF da competência),
    mais as linhas "INSS das férias (retido no recibo)" e "IRRF das férias
    (retido no recibo)". O IRRF do recibo é rateado pela competência. Na
    conferência dos holerites, INSS e IRRF do motor somam o retido no
    recibo, para bater com "INSS s/ férias" e "IRRF férias" do IOB.

## Fase 5: holerite em PDF e resumo da folha (04/10/2026)

- **Paulo: *"pode seguir com a próxima etapa"*.**
- **`services/relatorios/resumoFolha.ts`** (puro):
  - totais por verba, com o número de funcionários;
  - férias vencidas de vários períodos numa linha;
  - lançamentos avulsos agrupados pela descrição, não pelo código
    posicional LAN1/LAN2;
  - situações (calculado, incompleto, erro); os com erro ficam fora dos
    totais;
  - bases;
  - **quadro para conferir as guias:** INSS dos segurados (inclui o do 13º,
    das férias e o retido no recibo), salário-família (dedução na DCTFWeb),
    salário-maternidade (compensação), IRRF retido (DCTFWeb do mês do
    pagamento) e FGTS.
- **`services/relatorios/holeritePdf.ts`** (jsPDF + autotable, já no
  projeto):
  - holerite com um funcionário por página: cabeçalho da empresa,
    funcionário, verbas, totais alinhados, bases e assinatura;
  - resumo da folha em PDF;
  - **marca d'água "PRÉVIA"** semitransparente por cima de tudo, mais o
    aviso em vermelho, até a conferência com o IOB;
  - `textoPdf` limpa caracteres fora da fonte padrão (sinal de menos,
    aspas curvas).
- **Aba Cálculo:**
  - botões "Resumo da folha" (quadro na tela, com "Resumo (PDF)"),
    "Holerites (PDF)" e, no detalhe, "PDF deste holerite";
  - nova aba "Resumo da folha" no Excel;
  - texto por folha explicando o que serve para a DCTFWeb e o FGTS Digital
    (o quadro vale para a guia na folha mensal; 13º, férias e rescisão
    mostram só o seu valor).
  - **Fica de fora a parte patronal** (20%, RAT, terceiros), que depende do
    enquadramento. O total segue conferido pelo S-5011 na Conferência
    pós-folha.
- **Catálogo IOB:** "Folha Mensal / Resumo da Folha" e "Holerite" passam a
  "parcial", com link para a aba Cálculo.
- **Revisão do PR #57 (Codex), corrigida:**
  - **P1:** a multa rescisória do FGTS entra no quadro das guias como linha
    própria (também é recolhida pelo FGTS Digital), na tela, no PDF e no
    Excel.
  - **P2:** "funcionários" conta pessoas distintas. Quando há mais de um
    cálculo por pessoa (dois recibos de férias no mês), mostra também o
    número de cálculos.
  - **P2:** as linhas do resumo na tela usam código + descrição como chave
    (os lançamentos avulsos têm o mesmo código "LAN").
  - **P2:** no holerite em PDF, se bases, declaração e assinatura não
    couberem no fim da página, vão para a página seguinte.

## Parte patronal: enquadramento da empresa e total da DCTFWeb (04/10/2026)

- **Paulo: *"pode seguir com próxima etapa e me atualize sobre nosso status"*.**
- **`services/cadastros/enquadramento.ts`** (puro):
  - por empresa e vigência: regime, FPAS, código de terceiros, patronal
    (%), RAT (1, 2 ou 3), FAP (0,5000 a 2,0000) e terceiros (%);
  - **regimes:**
    - normal: 20% + RAT × FAP + terceiros;
    - Simples Nacional, Anexo IV: 20% + RAT × FAP, sem terceiros (LC 123,
      art. 13, § 3º);
    - Simples Nacional, demais anexos: patronal no DAS, nada na folha;
  - **base patronal** = remuneração (base do INSS sem teto) − salário-
    maternidade (STF, Tema 72);
  - a vigente na competência é a de maior vigência até ela;
  - CPRB (desoneração) ainda não é calculada.
- **Coleção `cadastro_enquadramentos/{empresa_AAAA-MM}`**, com auditoria:
  - regra com autor, vigência AAAA-MM, regime entre os três e id = empresa
    + vigência; exclusão só pelo admin;
  - testada no emulador (10 testes). **Precisa publicar as regras.**
- **Cadastros › Enquadramento:** lista por vigência, com o total em % sobre a
  folha; formulário que mostra só os campos do regime.
- **Resumo da folha:**
  - com enquadramento vigente, mostra contribuição patronal, RAT ajustado,
    terceiros e o **total previdenciário da DCTFWeb** (segurados + patronal
    + RAT + terceiros − salário-família − salário-maternidade), na tela, no
    PDF e no Excel;
  - competência da parte patronal: a do mês na folha mensal e na rescisão,
    dezembro no 13º; nos recibos de férias não há (entra na folha do mês).
- **Catálogo IOB:** "Empresas › Parâmetros" aponta para Cadastros ›
  Enquadramento.
- **Revisão do PR #58 (Codex), corrigida:**
  - **P1:** a vigência de um enquadramento não muda na edição: o campo fica
    travado e o serviço recusa. Outra vigência é outro enquadramento (o id
    é empresa + vigência). O antigo continua valendo até o admin excluir.
  - **P2:** falha ao ler os enquadramentos não parece mais "empresa sem
    enquadramento". O erro aparece no resumo (alerta vermelho: "não use
    para a DCTFWeb"), no texto do PDF e numa linha do Excel.

## Restauração: zip de mais de 1 GB sem carregar na memória (04/10/2026)

- **Motivo:** o backup de cadastros do IOB SAGE do Paulo tem mais de 1 GB
  zipado, e a restauração recusava zip acima de 512 MB, porque lia o
  arquivo inteiro na memória do navegador. A ideia é que a primeira
  restauração funcione de primeira, sem tentativas.
- **`services/implantacao/zip.ts`:**
  - `indiceZip(fonte)` lê só o diretório central, pelo fim do arquivo
    (inclusive **ZIP64**: arquivos e entradas acima de 4 GB). Nomes em
    UTF-8 quando o zip marca; os outros, pela página do DOS (CP437, ou
    CP850 quando dá mais letras do português — é a do Windows no Brasil),
    ou pelo campo de caminho Unicode (0x7075), quando o CRC confere.
  - `fonteDaEntrada(fonte, entrada)` dá acesso por fatias a cada arquivo de
    dentro do zip:
    - "stored": lido direto do zip;
    - deflate até 32 MB: descomprimido inteiro, com cache LRU de 192 MB
      por zip;
    - deflate maior (ex.: um .backup dentro do zip): por cursor, que só
      guarda a janela pedida. Para a frente, segue o fluxo; para trás,
      recomeça do início. As leituras entram em fila.
  - Entrada protegida por senha ou com método desconhecido: erro claro.
  - `lerZip` passou a usar o mesmo índice (comportamento igual).
- **`restauracao.ts`:**
  - sem o limite de 512 MB;
  - entradas do zip entram como fontes por fatias;
  - entrada protegida por senha ou com método desconhecido aparece na
    lista como "Outro", com o motivo, sem derrubar o resto.
- **Restaurar backup:** o texto da tela avisa que zip de mais de 1 GB abre
  direto. Continua tudo no computador do usuário: nada é enviado nem
  gravado.
- **Testes** (`zipGrande.test.ts`): zips "virtuais", em que os zeros não
  ocupam memória, provam que nenhuma leitura passa de ~1 MB:
  - zip de 1,2 GB com DBF + memo deflate: lista, casa o memo e lê a tabela;
  - ZIP64 com entrada de 5 GB;
  - entrada deflate de 34 MB lida por cursor (frente, trás, concorrência);
  - senha e zip inválido.
  Conferido também, fora da suíte, com zips do Info-ZIP (ZIP64 forçado e
  descritor de dados).
- **Revisão do PR #59 (Codex), corrigida:**
  - **P2:** nome sem o bit 11 era lido como Windows-1252 ("latin1" no
    navegador): `0x80` virava `€` em vez de `Ç`. Agora usa a CP437 (ou a
    CP850, ver acima) da tabela do leitor DBF e o caminho Unicode; com
    teste.

## Etapa 1 dos ajustes do Paulo: nível GESTOR + Storage fechado (04/10/2026)

Pedido: ativar empresa e período antes de tudo; carteira por colaborador
(como no CFI); calendário de obrigações da folha; nível GESTORES acima dos
admins; cofre de certificados único do SaaS. Decisões do Paulo: carteira
própria do DP (mesmo modal do CFI); **admin só vê a própria carteira, só o
gestor vê todas**; o .pfx renovado sobe no app Legal, gravando no cofre do
CFI; ordem: gestores → carteira → empresa/período → cofre → calendário.

Achados do levantamento (para as próximas etapas):
- O app Legal **não guarda certificado**: espelha vencimentos do Jotform
  (`legalizacao_vencimentos`) e copia o arquivo para o SharePoint na
  renovação. O cofre de verdade (.pfx e senha cifrados) é o do CFI
  (`empresas_certificados`), no mesmo projeto Firebase do Legal. O CFI já
  tem o túnel `/api/admin/cadastro/certificados` (só metadados, aceita o
  DP).
- No DP, o certificado subia para o Storage do próprio DP com leitura e
  gravação para qualquer logado; as functions ainda procuram a senha em
  texto no Firestore (fica para a etapa do cofre).

Feito nesta etapa:
- **`services/auth/papeis.ts`** (puro, com testes): gestor > admin >
  colaborador > pendente; `ehAdmin`, `ehGestor`, `podeMudarPapel`,
  `papeisPermitidos`. Ninguém muda o próprio papel; gestor muda qualquer
  um; admin só entre pendente e colaborador.
- **Master** `junior@spassessoriacontabil.com.br` (o mesmo do CFI), com
  e-mail verificado, é sempre gestor: nasce gestor e, se já existia como
  admin, vira gestor ao entrar. É quem destrava o primeiro gestor.
- **Brecha fechada:** a regra de `users` aceitava criar o próprio perfil já
  como **admin** (bastava chamar o Firestore direto). Agora nasce pendente;
  gestor só o master. Sai o "primeiro usuário vira admin".
- **Regras:** `isApproved`/`isAdmin` incluem o gestor; `isGestor`. Admin
  só altera papel/aprovação de pendente e colaborador (nem a si mesmo, nem
  outros campos); excluir usuário admin/gestor e **excluir empresa** só o
  gestor.
- **Storage:** `certificados/**` só admin/gestor; o resto fechado. A tela
  de certificado esconde enviar/substituir/remover de quem não pode.
- **Usuários:** botões conforme o que o papel permite (aprovar, tornar
  admin/gestor, rebaixar, suspender), papel em destaque e erro claro de
  permissão. As checagens `role === 'admin'` espalhadas viraram `ehAdmin`
  (o papel inexistente "owner" do Ponto saiu).
- **Emulador:** 8 testes novos (perfil, master, admin × gestor, empresa,
  Storage) + os 10 anteriores: 18 passando. **Precisa publicar as regras
  do Firestore e do Storage.**

## Etapa 2: carteira do colaborador (04/10/2026)

Decisão do Paulo: carteira **própria do DP** (mesmo modal do CFI) e **admin
limitado à carteira**; só o gestor vê todas as empresas.

- **`carteira_acessos/{uid}`** `{ uid, nome, email, empresaIds[], atualizadoPor, atualizadoEm }`,
  gravada em lote com o registro em `cadastro_audit` (incluídas/retiradas).
- **Quem monta** (`services/carteira/carteira.ts`, puro, com testes):
  - gestor: a de qualquer admin ou colaborador, com qualquer empresa;
  - admin: só a de colaboradores, e só incluindo/retirando empresas da
    carteira dele; nunca a própria.
- **Quem vê:** gestor, todas; os demais, a carteira **e as empresas que
  eles mesmos cadastraram**.
- **Regras do Firestore** (`podeEmpresa`): `empresas` (lista inteira só o
  gestor; os outros leem empresa por empresa ou as que criaram; editar:
  gestor, criador ou admin da carteira; excluir: gestor), e todas as
  coleções com `empresaId`: funcionários, horários, afastamentos, rubricas,
  enquadramentos, movimentos do cálculo, eventos, FGTS e teses do eSocial.
  Gravar também exige a empresa na carteira; trocar o `empresaId` de um
  documento para fora dela é recusado.
- **Consultas:** `listarEmpresasVisiveis` substitui `listarTodasEmpresas`
  em todas as telas; as consultas que somavam todas as empresas (prazos,
  eSocial) passaram a `empresaId in carteira` em lotes de 30
  (`consultarPorEmpresas`). Lista paginada de eventos sem empresa, com
  mais de 30 empresas na carteira, pede para escolher a empresa.
- **Tela:** Usuários ganhou a coluna "Carteira" e o modal (busca, só as
  marcadas, marcar/desmarcar a lista, empresas fora da carteira do admin
  travadas, resumo do que muda). A Folha sem empresa explica a carteira.
- **Emulador:** 7 testes novos da carteira + 18 anteriores = 25 passando.
- **Ainda não travado por carteira** (chave é o código/CNPJ do cliente, não
  o id da empresa): `folha_selecoes_eventos`, `folha_mapeamentos`,
  `folha_historico`, `folha_perfis_colunas` e `ponto_layouts`. Entram com a
  etapa 3 (empresa ativa). As Cloud Functions do eSocial também não olham a
  carteira (usam o SDK de admin).
- **Ao publicar as regras:** colaboradores e admins passam a ver só a
  carteira (vazia no início). O gestor monta as carteiras logo em seguida
  em Usuários › Carteira.
- **Revisão do PR #60 (Codex), corrigida aqui:**
  - **P1:** num projeto novo, o master nasce sem e-mail verificado e não
    havia como verificar pelo app, então ninguém virava gestor. Agora a
    tela de espera (e a aba Usuários, para o master que já é admin) envia
    o link de verificação e, em "Já verifiquei", recarrega a conta e o
    token; o perfil é reavaliado e vira gestor.
  - **P2:** o gestor podia rebaixar ou apagar o próprio perfil direto no
    Firestore. Agora o gestor só muda e apaga **outros**; no próprio
    perfil, só o master, e só para virar gestor (nenhum outro campo).
    Emulador: 26 testes.
- **Revisão do PR #61 (Codex), corrigida:**
  - **P1:** a empresa recém-cadastrada sumia das telas até recarregar a
    página (o escopo guardado era o de antes). `criarEmpresa` agora esquece
    o escopo.
  - **P1:** em Eventos do eSocial, com mais de 30 empresas na carteira e
    sem filtro, o erro da lista também impedia de carregar o seletor de
    empresas. Agora as empresas carregam à parte e o erro aparece num aviso.
  - **P2:** "Editar" empresa só aparece para quem as regras deixam editar
    (gestor, admin nas empresas que enxerga, ou quem cadastrou).
  - **P2:** fora do gestor, certificados do Storage de empresas fora da
    carteira apareciam como "sem empresa cadastrada". Agora só aparecem os
    das empresas visíveis, e a lista de órfãos é só do gestor.

## Etapa 3: ativar empresa e período antes de qualquer ação (04/10/2026)

Como no CFI (`services/empresaAtiva.ts` de lá): a empresa ativa é o estado
da SESSÃO, não um filtro de tela.

- **`services/empresaAtiva/empresaAtiva.ts`** (puro, com testes): empresa e
  competência (AAAA-MM) ativas, guardadas no navegador por usuário.
  - **Usuários** e **Empresas** não exigem ativação; todas as outras abas
    exigem (lista explícita e curta: o padrão é exigir);
  - F5 mantém; **sair limpa**; outro usuário na mesma aba começa do zero;
  - a ativação guardada cai se a empresa saiu da carteira.
- **Portão** (`AtivarEmpresaScreen`): logo depois do login, lista só as
  empresas que o usuário enxerga (carteira + cadastradas; gestor, todas),
  com busca e competência (padrão: mês anterior). Carteira vazia explica e
  leva ao cadastro de empresas (ou a Usuários, para admin/gestor).
- **Faixa no topo:** empresa, CNPJ, código SAGE, competência e "⇄ Trocar
  empresa ou período". A troca é uma só no app, pela mesma tela.
- **Trocar de empresa ou de período remonta as telas** (dado de um cliente
  ou de um mês nunca fica na tela de outro).
- **Telas** (contexto `useEmpresaAtiva`; fora do app, nos testes, mantêm o
  seletor próprio):
  - Cálculo e Cadastros: sem seletor de empresa (mostram a ativa); o
    Cálculo abre na competência ativa e o pagamento no mês seguinte;
  - Folha › Apontamento: a sessão só oferece a empresa ativa, na
    competência ativa; "trocar empresa" abre o portão;
  - Prazos: abre na empresa ativa ("Todas da carteira" continua);
  - eSocial (eventos, FGTS/SERPRO, download, calendário) e Ponto: abrem
    na empresa e no período ativos;
  - Conferência pós-folha: avisa quando os totalizadores lidos são de outra
    empresa que não a ativa.
- Fica para depois: travar por carteira nas regras as coleções `folha_*`,
  `folha_perfis_colunas` e `ponto_layouts` (chave por código/CNPJ).

## Etapa 4 (DP): certificados pelo cofre único do SaaS (04/10/2026)

Decisão do Paulo: o .pfx renovado sobe pelo app Legal, gravando no cofre do
CFI. Achado: o app Legal não guardava certificado (só vencimentos do Jotform
e cópia no SharePoint na renovação); o cofre de verdade é o do CFI.

- **CFI (PR #1372):** o túnel `/api/admin/cadastro/certificados` cruza o
  cofre com o acompanhamento do Legal por CNPJ (`legal`, `divergenciaLegal`:
  `renovado-sem-upload` / `legal-desatualizado`). Só metadado.
- **`services/certificados/cofreCertificados.ts`** (puro + túnel, com
  testes): lê o panorama, filtra pela carteira (gestor vê todas), separa as
  empresas da carteira que o CFI não conhece, ordena quem pede atenção
  (vencido, ≤ 30 dias — inclusive pelo A1 da matriz —, sem certificado,
  renovado sem upload) e conta.
- **Aba "🔐 Certificados"** (e eSocial › Certificados): filtros, situação,
  titular, validade, o que o Legal acompanha, última renovação, divergência,
  "o que fazer" e exportação Excel. Não exige empresa ativa (é a carteira).
- **Empresas:** a coluna Certificado lê do cofre; o detalhe explica a
  situação e que a renovação sobe pelo app Legal.
- **Pendências e painel do eSocial** contam vencidos/vencendo pelo cofre.
- **Saiu o envio de .pfx pelo DP:** `CertificadoManager`,
  `ESocialCertificados` e `certificadoService` (que trazia a configuração
  do Firebase do CFI embutida e listava o Storage dele direto do navegador).
- **Storage do DP:** ninguém grava; só o gestor lê os .pfx antigos, para
  conferir que estão no cofre e apagá-los pelo console. Emulador: 26 testes.
- Pendente: as Cloud Functions do eSocial deste projeto ainda procuram a
  senha do certificado em coleções do Firestore em texto (fallback); revisar
  quando a transmissão passar pelo CFI.
- **Revisão do PR #63 (Codex):**
  - **P1 (carteira):** o túnel devolvia o cofre inteiro ao navegador e a
    carteira era filtrada só na tela. Agora o DP pede `?cnpjs=` (a carteira)
    e o CFI devolve só essas empresas (CFI #1372); o filtro na tela fica
    como segunda trava. Gestor continua vendo todas.
  - **P1 (transmissão do eSocial):** é anterior a este PR. As Cloud
    Functions de transmissão leem o .pfx do bucket do CFI no caminho antigo
    (`empresa.certificado.storagePath`); o envio antigo do DP gravava no
    Storage do PRÓPRIO DP (nunca foi lido por elas) e o cofre atual guarda o
    arquivo cifrado (que elas também não leem). A solução é transmitir pelo
    CFI com o A1 do cofre, como o download de eventos — próxima etapa,
    proposta ao Paulo.
  - **P2:** "Atualizar" em Empresas também recarrega o cofre; o painel do
    eSocial mostra a data do A1 da matriz quando é ele que vale.

## 05/10/2026 — Etapa 5: calendário de obrigações da folha por empresa

Pedido do Paulo: "ausência de calendário de obrigações mensais que se
referem à folha de pagamentos e seus encargos, como FGTS, eSocial, Reinf,
guias sindicais".

- **`services/prazos/obrigacoesEmpresa.ts` (puro):** obrigações da empresa
  na competência ativa. Parte dos vencimentos gerais (salário, S-1299,
  DCTFWeb, DARF, FGTS Digital, 13º e anuais do 13º) e acrescenta:
  - **EFD-Reinf:** dia 15 do mês seguinte, dia não útil adia (mesma régua
    do catálogo do CFI). Responsável: fiscal; o DP acompanha.
  - **Contribuição sindical (março):** recolhimento até 30/04, só de quem
    autorizou (CLT arts. 578, 579, 582 e 583).
  - **Comprovante de rendimentos (janeiro):** último dia útil de fevereiro
    (IN RFB 2.060/2021).
  - **Guias sindicais da convenção:** dia e meses vêm do cadastro do
    sindicato dos empregados ativos (CNPJ da ficha). Sem dia cadastrado não
    se inventa data: a tela avisa qual sindicato está sem guia.
  - Sem empregados ativos no cadastro, as obrigações ficam com a condição
    "confira se há folha" (S-1299 e DCTFWeb valem mesmo sem movimento).
- **Sindicato:** campos novos `guiaDia` (1 a 31; dia que não existe vira o
  último do mês; não útil antecipa), `guiaMeses` ("todos" ou "3, 9") e
  `guiaDescricao`, com validação e o bloco "Guia sindical no calendário".
- **`obrigacoes_status/{empresa}_{obrigação}`:** marcação "entregue" ou
  "não se aplica" (com motivo), vista por toda a equipe da empresa, com
  auditoria em `cadastro_audit`. Regras: só quem tem a empresa (carteira,
  cadastrou, ou gestor) lê, marca e desfaz; autor, status, competência e id
  conferidos. Emulador: 29 testes (3 novos).
- **Prazos:** no topo, "Calendário da empresa" da empresa e competência
  ativas — vencimento com ajuste de dia útil, responsável, base legal,
  atraso destacado, contadores e botões Entregue / Não se aplica / Desfazer.

## 05/10/2026 — Transmissão do eSocial pelo cofre do CFI

- **Paulo: *"pode seguir com a transmissão do esocial pelo cofre"*.**
- **Por que mudou:** as Cloud Functions antigas (`functions/`) liam o .pfx de
  um caminho que não existe mais e a senha em texto no Firestore, não
  conferiam a carteira e geravam eventos incompletos (o S-1200 saía só com o
  CPF). Saíram do repositório; a entrada `functions` do `firebase.json` também.
  Se alguma delas estiver publicada no projeto, apagar pelo console.
- **CFI** (`sefaz-backend/esocial-envio.js`, `dp-acesso-empresa.js`, rotas
  `/api/dp-integration/esocial/envio/{lote,consulta}`):
  - **Acesso:** só o projeto do DP entra. A carteira é conferida lendo a
    empresa no Firestore do DP com o token do próprio usuário: as regras do
    DP decidem, sem cópia da carteira no CFI.
  - **Conferência de cada evento:** raiz `<eSocial>`, tipo, Id, empregador,
    ambiente e grupo. O lote leva até 50 eventos, de um grupo só.
  - **Assinatura e envio:** assina com o A1 do cofre (o do escritório,
    procurador, ou o da empresa); a assinatura antiga do XML é trocada.
    Envia em `WsEnviarLoteEventos` (o lote em si não é assinado).
  - **Ambiente:** produção restrita é o padrão; produção exige
    `confirmoProducao`, como no gateway da EFD-Reinf.
  - **Consulta:** só aceita protocolo que saiu do túnel para a mesma empresa e
    ambiente.
  - **Auditoria:** `dp_esocial_envio_log`, sem o conteúdo dos eventos.
- **DP** (`services/esocial/transmissao.ts`, `transmissaoService.ts`, aba
  eSocial › Transmissão):
  - **Eventos gerados aqui:** S-1299 (mensal ou anual do 13º, com os
    indicadores e a DCTFWeb) e S-1298, leiaute S-1.3.
  - **XML pronto:** IOB ou outro sistema; a tela confere empresa e ambiente
    antes de enviar.
  - **`esocial_envios`:** protocolo, Ids, tipos, recibos e ocorrências. O
    usuário cria e a consulta atualiza; ninguém apaga. Precisa do índice
    `empresaId` + `enviadoEm`.
  - **Aba Eventos:** virou só controle. O botão "Transmitir" leva à aba
    Transmissão.
- **Validação contra os XSDs oficiais (nfephp sped-esocial):**
  - S-1299 mensal e anual e S-1298, assinados com o A1 de teste do CFI,
    passam em `evtFechaEvPer`/`evtReabreEvPer` v_S_01_03_00;
  - o lote passa em EnvioLoteEventos v1_1_1;
  - a consulta passa em ConsultaLoteEventos v1_0_0.
- **Testes:**
  - CFI: 14 novos (626 suítes, 9189 testes);
  - DP: 11 novos (485 testes);
  - regras no emulador: 32.
- **Pendente de teste real:**
  - Primeiro envio em produção restrita, depois do deploy do CFI, com o A1 do
    escritório no cofre.
  - Confirmar que a procuração cobre o envio; se não cobrir, usar
    "certificado da própria empresa".

## 05/10/2026 — Backup do IOB: sinônimos do FolhaWin e carga do enquadramento

- **Paulo: *"pode seguir com a carga de enquadramento e sinônimos"*.**
- **Sinônimos do FolhaWin no de/para** (`cargaBackupIob.ts`):
  - **Siglas:** `codfun`, `dtres`, `numcp`, `sercp`, `ufcp`, `orgrg`, `dtemrg`,
    `numtit`, `codsind`, `bcosal`, `agdsal` e `comple`.
  - **Resultado:** contra as 223 colunas reais da `func` (inventário do
    backup), a proposta acerta 34 dos 38 campos. Faltam o código do cargo
    (`codcargo` está na `funcdoc`) e o CNPJ do sindicato (não está na
    `func`).
  - **Salário e PIX:** vêm de tabelas complementares do mesmo schema, ligadas
    pelo `codfun`:
    - salário de `salarios`: o registro marcado em `ultimo` ou, sem marca, o
      de maior `anomes`;
    - PIX de `funcdoc.vlchavepix`.
    - O modal "Completar pelo backup do IOB" lê essas tabelas quando estão no
      backup.
  - **A conferir:** a `func` tem `cc` (proposto como conta) e `salban`; qual
    é a conta do salário ainda não foi confirmado com dados reais.
- **Carga do enquadramento** (`cargaEnquadramentoIob.ts`; botão em Cadastros ›
  Enquadramento › "Carregar do backup do IOB"):
  - **Escopo:** todas as empresas da carteira, ligadas pelo código SAGE
    (`CODEMPRESA`).
  - **Regime:** pela classificação tributária do S-1000 (`ES_S1000.FKCLASTRIB`):
    - 01 → Simples (CPP no DAS);
    - 02 → Simples Anexo IV;
    - 03 e 04 → conferir;
    - 06–14 e 60–99 → normal;
    - código desconhecido → conferir (pode ser índice interno do IOB).
  - **RAT e CNAE:** RAT (`PERCSAT`), RAT ajustado e CNAE vêm do `ES_S1005`.
    Estabelecimentos com RAT diferentes viram pendência.
  - **FAP:** por período (`ESOCIALEMPRESA`). Cada período ainda em uso
    (encerrado depois do corte, por padrão janeiro do ano anterior) vira uma
    vigência. Sem período, o FAP sai do RAT ajustado ÷ RAT, ou 1,0000
    provisório com pendência.
  - **CNPJ:** o CNPJ do IOB tem de ter a mesma raiz da empresa; senão, erro.
  - **FPAS e terceiros:** vêm do `depto` do schema `fNNNN`, que só existe no
    Backup SQL completo. Sem ele, a tela oferece um "FPAS padrão" (com
    sugestões da `TERC`), aplicado só a quem a equipe marcar, com pendência.
  - **Gravação:** nada é sobrescrito; enquadramento já cadastrado na vigência
    mostra as diferenças. Grava em lotes, com auditoria (origem "Backup IOB").
- **Testes:** 495 passando (11 novos).

## 05/10/2026 — Boas-vindas antes do portão de empresa e período

- **Paulo (print):** depois de publicar as regras, as empresas apareceram, mas
  *"não está gerando uma tela de login e boas-vindas"*.
- **Causa:** a saudação só era desenhada no layout principal. Desde o portão
  "Ativar empresa e período" (PR #61), o app mostrava o portão antes, e a
  saudação ficava escondida até ativar uma empresa.
- **Correção:** a ordem passa a ser login → boas-vindas → ativar empresa e
  período → pendências. Sem empresa ativa, o botão diz "Escolher empresa e
  período".
- **Login:** a tela não aparece com a sessão aberta (o Firebase mantém o login
  no navegador, como no CFI). Volta ao clicar em Sair.
- **Ajustes vistos no print seguinte (mesmo dia):**
  - **Selo do papel:** dizia "👑 Admin" também para o gestor; agora mostra o
    papel de verdade (Gestor ou Admin).
  - **Card "Selecionar empresa" da Folha:** dizia "1 empresa(s)" porque a tela
    só mostra a empresa ativa. Com empresa ativa, passa a dizer "Abra o
    período MM/AAAA da empresa ativa…".
  - **Cabeçalho:** o nome do app e "Templates e agendamentos" não quebram mais
    linha. O nome só aparece em telas largas, e o link fica "Templates ↗" nas
    estreitas.

## 06/10/2026 — Enquadramento pelo .backup de uma empresa (schema fNNNN)

- **Paulo mandou o inventário do backup do banco de uma empresa:** schema
  `f1200`, 367 tabelas, com dados reais (`func` com 85 KB, `salarios` com
  389 KB, `holerith` com 1 MB).
- **Funcionários:** o dicionário é o mesmo do `f1316`: `func` (223 colunas
  idênticas), `salarios` (com `ultimo`) e `funcdoc` (com `vlchavepix`). O
  de/para do PR #66 vale como está.
- **Enquadramento:** a carga exigia as tabelas de sistema do FolhaWin
  (`ES_S1005`…), que não vêm no `.backup`. Agora também lê o schema da
  empresa:
  - `esocialdadosficha_s1000`: o `classtrib` é o código do eSocial e tem
    preferência sobre o `FKCLASTRIB`; o `nrinsc` confere o CNPJ.
  - `depto_ma`: FPAS, código e % de terceiros, RAT e FAP mês a mês, da
    lotação com mais meses. Cada mudança de parâmetro vira uma vigência, e
    ficam as que ainda valem a partir do corte.
  - `depto`: FPAS, terceiros, RAT e CNAE, como reserva.
  - O schema `fNNNN` liga ao código SAGE `NNNN`.
- **Para o futuro, o mesmo backup tem:**
  - `holerith`/`holetot`, os holerites calculados pelo IOB, que podem servir
    para conferir o motor sem PDF;
  - `arquivoeventotransmissaoesocial`, os XMLs que o IOB transmitiu.

## 06/10/2026 — Código SAGE e CNPJ únicos; master vira gestor pela verificação no app

- **Paulo (print de Empresas):** *"você deve bloquear o cadastro de empresas
  com a mesma numeração, exemplo 1200"*. Havia duas empresas com SAGE 1200:
  SP (44.388.152/0001-89) e SP ASSESSORIA CONTABIL (04.896.300/0001-51).
- **Causa:** a checagem de CNPJ repetido olhava só as empresas visíveis, e a
  de código SAGE não existia. Fora do gestor, a lista não mostra as empresas
  de outras carteiras.
- **Trava:**
  - **Chaves:** `empresas_unicos/{sage_0000 | cnpj_…}` aponta a empresa dona.
  - **Criar:** a empresa e as duas chaves vão no mesmo lote. As regras só
    aceitam a empresa com as duas chaves dela.
  - **Trocar código ou CNPJ:** exige reservar a chave nova; a antiga é
    liberada quando a empresa deixa de usá-la ou é excluída.
  - **Dono fixo:** a chave não troca de dono (`update: false`).
  - **Mensagem:** a tela confere antes de gravar e diz com qual empresa
    conflita, ou que é "fora da sua carteira".
- **Empresas de antes da trava:**
  - **Botão do gestor:** "Proteger códigos e CNPJs das empresas existentes"
    reserva as chaves; a empresa mais antiga fica com a chave repetida.
  - **Aviso:** a lista marca em vermelho o código ou CNPJ repetido, para
    corrigir em "Editar".
  - **Reserva ao editar:** qualquer edição também reserva as chaves livres.
- **Master:** o print mostrou "Admin". A conta master só vira gestor com o
  e-mail verificado, e o aviso de verificação aparecia só na tela de
  "aguardando aprovação". Agora aparece no topo do app enquanto o master não
  for gestor.
- **Testes:** emulador com 38 testes (6 novos de chaves únicas); vitest com
  501.

## 06/10/2026 — Busca de empresa na Folha e na ativação

- **Paulo (prints):** *"a busca e pesquisa de empresa não está funcional, nem
  por nome, nem número SAGE"*.
- **Causa:** desde o portão (PR #61), a Folha só carregava a empresa ativa, e
  o modal "Selecionar / Abrir empresa" buscava apenas nela. Por isso 1200 e
  outros nomes não apareciam. A busca também não ignorava acentos e não
  achava o CNPJ digitado com pontuação.
- **Correção:**
  - **Busca única** (`services/empresas/buscaEmpresas.ts`): nome e razão
    social sem acento nem maiúscula, CNPJ com ou sem pontuação, código SAGE
    com ou sem zeros. Vale no modal da Folha e na tela de ativação.
  - **Modal da Folha:** busca em toda a carteira, com a empresa ativa já
    marcada. Escolhendo outra empresa (ou outro mês), o app troca a empresa
    ativa (`ativar` no contexto) e abre a folha dela direto: o pedido fica em
    `sessionStorage` enquanto a tela remonta.

## 06/10/2026 — Matrícula do eSocial pelo S-1200 na carga do FolhaWin

- **Paulo (prints do teste com a empresa 1200):**
  - leitura: 432 linhas lidas, 0 novas, 432 "sem ficha";
  - motivo de todas: "Sem matrícula do eSocial no IOB" (os CPFs estavam
    certos).
- **Causa:** a coluna `func.matricula` do FolhaWin vem vazia. O IOB gera a
  matrícula (`funcdoc.geramatric`) e não a guarda na ficha. No backup, a
  única fonte preenchida é `esocialdadosficha_s1200_remunperapur` (`codfun`,
  `anomes`, `matricula`), a matrícula que o próprio IOB mandou no S-1200.
- **Correção:**
  - A tabela entrou nas complementares da carga: a matrícula vem do S-1200
    mais recente de cada `codfun`, e a da `func`, quando houver, tem
    preferência.
  - Quem nunca teve S-1200 (desligados antes do eSocial) continua listado
    sem ficha, de propósito.

## 06/10/2026 — Cargo e CBO na carga do FolhaWin

- **Resultado da carga com o S-1200 (print):** 59 fichas ativas criadas na
  SP ASSESSORIA CONTABIL (SAGE 1200), com matrícula = código IOB, CPF e
  admissão. Cargo veio vazio, e as fichas recentes acusam "1 erro"; o erro
  ainda não foi visto.
- **Paulo: *"pode seguir com rsalfunc cargo"*.**
- **Cargo:** a carga lê `rsalfunc` (histórico do funcionário: `codcargo`,
  `funcao` e `cbo` por data) e `cargos` (`codcargo` → `cargo`/`descricao` e
  `cbo`). Do registro mais recente vêm:
  - **Código e nome do cargo:** o código vem do `rsalfunc` (sem ele, de
    `funcdoc.codcargo`) e o nome, da tabela `cargos`.
  - **Função:** só quando vem como texto.
  - **CBO:** só com 6 dígitos (CBO 2002), do histórico ou do cargo.
- **CEP:** com 7 dígitos (zero à esquerda cortado) passa a vir com o zero.
- **Para completar as 59 fichas:** rodar a carga de novo. Ela só preenche
  campos vazios.

## 06/10/2026 — Ficha completa pelo eSocial que o IOB transmitiu

- **Paulo (print da ficha ALEXANDRE ROSA ATHAYDE):** *"conforme importacao,
  essas sao as informacoes faltantes, como podemos restaurar usando este
  backup"*. Faltavam categoria, tipo e fim de contrato, salário e unidade,
  horas, horário, sindicato, regimes, FGTS e desligamento, e o CBO dava erro.
- **"1 erro" da ficha:** CBO "01105", da coluna `func.cbo` (CBO antiga, de 5
  dígitos).
  - A carga passa a preferir `func.cbo2` (CBO 2002).
  - CBO que não tenha 6 dígitos não vai para a ficha.
  - Um CBO inválido de carga anterior é trocado; se foi digitado à mão,
    vira divergência.
- **Salário:** quem não tem registro em `salarios` recebe o do `rsalfunc`
  mais recente.
- **Fonte dos campos do contrato:** os XMLs que o IOB transmitiu, guardados
  no próprio Backup SQL, no schema fNNNN:
  - `arquivoeventotransmissaoesocial.dados_arq`: o XML de cada evento;
  - `eventotransmissaoesocial` (`id_evento` → `rec_esocia`): o recibo de
    cada um.
- **Como funciona:** "Importar do eSocial (XML)" passa a aceitar o
  `.backup`.
  - Ele lê só o schema da empresa (f1200 para o SAGE 1200) e só os eventos de
    vínculo (S-2200, S-2205, S-2206, S-2299, S-3000).
  - Liga o recibo do IOB pelo Id do evento. O evento sem recibo (envio
    recusado) fica de fora.
  - Mostra a mesma prévia de sempre; nada é gravado sem confirmação.
  - A ficha que veio da carga do backup é completada pela mesma chave (CPF +
    matrícula). Edição manual é preservada.
- **Formato de dados_arq:** não consta do inventário. A leitura aceita texto,
  bytea (`\x`), base64, zip e gzip; o que não abrir aparece como aviso
  contado.

## 06/10/2026 — Aviso de atualização em popup, com o que mudou

- **Paulo:** *"o banner de atualizacao o mesmo deve chamar o maximo de atencao
  do colaborador, em forma de popup, sempre elencando o que foi atualizado"*.
- **Nova versão publicada:** popup no centro da tela, com fundo escurecido e
  borda em destaque. Ele lista o que mudou desde a versão aberta e tem o botão
  "Atualizar agora".
  - "Depois" só adia por 10 minutos; o adiamento sobrevive ao recarregar a
    página.
  - Enquanto adiado, fica uma faixa laranja no topo, sem opção de esconder de
    vez.
- **Depois de atualizar:** popup "Sistema atualizado", com o que mudou desde a
  última versão que a pessoa usou naquele navegador. No primeiro acesso, nada
  aparece.
- **Lista do que mudou:**
  - O build grava `novidades` no `version.json`: os últimos 40 commits sem
    merge, com título sem o "(#NN)" e os itens "- ..." do corpo do commit.
  - O deploy passou a buscar 60 commits de histórico (`fetch-depth`).
- **Correção:** quem se inscreve no aviso depois que ele já foi disparado
  (ex.: a tela troca após o login) agora também o recebe.

## 06/10/2026 — Demais campos do contrato pela carga do FolhaWin

- **Print da lista após a importação:** a maioria das fichas aparece "ok".
  ALEXANDRE ROSA ATHAYDE, ALEXANDRE SANCHES e BRUNO HENRIQUE, admitidos em
  2022, 2003 e 2015, ficaram com 3 ou 4 avisos (provavelmente sem o S-2200
  no backup).
- **Paulo:** *"pode seguir completando os demais campos"*.
- **Fontes, todas do schema da empresa e ligadas pelo `codfun`:**
  - **`esocialdadosficha_s1200_dmdev`** (`codcateg`, `codcbo`): categoria e
    CBO do S-1200 mais recente. É o valor que o IOB transmitiu. A `func.catego`
    não é usada: o código dela é do IOB, não do eSocial.
  - **`esocialdadosficha_s1300_contribsind`** (`cnpjsindic`): CNPJ do
    sindicato.
  - **`hist_horarios` + `cad_horarios.hrsemanal`:** horas semanais do horário
    vigente.
  - **`func`:**
    - `tipsal` vira a unidade salarial (letras M/H/D/S/Q/T). Um código numérico
      não é conhecido e fica de fora.
    - `hrssem` vira horas semanais (até 44).
    - `fimcontr` vira o fim do contrato.
    - `dtopfg` vira a opção do FGTS.
- **Campos derivados:**
  - Categoria 1xx: regime CLT e RGPS.
  - Fim de contrato no futuro: prazo determinado. Fim já vencido (experiência
    que passou): prazo indeterminado, e a data fica de fora.
- **Regra de sempre:** a carga só preenche campos vazios. O que veio do
  eSocial ou foi digitado à mão não muda.

## 06/10/2026 — Ativação: perfil e total de empresas visíveis

- **Paulo (print da Juliana na tela Ativar empresa, busca "sp"):** *"esse
  colaborador em questão, juliana é gestor"*.
- **Diagnóstico pelo print:**
  - A tela mostrou "Nenhuma empresa nesta busca", e não "Nenhuma empresa na
    sua carteira". Logo, a lista dela não estava vazia, mas não trazia a SP.
  - O gestor do Consultor DP lista todas as empresas (`escopoAtual` →
    `listarTodasEmpresas`). Então, para o DP, a Juliana não é gestor.
  - O papel do DP é o `users/{uid}.role` do próprio DP, que é diferente do
    papel no CFI.
- **Mudança:**
  - A tela de ativação mostra o e-mail, o perfil no Consultor DP e quantas
    empresas a pessoa enxerga ("todas as N" para o gestor, "N na carteira"
    para os demais).
  - A busca sem resultado diz entre quantas empresas procurou e, para quem
    não é gestor, que falta incluir a empresa na carteira.

## 06/10/2026 — Importação pelo backup: leiaute 2.x, XML sem namespace e avisos agrupados

- **Print da importação na empresa 1200:**
  - O backup foi lido: 2169 XMLs de vínculo e 22.535 recibos.
  - Na prévia, 137 vínculos sem mudança (já importados) e 0 novos.
  - Vieram 1946 avisos, a maioria "Versão/namespace eSocial não suportado".
    Entre eles há eventos de 2022 e 2023, quando o leiaute já era S-1.x. O
    problema, então, não é só versão: o IOB guarda parte dos XMLs com um
    namespace que o leitor recusa.
- **Mudanças:**
  - A mensagem de recusa mostra o namespace que veio, para o diagnóstico.
  - Na importação pelo backup (`leiautesAntigos`), o leitor aceita o leiaute
    2.4/2.5 e o XML sem namespace. A ficha recebe uma pendência "conferir",
    e, no 2.x, cargo e CBO não vêm no evento. A implantação e o XML baixado
    do portal continuam exigindo S-1.x.
  - S-2206: o contrato é lido também quando está ao lado do `vinculo`
    (estrutura do 2.x).
  - Avisos repetidos viram uma linha com a quantidade e um exemplo.

## 06/10/2026 — Situação pelo desligamento do IOB e pendências sem repetição

- **Print após a nova importação:** 64 ativos (eram 59). Entraram fichas
  novas pelo eSocial, por exemplo ALEKSANDRO, matrícula 000172, ainda sem
  código IOB. Os números amarelos subiram em alguns funcionários antigos,
  como ALEXANDRE SANCHES (5) e BRUNO HENRIQUE (5).
- **Ajustes:**
  - Carga do backup: uma ficha ativa que recebe a data de desligamento do
    IOB (`dtres`) passa a desligada, salvo se a situação foi digitada à mão.
  - Importação do eSocial: uma ficha desligada pela data do IOB, sem S-2299
    nos arquivos, não é reativada. Fica com a pendência "conferir".
  - Pendências repetidas em vários eventos (por exemplo, a de leiaute
    antigo em cada S-2206) aparecem uma vez só.

## 06/10/2026 — Perfil relido a cada login

- **Contexto:**
  - O link de verificação do e-mail master não chegou: o remetente
    `noreply@…firebaseapp.com` costuma ser barrado pelo e-mail corporativo.
  - Paulo mudou o `role` dele e o da Juliana para `gestor` direto no console
    do Firestore.
- **Problema:** o escopo (papel e carteira) ficava guardado em memória por
  uid (`escopoAtual`). Quem saía e entrava na mesma aba, sem recarregar,
  continuava com o perfil antigo.
- **Correção:** a cada entrada ou saída, o `MainTabs` chama `esquecerEscopo()`
  no próprio retorno do login, antes de marcar o usuário. Com isso, as telas
  que abrem logo depois (Empresas, Certificados) já leem o papel e a carteira
  novos. A revisão do Codex no PR #78 apontou que, num efeito que roda depois
  da tela aparecer, essas telas ainda leriam o perfil antigo.

## 07/10/2026 — Férias e afastamentos pelo backup do IOB

- **Paulo:** *"preciso testar e gerar férias de um funcionário real"* e *"pode
  seguir com o PR de férias e afastamentos"*.
- **Problema:**
  - O motor de férias escolhe o período aquisitivo pelos gozos anteriores e
    aplica a perda do direito (art. 133) pelos afastamentos.
  - Nada disso vinha do backup.
  - Desde o leiaute S-1.0, as férias não vão mais ao eSocial (S-2230), então
    o histórico de férias do IOB é a fonte.
- **Mudanças:**
  - **`hist_ferias` → férias anteriores:** cada gozo com datas válidas vira um
    afastamento de motivo 15, com o período aquisitivo (`daquisiini`/`fim`) e
    o abono (`ntotabono`, ou os dias de `dabonoini`/`fim`). A ligação com a
    ficha é pelo código IOB.
  - **S-2230 transmitidos pelo IOB:** saem de
    `arquivoeventotransmissaoesocial` com os recibos de
    `eventotransmissaoesocial`. O evento recusado fica de fora. São aceitos o
    leiaute 2.x e o XML sem namespace.
  - **Junção:** com o mesmo início no mesmo vínculo, fica o S-2230, completado
    com o período aquisitivo e o abono do histórico.
  - **Reimportação:** um S-2230 que não traz o abono ou o período aquisitivo
    não apaga esses dados. O abono entra na comparação, para ser gravado.
  - **Tela:** Cadastros › Afastamentos › "Importar S-2230 (XML) ou backup do
    IOB" aceita o `.backup`, com a prévia de sempre.
- **Pergunta do Paulo sobre o restore completo da 1200:**
  - O Consultor não guarda as tabelas do FolhaWin. Ele traz do backup, com
    prévia, os dados que usa: fichas, eSocial, enquadramento, férias e
    afastamentos. O próximo passo é o `holerith`, para as médias.
  - Copiar as cerca de 200 tabelas do schema para o Firebase guardaria dados
    pessoais sem uso. Isso fere a regra de não gravar o backup no Firebase.

## 07/10/2026 — Histórico da folha (médias) e registro de guarda dos backups

- **Paulo:** *"pode seguir com holerite e registro de guarda"*.
- **Histórico da folha** (Funcionários › "Histórico da folha (IOB)"):
  - Fonte: `holerith` do schema da empresa. Vira movimento mensal com horas
    extras 50% e 100%, faltas e DSR descontado, por funcionário e mês, no
    vínculo em vigor no mês.
  - O tipo de cada evento vem da natureza da rubrica que o IOB mandou ao
    eSocial (`eventos_esocial` → `esocialdadosficha_s1010.natrubr`):
    1003 = horas extras (100% pela descrição); 9207 = faltas; 9211 = faltas
    e atrasos (só com "falta" na descrição). Sem natureza, vale a descrição.
    Códigos de faltas conferidos em fonte pública (Portal SPED Brasil,
    Senior). O 1003 veio do resultado da busca; a tabela oficial do gov.br
    está bloqueada aqui.
  - A prévia lista os eventos reconhecidos, com os totais, para conferir
    com o IOB.
  - "Horas no formato hh,mm" vem desmarcado: o formato da referência do IOB
    não está confirmado.
  - Só preenche o que o movimento ainda não tem. Um valor já lançado fica e
    aparece listado.
- **Registro de guarda** (aba IOB SAGE, coleção `backups_guarda/{sha256}`):
  - Inventário dos backups do SAGE guardados no UNAS Pro 4: arquivo,
    tamanho, SHA-256, empresas (schemas fNNNN), data, local, observação e
    quem registrou. O conteúdo não entra.
  - O SHA-256 é calculado no navegador, em fatias de 4 MB (classe
    incremental própria, conferida contra o `node:crypto`), porque o
    WebCrypto não lê arquivos de mais de 1 GB em partes.
  - "Conferir um arquivo" informa se ele está íntegro, renomeado, alterado
    ou não registrado.
  - Regras: só o gestor registra; admin e gestor leem; ninguém altera nem
    apaga. Testes no emulador: 34/34, rodando um arquivo por vez (em
    paralelo, o `clearFirestore` de um arquivo apaga os dados do outro).

## 07/10/2026 — Restaurar a empresa no Consultor pela tela de restore do SAGE

- **Paulo:**
  - *"você não entendeu! tudo que precisamos está no backup da SAGE, ou seja,
    temos que restaurar o backup primeiro dessa empresa piloto, efetuamos os
    parâmetros e assim seguimos com as demais"*.
  - Sobre como fazer: *"a tela e função restore backup sage já existe"*.
- **Mudança:** na tela IOB SAGE › "Restaurar backup do IOB SAGE", depois de
  abrir o `.backup`, aparece a seção **"Restaurar a empresa no Consultor"**:
  - Lista as empresas do backup (schemas fNNNN), ligadas à empresa do
    Consultor de mesmo código SAGE.
  - **Parâmetros** salvos no navegador para as próximas empresas: histórico
    a partir de, FAP a partir de, horas hh,mm, FPAS padrão, terceiros e
    criação de fichas.
  - "Preparar a restauração" monta o plano em cinco etapas encadeadas, cada
    uma sobre as fichas que a anterior deixou:
    1. vínculos pelo eSocial transmitido;
    2. fichas pela `func` e pelas tabelas complementares;
    3. enquadramento;
    4. afastamentos (S-2230) e férias (`hist_ferias`);
    5. histórico da folha (`holerith`).
  - A tela mostra o resumo e os avisos de cada etapa. "Gravar tudo" grava na
    ordem fichas → enquadramento → afastamentos → movimentos, pelos serviços
    de sempre (auditoria e regras).
  - Só completa o que falta. O que já está gravado, inclusive o digitado à
    mão, é mantido; rodar de novo não repete nada.
  - Só o gestor restaura.

## 07/10/2026 — Classificação dos eventos do histórico como parâmetro

- **Paulo:** enviou o print do resumo da restauração da 1200 (preparada, ainda
  não gravada).
- **O que o print mostrou:**
  - o evento 5850 "FALTAS E ATRASOS (T/H)" (natureza 9207) era somado como
    dias de falta;
  - nenhuma hora extra foi reconhecida.
- **Mudança:**
  - Natureza 9207 com "atraso", "T/H" ou "horas" na descrição não entra mais
    como dias de falta.
  - Na seção "Restaurar a empresa no Consultor", depois de preparar, aparece a
    tabela **"Eventos do histórico"**: todos os eventos do `holerith` no
    período, com natureza, lançamentos e quantidade. Para cada um, a equipe
    escolhe automático, HE 50%, HE 100%, faltas (dias), DSR descontado (dias)
    ou "não entra".
  - O acerto fica salvo nos parâmetros (`eventos`, por código do evento), vale
    para as próximas empresas e também para Funcionários › "Histórico da folha
    (IOB)". Mudar um evento descarta o plano; a tabela continua aberta para
    acertar os outros, e depois é só preparar de novo.
  - Evento acertado como falta não é descartado pela palavra "hora" na
    descrição; o limite de 31 dias continua.

## 07/10/2026 — Terceiros (%) com decimal na restauração

- **Paulo:** *"no campo % de terceiros, ele deve aceitar 0,0; só aceita número
  inteiro"*.
- **Causa:** o campo convertia para número a cada tecla; "5," virava 5 e a
  vírgula sumia.
- **Mudança:** o campo guarda o texto digitado (vírgula ou ponto, uma casa
  decimal ou mais) e só converte para o parâmetro. Aceita "5,8" e "0,0".

## 07/10/2026 — Regime da empresa na restauração (1200 no Simples)

- **Paulo:** a restauração da 1200 gravou fichas, férias e histórico, mas o
  enquadramento ficou com "1 com erro". *"O CNPJ está correto, a empresa é
  optante pelo Simples."*
- **Causa provável:** a carga lia a **primeira** linha do
  `esocialdadosficha_s1000`. O S-1000 tem histórico, e a empresa que entrou
  no Simples guarda a linha antiga do regime normal. Com isso o regime saía
  "normal" e a validação barrava (RAT/FPAS).
- **Mudança:**
  - `s1000Vigente`: usa a linha de maior vigência (`inivalid`), senão a
    última gravada (`pk_padrao`). Vale também para a carga de enquadramento
    em Cadastros.
  - Na seção "Restaurar a empresa no Consultor", novo campo **"Regime
    previdenciário desta empresa"**: "Pelo backup (S-1000)" ou o regime
    escolhido, que vale sobre o backup. Fica salvo por empresa
    (`regimes`). Fora do regime normal, FPAS e terceiros são zerados e o
    FPAS padrão não se aplica.
  - O resumo da etapa 3 mostra o regime e o erro que impede gravar, sem
    precisar abrir os avisos.

## 07/10/2026 — S-1000 com linha de outra inscrição (1200)

- **Print do Paulo** depois do #84: o regime da 1200 já saiu certo pelo
  backup (Simples, demais anexos). O que barrava era o CNPJ: *"CNPJ no IOB
  (raiz 44388152) não é o da empresa (raiz 04896300)"*. O Paulo confirmou que
  o CNPJ do Consultor está certo.
- **Causa:** o `esocialdadosficha_s1000` da 1200 tem também uma linha com
  outra inscrição, e a conferência exigia que **todas** as linhas fossem da
  empresa.
- **Mudança:** valem as linhas do S-1000 com a raiz da empresa, tanto para o
  regime quanto para a conferência do CNPJ. As de outra raiz viram pendência
  ("ignorada; conferir") e não impedem gravar. Sem nenhuma linha da empresa,
  continua o erro de CNPJ (código SAGE trocado).

## 07/10/2026 — 1200 com o CNPJ 44.388.152: fichas passam para o CNPJ atual

- **Diagnóstico pelo backup:** 1984 dos 2106 XMLs da 1200 (e 504 de
  afastamento) foram transmitidos pela raiz **44388152**. O S-1000 da 1200 é
  todo dessa raiz, desde 11/2021. O Consultor tinha a 1200 com a raiz
  04896300, que só aparece nos envios antigos.
- **Paulo:** *"o correto é a empresa 1200 com CNPJ 44388152"*. Ele corrige o
  CNPJ no cadastro da empresa.
- **Mudança:** as fichas guardam o CNPJ do empregador. Na restauração, as
  fichas da empresa com outro CNPJ passam para o CNPJ atual. A troca aparece
  como alteração ("CNPJ do empregador") e como aviso na etapa 1. A edição
  manual da ficha não marca o CNPJ como "Manual". Afastamentos, movimentos e
  enquadramento não guardam CNPJ.

## 07/10/2026 — Empresas: busca e "Proteger" sem erro de permissão

- **Paulo** (print da tela Empresas, 93 empresas): *"o campo de pesquisa por
  nome ou número ou CNPJ está desativado e também relata erro de
  permissão"*. O "Proteger códigos e CNPJs" mostrava "Missing or insufficient
  permissions".
- **Causas:**
  - **Busca:** a tela Empresas não tinha campo de busca. Só a Folha e a
    ativação de empresa tinham.
  - **Proteger:** as regras conferem a chave contra o valor gravado
    (`'sage_' + codigoSage`, `'cnpj_' + cnpj`). Empresas antigas gravadas
    fora do formato (código sem os zeros, como "93", ou CNPJ com pontuação)
    tinham a chave recusada. A primeira recusa parava tudo. Conferido no
    emulador: só a chave, recusa; normalizando no mesmo lote, aceita.
- **Mudança:**
  - Campo **"Buscar por nome, razão social, CNPJ ou código SAGE"** na tela
    Empresas, com o mesmo `filtrarEmpresas` da Folha e da ativação.
  - `protegerEmpresasExistentes`: cada empresa num lote próprio. Acerta o
    código e o CNPJ para o formato padrão no mesmo lote da chave. Uma empresa
    recusada não interrompe as outras: vai para a lista de falhas, com o
    motivo. Cadastro repetido continua para a equipe corrigir.
  - `atualizarEmpresa`: editar uma empresa antiga que só muda o formato
    ("93" → "0093") reserva a chave, em vez de ser recusado.

## 07/10/2026 — Restauração com código SAGE repetido: escolha pelo CNPJ

- **Paulo:** *"o CNPJ está correto, mas não habilita para importação"*. Pelos
  prints, a empresa "SP" (S&P ASSESSORIA CONTABIL S/S) já tem o CNPJ
  44.388.152/0001-89, mas a restauração seguia com "raiz 04896300". O
  seletor mostrava "1200 · SP ASSESSORIA CONTABIL".
- **Causa:** há **duas** empresas com o código SAGE 1200 no Consultor (o
  quadro "Cadastro repetido" lista "Código SAGE 1200: SP · SP ASSESSORIA
  CONTABIL"). `empresasDoBackup` fazia um mapa por código e ficava com a
  última, a do CNPJ antigo. As restaurações anteriores da 1200 gravaram
  nessa outra empresa.
- **Mudança:** com o código repetido, o seletor mostra uma opção por empresa,
  com o CNPJ e a marca "código repetido no Consultor", além de um aviso para
  escolher a do CNPJ que o IOB transmite e corrigir o código da outra.

## 07/10/2026 — Programar férias no Cálculo e fim da pendência "XML sem namespace"

- **Paulo** (prints da Juliana, depois da restauração da 1200 na "SP": 428
  fichas, 1 enquadramento, 292 afastamentos/férias, 227 meses): *"restando a
  opção de Férias, segue erros"*.
  - Cálculo › Férias: "Nenhum gozo de férias começando em 11/2026. Lance as
    férias em Cadastros › Afastamentos (motivo 15)".
  - Ficha do José Venancio: três pendências "S-2200/S-2205/S-2206: XML sem
    namespace do eSocial (cópia guardada pelo IOB): conferir".
- **Leitura:** não era erro do motor. O recibo de férias sai de um gozo
  lançado, e para calcular era preciso ir antes a Cadastros. As pendências
  não pediam nada: o IOB guarda o XML enviado sem namespace, e só entra o que
  tem recibo.
- **Mudança:**
  - **"Programar férias"** em Cálculo › Férias, como o "Simular rescisão":
    funcionário ativo, início, dias de gozo (5 a 30) e abono (até 10). Calcula
    o recibo na hora, com o período aquisitivo mais antigo com saldo (pela
    admissão e pelas férias já gozadas). O detalhe mostra "Simulação" com
    **"Gravar em Afastamentos"** (motivo 15, com o período aquisitivo usado e
    o abono) e "Remover simulação".
  - A importação pelo backup não grava mais a pendência "XML sem namespace".
    As fichas perdem essas pendências na próxima restauração ou importação.

## 07/10/2026 — Tabelas oficiais de 2026 para carregar com um clique

- **Contexto:** o Paulo comparou o recibo de férias do José Venancio (1200,
  09/11/2026: 20 dias + 10 de abono) com o do IOB. Os proventos batiam
  (4.900,00), mas o Consultor não descontava INSS: não havia tabela de INSS
  nem de IRRF para 2026.
- **Paulo:** *"pode cadastrar as tabelas de 2026 pra mim"*.
- **Mudança:**
  - `services/cadastros/tabelasOficiais.ts` com as tabelas de 2026
    (vigência 01/2026), cada uma com a norma:
    - INSS (Portaria Interministerial MPS/MF nº 13, de 09/01/2026): até
      1.621,00 7,5%; 2.902,84 9%; 4.354,27 12%; 8.475,55 14%.
    - IRRF (Lei 15.191/2025 e Lei 15.270/2025):
      - faixas 2.428,80 / 2.826,65 / 3.751,05 / 4.664,68;
      - dependente 189,59; simplificado 607,20;
      - redutor: até 5.000,00 (máximo 312,89); parcial até 7.350,00 com
        978,62 − 0,133145 × rendimentos.
    - Salário mínimo (Decreto 12.797/2025): 1.621,00.
    - Salário-família (Portaria MPS/MF nº 13/2026): cota 67,54; limite
      1.980,38.
  - Na tela Cadastros › Tabelas Legais, um quadro mostra as que faltam e o
    botão **"Gravar as tabelas oficiais de 2026"**. A equipe confirma, e cada
    tabela passa pela validação e pela auditoria de sempre. Nada é gravado
    sozinho.
  - Conferido contra o IOB, em teste: INSS de 280,60 sobre 3.266,67, IRRF
    zero pelo redutor e líquido de 4.619,40, iguais ao recibo do IOB.

## 07/10/2026 — IRRF das férias sempre informado, com aviso quando não há retenção

- **Paulo:** confronto feito com o IOB e cálculos ok (José Venancio, 1200,
  11/2026: proventos 4.900,00, INSS 280,60, líquido 4.619,40). Pediu: *"quanto
  ao IR sobre férias, de acordo com a tabela cadastrada o mesmo deve ser
  informado e gerado pelo consultor; quando não houver a incidência de acordo
  com a tabela de cálculo, um aviso deve ser gerado para notificação"*.
- **Mudança:**
  - `ResultadoFerias.irrf` é sempre preenchido: rendimento tributável,
    deduções (INSS e dependentes, ou simplificado), base, alíquota, parcela a
    deduzir, imposto pela tabela, redutor de 2026, dispensa até R$ 10,00 e
    IRRF devido.
  - Sem retenção, o motivo vai para o aviso do recibo: faixa isenta, zerado
    pelo redutor ou abaixo do mínimo.
  - O recibo mostra o quadro "IRRF sobre férias". Na lista, o IRRF aparece
    como R$ 0,00, com o motivo no título da célula, e não mais como "—".
- **Também pedido (não feito ainda):** enviar o recibo de férias e a guia ou
  DARF ao cliente por e-mail ou WhatsApp com convite de agenda (vencimento).
  O envio fica na Central de Comunicação do CFI (templates e agendamentos).
  Proposta enviada ao Paulo, aguardando a decisão.

## 07/10/2026 — S-2230 gerado pelo Consultor e retorno visual do evento

- **Paulo** (print do portal do eSocial, José Venancio: "Nenhum registro
  encontrado" em Afastamento Temporário): *"não consta o envio das férias
  calculadas; devemos criar um visual para os colaboradores que tenha um
  retorno visual do evento"*. O IOB mostrava "Status eSocial: S-2230 · Não
  Gerado".
- **Antes:** o DP só gerava o S-1299 e o S-1298. O S-2230 só ia como XML
  pronto na tela de transmissão.
- **Mudança:**
  - `gerarS2230` (leiaute S-1.3, sem assinatura; o CFI assina com o A1 do
    cofre):
    - vai no mesmo evento: início, término (quando conhecido), motivo,
      infoMesmoMtv, tpAcidTransito e observação (fora das férias);
    - férias (motivo 15) levam o perAquis, obrigatório para CLT desde
      19/07/2021;
    - conferido no XSD oficial com xmllint: válido, só falta a assinatura.
  - O lote registra em `esocial_envios` a ligação de cada evento ao
    afastamento (`ref`). As regras não mudam.
  - `statusS2230`: Não enviado, Enviado pelo IOB (recibo importado),
    Enviado · aguardando retorno, Aceito (recibo) ou Rejeitado (ocorrências).
    Vale o envio mais recente e o histórico de protocolos fica guardado.
  - Componente **StatusEsocialAfastamento**:
    - selo colorido;
    - recibo ou ocorrências;
    - "Transmitir S-2230" (ambiente, certificado e confirmação de produção);
    - "Consultar retorno";
    - "Histórico de protocolos".
  - Onde aparece:
    - no recibo de férias gravado (Cálculo › Férias);
    - na coluna "eSocial (S-2230)" de Cadastros › Afastamentos;
    - no afastamento aberto para edição.
- **Revisão do Codex (#91, P2):** o PDF do recibo saía sem o IRRF quando o
  imposto zerava, porque o desconto zerado não vira verba. Corrigido:
  `linhasIrrfFerias` imprime no PDF a conta do IRRF e o motivo da não
  retenção, e a declaração e a assinatura descem quando precisa.

## 07/10/2026 — "Baixar convite de agenda" no recibo de férias

- **Paulo:** pediu que o envio ao cliente (e-mail ou WhatsApp) leve um convite
  com as datas de vencimento que entre na agenda. Escolheu começar pelo botão
  de baixar o convite (*"pode seguir com o botão baixar envio da agenda"*).
  O envio pela Central de Comunicação do CFI fica para depois.
- **Mudança:**
  - `services/agenda/convite.ts`:
    - `.ics` (RFC 5545) com eventos de dia inteiro, texto escapado, linhas
      dobradas em 75 octetos sem partir acento e lembrete na véspera às 9h;
    - link "adicionar ao Google Agenda" por evento;
    - texto pronto para o WhatsApp;
    - `eventosDoReciboFerias`, com os eventos:
      - pagamento até 2 dias antes do gozo (CLT art. 145), antecipado para
        dia útil;
      - período de gozo;
      - DARF da DCTFWeb de cada competência com o INSS das férias, e com o
        IRRF na competência do pagamento, quando houver;
      - FGTS Digital da competência.
    - Datas das guias pelas regras de `vencimentosDaCompetencia` (o mesmo
      painel de Prazos).
  - O recibo de férias (gravado ou programado) ganha o quadro **"Agenda do
    cliente"**, com:
    - "Baixar convite de agenda (.ics)";
    - "Copiar texto para WhatsApp";
    - a lista dos eventos com o link do Google Agenda.
  - Caso do José: pagamento em 06/11/2026 (07/11 é sábado), férias de 09/11 a
    28/11, DARF da DCTFWeb 11/2026 e FGTS Digital em 18/12/2026 (20/12 é
    domingo).
- **Observação:** o motor ainda mostra "pagar até 07/11/2026" sem antecipar o
  fim de semana. Só o convite antecipa. Fica para alinhar.

## 07/10/2026 — Arquivo Bancário (remessa CNAB 240 de salários)

- **Paulo:** *"vamos trabalhar na criação do modal 'Arquivo Bancário', como já
  existente na SAGE; ele deve conter os dados necessários conforme layout do
  banco cadastrado na empresa e conforme tabela disponível na FEBRABAN; o
  arquivo também fará parte do pacote de arquivos enviados aos clientes para
  importação no banco correspondente"*.
- **Respostas do Paulo:**
  - bancos: Itaú (341), Bradesco (237), Santander (033) e BB (001);
  - formas: conta corrente/salário, TED, PIX e poupança;
  - folhas: mensal, férias, 13º e rescisão;
  - vai mandar um arquivo de remessa da SAGE por banco, para conferir
    posição a posição.
- **Fontes:** padrão FEBRABAN 240 (v10.11) e o manual CNAB 240 Pagamentos do
  Banco Inter (v1.9, que segue o padrão). Os manuais da FEBRABAN e dos quatro
  bancos não abriram daqui (bloqueados pelo proxy).
- **Mudança:**
  - `services/bancario/cnab240.ts`: remessa de pagamento de salários
    (serviço 30), com header de arquivo, um lote por forma, segmentos A e B
    por funcionário, trailers e linhas de 240 posições com CRLF.
    - **Formas:** 01 crédito em conta no banco da empresa, 05 poupança, 41
      TED (câmara 018, finalidade e CC/PP) e 45 PIX (câmara 009; o segmento B
      leva a forma de iniciação e a chave: telefone, e-mail, CPF ou
      aleatória).
    - **Classificação:** mesmo banco → crédito; outro banco → TED; sem conta
      e com chave → PIX; opção de preferir PIX.
    - **Fora do arquivo, com o motivo:** sem dados bancários, conta sem
      dígito, chave PIX inválida, CPF inválido ou sem líquido.
    - **`PERFIS_BANCO`:** guarda o que varia entre os bancos (versões 107/046,
      densidade, finalidade da TED 00004). Fica `conferido: false` até a
      comparação com a SAGE. O Itaú (SISPAG) tem posições próprias.
  - Contas da empresa em `empresas.contasPagamento`: banco, agência, conta
    com dígito, convênio, próximo NSA e endereço opcional. A função é
    `salvarContasPagamento`, e as regras atuais já permitem a gravação.
  - Modal **Arquivo Bancário** no Cálculo, botão "Arquivo bancário" ao lado
    de "Holerites (PDF)":
    - cadastra e edita a conta;
    - data de pagamento sugerida: 5º dia útil na mensal, 30/11 e 20/12 no
      13º, data de cada recibo nas férias;
    - prévia por forma e lista de quem fica de fora;
    - "Gerar arquivo (.REM)", que avança o NSA;
    - aviso de layout ainda não conferido com a SAGE.
  - Carga do IOB: o dígito da conta e da agência (`dvcc`/`dvag`) entra junto
    ("55555-0"). A conta gravada sem dígito por carga anterior é completada,
    menos a digitada à mão.
- **Pendente:**
  - conferir com os arquivos da SAGE (versões, convênio do BB, finalidade da
    TED, SISPAG do Itaú) e marcar `conferido`;
  - incluir o .REM no pacote de arquivos do cliente.

## 07/10/2026 — Itaú SISPAG conferido com a SAGE e pacote do cliente

- **Paulo** enviou o arquivo do Itaú gerado pela SAGE (ITAU_10.TXT) e pediu:
  *"pode seguir com pacote de arquivos do cliente, tbm arquivo bancario"*.
  O arquivo dele tem nome, CPF e conta reais. Foi analisado só na sessão e
  **não vai para o repositório**. Os testes usam dados fictícios.
- **Feito:**
  - **Itaú SISPAG** (`services/bancario/cnab240.ts`, `layout: 'sispag'`).
    Gerado com os mesmos dados, o arquivo ficou **idêntico byte a byte** ao da
    SAGE (crédito em conta Itaú, 5 registros). Diferenças em relação ao
    FEBRABAN:
    - **Header de arquivo:** versão 080, sem convênio e sem NSA.
    - **Header de lote:** versão 040, finalidade "01" e CEP com 8 dígitos.
    - **Agência e conta:** agência (5), branco, conta (12), branco, DAC.
    - **Segmento A:** moeda "REA"; "seu número" é o código IOB com zeros à
      esquerda; CPF nas posições 204-217.
    - **Segmento B:** não vai no crédito em conta, só no PIX.
    - **Trailers:** sem os campos do FEBRABAN.
  - **Conferência por forma:** o campo `conferido` saiu do perfil; no lugar
    entrou `formasConferidas`. No Itaú, só o crédito em conta está conferido.
    A remessa devolve `naoConferidas`, e o modal avisa e pede confirmação
    apenas quando o arquivo tem uma forma não conferida. Bradesco, Santander
    e BB continuam como FEBRABAN não conferido.
  - **Nome do .REM** passou a usar a data local, não a UTC.
  - **`services/bancario/favorecidos.ts`:** reúne quem recebe e o líquido de
    cada um, a partir das fichas. O Arquivo Bancário e o pacote usam o mesmo
    código.
  - **Pacote do cliente:** botão "Pacote do cliente" no Cálculo, com o modal
    `components/pacoteCliente/PacoteClienteModal.tsx`. Gera um .zip com:
    - `LEIA-ME.txt`: o que é cada arquivo; como importar o .REM no banco;
      total por forma e data do crédito; aviso de homologação; quem pagar por
      fora; lista da agenda;
    - holerites, recibos ou TRCT (PDF);
    - resumo da folha (PDF);
    - arquivo bancário (.REM), com a mesma conta e numeração do "Arquivo
      bancário", avançando o NSA;
    - `agenda-<código>-<folha>.ics`.
    Cada item pode ser desmarcado. O modal mostra a prévia da agenda, com
    "Copiar texto para WhatsApp".
  - **Eventos da agenda por folha** (`services/pacoteCliente/pacote.ts`,
    `eventosDaFolha`):
    - **Mensal:** salário na data do arquivo; DARF do INSS da competência;
      IRRF no DARF do mês do pagamento (regime de caixa; vai junto quando é o
      mesmo mês); FGTS.
    - **13º:** 1ª parcela com o FGTS de novembro; 2ª com o DARF do 13º, o
      IRRF de dezembro e o FGTS de dezembro.
    - **Rescisão:** pagamento e FGTS rescisório por funcionário, no dia útil
      até o prazo, e o DARF da competência.
    - **Férias:** eventos de cada recibo (`eventosDoReciboFerias`).
- **Pendente:**
  - conferir as outras formas do Itaú (poupança, TED, PIX) quando houver
    arquivo da SAGE;
  - conferir Bradesco, Santander e BB com os arquivos da SAGE.

## 07/10/2026 — FGTS rescisório sem multa e "pagar até" em dia útil

- **Paulo:** *"bradesco e demais bancos vamos deixar p depois, vamos seguir"*.
  A conferência do Bradesco, do Santander e do BB fica para quando vierem os
  arquivos da SAGE.
- **Revisão do Codex (#93, P1):** no pacote do cliente, o lembrete do FGTS
  rescisório só saía quando havia multa. No pedido de demissão e no fim de
  contrato, o FGTS do mês da rescisão também vai por guia. Corrigido: o
  evento sai sempre que há FGTS, e a multa só aparece quando existe.
- **Revisão do Codex (#94, P1):** a guia rescisória do FGTS Digital só
  existe nos motivos com saque (02, 03, 06 e 33, em `PERMITE_SAQUE_FGTS` do
  motor de rescisão). Pedido de demissão, justa causa e término antecipado
  pelo empregado não têm guia rescisória. O FGTS do mês dessas rescisões vai
  na guia mensal, com vencimento no dia 20 (FAQ do FGTS Digital 04.04), e é
  isso que o lembrete da agenda mostra agora.
- **Pendência fechada do convite de agenda:** o recibo de férias e a rescisão
  na tela agora mostram o "pagar até" já no dia útil anterior, com a data
  original entre parênteses, por exemplo "27/06/2025 (29/06/2025 não é dia
  útil)". A data é a mesma do arquivo bancário e da agenda. O motor continua
  guardando o prazo legal.

## 07/10/2026 — Envio do pacote pelo próprio app e e-mail verificado para o CFI

- **Paulo:** *"pode seguir com o envio do pacote! mas porque usar o
  consultor? porque cada módulo não usa um túnel para acesso mas envia do
  seu próprio app"*.
- **Decisão:** o envio sai do próprio Consultor DP, sem passar pela Central
  de Comunicação do CFI.
  - O DP é um site estático. Senha de e-mail ou token de WhatsApp não podem
    ficar nele, porque tudo o que está no navegador é público. Por isso o
    envio usa o WhatsApp e o e-mail de quem está usando o app.
  - Um envio automático pelo número ou e-mail oficial do escritório
    precisaria de um servidor com essas credenciais: uma Cloud Function do
    DP ou a Central do CFI. Fica para quando houver necessidade.
- **Feito (pacote do cliente):**
  - O pacote é montado uma vez e o número do arquivo bancário avança só uma
    vez. Depois aparece **"Enviar ao cliente"**, com:
    - contato no cliente (nome, e-mail e WhatsApp), que pode ser gravado na
      empresa (`empresas.contatoEnvio`, `salvarContatoEnvio`);
    - mensagem pronta e editável: o que vai no pacote, total e data do
      crédito do arquivo bancário, quem pagar por fora e as datas da agenda;
    - **"Compartilhar com o .zip"**: o compartilhamento do aparelho ou do
      navegador, que já anexa o arquivo. Só aparece onde o navegador permite
      compartilhar arquivo;
    - **"Abrir WhatsApp"** (wa.me) e **"Abrir e-mail"** (mailto), com a
      mensagem preenchida. O .zip baixado é anexado à mão;
    - "Copiar mensagem", "Baixar o .zip de novo" e "Refazer pacote" (este
      avisa que gera um novo arquivo bancário).
  - `services/pacoteCliente/envio.ts`: `numeroWhatsApp` (DDI 55),
    `emailValido`, `mensagemEnvio`, `linkWhatsApp`, `linkEmail`.
- **Paulo (com prints):** *"ajuste para acesso válido com referência ao
  certificado digital"*. A Juliana (gestora) recebia "Token inválido: Email
  não verificado" na transmissão do S-2230 e "O cofre recusou o acesso" na
  aba Certificados.
  - **Causa:** o CFI só aceita token com e-mail verificado, e a conta dela
    no Firebase do DP não estava verificada. Só o e-mail master tinha o
    aviso para verificar.
  - **Correção:**
    - **Aviso para qualquer usuário sem verificação:** "Verificar meu
      e-mail" (`VerificarEmail`) no topo da tela, com "Enviar link de
      verificação" e "Já verifiquei".
    - **`services/auth/tokenCfi.ts`:** `tokenParaCfi` recarrega a conta e
      renova o token quando o e-mail acabou de ser verificado, porque o
      "verificado" só entra num token novo. `comTokenCfi` tenta de novo uma
      vez com token novo; sem verificação, troca o erro pela orientação.
    - **Onde é usado:** SERPRO e transmissão do eSocial (`callFiscal`),
      cofre de certificados e conferência do cadastro central.
  - **O que a Juliana precisa fazer:** clicar em "Enviar link de
    verificação", abrir o e-mail, clicar no link e voltar em "Já
    verifiquei". O CFI não foi alterado: a exigência de e-mail verificado
    continua.

## 07/10/2026 — Conferência do motor com o eSocial do IOB (critério da Fase 3)

- **Paulo:** *"pode seguir com a conferência de cálculo IOB"*.
- **Decisão:** a fonte do IOB é o **S-1200** que ele transmitiu ao eSocial,
  não o PDF do holerite.
  - O S-1200 traz as rubricas e os valores de cada trabalhador no mês. O
    tipo (provento, desconto ou informativa) e a natureza de cada rubrica
    vêm do S-1010.
  - É o padrão do eSocial e dispensa leitura por IA. Vale para o .zip do
    eSocial › Download de eventos e para XMLs soltos.
  - Confere várias competências de uma vez, que é o critério da Fase 3:
    diferença zero contra o IOB por 3 competências seguidas.
  - A conferência pelos holerites em PDF (Gemini) continua disponível.
- **Feito:**
  - **`services/conferencia/conferenciaMotorIob.ts`:**
    - `lerS1200Xml`: lê só os S-1200 mensais, do empregador e de produção.
      Recusados ficam fora. Remuneração de períodos anteriores
      (`infoPerAnt`) fica fora, com observação.
    - `ultimaRemuneracao`: quando há retificador ou mais de um
      processamento, vale o último.
    - `lerEsocialIob` lê .xml e .zip com S-1200, S-1010, S-5001 e S-5003.
    - `rubricasParaConferencia` usa as rubricas gravadas em Cadastros ›
      Incidências, completadas pelas do arquivo.
    - `conferirMotorComIob` confere por competência e funcionário. Liga
      pelo CPF e, sem ele, pela matrícula. Itens comparados:
      - proventos, descontos e líquido, pelo tipo da rubrica;
      - salário (natureza 1000), INSS (9201), IRRF (9203) e salário-família
        (1409);
      - INSS descontado do S-5001 e base e depósito do FGTS do S-5003,
        quando esses eventos vêm no arquivo.
    - **Pendências por funcionário:** S-1200 sem ficha, motor sem S-1200,
      cálculo incompleto e rubrica sem S-1010. Mês com férias é comparado
      normalmente, com observação.
    - Uma competência só conta como sem diferença com tudo conferindo e
      nada pendente. Na sequência, mês que falta no arquivo quebra a
      contagem.
  - **Tela:** aba Cálculo (mensal), botão **"Conferir com o eSocial do IOB"**
    (`components/calculo/ConferenciaEsocialIob.tsx`):
    - quadro do critério ("atingido" ou "ainda não"), com a maior
      sequência;
    - tabela por competência;
    - por funcionário: itens motor × IOB e as rubricas do IOB no S-1200
      (código, descrição, natureza, tipo, quantidade e valor);
    - Excel com as abas Resumo, Funcionários e Rubricas do IOB.
  - O motor de cada competência usa os movimentos gravados daquele mês, que
    a restauração traz do `holerith`.
- **Para usar na empresa piloto:**
  1. eSocial › Download de eventos: empregador S-1200 dos meses, tabelas
     S-1010 e, se quiser, trabalhador S-5001 e S-5003.
  2. Cálculo › mensal › "Conferir com o eSocial do IOB" e escolher o .zip.
- **Limite conhecido:** o motor usa o salário atual da ficha. Em meses
  antes de um reajuste, o item "Salário" diverge. Por isso a conferência
  vale mais para os meses recentes.

## 07/10/2026 — Revisão do Codex no #96 e envio do link de verificação

- **Revisão do Codex (#96), corrigida antes do merge:**
  - **P1:** funcionário sem S-1200 e com cálculo em erro sumia da lista.
    Agora fica pendente ("cálculo incompleto ou com erro"), e a competência
    não conta como sem diferença.
  - **P1:** em mês com férias, o INSS e o IRRF retidos no recibo
    (`INSSFERRET`, `IRRFFERRET`) passam a entrar no total comparado com o
    S-1200 e com o S-5001.
  - **P2:** o S-5001 deixa de somar o CR 160601 (eConsignado).
    `CR_NAO_INSS` agora é exportado da conferência pós-folha.
  - **P2:** S-5001/S-5003 repetido (original e retificador): vale o que tem
    `nrRecArqBase` igual ao recibo do S-1200 usado. Sem essa ligação, o item
    não é somado e a linha fica pendente ("S-5001/S-5003 repetido").
  - **P2:** o S-1200 é ligado a todas as fichas do mesmo CPF (contratos
    simultâneos ou readmissão), e os resultados do motor são somados, com
    observação.
- **Paulo (print da Juliana):** *"existe um erro de validação nos e-mails"*.
  - **O que o print mostrava:** "Muitos envios seguidos". É o bloqueio do
    Firebase (`auth/too-many-requests`) quando o link é pedido várias vezes
    seguidas, em geral porque o e-mail não aparece na caixa de entrada.
  - **Mudança no aviso de verificação (`VerificarEmail`):**
    - o e-mail sai em português (`auth.languageCode = 'pt-BR'`);
    - depois de um envio, o botão espera 2 minutos ("Novo envio em N min"),
      mesmo recarregando a tela (guardado no navegador);
    - depois do bloqueio do Firebase, espera 15 minutos e explica que o
      link já enviado continua valendo;
    - mostra o remetente (`noreply@<projeto>.firebaseapp.com`) e orienta a
      procurar no lixo eletrônico e nas abas Outros/Promoções;
    - "Já verifiquei" continua sempre disponível.
  - **Fora do código:** se o e-mail do escritório bloquear o remetente do
    Firebase, dá para liberar `noreply@consultor-dp-folha.firebaseapp.com`
    no servidor de e-mail ou configurar domínio próprio nos modelos de
    e-mail do Firebase Authentication (console).

## 07/10/2026 — S-1200 e S-1210 gerados pelo Consultor (Fase 4)

- **Paulo:** *"pode seguir com o S-1200 e S-1210"*.
- **Feito:**
  - **`services/esocial/eventosFolha.ts`** gera o S-1200 (remuneração) e o
    S-1210 (pagamento) da folha mensal do motor, no leiaute S-1.3 e sem
    assinatura: o CFI assina com o A1 do cofre e transmite, como no S-2230.
    - **XSD:** conferido com o `evtRemun.xsd` e o `evtPgtos.xsd`. O
      xmllint só acusa a falta da assinatura.
    - **Eventos por trabalhador:** um S-1200 e um S-1210 por CPF, com um
      demonstrativo (`ideDmDev = FOLHAAAAAMM-matrícula`) por contrato.
    - **S-1200:**
      - estabelecimento (CNPJ), lotação (S-1020), matrícula e categoria da
        ficha;
      - itens agrupados por rubrica, com a quantidade (horas ou dias, pela
        referência) e o valor.
    - **S-1210:**
      - vai no mês da data do pagamento: `tpPgto` 1, `perRef` = competência,
        mesmo `ideDmDev` do S-1200 e o líquido;
      - quando o motor deduziu dependentes no IRRF (e não usou o desconto
        simplificado), leva `infoIRComplem/infoIRCR` (CR 056107) com
        `dedDepen` de cada dependente com CPF;
      - pensão alimentícia gera aviso, porque o CPF do alimentando (`penAlim`)
        não está na ficha.
    - **Sem evento, com o motivo:** cálculo incompleto, sem matrícula, sem
      categoria, verba sem rubrica, rubrica sem S-1010 vigente, tipo
      trocado (provento × desconto) e líquido negativo.
    - **Envio:** lotes de 50 eventos.
  - **De/para das verbas com as rubricas do S-1010:**
    - **Sugestão:** pela natureza (Tabela 03) e pelo tipo. Exemplos:
      salário 1000; horas extras 1003, separando 50% e 100% pela descrição;
      DSR 1002; faltas 9207; INSS 9201; IRRF 9203; salário-família 1409;
      pensão 9213; salário-maternidade 4050. Lançamento avulso é sugerido
      pela descrição igual.
    - **Gravação:** fica na empresa (`empresas.esocialFolha`), junto com o
      CNPJ do estabelecimento e o código da lotação
      (`salvarParametrosEsocialFolha`).
  - **Motor mensal:** passa a registrar como deduziu o IRRF
    (`deducoesIrrf`: simplificado ou não, dependentes, valor por dependente
    e pensão).
  - **Tela:** Cálculo (mensal) › **"S-1200 e S-1210"** (`EventosFolhaModal`):
    - parâmetros e data do pagamento (padrão: 5º dia útil);
    - de/para com a marca "sugerida";
    - pendências por trabalhador;
    - "Baixar XMLs (.zip)";
    - "Transmitir S-1200" e "Transmitir S-1210" pelo CFI.
    - **Antes de transmitir:**
      - o padrão é a produção restrita; produção pede confirmação;
      - o de/para precisa estar gravado.
    - **Depois do envio:** cada lote fica em `esocial_envios`, com o
      resultado em eSocial › Transmissão. A tela lembra de transmitir o
      S-1210 depois que o S-1200 for aceito.
- **Atenção na piloto:**
  - comece pela produção restrita;
  - em produção, se o IOB já transmitiu a competência, o S-1200 repetido é
    recusado; retificação (`indRetif` 2) ainda não está no gerador.

## 07/10/2026 — MiA, a agente de IA do DP

- **Paulo:** *"vamos também implementar nossa agente de IA dentro do app
  (digo agente mulher), porque este depto é composto só de mulheres"*. O nome
  escolhido foi **MiA**.
- **Funções da MiA:**
  - legislação trabalhista e previdenciária;
  - dúvidas de legislação;
  - explicar o cálculo;
  - explicar as divergências com o IOB;
  - guiar pelo app.
- **Desenho:**
  - A MiA roda no CFI (Gemini da conta do escritório, com a busca do Google
    ligada para citar a base legal e as fontes), pelo túnel
    `POST /api/dp-integration/assistente/mia`.
  - Mantém a regra da casa: a MiA explica, e o motor (código) calcula. Ela
    não refaz a folha, não grava, não transmite e não altera nada.
- **Feito no DP:**
  - **`services/mia/mia.ts`:**
    - mapa do app (`GUIA_DO_APP`);
    - holerite como contexto (`contextoDoHolerite`, sem CPF);
    - contexto da tela em camadas (`definirContextoMia`): vale o publicado
      por último;
    - pedido ao CFI com as últimas 20 mensagens.
  - **`components/mia/MiaAssistente.tsx`:** botão flutuante "MiA" em todas
    as abas. O painel tem:
    - sugestões de pergunta;
    - respostas com negrito e as fontes;
    - "Usar a tela aberta" (marcado por padrão);
    - "Nova conversa".
    A conversa fica só na aba do navegador. Antes de a rota estar publicada
    no CFI (404), a MiA avisa que ainda não está no ar.
  - **O que vai como contexto:**
    - **Cálculo:** a lista da folha, ou o holerite aberto com as verbas, os
      totais, a memória e os avisos;
    - **Conferência com o eSocial do IOB:** a linha aberta, com os itens
      motor × IOB, as rubricas e as observações.
- **No CFI** (branch `claude/dp-assistente-mia`, aguardando o OK do Paulo
  para commit, PR e deploy, pela regra do CFI):
  - `sefaz-backend/dp-assistente-mia.js`: instrução da MiA, validação da
    conversa (até 20 mensagens de 4.000 caracteres e contexto de 24.000) e
    leitura das fontes;
  - a rota no `dp-integration-routes.js`;
  - a declaração em `rotaTemChamada`;
  - os testes;
  - a nota no histórico do CFI.
  - **Portas:** build, lint, lint:strict e jest (636 suítes, 9.259 testes)
    passando.
- **Revisão do Codex no #97 (S-1200/S-1210, já mergeado), corrigida no #98:**
  - **P1:** o botão "S-1200 e S-1210" fica desligado enquanto houver
    movimento não salvo. O evento sai do movimento gravado.
  - **P2:** o desconto só aceita rubrica de desconto (`tpRubr` 2). Rubrica
    informativa (3 ou 4) é recusada, com o tipo no motivo.
  - **P2:** o `ideDmDev` não se repete entre contratos do mesmo CPF.
    Matrículas longas que coincidem no início ganham sufixo, sempre com até
    30 caracteres.
- **Revisão do Codex no #98 (MiA):**
  - **P2:** a tela guarda a conversa inteira, e o pedido ao CFI leva só as
    últimas trocas, começando sempre por uma pergunta. Antes, depois de 10
    trocas, a conversa começava por uma resposta solta.
  - **P2:** "Nova conversa" com resposta a caminho: a resposta antiga é
    descartada (número da conversa) e o "pensando" some.
- **Revisão do Codex no PR da MiA no CFI (#1388):**
  - **Conversa alternada:** o CFI passa a exigir turnos alternados,
    começando pela usuária. O Consultor DP junta numa só as perguntas
    seguidas (por exemplo, a repetida depois de um erro) antes de enviar.
  - **Transparência:** o aviso do painel e a instrução da MiA dizem que a
    pergunta e a tela vão ao Gemini (Google), pela conta do escritório, só
    para responder, e que ela não grava nem transmite nada no sistema.

## 07/10/2026 — Retificação do S-1200 e do S-1210

- **Paulo:** *"pode seguir com a retificação do S-1200"*.
- **Feito:**
  - **`services/esocial/recibosEsocial.ts`:** lê os recibos dos S-1200 e
    S-1210 aceitos.
    - **Origens:**
      - download do eSocial (o que o IOB transmitiu), no envelope
        `retornoEventoCompleto` com cdResposta 201/202;
      - envios do próprio Consultor em produção (`esocial_envios`, depois da
        consulta).
    - **Do S-1200:** guarda o `ideDmDev` de cada matrícula.
    - **Recibo que vale:** `recibosVigentes` escolhe o processado por último
      e mantém o demonstrativo do original do IOB, mesmo quando o último
      recibo é do Consultor.
  - **`gerarEventosFolha`:** com `retificacao`, quem tem recibo vai com
    `indRetif` 2 e `nrRecibo`, na ordem do XSD (conferido com o xmllint). O
    retificador repete o `ideDmDev` do original, porque o S-1210 aponta para
    ele.
    - **Avisos:** quando o original tem demonstrativo que o cálculo não gera
      (por exemplo, férias ou outro contrato, que a retificação retira) e
      quando a matrícula não estava no original.
  - **Tela "S-1200 e S-1210"**, seção "Eventos já aceitos no eSocial":
    - **Recibos:** os envios do Consultor entram sozinhos; o .zip do
      download (S-1200 da competência e S-1210 do mês do pagamento) se
      escolhe na tela.
    - **Lista:** quem vai como retificação e com qual recibo.
    - **Só em produção:** na produção restrita vai sempre como original.
    - **Lembrete:** reabrir com o S-1298 se a competência já foi fechada.
- **Paulo:** não achava o botão "Pacote do cliente" (ele fica na barra do
  topo do Cálculo). Ganhou um atalho no recibo de férias, ao lado da agenda
  do cliente.
- **Revisão do Codex no PR #100 (dois P1):**
  - **O problema:**
    - o S-1210 é um só por trabalhador e mês, e retificá-lo só com o
      pagamento desta folha apagaria os outros pagamentos e o IR do mês;
    - o eSocial recusa retificar o S-1200 enquanto um S-1210 aponta para o
      demonstrativo dele.
  - **Fluxo em 3 etapas (produção):**
    1. **Excluir o S-1210 aceito** do mês do pagamento (S-3000, com o
       `nrRecEvt`, o CPF e o `perApur`). Antes do envio, a tela baixa uma
       cópia dos S-1210 excluídos, que pode ser carregada de volta se a tela
       for fechada antes da etapa 3.
    2. **S-1200 retificador** (`indRetif` 2, recibo e demonstrativo do
       original).
    3. **S-1210 como original**, com todos os pagamentos do mês:
       - os do S-1210 baixado que não são desta folha (copiados como
         estavam, inclusive pagamento ao exterior);
       - os desta folha;
       - as informações de IR (`infoIRComplem`) do S-1210 aceito, como
         estavam; sem elas, as deduções do cálculo.
  - **Ordem na tela:**
    - os botões ficam "1. Excluir S-1210 aceito", "2. Transmitir S-1200" e
      "3. Transmitir S-1210";
    - o 2 e o 3 só liberam depois que a exclusão for aceita;
    - o botão "Consultar resultado" consulta os lotes da própria tela e
      relê os recibos e as exclusões.
  - **Exclusões aceitas:** gravadas no envio com a referência
    `exclui:<recibo>`. `recibosVigentes` marca o S-1210 excluído
    (`excluidoEm`), junta o mesmo recibo vindo do download e dos envios, e
    usa o conteúdo do último S-1210 baixado quando o vigente é um reenvio do
    Consultor.
  - **Bloqueios (sem evento, com o motivo):**
    - S-1210 aceito sem o conteúdo (falta o download);
    - pagamento de um demonstrativo que a retificação do S-1200 retira.
  - **Aviso:** S-1200 retificado sem nenhum S-1210 carregado.
  - **Conferência:** S-3000, S-1200 e S-1210 validados no `evtExclusao.xsd`,
    no `evtRemun.xsd` e no `evtPgtos.xsd` (só falta a assinatura, que é do
    CFI). Testes: 86 arquivos, 652 testes.

## 07/10/2026 — CPF do alimentando (penAlim) no S-1210

- **Paulo:** *"pode seguir com o CPF do alimentado do S-1210"*.
- **Regra do leiaute S-1.3:**
  - o grupo `penAlim` (tpRend, cpfDep, vlrDedPenAlim) é obrigatório
    quando o pagamento tem rubrica de pensão (codIncIRRF 51 a 54);
  - o `cpfDep` precisa ser de um dependente cadastrado no S-2200/S-2205
    ou estar no grupo `infoDep` do próprio S-1210.
- **Ficha (Cadastros › Funcionários › Dependentes):** três colunas novas.
  - **Pensão:** marca o alimentando.
  - **Cota %:** divide a pensão do mês quando há mais de um alimentando;
    as cotas precisam somar 100%.
  - **No eSocial:** diz se o dependente está no S-2200/S-2205. Em branco,
    vale a origem dos dependentes da ficha: vindos do XML do eSocial, sim.
    Ao gravar, a marca fica explícita, porque a origem passa a "Manual".
- **Validação da ficha:**
  - o alimentando precisa ter CPF, diferente do CPF do trabalhador;
  - a mesma pessoa não pode ser deduzida no IRRF como dependente e como
    alimentando;
  - cota entre 0 e 100.
- **Histórico da ficha:** a marca de pensão entra no histórico. Com isso,
  a reimportação do eSocial preserva a marca, porque os dependentes
  editados ficam com origem "Manual".
- **S-1210 (`gerarEventosFolha`):**
  - a pensão de cada contrato (verba PENSAO) é dividida pelos alimentandos
    (`ratearPensao`; os centavos do arredondamento vão para o último) e vai
    num `penAlim` por CPF, inclusive com o desconto simplificado;
  - os dependentes do IRRF continuam só quando o motor usou as deduções
    legais, agora sem repetir o CPF quando há dois contratos;
  - quem não está no eSocial vai no `infoDep`: CPF, nascimento, nome e,
    se for dependente do IRRF, `depIRRF` e `tpDep`;
  - **bloqueios:** pensão sem alimentando marcado; cota errada; dependente
    do IRRF fora do eSocial sem tipo ou com tipo 99.
- **MiA:** o guia do app diz onde marcar o alimentando.
- **Conferência:** S-1210 com dedDepen, dois penAlim e infoDep validado no
  `evtPgtos.xsd` (só falta a assinatura, que é do CFI). Testes: 86 arquivos,
  655 testes.

## 07/10/2026 — Histórico de salário pelos S-2200/S-2206

- **Paulo:** *"pode seguir com o histórico do salário do S-2206"*. O
  objetivo é tirar o limite da conferência com o IOB: o motor usava o
  salário atual da ficha, e os meses anteriores a um reajuste divergiam no
  item "Salário".
- **Ficha (`historicoSalario`):**
  - uma faixa por S-2200/S-2206 aceito: data da admissão ou da alteração
    (`dtAlteracao`), `vrSalFx`, unidade e o recibo;
  - o mesmo valor seguido vira uma faixa só;
  - montado em `fichaDoEsocial` (`historicoDosEventos`) a partir dos eventos
    já consolidados, inclusive com retificações e exclusões aplicadas;
  - na reimportação (inclusive na restauração do SAGE), o histórico novo
    substitui o anterior e conta como alteração, para a ficha já gravada
    receber o histórico;
  - gravado no Firestore junto com a ficha;
  - aparece só para leitura na aba "Ident. Adm." da ficha.
- **Motor mensal (`fichaNaCompetencia`):**
  - em competência anterior à última faixa, usa o salário (e a unidade)
    vigente no fim do mês, com uma linha na memória de cálculo;
  - da última faixa em diante, vale o salário atual da ficha, que pode ter
    sido corrigido à mão;
  - reajuste no meio do mês gera aviso: o motor usa o vigente no fim do mês,
    e o IOB pode ter pago proporcional.
- **Fora desta etapa:** férias, 13º e rescisão continuam com o salário atual
  da ficha.
- **Para valer na empresa piloto:** rodar de novo a restauração do SAGE, ou a
  importação do eSocial em Cadastros, para as fichas receberem o histórico.
- **Testes:** 86 arquivos, 658 testes.
- **Revisão do Codex no PR #102 (dois P1 e um P2):**
  - **Horas semanais da época:** cada faixa guarda também as horas
    semanais, e uma mudança só de horas abre uma faixa nova. As horas são o
    divisor do salário-hora e das horas extras, e o motor usa as da
    competência.
  - **Unidade e horas:** a faixa sem unidade ou sem horas não herda as de
    um contrato posterior; o campo sai e o motor usa o padrão, com aviso.
    Se o histórico nunca trouxe o campo, ficam os da ficha.
  - **Diferença do histórico:** a comparação inclui a unidade e as horas.
    Com isso, a correção só da unidade numa reimportação também é gravada.

## 07/10/2026 — Histórico de salário pela tabela de salários do SAGE

- **Paulo:** *"pode seguir com a tabela de salários da SAGE"*.
- **Segunda fonte do histórico** (`historicoSalarialSage`, em
  `cargaBackupIob.ts`):
  - **`rsalfunc`:** cada alteração de salário com data;
  - **`salarios`:** sem reajuste no `rsalfunc`, o salário mês a mês
    (`anomes`, a faixa começa no dia 1). Entra só o evento (`codeven`) do
    salário atual e até o registro marcado em `ultimo`;
  - o mesmo valor seguido vira uma faixa só, e só volta quem tem pelo menos
    duas faixas;
  - a origem de cada faixa fica como "IOB: rsalfunc · data" ou
    "IOB: salarios · MM/AAAA".
- **Quando entra:** só quando o histórico do eSocial (S-2200/S-2206) não
  traz nenhum reajuste. O transmitido vale mais que o guardado no SAGE.
- **Onde entra:**
  - na restauração do SAGE (etapa "Funcionários");
  - no "Completar pelo backup do IOB", com as tabelas complementares;
  - a ficha recebe o histórico como alteração, e ele é gravado.
- **Reimportação do eSocial:** se o eSocial vier de novo só com a
  admissão, o histórico do SAGE fica. Se vier com reajuste, o do eSocial
  substitui.
- **Ficha:** o quadro "Histórico de salário" mostra a origem de cada faixa.
- **Testes:** 86 arquivos, 661 testes.
- **Revisão do Codex no PR #101, chegou depois do merge (P2), corrigida
  aqui:** a coluna "No eSocial" trocada à mão para "Não" não contava como
  alteração dos dependentes. A origem continuava "eSocial", e uma
  reimportação podia desfazer a marca. Agora a marca "fora do eSocial"
  entra na comparação, e a origem passa a "Manual".

## 07/10/2026 — Histórico de salário nas férias e no 13º

- **Paulo:** *"pode seguir com histórico de salários férias e 13"*.
- **`fichaNaData`** (`funcionarios.ts`): a mesma regra da competência, para
  uma data. Antes da última faixa do histórico, vale o salário da faixa
  vigente, com a unidade e as horas da época; dali em diante, o salário da
  ficha. `fichaNaCompetencia` passa a usá-la com o fim do mês.
- **Férias:** a remuneração é pelo salário da concessão, ou seja, o do
  início do gozo (CLT, art. 142). Isso vale também para o salário-hora da
  média das horas extras.
- **13º:**
  - **2ª parcela:** pelo salário de dezembro (Lei 4.090/1962, art. 1º,
    § 1º);
  - **adiantamento:** pelo salário do mês anterior ao pagamento
    (Lei 4.749/1965, art. 2º);
  - **desconto do adiantamento na 2ª:** fica como foi pago. Com reajuste em
    novembro, o adiantamento sai pelo salário de outubro.
- **Memória de cálculo:** traz uma linha dizendo de qual faixa veio o
  salário e por quê.
- **Fora desta etapa:** a rescisão continua com o salário atual da ficha,
  que é o vigente no desligamento.
- **Testes:** 86 arquivos, 663 testes.

## 07/10/2026 — Histórico de salário na rescisão

- **Paulo:** *"pode seguir com histórico de salários na rescisão"*.
- **Motor de rescisão:** usa o salário vigente na data do desligamento
  (`fichaNaData`), com a unidade e as horas da época, no saldo de salário,
  no aviso, no 13º, nas férias e na média das horas extras.
  - **Por quê:** um reajuste registrado depois do desligamento (por
    exemplo, um S-2206 de dissídio, ou a simulação de um desligamento
    passado) não entra na rescisão.
  - **Memória de cálculo:** diz de qual faixa veio o salário.
- **Com isso,** o histórico de salário vale na folha, nas férias, no 13º e
  na rescisão.
- **Testes:** 86 arquivos, 664 testes.

## 07/10/2026 — Revisões do Codex nos PRs #103 e #105 (chegaram depois do merge)

- **#103 (P1): importação parcial do eSocial.** Um lote só com um S-2206,
  sem o S-2200, gera histórico de uma faixa. Esse histórico era tratado
  como "só a admissão": o do SAGE ficava, e o salário novo valia para trás.
  - **Critério de reajuste:** agora é ter S-2206 no histórico
    (`temReajusteEsocial`), e não o número de faixas. Vale para a
    reimportação e para a carga do SAGE (`usaHistoricoDoSage`).
  - **Mescla:** o histórico do eSocial entra por cima do anterior a partir
    da primeira data que traz. As faixas anteriores ficam, sejam do SAGE ou
    de uma importação anterior do eSocial.
- **#105 (P2): rescisão.** A ficha com o salário do desligamento levava o
  histórico inteiro para a folha do mês. Um reajuste no próprio mês, depois
  do desligamento, voltava no saldo de salário. Agora `fichaNaData` devolve
  a ficha com o histórico só até a data, e nenhum cálculo feito depois
  avança além dela.
- **#104:** o Codex não fez apontamentos.
- **Testes:** 86 arquivos, 666 testes.

## 08/10/2026 — Auditoria do 1º dia de produção e lote A (eSocial)

- **Paulo:** *"vamos fazer uma auditoria geral do nosso primeiro dia de
  produção: erros, defeitos, ajustes, sugestões"*.
- **Auditoria (PRs #79 a #106):** 28 PRs, cerca de 8.100 linhas.
  - **Codex:** 37 apontamentos, 14 P1. Dos 15 que chegaram depois do merge,
    9 ficaram sem tratamento: #84 (2), #89 (2), #90, #93 (já corrigido pelo
    #94), #95 (2) e #99.
  - **Revisão independente:** mais 15 defeitos.
  - **CI:** só faz o build, sem testes nem verificação de tipos.
  - **Dependências:** 13 vulnerabilidades, 4 críticas, entre elas a do
    `jspdf`.
  - **Proposta:** 4 lotes de correção.
- **Paulo:** *"pode seguir com lote A"*. Feito:
  1. **S-1200: campos obrigatórios pela regra de negócio** (o XSD aceita sem
     eles, por isso o teste do schema passava):
     - `indApurIR` 0 em cada `itensRemun`;
     - `infoAgNocivo/grauExp` para as categorias 1XX, 2XX, 3XX, 731, 734 e
       738. O grau vem do campo novo da ficha "Grau de exposição a agentes
       nocivos" (Tabela 02); em branco, vai 1.
  2. **Férias no mês:** o trabalhador fica sem evento, com o motivo. O
     eSocial pede um demonstrativo próprio de férias, com o pagamento na data
     do recibo, que o Consultor ainda não gera. Esse caso segue pelo IOB.
  3. **Retificação:**
     - o S-1200 original guarda todos os demonstrativos de cada matrícula;
     - com mais de um demonstrativo na matrícula, não gera;
     - um demonstrativo do original que o cálculo não gera vira erro, não
       mais aviso, porque a retificação o apagaria.
  4. **S-1210 excluído com a tela reaberta sem o download:** a referência
     do S-3000 passa a levar o CPF e o mês (`exclui:recibo:cpf:AAAA-MM`). O
     S-1210 excluído volta marcado, sem os pagamentos, e o reenvio fica
     bloqueado até carregar o download ou a cópia.
  5. **Recibo vigente:** os horários passam a ser comparados no mesmo fuso
     (`instante`): o envio do Consultor vem em UTC e o download, na hora de
     Brasília. Entre várias versões vale a mais nova que traz os
     demonstrativos, e não mais a soma delas.
  6. **Conferência com o IOB:** o S-1200 aceito com advertência (202)
     passa a valer.
  7. **S-2230:** a situação é a da produção. O teste na produção restrita
     aparece à parte e não esconde o botão de envio.
- **Conferência:** S-1200 validado no `evtRemun.xsd` (só falta a
  assinatura). Testes: 86 arquivos, 671 testes.
- **Revisão do Codex no PR #107 (P1), corrigida antes do merge:** a marca
  de exclusão reconstruída sem o recibo excluído carregado podia herdar os
  pagamentos de uma versão mais antiga do S-1210 do mesmo mês. Isso furava o
  bloqueio. Agora a marca só recebe pagamentos do próprio recibo excluído.

## 08/10/2026 — Lote B da auditoria (banco e pacote)

- **Paulo:** *"pode seguir com lote B"*.
- **Chave PIX** (`tipoChavePix`): celular sem +55 não vai mais como CPF.
  - **CPF/CNPJ:** só com o dígito verificador certo.
  - **Telefone:** com +55; com máscara, como (11) 98765-4321; ou só com
    dígitos, quando não é CPF válido e tem um DDD que existe.
  - **Ambígua:** onze dígitos que são CPF válido e também parecem celular
    ficam fora do arquivo, com o motivo e o pedido de informar o +55.
  - **No Segmento B:** o celular sem +55 sai com +55.
- **Número do arquivo (NSA):** passa a ser reservado numa transação
  (`reservarNsa`) antes de gerar o arquivo, no Arquivo Bancário e no Pacote
  do cliente.
  - Dois usuários ao mesmo tempo recebem números diferentes.
  - Sem a reserva gravada (permissão ou rede), o arquivo não é baixado.
    Antes era baixado, e o próximo saía com o número repetido.
- **Regra do Firestore (`empresas`):** quem tem a empresa na carteira,
  colaborador incluído, grava só os campos da operação: `contasPagamento`,
  `contatoEnvio` e `esocialFolha`. Os dados cadastrais continuam com o
  gestor, com quem cadastrou e com o admin.
  - Resolve a falha de permissão do colaborador ao gravar o número do
    arquivo, o contato de envio (Codex #95) e o de/para do S-1200.
  - Testado no emulador: 3 testes novos. Eles reprovam a regra antiga e
    passam com a nova, e os 45 testes de regras passam.
  - **Precisa publicar:** `firebase deploy --only firestore:rules --project
    consultor-dp-folha`.
- **Pacote do cliente:** a saudação acompanha o nome do contato (Codex #95),
  e o texto digitado pela equipe é mantido.
- **Convite .ics:** o ponto e vírgula passa a ser escapado (RFC 5545); o
  teste repetia o mesmo erro.
- **Testes:** 86 arquivos, 673 testes.
- **Revisão do Codex no PR #108 (P2):** um CPF com máscara cujos dígitos
  parecem celular (por exemplo, 119.876.543-74) ficava ambíguo. Agora a
  máscara de CPF decide.
- **Paulo:** *"pare de me perguntar se pode mergear! você está no modo
  automático por minha decisão"*. No Consultor DP, o merge passa a ser feito
  sem pedir OK, quando o CI está verde e a revisão do Codex terminou com os
  apontamentos tratados. No CFI continua valendo a aprovação explícita.

## 08/10/2026 — Lote C da auditoria (dados e backup)

- **Férias do backup (`gozosDoHistorico`):** o campo `cstatus` passa a ser
  lido.
  - **Canceladas (C…):** não viram gozo.
  - **Programadas e ainda não pagas:** início no futuro, sem recibo e sem
    situação Q. Não viram gozo; antes bloqueavam o cálculo como se tivessem
    sido gozadas.
  - **Situação desconhecida:** gera um aviso para conferir.
- **Regime do S-1000 por vigência (Codex #84):** a carga do enquadramento
  respeita a troca de regime no meio do período, criando um período novo a
  partir da transição.
  - A classificação tributária é avaliada em cada período, com pendência
    quando falta.
  - Ao voltar para o regime Normal, o FPAS e os terceiros anteriores são
    restaurados (`fonte` da proposta).
- **Férias programadas no Cálculo (Codex #89):** passam pelas mesmas
  validações do cadastro de afastamentos e gravam a origem
  `Manual · e-mail · data (Cálculo › Férias)`.
- **Guarda dos backups:** a data do backup passa a ser a data local. Antes
  era em UTC, e um backup feito depois das 21h ficava com o dia seguinte.
- **Histórico de salário:**
  - **Mescla parcial:** um backup só com S-2206, sem o S-2200, não apaga
    mais as faixas posteriores já gravadas.
  - **Data anterior à primeira faixa:** usa o salário mais antigo conhecido,
    e a memória de cálculo avisa para conferir. Vale para a folha mensal,
    as férias, o 13º e a rescisão.
- **Tabelas oficiais (#90):** a gravação usa id fixo por tipo e vigência
  (`oficial_{tipo}_{vigência}`), numa transação. Assim, dois cliques ou duas
  pessoas ao mesmo tempo não criam duplicata, e quem chega depois vê "Já
  gravadas por outra pessoa".
  - Testado no emulador. Não precisa publicar regra nova.
- **Ficou para conferir com backup real:** o `Math.abs` do estorno no
  holerith. Provavelmente é proposital, então não foi alterado.
- **Testes:** 86 arquivos, 678 testes; 46 testes de regras no emulador.
- **Revisão do Codex no PR #109:**
  - **P1:** com duas trocas de regime e dois períodos do depto_ma, a segunda
    troca copiava o FAP e o FPAS da primeira troca, e não do período
    imediatamente anterior. Agora a lista fica em ordem a cada inclusão.
  - **P2:** o "hoje" das férias programadas era calculado em UTC, então
    depois das 21h férias que começavam no dia seguinte entravam como
    gozadas. Agora usa a data local.
  - Cada correção tem um teste que reprova o código antigo.

## 08/10/2026 — Lote D da auditoria (CI, tipos, segurança e tamanho)

- **CI:** o workflow roda `npm run lint` (tsc) e `npm test` antes do build.
  Um PR com erro de tipo ou teste quebrado fica vermelho e não publica.
- **Os 19 erros de tsc que já existiam foram zerados:**
  - **Removidos três arquivos que ninguém importava** (restos do CFI):
    `AccessLogsModal.tsx`, `SimplesNacionalNovaEmpresa.tsx` e
    `geminiService.proxy.ts`.
  - **Tipos do extrato do Gemini** alinhados ao esquema de resposta pedido
    à IA.
  - **Ajustes de import:** `Empresa` no Apontamento e `EventoPonto` no
    editor de ponto.
  - **Spread do Lucro Presumido** e helper de bytes do teste do zip.
- **MiA (Codex #99):**
  - **CPF mascarado** no contexto da tela que vai para a IA: com máscara,
    sempre; só dígitos, quando os 11 formam CPF válido.
  - **Cada mensagem cabe nos 4.000 caracteres do CFI**, também depois de
    juntar perguntas seguidas. Da pergunta fica o fim (a mais recente); da
    resposta, o começo.
- **`comTokenCfi`:** renova o token ou mostra o aviso de e-mail não
  verificado só quando o CFI responde 401/403. Antes decidia só pelo texto,
  então um erro de negócio com "não verificado" na mensagem disparava a
  renovação.
- **Dependências:**
  - `npm audit fix` sem `--force`, que corrigiu jspdf, protobufjs, ws,
    websocket-driver, proxy-addr, dompurify e outras.
  - `jspdf-autotable` foi para a 5.0.8, que aceita o jspdf 4. A 3.8 pedia
    o jspdf 2.
  - **Restam 6 apontamentos:**
    - **firebase e grpc-js:** o grpc só roda no Node, e o navegador usa
      outro transporte. A correção sugerida é voltar o firebase para a 9,
      o que não faz sentido.
    - **qs:** está dentro do express do `server.js`, que não é usado no
      Pages.
    - **xlsx (SheetJS):** não há versão corrigida no npm; a corrigida é
      publicada no CDN do SheetJS. Fica para decisão do Paulo, porque muda
      a origem da dependência.
- **Tamanho:** o PDF (jspdf) carrega só no clique. O pacote da tela do
  Cálculo caiu de 632 kB para 214 kB.
- **Revisão do Codex no PR #110:**
  - **xlsx (P2):** o xlsx continua no pacote principal, porque os leitores
    de planilha da Folha o importam direto. Carregá-lo no clique no Cálculo
    não mudava nada, então voltou ao import normal; a redução veio só do
    PDF. Tirar o xlsx do pacote principal fica para depois, porque mexe
    nos leitores de planilha da Folha.
  - **README (P2):** o passo do proxy do Gemini passa a dizer como recuperar
    pelo git o modelo removido (`geminiService.proxy.ts`).
- **Testes:** 86 arquivos, 681 testes.

## 08/10/2026 — Demonstrativo de férias no S-1200 e no S-1210

- **Paulo:** *"pode seguir com demonstrativo de férias no s-1200"*.
- **Antes:** quem tinha férias no mês ficava sem S-1200 e S-1210, com o aviso
  de transmitir pelo IOB.
- **Pesquisa:**
  - O MOS e as tabelas no gov.br estão bloqueados pela rede desta sessão.
  - **Regra dos XSDs S-1.3:** o S-1210 aponta para o demonstrativo do
    S-1200 pelo `perRef` e o `ideDmDev`.
  - **Fontes secundárias (fornecedores de folha e consultorias):**
    - erro 860: a data do pagamento não pode ser anterior ao período do
      demonstrativo;
    - a NT S-1.3 04/2025, obrigatória desde 01/2026, criou a natureza
      **1015** (adiantamento de férias, com o 1/3) para o pagamento feito
      em mês anterior ao do gozo;
    - no mês do gozo entram **1016/1017** (férias e 1/3 da competência) e o
      desconto **9221** (o líquido já pago);
    - a natureza **1020** (férias) acabou em 04/2023.
  - **Confirmar no MOS consolidado:** o detalhe de onde vão o INSS e o IRRF
    de cada parte. Até lá, as incidências ficam com o S-1010 da empresa (as
    rubricas do IOB), e o de/para separa cada caso numa verba própria.
- **Modelo adotado (`services/esocial/eventosFolha.ts`), conferido com o
  MOS S-1.3 (veja a revisão abaixo):**
  - **Recibo de férias pago na competência:** demonstrativo próprio no S-1200
    dela (`FERAAAAMMDD-matrícula`), com férias e 1/3 inteiros como
    adiantamento (`FERADI`, `FERADI13`: natureza 1015) e o INSS e o IRRF
    retidos (`INSSFER`, `IRRFFER`).
    - É pago na data do recibo (dia útil até 2 dias antes do início, a
      mesma do arquivo bancário), no S-1210 do mês do recibo.
  - **Folha de cada mês do gozo:** como o holerite. Traz as férias e o 1/3
    do mês (`FERMES` e `FERMES13`, agora em linhas próprias: 1016 e 1017) e
    abate o adiantamento (`FERPAGO`: 9221) e o INSS e o IRRF retidos no
    recibo.
  - **Conferência:** as férias da folha têm de bater com os recibos do mês.
    Sem o recibo, o trabalhador fica sem evento, com o motivo. Pagamento
    depois do início do gozo não é gerado.
  - **S-1210 por mês de pagamento:**
    - um para o mês da folha e outro para o mês dos recibos, quando é
      diferente (`outrosMeses`); no mesmo mês, um só, com os dois
      pagamentos;
    - a exclusão e o reenvio do S-1210 aceito valem para cada mês;
    - as deduções do IRRF (dependentes e pensão) vão no S-1210 do mês da
      folha.
  - **Retificação:** a folha usa o demonstrativo do original só quando ele é
    o único da matrícula e não há recibo no mês. Um original com outros
    nomes (por exemplo, folha e férias do IOB) cai em "demonstrativo que o
    cálculo não gera: retifique pelo IOB".
- **Tela:**
  - O Cálculo › Mensal › "S-1200 e S-1210" calcula os recibos do mês
    (`recibosFeriasDaCompetencia`).
  - O de/para inclui as verbas do recibo.
  - A tela mostra quantos trabalhadores têm recibo no mês e baixa e
    transmite todos os S-1210, cada um com a sua exclusão.
  - A aba Férias explica por onde o recibo vai ao eSocial, e o guia da MiA
    também.
- **Motor:** "Férias do mês" e "1/3 de férias do mês" ficam em linhas
  próprias, como no holerite do IOB. A conferência dos holerites soma as
  duas.
- **Validação:** os XMLs passam no XSD do S-1.3, exceto pela assinatura,
  que o CFI acrescenta.
- **Testes:** `feriasEsocial.test.ts` (ponta a ponta com o motor) e a tela
  com dois S-1210.
- **Antes de usar em produção:** comparar com o S-1200 e o S-1210 que o IOB
  transmitiu num mês com férias. Pelo download do eSocial, confira os
  demonstrativos e as rubricas.
- **Paulo, no meio do trabalho, com o print da ficha da Yasmin (IRRF = Sim e
  Pensão = Sim, cota 30%):** *"Na legislação o filho pode ser dependente
  para abater IR e pagar pensão tbm."*
  - **Conferido:** no mesmo mês, a lei não permite deduzir a mesma pessoa
    como dependente e como alimentando. A Lei 9.250/1995, art. 35, § 4º,
    veda a dedução concomitante, e a IN RFB 1.500/2014, art. 90, § 4º, diz
    que quem paga pensão não deduz como dependente a mesma pessoa. A
    exceção vale para meses diferentes do mesmo ano (por exemplo, o filho
    foi dependente até a pensão começar).
  - A validação da ficha continua, e a mensagem agora cita a norma e diz o
    que fazer: IRRF = Não e Pensão = Sim, porque a pensão deduz o valor
    pago, sem limite.
- **Revisão do Codex no PR #111 (dois P1, corrigidos):**
  - **Mês do IRRF das férias:** o motor de férias passa a usar o mês do dia
    útil até 2 dias antes do gozo. Antes usava o mês dos 2 dias corridos:
    um gozo em 03/03/2026 era pago em 27/02, mas o IRRF saía pela tabela de
    março.
  - **Dependentes no IRRF das férias:** quando o recibo usou as deduções
    legais, cada dependente vai no S-1210 do mês do recibo, com tipo de
    rendimento 13 (Férias), e no `infoDep` se não estiver no eSocial. A
    folha continua com o tipo 11 no mês dela.
  - Os dois casos têm teste e passam no XSD (exceto a assinatura). São 688
    testes.
- **Paulo:** *"não continua sem informação, me diga o que precisa que eu
  baixo"*. O PR #111 ficou em rascunho, sem merge, até a conferência com:
  - o MOS S-1.3 (PDF, 412 páginas);
  - a NT 04/2025;
  - a Tabela 03;
  - S-1200, S-1210, S-1010, S-5001 e S-5002 reais do IOB de um mês com
    férias, mandados pela conversa e nunca commitados.
  - Os sites do Adobe, do Google Drive e do Dropbox estão bloqueados na
    rede da sessão; o GitHub funciona (release em rascunho para o PDF
    público).
- **MOS S-1.3 consolidado até a NO 07/2026** (Paulo subiu em
  `docs/referencias/`, como base de conhecimento técnico):
  - **S-1010, item 23 (págs. 108–111):** a natureza 1015 (adiantamento de
    férias) entra com CP 00, FGTS 00 e IRRF 13. No mês do gozo entram 1016 e
    1017 (CP 11, FGTS 11, IRRF 13) e o desconto 9221 (00/00/13). A **opção
    1** serve para todos os casos: pagamento no mês anterior ao gozo, no
    próprio mês e com o gozo em dois meses. O recibo vai inteiro em 1015, e
    a folha de cada mês do gozo traz a sua parte em 1016/1017 e abate em
    9221.
  - **S-1200, item 29 (págs. 151–152):** o exemplo S-1200 × S-1210 com
    valores tem as férias pagas em 06/04 e o gozo de 08/04 a 07/05:
    - **Demonstrativo "Antecipação de férias" no S-1200 de 04:** férias e
      1/3 com CP 00 e IRRF 13, a "provisão de CP" (IRRF 43) e o IR das
      férias (IRRF 33). É pago pelo S-1210 de 04 na data do recibo, no
      mesmo S-1210 que paga a folha de março.
    - **Folhas de abril e de maio:** cada uma traz as férias e o 1/3 do mês,
      o "adiantamento férias (desconto)" pelo líquido da parte, a "provisão
      CP férias" (CP 31), a "provisão IR" e o INSS da folha.
    - É exatamente o holerite do motor: `FERMES`, `FERMES13`, `FERPAGO`,
      `INSSFERRET`, `IRRFFERRET` e `INSS`.
  - **Mudança no PR #111:** sai a "opção 2", que dividia o recibo pela
    competência e tirava da folha a parte paga no próprio mês. Fica a opção
    1, igual ao manual e ao holerite do IOB. O recibo vai inteiro em 1015, e
    a folha não muda. As incidências (CP, FGTS e IRRF) são as do S-1010 da
    empresa, e o de/para sugere pelas naturezas do manual.

## 08/10/2026 — Pacote do cliente pelo SP Connect (WhatsApp do escritório)

- **Paulo:** *"ao usar o consultor DP, e envio para WhatsApp, não está
  assumindo que deve sair pelo WhatsApp, SP Connect"* e *"pode seguir no
  Consultor DP, com a mesma regra criada no CFI e no CCI, onde podemos enviar
  arquivos em anexo aos clientes"*.
- **Antes:** o botão montava um link `wa.me`, que abre o WhatsApp de quem
  está no computador, e não o número do escritório.
- **Regra do CFI e do CCI (SP Connect, Cloud API da Meta):**
  - o envio ao cliente sai pelo gateway dos apps irmãos (`POST
    /api/admin/whatsapp/enviar`, que aceita o token do DP), com o template
    do departamento;
  - fora da janela de 24h, a Meta só aceita template, e o template só leva
    arquivo com cabeçalho de documento (um PDF por envio);
  - o token da Meta nunca sai do CFI, e o CFI audita o envio em
    `whatsapp_envios`, com quem enviou.
- **Feito (só no Consultor DP, sem mudança no CFI):**
  - **`services/pacoteCliente/spConnect.ts`:**
    - `templatesDoDp`: templates ativos do `dp-folha` com documento;
    - `enviarPeloSpConnect`: template, variáveis e PDF em base64, com o
      token do usuário (`comTokenCfi`). A recusa do CFI chega com o que
      fazer (`acao`);
    - `valoresSugeridos`: preenche cliente, empresa e competência pela
      chave da variável.
  - **Pacote do cliente, bloco "SP Connect: WhatsApp do escritório":**
    - escolha do template e do PDF do pacote (holerites ou resumo), com as
      variáveis já sugeridas e editáveis;
    - confirmação antes de enviar e o resultado na tela (número e template).
  - **Sem template `dp-folha` com documento**, a tela explica o que fazer: um
    admin cria na Meta um modelo de utilidade com cabeçalho de DOCUMENTO e
    cadastra no CFI (⚙️ Config Admin › WhatsApp, departamento dp-folha, "tem
    documento").
  - O botão antigo passa a se chamar "WhatsApp deste computador" e fica como
    alternativa.
  - O .zip completo (arquivo bancário, agenda, LEIA-ME) segue pelo e-mail.
- **Para o CFI, só com a aprovação do Paulo:**
  - `/enviar` grava `projetoOrigem` a partir de `req.user.projeto`, mas o
    token dos irmãos preenche `projectId`. Por isso o envio do DP fica sem
    origem na auditoria;
  - não há rota de e-mail (Graph) aberta ao DP: o e-mail continua saindo do
    programa de e-mail de quem usa.
- **Testes:** `spConnect.test.ts` e o modal com o envio e com a falta de
  template.
- **Arquivo bancário recusado pelo Itaú (Paulo, 08/10/2026, print do app
  Itaú):** *"Nome do arquivo recebido [CNAB240_341_20261008_000005.REM.txt]
  fora da especificação (8 caracteres para nome e 3 para extensão)"*.
  - O conteúdo estava certo (registros de 240 posições com CRLF); a recusa
    era só do nome.
  - **Nome 8.3:** `PG` + dia + mês + os 2 últimos dígitos do número do
    arquivo, por exemplo `PG081005.REM`. O número muda a cada remessa, então
    dois arquivos do mesmo dia não se repetem até o 100º.
  - **Download como binário (`application/octet-stream`):** como texto, o
    Safari acrescentava `.txt` ao nome.
  - Vale também para o .REM de dentro do pacote do cliente.
- **Revisão do Codex no PR #112 (P2):** a sugestão das variáveis testa primeiro empresa, competência e documento, e só depois o genérico "nome". Assim `nome_empresa` recebe a empresa, e não o contato.
- **E-mail pelo escritório (Paulo, 08/10/2026: "Commit, PR e deploy", depois
  das correções no CFI #1391):**
  - O modal ganha o botão "Enviar e-mail pelo escritório". Ele chama a nova
    rota do CFI, `POST /api/dp-integration/email/enviar`, que é a mesma régua
    do CFI e do CCI:
    - Graph sendMail, com a caixa do colaborador logado como remetente;
    - casca da marca, com o Departamento Pessoal;
    - .zip em anexo, até 3 MB;
    - cópia oculta por `DP_EMAIL_BCC`;
    - auditoria em `dp_email_envio_log`.
  - A tela confirma antes de enviar e mostra de quem saiu, o aviso de
    remetente (quando caiu na caixa institucional) e quem ficou em cópia.
  - O botão antigo passa a se chamar "E-mail deste computador" e continua
    como alternativa.
  - Antes da publicação no CFI, a rota responde 404, e a tela diz para usar o
    e-mail deste computador.
  - No CFI, a auditoria do WhatsApp volta a gravar `projetoOrigem` a partir
    do `projectId` dos irmãos (CFI #1391 e sp-connect #4).
  - **Testes:**
    - `spConnect.test.ts`: corpo do pedido, 404 e recusa;
    - o modal com o envio.
- **Revisão do Codex no CFI #1391:**
  - O teto dos anexos do e-mail caiu para ~2,8 MB de arquivo. Ele agora é medido no base64, para caber no pedido de 4 MB do Graph.
  - A resposta passou a trazer `convites` e `avisosConvites`, e a tela do pacote mostra os dois: o `vencimentos-sp.ics` que foi junto e os PDFs que o CFI não leu.
- **Revisão do Codex depois do merge do #112, duas P2:**
  - **Variáveis sugeridas por palavra da chave, não por pedaço.** A chave `mensagem` começava com "mes" e recebia a competência. Agora a chave é quebrada em palavras (`nomeEmpresa` vira ["nome", "empresa"]) e comparada palavra por palavra.
  - **Teto do e-mail conferido na tela.** `LIMITE_EMAIL_BYTES` = 3.000.000, o mesmo base64 de 4.000.000 do CFI. A tela mostra "até 2,8 MB", com o teto arredondado para baixo e o tamanho do .zip para cima. Um .zip acima do teto desliga "Enviar e-mail pelo escritório" e diz para usar "E-mail deste computador".
- **Itaú recusou `PG081010.REM.txt` (Paulo, 08/10/2026, novo print):**
  - O nome 8.3 estava certo, mas o Safari do Mac acrescenta ".txt" a qualquer download com conteúdo de texto, mesmo como `application/octet-stream`.
  - **Correção (`services/bancario/download.ts`):** no Safari, o .REM vai dentro de `PG081010.zip`. O Safari abre o .zip sozinho, e o Utilitário de Compressão extrai `PG081010.REM` com o nome exato. Nos outros navegadores, o .REM continua saindo direto.
  - A tela diz por que o arquivo veio compactado e qual arquivo enviar ao banco.
  - `ehSafari` exclui Chrome, Edge, Opera e Chrome/Firefox do iPhone, que também trazem "Safari" no user agent.
  - **Testes:** `download.test.ts` e o modal com o user agent do Safari.

## 08/10/2026 — PR #111 conferido com o IOB (férias com abono, 08 e 09/2026)

- **Paulo mandou pela conversa**, sem commit, porque têm nome e CPF:
  - S-1200 de 08/2026;
  - S-1210 de 08 e de 09/2026;
  - relatórios "conferência dos periódicos" de 08 e 09, com rubricas, incidências e totais.
  - **Caso:** salário 3.500,00; gozo de 01 a 20/09/2026; abono de 10 dias; recibo pago em 28/08 (o prazo caía no domingo, 30/08).
- **O IOB faz igual ao PR #111 (opção 1 do MOS):**
  - **S-1200 de 08:** o recibo vai em demonstrativo próprio (`…FERI`), com as rubricas `S_RECIFER_*`. Os valores batem com o motor: férias 2.333,33 (20 dias); 1/3 777,78; abono 1.166,67 (10 dias); 1/3 do abono 388,89; INSS 261,93. As incidências são CP 00, IRRF 13 nas férias e no 1/3 e IRRF 43 no INSS.
  - **S-1210 de 08:** o recibo é pago em 28/08, perRef 08, com líquido de 4.404,74, igual ao do motor. O S-1210 de 09 não traz o recibo.
  - **S-1200 de 09 (gozo):** as rubricas `S_HOLEFER_*` batem com o motor (`FERMES`, `FERMES13`, `FERPAGO`, `INSSFERRET`, `SAL`, `INSS`): férias 2.333,33 (CP 11, IRRF 09); 1/3 777,78; "desc. de férias recebidas" 2.849,18; INSS das férias 261,93 (CP 31); salário de 10 dias 1.166,67; INSS complementar 140,00. Os 401,93 de CP do mês são 261,93 + 140,00, na faixa de 2026.
- **Diferenças que ficam como estão:**
  - O IOB repete o abono e o 1/3 do abono na folha do gozo (1330 e 1210, com CP 00 e IRRF 09) e desconta os dois em 5590 (1.555,56). A soma é zero e nenhuma base muda. O MOS não pede isso, então o motor mantém o abono só no recibo.
  - O IOB lança o adiantamento quinzenal em demonstrativo próprio (`…ADIA`, pago em 20/08) e o vale-transporte (6%). O motor ainda não calcula nenhum dos dois. É assunto separado do PR #111.
- **Trava:** `feriasEsocial.test.ts`, "confere com o IOB", reproduz o caso com dados trocados e confere cada valor acima.
- **Revisão do Codex no #111 (P1):** quando o S-1210 do mês já tinha sido aceito com informações de IR, o reenvio levava só o bloco antigo e perdia as deduções de dependentes das férias (tpRend 13) do recibo novo.
  - `mesclarIRFerias` junta essas deduções ao bloco aceito. O dedDepen entra logo após o `tpCR` 056107, ou num `infoIRCR` novo antes do `planSaude`. O `infoDep` de quem ainda não estava no bloco entra antes do `infoIRCR`. Nada mais muda, e o que já estava lá não se repete.
- **Revisão do Codex no #111 (P2):** dois recibos de férias pagos no mesmo mês com o mesmo dependente (férias fracionadas ou dois contratos) só levavam a dedução do primeiro.
  - Agora as deduções somam por CPF no S-1210 do mês.
  - Em `mesclarIRFerias`, o valor calculado (todos os recibos do mês) troca o tpRend 13 do mesmo CPF no S-1210 aceito. O reenvio igual não muda nada, e um recibo novo soma.
- **Revisão do Codex no #111 (P2, de/para antigo):** antes do #111, `FERMES` era férias + 1/3 e a sugestão era a natureza 1020. Um de/para gravado assim passaria sem aviso com o sentido novo (só férias, 1016).
  - O gerador recusa `FERMES` em rubrica de natureza 1020 e pede para refazer o de/para (férias em 1016, 1/3 em 1017).
  - Nas outras verbas de férias com natureza diferente da do MOS (S-1010, item 23), só avisa, porque a tabela de cada empresa vem do IOB.
- **Revisão do Codex no #111 (P1, opções do IRRF):** quem calculasse o recibo de férias sem o desconto simplificado ou sem o redutor de 2026 e depois fosse para a folha mensal teria o recibo recalculado com as opções padrão. A folha abateria e o eSocial informaria um IRRF diferente do recibo entregue.
  - `feriasDaCompetencia` e `recibosFeriasDaCompetencia` passam a receber as opções. A tela de cálculo repassa as que estão marcadas na aba Férias para a folha, a conferência e o S-1200/S-1210.
- **Revisão do Codex no #111 (P1, deduções que deixaram de valer):** um recibo corrigido que passou ao desconto simplificado, ou deixou de deduzir um dependente, mantinha a dedução antiga no S-1210 reenviado.
  - No mês da competência, onde o cálculo tem todos os recibos pagos no mês, `mesclarIRFerias(…, completo)` tira do bloco aceito o tpRend 13 que não está no cálculo. Também some o `infoIRCR` ou o `infoIRComplem` que ficou vazio.
  - Em outro mês, o S-1210 aceito tem recibos de outra competência, e o tpRend 13 dele fica como está.

## 08/10/2026 — Adiantamento salarial e vale-transporte no motor

- **Paulo:** *"pode seguir com adiantamento e vale transporte"*, depois da comparação do PR #111 com o IOB. Os eventos aceitos do IOB de 08 e 09/2026 mostram o adiantamento em demonstrativo próprio (`…ADIA`, pago em 20/08 e 18/09) e o VT de 6% descontado na folha.
- **Ficha** (aba nova "Adiant. e VT"):
  - adiantamento salarial em % do salário do mês;
  - vale-transporte S/N;
  - custo mensal do VT, opcional, que limita o desconto.
- **Motor** (`calcularMensal`):
  - **VT:** 6% do salário do mês (a verba SAL), sem adicionais, limitado ao custo do benefício (Lei 7.418/1985, art. 4º, parágrafo único; Decreto 10.854/2021, art. 114). Sem INSS, FGTS e IRRF.
  - **Adiantamento:** o percentual sobre o salário do mês, como o IOB faz (40% de 1.166,67 em setembro, mês com 20 dias de férias), descontado na folha (ADIANT).
  - **Movimento do mês:** "Adiantamento pago" e "Vale-transporte" sobrepõem a ficha. Em branco, valem os dados da ficha; 0 significa "não houve" e fica gravado.
- **eSocial:**
  - O adiantamento ganha demonstrativo próprio no S-1200 (`ADIAAAAMM-matrícula`), com a rubrica de provento do adiantamento (ADIANTPAG). O pagamento vai no S-1210 na data do adiantamento: dia 20 ou o dia útil anterior, editável na tela. Base: MOS, S-1200, item 3.4 ("cada parcela… em demonstrativo de pagamento específico").
  - Se a folha for paga no mês seguinte, o adiantamento fica no S-1210 do mês dele.
  - **De/para:** ADIANT em 9200, VT em 9216 e ADIANTPAG pela descrição ("ADIANT"), porque a natureza do provento varia no S-1010 de cada empresa.
- **Conferência de holerites:** o "ADIANTAMENTO (VALE)" e o "VALE TRANSPORTE" do IOB viram linhas próprias e entram no movimento como valores informados. O arredondamento continua como lançamento avulso.
- **Conferido com o IOB:**
  - Agosto: líquido da folha 1.581,40 (o IOB arredonda para 1.581,00).
  - Setembro: 490,00.
  - Os demonstrativos do S-1200 de 08 (folha, adiantamento e recibo de férias) e as datas do S-1210 batem.
- **Fica para depois:**
  - arredondamento do líquido (o IOB leva os centavos para o mês seguinte);
  - arquivo bancário e holerite do próprio adiantamento.
- **Revisão do Codex no #115 (P1):** se a folha é paga no mês seguinte, o adiantamento sai num mês e o saldo em outro.
  - Pelo RIR/1999, art. 621, o adiantamento de rendimentos que não são integralmente pagos no próprio mês tem o IRRF calculado de imediato, no mês do pagamento. O motor ainda calcula tudo no mês da folha.
  - Até a regra ser conferida com o IOB, o motor avisa e o gerador do eSocial recusa esse caso para o trabalhador, com o motivo.
  - No caso do IOB (folha paga em 30/08), os dois pagamentos são do mesmo mês, e nada muda.
- **Revisão do Codex no #115 (P2, VT em mês parcial):** o custo do VT na ficha é o do mês inteiro. Em mês parcial (admissão, férias, afastamento), o teto do desconto passa a ser o custo × dias pagos / 30, proporcional ao benefício concedido (Decreto 10.854/2021, art. 115). Exemplo: setembro, com 10 dias fora das férias e custo de 150,00, limita o desconto a 50,00.
- **Revisão do Codex no #115 (dois P1):**
  - **Sugestão de rubrica:** a sugestão pela descrição (`ADIANTPAG`) não aceita mais rubrica de férias ou de 13º, nem quando é a única com "ADIANT".
  - **Admissão e desligamento:** o adiantamento automático só vale para quem tinha vínculo no dia do adiantamento (dia 20 ou o dia útil anterior). Admitido depois ou desligado antes fica sem adiantamento, e a memória explica.
  - **eSocial:** recusa adiantamento informado com data anterior à admissão.
  - `dataSugeridaAdiantamento` foi para o motor, porque é a mesma data na folha e no eSocial.
- **Revisão do Codex no #115 (P2):** se o holerite do IOB não traz adiantamento ou VT, o movimento trazido dele grava 0 nos dois. Assim o motor não volta à ficha e não inventa o desconto naquele mês.
- **Revisão do Codex no #115 (P1):** a sugestão da rubrica do adiantamento salarial agora exige "SAL", "VALE" ou "QUINZ" na descrição e evita férias, 13º, comissão e gorjeta. O catálogo de eventos do IOB tem "adiantamento comissão" e "adiantamento gorjeta".
- **Revisão do Codex no #115 (dois P2):**
  - **VT só nos dias com deslocamento:** afastamento remunerado (16) e os 15 primeiros dias de doença, que a empresa paga, não entram. A base e o teto do custo seguem esses dias. Doença o mês inteiro dá VT zero.
  - **Data do adiantamento alterada na tela:** se ela diverge da usada no cálculo (dia 20 ou o dia útil anterior) e a admissão ou o desligamento fica entre as duas datas, o eSocial recusa e pede o valor no movimento. Com o adiantamento informado no movimento (`adiantamentoInformado`), vale o informado.
- **Revisão do Codex no #115 (P1 e P2):**
  - **Conferência de holerites:** só vira "Adiantamento salarial" o desconto com "SAL", "VALE" ou "QUINZ" na descrição, ou "ADIANTAMENTO" sozinho. Adiantamento de férias, 13º, comissão e gorjeta, e o arredondamento, ficam em "outros", como na sugestão da rubrica.
  - **Data do adiantamento alterada na tela:** a comparação passa a seguir as regras do motor (sem vínculo se admitido depois do dia ou desligado antes dele). Assim, o desligado no próprio dia do cálculo (18/09), com a data mudada para 20/09, também é avisado.
- **Revisão do Codex no #115 (P2, faltas no VT):** as faltas do movimento também saem dos dias com deslocamento. A base dos 6% e o teto do custo seguem esses dias. Exemplo: 6 faltas deixam 24 dias, com VT de 168,00 sobre 3.500,00. Faltas no mês todo dão VT zero.
- **Revisão do Codex no #115 (P2, VT em fevereiro):** havendo dias sem deslocamento, conta o menor entre os dias comerciais e os dias de calendário que sobram. Fevereiro inteiro em afastamento remunerado (28 datas e 30 dias comerciais pagos) deixava 2 dias de VT, e agora deixa zero. Com 20 dias afastados, ficam 8 dias. Sem afastamento, fevereiro continua com o mês comercial inteiro.
- **Revisão do Codex no #115 (P2, mês do pagamento):** o gerador do S-1200/S-1210 recusa o trabalhador quando o cálculo foi feito com um mês de pagamento ("Pagamento em") e a data do pagamento na tela é de outro. O IRRF do cálculo segue a tabela do mês usado nele. Vale para todos, com ou sem adiantamento.

## 08/10/2026 — Arredondamento do líquido

- **Paulo:** *"pode seguir com arredondamento liquido"*. Os clientes do escritório pagam a folha no próprio mês, no 5º dia útil ou no dia 5 do mês seguinte.
- **Como o IOB faz** (eventos de 08 e 09/2026): o pagamento sobe ao real seguinte, e os centavos pagos a mais voltam como desconto no mês seguinte.
  - **Agosto:** 1.581,40 − 0,96 (anterior) + 0,56 (atual) = 1.581,00.
  - **Setembro:**
    - adiantamento de 466,67 pago como 467,00 (+ 0,33 no demonstrativo dele);
    - folha: 490,00 − 0,33 (desc. arredondamento adiantamento) − 0,56 (anterior) + 0,89 (atual) = 490,00.
- **`services/calculo/arredondamento.ts`:**
  - `arredondar(r, anterior)` cria ARREDADI, ARREDANT e ARREDATU, sem INSS, FGTS e IRRF, e refaz os totais;
  - `anteriorEncadeado` calcula o anterior mês a mês, desde o mês de início (no máximo 36 meses), usando o anterior informado no movimento quando houver.
- **Parâmetro da empresa** (`empresas/{id}.parametrosFolha`): "Arredondar o líquido" e "desde", na tela do cálculo mensal.
  - As regras do Firestore liberam essa chave para quem tem a empresa na carteira; o gestor já pode gravar.
  - **Movimento:** novo campo "Arredondamento anterior", para informar o do holerite do IOB no primeiro mês.
- **eSocial:**
  - O demonstrativo do adiantamento leva o arredondamento dele, e o S-1210 paga 467,00.
  - A folha leva as três linhas.
  - **De/para:** pela descrição ("ARRED… ATUAL / ANTERIOR / ADIANT").
- **Conferência de holerites:** as linhas de arredondamento do IOB não viram lançamento avulso. O "anterior" entra no movimento, e o motor refaz o resto.
- **Trava:** `adiantamentoVt.test.ts`, com os valores de agosto e setembro do IOB.
- **Revisão do Codex no #116 (P1):** com o arredondamento ligado "desde 09/2026", reabrir 08/2026 também arredondava esse mês. `arredondaNoMes` deixa a folha antes do mês de início como era, e o campo "Arredondamento anterior" só aparece a partir dele.
- **Arredondamento no holerite do IOB:** quando o holerite tem linha de arredondamento mas não tem "anterior", o movimento grava anterior 0 para o mês. Sem nenhuma linha de arredondamento, o anterior fica para o encadeamento.
- **Revisão do Codex no #116 (dois P2):**
  - **Período completo:** o encadeamento percorre todo o período desde o mês de início. Com o corte em 36 meses, o anterior verdadeiro virava 0, e o erro chegava ao mês pedido. A trava cobre 42 meses.
  - **Movimentos não carregados:** enquanto os movimentos gravados não carregam, ou se der erro, a folha com arredondamento fica "incompleta" com aviso, a não ser que o anterior do mês esteja informado. Assim não sai PDF nem arquivo bancário com o encadeamento feito sem as horas e faltas dos meses passados.
- **Revisão do Codex no #116 (três P2):**
  - **Mês com erro no encadeamento:** antes ele zerava o anterior sem aviso. Agora `anteriorEncadeado` devolve o erro com o mês, e a folha fica em erro até o mês ser corrigido ou até um anterior ser informado num mês seguinte.
  - **Movimentos não carregados:** a folha agora fica em "erro", não mais "incompleta", porque os PDFs aceitavam resultados incompletos. Assim não sai holerite, arquivo bancário nem eSocial com o líquido sem o arredondamento.
  - **Anterior informado:** no máximo R$ 0,99. Digitar 56 em vez de 0,56 tiraria R$ 56,00.
- **Revisão do Codex no #116 (P2):** um mês antigo "incompleto" no encadeamento (férias sem recibo, por exemplo) agora trava como um mês em erro, porque o líquido dele não é o que foi pago. Um anterior informado num mês seguinte retoma o encadeamento.
- **Revisão do Codex no #116 (três P2):**
  - **Limite no rascunho:** o "Arredondamento anterior" digitado e ainda não salvo já entra no cálculo. Acima de 0,99, a folha do funcionário fica em erro, e o PDF, o arquivo bancário e o eSocial não saem com ele.
  - **Regime de pagamento da empresa:** novo parâmetro "folha paga no próprio mês / no mês seguinte" (padrão: mês seguinte, para o 5º dia útil e o dia 5). Os meses passados do encadeamento e a conferência com o eSocial do IOB usam esse regime, e não o mês do pagamento da tela. Ele também é o mês do pagamento sugerido ao trocar de competência.
  - **Descrição truncada:** "ARREDONDAMENTO ANTE" (evento 5660 do catálogo do IOB) continua sendo reconhecido como o anterior. O reconhecimento usa o início "ANT" ou o código 5660.
- **Revisão do Codex no #116 (P1):** o mês do pagamento da tela agora segue o regime salvo da empresa ao abrir, trocar de empresa ou mudar o regime. Antes, uma empresa que paga no próprio mês abria com o pagamento no mês seguinte, e o IRRF saía pela tabela errada. O seletor "folha paga" aparece em toda folha mensal, mesmo sem o arredondamento.
- **Revisão do Codex no #116 (dois P2):**
  - **Descrições truncadas no de/para:** as rubricas de arredondamento são sugeridas também pelas descrições do catálogo do IOB ("ARREDONDAMENTO ATUA", "ARREDONDAMENTO ANTE") ou pelo código do evento como código da rubrica (1480, 5660, 8951). O 8951 é "DESC. ARREDONDAMENT" e não tem "ADIANT" na descrição.
  - **Histórico do regime de pagamento:** mudar "folha paga" grava a mudança a partir da competência da tela (`mudancasPagamento`: desde, de, para). Os meses anteriores ficam com o regime que valia neles, no encadeamento, na conferência e no pagamento sugerido. Voltar ao regime anterior no mesmo mês desfaz a mudança.
- **Revisão do Codex no #116 (dois P2):**
  - **Arredondamento atual gravado:** ao salvar o movimento do mês, o Consultor grava o arredondamento atual de cada funcionário (`arredondamentoFechado`). Ele é o anterior do mês seguinte. O encadeamento usa o gravado e não refaz o mês com a ficha de hoje, então um dependente ou VT mudado depois não altera o que já foi pago. Mudou o atual, o funcionário aparece como "não salvo", e o S-1200 só sai depois de salvar. Meses sem o valor gravado continuam recalculados.
  - **Mês de início:** na competência em que o arredondamento começa, o anterior é 0. A folha não espera mais os movimentos dos meses anteriores nem trava se eles falharem.
- **Revisão do Codex no #116 (dois P2):**
  - **Conferência de holerites:** as linhas de arredondamento são comparadas pelo efeito no líquido (atual − anterior − o do adiantamento), dos dois lados. Sem os totais lidos pelo Gemini, um arredondamento diferente não passa mais como "confere".
  - **Mês de início alterado:** o atual gravado leva junto o mês de início usado (`arredondamentoDesde`). Se o início mudar, o gravado é ignorado e o mês é recalculado. O funcionário fica "não salvo" até o movimento ser salvo de novo.
- **Revisão do Codex no #116 (P2):** se o movimento de um mês já fechado é editado e o cálculo fica em erro ou incompleto, o movimento é gravado sem o atual antigo. Assim, o encadeamento refaz o mês e trava, em vez de confiar no valor velho. A regra fica em `movimentoComFechado`, com testes.
- **Revisão do Codex no #116 (dois P2):**
  - **Parâmetros em fila:** cada mudança dos parâmetros da folha parte da última feita, e as gravações vão em ordem. Assim, marcar "Arredondar" e trocar "folha paga" em seguida não apaga uma das duas mudanças. A tela é atualizada na hora.
  - **Regime mudado num mês já fechado:** o atual gravado leva também o mês do pagamento usado no cálculo (`arredondamentoPagamento`). Só vale se for o mesmo que o regime dá hoje para aquele mês. Se não for, o mês é recalculado.
- **Revisão do Codex no #116 (dois P2):**
  - **Edição com o arredondamento desligado:** qualquer movimento editado é gravado sem o atual antigo, mesmo num mês sem arredondamento. Religado o arredondamento, o mês é refeito.
  - **"Pagamento em" fora do regime:** o mês do pagamento gravado com o atual é o que foi usado de fato. O encadeamento aceita o atual gravado e, quando precisa refazer o mês (início mudado), usa esse mês do pagamento. Mudar o regime depois não reescreve mês fechado; para isso, é preciso reabrir o mês e salvar de novo. Isso substitui a regra anterior, que descartava o atual quando o regime de hoje dava outro mês.
- **Revisão do Codex no #116 (dois P2):**
  - **Gravação dos parâmetros falhou:** a tela volta aos últimos parâmetros gravados, e as mudanças que estavam na fila atrás da que falhou são descartadas. A folha não segue calculada com parâmetros que não foram gravados.
  - **Conferência com o eSocial do IOB:** o mês salvo com o arredondamento usa o mês do pagamento gravado. Fora isso, vale o mês do regime.

## 08/10/2026 — Arquivo bancário do adiantamento

- **Paulo:** *"pode seguir com arquivo bancario do adiantamento"*.
- **Cálculo › Mensal:** novo botão **"Arquivo do adiantamento"**. Ele aparece quando algum funcionário calculado tem adiantamento no mês e abre o mesmo "Arquivo Bancário" da folha (mesma conta, convênio e número sequencial do arquivo), com:
  - **valor de cada um:** o adiantamento do mês e, se a empresa arredonda, o arredondamento dele (`valorDoAdiantamento`: 466,67 + 0,33 = 467,00 no caso do IOB, o mesmo do S-1210 do adiantamento). Sem arredondar, 466,67;
  - **data sugerida:** dia 20 ou o dia útil anterior (`dataSugeridaAdiantamento`), editável;
  - **quem não tem adiantamento** fica fora do arquivo, sem aviso. Cálculo com erro ou incompleto aparece em "Fora do arquivo", como na folha.
- **`favorecidosDaFolha`** recebe opcionalmente o valor de cada recibo. O pacote do cliente e o arquivo da folha continuam com o líquido.
- **Trava:** `adiantamentoVt.test.ts` (valor igual ao do S-1210, seleção e data) e `arquivoBancarioModal.test.tsx` (coluna "Adiantamento", valor de fora e quem fica fora).
- **Fica para depois:** holerite (recibo) do adiantamento em PDF.
- **Revisão do Codex no #117 (P1):** a data do adiantamento mudada no arquivo bancário passa pelas mesmas regras do eSocial (`foraDoAdiantamento`). Fica fora do arquivo, com o motivo:
  - data fora da competência;
  - data antes da admissão;
  - admissão ou desligamento entre a data nova e a do cálculo, a não ser que o adiantamento esteja informado no movimento.
- **Revisão do Codex no #117 (P1):** o botão "Arquivo do adiantamento" fica desativado até os movimentos gravados do mês carregarem. Um adiantamento informado no movimento (0 ou outro valor) muda o que se paga.
- **Revisão do Codex no #117 (P1):** com erro na leitura dos movimentos, `gravados` vira `{}`. Por isso o botão "Arquivo do adiantamento" passa a depender de `movsLidos`, que só fica verdadeiro quando a leitura deu certo.
- **Revisão do Codex no #117 (P1):** cada leitura dos movimentos tem um número. A resposta de uma leitura já trocada (outra empresa ou competência) é descartada, para os movimentos do período anterior não valerem para o novo nem liberarem o arquivo do adiantamento.

## 08/10/2026 — IRRF do adiantamento com a folha paga no mês seguinte

- **Paulo** mandou o S-1200 e o S-1210 do IOB de 08/2026 de um funcionário com adiantamento em 20/08 e folha paga em 04/09. Os PDFs têm nome e CPF e não vão ao repositório; o teste usa dados trocados e os mesmos valores.
- **Como o IOB faz (regime de caixa; RIR/1999, art. 621):**
  - **Folha de 08, paga em 04/09:** o adiantamento sai dos rendimentos. 9.177,90 − 3.671,16 − 95,53 (atrasos) = 5.411,21; base 4.423,12 × 22,5% − 675,49 = 319,71; redutor 978,62 − 0,133145 × 5.411,21 = 258,14. **IRRF 61,57**, exatamente como no IOB.
  - **Adiantamento de 08, pago em 20/08:** o IRRF é o de tudo o que foi pago em agosto (folha de 07, paga em 06/08, mais o adiantamento) menos o que a folha de 07 já reteve. Com a folha de 07 de 5.375,55 de rendimentos (3h08 de atraso): (5.375,55 + 3.671,16 − 988,09) × 27,5% − 908,73 = 1.307,39, sem redutor (acima de 7.350); menos 48,80 = **1.258,59**. **Líquido 2.412,57**, o do S-1210 do IOB.
- **Motor:** com o adiantamento pago num mês e o saldo em outro, o adiantamento sai da base do IRRF da folha e o motor calcula `irrfAdiantamento` com a folha anterior paga no mês do adiantamento (`folhaPagaNoAdiantamento`). Sem ela, a folha fica incompleta, com aviso. `apurarIrrf` passa a ser o cálculo único da tabela progressiva com o redutor. Folha paga no próprio mês não muda.
- **Tela:** a folha anterior é calculada pelos movimentos gravados quando foi paga no mês do adiantamento (pelo mês do pagamento gravado, ou pelo regime). Isso vale na competência, no encadeamento do arredondamento e na conferência com o IOB.
- **eSocial:** o demonstrativo do adiantamento leva o IRRF (mesma rubrica do IRRF da folha), e o S-1210 do mês do adiantamento paga o líquido. A data do adiantamento precisa ser da competência, porque o IRRF foi calculado para ela. Sai o bloqueio do #115.
- **Arquivo bancário e arredondamento do adiantamento:** usam o valor líquido do IRRF.
- **Trava:** `irrfAdiantamento.test.ts`, com as tabelas oficiais de 2026.
- **Revisão do Codex no #118 (P1 e P2):**
  - **Folha anterior:** só a folha anterior completa entra no cálculo. Com erro ou incompleta, a folha do mês fica incompleta, com aviso.
  - **Sem folha paga antes no mês** (admissão, mudança de regime): os dependentes deduzem do adiantamento. O maior entre eles e o simplificado vale; INSS e pensão não há.
- **Revisão do Codex no #118 (P1 e P2):**
  - **Deduções no S-1210 do adiantamento:** sem folha anterior no mês e com os dependentes acima do simplificado, os dependentes usados no IRRF do adiantamento vão no S-1210 do mês dele (`dedDepen`, tpRend 11, e `infoDep` de quem não está no eSocial). Não ficam só no da folha.
  - **Ordem dos pagamentos:** se o IRRF do adiantamento somou a folha anterior, a data do adiantamento precisa ser depois do 5º dia útil (CLT, art. 459, § 1º; em 08/2026, 06/08), quando essa folha já foi paga. Antes disso, o eSocial recusa e o arquivo bancário deixa o funcionário fora, com o motivo.
- **Revisão do Codex no #118 (P1 e P2):**
  - **Mais de um contrato no CPF:** o IRRF do adiantamento é do CPF no mês, e o Consultor calcula cada contrato sozinho (como já na folha). Até somar os contratos, esses ficam incompletos, com aviso (`travarAdiantamentoEntreContratos`), e o eSocial recusa. Não sai arquivo bancário nem S-1200 com o IRRF por contrato.
  - **S-1210 do mês do adiantamento já aceito:** a mesclagem com o aceito passa a levar as deduções de dependentes do adiantamento (tpRend 11), além das das férias. As tpRend 11 do aceito (da folha anterior) e o resto (plano de saúde…) ficam.
- **Revisão do Codex no #118 (dois P1):**
  - **S-1210 do mês do adiantamento:** se o IRRF do adiantamento somou a folha anterior, paga nesse mês, o S-1210 do mês precisa levar esse pagamento junto. Sem o S-1210 do mês carregado (download do eSocial) com a folha anterior, o gerador recusa e pede para transmitir o S-1210 da folha anterior antes. Com ele carregado, os dois pagamentos saem no mesmo evento.
  - **Contrato encerrado no mês anterior:** a trava de mais de um contrato no CPF conta também os contratos da competência anterior, cuja folha é paga no mês do adiantamento.
- **Revisão do Codex no #118 (P1):** o IRRF retido no adiantamento entra no resumo da folha à parte (`encargos.irrfAdiantamento`): na tela, no PDF e no Excel, como "IRRF retido no adiantamento". No pacote do cliente, ele vai no lembrete do DARF da DCTFWeb da competência, o mês do adiantamento. O IRRF da folha continua no lembrete do mês do pagamento.
- **Revisão do Codex no #118 (dois P2):**
  - **Trava de contratos:** só conta os contratos da competência anterior cuja folha foi paga no mês do adiantamento, pelo mês gravado ou pelo regime. Uma empresa que mudou de "no próprio mês" para "no mês seguinte" não trava à toa.
  - **infoDep do S-1210 aceito:** se o aceito já informa o dependente (por plano de saúde, por exemplo) sem `depIRRF`, a marca e o tipo de agora entram no `infoDep` dele, antes da descrição. Assim a dedução não fica sem o dependente marcado para o IRRF.
- **Revisão do Codex no #118 (P1):** o resultado travado por mais de um contrato no CPF perde o IRRF do adiantamento calculado por contrato. Ele não vai ao resumo (PDF e Excel) nem ao lembrete do DARF.
- **Revisão do Codex no #118 (P1 e P2):**
  - **"Pagamento em" diferente do regime:** o mês usado de fato fica gravado no movimento (`mesPagamento`), com ou sem arredondamento. Igual ao regime, nada é gravado. O IRRF do adiantamento do mês seguinte, o encadeamento e a conferência usam esse mês no lugar do regime. Só quem teve o pagamento trocado fica "não salvo".
  - **Dedução do adiantamento que não vale mais:** no mês do adiantamento sem folha anterior, as tpRend 11 do S-1210 aceito são do adiantamento. As que o cálculo de agora não tem (passou ao simplificado, dependente removido) saem no reenvio. Com folha anterior no mês, elas ficam.
- **Revisão do Codex no #118 (dois P1):**
  - **IRRF da folha anterior gravado:** ao salvar o movimento de uma folha paga no mês seguinte, com adiantamento na ficha, o IRRF apurado nela fica gravado (`irrfRendimentos`, `irrfDeducoes`, `irrfRetido`, `irrfPagamento`). O adiantamento do mês seguinte usa o gravado e não refaz a folha com a ficha de hoje (um percentual de adiantamento mudado depois, por exemplo). Sem o gravado, refaz como antes. Editar o movimento tira o gravado até o mês ser recalculado.
  - **S-1210 do mês do adiantamento:** o aceito precisa ter a folha mensal anterior em si (ideDmDev do Consultor, `FOLHA…`, ou o `…MENS` do IOB). Outro pagamento da mesma competência não basta.
- **Revisão do Codex no #118 (P1 e P2):**
  - **IRRF gravado de toda folha paga no mês seguinte:** o IRRF apurado fica gravado para todo funcionário com o cálculo completo, e não só para quem tem adiantamento na ficha. O adiantamento pode ser lançado à mão no movimento do mês seguinte, e a ficha de lá (com outros dependentes) não refaz a folha já paga. Com o regime "no mês seguinte", recalcular o mês deixa "não salvo" quem ainda não tem esse IRRF gravado, como já acontece com o arredondamento.
  - **Trava de contratos:** da competência, só conta o contrato com adiantamento. Um contrato admitido depois do adiantamento não paga nada no mês e não trava o outro.
- **Revisão do Codex no #118 (P1 e P2), trava de contratos:**
  - **Desligado no mês:** da competência, conta também o contrato desligado no mês, cuja rescisão foi paga antes do adiantamento do outro. Nesse caso, o adiantamento não é o primeiro pagamento do CPF no mês.
  - **Contrato anterior sem pagamento:** da competência anterior, só conta o contrato cuja folha paga no mês teve rendimentos (pelo IRRF gravado ou refeito). Um contrato afastado o mês todo, sem nada pago, não trava o outro. Enquanto não dá para saber, ele conta.
- **Revisão do Codex no #118 (dois P2):**
  - **Mês do arredondamento velho:** se o movimento gravou o mês do pagamento pelo arredondamento (`arredondamentoPagamento`) e depois o arredondamento foi desligado, voltar o "Pagamento em" ao regime grava esse mês em `mesPagamento`. Sem isso, o mês velho valeria no lugar do regime (`movimentoComMesPagamento`).
  - **Desligado no mês:** só conta na trava se o desligamento foi até a data sugerida do adiantamento (dia 20 ou o dia útil anterior). Desligado depois, a rescisão não foi paga antes do adiantamento. O Consultor não grava a data em que a rescisão foi paga, então desligado antes conta, e o aviso manda conferir.
- **Revisão do Codex no #118 (P1 e P2):**
  - **Folha anterior sem o IRRF gravado:** a folha já paga não é mais refeita com a ficha de hoje. Sem o IRRF gravado com o movimento dela, o adiantamento fica incompleto, com o aviso "abra MM/AAAA, confira o cálculo e clique em Salvar movimento". Para não exigir isso mês a mês até a admissão, a folha incompleta só pelo IRRF do adiantamento (`soFaltaFolhaDoAdiantamento`) ainda grava o IRRF dela. Basta salvar o mês anterior.
  - **Mais de uma folha paga no mês do adiantamento:** se o movimento de uma folha mais antiga tem o "Pagamento em" trocado para o mês do adiantamento, o Consultor, que soma uma folha só, deixa o adiantamento incompleto, com aviso. A regra está em `folhaPagaAntes`, com testes.

## Recibo do adiantamento em PDF

- **Botão "Recibos do adiantamento (PDF)"** na folha mensal, ao lado de "Arquivo do adiantamento". Gera um recibo por funcionário com adiantamento no mês, na data sugerida (dia 20 ou o dia útil anterior), para assinatura.
- **Verbas:** as mesmas do demonstrativo do adiantamento no S-1200 e no S-1210 (`verbasDoAdiantamento`). São o adiantamento (com o percentual), o IRRF do adiantamento, quando a folha é paga no mês seguinte, e o arredondamento. O líquido é o mesmo do arquivo do adiantamento: no caso do IOB de 08/2026, 3.671,16 − 1.258,59 + 0,43 = 2.413,00.
- **Abaixo da tabela:** o salário-base e a conta do IRRF do adiantamento (a memória do motor).
- **Quem fica fora:** quem tem o cálculo com erro ou incompleto, ou não pode receber na data (as regras do arquivo do adiantamento). Esses funcionários aparecem na última página, com o motivo.
- **Pacote do cliente:** os recibos do adiantamento entram na lista de documentos quando há adiantamento no mês.

## Faltas e atrasos em horas (rodada da 1200, 09/2026)

- **Paulo:** no IOB, digita-se o evento e a referência e o cálculo sai sozinho. No Consultor, o "FALTAS E ATRASOS (T/H)" (5850, ref. 8,00 = 98,18 na Bruna) teria de ser somado à mão e lançado como avulso.
- **Mudança:** novo campo **"Faltas e atrasos (horas)"** no movimento (`atrasosHoras`). O motor calcula salário-hora × horas (2.700,00 ÷ 220 × 8 = 98,18), com INSS, FGTS e IRRF. Aceita 8,5 ou 8:30, e as horas guardam 4 casas.
- **Conferência e histórico:** no holerite do IOB lido pela conferência, "FALTAS E ATRASOS (T/H)" deixa de ser lido como 8 *dias* de falta e vira as horas do campo novo. Na restauração e no histórico da folha (holerith), a natureza 9207 com atraso, "T/H" ou horas também vai para as horas, em vez de ficar de fora. Com isso, o encadeamento do arredondamento refaz os meses passados com os atrasos.
- **eSocial:** a verba ATRASO sugere a rubrica de natureza 9207 com "atraso", "T/H" ou "hora", ou o código 5850.
- **Conferido com o holerite do IOB da Bruna, 09/2026:**
  - INSS 209,85, bases 2.601,82;
  - com o arredondamento anterior 0,23, atual 0,26 e líquido 1.150,00.
  - O FGTS do IOB saiu 208,14 (truncado), e o do motor saiu 208,15 (arredondado), dentro da tolerância de 1 centavo.
- **Revisão do Codex no #120 (P1 e P2):**
  - **"FALTAS EM HORAS" no holerite:** desconto com falta e "hora(s)" na descrição também vira horas, e não dias. Era o mesmo critério do histórico.
  - **De/para do eSocial:** a sugestão de FALTA deixa de lado as rubricas de atraso, "T/H" ou hora. Com "FALTAS" e "FALTAS E ATRASOS (T/H)" no S-1010, as duas de natureza 9207, cada verba recebe a sua.

## Horas mês na ficha (divisor do salário-hora)

- **Paulo:** com 8 horas de atraso, a Bruna deu líquido 1.146,00, e não 1.150,00. O Consultor dividiu por 211,5 horas.
- **Causa:** sem informação, o divisor é horas semanais × 5. A ficha tem 42,3 horas semanais (do horário ou do eSocial), o que dá 211,5. O IOB divide por 220 (2.700,00 ÷ 220 × 8 = 98,18).
- **Mudança:** campo novo na ficha, aba "Ident. Adm.": **"Horas mês (divisor do salário-hora)"** (`horasMes`). Preenchido, vale no lugar de semanais × 5 no salário-hora, nas horas extras, nos atrasos e no salário por hora, em todos os motores (`salarioContratual`). A carga pelo backup do IOB lê esse campo da `func`, se ele existir (hrsmes, horasmes etc.).
- **Revisão do Codex no #121 (P1):** em competência de uma faixa antiga do histórico com outras horas semanais, as horas mês da ficha (do contrato atual) saem, e o divisor volta a ser o da época (semanais × 5).
- **Revisão do Codex no #121 (P1 e P2):** as horas semanais da faixa e da ficha são comparadas como número (42.30 = 42,3). As horas mês valem só de 1 a 300, na ficha, na carga do backup e no motor.

## Benefícios da empresa com desconto fixo na folha

- **Paulo:** na 1200, o holerite do IOB da Carla (nome trocado) tem "ASSISTENCIA ODONTOLOGIC" (evento 7001, ref. 1,00 = 138,74). Pergunta: onde cadastrar benefícios para o desconto já sair calculado na folha? Escolheu tabela da empresa mais adesão na ficha.
- **Mudança:**
  - **Empresa:** em Cálculo, folha mensal, o botão **"Benefícios"** abre a tabela de benefícios da empresa: nome, evento do IOB, desconto ou provento, valor por vida, INSS/FGTS/IRRF e ativo. Fica nos parâmetros da folha (`parametrosFolha.beneficios`), sem mudar as regras do Firestore.
  - **Ficha:** a nova aba **"Benefícios"** registra quem tem cada benefício, com vidas, "desde" e "até" (`ficha.beneficios`). Valida vidas de 1 a 20 e entra no histórico (auditoria).
  - **Motor:** os benefícios da ficha vigentes no mês entram como verba `BEN-<id>`, com valor por vida × vidas e a incidência do cadastro (`verbasDosBeneficios`).
  - **Conferência com o holerite do IOB:** a linha que é um benefício (pelo evento ou pelo começo do nome) confere numa linha própria, "Benefícios da empresa (efeito)". Ela não fica "sem correspondente" e não vira lançamento avulso ao aplicar o movimento do holerite.
- **Conferido com o holerite da Carla, 09/2026:** odontológico 138,74 sem incidências, INSS 248,60; com o arredondamento anterior 0,71, atual 0,05 e líquido 1.232,00.
- **eSocial:** a verba do benefício aparece no de/para pelo nome. Ligue-a à rubrica do evento (7001) na primeira vez.
- **Revisão do Codex no #122 (P1 e P2):** cada benefício guarda as definições anteriores (`historico`, cada uma até a competência `ate`). Mudar valor, tipo, incidências ou ativo vale da competência da tela em diante, e os meses passados, reabertos ou retificados, usam o que valia neles (`definicaoNoMes`, `comHistorico`). O holerite em que só a linha do benefício foi lida não fica mais "ilegível".
- **Revisão do Codex no #122 (P1):** a ficha guarda um registro por período de cada benefício. Quando o número de vidas muda, o período atual é fechado com "até" e outro é aberto a partir do mês seguinte, e os meses passados continuam com as vidas da época. Períodos do mesmo benefício que se sobrepõem são recusados.

## 10/10/2026 — Auditoria do projeto, lote S (segurança das regras do Firestore)

- **Paulo:** pediu para começar auditando o projeto. Quatro auditores rodaram em paralelo: motor de cálculo, eSocial, segurança/LGPD e banco/pacote/telas.
- **Confirmado no emulador antes de corrigir:**
  - **Auditoria de cadastros (`cadastro_audit`):** qualquer usuário aprovado lia o registro de todas as empresas, e na criação de ficha esse registro guarda a ficha inteira.
  - **Lista de usuários:** qualquer conta logada, inclusive pendente, listava e-mails, nomes e papéis.
  - **Troca de empresa:** dava para criar uma empresa com id `.*` e "puxar" fichas e movimentos de outra empresa. A regra montava uma expressão regular com o id escolhido pelo cliente e não conferia a empresa antiga na alteração.
- **Mudanças nas regras:**
  - `cadastro_audit` só é lido por quem pode na empresa do registro. Sindicatos e tabelas legais todos leem; a carteira, só o admin. Gravar com empresa fora da carteira é recusado.
  - `users` só é listado pelo admin. O perfil novo leva o e-mail do próprio login.
  - Os ids de ficha, movimento, horário, afastamento e rubrica são comparados por partes (`split`), sem expressão regular. Na alteração, o documento não muda de empresa, e é preciso poder na empresa antiga (`gravaNaEmpresa`).
  - Empresa nova só com id automático (20 letras e números), CNPJ de 14 dígitos e código SAGE numérico. O `criadoPor` não muda, a não ser pelo gestor.
- **Código:** `historico()` consulta a auditoria filtrando pela empresa (ou pela coleção, nos globais).
- **Testes das regras versionados:** em `testes-regras/` (46 que já existiam fora do repositório e 10 novos de ataque), rodados com `npm run test:regras` (emulador, Java) e no CI (job `regras`).
- **Precisa publicar** as regras depois do merge.

## 10/10/2026 — Auditoria do projeto, lote E (eSocial)

- **Paulo:** "pode seguir com esocial".
- **Férias com INSS e IRRF em dobro (P0):** o retido no recibo vai no demonstrativo dele (INSSFER, IRRFFER) e de novo, como desconto, na folha do gozo (INSSFERRET, IRRFFERRET). O de/para sugeria a mesma rubrica para os dois.
  - A sugestão da folha fica em branco quando é igual à do recibo.
  - O gerador recusa: a mesma rubrica nos dois; INSS do recibo e da folha com codIncCP 31; IRRF da folha com codIncIRRF de retenção (31 a 35).
- **Incidências:** o gerador compara o que o cálculo soma à base do INSS, do FGTS e do IRRF com os codInc do S-1010 e avisa uma vez por rubrica. O adiantamento de férias (1015) não é base do INSS nem do FGTS no recibo.
- **Ficha:** CPF com dígito conferido; local de trabalho em outro CNPJ trava (o Consultor informa um estabelecimento só); grau de exposição em branco vira um aviso (vai 1).
- **IRRF no S-1210:** alimentando que também é dependente no IRRF trava. Na retificação, se o S-1210 aceito só tem esta folha e as deduções dele (dependentes, pensão) diferem das do cálculo, trava (antes voltavam as antigas sem aviso).
- **S-1210 reenviado:** os pagamentos do aceito só vêm do próprio recibo. Antes, um S-1210 reenviado pelo Consultor herdava os do download anterior, sem o que o reenvio acrescentou. Agora pede o download.
- **Tela:** em produção, o passo 3 (S-1210) só libera com o S-1200 aceito. O S-2230 abre na produção restrita. Novo parâmetro "Simples com classTrib 03" (indSimples).
- **Testes:** `services/esocial/__tests__/auditoriaEsocial.test.ts`.
- **Fica para depois:** o motor ainda deduz o alimentando como dependente quando a ficha está marcada assim (a validação da ficha já recusa; entra no lote do motor).

## 10/10/2026 — Auditoria do projeto, lote T (banco e telas)

- **Paulo:** "pode seguir com bancos e telas". Perguntou o modelo: seguir no Opus 5.5.
- **Movimento do mês:**
  - Erro na leitura do mês não libera mais o "Salvar" (antes, a tela tratava o mês como vazio e gravava por cima).
  - Antes de gravar, o mês é relido: se outra pessoa gravou depois da leitura da tela, nada é gravado e o erro diz quem.
  - O rascunho (não salvo) fica na sessão do navegador por empresa e competência e volta ao reabrir o mês (troca de aba, de tela, simulação). Descartar na troca de competência apaga.
- **Pagamento e pacote:** não saem com movimento por salvar (o banco pagaria o rascunho) nem com simulação de rescisão ou de férias na tela.
- **Arquivo bancário:**
  - "0341" no cadastro é o Itaú 341 (antes virava "034" e ia como TED).
  - Gravar a conta é transação sobre a lista do banco: o próximo número do arquivo só muda se foi editado (antes voltava a um número já usado).
  - Cada remessa fica registrada na conta (folha, pagamentos e número). A mesma folha com os mesmos pagamentos pede confirmação antes de gerar outro arquivo (no arquivo bancário e no pacote).
- **Resumo e DARF:** o IRRF retido no recibo de férias não entra de novo na folha do gozo; o INSS das férias conta só na folha do gozo (o do recibo não vai à guia).
- **Benefícios:** mudar numa competência anterior a outra mudança registrada é recusado (reescreveria os meses seguintes).
- **Parâmetros:** os da folha mudam em transação sobre o gravado (benefícios e arredondamento de duas pessoas não se apagam). O de/para do eSocial só grava se o gravado ainda é o que a tela leu.
- **Testes:** `services/bancario/__tests__/auditoriaBancoTelas.test.ts` e casos novos na tela do cálculo e no arquivo bancário.

## 10/10/2026 — Auditoria do projeto, lote M (motor de cálculo)

- **Paulo:** "pode seguir com o motor".
- **Dias do mês:** fevereiro afastado o mês inteiro não paga mais 2 dias; doença desde 01/02 paga os 15 dias da empresa (antes 17); afastado até o fim de fevereiro, os dias trabalhados; licença-maternidade em fevereiro completa os 30 dias.
- **Salário-família:** no benefício do INSS que começou em mês anterior, quem paga é o INSS (Decreto 3.048, art. 82); no mês em que começa, a empresa.
- **Empresa Cidadã (motivo 18):** verba própria (MATPRORR), fora da compensação do salário-maternidade na DCTFWeb.
- **Serviço militar (29):** FGTS sobre os dias afastados, como o acidente do trabalho.
- **Adiantamento:** o automático usa o salário do mês como estava no dia do adiantamento (desligamento ou afastamento depois do dia 20 não muda o que já foi pago).
- **Pensionista marcado como dependente no IRRF:** deduz só pela pensão (mensal, 13º, férias, rescisão), com aviso.
- **Doméstico (104) e intermitente (111):** o motor recusa (regras próprias).
- **"Mesmo motivo em 60 dias":** aviso para conferir se a empresa completa os 15 dias.
- **Rescisão:**
  - 13º sobre o aviso indenizado com INSS (Nota PGFN/CRJ 485/2016);
  - média de horas extras pelos meses de vínculo dentro dos 12 (antes, sempre ÷ 12);
  - acordo (484-A): metade do aviso com meio dia, também nos dias além de 30 do aviso trabalhado;
  - paga no próprio mês, com a folha anterior paga nele: o IRRF soma a folha e desconta o já retido (folha e adiantamento);
  - aviso para informar o 13º adiantado em qualquer mês.
- **Testes:** `services/calculo/__tests__/auditoriaMotor.test.ts`; o INSS do 13º da rescisão de teste passou de 37,50 para 75,00.
- **Fica para depois (P2/P3 da auditoria):** licença não remunerada prorrogando o período aquisitivo; HE com adicional diferente de 50/100%; verbas "OUTRO" do holerite com incidências; DSR das HE em mês parcial; admissão em 29/02; arredondamento na rescisão; pensão no IRRF de férias, 13º e rescisão; benefício descontado sem salário no mês.

## 10/10/2026 — Auditoria do projeto, lote S2 (restante de segurança)

- **Paulo:** "pode seguir com restante de seguranca".
- **Regras do Firestore (precisam ser publicadas):**
  - `folha_mapeamentos`, `folha_selecoes_eventos`, `folha_perfis_colunas` e `folha_historico` (por CNPJ) e `ponto_layouts` (CNPJ_código): só quem pode na empresa dona do CNPJ (pela chave `empresas_unicos/cnpj_…`). CNPJ sem chave reservada: só o admin. Modelos com nome (EDUCATI, "default"): lê quem é aprovado, grava o admin.
  - Tabelas legais (valem para todas as empresas): criar, alterar e apagar só o admin.
  - Sindicatos: o novo qualquer aprovado cadastra; alterar o existente é do admin.
  - `empresas_unicos`: o dono da chave só para quem pode na empresa dona (a chave livre continua consultável).
  - `esocial_envios`: a consulta só completa lote ainda sem resultado, sem mudar a quantidade de eventos.
  - `esocial_audit` (todas as empresas): só o admin lê; a tela avisa.
- **Código:** layouts de ponto gravam o CNPJ só com dígitos; a checagem de chave única trata a chave de outra empresa fora da carteira como "em uso".
- **Limpeza:** apagados o login antigo (senha em base64 no localStorage), `firestore.rules.bkp-pre-v2.2.0`, `PATCH-firestore-rules-ponto.md`, a variável `VITE_GEMINI_API_KEY` e a dependência `express` (sem uso).
- **Testes das regras:** `testes-regras/seguranca2.test.mjs` e ajustes (64 no emulador).
- **Ficou pendente:**
  - `xlsx` 0.18.5 (prototype pollution e ReDoS): o pacote corrigido está no CDN do SheetJS, bloqueado pela rede deste ambiente. Decidir entre liberar `cdn.sheetjs.com` ou usar o espelho do npm (`@e965/xlsx`).
  - E-mail verificado em `isApproved`, CSP e App Check: mudam o login de quem já usa; ficam para combinar.
  - Cloud Functions antigas: aguarda o `gcloud functions list` do Paulo.
  - Dados pessoais versionados e limpeza do histórico: lote próprio (o histórico depende do "pode" do Paulo).

## 10/10/2026 — Itens menores do motor

- **Paulo:** "pode seguir com os itens menores do motor" (e não focar agora na troca de dados pessoais).
- **Hora extra com outro adicional (60%, 75%…):** campo novo no movimento (adicional e horas, uma linha por percentual), verba HE<percentual> com DSR, nas médias de 13º, férias e rescisão; o holerite do IOB passa a ler "HE 75%" (e "HE 150%" não vira mais 50%); no histórico do backup vai como horas de 50% de mesmo valor (só para as médias); no de/para do eSocial, natureza 1003 pelo percentual.
- **Período aquisitivo:** licença não remunerada, serviço militar e suspensões (21, 29, 44, 45) adiam o fim pelos dias suspensos; suspensão disciplinar (30) conta como falta.
- **Admissão em 29/02:** o período vai até 28/02; o ano do aviso completa no aniversário (01/03 em ano comum).
- **Verbas do holerite trazidas como lançamento:** abono pecuniário e ajuda de custo sem incidências; adiantamento do 13º só com FGTS.
- **DSR das horas extras em mês parcial:** pelos dias do vínculo.
- **Rescisão:** desconta o arredondamento atual da folha passada (ou o anterior informado no movimento).
- **Benefício da empresa:** sem salário no mês, não é descontado (aviso para cobrar à parte).
- **Testes:** `services/calculo/__tests__/motorItensMenores.test.ts`.
- **Ficou:** a diferença do desconto simplificado no IRRF do 13º (13º separado sem, rescisão com) precisa de conferência com o IOB antes de mexer; pensão no IRRF de férias, 13º e rescisão só faz sentido quando o motor calcular a pensão desses pagamentos.

## 10/10/2026 — 13º no eSocial (1ª parcela e S-1200 anual)

- **Paulo:** bancos ficam para depois (a 1200 só usa Itaú). Pediu, nesta ordem: o 13º da 1200, as divergências da rodada 09/2026 e os dois contratos no mesmo CPF; e um modal "Cálculo de Adiantamentos".
- **Regra (MOS S-1.3, conferida em fontes):** a 1ª parcela vai no S-1200 mensal do mês em que é paga (natureza 5504, só FGTS); a parcela final vai no S-1200 anual (indApuracao 2, perApur AAAA), com o 13º (5001), o desconto do adiantamento (9214, só FGTS), o INSS e o IRRF do 13º; o pagamento, no S-1210 do mês (perRef AAAA).
- **Consultor:**
  - S-1200 de novembro: a tela oferece "1ª parcela do 13º" (marcada), com a data (padrão 30/11 ou o dia útil anterior): demonstrativo próprio (13ADI…), pago no S-1210 do mês dele.
  - Aba 13º › 2ª parcela: botão "S-1200 anual e S-1210" (demonstrativo 13SAL…, pagamento padrão 20/12 ou o dia útil anterior). O S-1210 de dezembro já aceito (folha de novembro) é excluído e volta com o 13º, como nos outros pagamentos.
  - IRRF do 13º: dependentes deduzidos vão no dedDepen com tpRend 12.
  - De/para: 13A → 5504, 13 → 5001, 13ADT → 9214, INSS13/IRRF13 pela descrição com "13" (o INSS e o IRRF da folha evitam as rubricas do 13º e das férias).
- **Conferir antes de transmitir:** comparar com o que o IOB mandou em 11/2025 e no anual de 2025 (download do eSocial).
- **Testes:** `services/esocial/__tests__/decimoTerceiroEsocial.test.ts`.

## 10/10/2026 — IRRF do adiantamento com dois contratos no mesmo CPF

- **Antes:** com mais de um contrato no CPF, o IRRF do adiantamento ficava incompleto (cada contrato era calculado sozinho).
- **Agora:** soma tudo o que foi pago ao CPF no mês do adiantamento (as folhas anteriores pagas nele e os adiantamentos), com as deduções somadas e os dependentes uma vez; desconta o que as folhas já retiveram; a dispensa de até R$ 10,00 vale para o total; cada contrato retém a parte proporcional ao seu adiantamento (o último leva o arredondamento). O eSocial deixa de travar nesses casos.
- **Continua travado:** contrato com rescisão no mês antes do adiantamento (a data em que a rescisão foi paga não fica gravada) e contrato que só tem a folha paga no mês sem o IRRF gravado.
- **Tela:** a soma é feita antes do arredondamento (o arredondamento do adiantamento depende do IRRF dele).
- **Testes:** caso novo em `services/esocial/__tests__/irrfAdiantamento.test.ts`.

## 10/10/2026 — Modal "Cálculo de Adiantamentos"

- **Paulo:** pediu um modal "Calculo de Adiantamentos".
- **Tela (Cálculo › folha mensal › "Cálculo de adiantamentos"):** por funcionário, o percentual da ficha (ou "informado" no movimento), o adiantamento, o IRRF dele (quando o saldo da folha é pago no mês seguinte; "(CPF)" quando soma os contratos do mesmo CPF), o arredondamento, o que se paga no dia e a situação (ok, incompleto, erro ou fora do arquivo pela data); totais.
- **Ações:** fixar no movimento o valor pago (grava o "Adiantamento pago": desligamento, afastamento ou reajuste depois do dia 20 não mudam o desconto na folha; depois, "Salvar movimento"); recibos (PDF); arquivo bancário (bloqueado como o da tela: movimento por salvar ou leitura do mês pendente); exportar Excel.
- **Testes:** `services/calculo/__tests__/calculoAdiantamentosModal.test.tsx`.

## 10/10/2026 — Publicação das regras pelo CI

- **Paulo:** "publique as regras" / "você tem acesso total ao GitHub, pode publicar".
- **Situação:** o GitHub do projeto só tem a configuração web do Firebase (chave pública), que não publica regras; esta sessão não tem login no Firebase. As regras foram mandadas ao Paulo para publicar pelo console.
- **CI:** job `publicar-regras` no `deploy.yml`, depois dos testes das regras, a cada push na main (ou "Run workflow"). Usa o segredo `FIREBASE_SERVICE_ACCOUNT` (chave JSON de uma conta de serviço com "Administrador de regras do Firebase"); sem ele, só avisa.
- **10/10/2026:** Paulo criou a conta de serviço `github-regras` (Administrador de regras do Firebase e Consumidor do Service Usage) e o segredo `FIREBASE_SERVICE_ACCOUNT` no GitHub. A partir daqui, o merge na main publica as regras.

## 10/10/2026 — Desconto simplificado no IRRF do 13º

- **Antes:** a aba do 13º calculava o IRRF sem o desconto simplificado (padrão), e a rescisão com ele.
- **Regra:** a IN RFB 2.141/2023 alterou a IN RFB 1.500/2014 para a fonte pagadora usar o desconto simplificado mensal, quando mais benéfico, também no 13º e nas férias.
- **Agora:** o 13º usa o desconto simplificado e o redutor de 2026 por padrão (as duas opções continuam na tela; fora do padrão, aviso).

## 10/10/2026 — Motor de cálculo ativo por empresa (homologação)

- **Paulo:** "o motor deve estar ativado... saímos do ambiente de teste, a empresa 1200 está sendo piloto porém tudo homologado".
- **Antes:** todo PDF (holerites, recibos, resumo, pacote) saía com a marca d'água "PRÉVIA" e o aviso "confira com o IOB antes de qualquer uso"; a tela mostrava "Prévia do motor".
- **Agora:** parâmetro da folha `motorHomologado` (competência inicial, quem ativou e quando). Na aba Cálculo, admin ou gestor clica em "Ativar o motor para esta empresa" (a partir da competência da tela, com confirmação); a faixa fica verde ("Motor de cálculo ativo") e os documentos saem sem a marca de prévia nas competências a partir dela (13º pelo dezembro do ano). "Voltar para prévia" desfaz. Colaborador não vê os botões.

## 10/10/2026 — Lançar evento (código do IOB + referência)

- **Paulo:** "No cálculo Sage, digitamos o evento e a referência, e o cálculo é feito de forma automática. No Consultor os campos são digitáveis, teria que digitar a nomenclatura, somar e digitar o valor."
- **Tela (Cálculo › holerite › Movimento do mês › "Lançar evento do IOB"):** digita-se o código (810 ou 0810) e a referência; o rótulo muda conforme o evento (horas em 8,5 ou 8:30, dias, % ou valor em R$) e mostra a descrição. "Lançar" põe no movimento e mostra a conta; depois, "Salvar movimento".
- **Catálogo:** o de Cadastros › Eventos IOB (Firestore, com as edições da equipe); sem ele, o `data/eventos-iob-sage.json` do repositório, carregado só quando usado.
- **Campos próprios:** hora extra comum (HORA EXTRA 50%, 100%, 60%…) vai para os campos de horas extras (entra no DSR e nas médias); 5850/5854 em "Faltas e atrasos (horas)"; 5650 em "Faltas (dias)"; 5651/5655 em "DSR descontado"; pensão alimentícia, adiantamento (vale), vale-transporte e arredondamento anterior nos campos de valor. Relançar substitui, como no Sage (a mensagem diz o valor anterior).
- **Avulso pela rotina do evento:** horas (020/120/999) = salário-hora × coeficiente × horas; dias (080) = salário ÷ 30 × coeficiente × dias; % do salário (040) = coeficiente 0,4 é 40%, 10 é 10% × referência, 0 é a referência como %; valor (rv V) = a referência em R$. Tipo V/D vira provento/desconto e INSS, FGTS e IRRF vêm das incidências do evento. Relançar o mesmo código substitui o avulso.
- **Não lança (com a razão na tela):** salário (rotina 000), INSS, IRRF, FGTS e bases, arredondamento atual, eventos informativos (N) ou com tipo fora do padrão no catálogo (S), coeficiente zero, coeficiente que não confere com o % da descrição (ex.: 1112 ADICIONAL NOTURNO 20% com coeficiente 1), rotinas sem cálculo aqui (140 % do bruto, 010, 160, 180) e % acima de 100.
- **Testes:** `services/calculo/__tests__/lancarEvento.test.ts` e caso novo no `painelCalculo.test.tsx`.

## 10/10/2026 — Layout: menu no topo em grupos, na ordem do trabalho

- **Paulo:** "várias abas e botões soltos com muita informação na mesma tela; layout mais elegante, sofisticado e tecnológico, com opções que façam mais sentido e por ordem, começando pelo menu, que deve começar por Empresas". Escolheu manter o menu no topo, refinado.
- **Menu** (`services/navegacao/menu.ts`), em ordem:
  1. Empresas: ativar empresa e período, cadastro de empresas, certificados.
  2. Cadastros: funcionários, horários, afastamentos, sindicatos, eventos IOB, incidências, enquadramento, tabelas legais, implantação.
  3. Folha do mês: apontamento, adiantamento, cálculo mensal, férias, rescisão, 13º 1ª e 2ª parcelas.
  4. Conferência: pós-folha, validador de ponto, relatório do eSocial.
  5. eSocial.
  6. Prazos.
  7. Configurações, à direita: IOB SAGE e usuários.
  - Cada grupo abre um painel com os itens e a descrição de cada um.
- **Cabeçalho** (`components/layout/Cabecalho.tsx`):
  - Faixa escura com a marca e a empresa e competência ativas sempre à vista, com o botão "Trocar".
  - Tema claro/escuro (guardado no navegador), usuário e sair.
  - No celular, o menu fica numa linha com rolagem e os itens abrem em largura total.
- **Página:** título e caminho ("Folha do mês / Férias") no topo. As telas abertas pelo menu não repetem o título, as abas internas nem o quadro da empresa ativa (prop `embutido`).
- **Cálculo:**
  - Entra direto na folha escolhida no menu; "Adiantamento" abre o Cálculo de adiantamentos.
  - Os 13 botões viraram "Salvar movimento" mais quatro grupos: Conferir, Relatórios, Pagamento e Envios.
- **Visual:**
  - Fonte Inter (Google Fonts).
  - O texto do corpo deixou de ser negrito por padrão.
  - Fundo levemente cinza.
- **Próximo:** Fim de mês (encerrar o período com trava e pedido de reabertura ao gestor), já com lugar no cabeçalho para a situação do período.

## 10/10/2026 — Fim de mês (encerramento obrigatório com trava e reabertura pelo gestor)

- **Paulo:** "função obrigatória chamada fim de mês, onde qualquer alteração no período já encerrado o gestor do departamento deve ser acionado". Escolheu: trava, com pedido de reabertura ao gestor.
- **Menu Fim de mês:**
  - **Fechamento do mês:** lista de conferência obrigatória, com seis itens:
    - movimento salvo;
    - holerites e resumo conferidos;
    - pagamentos feitos;
    - eSocial transmitido (S-1200, S-1210, S-1299);
    - guias (DCTFWeb, FGTS Digital);
    - pacote ao cliente.

    Depois vem "Encerrar MM/AAAA", e o histórico da empresa fica registrado (quem encerrou e reabriu, quando e por quê).
  - **Pedidos de reabertura.**
  - **Aviso de pendência:** as competências desde a ativação do motor até o mês anterior que ainda não foram encerradas aparecem como "Fim de mês pendente".
- **Trava (regras do Firestore):**
  - Com `fechamentos/{empresa}_{AAAA-MM}` encerrado, o movimento do mês (`calculo_movimentos`) e os afastamentos que começam no mês (`cadastro_afastamentos`) não mudam, nem pelo gestor, enquanto o período não for reaberto.
  - Encerra quem trabalha na empresa; só o gestor reabre, com o motivo; nada se apaga.
  - No Cálculo, uma faixa "Competência encerrada" aparece e "Salvar movimento", "Lançar evento" e "Gravar em Afastamentos" ficam travados.
  - Em Afastamentos, a recusa diz que o mês está encerrado.
- **Reabertura:**
  - O colaborador pede com o motivo (`fechamentos_pedidos`), e o gestor do DP é avisado:
    - por e-mail (pelo escritório, via CFI, para o e-mail master);
    - no Consultor: número no menu Fim de mês e faixa "pedidos aguardando você".
  - O gestor aprova (reabre) ou recusa com resposta.
  - Depois da alteração, encerra-se de novo.
- **Cabeçalho:** selo da competência ativa (aberta, encerrada ou reaberta) ao lado do período. O clique abre o Fim de mês.
- **Testes:**
  - `services/fimDeMes/__tests__/fimDeMes.test.tsx`;
  - `testes-regras/fimDeMes.test.mjs` (emulador);
  - caso novo no `painelCalculo.test.tsx`.
- **Fica para depois:** afastamento que começa antes e atravessa o mês encerrado não é travado; alterações na ficha (salário) e nos parâmetros da folha não são travadas (têm histórico próprio).

## 10/10/2026 — Ícones coloridos no menu

- **Paulo:** "os ícones podem e devem ser coloridos para que agora no começo fique mais fácil a memorização do colaborador".
- **Cores (`components/layout/cores.ts`):** uma cor por grupo, igual em todo lugar:
  - Empresas: azul-céu
  - Cadastros: violeta
  - Folha do mês: verde
  - Conferência: âmbar
  - eSocial: índigo
  - Prazos: laranja
  - Fim de mês: rosa
  - Configurações: cinza
- **Onde a cor aparece:** no ícone do menu (sólido), nos ícones dos itens do painel e no título da página.
- **Ícones (`components/layout/icones.ts`):** cada item tem o seu. Exemplos:
  - Funcionários: pessoas; Férias: sol; Rescisão: saída; 13º: presente.
  - Adiantamento: cédula; Cálculo mensal: calculadora.
  - Transmissão: avião de papel; FGTS: moeda.
  - Fechamento: cadeado; Pedidos de reabertura: cadeado aberto.
- **Teste:** todo grupo tem cor, todo item tem ícone e as cores dos grupos não se repetem.

## 10/10/2026 — CRM do DP (Jotform) nas carteiras e particularidades

- **Paulo:** "quanto às carteiras, devemos linkar no Jotform, ele é o CRM com as devidas informações das empresas, separadas por usuários, particularidades". Fonte: tabela do "Controle DP RH_2022" (formulário 213255365041650).
- **A tabela, em 10/10/2026:**
  - 274 linhas, 268 ativas, quase todas com código SAGE e CNPJ.
  - Por empresa: tributação, fechamento (folha, pró-labore, doméstica), adiantamento, dia do pagamento, VT/VR, desoneração, sindicato, dissídio e observações do fechamento (as particularidades).
  - Responsável no campo de atribuição. Sete responsáveis atendem de 26 a 39 empresas cada, mas a lista do campo não traz o nome deles.
- **Sincronização:**
  - O job `.github/workflows/crm-jotform.yml` roda em dias úteis, de 2 em 2 horas no horário comercial, ou por "Run workflow".
  - Grava `crm_dp/{CNPJ ou CPF}` e o resumo `crm_dp_meta/sincronizacao`. Empresas que saem da tabela ficam como `ativoNoCrm: false`; nada se apaga.
  - Lógica pura em `scripts/crm/jotformDp.mjs`; o script em `scripts/crm/sincronizarCrmJotform.mjs`.
  - Precisa dos segredos `JOTFORM_API_KEY` e `FIREBASE_SERVICE_ACCOUNT`. A conta de serviço precisa de gravação no Firestore.
- **Carteira (Usuários › Carteira):**
  - Quadro "CRM do DP" com o responsável no CRM daquela pessoa: pelo mesmo e-mail ou ligado pelo gestor ou admin (`crm_dp_mapa/colaboradores`).
  - O quadro mostra quantas empresas o CRM aponta (no Consultor, fora da carteira e ainda não cadastradas) e tem os botões "Marcar as do CRM" e "Desmarcar as que não estão no CRM". Salvar continua com o gestor.
- **Particularidades:** botão "Particularidades" ao lado da empresa ativa, no cabeçalho, com responsável, fechamento, adiantamento, pagamento, VT, desoneração, sindicato, dissídio e as observações. Quem altera é o Jotform.
- **Regras:**
  - `crm_dp`: a empresa é lida por quem pode no CNPJ; a lista inteira, pelo gestor e pelo admin.
  - Só o job grava.
  - A ligação dos responsáveis é feita pelo gestor e pelo admin.

## 10/10/2026 — Folha do mês gravada (item 2 dos pontos fortes do SAGE)

- **Antes:** a folha era recalculada a cada abertura. Mudar a ficha (salário, dependente) depois do mês alterava holerites já pagos e enviados.
- **Agora:**
  - Em Folha do mês › Cálculo mensal, "Gravar a folha do mês" guarda os holerites do mês, com verbas, bases, totais e memória, em `folhas_gravadas/{empresa}_{AAAA-MM}/holerites/{ficha}`. Funcionários com erro de cálculo ficam fora, com confirmação.
  - Com a competência aberta, dá para regravar.
- **Fim de mês:** com o motor ativo na competência, encerrar exige a folha gravada. A tela mostra quem gravou, quando, quantos holerites e o líquido.
- **Competência encerrada:**
  - Telas, PDFs, Excel, arquivo bancário e S-1200/S-1210 usam a folha gravada.
  - O cálculo de hoje só compara: a lista mostra quem mudou (líquido, bases, FGTS, quem entrou ou saiu).
  - Com a competência aberta e diferença, o aviso é para regravar antes de encerrar.
- **Regras:** grava e apaga holerite quem trabalha na empresa, só com a competência aberta. Encerrada, a folha gravada não muda, nem pelo gestor (precisa reabrir).
- **Testes:**
  - `testes-regras/folhaGravada.test.mjs`;
  - `services/calculo/__tests__/folhaGravada.test.ts`;
  - casos novos no `painelCalculo.test.tsx` e no `fimDeMes.test.tsx`.

## 10/10/2026 — Item 3a: médias de variáveis e pensão em férias, 13º e rescisão

- **Médias:**
  - Cada lançamento do movimento tem a marca "Média". Sem marcar, entra o provento com INSS (comissão, adicional noturno, gratificação habitual) e fica de fora o que não tem INSS (reembolso, ajuda de custo). Dá para marcar ou desmarcar.
  - Férias, 13º e rescisão somam à média de horas extras com DSR os lançamentos que entram na média (`variaveisDoMes` e `mediaDasVariaveis` em `motorMensal.ts`), com a memória separada.
- **Pensão alimentícia:**
  - Férias: valor gravado no gozo (`pensaoFerias`, como o abono). Desconta no recibo (PENSAOFER), deduz no IRRF das férias e vai no S-1210 como `penAlim` com tpRend 13, por alimentando.
  - 13º: campo "Pensão sobre o 13º" no movimento do mês do pagamento (`pensao13`). Cada parcela desconta a sua (PENSAO13). O IRRF da 2ª deduz a de novembro e a de dezembro e vai no S-1210 anual (tpRend 12).
  - Rescisão: a `pensao13` do mês do desligamento deduz no IRRF do 13º rescisório. A pensão sobre o saldo continua no campo de pensão do mês.
- **Testes:** `services/calculo/__tests__/mediasPensao.test.ts`.

## 10/10/2026 — Relatórios, fase R1: Central de relatórios

- **Paulo:** "não localizei o modelo de relatórios; deve ser criado conforme o que já tínhamos da SAGE com todas as melhorias do Consultor, modelos sempre usando nosso layout, opções de impressão, envio direto para o e-mail cadastrado, idem ao CFI e CCI, opção de envio por WhatsApp; temos também os contratos e modelos que podem ser personalizados; os contratos já existentes estão disponíveis no backup SAGE".
- **Fases:**
  - R1 (esta): central e layout.
  - R2: contratos e modelos personalizáveis, com importação dos "Textos" do backup do SAGE.
  - R3: ficha financeira, TRCT oficial, aviso de férias e informe.
- **Layout único (`services/relatorios/layoutPdf.ts`):**
  - Cabeçalho com a marca SP, empresa (razão, CNPJ, código) e título.
  - Rodapé com "Consultor DP · SP Assessoria Contábil · Departamento Pessoal", data, hora e usuário da emissão, e "Página x de y".
  - Marca de PRÉVIA enquanto o motor não está ativo.
  - Holerites, recibos do adiantamento e resumo passaram a usar o mesmo layout.
- **Menu Relatórios › Central de relatórios (`components/relatorios/RelatoriosPanel.tsx`), modelos:**
  - Mensais: folha analítica, holerites, resumo, relação bancária, admitidos e demitidos.
  - Funcionários: relação de funcionários, contratos de experiência, aniversariantes.
  - Férias: a vencer e vencidas.
  - Os da folha usam a folha gravada do mês.
- **Ações:**
  - Visualizar, imprimir (diálogo de impressão do navegador), baixar PDF e Excel.
  - Orientação (padrão do modelo, retrato ou paisagem).
  - "Enviar ao cliente": e-mail pelo escritório (CFI) para o contato cadastrado da empresa, com mensagem editável e o PDF anexo, e opção de gravar o contato. WhatsApp oficial (SP Connect, template do DP com o PDF) ou, sem template, o WhatsApp deste computador.
- **Testes:** `services/relatorios/__tests__/centralRelatorios.test.tsx`.

## 10/10/2026 — Relatórios, fase R2: Contratos e modelos

- **Menu Relatórios › Contratos e modelos (`components/relatorios/ModelosPanel.tsx`):** os "Textos" do SAGE (Cadastros › Genéricos › Textos) no Consultor.
- **Modelos (`services/modelos/`):**
  - Modelos-base (`modelosBase.ts`): contrato de experiência, prorrogação, advertência, suspensão, aviso prévio do empregador, pedido de demissão, declaração de dependentes e opção de vale-transporte. Não ficam no banco: "Personalizar (cópia)" grava uma cópia editável.
  - Personalizados do escritório (valem para todas as empresas; grava gestor ou admin) ou de uma empresa (grava quem trabalha nela), em `modelos_documentos`.
  - Marcação simples: "# " título, "## " cláusula, linha em branco separa parágrafos, `{{assinaturas}}` para empregador, empregado e testemunhas.
  - Campos (`CAMPOS_MODELO`): funcionário (nome, CPF, RG, CTPS, PIS, nascimento, estado civil, nacionalidade, endereço, matrícula), contrato (cargo, CBO, admissão, salário e salário por extenso, horas, jornada, dias e fim da experiência, fim da prorrogação, fim do contrato, desligamento), empresa, data de hoje (e por extenso) e os digitados na hora (motivo, dias, data, cidade).
  - Campo sem dado na ficha sai com uma linha para preencher à mão, e a tela avisa quais são.
- **Documento do funcionário:** prévia na tela, visualizar, imprimir, baixar PDF no layout do Consultor (`modeloPdf.ts`: título, cláusulas, texto justificado, assinaturas e testemunhas opcionais) e "Enviar ao cliente" (e-mail do escritório e WhatsApp, como na Central).
- **Importação do SAGE (`ImportarTextosSageModal.tsx`):**
  - Abre o .zip do FolhaWin, o .backup da folha ou o .dbf dos textos pelo mesmo leitor da restauração.
  - Mostra as tabelas que parecem de textos (pelo nome ou por coluna de texto/memo), com "Mostrar todas" para quando o nome for outro.
  - `textosDaTabela`: acha a coluna do texto (RTF ou a mais longa) e a do título; texto gravado em várias linhas é juntado pela sequência.
  - `rtfParaTexto`: lê o RTF por grupos (ignora fontes, cores, estilos e `\*`), converte `\'hh` (Windows-1252) e `\uN`.
  - Marcadores do SAGE (#NOME#, @NOME@, <<NOME>>, [NOME]) ligados aos campos do Consultor com sugestão pelo nome; sem ligação, ficam como estão.
  - Categoria sugerida pelo título; grava como modelo do escritório ou da empresa, com origem "Importado do SAGE".
- **Regras:** `modelos_documentos` — do escritório, lê quem é aprovado e grava gestor ou admin; da empresa, lê e grava quem pode na empresa. Formato conferido (campos, categoria, origem, título até 120 e texto até 200 mil caracteres), autor obrigatório e sem trocar o dono.
- **Comparativo SAGE:** item novo "Cadastros › Genéricos › Textos" disponível; listagens e envio por e-mail apontam para a Central de relatórios.
- **Testes:**
  - `services/modelos/__tests__/modelos.test.ts` (extenso, campos, blocos, RTF, marcadores, tabela de textos);
  - `services/modelos/__tests__/modelosTela.test.tsx` (gerar, e-mail, personalizar, importar do SAGE);
  - `testes-regras/modelos.test.mjs`.

## 10/10/2026 — Saúde do eSocial, etapas 1 e 2: fila acompanhada e pré-voo

- **Paulo:** problema comum no SAGE: o envio e o retorno dos eventos travam, e o suporte entra na máquina para editar XML e "limpar". Pediu um painel para evitar, não corrigir depois: monitor de eventos, análise, indicador de anomalias e autocorreção. Ordem combinada: 1) consulta automática e monitor da fila; 2) pré-voo; depois 3) anomalias e conciliação; 4) autocorreção assistida e diagnóstico pelo Gemini; 5) monitor de leiaute e notas técnicas. Etapas 1 e 2 antes da R3 dos relatórios.
- **Etapa 1, a fila (`services/esocial/filaEnvios.ts`, `envioSeguro.ts`, `vigiaEsocial.ts`):**
  - O lote é gravado ANTES de sair ("transmitindo"), com os eventos (Id, tipo, período, CPF, registro de origem). A resposta completa o registro.
  - Sem resposta (rede, CFI ou governo fora): o lote fica "sem resposta", nunca some. Recusa do próprio CFI (4xx) é "não recebido" (nada saiu). "Transmitindo" há mais de 3 min conta como sem resposta.
  - Sem resposta não se reenvia às cegas: "Conferir no eSocial" baixa os eventos pelo Id (produção) e grava os recibos achados; com todos, o lote fica processado. Não achado, "Liberar reenvio" só depois de 30 min (regra também no Firestore).
  - Consulta automática dos protocolos da empresa ativa enquanto o Consultor está aberto: 15 s, 30 s, 1, 2, 5, 10 e depois a cada 30 min (contador `consultas`).
  - Alertas: sem resposta (crítico), parado há mais de 30 min (atenção) ou 24 h (crítico), recusas dos últimos 7 dias. O número aparece no menu eSocial.
  - Tela eSocial › Saúde do eSocial (`components/esocial/SaudeEsocialPanel.tsx`): cartões por etapa, alertas com a ação de cada um, lotes com próxima consulta, consultas feitas e quem conferiu.
- **Etapa 2, o pré-voo (`services/esocial/preVoo.ts`, `validadorXsd.ts`):**
  - XSD oficial S-1.3 (`public/esocial-xsd/v_S_01_03_00`) validado no navegador pelo libxml2 em WebAssembly (`xmllint-wasm`), com o erro em português e o campo apontado. A falta da assinatura não conta (quem assina é o CFI). Evento em leiaute antigo é barrado com a explicação. Sem o XSD (offline), vira aviso.
  - Regras pelo histórico da empresa: Id já transmitido; mesmo evento do trabalhador ainda sem resultado (ou sem resposta); competência fechada (S-1299 aceito) só com S-1298 antes; S-1299 espera os periódicos da competência; S-1210 espera o S-1200 do trabalhador; retificação sem recibo; lote com mais de 50 eventos ou grupos misturados. Avisos: S-1299 sem S-1200 aceito pelo Consultor, S-1298 sem S-1299 (podem ter ido pelo IOB).
  - As três telas que transmitem (Transmissão, S-1200/S-1210 do Cálculo e S-2230 do afastamento) passam por `verificarAntesDeEnviar` e `transmitirVerificado`. Bloqueio: nada sai para o governo; aviso: entra na confirmação.
  - O pré-voo achou um caso real: gerado de novo no mesmo segundo, o S-1210 podia sair com o mesmo Id do S-3000 do trabalhador. O sequencial do Id agora começa pelo milésimo da geração.
- **Regras (`esocial_envios`):** cria "transmitindo" sem protocolo; a resposta só por quem transmitiu e uma vez; a consulta não volta o lote para trás; a conferência e a liberação com autor, e a liberação só depois de 30 min.
- **Testes:**
  - `services/esocial/__tests__/saudeEsocial.test.ts` (XSD oficial, traduções, regras, fila, falhas);
  - `saudeEsocialTela.test.tsx` (painel e vigia);
  - casos novos nas telas de transmissão e do S-2230;
  - `testes-regras/envios.test.mjs`.
- **Conferido no Chromium:** o validador roda no build de produção (worker e wasm emitidos) e devolve o erro do XSD traduzido.

## 10/10/2026 — Relatórios, fase R3a: ficha financeira e aviso de férias

- **Paulo:** "pode seguir com R3 e demais". A R3 foi dividida em três entregas: R3a (ficha financeira e aviso de férias), R3b (TRCT no modelo oficial) e R3c (informe de rendimentos).
- **Ficha financeira (Central › Anuais):**
  - O ano de cada funcionário mês a mês (Jan a Dez) e verba a verba, com total do ano.
  - Linhas de total de proventos, total de descontos, líquido, bases do INSS, IRRF e FGTS, e FGTS do mês.
  - Vem das folhas mensais GRAVADAS do ano escolhido (`lerFolhasDoAno`). Mostra os meses sem folha gravada.
  - Filtro por funcionário. PDF em paisagem (um funcionário por página, dados do contrato no topo), Excel e envio ao cliente.
  - Ainda não entram férias, 13º e rescisão pagos fora da folha mensal, nem os anos anteriores ao Consultor.
- **Aviso de férias (Central › Férias, CLT art. 135):**
  - Um aviso por gozo lançado em Afastamentos (motivo 15) que começa na competência ou no mês seguinte.
  - Traz período aquisitivo, gozo, dias, retorno, abono pecuniário (art. 143) e pagamento até 2 dias antes (art. 145).
  - Datado 30 dias antes do início. Se esse dia já passou, sai com a data de hoje e a tela avisa quem está fora do prazo; o aviso no papel não leva essa nota.
  - Tem campo de "ciente" do empregado.
- **Arquivos:** `services/relatorios/relatoriosAnuais.ts` e `relatoriosAnuaisPdf.ts`.
- **Testes:** `relatoriosAnuais.test.ts` e caso novo na `centralRelatorios.test.tsx`.

## 10/10/2026 — Relatórios, fase R3b: TRCT

- **Pesquisa antes de fazer:** o modelo oficial único do TRCT (Portaria MTE 1.621/2010, alterada pelas 2.685/2011 e 1.057/2012) foi revogado pela Portaria MTP 671/2021. O TRCT continua obrigatório, em modelo do empregador, com a natureza e o valor de cada parcela discriminados (CLT, art. 477, § 2º). A numeração de campos do modelo revogado (50 saldo de salário, 112.1 INSS etc.) não foi usada: só parte dela pôde ser conferida em fontes, e ela não é mais exigida.
- **TRCT (`services/relatorios/trctPdf.ts`):**
  - Seções: empregador; trabalhador (CPF, PIS, CTPS, nascimento, mãe, endereço, matrícula); contrato (cargo e CBO, categoria, admissão, desligamento, causa com o motivo da Tabela 19, aviso prévio com dias e projeção, salário, sindicato, prazo de pagamento do art. 477, § 6º).
  - Verbas rescisórias e deduções com referência e valor, total bruto, total das deduções e líquido.
  - FGTS e bases: INSS, IRRF, base do FGTS rescisório, FGTS da rescisão, multa (40% ou 20%) e saque.
  - Quitação limitada às parcelas e valores especificados, local e data, assinaturas do empregador e do trabalhador (ou responsável legal).
  - Marca de PRÉVIA enquanto o motor não está ativo.
- **Onde:** Cálculo › Rescisão › "TRCT (PDF)", e no Pacote do cliente da rescisão. O antigo "Rescisões (TRCT)" passa a se chamar "Recibos da rescisão".
- **Testes:** `services/relatorios/__tests__/trct.test.ts`.

## 10/10/2026 — Relatórios, fase R3c: informe de rendimentos

- **Base:** Comprovante de Rendimentos Pagos e de IRRF da IN RFB 2.060/2021 (modelo no Anexo I), entregue até o último dia útil de fevereiro, pelo regime de caixa (o que foi pago no ano).
- **Fonte: os S-5002 do ano-calendário** (eSocial › Download), não as folhas do Consultor. O eSocial devolve um por trabalhador e mês de pagamento, com o que foi transmitido pelo Consultor e pelo IOB (folha, férias, 13º, rescisão).
  - O leitor dos totalizadores (`services/conferencia/totalizadores.ts`) passou a ler também os isentos de `consolidApurMen` (vlrIndResContrato, vlrAbonoPec, vlrDiarias…) e o `infoIRComplem` (dependentes, dedução de dependentes, pensão por alimentando e tpRend, previdência complementar, plano de saúde).
- **Montagem (`services/relatorios/informeRendimentos.ts`):**
  - Um S-5002 por trabalhador e mês; retificado, vale o de recibo mais recente (com aviso). Só o ano e a empresa ativos.
  - Quadro 3: rendimentos tributáveis (sem a PLR), previdência oficial, previdência complementar, pensão (mensal e férias) e IRRF.
  - Quadro 4: as nove linhas, com indenizações rescisórias, juros de mora, 65 anos, moléstia grave e "outros" (abono pecuniário, auxílio-moradia…).
  - Quadro 5: 13º líquido (bruto − previdência − dependentes − pensão do 13º − previdência complementar), IRRF do 13º e PLR pelo líquido.
  - Quadro 7: pensão por alimentando, previdência complementar por entidade, plano de saúde por operadora (titular e dependentes), a conta do 13º, a PLR, os isentos de "outros" e os dependentes.
  - Avisa quando faltam meses de S-5002.
- **PDF (`informePdf.ts`):** um trabalhador por página, quadros 1 a 8; mais Excel (uma linha por trabalhador) e envio ao cliente.
- **Ainda não:** rendimentos recebidos acumuladamente (quadro 6).
- **Testes:** `services/relatorios/__tests__/informe.test.ts`.

## 10/10/2026 — Saúde do eSocial, etapa 3: anomalias e conciliação

- **Conciliação com o eSocial (`services/esocial/anomalias.ts`, `conciliarComEsocial` em `vigiaEsocial.ts`):**
  - Usa os identificadores do governo (Id e recibo) de S-1200, S-1210, S-1299 e S-1298 da competência, em produção, pelo túnel do CFI. Não baixa os XMLs nem gasta a cota de download; a tela mostra os pedidos do dia.
  - Lote "sem resposta" com o evento no governo: o recibo é gravado ("Gravar os recibos") e o lote se resolve sem reenvio.
  - Evento aceito pelo Consultor que não aparece no governo vira anomalia crítica (excluído ou retificado por outro sistema).
  - Eventos no governo que não passaram pelo Consultor (IOB ou outro sistema) aparecem como informação.
- **Anomalias:**
  - Folha gravada da competência sem S-1200 aceito: atenção até o prazo, crítico depois. Lote ainda sem resultado não conta.
  - Competência com S-1200 aceito e sem S-1299 depois do prazo (dia 15 do mês seguinte).
  - O mesmo evento do trabalhador recusado duas vezes ou mais em 30 dias.
  - Certificado da empresa no cofre vencido ou vencendo (30 e 15 dias).
  - Ocorrências que mais se repetem em 30 dias, por código.
- **Tela:** seção "Anomalias e conciliação" na Saúde do eSocial (`components/esocial/AnomaliasEsocial.tsx`), com a ação de cada achado.
- **Testes:** `anomalias.test.ts` e caso de conciliação na `saudeEsocialTela.test.tsx`.

## 10/10/2026 — Saúde do eSocial, etapa 4: diagnóstico e correção assistida

- **Diagnóstico (`services/esocial/diagnostico.ts`):** cada ocorrência de recusa é reconhecida pelo texto do eSocial (sem acento e sem caixa; não depende de lista de códigos). Vira causa em português, passos e uma ação. Regras:
  - período fechado → reabrir (S-1298);
  - duplicidade ou evento já recebido → conciliar e achar o recibo;
  - recibo divergente na retificação ou exclusão → conciliar;
  - demonstrativo inexistente no S-1210 → S-1200 antes;
  - rubrica fora do S-1010 → Incidências;
  - trabalhador ou vínculo não cadastrado → Funcionários;
  - estabelecimento ou lotação → Enquadramento;
  - certificado ou procuração → cofre;
  - schema ou leiaute → gerar de novo.
- **Correção assistida:**
  - "Reabrir o período (S-1298)" gera a reabertura da competência do evento, passa pelo pré-voo, pede confirmação e transmite pelo envio registrado.
  - "Conciliar com o eSocial" mostra os recibos da competência no governo, para a retificação.
  - Nada é corrigido sozinho.
- **MIA (Gemini):** "Perguntar à MIA" em toda ocorrência; é o caminho padrão das que não têm regra. Vai a ocorrência e o diagnóstico do Consultor (CPF mascarado). A resposta aparece marcada como "sugestão para conferir; nada foi aplicado".
- **Tela:** o diagnóstico aparece embaixo de cada erro, nos detalhes do lote, na Saúde do eSocial (`components/esocial/DiagnosticoOcorrencia.tsx`).
- **Testes:** `diagnostico.test.ts` e casos de reabertura e MIA na `saudeEsocialTela.test.tsx`.

## 10/10/2026 — Saúde do eSocial, etapa 5: monitor do leiaute e das notas técnicas

- **Job agendado (`.github/workflows/esocial-leiaute.yml`, `scripts/esocial/monitorLeiaute.mjs`):** dias úteis às 8h10 de Brasília, ou pelo botão "Run workflow".
  - Lê a página da documentação técnica do eSocial (gov.br) e guarda os links de leiaute, nota técnica, XSD e manual, e as versões citadas (S-1.3, v_S_01_03_00…).
  - Grava as novidades desde a verificação anterior em `esocial_monitor/documentacao`.
  - Página sem nenhum link reconhecido é tratada como erro, sem apagar a lista boa.
  - Parte pura em `scripts/esocial/leiauteEsocial.mjs`, testada no Vitest.
- **Resumo de IA:** com o segredo `GEMINI_API_KEY` (modelo em `GEMINI_MODEL`, padrão gemini-2.5-flash), cada novidade ganha um resumo do que muda para a folha e o eSocial. Fica marcado como resumo de IA, para conferir no documento. Sem a chave, o monitor funciona sem o resumo.
- **Painel (Saúde do eSocial › Leiaute e notas técnicas, `components/esocial/MonitorLeiaute.tsx`):**
  - Mostra o leiaute em uso no pré-voo, a data da verificação, as versões citadas e as novidades com o resumo.
  - Alertas: versão citada maior que a em uso (crítico, com o caminho da troca em `public/esocial-xsd/LEIAME.md`), última verificação com erro, monitor parado há mais de 8 dias, novidades dos últimos 30 dias.
- **Nada é aplicado sozinho:** a troca de leiaute é feita por gente, com os testes.
- **Regras:** `esocial_monitor` é lido por todo aprovado; só a conta de serviço grava.
- **Testes:** `monitorLeiaute.test.ts`; regra em `testes-regras/envios.test.mjs`.
- **Pendente do Paulo:**
  - o segredo `FIREBASE_SERVICE_ACCOUNT` (o mesmo do CRM, com o papel "Usuário do Cloud Datastore");
  - opcional, `GEMINI_API_KEY` para os resumos.
- **Não testado aqui:** o gov.br é bloqueado pela rede deste ambiente; a primeira execução no GitHub Actions valida a leitura da página real.

## 10/10/2026 — Item 3b: insalubridade e periculosidade automáticas

- **Ficha (aba Adicionais):** grau de insalubridade (10, 20 ou 40%); base (salário mínimo pelo art. 192 da CLT, o salário contratual ou um piso informado pela convenção); periculosidade (30% do salário-base, art. 193, § 1º).
  - Base "valor informado" sem o valor é erro.
  - Os dois juntos dão aviso: não se acumulam (art. 193, § 2º).
- **Cálculo (`services/calculo/adicionais.ts`):**
  - Insalubridade sobre o mínimo usa a tabela do salário mínimo vigente (Cadastros › Tabelas legais); sem ela, a folha fica incompleta e sem o adicional.
  - Com os dois na ficha, vale o de maior valor, com aviso para conferir a opção do empregado.
- **Motor mensal:**
  - Verba INSALUB ou PERICUL com INSS, FGTS e IRRF, proporcional aos dias pagos.
  - Integra o salário-hora das horas extras e dos atrasos (TST, OJ 47 da SDI-1 e Súmula 132) e a diária das faltas e do DSR descontado.
  - Integra a licença-maternidade e a prorrogação (remuneração integral, Lei 8.213/1991, art. 72).
- **Férias, 13º e rescisão:** a remuneração passa a ser salário + adicional + médias (TST, Súmula 139), e a hora das médias inclui o adicional. Na rescisão, o saldo de salário traz o adicional proporcional (pelo motor mensal) e o aviso indenizado, o 13º e as férias saem da remuneração com o adicional.
- **S-1200:** de/para sugerido pela natureza da Tabela 03: 1202 insalubridade, 1203 periculosidade.
- **Testes:** `services/calculo/__tests__/adicionaisRisco.test.ts`.

## 10/10/2026 — Autonomia dos módulos, passo 3: serviços externos com endereço configurável

Paulo: "pode seguir com passo 3 da autonomia". O passo 3 é o primeiro da recomendação dada à pergunta "cada módulo do SaaS não pode ser autônomo e não depender do CFI?". A recomendação completa:
1. Criar uma plataforma comum (cofre, mensagens, governo, IA).
2. Dar ao DP Cloud Functions próprias.
3. Primeiro, pôr as chamadas externas atrás de um adaptador com endereço configurável.

- **`services/plataforma/servicos.ts`:** cinco serviços (cadastro, cofre, governo, mensagens, ia).
  - Sem configuração: os mesmos hosts e rotas do CFI de antes. Os dois endereços do Cloud Run do CFI foram mantidos como estavam.
  - `VITE_PLATAFORMA_URL` leva todos os serviços; `VITE_SERVICO_<NOME>_URL` leva só um.
  - Endereço que não seja https (fora do localhost) é ignorado com aviso: o token nunca vai para outro lugar.
- **Chamadas migradas:**
  - `callFiscal` encaminha pela rota (`SERVICO_DA_ROTA`);
  - gate de departamento, cadastro central, cofre, WhatsApp e o link de templates (`VITE_PAINEL_MENSAGENS_URL`).
  - Nenhum host do CFI ficou fora do adaptador.
- **Tela:** Configurações › Serviços externos mostra quem atende cada serviço, o endereço, os avisos e um teste de alcance (GET no-cors, sem login).
- **Build:** `deploy.yml` passa as variáveis do repositório (`vars.*`); vazias, vale o CFI.
- **Contrato:** `docs/plataforma-servicos.md` lista as rotas e os requisitos de qualquer provedor (token Firebase deste projeto, CORS, formato dos erros).
- **Testes:** `services/plataforma/__tests__/servicos.test.ts`.
  - Os endereços padrão continuam iguais aos de antes.
  - Precedência, validação e chamadas.
  - Varredura do código: toda rota do túnel tem dono.
- **Próximos passos (decisão do Paulo):**
  - passo 1: a plataforma comum, que o DP adota criando `VITE_PLATAFORMA_URL`;
  - passo 2: Cloud Functions do DP para o vigia do eSocial com o app fechado e os webhooks.

## 10/10/2026 — Status × SAGE e autonomia passo 1 (plataforma comum)

Paulo: "atualize nosso status de pendencias, evidencie com relacao a SAGE e pode seguir com o passo 1".

- **Catálogo IOB × Consultor** (`services/iobSage/catalogoMenus.ts`), itens que estavam atrás do que já foi entregue:
  - **13º:** médias e pensão no IRRF já entregues (item 3a); falta só a provisão.
  - **Eventos:** a "Média" entra nas médias.
  - **DIRF/Informe:** a DIRF foi extinta e o informe está disponível.
  - **E-mail:** pelo serviço de e-mail.
  - **Tabelas legais:** usadas pelo motor.
  - Resultado: 17 disponíveis, 22 parciais, 9 planejados, 3 fora do escopo.
- **Adaptador:** "mensagens" virou `email` e `whatsapp`.
  - O WhatsApp não vai para a plataforma comum: o dono do canal é o SP Connect. Só `VITE_SERVICO_WHATSAPP_URL` o leva.
  - `VITE_SERVICO_MENSAGENS_URL` saiu antes de ser usado.
- **Plano do passo 1:** `docs/plataforma-comum.md`, no modelo da separação do SP Connect.
  - Serviço próprio (`sp-plataforma`) no mesmo projeto GCP, Firestore e Secret Manager. Nenhuma migração: o cofre fica onde está.
  - Ordem por risco: IA, cadastro, e-mail, governo.
  - Fases P0 a P5, riscos e a divisão do que é do Paulo e do que é meu.

## 10/10/2026 — S-2299 (desligamento) pelo Consultor

Item 1 do que falta para desligar o SAGE na folha. Paulo: "pode seguir".

- **`services/esocial/desligamento.ts`:** monta o S-2299 a partir da rescisão calculada (leiaute S-1.3, `evtDeslig.xsd`, e MOS S-1.3).
  - **Motivo e data:** motivo da Tabela 19 pelo tipo da rescisão; data do desligamento.
  - **Aviso prévio:** com parte indenizada (inteira ou mista, item 3.1 do MOS), `indPagtoAPI` S e o fim projetado. Com parte trabalhada, pede a data do aviso (`dtAvPrv`).
  - **Pensão sobre o FGTS:** `pensAlim` obrigatório para celetista (0 a 3, com percentual e valor).
  - **Verbas:** num demonstrativo (`RESC<data>-<matrícula>`, o mesmo do S-1210), uma linha por rubrica, `indApurIR` 0 e grau de exposição.
  - **Prazo:** 10 dias, antecipado ao dia útil anterior.
  - **Sem evento quando:** a rescisão tem erro ou está incompleta; ou falta rubrica, CPF, matrícula, categoria, estabelecimento, lotação ou motivo; ou o desligamento passa de hoje + 10 dias (regra do leiaute).
  - **Retificação:** pelo recibo.
- **De/para da rescisão:** grava na empresa junto com o da folha.
  - A verba que também existe na folha (saldo, INSS, IRRF, HE) usa a rubrica dela, a não ser que tenha uma própria (`RESC:`).
  - As verbas só da rescisão têm chave própria: aviso, 13º proporcional e indenizado, férias vencidas, dobra e proporcionais com 1/3, art. 479.
  - Sugestão pela descrição do S-1010 e, quando a descrição é ambígua, pela natureza da Tabela 03.
- **Tela:** Cálculo › Rescisão, no desligamento registrado na ficha (a simulação não vira S-2299).
  - Mostra a situação no eSocial (pelo envio do Consultor ou importado do IOB) e o prazo.
  - Campos de aviso, pensão e observação, mais o de/para.
  - Pré-voo e transmissão pelo cofre, XML para conferência.
- **Situação dos eventos:** `statusPorRef` generaliza a do S-2230.
- **Ainda não:** o S-1210 do pagamento da rescisão (`tpPgto` 2, com a junção ao S-1210 da folha paga no mesmo mês). É a próxima entrega.

## 10/10/2026 — Demissões (prévia de rescisão)

Paulo: "pode seguir com item 1 modal de demissões". É o item 1 das sugestões. Pedido original: prévia de rescisões com relatório, envio e impressão ao cliente, "sem a necessidade de validar a rescisão junto ao eSocial". Paulo confirmou que "a geração do seguro-desemprego é feita no site Empregador Web": quando a efetivação chegar, o Consultor entrega os dados e o atalho, sem imitar o formulário.

- **Onde:** Folha do mês › Demissões (prévia), da empresa ativa.
  - Funcionários com vínculo.
  - Até 4 cenários (motivo, aviso, data). O padrão é dispensa, pedido e acordo.
  - Saldo do FGTS (extrato) e 13º adiantado, por funcionário, opcionais.
- **Cálculo (`services/demissoes/previa.ts`):** cada cenário é a rescisão do motor (a mesma do TRCT).
  - **Custo da empresa:** proventos + FGTS do mês e rescisório + multa + encargos patronais pelo enquadramento vigente + indenização da data-base.
  - **Multa do FGTS sem o extrato:** estimada pelos depósitos do contrato (salário pelo histórico × 8%, com 13º e 1/3), sem correção. Sempre marcada como estimativa.
  - **Alertas:**
    - afastado na data, com a regra do MOS e a estabilidade acidentária;
    - contrato a termo (motivos 03, 04 e 06);
    - férias em dobro;
    - acordo (80% do FGTS, sem seguro);
    - aviso não cumprido;
    - data-base: dispensa nos 30 dias antes dela, contada a projeção do aviso, gera indenização adicional de um salário (Lei 7.238/1984, art. 9º; Súmulas 182 e 314 do TST), incluída no custo.
- **PDF (`previaPdf.ts`):** um funcionário por página.
  - Cenários lado a lado: verbas, líquido, FGTS, multa, encargos, custo total, prazo, FGTS e seguro-desemprego.
  - Pontos de atenção.
  - Marca PRÉVIA e "sem valor de quitação".
  - Envio por e-mail e WhatsApp pelo mesmo componente da Central de relatórios.
- **Histórico (`demissoes_previas`):**
  - Grava os parâmetros e o resumo de cada cenário.
  - A situação passa a enviada, cenário escolhido ou descartada; "Reabrir" recalcula com os dados de hoje.
  - **Regras:** quem pode na empresa lê e cria (autor = quem grava; situação inicial "prévia"). Na atualização, só a situação e o escolhido mudam. Nada se apaga.
- **Testes:**
  - cálculo: custo, multa informada e estimada, alertas, data-base;
  - PDF;
  - tela: só vínculos ativos, comparativo, gravar e escolher;
  - regras (`testes-regras/demissoes.test.mjs`).

## 10/10/2026 — Efetivador de rescisões (item 2)

Paulo: "pode seguir com item 2 efetivador de rescisões". Ele também confirmou: "a geração do seguro-desemprego é feita no site Empregador Web".

- **S-1210 do pagamento da rescisão** (`services/esocial/pagamentoRescisao.ts`, MOS S-2299 item 1.2):
  - **O que leva:** `tpPgto` 2, `perRef` do desligamento e o `ideDmDev` do S-2299, no mês do pagamento.
  - **IR:** deduções de dependentes do saldo (tpRend 11) e do 13º (tpRend 12) quando o cálculo não usou o simplificado, e a pensão por alimentando. O motor da rescisão passou a guardar `deducoesIrrf` (do saldo) e `deducoes13`; `irrfDetalhado` devolve `simplificado`.
  - **Com S-1210 já aceito no mês** (a folha anterior paga no mesmo mês): S-3000 e reenvio com todos os pagamentos. As informações de IR do aceito voltam, com as da rescisão (`mesclarIRFerias` para tpRend 11 e 12; a pensão entra no `infoIRCR`).
  - **Recusas com o motivo:** aceito sem download; o pagamento já no aceito; pensão nos dois; data antes do desligamento ou de outro mês do cálculo. Pagamento depois do prazo dá aviso da multa do art. 477, § 8º.
  - **Tela:** `PagamentoRescisaoEsocial`, em Cálculo › Rescisão. Só depois do S-2299 aceito; S-2299 pelo IOB, então S-1210 pelo IOB.
  - `recibosDosEnvios` reconhece a ref `pgto-resc:` como da ficha, para a folha não mandar outro S-1210 original no mês.
- **Roteiro de efetivação** (`services/demissoes/efetivacao.ts`, `components/demissoes/EfetivacaoRescisao.tsx`):
  - **Passos:** ficha, S-2299, pagamento, S-1210, guia rescisória do FGTS (FGTS Digital), seguro-desemprego (Empregador Web) e documentos, com o prazo de cada um.
  - **Automáticos** pelo eSocial: ficha, S-2299 e S-1210. Os **manuais** são marcados com quem, quando e uma observação (`rescisoes_efetivacao`, regras e teste: nada se apaga).
- **Seguro-desemprego** (Lei 7.998/1990, red. Lei 13.134/2015):
  - Meses deste vínculo (fração de 15 dias conta) por solicitação: 12, 9 ou 6 meses; 3 a 5 parcelas.
  - A média dos três últimos salários pela ficha. O valor da parcela fica com a tabela do Codefat.
  - Os dados para o Empregador Web (copiar) e o atalho.
- **Orientações ao trabalhador** (`orientacoesPdf.ts`): o que recebe e até quando, o saque do FGTS pelo app, o seguro (do 7º ao 120º dia) e os documentos.
- **Termo de acordo (art. 484-A):** novo modelo-base.
- **Demissões:** a prévia com o cenário escolhido tem "Registrar desligamento na ficha". Grava data, motivo e fim projetado, com auditoria. Daí, Cálculo › Rescisão.
- **Atalhos externos:** FGTS Digital (`fgtsdigital.sistema.gov.br`) e Empregador Web (`sd.maisemprego.mte.gov.br/sdweb/empregadorweb`). Não consegui conferir os endereços daqui (o gov.br é bloqueado nesta rede).

## 10/10/2026 — Consulta de FGTS (item 3)

Paulo: "pode seguir com item 3 consulta de fgts, lembrando que já existe um popup que sinaliza FGTS em aberto, não pago, pendente não enviado".

- **Onde:** eSocial › FGTS Digital, no topo (`components/fgts/PainelFgts.tsx`), sempre da empresa ativa. Os registros antigos (avisos) continuam embaixo.
- **Recolhimento mês a mês** (`services/fgts/consultaFgts.ts`):
  - 3, 6, 12 ou 24 meses pelo SERPRO (FGTS Digital): devido × recolhido × FGTS da folha gravada no Consultor, mais o CRF.
  - Vencimento no dia 20 do mês seguinte, antecipado ao dia útil anterior.
  - Situações: recolhido, em parte, em aberto (vencido), a vencer, sem movimento e **folha sem declaração no eSocial**. Esta última é quando a folha tem FGTS e nada foi declarado depois do prazo do fechamento (dia 15).
- **Popup de pendências sem duplicar:** a consulta grava um registro por empresa e mês (`esocial_fgts/serpro_<empresa>_<AAAA-MM>`, `gravarFgtsComId`). O "em dia" apaga o aviso.
  - Novo status `nao_declarado` ("pendente de envio"), com uma linha própria no popup (`fgtsNaoDeclarados`).
  - No resumo da empresa, `nao_declarado` conta como atrasado.
- **Extrato por funcionário:**
  - O FGTS de cada mês pela folha gravada e o declarado no S-5003 (upload do download do eSocial, pela matrícula), com a diferença e o total do período.
  - A estimativa dos depósitos do contrato inteiro. O saldo da conta é da Caixa; o "para fins rescisórios", no FGTS Digital por CPF.
- **Procuração do FGTS Digital por empresa** (`empresas.procuracaoFgts`: perfil consulta/edição, validade):
  - Aviso de ausente, vencida ou vencendo (30 dias).
  - A regra da empresa passou a aceitar o campo de quem a tem na carteira.
- **Testes:**
  - situação, vencimento, aviso, extrato e procuração;
  - tela, com o SERPRO falso: 3 meses, um em aberto, IDs do aviso;
  - regras (`testes-regras/fgts.test.mjs`).

## 10/10/2026 — S-1010 (tabela de rubricas) pelo Consultor

Paulo: "pode seguir com s-1010".

- **Onde:** Cadastros › Incidências, botão "S-1010 pelo Consultor" (`components/esocial/TabelaRubricasEsocial.tsx`). Em cada rubrica divergente ou a conferir, "Corrigir no eSocial (S-1010)" abre direto a alteração.
- **Pedidos** (`services/esocial/tabelaRubricas.ts`): inclusão, alteração (inclusive fim de validade, pela `novaValidade`) e exclusão. Ficam como rascunho em `esocial_s1010/{empresa}_{auto}` (regras e teste: aplicado e descartado são finais, nada se apaga).
- **Regras do MOS S-1.3 conferidas antes de gravar:**
  - código sem "eSocial" no início e sem espaço nas pontas; tabela até 8 caracteres; validade AAAA-MM;
  - mesma vigência = alteração; nova vigência = inclusão (o eSocial encerra a anterior no mês anterior); alteração e exclusão só de vigência que o Consultor conhece (senão, importar o S-1010 antes);
  - incidência suspensa (9x) bloqueada: exige o processo do S-1070 no próprio S-1010;
  - naturezas 9901 a 9908 com 00/00/9; eConsignado (9253) com desconto, FGTS 31, CP 00 e IRRF 9; codIncCP 31/32 só em desconto;
  - avisos: exclusão (o eSocial recusa se a rubrica foi usada), mudança de natureza e alteração sem efeito nos S-1200 já enviados (retificar).
- **Modelos para as verbas do Consultor** (folha, 13º, férias e rescisão): natureza e incidências pelas marcas de INSS, FGTS e IRRF do próprio motor e pelos exemplos do MOS (férias 1015/1016/1017/9221 com IRRF 13). Código sugerido `CDP<verba>` e a tabela mais usada pela empresa. Os códigos de isenção do IRRF (74 nas indenizações da rescisão, 79 no abono) aparecem como "conferir na Tabela 21": não consegui a Tabela 21 oficial daqui (gov.br bloqueado nesta rede).
- **Transmissão:** lote de até 50, um pedido por rubrica, pelo pré-voo (XSD oficial) e `transmitirVerificado`, com a ref `s1010:{pedido}`.
- **Aceito em produção:** "Atualizar a tabela de rubricas" grava a vigência na rubrica (mesma consolidação da importação, com o recibo; o vínculo com o evento do IOB fica) e marca o pedido como aplicado no mesmo lote. Se o pedido veio de uma verba sem rubrica no de/para, o de/para da empresa passa a usá-la.
- **Conferência do S-1200:** IRRF 13 nas férias da folha do gozo (FERMES, FERMES13 e FERPAGO) deixou de gerar aviso: é o que o MOS manda e as três se anulam.
- **Tabela 21:** rótulos do 9 (MOS, S-1010 item 12.1) e do 43 (dedução da previdência oficial nas férias).
- **Catálogo SAGE:** "Relacionamento de Rubricas" passou a disponível.
- **Testes:**
  - XML dos três tipos no XSD oficial; validação; lote; aplicação no cadastro; situação pela ref;
  - os modelos no XSD e coerentes com o motor; férias pelos modelos sem aviso de incidência no recibo e na folha do gozo;
  - tela (aceito aplicado com de/para, rubrica pelo modelo, transmissão só do que falta, alteração vinda das incidências);
  - regras (`testes-regras/s1010.test.mjs`).
