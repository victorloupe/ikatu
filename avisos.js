// ── State ──────────────────────────────────────────────────────────────────
let meId = null;
let meNome = '';
let isAdmin = false;
let canalAtual = null;       // { id, type, name }
let mensagens = [];
let usuarios = [];
let realtimeChannel = null;
const MSGS_LIMIT = 50;
let hasMore = false;
let oldestCreatedAt = null;
let mensagemParaDeletar = null;
let mensagemParaFixar = null;
let pinnedMsg = null;        // mensagem fixada atual no canal

// ── DM unread state ────────────────────────────────────────────────────────
let dmUnread = {};           // userId → { channelId, hasUnread }
let dmNotifySubs = [];       // subscriptions de notificação (bolinhas)
let dmSubscribedChannels = new Set();

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const session = await sbRequireAuth();
  if (!session) return;
  meId = session.user.id;

  if (typeof setLogoImages === 'function') setLogoImages();

  // Mark chat as seen now
  localStorage.setItem('igui_chat_last_seen', new Date().toISOString());

  // Tudo que precisa da rede ANTES das mensagens, em paralelo
  // (antes era em série — principal causa da lentidão ao abrir)
  const [profile, canais, users] = await Promise.all([
    sbGetProfile().catch(() => null),
    sbListarCanais().catch(() => []),
    sbListarTodosUsuarios().catch(() => [])
  ]);

  meNome = profile?.name || profile?.email || 'Usuário';
  isAdmin = profile?.role === 'admin';

  const displayName = profile?.name || profile?.email || '—';
  document.getElementById('hdrUser').textContent = displayName;
  const av = document.getElementById('userAvatar');
  if (av) {
    const pts = displayName.trim().split(/\s+/);
    av.textContent = ((pts[0]?.[0]||'') + (pts[1]?.[0]||'')).toUpperCase() || '?';
  }

  if (isAdmin) {
    document.getElementById('adminBadge').style.display = 'inline-block';
    document.querySelectorAll('#navRelacaoProjetos, #navLojasPiscinas, #navAdmin, #labelAdmin, #navAdminGroup').forEach(el => el.style.display = 'flex');
    document.getElementById('btnSchedule').style.display = 'flex';
  }

  usuarios = users;
  renderDMList(); // lista imediata — bolinhas de não lido chegam em seguida

  // PRIORIDADE: selecionar o #geral e carregar as mensagens já
  const geral = canais.find(c => c.type === 'public' && c.name === '#geral')
             || canais.find(c => c.type === 'public');
  if (geral) {
    selecionarCanal(geral.id, 'public', geral.name || '#geral');
  }

  // Secundário, em segundo plano (não atrasa as mensagens):
  sbProcessarPinsExpirados().catch(() => {});
  sbCarregarStatusDMs().then(map => {
    dmUnread = map;
    renderDMList();
    subscribeAllDMsNotify();
    atualizarNavBadge();
  }).catch(() => {});

  // Escuta novas mensagens no canal público geral: atualiza o alerta do menu e,
  // como o notificador global (supabase-client.js) fica desligado nesta página,
  // também dispara a notificação nativa quando a aba está em segundo plano.
  if (geral) {
    sbEscutarNovaMensagemDM(geral.id, (payload) => {
      const nova = payload.new;
      if (nova?.sender_id === meId) return; // Própria mensagem
      if (nova?.status !== 'sent') return;

      // Som sempre que chega aviso novo (de outro usuário)
      if (window.tocarSom) window.tocarSom();

      // Notificação nativa só quando a aba não está visível (se está vendo, a tela já mostra)
      if (document.visibilityState !== 'visible' &&
          ('Notification' in window) && Notification.permission === 'granted') {
        const corpo = notifTextoPlano(nova.content).slice(0, 120);
        const n = new Notification(`📢 ${nova.sender_name || 'Novo aviso'} — Mural de Avisos`, {
          body: corpo, icon: 'icon-192.png', tag: 'igui-aviso',
        });
        n.onclick = () => { window.focus(); n.close(); };
      }

      if (canalAtual?.id === geral.id) return; // Se já está vendo, ignora o badge
      atualizarNavBadge();
    });
  }

  atualizarNavBadge();
});

// ── Render DM list ─────────────────────────────────────────────────────────
function renderDMList() {
  const container = document.getElementById('dmList');
  const outros = usuarios.filter(u => u.id !== meId);
  if (!outros.length) {
    container.innerHTML = '<div style="padding:6px 14px;font-size:11px;color:var(--muted);">Nenhum usuário</div>';
    return;
  }
  container.innerHTML = '';
  outros.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'chat-ch-item';
    btn.dataset.userId = u.id;
    const initials = getInitials(u.name || u.email || '?');
    const hasUnread = dmUnread[u.id]?.hasUnread || false;
    btn.innerHTML = `
      <div class="chat-dm-avatar">${escHtml(initials)}</div>
      <span style="flex:1">${escHtml(u.name || u.email)}</span>
      <span class="dm-unread-dot" id="dm-dot-${u.id}" style="${hasUnread ? '' : 'display:none'}"></span>
    `;
    btn.onclick = () => abrirDM(u.id, u.name || u.email);
    container.appendChild(btn);
  });
}

// ── DM unread helpers ──────────────────────────────────────────────────────
function marcarDMComoLido(userId, channelId) {
  localStorage.setItem(`igui_dm_seen_${channelId}`, new Date().toISOString());
  if (dmUnread[userId]) dmUnread[userId].hasUnread = false;
  else dmUnread[userId] = { channelId, hasUnread: false };
  const dot = document.getElementById(`dm-dot-${userId}`);
  if (dot) dot.style.display = 'none';
  atualizarNavBadge();
}

async function atualizarNavBadge() {
  const hasAnyDM = Object.values(dmUnread).some(v => v.hasUnread);
  let hasPublicUnread = false;
  
  try {
    // Se o canal atual não for o canal público geral, verifica se há novas mensagens nele
    const isViewingGeral = canalAtual && canalAtual.type === 'public';
    if (!isViewingGeral) {
      hasPublicUnread = await sbVerificarMsgNaoLidas();
    }
  } catch (e) {
    console.warn('Erro ao verificar mensagens não lidas no geral:', e);
  }

  const badge = document.getElementById('chatNavBadge');
  if (badge) {
    badge.style.display = (hasAnyDM || hasPublicUnread) ? 'block' : 'none';
  }
}

function subscribeAllDMsNotify() {
  Object.entries(dmUnread).forEach(([userId, info]) => {
    if (!info.channelId || dmSubscribedChannels.has(info.channelId)) return;
    dmSubscribedChannels.add(info.channelId);
    const handle = sbEscutarNovaMensagemDM(info.channelId, (payload) => {
      if (payload.new?.sender_id === meId) return;       // própria msg
      if (payload.new?.status !== 'sent') return;
      if (canalAtual?.id === info.channelId) return;     // já está vendo
      // Mostrar bolinha
      if (dmUnread[userId]) dmUnread[userId].hasUnread = true;
      else dmUnread[userId] = { channelId: info.channelId, hasUnread: true };
      const dot = document.getElementById(`dm-dot-${userId}`);
      if (dot) dot.style.display = 'block';
      atualizarNavBadge();
      // Notificação nativa
      const u = usuarios.find(x => x.id === userId);
      notificarDM(u?.name || u?.email || 'Mensagem direta', payload.new?.content);
    });
    dmNotifySubs.push(handle);
  });
}

// ── Notificação nativa de DM ───────────────────────────────────────────────
function notificarDM(remetente, contentHtml) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const corpo = notifTextoPlano(contentHtml).slice(0, 120);
    const n = new Notification(`💬 ${remetente}`, {
      body: corpo,
      icon: 'icon-192.png',
      tag: 'igui-dm',
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}

function getInitials(name) {
  const pts = name.trim().split(/\s+/);
  return ((pts[0]?.[0]||'') + (pts[1]?.[0]||'')).toUpperCase() || '?';
}

// ── Select channel ─────────────────────────────────────────────────────────
async function selecionarCanal(channelId, type, name) {
  // If no channelId, we need to get it from the DB
  if (!channelId && type === 'public') {
    const canais = await sbListarCanais().catch(() => []);
    const ch = canais.find(c => c.type === 'public');
    if (ch) channelId = ch.id;
    if (!channelId) { showToast('Canal #geral não encontrado. Execute o SQL do banco.', 'err'); return; }
  }

  canalAtual = { id: channelId, type, name };
  mensagens = [];
  hasMore = false;
  oldestCreatedAt = null;
  pinnedMsg = null;
  localStorage.setItem('igui_chat_last_seen', new Date().toISOString());

  // Update UI active state
  document.querySelectorAll('.chat-ch-item').forEach(el => el.classList.remove('active'));
  if (type === 'public') {
    document.getElementById('btnGeral')?.classList.add('active');
  } else {
    const dmBtn = document.querySelector(`.chat-ch-item[data-channel="${channelId}"]`);
    if (dmBtn) dmBtn.classList.add('active');
  }

  // Update header
  const title = type === 'public' ? `📢 Mural de Avisos` : escHtml(name);
  document.getElementById('chatAreaTitle').innerHTML = title;
  document.getElementById('chatAreaSub').textContent = type === 'public' ? 'Avisos e comunicados importantes' : 'Mensagem direta';

  // Clear messages e mostrar skeleton de carregamento
  mostrarSkeletonMsgs();
  document.getElementById('pinBanner').style.display = 'none';
  document.getElementById('btnLoadMore').style.display = 'none';

  // Unsubscribe previous channel
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }

  // Process scheduled messages (admin triggers delivery for everyone)
  if (isAdmin) sbProcessarAgendadas(channelId).catch(() => {});

  // Load messages
  await carregarMensagens();

  // Subscribe to realtime
  realtimeChannel = sbEscutarMensagens(channelId, onMensagemEvento);
}

// ── Open DM ────────────────────────────────────────────────────────────────
async function abrirDM(userId, userName) {
  try {
    const canal = await sbCriarOuAbrirDM(userId);
    const channelId = canal.id;

    // Marcar como lido e atualizar mapa
    if (!dmUnread[userId]) dmUnread[userId] = { channelId, hasUnread: false };
    else dmUnread[userId].channelId = channelId;
    marcarDMComoLido(userId, channelId);

    // Assinar notificação se ainda não estiver (novo DM criado agora)
    if (!dmSubscribedChannels.has(channelId)) {
      subscribeAllDMsNotify();
    }

    // Mark this DM button as active by channel
    document.querySelectorAll('.chat-ch-item').forEach(el => el.classList.remove('active'));
    const dmBtn = document.querySelector(`.chat-ch-item[data-user-id="${userId}"]`);
    if (dmBtn) {
      dmBtn.classList.add('active');
      dmBtn.dataset.channel = channelId;
    }
    await selecionarCanal(channelId, 'dm', userName);
  } catch (e) {
    showToast('Erro ao abrir DM: ' + e.message, 'err');
  }
}

// ── Skeleton de carregamento ───────────────────────────────────────────────
function mostrarSkeletonMsgs() {
  const widths = [[70, 45], [85, 60, 30], [55], [75, 50], [65, 40]];
  document.getElementById('msgList').innerHTML = `
    <div class="chat-skeleton">
      ${widths.map(linhas => `
        <div class="chat-skel-row">
          <div class="chat-skel-avatar"></div>
          <div class="chat-skel-lines">
            ${linhas.map(w => `<div class="chat-skel-line" style="width:${w}%"></div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Load messages ──────────────────────────────────────────────────────────
async function carregarMensagens() {
  if (!canalAtual) return;
  try {
    const res = await sbCarregarMensagens(canalAtual.id, oldestCreatedAt);
    hasMore = res.hasMore;
    const novas = res.mensagens;

    if (!oldestCreatedAt) {
      // First load
      mensagens = novas;
      renderMensagens(true);
      scrollToBottom();
    } else {
      // Prepend older messages
      const prevScrollHeight = document.getElementById('msgContainer').scrollHeight;
      mensagens = [...novas, ...mensagens];
      renderMensagens(false);
      const container = document.getElementById('msgContainer');
      container.scrollTop = container.scrollHeight - prevScrollHeight;
    }

    if (novas.length > 0) {
      oldestCreatedAt = novas[0].created_at;
    }

    document.getElementById('btnLoadMore').style.display = hasMore ? 'block' : 'none';
  } catch (e) {
    document.querySelector('#msgList .chat-skeleton')?.remove();
    showToast('Erro ao carregar mensagens: ' + e.message, 'err');
  }
}

async function carregarMais() {
  await carregarMensagens();
}

// ── Realtime event ─────────────────────────────────────────────────────────
function onMensagemEvento(payload) {
  const { eventType, new: nova, old: antiga } = payload;

  if (eventType === 'INSERT') {
    // Skip scheduled messages for non-admin (they shouldn't be received via RLS, but guard anyway)
    if (nova.status === 'scheduled' && !isAdmin) return;
    // Avoid duplicates
    if (mensagens.find(m => m.id === nova.id)) return;
    mensagens.push(nova);
    appendBolha(nova);
    scrollToBottom();
    // DM aberto mas aba em segundo plano → notificação nativa
    if (document.hidden && nova.sender_id !== meId && nova.status === 'sent' && canalAtual?.type === 'dm') {
      notificarDM(nova.sender_name || canalAtual?.name || 'Mensagem direta', nova.content);
    }
  } else if (eventType === 'UPDATE') {
    const idx = mensagens.findIndex(m => m.id === nova.id);
    if (idx === -1) {
      // Message newly visible (was scheduled, now sent)
      if (nova.status === 'sent') {
        mensagens.push(nova);
        appendBolha(nova);
        scrollToBottom();
      }
      return;
    }
    mensagens[idx] = nova;
    // Re-render the specific bubble
    const el = document.getElementById('msg-' + nova.id);
    if (el) {
      const novo = criarBolha(nova);
      el.replaceWith(novo);
    }
    // Update pin banner if this was the pinned message
    if (nova.pinned) {
      pinnedMsg = nova;
      atualizarPinBanner();
    } else if (pinnedMsg?.id === nova.id && !nova.pinned) {
      pinnedMsg = null;
      atualizarPinBanner();
    }
  } else if (eventType === 'DELETE') {
    mensagens = mensagens.filter(m => m.id !== antiga.id);
    const el = document.getElementById('msg-' + antiga.id);
    if (el) el.remove();
  }
}

// ── Render all messages ────────────────────────────────────────────────────
function renderMensagens(scrollDown) {
  const list = document.getElementById('msgList');
  list.innerHTML = '';
  pinnedMsg = null;

  let lastDate = null;
  mensagens.forEach(msg => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      const sep = document.createElement('div');
      sep.className = 'msg-date-sep';
      sep.textContent = formatDate(new Date(msg.created_at));
      list.appendChild(sep);
      lastDate = msgDate;
    }
    list.appendChild(criarBolha(msg));
    if (msg.pinned && !msg.deleted) pinnedMsg = msg;
  });

  atualizarPinBanner();
}

function appendBolha(msg) {
  const list = document.getElementById('msgList');
  // Check if we need a date separator
  const lastSep = list.querySelector('.msg-date-sep:last-of-type');
  const msgDate = new Date(msg.created_at).toDateString();
  const lastDate = lastSep?.dataset.date;
  if (msgDate !== lastDate) {
    const sep = document.createElement('div');
    sep.className = 'msg-date-sep';
    sep.dataset.date = msgDate;
    sep.textContent = formatDate(new Date(msg.created_at));
    list.appendChild(sep);
  }
  list.appendChild(criarBolha(msg));
}

// ── Create message bubble ──────────────────────────────────────────────────
function criarBolha(msg) {
  const isMine = msg.sender_id === meId;
  const wrap = document.createElement('div');
  wrap.className = `msg-wrap ${isMine ? 'mine' : 'other'}`;
  wrap.id = 'msg-' + msg.id;

  const hora = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Check if sender is admin to highlight announcements
  const senderUser = usuarios.find(u => u.id === msg.sender_id);
  const senderIsAdmin = senderUser?.role === 'admin';
  const adminBadge = senderIsAdmin ? ' <span class="badge-role-admin" style="background:#edf7fd; color:var(--blue); font-size:9px; font-weight:700; padding:1px 6px; border-radius:10px; margin-left:4px; border:1px solid rgba(0,174,239,.3); vertical-align:middle; text-transform:uppercase; display:inline-block;">Admin</span>' : '';

  // Bubble classes
  let bubbleClass = `msg-bubble ${isMine ? 'mine' : 'other'}`;
  if (msg.deleted) bubbleClass += ' deleted';
  else if (msg.status === 'scheduled') bubbleClass += ' scheduled';
  if (msg.pinned && !msg.deleted) bubbleClass += ' pinned-msg';
  if (senderIsAdmin && !msg.deleted) bubbleClass += ' admin-bubble';

  // Format content with bold, italic, underline, lists and break lines safely
  let content = '';
  if (msg.deleted) {
    content = '<em>mensagem apagada</em>';
  } else {
    content = formatarMensagemHTML(msg.content);
  }

  // Meta badges
  let metaExtra = '';
  if (msg.status === 'scheduled' && isAdmin) {
    const dt = msg.scheduled_at ? new Date(msg.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    metaExtra += `<span class="msg-scheduled-badge">🕒 agendada ${dt}</span>`;
  }
  if (msg.pinned && !msg.deleted) {
    metaExtra += `<span class="msg-pinned-badge">📌</span>`;
  }

  // Action buttons
  let actions = '';
  if (!msg.deleted) {
    const canDelete = isMine || isAdmin;
    const canPin = isAdmin;
    let btns = '';
    if (canPin) {
      if (msg.pinned) {
        btns += `<button class="msg-action-btn" onclick="desafixarMsg('${msg.id}')">📌 Desafixar</button>`;
      } else {
        btns += `<button class="msg-action-btn" onclick="msgFixarBtn('${msg.id}')">📌 Fixar</button>`;
      }
    }
    if (isMine || isAdmin) {
      btns += `<button class="msg-action-btn" onclick="abrirModalEditar('${msg.id}')">✏️ Editar</button>`;
    }
    if (canDelete) {
      btns += `<button class="msg-action-btn danger" onclick="abrirModalDelete('${msg.id}')">🗑</button>`;
    }
    if (btns) {
      actions = `<div class="msg-actions">${btns}</div>`;
    }
  }

  wrap.innerHTML = `${!isMine ? `<div class="msg-sender">${escHtml(msg.sender_name || 'Usuário')}${adminBadge}</div>` : (senderIsAdmin ? `<div class="msg-sender">${escHtml(msg.sender_name || 'Você')}${adminBadge}</div>` : '')}<div class="${bubbleClass}" style="position:relative;">${actions}${content}</div><div class="msg-meta">${hora}${metaExtra}</div>`;

  return wrap;
}

// ── Pin banner ─────────────────────────────────────────────────────────────
function atualizarPinBanner() {
  const banner = document.getElementById('pinBanner');
  if (pinnedMsg && !pinnedMsg.deleted) {
    document.getElementById('pinBannerText').textContent = pinnedMsg.content.slice(0, 120) + (pinnedMsg.content.length > 120 ? '…' : '');
    banner.style.display = 'flex';
    // Only admin sees the close (unpin) button
    document.getElementById('btnDesafixar').style.display = isAdmin ? 'block' : 'none';
  } else {
    banner.style.display = 'none';
  }
}

// Helper para formatar o texto substituindo negrito, itálico, sublinhado e quebras de linha
function formatarMensagemHTML(rawText) {
  let formatted = escHtml(rawText);
  // Negrito: **texto**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Itálico: _texto_
  formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
  // Sublinhado: ~texto~
  formatted = formatted.replace(/~(.*?)~/g, '<u>$1</u>');
  // Quebras de linha
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

// ── Send message ───────────────────────────────────────────────────────────

async function enviarMensagem() {
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if (!content || !canalAtual) return;

  input.value = '';
  autoResizeInput(input);

  try {
    await sbEnviarMensagem(canalAtual.id, content);
  } catch (e) {
    showToast('Erro ao enviar: ' + e.message, 'err');
    input.value = content;
    autoResizeInput(input);
  }
}

function onInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviarMensagem();
  }
}

// ── Delete message ─────────────────────────────────────────────────────────
function abrirModalDelete(msgId) {
  mensagemParaDeletar = msgId;
  const desc = document.getElementById('deleteMsgDesc');
  if (desc) {
    desc.textContent = isAdmin
      ? 'Apagar esta mensagem permanentemente? Ela será removida do banco para todos.'
      : 'Apagar esta mensagem? Ela ficará visível como "mensagem apagada".';
  }
  document.getElementById('deleteMsgModal').classList.add('show');
}

async function confirmarDeleteMsg() {
  if (!mensagemParaDeletar) return;
  fecharModais();
  try {
    if (isAdmin) {
      // Admin: apaga o registro inteiro do banco (sem rastro)
      await sbHardDeletarMensagem(mensagemParaDeletar);
      // Remove da UI direto (não haverá evento DELETE via realtime se RLS bloquear retorno)
      const el = document.getElementById('msg-' + mensagemParaDeletar);
      if (el) el.remove();
      mensagens = mensagens.filter(m => m.id !== mensagemParaDeletar);
    } else {
      // Usuário comum: soft-delete (fica "mensagem apagada")
      await sbDeletarMensagemChat(mensagemParaDeletar);
    }
  } catch (e) {
    showToast('Erro ao apagar: ' + e.message, 'err');
  }
  mensagemParaDeletar = null;
}

// ── Edit message ───────────────────────────────────────────────────────────
let mensagemParaEditar = null;

function abrirModalEditar(msgId) {
  mensagemParaEditar = msgId;
  const msg = mensagens.find(m => m.id === msgId);
  if (!msg) return;
  
  document.getElementById('editMsgContent').value = msg.content || '';
  document.getElementById('editMsgModal').classList.add('show');
}

async function confirmarEditarMsg() {
  if (!mensagemParaEditar) return;
  const content = document.getElementById('editMsgContent').value.trim();
  if (!content) {
    showToast('A mensagem não pode ficar vazia', 'err');
    return;
  }
  
  fecharModais();
  try {
    await sbEditarMensagem(mensagemParaEditar, content);
    showToast('Mensagem atualizada!', 'ok');
    
    // Atualizar UI localmente também se necessário (a assinatura do realtime fará o mesmo)
    const msg = mensagens.find(m => m.id === mensagemParaEditar);
    if (msg) {
      msg.content = content;
      // Re-renderizar mensagem individual
      const oldWrap = document.getElementById('msg-' + mensagemParaEditar);
      if (oldWrap) {
        const newWrap = criarBolha(msg);
        oldWrap.replaceWith(newWrap);
      }
    }
  } catch (e) {
    showToast('Erro ao editar: ' + e.message, 'err');
  }
  mensagemParaEditar = null;
}


// ── Pin message ────────────────────────────────────────────────────────────
function msgFixarBtn(msgId) {
  mensagemParaFixar = msgId;
  // Set default pin expiry to 7 days from now
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('pinUntilInput').value = local;
  document.getElementById('pinModal').classList.add('show');
}

async function confirmarPin() {
  if (!mensagemParaFixar) return;
  const val = document.getElementById('pinUntilInput').value;
  const pinUntil = val ? new Date(val).toISOString() : null;
  fecharModais();
  try {
    await sbFixarMensagem(mensagemParaFixar, pinUntil);
  } catch (e) {
    showToast('Erro ao fixar: ' + e.message, 'err');
  }
  mensagemParaFixar = null;
}

async function desafixarMsg(msgId) {
  const id = msgId || pinnedMsg?.id;
  if (!id) return;
  try {
    await sbDesafixarMensagem(id);
  } catch (e) {
    showToast('Erro ao desafixar: ' + e.message, 'err');
  }
}

function desafixarMsgEvent(event) {
  if (event) event.stopPropagation();
  desafixarMsg();
}

function irParaMensagemFixada(event) {
  if (pinnedMsg) {
    const el = document.getElementById('msg-' + pinnedMsg.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const bubble = el.querySelector('.msg-bubble');
      if (bubble) {
        bubble.classList.add('highlight-announcement');
        setTimeout(() => {
          bubble.classList.remove('highlight-announcement');
        }, 2000);
      }
    } else {
      showToast('Aviso fixado antigo ou fora do limite visível.', 'info');
    }
  }
}

// ── Schedule message ───────────────────────────────────────────────────────
function abrirModalAgendar() {
  document.getElementById('scheduleContent').value = '';
  // Default: 1 hour from now
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('scheduleAt').value = local;
  document.getElementById('scheduleModal').classList.add('show');
}

async function confirmarAgendar() {
  const content = document.getElementById('scheduleContent').value.trim();
  const val = document.getElementById('scheduleAt').value;
  if (!content) { showToast('Digite o conteúdo da mensagem', 'err'); return; }
  if (!val) { showToast('Selecione a data e hora', 'err'); return; }
  if (!canalAtual) return;

  const scheduledAt = new Date(val).toISOString();
  fecharModais();
  try {
    await sbAgendarMensagem(canalAtual.id, content, scheduledAt);
    showToast('Mensagem agendada!', 'ok');
  } catch (e) {
    showToast('Erro ao agendar: ' + e.message, 'err');
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function scrollToBottom() {
  const container = document.getElementById('msgContainer');
  container.scrollTop = container.scrollHeight;
}

function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function formatarInputText(type) {
  const input = document.getElementById('chatInput');
  if (!input) return;

  const start = input.selectionStart;
  const end = input.selectionEnd;
  const text = input.value;
  const selectedText = text.substring(start, end);

  let replacement = '';
  switch(type) {
    case 'bold':
      replacement = `**${selectedText}**`;
      break;
    case 'italic':
      replacement = `_${selectedText}_`;
      break;
    case 'underline':
      replacement = `~${selectedText}~`;
      break;
    case 'linebreak':
      replacement = selectedText ? `${selectedText}\n` : '\n';
      break;
    case 'bullet':
      replacement = selectedText ? `• ${selectedText}` : '• ';
      break;
    case 'paragraph':
      replacement = selectedText ? `${selectedText}\n\n` : '\n\n';
      break;
  }

  input.value = text.substring(0, start) + replacement + text.substring(end);
  input.focus();
  
  // Reposiciona o cursor
  const newCursorPos = start + replacement.length;
  input.setSelectionRange(newCursorPos, newCursorPos);
  
  autoResizeInput(input);
}

function fecharModais() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) fecharModais(); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharModais();
});

function showToast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${tipo} show`;
  setTimeout(() => t.classList.remove('show'), 4000);
}

// escHtml → alias para esc() global (supabase-client.js)
const escHtml = esc;

function formatDate(d) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
