// ══════════════════════════════════════════════════════
// Ikatu — Service Worker (PWA)
// Estratégia: network-first com fallback ao cache.
// Assim o app sempre usa a versão mais nova quando online,
// e ainda abre o básico se a rede falhar.
// ══════════════════════════════════════════════════════

// ⚠️ AO FAZER DEPLOY com mudanças: incremente a versão abaixo (v2 → v3 → ...).
// É isso que dispara o aviso "Nova versão disponível" nas abas abertas.
const CACHE = 'ikatu-v34';

// Arquivos básicos do app shell (pré-cacheados na instalação)
const SHELL = [
  'index.html',
  'login.html',
  'mobile/login.html',
  'admin.html',
  'manifest.json',
  'projetos.html',
  'pagamentos.html',
  'avisos.html',
  'chat.html',
  'links.html',
  'styles.css',
  'app.js',
  'supabase-client.js',
  'projetos.js',
  'pagamentos.js',
  'avisos.js',
  'chat.js',
  'logo_site.png',
  'favicon.ico',
  'icon-192.png',
  'icon-512.png',
  'modules/state.js',
  'modules/image-editor.js',
  'modules/pdf-generator.js',
  'modules/supabase-sync.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  // Não chama skipWaiting() automaticamente: o novo SW fica aguardando
  // até o usuário clicar em "Atualizar" no banner (mensagem abaixo).
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Só intercepta GET do próprio site — Supabase/CDNs passam direto
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Páginas HTML não pré-cacheadas passam direto para o servidor
  const pathname = url.pathname.replace(/^\//, '');
  const isHtml = url.pathname.endsWith('.html') || url.pathname === '/';
  if (isHtml && !SHELL.includes(pathname)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza o cache em segundo plano com a resposta fresca
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(cached => cached || new Response('Offline – arquivo não encontrado no cache.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }))
      )
  );
});
