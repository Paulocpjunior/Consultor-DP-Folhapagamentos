# Retomada do trabalho

Ponto de partida da próxima sessão. Atualizado em **13/10/2026**. O detalhe de cada entrega está em `docs/historico-claude.md`.

## App

- **Consultor DP:** https://paulocpjunior.github.io/Consultor-DP-Folhapagamentos/ (GitHub Pages; o deploy roda a cada merge na `main`).
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

## Depende do Paulo

1. Tornar privados os repositórios públicos: DP, CFI, Financeiro e `plano-contas-iob`. O DP tem dados reais nos testes, e eles ficaram como estavam por decisão do Paulo.
2. Testar a MIA no app (fecha a P2).
3. Motivo 26: confirmar o amparo legal.
4. #61, divergências da 1200 em 09/2026, e o caso do IRRF do 13º: arquivos do IOB pelo chat.
5. Integração com o CCI.
6. Template do WhatsApp do dp-folha.
7. E-mail verificado no login, CSP e App Check: mudam o login de quem já usa, combinar antes.

## Liberado para mim

- **P3, parte 2 (e-mail pela plataforma):** o segredo do Graph já está acessível.
- **P4 (rotas de governo):** a P-f já está resolvida. Pode ser portada agora, mas o DP só troca de endereço depois do dia 15.

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
