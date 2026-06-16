// ═══════════════════════════════════════════════════════════════
//  Gmail — iGUi Space
//  Integração via Gmail API + OAuth 2.0 (proxy via Edge Functions)
// ═══════════════════════════════════════════════════════════════

let meId = null;
let meNome = '';
let gmailAddress = null;
let emailsCache = [];         // metadados dos emails na lista
let emailAtual = null;        // email aberto (payload completo)
let nextPageToken = null;
let carregandoLista = false;
let anexosCompose = [];       // { name, mimeType, base64 }[]
let anexosResposta = [];      // { name, mimeType, base64 }[]

window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    const session = await sbGetSession();
    if (!session) { location.href = 'login.html'; return; }

    meId = session.user.id;
    const profile = await sbGetProfile(meId).catch(() => null);
    meNome = profile?.name || localStorage.getItem('igui_user_name') || 'Você';

    // Atualiza UI de usuário
    const hdrUser = document.getElementById('hdrUser');
    if (hdrUser) hdrUser.textContent = meNome;
    const av = document.getElementById('userAvatar');
    if (av) {
      const pts = meNome.trim().split(/\s+/);
      av.textContent = ((pts[0]?.[0] || '') + (pts[1]?.[0] || '')).toUpperCase() || '?';
    }

    // Verifica se Gmail já está conectado
    const status = await sbGmailStatus();
    if (status.connected) {
      gmailAddress = status.email;
      mostrarInterfaceConectada();
      await carregarInbox(true);
    } else {
      mostrarTelaConexao();
    }

    // Escuta postMessage do popup OAuth
    window.addEventListener('message', onOAuthMessage);
  } catch (e) {
    console.error('[email] init error:', e);
    showToast('Erro ao carregar. ' + (e?.message || ''), 'err');
    mostrarTelaConexao();
  }
}

// ── OAuth ───────────────────────────────────────────────────────

async function conectarGmail() {
  try {
    const { url } = await sbGmailOAuthStart();
    window.open(url, 'gmailOAuth', 'width=520,height=640,popup=1,left=200,top=80');
  } catch (e) {
    showToast('Erro ao iniciar autorização: ' + (e?.message || ''), 'err');
  }
}

function onOAuthMessage(event) {
  if (!event.data || event.data.type === undefined) return;
  if (event.data.type === 'gmail-oauth-success') {
    gmailAddress = event.data.email || '';
    mostrarInterfaceConectada();
    carregarInbox(true);
    showToast('Gmail conectado: ' + gmailAddress, 'ok');
  } else if (event.data.type === 'gmail-oauth-error') {
    showToast('Erro ao conectar Gmail: ' + (event.data.error || ''), 'err');
  }
}

function confirmarDesconectar() {
  document.getElementById('modalDesconectar').classList.add('show');
}

async function desconectarGmail() {
  fecharModais();
  try {
    await sbGmailDisconnect();
    gmailAddress = null;
    emailsCache = [];
    emailAtual = null;
    mostrarTelaConexao();
    showToast('Gmail desconectado.', 'ok');
  } catch (e) {
    showToast('Erro ao desconectar: ' + (e?.message || ''), 'err');
  }
}

// ── Visibilidade de painéis ──────────────────────────────────────

function mostrarTelaConexao() {
  document.getElementById('emailNotConnected').style.display = 'flex';
  document.getElementById('emailWrap').style.display = 'none';
  document.getElementById('gmailAccountBadge').style.display = 'none';
}

function mostrarInterfaceConectada() {
  document.getElementById('emailNotConnected').style.display = 'none';
  document.getElementById('emailWrap').style.display = 'flex';
  const badge = document.getElementById('gmailAccountBadge');
  const emailSpan = document.getElementById('gmailAccountEmail');
  if (badge && emailSpan) {
    emailSpan.textContent = gmailAddress || '';
    badge.style.display = 'inline-flex';
  }
}

// ── Carregar inbox ───────────────────────────────────────────────

async function carregarInbox(reset = false) {
  if (carregandoLista) return;
  carregandoLista = true;

  if (reset) {
    nextPageToken = null;
    emailsCache = [];
    emailAtual = null;
    mostrarVazio();
  }

  const btnR = document.getElementById('btnRefresh');
  if (btnR) { btnR.disabled = true; btnR.textContent = '↻'; }

  renderSkeletonLista();

  try {
    const listResult = await sbGmailProxy('listMessages', {
      pageToken: nextPageToken || undefined,
    });

    const ids = (listResult.messages || []).map(m => m.id);
    nextPageToken = listResult.nextPageToken || null;

    if (!ids.length) {
      document.getElementById('emailList').innerHTML =
        '<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px;">Nenhum e-mail encontrado.</div>';
      document.getElementById('btnLoadMore').style.display = 'none';
      return;
    }

    // Busca metadados em paralelo (From, Subject, Date + snippet + labels)
    const metas = await Promise.all(
      ids.map(id => sbGmailProxy('getMessage', {
        messageId: id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      }))
    );

    emailsCache = reset ? metas : [...emailsCache, ...metas];
    renderListaEmails();
    document.getElementById('btnLoadMore').style.display = nextPageToken ? 'block' : 'none';
  } catch (e) {
    if (e.message.includes('Reconecte') || e.message.includes('não conectado')) {
      gmailAddress = null;
      mostrarTelaConexao();
      showToast('Sessão Gmail expirada. Reconecte.', 'err');
    } else {
      document.getElementById('emailList').innerHTML =
        '<div style="padding:30px;text-align:center;color:#e74c3c;font-size:13px;">Erro ao carregar e-mails.</div>';
      showToast('Erro: ' + (e?.message || ''), 'err');
    }
  } finally {
    carregandoLista = false;
    if (btnR) { btnR.disabled = false; }
  }
}

async function carregarMaisEmails() {
  if (!nextPageToken) return;
  await carregarInbox(false);
}

// ── Renderizar lista ─────────────────────────────────────────────

function renderSkeletonLista() {
  const list = document.getElementById('emailList');
  list.innerHTML = Array.from({ length: 6 }, () => `
    <div class="email-skel-item">
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="email-skel-line" style="width:55%;height:11px;"></div>
        <div class="email-skel-line" style="width:20%;height:9px;margin-left:auto;"></div>
      </div>
      <div class="email-skel-line" style="width:80%;"></div>
      <div class="email-skel-line" style="width:90%;height:9px;"></div>
    </div>
  `).join('');
}

function renderListaEmails() {
  const list = document.getElementById('emailList');
  if (!emailsCache.length) {
    list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px;">Caixa vazia.</div>';
    return;
  }

  list.innerHTML = emailsCache.map(msg => {
    const from = getHeader(msg, 'From');
    const subject = getHeader(msg, 'Subject') || '(sem assunto)';
    const date = formatDate(getHeader(msg, 'Date'));
    const snippet = escHtml(msg.snippet || '');
    const isUnread = (msg.labelIds || []).includes('UNREAD');
    const isActive = emailAtual && emailAtual.id === msg.id;

    const fromName = parseFromName(from);

    return `
      <div class="email-list-item ${isUnread ? 'unread' : ''} ${isActive ? 'active' : ''}"
           onclick="abrirEmail('${msg.id}')" data-id="${msg.id}">
        ${isUnread ? '<div class="email-unread-dot"></div>' : ''}
        <div class="email-item-top">
          <span class="email-item-from">${escHtml(fromName)}</span>
          <span class="email-item-date">${date}</span>
        </div>
        <div class="email-item-subject">${escHtml(subject)}</div>
        <div class="email-item-snippet">${snippet}</div>
      </div>
    `;
  }).join('');
}

// ── Abrir email ──────────────────────────────────────────────────

async function abrirEmail(messageId) {
  // Atualiza estado ativo na lista
  document.querySelectorAll('.email-list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === messageId);
  });

  // Mobile: mostra painel direito
  document.getElementById('emailWrap').classList.add('mobile-detail');

  // Mostra painel de detalhe
  document.getElementById('emailEmpty').style.display = 'none';
  document.getElementById('emailCompose').style.display = 'none';
  document.getElementById('emailDetail').style.display = 'flex';

  // Mostra skeleton enquanto carrega
  document.getElementById('emailDetailSubject').textContent = 'Carregando...';
  document.getElementById('emailDetailMeta').innerHTML = '';
  document.getElementById('emailDetailBody').innerHTML =
    '<div style="padding:20px;color:var(--muted);font-size:13px;">Carregando e-mail...</div>';
  document.getElementById('emailDetailAttach').style.display = 'none';
  document.getElementById('emailDetailAttach').innerHTML = '';
  document.getElementById('emailReplyBody').value = '';
  document.getElementById('emailReplyTo').innerHTML = '';

  try {
    const msg = await sbGmailProxy('getMessage', { messageId, format: 'full' });
    emailAtual = msg;

    const subject = getHeader(msg, 'Subject') || '(sem assunto)';
    const from = getHeader(msg, 'From');
    const to = getHeader(msg, 'To');
    const date = formatDate(getHeader(msg, 'Date'));

    document.getElementById('emailDetailSubject').textContent = subject;
    document.getElementById('emailDetailMeta').innerHTML = `
      <div><strong>De:</strong> ${escHtml(from)}</div>
      <div><strong>Para:</strong> ${escHtml(to)}</div>
      <div><strong>Data:</strong> ${date}</div>
    `;

    // Corpo do email
    const { html, text } = extrairCorpo(msg.payload);
    renderCorpoEmail(html || texto2html(text));

    // Anexos
    const attachments = extrairAnexos(msg.payload, messageId);
    const attachEl = document.getElementById('emailDetailAttach');
    if (attachments.length) {
      attachEl.style.display = 'flex';
      attachEl.innerHTML = attachments.map(att => `
        <div class="email-attach-chip" onclick="baixarAnexo('${messageId}','${att.attachmentId}','${escHtml(att.filename)}','${escHtml(att.mimeType)}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 7.2l-5.6 5.6a3 3 0 0 1-4.24-4.24l6-6a2 2 0 0 1 2.83 2.83l-6 6a1 1 0 0 1-1.42-1.42L9.6 4.9"/>
          </svg>
          ${escHtml(att.filename)}
          <span style="color:var(--muted);font-weight:400;">(${formatBytes(att.size || 0)})</span>
        </div>
      `).join('');
    }

    // Pre-preenche reply
    const replyTo = parseReplyTo(from);
    document.getElementById('emailReplyTo').innerHTML = `Para: <strong>${escHtml(replyTo)}</strong>`;

    // Marca como lido (silencioso)
    if ((msg.labelIds || []).includes('UNREAD')) {
      sbGmailProxy('modifyMessage', { messageId, removeLabelIds: ['UNREAD'] })
        .then(() => {
          // Remove dot na lista
          const item = document.querySelector(`.email-list-item[data-id="${messageId}"]`);
          if (item) {
            item.classList.remove('unread');
            const dot = item.querySelector('.email-unread-dot');
            if (dot) dot.remove();
          }
          // Atualiza cache
          const cached = emailsCache.find(m => m.id === messageId);
          if (cached && cached.labelIds) {
            cached.labelIds = cached.labelIds.filter(l => l !== 'UNREAD');
          }
        })
        .catch(() => {});
    }
  } catch (e) {
    document.getElementById('emailDetailBody').innerHTML =
      '<div style="padding:20px;color:#e74c3c;font-size:13px;">Erro ao carregar e-mail.</div>';
    showToast('Erro: ' + (e?.message || ''), 'err');
  }
}

function voltarParaLista() {
  document.getElementById('emailWrap').classList.remove('mobile-detail');
  document.getElementById('emailDetail').style.display = 'none';
  document.getElementById('emailCompose').style.display = 'none';
  document.getElementById('emailEmpty').style.display = 'flex';
  document.querySelectorAll('.email-list-item').forEach(el => el.classList.remove('active'));
  emailAtual = null;
}

function mostrarVazio() {
  document.getElementById('emailDetail').style.display = 'none';
  document.getElementById('emailCompose').style.display = 'none';
  document.getElementById('emailEmpty').style.display = 'flex';
  document.getElementById('emailWrap').classList.remove('mobile-detail');
}

// ── Corpo do email ───────────────────────────────────────────────

function extrairCorpo(payload) {
  if (!payload) return { html: '', text: '' };

  if (payload.mimeType === 'text/html') {
    return { html: decodeBase64Url(payload.body?.data || ''), text: '' };
  }
  if (payload.mimeType === 'text/plain') {
    return { html: '', text: decodeBase64Url(payload.body?.data || '') };
  }
  if (payload.parts) {
    let html = '', text = '';
    for (const part of payload.parts) {
      const r = extrairCorpo(part);
      if (r.html) html = r.html;
      if (r.text && !text) text = r.text;
    }
    return { html, text };
  }
  return { html: '', text: '' };
}

function decodeBase64Url(data) {
  if (!data) return '';
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    try { return atob(base64); } catch { return ''; }
  }
}

function texto2html(text) {
  if (!text) return '';
  return '<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">' + escHtml(text) + '</pre>';
}

function renderCorpoEmail(htmlContent) {
  const container = document.getElementById('emailDetailBody');
  container.innerHTML = '';

  if (!htmlContent) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;font-style:italic;">Sem conteúdo.</div>';
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.className = 'email-body-frame';
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.setAttribute('title', 'Conteúdo do e-mail');
  container.appendChild(iframe);

  // Escreve o HTML no iframe de forma segura
  iframe.srcdoc = htmlContent;
  iframe.onload = () => {
    try {
      const body = iframe.contentDocument?.body;
      if (body) {
        const h = Math.max(150, body.scrollHeight + 20);
        iframe.style.height = h + 'px';
      }
    } catch {}
  };
}

// ── Anexos ───────────────────────────────────────────────────────

function extrairAnexos(payload, messageId) {
  const atts = [];
  function walk(part) {
    if (!part) return;
    const disp = (part.headers || []).find(h => h.name.toLowerCase() === 'content-disposition');
    const hasAttId = part.body?.attachmentId;
    const filename = part.filename || (disp?.value.match(/filename="?([^";]+)"?/i)?.[1]);
    if (filename && hasAttId) {
      atts.push({
        filename,
        mimeType: part.mimeType || 'application/octet-stream',
        attachmentId: part.body.attachmentId,
        size: part.body.size || 0,
      });
    }
    if (part.parts) part.parts.forEach(walk);
  }
  walk(payload);
  return atts;
}

async function baixarAnexo(messageId, attachmentId, filename, mimeType) {
  showToast('Baixando ' + filename + '...', '');
  try {
    const result = await sbGmailProxy('getAttachment', { messageId, attachmentId });
    const base64 = (result.data || '').replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    showToast('Falha ao baixar anexo.', 'err');
  }
}

// ── Compose: novo email ──────────────────────────────────────────

function abrirCompose() {
  emailAtual = null;
  anexosCompose = [];
  document.querySelectorAll('.email-list-item').forEach(el => el.classList.remove('active'));
  document.getElementById('emailWrap').classList.add('mobile-detail');
  document.getElementById('emailEmpty').style.display = 'none';
  document.getElementById('emailDetail').style.display = 'none';
  document.getElementById('emailCompose').style.display = 'flex';
  document.getElementById('composeTo').value = '';
  document.getElementById('composeSubject').value = '';
  document.getElementById('composeBody').value = '';
  document.getElementById('composeAttachPreview').innerHTML = '';
  document.getElementById('composeTo').focus();
}

function fecharCompose() {
  anexosCompose = [];
  document.getElementById('emailCompose').style.display = 'none';
  document.getElementById('emailWrap').classList.remove('mobile-detail');
  if (emailAtual) {
    document.getElementById('emailDetail').style.display = 'flex';
  } else {
    document.getElementById('emailEmpty').style.display = 'flex';
  }
}

async function enviarNovoEmail() {
  const to = document.getElementById('composeTo').value.trim();
  const subject = document.getElementById('composeSubject').value.trim();
  const body = document.getElementById('composeBody').value.trim();

  if (!to) { showToast('Informe o destinatário.', 'err'); return; }
  if (!body) { showToast('Escreva a mensagem.', 'err'); return; }

  const btn = document.getElementById('btnComposeSend');
  btn.disabled = true;
  btn.innerHTML = 'Enviando...';

  try {
    const raw = buildRawEmail({ to, subject, body, attachments: anexosCompose });
    await sbGmailProxy('sendMessage', { raw });
    fecharCompose();
    showToast('E-mail enviado!', 'ok');
    anexosCompose = [];
  } catch (e) {
    showToast('Falha ao enviar: ' + (e?.message || ''), 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l12 6-12 6V9.5L10 8 2 6.5V2z"/></svg> Enviar';
  }
}

function anexarArquivosCompose(input) {
  processarAnexos(input, anexosCompose, 'composeAttachPreview');
}

// ── Reply ────────────────────────────────────────────────────────

async function enviarResposta() {
  if (!emailAtual) return;

  const body = document.getElementById('emailReplyBody').value.trim();
  if (!body) { showToast('Escreva a resposta.', 'err'); return; }

  const btn = document.getElementById('btnReply');
  btn.disabled = true;
  btn.innerHTML = 'Enviando...';

  try {
    const from = getHeader(emailAtual, 'From');
    const to = parseReplyTo(from);
    const originalSubject = getHeader(emailAtual, 'Subject') || '';
    const subject = originalSubject.toLowerCase().startsWith('re:')
      ? originalSubject
      : 'Re: ' + originalSubject;

    const replyToMsgId = getHeader(emailAtual, 'Message-ID');
    const references = getHeader(emailAtual, 'References');

    const raw = buildRawEmail({
      to,
      subject,
      body,
      replyToMsgId,
      replyToRefs: references,
      attachments: anexosResposta,
    });

    await sbGmailProxy('sendMessage', { raw, threadId: emailAtual.threadId });

    document.getElementById('emailReplyBody').value = '';
    anexosResposta = [];
    document.getElementById('emailReplyAttachPreview').innerHTML = '';
    showToast('Resposta enviada!', 'ok');
  } catch (e) {
    showToast('Falha ao responder: ' + (e?.message || ''), 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l12 6-12 6V9.5L10 8 2 6.5V2z"/></svg> Responder';
  }
}

function anexarArquivosResposta(input) {
  processarAnexos(input, anexosResposta, 'emailReplyAttachPreview');
}

// ── Anexos (processamento) ───────────────────────────────────────

async function processarAnexos(input, arr, previewId) {
  const files = Array.from(input.files || []);
  input.value = '';

  for (const file of files) {
    if (file.size > 7 * 1024 * 1024) {
      showToast(`"${file.name}" excede 7 MB.`, 'err');
      continue;
    }
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    arr.push({ name: file.name, mimeType: file.type || 'application/octet-stream', base64 });
  }
  renderAnexosPreview(arr, previewId);
}

function renderAnexosPreview(arr, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = arr.map((a, i) => `
    <div class="email-attach-preview-chip">
      ${escHtml(a.name)}
      <button onclick="removerAnexo(${i},'${containerId}')" title="Remover">✕</button>
    </div>
  `).join('');
}

function removerAnexo(index, containerId) {
  if (containerId === 'composeAttachPreview') {
    anexosCompose.splice(index, 1);
    renderAnexosPreview(anexosCompose, 'composeAttachPreview');
  } else {
    anexosResposta.splice(index, 1);
    renderAnexosPreview(anexosResposta, 'emailReplyAttachPreview');
  }
}

// ── Construção de MIME ───────────────────────────────────────────

function buildRawEmail({ to, subject, body, replyToMsgId, replyToRefs, attachments = [] }) {
  const boundary = 'igui_' + Math.random().toString(36).slice(2, 12);
  const hasAttachments = attachments.length > 0;

  const encSubject = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subject || ''))) + '?=';

  const headers = [
    'MIME-Version: 1.0',
    `To: ${to}`,
    `Subject: ${encSubject}`,
  ];

  if (replyToMsgId) {
    headers.push(`In-Reply-To: ${replyToMsgId}`);
    const refs = replyToRefs ? `${replyToRefs} ${replyToMsgId}` : replyToMsgId;
    headers.push(`References: ${refs}`);
  }

  let bodyStr;
  if (!hasAttachments) {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: base64');
    bodyStr = btoa(unescape(encodeURIComponent(body)));
  } else {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

    const textPart = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(body))),
    ].join('\r\n');

    const attachParts = attachments.map(a => [
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; name="${a.name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${a.name}"`,
      '',
      a.base64,
    ].join('\r\n')).join('\r\n');

    bodyStr = [textPart, attachParts, `--${boundary}--`].join('\r\n');
  }

  const raw = [...headers, '', bodyStr].join('\r\n');
  // Codifica em base64url
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Utilitários ──────────────────────────────────────────────────

function getHeader(msg, name) {
  const headers = msg?.payload?.headers || [];
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseFromName(from) {
  if (!from) return '—';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, '').trim() || from;
}

function parseReplyTo(from) {
  if (!from) return '';
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1];
  return from.trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    const isThisYear = d.getFullYear() === now.getFullYear();
    if (isThisYear) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Toast ────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Modais ───────────────────────────────────────────────────────

function fecharModais() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

function abrirModalSenha() {
  document.getElementById('modalSenha').classList.add('show');
  setTimeout(() => document.getElementById('novaSenha').focus(), 50);
}

async function salvarNovaSenha() {
  const nova = document.getElementById('novaSenha').value.trim();
  if (nova.length < 6) { showToast('Mínimo 6 caracteres.', 'err'); return; }
  try {
    const { error } = await sb.auth.updateUser({ password: nova });
    if (error) throw error;
    fecharModais();
    showToast('Senha alterada com sucesso!', 'ok');
  } catch (e) {
    showToast('Erro: ' + (e?.message || ''), 'err');
  }
}
