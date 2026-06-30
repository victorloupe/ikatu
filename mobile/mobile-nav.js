// ═══════════════════════════════════════════════════
// iGUi Space — Mobile Navigation
// Bottom nav + badges + pull-to-refresh
// ═══════════════════════════════════════════════════

(function () {
  // ─── SVGs minimalistas ────────────────────────────
  const ICONS = {
    prancha: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
    avisos:  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1a4.5 4.5 0 0 0-4.5 4.5V9L2 11h12l-1.5-2V5.5A4.5 4.5 0 0 0 8 1z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>`,
    chat:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v5A1.5 1.5 0 0 1 12.5 11H6l-3 2.5V11H3.5A1.5 1.5 0 0 1 2 9.5z"/></svg>`,
    pagamentos: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="14" height="9" rx="1.5"/><path d="M1 7h14"/><path d="M4 10.5h2"/><path d="M8 10.5h4"/></svg>`,
    admin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  };

  // ─── Itens do nav ──────────────────────────────────
  const NAV_ITEMS_BASE = [
    { id: 'nav-prancha',    href: 'prancha.html',    icon: ICONS.prancha,    label: 'Pranchas',   badge: null },
    { id: 'nav-avisos',     href: 'avisos.html',     icon: ICONS.avisos,     label: 'Avisos',     badge: 'avisos' },
    { id: 'nav-chat',       href: 'chat.html',       icon: ICONS.chat,       label: 'Chat',       badge: 'chat' },
    { id: 'nav-pagamentos', href: 'pagamentos.html', icon: ICONS.pagamentos, label: 'Pagamentos', badge: null },
  ];
  const NAV_ITEM_ADMIN = { id: 'nav-admin', href: 'admin.html', icon: ICONS.admin, label: 'Admin', badge: null };

  // ─── Página atual ──────────────────────────────────
  function paginaAtual() {
    const parts = location.pathname.split('/');
    return parts[parts.length - 1] || 'index.html';
  }

  function isActive(href) {
    return href ? paginaAtual() === href : false;
  }

  // ─── Toast global ──────────────────────────────────
  window.mToast = function (msg, tipo = '') {
    let el = document.getElementById('mToastGlobal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mToastGlobal';
      el.className = 'm-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'm-toast' + (tipo ? ' ' + tipo : '');
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3000);
  };

  // ─── Render do bottom nav ──────────────────────────
  function renderNav(isAdmin) {
    const nav = document.createElement('nav');
    nav.className = 'm-nav';
    nav.id = 'mBottomNav';

    const items = isAdmin ? [...NAV_ITEMS_BASE, NAV_ITEM_ADMIN] : NAV_ITEMS_BASE;

    items.forEach(item => {
      const el = document.createElement('a');
      el.className = 'm-nav-item' + (isActive(item.href) ? ' active' : '');
      el.id = item.id;
      el.href = item.href;

      const badgeHtml = item.badge
        ? `<span class="m-nav-badge" id="badge-${item.badge}"></span>`
        : '';

      el.innerHTML = `
        ${badgeHtml}
        <span class="m-nav-icon">${item.icon}</span>
        <span class="m-nav-label">${item.label}</span>
      `;
      const svgEl = el.querySelector('svg');
      if (svgEl) { svgEl.style.width = '22px'; svgEl.style.height = '22px'; svgEl.style.display = 'block'; }

      nav.appendChild(el);
    });

    document.body.appendChild(nav);
  }

  // ─── Badges ────────────────────────────────────────
  function atualizarBadge(id, count) {
    const el = document.getElementById('badge-' + id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : count;
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  window.mSetAvisosBadge = (n) => atualizarBadge('avisos', n);
  window.mSetChatBadge   = (n) => atualizarBadge('chat', n);

  // ─── Bridge: badge de chat ─────────────────────────
  function initChatBadgeBridge() {
    if (document.getElementById('chatDmNavBadge')) return;
    const phantom = document.createElement('div');
    phantom.id = 'chatDmNavBadge';
    phantom.style.display = 'none';
    document.body.appendChild(phantom);

    new MutationObserver(() => {
      const visible = phantom.style.display !== 'none';
      window.mSetChatBadge(visible ? 1 : 0);
    }).observe(phantom, { attributes: true, attributeFilter: ['style'] });
  }

  // ─── Realtime: badge de avisos ─────────────────────
  async function initAvisosBadge() {
    try {
      await new Promise(r => {
        if (typeof sbListarCanais === 'function') return r();
        const t = setInterval(() => {
          if (typeof sbListarCanais === 'function') { clearInterval(t); r(); }
        }, 100);
        setTimeout(() => { clearInterval(t); r(); }, 6000);
      });

      if (typeof sbListarCanais !== 'function') return;
      const session = await sbGetSession();
      if (!session) return;

      const canais = await sbListarCanais().catch(() => []);
      const geral  = canais.find(c => c.type === 'public');
      if (!geral) return;

      const lastVisit = localStorage.getItem('igui_avisos_last_visit') || new Date(0).toISOString();
      const { count } = await sb.from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', geral.id)
        .neq('sender_id', session.user.id)
        .gt('created_at', lastVisit);

      window.mSetAvisosBadge(count || 0);

      if (paginaAtual() === 'avisos.html') return;

      sb.channel(`mobile-avisos-badge-${geral.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${geral.id}`
        }, payload => {
          if (payload.new?.sender_id === session.user.id) return;
          const el = document.getElementById('badge-avisos');
          const cur = parseInt(el?.textContent || '0') || 0;
          window.mSetAvisosBadge(cur + 1);
        })
        .subscribe();
    } catch (e) { console.warn('[mobile-nav] initAvisosBadge:', e); }
  }

  // ─── Pull-to-refresh ───────────────────────────────
  function initPullToRefresh() {
    let startY = 0;
    let pulling = false;
    let ind = null;

    function getInd() {
      if (!ind) {
        ind = document.createElement('div');
        ind.id = 'mPtrIndicator';
        Object.assign(ind.style, {
          position: 'fixed',
          top: 'var(--header-h)',
          left: '0', right: '0',
          height: '0px',
          overflow: 'hidden',
          background: 'var(--blue)',
          color: '#fff',
          fontSize: '12px',
          fontWeight: '600',
          letterSpacing: '0.3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: '150',
          transition: 'height 0.08s linear',
        });
        document.body.appendChild(ind);
      }
      return ind;
    }

    document.addEventListener('touchstart', e => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { pulling = false; return; }
      const progress = Math.min(dy / 72, 1);
      const i = getInd();
      i.style.height = (progress * 38) + 'px';
      i.textContent = progress >= 1 ? '↑ Solte para atualizar' : '↓ Puxe para atualizar';
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!pulling) return;
      pulling = false;
      const dy = e.changedTouches[0].clientY - startY;
      const i = getInd();
      i.style.height = '0';
      if (dy >= 72) {
        if (typeof window.ptrRecarregar === 'function') {
          window.ptrRecarregar();
        } else {
          location.reload();
        }
      }
    }, { passive: true });
  }

  // ─── Nome no header ────────────────────────────────
  function preencherNomeHeader(nome) {
    const el = document.getElementById('mHeaderUser');
    if (el) el.textContent = nome || '';
  }

  // ─── Init ──────────────────────────────────────────
  async function init() {
    if (typeof sbGetProfile !== 'function') {
      setTimeout(init, 100);
      return;
    }

    // Renderiza imediatamente via cache (evita piscar)
    const cachedAdmin = sessionStorage.getItem('igui_is_admin') === '1';
    const cachedNome  = sessionStorage.getItem('igui_nav_nome') || '';
    preencherNomeHeader(cachedNome);
    renderNav(cachedAdmin);

    const pg = paginaAtual();
    if (pg === 'avisos.html') {
      localStorage.setItem('igui_avisos_last_visit', new Date().toISOString());
      window.mSetAvisosBadge(0);
    }

    initChatBadgeBridge();
    initAvisosBadge();
    initPullToRefresh();

    // Atualiza perfil em background
    try {
      const profile = await sbGetProfile();
      const isAdmin = profile?.role === 'admin';
      const nome    = profile?.name || profile?.email || '';
      sessionStorage.setItem('igui_is_admin', isAdmin ? '1' : '0');
      sessionStorage.setItem('igui_nav_nome', nome);

      preencherNomeHeader(nome);
      if (isAdmin !== cachedAdmin) {
        const nav = document.getElementById('mBottomNav');
        if (nav) nav.remove();
        renderNav(isAdmin);
      }
    } catch (e) { console.warn('[mobile-nav] refreshUser:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
