import { S } from './state.js';
import { cropB64 } from './image-editor.js';

function b64ToDataUri(b64) {
  if (!b64) return '';
  if (b64.startsWith('data:')) return b64;
  if (b64.startsWith('http')) return b64;
  const mime = b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

// ═══════════════════════════════════════════════════
// MOTOR DE GERAÇÃO DO PDF (jsPDF)
// ═══════════════════════════════════════════════════

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

async function ins(doc, b64, x, y, w, h) {
  if (!b64) return;
  const c = await cropB64(b64, w, h);
  if (c) doc.addImage('data:image/jpeg;base64,' + c, 'JPEG', x, y, w, h);
}

async function insFit(doc, b64, x, y, w, h) {
  if (!b64) return;
  return new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // evita canvas tainted se URL escapar do sbResolveImagesForPDF
    img.onload = () => {
      const r = img.width / img.height, rc = w / h;
      let dw, dh, dx, dy;
      if (r > rc) { dw = w; dh = w / r; dx = x; dy = y + (h - dh) / 2; }
      else        { dh = h; dw = h * r; dy = y; dx = x + (w - dw) / 2; }
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      try {
        doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', dx, dy, dw, dh);
      } catch(e) { console.warn('insFit canvas error:', e); }
      res();
    };
    img.onerror = () => res();
    img.src = b64ToDataUri(b64);
  });
}

function lineV(doc, x, y1, y2, col, lw) {
  doc.setDrawColor(...rgb(col || C.line));
  doc.setLineWidth(lw || 0.3);
  doc.line(x, y1, x, y2);
}

function lineH(doc, y, x1, x2, col, lw) {
  doc.setDrawColor(...rgb(col || C.line));
  doc.setLineWidth(lw || 0.3);
  doc.line(x1, y, x2, y);
}

function rgb(h) {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}

function drawFooter(doc, includeLoja) {
  const PW = 297, PH = 210;
  const FOOTER_H = 22;
  const fy = PH - FOOTER_H;

  doc.setFillColor(...rgb(C.gray));
  doc.rect(0, fy, PW, FOOTER_H, 'F');
  
  // Faixa cinza escuro no topo do rodapé: deslocada ligeiramente para cima (fy - 0.8mm)
  // com altura maior (2.3mm) para sobrepor as imagens e eliminar qualquer fresta de renderização (sub-pixel snapping)
  doc.setFillColor(...rgb(C.accent));
  doc.rect(0, fy - 0.8, PW, 2.3, 'F');

  doc.setTextColor(...rgb(C.text));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  
  const form = window.getFormData ? window.getFormData() : {};
  const lojaStr = (includeLoja && form.loja) ? ' ' + String(form.loja).toUpperCase() : '';
  const marca = window.v ? window.v('loja_tipo') : '';
  const prefix = marca === 'Splash' ? 'SPLASH' : 'IGUI CONCEITO';
  doc.text('PROJETO 3D - ' + prefix + lojaStr, 10, fy + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...rgb(C.muted));
  doc.text('CLIENTE:  ' + (form.cliente || ''), 10, fy + 11.5);
  doc.text('ID:  ' + (form.id_projeto || ''), 10, fy + 15.5);
  
  let LW = 20;
  let ratio = 1.4638;
  if (marca === 'Splash') {
    ratio = 588 / 334;
  } else if (marca === 'iGUi') {
    ratio = 272 / 185;
  }
  const LH = +(LW / ratio).toFixed(1);

  if (form.obs) {
    const isObsPadrao = form.obs.includes('NAO E RECOMENDACAO DA IGUI');
    doc.setTextColor(...rgb(isObsPadrao ? '#C0392B' : C.muted));
    doc.setFontSize(6.5);
    doc.text('OBS:  ' + form.obs, 10, fy + 19.5, { maxWidth: PW - LW - 20 });
  } else {
    doc.setTextColor(...rgb(C.muted));
    doc.setFontSize(7);
    doc.text('OBS:', 10, fy + 19.5);
  }

  if (window.getLogoPranchaB64) {
    doc.addImage('data:image/png;base64,' + window.getLogoPranchaB64(), 'PNG', PW - LW - 5, fy + (FOOTER_H - LH) / 2, LW, LH, undefined, 'FAST');
  }
}

export async function gerarPDF() {
  const validItems = window.validarCampos ? window.validarCampos() : [];
  const temErro  = validItems.some(i => i.cls === 'err');
  const temWarn  = validItems.some(i => i.cls === 'warn');

  if (temErro || temWarn) {
    const container = document.getElementById('validItems');
    if (window.clearNode) window.clearNode(container);
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
    btnConfirm.textContent = temErro ? 'Gerar assim mesmo ⚠️' : 'Gerar PDF ✓';
    btnConfirm.style.background = temErro ? '#e74c3c' : 'var(--dark)';

    S._pdfPendente = true;
    document.getElementById('validModal').classList.add('show');
    return;
  }

  await executarGerarPDF();
}

export async function previewPrancha() {
  const validItems = window.validarCampos ? window.validarCampos() : [];
  const temErro  = validItems.some(i => i.cls === 'err');
  const temWarn  = validItems.some(i => i.cls === 'warn');

  if (temErro || temWarn) {
    const container = document.getElementById('validItems');
    if (window.clearNode) window.clearNode(container);
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
    btnConfirm.textContent = temErro ? 'Visualizar mesmo assim ⚠️' : 'Pré-visualizar ✓';
    btnConfirm.style.background = temErro ? '#e74c3c' : 'var(--dark)';

    S._previewPendente = true;
    S._pdfPendente = false;
    S._salvarPendente = false;
    document.getElementById('validModal').classList.add('show');
    return;
  }

  await executarGerarPDF(true);
}

export async function executarGerarPDF(preview = false) {
  if (!preview && S._editandoId && !S._skipOverwriteCheck) {
    document.getElementById('overwriteModal').classList.add('show');
    return;
  }
  S._skipOverwriteCheck = false;

  const btn = document.getElementById('btnGerar');
  const ov  = document.getElementById('overlay');
  if (btn) btn.disabled = true;
  ov.classList.add('show');
  if (window.setLoad) window.setLoad('Iniciando...', 5);

  try {
    if (window.setLoad) window.setLoad('Baixando imagens...', 12);
    if (window.sbResolveImagesForPDF) {
      await window.sbResolveImagesForPDF(S);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });

    const _docText = doc.text.bind(doc);
    doc.text = function(txt, ...rest) {
      if (typeof txt === 'string') txt = txt.toUpperCase();
      else if (Array.isArray(txt)) txt = txt.map(s => (typeof s === 'string' ? s.toUpperCase() : s));
      return _docText(txt, ...rest);
    };

    const PW = 297, PH = 210;
    const FOOTER_H = 22;
    const form = window.getFormData ? window.getFormData() : {};
    function U(s) { return s ? String(s).toUpperCase() : ''; }

    // ════════════════════════════
    // PÁG 1 — Capa 3D (e extras)
    // ════════════════════════════
    if (window.setLoad) window.setLoad('Pagina 1: Capa 3D...', 20);
    await new Promise(r => setTimeout(r, 20));

    const vistas3d = [];
    S.imgs['3d'].forEach((val, idx) => {
      if (idx !== 4 && val) {
        const exibir = !S.exibirCapa3d || S.exibirCapa3d[idx] !== false;
        if (exibir) vistas3d.push(val);
      }
    });

    const viewsPerPage = 4;
    const totalPages = Math.max(1, Math.ceil(vistas3d.length / viewsPerPage));
    const CH = PH - FOOTER_H, HW = PW / 2, HH = CH / 2;

    for (let p = 0; p < totalPages; p++) {
      if (p > 0) doc.addPage();
      
      // Células inferiores com 1mm a mais de altura para sobrepor o rodapé
      const cells = [
        [0, 0, HW, HH],
        [HW, 0, HW, HH],
        [0, HH, HW, HH + 1],
        [HW, HH, HW, HH + 1]
      ];
      
      const startIdx = p * viewsPerPage;
      for (let i = 0; i < 4; i++) {
        const [cx, cy, cw, ch] = cells[i];
        doc.setFillColor(...rgb(C.lightbg));
        doc.rect(cx, cy, cw, ch, 'F');
        const viewImg = vistas3d[startIdx + i];
        if (viewImg) {
          await ins(doc, viewImg, cx, cy, cw, ch);
        }
      }
      
      doc.setDrawColor(...rgb(C.accent));
      doc.setLineWidth(0.6);
      doc.line(HW, 0, HW, CH + 1);
      doc.line(0, HH, PW, HH);
      
      drawFooter(doc, true);
    }

    // ════════════════════════════
    // PÁG 2 — Descritivo
    // ════════════════════════════
    doc.addPage();
    if (window.setLoad) window.setLoad('Pagina 2: Descritivo...', 40);
    await new Promise(r => setTimeout(r, 20));

    const DESC_H = 96, IMG2_H = PH - FOOTER_H - DESC_H;
    const deckImgs = [S.imgs['3d'][0], S.imgs['3d'][4]];

    for (let i = 0; i < 2; i++) {
      const cx = i * HW;
      doc.setFillColor(...rgb(C.lightbg));
      doc.rect(cx, 0, HW, IMG2_H, 'F');
      doc.setDrawColor(...rgb(C.line));
      doc.setLineWidth(0.3);
      doc.rect(cx, 0, HW, IMG2_H, 'S');
      if (deckImgs[i]) await ins(doc, deckImgs[i], cx, 0, HW, IMG2_H);
    }
    lineV(doc, HW, 0, IMG2_H, C.accent, 0.6);

    const LBX = HW + 1.5, LBY = IMG2_H - 10, LBW = 34, LBH = 7.5;
    doc.setFillColor(...rgb(C.dark));
    doc.rect(LBX, LBY, LBW, LBH, 'F');
    doc.setFillColor(...rgb(C.accent));
    doc.rect(LBX, LBY, 3, LBH, 'F');
    doc.setTextColor(...rgb(C.white));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('MEDIDAS DECK', LBX + 5, LBY + 5);

    const avX = LBX + LBW + 2, avY = LBY - 1.5, avW = PW - avX - 1.5, avH = LBH + 3;
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.85 }));
    doc.setFillColor(255, 255, 255);
    doc.rect(avX, avY, avW, avH, 'F');
    doc.restoreGraphicsState();
    doc.setTextColor(...rgb(C.text));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('MEDIDAS INDICADAS SAO REFERENCIAIS, BASEADAS NAS INFORMACOES FORNECIDAS.', avX + 2, LBY + 3);
    doc.text('RECOMENDA-SE A CONFERENCIA DAS MEDIDAS NO LOCAL ANTES DA EXECUCAO/INSTALACAO.', avX + 2, LBY + 7);

    const DY = IMG2_H;
    lineH(doc, DY, 0, PW, C.accent, 0.6);

    const M = 8;
    doc.setTextColor(...rgb(C.text));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('DESCRITIVO PISCINAS', M, DY + 11);

    doc.setFontSize(9);
    doc.setTextColor(...rgb(C.muted));
    doc.setFont('helvetica', 'normal');
    doc.text('MODELO:', M, DY + 20);
    const mW = doc.getTextWidth('MODELO:') + 3;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(C.text));
    doc.text((form.modelo || ''), M + mW, DY + 20);
    
    const SEP_X = 66;
    lineV(doc, SEP_X, DY + 3, DY + 36, C.line, 0.5);

    const C2X = SEP_X + 6;
    doc.setTextColor(...rgb(C.text));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('CERAMICA:', C2X, DY + 11);
    const cLW = doc.getTextWidth('CERAMICA:') + 3;
    doc.setTextColor(...rgb(C.accent));
    doc.setFontSize(10.5);
    if (form.ceramica_nome) doc.text((form.ceramica_nome || ''), C2X + cLW, DY + 11);

    if (form.ceramica_marca) {
      doc.setTextColor(...rgb(C.muted));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text((form.ceramica_marca || ''), C2X + cLW, DY + 17);
    }

    doc.setTextColor(...rgb(C.muted));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('TAMANHO REAL:', C2X + 3, DY + 24);
    doc.setTextColor(...rgb(C.text));
    doc.setFont('helvetica', 'bold');
    doc.text((form.ceramica_tamanho || ''), C2X + 41, DY + 24);

    doc.setTextColor(...rgb(C.muted));
    doc.setFont('helvetica', 'normal');
    doc.text('REJUNTE:', C2X + 3, DY + 31);
    doc.setTextColor(...rgb(C.text));
    doc.setFont('helvetica', 'bold');
    doc.text((form.ceramica_rejunte || ''), C2X + 41, DY + 31);

    const cerB64 = S.imgs['cer'][0];
    const CER_X = C2X + 80, CER_Y = DY + 8, CER_S = 28;
    doc.setDrawColor(...rgb(C.line));
    doc.setLineWidth(0.3);
    doc.rect(CER_X, CER_Y, CER_S, CER_S, 'S');
    if (cerB64) await ins(doc, cerB64, CER_X, CER_Y, CER_S, CER_S);

    const ASPY = DY + 38;
    doc.setFillColor(...rgb(C.accent));
    doc.rect(M, ASPY, PW - 2 * M, 8, 'F');
    doc.setTextColor(...rgb(C.white));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('ACESSORIOS E DISPOSITIVOS', M + 4, ASPY + 5.8);

    const ACW = (PW - 2 * M) / 3;
    const ACC_Y_START = ASPY + 11;
    const ACC_ROW_H = 22;
    const ACC_CFG = [
      { key: 'corrimao', label: 'Corrimão' },
      { key: 'cascata', label: 'Cascata' },
      { key: 'filtragem', label: 'Sistema de Filtragem' },
      { key: 'igui_stone', label: 'IGUI Stone' },
      { key: 'aquecimento', label: 'Sistema de Aquecimento' }
    ];

    for (let i = 0; i < ACC_CFG.length; i++) {
      const { key, label } = ACC_CFG[i];
      const a = S.acc[key];
      const col = i % 3, row = Math.floor(i / 3);
      const ax = M + col * ACW, ay = ACC_Y_START + row * ACC_ROW_H;

      doc.setFillColor(...rgb(a.on ? C.accent : '#BBBBBB'));
      doc.circle(ax + 2.5, ay + 1.5, 2, 'F');

      doc.setTextColor(...rgb(C.text));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(label, ax + 7, ay + 3);
      if (a.modelo) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...rgb(C.muted));
        doc.setFontSize(8);
        doc.text(a.modelo, ax + 7, ay + 9);
      }
      if (a.on && a.img) {
        const IS = 18;
        await insFit(doc, a.img, ax + 60, ay - 2, IS, IS);
      }
    }

    drawFooter(doc, true);

    // ════════════════════════════════════════════════════
    // PÁGS 3-5 — Revestimentos / Mobiliário / Paisagismo
    // ════════════════════════════════════════════════════
    const SECS = [];
    [['REVESTIMENTOS','rev'],['MOBILIARIO','mob'],['PAISAGISMO','pai']].forEach(([title,tipo]) => {
      const ativa = !(S.secAtiva && S.secAtiva[tipo] === false);
      SECS.push({ title, grp: tipo, tipo, isPai: tipo === 'pai' });
      if (ativa && S.pranchaExtra && S.pranchaExtra[tipo]) {
        SECS.push({ title, grp: tipo, tipo: tipo + '2', isPai: tipo === 'pai' });
      }
    });

    for (const sec of SECS) {
      if (S.secAtiva && S.secAtiva[sec.tipo] === false) continue;
      doc.addPage();
      const _secPcts = { rev: 55, mob: 68, pai: 82 };
      if (window.setLoad) window.setLoad('Montando ' + sec.title + '...', _secPcts[sec.tipo] || 60);
      await new Promise(r => setTimeout(r, 20));

      const isPai = sec.isPai;
      const items = S.itens[sec.tipo] || [];
      const TITLE_H = 9;
      const CARD_H = isPai ? 36 : 32;
      const CARD_GAP = 3;
      const IH = PH - FOOTER_H - 96;

      for (let i = 0; i < 2; i++) {
        const cx = i * HW;
        doc.setFillColor(...rgb(C.lightbg));
        doc.rect(cx, 0, HW, IH, 'F');
        doc.setDrawColor(...rgb(C.line));
        doc.setLineWidth(0.3);
        doc.rect(cx, 0, HW, IH, 'S');
        const selIdx = S.selectedImgs[sec.tipo][i];
        const secImg = (selIdx !== null && selIdx !== undefined) ? S.imgs['3d'][selIdx] : null;
        if (secImg) await ins(doc, secImg, cx, 0, HW, IH);
      }
      lineV(doc, HW, 0, IH, C.accent, 0.6);
      lineH(doc, IH, 0, PW, C.accent, 0.6);

      doc.setFillColor(...rgb(C.accent));
      doc.rect(0, IH, PW, TITLE_H, 'F');
      doc.setTextColor(...rgb(C.white));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(sec.title, M, IH + 6.2);

      if (items.length === 0) {
        drawFooter(doc, true);
        continue;
      }

      const NCOLS = 3;
      const COL_W = (PW - 2 * M) / NCOLS;
      const CARD_W = COL_W - 4;
      const CARDS_AREA_TOP = IH + TITLE_H;
      const CARDS_AREA_BOT = PH - FOOTER_H;
      const CARDS_AREA_H = CARDS_AREA_BOT - CARDS_AREA_TOP;
      const nRows = items.length > 0 ? Math.min(Math.ceil(items.length / 3), 2) : 0;
      const totalCardsH = nRows > 0 ? nRows * (CARD_H + CARD_GAP) - CARD_GAP : 0;
      const CARD_TOP = CARDS_AREA_TOP + (CARDS_AREA_H - totalCardsH) / 2;

      for (let i = 0; i < Math.min(items.length, 6); i++) {
        const item = items[i];
        const col = i % NCOLS, row = Math.floor(i / NCOLS);
        const cx = M + col * COL_W;
        const cy = CARD_TOP + row * (CARD_H + CARD_GAP);
        const cw = CARD_W, ch = CARD_H;

        if (cy + ch > CARDS_AREA_BOT - 1) continue;

        doc.setFillColor(...rgb(C.cardBg));
        doc.setDrawColor(...rgb(C.line));
        doc.setLineWidth(0.2);
        doc.rect(cx, cy, cw, ch, 'FD');

        const imgSize = ch - 4;
        doc.setFillColor(...rgb(C.lightbg));
        doc.setDrawColor(...rgb(C.line));
        doc.rect(cx + 2, cy + 2, imgSize, imgSize, 'FD');
        const IMG_PAD = 1.5;
        if (item.imagem) await insFit(doc, item.imagem, cx + 2 + IMG_PAD, cy + 2 + IMG_PAD, imgSize - IMG_PAD * 2, imgSize - IMG_PAD * 2);

        const TX = cx + imgSize + 6;
        const TY1 = cy + 6.5;
        const TW = cw - imgSize - 10;
        const FONT_SZ = isPai ? 7.5 : 8;
        const LINE_H = isPai ? 3.5 : 4;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(FONT_SZ);
        doc.setTextColor(...rgb(C.text));
        
        const rawName = U(item.nome || '');
        const lines = doc.splitTextToSize(rawName, TW);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(FONT_SZ);
        doc.setTextColor(...rgb(C.text));
        lines.forEach((line, li) => {
          doc.text(line, TX, TY1 + li * (LINE_H + 0.5));
        });

        if (!isPai && item.descricao) {
          const descY = TY1 + lines.length * (LINE_H + 0.5) + 1;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...rgb(C.muted));
          doc.setFontSize(8);
          const desc = U(item.descricao || '');
          doc.getTextWidth(desc) <= TW
            ? doc.text(desc, TX, descY)
            : doc.text(desc, TX, descY, { maxWidth: TW });
        }
      }

      drawFooter(doc, true);
    }

    // ── Nome base dos arquivos ──
    if (window.setLoad) window.setLoad('Finalizando...', 92);
    await new Promise(r => setTimeout(r, 50));
    
    const id = (form.id_projeto || '000000').trim();
    const modelo_ = (form.modelo || '').replace(/[<>:"/\\|?*]/g, '').trim();
    const lojaRaw = (form.loja || '').replace(/[<>:"/\\|?*]/g, '').trim();
    const data = (form.data_proj || '').replace(/\//g, '-') || (() => {
      const d = new Date();
      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    })();
    const marca_ = (form.loja_tipo || '').trim();
    const namePDF = marca_ === 'Splash'
      ? `Splash_${id}_${modelo_}_${lojaRaw}_${data}.pdf`
      : `${id}_Prancha Técnica ${modelo_}_${lojaRaw}_${data}.pdf`;

    if (preview) {
      const pdfBytes = doc.output('arraybuffer');
      if (window.abrirPreviewPrancha) window.abrirPreviewPrancha(pdfBytes);
    } else {
      doc.save(namePDF);
    }

    // [H] Salvar no banco Supabase AUTOMATICAMENTE ao gerar o PDF (só se não for preview)
    try {
      if (!preview) {
        if (window.setLoad) window.setLoad('Salvando na nuvem...', 95);
        const obsPadraoAtivo = window.obsPadraoAtivo || false;
        const projetoPayload = {
          form: window.getFormData ? window.getFormData() : {},
          imgs: S.imgs,
          acc: S.acc,
          itens: S.itens,
          selectedImgs: S.selectedImgs,
          secAtiva: S.secAtiva,
          pranchaExtra: S.pranchaExtra,
          exibirCapa3d: S.exibirCapa3d || {},
          obsPadrao: obsPadraoAtivo,
          step: S.cur,
        };
        
        if (window.salvarProjeto) {
          const savedId = await window.salvarProjeto(projetoPayload, S._editandoId || null);
          if (!S._editandoId && savedId) {
            S._editandoId = savedId;
            if (window.updateEditBadge) window.updateEditBadge();
          }
        }
        
        // Se o usuário estiver logado e ainda não tiver adicionado o projeto no sistema de pagamentos da Ikatu, insere
        try {
          if (window.sbGetUser) {
            const user = await window.sbGetUser();
            if (user && !S._adicionadoEmPagamentos) {
              // Monta raw no formato esperado pelo pagamentos.js: ID_Piscina_Loja
              const _pad = n => String(n).padStart(2, '0');
              const _hoje = new Date();
              const _dataHoje = `${_pad(_hoje.getDate())}/${_pad(_hoje.getMonth() + 1)}/${_hoje.getFullYear()}`;
              const _raw = form.loja_tipo === 'Splash'
                ? ['Splash', form.id_projeto || '', form.modelo || '', form.loja || ''].join('_')
                : [form.id_projeto || '', form.modelo || '', form.loja || ''].join('_');
              const rowPag = {
                raw: _raw,
                cliente: form.cliente || '',
                loja: form.loja || '',
                modelo: form.modelo || '',
                data: _dataHoje,        // data de recebimento — necessário para filtro por mês
                tipo: form.tipo_projeto || '',
                data_envio: _dataHoje,
                obs: '',
                alt: false,
                conf: false,
                auto: true,
                prancha_id: S._editandoId || null,
              };
              if (window.sbAdicionarLinhaAoPagamento) {
                const targetUserId = form.usuario_logado_id || user.id;
                await window.sbAdicionarLinhaAoPagamento(targetUserId, rowPag);
                S._adicionadoEmPagamentos = true;
                setTimeout(() => {
                  if (window.showToast) window.showToast('📋 Projeto inserido automaticamente em Pagamentos!', 'info');
                }, 2000);
              }
            }
          }
        } catch(pe2) {
          console.warn('Erro ao adicionar em pagamentos:', pe2);
        }
        
        // Autosave local (IndexedDB)
        if (window.dbSave) {
          window.dbSave('autosave', {
            ...projetoPayload,
            _editandoId: S._editandoId,
            _adicionadoEmPagamentos: S._adicionadoEmPagamentos || false,
            ts: Date.now(),
          });
        }

        if (window.showToast) window.showToast('✅ PDF gerado e prancha salva na nuvem!', 'ok');
      }
    } catch(pe) {
      console.warn('Erro ao salvar no Supabase:', pe);
    }

  } catch(err) {
    console.error('PDF error:', err);
    if (window.showToast) window.showToast('Erro: ' + err.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
    ov.classList.remove('show');
  }
}
