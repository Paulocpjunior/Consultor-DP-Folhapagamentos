# Plataforma comum: autonomia dos módulos, passo 1

<!-- Documento de governo. Pedido do Paulo em 10/10/2026: "pode seguir com o
     passo 1". Cada fase fechada atualiza este arquivo no mesmo PR que a fecha.
     A cópia de referência fica no repositório da plataforma (sp-plataforma). -->

> **Estado em 10/10/2026:**
> - **P1 (repositório, esteira e o primeiro serviço, a IA):** em andamento.
> - **CFI:** nada foi cortado. Continua atendendo todos os serviços.
> - **DP:** só troca um serviço quando a variável dele for criada no GitHub (Configurações › Serviços externos).

## 1. Por que

Hoje cada módulo do escritório (DP, Contábil, Legalização, Financeiro) depende
do CFI para cinco serviços que não são fiscais:
- o cadastro central;
- o cofre do A1;
- a ligação com o governo (eSocial, SERPRO, DCTFWeb);
- o e-mail pelo Microsoft 365;
- a IA (Gemini).

Esse compartilhamento tem quatro custos, os mesmos que levaram à separação do
SP Connect:
1. **Uma falha do CFI derruba o DP.** Mesmo processo, mesmo container. Uma
   exceção numa rotina fiscal cala o envio do eSocial da folha.
2. **O deploy é acoplado.** Uma correção de DIPAM reinicia o envio do eSocial.
   Uma correção urgente do DP espera a bateria inteira do CFI.
3. **Os segredos se misturam.** O CFI guarda o que é só dele e o que é de
   todos, sem separação de permissões.
4. **A operação se mistura.** Runs, alertas e logs de casas diferentes caem na
   mesma lista.

## 2. O que a plataforma é, e o que não é

**É** um serviço Cloud Run próprio (`sp-plataforma`), com repositório e esteira
próprios. Atende os módulos pelas **mesmas rotas** que o CFI atende hoje
(`docs/plataforma-servicos.md`). A troca é só de endereço, e a volta também.

**Não é** um banco novo. O precedente da casa vale aqui como valeu no SP
Connect: **mesmo projeto GCP (`consultorfiscalapp`), mesmo Firestore, mesmo
Storage e mesmo Secret Manager.**

| Com o mesmo projeto | Se fosse um projeto novo |
|---|---|
| Nenhuma migração: o cofre (`empresas_certificados`, `certs/*.pfx.enc`), os logs e os usuários ficam onde estão | Migrar o cofre do A1 com as senhas cifradas, os logs e o cadastro |
| A chave do cofre (`cfi-empresa-cert-key`) é a mesma, por IAM | Duplicar ou reemitir chaves |
| Um lote enviado pelo CFI pode ser consultado pela plataforma: os dois leem o mesmo log | Envio e consulta presos à casa que enviou |
| Risco baixo | Risco alto, sem ganho para o problema da seção 1 |

**Não entra na plataforma:**
- **O WhatsApp.** O dono do canal é o SP Connect, que já está saindo do CFI pela
  separação própria. No DP, o WhatsApp é um serviço à parte
  (`VITE_SERVICO_WHATSAPP_URL`), que vai direto para o SP Connect.
- **O que é fiscal:** SEFAZ, NFS-e, SPED, DIPAM. Fica no CFI.

## 3. Serviços da plataforma, em ordem de risco

| Ordem | Serviço | Origem no CFI | Segredos (Secret Manager / env) | Risco |
|---|---|---|---|---|
| 1 | **IA**: MIA e leitura de holerites | `dp-assistente-mia.js`, `holerite-extracao.js`, cliente Gemini do `server.js` | `GEMINI_API_KEY` | Baixo: não grava nada; se falhar, só a MIA para |
| 2 | **Cadastro central**: usuários e horário, empresas, panorama do cofre (sem o arquivo) | `cadastro-central-routes.js` e auxiliares | nenhum (Firestore pelo IAM) | Baixo: só leitura |
| 3 | **E-mail** (Microsoft 365) | `graph-provider.js`, `graph-remetente.js`, `dp-email-pacote.js`, `email-layout.js` | `GRAPH_CLIENT_ID/SECRET/TENANT_ID`, remetentes, `DP_EMAIL_BCC` | Médio: envio ao cliente |
| 4 | **Governo**: eSocial (envio, consulta, download), SERPRO (FGTS, eSocial, DCTFWeb), empresa completa | `esocial-*.js`, `pkcs12.js`, `pfx-to-pem.js`, `cert-storage.js`, `serpro-client.js`, `dctfweb-*.js`, `nfp-compliance-provider.js` | `cfi-empresa-cert-key`, `sefaz-cert-a1`, `sefaz-cert-password`, `SERPRO_*` | Alto: transmissão oficial com o A1 |

A autenticação é a mesma do CFI (`require-cross-project-auth.js`):
- token Firebase de um projeto da lista de cada rota;
- assinatura do Google conferida;
- e-mail `@spassessoriacontabil.com.br` verificado.

O CORS libera as mesmas origens do CFI. Para os módulos, nada muda.

## 4. Fases

### P0: decisões do Paulo
- O nome. Sugestão: `sp-plataforma`. Renomear o repositório depois é simples.
- Confirmar o mesmo projeto GCP (seção 2) e a ordem da seção 3.

### P1: repositório, esteira e IA
- **Repositório próprio** com:
  - autenticação entre projetos e CORS;
  - `/health` e `/ready`;
  - as rotas da IA iguais às do CFI;
  - os testes portados;
  - Dockerfile.
- **Esteira:** testes, depois imagem, depois revisão sem tráfego, depois `/ready`, depois rotear.
- **Sem o segredo `GCP_SA_KEY`:** o workflow roda os testes, pula o deploy e avisa.
- **Critério:** a esteira passa e o serviço sobe sem tráfego quando o segredo existir.

### P2: no ar, sem ninguém usando, e depois o DP
- **Paulo:** cria o `GCP_SA_KEY` e dá à conta do serviço acesso ao segredo do Gemini (seção 6).
- **Eu:** faço o deploy, confiro `/ready` e testo com o token de um usuário.
- **Então:** criar `VITE_SERVICO_IA_URL` no DP, publicar e perguntar à MIA.
- **Volta:** apagar a variável e publicar. Leva minutos.

### P3: cadastro central e e-mail
- Portar com os testes. O DP passa a usar a plataforma serviço por serviço
  (`VITE_SERVICO_CADASTRO_URL`, `VITE_SERVICO_COFRE_URL`, `VITE_SERVICO_EMAIL_URL`).
- **Antes do e-mail:** as credenciais do Graph entram no Secret Manager com acesso
  da plataforma. O CFI continua com as dele até a P5.

### P4: governo
- O maior e o mais sensível.
- **Critério:**
  - um lote real de homologação vai pela plataforma, e a Saúde do eSocial acompanha até o recibo;
  - o download e a consulta batem com o que o CFI devolveria.
- **Quando:** a troca do governo é feita fora do fechamento da folha (não do dia
  1 ao dia 15), com a volta escrita antes.

### P5: os outros módulos e a limpeza
- Contábil, Legalização e Financeiro passam a usar a plataforma.
- O CFI também passa a pedir à plataforma o que é comum.
- Só então o código duplicado sai do CFI.

## 5. Riscos

| Risco | Por que dói | Mitigação |
|---|---|---|
| **Regra duplicada** entre o CFI e a plataforma, da P1 à P5 | Duas cópias divergem sem ninguém ver: é o defeito que mais aparece neste projeto | Cada arquivo portado leva o commit de origem do CFI. Mudança nesses arquivos no CFI durante a transição é replicada no mesmo dia. A P5 remove a cópia do CFI |
| **Token aceito por engano** | A rota do governo entrega dados SERPRO de qualquer CNPJ | Mesmo middleware do CFI, com os testes de assinatura, emissor, e-mail verificado e lista por rota |
| **Plataforma fora do ar** | O DP fica sem o serviço | A volta é apagar a variável e publicar. A troca é por serviço, nunca todos juntos |
| **Envio do eSocial no meio da troca** | Lote sem resposta | P4 fora do fechamento. O envio registrado e a consulta pelo Id (Saúde do eSocial) protegem contra reenvio às cegas |
| **Custo** | Mais um serviço no Cloud Run | Instância mínima zero na IA, no cadastro e no e-mail (paga por uso). Só o governo pode precisar de uma instância mínima |

## 6. Quem faz o quê

**É do Paulo** tudo que exige decisão, credencial ou clique em painel externo
(GCP, GitHub, Microsoft). **É meu** o resto.

| # | O que | Quando |
|---|---|---|
| P-a | Confirmar o nome (`sp-plataforma`) e o mesmo projeto GCP | P0 |
| P-b | Criar o segredo `GCP_SA_KEY` no repositório da plataforma (Settings › Secrets › Actions). Pode ser a mesma conta de deploy do CFI ou uma nova com Cloud Run Admin, Artifact Registry Writer e Service Account User | P2 |
| P-c | Pôr a chave do Gemini no Secret Manager (`gemini-api-key`) e dar "Secret Manager Secret Accessor" à conta do serviço da plataforma | P2 |
| P-d | Criar `VITE_SERVICO_IA_URL` no GitHub do DP com o endereço que eu passar | P2 |
| P-e | Credenciais do Graph no Secret Manager, com acesso da plataforma | P3 |
| P-f | Acesso da plataforma a `cfi-empresa-cert-key`, `sefaz-cert-a1`, `sefaz-cert-password` e às credenciais SERPRO | P4 |

| Fase | O que eu faço |
|---|---|
| P1 | Repositório, porte com os testes, esteira com o aviso quando faltar o segredo |
| P2 a P4 | Porte de cada serviço com os testes, deploy sem tráfego, prova com usuário real, troca no DP |
| P5 | Ajuste dos outros módulos e limpeza do CFI, um PR por serviço |
