// ═══════════════════════════════════════════════════
// ESTADO GLOBAL DO APLICATIVO
// ═══════════════════════════════════════════════════
export const S = {
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
  _adicionadoEmPagamentos: false,
  
  // Variáveis de controle de fluxo adicionadas ao estado para mutabilidade entre módulos
  cur: 0,
  _pdfPendente: false,
  _previewPendente: false,
  _salvarPendente: false,
  _skipOverwriteCheck: false
};

export const SAVE_KEY = 'prancha_igui_autosave';
export let db = null;

// ═══════════════════════════════════════════════════
// INDEXEDDB — AUTO-SAVE / RESTORE LOCAL
// ═══════════════════════════════════════════════════
export function initDB() {
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
    req.onsuccess = e => {
      db = e.target.result;
      res(db);
    };
    req.onerror = e => {
      console.warn('IndexedDB error', e);
      rej(e);
    };
  });
}

export function dbSave(key, val) {
  if (!db) return;
  try {
    const tx  = db.transaction('dados', 'readwrite');
    const req = tx.objectStore('dados').put(val, key);
    req.onerror = e => {
      if (e.target.error && e.target.error.name === 'QuotaExceededError') {
        if (window.showToast) {
          window.showToast('⚠️ Armazenamento cheio. Exporte sua sessão (.igui) para não perder os dados.', 'err');
        }
      }
    };
  } catch(e) {
    console.warn('dbSave error:', e);
  }
}

export function dbGet(key) {
  return new Promise((res, rej) => {
    if (!db) { res(null); return; }
    const tx = db.transaction('dados', 'readonly');
    const req = tx.objectStore('dados').get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => res(null);
  });
}
