# Retomada do trabalho

Ponto de partida da próxima sessão. Atualizado em **15/10/2026**. O detalhe de cada entrega está em `docs/historico-claude.md`.

## App

- **Consultor DP:** https://paulocpjunior.github.io/Consultor-DP-Folhapagamentos/ (GitHub Pages). O deploy roda a cada merge na `main` e também pelo "Run workflow" (`gh workflow run deploy.yml`, desde o #252).
- Versão e data da publicação aparecem abaixo de "SP Assessoria". Clicar abre as novidades.

## Publicado em 12/10/2026

| App | Entrega | PR |
|---|---|---|
| DP | Plataforma P2 (IA) e esteiras em Node 24 | #230, #231 |
| DP | Regras oficiais com as rubricas (S-1010) no pré-voo | #232 |
| DP | Licença-paternidade (Lei 15.371/2026): motivos 46–52, naturezas 4052/4053/9928/9929 | #233 |
| DP | Tailwind 4, visual no estilo Apple, logo oficial | #234 |
| DP | NT 07/2026 rev. aplicada por data (XSD por pacote), licenças na conferência, logo nos PDFs | #235, #236 |
| DP | Pré-voo: lotação (S-1020) e estabelecimento (S-1005) vigentes | #237 |
| DP | #238 (dados de teste trocados) **revertido** a pedido do Paulo | #239 |
| DP | Ícones do menu em qualquer largura, versão e data no cabeçalho, botão de novidades | #240 |
| Contábil | Auditoria de dependências zerada (3.4.384) e paleta Apple nas telas em .js (3.4.385) | #259, #260 |
| CFI, Legalização | Visual novo | CFI #1405, Legal #18 |
| Plataforma | P3 parte 1 (cadastro central) no ar; plano da P4 documentado | #4, #5 |
| Financeiro | Site no ar no commit `463c716` (visual Apple, #85, #86, #87) | — |

## Resolvido em 13/10/2026

- **Financeiro:** publicação completa no commit `8791c66`, com o Jotform desligado (o passo do checklist passou).
- **Cadastro central no DP:**
  - as variáveis `VITE_SERVICO_CADASTRO_URL` e `VITE_SERVICO_COFRE_URL` foram criadas com o endereço da plataforma, obtido com o gcloud;
  - o `/ready` da plataforma responde `cadastro.leitura: ok`;
  - para voltar ao CFI, basta apagar as duas variáveis e publicar de novo.
- **Trava de horário:** `HORARIO_ACESSO_ATIVO` não está definida no CFI (proxy e app) nem na plataforma. Está desligada nos dois lados, que portanto já estão iguais.
- **Cloud Functions:** a API nunca esteve ativa no projeto, então não há funções antigas. Ela foi ligada só para a consulta; desligar com `gcloud services disable cloudfunctions.googleapis.com`.
- **P-f:**
  - a plataforma e o CFI rodam com a mesma conta, a padrão do Compute (`631239634290-compute@`);
  - essa conta tem `roles/editor` e `roles/secretmanager.secretAccessor` no projeto;
  - logo, a plataforma já lê `cfi-empresa-cert-key`, `sefaz-cert-a1`, `sefaz-cert-password`, `serpro-consumer-key`, `serpro-consumer-secret` e o bucket dos certificados, sem nenhuma concessão nova.
  - Observação para depois: o ideal é uma conta própria só com o necessário. Isso é decisão do Paulo e não bloqueia nada.
- **P-e:** `graph-client-secret` já existe e a conta da plataforma lê. Falta só confirmar o tenant e o client id (configuração, não segredo).
- **Revisão visual das telas:** PR #242.
- **E-mail pela plataforma (P3, parte 2):**
  - sp-plataforma PR #6 publicado;
  - variáveis do Graph na plataforma: `GRAPH_SECRET=graph-notificacoes-secret`, client id, tenant, remetente e `DP_EMAIL_BCC`;
  - o DP passou a usar `VITE_SERVICO_EMAIL_URL` (criada pelo Paulo em 13/10);
  - falta o envio de teste do Paulo para ele mesmo. Para voltar ao CFI: apagar a variável e publicar de novo.

## Também em 13/10/2026

- **Governo na plataforma (P4):**
  - sp-plataforma #7 (eSocial: envio, consulta e download) e #8 (SERPRO: FGTS, status, DCTFWeb, DARF e pagamentos), as 16 rotas que o DP usa;
  - variáveis do SERPRO criadas pelo Paulo;
  - o DP **ainda usa o CFI**. A troca (`VITE_SERVICO_GOVERNO_URL`) fica para depois do dia 15, com um lote de homologação acompanhado até o recibo, débitos e DARF batendo com o CFI e a volta escrita antes.
- **SERPRO medido em produção:**
  - `ESOCIAL/CONSULTARFECHAMENTO`, `FGTS/CONSULTARRECOLHIMENTO` e `FGTS/CONSULTARCRF` **não existem** no catálogo (ICGERENCIADOR-052);
  - `CONSDECCOMPLETA33` exige ano, mês e categoria.
  - Correção nos dois lados (CFI #1406 e plataforma #9):
    - o status da DCTFWeb vem do recibo (CONSRECIBO32);
    - eSocial e FGTS dizem "o SERPRO não oferece esta consulta";
    - a CRF vai direto à consulta pública;
    - o selo do eSocial no semáforo vem do S-1299 aceito no DP. Um S-1298 posterior derruba o selo.
- **CFI #1410:** obrigação sem consulta aparece como "não verificada" e não conta como pendência.
- **DP #245 e #246:**
  - o S-1299/S-1298 feito fora do Consultor (IOB) é importado do governo em `esocial_envios/governo-<recibo>`. A importação acontece pelo clique em "Conciliar" e também pelo vigia, uma vez por dia por empresa ativa e competência, com marca em `esocial_vigia_fechamento`;
  - o alerta de competência "reaberta (S-1298)" segue a mesma régua do servidor;
  - a baixa do FGTS em Prazos mostra o motivo real e orienta a usar o comprovante da GFD.
- **Limite de download estimado:** o vigia para em 10 pedidos por dia por empregador (`RESERVA_PEDIDOS_DIA`). Ajustar quando o limite oficial for conhecido.

## Feito em 14/10/2026: o DP sai do CFI e ganha plataforma própria

- **Regra do Paulo (14/10):** cada app é autônomo e responde por si; os apps só se falam na frente. Nada de pirâmide em que a queda de um trava os outros. A troca não depende de data.
- **"Testar" de Serviços externos (#251):** o falso "Load failed" no CFI vinha do cabeçalho CORP do helmet. O teste agora pergunta com CORS primeiro.
- **Uma plataforma por app (sp-plataforma #11 e #12):**
  - **`sp-plataforma-dp`** (https://sp-plataforma-dp-zricstsjqa-uw.a.run.app) atende só o navegador do DP (`PLATAFORMA_APP=dp`).
  - A esteira gera a imagem uma vez e publica um serviço por app. A falha de um não segura os outros.
  - O `sp-plataforma` antigo saiu da esteira e foi apagado pelo Paulo.
- **O DP no `sp-plataforma-dp`:**
  - as cinco `VITE_SERVICO_*_URL` (cadastro, cofre, governo, e-mail, IA) apontam para ele, conferidas no log do build do run 38548225806;
  - o `/ready` mostrou IA, cadastro, e-mail, governo e SERPRO configurados;
  - o WhatsApp segue no CFI, a caminho do SP Connect.
- **Para voltar** um serviço ao CFI: apagar a variável dele e rodar `gh workflow run deploy.yml`.
- **Próximo passo (P5):** tirar do CFI as rotas do DP, um PR por serviço, quando o DP tiver passado pelas primeiras transmissões reais pela plataforma. Até lá, o CFI é a volta.

## Status × SAGE (15/10/2026)

- **Catálogo IOB × Consultor** (IOB SAGE › menus, `catalogoMenus.ts`): 57 itens, **54 disponíveis**, 1 parcial e 2 fora do escopo (a Tabela para D.S.R. e o Cadastro de Cargos entraram em 15/10).
  - Parcial: a integração contábil, que falta importar direto no CCI.
  - Fora do escopo: SEFIP/GRRF, substituídos pelo eSocial e pelo FGTS Digital, e SST.
- **Retorno da colaboradora, 14 e 15/10 (PRs #254 a #261):**
  - INSS com a parcela a deduzir e a referência pela faixa;
  - incidências do Lançar evento pela rubrica S-1010;
  - MiA com o mapa do menu (plano de saúde);
  - rescisão com art. 480, eventos digitados e insuficiência de saldo;
  - avisos do menu Contratos;
  - lançamento automático com Referência, Sal, Valor, Lança na rescisão e Cópia para o ano seguinte;
  - pensão em % (bruto − INSS) no mensal, 13º, férias e rescisão;
  - relação de depósito bancário por tipo de movimento.
- **O que ainda prende ao SAGE:**
  1. Homologação do motor por empresa: sai da prévia com 3 meses sem diferença na conferência × IOB. A 1200 depende do #61 (arquivos de 09/2026 da colaboradora).
  2. Tabela de eventos: o catálogo do Consultor veio de outro cliente do IOB (o triênio da SP é o 1015, que não está nele). Falta importar a tabela de eventos de cada empresa em Cadastros › Eventos IOB.
  3. Lançamentos automáticos já gravados: marcar "Lança na rescisão" nos que devem ir para a rescisão.
  4. O SAGE segue como origem dos dados (backup) e base de conferência até o corte de cada empresa.
  5. Integração com o CCI (escopo com o Paulo).

## Depende do Paulo

1. Template do WhatsApp do dp-folha: mandar o texto e o motivo da recusa da Meta.
2. Tornar privados os repositórios públicos: DP, CFI, Financeiro e `plano-contas-iob`.
3. Motivo 26: confirmar o amparo legal.
4. Integração com o CCI: definir o que passa de um sistema para o outro.
5. E-mail verificado no login, CSP e App Check: mudam o login de quem já usa, então combinar antes.
6. Avisar quando a primeira transmissão real pela plataforma passar (eSocial ou DCTFWeb), para eu começar a P5 no CFI.
7. Colaboradora:
   - testar a MIA;
   - arquivos do IOB do #61 e do caso do 13º;
   - lotações e obras com recibo antes de 26/10.

## Liberado para mim

- **Feito:** trava da carteira nas consultas por CNPJ, comparador CFI × plataforma e a troca do DP para o `sp-plataforma-dp`.
- **Próximo:** P5 no CFI depois das primeiras transmissões reais. Plataforma própria da Legalização e do Financeiro quando eles saírem do CFI (uma linha na esteira).

## Regras combinadas hoje

- **Dados reais:** não alterar nada que envolva dados reais, nem em arquivos de teste ou fixtures, sem confirmação explícita do Paulo. "Pode seguir" genérico não vale para isso.
- **Identidade visual:** os ícones do menu são fundamentais para a memorização dos colaboradores. Nunca escondê-los para caber; se faltar espaço, o menu rola.
- **Versão e data** sempre visíveis no app. O popup de novidades continua automático e também abre pelo botão da versão.
- **Link do app:** conferir o destino real do deploy (o `environment_url` da publicação), sem deduzir pelo nome do projeto.

## Datas do eSocial (já automáticas no pré-voo e no XSD)

- 26/10/2026: XSD novo e S-2200 sem `infoCota`.
- 23/11/2026: limite de horas no tempo parcial, observação na rubrica dedutora, regra de rubrica para avulso.
- 14/12/2026: rubricas de salário-paternidade aceitas.
- 01/01/2027: licença-paternidade nova.
- 18/01/2027: último pacote da NT 07/2026.
