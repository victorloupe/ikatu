// ════════════════════════════════════════════════════════════════════════
//  Chat — iGUi Space  ·  GetStream Chat
//  Canal "Geral" da equipe + Mensagens Diretas 1:1 + envio de arquivos.
//  Token gerado pela Edge Function `stream-token` (API Secret fica no servidor).
// ════════════════════════════════════════════════════════════════════════

// ── State ───────────────────────────────────────────────────────────────
let client = null;            // StreamChat client
let meId = null;              // id do usuário logado (= id no Stream)
let meNome = '';
let isAdmin = false;
let usuarios = [];            // profiles da equipe (sem mim)
let canalAtual = null;        // channel Stream aberto
let peerAtualId = null;       // id da pessoa (null no canal Geral)
let ehGrupoAtual = false;     // true quando o canal aberto é o Geral
let listenerCanal = null;     // unsubscribe do listener de mensagens
let anexosPendentes = [];     // arquivos já enviados ao Stream, aguardando a mensagem
let enviandoAnexo = false;

const ID_GERAL = 'geral';

// ── Boot ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    if (typeof StreamChat === 'undefined') {
      return mostrarErroConexao('Biblioteca do chat não carregou. Verifique sua conexão.');
    }

    const session = await sbGetSession();
    if (!session) { location.href = 'login.html'; return; }

    const profile = await sbGetProfile().catch(() => null);
    meId = session.user.id;
    meNome = (profile && profile.name) || localStorage.getItem('igui_user_name') || 'Você';
    isAdmin = !!(profile && profile.role === 'admin');

    const creds = await obterCredenciaisStream();
    if (!creds) return;

    client = StreamChat.getInstance(creds.apiKey);
    await client.connectUser({ id: creds.userId, name: meNome }, creds.token);

    client.on(ev => {
      if (typeof ev.total_unread_count === 'number') atualizarBadgeTotal(ev.total_unread_count);
      if (ev.type === 'message.new' && (!canalAtual || ev.cid !== canalAtual.cid)) {
        marcarUnreadNaLista();
      }
    });
    atualizarBadgeTotal(client.user?.total_unread_count || 0);

    await carregarUsuarios();
    configurarDragDrop();

  } catch (e) {
    console.error('[chat] erro de inicialização:', e);
    mostrarErroConexao('Não foi possível conectar ao chat. ' + (e?.message || ''));
  }
}

async function obterCredenciaisStream() {
  const session = await sbGetSession();
  if (!session) { location.href = 'login.html'; return null; }
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/stream-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
  });
  if (!resp.ok) {
    let msg = 'Falha ao obter token (' + resp.status + ')';
    try { const j = await resp.json(); if (j.error) msg = j.error; } catch (_) {}
    throw new Error(msg);
  }
  return await resp.json(); // { token, apiKey, userId }
}

// ── Lista (Geral + pessoas) ─────────────────────────────────────────────
async function carregarUsuarios() {
  let profiles = [];
  try { profiles = await sbListarUsuarios(); } catch (_) { profiles = []; }

  usuarios = (profiles || [])
    .filter(p => p && p.id && p.id !== meId && p.active !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  const cont = document.getElementById('dmUserList');
  const skel = document.getElementById('dmListSkel');
  if (skel) skel.remove();

  const geralHtml = `
    <div class="chat-section-label">EQUIPE</div>
    <button class="chat-ch-item conv-geral" data-conv="geral" onclick="abrirGeral()">
      <span class="chat-dm-avatar grupo">#</span>
      <span class="dm-user-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Geral</span>
      <span class="dm-unread-dot" data-dot="geral" style="display:none;"></span>
    </button>
    <div class="chat-section-label" style="margin-top:12px;">MENSAGENS DIRETAS</div>`;

  let usersHtml;
  if (!usuarios.length) {
    usersHtml = '<div style="padding:10px 14px;font-size:12px;color:var(--muted);">Nenhuma outra pessoa na equipe ainda.</div>';
  } else {
    usersHtml = usuarios.map(u => `
      <button class="chat-ch-item dm-user" data-peer="${escHtml(u.id)}" data-name="${escHtml(u.name || 'Usuário')}" onclick="selecionarPeer('${escHtml(u.id)}')">
        <span class="chat-dm-avatar">${escHtml(iniciais(u.name))}</span>
        <span class="dm-user-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(u.name || 'Usuário')}</span>
        <span class="dm-unread-dot" data-dot="${escHtml(u.id)}" style="display:none;"></span>
      </button>
    `).join('');
  }

  cont.innerHTML = geralHtml + usersHtml;
  marcarUnreadNaLista();
}

// Consulta os canais do Stream e marca quem tem mensagem não lida
async function marcarUnreadNaLista() {
  if (!client) return;
  try {
    const canais = await client.queryChannels(
      { type: 'messaging', members: { $in: [meId] } },
      { last_message_at: -1 },
      { watch: false, state: true, limit: 30 }
    );
    document.querySelectorAll('[data-dot]').forEach(d => d.style.display = 'none');
    for (const ch of canais) {
      const naoLidas = ch.countUnread();
      const chave = (ch.id === ID_GERAL) ? 'geral' : outroMembro(ch);
      if (!chave) continue;
      const dot = document.querySelector(`[data-dot="${cssEsc(chave)}"]`);
      if (dot) dot.style.display = naoLidas > 0 ? 'block' : 'none';
    }
  } catch (e) { /* silencioso */ }
}

function outroMembro(channel) {
  const ids = Object.keys(channel.state?.members || {});
  return ids.find(id => id !== meId) || null;
}

// ── Abrir canal Geral ───────────────────────────────────────────────────
async function abrirGeral() {
  if (!client) return;
  peerAtualId = null;
  ehGrupoAtual = true;
  marcarItemAtivo('[data-conv="geral"]');
  const channel = client.channel('messaging', ID_GERAL);
  await montarConversa(channel, 'Geral', 'Conversa de toda a equipe', '#');
}

// ── Abrir conversa 1:1 ──────────────────────────────────────────────────
async function selecionarPeer(peerId) {
  if (!client || !peerId) return;
  peerAtualId = peerId;
  ehGrupoAtual = false;
  const u = usuarios.find(x => x.id === peerId);
  const peerNome = (u && u.name) || 'Usuário';
  marcarItemAtivo(`[data-peer="${cssEsc(peerId)}"]`);
  const channel = client.channel('messaging', { members: [meId, peerId] });
  await montarConversa(channel, peerNome, 'Mensagem direta', iniciais(peerNome));
}

function marcarItemAtivo(sel) {
  document.querySelectorAll('.chat-ch-item').forEach(b => b.classList.remove('active'));
  const el = document.querySelector(sel);
  if (el) el.classList.add('active');
}

// ── Montagem comum da conversa ──────────────────────────────────────────
async function montarConversa(channel, titulo, subtitulo, avatarTxt) {
  document.getElementById('chatEmpty').style.display = 'none';
  document.getElementById('chatConv').style.display = 'flex';
  document.getElementById('chatConnError').style.display = 'none';
  document.getElementById('chatPeerName').textContent = titulo;
  document.getElementById('chatPeerStatus').textContent = subtitulo;
  const av = document.getElementById('chatPeerAvatar');
  av.textContent = avatarTxt;
  av.classList.toggle('grupo', ehGrupoAtual);
  document.getElementById('chatWrap').classList.add('mobile-conv');

  limparAnexosPendentes();
  const lista = document.getElementById('msgList');
  lista.innerHTML = skeletonMensagens();

  if (listenerCanal) { try { listenerCanal.unsubscribe(); } catch (_) {} listenerCanal = null; }

  try {
    await channel.watch();
    canalAtual = channel;

    renderizarMensagens(channel.state.messages || []);
    await channel.markRead().catch(() => {});

    listenerCanal = channel.on('message.new', () => {
      renderizarMensagens(canalAtual.state.messages || []);
      if (document.visibilityState === 'visible') channel.markRead().catch(() => {});
    });
    channel.on('message.updated', () => renderizarMensagens(canalAtual.state.messages || []));
    channel.on('message.deleted', () => renderizarMensagens(canalAtual.state.messages || []));

    const btnMore = document.getElementById('btnLoadMore');
    btnMore.style.display = (channel.state.messages || []).length >= 25 ? 'block' : 'none';

    marcarUnreadNaLista();
    document.getElementById('chatInput')?.focus();
  } catch (e) {
    console.error('[chat] erro ao abrir conversa:', e);
    const dica = ehGrupoAtual
      ? 'O canal Geral ainda não foi criado. Confirme que a Edge Function foi re-publicada.'
      : 'Não foi possível abrir a conversa.';
    lista.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">${escHtml(dica)}</div>`;
  }
}

// ── Render de mensagens ─────────────────────────────────────────────────
function renderizarMensagens(mensagens) {
  const lista = document.getElementById('msgList');
  if (!lista) return;
  const cont = document.getElementById('msgContainer');
  const perto = cont ? (cont.scrollHeight - cont.scrollTop - cont.clientHeight < 120) : true;

  let html = '';
  let ultimaData = '';
  for (const m of mensagens) {
    if (m.type === 'deleted') continue;
    const dt = new Date(m.created_at);
    const dataLabel = formatDate(dt);
    if (dataLabel !== ultimaData) {
      html += `<div class="msg-date-sep">${escHtml(dataLabel)}</div>`;
      ultimaData = dataLabel;
    }
    const mine = m.user?.id === meId;
    const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const temTexto = (m.text || '').trim().length > 0;
    const anexosHtml = renderAnexos(m.attachments || []);

    const podeEditar = mine && temTexto;
    const podeExcluir = mine || isAdmin;
    const acoes = (podeEditar || podeExcluir) ? `
        <div class="msg-actions">
          ${podeEditar ? `<button class="msg-action-btn" onclick="abrirEditarMsg('${m.id}')" title="Editar"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8.5 8.5L3 14l.5-3.5z"/></svg> Editar</button>` : ''}
          ${podeExcluir ? `<button class="msg-action-btn danger" onclick="abrirDeleteMsg('${m.id}')" title="Apagar"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10M6 4V2.5h4V4M5 4l.7 9h4.6L11 4z"/></svg> Apagar</button>` : ''}
        </div>` : '';

    html += `
      <div class="msg-wrap ${mine ? 'mine' : 'other'}">
        ${temTexto ? `<div class="msg-bubble ${mine ? 'mine' : 'other'}">${escHtml(m.text)}</div>` : ''}
        ${anexosHtml ? `<div class="msg-attach-wrap ${mine ? 'mine' : 'other'}">${anexosHtml}</div>` : ''}
        ${(!mine) ? `<span class="msg-sender">${escHtml(m.user?.name || 'Usuário')}</span>` : ''}
        <div class="msg-meta">${escHtml(hora)}</div>
        ${acoes}
      </div>`;
  }
  lista.innerHTML = html || '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px;">Nenhuma mensagem ainda. Diga oi! 👋</div>';

  if (cont && perto) cont.scrollTop = cont.scrollHeight;
}

function renderAnexos(attachments) {
  let html = '';
  for (const a of attachments) {
    const ehImagem = a.type === 'image' || (!!a.image_url && !a.asset_url);
    if (ehImagem) {
      const url = a.image_url || a.thumb_url || a.asset_url;
      if (url) html += `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="msg-attach-img-link"><img class="msg-attach-img" src="${escHtml(url)}" loading="lazy" alt="imagem"></a>`;
    } else {
      const url = a.asset_url || a.image_url;
      const nome = a.title || a.fallback || 'arquivo';
      if (url) html += `
        <a class="msg-attach-file" href="${escHtml(url)}" target="_blank" rel="noopener" title="${escHtml(nome)}">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/><path d="M9 1v4h4"/></svg>
          <span>${escHtml(nome)}</span>
        </a>`;
    }
  }
  return html;
}

// ── Carregar histórico ──────────────────────────────────────────────────
async function carregarMais() {
  if (!canalAtual) return;
  const msgs = canalAtual.state.messages || [];
  if (!msgs.length) return;
  const btn = document.getElementById('btnLoadMore');
  const cont = document.getElementById('msgContainer');
  const alturaAntes = cont ? cont.scrollHeight : 0;
  btn.textContent = 'Carregando...';
  try {
    const r = await canalAtual.query({ messages: { limit: 25, id_lt: msgs[0].id } });
    renderizarMensagens(canalAtual.state.messages || []);
    if (cont) cont.scrollTop = cont.scrollHeight - alturaAntes;
    const trouxe = r?.messages?.length || 0;
    btn.style.display = trouxe >= 25 ? 'block' : 'none';
  } catch (e) {
    btn.style.display = 'none';
  } finally {
    btn.textContent = 'Carregar mensagens anteriores';
  }
}

// ── Editar / Apagar mensagem ────────────────────────────────────────────
let msgEditandoId = null;
let msgApagandoId = null;

function acharMensagem(id) {
  return (canalAtual?.state?.messages || []).find(m => m.id === id) || null;
}

function abrirEditarMsg(id) {
  const m = acharMensagem(id);
  if (!m) return;
  msgEditandoId = id;
  const ta = document.getElementById('editMsgContent');
  ta.value = m.text || '';
  document.getElementById('editMsgModal').classList.add('show');
  setTimeout(() => ta.focus(), 50);
}

async function confirmarEditarMsg() {
  if (!msgEditandoId || !client) return;
  const texto = (document.getElementById('editMsgContent').value || '').trim();
  if (!texto) { showToast('A mensagem não pode ficar vazia', 'err'); return; }
  fecharModais();
  try {
    await client.partialUpdateMessage(msgEditandoId, { set: { text: texto } });
    // evento message.updated re-renderiza
  } catch (e) {
    console.error('[chat] erro ao editar:', e);
    showToast('Não foi possível editar a mensagem', 'err');
  }
  msgEditandoId = null;
}

function abrirDeleteMsg(id) {
  msgApagandoId = id;
  document.getElementById('deleteMsgModal').classList.add('show');
}

async function confirmarDeleteMsg() {
  if (!msgApagandoId || !client) return;
  const id = msgApagandoId;
  fecharModais();
  try {
    await client.deleteMessage(id);
    // evento message.deleted re-renderiza (mensagens apagadas somem)
  } catch (e) {
    console.error('[chat] erro ao apagar:', e);
    showToast('Não foi possível apagar a mensagem', 'err');
  }
  msgApagandoId = null;
}

function fecharModais() {
  document.getElementById('editMsgModal')?.classList.remove('show');
  document.getElementById('deleteMsgModal')?.classList.remove('show');
}

// ── Anexos ──────────────────────────────────────────────────────────────
async function anexarArquivos(input) {
  const files = Array.from(input.files || []);
  input.value = '';
  await processarArquivos(files);
}

async function processarArquivos(files) {
  files = Array.from(files || []);
  if (!files.length) return;
  if (!canalAtual) { showToast('Abra uma conversa primeiro', 'err'); return; }

  enviandoAnexo = true;
  atualizarBotaoAnexo();

  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) { // 25 MB
      showToast(`"${file.name}" passa de 25 MB`, 'err');
      continue;
    }
    try {
      const ehImagem = (file.type || '').startsWith('image/');
      const resp = ehImagem ? await canalAtual.sendImage(file) : await canalAtual.sendFile(file);
      const url = resp?.file;
      if (!url) throw new Error('upload falhou');
      anexosPendentes.push(ehImagem
        ? { type: 'image', image_url: url, fallback: file.name }
        : { type: 'file', asset_url: url, title: file.name, mime_type: file.type, file_size: file.size });
    } catch (e) {
      console.error('[chat] erro no upload:', e);
      showToast(`Falha ao enviar "${file.name}"`, 'err');
    }
  }

  enviandoAnexo = false;
  atualizarBotaoAnexo();
  renderPreviewAnexos();
  document.getElementById('chatInput')?.focus();
}

function renderPreviewAnexos() {
  const bar = document.getElementById('attachPreview');
  if (!bar) return;
  if (!anexosPendentes.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML = anexosPendentes.map((a, i) => {
    const ehImg = a.type === 'image';
    const nome = a.title || a.fallback || (ehImg ? 'imagem' : 'arquivo');
    const thumb = ehImg
      ? `<img src="${escHtml(a.image_url)}" alt="">`
      : `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z"/><path d="M9 1v4h4"/></svg>`;
    return `<div class="attach-chip" title="${escHtml(nome)}">
      ${thumb}<span>${escHtml(nome)}</span>
      <button class="attach-chip-remove" onclick="removerAnexo(${i})" title="Remover">✕</button>
    </div>`;
  }).join('');
}

function removerAnexo(i) {
  anexosPendentes.splice(i, 1);
  renderPreviewAnexos();
}

function limparAnexosPendentes() {
  anexosPendentes = [];
  renderPreviewAnexos();
}

function atualizarBotaoAnexo() {
  const btn = document.getElementById('btnAttach');
  if (!btn) return;
  btn.classList.toggle('carregando', enviandoAnexo);
  btn.disabled = enviandoAnexo;
}

// ── Arrastar e soltar arquivos externos ─────────────────────────────────
let dragDepth = 0;
function configurarDragDrop() {
  const zona = document.getElementById('chatConv');
  const overlay = document.getElementById('dropOverlay');
  if (!zona || !overlay) return;

  const mostrar = () => { if (canalAtual) overlay.classList.add('ativo'); };
  const esconder = () => overlay.classList.remove('ativo');

  zona.addEventListener('dragenter', e => {
    if (!temArquivos(e)) return;
    e.preventDefault();
    dragDepth++;
    mostrar();
  });
  zona.addEventListener('dragover', e => {
    if (!temArquivos(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  zona.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) esconder();
  });
  zona.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    esconder();
    const files = e.dataTransfer?.files;
    if (files && files.length) processarArquivos(files);
  });
}

function temArquivos(e) {
  const dt = e.dataTransfer;
  if (!dt) return false;
  return Array.from(dt.types || []).includes('Files');
}

// ── Enviar ──────────────────────────────────────────────────────────────
async function enviarMensagem() {
  const input = document.getElementById('chatInput');
  const texto = (input.value || '').trim();
  if ((!texto && !anexosPendentes.length) || !canalAtual) return;
  if (enviandoAnexo) { showToast('Aguarde o anexo terminar de subir', 'err'); return; }

  const anexos = anexosPendentes.slice();
  input.value = '';
  autoResizeInput(input);
  limparAnexosPendentes();

  try {
    const msg = { text: texto };
    if (anexos.length) msg.attachments = anexos;
    await canalAtual.sendMessage(msg);
  } catch (e) {
    console.error('[chat] erro ao enviar:', e);
    showToast('Não foi possível enviar a mensagem', 'err');
    input.value = texto;
    autoResizeInput(input);
    anexosPendentes = anexos;
    renderPreviewAnexos();
  }
}

function onInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
}

function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── Mobile: voltar para a lista ─────────────────────────────────────────
function voltarParaLista() {
  document.getElementById('chatWrap').classList.remove('mobile-conv');
}

// ── Badge de não lidas (nav) ────────────────────────────────────────────
function atualizarBadgeTotal(total) {
  const badge = document.getElementById('chatDmNavBadge');
  if (badge) badge.style.display = total > 0 ? 'block' : 'none';
}

// ── Erro de conexão ─────────────────────────────────────────────────────
function mostrarErroConexao(msg) {
  const skel = document.getElementById('dmListSkel');
  if (skel) skel.remove();
  document.getElementById('chatWrap')?.classList.add('mobile-conv');
  document.getElementById('chatEmpty').style.display = 'none';
  document.getElementById('chatConv').style.display = 'none';
  const box = document.getElementById('chatConnError');
  document.getElementById('chatConnErrorMsg').textContent = msg;
  box.style.display = 'flex';
}

// ── Helpers ─────────────────────────────────────────────────────────────
function iniciais(nome) {
  const pts = String(nome || '').trim().split(/\s+/);
  return ((pts[0]?.[0] || '') + (pts[1]?.[0] || '')).toUpperCase() || '?';
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cssEsc(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, '\\$&');
}

function skeletonMensagens() {
  return `
    <div class="chat-skeleton">
      <div class="chat-skel-row"><div class="chat-skel-avatar"></div><div class="chat-skel-lines"><div class="chat-skel-line" style="width:70%"></div><div class="chat-skel-line" style="width:45%"></div></div></div>
      <div class="chat-skel-row"><div class="chat-skel-avatar"></div><div class="chat-skel-lines"><div class="chat-skel-line" style="width:85%"></div><div class="chat-skel-line" style="width:30%"></div></div></div>
      <div class="chat-skel-row"><div class="chat-skel-avatar"></div><div class="chat-skel-lines"><div class="chat-skel-line" style="width:55%"></div></div></div>
    </div>`;
}

function showToast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${tipo} show`;
  setTimeout(() => t.classList.remove('show'), 4000);
}

function formatDate(d) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
