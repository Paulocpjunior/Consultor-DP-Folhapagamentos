# Retomada do trabalho

Ponto de partida da próxima sessão. Atualizado em **12/10/2026, à noite**. O detalhe de cada entrega está em `docs/historico-claude.md`.

## App

- **Consultor DP:** https://paulocpjunior.github.io/Consultor-DP-Folhapagamentos/ (GitHub Pages; o deploy roda a cada merge na `main`).
- Versão e data da publicação aparecem abaixo de "SP Assessoria". Clicar abre as novidades.

## Publicado em 12/10/2026

| App | Entrega | PR |
|---|---|---|
| DP | Regras oficiais com as rubricas (S-1010) no pré-voo | #233 e anteriores do dia |
| DP | Licença-paternidade (Lei 15.371/2026): motivos 46–52, naturezas 4052/4053/9928/9929 | idem |
| DP | Tailwind 4, visual no estilo Apple, logo oficial | #234 |
| DP | NT 07/2026 rev. aplicada por data (XSD por pacote), licenças na conferência, logo nos PDFs | #235, #236 |
| DP | Pré-voo: lotação (S-1020) e estabelecimento (S-1005) vigentes | #237 |
| DP | #238 (dados de teste trocados) **revertido** a pedido do Paulo | #239 |
| DP | Ícones do menu em qualquer largura, versão e data no cabeçalho, botão de novidades | #240 |
| Contábil | Auditoria de dependências zerada (3.4.384) e paleta Apple nas telas em .js (3.4.385) | #259, #260 |
| CFI, Legalização | Visual novo | CFI #1405, Legal #18 |
| Plataforma | P3 parte 1 (cadastro central) no ar; plano da P4 documentado | #4, #5 |
| Financeiro | Site no ar no commit `463c716` (visual Apple, #85, #86, #87) | — |

## Depende do Paulo

1. **Financeiro: desligar o Jotform.** A publicação de `463c716` subiu o site, mas falhou no passo "Fixar a consulta do checklist". Esse passo exige antes o `scripts/retire-jotform.py`, que precisa do gcloud. No Mac:
   ```bash
   git checkout main && git pull
   npm ci && npm run build
   npm ci --prefix cloud-run/jotform-webhook
   FINANCEIRO_APPROVED_COMMIT=<SHA atual da main> python3 scripts/retire-jotform.py
   ```
   Depois, rodar de novo "Validar Financeiro e publicar somente com autorização" com o mesmo SHA.
2. **Repositório do DP privado** (Settings › General › Danger Zone). Os testes têm dados reais e ficaram como estavam, por decisão do Paulo.
3. **P-f:** acesso da plataforma aos segredos (certificados A1, senhas, SERPRO) para começar a P4. A troca de endereço só depois do dia 15.
4. **Cadastro central no DP:**
   - `HORARIO_ACESSO_ATIVO` na plataforma igual ao do CFI;
   - `/ready` da plataforma com `leitura: ok`;
   - no DP, as variáveis `VITE_SERVICO_CADASTRO_URL` e `VITE_SERVICO_COFRE_URL` com o endereço da plataforma (tirado do Cloud Run), depois nova publicação.
5. Testar a MIA no app (fecha a P2).
6. Credenciais do Microsoft Graph no Secret Manager (P-e, e-mail pela plataforma).
7. Motivo 26: confirmar o amparo legal.
8. #61, divergências da 1200 em 09/2026, e o caso do IRRF do 13º: arquivos do IOB pelo chat.
9. Integração com o CCI.
10. Template do WhatsApp do dp-folha.
11. E-mail verificado no login, CSP e App Check. Mudam o login de quem já usa: combinar antes.
12. `gcloud functions list` (Cloud Functions antigas).

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
