// scripts/hosting/paginaRedirecionamento.mjs
//
// Endereço novo do DP (domínio da SP, Firebase Hosting): quando a variável DP_ENDERECO_NOVO do repositório está
// preenchida, a esteira troca o site do GitHub Pages por esta página, que leva quem abrir o link antigo para o mesmo
// caminho no endereço novo (favoritos e links de e-mail continuam funcionando enquanto o Pages existir), levando o
// tema e a empresa ativa de quem abriu (services/migracaoEndereco.ts grava no endereço novo).
//
// Uso: node scripts/hosting/paginaRedirecionamento.mjs <pasta-dist> <endereço-novo> [base-antiga]

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Endereço novo sem barra no fim; só https. */
export function enderecoNovo(valor) {
    const u = new URL(String(valor ?? '').trim());
    if (u.protocol !== 'https:') throw new Error('O endereço novo precisa ser https.');
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** HTML que redireciona preservando o caminho depois da base antiga, a busca e o # da tela. */
export function htmlRedirecionamento(novo, base = '/Consultor-DP-Folhapagamentos/') {
    const destino = enderecoNovo(novo);
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consultor DP mudou de endereço</title><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="3;url=${esc(destino)}/">
<script>
(function () {
  var base = ${JSON.stringify(base)}, p = location.pathname;
  var resto = p.indexOf(base) === 0 ? p.slice(base.length) : '';
  // Leva o tema e a empresa ativa guardados neste endereço (o app grava no novo: services/migracaoEndereco.ts).
  var levar = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^(consultor-dp:tema|dp_empresa_ativa:[A-Za-z0-9]{1,128})$/.test(k)) levar[k] = localStorage.getItem(k);
    }
  } catch (e) {}
  var busca = location.search.replace(/^\\?/, '').split('&').filter(function (x) { return x && x.indexOf('migrar=') !== 0; });
  if (Object.keys(levar).length) busca.push('migrar=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(levar))))));
  location.replace(${JSON.stringify(destino)} + '/' + resto + (busca.length ? '?' + busca.join('&') : '') + location.hash);
})();
</script></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1d1d1f">
<h1 style="font-size:1.25rem">O Consultor DP mudou de endereço</h1>
<p>Agora ele fica em <a href="${esc(destino)}/">${esc(destino)}</a>. Atualize o seu favorito.</p>
</body></html>
`;
}

/** Troca o conteúdo da pasta pelo redirecionamento (index.html e 404.html, para qualquer caminho antigo). */
export function gravarRedirecionamento(pasta, novo, base) {
    const html = htmlRedirecionamento(novo, base);
    mkdirSync(pasta, { recursive: true });
    for (const nome of readdirSync(pasta)) rmSync(join(pasta, nome), { recursive: true, force: true });
    writeFileSync(join(pasta, 'index.html'), html);
    writeFileSync(join(pasta, '404.html'), html);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const [pasta, novo, base] = process.argv.slice(2);
    if (!pasta || !novo) { console.error('Uso: node scripts/hosting/paginaRedirecionamento.mjs <pasta-dist> <endereço-novo> [base-antiga]'); process.exit(1); }
    gravarRedirecionamento(pasta, novo, base);
    console.log(`GitHub Pages redireciona para ${enderecoNovo(novo)}`);
}
