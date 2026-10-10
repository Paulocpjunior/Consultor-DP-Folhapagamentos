# Serviços externos do DP — contrato das rotas

Autonomia dos módulos, passo 3 (10/10/2026). Tudo o que o Consultor DP chama
fora do Firebase passa por `services/plataforma/servicos.ts`, agrupado em seis
serviços. O plano de quem assume cada um está em `docs/plataforma-comum.md`. Sem configuração, todos ficam no CFI, exatamente como antes. Quem for
assumir um serviço (a plataforma comum ou um serviço próprio do DP) implementa
**as mesmas rotas, com os mesmos corpos e respostas** do CFI de hoje.

## Como trocar

São variáveis do repositório no GitHub (Settings › Secrets and variables ›
Actions › **Variables**), lidas no build (`.github/workflows/deploy.yml`). São
endereços públicos, por isso não são segredos.

| Variável | Efeito |
|---|---|
| `VITE_PLATAFORMA_URL` | Todos os serviços passam para a plataforma comum, menos o WhatsApp |
| `VITE_SERVICO_CADASTRO_URL` | Só o cadastro central |
| `VITE_SERVICO_COFRE_URL` | Só o cofre de certificados |
| `VITE_SERVICO_GOVERNO_URL` | Só o governo (eSocial, FGTS, DCTFWeb, SERPRO) |
| `VITE_SERVICO_EMAIL_URL` | Só o e-mail |
| `VITE_SERVICO_WHATSAPP_URL` | Só o WhatsApp (destino: o SP Connect, nunca a plataforma) |
| `VITE_SERVICO_IA_URL` | Só a MIA e a leitura de holerites |
| `VITE_PAINEL_MENSAGENS_URL` | Link "Templates e agendamentos" (admin) |

Precedência: a variável do serviço, depois `VITE_PLATAFORMA_URL`, depois o CFI.

- O endereço precisa ser `https`. Só se aceita `http` em `localhost` e
  `127.0.0.1`, para desenvolvimento.
- Endereço com parâmetros, âncora ou usuário é ignorado, e a tela mostra um
  aviso.
- A base pode ter um caminho (ex.: `https://gw.exemplo.com.br/dp`); o caminho
  da rota é acrescentado a ela.
- A situação de cada serviço aparece em **Configurações › Serviços externos**,
  com um teste de alcance que não usa o login.

## Requisitos de qualquer provedor

1. Aceitar o token Firebase do projeto `consultor-dp-folha` no cabeçalho
   `Authorization: Bearer <token>`, exigindo e-mail verificado.
   - Recusa por token: 401 ou 403 com `{ "error": "..." }`. Quando a causa for o
     e-mail não verificado, a mensagem deve dizer "não verificado"; é isso que
     faz o app renovar o token ou orientar a verificação.
2. Liberar o CORS para as origens do app (GitHub Pages e `localhost`).
3. Responder erro com status HTTP e `{ "error": "...", "acao"?: "..." }`.
4. Guardar os segredos: certificado A1, token da Meta, Graph e Gemini. Nada
   disso trafega pelo navegador.

## Rotas por serviço

### Cadastro central (`cadastro`)

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/admin/cadastro/usuarios/{email}?modulo=dp-folha` | Gate de departamento e horário: `{ ok, temAcesso, motivo?, horario? }` |
| GET | `/api/admin/cadastro/empresas` | Conferência com o cadastro central: `{ ok, empresas: [{ cnpj, nome }] }` |

### Cofre de certificados (`cofre`)

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/admin/cadastro/certificados[?cnpjs=a,b]` | Panorama do A1: `{ ok, linhas, avisos }` |

### Governo (`governo`) — POST JSON

| Rota | Uso |
|---|---|
| `/api/dp-integration/esocial/envio/lote` | Transmissão de lote assinado com o A1 do cofre |
| `/api/dp-integration/esocial/envio/consulta` | Consulta do protocolo |
| `/api/dp-integration/esocial/download/identificadores` | Identificadores e recibos (sem gastar a cota de download) |
| `/api/dp-integration/esocial/download/eventos` | Download dos XMLs |
| `/api/dp-integration/esocial/status` | Situação do eSocial (SERPRO) |
| `/api/dp-integration/fgts/recolhimento` | Recolhimento do FGTS |
| `/api/dp-integration/fgts/crf` | CRF do FGTS |
| `/api/dp-integration/dctfweb/status` | Situação da DCTFWeb |
| `/api/dp-integration/dctfweb/debitos` | Débitos da DCTFWeb |
| `/api/dp-integration/empresa-completo` | Dados da empresa (SERPRO) |

### E-mail (`email`)

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/dp-integration/email/enviar` | E-mail pelo escritório (Graph), com anexos em base64 |

### WhatsApp (`whatsapp`)

O dono do canal é o SP Connect (separação própria, `docs/separacao-sp-connect.md`
no repositório dele). A plataforma comum não assume o WhatsApp.

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/admin/whatsapp/templates?departamento=dp-folha` | Templates do SP Connect do DP |
| POST | `/api/admin/whatsapp/enviar` | WhatsApp oficial (template + PDF) |

### Inteligência artificial (`ia`) — POST JSON

| Rota | Uso |
|---|---|
| `/api/dp-integration/assistente/mia` | MIA (Gemini) |
| `/api/dp-integration/holerites/extrair` | Leitura dos holerites do IOB em PDF |

Rota nova do túnel entra em `SERVICO_DA_ROTA`. Se ficar de fora, o teste
`services/plataforma/__tests__/servicos.test.ts` falha.
