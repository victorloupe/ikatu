// ═══════════════════════════════════════════════════
// LOGO iGUI embutido
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════
const S = {
  imgs: { '3d':['','','','',''], deck:['',''], cer:[''], rev:['',''], mob:['',''], pai:['',''] },
  exibirCapa3d: {},
  acc: {
    corrimao:   {on:false, modelo:'', img:''},
    cascata:    {on:false, modelo:'', img:'', cor_pedra:''},
    filtragem:  {on:false, modelo:'', img:'', cor:''},
    aquecimento:{on:false, modelo:'', img:''},
    igui_stone: {on:false, modelo:'', img:''},
  },
  itens: {rev:[], mob:[], pai:[], rev2:[], mob2:[], pai2:[]},
  // Índice das imagens 3D selecionadas (0-3: Vista1/2/3/Superior, sem deck)
  selectedImgs: {
    rev: [null, null],
    mob: [null, null],
    pai: [null, null],
    rev2: [null, null],
    mob2: [null, null],
    pai2: [null, null],
  },
  // Seções ativas (false = não aparece no PDF e step oculto)
  secAtiva: { rev: true, mob: true, pai: true },
  // Prancha extra (2ª página) por seção — false = não existe
  pranchaExtra: { rev: false, mob: false, pai: false },
  // ID do projeto sendo editado (null = nova prancha)
  _editandoId: null,
};
let cur = 0;
let saveTimer = null;
const SAVE_KEY = 'prancha_igui_autosave';

// ═══════════════════════════════════════════════════
// AUTO-SAVE / RESTORE — usando IndexedDB para suportar imagens grandes
// ═══════════════════════════════════════════════════
let db = null;

function initDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('PranchaIGUI', 2);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('dados')) d.createObjectStore('dados');
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

// ─── Projetos: salvar (Supabase) ───────────────────
async function salvarProjeto(payload, existingId) {
  try {
    const id = await sbSalvarProjeto(payload, existingId || null);
    return id;
  } catch(e) {
    console.error('Erro ao salvar projeto no Supabase:', e);
    throw e;
  }
}

// ─── Projetos: listar (Supabase) ───────────────────
async function listarProjetos() {
  try { return await sbListarProjetos(); }
  catch(e) { console.error('Erro ao listar projetos:', e); return []; }
}

// ─── Projetos: deletar (Supabase) ──────────────────
async function deletarProjeto(id) {
  try { await sbDeletarProjeto(id); }
  catch(e) { console.error('Erro ao deletar projeto:', e); throw e; }
}

function dbSave(key, val) {
  if (!db) return;
  try {
    const tx  = db.transaction('dados', 'readwrite');
    const req = tx.objectStore('dados').put(val, key);
    req.onerror = e => {
      if (e.target.error && e.target.error.name === 'QuotaExceededError') {
        showToast('⚠️ Armazenamento cheio. Exporte sua sessão (.igui) para não perder os dados.', 'err');
      }
    };
  } catch(e) { console.warn('dbSave error:', e); }
}

function dbGet(key) {
  return new Promise((res, rej) => {
    if (!db) { res(null); return; }
    const tx = db.transaction('dados', 'readonly');
    const req = tx.objectStore('dados').get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => res(null);
  });
}

function getFormData() {
  return {
    loja:             v('loja'),
    cliente:          v('cliente'),
    id_projeto:       v('id_projeto'),
    data_proj:        v('data_proj'),
    cidade:           v('cidade'),
    obs:              v('obs'),
    modelo:           v('modelo'),
    ceramica_marca:   v('ceramica_marca'),
    ceramica_nome:    v('ceramica_nome'),
    ceramica_tamanho: v('ceramica_tamanho'),
    ceramica_rejunte: v('ceramica_rejunte'),
    usuario_logado:   v('usuario_logado'),
  };
}

function v(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Retorna o src correto para exibição: URL direta ou data URI de base64. */
function imgSrc(val) {
  if (!val) return '';
  return (typeof val === 'string' && val.startsWith('http'))
    ? val
    : 'data:image/jpeg;base64,' + val;
}

function clearNode(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function setLogoImages() {
  document.querySelectorAll('[data-logo="igui"]').forEach(img => {
    img.src = 'logo_site.png';
  });
}

function setSaveStatus(status) {
  const dot = document.getElementById('saveDot');
  const lbl = document.getElementById('saveLabel');
  dot.className = 'save-dot ' + status;
  const msgs = { saving:'Salvando...', saved:'Salvo automaticamente', '':'Aguardando...' };
  lbl.textContent = msgs[status] || 'Salvo automaticamente';
}

// ═══════════════════════════════════════════════════
// EXPORTAR / IMPORTAR SESSÃO (.igui)
// ═══════════════════════════════════════════════════
async function exportarSessao() {
  setSaveStatus('saving');
  try {
    const payload = {
      version: '1.0',
      ts: Date.now(),
      app: 'PranchaIGUI',
      form: getFormData(),
      imgs: S.imgs,
      origImgs: S.origImgs || {},
      acc:  S.acc,
      itens: S.itens,
      selectedImgs: S.selectedImgs,
      secAtiva: S.secAtiva,
      pranchaExtra: S.pranchaExtra,
      step: cur,
      obsPadrao: obsPadraoAtivo,
    };

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');

    // Nome do arquivo de sessão
    const id      = (payload.form.id_projeto||'000000').trim();
    const modelo_ = (payload.form.modelo||'').replace(/[<>:"/\\|?*]/g,'').trim();
    const lojaRaw = (payload.form.loja||'').replace(/[<>:"/\\|?*]/g,'').trim();
    const d       = new Date();
    const data    = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    a.href     = url;
    a.download = `${id}_Prancha Tecnica-${modelo_}_${lojaRaw}_${data}.igui`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setSaveStatus('saved');
    showToast('✅ Sessão exportada! Abra este arquivo para continuar editando.', 'ok');
  } catch(e) {
    console.error('Export error:', e);
    showToast('❌ Erro ao exportar sessão.', 'err');
  }
}

async function importarSessao(input) {
  const file = input.files[0];
  if (!file) return;

  // Validar extensão
  if (!file.name.endsWith('.igui')) {
    showToast('❌ Arquivo inválido. Use um arquivo .igui gerado por este sistema.', 'err');
    input.value = '';
    return;
  }

  try {
    const text = await file.text();
    const d    = JSON.parse(text);

    if (!d.app || d.app !== 'PranchaIGUI') {
      showToast('❌ Arquivo não reconhecido.', 'err');
      return;
    }

    // Restaurar campos do formulário
    const f = d.form || {};
    Object.entries(f).forEach(([k, val]) => {
      const el = document.getElementById(k);
      if (el) el.value = val || '';
    });

    // Restaurar imagens
    if (d.imgs) {
      if (d.origImgs) S.origImgs = JSON.parse(JSON.stringify(d.origImgs));
      Object.entries(d.imgs).forEach(([grp, arr]) => {
        arr.forEach((b64, idx) => {
          if (b64) {
            S.imgs[grp][idx] = b64;
            restoreSlot(grp, idx, b64);
          }
        });
      });
    }

    // Restaurar acessórios
    if (d.acc) {
      Object.assign(S.acc, d.acc);
      renderAcc();
    }

    // Restaurar itens
    if (d.itens) {
      Object.assign(S.itens, d.itens);
      ['rev','mob','pai'].forEach(t => renderItems(t));
    }

    // Restaurar seleção de imagens
    if (d.selectedImgs) Object.assign(S.selectedImgs, d.selectedImgs);

    // Restaurar seções ativas
    if (d.secAtiva) Object.assign(S.secAtiva, d.secAtiva);
    updateAllSecUI();

    // Restaurar pranchas extras (2ª página por seção)
    if (d.pranchaExtra) Object.assign(S.pranchaExtra, d.pranchaExtra);
    atualizarPranchasExtra();

  updateStepChecks();

    // Restaurar estado do toggle obs padrão
    if (d.obsPadrao !== undefined) {
      obsPadraoAtivo = d.obsPadrao;
      document.getElementById('obsPadraoToggle').classList.toggle('ativo', obsPadraoAtivo);
    }

    // Ir para a aba salva
    if (d.step !== undefined) ir(d.step);

    // Salvar no IndexedDB também
    dbSave('autosave', { ...d, ts: Date.now() });

    input.value = '';

    // Sincronizar DEPOIS de tudo restaurado
    setTimeout(() => { syncDeckPreview(); renderImgSelectors(); updateStepChecks(); }, 150);

    showToast(`✅ Sessão "${file.name}" carregada com sucesso!`, 'ok');

  } catch(e) {
    console.error('Import error:', e);
    showToast('❌ Erro ao carregar sessão: ' + e.message, 'err');
    input.value = '';
  }
}

// ═══════════════════════════════════════════════════
// OBS PADRÃO iGUI
// ═══════════════════════════════════════════════════
let obsPadraoAtivo = false;
const OBS_PADRAO_TXT = 'NAO E RECOMENDACAO DA IGUI REVESTIR A BORDA COM CERAMICA, A NOSSA SUGESTAO E A LINHA DE PEDRAS NATURAIS. CLIENTE FICA CIENTE QUE A MANUTENCAO DA BORDA E DE SUA RESPONSABILIDADE.';

function toggleObsPadrao() {
  obsPadraoAtivo = !obsPadraoAtivo;
  const toggle = document.getElementById('obsPadraoToggle');
  const obs    = document.getElementById('obs');

  toggle.classList.toggle('ativo', obsPadraoAtivo);

  if (obsPadraoAtivo) {
    obs.dataset.textoAntes = obs.value.trim();
    const atual = obs.value.trim();
    obs.value = atual ? atual + ' ' + OBS_PADRAO_TXT : OBS_PADRAO_TXT;
  } else {
    obs.value = obs.dataset.textoAntes || '';
    delete obs.dataset.textoAntes;
  }
  autoSave();
}

function autoSave() {
  setSaveStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const payload = {
        form: getFormData(),
        imgs: S.imgs,
        origImgs: S.origImgs || {},
        acc:  S.acc,
        itens: S.itens,
        selectedImgs: S.selectedImgs,
        secAtiva: S.secAtiva,
        pranchaExtra: S.pranchaExtra,
        exibirCapa3d: S.exibirCapa3d || {},
        _editandoId: S._editandoId,
        step: cur,
        obsPadrao: obsPadraoAtivo,
        ts: Date.now(),
      };
      dbSave('autosave', payload);
      setSaveStatus('saved');
      updateStepChecks();
    } catch(e) {
      console.warn('Save error', e);
    }
  }, 800);
}

async function checkRestore() {
  const saved = await dbGet('autosave');
  if (!saved || !saved.ts) return;
  if (Date.now() - saved.ts > 7 * 24 * 60 * 60 * 1000) return;

  window._savedData = saved;

  // Se veio da página de projetos (clicou Editar), restaura automaticamente
  if (sessionStorage.getItem('igui_autoRestore') === '1') {
    sessionStorage.removeItem('igui_autoRestore');
    restaurar();
    return;
  }

  // Caso contrário, mostra o banner normal
  document.getElementById('restoreBanner').classList.add('show');
}

function restaurar() {
  const d = window._savedData;
  if (!d) return;
  document.getElementById('restoreBanner').classList.remove('show');

  // Form fields
  const f = d.form || {};
  Object.entries(f).forEach(([k, val]) => {
    const el = document.getElementById(k);
    if (el) el.value = val;
  });

  // Renderizar área de cerâmica ANTES de restaurar imagens (recria sl-cer-0)
  const marcaRestored = f.ceramica_marca || '';
  if (marcaRestored) {
    renderCeramicaArea(marcaRestored);
    // ceramica_nome é criado dinamicamente — restaurar APÓS criar o elemento
    const nomeEl = document.getElementById('ceramica_nome');
    if (nomeEl && f.ceramica_nome) {
      nomeEl.value = f.ceramica_nome;
      // Para Atlas, re-renderizar com o nome correto (seleciona opção + carrega imagem)
      if (marcaRestored === 'Atlas') renderCeramicaArea(marcaRestored);
    }
  }

  // Images
  if (d.imgs) {
    Object.assign(S.imgs, d.imgs);
    if (d.origImgs) S.origImgs = JSON.parse(JSON.stringify(d.origImgs));
    if (typeof renderVistas3D === 'function') renderVistas3D();
    Object.entries(d.imgs).forEach(([grp, arr]) => {
      arr.forEach((b64, idx) => {
        if (b64 && (grp !== '3d' || idx === 4)) restoreSlot(grp, idx, b64);
      });
    });
  }

  // Accessories
  if (d.acc) {
    Object.assign(S.acc, d.acc);
    renderAcc();
  }

  // Items
  if (d.itens) {
    Object.assign(S.itens, d.itens);
    ['rev','mob','pai'].forEach(t => renderItems(t));
  }

  // Restaurar seleção de imagens nas abas
  if (d.selectedImgs) Object.assign(S.selectedImgs, d.selectedImgs);

  // Restaurar seções ativas
  if (d.secAtiva) Object.assign(S.secAtiva, d.secAtiva);

  // Restaurar pranchas extras (2ª página por seção)
  if (d.pranchaExtra) Object.assign(S.pranchaExtra, d.pranchaExtra);
  atualizarPranchasExtra();

  // Restaurar exibirCapa3d
  if (d.exibirCapa3d) S.exibirCapa3d = d.exibirCapa3d;

  // Restaurar ID de edição (mantém vínculo com o projeto original)
  S._editandoId = d._editandoId || null;

  updateAllSecUI();
  updateStepChecks();

  if (d.step !== undefined) ir(d.step);

  // Sincronizar seletores DEPOIS de restaurar tudo
  setTimeout(() => { syncDeckPreview(); renderImgSelectors(); updateEditBadge(); }, 150);

  updateStepChecks();
  showToast('✅ Dados restaurados com sucesso!', 'ok');
}

function restoreSlot(grp, idx, b64) {
  const slot = document.getElementById(`sl-${grp}-${idx}`);
  if (!slot) return;
  slot.classList.add('has-img');
  let img = slot.querySelector('img');
  if (!img) { img = document.createElement('img'); slot.appendChild(img); }
  img.src = imgSrc(b64);
  
  // Adiciona botão de editar se não existir
  let editBtn = slot.querySelector('.btn-edit-crop');
  if (!editBtn) {
    editBtn = document.createElement('button');
    editBtn.className = 'btn-edit-crop';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Editar / Recortar imagem';
    editBtn.style.cssText = 'position:absolute; bottom:6px; left:6px; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:4px; width:28px; height:28px; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; z-index:5; transition:background 0.2s;';
    editBtn.onmouseover = () => editBtn.style.background = 'var(--blue)';
    editBtn.onmouseout = () => editBtn.style.background = 'rgba(0,0,0,0.6)';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      abrirEditorComImagemExistente(grp, idx);
    };
    slot.appendChild(editBtn);
  }
}

function descartarRestore() {
  document.getElementById('restoreBanner').classList.remove('show');
  dbSave('autosave', null);
}

// ═══════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════
function ir(step) {
  document.querySelectorAll('.card').forEach((c,i) => c.classList.toggle('active', i===step));
  document.querySelectorAll('.stp').forEach((b,i) => {
    b.classList.toggle('active', i===step);
    b.classList.toggle('done', i<step);
  });
  cur = step;
  document.getElementById('pFill').style.width = ((step+1)/6*100)+'%';
  const sc = document.getElementById('sidebarStepCount');
  if (sc) sc.textContent = (step+1)+' / 6';
  window.scrollTo({top:0, behavior:'smooth'});
}

// ═══════════════════════════════════════════════════
// IMAGE LOADING
// ═══════════════════════════════════════════════════
// Variáveis de estado para o recorte de imagens
let cropState = {
  currentGrp: '',
  currentIdx: '',
  imgEl: null,
  zoom: 1.0,
  x: 0,
  y: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  imgWidth: 0,
  imgHeight: 0
};

function loadImg(input, grp, idx) {
  const file = input.files[0];
  if (!file) return;

  const isLarge = file.size > 3 * 1024 * 1024;
  if (isLarge) {
    document.getElementById('overlay').classList.add('show');
    setLoad('Carregando imagem...');
    document.getElementById('loadSub').textContent =
      `${(file.size / 1024 / 1024).toFixed(1)} MB — aguarde...`;
  }

  // Lê e compacta a imagem original salvando-a diretamente no slot e no backup original
  compressImg(file, 1200, 0.85).then(compressed => {
    const b64 = compressed.split(',')[1];
    
    // Inicializa origImgs caso não exista no estado S
    if (!S.origImgs) S.origImgs = {};
    if (!S.origImgs[grp]) S.origImgs[grp] = [];
    
    S.imgs[grp][idx] = b64;
    S.origImgs[grp][idx] = b64; // Guarda o backup original original
    
    // Atualiza a visualização do slot injetando o botão de edição
    restoreSlot(grp, idx, b64);
    
    if (grp === '3d') {
      syncDeckPreview();
      renderImgSelectors();
    }
    
    autoSave();
    
    if (isLarge) {
      document.getElementById('overlay').classList.remove('show');
      document.getElementById('loadSub').textContent = 'Aguarde, isto pode levar alguns segundos';
    }
  }).catch(err => {
    console.error(err);
    if (isLarge) document.getElementById('overlay').classList.remove('show');
  });
}

function abrirEditorComImagemExistente(grp, idx) {
  // Inicializa origImgs se necessário
  if (!S.origImgs) S.origImgs = {};
  if (!S.origImgs[grp]) S.origImgs[grp] = [];
  
  // Usa o backup original se ele existir para que o usuário re-edite a partir da imagem original e não do recorte anterior!
  const b64 = S.origImgs[grp][idx] || S.imgs[grp][idx];
  if (!b64) return;
  
  const dataUrl = imgSrc(b64);
  
  cropState.currentGrp = grp;
  cropState.currentIdx = idx;
  cropState.zoom = 1.0;
  cropState.x = 0;
  cropState.y = 0;

  const cropImg = document.getElementById('cropImage');
  cropImg.src = dataUrl;
  
  cropImg.onload = function() {
    cropState.imgWidth = cropImg.naturalWidth;
    cropState.imgHeight = cropImg.naturalHeight;
    
    // Ajusta zoom inicial para preencher o viewport (480x360)
    const scaleX = 480 / cropState.imgWidth;
    const scaleY = 360 / cropState.imgHeight;
    const minScale = Math.max(scaleX, scaleY);
    
    cropState.zoom = Math.max(minScale, 1.0);
    
    // Limita os ranges do input slider
    const zoomRange = document.getElementById('cropZoomRange');
    zoomRange.min = (minScale * 0.8).toFixed(2);
    zoomRange.max = (Math.max(minScale * 4, 3.5)).toFixed(2);
    zoomRange.value = cropState.zoom;
    
    // Centraliza a imagem no viewport inicialmente
    cropState.x = (480 - cropState.imgWidth * cropState.zoom) / 2;
    cropState.y = (360 - cropState.imgHeight * cropState.zoom) / 2;
    
    applyCropTransform();
    updateCropZoomUI();
    
    // Abre o modal
    document.getElementById('cropModal').style.display = 'flex';
  };
}

function applyCropTransform() {
  const cropImg = document.getElementById('cropImage');
  if (cropImg) {
    // Definimos a origem da transformação no canto superior esquerdo para facilitar os cálculos de arrastar/redimensionar
    cropImg.style.transformOrigin = '0 0';
    cropImg.style.transform = `translate(${cropState.x}px, ${cropState.y}px) scale(${cropState.zoom})`;
  }
}

function updateCropZoomUI() {
  const zoomVal = document.getElementById('cropZoomValue');
  if (zoomVal) {
    zoomVal.textContent = `${Math.round(cropState.zoom * 100)}%`;
  }
  const zoomRange = document.getElementById('cropZoomRange');
  if (zoomRange) {
    zoomRange.value = cropState.zoom;
  }
}

function changeCropZoom(delta) {
  const zoomRange = document.getElementById('cropZoomRange');
  if (!zoomRange) return;
  const newZoom = Math.max(parseFloat(zoomRange.min), Math.min(parseFloat(zoomRange.max), cropState.zoom + delta));
  
  // Ajusta a posição x, y para fazer o zoom em relação ao centro do viewport (480x360)
  const viewCenterX = 240;
  const viewCenterY = 180;
  
  const imgCenterX = (viewCenterX - cropState.x) / cropState.zoom;
  const imgCenterY = (viewCenterY - cropState.y) / cropState.zoom;
  
  cropState.zoom = newZoom;
  cropState.x = viewCenterX - imgCenterX * cropState.zoom;
  cropState.y = viewCenterY - imgCenterY * cropState.zoom;
  
  applyCropTransform();
  updateCropZoomUI();
}

// Configura os ouvintes de eventos para arrastar e zoom do recorte
document.addEventListener('DOMContentLoaded', () => {
  const cropViewport = document.getElementById('cropViewport');
  const zoomRange = document.getElementById('cropZoomRange');

  if (cropViewport) {
    // Eventos de Mouse/Touch para arrastar
    const startDrag = (clientX, clientY) => {
      cropState.isDragging = true;
      cropState.startX = clientX - cropState.x;
      cropState.startY = clientY - cropState.y;
    };

    const drag = (clientX, clientY) => {
      if (!cropState.isDragging) return;
      cropState.x = clientX - cropState.startX;
      cropState.y = clientY - cropState.startY;
      applyCropTransform();
    };

    const stopDrag = () => {
      cropState.isDragging = false;
    };

    cropViewport.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => drag(e.clientX, e.clientY));
    window.addEventListener('mouseup', stopDrag);

    cropViewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    });
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        drag(e.touches[0].clientX, e.touches[0].clientY);
      }
    });
    window.addEventListener('touchend', stopDrag);

    // Zoom com scroll do mouse
    cropViewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      changeCropZoom(delta);
    }, { passive: false });
  }

  if (zoomRange) {
    zoomRange.addEventListener('input', (e) => {
      const targetZoom = parseFloat(e.target.value);
      const viewCenterX = 240;
      const viewCenterY = 180;
      const imgCenterX = (viewCenterX - cropState.x) / cropState.zoom;
      const imgCenterY = (viewCenterY - cropState.y) / cropState.zoom;
      
      cropState.zoom = targetZoom;
      cropState.x = viewCenterX - imgCenterX * cropState.zoom;
      cropState.y = viewCenterY - imgCenterY * cropState.zoom;
      
      applyCropTransform();
      updateCropZoomUI();
    });
  }
});

function fecharCropModal() {
  document.getElementById('cropModal').style.display = 'none';
  const cropImg = document.getElementById('cropImage');
  if (cropImg) cropImg.src = '';
}

function confirmarRecorte() {
  document.getElementById('overlay').classList.add('show');
  setLoad('Recortando imagem...');
  
  setTimeout(() => {
    try {
      const cropImg = document.getElementById('cropImage');
      const canvas = document.createElement('canvas');
      
      // Assegura largura e altura padrão para visualização
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      
      // Fundo branco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Fator de escala entre o tamanho do canvas de saída (800x600) e o viewport (480x360)
      const scaleCanvas = 800 / 480;
      
      // Desenha a imagem baseada nos parâmetros do cropState escalados para o canvas final
      ctx.drawImage(
        cropImg,
        cropState.x * scaleCanvas,
        cropState.y * scaleCanvas,
        cropState.imgWidth * cropState.zoom * scaleCanvas,
        cropState.imgHeight * cropState.zoom * scaleCanvas
      );
      
      // Comprime a imagem final recortada como jpeg de boa qualidade (0.85)
      const compressed = canvas.toDataURL('image/jpeg', 0.85);
      const b64 = compressed.split(',')[1];
      
      const grp = cropState.currentGrp;
      const idx = cropState.currentIdx;
      
      S.imgs[grp][idx] = b64;
      const slot = document.getElementById(`sl-${grp}-${idx}`);
      if (slot) {
        slot.classList.add('has-img');
        let img = slot.querySelector('img');
        if (!img) { img = document.createElement('img'); slot.appendChild(img); }
        img.src = compressed;
      }
      
      if (grp === '3d') {
        syncDeckPreview();
        renderImgSelectors();
      }
      
      autoSave();
      fecharCropModal();
    } catch (err) {
      console.error(err);
      alert('Erro ao recortar imagem.');
    } finally {
      document.getElementById('overlay').classList.remove('show');
      document.getElementById('loadSub').textContent = 'Aguarde, isto pode levar alguns segundos';
    }
  }, 100);
}

function usarOriginalSemRecortar() {
  document.getElementById('overlay').classList.add('show');
  setLoad('Processando imagem...');
  
  setTimeout(() => {
    try {
      const cropImg = document.getElementById('cropImage');
      const grp = cropState.currentGrp;
      const idx = cropState.currentIdx;
      
      // Podemos usar compressImg para assegurar um tamanho adequado sem recortar
      // (reduzindo w/h para máx de 1200px para o IndexedDB não estourar)
      compressImg(cropImg.src, 1200, 0.85).then(compressed => {
        const b64 = compressed.split(',')[1];
        S.imgs[grp][idx] = b64;
        
        const slot = document.getElementById(`sl-${grp}-${idx}`);
        if (slot) {
          slot.classList.add('has-img');
          let img = slot.querySelector('img');
          if (!img) { img = document.createElement('img'); slot.appendChild(img); }
          img.src = compressed;
        }
        
        if (grp === '3d') {
          syncDeckPreview();
          renderImgSelectors();
        }
        
        autoSave();
        fecharCropModal();
        document.getElementById('overlay').classList.remove('show');
        document.getElementById('loadSub').textContent = 'Aguarde, isto pode levar alguns segundos';
      }).catch(err => {
        console.error(err);
        alert('Erro ao processar imagem original.');
        document.getElementById('overlay').classList.remove('show');
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao processar imagem original.');
      document.getElementById('overlay').classList.remove('show');
    }
  }, 100);
}


// ═══════════════════════════════════════════════════
// TOGGLE DE SEÇÕES (Rev / Mob / Pai)
// ═══════════════════════════════════════════════════
const SEC_LABELS = { rev:'Revestimentos', mob:'Mobiliário', pai:'Paisagismo' };
const STEP_IDS   = { rev:3, mob:4, pai:5 }; // índice do step

function toggleSec(tipo) {
  S.secAtiva[tipo] = !S.secAtiva[tipo];
  updateSecUI(tipo);
  autoSave();
}

function updateSecUI(tipo) {
  const ativo  = S.secAtiva[tipo];
  const tog    = document.getElementById(`sectog-${tipo}`);
  const lbl    = document.getElementById(`sectog-lbl-${tipo}`);
  const stepBtn = document.querySelectorAll('.stp')[STEP_IDS[tipo]];

  if (tog) tog.classList.toggle('ativo', ativo);
  if (lbl) lbl.innerHTML = ativo
    ? `✅ Seção <strong>${SEC_LABELS[tipo]}</strong> ativada — aparecerá no PDF.`
    : `⚠️ Esta seção está <strong>DESATIVADA</strong> — não aparecerá no PDF. Clique para ativar.`;
  if (stepBtn) stepBtn.classList.toggle('desativado', !ativo);
}

function updateAllSecUI() {
  ['rev','mob','pai'].forEach(t => updateSecUI(t));
}

// ═══════════════════════════════════════════════════
// PRANCHAS EXTRAS — 2ª página opcional por seção (rev/mob/pai)
// ═══════════════════════════════════════════════════
const PRANCHA_ADD_LABEL = {
  rev: '＋ Adicionar Item',
  mob: '＋ Adicionar Item',
  pai: '＋ Adicionar Planta / Elemento',
};

// Injeta a barra de abas e a página 2 (oculta) dentro do card da seção
function montarAbasPrancha(tipo, cardSel) {
  const card = document.querySelector(cardSel);
  if (!card) return;
  const bd = card.querySelector('.card-bd');
  if (!bd || document.getElementById(`ptabs-${tipo}`)) return; // já montado
  const navActs = bd.querySelector('.nav-acts');
  const toggle  = bd.querySelector('.sec-toggle-wrap');
  if (!navActs || !toggle) return;

  // Move o conteúdo atual (entre o toggle e o nav-acts) para a "Prancha 1"
  const page1 = document.createElement('div');
  page1.className = 'prancha-page';
  page1.id = `ppage-${tipo}-1`;
  let n = toggle.nextSibling;
  const mover = [];
  while (n && n !== navActs) { mover.push(n); n = n.nextSibling; }
  mover.forEach(x => page1.appendChild(x));

  // Barra de abas
  const tabs = document.createElement('div');
  tabs.className = 'prancha-tabs';
  tabs.id = `ptabs-${tipo}`;
  tabs.innerHTML =
    `<button class="ptab active" id="ptab-${tipo}-1" onclick="verPrancha('${tipo}',1)">Prancha 1</button>` +
    `<button class="ptab" id="ptab-${tipo}-2" onclick="verPrancha('${tipo}',2)" style="display:none">Prancha 2</button>` +
    `<button class="ptab-add" id="ptab-add-${tipo}" onclick="togglePranchaExtra('${tipo}')" title="Adicionar uma 2ª prancha a esta seção">＋ prancha</button>` +
    `<button class="ptab-rm" id="ptab-rm-${tipo}" onclick="removerPranchaExtra('${tipo}')" title="Remover a 2ª prancha" style="display:none">🗑 Prancha 2</button>`;

  // Página 2 (mesma estrutura, vazia)
  const isPai = tipo === 'pai';
  const page2 = document.createElement('div');
  page2.className = 'prancha-page';
  page2.id = `ppage-${tipo}-2`;
  page2.style.display = 'none';
  page2.innerHTML =
    `<div class="div"><span>Imagens de Referência (do Projeto 3D)</span></div>` +
    `<p style="font-size:11px;color:var(--muted);margin-bottom:10px;">Escolha quais imagens do Projeto 3D aparecem nesta página da prancha.</p>` +
    `<div class="img-selector-grid" id="imgsel-${tipo}2">` +
      `<div class="img-sel-col"><label style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.3px;display:block;margin-bottom:6px">Painel Esquerdo</label><div class="img-sel-options" id="imgsel-${tipo}2-0"></div><div class="img-sel-preview" id="imgsel-preview-${tipo}2-0"></div></div>` +
      `<div class="img-sel-col"><label style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.3px;display:block;margin-bottom:6px">Painel Direito</label><div class="img-sel-options" id="imgsel-${tipo}2-1"></div><div class="img-sel-preview" id="imgsel-preview-${tipo}2-1"></div></div>` +
    `</div>` +
    `<div class="div"><span>${isPai ? 'Plantas e Elementos' : 'Itens'}</span></div>` +
    `<div class="items-list" id="lst-${tipo}2"></div>` +
    `<div class="btn-add-wrap"><button class="btn-add" onclick="addItem('${tipo}2')">${PRANCHA_ADD_LABEL[tipo]}</button><span class="item-count" id="item-count-${tipo}2">0 / 6</span></div>`;

  bd.insertBefore(tabs, navActs);
  bd.insertBefore(page1, navActs);
  bd.insertBefore(page2, navActs);
}

function verPrancha(tipo, n) {
  const p1 = document.getElementById(`ppage-${tipo}-1`);
  const p2 = document.getElementById(`ppage-${tipo}-2`);
  const t1 = document.getElementById(`ptab-${tipo}-1`);
  const t2 = document.getElementById(`ptab-${tipo}-2`);
  if (p1) p1.style.display = n === 1 ? '' : 'none';
  if (p2) p2.style.display = n === 2 ? '' : 'none';
  if (t1) t1.classList.toggle('active', n === 1);
  if (t2) t2.classList.toggle('active', n === 2);
}

function togglePranchaExtra(tipo) {
  if (S.pranchaExtra[tipo]) { verPrancha(tipo, 2); return; }
  S.pranchaExtra[tipo] = true;
  atualizarPranchasExtra();
  verPrancha(tipo, 2);
  autoSave();
}

function removerPranchaExtra(tipo) {
  if (!S.pranchaExtra[tipo]) return;
  if (!confirm('Remover a 2ª prancha desta seção? As imagens e itens dela serão apagados.')) return;
  S.pranchaExtra[tipo] = false;
  S.itens[tipo + '2'] = [];
  S.selectedImgs[tipo + '2'] = [null, null];
  atualizarPranchasExtra();
  verPrancha(tipo, 1);
  autoSave();
}

// Sincroniza a UI das abas com o estado S.pranchaExtra
function atualizarPranchasExtra() {
  ['rev','mob','pai'].forEach(tipo => {
    const ativa = !!(S.pranchaExtra && S.pranchaExtra[tipo]);
    const tab2 = document.getElementById(`ptab-${tipo}-2`);
    const add  = document.getElementById(`ptab-add-${tipo}`);
    const rm   = document.getElementById(`ptab-rm-${tipo}`);
    if (tab2) tab2.style.display = ativa ? '' : 'none';
    if (add)  add.style.display  = ativa ? 'none' : '';
    if (rm)   rm.style.display   = ativa ? '' : 'none';
    if (ativa) renderItems(tipo + '2');
    else verPrancha(tipo, 1);
  });
  renderImgSelectors();
}

// ═══════════════════════════════════════════════════
// SELETORES DE IMAGEM (Rev / Mob / Pai)
// ═══════════════════════════════════════════════════
const IMG_LABELS_3D = ['Vista 1','Vista 2','Vista 3','Vista Superior','Medidas do Deck'];
const IMG_LABELS_SEL = ['Vista 1','Vista 2','Vista 3','Vista Superior']; // sem deck nos seletores

function renderImgSelectors() {
  const tipos = [];
  ['rev','mob','pai'].forEach(t => { tipos.push(t); if (S.pranchaExtra && S.pranchaExtra[t]) tipos.push(t + '2'); });
  tipos.forEach(tipo => {
    [0,1].forEach(painel => {
      const container = document.getElementById(`imgsel-${tipo}-${painel}`);
      if (!container) return;
      clearNode(container);

      // Botões para cada imagem do 3D (Vista 1-4 e extras, sem Medidas do Deck)
      S.imgs['3d'].forEach((b64, i) => {
        if (i === 4) return; // ignora medidas do deck
        
        const b64_val = S.imgs['3d'][i];
        const btn = document.createElement('div');
        const isActive = S.selectedImgs[tipo][painel] === i;
        btn.className = 'img-sel-btn' + (isActive ? ' active' : '') + (!b64_val ? ' empty' : '');
        
        let labelText = `Vista ${i < 4 ? i + 1 : i}`;
        if (i === 3) labelText = 'Vista Superior';
        btn.title = labelText;
        
        if (b64_val) {
          const img = document.createElement('img');
          img.src = imgSrc(b64_val);
          btn.appendChild(img);
          btn.onclick = () => selectImg(tipo, painel, i);
        } else {
          const empty = document.createElement('div');
          empty.className = 'no-img';
          empty.textContent = '📷';
          btn.appendChild(empty);
        }
        const label = document.createElement('span');
        label.textContent = labelText;
        btn.appendChild(label);
        container.appendChild(btn);
      });

      updateSelectorPreview(tipo, painel);
    });
  });
}

function selectImg(tipo, painel, idx) {
  S.selectedImgs[tipo][painel] = idx;
  renderImgSelectors();
  autoSave();
}

function updateSelectorPreview(tipo, painel) {
  const preview = document.getElementById(`imgsel-preview-${tipo}-${painel}`);
  if (!preview) return;
  const idx = S.selectedImgs[tipo][painel];
  clearNode(preview);
  if (idx !== null && S.imgs['3d'][idx]) {
    const img = document.createElement('img');
    img.src = imgSrc(S.imgs['3d'][idx]);
    preview.appendChild(img);
  } else {
    preview.textContent = 'Nenhuma imagem selecionada';
  }
}

function syncDeckPreview() {
  // Preview da vista 1 (3d[0]) no painel esquerdo do descritivo
  const p0 = document.getElementById('sl-deck-preview-0');
  const p1 = document.getElementById('sl-deck-preview-1');
  if (p0) {
    const b0 = S.imgs['3d'][0];
    if (b0) {
      p0.classList.add('has-img');
      let i0 = p0.querySelector('img');
      if (!i0) { i0 = document.createElement('img'); p0.appendChild(i0); }
      i0.src = imgSrc(b0);
    } else {
      p0.classList.remove('has-img');
      p0.querySelector('img')?.remove();
    }
  }
  if (p1) {
    const b4 = S.imgs['3d'][4];
    if (b4) {
      p1.classList.add('has-img');
      let i1 = p1.querySelector('img');
      if (!i1) { i1 = document.createElement('img'); p1.appendChild(i1); }
      i1.src = imgSrc(b4);
    } else {
      p1.classList.remove('has-img');
      p1.querySelector('img')?.remove();
    }
  }
}

// Aceita File/Blob (direto do input) ou dataUrl (string) como source.
// Usa createImageBitmap quando disponível — decodifica fora da thread principal,
// evitando trava na UI com imagens grandes.
function compressImg(source, maxW, quality) {
  const doCanvas = (drawable, w, h) => {
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Fundo branco: evita que PNG com transparência vire preto no JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(drawable, 0, 0, w, h);
    if (drawable.close) drawable.close(); // libera ImageBitmap da memória
    return canvas.toDataURL('image/jpeg', quality);
  };

  return new Promise(res => {
    if (source instanceof Blob) {
      if (window.createImageBitmap) {
        createImageBitmap(source)
          .then(bmp => res(doCanvas(bmp, bmp.width, bmp.height)))
          .catch(() => {
            // Fallback via FileReader + Image
            const r = new FileReader();
            r.onload = e => { const img = new Image(); img.onload = () => res(doCanvas(img, img.width, img.height)); img.src = e.target.result; };
            r.readAsDataURL(source);
          });
      } else {
        const r = new FileReader();
        r.onload = e => { const img = new Image(); img.onload = () => res(doCanvas(img, img.width, img.height)); img.src = e.target.result; };
        r.readAsDataURL(source);
      }
    } else {
      // Legado: source é dataUrl string
      const img = new Image();
      img.onload = () => res(doCanvas(img, img.width, img.height));
      img.src = source;
    }
  });
}

function rmImg(grp, idx, e) {
  e.stopPropagation();
  S.imgs[grp][idx] = '';
  if (S.origImgs && S.origImgs[grp]) S.origImgs[grp][idx] = '';
  
  const slot = document.getElementById(`sl-${grp}-${idx}`);
  if (slot) {
    slot.classList.remove('has-img');
    const img = slot.querySelector('img');
    if (img) img.remove();
    const btnEdit = slot.querySelector('.btn-edit-crop');
    if (btnEdit) btnEdit.remove();
    const inp = slot.querySelector('input');
    if (inp) inp.value = '';
  }
  if (grp === '3d') {
    ['rev','mob','pai'].forEach(tipo => {
      S.selectedImgs[tipo] = S.selectedImgs[tipo].map(sel => sel === idx ? null : sel);
    });
    syncDeckPreview();
    renderImgSelectors();
  }
  autoSave();
}

// ═══════════════════════════════════════════════════
// ACCESSORIES
// ═══════════════════════════════════════════════════

// Mapeamento modelo → caminho de imagem local
const ACC_IMG = {
  corrimao: {
    'branco':   'imagens/equipamentos/corrimao_Branco.png',
    'carvalho': 'imagens/equipamentos/corrimao_Carvalho.png',
    'cinza':    'imagens/equipamentos/corrimao_Cinza.png',
    'imbuia':   'imagens/equipamentos/corrimao_Imbuia.png',
    'marfim':   'imagens/equipamentos/corrimao_Marfim.png',
    'preto':    'imagens/equipamentos/corrimao_Preto.png',
  },
  cascata: {
    'retro louisiana':        'imagens/equipamentos/cascataRetroLuisiana.png',
    'hidrojato escocês':      'imagens/equipamentos/Hidrojato.png',
    'personalizada igui':     'imagens/equipamentos/cascataPersonalizada.png',
    'inox':                   'imagens/equipamentos/cascataInox.png',
    'concreto contemporânea': 'imagens/equipamentos/cascataConcreto.png',
    // Iguaçu e Véu de Noiva dependem de cor_pedra (ver cascata_pedra)
  },
  cascata_pedra: {
    'iguaçu_black':            'imagens/equipamentos/cascataIguaçu-Veu_Black.png',
    'iguaçu_travertino':       'imagens/equipamentos/cascataIguaçu-Veu_Travertino.png',
    'iguaçu_cintilante':       'imagens/equipamentos/cascataIguaçu-Veu_Cintilante.png',
    'véu de noiva_black':      'imagens/equipamentos/cascataIguaçu-Veu_Black.png',
    'véu de noiva_travertino': 'imagens/equipamentos/cascataIguaçu-Veu_Travertino.png',
    'véu de noiva_cintilante': 'imagens/equipamentos/cascataIguaçu-Veu_Cintilante.png',
  },
  filtragem: {
    'g6_branco':   'imagens/equipamentos/G6_Branco.jpg',
    'g6_carvalho': 'imagens/equipamentos/G6_Carvalho.png',
    'g6_cinza':    'imagens/equipamentos/G6_Cinza.png',
    'g6_imbuia':   'imagens/equipamentos/G6_Imbuia.png',
    'g6_marfim':   'imagens/equipamentos/G6_Marfim.png',
    'g6_preto':    'imagens/equipamentos/G6_Preto.png',
    'g7_branco':   'imagens/equipamentos/G7_Branco.png',
    'g7_carvalho': 'imagens/equipamentos/G7_Carvalho.png',
    'g7_cinza':    'imagens/equipamentos/G7_Cinza.jpg',
    'g7_imbuia':   'imagens/equipamentos/G7_Imbuia.png',
    'g7_marfim':   'imagens/equipamentos/G7_Marfim.png',
    'g7_preto':    'imagens/equipamentos/G7_Preto.png',
  },
  igui_stone: {
    'black':      'imagens/bordas/bordaBlack.jpg',
    'travertino': 'imagens/bordas/bordaTravertino.jpg',
    'cintilante': 'imagens/bordas/bordaCintilante.jpg',
  },
  aquecimento: {
    'thermas kelvin p': 'imagens/equipamentos/termasKelvin.png',
    'thermas kelvin m': 'imagens/equipamentos/termasKelvin.png',
    'thermas kelvin g': 'imagens/equipamentos/termasKelvin.png',
  },
};

// Pastilhas Atlas — lista de modelos com arquivos de imagem
const ATLAS_TILES = [
  { nome: 'Bali',          arquivo: 'Bali.png' },
  { nome: 'Batu',          arquivo: 'Batu-SG9883.jpg' },
  { nome: 'Bermuda',       arquivo: 'Bermuda-SG8348.jpg' },
  { nome: 'Blend 21',      arquivo: 'Blend 21-SG7959.jpg' },
  { nome: 'Blend 40',      arquivo: 'Blend 40-SG13074.jpg' },
  { nome: 'Blend 46',      arquivo: 'Blend 46-SG11589.jpg' },
  { nome: 'Blend 55',      arquivo: 'Blend 55-SG14823.png' },
  { nome: 'Ceos',          arquivo: 'Ceos.png' },
  { nome: 'Cook',          arquivo: 'Cook.png' },
  { nome: 'Cook 15401',    arquivo: 'Cook-15401.png' },
  { nome: 'Delos AD',      arquivo: 'Delos-AD.png' },
  { nome: 'Duna',          arquivo: 'Duna.jpg' },
  { nome: 'Fiji',          arquivo: 'Fiji.jpg' },
  { nome: 'Juquei',        arquivo: 'Juquei.jpg' },
  { nome: 'Loulé',         arquivo: 'Loulé-14076.jpg' },
  { nome: 'ME14860',       arquivo: 'ME14860.jpg' },
  { nome: 'Mallorca',      arquivo: 'Mallorca.png' },
  { nome: 'Mikonos',       arquivo: 'Mikonos.png' },
  { nome: 'Milos',         arquivo: 'Milos.png' },
  { nome: 'Morea',         arquivo: 'Morea.png' },
  { nome: 'Nice',          arquivo: 'Nice.png' },
  { nome: 'Papete',        arquivo: 'Papete.png' },
  { nome: 'Rodes',         arquivo: 'Rodes.png' },
  { nome: 'Saona',         arquivo: 'Saona-SG15391.jpg' },
  { nome: 'Sarandi',       arquivo: 'Sarandi.png' },
  { nome: 'Siro',          arquivo: 'Siro.png' },
  { nome: 'Una',           arquivo: 'Una-SG8443.jpg' },
  { nome: 'Personalizado', arquivo: null },
];

const ACC_CFG = [
  {key:'corrimao',    label:'Corrimão',              icon:'🦯',
   opcoes:['Branco','Carvalho','Cinza','Imbuia','Marfim','Preto','Personalizado']},
  {key:'cascata',     label:'Cascata',               icon:'💧',
   opcoes:['Retro Louisiana','Véu de Noiva','Hidrojato Escocês','Personalizada iGUi','Inox','Iguaçu','Concreto Contemporânea','Personalizado']},
  {key:'filtragem',   label:'Sistema de Filtragem',  icon:'⚙️',
   opcoes:['G7 Conceito','G7 Comfort','G7 Eletronic System','G6 Conceito','G6 Comfort','G6 Eletronic System','Personalizado']},
  {key:'igui_stone',  label:'IGUI Stone',            icon:'🪨',
   opcoes:['Black','Travertino','Cintilante','Personalizado']},
  {key:'aquecimento', label:'Sistema de Aquecimento',icon:'🌡️',
   opcoes:['Thermas Kelvin P','Thermas Kelvin M','Thermas Kelvin G','Personalizado']},
];

function buildAccOpcoes(key, modeloAtual) {
  const cfg = ACC_CFG.find(c => c.key === key);
  const opcoes = cfg ? cfg.opcoes : [];
  const modeloUp = (modeloAtual || '').toUpperCase();
  const opcoesUp = opcoes.map(o => o.toUpperCase());
  const modeloLow = (modeloAtual || '').toLowerCase();

  // Determinar se é personalizado ou valor customizado não listado
  const isPersonalizado = modeloAtual === 'Personalizado' || modeloAtual === 'PERSONALIZADO';
  const isCustom = modeloAtual && !opcoesUp.includes(modeloAtual.toUpperCase()) && modeloAtual !== '';
  const mostrarInput = isPersonalizado || isCustom;
  const valorInput   = (isPersonalizado) ? '' : (isCustom ? modeloAtual : '');

  const SEL_STYLE = 'border:1.5px solid var(--border);border-radius:6px;padding:9px 13px;font-family:\'Inter\',sans-serif;font-size:14px;width:100%;margin-top:5px';
  const LBL_STYLE = 'font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.5px;display:block;margin-top:10px';

  let html = `<label style="${LBL_STYLE.replace('margin-top:10px','')}">Modelo</label>`;
  html += `<select onchange="onAccSelect('${key}',this)" style="${SEL_STYLE}">`;
  html += '<option value="">-- Selecione --</option>';
  opcoes.forEach(o => {
    const sel = o.toUpperCase() === modeloUp || o === modeloAtual ? 'selected' : '';
    html += `<option value="${escapeHtml(o)}" ${sel}>${escapeHtml(o)}</option>`;
  });
  html += '</select>';

  if (mostrarInput) {
    html += `<input type="text" value="${escapeHtml(valorInput)}" oninput="S.acc['${key}'].modelo=this.value;autoSave()" placeholder="Descreva o modelo..." style="margin-top:8px;${SEL_STYLE}">`;
  }

  // Sub-seletor de COR DA PEDRA para Cascata Iguaçu / Véu de Noiva
  if (key === 'cascata' && (modeloLow === 'iguaçu' || modeloLow === 'véu de noiva') && !mostrarInput) {
    const corAtual = (S.acc[key].cor_pedra || '').toLowerCase();
    const PEDRAS = ['Black', 'Travertino', 'Cintilante'];
    html += `<label style="${LBL_STYLE}">Cor da Pedra</label>`;
    html += `<select onchange="onAccCorSelect('${key}','pedra',this)" style="${SEL_STYLE}">`;
    html += '<option value="">-- Selecione a Pedra --</option>';
    PEDRAS.forEach(p => {
      const sel = p.toLowerCase() === corAtual ? 'selected' : '';
      html += `<option value="${p.toLowerCase()}" ${sel}>${p}</option>`;
    });
    html += '</select>';
  }

  // Filtragem: cor herdada do corrimão — apenas informa qual cor será usada
  if (key === 'filtragem' && !mostrarInput && (modeloLow.startsWith('g6') || modeloLow.startsWith('g7'))) {
    const corCorrimao = (S.acc.corrimao.modelo || '').toLowerCase();
    if (corCorrimao && corCorrimao !== 'personalizado') {
      html += `<div style="margin-top:8px;font-size:11px;color:var(--muted);padding:6px 8px;background:var(--bg2,#f5f5f5);border-radius:6px">🎨 Cor: <strong>${corCorrimao}</strong> (igual ao corrimão)</div>`;
    } else {
      html += `<div style="margin-top:8px;font-size:11px;color:var(--muted);padding:6px 8px;background:var(--bg2,#f5f5f5);border-radius:6px">🎨 Cor herdada do corrimão — selecione o corrimão primeiro</div>`;
    }
  }

  return html;
}

function renderAcc() {
  const g = document.getElementById('accGrid');
  g.innerHTML = '';
  ACC_CFG.forEach(({key, label, icon}) => {
    const a = S.acc[key];
    const div = document.createElement('div');
    div.className = 'acc' + (a.on ? ' on' : '');

    const isPersonalizado = !a.modelo || a.modelo.toUpperCase() === 'PERSONALIZADO';
    const imgHtml = a.img
      ? `<img src="${imgSrc(a.img)}">`
      : (isPersonalizado
          ? '<span style="font-size:18px;opacity:.3">📷</span>'
          : '<span style="font-size:11px;opacity:.4;text-align:center;padding:4px">Selecione o modelo</span>');
    const uploadHtml = isPersonalizado
      ? `<input type="file" accept="image/*" onchange="loadAccImg(this,'${key}')">`
      : '';

    div.innerHTML = `
      <div class="acc-hd" onclick="togAcc('${key}')">
        <div class="toggle"></div>
        <span style="font-size:15px">${icon}</span>
        <span class="acc-name">${label}</span>
      </div>
      <div class="acc-bd">
        <div class="acc-inner">
          <div class="acc-img${a.img ? ' has-img' : ''}" data-acc-key="${key}" title="Arraste uma imagem ou clique para enviar">
            ${imgHtml}
            ${uploadHtml}
          </div>
          <div class="field" style="flex:1">
            ${buildAccOpcoes(key, a.modelo)}
          </div>
        </div>
      </div>
    `;
    g.appendChild(div);
  });
}

function togAcc(key) {
  S.acc[key].on = !S.acc[key].on;
  renderAcc();
  initDropZones();
  autoSave();
}

function onAccSelect(key, sel) {
  const val = sel.value;
  const valLow = val.toLowerCase();

  // Resetar sub-seleções ao trocar modelo
  if (S.acc[key].cor_pedra !== undefined) S.acc[key].cor_pedra = '';
  if (S.acc[key].cor !== undefined) S.acc[key].cor = '';

  if (val === 'Personalizado') {
    S.acc[key].modelo = 'Personalizado';
    S.acc[key].img = '';
  } else if (!val) {
    S.acc[key].modelo = '';
    S.acc[key].img = '';
  } else {
    S.acc[key].modelo = val;

    const modelos_com_sub = ['iguaçu', 'véu de noiva']; // cascata precisa de cor_pedra
    const needsPedra = (key === 'cascata' && modelos_com_sub.includes(valLow));

    if (key === 'filtragem' && (valLow.startsWith('g6') || valLow.startsWith('g7'))) {
      // Filtragem: cor herdada do corrimão automaticamente
      const gen = valLow.startsWith('g6') ? 'g6' : 'g7';
      const corCorrimao = (S.acc.corrimao.modelo || '').toLowerCase();
      if (corCorrimao && corCorrimao !== 'personalizado') {
        const path = (ACC_IMG.filtragem || {})[gen + '_' + corCorrimao];
        if (path) loadAccImgFromPath(path, key);
        else S.acc[key].img = '';
      } else {
        S.acc[key].img = '';
      }
    } else if (!needsPedra) {
      const map = ACC_IMG[key] || {};
      const path = map[valLow];
      if (path) loadAccImgFromPath(path, key);
      else S.acc[key].img = '';
    } else {
      S.acc[key].img = ''; // aguarda seleção de cor_pedra
    }

    // Quando muda a cor do CORRIMÃO, atualizar imagem da filtragem automaticamente
    if (key === 'corrimao') {
      const filtModeloLow = (S.acc.filtragem.modelo || '').toLowerCase();
      if (filtModeloLow.startsWith('g6') || filtModeloLow.startsWith('g7')) {
        const gen = filtModeloLow.startsWith('g6') ? 'g6' : 'g7';
        const path = (ACC_IMG.filtragem || {})[gen + '_' + valLow];
        if (path) loadAccImgFromPath(path, 'filtragem');
      }
    }
  }
  renderAcc();
  autoSave();
}

function loadAccImg(input, key) {
  const file = input.files[0];
  if (!file) return;
  compressImg(file, 400, 0.8).then(c => {
    S.acc[key].img = c.split(',')[1];
    renderAcc();
    autoSave();
  });
}

// ───────────────────────────────────────────────────
// CARREGAMENTO DE IMAGEM POR CAMINHO LOCAL
// ───────────────────────────────────────────────────

function loadImgFromPath(path, callback) {
  // 1) XHR+Blob: funciona com file:// sem restrições CORS
  const xhr = new XMLHttpRequest();
  xhr.open('GET', path, true);
  xhr.responseType = 'blob';
  xhr.onload = function() {
    if (xhr.status === 200 || xhr.status === 0) {
      const reader = new FileReader();
      reader.onloadend = function() {
        // 2) img.src = dataURL (blob) → canvas NÃO fica "tainted"
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const maxSize = 1400; // alta resolução para PDF nítido
          let w = img.width, h = img.height;
          if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
          if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          // 3) Sempre salva como JPEG compatível com insFit/ins
          const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
          callback(b64);
        };
        img.onerror = function() { console.warn('Erro ao processar imagem:', path); };
        img.src = reader.result; // dataURL do blob, sem problema de taint
      };
      reader.readAsDataURL(xhr.response);
    } else {
      console.warn('Imagem não encontrada:', path, xhr.status);
    }
  };
  xhr.onerror = function() { console.warn('Erro XHR ao carregar:', path); };
  xhr.send();
}

function loadAccImgFromPath(path, key) {
  loadImgFromPath(path, b64 => {
    S.acc[key].img = b64;
    renderAcc();
    autoSave();
  });
}

function loadCerImgFromPath(path) {
  loadImgFromPath(path, b64 => {
    S.imgs.cer[0] = b64;
    restoreSlot('cer', 0, b64);
    autoSave();
  });
}

// ───────────────────────────────────────────────────
// DRAG & DROP — todos os slots e acc-img
// ───────────────────────────────────────────────────

function handleSlotDrop(slot, file) {
  // Tenta usar o input[type=file] existente no slot
  const inp = slot.querySelector('input[type="file"]');
  if (inp) {
    const attr = inp.getAttribute('onchange') || '';
    const m = attr.match(/loadImg\(this,'([^']+)',(\d+)\)/);
    if (m) { loadImg({ files: [file] }, m[1], parseInt(m[2])); return; }
  }
  // Fallback: extrai grp/idx do id do slot (ex: sl-3d-0, sl-cer-0)
  const idMatch = slot.id && slot.id.match(/^sl-(.+)-(\d+)$/);
  if (idMatch) loadImg({ files: [file] }, idMatch[1], parseInt(idMatch[2]));
}

function handleAccImgDrop(accImg, file) {
  const key = accImg.dataset.accKey;
  if (!key) return;
  compressImg(file, 1200, 0.92).then(c => {
    S.acc[key].img = c.split(',')[1];
    renderAcc();
    initDropZones();
    autoSave();
  });
}

function initDropZones() {
  const addDrop = (el, onDrop) => {
    if (el._dropReady) return;
    el._dropReady = true;
    el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); });
    el.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); el.classList.remove('drag-over');
      const file = [...(e.dataTransfer.files || [])].find(f => f.type.startsWith('image/'));
      if (file) onDrop(el, file);
    });
  };

  document.querySelectorAll('.slot').forEach(slot => addDrop(slot, handleSlotDrop));
  document.querySelectorAll('.acc-img').forEach(el => addDrop(el, handleAccImgDrop));
}

// Sub-seleção de cor para cascata (cor_pedra) e filtragem (cor)
function onAccCorSelect(key, tipo, sel) {
  const val = sel.value;
  if (tipo === 'pedra') {
    S.acc[key].cor_pedra = val;
    if (val) {
      const modelo = (S.acc[key].modelo || '').toLowerCase();
      const pathKey = modelo + '_' + val;
      const path = (ACC_IMG.cascata_pedra || {})[pathKey];
      if (path) loadAccImgFromPath(path, key);
    }
  } else {
    // tipo = 'g6' ou 'g7'
    S.acc[key].cor = val;
    if (val) {
      const pathKey = tipo + '_' + val;
      const path = (ACC_IMG.filtragem || {})[pathKey];
      if (path) loadAccImgFromPath(path, key);
    }
  }
  autoSave();
}

// ───────────────────────────────────────────────────
// CERÂMICA DINÂMICA (Atlas / Villagres / Outra)
// ───────────────────────────────────────────────────

function onCeramicaMarcaChange(marca) {
  autoSave();
  // Limpar imagem existente ao trocar marca
  S.imgs.cer[0] = '';
  renderCeramicaArea(marca);
}

function renderCeramicaArea(marca) {
  const nomeField = document.getElementById('ceramica-nome-field');
  const imgArea   = document.getElementById('ceramica-img-area');
  if (!nomeField || !imgArea) return;

  const nomeAtual = v('ceramica_nome') || '';
  const SEL_STYLE = 'border:1.5px solid var(--border);border-radius:6px;padding:9px 13px;font-family:\'Inter\',sans-serif;font-size:14px;width:100%;margin-top:4px';

  if (marca === 'Atlas') {
    // Dropdown com modelos Atlas
    const nomeMatch = ATLAS_TILES.find(t => t.nome.toUpperCase() === nomeAtual.toUpperCase());
    const nomeSelect = nomeMatch ? nomeMatch.nome : '';

    let html = `<label style="font-size:12px;font-weight:600;color:var(--label-color,#444)">Modelo Atlas</label>`;
    html += `<select id="ceramica_nome" onchange="onAtlasTileSelect(this.value)" style="${SEL_STYLE}">`;
    html += '<option value="">-- Selecione o Modelo --</option>';
    ATLAS_TILES.forEach(t => {
      const sel = t.nome === nomeSelect ? 'selected' : '';
      html += `<option value="${escapeHtml(t.nome)}" ${sel}>${escapeHtml(t.nome)}</option>`;
    });
    html += '</select>';
    nomeField.innerHTML = html;

    // Mostrar imagem do modelo selecionado ou upload para Personalizado
    if (nomeSelect && nomeSelect !== 'Personalizado') {
      const tile = ATLAS_TILES.find(t => t.nome === nomeSelect);
      if (tile && tile.arquivo && !S.imgs.cer[0]) {
        loadCerImgFromPath('imagens/pastilhas/' + tile.arquivo);
      }
    }
    renderCerImgArea(nomeSelect === 'Personalizado' || !nomeSelect);

  } else {
    // Villagres / Outra / vazio — input de texto + upload manual
    let html = `<label style="font-size:12px;font-weight:600;color:var(--label-color,#444)">Nome / Código Cerâmica</label>`;
    html += `<input type="text" id="ceramica_nome" value="${escapeHtml(nomeAtual)}" placeholder="Ex: Acqua Blu" oninput="autoSave()" style="${SEL_STYLE}">`;
    nomeField.innerHTML = html;
    renderCerImgArea(true);
  }
}

function renderCerImgArea(mostrarUpload) {
  const imgArea = document.getElementById('ceramica-img-area');
  if (!imgArea) return;

  if (mostrarUpload) {
    imgArea.innerHTML = `
      <div class="slot" id="sl-cer-0" style="aspect-ratio:1">
        <input type="file" accept="image/*" onchange="loadImg(this,'cer',0)">
        <div class="ph"><div class="i">🪟</div><div class="t">Amostra Cerâmica</div></div>
        <button class="rm" onclick="rmImg('cer',0,event)">✕</button>
      </div>`;
  } else {
    imgArea.innerHTML = `<div class="slot" id="sl-cer-0" style="aspect-ratio:1">
        <div class="ph"><div class="i">⏳</div><div class="t">Carregando...</div></div>
      </div>`;
  }
  // Restaurar imagem salva se existir
  if (S.imgs.cer[0]) restoreSlot('cer', 0, S.imgs.cer[0]);
}

function onAtlasTileSelect(nome) {
  autoSave();
  S.imgs.cer[0] = '';

  if (!nome || nome === 'Personalizado') {
    renderCerImgArea(true);
    return;
  }

  const tile = ATLAS_TILES.find(t => t.nome === nome);
  if (tile && tile.arquivo) {
    renderCerImgArea(false); // mostra "carregando"
    loadCerImgFromPath('imagens/pastilhas/' + tile.arquivo);
  }
}

// ═══════════════════════════════════════════════════
// DYNAMIC ITEMS
// ═══════════════════════════════════════════════════
function addItem(tipo) {
  if (S.itens[tipo].length >= 6) {
    showToast('⚠️ Limite atingido — o PDF exibe no máximo 6 itens por seção.', 'warn');
    return;
  }
  S.itens[tipo].push({nome:'', descricao:'', imagem:''});
  renderItems(tipo);
  autoSave();
}

function rmItem(tipo, idx) {
  S.itens[tipo].splice(idx, 1);
  renderItems(tipo);
  autoSave();
}

let _dragSrc = null; // { tipo, idx } do item sendo arrastado

function renderItems(tipo) {
  const c = document.getElementById(`lst-${tipo}`);
  clearNode(c);
  const list = S.itens[tipo];

  // Update item counter badge
  const countEl = document.getElementById(`item-count-${tipo}`);
  if (countEl) {
    countEl.textContent = `${list.length} / 6`;
    countEl.className = 'item-count' + (list.length >= 6 ? ' maxed' : '');
  }

  if (!list.length) {
    c.innerHTML = '<div class="empty-items">Nenhum item adicionado. Clique em "+ Adicionar Item".</div>';
    return;
  }
  list.forEach((item, i) => {
    const row = document.createElement('div');
    const isPai = tipo === 'pai' || tipo === 'pai2';
    row.className = 'item-row' + (isPai ? ' item-row-simple' : '');
    row.draggable = true;
    row.innerHTML = `
      <div class="drag-handle" title="Arraste para reordenar">⠿</div>
      <div class="item-img" id="item-img-${tipo}-${i}" title="Clique ou arraste uma imagem">
        ${item.imagem ? `<img src="${imgSrc(item.imagem)}"><button class="item-img-rm" onclick="event.stopPropagation();rmItemImg('${tipo}',${i})" title="Remover imagem">✕</button>` : '<span class="item-img-ph">🖼️</span>'}
        <input type="file" accept="image/*" onchange="loadItemImg(this,'${tipo}',${i})">
      </div>
      <div class="field"><label>${isPai ? 'Planta / Espécie' : 'Nome'}</label><input type="text" value="${escapeHtml(item.nome)}" oninput="S.itens['${tipo}'][${i}].nome=this.value;autoSave()" placeholder="${isPai ? 'Ex: Palmeira, Bambu...' : 'Nome do produto'}"></div>
      ${!isPai ? `<div class="field"><label>Código / Descrição</label><input type="text" value="${escapeHtml(item.descricao)}" oninput="S.itens['${tipo}'][${i}].descricao=this.value;autoSave()" placeholder="Código, cor, dimensão..."></div>` : ''}
      <div class="item-actions">
        <button class="btn-dup-item" onclick="dupItem('${tipo}',${i})" title="Duplicar item">⧉</button>
        <button class="btn-rm-item" onclick="rmItem('${tipo}',${i})" title="Remover">🗑</button>
      </div>
    `;

    // ── Drag-and-drop de arquivo de imagem no item-img ──
    const itemImgEl = row.querySelector(`#item-img-${tipo}-${i}`);
    if (itemImgEl) {
      itemImgEl.addEventListener('dragover', e => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          itemImgEl.classList.add('item-img-dragover');
        }
      });
      itemImgEl.addEventListener('dragleave', e => {
        if (!itemImgEl.contains(e.relatedTarget)) {
          itemImgEl.classList.remove('item-img-dragover');
        }
      });
      itemImgEl.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        itemImgEl.classList.remove('item-img-dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          compressImg(file, 400, 0.8).then(dataUrl => {
            S.itens[tipo][i].imagem = dataUrl.split(',')[1];
            renderItems(tipo);
            autoSave();
          });
        }
      });
    }

    // ── Drag & Drop ──
    row.addEventListener('dragstart', e => {
      _dragSrc = { tipo, idx: i };
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      _dragSrc = null;
      document.querySelectorAll('.item-row').forEach(r => r.classList.remove('dragging','drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (_dragSrc && _dragSrc.tipo === tipo && _dragSrc.idx !== i) {
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      }
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (!_dragSrc || _dragSrc.tipo !== tipo || _dragSrc.idx === i) return;
      const arr = S.itens[tipo];
      const [moved] = arr.splice(_dragSrc.idx, 1);
      arr.splice(i, 0, moved);
      _dragSrc = null;
      renderItems(tipo);
      autoSave();
    });

    c.appendChild(row);
  });
}

function loadItemImg(input, tipo, idx) {
  const file = input.files[0];
  if (!file) return;
  compressImg(file, 400, 0.8).then(c => {
    S.itens[tipo][idx].imagem = c.split(',')[1];
    renderItems(tipo);
    autoSave();
  });
}

function rmItemImg(tipo, idx) {
  S.itens[tipo][idx].imagem = '';
  renderItems(tipo);
  autoSave();
}

function dupItem(tipo, idx) {
  if (S.itens[tipo].length >= 6) {
    showToast('Máximo de 6 itens por seção atingido', 'err');
    return;
  }
  const copy = { ...S.itens[tipo][idx] };
  S.itens[tipo].splice(idx + 1, 0, copy);
  renderItems(tipo);
  autoSave();
}

// ═══════════════════════════════════════════════════
// PDF GENERATION (pure jsPDF — no server needed)
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// VALIDAÇÃO + INDICADORES DE STEP + NOVA PRANCHA
// ═══════════════════════════════════════════════════

function fecharModal() {
  document.getElementById('validModal').classList.remove('show');
  document.getElementById('novaModal').classList.remove('show');
  document.getElementById('overwriteModal').classList.remove('show');
}

// Verifica preenchimento e retorna lista de itens
function validarCampos() {
  const f = getFormData();
  const items = [];
  const add = (icon, cls, txt) => items.push({icon, cls, txt});

  // Obrigatórios
  f.cliente  ? add('✅','ok',`Cliente: ${f.cliente}`)      : add('❌','err','Cliente não preenchido');
  f.id_projeto? add('✅','ok',`ID: ${f.id_projeto}`)        : add('❌','err','ID do Projeto não preenchido');
  f.loja     ? add('✅','ok',`Loja: ${f.loja}`)            : add('⚠️','warn','Loja/Franquia não preenchida');
  f.modelo   ? add('✅','ok',`Modelo: ${f.modelo}`)        : add('❌','err','Modelo da piscina não preenchido');

  // Imagens 3D
  const imgs3d = S.imgs['3d'].filter((val, idx) => {
    if (idx === 4 || !val) return false;
    return !S.exibirCapa3d || S.exibirCapa3d[idx] !== false;
  }).length;
  imgs3d > 0 ? add('✅','ok',`${imgs3d} imagem(ns) do Projeto 3D (na Capa)`)
             : add('⚠️','warn','Nenhuma imagem do Projeto 3D na Capa');

  // Medidas deck
  S.imgs['3d'][4] ? add('✅','ok','Imagem de Medidas do Deck incluída')
                  : add('⚠️','warn','Imagem de Medidas do Deck ausente');

  // Cerâmica
  f.ceramica_nome || f.ceramica_tamanho
    ? add('✅','ok','Cerâmica preenchida')
    : add('⚠️','warn','Dados da cerâmica não preenchidos');

  return items;
}

// Atualiza o ícone ✅ e a contagem de itens em cada step
function updateStepChecks() {
  const f = getFormData();

  // Step 0: Identificação
  const ok0 = f.cliente && f.id_projeto;
  document.getElementById('chk-0').textContent = ok0 ? ' ✅' : '';

  // Step 1: Projeto 3D
  const ok1 = S.imgs['3d'].some(Boolean);
  document.getElementById('chk-1').textContent = ok1 ? ' ✅' : '';

  // Step 2: Descritivo
  const ok2 = f.modelo || f.ceramica_nome;
  document.getElementById('chk-2').textContent = ok2 ? ' ✅' : '';

  // Steps 3-5: ✅ + contagem de itens
  const secKeys = ['rev','mob','pai'];
  [3,4,5].forEach((stepIdx, i) => {
    const tipo  = secKeys[i];
    const ativo = S.secAtiva[tipo];
    const n     = S.itens[tipo].length;
    const temImg = S.selectedImgs[tipo].some(x => x !== null);

    const chkEl = document.getElementById(`chk-${stepIdx}`);
    const cntEl = document.getElementById(`cnt-${stepIdx}`);

    if (!ativo) { chkEl.textContent = ' —'; }
    else        { chkEl.textContent = (n > 0 || temImg) ? ' ✅' : ''; }

    if (cntEl) cntEl.textContent = (ativo && n > 0) ? ` (${n})` : '';
  });
}

// Atualiza badge de edição no header
function updateEditBadge() {
  const badge = document.getElementById('editBadge');
  if (!badge) return;
  if (S._editandoId) {
    const idProjeto = v('id_projeto') || S._editandoId.split('_')[0] || '—';
    document.getElementById('editBadgeId').textContent = idProjeto;
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

let _pdfPendente = false;

function novaPrancha() {
  document.getElementById('novaModal').classList.add('show');
}

function confirmarNovaPrancha() {
  // Resetar estado
  S.imgs    = { '3d':['','','','',''], deck:['',''], cer:[''], rev:['',''], mob:['',''], pai:['',''] };
  S.acc     = { corrimao:{on:false,modelo:'',img:''}, cascata:{on:false,modelo:'',img:'',cor_pedra:''}, filtragem:{on:false,modelo:'',img:'',cor:''}, igui_stone:{on:false,modelo:'',img:''}, aquecimento:{on:false,modelo:'',img:''} };
  S.itens   = { rev:[], mob:[], pai:[] };
  S.selectedImgs = { rev:[null,null], mob:[null,null], pai:[null,null] };
  S.secAtiva = { rev:true, mob:true, pai:true };
  S._editandoId = null;
  updateEditBadge();
  obsPadraoAtivo = false;

  // Limpar formulário
  ['loja','cliente','id_projeto','cidade','obs','modelo','ceramica_marca','ceramica_tamanho','ceramica_rejunte'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Repovoar usuario_logado
  const usuarioLogadoEl = document.getElementById('usuario_logado');
  if (usuarioLogadoEl) {
    usuarioLogadoEl.value = document.getElementById('hdrUser')?.textContent || '';
  }
  // Resetar área dinâmica da cerâmica para modo padrão (texto)
  renderCeramicaArea('');

  // Preencher data de hoje
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  const dataEl = document.getElementById('data_proj');
  if (dataEl) dataEl.value = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;

  // Limpar slots de imagem
  document.querySelectorAll('.slot.has-img').forEach(slot => {
    slot.classList.remove('has-img');
    const img = slot.querySelector('img');
    if (img) img.remove();
    const inp = slot.querySelector('input[type=file]');
    if (inp) inp.value = '';
  });

  // Reset toggle obs padrão
  document.getElementById('obsPadraoToggle')?.classList.remove('ativo');

  // Re-render componentes
  renderAcc();
  renderItems('rev'); renderItems('mob'); renderItems('pai');
  syncDeckPreview();
  renderImgSelectors();
  updateAllSecUI();
  updateStepChecks();

  // Limpar IndexedDB
  dbSave('autosave', null);

  fecharModal();
  ir(0);
  showToast('✅ Nova prancha iniciada!', 'ok');
}

async function gerarPDF() {
  // Validar antes de gerar
  const validItems = validarCampos();
  const temErro  = validItems.some(i => i.cls === 'err');
  const temWarn  = validItems.some(i => i.cls === 'warn');

  if (temErro || temWarn) {
    // Mostrar modal de validação
    const container = document.getElementById('validItems');
    clearNode(container);
    validItems.forEach(i => {
      const item = document.createElement('div');
      item.className = `modal-item ${i.cls}`;

      const icon = document.createElement('span');
      icon.className = 'mi-icon';
      icon.textContent = i.icon;

      const text = document.createTextNode(i.txt);
      item.append(icon, text);
      container.appendChild(item);
    });

    const btnConfirm = document.getElementById('btnConfirmPDF');
    // Se tem erro crítico, mudar texto do botão
    btnConfirm.textContent = temErro ? 'Gerar assim mesmo ⚠️' : 'Gerar PDF ✓';
    btnConfirm.style.background = temErro ? '#e74c3c' : 'var(--dark)';

    _pdfPendente = true;
    document.getElementById('validModal').classList.add('show');
    return; // aguarda confirmação
  }

  await _executarGerarPDF();
}

function confirmarGerarPDF() {
  fecharModal();
  if (_pdfPendente) {
    _pdfPendente = false;
    _executarGerarPDF();
  }
}

function confirmarOverwrite() {
  fecharModal();
  _skipOverwriteCheck = true;
  _executarGerarPDF();
}

// ── Salvar Sessão (sem gerar PDF) ─────────────────────────────────
async function salvarSessao() {
  const btn = document.getElementById('btnSalvarSessao');
  const ov  = document.getElementById('overlay');
  if (btn) btn.disabled = true;
  ov.classList.add('show');
  setLoad('Salvando na nuvem...', 20);

  try {
    setLoad('Enviando imagens...', 40);
    const projetoPayload = {
      form: getFormData(), imgs: S.imgs, acc: S.acc,
      itens: S.itens, selectedImgs: S.selectedImgs,
      secAtiva: S.secAtiva, pranchaExtra: S.pranchaExtra, exibirCapa3d: S.exibirCapa3d || {}, obsPadrao: obsPadraoAtivo, step: cur,
    };
    setLoad('Salvando sessão...', 75);
    const savedId = await salvarProjeto(projetoPayload, S._editandoId || null);
    if (!S._editandoId && savedId) {
      S._editandoId = savedId;
      updateEditBadge();
    }
    // Autosave local também
    dbSave('autosave', {
      ...projetoPayload, _editandoId: S._editandoId, ts: Date.now(),
    });
    setLoad('Concluído!', 100);
    showToast('✅ Sessão salva na nuvem!', 'ok');
  } catch(e) {
    console.error('Erro ao salvar sessão:', e);
    showToast('❌ Erro ao salvar: ' + e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
    ov.classList.remove('show');
  }
}

let _skipOverwriteCheck = false;

async function _executarGerarPDF(preview = false) {
  // Se editando um projeto existente, pedir confirmação antes de sobrescrever
  // (pré-visualização não salva nada, então não precisa confirmar)
  if (!preview && S._editandoId && !_skipOverwriteCheck) {
    document.getElementById('overwriteModal').classList.add('show');
    return;
  }
  _skipOverwriteCheck = false;

  const btn = document.getElementById('btnGerar');
  const ov  = document.getElementById('overlay');
  btn.disabled = true;
  ov.classList.add('show');
  setLoad('Iniciando...', 5);

  try {
    // Baixa imagens que ainda são URLs (carregamento lazy ao editar)
    setLoad('Baixando imagens...', 12);
    await sbResolveImagesForPDF(S);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });

    // Todo texto do PDF sai em CAIXA ALTA, mesmo digitado em minúsculo
    const _docText = doc.text.bind(doc);
    doc.text = function(txt, ...rest) {
      if (typeof txt === 'string') txt = txt.toUpperCase();
      else if (Array.isArray(txt)) txt = txt.map(s => (typeof s === 'string' ? s.toUpperCase() : s));
      return _docText(txt, ...rest);
    };

    const PW = 297, PH = 210;
    const FOOTER_H = 22;

    const form = getFormData();
    function U(s) { return s ? String(s).toUpperCase() : ''; }

    function rgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
    function fill(h)   { doc.setFillColor(...rgb(h)); }
    function stroke(h) { doc.setDrawColor(...rgb(h)); }
    function tc(h)     { doc.setTextColor(...rgb(h)); }

    const C = {
      accent: '#2C3E50',      // cinza escuro — substitui azul em todos os detalhes
      accentMid: '#3D5166',   // versão media para hover/faixas
      dark:   '#1A2A3A',
      gray:   '#D9D9D9',
      line:   '#C8D4DC',
      text:   '#2C3E50',
      muted:  '#8A9AAA',
      white:  '#FFFFFF',
      lightbg:'#FFFFFF',      // fundo branco (era cinza claro)
      cardBg: '#FAFAFA',      // cards levemente off-white
    };

    function cropB64(b64, cw, ch, q=0.88) {
      return new Promise(res => {
        const img = new Image();
        img.onload = () => {
          const cr=cw/ch, ir=img.width/img.height;
          let sx,sy,sw,sh;
          if(ir>cr){ sh=img.height; sw=sh*cr; sx=(img.width-sw)/2; sy=0; }
          else      { sw=img.width; sh=sw/cr; sx=0; sy=(img.height-sh)/2; }
          const cv=document.createElement('canvas');
          const sc=Math.min(1,1600/sw);
          cv.width=Math.round(sw*sc); cv.height=Math.round(sh*sc);
          const cx=cv.getContext('2d');
          cx.fillStyle='#ffffff'; cx.fillRect(0,0,cv.width,cv.height);
          cx.drawImage(img,sx,sy,sw,sh,0,0,cv.width,cv.height);
          res(cv.toDataURL('image/jpeg',q).split(',')[1]);
        };
        img.onerror=()=>res(null);
        img.src='data:image/jpeg;base64,'+b64;
      });
    }

    async function ins(b64,x,y,w,h){
      if(!b64)return;
      const c=await cropB64(b64,w,h);
      if(c) doc.addImage('data:image/jpeg;base64,'+c,'JPEG',x,y,w,h);
    }

    async function insFit(b64,x,y,w,h){
      if(!b64)return;
      return new Promise(res=>{
        const img=new Image();
        img.onload=()=>{
          const r=img.width/img.height, rc=w/h;
          let dw,dh,dx,dy;
          if(r>rc){dw=w;dh=w/r;dx=x;dy=y+(h-dh)/2;}
          else    {dh=h;dw=h*r;dy=y;dx=x+(w-dw)/2;}
          // Usa resolução nativa da imagem para PDF nítido
          const cv=document.createElement('canvas');
          cv.width=img.width; cv.height=img.height;
          const cx=cv.getContext('2d');
          cx.fillStyle='#ffffff'; cx.fillRect(0,0,cv.width,cv.height);
          cx.drawImage(img,0,0,cv.width,cv.height);
          doc.addImage(cv.toDataURL('image/jpeg',0.92),'JPEG',dx,dy,dw,dh);
          res();
        };
        img.onerror=()=>res();
        img.src='data:image/jpeg;base64,'+b64;
      });
    }

    function lineV(x,y1,y2,col,lw){ stroke(col||C.line); doc.setLineWidth(lw||0.3); doc.line(x,y1,x,y2); }
    function lineH(y,x1,x2,col,lw){ stroke(col||C.line); doc.setLineWidth(lw||0.3); doc.line(x1,y,x2,y); }

    // ════════════════════════════
    // RODAPÉ
    // ════════════════════════════
    function drawFooter(includeLoja) {
      const fy = PH - FOOTER_H;
      fill(C.gray); doc.rect(0,fy,PW,FOOTER_H,'F');
      // Faixa cinza escuro no topo do rodapé
      fill(C.accent); doc.rect(0,fy,PW,1.5,'F');

      tc(C.text); doc.setFont('helvetica','bold'); doc.setFontSize(9);
      // SEM aspas na loja, sempre em maiúsculas no PDF
      const lojaStr = (includeLoja && form.loja) ? ' ' + (form.loja||'').toUpperCase() : '';
      doc.text('PROJETO 3D - IGUI CONCEITO'+lojaStr, 10, fy+6.5);

      doc.setFont('helvetica','normal'); doc.setFontSize(8); tc(C.muted);
      doc.text('CLIENTE:  '+(form.cliente||''),   10, fy+11.5);
      doc.text('ID:  '+(form.id_projeto||''),      10, fy+15.5);
      const LW=20, LH=+(20/1.4638).toFixed(1);

      // Obs: sempre maiúsculo + vermelho se for obs padrão de borda
      if (form.obs) {
        const isObsPadrao = form.obs.includes('NAO E RECOMENDACAO DA IGUI');
        tc(isObsPadrao ? '#C0392B' : C.muted);
        doc.setFontSize(6.5);
        doc.text('OBS:  '+(form.obs||''), 10, fy+19.5, {maxWidth: PW - LW - 20});
      } else {
        tc(C.muted); doc.setFontSize(7);
        doc.text('OBS:', 10, fy+19.5);
      }

      doc.addImage('data:image/png;base64,'+LOGO_PRANCHA_B64,'PNG',PW-LW-5,fy+(FOOTER_H-LH)/2,LW,LH,undefined,'FAST');
    }

    // ════════════════════════════
    // ════════════════════════════
    // PÁG 1 — Capa 3D (e extras)
    // ════════════════════════════
    setLoad('Pagina 1: Capa 3D...', 20);
    await new Promise(r=>setTimeout(r,20));

    // Agrupa todas as vistas 3D existentes, não-nulas e marcadas para exibição (ignorando index 4 - Medidas do Deck)
    const vistas3d = [];
    S.imgs['3d'].forEach((val, idx) => {
      if (idx !== 4 && val) {
        const exibir = !S.exibirCapa3d || S.exibirCapa3d[idx] !== false;
        if (exibir) {
          vistas3d.push(val);
        }
      }
    });

    const viewsPerPage = 4;
    const totalPages = Math.max(1, Math.ceil(vistas3d.length / viewsPerPage));

    const CH = PH - FOOTER_H, HW = PW / 2, HH = CH / 2;
    for (let p = 0; p < totalPages; p++) {
      if (p > 0) {
        doc.addPage();
      }
      
      const cells = [[0, 0, HW, HH], [HW, 0, HW, HH], [0, HH, HW, HH], [HW, HH, HW, HH]];
      
      const startIdx = p * viewsPerPage;
      for (let i = 0; i < 4; i++) {
        const [cx, cy, cw, ch] = cells[i];
        fill(C.lightbg); doc.rect(cx, cy, cw, ch, 'F');
        const viewImg = vistas3d[startIdx + i];
        if (viewImg) {
          await ins(viewImg, cx, cy, cw, ch);
        }
      }
      
      // Grade cinza escuro
      stroke(C.accent); doc.setLineWidth(0.6);
      doc.line(HW, 0, HW, CH);
      doc.line(0, HH, PW, HH);
      
      drawFooter(true);
    }

    // ════════════════════════════
    // PÁG 2 — Descritivo
    // ════════════════════════════
    doc.addPage();
    setLoad('Pagina 2: Descritivo...', 40);
    await new Promise(r=>setTimeout(r,20));

    const DESC_H=96, IMG2_H=PH-FOOTER_H-DESC_H;

    // Deck: imagem esquerda = 3d[0] (vista 1), imagem direita = 3d[4] (medidas)
    const deckImgs = [S.imgs['3d'][0], S.imgs['3d'][4]];
    for(let i=0;i<2;i++){
      const cx=i*HW;
      fill(C.lightbg); doc.rect(cx,0,HW,IMG2_H,'F');
      stroke(C.line); doc.setLineWidth(0.3); doc.rect(cx,0,HW,IMG2_H,'S');
      if(deckImgs[i]) await ins(deckImgs[i],cx,0,HW,IMG2_H);
    }
    lineV(HW,0,IMG2_H,C.accent,0.6);

    // Label MEDIDAS DECK (cinza escuro)
    const LBX=HW+1.5, LBY=IMG2_H-10, LBW=34, LBH=7.5;
    fill(C.dark); doc.rect(LBX,LBY,LBW,LBH,'F');
    fill(C.accent); doc.rect(LBX,LBY,3,LBH,'F');
    tc(C.white); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.text('MEDIDAS DECK', LBX+5, LBY+5);

    // Fundo branco semitransparente aviso
    const avX=LBX+LBW+2, avY=LBY-1.5, avW=PW-avX-1.5, avH=LBH+3;
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({opacity:0.85}));
    doc.setFillColor(255,255,255);
    doc.rect(avX,avY,avW,avH,'F');
    doc.restoreGraphicsState();
    tc(C.text); doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text('MEDIDAS INDICADAS SAO REFERENCIAIS, BASEADAS NAS INFORMACOES FORNECIDAS.', avX+2, LBY+3);
    doc.text('RECOMENDA-SE A CONFERENCIA DAS MEDIDAS NO LOCAL ANTES DA EXECUCAO/INSTALACAO.', avX+2, LBY+7);

    const DY=IMG2_H;
    lineH(DY,0,PW,C.accent,0.6);

    const M=8;
    tc(C.text); doc.setFont('helvetica','bold'); doc.setFontSize(11.5);
    doc.text('DESCRITIVO PISCINAS', M, DY+11);

    // MODELO
    doc.setFontSize(9); tc(C.muted); doc.setFont('helvetica','normal');
    doc.text('MODELO:', M, DY+20);
    const mW=doc.getTextWidth('MODELO:')+3;
    doc.setFont('helvetica','bold'); tc(C.text);
    doc.text((form.modelo||''), M+mW, DY+20);
    // [D] Linha vertical separador (só até a área de descritivo)
    const SEP_X=66;
    lineV(SEP_X, DY+3, DY+36, C.line, 0.5);

    // CERAMICA
    const C2X=SEP_X+6;
    tc(C.text); doc.setFont('helvetica','bold'); doc.setFontSize(10.5);
    doc.text('CERAMICA:', C2X, DY+11);
    const cLW=doc.getTextWidth('CERAMICA:')+3;
    // Nome em cinza escuro (era azul)
    tc(C.accent); doc.setFontSize(10.5);
    if(form.ceramica_nome) doc.text((form.ceramica_nome||''), C2X+cLW, DY+11);

    if(form.ceramica_marca){
      tc(C.muted); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text((form.ceramica_marca||''), C2X+cLW, DY+17);
    }

    tc(C.muted); doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.text('TAMANHO REAL:', C2X+3, DY+24);
    tc(C.text); doc.setFont('helvetica','bold');
    doc.text((form.ceramica_tamanho||''), C2X+41, DY+24);

    tc(C.muted); doc.setFont('helvetica','normal');
    doc.text('REJUNTE:', C2X+3, DY+31);
    tc(C.text); doc.setFont('helvetica','bold');
    doc.text((form.ceramica_rejunte||''), C2X+41, DY+31);

    // Imagem cerâmica
    const cerB64=S.imgs['cer'][0];
    const CER_X=C2X+80, CER_Y=DY+8, CER_S=28;
    stroke(C.line); doc.setLineWidth(0.3); doc.rect(CER_X,CER_Y,CER_S,CER_S,'S');
    if(cerB64) await ins(cerB64,CER_X,CER_Y,CER_S,CER_S);

    // ACESSÓRIOS — faixa cinza escuro
    const ASPY=DY+38;
    fill(C.accent); doc.rect(M,ASPY,PW-2*M,8,'F');
    tc(C.white); doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
    doc.text('ACESSORIOS E DISPOSITIVOS', M+4, ASPY+5.8);

    // Grid acessórios 3×2
    const ACW=(PW-2*M)/3;
    const ACC_Y_START=ASPY+11;
    const ACC_ROW_H=22; // 3 linhas: Corrimão/Cascata/Filtragem | IguiStone | Aquecimento

    for(let i=0;i<ACC_CFG.length;i++){
      const {key,label}=ACC_CFG[i];
      const a=S.acc[key];
      const col=i%3, row=Math.floor(i/3);
      const ax=M+col*ACW, ay=ACC_Y_START+row*ACC_ROW_H;

      // Círculo indicador (cinza escuro = ativo, cinza claro = inativo)
      doc.setFillColor(...rgb(a.on ? C.accent : '#BBBBBB'));
      doc.circle(ax+2.5, ay+1.5, 2, 'F');

      tc(C.text); doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.text(label, ax+7, ay+3);
      if(a.modelo){
        doc.setFont('helvetica','normal'); tc(C.muted); doc.setFontSize(8);
        doc.text(a.modelo, ax+7, ay+9);
      }
      if(a.on && a.img){
        const IS=18;
        await insFit(a.img, ax+60, ay-2, IS, IS);
      }
    }

    drawFooter(true);

    // ════════════════════════════════════════════════════
    // PÁGS 3-5 — Revestimentos / Mobiliário / Paisagismo
    // ════════════════════════════════════════════════════
    const SECS=[];
    [['REVESTIMENTOS','rev'],['MOBILIARIO','mob'],['PAISAGISMO','pai']].forEach(([title,tipo])=>{
      const ativa = !(S.secAtiva && S.secAtiva[tipo] === false);
      SECS.push({title, grp:tipo, tipo, isPai: tipo==='pai'});
      // Prancha extra (2ª página): só se a seção estiver ativa e a extra existir
      if(ativa && S.pranchaExtra && S.pranchaExtra[tipo]){
        SECS.push({title, grp:tipo, tipo: tipo+'2', isPai: tipo==='pai'});
      }
    });

    for(const sec of SECS){
      // Pular se seção desativada (a extra já foi filtrada acima)
      if(S.secAtiva && S.secAtiva[sec.tipo] === false) continue;
      doc.addPage();
      const _secPcts = { rev: 55, mob: 68, pai: 82 };
      setLoad('Montando '+sec.title+'...', _secPcts[sec.tipo] || 60);
      await new Promise(r=>setTimeout(r,20));

      const isPai = sec.isPai;
      const items = S.itens[sec.tipo]||[];

      // Altura da imagem FIXA = igual ao descritivo (PH - FOOTER_H - DESC_H)
      const TITLE_H = 9;
      const CARD_H  = isPai ? 36 : 32;
      const CARD_GAP = 3;
      const IH = PH - FOOTER_H - 96; // 92mm — mesmo que o descritivo técnico

      // Área disponível para cards abaixo da imagem e título
      const CARDS_AVAIL = PH - FOOTER_H - IH - TITLE_H;

      // 2 imagens: puxar de selectedImgs[tipo] -> 3d[idx]
      for(let i=0;i<2;i++){
        const cx=i*HW;
        fill(C.lightbg); doc.rect(cx,0,HW,IH,'F');
        stroke(C.line); doc.setLineWidth(0.3); doc.rect(cx,0,HW,IH,'S');
        const selIdx = S.selectedImgs[sec.tipo][i];
        const secImg = (selIdx !== null && selIdx !== undefined) ? S.imgs['3d'][selIdx] : null;
        if(secImg) await ins(secImg, cx, 0, HW, IH);
      }
      lineV(HW,0,IH,C.accent,0.6);
      lineH(IH,0,PW,C.accent,0.6);

      // Faixa cinza escuro com título
      fill(C.accent); doc.rect(0,IH,PW,TITLE_H,'F');
      tc(C.white); doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.text(sec.title, M, IH+6.2);

      if(items.length===0){
        drawFooter(true);
        continue;
      }

      // [G] Mini cards — verticalmente centralizados na área disponível
      const NCOLS   = 3;
      const COL_W   = (PW-2*M)/NCOLS;
      const CARD_W  = COL_W - 4;

      // Área disponível para os cards
      const CARDS_AREA_TOP = IH + TITLE_H;
      const CARDS_AREA_BOT = PH - FOOTER_H;
      const CARDS_AREA_H   = CARDS_AREA_BOT - CARDS_AREA_TOP;

      // Altura total de todas as linhas de cards
      const nRows = items.length > 0 ? Math.min(Math.ceil(items.length/3), 2) : 0;
      const totalCardsH = nRows > 0 ? nRows*(CARD_H+CARD_GAP) - CARD_GAP : 0;

      // Centralizar verticalmente: offset para centrar os cards na área
      const CARD_TOP = CARDS_AREA_TOP + (CARDS_AREA_H - totalCardsH) / 2;

      for(let i=0;i<Math.min(items.length,6);i++){
        const item = items[i];
        const col  = i%NCOLS, row=Math.floor(i/NCOLS);
        const cx   = M + col*COL_W;
        const cy   = CARD_TOP + row*(CARD_H+CARD_GAP);
        const cw   = CARD_W, ch=CARD_H;

        if(cy+ch > CARDS_AREA_BOT-1) continue;

        // Card — fundo levemente off-white, borda fina
        fill(C.cardBg); doc.rect(cx,cy,cw,ch,'F');
        stroke(C.line); doc.setLineWidth(0.25); doc.rect(cx,cy,cw,ch,'S');
        // Faixa cinza escuro topo do card
        fill(C.accent); doc.rect(cx,cy,cw,1.8,'F');

        // Imagem à esquerda
        const PAD   = 2.5;
        const IMG_H = ch - PAD*2 - 1.8;
        const IMG_W = IMG_H;
        const ix = cx+PAD, iy = cy+1.8+PAD;

        fill(C.lightbg); doc.rect(ix,iy,IMG_W,IMG_H,'F');
        if(item.imagem) await insFit(item.imagem, ix, iy, IMG_W, IMG_H);
        else { stroke(C.line); doc.setLineWidth(0.2); doc.rect(ix,iy,IMG_W,IMG_H,'S'); }

        // Texto à direita — fonte SEMPRE 9pt, mesma em todas as linhas
        const TX  = ix+IMG_W+3;
        const TW  = cw-IMG_W-PAD*2-3;
        const FONT_SZ = 9;
        const LINE_H  = 5.2; // espaçamento entre linhas

        // Quebrar o nome em linhas mantendo sempre o mesmo tamanho de fonte
        tc(C.text); doc.setFont('helvetica','bold'); doc.setFontSize(FONT_SZ);
        const nome = U(item.nome||'');
        const words = nome.split(' ');
        const lines = [];
        let lineAcc = '';
        for(const w of words){
          const test = lineAcc ? lineAcc+' '+w : w;
          if(doc.getTextWidth(test) <= TW) lineAcc = test;
          else { if(lineAcc) lines.push(lineAcc); lineAcc = w; }
        }
        if(lineAcc) lines.push(lineAcc);

        // Quantas linhas de texto existem no total
        const descLines = (!isPai && item.descricao) ? 1 : 0;
        const totalLines = lines.length + descLines;
        // Altura total do bloco de texto
        const textBlockH = totalLines * LINE_H + (totalLines-1) * 0.5;
        // Centro vertical da área de texto dentro do card (abaixo da faixa)
        const textAreaTop = cy + 1.8 + PAD;
        const textAreaH   = ch - 1.8 - PAD*2;
        // Y inicial centralizado
        const TY1 = textAreaTop + (textAreaH - textBlockH) / 2 + FONT_SZ * 0.35;

        // Desenhar linhas do nome (todas com o mesmo font size)
        doc.setFont('helvetica','bold'); doc.setFontSize(FONT_SZ); tc(C.text);
        lines.forEach((line, li) => {
          doc.text(line, TX, TY1 + li * (LINE_H + 0.5));
        });

        // Descrição (só para Rev e Mob)
        if(!isPai && item.descricao){
          const descY = TY1 + lines.length * (LINE_H + 0.5) + 1;
          doc.setFont('helvetica','normal'); tc(C.muted); doc.setFontSize(8);
          const desc = U(item.descricao||'');
          doc.getTextWidth(desc) <= TW
            ? doc.text(desc, TX, descY)
            : doc.text(desc, TX, descY, {maxWidth: TW});
        }
      }

      drawFooter(true);
    }

    // ── Nome base dos arquivos ──
    setLoad('Finalizando...', 92);
    await new Promise(r=>setTimeout(r,50));
    const id      = (form.id_projeto||'000000').trim();
    const modelo_ = (form.modelo||'').replace(/[<>:"/\\|?*]/g,'').trim();
    const lojaRaw = (form.loja||'').replace(/[<>:"/\\|?*]/g,'').trim();
    const data    = (form.data_proj||'').replace(/\//g,'-') || (()=>{
      const d=new Date();
      return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    })();
    const baseName = `${id}_Prancha Tecnica-${modelo_}_${lojaRaw}_${data}`;

    // Pré-visualização: abre o PDF num modal, sem baixar nem salvar
    if (preview) {
      setLoad('Abrindo pré-visualização...', 96);
      abrirPreviewPrancha(doc.output('bloburl'));
      return;
    }

    // 1) Salvar PDF
    doc.save(`${baseName}.pdf`);

    // 2) Salvar/atualizar no Supabase (upload imagens + metadata)
    await new Promise(r=>setTimeout(r,100));
    setLoad('Enviando para a nuvem...', 98);
    try {
      const projetoPayload = {
        form: getFormData(), imgs: S.imgs, acc: S.acc,
        itens: S.itens, selectedImgs: S.selectedImgs,
        secAtiva: S.secAtiva, pranchaExtra: S.pranchaExtra, exibirCapa3d: S.exibirCapa3d || {}, obsPadrao: obsPadraoAtivo, step: cur,
      };
      const savedId = await salvarProjeto(projetoPayload, S._editandoId || null);
      if (!S._editandoId && savedId) {
        S._editandoId = savedId;
        updateEditBadge();
      }
    } catch(pe) { console.warn('Erro ao salvar no Supabase:', pe); }

    // Autosave local (IndexedDB) — mantém para restaurar sessão ao abrir
    dbSave('autosave', {
      form: getFormData(), imgs: S.imgs, acc: S.acc,
      itens: S.itens, selectedImgs: S.selectedImgs,
      secAtiva: S.secAtiva, pranchaExtra: S.pranchaExtra, exibirCapa3d: S.exibirCapa3d || {}, obsPadrao: obsPadraoAtivo, step: cur,
      _editandoId: S._editandoId, ts: Date.now(),
    });

    showToast('✅ PDF gerado e prancha salva na nuvem!', 'ok');

  } catch(err){
    console.error('PDF error:',err);
    showToast('Erro: '+err.message,'err');
  } finally {
    btn.disabled=false;
    ov.classList.remove('show');
  }
}

// ── Pré-visualização da prancha ─────────────────────────────────────
async function previewPrancha() {
  await _executarGerarPDF(true);
}

let _previewUrl = null;

function abrirPreviewPrancha(blobUrl) {
  _previewUrl = blobUrl;
  const frame = document.getElementById('previewFrame');
  if (frame) frame.src = blobUrl;
  document.getElementById('previewModal')?.classList.add('show');
}

function fecharPreviewPrancha() {
  document.getElementById('previewModal')?.classList.remove('show');
  const frame = document.getElementById('previewFrame');
  if (frame) frame.src = 'about:blank';
  if (_previewUrl) { try { URL.revokeObjectURL(_previewUrl); } catch {} _previewUrl = null; }
}

function abrirPreviewNovaGuia() {
  if (_previewUrl) window.open(_previewUrl, '_blank');
}

// Confirmar a partir da pré-visualização: fecha o modal e gera o PDF final
function confirmarPreview() {
  fecharPreviewPrancha();
  gerarPDF();
}

function setLoad(msg, pct) {
  document.getElementById('loadTxt').textContent = msg;
  if (pct !== undefined) {
    const bar = document.getElementById('loadProgressBar');
    if (bar) bar.style.width = pct + '%';
  }
}

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════
let toastT;
function showToast(msg, tipo='ok') {
  const t = document.getElementById('toast');
  clearTimeout(toastT);
  t.textContent = msg;
  t.className = `toast ${tipo} show`;
  toastT = setTimeout(() => t.classList.remove('show'), 4000);
}

Object.assign(window, {
  S,
  listarProjetos,
  salvarProjeto,
  deletarProjeto,
  addItem,
  autoSave,
  confirmarGerarPDF,
  confirmarNovaPrancha,
  confirmarOverwrite,
  salvarSessao,
  descartarRestore,
  dupItem,
  exportarSessao,
  fecharModal,
  gerarPDF,
  importarSessao,
  initDropZones,
  ir,
  loadAccImg,
  loadImg,
  loadItemImg,
  novaPrancha,
  onAccCorSelect,
  onAccSelect,
  onAtlasTileSelect,
  onCeramicaMarcaChange,
  renderCeramicaArea,
  restaurar,
  rmImg,
  rmItem,
  rmItemImg,
  selectImg,
  togAcc,
  toggleObsPadrao,
  toggleSec,
  updateEditBadge,
});

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // ── Auth check ──
  const _session = await sbRequireAuth();
  if (!_session) return;

  // Exibir nome do usuário e link admin se for admin
  let profileName = '';
  try {
    const _profile = await sbGetProfile();
    profileName = _profile?.name || _profile?.email || '';
    const hdrUser = document.getElementById('hdrUser');
    if (hdrUser) hdrUser.textContent = profileName;
    if (_profile?.role === 'admin') {
      const navAdmin = document.getElementById('navAdmin');
      if (navAdmin) navAdmin.style.display = 'flex';
    }
  } catch(e) { console.warn('Profile load error:', e); }

  sbVerificarMsgNaoLidas().then(temNova => {
    const badge = document.getElementById('chatNavBadge');
    if (badge) badge.style.display = temNova ? 'block' : 'none';
  }).catch(() => {});

  setLogoImages();

  // Monta as abas de prancha extra nos cards das seções
  montarAbasPrancha('rev', '#s3');
  montarAbasPrancha('mob', '#s4');
  montarAbasPrancha('pai', '#s5');

  // Init date
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  document.getElementById('data_proj').value = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;

  // Verificar se há um projeto vindo da página de pranchas (cloud load)
  const _cloudLoad = sessionStorage.getItem('igui_cloud_load');
  if (_cloudLoad) {
    sessionStorage.removeItem('igui_cloud_load');
    try {
      const { sessao, editandoId } = JSON.parse(_cloudLoad);
      // Popular estado S com os dados deserializados
      if (sessao.form)         { Object.entries(sessao.form).forEach(([k,v]) => { const el=document.getElementById(k); if(el) el.value=v||''; }); }
      if (sessao.imgs) {
        S.imgs = sessao.imgs;
        if (sessao.origImgs) S.origImgs = sessao.origImgs;
        if (typeof renderVistas3D === 'function') renderVistas3D();
        // Repopula os slots de upload com as imagens restauradas (não-3D e medidas do deck)
        Object.entries(sessao.imgs).forEach(([grp, arr]) => {
          (arr || []).forEach((val, idx) => {
            if (val && (grp !== '3d' || idx === 4)) restoreSlot(grp, idx, val);
          });
        });
      }
      if (sessao.acc)          S.acc          = sessao.acc;
      if (sessao.itens)        S.itens        = sessao.itens;
      if (sessao.selectedImgs) S.selectedImgs = sessao.selectedImgs;
      if (sessao.secAtiva)     S.secAtiva     = sessao.secAtiva;
      if (sessao.pranchaExtra) Object.assign(S.pranchaExtra, sessao.pranchaExtra);
      // Garante as chaves da 2ª página mesmo em pranchas salvas antes dessa feature
      ['rev2','mob2','pai2'].forEach(k => { if(!S.itens[k]) S.itens[k]=[]; if(!S.selectedImgs[k]) S.selectedImgs[k]=[null,null]; });
      if (sessao.exibirCapa3d) S.exibirCapa3d = sessao.exibirCapa3d;
      if (sessao.obsPadrao)    { obsPadraoAtivo = sessao.obsPadrao; }
      S._editandoId = editandoId || null;
      updateEditBadge();
    } catch(e) { console.warn('Cloud load error:', e); }
  } else {
    // Init DB and check for saved data (autosave local)
    try {
      await initDB();
      await checkRestore();
    } catch(e) { console.warn('DB init error', e); }
  }

  // Se o campo usuario_logado estiver vazio, preenche com o nome do perfil
  const usuarioLogadoEl = document.getElementById('usuario_logado');
  if (usuarioLogadoEl && !usuarioLogadoEl.value) {
    usuarioLogadoEl.value = profileName;
  }

  // Render components
  if (typeof renderVistas3D === 'function') renderVistas3D();
  renderAcc();
  renderItems('rev');
  renderItems('mob');
  renderItems('pai');
  syncDeckPreview();
  renderImgSelectors();
  updateAllSecUI();
  atualizarPranchasExtra();
  updateStepChecks();
  initDropZones();

  // Auto-save on all input changes (form fields already have oninput)
  document.addEventListener('change', () => autoSave());
});

function renderVistas3D() {
  const grid = document.getElementById('grid-vistas-3d');
  if (!grid) return;
  grid.innerHTML = '';

  S.imgs['3d'].forEach((b64, idx) => {
    if (idx === 4) return; // 4 is deck measures

    const slotWrap = document.createElement('div');
    slotWrap.className = 'slot-wrap';

    let labelText = `Vista ${idx < 4 ? idx + 1 : idx}`;
    if (idx === 3) labelText = 'Vista Superior';

    const exibirChecked = (!S.exibirCapa3d || S.exibirCapa3d[idx] !== false) ? 'checked' : '';

    slotWrap.innerHTML = `
      <div class="slot" id="sl-3d-${idx}">
        <input type="file" accept="image/*" onchange="loadImg(this,'3d',${idx})">
        <div class="ph">
          <div class="i">🖼️</div>
          <div class="t">${labelText}</div>
        </div>
        <button class="rm" onclick="rmImg('3d',${idx},event)">✕</button>
      </div>
      <div class="slot-lbl" style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <span>${labelText}</span>
        ${idx >= 5 ? `<button type="button" onclick="removerVista3D(${idx})" style="background:none; border:none; color:#ef4444; font-size:10px; font-weight:600; cursor:pointer; padding:2px;">Excluir</button>` : ''}
      </div>
      <div style="display:flex; align-items:center; width:100%; margin-top:2px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:#6b7280; cursor:pointer;">
          <input type="checkbox" onchange="atualizarExibirCapa3d(${idx}, this.checked)" ${exibirChecked}>
          <span>Exibir na Capa</span>
        </label>
      </div>
    `;

    grid.appendChild(slotWrap);

    if (b64) {
      restoreSlot('3d', idx, b64);
    }
  });

  if (typeof initDropZones === 'function') {
    initDropZones();
  }
}

function adicionarVista3D() {
  S.imgs['3d'].push('');
  if (S.origImgs && S.origImgs['3d']) {
    S.origImgs['3d'].push('');
  }
  renderVistas3D();
  renderImgSelectors();
  autoSave();
}

function removerVista3D(idx) {
  if (idx < 5) return;
  S.imgs['3d'].splice(idx, 1);
  if (S.origImgs && S.origImgs['3d']) {
    S.origImgs['3d'].splice(idx, 1);
  }

  // Adjust selection indices to handle deletion
  ['rev','mob','pai'].forEach(tipo => {
    if (S.selectedImgs[tipo]) {
      S.selectedImgs[tipo] = S.selectedImgs[tipo].map(sel => {
        if (sel === idx) return null;
        if (sel > idx) return sel - 1;
        return sel;
      });
    }
  });

  renderVistas3D();
  renderImgSelectors();
  autoSave();
}

function atualizarExibirCapa3d(idx, checked) {
  if (!S.exibirCapa3d) S.exibirCapa3d = {};
  S.exibirCapa3d[idx] = checked;
  autoSave();
}
