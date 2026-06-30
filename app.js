// ═══════════════════════════════════════════════════
// LOGO iGUI embutido
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════
import { S, initDB, dbSave, dbGet, SAVE_KEY } from './modules/state.js';
import { compressImg, cropB64, abrirEditorComImagemExistente, fecharCropModal, confirmarRecorte, usarOriginalSemRecortar } from './modules/image-editor.js';
import { gerarPDF, previewPrancha, executarGerarPDF } from './modules/pdf-generator.js';
import { salvarProjeto, listarProjetos, deletarProjeto } from './modules/supabase-sync.js';

window.S = S;
window.initDB = initDB;
window.dbSave = dbSave;
window.dbGet = dbGet;
window.abrirEditorComImagemExistente = abrirEditorComImagemExistente;
window.fecharCropModal = fecharCropModal;
window.confirmarRecorte = confirmarRecorte;
window.usarOriginalSemRecortar = usarOriginalSemRecortar;
window.gerarPDF = gerarPDF;
window.previewPrancha = previewPrancha;
window.salvarProjeto = salvarProjeto;
window.listarProjetos = listarProjetos;
window.deletarProjeto = deletarProjeto;

let saveTimer = null;

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
    // Para admin: SELECT usa UUID como value; extraímos o nome da opção selecionada
    usuario_logado:   (() => {
      const el = document.getElementById('usuario_logado');
      if (!el) return '';
      if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
        const uid = el.value;
        const u = (window.usuariosList || []).find(u => u.id === uid);
        if (u) return u.name || u.email;
        // Fallback: texto da opção sem o sufixo de role
        return (el.options[el.selectedIndex]?.textContent || '').replace(/ [🟣🟢].+$/, '').trim();
      }
      return el.value;
    })(),
    usuario_logado_id: (() => {
      const el = document.getElementById('usuario_logado');
      return (el && el.tagName === 'SELECT') ? el.value : '';
    })(),
    tipo_projeto:     v('tipo_projeto'),
    loja_tipo:        v('loja_tipo'),
  };
}

function v(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

// escapeHtml → use esc() global (supabase-client.js)
// BUG-07: fallback inline caso supabase-client.js ainda não tenha executado
const escapeHtml = typeof esc === 'function'
  ? esc
  : s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

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
    img.src = 'logo_site_sobe.png';
  });
}

// Retorna o base64 da logo de prancha conforme a marca selecionada
function getLogoPranchaB64() {
  const marca = v('loja_tipo');
  if (marca === 'Splash')    return typeof LOGO_PRANCHA_SPLASH_B64    !== 'undefined' ? LOGO_PRANCHA_SPLASH_B64    : LOGO_PRANCHA_IGUI_B64;
  return typeof LOGO_PRANCHA_IGUI_B64 !== 'undefined' ? LOGO_PRANCHA_IGUI_B64 : LOGO_PRANCHA_B64;
}

function onLojaTipoChange(val) {
  const logoMap = {
    'iGUi':      'logo_pranchaiGUi.png',
    'Splash':    'logo_pranchaSplash.png',
  };
  const src = val ? (logoMap[val] || '') : '';
  document.querySelectorAll('.card-hd-logo').forEach(img => {
    if (src) {
      img.src = src;
      img.style.visibility = 'visible';
    } else {
      img.src = '';
      img.style.visibility = 'hidden';
    }
  });

  if (val === 'Splash') {
    document.body.classList.add('theme-splash');
  } else {
    document.body.classList.remove('theme-splash');
  }
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
      step: S.cur,
      obsPadrao: window.obsPadraoAtivo,
      obsIlustrativo: window.obsIlustrativoAtivo,
    };

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');

    // Nome do arquivo de sessão
    const id      = (payload.form.id_projeto||'000000').trim();
    const modelo_ = (payload.form.modelo||'').replace(/[<>:"/\\|?*]/g,'').trim();
    const lojaRaw = (payload.form.loja||'').replace(/[<>:"/\\|?*]/g,'').trim();
    const marca_  = (payload.form.loja_tipo||'').trim();
    const d       = new Date();
    const data    = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    a.href     = url;
    a.download = marca_ === 'Splash'
      ? `Splash_${id}_${modelo_}_${lojaRaw}_${data}.igui`
      : `${id}_Prancha Técnica ${modelo_}_${lojaRaw}_${data}.igui`;
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

    // BUG-09: updateStepChecks() removido daqui — obs padrão, step e campos ainda não
    // foram restaurados neste ponto. A chamada correta está no setTimeout abaixo (150ms).

    // Restaurar estado do toggle obs padrão
    if (d.obsPadrao !== undefined) {
      window.obsPadraoAtivo = d.obsPadrao;
      document.getElementById('obsPadraoToggle').classList.toggle('ativo', window.obsPadraoAtivo);
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
window.obsPadraoAtivo = false;
const OBS_PADRAO_TXT = 'NAO E RECOMENDACAO DA IGUI REVESTIR A BORDA COM CERAMICA, A NOSSA SUGESTAO E A LINHA DE PEDRAS NATURAIS. CLIENTE FICA CIENTE QUE A MANUTENCAO DA BORDA E DE SUA RESPONSABILIDADE.';

// Obs ilustrativo é sempre ativa (fixa)
window.obsIlustrativoAtivo = true;
window.OBS_ILUSTRATIVO_TXT = 'O projeto é meramente ilustrativo. A execução final poderá sofrer ajustes de medidas, níveis e posicionamentos, conforme avaliação da equipe técnica e condições do local de instalação.';

function toggleObsPadrao() {
  window.obsPadraoAtivo = !window.obsPadraoAtivo;
  const toggle = document.getElementById('obsPadraoToggle');
  const obs    = document.getElementById('obs');

  toggle.classList.toggle('ativo', window.obsPadraoAtivo);

  if (window.obsPadraoAtivo) {
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
        _adicionadoEmPagamentos: S._adicionadoEmPagamentos || false,
        step: S.cur,
        obsPadrao: window.obsPadraoAtivo,
        obsIlustrativo: window.obsIlustrativoAtivo,
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
    if (k === 'usuario_logado_id') return; // tratado após o loop
    const el = document.getElementById(k);
    if (el) el.value = val || '';
  });
  // Restaurar seleção do projetista pelo UUID (mais preciso que nome)
  const selULr = document.getElementById('usuario_logado');
  if (selULr && selULr.tagName === 'SELECT') {
    const uid = f.usuario_logado_id;
    if (uid && Array.from(selULr.options).some(o => o.value === uid)) {
      selULr.value = uid;
    }
    // Retrocompatibilidade: saves antigos não têm usuario_logado_id; manter valor atual
  }

  // Atualizar logo do header conforme franquia restaurada
  if (f.loja_tipo) onLojaTipoChange(f.loja_tipo);

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
  S._adicionadoEmPagamentos = d._adicionadoEmPagamentos || false;

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
  S.cur = step;
  document.getElementById('pFill').style.width = ((step+1)/6*100)+'%';
  const sc = document.getElementById('sidebarStepCount');
  if (sc) sc.textContent = (step+1)+' / 6';
  window.scrollTo({top:0, behavior:'smooth'});
  posicionarGotinha(step);
}

function posicionarGotinha(step, animate = true) {
  const gotinha = document.getElementById('waterDrop');
  if (!gotinha) return;

  const btn = document.querySelectorAll('#stepsGenerator .stp')[step];
  if (!btn) return;

  const stpN = btn.querySelector('.stp-n');
  if (!stpN) return;

  const stepsContainer = document.getElementById('stepsGenerator');
  if (!stepsContainer) return;
  
  const containerRect = stepsContainer.getBoundingClientRect();
  const stpNRect = stpN.getBoundingClientRect();

  const targetTop = (stpNRect.top + stpNRect.height / 2) - containerRect.top;
  const targetLeft = (stpNRect.left + stpNRect.width / 2) - containerRect.left;

  // Evita posicionamento incorreto se o layout ainda não estiver totalmente pronto
  // targetTop deve ser positivo (step 1 está abaixo do topo do container)
  if (targetTop <= 0 || targetLeft <= 0 || stpNRect.width === 0) return;

  let currentTop = parseFloat(gotinha.style.top);
  if (isNaN(currentTop)) {
    currentTop = -80; // Posição inicial padrão (escondida atrás do cabeçalho)
  }

  if (animate && Math.abs(targetTop - currentTop) > 5) {
    gotinha.style.opacity = '1';
    gotinha.classList.remove('landing');
    gotinha.classList.add('falling');

    gotinha.style.top = targetTop + 'px';
    gotinha.style.left = targetLeft + 'px';

    setTimeout(() => {
      gotinha.classList.remove('falling');
      gotinha.classList.add('landing');

      setTimeout(() => {
        gotinha.classList.remove('landing');
      }, 120);
    }, 400);
  } else {
    // Desativa transição para posicionamento instantâneo
    gotinha.style.transition = 'none';
    gotinha.style.top = targetTop + 'px';
    gotinha.style.left = targetLeft + 'px';
    // Força reflow, restaura transição e torna visível
    gotinha.offsetHeight;
    gotinha.style.transition = '';
    gotinha.style.opacity = '1';
  }
}

// ═══════════════════════════════════════════════════
// IMAGE LOADING
// ═══════════════════════════════════════════════════

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
    `<button class="ptab" id="ptab-${tipo}-2" onclick="verPrancha('${tipo}',2)" style="display:none">Prancha 2 <span class="ptab-rm-icon" onclick="removerPranchaExtra('${tipo}', event)" title="Remover prancha">🗑</span></button>` +
    `<button class="ptab-add" id="ptab-add-${tipo}" onclick="togglePranchaExtra('${tipo}')" title="Adicionar uma 2ª prancha a esta seção">＋ prancha</button>`;

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
    `  <div class="img-sel-col"><label style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.3px;display:block;margin-bottom:6px">Painel Esquerdo</label><div class="img-sel-options" id="imgsel-${tipo}2-0"></div><div class="img-sel-preview" id="imgsel-preview-${tipo}2-0"></div></div>` +
    `  <div class="img-sel-col"><label style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.3px;display:block;margin-bottom:6px">Painel Direito</label><div class="img-sel-options" id="imgsel-${tipo}2-1"></div><div class="img-sel-preview" id="imgsel-preview-${tipo}2-1"></div></div>` +
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

function removerPranchaExtra(tipo, event) {
  if (event) {
    event.stopPropagation();
  }
  if (!S.pranchaExtra[tipo]) return;
  const modal = document.getElementById('rmPranchaModal');
  if (modal) {
    modal.classList.add('show');
    const btnConfirm = document.getElementById('btnConfirmRmPrancha');
    if (btnConfirm) {
      btnConfirm.onclick = () => {
        S.pranchaExtra[tipo] = false;
        S.itens[tipo + '2'] = [];
        S.selectedImgs[tipo + '2'] = [null, null];
        fecharModal();
        atualizarPranchasExtra();
        verPrancha(tipo, 1);
        autoSave();
      };
    }
  }
}

// Sincroniza a UI das abas com o estado S.pranchaExtra
function atualizarPranchasExtra() {
  ['rev','mob','pai'].forEach(tipo => {
    const ativa = !!(S.pranchaExtra && S.pranchaExtra[tipo]);
    const tab2 = document.getElementById(`ptab-${tipo}-2`);
    const add  = document.getElementById(`ptab-add-${tipo}`);
    if (tab2) tab2.style.display = ativa ? 'inline-flex' : 'none';
    if (add)  add.style.display  = ativa ? 'none' : '';
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
    ['rev','mob','pai','rev2','mob2','pai2'].forEach(tipo => {
      if (S.selectedImgs[tipo]) {
        S.selectedImgs[tipo] = S.selectedImgs[tipo].map(sel => sel === idx ? null : sel);
      }
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
  const rmModal = document.getElementById('rmPranchaModal');
  if (rmModal) rmModal.classList.remove('show');
  S._pdfPendente = false;
  S._previewPendente = false;
  S._salvarPendente = false;
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
function novaPrancha() {
  document.getElementById('novaModal').classList.add('show');
}

function confirmarNovaPrancha() {
  // Resetar estado
  S.imgs    = { '3d':['','','','',''], deck:['',''], cer:[''], rev:['',''], mob:['',''], pai:['',''] };
  S.acc     = { corrimao:{on:false,modelo:'',img:''}, cascata:{on:false,modelo:'',img:'',cor_pedra:''}, filtragem:{on:false,modelo:'',img:'',cor:''}, igui_stone:{on:false,modelo:'',img:''}, aquecimento:{on:false,modelo:'',img:''} };
  S.itens   = { rev:[], mob:[], pai:[], rev2:[], mob2:[], pai2:[] };
  S.selectedImgs = { rev:[null,null], mob:[null,null], pai:[null,null], rev2:[null,null], mob2:[null,null], pai2:[null,null] };
  S.secAtiva = { rev:true, mob:true, pai:true };
  S.pranchaExtra = { rev:false, mob:false, pai:false }; // BUG-06: resetar abas extras
  S._editandoId = null;
  S._adicionadoEmPagamentos = false;
  updateEditBadge();
  window.obsPadraoAtivo = false;
  // Limpar formulário
  ['loja','cliente','id_projeto','cidade','obs','modelo','ceramica_marca','ceramica_tamanho','ceramica_rejunte','tipo_projeto','loja_tipo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Repovoar usuario_logado
  const usuarioLogadoEl = document.getElementById('usuario_logado');
  if (usuarioLogadoEl) {
    // Para SELECT (admin): volta ao primeiro item (o próprio admin)
    if (usuarioLogadoEl.tagName === 'SELECT') {
      usuarioLogadoEl.selectedIndex = 0;
    } else {
      usuarioLogadoEl.value = document.getElementById('hdrUser')?.textContent || '';
    }
    usuarioLogadoEl.dispatchEvent(new Event('change'));
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

  // Reset toggles obs padrão
  document.getElementById('obsPadraoToggle')?.classList.remove('ativo');
  document.getElementById('obsIlustrativoToggle')?.classList.add('ativo');

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

function confirmarGerarPDF() {
  const isPdf = S._pdfPendente;
  const isPreview = S._previewPendente;
  const isSalvar = S._salvarPendente;

  fecharModal();

  if (isPdf) {
    executarGerarPDF();
  } else if (isPreview) {
    executarGerarPDF(true);
  } else if (isSalvar) {
    _executarSalvarSessao();
  }
}

function confirmarOverwrite() {
  fecharModal();
  S._skipOverwriteCheck = true;
  executarGerarPDF();
}

// ── Salvar Sessão (sem gerar PDF) ─────────────────────────────────
async function salvarSessao() {
  const validItems = validarCampos();
  const temErro  = validItems.some(i => i.cls === 'err');
  const temWarn  = validItems.some(i => i.cls === 'warn');

  if (temErro || temWarn) {
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
    btnConfirm.textContent = temErro ? 'Salvar mesmo assim ⚠️' : 'Salvar Sessão ✓';
    btnConfirm.style.background = temErro ? '#e74c3c' : 'var(--dark)';

    S._salvarPendente = true;
    S._pdfPendente = false;
    S._previewPendente = false;
    document.getElementById('validModal').classList.add('show');
    return;
  }

  await _executarSalvarSessao();
}

async function _executarSalvarSessao() {
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
      secAtiva: S.secAtiva, pranchaExtra: S.pranchaExtra, exibirCapa3d: S.exibirCapa3d || {}, obsPadrao: window.obsPadraoAtivo, obsIlustrativo: window.obsIlustrativoAtivo, step: S.cur,
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



let _previewUrl = null;

async function abrirPreviewPrancha(pdfArrayBuffer) {
  _previewUrl = pdfArrayBuffer;
  document.getElementById('previewModal')?.classList.add('show');
  const container = document.getElementById('previewPages');
  container.innerHTML = '<div style="color:#ccc;padding:32px;font-size:14px;">Carregando visualização...</div>';
  try {
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs';
    const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
    container.innerHTML = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.style.cssText = 'max-width:100%;box-shadow:0 2px 12px rgba(0,0,0,.5);background:#fff;';
      container.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  } catch(e) {
    container.innerHTML = `<div style="color:#f88;padding:32px;">Erro ao renderizar: ${e.message}</div>`;
  }
}

function fecharPreviewPrancha() {
  document.getElementById('previewModal')?.classList.remove('show');
  const container = document.getElementById('previewPages');
  if (container) container.innerHTML = '';
  _previewUrl = null;
}

function abrirPreviewNovaGuia() {
  if (!_previewUrl) return;
  const blob = new Blob([_previewUrl], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// Confirmar a partir da pré-visualização: fecha o modal e gera o PDF final
function confirmarPreview() {
  fecharPreviewPrancha();
  gerarPDF();
}

// Baixar PDF a partir da pré-visualização: mesma ação do botão "Gerar PDF Final"
function executarGerarPDFConfirm() {
  fecharPreviewPrancha();
  executarGerarPDF();
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
  previewPrancha,
  fecharPreviewPrancha,
  abrirPreviewNovaGuia,
  confirmarPreview,
  executarGerarPDFConfirm,
  onLojaTipoChange,
  adicionarVista3D,
  removerVista3D,
  atualizarExibirCapa3d,
  getFormData,
  v,
  getLogoPranchaB64,
  validarCampos,
  clearNode,
  setLoad,
  showToast,
  syncDeckPreview,
  renderImgSelectors,
  abrirPreviewPrancha,
});

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const usuarioLogadoEl = document.getElementById('usuario_logado');

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
      document.querySelectorAll('#navRelacaoProjetos, #navLojasPiscinas, #navAdmin, #labelAdmin, #navAdminGroup').forEach(el => el.style.display = 'flex');

      // Converter campo de projetista em select para administradores
      const select = document.createElement('select');
      select.id = 'usuario_logado';
      select.style.cssText = 'background:#ffffff; cursor:default;';
      
      // Substituir no DOM
      if (usuarioLogadoEl) {
        const parent = usuarioLogadoEl.parentElement;
        if (parent) parent.replaceChild(select, usuarioLogadoEl);
      }

      // Opção provisória com UUID do admin (será substituída pela lista completa)
      const optSelf = document.createElement('option');
      optSelf.value = _profile.id; // UUID do admin logado
      optSelf.textContent = profileName + ' ADMIN';
      select.appendChild(optSelf);
      select.value = _profile.id;

      // Iniciar busca de usuários em paralelo com initDB (será aguardada antes do cloud load)
      if (window.sbListarUsuarios) {
        window._usersListPromise = window.sbListarUsuarios();
      }
    }
  } catch(e) { console.warn('Profile load error:', e); }

  sbVerificarMsgNaoLidas().then(temNova => {
    const badge = document.getElementById('chatNavBadge');
    if (badge) badge.style.display = temNova ? 'block' : 'none';
  }).catch(() => {});

  setLogoImages();
  // Pré-carregar logos de franquia para eliminar delay ao trocar de aba
  ['logo_pranchaiGUi.png','logo_pranchaSplash.png'].forEach(src => {
    const img = new Image(); img.src = src;
  });
  onLojaTipoChange('iGUi'); // padrão

  // Monta as abas de prancha extra nos cards das seções
  montarAbasPrancha('rev', '#s3');
  montarAbasPrancha('mob', '#s4');
  montarAbasPrancha('pai', '#s5');

  // Init date
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  document.getElementById('data_proj').value = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;

  // Init DB (autosave local)
  try {
    await initDB();
  } catch(e) { console.warn('DB init error', e); }

  // Aguardar lista de usuários (iniciada em paralelo) antes do cloud load
  // Garante que o SELECT de projetista esteja populado antes de restaurar o valor salvo
  if (window._usersListPromise) {
    try {
      const usuarios = await window._usersListPromise;
      window.usuariosList = usuarios;
      const selUL = document.getElementById('usuario_logado');
      if (selUL && selUL.tagName === 'SELECT') {
        // Preservar seleção atual (por UUID ou por nome para retrocompatibilidade)
        const activeVal = selUL.value;
        selUL.innerHTML = '';
        const admins     = usuarios.filter(u => u.role === 'admin');
        const projetistas = usuarios.filter(u => u.role !== 'admin');
        const toOpt = u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = (u.name || u.email) + (u.role === 'admin' ? ' ADMIN' : ' USER');
          return opt;
        };
        if (admins.length) {
          const grp = document.createElement('optgroup');
          grp.label = '🟣 Administradores';
          admins.forEach(u => grp.appendChild(toOpt(u)));
          selUL.appendChild(grp);
        }
        if (projetistas.length) {
          const grp = document.createElement('optgroup');
          grp.label = '🟢 Projetistas';
          projetistas.forEach(u => grp.appendChild(toOpt(u)));
          selUL.appendChild(grp);
        }
        // Tentar restaurar pelo UUID; se não encontrar, sem extra option (UUID inválido não deve aparecer)
        selUL.value = activeVal;
      }
    } catch(e) { console.warn('Erro ao carregar lista de projetistas:', e); }
    window._usersListPromise = null;
  }

  // Verificar se há um projeto vindo da página de pranchas (cloud load)
  const _cloudLoad = sessionStorage.getItem('igui_cloud_load');
  if (_cloudLoad) {
    sessionStorage.removeItem('igui_cloud_load');
    try {
      const { sessao, editandoId } = JSON.parse(_cloudLoad);
      // Popular estado S com os dados deserializados
      if (sessao.form) {
        Object.entries(sessao.form).forEach(([k, v]) => {
          if (k === 'usuario_logado_id') return; // tratado após o loop
          const el = document.getElementById(k);
          if (el) el.value = v || '';
        });
        // Restaurar projetista pelo UUID (saves novos); ignora saves antigos sem o campo
        const selCL = document.getElementById('usuario_logado');
        if (selCL && selCL.tagName === 'SELECT') {
          const uid = sessao.form.usuario_logado_id;
          if (uid && Array.from(selCL.options).some(o => o.value === uid)) {
            selCL.value = uid;
          }
        }
        if (sessao.form.loja_tipo) onLojaTipoChange(sessao.form.loja_tipo);
      }
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
      if (sessao.obsPadrao)    { window.obsPadraoAtivo = sessao.obsPadrao; }
      S._editandoId = editandoId || null;
      updateEditBadge();
    } catch(e) { console.warn('Cloud load error:', e); }
  } else {
    // Check for saved data (autosave local)
    try {
      await checkRestore();
    } catch(e) { console.warn('Restore check error', e); }
  }

  // Se o campo usuario_logado estiver vazio, preenche com o nome do perfil
  const logEl = document.getElementById('usuario_logado');
  if (logEl && !logEl.value) {
    logEl.value = profileName;
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

  // Auto-save em SELECTs do formulário (inputs já têm oninput individual).
  // Restrito a input/select/textarea para não disparar em botões de filtro, nav, modais, etc.
  document.addEventListener('change', (e) => {
    if (!e.target.matches('input, select, textarea')) return;
    if (e.target.closest('nav, .modal, [data-no-autosave]')) return;
    autoSave();
  });
});

// Inicializar a gotinha: aguarda o logo carregar (ele empurra o layout da sidebar)
// depois posiciona no step 0. Reforça também no window.load como fallback.
(function() {
  function _colocarGotaNoStep0() { posicionarGotinha(0, false); }

  document.addEventListener('DOMContentLoaded', () => {
    const logoImg = document.querySelector('.sidebar img[src*="logo_site"]');
    if (logoImg && !logoImg.complete) {
      logoImg.addEventListener('load', _colocarGotaNoStep0, { once: true });
      logoImg.addEventListener('error', _colocarGotaNoStep0, { once: true });
    } else {
      // Logo já carregado (cache) — espera 1 rAF para o reflow do layout fixo
      requestAnimationFrame(() => requestAnimationFrame(_colocarGotaNoStep0));
    }

    window.addEventListener('resize', () => posicionarGotinha(S.cur, false));
  });

  // Fallback: garante posição correta após tudo carregar
  window.addEventListener('load', _colocarGotaNoStep0);
})();

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
