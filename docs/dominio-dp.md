# Endereço do DP no domínio da SP

Pedido do Paulo (17/10/2026): "no futuro todos os apps deverão ter o endereço do nosso domínio, então por que não
começar pelo DP, como já temos no nosso WhatsApp?" O CFI e o WhatsApp já respondem em `app.spassessoriacontabil.com.br`.
O DP vai para **`dp.spassessoriacontabil.com.br`**, no Firebase Hosting do projeto `consultor-dp-folha`, o mesmo do
Firestore e do login. Os dados não mudam de lugar. Sair do GitHub Pages também é o que deixa o repositório ficar
privado sem plano pago.

## Como a esteira publica

- A cada merge na `main`, o DP é publicado nos **dois lugares**: GitHub Pages (`/Consultor-DP-Folhapagamentos/`, como
  hoje) e Firebase Hosting (na raiz: `consultor-dp-folha.web.app` e, depois do passo 2, o domínio da SP).
- Enquanto a variável `DP_ENDERECO_NOVO` estiver vazia, nada muda para quem usa o link de hoje.
- Com `DP_ENDERECO_NOVO` preenchida, o GitHub Pages vira só uma página que leva cada link antigo ao mesmo caminho no
  endereço novo (`scripts/hosting/paginaRedirecionamento.mjs`).

## Passos (uma vez)

1. **Permissão da esteira:** no Google Cloud › IAM do projeto `consultor-dp-folha`, dar à conta de serviço do segredo
   `FIREBASE_SERVICE_ACCOUNT` o papel **Administrador do Firebase Hosting**. Sem ele, a esteira avisa e segue só com o
   GitHub Pages.
2. **Domínio:** Firebase › `consultor-dp-folha` › Hosting › **Adicionar domínio personalizado** ›
   `dp.spassessoriacontabil.com.br`. O console mostra os registros DNS (TXT de verificação e A ou CNAME); criar no
   mesmo painel em que foi criado o `app` do CFI. O certificado HTTPS sai sozinho em algumas horas.
3. **Login:** Firebase › Authentication › Configurações › **Domínios autorizados** › adicionar
   `dp.spassessoriacontabil.com.br`.
4. **Serviços que o DP chama:** a plataforma do DP (`sp-plataforma-dp`) e o CFI (WhatsApp e consultas que ainda
   passam por ele) aceitam o endereço novo. PRs: sp-plataforma e CFI, com o domínio na lista de origens.
5. **Testar** em `https://dp.spassessoriacontabil.com.br`: login, empresa ativa, cálculo, eSocial, e-mail e WhatsApp.
   O login é pedido de novo uma vez (o navegador guarda a sessão por endereço), e as preferências da tela também
   recomeçam.
   - O tema e a empresa ativa ficam guardados por endereço: no endereço novo, antes da virada, o DP abre no tema claro e pede a empresa. Depois da virada, quem entra pelo link antigo chega com os dois (`services/migracaoEndereco.ts`).
   - A versão publicada aparece no cabeçalho e na tela "Ativar empresa e período": é a mesma nos dois endereços.
6. **Virar a chave:** GitHub › repositório › Settings › Variables › `DP_ENDERECO_NOVO` =
   `https://dp.spassessoriacontabil.com.br` e rodar o "Deploy" (Actions › Run workflow). O link antigo passa a levar
   ao novo.
7. **Repositório privado:** depois que a equipe estiver usando o endereço novo, Settings › Danger Zone › Change
   visibility › Private. O GitHub Pages sai do ar (o link antigo deixa de redirecionar).

## Volta

Apagar `DP_ENDERECO_NOVO` e rodar o "Deploy": o GitHub Pages volta a ser o app (enquanto o repositório for público).
