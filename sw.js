// ══════════════════════════════════════════════════════
// Ikatu — Service Worker (PWA)
// Estratégia: network-first com fallback ao cache.
// Assim o app sempre usa a versão mais nova quando online,
// e ainda abre o básico se a rede falhar.
// ══════════════════════════════════════════════════════

// ⚠️ AO FAZER DEPLOY com mudanças: incremente a versão abaixo (v2 → v3 → ...).
// É isso que dispara o aviso "Nova versão disponível" nas abas abertas.
const CACHE = 'ikatu-v3';

// Arquivos básicos do app shell (pré-cacheados na instalação)
const SHELL = [
  'index.html',
  'login.html',
  'manifest.json',
  'projetos.html',
  'pagamentos.html',
  'avisos.html',
  'chat.html',
  // 'email.html',
  'links.html',
  'styles.css',
  'app.js',
  'supabase-client.js',
  'projetos.js',
  'pagamentos.js',
  'avisos.js',
  'chat.js',
  // 'email.js',
  'logo_site.png',
  'favicon.ico',
  'icon-192.png',
  'icon-512.png'
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

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Atualiza o cache em segundo plano com a resposta fresca
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
