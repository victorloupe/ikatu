import { S } from './state.js';

// ═══════════════════════════════════════════════════
// EDITOR DE IMAGENS — ESTADO E CONTROLES DE CROP
// ═══════════════════════════════════════════════════
export const cropState = {
  currentGrp: null,
  currentIdx: null,
  zoom: 1.0,
  x: 0,
  y: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  imgWidth: 0,
  imgHeight: 0
};

// Auxiliar de formatação base64 (detecta PNG vs JPEG pelo header base64)
function b64ToDataUri(b64) {
  if (!b64) return '';
  if (b64.startsWith('data:')) return b64;
  if (b64.startsWith('http')) return b64;
  const mime = b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}
function imgSrc(val) {
  return b64ToDataUri(val);
}

export function abrirEditorComImagemExistente(grp, idx) {
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

export function applyCropTransform() {
  const cropImg = document.getElementById('cropImage');
  if (cropImg) {
    // Definimos a origem da transformação no canto superior esquerdo para facilitar os cálculos de arrastar/redimensionar
    cropImg.style.transformOrigin = '0 0';
    cropImg.style.transform = `translate(${cropState.x}px, ${cropState.y}px) scale(${cropState.zoom})`;
  }
}

export function updateCropZoomUI() {
  const zoomVal = document.getElementById('cropZoomValue');
  if (zoomVal) {
    zoomVal.textContent = `${Math.round(cropState.zoom * 100)}%`;
  }
  const zoomRange = document.getElementById('cropZoomRange');
  if (zoomRange) {
    zoomRange.value = cropState.zoom;
  }
}

export function changeCropZoom(delta) {
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

export function fecharCropModal() {
  document.getElementById('cropModal').style.display = 'none';
  const cropImg = document.getElementById('cropImage');
  if (cropImg) cropImg.src = '';
}

export function confirmarRecorte() {
  document.getElementById('overlay').classList.add('show');
  if (window.setLoad) window.setLoad('Recortando imagem...');
  
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
        if (window.syncDeckPreview) window.syncDeckPreview();
        if (window.renderImgSelectors) window.renderImgSelectors();
      }
      
      if (window.autoSave) window.autoSave();
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

export function usarOriginalSemRecortar() {
  document.getElementById('overlay').classList.add('show');
  if (window.setLoad) window.setLoad('Processando imagem...');
  
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
          if (window.syncDeckPreview) window.syncDeckPreview();
          if (window.renderImgSelectors) window.renderImgSelectors();
        }
        
        if (window.autoSave) window.autoSave();
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

// Aceita File/Blob (direto do input) ou dataUrl (string) como source.
// Usa createImageBitmap quando disponível — decodifica fora da thread principal,
// evitando trava na UI com imagens grandes.
export function compressImg(source, maxW, quality) {
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

export function cropB64(b64, cw, ch, q=0.88) {
  return new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // evita canvas tainted se URL escapar do sbResolveImagesForPDF
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
    img.src=b64ToDataUri(b64);
  });
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
    }, { passive: true });
    window.addEventListener('touchend', stopDrag, { passive: true });

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
