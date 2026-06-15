// ═══════════════════════════════════════════════════
// PROJETOS.JS — página de projetos gerados (autossuficiente)
// ═══════════════════════════════════════════════════

// Logo is handled globally by supabase-client.js

// ── IndexedDB ─────────────────────────────────────────────────────
let db = null;

function initDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('PranchaIGUI', 2);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('dados'))    d.createObjectStore('dados');
      if (!d.objectStoreNames.contains('projetos')) {
        const ps = d.createObjectStore('projetos', { keyPath: 'id' });
        ps.createIndex('id_projeto', 'id_projeto', { unique: false });
        ps.createIndex('loja',       'loja',       { unique: false });
        ps.createIndex('modelo',     'modelo',     { unique: false });
        ps.createIndex('ts',         'ts',         { unique: false });
      }
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror   = e => { console.warn('IndexedDB error', e); rej(e); };
  });
}

function dbSave(key, val) {
  if (!db) return;
  try {
    const tx  = db.transaction('dados', 'readwrite');
    tx.objectStore('dados').put(val, key);
  } catch(e) { console.warn('dbSave error:', e); }
}

function listarProjetos() {
  return new Promise(res => {
    if (!db) { res([]); return; }
    try {
      const tx  = db.transaction('projetos', 'readonly');
      const req = tx.objectStore('projetos').getAll();
      req.onsuccess = e => res((e.target.result || []).sort((a, b) => b.ts - a.ts));
      req.onerror   = () => res([]);
    } catch { res([]); }
  });
}

function deletarProjeto(id) {
  return new Promise(res => {
    if (!db) { res(); return; }
    try {
      const tx = db.transaction('projetos', 'readwrite');
      tx.objectStore('projetos').delete(id);
      tx.oncomplete = () => res();
    } catch { res(); }
  });
}

// ── Utilitários ───────────────────────────────────────────────────
function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let toastTimer;
function showToast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.textContent = msg; // texto puro: evita HTML injetado (ex.: mensagens de erro)
  t.className = `toast ${tipo} show`;
  toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
}
// Variante para toasts com HTML confiável (ex.: link "Desfazer")
function showToastHTML(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.innerHTML = msg;
  t.className = `toast ${tipo} show`;
  toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
}

// ── Renderização ──────────────────────────────────────────────────
let _busca = '';
let _filtroUsuario = '';     // '' = todos
let _todasPranchas = [];    // cache da última busca ao banco
let _pagAtual = 1;
const PRANCHAS_POR_PAGINA = 8;
let animarLista = false;     // próxima renderização entra com animação em cascata

/** Gera as pills de filtro por usuário */
function renderUserFilters(lista) {
  const bar = document.getElementById('userFilterBar');
  if (!bar) return;

  // Coleta usuários únicos (sem vazio)
  const usuarios = [...new Set(
    lista.map(p => p.created_by || '').filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Só mostra a barra se tiver mais de 1 usuário
  if (usuarios.length <= 1) { bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  bar.innerHTML = '';

  // Pill "Todos"
  const todos = document.createElement('button');
  todos.className = 'proj-filter-pill' + (_filtroUsuario === '' ? ' active' : '');
  todos.innerHTML = `<span class="pf-dot"></span>Todos`;
  todos.onclick = () => { _filtroUsuario = ''; _pagAtual = 1; animarLista = true; renderUserFilters(_todasPranchas); renderListaPranchas(); };
  bar.appendChild(todos);

  // Uma pill por usuário
  usuarios.forEach(user => {
    const pill = document.createElement('button');
    pill.className = 'proj-filter-pill' + (_filtroUsuario === user ? ' active' : '');
    pill.innerHTML = `<span class="pf-dot"></span>${escapeHtml(user)}`;
    pill.onclick = () => { _filtroUsuario = user; _pagAtual = 1; animarLista = true; renderUserFilters(_todasPranchas); renderListaPranchas(); };
    bar.appendChild(pill);
  });
}

/** Calcula o range de páginas a exibir (ex: [1, '...', 4, 5, 6, '...', 12]) */
function _paginationRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

/** Navega para uma página e re-renderiza */
function irParaPagina(n) {
  _pagAtual = n;
  animarLista = true;
  renderListaPranchas();
  const lista = document.getElementById('projetosLista');
  if (lista) lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Filtra e renderiza os cards (não vai ao banco) */
function renderListaPranchas() {
  const animar = animarLista;
  animarLista = false;
  const q = _busca.trim().toUpperCase();
  let filtrados = _todasPranchas;

  // Filtro por usuário
  if (_filtroUsuario) {
    filtrados = filtrados.filter(p => (p.created_by || '') === _filtroUsuario);
  }

  // Filtro por busca de texto
  if (q) {
    filtrados = filtrados.filter(p =>
      (p.project_code || '').toUpperCase().includes(q) ||
      (p.store        || '').toUpperCase().includes(q) ||
      (p.model        || '').toUpperCase().includes(q) ||
      (p.client_name  || '').toUpperCase().includes(q) ||
      (p.city         || '').toUpperCase().includes(q)
    );
  }

  const total      = filtrados.length;
  const totalPags  = Math.max(1, Math.ceil(total / PRANCHAS_POR_PAGINA));
  if (_pagAtual > totalPags) _pagAtual = totalPags;
  const inicio     = (_pagAtual - 1) * PRANCHAS_POR_PAGINA;
  const paginados  = filtrados.slice(inicio, inicio + PRANCHAS_POR_PAGINA);

  const container = document.getElementById('projetosLista');
  const countEl   = document.getElementById('projetosCount');
  container.innerHTML = '';

  // Contador: mostra intervalo quando há paginação
  if (total === 0) {
    countEl.textContent = 'Nenhuma prancha encontrada';
  } else if (totalPags > 1) {
    const fim = Math.min(inicio + PRANCHAS_POR_PAGINA, total);
    countEl.textContent = `${inicio + 1}–${fim} de ${total} pranchas`;
  } else {
    countEl.textContent = total === 1 ? '1 prancha' : `${total} pranchas`;
  }

  if (total === 0) {
    container.innerHTML = `
      <div class="proj-empty">
        📂 Nenhuma prancha encontrada.<br>
        <a href="index.html" class="proj-link-gerador">Ir para o Gerador e gerar um PDF</a>
      </div>`;
    return;
  }

  paginados.forEach((p, i) => {
    const data      = p.proj_date || new Date(p.updated_at).toLocaleDateString('pt-BR');
    const thumbHtml = p.thumbnail_url
      ? `<img src="${p.thumbnail_url}" class="proj-thumb" alt="Thumbnail">`
      : '<div class="proj-thumb proj-thumb-empty">🏊</div>';

    const card = document.createElement('div');
    card.className = 'proj-card';
    if (animar) {
      card.classList.add('row-entrada');
      card.style.animationDelay = `${Math.min(i * 70, 1000)}ms`;
    }
    card.innerHTML = `
      ${thumbHtml}
      <div class="proj-info">
        <div class="proj-id">${escapeHtml(p.project_code || '—')}</div>
        <div class="proj-cliente">${escapeHtml(p.client_name || '—')}</div>
        <div class="proj-meta">
          <span class="proj-tag">🏢 ${escapeHtml(p.store || '—')}</span>
          <span class="proj-tag">🏊 ${escapeHtml(p.model || '—')}</span>
          <span class="proj-tag">📅 ${escapeHtml(data)}</span>
          ${p.created_by ? `<span class="proj-tag" title="Projetista">👤 ${escapeHtml(p.created_by)}</span>` : ''}
        </div>
      </div>
      <div class="proj-actions">
        <button class="proj-btn proj-btn-dup" onclick="duplicarProjeto('${escapeHtml(p.id)}')" title="Abrir como nova prancha (sem sobrescrever o original)">
          📋 Duplicar
        </button>
        <button class="proj-btn proj-btn-load" onclick="editarProjeto('${escapeHtml(p.id)}')" title="Carregar e editar no gerador">
          ✏️ Editar
        </button>
        <button class="proj-btn proj-btn-del" onclick="confirmarDeletar('${escapeHtml(p.id)}')" title="Excluir do histórico">
          🗑
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // ── Controles de paginação ────────────────────────────────────────
  if (totalPags > 1) {
    const pag = document.createElement('div');
    pag.className = 'proj-pagination';

    const prev = document.createElement('button');
    prev.className = 'proj-pag-btn' + (_pagAtual === 1 ? ' disabled' : '');
    prev.disabled  = _pagAtual === 1;
    prev.innerHTML = '&#8249;';
    prev.title     = 'Página anterior';
    prev.onclick   = () => irParaPagina(_pagAtual - 1);
    pag.appendChild(prev);

    _paginationRange(_pagAtual, totalPags).forEach(n => {
      if (n === '...') {
        const dots = document.createElement('span');
        dots.className   = 'proj-pag-dots';
        dots.textContent = '…';
        pag.appendChild(dots);
      } else {
        const btn = document.createElement('button');
        btn.className   = 'proj-pag-btn' + (n === _pagAtual ? ' active' : '');
        btn.textContent = n;
        btn.onclick     = () => irParaPagina(n);
        pag.appendChild(btn);
      }
    });

    const next = document.createElement('button');
    next.className = 'proj-pag-btn' + (_pagAtual === totalPags ? ' disabled' : '');
    next.disabled  = _pagAtual === totalPags;
    next.innerHTML = '&#8250;';
    next.title     = 'Próxima página';
    next.onclick   = () => irParaPagina(_pagAtual + 1);
    pag.appendChild(next);

    container.appendChild(pag);
  }
}

// Cards-fantasma enquanto as pranchas carregam do Supabase
function mostrarSkeletonPranchas() {
  const container = document.getElementById('projetosLista');
  if (!container) return;
  container.innerHTML = [[70, 45], [85, 55], [60, 40], [75, 50]].map(ws => `
    <div class="proj-skel-card">
      <div class="skel-bar proj-skel-thumb"></div>
      <div class="proj-skel-lines">
        <div class="skel-bar" style="width:${ws[0] * 2}px;height:13px;"></div>
        <div class="skel-bar" style="width:${ws[1] * 3}px;height:10px;"></div>
      </div>
    </div>`).join('');
}

async function renderProjetos() {
  try {
    const lista = await sbListarProjetos();
    _todasPranchas = lista;
    renderUserFilters(lista);
    animarLista = true; // entrada em cascata ao carregar do banco
    renderListaPranchas();
  } catch (e) {
    console.error('Erro ao renderizar pranchas:', e);
    const container = document.getElementById('projetosLista');
    const countEl   = document.getElementById('projetosCount');
    if (countEl) countEl.textContent = 'Erro ao carregar pranchas';
    if (container) {
      container.innerHTML = `
        <div class="proj-empty" style="color: #e74c3c; border-color: rgba(231,76,60,.25); background: #fdf2f1;">
          ⚠️ Erro ao carregar pranchas: ${escapeHtml(e.message)}<br>
          <button class="proj-link-gerador" onclick="renderProjetos()">Tentar Novamente</button>
        </div>`;
    }
  }
}


function buscarProjetos(q) {
  if (_modoLixeira) return; // busca não se aplica à lixeira
  _busca    = q;
  _pagAtual = 1; // volta à primeira página ao buscar
  const btn = document.getElementById('btnLimparBusca');
  if (btn) btn.classList.toggle('visible', q.length > 0);
  renderListaPranchas();
}

function limparBusca() {
  _busca    = '';
  _pagAtual = 1;
  const campo = document.getElementById('campoBusca');
  const btn   = document.getElementById('btnLimparBusca');
  if (campo) campo.value = '';
  if (btn)   btn.classList.remove('visible');
  renderListaPranchas();
}

// ── Duplicar: abre como nova prancha (sem _editandoId) ───────────
async function duplicarProjeto(id) {
  mostrarLoadOverlay('Carregando projeto...', 10);
  try {
    const proj = await sbCarregarProjeto(id);
    if (!proj?.session_data) { showToast('❌ Dados não encontrados.', 'err'); return; }
    mostrarLoadOverlay('Baixando imagens...', 30);
    const sessao = await sbDeserializeSessionData(proj.session_data);
    mostrarLoadOverlay('Quase lá...', 90);
    // Duplicar: sem _editandoId para criar novo registro
    delete sessao._editandoId;
    sessionStorage.setItem('igui_cloud_load', JSON.stringify({ sessao, editandoId: null }));
    showToast('📋 Abrindo como nova prancha...', 'ok');
    setTimeout(() => { window.location.href = 'index.html'; }, 400);
  } catch(e) {
    ocultarLoadOverlay();
    showToast('❌ Erro ao carregar: ' + e.message, 'err');
  }
}

// ── Editar: salva no autosave e redireciona ───────────────────────
async function editarProjeto(id) {
  mostrarLoadOverlay('Carregando projeto...', 10);
  try {
    const proj = await sbCarregarProjeto(id);
    if (!proj?.session_data) { showToast('❌ Dados não encontrados.', 'err'); return; }
    mostrarLoadOverlay('Baixando imagens...', 30);
    const sessao = await sbDeserializeSessionData(proj.session_data);
    mostrarLoadOverlay('Quase lá...', 90);
    // Editar: passar o ID para atualizar o mesmo registro ao gerar PDF
    sessionStorage.setItem('igui_cloud_load', JSON.stringify({ sessao, editandoId: proj.id }));
    showToast('✅ Abrindo no gerador...', 'ok');
    setTimeout(() => { window.location.href = 'index.html'; }, 400);
  } catch(e) {
    ocultarLoadOverlay();
    showToast('❌ Erro ao carregar: ' + e.message, 'err');
  }
}

// ── Deletar (mover para a Lixeira) ────────────────────────────────
let _idParaDeletar = null;

function confirmarDeletar(id) {
  _idParaDeletar = id;
  document.getElementById('delModalTitle').textContent = 'Mover para a Lixeira';
  document.getElementById('delModalMsg').innerHTML =
    'A prancha vai para a <strong>Lixeira</strong>, onde pode ser restaurada por até <strong>30 dias</strong>. Depois disso é excluída definitivamente.<br><strong>O PDF já gerado não é afetado.</strong>';
  const btn = document.getElementById('btnConfirmDel');
  btn.textContent = 'Mover para Lixeira';
  btn.onclick = async () => {
    const idAlvo = _idParaDeletar; // salva local ANTES de fechar (fechar zera a var)
    fecharModalDel();
    if (!idAlvo) return;
    try {
      await sbMoverParaLixeira(idAlvo);
      renderProjetos();
      showToastHTML(`🗑 Prancha movida para a Lixeira. <a href="javascript:void(0)" onclick="desfazerLixeira('${escapeHtml(idAlvo)}')" style="color:#60a5fa;font-weight:700;text-decoration:underline;margin-left:8px;">Desfazer</a>`, 'ok');
    } catch (e) {
      showToast('❌ Erro: ' + e.message, 'err');
    }
  };
  document.getElementById('delModal').classList.add('show');
}

async function desfazerLixeira(id) {
  try {
    await sbRestaurarProjeto(id);
    showToast('↩ Prancha restaurada!', 'ok');
    renderProjetos();
  } catch (e) {
    showToast('❌ Erro ao restaurar: ' + e.message, 'err');
  }
}

// ── Lixeira ───────────────────────────────────────────────────────
let _modoLixeira = false;

async function toggleLixeira() {
  _modoLixeira = !_modoLixeira;
  const btn = document.getElementById('btnLixeira');
  const filtros = document.getElementById('userFilterBar');
  if (_modoLixeira) {
    btn?.classList.add('active');
    if (filtros) filtros.style.display = 'none';
    await renderLixeira();
  } else {
    btn?.classList.remove('active');
    renderProjetos();
  }
}

async function renderLixeira() {
  const container = document.getElementById('projetosLista');
  const countEl   = document.getElementById('projetosCount');
  mostrarSkeletonPranchas();

  let lista = [];
  try {
    lista = await sbListarLixeira();
  } catch (e) {
    container.innerHTML = `<div class="proj-empty">⚠️ Erro ao carregar a lixeira: ${escapeHtml(e.message)}</div>`;
    return;
  }

  countEl.textContent = lista.length
    ? `${lista.length} prancha${lista.length > 1 ? 's' : ''} na lixeira`
    : 'Lixeira vazia';

  container.innerHTML = '';
  if (!lista.length) {
    container.innerHTML = `<div class="proj-empty">🗑 A lixeira está vazia.</div>`;
    return;
  }

  lista.forEach((p, i) => {
    const dias = Math.max(0, 30 - Math.floor((Date.now() - new Date(p.deleted_at).getTime()) / 86400000));
    const thumbHtml = p.thumbnail_url
      ? `<img src="${p.thumbnail_url}" class="proj-thumb" alt="Thumbnail">`
      : '<div class="proj-thumb proj-thumb-empty">🏊</div>';

    const card = document.createElement('div');
    card.className = 'proj-card row-entrada';
    card.style.animationDelay = `${Math.min(i * 70, 1000)}ms`;
    card.innerHTML = `
      ${thumbHtml}
      <div class="proj-info">
        <div class="proj-id">${escapeHtml(p.project_code || '—')}</div>
        <div class="proj-cliente">${escapeHtml(p.client_name || '—')}</div>
        <div class="proj-meta">
          <span class="proj-tag">🏢 ${escapeHtml(p.store || '—')}</span>
          <span class="proj-tag">🏊 ${escapeHtml(p.model || '—')}</span>
          <span class="proj-tag" style="color:#b91c1c" title="Será excluída definitivamente após 30 dias na lixeira">⏳ ${dias} dia${dias === 1 ? '' : 's'} restante${dias === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="proj-actions">
        <button class="proj-btn proj-btn-load" onclick="restaurarDaLixeira('${escapeHtml(p.id)}')" title="Devolver ao histórico">↩ Restaurar</button>
        <button class="proj-btn proj-btn-del" onclick="confirmarDeletarDefinitivo('${escapeHtml(p.id)}','${escapeHtml(p.user_id)}')" title="Excluir para sempre">🗑</button>
      </div>
    `;
    container.appendChild(card);
  });
}

async function restaurarDaLixeira(id) {
  try {
    await sbRestaurarProjeto(id);
    showToast('↩ Prancha restaurada!', 'ok');
    renderLixeira();
  } catch (e) {
    showToast('❌ Erro ao restaurar: ' + e.message, 'err');
  }
}

function confirmarDeletarDefinitivo(id, userId) {
  document.getElementById('delModalTitle').textContent = 'Excluir Definitivamente';
  document.getElementById('delModalMsg').innerHTML =
    'A prancha e suas imagens serão apagadas <strong>para sempre</strong>. Esta ação <strong>não pode ser desfeita</strong>.';
  const btn = document.getElementById('btnConfirmDel');
  btn.textContent = 'Excluir para sempre';
  btn.onclick = async () => {
    fecharModalDel();
    try {
      await sbDeletarProjetoAdmin(id, userId);
      showToast('🗑 Prancha excluída definitivamente.', 'ok');
    } catch (e) {
      showToast('❌ Erro: ' + e.message, 'err');
    }
    renderLixeira();
  };
  document.getElementById('delModal').classList.add('show');
}

function fecharModalDel() {
  document.getElementById('delModal').classList.remove('show');
  _idParaDeletar = null;
}

// ── Exportar todos como ZIP ───────────────────────────────────────
async function exportarTodos() {
  const lista = await sbListarProjetos();
  if (!lista.length) { showToast('Nenhuma prancha para exportar.', 'err'); return; }

  showToast('📦 Preparando ZIP...', 'ok');

  // Carrega JSZip dinamicamente se não estiver disponível
  if (!window.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }).catch(() => { showToast('❌ Erro ao carregar biblioteca ZIP.', 'err'); });
    if (!window.JSZip) return;
  }

  const zip = new JSZip();
  lista.forEach(p => {
    const sessao = { version:'1.0', app:'PranchaIGUI', ts: p.ts, ...p.sessao };
    const nome = [
      p.id_projeto || 'SEM_ID',
      p.cliente    || 'SEM_CLIENTE',
      new Date(p.ts).toLocaleDateString('pt-BR').replace(/\//g,'-'),
    ].join('_').replace(/\s+/g,'_') + '.igui';
    zip.file(nome, JSON.stringify(sessao));
  });

  const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{level:6} });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `iGUi_Pranchas_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`✅ ${lista.length} prancha(s) exportada(s) no ZIP!`, 'ok');
}

// ── Init ──────────────────────────────────────────────────────────
// ── Helpers overlay ──────────────────────────────────────────────
function mostrarLoadOverlay(msg, pct) {
  const ov = document.getElementById('loadOverlay');
  const txt = document.getElementById('loadOverlayTxt');
  const bar = document.getElementById('loadOverlayBar');
  if (ov)  ov.classList.add('show');
  if (txt) txt.textContent = msg;
  if (bar) bar.style.width = (pct||0)+'%';
}
function ocultarLoadOverlay() {
  document.getElementById('loadOverlay')?.classList.remove('show');
}

document.addEventListener('DOMContentLoaded', async () => {
  mostrarSkeletonPranchas();

  // Auth check (usa cache local — não vai à rede)
  const session = await sbRequireAuth();
  if (!session) return;

  // Perfil e lista de pranchas em PARALELO — elimina o waterfall
  const [profile] = await Promise.all([
    sbGetProfile().catch(e => { console.warn('Profile error:', e); return null; }),
    renderProjetos(),
  ]);

  // Atualiza UI do usuário com o que veio do banco
  if (profile) {
    const displayName = profile.name || profile.email || '—';
    const el = document.getElementById('hdrUser');
    if (el) el.textContent = displayName;
    const av = document.getElementById('userAvatar');
    if (av && displayName !== '—') {
      const pts = displayName.trim().split(/\s+/);
      av.textContent = ((pts[0]?.[0]||'') + (pts[1]?.[0]||'')).toUpperCase() || '?';
    }
    if (profile.role === 'admin') {
      const badge = document.getElementById('adminBadge');
      const nav   = document.getElementById('navAdmin');
      if (badge) badge.style.display = 'inline-block';
      if (nav)   nav.style.display   = 'flex';
    }
  }

  sbVerificarMsgNaoLidas().then(temNova => {
    const badge = document.getElementById('chatNavBadge');
    if (badge) badge.style.display = temNova ? 'block' : 'none';
  }).catch(() => {});

  // Purga em segundo plano: itens na lixeira há mais de 30 dias
  sbPurgarLixeiraAntiga().catch(() => {});
});
