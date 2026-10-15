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
- **Catálogo SAGE (de/para com o SAGE):** "Relacionamento de Rubricas" passou a disponível; periódicos e consignado citam o S-1010. Placar: 18 disponíveis, 21 parciais, 9 planejados, 3 fora (51 itens).
- **Testes:**
  - XML dos três tipos no XSD oficial; validação; lote; aplicação no cadastro; situação pela ref;
  - os modelos no XSD e coerentes com o motor; férias pelos modelos sem aviso de incidência no recibo e na folha do gozo;
  - tela (aceito aplicado com de/para, rubrica pelo modelo, transmissão só do que falta, alteração vinda das incidências);
  - regras (`testes-regras/s1010.test.mjs`).

## 10/10/2026 — Provisão de férias e 13º

Paulo: "pode seguir com provisão de férias e 13, lembrando que SST é com empresa de medicina e segurança do trabalho".

- **Onde:** Relatórios › Central › Mensais, dois modelos: **Provisão de férias** e **Provisão de 13º salário**. Saem com visualizar, imprimir, PDF (paisagem), Excel e envio ao cliente. Não dependem da folha gravada: leem as tabelas legais, os movimentos gravados (médias e faltas) e o enquadramento.
- **Método do saldo** (`services/calculo/provisoes.ts`): no fim do mês, o saldo de cada empregado; o movimento do mês é saldo anterior + constituição − baixas = saldo atual (constituição negativa = reversão).
  - **Férias:** vencidas (saldo de dias dos períodos fechados), em dobro fora do concessivo (com 1/3, sem encargos), proporcionais (15 dias ou mais no mês; dias de direito pelas faltas, art. 130) e o 1/3. Os períodos, perdas e suspensões vêm do motor de férias.
  - **13º:** remuneração × avos do ano (os mesmos avos do motor do 13º).
  - **Remuneração:** a do fim do mês, como na rescisão (salário pelo histórico, adicional de risco e média das variáveis dos 12 meses). Reajuste e média entram na constituição.
  - **Baixas:** férias pelos gozos e abonos que começam no mês; 13º em dezembro (a 1ª parcela é adiantamento e não baixa); desligamento pelo saldo no dia (pago na rescisão).
  - **Encargos:** INSS patronal + RAT × FAP + terceiros pelo regime do enquadramento (Simples dos demais anexos: zero; Anexo IV: sem terceiros) e FGTS de 8% (aprendiz, 2%). Sem enquadramento, avisa e sai sem INSS.
  - **Fora:** intermitente (recebe a cada convocação) e quem não é empregado; ficha com erro aparece no aviso com o motivo.
- **Lançamento do mês** na observação do relatório (constituição e baixa da provisão, do INSS e do FGTS), para a contabilidade.
- **SST:** confirmado que ASO, CAT, S-2210, S-2220 e S-2240 ficam com a empresa de medicina e segurança do trabalho de cada cliente; o catálogo SAGE diz isso.
- **Catálogo SAGE:** férias e 13º citam as provisões (continuam parciais: faltam férias coletivas e 13º complementar). Placar inalterado: 18 disponíveis, 21 parciais, 9 planejados, 3 fora.
- **Testes:** posição (vencidas, dobra, proporcionais, faltas, 13º); movimento do mês com valores à mão (constituição, baixa por gozo, 13º em dezembro e janeiro, desligado, admitido, categorias); encargos por regime; lançamento; relatórios; tela da Central.

## 10/10/2026 — Férias coletivas

Paulo: "pode seguir com férias coletivas" (no mesmo pedido: sindicatos ligados à empresa com a convenção coletiva, conformidade com a convenção e salário mínimo federal e estadual nas tabelas — próximos lotes).

- **Onde:** Cálculo › Férias › "Férias coletivas…" (`components/ferias/FeriasColetivasModal.tsx`).
- **Plano** (`services/ferias/feriasColetivas.ts`), pela CLT:
  - toda a empresa ou um setor (departamento, estabelecimento ou cargo da ficha);
  - **art. 139:** até 2 por ano e nenhuma com menos de 10 dias (bloqueia); comunicação ao Ministério do Trabalho e ao sindicato 15 dias antes, com o prazo na tela (ME/EPP dispensada do Ministério: LC 123/2006, art. 51, V);
  - **art. 134, § 3º:** início nos 2 dias antes de feriado bloqueia; antes de domingo avisa (repouso pode ser outro dia);
  - **art. 140:** menos de 12 meses de contrato goza as proporcionais e o período aquisitivo recomeça no início do gozo;
  - **12 meses ou mais:** o saldo dos períodos fechados, do mais antigo; o que passa vira licença remunerada (afastamento 16, salário normal na folha) ou, por escolha, antecipação do período em curso (um gozo por período);
  - fora: quem já está afastado no período, desligado durante as coletivas e intermitente.
- **Motor de férias:** o período aquisitivo fecha na véspera do gozo marcado como art. 140, com o direito proporcional (avos de 15 dias ou mais, faltas e suspensões); o seguinte começa no gozo. A média das variáveis do período proporcional é pelos meses dele. O plano calcula os dias proporcionais pelo próprio motor, para os dois baterem.
- **Gravação:** os gozos (15) e as licenças (16) vão para Cadastros › Afastamentos marcados com a coletiva (sem sobrescrever nenhum existente); os recibos saem no Cálculo › Férias da competência do início. Reaberto, o plano mostra quem já foi gravado.
- **Comunicação em PDF:** ao Ministério do Trabalho, ao sindicato e o aviso para afixar, com a tabela de dias de cada empregado.
- **Catálogo SAGE:** férias passa a disponível. Placar: 19 disponíveis, 20 parciais, 9 planejados, 3 fora.
- **Testes:** plano (saldo, art. 140, licença, antecipação, exclusões, regras e gravados), motor (recibo das proporcionais e novo período), tela e PDF.

## 10/10/2026 — Salário mínimo federal e estadual

Paulo: no modal de cadastros (tabelas), os campos "Salário Mínimo Federal" (todo o território nacional) e "Salário Mínimo Estadual" (como o de São Paulo, diferente do federal).

- **Cadastros › Tabelas legais:**
  - "Salário mínimo nacional" passou a "Salário mínimo federal (todo o território nacional)";
  - nova tabela **"Salário mínimo estadual (piso regional da UF)"**, com vigência, norma, UF e os pisos de cada categoria (SP hoje tem piso único; PR, RS, SC e RJ têm faixas). A mesma vigência pode existir em UFs diferentes; a vigente é a da UF. Nenhum valor vem pronto (norma obrigatória, como nas outras).
- **Empresa:** UF e município do local de trabalho no cadastro (preenchidos pela consulta do CNPJ). A UF decide qual mínimo estadual vale.
- **Conferência** (`services/conformidade/salarioMinimo.ts`), na folha mensal (Cálculo › Mensal), com o salário vigente na competência pelo histórico:
  - abaixo do federal: erro (CF, art. 7º, IV), proporcional à jornada menor que 220 h (TST, OJ 358) e também para o aprendiz;
  - abaixo do menor piso estadual da UF: aviso, porque o piso estadual vale para quem não tem piso em lei federal, convenção ou acordo coletivo (LC 103/2000) — com a convenção cadastrada (próximo lote), o piso dela prevalece;
  - fora: quem não é empregado e o intermitente; sem UF na empresa ou sem tabela federal, avisa.
- **Catálogo SAGE:** Tabelas legais cita o mínimo estadual e a conferência.
- **Testes:** tabela estadual (UF, pisos, vigência por UF), mínimos vigentes, conferência (federal, estadual, jornada parcial, salário por hora, histórico, quem fica fora).

## 10/10/2026 — Sindicato na empresa, convenção coletiva em PDF e conformidade

Paulo: sindicatos vinculados ao cadastro das empresas; campo para upload da última convenção coletiva com a validade; o app confronta os dados da convenção (data de reajuste, piso permitido, regras obrigatórias) e alerta o não cumprimento.

- **Empresa ↔ sindicatos:** Empresas › editar › "Sindicatos da categoria" (vários; funcionário de categoria diferenciada usa o sindicato da ficha).
- **Convenções do sindicato** (Cadastros › Sindicatos › abrir o sindicato › Convenções; `services/sindicatos/convencao.ts`):
  - CCT ou ACT com vigência (até 2 anos: CLT, art. 614, § 3º), data-base, registro no Mediador, reajuste (% e a partir de), pisos por função (CBO opcional), adicionais de hora extra (dias úteis e domingos/feriados) e noturno, obrigações (uma por linha) e o **PDF**;
  - ao escolher o PDF, o texto é lido no navegador (PDF.js, nada vai para a rede) e sugere vigência, data-base, registro, reajuste e pisos; a equipe confere e grava;
  - `convencoes_coletivas/{cnpj}_{início}` no Firestore e o PDF no Storage (`convencoes/{cnpj}/…`): qualquer aprovado envia e lê; nada se sobrescreve nem se apaga (só o admin apaga a convenção).
- **Cadastros › Conformidade** (empresa e competência; `components/conformidade/ConformidadePanel.tsx`):
  - empresa: sem sindicato, sindicato sem convenção, convenção vencida (erro) ou a vencer em 30 dias, data-base passada sem a convenção nova, obrigações sem confirmação, funcionários sem histórico de salário (reajuste não conferido);
  - funcionário: salário abaixo do piso (pelo CBO, pelo cargo ou o menor, proporcional à jornada), reajuste da data-base não aplicado pelo histórico de salário (admitido depois da data-base anterior: aviso para conferir o proporcional), horas extras lançadas a 50%/100% quando a convenção garante mais, ficha sem sindicato com dois na empresa;
  - junta com o salário mínimo federal e estadual; o estadual sai para quem tem piso na convenção (LC 103/2000);
  - checklist das obrigações da convenção por empresa, com quem marcou e a observação (`convencao_checklist/{empresa}_{convenção}`).
- **Deploy:** a publicação das regras passa a incluir as do Storage (sem permissão da conta, avisa e segue).
- **Catálogo SAGE:** Sindicatos atualizado (continua parcial: desconto sindical e aviso prévio da convenção ainda não entram no cálculo).
- **Testes:** convenção (validação, vigente, piso por CBO/cargo, conferência, leitura do texto), telas (PDF pré-preenchendo e gravando; conformidade com o piso, o estadual suprimido e o checklist), regras do Firestore e do Storage.

## 11/10/2026 — Renovação da convenção: data válida e dias em atraso

Paulo: "a convenção publicada pelos sindicatos deve conter data de renovação válida e contagem com sinalizador de dia em atraso da nova publicação".

- **Renovação** (`renovacaoDoSindicato`, `services/sindicatos/convencao.ts`): a data em que a nova convenção tem de valer é o dia seguinte ao fim da vigência da última cadastrada. Vigente: os dias que faltam; vencida sem a nova: os **dias em atraso** da nova publicação, contados desde o fim da vigência; cadastrada a nova, zera.
- **Sinalizador** (`components/sindicatos/SinalRenovacao.tsx`): verde (vigente), amarelo (até 30 dias para renovar), laranja (atraso de até 30 dias) e vermelho (atraso maior), com o ponto piscando no atraso.
- **Data de renovação válida ao gravar:** a vigência já era obrigatória (até 2 anos); agora a tela mostra a data de renovação e avisa quando ela não cai no mês da data-base, quando há intervalo sem convenção ou sobreposição com a anterior, e quando a convenção gravada já venceu (com os dias em atraso da nova).
- **Onde aparece:**
  - Cadastros › Sindicatos: coluna "Convenção e renovação" com o sinalizador e a data, e o alerta no topo com os sindicatos em atraso e os dias;
  - no sindicato › Convenções: o sinalizador no título;
  - Cadastros › Conformidade: a mensagem da convenção vencida traz os dias em atraso; a vencer, os dias que faltam;
  - Prazos do DP: "Nova convenção em atraso há N dias" (fica na lista até a nova ser cadastrada) e "Renovação da convenção coletiva" dentro do horizonte; com a empresa escolhida, os sindicatos dela.
- **Testes:** renovação (em dia, a vencer, atraso de 1 e 46 dias, nova zera, sem convenção), avisos ao gravar, prazos e a tela de sindicatos com o alerta.

## 11/10/2026 — Administração de benefícios

Paulo: administração de benefícios, com modal de links válidos para as principais empresas de transporte do estado de São Paulo (trens, ônibus, metrô) e de benefícios (Pluxee, Caju, Sodexo, Sólides, Porto Seguro odonto, Gympass/Wellhub, TotalPass, entre outros). No mesmo pedido: folha de domésticos (caseiro, cozinheira, babá) — lote próprio.

- **Onde:** Folha do mês › Administração de benefícios (`components/beneficios/AdministracaoBeneficios.tsx`), da empresa ativa.
- **Catálogo** (`services/beneficios/fornecedores.ts`), por categoria, com busca (também pelo nome antigo):
  - transporte em SP: SPTrans (Bilhete Único, ônibus da capital), TOP (vale-transporte metropolitano: Metrô, CPTM e EMTU; substituiu o cartão BOM), Metrô, CPTM, EMTU, ViaQuatro e ViaMobilidade;
  - alimentação e multibenefícios: Pluxee (antiga Sodexo), Alelo, Ticket, VR, Caju, Flash, iFood Benefícios, Swile e Sólides;
  - saúde e odonto: Porto Seguro Odonto e Odontoprev; bem-estar: Wellhub (antigo Gympass) e TotalPass.
- **Links:** só https; abrem em outra aba. A rede do ambiente de desenvolvimento não abre esses sites: os domínios de SPTrans, TOP, EMTU, Pluxee, Ticket, Flash, Sólides, Porto, Wellhub e TotalPass foram confirmados em busca pública (11/10/2026); os demais (Metrô, CPTM, ViaQuatro, ViaMobilidade, Alelo, VR, Caju, iFood, Swile, Odontoprev) são os domínios conhecidos e a tela marca "endereço a conferir ao abrir".
- **Contratados da empresa:** fornecedor (do catálogo ou outro), produto, contrato/nº do cliente, dia do pedido ou da recarga (com a data do próximo e quantos dias faltam), contato, link próprio do portal (vale no lugar do catálogo) e observação. Grava em `empresas.beneficiosContratados`; quem tem a empresa na carteira grava (regra e teste).
- **Catálogo SAGE:** benefícios cita a administração (continua parcial: falta a quantidade de VT a comprar e a coparticipação do plano de saúde).
- **Testes:** catálogo (links, ids, marcas antigas), link seguro, contratado, próximo pedido (mês curto, virada de ano), tela (busca, contratar, dia do pedido, gravar) e regra.

## 11/10/2026 — Folha complementar

Paulo: "pode seguir com a folha complementar".

- **Cálculo** (`services/calculo/complementar.ts`), pago com a folha da competência em que o instrumento foi celebrado:
  - fato gerador do eSocial ({tpAcConv}): convenção (C), acordo (A), dissídio (D), antecipação (G), lei (B) e parcelas conhecidas após o fechamento (J, com a descrição do MOS); E, F, H e I ficam para o IOB. Data da celebração obrigatória de A a E e não pode passar da competência;
  - reajuste retroativo (% de um mês a outro, anteriores à competência) sobre as **folhas gravadas**: salário, periculosidade, maternidade, horas extras e DSR, férias do mês e faltas, cada diferença no mesmo código da verba (o de/para do eSocial vale). Insalubridade e lançamentos avulsos não reajustam (aviso);
  - lançamentos à mão por funcionário e mês de referência (verba do motor ou avulso com descrição, com as incidências);
  - **INSS** mês a mês pela tabela e pelo teto de cada mês de referência: o INSS sobre a base gravada + a diferença, menos o da base gravada (o eSocial não calcula o do segurado em períodos anteriores; MOS, item 18.16);
  - **FGTS** 8% (aprendiz 2%), recolhido na competência da complementar;
  - **IRRF** no mês do pagamento, somado à folha da competência paga junto (rendimentos e deduções dela, menos o que ela reteve); sem ela, sozinho, com aviso;
  - **RRA** (diferenças de anos anteriores ao do pagamento): o resultado fica incompleto, com aviso, porque o IRRF é exclusivo na fonte pela tabela acumulada e o eSocial pede demonstrativo próprio — por enquanto pelo IOB;
  - avisos: mês sem folha gravada, reajuste que pega dezembro (13º à parte), desligado (verbas rescisórias à parte), diferença negativa (erro).
- **Tela** (Cálculo › Folha do mês › Pagamento › Folha complementar…; `components/calculo/FolhaComplementarModal.tsx`): tipo, data, descrição, mês do pagamento, reajuste e lançamentos; "Usar a convenção" preenche pelo reajuste da convenção do sindicato da empresa; prévia por funcionário com meses, diferenças, INSS, IRRF, líquido, FGTS, verbas e memória; holerites em PDF; gravar, abrir, regravar e excluir.
- **Gravação:** `folhas_complementares/{empresa}_{competência}_{tipo}` (uma por instrumento na competência). Regras: quem pode na empresa grava, regrava e exclui com a competência aberta; encerrada no Fim de mês, nada muda.
- **eSocial:** a tela "S-1200 e S-1210" carrega as complementares gravadas da competência e põe cada uma num demonstrativo próprio (`COMP{AAAAMM}{tipo}-{matrícula}`) com `infoPerAnt/ideADC` (dtAcConv, tpAcConv, dsc, remunSuc N) e um `idePeriodo` por mês de referência com as diferenças e o INSS do mês; o IRRF vai no último mês. O pagamento entra no S-1210 junto com a folha. Conferido no XSD oficial do S-1.3. Quem não está na folha do mês (desligado) ainda não sai: aviso.
- **Catálogo SAGE:** Folha Complementar passa de planejado a parcial (19 disponíveis, 21 parciais, 8 planejados, 3 fora).
- **Testes:** validação, reajuste (INSS por mês, FGTS, IRRF somado, teto, aprendiz), RRA, lançamentos, sugestão pela convenção, S-1200 no XSD, tela e regras.

## 11/10/2026 — Folha de empregados domésticos

Paulo: "pode seguir com folha de domésticas" (caseiro, cozinheira, babá, entre outros).

- **Regras** (`services/domestico/domestico.ts`; LC 150/2015), conferidas em busca pública (11/10/2026):
  - FGTS de 8% e mais **3,2% de indenização compensatória** (art. 22) sobre a mesma base, no mensal, no 13º e na rescisão;
  - **doença:** o INSS paga desde o 1º dia; o empregador doméstico não paga os 15 primeiros dias (Lei 8.213/1991, art. 60);
  - **salário-maternidade** pago direto pelo INSS (Lei 8.213/1991, art. 73, I): sem salário no período, com o FGTS (8% + 3,2%) sobre a remuneração dos dias (Decreto 99.684/1990, art. 28, IV); prorrogação da Empresa Cidadã não se aplica (aviso);
  - **férias** em até 2 períodos, um com 14 dias ou mais (art. 17, § 2º): avisos no recibo; sem o aviso dos 5 dias da CLT;
  - **rescisão:** sem multa de 40% ou 20%; os 3,2% vão para o empregado na dispensa sem justa causa e voltam ao empregador na justa causa, no pedido de demissão e no fim do contrato a termo (art. 22, § 1º), metade na culpa recíproca; no fim do contrato a termo, sem os 3,2% no mês (como o eSocial Doméstico); aviso do seguro-desemprego do doméstico (3 parcelas de um salário mínimo; art. 26);
  - **DAE:** INSS do empregado, INSS do empregador 8%, GILRAT 0,8%, FGTS 8%, indenização 3,2%, IRRF, menos o salário-família; vencimento no dia 7 do mês seguinte, antecipado para o dia útil anterior (art. 35).
- **Cálculo › Folha mensal:** com domésticos na folha, o quadro "DAE do eSocial Doméstico" mostra os valores esperados e o vencimento. O holerite em PDF mostra os 3,2%.
- **eSocial:** o empregador doméstico escritura pelo eSocial Doméstico (módulo web, que gera o DAE): o S-1200 e o S-2299 da categoria 104 não saem pelo Consultor (erro com a orientação).
- **Ficha:** com a categoria 104, o campo CBO sugere as funções domésticas (serviços gerais/caseiro 5121-05 e babá 5162-05 conferidos na CBO; cozinheiro, cuidador, jardineiro e motorista marcados para conferir).
- **Catálogo SAGE:** Cálculo da Folha cita os domésticos.
- **Testes:** mensal (FGTS + 3,2%, doença, maternidade), 13º, férias (2 períodos), rescisão (sem justa causa, pedido, contrato a termo), DAE (composição e vencimento), eSocial e o quadro do DAE.

## 11/10/2026 — Rescisão e 13º complementares

Paulo: "pode seguir com rescisão e 13 complementares".

Tudo pela Folha complementar (Cálculo › Pagamento › Folha complementar…), conforme o MOS do S-1200:

- **13º complementar** (`complemento13`, `services/calculo/complementaresMotores.ts`): na competência de janeiro, o 13º do ano anterior com as variáveis de dezembro na média (movimento gravado), menos o pago na 2ª parcela. Pago até 10/01 (Decreto 10.854/2021, art. 77). No eSocial: S-1200 de janeiro, tipo J, mês de referência 12, rubrica de natureza 5005 (MOS, item 19.2). Não é RRA.
- **Diferença do 13º pelo reajuste** (`diferenca13DoReajuste`): quando o reajuste retroativo pega dezembro, o percentual sobre o 13º do ano, no mês de referência de dezembro (MOS, item 18.13).
- **Rescisão complementar** (`diferencasDaRescisao`): quem foi desligado nos meses do reajuste tem a rescisão refeita com o salário (e o histórico) reajustado. As diferenças de aviso, 13º proporcional e indenizado, férias vencidas e proporcionais com 1/3 e art. 479 vão no mês do desligamento (MOS, item 18.10, exemplo 3).
  - O saldo de salário só entra se o holerite do mês não estiver na folha gravada.
  - O aviso indenizado é deduzido da data projetada da ficha.
  - Correção de erro na rescisão continua sendo retificação do S-2299.
- **INSS e IRRF do 13º** na complementar:
  - INSS pela base própria do 13º (o pago + a diferença), pela tabela do mês;
  - IRRF exclusivo na fonte, recalculado sobre o 13º pago + a diferença, menos o retido;
  - rubricas INSS13 e IRRF13.
- **Domésticos:** os 3,2% também na complementar.
- **eSocial:**
  - quem não está na folha do mês (desligado) passa a ter o S-1200 só com o demonstrativo das diferenças, pago na data da folha;
  - o de/para sugere as naturezas: 5005 e 5001 para o 13º; 6003, 6002, 6001, 6006, 6007, 6004 e 6104 para as verbas rescisórias.
- **Tela:**
  - no reajuste, as opções "Diferença do 13º" (só quando o reajuste pega dezembro) e "Rescisões no período";
  - em janeiro, "13º complementar", que preenche o tipo J e a descrição;
  - as opções ficam gravadas com a complementar.
- **Catálogo SAGE:** 13º, Rescisão e Folha Complementar atualizados.
- **Testes:** os três cálculos, a complementar com o 13º (INSS e IRRF próprios, sem RRA em janeiro), o S-1200 do desligado no XSD (só complementar e rescisão complementar com o de/para sugerido) e a tela.

## 11/10/2026 — Desconto sindical e aviso prévio da convenção no cálculo

Paulo: "pode seguir com desconto sindical e aviso prévio da convenção".

- **Convenção** (Cadastros › Sindicatos › Convenções), dois blocos novos:
  - **descontos para o sindicato:** tipo, forma (% do salário, valor fixo ou dias de salário), meses (vazio = todo mês), teto e a cláusula. A sindical já vem com um dia, em março;
  - **aviso prévio a mais:** idade mínima, tempo de casa mínimo e dias além da Lei 12.506/2011.
- **Ficha**, aba **Sindicato:** autorizou a contribuição sindical, opôs-se à assistencial e é filiado.
- **Regras** (`services/sindicatos/contribuicoes.ts`), conferidas em busca pública (11/10/2026):
  - contribuição sindical: só com autorização prévia, expressa e individual (CLT, art. 579; ADI 5.794); um dia de trabalho na folha de março (arts. 580 e 582);
  - assistencial/negocial: de todos, salvo quem exerceu o direito de oposição (STF, Tema 935);
  - confederativa e mensalidade: só dos filiados (Súmula Vinculante 40).
- **Folha mensal:** os descontos saem da convenção vigente do sindicato da ficha (ou do único sindicato da empresa). Convenção vencida não vale, porque não há ultratividade (art. 614, § 3º).
  - São descontos sem INSS, FGTS e IRRF, e quem não paga aparece na memória com o motivo.
  - Afastado o mês todo: não desconta e avisa para descontar no retorno (art. 602).
- **Rescisão sem justa causa:** a regra cumprida que dá mais dias soma ao aviso legal. Os dias a mais são indenizados e projetados (13º e férias), mesmo com aviso trabalhado. No acordo do art. 484-A, só aviso para conferir. Vale também nas prévias de Demissões.
- **eSocial:** o de/para sugere as rubricas pela descrição (SINDIC, ASSIST/NEGOC, CONFED, MENSAL/ASSOCIA). A natureza da Tabela 03 não foi confirmada em fonte confiável, então não é fixada.
- **Catálogo SAGE:** Sindicatos passa a disponível (20 disponíveis, 20 parciais, 8 planejados, 3 fora).
- **Testes:** regras de cada contribuição, validação, folha (bases iguais e líquido menor; afastado), aviso (melhor regra, indenizado, trabalhado, pedido, acordo), convenção da ficha e a tela da convenção.

## 11/10/2026 — Pró-labore e RPA

Paulo: "pode seguir com pró-labore e RPA".

- **Onde:** Folha do mês › Pró-labore e autônomos (RPA), da empresa ativa (`components/contribuintes/ContribuintesPanel.tsx`).
- **Cadastro** (`contribuintes_individuais/{empresa}_{cpf}`; não se apaga, fica inativo):
  - categoria 701 (autônomo), 722 (diretor sem FGTS) ou 723 (sócio);
  - CBO, NIT, S-2300 enviado (com a matrícula), inscrito no município (ISS) e dependentes para o IRRF.
  - Sócio e diretor exigem o S-2300 antes do S-1200; o autônomo não (MOS, S-1200, item 23).
- **Cálculo** (`services/contribuintes/contribuinteIndividual.ts`), um lançamento por pessoa no mês:
  - INSS de 11% até o teto. Com remuneração em outras fontes, só até completar o teto, e o S-1200 leva o infoMV (1, 2 ou 3; MOS, item 5);
  - 20% da empresa sobre a remuneração (Lei 8.212/1991, art. 22, III), sem RAT e terceiros. No Simples fora do Anexo IV, vai no DAS; sem enquadramento, fica de fora com aviso;
  - IRRF pela tabela do mês do pagamento, com dependentes ou o desconto simplificado e o redutor;
  - ISS retido do autônomo não inscrito no município, com a alíquota informada (até 5%);
  - sem FGTS, férias e 13º.
- **Mês gravado** em `pagamentos_ci/{empresa}_{competência}`: regrava ou apaga com o mês aberto. Encerrado no Fim de mês, não muda (regras e teste).
- **Recibos em PDF:** RPA e recibo de pró-labore, com as retenções, o líquido e a assinatura. A tela mostra o resumo do que vai na DCTFWeb.
- **eSocial** (`services/esocial/eventosCI.ts`):
  - S-1200 por CPF. Sem o S-2300, leva infoComplem (nome e nascimento) e infoComplCont (CBO). Com outras fontes, leva o infoMV;
  - RPA na natureza 3501 e ISS na 9222 (MOS, item 13), sugeridos no de/para; o INSS e o IRRF usam as rubricas da folha;
  - S-1210 no mês do pagamento. Com dependentes deduzidos, leva o infoIRComplem com o código 058806, a conferir na Tabela 29;
  - pré-voo (XSD) e envio pelo CFI, como na folha. Só originais: a retificação ainda é pelo IOB.
- **Catálogo SAGE:** Autônomos atualizado e Pró-labore planejado → parcial (falta o informe de rendimentos; transportador autônomo 711/712 fica para depois). Agora são 20 disponíveis, 21 parciais, 7 planejados e 3 fora.
- **Testes:** cadastro, lançamentos, cálculo (teto e outras fontes, ISS, Simples, dependentes), S-1200 e S-1210 no XSD, tela e regras.

## 11/10/2026 — Ficha financeira com o histórico do SAGE; DIRF, REINF e DCTFWeb no catálogo

Paulo: "pode seguir com ficha financeira com historico da SAGE, porém alguns detalhes: a DIRF não existe mais, já foi desobrigada; a REINF e a DCTFWeb têm a parte que cabe ao DP sim".

- **De onde vem:** o mesmo `holerith` do schema da empresa no Backup SQL, que já dava as horas extras e faltas. Agora também dá os **valores** de cada evento (`services/relatorios/historicoSage.ts`):
  - liga pelo código IOB, no vínculo em vigor na competência, como o histórico da folha;
  - valor em centavos pela coluna `valor` (sem ela, `vl_ven` ou `vl_des`);
  - provento, desconto ou informativo, nesta ordem: o tpRubr do S-1010 do backup, a coluna preenchida (vl_ven/vl_des), a natureza (99xx informativa, 9xxx desconto) e a descrição;
  - totais e líquido do próprio SAGE ficam de fora, porque a ficha soma de novo;
  - o resumo da etapa mostra quantos lançamentos vieram de cada finalidade (coluna `final`), para conferir com a Ficha Financeira do SAGE.
- **Restauração** (IOB SAGE › Restaurar): a etapa 5 ganha "Ficha financeira do SAGE", com o parâmetro "a partir de" (padrão: cinco anos). Grava `historico_sage/{fichaId}_{AAAA}`, um por funcionário e ano. Restaurar de novo regrava por cima. Regras: grava quem pode na empresa, com o id da ficha e do ano, e só o admin apaga (teste de regras).
- **Relatório** (Relatórios › Central › Ficha financeira):
  - no mesmo mês, a folha gravada no Consultor vale; o SAGE preenche os meses sem ela, com total de proventos, de descontos e líquido;
  - as bases do SAGE (informativas) aparecem no fim;
  - no PDF, os meses do SAGE ficam com * e os eventos dele em itálico; no Excel, há a coluna "Origem";
  - o seletor de ano vai a seis anos.
- **Catálogo SAGE**, com as correções do Paulo:
  - **DIRF:** extinta. O informe de rendimentos já sai pelos S-5002 (disponível) e sai da lista de pendências.
  - **EFD-Reinf:** deixa de ser "fora" e passa a planejado, com a parte do DP:
    - R-4010 dos rendimentos de pessoa física pagos pela folha que não vão pelo eSocial (os casos que o MOS manda para a Reinf);
    - R-4099 de fechamento.
    - As retenções de serviços tomados seguem no CCI e no CFI.
  - **DCTFWeb:** parcial. Falta transmitir a declaração da folha e emitir o DARF pelo Integra Contador do SERPRO, com procuração.
  - **Ficha Financeira:** o texto inclui o histórico do SAGE.
  - Agora são 20 disponíveis, 21 parciais, 8 planejados e 2 fora.
- **Testes:**
  - tipo do lançamento;
  - holerith → ficha por ano (vínculo, totalizador, vl_des, finalidades);
  - junção com a folha gravada, meses sem folha e PDF;
  - a etapa na restauração, o catálogo e as regras.

## 11/10/2026 — DCTFWeb da folha: semáforo, DARF e transmissão (parte do DP)

Paulo: "pode seguir com dctfweb do DP".

- **Onde:** eSocial › DCTFWeb da folha (`components/dctfweb/DctfwebFolhaPanel.tsx`), da empresa e do período ativos.
- **O que mostra**, tudo pelo túnel do CFI (Integra Contador, procuração do escritório):
  - a situação da declaração (em andamento ou transmitida);
  - o semáforo dos insumos, que é o mesmo do CFI: eSocial (S-1299, do DP), EFD-Reinf (Contábil) e MIT (Fiscal);
  - os débitos com saldo a pagar;
  - o vencimento do DARF da folha: dia 20 do mês seguinte, antecipado para o dia útil anterior.
- **DARF:** sai a qualquer momento. Com a declaração em andamento usa o GERARGUIAANDAMENTO313; com a ativa, o GERARGUIA31. O PDF é baixado na hora; mock do CFI é recusado.
- **Transmissão:** a regra T1 do CFI (12/08) diz que a transmissão é do Fiscal. A exceção nova, T1-DP, é aplicada pelo CFI:
  - o DP transmite quando os três insumos estão confirmados, isto é, eSocial recebido e Reinf e MIT recebidos ou sem movimento;
  - com pendência ou sem confirmação, quem transmite é o Fiscal (ou o admin), com a justificativa gravada (T3);
  - transmitida, a tela passa para a retificadora, que exige motivo (T5);
  - a auditoria fica no CFI (`dctfweb_transmissoes` com origem dp e `dp_dctfweb_log`).
- **CFI:** rotas `/dctfweb/insumos`, `/dctfweb/darf` e `/dctfweb/transmitir` no túnel. Só o DP chama, só nas empresas da carteira, e o perfil (departamentos) vem do cadastro central pelo e-mail.
- **S-1299:** com "Transmitir a DCTFWeb logo após o fechamento" marcado, a tela avisa para conferir o semáforo antes. Se o Reinf ou o MIT estiverem pendentes, o certo é desmarcar.
- **Catálogo SAGE:** DCTFWeb passa a disponível (21 disponíveis, 20 parciais, 8 planejados, 2 fora).
- **Testes:** semáforo (só fica "pronto" com os três lidos), ações da tela, vencimento com feriado e fim de semana, pedido de transmissão e a tela (DARF em andamento, transmissão pelo DP e o Fiscal com justificativa).

## 11/10/2026 — Processo trabalhista no eSocial (S-2500 e S-2501)

Paulo: "pode seguir com a reinf do dp". Ele escolheu: quem envia a EFD-Reinf é o CFI (Fiscal), e a parte do DP são os pagamentos judiciais a ex-empregados.

- **Correção do escopo, antes de construir:** desde 10/2023, as decisões e os acordos da Justiça do Trabalho e das CCP/NINTER vão pelo **eSocial**: S-2500 (processo) e S-2501 (tributos). Não vão pelo R-4010. Paulo escolheu fazer o S-2500/S-2501. O R-4010 do DP fica só para os casos residuais, como IRRF devido por terceiro, e continua planejado.
- **Onde:** eSocial › Processos trabalhistas (`components/processoTrabalhista/ProcessosTrabalhistasPanel.tsx`), da empresa ativa.
- **S-2500** (`services/processoTrabalhista/processoTrabalhista.ts`):
  - o processo é judicial (número do CNJ com os dígitos verificadores pelo módulo 97, data da decisão, UF, município e Vara) ou um acordo em CCP/NINTER (data, âmbito e CNPJ do sindicato);
  - o trabalhador vem da ficha (CPF e matrícula do S-2200), com o período, a repercussão e as bases mês a mês: INSS, INSS do 13º e FGTS;
  - nesta versão vale só o tpContr 1, ou seja, vínculo no eSocial sem mudar datas, categoria, natureza nem motivo.
- **S-2501:** cada pagamento (mês e sequencial) tem as contribuições por mês e por código de receita da Tabela 29, digitadas como na guia, e o IRRF:
  - 593656 para Justiça do Trabalho e 056152 para CCP/NINTER, com 13º separado;
  - 188951 para RRA, com a descrição, o número de meses, as custas e os advogados;
  - campos de rendimento tributável, juros de mora, INSS deduzido e isento com descrição.
- **Valores:** vêm do cálculo homologado; o Consultor não recalcula INSS nem IRRF de processo.
- **Envio:** pré-voo (XSD) e cofre, como os outros eventos. Com o recibo informado, o evento vai como retificação. A gravação fica em `processos_trabalhistas/{empresa}_{número}`; só o admin apaga (regras e teste).
- **Fora desta versão:**
  - reconhecimento de vínculo e mudança de datas, categoria ou motivo;
  - unicidade contratual e responsabilidade indireta;
  - depósito judicial (indReperc 4 e 5) e Justiça Comum.
- **Catálogo SAGE:** entra "Processo Trabalhista (S-2500/S-2501)" como parcial. EFD-Reinf continua planejado, com o texto corrigido. Agora são 21 disponíveis, 21 parciais, 8 planejados e 2 fora.
- **Fonte:** os XSDs oficiais S-1.3 que já estão no repositório. Os códigos de IRRF vêm do próprio XSD. Os das contribuições não foram fixados porque a Tabela 29 vigente não pôde ser consultada daqui.
- **Testes:**
  - CNJ e meses do período;
  - validações do processo e do pagamento;
  - quatro XMLs no XSD oficial: S-2500 judicial, S-2500 de CCP com retificação, S-2501 com RRA e S-2501 com 13º;
  - a tela (cadastro, bases, gravação e S-2500) e as regras.

## 11/10/2026 — RPA completo: transportador autônomo (711/712) e retificação do S-1200/S-1210

Paulo: "pode seguir com RPA" e escolheu "completar o RPA".

- **Transportador autônomo** (`services/contribuintes/contribuinteIndividual.ts`), categorias 712 (carga) e 711 (passageiros), sobre o valor bruto do frete:
  - INSS de 11% até o teto e parte da empresa de 20%, ambos sobre a base de 20% do frete (Decreto 3.048/1999, art. 201, § 4º);
  - SEST de 1,5% e SENAT de 1,0% sobre a mesma base. O próprio S-5001 calcula assim, com os códigos 121802 e 122102 para as categorias 711, 712 e 734, segundo o XSD oficial S-1.3;
  - IRRF sobre 10% do frete (carga) ou 60% (passageiros), pela Lei 7.713/1988, art. 9º;
  - sem ISS retido.
- **eSocial** (`eventosCI.ts`):
  - o frete inteiro vai numa rubrica que não é base;
  - as bases vão em rubricas informativas (tpRubr 3): 20% com codIncCP 11 e 10%/60% com codIncIRRF 11;
  - o SEST e o SENAT vão nas rubricas de codIncCP 34 e 35. Essas incidências vêm do XSD do S-1010 e são conferidas: rubrica errada vira erro antes do envio;
  - o de/para ganha FRETE, BASEFRETE, BASEIRFRETE, SEST e SENAT, com sugestão pela incidência.
- **Retificação:**
  - em produção, quem já tem S-1200 ou S-1210 aceito pelo Consultor (`recibosCIDosEnvios`, ref `ci:cpf:competência`) vai com indRetif 2 e o recibo;
  - o S-1210 de quem também é empregado da empresa não é gerado aqui, porque o do mês leva a folha: retifica-se pela folha (exclusão e reenvio).
- **Catálogo SAGE:**
  - Autônomos passa a disponível;
  - Pró-labore continua parcial;
  - o informe de rendimentos dos dois sai pelos S-5002 (Relatórios › Anuais);
  - agora são 22 disponíveis, 20 parciais, 8 planejados e 2 fora.
- **Testes:**
  - cálculo de carga e de passageiros;
  - S-1200 e S-1210 no XSD, inclusive a retificação;
  - conferência das incidências;
  - S-1210 de quem também é empregado;
  - recibos pelos envios.

## 11/10/2026 — Benefícios: pedido de vale-transporte e coparticipação do plano de saúde

Paulo: "segue para próximo". O RRA ficou para depois porque falta confirmar como o redutor da Lei 15.270/2025 se aplica a ele. O próximo item da lista era o de benefícios.

- **Onde:** Folha do mês › Administração de benefícios, abaixo dos fornecedores (`components/beneficios/VtECoparticipacao.tsx`).
- **Pedido de vale-transporte** (`services/beneficios/vtECoparticipacao.ts`):
  - o itinerário fica em `vt_itinerarios/{fichaId}`: linhas com operadora, trecho, tarifa e viagens por dia, e os dias da semana do deslocamento;
  - a quantidade do mês de uso (padrão: o mês seguinte à competência) conta esses dias, menos os feriados nacionais, as férias e os afastamentos lançados e os dias fora do vínculo;
  - mostra o total por funcionário e por operadora e gera o Excel do pedido;
  - a coluna "custo na ficha" fica em destaque quando difere do pedido, porque é ela que limita o desconto de 6% no Cálculo mensal (Lei 7.418/1985, art. 4º, parágrafo único).
- **Coparticipação do plano de saúde:**
  - a planilha da operadora (Excel ou CSV) é lida pelo cabeçalho (CPF, nome e valor) e somada por CPF;
  - cada valor é ligado à ficha com vínculo na competência;
  - vira um lançamento avulso de desconto no movimento do mês, sem INSS, FGTS e IRRF (Lei 8.212/1991, art. 28, § 9º, q);
  - lançar de novo substitui o lançado antes; quem não tem ficha aparece à parte.
- **Regras:** grava e lê quem pode na empresa, com o id da ficha da empresa (teste de regras).
- **Catálogo SAGE:** o item de benefícios continua parcial, mas sem as duas faltas. Fica pendente a coparticipação na dedução do IRRF (S-1210, plano de saúde).
- **Testes:** dias de uso (feriados de 11/2026, férias e admissão no meio do mês), pedido por operadora, leitura da planilha, soma e substituição no movimento, e a tela.

## 11/10/2026 — Plano de saúde no S-1210 (mensalidade e coparticipação)

Paulo: "pode seguir". O RRA ficou para o fim da lista, e este era o próximo item: a coparticipação na dedução do IRRF.

- **Benefício da empresa** (Cálculo › Benefícios): ganha o campo "plano de saúde", com o CNPJ da operadora e o registro na ANS (6 dígitos). Só vale para desconto; CNPJ e registro inválidos são recusados. O desconto do empregado sai do motor marcado com a operadora (`Verba.planoSaude`).
- **Coparticipação** (Administração de benefícios): na importação, informa-se a operadora, e o lançamento avulso leva a mesma marca (`Lancamento.planoSaude`).
- **S-1210 da folha** (`eventosFolha.ts`):
  - soma o que o empregado pagou na folha do mês por operadora (mensalidade e coparticipação);
  - informa em `infoIRComplem/planSaude` (cnpjOper, regANS, vlrSaudeTit), no mês do pagamento;
  - o valor vai todo no titular, porque ainda não há divisão por dependente; a tela avisa;
  - com S-1210 já aceito, o plano entra se o aceito não tinha; se tinha, fica o dele, com aviso.
- **Informe de rendimentos:** já lia o planSaude dos S-5002, então o valor passa a aparecer nele.
- **Testes:** validação do benefício; mensalidade e coparticipação somadas no planSaude, com o S-1210 no XSD oficial S-1.3; sem a operadora, nada de planSaude.

## 11/10/2026 — Processo trabalhista completo (S-2500: tipos de contrato 2 a 7, categoria e depósito judicial)

Paulo: "pode seguir". Continuação do S-2500/S-2501 da semana: a primeira versão só aceitava o tipo 1 (vínculo no eSocial sem mudança).

- **Tipos de contrato** (`services/processoTrabalhista/processoTrabalhista.ts`, campo `tpContr`):
  - 2, 3 e 4: vínculo no eSocial com nova admissão e/ou novo desligamento. O S-2500 leva a admissão original; a tela avisa que o S-2200 retificado (admissão) e o S-2299 (desligamento) levam as datas novas, como pede o leiaute;
  - 5 (reconhecimento de vínculo) e 7 (vínculo anterior ao eSocial): o contrato não está no eSocial, então vão no S-2500 o nome, o nascimento, a matrícula nova, a categoria e o vínculo inteiro (CBO, natureza, remuneração, regime, admissão, tempo parcial, duração, desligamento, motivo, aviso projetado e pensão alimentícia);
  - 6 (TSVE): com S-2300, só a matrícula; sem S-2300, início, categoria, CBO, remuneração e término (com o motivo do diretor não empregado, 721).
- **Indicativos:** reintegração (avisa do S-2298), nova categoria e/ou natureza da atividade (`mudCategAtiv`, em ordem de data) e novo motivo de desligamento (avisa da retificação do S-2299).
- **Depósito judicial:** repercussões 4 e 5 (a 5 leva as bases mês a mês); no S-2501, aviso de que o IRRF costuma ser retido pelo banco no levantamento.
- **Indenizações** substitutivas do seguro-desemprego e do abono salarial (com os anos-base).
- **Grau de exposição:** as bases das categorias de empregado, avulso e agente público passam a levar `infoAgNocivo` (o eSocial exige; o grau vem da ficha, padrão 1). Registros antigos sem a categoria vão como 101, com aviso.
- **Tela** (`components/processoTrabalhista/ContratoDoProcesso.tsx`, dentro de eSocial › Processos trabalhistas): tipo de contrato, categoria e grau por trabalhador, e "+ Trabalhador sem ficha" para quem não tem cadastro.
- **Fora, de propósito:** unicidade contratual (9), responsabilidade indireta (8) e Justiça Comum, que continuam pelo IOB ou pelo portal.
- **Catálogo SAGE:** `es-processo-trab` continua parcial, com o texto atualizado.
- **Testes:** cada tipo de contrato validado no XSD oficial S-1.3 (5, 7, 2/4, 6 com e sem S-2300), mudança de categoria, depósito judicial 4 e 5, erros por campo e a tela com o reconhecimento de vínculo de quem não tem ficha.

## 11/10/2026 — EFD-Reinf do DP: decisão de não construir o R-4010

Paulo: "pode seguir com a reinf do dp". Antes de construir, levantei o que já existe:

- O CFI tem o gateway que assina e transmite a Reinf (`reinf-gateway-routes.js`), aberto só ao próprio CFI e ao Contábil, mas não tem tela de envio.
- O app Contábil (CCI, `plano-contas-iob`) gera e transmite os R-4010 de aluguéis (13002) e lucros (12001) e fecha o período com o R-4099.
- Na folha, todos os pagamentos a pessoa física já vão pelo eSocial: salário, pró-labore e RPA pelo S-1200/S-1210, e o judicial trabalhista pelo S-2500/S-2501. Para o R-4010 do DP sobravam casos raros (Justiça Comum, pessoa física no exterior).

Decisões do Paulo:

- **Casos de R-4010 do DP nos clientes:** nenhum hoje. O R-4010 não é construído agora.
- **Se aparecer um caso:** o R-4010 "deve sair pelo app do DP, não cria dependência de outros departamentos". Não vai pela fila do Contábil nem por uma tela do Fiscal no CFI.

O que muda:

- **Catálogo SAGE:** `trib-reinf` passa a disponível, com destino na DCTFWeb da folha. A parte do DP é conferir a Reinf no semáforo de insumos antes de transmitir a declaração, o que já existe desde o DP #174. Aluguéis, lucros, serviços tomados e o R-4099 ficam com o Contábil.
- Agora são 23 disponíveis, 20 parciais, 7 planejados e 2 fora.

## 11/10/2026 — Trabalho intermitente (convocações, folha da convocação e eSocial)

Paulo: "pode seguir com trabalho intermitente". No mesmo pedido, ele pediu a folha de obras, com a legislação vigente, e a folha por departamento e por obra dentro da mesma empresa. Esses dois vêm nos próximos lotes. Até aqui, o motor recusava a categoria 111.

- **Convocações** (`services/calculo/intermitente.ts`, coleção `convocacoes_intermitente/{fichaId}_{seq}`, com regra e teste de regras):
  - dias e horas, valor da hora (o da convocação ou o da ficha), função e local, data de envio e resposta;
  - avisos dos prazos do art. 452-A: 3 dias corridos de antecedência (§ 1º) e resposta em 1 dia útil, com o silêncio valendo como recusa (§ 2º);
  - erros: valor da hora abaixo do mínimo-hora (caput), dia já em outra convocação, convocação dentro das férias lançadas (§ 9º) e dias fora do vínculo;
  - períodos aquisitivos e o prazo para dar o mês de férias;
  - texto da convocação para copiar e enviar ao empregado.
- **Folha da convocação** (motor mensal, categoria 111), com as convocações aceitas que têm dias na competência:
  - horas × valor da hora;
  - DSR por convocação: remuneração ÷ dias úteis × domingos e feriados do período, estendido até o domingo seguinte;
  - adicional de insalubridade ou periculosidade proporcional às horas;
  - horas extras e lançamentos do movimento;
  - férias proporcionais (1/12) + 1/3 e 13º proporcional (1/12), conforme o § 6º;
  - INSS: o do mês inclui as férias; o do 13º é em separado;
  - IRRF: o do mês, o das férias (em separado, IN SRF 15/2001, art. 13) e o do 13º (exclusivo);
  - FGTS de 8% sobre tudo;
  - aviso quando a remuneração fica abaixo do mínimo, para o empregado complementar a contribuição (EC 103/2019, art. 29);
  - sem convocação no mês, nada a pagar.
- **Incidência das férias do intermitente:** INSS e FGTS. Segundo fonte secundária, a Solução de Consulta Cosit 17/2019 diz que as férias com 1/3 pagas a cada convocação integram a base, salvo quando indenizadas; não achei o texto oficial. O cálculo avisa para conferir as rubricas do S-1010.
- **eSocial:**
  - S-1200 com `ideTrabalhador/infoInterm` (os dias trabalhados), obrigatório para a categoria 111;
  - sem convocação no mês, sem demonstrativo; no S-1200 do 13º, erro, porque o 13º do intermitente vai no mensal;
  - S-1210 com as deduções de dependentes do 13º (tpRend 12) e das férias (tpRend 13), e a pensão do 13º no tpRend 12;
  - rubricas com modelos e sugestões: INTERM (1000), DSRINT (1002), FERINT (1016), FERINT13 (1017) e 13INT (5001, incidências 12).
- **Tela:** Folha do mês › Trabalho intermitente (`components/calculo/IntermitentesPanel.tsx`). O Cálculo mensal carrega as convocações da empresa.
- **Catálogo SAGE:** `proc-intermitente` passa de planejado a parcial. Ficam para depois a rescisão do intermitente (S-2299 com infoInterm) e o salário-família.
- **Testes:**
  - convocação: prazos, mínimo-hora, conflitos e férias;
  - folha: valores, DSR, INSS e IRRF em separado, dias;
  - S-1200 e S-1210 no XSD oficial;
  - a tela e as regras.

## 11/10/2026 — Obras e lotações tributárias (S-1005 e S-1020), 1ª parte da folha de obras

Paulo: folhas de obras são ponto crucial, "devemos ter máxima atenção neste ponto e atualizar quanto a legislação vigente". Ele também pediu a folha por departamento e por obra dentro da mesma empresa. Respostas dele:
- os clientes têm os três casos: obra própria ou empreitada total, empreitada parcial ou subempreitada, e cessão de mão de obra;
- um funcionário pode trabalhar em mais de uma obra no mês, com rateio por dias;
- há clientes na CPRB;
- os departamentos terão cadastro próprio.

Antes disto, o Consultor tinha um estabelecimento e uma lotação por empresa e nenhum S-1005, S-1020 ou CNO. Por isso o trabalho vem em partes.

Parte 1 (este lote):
- **Modelo** (`services/obras/lotacoes.ts`), lotação por obra ou tomador:
  - **01, obra própria ou empreitada total:** o CNO é da empresa. A obra é um estabelecimento (S-1005 com tpInsc 4, CNAE da obra, cnpjResp, RAT/FAP só quando diferentes e, para construtora, `infoObra/indSubstPatrObra`). No S-1200, o estabelecimento é o CNO. Sem CNO, a lotação 01 é o próprio estabelecimento;
  - **02, empreitada parcial ou subempreitada:** o S-1020 leva o CNO da obra e `infoEmprParcial` (contratante; proprietário quando não está no CNO);
  - **04, cessão de mão de obra:** o S-1020 leva o CNPJ do tomador, com aviso da retenção de 11% (3,5% na CPRB) na nota, declarada pelo Fiscal no R-2020;
  - FPAS e terceiros por lotação (construção: 507/0079); validade e recibos (o envio seguinte sai como alteração).
- **Cadastro:** coleção `lotacoes/{empresa}_{código}`, com regra e teste de regras.
- **Tela:** Cadastros › Obras e lotações. Grava e transmite o S-1005 e o S-1020 pelo pré-voo e pelo cofre.
- **Ficha:** novo campo "Obra ou lotação tributária" (Ident. Adm.).
- **Catálogo SAGE:** novo item `arq-obras`, parcial.
- **Fontes:**
  - Manual de Orientação do eSocial e o XSD S-1.3 (Tabela 10 e regras do S-1005/S-1020);
  - IN RFB 2.021/2021 (CNO);
  - Lei 8.212/1991, art. 31 (cessão de mão de obra).
- **Testes:** os três casos no XSD oficial, erros por campo, a tela e as regras.

Parte 2, a seguir:
- rateio por dias entre obras no movimento do mês;
- S-1200 com um `ideEstabLot` por lotação;
- encargos e resumo por obra;
- a reoneração da CPRB (Lei 14.973/2024; IN RFB 2.242/2024): em 2026, 2,7% sobre a receita (com o Fiscal, no R-2060) e 10% da cota patronal sobre a folha, sem a cota patronal no 13º.

Parte 3: o cadastro de departamentos e a folha filtrada por departamento ou obra.

## 11/10/2026 — Folha por obra (parte 2): rateio, S-1200 por lotação, encargos por obra e a CPRB

Continuação do lote anterior (obras e lotações), com as respostas do Paulo: rateio por dias entre obras e clientes na CPRB.

- **Movimento do mês:** "Rateio por obra", com os dias em cada lotação cadastrada. Sem ele, vale a obra da ficha. O motor guarda as obras do mês no resultado (`lotacoes`).
- **S-1200:**
  - um `ideEstabLot` por obra: na obra própria com CNO, o estabelecimento é o CNO (tpInsc 4); nas demais, o CNPJ;
  - os proventos se dividem pelos dias (o centavo que sobra fica na obra principal) e os descontos ficam na principal;
  - adiantamento, 1ª parcela do 13º e recibo de férias vão na obra principal;
  - erro quando a obra não está no cadastro ou está fora da validade, e aviso quando falta o recibo do S-1020 ou do S-1005;
  - teste no XSD oficial.
- **Encargos por obra** (`services/obras/folhaPorObra.ts`), no resumo da folha:
  - base, INSS dos segurados, patronal, RAT × FAP (o da obra própria, quando diferente), terceiros e FGTS;
  - com mais de uma obra, a patronal da empresa é a soma das obras.
- **CPRB** (enquadramento, "Optante pela CPRB"), Lei 12.546/2011 com a reoneração gradual da Lei 14.973/2024 (IN RFB 2.242/2024):
  - cota patronal sobre a folha de 25%, 50% e 75% dos 20%, isto é, 5%, 10% e 15% em 2025, 2026 e 2027; inteira em 2028;
  - sem cota patronal sobre o 13º na transição;
  - RAT e terceiros inteiros;
  - obra própria com a patronal não substituída (S-1005) paga os 20%;
  - a memória lembra que a CPRB sobre a receita é do Fiscal (R-2060) e a regra dos 75% da média de empregados.
- **Fontes da pesquisa (buscador; os sites do governo não abrem daqui):** Lei 14.973/2024, IN RFB 2.242/2024, NT 02/2024 do eSocial e artigos especializados. Há uma fonte que diverge sobre o 13º. Vale conferir com a contabilidade antes da primeira DCTFWeb de cliente na CPRB.
- **Correção encontrada no caminho:** a limpeza do movimento tirava o plano de saúde do lançamento de coparticipação (entrega do #178). Gravado e lido de novo, ele sumia do planSaude do S-1210. Agora fica gravado.
- **Testes:**
  - fator por ano; patronal com e sem 13º, obra não substituída, RAT/FAP da obra;
  - rateio e movimento;
  - encargos por obra;
  - S-1200 com duas obras no XSD, lotação fora do cadastro e falta de recibo.

## 11/10/2026 — Folha por departamento e por obra (parte 3)

Pedido do Paulo: "gerar folha de pagamentos por Departamentos e Obras dentro da mesma empresa", com cadastro próprio de departamentos.

- **Departamentos** (`services/departamentos/`):
  - coleção `departamentos/{empresa}_{código}`, com regra e teste de regras;
  - cada um tem código, nome, centro de custo e se está ativo;
  - o departamento do funcionário é o da ficha (novo campo "Departamento") ou, sem ele, o do IOB;
  - Cadastros › Departamentos lista a contagem de ativos por departamento, e "Trazer das fichas" cria de uma vez os códigos que vieram do IOB.
- **Cálculo mensal:** "Ver a folha de": toda a empresa, um departamento ou uma obra.
  - A lista, os holerites em PDF, o resumo (com os encargos) e o Excel saem do filtro, com o título indicando o departamento ou a obra.
  - Na obra, quem tem rateio entra com o holerite inteiro; a parte da obra está nos encargos por obra.
  - O eSocial e a gravação seguem sendo da empresa toda.
- **Catálogo SAGE:** `arq-obras` passa a disponível. Agora são 24 disponíveis, 21 parciais, 6 planejados e 2 fora.
- **Testes:** departamentos (o da ficha × o do IOB, trazer das fichas, validação), a tela, o filtro no cálculo e as regras.

## 11/10/2026 — Rescisão do intermitente

Paulo: "pode seguir com a rescisão do intermitente". Até aqui, o motor de rescisão recusava a categoria 111.

- **Regra:** Portaria MTb 349/2018, art. 5º, incorporada à Portaria MTP 671/2021. O aviso prévio e as verbas rescisórias saem pela média dos valores recebidos nos meses com remuneração dos últimos 12 (ou do contrato, se menor). O texto oficial não abriu daqui; a regra foi conferida em guias especializados.
- **Cálculo** (`motorRescisao.ts`, ramo do intermitente):
  - **média:** dos meses anteriores ao desligamento, recalculada pelas convocações; entram horas, DSR, adicionais, horas extras e lançamentos salariais, sem as férias e o 13º proporcionais;
  - **mês do desligamento:** as convocações até a data do desligamento (o que vier depois fica de fora), com DSR, férias e 13º proporcionais, como na folha;
  - **aviso prévio:** pela média (30 dias + 3 por ano), indenizado na dispensa e pela metade no acordo; no pedido de demissão sem cumprir, desconto pela média;
  - **projeção do aviso:** 13º sobre o aviso (com INSS e IRRF do 13º) e férias + 1/3 indenizadas, 1/12 a cada 30 dias e mais 1/12 com 15 dias ou mais;
  - **sem repetir:** 13º e férias proporcionais já foram pagos a cada convocação (art. 452-A, § 6º);
  - **multa do FGTS:** como nos demais casos.
- **S-2299:** leva os dias trabalhados no mês em `infoInterm` (dia 0 quando não houve trabalho, como pede o leiaute), obrigatório para a categoria 111.
- **Telas:** a Rescisão do Cálculo e a prévia de Demissões carregam as convocações.
- **Catálogo SAGE:** `proc-intermitente` continua parcial; falta o salário-família do intermitente.
- **Testes:**
  - média de dois meses com remuneração;
  - aviso de 33 dias e a projeção;
  - convocação depois do desligamento fora;
  - pedido de demissão;
  - sem convocações carregadas;
  - S-2299 no XSD oficial, com e sem dias.

## 11/10/2026 — Salário-família do intermitente

Paulo: "pode seguir salário família". Era o que faltava para o intermitente sair de parcial no catálogo.

- **Regra aplicada:** não achei regra própria para o intermitente (busquei na IN PRES/INSS 128/2022 e em orientações). Vale a geral, da Lei 8.213/1991, arts. 65 e 66, e da Portaria Interministerial MTP/ME 12/2022:
  - a cota é devida no mês com remuneração, se o salário de contribuição do mês (sem o 13º) está no limite da tabela;
  - por filho até o mês em que ele completa 14 anos;
  - integral, mas proporcional aos dias de vínculo nos meses de admissão e de desligamento;
  - no mês sem convocação não há folha nem cota.
- **No cálculo:** a verba SF entra na folha do intermitente e na rescisão, com um aviso de que segue a regra geral, para conferir.
- **Catálogo SAGE:** `proc-intermitente` passa a disponível. Agora são 25 disponíveis, 20 parciais, 6 planejados e 2 fora.
- **Testes:** cota integral, sem convocação, acima do limite, mês de admissão e de desligamento.

## 11/10/2026 — Pró-labore completo: S-2300 e S-2399 pelo Consultor e diretor com FGTS (721)

Paulo: "pode seguir". O pró-labore dependia do S-2300 enviado pelo IOB e não cobria o diretor com FGTS.

- **Diretor não empregado com FGTS (721)** (`contribuinteIndividual.ts`):
  - a empresa que equipara o diretor aos empregados para o FGTS (Lei 8.036/1990, art. 16) deposita 8% sobre o pró-labore, sem desconto do diretor;
  - INSS de 11% até o teto, 20% da empresa e IRRF como o sócio;
  - verba própria (`PROLABFGTS`), base e valor do FGTS no resultado e no total do mês; a guia sai do FGTS Digital a partir do S-1200;
  - no de/para do eSocial, rubrica própria com codIncFGTS 11 (erro se não for base do FGTS); a rubrica do sócio que for base do FGTS gera aviso.
- **S-2300 pelo Consultor** (`services/esocial/eventosTSV.ts`):
  - dados novos no cadastro: sexo, raça/cor, estado civil, instrução, endereço, data de início (posse ou entrada na sociedade), cargo, pró-labore fixo, opção pelo FGTS (721), cadastramento inicial;
  - regras do XSD S-1.3: remuneração obrigatória para o diretor (variável vai com 0 e a unidade 7), FGTS só no 721, sem natAtividade para 721/722, local de trabalho obrigatório para 721/722/723 com início desde 22/01/2024 e vedado para o autônomo, raça/cor "não informado" recusada desde 22/04/2024, matrícula sem começar por "eSocial";
  - dependentes do IRRF no próprio S-2300 (sem salário-família).
- **S-2399 pelo Consultor:** data do término até 10 dias à frente; motivo e pensAlim 0 só no 721; sem verbasResc (o pró-labore do mês da saída vai no S-1200); identificação pela matrícula ou, sem ela, pela categoria. Lançamento de pró-labore em competência depois do término é barrado.
- **Tela** (Folha do mês › Pró-labore e autônomos):
  - seção do S-2300 e do S-2399 com a situação de cada um (pelos lotes, com o teste à parte), os erros do que falta no cadastro, a transmissão com o pré-voo, o XML e a retificação pelo recibo aceito;
  - o S-2300 aceito na produção libera o S-1200 sozinho; a marca manual fica para o S-2300 enviado pelo IOB.
- **Regras do Firestore:** sem mudança (o cadastro continua em `contribuintes_individuais`).
- **Catálogo SAGE:** `proc-prolabore` passa a disponível. Agora são 26 disponíveis, 19 parciais, 6 planejados e 2 fora.
- **Testes:** S-2300 do 721, do 722 variável, do sócio, do autônomo e a retificação no XSD oficial; S-2399 do 721 e do sócio no XSD; validações; cálculo do 721 com FGTS; de/para do FGTS; a tela do cadastro à transmissão.

## 11/10/2026 — Processamento agrupado (várias empresas de uma vez)

Paulo: "pode seguir". Primeiro dos itens planejados do catálogo do SAGE.

- **Cálculo único** (`services/calculo/folhaDaEmpresa.ts`):
  - a folha mensal da empresa saiu da tela de Cálculo para um serviço puro: quem está na competência, as férias do mês, as convocações, os benefícios e a convenção;
  - inclui o IRRF do adiantamento somando contratos e a folha anterior paga no mês, e o arredondamento encadeado;
  - a tela de Cálculo passou a usar o serviço, sem mudar a conta; o processamento agrupado usa o mesmo.
- **Processamento agrupado** (`processamentoAgrupado.ts` e `processamentoAgrupadoService.ts`; tela em Folha do mês › Processamento agrupado):
  - escolhe as empresas da carteira (busca, marcar e desmarcar) e a competência;
  - calcula uma empresa por vez, com os movimentos gravados (o rascunho não salvo não entra), e o mês do pagamento pelo regime ou pelo gravado no movimento;
  - por empresa: situação e pendências por funcionário, totais, adiantamento a pagar, INSS, IRRF, FGTS e a parte patronal (por obra quando há);
  - opcional: o saldo das provisões de férias e 13º, e a gravação da folha de cada empresa;
  - competência encerrada no Fim de mês não é regravada e mostra a folha gravada; a falha de uma empresa não para as outras;
  - planilha da carteira em Excel.
- **Catálogo SAGE:** `proc-agrupado` passa a parcial (faltam o 13º e as rotinas anuais em lote). Agora são 26 disponíveis, 20 parciais, 5 planejados e 2 fora.
- **Testes:** a folha da empresa igual ao motor; linha, falha, totais e planilha; gravação, competência encerrada, empresa sem funcionários e falha de leitura; a tela processando só as marcadas.

## 11/10/2026 — Transferência de funcionários entre empresas do grupo

Paulo: "pode seguir". Segundo dos itens planejados do catálogo do SAGE.

- **Regra:** transferência para outra empresa do mesmo grupo, sem rescisão (CLT, arts. 2º, § 2º, 10 e 448). O contrato continua com a admissão, as férias e o 13º, agora a cargo do destino.
- **eSocial pelo Consultor:**
  - origem: S-2299 com o motivo 11 (Tabela 19), o grupo sucessaoVinc com o CNPJ do destino e sem verbas rescisórias (vedadas para o motivo 11); a data é o último dia na origem, a véspera da transferência;
  - destino: S-2200 com tpAdmissao 2, a admissão do primeiro empregador (regra do XSD para dtAdm) e o sucessaoVinc com o CNPJ e a matrícula de origem e a data da transferência.
- **S-2200 pela ficha** (`services/esocial/admissao.ts`, novo): trabalhador, endereço, dependentes, contato, vínculo celetista, contrato, local e horário. O que a ficha não guarda (regime e tipo de jornada, natureza, tempo parcial, horário noturno, data-base, descrição da jornada) vem da tela. Ficam com o IOB: doméstico, aprendiz, temporário, intermitente, contrato vinculado a fato e estatutário.
- **No Consultor** (`services/transferencia/`):
  - a ficha vai para o destino com nova matrícula, os dependentes e o histórico de salário. Horário, lotação, departamento e código do IOB ficam, porque são da empresa;
  - vão também as férias e os afastamentos terminados (sem os recibos) e os movimentos dos meses anteriores (médias). Mês encerrado no destino não recebe e gera aviso;
  - a ficha de origem fica desligada com o motivo 11 e não aparece na Rescisão do Cálculo;
  - registro em `transferencias/{ficha}_{data}`: grava quem pode nas duas empresas, as duas leem e não se apaga (regra nova com teste).
- **Limites:** data sempre no dia 1º (a divisão do mês entre as duas empresas ainda não é feita). A troca de estabelecimento da mesma empresa (S-2206) fica para depois.
- **Tela:** Cadastros › Transferência de funcionários, com a validação do que falta para o S-2200 já na escolha, a gravação e a lista de transferências da empresa (saídas e entradas) com a situação, a transmissão e o XML do S-2299 e do S-2200.
- **Catálogo SAGE:** `ut-transferencia` passa a parcial. Agora são 26 disponíveis, 21 parciais, 4 planejados e 2 fora.
- **Testes:** S-2299 e S-2200 no XSD oficial (transferência, admissão comum e contrato por prazo); fichas, validações, afastamentos; a gravação com os avisos; a tela da escolha à transmissão; regras do Firestore.

## 11/10/2026 — Troca de estabelecimento, S-1200 por filial, S-2206 e transferência no meio do mês

Paulo: "nada pode ficar para trás e começar novo ponto! Termine e seguimos". Fecha o que faltava da transferência.

- **Local de trabalho por vigência** (`services/cadastros/locaisTrabalho.ts`):
  - a ficha guarda as faixas de estabelecimento (`locais`) desde a primeira troca;
  - na importação do eSocial, as faixas também vêm dos S-2200/S-2206, quando houve troca; as trocas do Consultor posteriores ficam;
  - a alteração entra na auditoria da ficha.
- **S-1200 e S-2299 no estabelecimento da ficha:** antes, saía só o estabelecimento dos parâmetros e quem trabalhava em filial dava erro, com a orientação de mandar pelo IOB. Agora:
  - cada vínculo sai no estabelecimento da ficha naquele mês;
  - no mês da troca, nos dois: os proventos se dividem pelos dias e os descontos ficam no de mais dias (como nas obras);
  - a lotação é a da filial, se informada nos parâmetros do eSocial (nova lista "Filiais com lotação própria"), senão a dos parâmetros;
  - aviso para conferir o S-1005 da filial; estabelecimento de outra raiz de CNPJ é erro.
- **S-2206 pelo Consultor** (`services/esocial/alteracaoContratual.ts`): o contrato inteiro com o novo local de trabalho e a data da alteração. A parte do contrato agora é comum com o S-2200 (`contratoXml`, `celetistaXml`, `validarContrato`).
- **Tela de Transferência:** novo modo "troca de estabelecimento". Escolhe o funcionário, o CNPJ da filial (sugestões da empresa) e a data (qualquer dia). Grava o local por vigência e lista as trocas com a situação do S-2206, a transmissão, a retificação e o XML.
- **Transferência entre empresas no meio do mês:** caiu a exigência do dia 1º.
  - novo campo na ficha, "início nesta empresa"; no destino é a data da transferência e a admissão continua a do primeiro empregador;
  - cada empresa paga os seus dias: a origem até a véspera, sem rescisão e sem o aviso de "rescisão não está no motor"; o destino desde a data;
  - o destino não tem mais o funcionário nas folhas anteriores à chegada (antes aparecia, porque a admissão é antiga);
  - o 13º do ano fica todo com o destino.
- **Catálogo SAGE:** `ut-transferencia` passa a disponível. Agora são 27 disponíveis, 20 parciais, 4 planejados e 2 fora.
- **Testes:**
  - faixas e dias no mês; validações da troca; cálculo do mês da troca;
  - S-1200 dividido com a lotação da filial; S-2299 na filial; S-2206 no XSD oficial;
  - faixas pelos eventos e na importação;
  - a tela da troca até o S-2206;
  - transferência no meio do mês com 15 dias em cada empresa.

## 11/10/2026 — Integração contábil da folha

Paulo: "pode seguir". Terceiro dos itens planejados do catálogo do SAGE.

- **Lote contábil** (`services/contabil/integracaoContabil.ts`): os lançamentos da folha gravada da competência, em partidas dobradas e por regime de competência, na data do último dia do mês.
  - **Proventos:** D despesa (a conta da verba ou a de salários) / C salários a pagar.
  - **Descontos:** D salários a pagar / C a conta da verba. INSS e IRRF vão às contas dos tributos; as demais, à conta própria ou à de outros descontos, com aviso.
  - **Compensações:** salário-família e salário-maternidade a débito do INSS a recolher.
  - **FGTS:** por funcionário, D despesa de FGTS / C FGTS a recolher.
  - **Parte patronal:** patronal, RAT e terceiros, do resumo da folha, rateados pela base do INSS de cada um.
  - **Provisões de férias e 13º (opcional):** a constituição (principal, INSS e FGTS em contas próprias) e a baixa do que foi pago.
  - **Centro de custo:** o do departamento do funcionário (Cadastros › Departamentos), com aviso para departamento sem centro de custo.
  - **Agregação:** um lançamento por débito, crédito, centro de custo e histórico.
  - **Conferência:** o saldo de salários a pagar tem de ser o líquido da folha.
- **Plano de contas da folha por empresa** em `contabil_folha/{empresa}`: contas fixas da folha, encargos e provisões, e uma conta própria por verba. Grava e lê quem pode na empresa; não se apaga (regra nova com teste).
- **Tela** (Relatórios › Integração contábil): o plano, as pendências (conta em branco bloqueia o arquivo), os avisos, a conferência, o lote e o arquivo (.csv com ponto e vírgula, data dd/mm/aaaa e valor com vírgula, e Excel).
- **CCI:** o acesso de leitura ao repositório do Consultor Contábil (`plano-contas-iob`) foi negado nesta sessão, então o arquivo saiu num layout neutro. A importação direta no CCI fica pendente do layout dele.
- **Catálogo SAGE:** `div-contabil` passa a parcial. Agora são 27 disponíveis, 21 parciais, 3 planejados e 2 fora.
- **Testes:** partidas e conferência do líquido, contas padrão e pendências, centro de custo, patronal rateado, provisões, arquivo, tela e regras do Firestore.

## 11/10/2026 — S-1070: processos judiciais e administrativos

Paulo: "atualiza nosso status e pode seguir". Quarto dos itens planejados do catálogo do SAGE.

- **Cadastro dos processos** (`services/processosJud/processosJud.ts`; tela em Cadastros › Processos judiciais e administrativos):
  - tipos: administrativo (17 ou 21 algarismos), judicial (20, a numeração do CNJ) e do FAP (16);
  - campos: a matéria (tributária, ou só FGTS e a contribuição da LC 110/2001), a validade, a autoria da ação judicial e a vara (UF, município e código) do judicial tributário;
  - suspensões da exigibilidade: o código, que é o que o S-1010, o S-1005 e o S-1020 citam, o indicativo permitido para o tipo, a data da decisão e o depósito do montante integral. O depósito é obrigatório em 02 e 03 e vedado em 90, como no XSD;
  - gravação em `processos_s1070/{empresa}_{tipo}_{número}`: não se apaga, o excluído no eSocial fica inativo (regra nova com teste).
- **S-1070 pelo Consultor:** inclusão; depois de aceita, alteração (com nova validade, se for o caso) e exclusão. Envio com o pré-voo, a situação de cada ação e o XML.
- **O processo nos eventos de tabela:**
  - S-1010: rubrica com incidência suspensa (codIncCP 9x, codIncIRRF 9x/9xxx, codIncFGTS 9x) leva ideProcessoCP (com a extensão da decisão), ideProcessoIRRF ou ideProcessoFGTS. Antes o Consultor recusava e mandava pelo IOB; a suspensão do RPPS continua com o IOB;
  - as rubricas importadas do eSocial trazem os processos de volta, para a alteração pelo Consultor não perdê-los;
  - S-1005 da obra com RAT ou FAP diferentes: procAdmJudRat e procAdmJudFap. Sem o processo agora é erro (era aviso);
  - S-1020: terceiros com o recolhimento suspenso (o código combinado e um processo por terceiro);
  - a escolha do processo nos formulários do S-1010 e das obras lista os processos tributários ativos da empresa.
- **Catálogo SAGE:** `arq-processos-jud` passa a disponível. Agora são 28 disponíveis, 21 parciais, 2 planejados e 2 fora.
- **Testes:**
  - S-1070 no XSD oficial (judicial, administrativo, FAP, só FGTS, alteração com nova validade e exclusão) e as validações;
  - S-1010 com processo no XSD e a leitura de volta;
  - S-1005 e S-1020 com processo no XSD;
  - a tela, do cadastro à transmissão; regras do Firestore.

## 11/10/2026 — Contribuição sindical patronal

Quinto dos itens planejados do catálogo do SAGE.

- **Regra** (`services/sindicatos/sindicalPatronal.ts`):
  - facultativa desde a Lei 13.467/2017: só de quem aderiu, prévia e expressamente (CLT, arts. 578, 579 e 587; STF, ADI 5794);
  - proporcional ao capital social, pela tabela da confederação (CLT, art. 580, III);
  - recolhida no último dia útil de janeiro, na GRCSU, com o código da entidade (art. 587);
  - filiais em outra base territorial recolhem ao sindicato delas sobre a parte do capital (art. 581);
  - atraso: multa de 10% nos 30 primeiros dias e mais 2% por mês seguinte, juros de 1% ao mês (art. 600); a correção monetária fica de fora, com aviso;
  - Simples Nacional dispensado (LC 123/2006, art. 13, § 3º; STF, ADI 4033);
  - sem empregados: aviso, pelo entendimento do TST de que só o empregador deve.
- **Tabela pronta:** a do comércio (CNC) de 2026, como publicada pelos sindicatos da categoria (Sincor-SP, Sinog, Sincopetro, Sincomaco).
  - classes: até R$ 42.312,75, mínimo de R$ 338,50; até R$ 84.625,50, 0,8%; até R$ 846.255,00, 0,2% + R$ 507,75; até R$ 84.625.500,00, 0,1% + R$ 1.354,01; até R$ 451.336.000,00, 0,02% + R$ 69.054,41; acima, máximo de R$ 159.321,61;
  - as classes se encadeiam sem salto (conferido nos testes);
  - outras confederações: faixas próprias informadas na tela; tabela de outro ano usada gera aviso.
- **Tela** (Folha do mês › Contribuição sindical patronal): adesão, capital social, tabela, entidade, CNPJ e código da GRCSU, filiais com a parte do capital, a data do pagamento para o atraso, o valor de cada guia e a memória. Gravação em `parametrosFolha.sindicalPatronal` da empresa.
- **Calendário de obrigações:** o vencimento de janeiro na competência de dezembro, com a condição "só se a empresa aderiu".
- **Catálogo SAGE:** `trib-sindical` passa a disponível. Agora são 29 disponíveis, 21 parciais, 1 planejado (importação de valores, à espera do layout) e 2 fora.
- **Testes:** as classes da tabela, a guia com o vencimento, as filiais, o atraso, as dispensas e faltas, o calendário e a tela.

## 11/10/2026 — Auditoria dos parciais e importação de valores do IOB

Paulo: "faça essa auditoria completa, e qual arquivo precisa de mim da IOB". O relatório está em `docs/auditoria-parciais-2026-10.md`.

- **Auditoria:** os 21 itens parciais do catálogo do SAGE foram conferidos com o código.
  - Cinco já estavam completos e passam a disponíveis: Afastamentos/Retorno, Tabelas legais, Movimento eSocial (periódicos), Rescisão e Vale-transporte e benefícios.
  - Os 16 que faltam estão listados com o que falta em cada um, de quem dependem e a ordem de entrega. O 13º (parcela única e 1ª parcela com as férias) vem primeiro e o RRA fica por último.
- **Arquivo do IOB:** a importação de valores não precisa de nenhum. O layout é o de importação de ponto Windows 3 e 4, do documento da IOB de 25/09/2026, que já está no Consultor. Do IOB faltam só os prints das abas Complementos, Lanç. Automático e Holerite da ficha do funcionário no Office.
- **Importação de valores** (`services/calculo/importacaoValores.ts`; tela Folha do mês › Importação de valores):
  - lê o TXT de 40 ou 50 posições e aponta o erro de cada linha;
  - cada linha vira um "Lançar evento" pelo cadastro do evento do IOB;
  - o funcionário é achado pelo "Código no IOB" da ficha;
  - no Windows 4, linhas de outra empresa ou competência ficam de fora;
  - grava no movimento do mês sem duplicar; uma competência encerrada não recebe lançamentos.
- **Catálogo SAGE:** `ut-imp-valores` passa a disponível. Agora são 35 disponíveis, 16 parciais, nenhum planejado e 2 fora.
- **Testes:** a leitura dos dois layouts e seus erros, o lançamento no movimento (hora extra, comissão, faltas, reimportação), as linhas que ficam de fora e a tela.

## 11/10/2026 — 13º: 1ª parcela com as férias e parcela única

Primeiro dos 16 parciais da auditoria (`docs/auditoria-parciais-2026-10.md`).

- **1ª parcela com as férias** (Lei 4.749/1965, art. 2º, § 2º: pedido do empregado em janeiro):
  - marcada no gozo de férias, em Cadastros › Afastamentos ou no próprio recibo (Cálculo › Férias). É só do Consultor e não vai ao S-2230;
  - o recibo de férias paga a 1ª parcela, com a mesma conta da 1ª de novembro feita no mês do pagamento das férias, sem INSS e IRRF e com FGTS na competência do pagamento;
  - no S-1200 ela entra pelo demonstrativo do recibo (natureza 5504);
  - recibo pago em dezembro não adianta, porque já é a 2ª parcela;
  - a 1ª parcela de novembro não sai de novo, nem no S-1200 de novembro;
  - a 2ª parcela desconta o valor das férias (um valor informado na tela prevalece);
  - a rescisão desconta automaticamente o que foi pago antes do desligamento.
- **Parcela única:** é um parâmetro da empresa por ano, nas telas do 13º.
  - Não há 1ª parcela, nem no S-1200 de novembro, e a 2ª paga o 13º inteiro.
  - Paga depois de novembro, aparece o aviso do prazo legal (Lei 4.749/1965, art. 2º) e da multa (Lei 7.855/1989, art. 3º).
  - Quem recebeu a 1ª parcela com as férias continua tendo ela descontada.
- **Correção:** a pensão sobre férias gravada no afastamento não era salva. O campo não estava no modelo do afastamento e a gravação o descartava. Agora é gravada e, como o abono e a 1ª parcela do 13º, sobrevive à reimportação do S-2230.
- **Catálogo SAGE:** `proc-13` passa a disponível. Agora são 36 disponíveis e 15 parciais.
- **Testes:** o recibo com a 1ª parcela, a de novembro recusada, o desconto na 2ª e na rescisão, as férias de dezembro, a parcela única com e sem férias, e a gravação e a reimportação do afastamento.

## 11/10/2026 — Estorno do cálculo

Segundo dos parciais da auditoria (Utilitários › Estorno do Cálculo do SAGE).

- **Tela** (Folha do mês › Cálculo › "Estornar o cálculo…", na folha mensal):
  - apaga a folha gravada da competência (holerites e totais) para recalcular e gravar de novo;
  - opcionalmente, zera o movimento do mês: tira horas, faltas, pensões e lançamentos, e mantém o encadeamento do arredondamento e o IRRF gravado de outro sistema;
  - pede o motivo e a palavra ESTORNAR. O motivo e os totais que saíram vão para a auditoria, e cada movimento zerado também;
  - fica bloqueado com a competência encerrada no Fim de mês (o gestor reabre antes) e com movimento não salvo.
- **eSocial** (`services/calculo/estornoFolha.ts`): o estorno não desfaz o que já foi aceito, e a tela avisa antes:
  - S-1200 da competência e S-1210 do mês do pagamento aceitos, sem contar os excluídos por S-3000 nem os da produção restrita. O caminho é retificar depois de recalcular, ou excluir primeiro o S-1210 e depois o S-1200;
  - fechamento S-1299 aceito sem reabertura S-1298 posterior;
  - lotes de S-1200 sem retorno;
  - a DCTFWeb e a guia do FGTS Digital, que vêm do eSocial.
- **Regras:** `folhas_gravadas` passa a aceitar a exclusão por quem pode na empresa, só com a competência aberta. Os holerites já aceitavam.
- **Catálogo SAGE:** `ut-estorno` passa a disponível. Agora são 37 disponíveis e 14 parciais.
- **Testes:**
  - o plano: bloqueios, avisos do eSocial, S-1298 depois do S-1299, S-3000 e produção restrita;
  - o movimento zerado;
  - a tela: motivo, confirmação, folha apagada e movimento zerado, e a competência encerrada;
  - a regra do Firestore (quem pode na empresa apaga a folha aberta; outra carteira não).

## 11/10/2026 — Processamento agrupado: 13º em lote

Terceiro dos parciais da auditoria.

- **Folha do mês › Processamento agrupado:** novo campo "Processar", com Folha mensal, 13º 1ª parcela e 13º 2ª parcela. O 13º usa o ano da competência.
  - Cada empresa é calculada como na tela do 13º, com os movimentos gravados do ano (médias e faltas).
  - 1ª parcela: paga em novembro. Ficam fora as empresas em parcela única no ano e quem recebeu a 1ª parcela com as férias, com o aviso na linha da empresa.
  - 2ª parcela: paga em dezembro, com o INSS e o IRRF do 13º e a parte patronal pelo enquadramento de dezembro.
  - É só prévia: a folha do 13º não é gravada e não há provisões. Holerites, S-1200 anual e arquivo bancário saem por empresa na tela do 13º.
  - A planilha da carteira leva o nome da parcela.
- **Rotinas anuais:** RAIS e DIRF foram extintas (eSocial e EFD-Reinf). O informe de rendimentos continua por empresa em Relatórios › Anuais, a partir dos S-5002.
- **Catálogo SAGE:** `proc-agrupado` passa a disponível. Agora são 38 disponíveis e 13 parciais.
- **Testes:**
  - 1ª e 2ª parcelas de uma empresa (valores, pagamento, sem gravação);
  - 1ª parcela com um funcionário que a recebeu nas férias;
  - empresa em parcela única: 1ª vazia com o aviso e 2ª com todos.

## 11/10/2026 — Ficha financeira com férias, 13º e rescisões

Quarto dos parciais da auditoria.

- **Processos gravados** (`services/calculo/processosGravados.ts`, coleção `processos_gravados/{empresa}_{tipo}_{AAAA-MM}`):
  - os recibos de férias, as parcelas do 13º e as rescisões passam a ser gravados como a folha do mês;
  - na tela de Cálculo há os botões "Gravar os recibos de férias", "Gravar a folha do 13º" e "Gravar as rescisões";
  - entram só os gozos lançados em Afastamentos e os desligamentos da ficha, nunca as simulações. Os cálculos com erro ficam de fora;
  - a competência é a do início do gozo nas férias, o mês do pagamento no 13º (padrão novembro e dezembro) e a do desligamento na rescisão;
  - regravar substitui o anterior. A competência encerrada no Fim de mês não muda.
- **Ficha financeira** (Relatórios › Central): depois das linhas da folha mensal vêm as de cada processo, no mês gravado.
  - A descrição leva o processo ("Férias · …", "13º 1ª parcela · …", "Rescisão · …"), para a mesma verba não somar com a da folha.
  - Cada processo tem a linha do seu líquido.
  - Quem só tem processo, sem folha mensal, também aparece.
  - Sai no PDF e no Excel como as demais linhas.
- **Regras:** `processos_gravados` (leitura e lista de quem pode na empresa; gravação com autor, tipo, ano e competência aberta) e os holerites dele.
- **Catálogo SAGE:** `rel-ficha` passa a disponível. Agora são 39 disponíveis e 12 parciais.
- **Testes:**
  - a ficha com férias, 13º e uma rescisão de outro ano;
  - a competência de cada processo e a chave do holerite;
  - a exclusão dos cálculos com erro;
  - as regras (gravação, tipos, ano, autor, carteira, competência encerrada e a lista por empresa e ano).

## 11/10/2026 — Listagens: sindicatos e etiquetas

Quinto dos parciais da auditoria. Os dois relatórios estão em Relatórios › Central › Funcionários.

- **Listagem de sindicatos:**
  - entram os sindicatos das fichas e os da empresa (Empresas › Sindicatos), estes mesmo sem funcionário;
  - para cada um: CNPJ, código do IOB, data-base, piso, funcionários na folha no fim da competência, filiados, quem autorizou a contribuição sindical e quem se opôs à assistencial;
  - por último, a linha de quem está sem sindicato na ficha, com o aviso;
  - sai em PDF (paisagem) e Excel, com envio ao cliente.
- **Etiquetas:**
  - o conteúdo pode ser os dados do funcionário (nome, matrícula, CPF, cargo, admissão e empresa) ou o endereço para correspondência;
  - entram os funcionários da competência por nome, sem os desligados;
  - o PDF tem 21 etiquetas por folha A4 de 63,5 × 38,1 mm, na geometria da Avery L7160, sem cabeçalho nem rodapé;
  - dá para pular as posições já usadas de uma folha (até 20);
  - sai também em Excel.
- **Catálogo SAGE:** `rel-listagens` passa a disponível. Agora são 40 disponíveis e 11 parciais.
- **Testes:**
  - a listagem de sindicatos: contagens, ordem, cadastro ausente e quem está sem sindicato;
  - as etiquetas: conteúdo, endereço, desligados, posições na folha, quebra de página e as posições puladas;
  - a tela.

## 11/10/2026 — Holerite por e-mail a cada funcionário

Sexto dos parciais da auditoria (Utilitários › Envio de Relatórios por E-mail do SAGE).

- **Relatórios › Central › Holerites › "Enviar a cada funcionário"** (`services/relatorios/holeritePorEmail.ts`):
  - um e-mail do escritório (CFI) por funcionário, para o e-mail da própria ficha, só com o holerite dele em PDF, no mesmo layout do relatório;
  - o arquivo leva a competência e a matrícula, sem o nome. A mensagem é pessoal e pede para não encaminhar;
  - os envios saem um por vez, com o resultado de cada um (enviado ou o erro);
  - quem não tem e-mail válido na ficha e os holerites com erro ficam de fora, com o aviso. O holerite nunca vai para outro endereço.
- **Catálogo SAGE:** `ut-email` passa a disponível. Agora são 41 disponíveis e 10 parciais.
- **Testes:**
  - os destinatários (e-mail inválido, holerite com erro, ordem por nome);
  - o nome do arquivo, o assunto e a mensagem;
  - a tela, com um envio que falha.

## 11/10/2026 — Crédito do Trabalhador (consignado CLT)

Sétimo dos parciais da auditoria.

- **Contratos** (Cadastros › Funcionários › Consignado; `services/calculo/consignado.ts`):
  - cada contrato tem a instituição (código de 3 dígitos da Tabela 37 do eSocial), o número do contrato, a parcela, o primeiro e o último mês e o saldo informado para a rescisão;
  - a validação segue o XSD (TS_nrDoc: 2 a 15 caracteres) e recusa contrato repetido;
  - os contratos são gravados e auditados com a ficha.
- **Folha mensal:**
  - a parcela de cada contrato vigente sai depois de INSS, IRRF e pensão, na ordem do início do contrato;
  - o limite é 35% da remuneração disponível (os proventos menos INSS, IRRF e pensão; Lei 10.820/2003, art. 2º, § 2º, I) e o desconto não deixa o líquido negativo;
  - o que não couber fica com o aviso, porque a instituição cobra a diferença. As bases de INSS, IRRF e FGTS não mudam.
- **Rescisão:** o desconto sai uma vez só, sobre as verbas rescisórias (o saldo informado pela instituição ou a parcela do mês), no mesmo limite. O saldo de salário calculado pelo motor mensal não desconta de novo.
- **eSocial** (XSD S-1.3, T_descFolha):
  - a rubrica de natureza 9253 vai com o grupo descFolha (tpDesc 1, instFinanc, nrDoc e a observação), um item por contrato, no S-1200 (itensRemun) e no S-2299 (detVerbas);
  - antes do envio são recusados o desconto em rubrica sem a natureza 9253 e a 9253 sem contrato;
  - o de/para sugere a natureza 9253.
- **Pesquisa:**
  - o grupo e os campos foram conferidos no XSD oficial que está no repositório;
  - o limite de 35% vem da Lei 10.820/2003, art. 2º, § 2º, I, na redação da Lei 13.172/2015;
  - a lei foi alterada depois pela Lei 15.179/2025 e pela MP 1.355/2026, por isso o percentual fica numa constante e a tela pede para conferir a norma vigente.
- **Catálogo SAGE:** `proc-consignado` passa a disponível. Agora são 42 disponíveis e 9 parciais.
- **Testes:**
  - a validação, os meses e a margem com dois contratos, o limite pelo líquido;
  - o motor mensal (bases intactas) e a rescisão (uma vez só, com o saldo);
  - o S-1200 e o S-2299 com o descFolha no XSD oficial, e a recusa da rubrica sem a 9253.

## 11/10/2026 — Horários: escalas e revezamento

Oitavo dos parciais da auditoria.

- **Escala em ciclo** (Cadastros › Horários, `escala` no horário):
  - tipos: 12 x 36, 24 x 48, turno ininterrupto de revezamento e folga variável;
  - o ciclo tem de 2 a 42 dias (trabalho ou folga, com entrada, intervalo e saída) e se repete a partir de uma data de referência, também para trás;
  - há ciclos prontos: 12x36 das 7h às 19h, 24x48 e revezamento de 6 h em três turnos com duas folgas;
  - a média semanal (horas do ciclo × 7 ÷ dias do ciclo) entra no total do horário e na conferência das horas semanais da ficha;
  - a tela mostra as horas noturnas e o mês da escala (dias de trabalho, folgas e horas).
- **Avisos:**
  - 12 x 36 só por acordo escrito ou norma coletiva, e a remuneração já abrange DSR e feriados (CLT, art. 59-A); 12 h seguidas e ciclo de 2 dias;
  - interjornada de 11 h (art. 66) e 7 dias seguidos sem folga (art. 67);
  - mais de 10 h no dia, 6 h no revezamento (CF, art. 7º, XIV) e média acima de 44 h.
- **S-2200:** o contrato pega do horário da ficha o tpJornada (12 x 36 = 2, revezamento = 7, folga variável = 3, DSR fixo no domingo = 4, em outro dia = 5), a descrição da jornada (a escala, até 999 caracteres) e o trabalho noturno. A transferência já usa isso.
- **Catálogo SAGE:** `arq-horarios` passa a disponível. Agora são 43 disponíveis e 8 parciais.
- **Testes:**
  - o dia da escala (para a frente e para trás), as médias, o mês;
  - os avisos (12 x 36 fora do padrão, sem descanso semanal, interjornada);
  - o revezamento, a 24x48 e o tpJornada;
  - o S-2200 de uma 12 x 36 noturna no XSD oficial.

## 11/10/2026 — Diagnóstico do cadastro eSocial

Nono dos parciais da auditoria (o IOB Diagnóstico eSocial).

- **eSocial › Diagnóstico do cadastro** (`services/esocial/diagnosticoCadastro.ts`): o cadastro inteiro da empresa ativa na competência, apto ou não apto, antes de gerar os eventos. Confere:
  - **empresa:** CNPJ, parâmetros do S-1200 (estabelecimento e lotação), enquadramento vigente, S-1010 vigente, e o de/para apontando rubricas que existem e estão vigentes;
  - **trabalhadores da competência:** a mesma validação da ficha, a matrícula do eSocial, e o horário ligado (se existe e se as horas batem). Desligados antes do mês ficam de fora;
  - **rubricas vigentes:** os dados do S-1010;
  - **horários:** a validação, escalas incluídas;
  - **afastamentos que tocam o mês:** a validação do afastamento.
- **Tela:**
  - "Apto" ou "Não apto" com a contagem de erros e avisos;
  - um quadro por área (verificados, erros, avisos) que filtra a lista, e a opção "só os erros";
  - onde corrigir cada área e a planilha.
  - Nenhuma regra é nova: o diagnóstico junta as validações de cada cadastro, e o pré-voo continua conferindo cada evento no XSD oficial ao transmitir.
- **Catálogo SAGE:** `es-diagnostico` passa a disponível. Agora são 44 disponíveis e 7 parciais.
- **Testes:**
  - cadastro apto;
  - empresa não apta e de/para quebrado;
  - trabalhadores (matrícula, horário inexistente, horas diferentes, desligado fora);
  - rubricas, horários e afastamentos;
  - a ordem dos itens, a planilha e a tela.

## 11/10/2026 — Início da DCTFWeb e do FGTS Digital da empresa

Décimo dos parciais da auditoria (Gerenciador de Sistemas › Empresas › Parâmetros do SAGE).

- **Cadastros › Enquadramento › Início das obrigações** (`services/empresas/inicioObrigacoes.ts`, nos parâmetros da folha da empresa):
  - a competência em que a empresa passou a declarar na DCTFWeb e a do FGTS Digital;
  - o FGTS Digital é obrigatório para todos os empregadores desde a competência 03/2024 (Edital MTE 4/2023, pagamento em abril), e em branco vale essa. Início antes disso é recusado; depois, aviso para conferir;
  - a DCTFWeb entrou por grupos de empregadores, então o mês é o da empresa, e em branco vira aviso.
- **Avisos nas competências antigas:**
  - na DCTFWeb da folha: "anterior à DCTFWeb da empresa: GFIP e GPS";
  - na consulta do FGTS: as competências antes do FGTS Digital são da SEFIP e da GRF, e a consulta não as mostra;
  - o diagnóstico do cadastro aponta o início em branco (aviso) ou inválido (erro).
- **Catálogo SAGE:** `arq-empresas` passa a disponível. Agora são 45 disponíveis e 6 parciais.
- **Testes:**
  - a validação;
  - o sistema de cada competência (GFIP/SEFIP antes, DCTFWeb/FGTS Digital depois, indefinido sem a DCTFWeb);
  - o diagnóstico;
  - a tela, que grava sem apagar os outros parâmetros.

## 11/10/2026 — Fórmula própria por evento

Décimo primeiro dos parciais da auditoria (Arquivos › Eventos › Cadastro do SAGE).

- **Cadastros › Eventos IOB › Fórmulas da empresa** (`services/calculo/formulaEvento.ts`, nos parâmetros da folha da empresa):
  - para um código de evento do IOB, a conta própria da empresa ativa, no lugar da rotina do cadastro;
  - a fórmula usa:
    - variáveis REF (a referência digitada), SALARIO, SALARIO_HORA, SALARIO_DIA, HORAS_MES e COEF;
    - as quatro operações, parênteses e vírgula decimal;
    - as funções MIN, MAX e ARRED;
  - a referência pode ser lida em horas, dias, %, valor ou nenhuma;
  - a tela mostra o exemplo na hora (salário de R$ 3.000,00 e referência 10) e grava, substitui e remove.
- **Avaliador próprio, sem eval:**
  - qualquer coisa fora das variáveis, números e operações vira erro em português (variável desconhecida, parêntese, divisão por zero, caractere não permitido);
  - valor menor ou igual a zero é recusado.
- **Uso:** o "Lançar evento" do Cálculo (o campo da referência segue a fórmula) e a importação de valores calculam pela fórmula. O resultado vai como lançamento avulso com as incidências do evento.
- **Catálogo SAGE:** `arq-eventos` passa a disponível. Agora são 46 disponíveis e 5 parciais.
- **Testes:**
  - o avaliador: contas, precedência, funções e erros, inclusive tentativas de código;
  - o Lançar evento com e sem referência, sem salário e com valor negativo;
  - a importação com fórmula;
  - a tela.

## 11/10/2026 — Processo trabalhista: responsabilidade indireta, unicidade e Justiça Comum

Décimo segundo dos parciais da auditoria (eSocial › Processo Trabalhista do SAGE). Com isto o S-2500 cobre todos os
tipos de contrato e origens do leiaute S-1.3.

- **Responsabilidade indireta (tpContr 8):**
  - o responsável direto vai no grupo ideResp do ideEmpregador: CNPJ ou CPF, e a matrícula lá ou, sem ela, a data de admissão;
  - obrigatório com o tipo 8 e opcional com o 6 (TSVE); com outro tipo é recusado;
  - o CPF do responsável não pode ser o do trabalhador;
  - o contrato não está no eSocial do declarante (indContr N), então os dados do vínculo vão no infoCompl, como no reconhecimento de vínculo.
- **Unicidade contratual (tpContr 9):**
  - a matrícula do trabalhador é a que incorpora as demais;
  - os contratos incorporados vão no grupo unicContr: a matrícula de cada um ou, no TSVE sem matrícula, a categoria e o início do S-2300;
  - matrícula igual à que incorpora e contrato repetido são recusados; até 99.
- **Processo da Justiça Comum (origem 3):**
  - número do CNJ com o 14º dígito 4 (Federal) ou 8 (Estadual);
  - a cota patronal da requisição autônoma vai no infoPatPrec, dentro do infoProcJud (0 se não houver);
  - só contrato do tipo 1;
  - não há S-2501: a tela bloqueia o pagamento e a validação do S-2501 recusa.
- **Tela** eSocial › Processos trabalhistas: origem 3 no seletor com a cota patronal, o responsável direto quando há contrato 6 ou 8, e os contratos incorporados no tipo 9. O IRRF novo sai com 056152 só na CCP/NINTER.
- **Catálogo SAGE:** `es-processo-trab` passa a disponível. Agora são 47 disponíveis e 4 parciais.
- **Testes:** os XML dos três casos validados no XSD oficial, os erros de cada regra e a tela.

## 11/10/2026 — Pagamento de guias (baixa das guias pagas)

Décimo terceiro dos parciais da auditoria (Tributos › Pagamento de Guias do SAGE).

- **Prazos › Prazos do DP, no calendário da empresa** (`services/guias/pagamentoGuias.ts`, coleção `pagamentos_guias`):
  - as guias da competência são as obrigações que se pagam: DARF da DCTFWeb e do 13º, FGTS Digital, contribuição sindical dos empregados, patronal (GRCSU) e as guias da convenção. A transmissão da DCTFWeb, o S-1299 e os prazos continuam com "Entregue";
  - "Dar baixa" pede a data do pagamento, o valor pago, a autenticação do comprovante, o valor da guia e o número do documento;
  - data futura e valor zerado são recusados;
  - pagamento depois do vencimento avisa os acréscimos de cada guia:
    - DARF: multa de 0,33% ao dia até 20% e Selic, Lei 9.430/1996, art. 61;
    - FGTS: Lei 8.036/1990, art. 22;
    - sindical: CLT, art. 600;
  - valor a menor também avisa;
  - a baixa marca a guia como entregue no calendário (mesmo lote, com auditoria). "Desfazer a baixa" volta as duas;
  - o resumo mostra quantas guias têm baixa, o total pago e as vencidas sem baixa.
- **DARF:** o emitido na DCTFWeb da folha fica registrado com o valor e o número do documento, que já aparecem na baixa.
- **FGTS:** "Conferir no FGTS Digital" traz o valor recolhido pela consulta do SERPRO, só com o devido quitado. A data vem do comprovante.
- **Competência encerrada:** a baixa não trava, porque a guia vence depois do fechamento. A guia não se apaga; desfazer grava a baixa nula.
- **Fica para depois:** a consulta automática do DARF pago (e-CAC, PAGTOWEB do Integra Contador) depende de uma rota nova no CFI. Até lá, a baixa é pelo comprovante.
- **Catálogo SAGE:** `trib-pagamento` passa a disponível (destino Prazos). Agora são 48 disponíveis e 3 parciais.
- **Testes:**
  - o módulo: guias, baixa, situação, resumo e FGTS;
  - o calendário: baixa pelo FGTS com aviso de atraso, guia paga, desfazer e data futura;
  - o DARF registrado ao emitir;
  - as regras do Firestore.

## 11/10/2026 — Folha complementar: RRA (diferenças de anos anteriores)

Décimo quarto dos parciais da auditoria, e o último que não depende do Paulo (Processos › Folha Complementar do SAGE).

- **Cálculo** (`services/calculo/complementar.ts`):
  - diferenças de meses de ano anterior ao do pagamento são RRA (Lei 7.713/1988, art. 12-A);
  - o IRRF é exclusivo na fonte, em separado da folha do mês, pela tabela do mês do pagamento com os limites das faixas e a parcela a deduzir multiplicados pelo número de meses (`apurarIrrfRra`);
  - deduz o INSS das diferenças, sem dependentes, sem desconto simplificado e sem o redutor da Lei 15.270/2025 (a lei não prevê a redução para o RRA);
  - retenção de até R$ 10,00 é dispensada;
  - a verba "IRRF sobre o RRA" vai no último mês do RRA, e a memória mostra a conta.
- **eSocial:**
  - o RRA vai em demonstrativo próprio no S-1200 (`COMP{AAAAMM}{tipo}R-{matrícula}`), com `indRRA` S e `infoRRA`: tpProcRRA 1 (sem número de processo, por convenção ou acordo), descrição e quantidade de meses;
  - as diferenças do ano do pagamento ficam no demonstrativo de sempre;
  - o S-1210 paga os dois com a folha;
  - complementar gravada antes, sem o cálculo do RRA, é barrada (recalcular).
- **Fica pelo IOB:** a diferença do 13º de ano anterior (RRA com 13º) deixa a complementar incompleta, com o aviso.
- **A confirmar no primeiro envio:** a retenção do RRA usa a rubrica de IRRF da folha (codIncIRRF 31) dentro do demonstrativo com indRRA. Conferir no S-5002 do primeiro RRA transmitido.
- **Fontes:**
  - Lei 7.713/1988, art. 12-A (tabela multiplicada pelos meses);
  - MOS S-1.3, S-1200 (indRRA/infoRRA);
  - exemplo de R$ 144.000,00 em 48 meses: R$ 2.680,32, que o teste reproduz.
- **Catálogo SAGE:** `proc-complementar` passa a disponível. Agora são 49 disponíveis e 2 parciais (a integração contábil e o cadastro do funcionário, os dois dependendo do Paulo).
- **Testes:**
  - a tabela acumulada (com o exemplo);
  - RRA sem IRRF, RRA com IRRF (INSS deduzido, dependente ignorado, uma verba só) e RRA com 13º incompleto;
  - o S-1200 com os dois demonstrativos no XSD oficial e o S-1210;
  - a complementar antiga barrada.

## 11/10/2026 — Ficha: abas Complementos, Lanç. Automático e Holerite (pelo backup)

Paulo: *"VOCÊ TEM OS BACKUPS COM OS DADOS NECESSÁRIOS"*. Os prints do Office não eram necessários: o inventário do backup da empresa 1200 (06/10/2026, schema `f1200`, 367 tabelas, só estrutura) traz as colunas das três abas.

- **Complementos (colunas da `func`):** telefone 2 (`telefone2`), tipo sanguíneo (`tpsang`), uniforme (`calca`, `camisa`, `jaqueta`, `calcado`), crachá (`cracha`) e características físicas (`cabelos`, `olhos`, `altura`, `peso`, `sinais`, `outrasc`). As observações `obs1` a `obs4` vão juntas para Observações (aba Outros).
- **Holerite:**
  - **Ficha:** as três linhas de mensagem de cada funcionário (`mensa1` a `mensa3`).
  - **Empresa:** a mensagem geral (tabela `mensa`) fica em Cadastros › Enquadramento › Mensagem no holerite.
  - **PDF:** as duas saem no holerite em PDF, antes da assinatura (Cálculo e Relatórios).
  - A coluna `tiphole` (tipo de holerite) não tem significado conhecido e fica de fora.
- **Lanç. automático (tabela `lancauto`):**
  - **Na ficha:** evento do IOB, referência (como no "Lançar evento"), meses do ano (vazio = todo mês), período e observação.
  - **No Cálculo mensal:** "Lançamentos automáticos (N)" põe no movimento os que valem no mês, pelo mesmo cálculo do "Lançar evento" (rotina do evento ou fórmula da empresa). A chave de cada um fica em `movimento.automaticos` e é gravada: aplicar de novo não duplica.
- **Carga do backup** (Completar pelo backup do IOB):
  - **Colunas novas:** os sinônimos das colunas acima (tipo sanguíneo e altura/peso normalizados; altura em cm vira m).
  - **`lancauto`:**
    - entra pelo `codfun`;
    - o mês entra quando qualquer marca dele (`jan1s`…`dez2q`, semanas e quinzenas) está ligada; sem marca, ou com as doze, todo mês;
    - a referência é o `valor` em R$, quando há, ou a `ref`;
    - `anomes` vira o "a partir de";
    - só entra na ficha que ainda não tem lançamentos automáticos.
- **A conferir no primeiro backup com dados:** no inventário, a `lancauto` da empresa 1200 estava vazia. A leitura das marcas e o "sem marca = todo mês" são o entendimento pelo nome das colunas.
- **Catálogo SAGE:** `arq-funcionarios` passa a disponível. Agora são 50 disponíveis e 1 parcial (a integração contábil, que depende do layout do CCI).
- **Testes:**
  - os lançamentos automáticos: validação, meses e período, aplicar uma vez, fórmula e erros;
  - a validação e o histórico da ficha;
  - as mensagens do holerite;
  - a carga da `func` e da `lancauto`;
  - a tela da mensagem geral.

## 11/10/2026 — Status ao fim do dia (Paulo: "atualize nosso status")

- **Catálogo SAGE:** 50 disponíveis, 1 parcial e 2 fora do escopo (SST e SEFIP). Nenhum planejado.
- **Rodada da auditoria dos parciais:** os 16 itens da lista, menos a integração contábil, foram entregues em PRs mergeados e publicados (deploy e regras), do #195 ao #209:
  - 13º (parcela única e 1ª com as férias);
  - estorno do cálculo;
  - 13º no processamento agrupado;
  - ficha financeira com férias, 13º e rescisão;
  - listagens (sindicatos e etiquetas);
  - holerite por e-mail;
  - Crédito do Trabalhador;
  - escalas;
  - diagnóstico do cadastro;
  - início da DCTFWeb e do FGTS Digital;
  - fórmula por evento;
  - processo trabalhista (tipos 8 e 9, Justiça Comum);
  - pagamento de guias;
  - RRA na complementar;
  - abas Complementos, Lanç. automático e Holerite.
- **Testes:** 1304 (corrigido; antes informado como 1310), com tsc, build e regras do Firestore verdes. Nenhum PR aberto.
- **Depende do Paulo:**
  - integração contábil direta: layout do CCI ou acesso ao `plano-contas-iob`;
  - divergências da rodada 09/2026 da 1200 (#61);
  - plataforma P2 no ar (#81).
- **A conferir no uso real:**
  - o primeiro RRA transmitido: o S-5002, para a rubrica de IRRF dentro do demonstrativo com indRRA;
  - a leitura da `lancauto` num backup com dados (marcas dos meses);
  - a consulta automática do DARF pago no e-CAC, que depende de uma rota nova no CFI.

## 11/10/2026 — Informe de rendimentos com o RRA (quadro 6)

Primeiro item da lista "o que posso seguir" (Paulo: "pode seguir").

- **Leitura do S-5002** (`services/conferencia/totalizadores.ts`): os demonstrativos com `infoRRA` trazem a descrição, a quantidade de meses, o tipo e o número do processo, e as despesas (custas e advogados).
- **Informe** (`services/relatorios/informeRendimentos.ts`):
  - o RRA (código de receita 1889) sai do quadro 3: rendimentos, previdência e IRRF;
  - vai para o quadro 6 do comprovante (IN RFB 2.060/2021): número do processo (ou "sem processo" no tipo 1), quantidade de meses, natureza, e as linhas de rendimentos tributáveis, despesas com a ação judicial, previdência oficial, pensão, IRRF e isentos por moléstia grave;
  - RRA no S-5002 sem o demonstrativo `infoRRA` vira aviso para completar o quadro 6 à mão.
- **Quadro 6 no PDF e no Excel:** o PDF mostra o quadro quando há RRA; o Excel ganha as colunas do RRA.
- **Pensão no RRA:** o S-5002 não separa a pensão do RRA pelo tipo de rendimento conhecido; a linha fica zerada e a pensão segue no quadro 7.
- **Catálogo:** `rel-informe` sem a ressalva do RRA.
- **Testes:** a leitura do `infoRRA` e o RRA fora do quadro 3, nos casos convenção, judicial com advogado e sem demonstrativo.

## 11/10/2026 — RRA com a diferença do 13º de ano anterior

Segundo item da lista "o que posso seguir".

- **Regra:** IN RFB 1.500/2014, art. 36. O 13º entra nos rendimentos do RRA, com os acréscimos (§ 2º), e conta como um mês (§ 1º).
- **Cálculo** (`services/calculo/complementar.ts`):
  - a diferença do 13º de ano anterior deixa de marcar a complementar como incompleta;
  - a base do RRA soma as diferenças do mês e as do 13º;
  - deduz o INSS do mês e o do 13º;
  - os meses do RRA são os meses com diferença mais um por 13º;
  - o IRRF do 13º "exclusivo do ano" continua só para o 13º do ano do pagamento.
- **eSocial:** sem mudança. O 13º do RRA vai no demonstrativo com indRRA, no perRef de dezembro.
- **Fontes:** a redação do art. 36 vem de fontes secundárias (TOTVS TDN, COAD); o texto consolidado da IN no site da Receita não abriu daqui.
- **Testes:** dois meses de diferença mais o 13º dão 3 meses, com o INSS do 13º deduzido e um só IRRF (o do RRA).

## 11/10/2026 — Rescisão: culpa recíproca, falecimento e rescisão indireta

Terceiro item da lista "o que posso seguir". Os códigos foram conferidos no MOS S-1.3 consolidado (`docs/referencias`): 05 culpa recíproca, 10 falecimento do empregado e 17 rescisão indireta (S-2299, itens 11 e 20).

- **Culpa recíproca (05):**
  - metade do aviso prévio indenizado (com a projeção pela metade, como no acordo), do 13º e das férias proporcionais (CLT, art. 484; TST, Súmula 14);
  - férias vencidas inteiras;
  - multa de 20% do FGTS (Lei 8.036/1990, art. 18, § 2º) e saque (art. 20, I);
  - sem seguro-desemprego.
- **Falecimento (10):**
  - saldo, 13º e férias vencidas e proporcionais; sem aviso e sem multa;
  - sem IRRF na rescisão: os valores vão aos dependentes habilitados na Previdência ou aos sucessores (Lei 6.858/1980);
  - o S-2299 vai com `indApurIR` 1 nas verbas, e o S-1210 do pagamento é recusado; quem recebe é identificado na EFD-Reinf (MOS, S-2299, item 11.1);
  - saque do FGTS pelos dependentes (art. 20, IV).
- **Rescisão indireta (17):**
  - as verbas da dispensa sem justa causa: aviso com o da convenção, multa de 40%, saque e seguro-desemprego;
  - aviso: reconhecida em juízo, o S-2299 vai com o número do processo e sem as verbas, e os valores pelo S-2500 (MOS, item 20).
- **Demissões (prévia):** os três motivos entram nos cenários (aviso, saque e seguro-desemprego).
- **Testes:**
  - o motor nos três motivos;
  - o S-2299 de cada um no XSD oficial (no falecimento, com `indApurIR` 1);
  - a recusa do S-1210 no falecimento.

## 11/10/2026 — Itens 4 e 5 da lista: adiantamento por CPF e tipos da complementar

- **Item 4, IRRF do adiantamento com mais de um contrato no CPF:** já estava feito desde a #62. O motor soma os contratos do CPF, com os dependentes uma vez só e a parte de cada contrato proporcional ao adiantamento. Só fica travado, de propósito, o caso de contrato desligado no mês antes do adiantamento, porque a data em que a rescisão foi paga não fica gravada no Consultor. Na lista de 11/10 eu tinha descrito esse item como "cada contrato sozinho", o que estava errado.
- **Item 5, tipos da folha complementar (tpAcConv), conferidos no MOS S-1.3 (S-1200, item 18):**
  - **F** (verbas devidas depois do desligamento) passa a ser gerado. Mês de referência depois do desligamento é erro (S-2299, item 7.3); em quem não está desligado, aviso para retificar o S-1200 ou o S-2299 (item 18.12). O FGTS vai na competência do S-1200 (item 18.9).
  - **E** (conversão de licença saúde em acidente) continua fora: vai em rubrica informativa só com FGTS, recolhido na competência de cada mês com encargos (itens 18.8 e 18.9), e o motor ainda não tem verba informativa.
  - **H** (base de FGTS anterior ao FGTS Digital): o próprio eSocial manda não usar até a regulamentação (item 18.14).
  - **I** (sentença da Justiça Comum): só para servidor público do RGPS (item 18.15). Decisão da Justiça do Trabalho vai pelo S-2500/S-2501.
  - A tela mostra o motivo de cada tipo que não gera.
- **Testes:**
  - os motivos de E, H e I;
  - o tipo F: dentro do contrato, depois do desligamento e com ativo;
  - o S-1200 do tipo F no XSD oficial.

## 11/10/2026 — Folha gravada e processos gravados em vários lotes

Sexto item da lista "o que posso seguir".

- **Limite:** gravar a folha do mês, gravar os processos (férias, 13º, rescisão) e estornar a folha recusavam empresas com mais de 450 funcionários, por causa do limite de 500 escritas por lote do Firestore.
- **Agora** (`services/calculo/lotesFirestore.ts`): as escritas vão em lotes de até 400, em ordem.
  - **Gravar:** primeiro os holerites e as exclusões de quem saiu da folha, depois o resumo (`folhas_gravadas` ou `processos_gravados`). Se falhar no meio, o resumo antigo continua valendo e a tela mostra o erro para gravar de novo.
  - **Estornar:** primeiro o resumo e a auditoria, para que a folha deixe de existir, depois os holerites.
  - **Ler:** só os holerites listados no resumo, então um holerite que sobrou de uma gravação interrompida não entra.
- **Regras:** sem mudança. Os holerites não dependem do documento-resumo.
- **Testes** (Firestore simulado): 1.000 holerites em 3 lotes com o resumo por último; estorno de 1.000 com o resumo e a auditoria no primeiro lote; leitura filtrada pelo resumo; processos em lotes.

## 11/10/2026 — Itens 7 e 8 da lista: férias pagas depois do gozo e mensagem do holerite pelo backup

- **Item 7 (recibo de férias pago depois do mês do gozo):** não foi construído. O MOS S-1.3 (S-1200, item 23) só prevê o pagamento das férias depois do gozo para o servidor estatutário (exemplo "d"), e na CLT as férias são pagas até 2 dias antes do início (art. 145). O bloqueio continua, agora com esse motivo na mensagem, para a equipe conferir a data do recibo.
- **Item 8 (mensagem geral do holerite pelo backup):**
  - o "Completar pelo backup do IOB" lê a tabela `mensa` do mesmo schema da `func`, com as linhas não vazias, até 300 caracteres;
  - se a empresa ainda não tem mensagem, oferece gravá-la nos parâmetros da folha;
  - a gravação confere de novo e não substitui uma mensagem já cadastrada.
- **Testes:** a leitura da `mensa`.

## 12/10/2026 — Pagamento de guias: DARF pago conferido na Receita (PAGTOWEB pelo CFI)

Paulo: *"senão pode trabalhar no CFI"* (11/10). A rota que faltava para a baixa automática do DARF.

- **CFI:** rota nova `POST /api/dp-integration/pagamentos/consultar` (PAGTOWEB/PAGAMENTOS71 do Integra Contador, leiaute conferido na documentação oficial do SERPRO em 12/10). Só o Consultor DP entra, e só nas empresas da carteira.
- **DP:**
  - na baixa do DARF (calendário da empresa), o botão **"Conferir na Receita"** consulta pelo número do documento e preenche a data de arrecadação e o valor total pago, com multa e juros no aviso. Fica desabilitado sem número do documento;
  - `baixaPelaReceita` (pura): documento não localizado não vira "não pago" (a arrecadação leva dias para aparecer); sem data ou sem valor, não preenche (ausente ≠ zero); resposta simulada ou de outra fonte é recusada;
  - a baixa ganha a fonte `receita` ("pagamento conferido na Receita"); mudar a data ou o número depois volta a fonte para manual;
  - `pagamentos` entra no mapa de rotas do túnel (serviço governo).
- **Regras:** `pagamentos_guias.pagamento.fonte` aceita `receita`.
- **Catálogo e auditoria:** `trib-pagamento` e o item 13 da auditoria atualizados.
- **Pré-requisito no SERPRO:** produto PAGTOWEB contratado e procuração do cliente cobrindo o serviço; sem isso a tela mostra a mensagem do SERPRO e a baixa continua manual.
- **Testes:** `baixaPelaReceita`, a observação da baixa, a tela (preenche e grava com fonte `receita`; não localizado mostra o motivo) e a regra da fonte.

## 12/10/2026 — Itens 1, 2 e 3: DARF em lote na Receita, comprovante de arrecadação e complementar tipo E

Paulo: *"segue com , 1,2,3"* (12/10).

- **Item 1 — Conferir os DARF na Receita (lote):** no calendário da empresa, um botão consulta numa vez só (PAGTOWEB/PAGAMENTOS71 pelo CFI) todos os DARF da competência com número do documento. `conferenciaNaReceita` (pura) classifica cada guia:
  - `baixar`: paga na Receita e sem baixa no DP; a baixa vem pronta, com fonte `receita`;
  - `confere` ou `diverge`: compara a data e o valor da baixa com os da Receita;
  - `nao-localizado`: nunca vira "não pago";
  - `incompleto`: a Receita não informou a data ou o valor;
  - `sem-numero`.

  "Dar baixa nas N localizadas" valida cada uma (atraso, valor a menor) e pede uma confirmação só.
- **Item 2 — Comprovante de arrecadação:**
  - **CFI** (PR #1401, publicado): `POST /pagamentos/comprovante` (PAGTOWEB/COMPARRECADACAO72). A documentação oficial se contradiz sobre o formato da saída; as duas formas são aceitas, e só passa conteúdo que é PDF.
  - **DP:** na guia DARF paga, "Comprovante da Receita" baixa o PDF `comprovante-arrecadacao-<obrigação>-<documento>.pdf` (sem dado pessoal). O PDF não é gravado.
- **Item 3 — Complementar tipo E (conversão do auxílio-doença em acidentário):**
  - **Regra do MOS** (S-1200, itens 18.8 e 18.9, e o exemplo 5 do item 18.10): rubrica informativa com incidência só de FGTS, com a base de cada mês do afastamento no seu {perRef}. O FGTS é recolhido na competência do {perRef}, com encargos.
  - **Verba nova `FGTSAC`** ("Base do FGTS do afastamento por acidente (informativa)"), só no tipo E e só ela no tipo E. Ela ignora as marcações de INSS/IRRF da tela e fica fora do líquido.
  - **`Verba.informativa`** (opcional; hoje só a complementar usa):
    - o S-1200 exige rubrica `tpRubr` 3 no S-1010;
    - o de/para sugere entre as informativas pela descrição. O MOS não fixa a natureza, então nenhuma é chutada;
    - o demonstrativo só com informativas não vai ao S-1210;
    - o holerite em PDF mostra a base como informação, não como vencimento.
  - **Tela:** escolher E esconde o reajuste, troca as linhas para a base do FGTS e pede a data da notificação da decisão.
  - **Achado, não corrigido nesta entrega:** a folha mensal soma à base do FGTS os dias de afastamento por acidente (motivo 01, Lei 8.036/1990, art. 15, § 5º), mas o S-1200 mensal ainda não leva essa base em rubrica informativa. Por isso o S-5003 não vê esse FGTS. A complementar tipo E avisa disso. A correção mexe no motor mensal (as verbas informativas entrariam em holerite, médias, provisões e contábil) e fica como próximo item.
- **Testes:** conferência em lote (pura e tela), comprovante (tela), tipo E (cálculo, validação, tela, S-1200 com XSD, rubrica não informativa recusada e sem S-1210).

## 12/10/2026 — FGTS do afastamento por acidente e do serviço militar no S-1200 mensal

Paulo: *"pode seguir com a correcao"* (12/10). É o achado do tipo E.

- **O problema:** o motor somava à base do FGTS os dias de afastamento por acidente do trabalho (motivo 01, do 16º dia em diante) e por serviço militar (motivo 29), conforme a Lei 8.036/1990, art. 15, § 5º. Mas o S-1200 do mês não levava essa base, então o S-5003 do eSocial não via esse FGTS.
- **A regra:** MOS, S-1200, item 36.1. Nesses afastamentos o empregador não paga salário, mas informa o valor dos salários em rubrica informativa para a base do FGTS.
- **Motor:** `ResultadoCalculo.verbasInformativas` (opcional):
  - `FGTSAC`: base do FGTS do afastamento por acidente;
  - `FGTSSM`: base do FGTS do serviço militar;
  - as duas são `informativa: true`, só com FGTS, e a referência traz os dias;
  - ficam **fora de `verbas`**, então holerite, líquido, médias, provisões, ficha financeira e contábil não mudam;
  - `bases.fgts` continua igual (já somava).
- **S-1200 mensal:** as informativas entram no mesmo demonstrativo (tpRubr 3 exigido), fora do líquido e do S-1210.
  - **De/para:** `FGTSAC` é sugerida pela descrição, porque o MOS não fixa natureza para ela; `FGTSSM` pela natureza 9905, do exemplo do MOS.
  - **Rubrica faltando:** sem rubrica no de/para, o S-1200 não sai, com o erro de sempre.
- **S-1010:** modelo `FGTSSM` (9905, informativa, CP 00, IRRF 9, FGTS 11, como no exemplo do MOS). Para o acidente não há modelo, porque o MOS não dá a natureza.
- **Correção do validador do S-1010:** a regra de "conferência de base" (CP 00, FGTS 00, IRRF 9) valia para toda a faixa 9901–9908. O MOS (S-1010, item 1.4) lista só 9901, 9902, 9903, 9904, 9907 e 9908. A 9905 (serviço militar) e a 9906 (remuneração no exterior) são bases e eram recusadas por engano.
- **Complementar tipo E:** o aviso agora orienta a cadastrar o afastamento com o motivo 01 para a folha mensal levar a base.
- **Testes:**
  - motor: acidente com 6 dias de benefício e serviço militar com 15 dias;
  - S-1200: rubrica informativa, líquido e S-1210 sem ela, XSD e erro sem de/para;
  - validador: 9905 com FGTS 11 aceita, 9902 recusada.

## 12/10/2026 — Lote A: S-2200/S-2206 por categoria, pensão de dois pagamentos no S-1210 e mensagem do 13º

Paulo: *"PODE SEGUIR DE 1 A 4"* (12/10).

- **Item 1, S-2200 e S-2206 por categoria** (`services/esocial/admissao.ts`). As regras vêm das anotações de validação do XSD S-1.3 (evtAdmissao e evtAltContratual) que está no repositório.
  - **103, aprendiz:** grupo `aprend`, com contratação direta (CNPJ da entidade qualificadora) ou indireta (estabelecimento cumpridor da cota, de outra empresa) e o CNPJ das atividades práticas, que é opcional. Exige tpContr 2 para admissão desde 22/04/2024. Antes, a categoria 103 passava sem o grupo, que é obrigatório desde 22/01/2024.
  - **106, temporário (Lei 6.019/1974):** grupo `trabTemporario` no S-2200, com a hipótese legal, a justificativa, o tomador (CNPJ de outra empresa ou CPF) e, na substituição de pessoal, os CPFs substituídos.
  - **105 (prazo determinado da Lei 9.601/1998):** liberada.
  - **111, intermitente:** liberada, sem `qtdHrsSem`.
  - **tpContr 3 (contrato vinculado a fato):** `objDet` (o objeto determinante).
  - **tpContr 2 e 3:** `clauAssec` (a cláusula assecuratória), que o XSD marca como obrigatória. **O S-2200 com contrato por prazo ia sem ela** e seria recusado pelo eSocial.
  - **Categorias que continuam fora:** 104 (doméstico, pelo eSocial Doméstico); 107 e 108 (contrato verde e amarelo, com o IOB).
  - **S-2206:** `aprend` para o 103, e a regra de categoria passa a valer igual ao S-2200.
  - **Tela** (Transferência e Troca de estabelecimento): os campos aparecem conforme a categoria e o tipo de contrato da ficha.
- **Item 2, pensão de dois pagamentos no mesmo mês** (`pagamentoRescisao.ts`, `somarPensao`):
  - o S-1210 aceito no mês com pensão e a rescisão também com pensão eram recusados ("junte pelo IOB");
  - agora o mesmo alimentando no mesmo tpRend vira um `penAlim` só, com a soma, e o alimentando novo entra depois;
  - a tela avisa o que foi somado.
- **Item 3, outros motivos da Tabela 19: não feito.**
  - A Tabela 19 não está no MOS nem no XSD do repositório; o XSD só cita os códigos nas regras.
  - O site do eSocial (www.gov.br) está bloqueado na rede desta sessão, e o backup do IOB não traz a tabela.
  - Sem a tabela oficial os códigos não entram, porque código errado é recusado pelo eSocial.
- **Item 4:** a folha do 13º dizia "a rescisão ainda não está no motor" para o desligado; agora aponta Cálculo › Rescisão e Demissões.
- **Testes:**
  - S-2200 de 111, 103 (direta e indireta), 106 (com substituição) e tpContr 3, todos no XSD oficial, mais as recusas;
  - S-1210 com a pensão somada e com um alimentando novo, no XSD.

## 12/10/2026 — Lote B: holerite por WhatsApp e e-mail, mensagem de aniversário e Itaú homologado

Paulo: *"QUERO QUE IMPLEMENTE O ENVIO DE HOLERITE POR WHATSAPP E E-MAIL, CRIAR MENSAGEM DE ANIVERSARIO NO MES DE ANIVERSARIO DO COLABORADOR"* e *"O ARQUIVO BANCARIO JA FOI TRATADO COM OS TESTES FEITOS PELO BANCO ITAU DA EMPRESA 1200"* (12/10).

- **Holerite a cada funcionário** (Relatórios › Central › Holerites › "Enviar a cada funcionário"):
  - o e-mail já existia (#119);
  - novo: o **WhatsApp do escritório** (SP Connect, `POST /api/admin/whatsapp/enviar` do CFI). Usa um modelo do DP com cabeçalho de documento e manda o PDF de cada um para o celular da ficha (Telefone ou Telefone 2);
  - `destinatariosWhatsApp` e `variaveisDoFuncionario`: o nome é o primeiro nome da pessoa, e o modelo com variável que o Consultor não preenche é recusado antes do envio;
  - um envio por vez, com o resultado de cada um.
- **Mensagem de aniversário** (`services/relatorios/aniversarios.ts`):
  - **texto:** é da empresa, com `{nome}` e `{empresa}`, em Cadastros › Enquadramento › Mensagem no holerite. Sem gravar, vale o padrão; desmarcada, fica desligada (`parametrosFolha.mensagemAniversario` = '');
  - **no mês do aniversário**, ela sai:
    - no holerite em PDF da pessoa, antes das outras mensagens;
    - no e-mail do holerite;
  - **Relatórios › Aniversariantes do mês:** o cartão de aniversário em PDF, com o nome e a mensagem (`cartaoAniversarioPdf`, no layout dos relatórios), para baixar ou enviar por e-mail ou WhatsApp;
  - **sem mexer no CFI:** o cartão vai como anexo, então os modelos do DP com documento servem, e o e-mail não sai "sem anexos".
- **Arquivo bancário:** o crédito em conta Itaú (SISPAG) já estava conferido com o arquivo da SAGE; agora fica registrado como homologado pelo Itaú nos testes da empresa 1200. Poupança, TED e PIX continuam sem arquivo modelo.
- **Testes:**
  - destinatários do WhatsApp, variáveis, envio pela tela (sucesso e falha) e o e-mail do holerite com a mensagem de aniversário;
  - texto, aniversariantes, holerite do mês, cartão em PDF e a tela do cartão (e-mail, sem modelo e mensagem desligada).

## 12/10/2026 — Lote C: planilhas com o xlsx corrigido, histórico dos envios e lembrete dos aniversariantes

Paulo: *"pode seguir do item 1 ao 3 o item 4 nao é necessario p nos"* (12/10). O item 4 era enviar os holerites no processamento de várias empresas.

- **Item 1, `xlsx` corrigido:**
  - o `xlsx` 0.18.5 do npm tem as falhas de *prototype pollution* e ReDoS, e a versão corrigida da SheetJS só sai no CDN dela (`cdn.sheetjs.com`, bloqueado nesta rede);
  - troquei pelo `@e965/xlsx` 0.20.3, a republicação da SheetJS no npm, com o apelido `"xlsx": "npm:@e965/xlsx@0.20.3"`. Os `import ... from 'xlsx'` não mudam;
  - conferido no pacote: sem scripts de instalação, sem dependências, `XLSX.version = '0.20.3'`, e sem `fetch`, `XMLHttpRequest`, `eval` ou `child_process`. A comparação byte a byte com o tarball oficial não foi possível, porque o CDN e o git da SheetJS estão bloqueados aqui;
  - saíram do lock as dependências do 0.18.5 (adler-32, cfb, codepage, crc-32, frac, ssf, wmf, word), que nada mais usava;
  - o `npm audit` não acusa mais o xlsx (de 55 para 54 avisos; os outros são de firebase, jest, vite e tailwind, fora deste lote).
- **Item 2, histórico dos envios ao funcionário** (`services/relatorios/enviosFuncionario.ts` e `enviosFuncionarioService.ts`):
  - coleção `envios_funcionario/{empresa}_{AAAA-MM}_{holerite|aniversario}_{ficha}`, um registro por canal (e-mail e WhatsApp) com o último envio: deu certo ou o erro, quando, quem enviou e o destino mascarado (`b***@x.com`, `(**) *****-7777`);
  - nas telas do holerite e do cartão: quem já recebeu pelo canal na competência fica de fora do próximo envio, com a lista "já receberam" (quando e por quem); "Incluir quem já recebeu (reenviar)" manda a todos;
  - falha ao gravar o histórico não desfaz o envio: a tela avisa "Envio feito, mas não gravado no histórico";
  - regras: lê e grava quem pode na empresa; id, tipo, canais e campos conferidos; o autor é quem grava; nada se apaga.
- **Item 3, lembrete dos aniversariantes** (Prazos do DP, `components/prazos/LembreteAniversariantes.tsx`):
  - os aniversariantes do mês corrente da empresa ativa, pelo dia, com o de hoje marcado e quantos já receberam o cartão;
  - "Enviar os cartões" abre Relatórios › Central já em Aniversariantes do mês (`relatorioInicial`);
  - se a competência ativa não é o mês corrente, avisa para trocar o período, porque a tela dos cartões usa a competência ativa.
- **Testes:**
  - histórico: id, máscara, registro, texto e separação; telas do holerite e do cartão com o histórico (fica de fora, reenviar, grava a falha, falha ao gravar);
  - lembrete: só a empresa, o de hoje, quem recebeu, o aviso da competência e o atalho;
  - regras: `testes-regras/enviosFuncionario.test.mjs`.

## 12/10/2026 — Aviso de DARF vencido sem pagamento (CFI confere, DP avisa)

Paulo: *"podemos seguir com o P2 e o alerta de darf nao pago no CFI"* (12/10).

- **No CFI (#1403):**
  - todo dia útil, às 10h20, o cron `dp-darf-nao-pago-cron` confere na Receita (PAGTOWEB/PAGAMENTOS71) os DARF da DCTFWeb que o DP emitiu pelo túnel e que já venceram;
  - grava a situação por CNPJ e competência: pago (também com outro número, pelo período de apuração), aguardando (3 dias úteis de carência) ou não localizado;
  - o CFI não lê o banco do DP: só a própria auditoria das emissões. DARF registrado à mão no DP, sem passar pelo túnel, fica fora do aviso.
- **No DP** (`services/guias/avisoDarfReceita.ts`, calendário da empresa em Prazos do DP):
  - lê a situação pela rota `/pagamentos/situacao-darf`, que não consulta a Receita na hora;
  - cruza com a baixa no DP. Sem pagamento localizado e sem baixa: aviso vermelho para conferir com o cliente. Pago na Receita e sem baixa: aviso azul para dar a baixa ("Conferir na Receita"). Com baixa, ou ainda aguardando: nada;
  - competência diferente da ativa traz o atalho "Trocar o período";
  - sem usuário ou sem resposta do CFI, não há aviso, e o calendário segue normal;
  - depois de uma baixa, os avisos são relidos.
- **Pendente do Paulo:** rodar `scripts/setup-cloud-schedulers.sh` do CFI no Cloud Shell para criar o job `dp-darf-nao-pago-cron`. Até lá, o aviso não aparece.
- **Testes:** `calendarioEmpresa.test.tsx` (avisos, cruzamento com a baixa, atalho, sem CFI e sem usuário).

## 12/10/2026 — Rescisão: motivos novos da Tabela 19 (tabela oficial do eSocial)

Paulo liberou o `www.gov.br` na rede (*"pode testar"*, 12/10). A Tabela 19 foi lida da documentação oficial: leiaute S-1.3, NT 07/2026 rev. 24/09/2026, `tabelas.html`, com códigos, vigência e categorias.

- **No motor de rescisão**, além de 01–07, 10, 17 e 33:
  - **47, encerramento da empresa, do estabelecimento ou de parte das atividades**, e **48, falecimento do empregador individual sem continuação** (art. 485): verbas da dispensa sem justa causa, aviso prévio (TST, Súmula 44), multa de 40% e saque (Lei 8.036/1990, art. 20, I e II). Não valem para o doméstico (o dele é o 49);
  - **27, força maior** (arts. 501 e 502): sem aviso prévio, 13º e férias proporcionais integrais, multa de 20% (art. 18, § 2º) e saque (art. 20, I). A tela avisa sobre o art. 501 e o art. 479 pela metade no contrato a termo;
  - **08, por interesse do empregado** (arts. 394 e 483, § 1º): sem aviso de nenhuma parte, sem multa e sem saque;
  - **41 e 42, extinção antecipada da aprendizagem** (art. 433, I e III): só a categoria 103; sem aviso e sem as indenizações dos arts. 479 e 480 (§ 2º), sem multa.
- **Categorias da Tabela 19:** motivo fora da categoria é recusado com a explicação (`CATEGORIAS_DO_MOTIVO`).
- **Seguro-desemprego:** passa a valer também na rescisão indireta (Lei 7.998/1990, art. 3º: "inclusive a indireta"), no encerramento e no falecimento do empregador. Antes a tela dizia que a indireta não dava direito, e isso estava errado.
- **Ficha:** a lista de motivos traz todos os do motor.
- **Ficaram fora, de propósito:**
  - 09 (opção do empregado pelo falecimento do empregador) e 26 (fato do príncipe, art. 486): o pagamento e a indenização dependem de quem assume;
  - 49 (empregador doméstico): os 3,2% não têm regra na LC 150 para este motivo;
  - 11 a 13, 36, 43 e 44: transferência, mudança de CPF e agrupamento, sem verbas.
- **Regra do eSocial para registrar:** desligamento de afastado só com os motivos [01, 07, 09, 10, 11, 12, 13, 14, 16, 17, 21, 22, 23, 24, 25, 26, 29, 30, 32, 34, 36, 37, 38, 39, 40, 43, 44, 47, 48, 49] (REGRA_DESLIG_TRABALHADOR_AFASTADO). Ainda não é conferida antes do envio.
- **Testes:** `rescisaoTabela19.test.ts`.

## 12/10/2026 — Desligamento de afastado: a regra do eSocial antes do envio

Paulo: *"pode seguir com regra do afastado"* (12/10).

- **Regra oficial** (REGRA_DESLIG_TRABALHADOR_AFASTADO, leiaute S-1.3, NT 07/2026 rev. 24/09/2026):
  - o S-2299 de trabalhador afastado temporariamente ou cedido só é aceito com os motivos 01, 07, 09, 10, 11, 12, 13, 14, 16, 17, 21, 22, 23, 24, 25, 26, 29, 30, 32, 34, 36, 37, 38, 39, 40, 43, 44, 47, 48 e 49;
  - a data considerada é a maior entre o desligamento e o fim projetado do aviso indenizado (dtProjFimAPI).
- **`afastamentoQueImpede`** (`services/esocial/desligamento.ts`):
  - procura afastamento em aberto na data da regra, inclusive férias (S-2230, motivo 15);
  - devolve o texto com o motivo, as datas e onde corrigir: desligar depois do fim, ou informar o fim em Cadastros › Afastamentos e enviar o S-2230 de término.
- **S-2299 (Cálculo › Rescisão):** a tela passa os afastamentos da ficha, e o evento não é gerado quando a regra impede. Antes, o eSocial é que recusava.
- **Demissões (prévia):**
  - o alerta segue a regra: afastado ou em férias com motivo não aceito → o texto da regra;
  - motivo aceito (ex.: 07) → "o eSocial aceita o motivo com o afastamento" e a estabilidade a conferir;
  - antes, o alerta tratava todo afastado como recusado e ignorava as férias.
- **Testes:** `desligamento.test.ts` (férias, afastamento sem fim, motivo aceito, data do fim projetado, outra ficha) e `previa.test.ts`.

## 12/10/2026 — Motivos 09, 26 e 49 e o amparo legal obrigatório

Paulo: *"motivo de rescisão é algo que deve ser cadastrado de forma que o uso só ocorre quando houver uma das situações; todas devem obedecer o amparo legal"* (12/10).

- **Amparo obrigatório** (`AMPARO_DO_MOTIVO`, `erroDoAmparo`):
  - os motivos que dependem de um fato só fecham com a data e a descrição do fato e do documento:
    - 09 e 48: certidão de óbito do empregador individual;
    - 26: ato da autoridade;
    - 27: fato de força maior;
    - 47: baixa, distrato ou ata do encerramento;
    - 49: certidão de óbito do empregador doméstico;
  - sem o amparo, a rescisão fica incompleta, com o aviso do que falta e da base legal, e o S-2299 não sai;
  - fato posterior ao desligamento é recusado;
  - com o amparo, o fato vai na memória do cálculo e na causa do TRCT;
  - na tela (Cálculo › Rescisão), os campos "Data do fato" e "Fato e documento" aparecem só para esses motivos.
- **As restrições de categoria da Tabela 19 continuam:** 41 e 42 só para aprendiz, 49 só para doméstico, e 26, 47 e 48 nunca para doméstico.
- **Motivos novos:**
  - **09, opção do empregado pelo falecimento do empregador individual** (CLT, art. 483, § 2º): sem aviso de nenhuma parte e sem multa; saque do FGTS (Lei 8.036/1990, art. 20, II);
  - **26, fato do príncipe** (CLT, art. 486): verbas da dispensa, com aviso e multa de 40%, e saque. A indenização fica a cargo do governo responsável: a tela avisa que a guia sai pelo FGTS Digital e que o ressarcimento é pedido à parte (§ 1º), a conferir com o jurídico. Seguro-desemprego: sim;
  - **49, falecimento do empregador doméstico sem continuação:** sem aviso; os 3,2% vão para o empregado (LC 150/2015, art. 22, caput; o § 1º não inclui este caso); saque liberado. O S-2299 do doméstico continua pelo eSocial Doméstico.
- **Testes:** `rescisaoTabela19.test.ts` (amparo, 09, 26 e 49).

## 12/10/2026 — Tabelas do eSocial do Consultor conferidas com as oficiais

Paulo: *"pode seguir com os itens 1,2,3"* (12/10). Item 1: conferir as tabelas usadas no Consultor com as oficiais.

- **Fonte:** tabelas oficiais do leiaute S-1.3 (NT 07/2026 rev. 24/09/2026), na documentação técnica no gov.br, lidas em 12/10/2026. As que o Consultor usa (01, 03, 07, 08, 10, 18, 19, 21 e 29) ficam em `services/esocial/__tests__/fixtures/tabelasEsocialS13.json`, com código, descrição e vigência.
- **Divergências corrigidas:**
  - **natureza 1002 (DSR), encerrada em 30/04/2024:**
    - os modelos do S-1010 "DSR do intermitente" e "DSR sobre horas extras" e as sugestões do de/para passam para a **1012** (DSR e feriado);
    - o rótulo da 1002 dizia "DSR e feriados", que é a descrição da 1012;
  - **natureza 1020 (férias), encerrada em 30/04/2023:** saiu das sugestões das férias do intermitente, que ficam só com a 1016 e a 1017.
- **Vigência nas validações** (`services/esocial/vigenciaTabelas.ts`, a vigência de 01, 03, 18 e 19; o teste confere que é igual à oficial):
  - **S-1010:** natureza fora da vigência no início da validade é recusada, com a substituta (1002 → 1012, 1020 → 1016 e 1017, 1801 → 1800);
  - **afastamento:** motivo fora da vigência na data de início é recusado. Os motivos 14, 30 e 33 terminaram em 2021–2022; a suspensão disciplinar (30) saiu da Tabela 18 e é lançada como faltas;
  - **S-2200:** categoria fora da vigência na admissão é recusada (107, 108 e 308 terminaram).
- **Motivos de afastamento acrescentados com a descrição oficial:**
  - 12, 22, 27, 41, 42 e 53;
  - os da **licença-paternidade (46 a 52), que só valem a partir de 01/01/2027**: antes disso a validação recusa e diz a data.
- **A acompanhar:** naturezas novas do salário-paternidade (4052, 4053, 9928 e 9929) a partir de 01/12/2026, e os motivos 18 e 20 com descrição nova a partir de 2027.
- **Trava:** `tabelasOficiais.test.ts`:
  - o que o Consultor gera está vigente;
  - o que só lê o histórico existe na tabela oficial;
  - a vigência embutida é igual à oficial.

## 12/10/2026 — Pré-voo com regras oficiais de validação do eSocial

Item 2 da lista de 12/10. Fonte: "Regras de validação" do leiaute S-1.3 (NT 07/2026 rev. 24/09/2026), na documentação técnica no gov.br. São 119 regras; entram as que dá para conferir só com o XML do lote. As que dependem do que já está no eSocial (vínculo, S-1010 vigente, fechamento) ficam com as regras de ordem e com o governo.

- **`services/esocial/regrasOficiais.ts`**, chamado pelo `envioSeguro` em todo envio. Cada achado leva o nome da regra oficial:
  - **REGRA_CARACTERE_ESPECIAL:**
    - só os caracteres da lista oficial (ASCII visível e o Latin-1 listado; travessão "–", aspas curvas, tab, enter e espaço não separável são recusados);
    - sem espaço no início ou no fim do campo;
    - a assinatura fica fora da conferência;
  - **REGRA_VALIDA_PERIODO_APURACAO e REGRA_REMUN_ANUAL_DEZEMBRO:** remuneração mensal até o mês corrente; 13º (anual) só a partir de 1º/12 do ano;
  - **REGRA_VALIDA_PER_APUR_PGTO e REGRA_VALIDA_DT_PGTO:** no S-1210, o período vai até o mês corrente (procEmi 2, 4 e 22: até 2 meses depois); nos tpPgto 1, 4 e 5, o pagamento não pode ser anterior ao perRef (anual = dezembro);
  - **REGRA_ADMISSAO_VALIDA_DT_ADM e REGRA_ADMISSAO_VALIDA_DURACAO_CONTRATO:** admissão até 30 dias depois de hoje; limites das categorias 103, 105, 107 e 108; contrato rural de pequeno prazo (102) com até 60 dias;
  - **REGRA_AFASTAMENTO:** o lote não leva dois S-2230 do mesmo vínculo com a mesma data de início ou de fim;
  - **REGRA_VALIDA_DT_FUTURA:** nos eventos de tabela, início e fim da validade não podem passar do mês do envio.
- **S-1010:** início da validade no futuro passa de aviso a erro. O texto antigo dizia "até a competência seguinte", e a regra oficial não aceita nenhum mês depois do envio.
- **Testes:** `regrasOficiais.test.ts`.

## 12/10/2026 — Pacotes com alerta de segurança: de 54 para 7

Item 3 da lista de 12/10.

- **Saíram, sem uso:**
  - jest, jest-environment-jsdom, ts-jest, @types/jest, @testing-library/jest-dom, identity-obj-proxy, dotenv-cli e o `jest.config.js` vazio;
  - os testes são do vitest; nada importava o jest.
- **Pego no meio do caminho:** o jsdom dos testes de tela vinha escondido no jest-environment-jsdom. Sem ele, o vitest dava "190 passed" contando só 106 arquivos (os outros 84 falhavam ao iniciar, como "unhandled errors"). Agora o jsdom 26 está declarado, e a suíte voltou a 190 arquivos e 1389 testes.
- **Atualizados:**
  - vite 5 → 7 (falhas do servidor de desenvolvimento e do esbuild; o @vitejs/plugin-react 4.7 e o vitest 4 aceitam o vite 7; Node 22 no CI);
  - firebase-admin 13 → 14 (scripts do CRM e do monitor de leiaute; o `node --check` passa);
  - @grpc/grpc-js fixado em ^1.14.6 por `overrides` (o @firebase/firestore trazia o 1.9.16, com duas falhas; o app no navegador não usa o grpc).
- **Ficam 7, todos do tailwindcss 3** (braces, micromatch, chokidar, fast-glob e postcss-*):
  - são ferramentas da montagem do CSS e não vão para o navegador;
  - a correção é o tailwind 4, uma migração da configuração e do CSS. Fica para um lote próprio, com conferência visual das telas.
- **Conferido:** tsc, vitest 190/1389, build e `npm run test:regras` 35/122.

## 12/10/2026 — Plataforma comum, P2: no ar e o DP usando a IA dela

Paulo: *"podemos fazer o P2 usando o terminal do meu mac"* (12/10).

- **No Mac do Paulo:**
  - conta `sp-plataforma-deploy` com Cloud Run Admin, Artifact Registry Writer e Service Account User;
  - chave gravada direto no GitHub (`gh secret set`, sem passar pela tela);
  - `GEMINI_SECRET = gemini-api-key`;
  - acesso da conta padrão do Cloud Run ao segredo do Gemini.
- **Tropeços:**
  - o terminal era o PowerShell, onde o `<` e o `for ... do` do bash não existem. A chave foi criada e nunca gravada, e as tentativas deixaram 4 chaves órfãs (o bloco final apagou todas);
  - o primeiro deploy falhou porque o Cloud Run não aceita `--no-traffic` na criação do serviço. A esteira da plataforma foi corrigida (sp-plataforma #2).
- **Resultado:**
  - deploy completo (revisão candidata, `/ready` e rota);
  - `/ready` com `ia.configurada: true`;
  - endereço lido pelo `gcloud`, nunca digitado à mão;
  - `VITE_SERVICO_IA_URL` gravada no GitHub do DP, e este deploy do DP passa a mandar a MIA e a leitura dos holerites para a plataforma.
- **Volta:** apagar `VITE_SERVICO_IA_URL` e publicar.
- **Não testado daqui:** a rede desta sessão não alcança `*.run.app`. A primeira pergunta à MIA no app publicado é a prova com usuário real.

## 12/10/2026 — Esteiras: actions em Node 24 e Ubuntu fixo

- O GitHub avisou que as actions em Node 20 vão parar e que o `ubuntu-latest` passa a ser o Ubuntu 26 em 19/10/2026.
- **Actions** (o runtime de cada versão conferido no `action.yml` oficial):
  - checkout@v5, setup-node@v5 e setup-java@v5;
  - configure-pages@v6, deploy-pages@v5 e upload-pages-artifact@v5;
  - todas em Node 24. O upload-pages-artifact@v5 usa por dentro um upload-artifact em Node 24; ele passa a deixar de fora os arquivos ocultos, e o `public/` não tem nenhum.
- **Ambiente:** `runs-on: ubuntu-24.04` em vez de `ubuntu-latest`, para a troca do Ubuntu não chegar de surpresa. A mudança para o 26 vira decisão, com teste.
- A mesma mudança foi feita no CFI e na sp-plataforma.

## 12/10/2026 — Pré-voo: regras oficiais que dependem das rubricas (S-1010)

- **Fonte:** "Regras de validação" do leiaute S-1.3 (NT 07/2026 rev. 24/09/2026), no gov.br. O evento de cada regra foi conferido na página dos leiautes.
- **Novo em `regrasOficiais.ts` (`regrasDasRubricas`)**, para S-1200, S-1202, S-1207, S-2299 e S-2399, demonstrativo por demonstrativo:
  - **REGRA_DEMONSTRATIVO (bloqueio):**
    - descontos maiores que os vencimentos;
    - contribuição do segurado negativa, por código: codIncCP 31, 32, 34 e 35 no RGPS, codIncCPRP 31 e 32 no RPPS;
    - rubrica que não está no S-1010 do Consultor, ou sem validade na competência, vira alerta. Nesse caso as somas do demonstrativo não são conferidas (ausente não é zero), porque o S-1010 pode estar só no eSocial.
  - **REGRA_DESCONTO_IRRF_POSITIVO (alerta):** codIncIRRF 31 a 34 com devolução maior que a retenção. O governo recusa o S-1210 que paga o demonstrativo, então o aviso sai já no S-1200.
  - **REGRA_RUBRICA_COMPATIVEL_DECTERCEIRO (alerta):** no 13º, só as incidências da lista oficial; no S-1200, também sem a natureza 9253.
  - **REGRA_RUBRICA_COMPATIVEL_RESC (alerta):** codIncFGTS 21 e 93 só no S-2299/S-2399 ou em períodos anteriores do S-1200.
- **Competência das rubricas:** perApur (o anual vale como dezembro); o mês do desligamento (S-2299) ou do término (S-2399); o perRef nos períodos anteriores.
- **Leitura do S-1010:** `verificarAntesDeEnviar` só lê as rubricas da empresa se o lote tem demonstrativo. A tela de eventos da folha passa as que já carregou. Se a leitura falha, sai um alerta dizendo que essas regras não foram conferidas.
- Os modelos de rubrica do Consultor já seguem a lista do 13º (INSS 32, IRRF 32/42, pensão 52).
- **Testes:** 7 casos novos em `regrasOficiais.test.ts`.

## 12/10/2026 — Licença-paternidade da Lei 15.371/2026 (a partir de 01/01/2027)

- **Fontes lidas:**
  - NT S-1.3 nº 07/2026 (revisada, 24/09/2026), no gov.br;
  - leiautes e tabelas S-1.3 consolidados até essa NT.
- **O que as fontes oficiais trazem:**
  - Tabela 18: motivos 46 a 52, desde 01/01/2027;
  - Tabela 03: naturezas 4052, 4053, 9928 e 9929, desde 01/12/2026;
  - S-1010: codIncCP 23 e 24 (pago pelo empregador) e 27 e 28 (pago pelo INSS), aceitos em produção a partir de 14/12/2026;
  - S-5001: tpValor 33 soma as rubricas com codIncCP 23/24, ou com natureza 4052/4053 e codIncCP 9x;
  - S-5011: novo campo vrSalPat.
- **Texto da lei:** a página da lei no Planalto e a da Câmara estão fora da rede desta sessão, e a notícia do INSS pede login. A duração (10, 15 e 20 dias) e quem paga (empresa, com reembolso nos termos do regulamento; doméstico, avulso e empregado de MEI pelo INSS) vieram de resumos publicados. Por isso essas partes viraram **alerta**, nunca bloqueio.
- **Motor mensal:**
  - antes, os motivos 46 a 52 caíam em "afastamento sem salário". A partir de 2027, a licença sairia sem pagamento.
  - Agora 46, 48, 49, 50, 51 e 52 viram **PAT (salário-paternidade)**, com remuneração integral e INSS, FGTS e IRRF;
  - o 47 (Empresa Cidadã) vira **PATPRORR**, paga pela empresa, sem reembolso;
  - o mês comercial é o mesmo da maternidade;
  - **doméstico:** o INSS paga e o empregador recolhe o FGTS dos dias (Decreto 99.684/1990, art. 28, V).
- **Alerta no holerite do PAT:**
  - o reembolso depende do regulamento, então o Consultor ainda não deduz o valor na DCTFWeb;
  - a parte patronal incide até haver definição (o Tema 72 do STF tratou só do salário-maternidade).
- **Afastamento:** alerta quando o motivo 46 passa de 10 dias (início em 2027), 15 (2028) ou 20 (2029, com a condição fiscal da lei). As prorrogações vão nos motivos 47, 49 e 50.
- **Rubricas:**
  - codIncCP 23 a 28 no cadastro e na conferência com o IOB (25 a 28 pagos pelo INSS ficam para conferir);
  - modelo PAT (4052, codIncCP 23) oferecido só quando a validade chega a 12/2026 (`MODELOS_A_PARTIR`);
  - pedido com codIncCP 23, 24, 27 ou 28 enviado antes de 12/2026 dá erro; em 12/2026, alerta (14/12);
  - alerta quando a natureza 4050/4051 ou 4052/4053 não casa com o codIncCP que o S-5001 soma;
  - de/para PAT → natureza 4052.
- **Testes:**
  - `licencaPaternidade.test.ts` com 5 casos;
  - o teste das tabelas oficiais aceita, nas sugestões do de/para, natureza já publicada com início futuro;
  - os modelos oferecidos hoje continuam conferidos pelo XSD atual.
- **Fica para depois:**
  - a leitura do vrSalPat/tpValor 33 na conferência pós-folha (a partir de 01/2027);
  - o XSD de 14/12/2026;
  - a dedução na DCTFWeb, quando sair o regulamento.

## 12/10/2026 — Tailwind 4 e visual no estilo da Apple

- **Pedido do Paulo:** "quero usar algo parecido com o que a Apple usa: letra, tipografia, símbolos, logo".
- **Limite:** a marca da Apple, a fonte SF e os SF Symbols não podem ser distribuídos.
  - A SF aparece porque é a fonte do próprio sistema no Mac, iPhone e iPad (a pilha começa por `-apple-system`).
  - Nos outros sistemas entra a Inter, agora embutida no app (`@fontsource-variable/inter`). O Google Fonts saiu: menos uma dependência externa no carregamento.
- **Tailwind 3 → 4:**
  - pela ferramenta oficial (`@tailwindcss/upgrade`): 136 telas com os nomes novos das classes (`shadow-sm` → `shadow-xs`, `rounded` → `rounded-sm`, `bg-gradient-to-*` → `bg-linear-to-*`, `outline-none` → `outline-hidden`, etc.);
  - configuração em CSS (`styles/index.css`, `@theme`) e `@tailwindcss/postcss`; sai o `autoprefixer`;
  - compatibilidade do v3: cor padrão da borda e a mãozinha nos botões.
  - Alertas de segurança dos pacotes: de 7 para **0**.
- **Tema** (`@theme`; as classes das telas não mudam):
  - os cinzas `slate` viram os neutros da Apple (#f5f5f7, #e8e8ed, #d2d2d7, #6e6e73, #1d1d1f…; o escuro vai a #000);
  - um só azul de destaque, com o `indigo` igual ao `blue`. O 600 é #0071e3, com contraste AA para texto branco (4,6:1);
  - cantos mais arredondados.
- **Logo:**
  - o desenho em SVG feito à mão punha uma letra em cima da outra. O Paulo mandou o **arquivo oficial**, e é ele que aparece agora (`public/logo-sp.png`, só com as margens recortadas e o fundo em branco puro);
  - no modo ícone, o logo fica num quadrado branco de cantos arredondados, como os ícones de app;
  - do mesmo arquivo saem o `favicon.png` e o `apple-touch-icon.png`. O `index.html` apontava para um `/vite.svg` que não existia.
- **Cabeçalho:** barra escura e translúcida com desfoque, como a do site da Apple.
- **Login:** cartão claro (ou escuro, com o tema), campos arredondados com foco azul, botão azul e um só tom de destaque.
- **Ícones:** já eram SVG de traço fino (1,7), no espírito dos SF Symbols; ficaram como estão.
- **Capturas antes/depois:** a tela de login, nos temas claro e escuro e no celular, com build de configuração fictícia (as telas internas exigem login). Mandadas pelo chat.
- **Volta:** reverter o PR.

## 12/10/2026 — NT 07/2026 rev. por data de implantação, licenças na conferência e limpeza

- **Fonte:**
  - NT S-1.3 nº 07/2026 (rev. 24/09/2026);
  - os pacotes XSD da documentação técnica do gov.br: 26/10, 23/11 e 14/12/2026 e 18/01/2027;
  - o Anexo II (regras).
- **XSD por data:**
  - cada pacote fica em `public/esocial-xsd/v_S_01_03_00_AAAA-MM-DD`, só com os arquivos que mudaram;
  - o manifesto `PACOTES_XSD` traz a data da produção e a da produção restrita. A restrita recebe antes: 13/10, 09/11 e 07/12;
  - o pré-voo usa o pacote da data do envio, no ambiente do lote;
  - rodada de conferência: todos os eventos que o Consultor gera passaram no pacote de 18/01/2027.
- **Regras novas no pré-voo** (antes da data, alerta "o eSocial passa a recusar em…"; depois, bloqueio):
  - **26/10:** o S-2200 não leva mais `infoCota` com admissão, transferência ou mudança de CPF a partir de 26/10/2026. O gerador do Consultor já não emitia;
  - **23/11:**
    - S-2200/S-2206: horas semanais dentro do limite do tempo parcial (25/30/26) e 12x36 sem tempo parcial;
    - S-1010: observação obrigatória na rubrica informativa dedutora;
    - S-1000: sem `indOptRegEletron` com validade desde 2026-02;
  - **CPF de dependente** com dígito inválido: bloqueio sempre (S-1210, S-2200, S-2205, S-2300, S-2400, S-2405, S-2501);
  - **REGRA_RUBRICA_COMPATIVEL_CATEGORIA:** itens 1a, 1b (desde 23/11), 2a a 2c, 2e, 4, 5 e 6. Ficam de fora o 1c e o 2d (precisam da classificação tributária do S-1000) e o 3 (dirigente sindical).
- **Conferência motor × eSocial:**
  - salário-maternidade (natureza 4050 e S-5001 tpValor 32) e salário-paternidade (natureza 4052 e tpValor 33);
  - os itens só aparecem quando há valor.
- **Limpeza:** sai o `lucide-react`, que não era usado.
## 12/10/2026 — Logo oficial nos PDFs e revisão visual das telas internas

- **PDFs:**
  - o cabeçalho comum (`layoutPdf.ts`, usado por holerites, recibos, resumo e a Central de relatórios) desenhava um "SP" num quadrado azul. Agora usa o logo oficial;
  - o logo vai embutido em `logoPdf.ts` (JPEG de 192 px gerado de `public/logo-sp.png`), para o PDF sair igual sem rede e nos testes;
  - se o PDF recusar a imagem, volta o monograma em texto.
- **Revisão visual depois do Tailwind 4:**
  - página de conferência montada fora do repositório, com o cabeçalho real e blocos típicos das telas (cartões, tabela, alerta, campos), nos temas claro e escuro e no celular;
  - varredura das classes do v3 que o v4 não aceita: nenhuma sobrou;
  - cores fixas em hex: só em 3 componentes antigos do fiscal.
  - **Encontrado e corrigido:** o menu do cabeçalho passava da largura em 1280 px (o "Configurações" era cortado e havia rolagem horizontal). Agora:
    - abaixo de 1536 px, menos espaçamento e sem a setinha;
    - abaixo de 1280 px, sem o quadradinho colorido do grupo;
    - abaixo de 1024 px, o menu rola na horizontal e o painel abre embaixo, como no celular.
  - Conferido sem rolagem horizontal em 800, 1024, 1180, 1280 e 1440 px.

## 12/10/2026 — Pré-voo: estabelecimento e lotação vigentes (REGRA_DEMONSTRATIVO, item 2.3)

- **Regra oficial:** no S-1200, S-2299 e S-2399, o estabelecimento (S-1005) e a lotação (S-1020) de cada `ideEstabLot` precisam estar vigentes:
  - no período de apuração (no S-2299, o mês do desligamento; no S-2399, o do término);
  - ou no `perRef`, nos períodos anteriores.
- **O que o Consultor sabe:** só a vigência das lotações do cadastro de obras e lotações (início e fim, mais os recibos do S-1020/S-1005 aceitos). A lotação padrão vinda do IOB está só no eSocial.
- **`conferirLotacoes` (regrasOficiais.ts):**
  - lotação do cadastro com S-1020 aceito e fora da validade: **bloqueio**;
  - sem recibo do S-1020, ou obra própria (CNO) sem o S-1005 aceito: **alerta**;
  - empresa que usa o cadastro e um código fora dele: **um alerta por lote**;
  - empresa sem lotação cadastrada: nada a conferir (ausente não é conferido).
- **Leitura:** `verificarAntesDeEnviar` lê o cadastro de lotações quando o lote tem demonstrativo. A tela de eventos da folha passa as lotações que já carregou. Se a leitura falha, sai um alerta.
- **Testes:** 3 casos novos em `regrasOficiais.test.ts`.

## 12/10/2026 — PR #238 revertido

- **Paulo:** "você não pode alterar os dados já inseridos! Esse sistema é verídico" e "sim, deve reverter".
- **Feito:** os arquivos de teste e as fixtures voltaram a ser exatamente como estavam antes do #238. O #238 não tinha mexido em dados do sistema (Firestore, eSocial ou backups reais), só em cópias usadas pelos testes.
- **Regra:** nada que envolva dados reais, nem em arquivos de teste, sem confirmação explícita do Paulo.

## 12/10/2026 — Ícones do menu de volta, versão e data no cabeçalho, novidades a qualquer momento

- **Paulo (print do iPad):** "Aonde você colocou os ícones que estavam ao lado do nome dos botões? Os ícones são fundamentais para a memorização dos colaboradores. Também não está disponível a versão do sistema e data. Você também retirou o popup de informações das atualizações publicadas."
- **Causa:** no #236 o ícone de cada grupo do menu passou a aparecer só em tela de 1280px ou mais, para o menu caber. No iPad ele sumia.
- **Agora:**
  - o ícone aparece em qualquer largura. O espaçamento ficou mais justo abaixo de 1280px, e o menu inteiro cabe a partir de cerca de 1000px. Se não couber, o menu rola na própria linha, sem esconder ícones;
  - abaixo de "SP Assessoria" aparece a versão e a data e hora da publicação (horário de Brasília), por exemplo "v2.4.0 · 12/10/2026 18:05". Clicar abre o popup "Novidades do Consultor DP" com as últimas atualizações publicadas. Se houver versão nova esperando, abre o aviso dela;
  - o login mostra versão, release e data;
  - o popup automático não tinha sido retirado: ele aparece uma vez por navegador quando entra uma versão nova (conferido no build, com a lista do que mudou). O botão da versão é para revê-lo quando quiser.
- **Testes:** 4 casos novos em `updateAviso.test.tsx`. Conferido no navegador em 390, 820, 1024, 1180, 1280 e 1440px: 9 ícones em todas as larguras, sem rolagem da página.

## 13/10/2026 — Revisão visual das telas internas

- **Paulo:** "revise as telas".
- **Como:** o app rodou localmente contra os emuladores do Firebase (projeto `demo-dp`) com dados fictícios, sem tocar o banco real nem serviços externos. Foram capturadas as 57 telas do menu, mais telas de apoio e popups, em 1180 (iPad), tema escuro e 390 (celular). Medidos contraste, rolagem, cortes, paleta e erros. Nenhuma tela quebrou, nenhuma teve rolagem lateral, não faltou ícone e não sobrou cor antiga.
- **Corrigido:**
  - **Menu do cabeçalho:** no iPad os últimos itens de Cadastros, Folha do mês e eSocial ficavam fora da tela. O painel agora tem a altura da janela e rola sozinho.
  - **Selo da competência ("Aberto"):** estava ilegível no cabeçalho escuro (1,16:1) e ganhou cores para fundo escuro (6,1:1).
  - **Celular, menus "Conferir" e "Pagamento" do Cálculo:** abriam cortados à esquerda. Agora abrem como folha no pé da tela.
  - **MiA:** o botão ficava por cima dos popups e cobria o fim das tabelas. Passou para baixo do fundo dos popups, e o conteúdo ganhou espaço no fim.
  - **Cálculo de Adiantamentos:** o popup fecha com Esc.
  - **Contraste:**
    - cinza claro em fundo branco: Serviços externos, IOB SAGE, Novidades, Apontamento, Empresas e Usuários;
    - texto escuro no tema escuro: Prazos e Fim de mês;
    - verde e âmbar dos cartões;
    - botões coloridos de Usuários e o botão do template do Apontamento: mesma cor, tom mais escuro;
    - textos pequenos do cabeçalho.
  - **Popup de pendências:** acentos corrigidos.
  - **Cabeçalho:** CNPJ com máscara.
  - **Boas-vindas:** primeiro nome com inicial maiúscula.
- **Mantido de propósito:**
  - o roxo da MiA;
  - as cores por papel em Usuários (memorização);
  - os emojis dos cartões do eSocial.

## 13/10/2026 — S-1299 de fora do Consultor no semáforo da DCTFWeb e o motivo real da baixa do FGTS

- **Paulo:** "pode seguir com os 3 itens". O servidor (CFI e plataforma, `dp-fechamento-esocial.js`) acende o selo "👥 DP/Folha — eSocial" da DCTFWeb lendo `esocial_envios` com o token do usuário. Faltava o fechamento transmitido pelo IOB/Folhamatic.
- **Fechamento de fora (`services/esocial/fechamentoGoverno.ts`):**
  - a conciliação da Saúde do eSocial (`conciliarComEsocial`, com o usuário) já achava no governo os S-1299 e S-1298 da competência; agora grava os que faltam em `esocial_envios/governo-<nrRecibo>`;
  - o documento segue a régua do servidor: `tpAmb` 1, `cnpj` da empresa, `situacao` 'processado', `protocolo` '', `eventos` [{ tipo, perApur, cdResposta (o do recibo ou 201), nrRecibo }], `enviadoEm` = recepção no eSocial;
  - marcado como do governo: `origem` 'governo', `importadoEm`, `importadoPor`, `importadoPorEmail`, `dataFonte`;
  - a data vem do recibo baixado pelo Id (uma chamada de download, só quando há o que importar). Se o download falhar, usa a data de geração do Id do evento (`dataFonte` 'id-do-evento');
  - não grava sem recibo válido (`1.d.19 dígitos`), fora da produção, com recibo recusado ou de outro ambiente. Não duplica: pula recibo já registrado (pelo Consultor ou importado) e Id que o Consultor transmitiu;
  - o S-1298 também é gravado, e um S-1298 posterior derruba o selo, como no servidor.
- **Leitores:** a fila (alertas, resumo, próxima consulta, liberar reenvio) e a consulta automática ignoram `origem` 'governo'. A conciliação o mantém como "de outro sistema" e não o acusa de sumir do governo. O pré-voo (competência fechada), o estorno e a anomalia "sem S-1299" passam a contar o fechamento importado.
- **Tela:** Saúde do eSocial mostra "Fechamento (S-1299) de MM/AAAA importado do eSocial: transmitido fora do Consultor", com recibo, data e quem importou. A lista de lotes mostra o selo "Importado do eSocial", e a Transmissão também identifica o registro.
- **Regra (`firestore.rules`):** nova criação em `esocial_envios` para `origem` 'governo':
  - empresa da carteira, id `governo-<nrRecibo>`, só S-1299/S-1298, produção, 'processado', 201/202, sem protocolo;
  - `importadoPor` do próprio usuário e `importadoEm` do servidor;
  - não se altera nem se apaga. O lote do Consultor não pode levar `origem`;
  - testes em `testes-regras/envios.test.mjs`.
- **Prazos, baixa do FGTS (`valorPagoNoFgts`):** passa a mostrar o motivo que o servidor devolve (`erro`). Com `situacao` 'nao_oferecido_serpro', avisa que a baixa do FGTS é feita com o comprovante da guia, informado à mão, sem preencher nada como consultado.
- **Testes:** `fechamentoGoverno.test.ts` (novo), casos novos em `saudeEsocialTela.test.tsx`, `calendarioEmpresa.test.tsx` e `pagamentoGuias.test.ts`.

## 13/10/2026 — Vigia importa sozinho o S-1299/S-1298 de fora e a anomalia de fechamento vê a reabertura

- **Paulo aprovou os 3 pontos do PR #245.**
- **1. Data quando o download falha:** fica como está. O registro usa a data de geração do Id do evento, com `dataFonte` 'id-do-evento'.
- **2. Importação automática (`services/esocial/vigiaFechamento.ts`):**
  - **Onde roda:** o vigia da Saúde do eSocial (`useVigiaEsocial`), no navegador de cada colaborador logado, na empresa ativa, a cada 20 s com a aba visível.
  - **O que faz:** importa sozinho os fechamentos do governo da competência aberta e da anterior.
  - **Marca no Firestore** para não gerar tempestade de consultas: `esocial_vigia_fechamento/{empresaId}_{AAAA-MM}` { dia (Brasília), estado, tentativas, tentativaEm, por }.
    - A marca é tomada numa transação antes de qualquer consulta: com duas abas ou dois usuários, só um consulta.
    - 'feito': ninguém consulta de novo no dia.
    - 'falhou' (identificadores, download ou gravação): nova tentativa depois de 1 h, até 3 por dia. A falha não marca como feito.
    - 'rodando' há mais de 10 min (aba fechada no meio): outra aba pode assumir.
    - Cada aba relê a marca no máximo a cada 15 min.
  - **Custo por competência:** 2 consultas de identificadores (S-1299 e S-1298, `tpAmb` 1). O download só acontece quando há fechamento novo, com a mesma idempotência do clique.
  - **Cota:** quando o CFI informa que o empregador já tem 10 pedidos de download no dia (`RESERVA_PEDIDOS_DIA`), o automático para sem gravar ('cota') e só volta no dia seguinte.
  - **Só produção:** a homologação não importa nem consulta.
  - **O clique "Conciliar com o eSocial"** continua igual.
  - **Regra:** `esocial_vigia_fechamento`:
    - get para a empresa da carteira, mesmo antes de o documento existir;
    - tomar a marca só em dia novo, depois de falha ou com 'rodando' abandonado, com a hora do servidor e as tentativas +1;
    - concluir só quem tomou, sem mexer no dia, nas tentativas nem na hora;
    - sem apagar;
    - testes em `testes-regras/vigiaFechamento.test.mjs`, inclusive duas transações ao mesmo tempo.
- **3. Anomalia de fechamento:** `estadoDoFechamento` (`preVoo.ts`) usa a régua do servidor.
  - Um S-1298 depois do último S-1299 aceito, aceito ou ainda sem resposta (fora de lote recusado), dá "Fechamento de MM/AAAA reaberto (S-1298): falta novo S-1299": atenção antes do prazo, crítico depois.
  - Um S-1299 depois do S-1298 volta a fechar.
  - Sem S-1299 aceito, a anomalia continua "sem S-1299 aceito" depois do prazo.
- **Testes:**
  - `vigiaFechamento.test.ts` (novo): duas abas/dois usuários, homologação, falha de download e de consulta, cota, aba que fechou no meio;
  - caso novo em `anomalias.test.ts` com os três estados e o importado do governo.

## 13/10/2026 — Governo: a empresa do DP vai junto nas consultas por CNPJ (trava da carteira na plataforma)

- **Por quê:** preparar a troca do serviço "governo" do CFI para a plataforma comum (depois do dia 15). Na plataforma, as seis consultas por CNPJ (`/fgts/recolhimento`, `/fgts/crf`, `/esocial/status`, `/dctfweb/status`, `/dctfweb/debitos`, `/empresa-completo`) passam a conferir a carteira, como as rotas de DCTFWeb do DP e de pagamentos já conferiam. Para isso o DP precisa mandar o `empresaId`.
- **O que mudou no DP (`services/serpro/serproIntegrationService.ts`):** as seis funções recebem o `empresaId` como primeiro parâmetro e o mandam no corpo, junto com o `cnpj`. O CFI ignora o campo (conferido em `sefaz-backend/dp-integration-routes.js`: só lê `cnpj` e `competencia` nessas rotas), então nada muda enquanto o governo for o CFI.
- **Quem chama:** DCTFWeb da folha (empresa ativa), Consulta de FGTS (empresa ativa), eSocial › FGTS Digital (empresa escolhida na consulta), Prazos (empresa do calendário) e a conferência pós-folha.
- **Conferência pós-folha:** o CNPJ vem dos totalizadores (raiz) e do cadastro. A empresa do DP é a do cadastro visível ao usuário com o mesmo CNPJ, senão a matriz da mesma raiz, senão a empresa ativa da mesma raiz (`empresaIdParaSerpro`). Sem nenhuma, o botão "Consultar SERPRO" fica desabilitado com o motivo (empresa fora da carteira). O cliente da conferência é preso a uma empresa (`clienteDaEmpresa`).
- **Plataforma:** PR `governo-carteira` no sp-plataforma exige o `empresaId` nessas seis rotas (400 sem ele, 403 fora da carteira ou CNPJ de outra raiz). **Ordem de merge:** este PR do DP primeiro (ou junto) e republicado antes de ligar `VITE_SERVICO_GOVERNO_URL`.
- **Testes:** `services/serpro/__tests__/empresaNasConsultas.test.ts` (novo: corpo de cada uma das seis com o `empresaId`); casos novos em `conferenciaPosFolha.test.ts`, `dctfwebTela.test.tsx`, `painelFgts.test.tsx` e `calendarioEmpresa.test.tsx`.

## 13/10/2026 — Comparador CFI × plataforma do governo (Configurações › Serviços externos)

- **Por quê:** conferir a troca do serviço `governo` do CFI para a plataforma comum (depois do dia 15) com dados reais, antes e depois de ligar `VITE_SERVICO_GOVERNO_URL` (critério do roteiro P4 no sp-plataforma: débitos e situação dos DARF "batem com o CFI").
- **Onde:** seção "Comparar CFI × plataforma (governo)" em Configurações › Serviços externos (`components/plataforma/ComparadorGoverno.tsx`, lógica em `services/plataforma/comparadorGoverno.ts`).
- **Quem vê:** só admin e gestor (o master entra como gestor). O painel recebe o papel do `MainTabs`.
- **Endereço da plataforma:** o do build (`VITE_SERVICO_GOVERNO_URL`, ou `VITE_PLATAFORMA_URL`). Sem endereço no build, dá para colar um só para a comparação: é validado por `enderecoValido`, não pode ser o próprio CFI e não é gravado. Sem endereço válido, o botão fica desabilitado.
- **O que compara:** para a empresa ativa e a competência escolhida, chama as mesmas rotas de leitura no CFI (`HOST_CFI_INTEGRACAO`) e na plataforma, com o mesmo token. As rotas são `dctfweb/status`, `dctfweb/debitos` e `pagamentos/situacao-darf`, sempre com o `empresaId`.
- **O que mostra:** lado a lado, o HTTP, o `ok` e as diferenças nos campos de negócio. O diff ignora carimbos de hora (`consultadoEm`, `conferidoEm`…), ids de requisição (`requestId`, `traceId`…), diagnóstico (`diagnostico`, `ms`, `debug`…) e chaves com "_".
- **Fora:**
  - `pagamentos/consultar`: pede o número do documento ou o intervalo de arrecadação, que a tela não conhece, e grava auditoria nos dois servidores;
  - download do eSocial: gasta a cota diária;
  - qualquer envio, transmissão, DARF ou comprovante: `compararRota` recusa rota fora da lista fechada.
- **Custo:** aviso antes de rodar. Cada consulta ao SERPRO é cobrada, 2× por item: 4 consultas por comparação (situação e débitos da DCTFWeb). A situação dos DARF não vai ao SERPRO. Para rodar, é preciso marcar "Entendi o custo"; a marca vale para uma rodada.
- **Nada é gravado** (nem no Firestore nem no navegador).
- **Testes:** `services/plataforma/__tests__/comparadorGoverno.test.tsx`:
  - o diff ignora os campos voláteis e aponta as diferenças de negócio;
  - a lista é fechada e rota de escrita é recusada sem chamar ninguém;
  - o endereço do build vence, o colado só pode ser https e nunca o CFI;
  - o comparador fica escondido para colaborador e pendente e aparece desabilitado sem endereço;
  - a rodada completa usa as três rotas × dois hosts com o mesmo token e não chama nenhuma rota de escrita nem grava no `localStorage`.


## 13/10/2026 — Governo pela plataforma só no navegador do gestor (teste antes da troca para todos)

- **Por quê:** o Paulo testar o serviço `governo` pela plataforma comum no navegador dele, com dados reais, antes da troca para todos (que continua sendo `VITE_SERVICO_GOVERNO_URL` no build). A equipe segue no CFI.
- **Onde:** `services/plataforma/servicos.ts` (regra), `components/plataforma/TesteGovernoNavegador.tsx` (bloco e faixa), Configurações › Serviços externos e o topo do app (`MainTabs`).
- **Guardado:** `localStorage['dp.servicos.governo.testeNavegador']` = { url, uid, email, ligadoEm }, sempre com try/catch. Armazenamento bloqueado ou conteúdo adulterado contam como desligado.
- **Quando vale:** o `MainTabs` informa a sessão (`definirSessaoDosServicos`: uid, e-mail e papel; o master entra como gestor). O teste só se aplica com usuário gestor/admin e o mesmo uid e e-mail de quem ligou. Outro usuário no mesmo navegador, colaborador ou ninguém logado: CFI.
- **Precedência:** build (`VITE_SERVICO_GOVERNO_URL` / `VITE_PLATAFORMA_URL`) > teste no navegador > CFI. `configuracaoDoServico` continua só do build (a tabela e o comparador não mudam).
- **Endereço:** `enderecoValido` e nunca o CFI (os dois hosts e qualquer host com `consultor-fiscal-inteligente`).
- **O que vai à plataforma no teste (lista fechada, `ROTAS_TESTE_PLATAFORMA`):**
  - envio de lote do eSocial só com `tpAmb` 2 (produção restrita); o `tpAmb` vem no corpo do `enviarLote` (`envioSeguro.ts` → `transmissao.ts` → `callFiscal` → `postarNoServico`, que agora passa o corpo a `urlDoServico`);
  - consulta do lote, identificadores e download do eSocial, situação do eSocial, FGTS (recolhimento e CRF), DCTFWeb situação e débitos, empresa-completo, pagamentos (consultar, situação dos DARF, comprovante).
- **O que fica no CFI:** envio de lote em produção (`tpAmb` 1, ausente ou em texto), `dctfweb/transmitir`, `dctfweb/darf`, `dctfweb/insumos` (a trava da transmissão) e qualquer rota do governo fora da lista; cadastro, cofre, e-mail, WhatsApp e IA.
- **Tela:** bloco "Testar o governo pela plataforma neste navegador" (só gestor/admin), com o campo pré-preenchido pelo endereço colado no comparador, Ligar/Desligar e as listas do que vai e do que não vai. Com o teste valendo, faixa azul no topo "Governo pela plataforma neste navegador — teste" com Desligar; a linha Governo da tabela ganha a nota do teste. Com o governo já no build, o bloco só avisa que o teste não se aplica.
- **Testes:** `services/plataforma/__tests__/testeGovernoNavegador.test.tsx` (precedência, colaborador e outro usuário não aplicam, `tpAmb` 1 no CFI e 2 na plataforma, transmitir/DARF/insumos no CFI, leituras na plataforma, desligar volta tudo, endereço inválido/CFI/adulterado recusado, armazenamento bloqueado, tela e faixa).

## 13/10/2026 — Serviços externos: "Testar" dava "Load failed" no Governo com o CFI no ar

- **Sintoma (print do Paulo, iPad):** a linha Governo, atendida pelo host de integração do CFI, mostrava "sem resposta: Load failed", enquanto o comparador recebia HTTP 200 do mesmo host.
- **Causa:** o `testarAlcance` fazia um GET opaco (`no-cors`). O CFI usa o helmet, que manda `Cross-Origin-Resource-Policy: same-origin`, e com esse cabeçalho o navegador derruba a resposta opaca como erro de rede. O servidor estava no ar; a plataforma passava porque não manda esse cabeçalho.
- **Correção:** primeiro um GET com CORS (o CFI e a plataforma liberam o DP), e o GET opaco fica de reserva para endereço sem CORS. Qualquer resposta HTTP conta como alcançado, sem token e sem efeito. O tempo-limite continua 10 s no total.
- **Testes:** `services/plataforma/__tests__/servicos.test.ts` (cors primeiro, reserva no-cors, falha nas duas).

## 14/10/2026 — "Run workflow" do deploy agora publica o site

- **Sintoma:** o Paulo criou `VITE_SERVICO_GOVERNO_URL` e rodou `gh workflow run deploy.yml` (run 38544241779). O build e as regras rodaram, mas o job `deploy` foi pulado: o `if` dele aceitava só `push`.
- **Correção:** o `deploy` usa a mesma condição do `publicar-regras` (`github.event_name != 'pull_request'` na main). Uma variável `VITE_*` nova, ou apagada para voltar ao CFI, chega ao site pelo "Run workflow", sem commit.
- **Decisão do Paulo (14/10):** a troca do governo para a plataforma não depende de data. Os apps são autônomos e não podem formar uma pirâmide em que a queda de um trava os outros.

## 14/10/2026 — Retomada e Serviços externos com a plataforma própria do DP

- **`docs/retomada.md`:** a seção de 14/10 registra a regra de autonomia do Paulo, o #251, a plataforma por app (sp-plataforma #11 e #12) e o DP com as cinco `VITE_SERVICO_*_URL` no `sp-plataforma-dp`. Explica também como voltar e a P5 no CFI depois das primeiras transmissões reais.
- **Configurações › Serviços externos:** o texto do topo dizia que os serviços "moram no CFI". Agora explica que "Endereço próprio" é a plataforma só do DP. O passo 3 de "Como trocar o endereço" ensina o "Run workflow" (#252).

## 14/10/2026 — Retorno da colaboradora: parcela a deduzir do INSS e a MiA sobre plano de saúde

- **INSS em Cadastros › Tabelas legais:** faltava a coluna "Parcela a deduzir" que a tabela publicada mostra (0,00 · 24,32 · 111,40 · 198,49 em 2026).
  - `deducoesInss` (`tabelasLegais.ts`) calcula a parcela pelas próprias faixas: a 1ª é zero; cada faixa seguinte soma o limite da anterior × a diferença das alíquotas. A soma usa a fração do centavo e só a exibição arredonda.
  - A parcela não se digita nem se grava: nenhuma tabela já gravada muda.
  - O editor mostra a coluna (só leitura) e a lista mostra as parcelas ao lado da contribuição no teto.
  - Teste: as quatro parcelas de 2026 e base × alíquota − parcela = progressivo, até o teto (R$ 988,09).
- **MiA respondeu que não havia onde cadastrar assistência médica/odonto. Estava errado**, porque o `GUIA_DO_APP` ainda era o mapa das abas antigas, escrito à mão.
  - O mapa agora sai do `MENU` (todo item do menu, com grupo e descrição) mais as rotinas internas: abas da ficha, plano de saúde passo a passo (Benefícios no Cálculo mensal, adesão na aba Benefícios da ficha, coparticipação em Administração de benefícios, S-1210 `planSaude` pelo Consultor), Cálculo, Tabelas legais, pensão e férias.
  - O mapa também manda a MiA não afirmar que falta uma função quando não a encontra no mapa.
  - Testes em `mia.test.tsx`.

## 14/10/2026 — Rescisão como no SAGE: art. 480, eventos digitados, insuficiência de saldo e avisos

Pedido da colaboradora, pelo Paulo, com as telas do SAGE (Rescisão Contratual e menu Contratos) e um caso real comparado (término antecipado da experiência a pedido do empregado, salário de R$ 2.800,00, desligamento em 14/10/2026).
- **Art. 480 (`motorRescisao.ts`):**
  - nova opção `indenizacao480` no motivo 04: desconto ART480 de metade da remuneração dos dias até o fim do contrato da ficha (o teto do § 1º, igual ao art. 479);
  - natureza 6904 ("Multa prevista no art. 480 da CLT"), sem incidências;
  - é opção, como o checkbox do SAGE: desmarcada, o empregador abre mão;
  - no caso do SAGE dá 16,5 dias = R$ 1.540,00, o mesmo valor.
- **Insuficiência de saldo:** com os descontos acima dos proventos, a verba INSUFSALDO (natureza 2930) completa os proventos e o líquido fica zero, como o 04923 do SAGE. Um aviso diz que o empregado continua devendo a diferença e lembra o limite do art. 477, § 5º.
- **Eventos digitados na rescisão (`CalculoPanel`):**
  - o holerite da rescisão ganhou o painel "Eventos da rescisão": Lançar evento, lançamentos avulsos, VT, adiantamento etc.;
  - os eventos ficam no movimento do mês do desligamento e entram no cálculo na hora, mesmo antes de salvar;
  - o botão "Salvar movimento" aparece também na rescisão.
- **eSocial:** rubricas-modelo RESC:ART480 (6904, desconto) e RESC:INSUFSALDO (2930, provento) em `tabelaRubricas.ts`, com as sugestões do de/para do S-2299 e da folha.
- **Modelos (Relatórios › Contratos e modelos):** aviso prévio indenizado, aviso de término do contrato de experiência, término antecipado pelo empregador (art. 479) e pelo empregado (art. 480, com a ciência do desconto), e comunicação de justa causa (art. 482, motivo digitado). Os da lista do SAGE que já existiam (advertência, suspensão, aviso prévio do empregador, pedido de demissão) ficaram como estavam.
- **MiA:** o mapa ganhou a rescisão (eventos, art. 480, insuficiência e onde estão os avisos).
- **Testes:** `motorRescisao.test.ts` com o caso do SAGE (art. 480, saldo, 13º e férias com os valores do SAGE; insuficiência; sem a opção) e `modelos.test.ts` (os cinco modelos novos).

## 14/10/2026 — INSS com 8,45% e o triênio fora da base (caso do Alexandre, 09/2026)

- **Pedido do Paulo:** o Consultor mostrava INSS de 8,45%, uma alíquota que não está na tabela, e R$ 265,21. O IOB mostrava 12,00 e R$ 275,95.
- **Achado 1 (referência):** o "8,45%" era a alíquota **efetiva** (INSS ÷ base: 265,21 ÷ 3.138,45). O cálculo faixa a faixa estava certo. Agora a referência do INSS (mensal e 13º) é a **alíquota da faixa** em que a base cai, como o IOB. A memória mostra também a conta pela parcela a deduzir (`faixaInss` em `tributos.ts`, sobre `deducoesInss`): ex. "R$ 3.227,95 × 12% − R$ 111,40 (parcela a deduzir)".
- **Achado 2 (a diferença de valor):** o triênio de R$ 89,50 foi lançado pelo evento **1108** do catálogo de eventos. Esse catálogo (`data/eventos-iob-sage.json`) veio do PDF de outro cliente do IOB, e lá o 1108 TRIENIO não tem nenhuma incidência. A base do INSS ficou R$ 3.138,45 em vez de R$ 3.227,95. Com o triênio na base, o motor dá R$ 275,95, igual ao IOB (teste).
- **Correção do Lançar evento:**
  - as incidências vêm da **rubrica S-1010 da empresa** ligada ao evento (`incidenciasDaRubrica`: CP 11–28 → INSS, FGTS 11/12/21 → FGTS, IRRF 11–15 → IRRF), que é o que a empresa declara ao eSocial; o catálogo só vale sem rubrica;
  - provento lançado sem nenhuma incidência sai com **ATENÇÃO** em destaque, pedindo para marcar INSS, FGTS e IRRF quando for salário.
- **Testes:** `lancarEvento.test.ts` com o caso real (sem rubrica, alerta; com a rubrica, base R$ 3.227,95, INSS R$ 275,95 e referência 12%; sem o triênio, R$ 265,21 também com 12%; rubrica de outra vigência ou de outro evento não vale).

## 14/10/2026 — Lançamento automático como os Eventos Automáticos do SAGE (Referência, Sal, Valor)

- **Pedido do Paulo**, com a tela do SAGE: o triênio 1015 do Alexandre, referência 1,0000, valor R$ 626,50, outubro a dezembro. A aba "Lanç. automático" precisa ter referência, salário (Sal) e valor. "O campo sal é amarrado ao evento que calcula referência sobre o salário."
- **`LancamentoAutomatico`:** campos novos `descricao`, `salario` (Sal) e `valor`.
  - **Valor** preenchido: entra o valor, como está (`lancarPorValor`).
  - **Sal** preenchido: é o salário-base da rotina ou da fórmula, no lugar do salário da ficha, com as mesmas horas do mês.
  - **Nenhum dos dois:** a rotina do evento com a referência, como antes.
- **Incidências:** vêm da rubrica S-1010 da empresa (`incidenciasDaRubrica`, que agora também devolve o tipo e a descrição).
- **Evento fora do catálogo**, como o 1015 da SP: entra só por valor, com o tipo da rubrica S-1010. Sem rubrica, dá erro claro.
- **Ficha:** Código, Descrição (vem do catálogo ao digitar o código; fora dele, digitada), Referência, Sal (R$) e Valor (R$), além do período, da observação e dos meses.
- **Backup do IOB (`lancauto`):** a referência e o valor vão em campos próprios. Só vale para importações novas: as fichas já gravadas não mudam e continuam funcionando, porque o valor delas está na referência.
- **Testes:**
  - `lancamentosAutomaticos.test.tsx`: triênio por valor com as incidências da rubrica, fora do catálogo sem rubrica, valor sobre a rotina, Sal como salário-base e validação;
  - o teste da carga do `lancauto` foi atualizado.

## 14/10/2026 — Lançamento automático: "Lança na Rescisão" e "Cópia para ano seguinte" (SAGE)

- **Pedido do Paulo:** "pode fazer, lança na rescisão e no ano seguinte".
- **Lança na rescisão** (`naRescisao`: proporcional ou integral; vazio = não entra):
  - no mês do desligamento só entram os marcados;
  - o proporcional é o valor × dias trabalhados no mês ÷ 30 (`diasTrabalhadosNoMes`, contando da admissão se for no mesmo mês). Vale para o valor fixo e para o avulso da rotina;
  - o desligamento vem da ficha ou da rescisão simulada na tela;
  - o aviso informa quantos ficaram fora.
- **Cópia para ano seguinte** (`copiaAnoSeguinte`): "Não" faz valer só no ano do "A partir de", que passa a ser obrigatório nesse caso. "Sim", o padrão, segue nos anos seguintes nos mesmos meses, como antes.
- **Telas:**
  - na ficha (aba Lanç. automático), os campos "Lança na rescisão" (Não, Proporcional, Integral) e "Cópia para ano seguinte" (Sim, Não);
  - no Cálculo › Rescisão, o botão "Lançamentos automáticos" aplica os da rescisão no movimento do mês do desligamento.
- **Mudança de comportamento:** antes, os automáticos entravam inteiros no mês do desligamento. Agora só entram os marcados, como no SAGE. Nenhuma ficha gravada foi alterada.
- **Testes:** `lancamentosAutomaticos.test.tsx` (proporcional 14/30, integral, os sem marca fora, simulação, dias com admissão no mês, sem cópia para o ano seguinte e validação).

## 14/10/2026 — Lançamento automático: Sal = evento-base, referência em % (pensão do Alexandre)

- **Pedido do Paulo**, com a tela do SAGE: pensão 05810 com referência 33,0000 e Sal 00001. "A referência é a porcentagem, que vai fazer o cálculo sobre o salário, evento 00001."
- **Como fica:** o "Sal" com só dígitos (até 5, ex.: 00001) é o **código do evento-base**, e a referência é o **percentual** sobre o valor dele no mês (`salEhEvento`, `valorDoEventoBase`).
  - O evento de salário (rotina 000, ou 0001) vale o salário do mês da ficha. Outro evento vale o lançamento dele no movimento.
  - O resultado vai para o campo do evento: a pensão vai no campo "Pensão alimentícia", que deduz no IRRF. Os demais vão como avulso.
  - O "Valor" não entra nessa conta.
  - O "Sal" com vírgula continua sendo o salário-base em R$ da rotina.
- **Validação:** com o Sal como evento, a referência tem de ser um percentual de 0 a 100.
- **Atenção registrada para o Paulo:** 33% do salário (R$ 3.138,45) dá R$ 1.035,69. O holerite do IOB de 09/2026 descontou R$ 974,16, que é 33% de R$ 2.952,00 = bruto R$ 3.227,95 − INSS R$ 275,95, porque o SAGE usa a fórmula da pensão. A base certa é a da decisão judicial.
- **Testes:** `lancamentosAutomaticos.test.tsx` (5810 a 33% sobre o 00001 no campo da pensão; base em lançamento do mês; referência fora de 0 a 100; evento-base ausente).

## 14/10/2026 — Pensão alimentícia em %: remuneração menos INSS (a fórmula do SAGE)

- **Decisão do Paulo:** a base certa é a do IOB de 09/2026, R$ 974,16 = 33% de R$ 2.952,00, que é o bruto (salário + triênio, R$ 3.227,95) menos o INSS (R$ 275,95). Não é 33% do salário.
- **Motor (`motorMensal.ts`, passo 8):** `Movimento.pensaoPercentual` faz a pensão = % × (base do INSS do mês − INSS descontado), calculada no fechamento do holerite.
  - A referência mostra o percentual e a memória mostra a conta.
  - O valor fixo (`pensaoAlimenticia`) vale sobre o percentual, com aviso.
  - A pensão continua deduzindo no IRRF e indo no S-1210.
- **Lançamento automático:** o evento de pensão com Sal = evento-base (ex.: 5810, referência 33, Sal 00001, a linha do SAGE) põe o percentual no movimento e tira o valor fixo. O motor faz a conta.
- **Movimento do mês:** campo novo "Pensão alimentícia (%)" ao lado do valor em R$. A validação aceita até 100.
- **Ainda não coberto:** a pensão sobre o 13º, as férias e a rescisão segue pelo valor (`pensao13` e o movimento). O percentual vale no holerite mensal, inclusive no saldo de salário da rescisão.
- **Testes:**
  - `lancarEvento.test.ts`: caso do Alexandre, R$ 974,16 com referência 33% e a memória; o valor fixo vale sobre o percentual;
  - `lancamentosAutomaticos.test.tsx`: o percentual vai ao movimento e o valor fixo sai.

## 14/10/2026 — Pensão em % no 13º, férias e rescisão; relação de depósito bancário (SAGE)

- **Pedido do Paulo:** "pensão em % também no 13º, nas férias e na rescisão, devemos criar a opção com relação ao Adiantamento da Folha conforme IOB / SAGE", com a tela "Valores de Salários para Bancos" e a "Relação de Depósito Bancário — Adiantamento — 10/2026" do SAGE.
- **Pensão em %:**
  - `percentualDaPensao(movimentos, até)` pega o `pensaoPercentual` do mês ou do último mês que informou a pensão (até 12 meses). Um mês com valor fixo encerra a busca;
  - **13º:** a 1ª parcela recebe % da parcela. Na 2ª, % de (integral − INSS do 13º) menos a pensão da 1ª, e as duas deduzem no IRRF do 13º;
  - **férias:** % de (férias + 1/3 − INSS das férias), quando não há pensão informada no recibo nem no gozo;
  - **rescisão:** o saldo segue pelo mês e o 13º rescisório recebe % de (proporcional + indenizado − INSS). Um aviso pede para lançar nos eventos a pensão sobre férias indenizadas e aviso indenizado se a decisão alcançar essas verbas;
  - o valor em R$ informado continua valendo sobre o percentual.
- **Relação de depósito bancário** (`relacaoDeposito.ts`):
  - sai dos mesmos favorecidos do arquivo bancário, então o tipo de movimento é o da folha aberta: mensal, adiantamento, 13º, férias ou rescisão;
  - colunas: Banco, Agência, Conta/DV, CPF ou RG (ou nada), Funcionário, Código e Valor;
  - opções: separar bancos (com o total de cada um), somente totais e imprimir demitidos;
  - fica no modal do Arquivo bancário (e do Arquivo do adiantamento), sem precisar da conta da empresa, com a data de crédito.
- **Testes:** `pensaoPercentual.test.ts`, `relacaoDeposito.test.ts` e o modal em `arquivoBancarioModal.test.tsx`.

## 15/10/2026 — Status × SAGE atualizado

- **Pedido do Paulo:** "atualize nosso status com relação a SAGE".
- **Catálogo (`catalogoMenus.ts`, revisto em 15/10):** as entregas de 14 e 15/10 entraram nos itens Funcionários, Eventos, Tabelas legais, Textos, Cálculo da folha, Adiantamento, Férias, 13º e Rescisão.
- **Itens novos:**
  - Relatórios › Valores de Salários para Bancos (a relação de depósito);
  - o menu Contratos do Office (avisos e documentos).
  - Os recibos de VT, refeição e cesta ficam como modelos a criar no escritório.
- **Resultado:** 52 disponíveis, 1 parcial (CCI) e 2 fora do escopo (SEFIP/GRRF e SST).
- **`docs/retomada.md`:** a seção "Status × SAGE" com o que ainda prende ao SAGE (homologação por empresa e o #61, tabela de eventos de cada empresa, "Lança na rescisão" nos automáticos já gravados, backup como origem e o CCI).

## 15/10/2026 — Tabela para D.S.R. (SAGE) em Tabelas legais

- **Pedido do Paulo:** incluir a tabela de DSR em Tabelas legais, com a tela do SAGE como exemplo (Tabela para D.S.R., empresa 1200, 2026).
- **Cadastro (`tabelaDsr.ts`, `TabelaDsrCadastro.tsx`, coleção `cadastro_dsr/{empresa}_{ano}` com regra e auditoria):**
  - por empresa e ano, no layout do SAGE: Nº horas D.S.R. (domingos/feriados × 220 ÷ 30, não se digita), dias úteis e domingos/feriados;
  - Cópia padrão pelo calendário com os feriados nacionais e Cópia entre empresas;
  - valida a soma com os dias do mês e aponta os meses diferentes do calendário;
  - mês encerrado no Fim de mês fica travado (reabrir antes), como no SAGE.
- **Conferência com o SAGE de 2026:** a cópia padrão bate em 11 meses. Em novembro o SAGE tem 24 úteis/6 DSR e o calendário 23/7, porque 20/11 é feriado nacional desde a Lei 14.759/2023. Fica para a colaboradora conferir.
- **Motor:**
  - DSR das horas extras pela tabela no mês inteiro (mês parcial segue o calendário) e nas médias de férias, 13º e rescisão;
  - "Descontar faltas pelos dias do mês": falta e DSR descontado por salário ÷ dias do mês;
  - "Descontar DSR na falta diária": aviso quando há falta sem DSR descontado. A conta automática espera um holerite do SAGE com falta para conferir.
- **Sem tabela cadastrada, nada muda:** o cálculo segue pelo calendário com os feriados locais do movimento.
- **Testes:** `tabelaDsr.test.ts`, `tabelaDsrTela.test.tsx` e `testes-regras/tabelaDsr.test.mjs`.

## 15/10/2026 — Cadastro de Cargos (SAGE) amarrado à ficha

- **Pedido do Paulo:** criar em Cadastros a opção de cadastro de cargos, amarrada à ficha do funcionário, como a tela Arquivos › Cargos / Carreira › Cargos do SAGE.
- **Cadastro (`cargos.ts`, `CargosCadastro.tsx`, coleção `cadastro_cargos/{empresa}_{código}` com regra e auditoria):**
  - campos como o SAGE: código (6 dígitos, 000001), cargo, inativo, descrição para relatórios, início e final da validade;
  - cargo/emprego público: lei, data, situação, acúmulo, dedicação exclusiva e tempo especial;
  - C.B.O. (4110-10), função e atividades desempenhadas;
  - pesquisa e contagem de funcionários por cargo.
- **Ficha (Ident. Adm.):**
  - o "Código do cargo IOB" virou a escolha do cargo e traz o nome e o CBO, que vão ao S-2200/S-2206;
  - cargo ou CBO diferente do cadastro gera aviso no campo;
  - a tela de Cargos lista essas fichas. Nenhuma ficha gravada muda sozinha.
- **Carga:**
  - "Criar pelos cargos das fichas": código, nome e CBO iguais em todas as fichas do código; quando diferem, aviso para cadastrar à mão;
  - a restauração do backup traz a tabela `cargos` do SAGE: só os novos, e sem CBO válido fica de fora, com aviso.
- **Funções e Carreiras Públicas** ficaram como texto (função) e nos campos de cargo público, porque o eSocial S-1.x não tem mais o S-1030/S-1040.
- **Testes:** `cargos.test.ts`, telas em `painelCadastros.test.tsx`, restauração e `testes-regras/cargos.test.mjs`.

## 15/10/2026 — Eventos pagos no adiantamento (ajuda de custo, como o SAGE)

- **Pergunta da colaboradora (via Paulo):** dois funcionários recebem ajuda de custo no adiantamento. No SAGE é um evento automático do processamento de adiantamento (holerite tipo Adiantamento de 10/2026: ajuda 500,00 + adiantamento 40% 1.271,34 + arredondamento 0,66 = 1.772,00). No Consultor o adiantamento era só o percentual da ficha, sem lugar para eventos.
- **Movimento:** o lançamento avulso ganhou "No adiantamento" (`Lancamento.noAdiantamento`):
  - sai do holerite da folha (`verbasAdiantamento`);
  - entra no Cálculo de Adiantamentos (coluna Eventos), no recibo, no arquivo bancário e no demonstrativo do adiantamento no S-1200, com o pagamento no S-1210;
  - o arredondamento do adiantamento é sobre o total pago;
  - INSS e FGTS contam nas bases do mês; IRRF entra na folha se ela é paga no mesmo mês, ou no IRRF do adiantamento se o saldo é no mês seguinte;
  - plano de saúde não pode ir ao adiantamento.
- **Ficha › Lanç. automático:** novo campo "Pago no" (Folha / Adiantamento). O lançamento automático marcado entra no movimento já com a marca. Evento que vai para um campo do movimento (horas, pensão) não pode, e dá erro.
- **Dados já gravados não foram alterados.** A ajuda de custo dessas fichas está como lançamento da folha (importada do lancauto do SAGE). A colaboradora marca "Pago no: Adiantamento" na ficha e "No adiantamento" no lançamento do movimento de 10/2026. Sem isso, a folha de 10/2026 paga os 500,00 de novo.
- **Testes:** em `adiantamentoVt.test.ts`, o caso do SAGE (1.772,00 no recibo, no arquivo e no S-1210; a ajuda no demonstrativo ADI) e as incidências; também `calculoAdiantamentosModal.test.tsx` e `lancamentosAutomaticos.test.tsx`.
