// ═══════════════════════════════════════════════════
// PAGAMENTOS.JS — lógica da página de pagamentos
// ═══════════════════════════════════════════════════

// Escapa texto livre antes de injetar em innerHTML (atributos e conteúdo).
// Evita que aspas, < ou </textarea> em nomes de arquivo/observações quebrem a linha.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Funções de Extração fornecidas pelo usuário ---
function nProjeto(texto) {
  if (!texto) return "";
  let limpo = texto.toString().trim()
    .replace(/\s*\(\d+\)\s*$/, ""); // remove (1), (2), etc no fim

  if (/splash/i.test(limpo)) {
    return "Splash";
  }
  let partes = limpo.split("_");
  let projeto = partes[0] || "";
  if (/^\d+$/.test(projeto)) {
    return projeto.trim();
  }
  return "Inter.";
}

function obterEstiloTipo(tipo) {
  switch (tipo) {
    case 'Até 02 Projetos':
      return { bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' };
    case '03 a 4 Projetos':
      return { bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' };
    case 'Mais que 05 Projetos':
      return { bg: '#cffafe', color: '#0891b2', border: '#22d3ee' };
    case 'Projeto 360º':
    case 'Projeto 360º (3 Modificações)':
      return { bg: '#f3e8ff', color: '#6b21a8', border: '#d8b4fe' };
    case 'Conceito':
      return { bg: '#fef3c7', color: '#b7791f', border: '#f5d87a' };
    case 'Alterações GRANDES':
      return { bg: '#f8fafc', color: '#475569', border: '#cbd5e1' };
    default:
      return { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' };
  }
}

function piscina(texto) {
  if (!texto) return "";
  let limpo = texto.toString().replace(/\s*\(\d+\)\s*$/, "");
  let partes = limpo.split("_");
  return partes[1] || "";
}

// Lista de piscinas de um projeto (1 a 5, separadas por ';' dentro do raw)
function piscinasArr(raw) {
  return (piscina(raw) || '').split(';').map(s => s.trim()).filter(Boolean);
}

// Badges de piscina (um por modelo)
function badgesPiscina(raw) {
  const arr = piscinasArr(raw);
  if (!arr.length) return '<span class="badge-piscina">—</span>';
  return arr.map(p => `<span class="badge-piscina">${esc(p)}</span>`).join(' ');
}

// Linha de "editado" embaixo do projeto (última edição feita por um admin)
function renderEditadoLine(ed, index) {
  if (!ed) return '';
  const mudancas = (ed.campos || []).map(c =>
    `<b>${esc(c.c)}</b>: ${esc(c.de || '—')} → ${esc(c.para || '—')}`
  ).join(' · ');
  
  let btnApagar = '';
  if (isAdminUser) {
    btnApagar = `<button class="btn-apagar-editado" onclick="removerEditado(${index}, event)" title="Excluir histórico de edição" style="background:none; border:none; color:#b7791f; font-weight:700; cursor:pointer; font-size:11px; margin-left:8px; padding: 2px 6px; border-radius: 4px; transition: background 0.2s; outline:none;" onmouseover="this.style.background='#fde68a'; this.style.color='#7a5c00';" onmouseout="this.style.background='none'; this.style.color='#b7791f';">✕</button>`;
  }
  
  return `<div class="row-editado" style="display:flex; justify-content:space-between; align-items:center;"><span>✏️ Editado${mudancas ? ` — ${mudancas}` : ''}</span>${btnApagar}</div>`;
}

// Compara a linha original com os novos valores e devolve os campos alterados
function diferencasEdicao(orig, novo) {
  const mudancas = [];
  const add = (c, de, para) => { if (String(de || '') !== String(para || '')) mudancas.push({ c, de, para }); };
  const idOrig = (orig.raw || '').split('_')[0] || '';
  const piscNova = (novo.piscina || '').split(';').map(s => s.trim()).filter(Boolean).join(', ');
  add('Nº', idOrig, novo.id || '');
  add('Recebimento', orig.data || '', novo.data || '');
  add('Envio', (orig.data_envio !== undefined ? orig.data_envio : dataEnvio(orig.raw)) || '', novo.data_envio || '');
  add('Piscina', piscinasArr(orig.raw).join(', '), piscNova);
  add('Loja', loja(orig.raw) || '', novo.loja || '');
  add('Tipo', orig.tipo || '', novo.tipo || '');
  add('Gde Alteração', orig.alt ? 'Sim' : 'Não', novo.alt ? 'Sim' : 'Não');
  add('Obs', orig.obs || '', novo.obs || '');
  return mudancas;
}

function loja(texto) {
  if (!texto) return "";
  let limpo = texto.toString().replace(/\s*\(\d+\)\s*$/, "");
  let partes = limpo.split("_");
  return partes[2] || "";
}

function dataEnvio(texto) {
  if (!texto) return "";
  let limpo = texto.toString().trim().replace(/\s*\(\d+\)\s*$/, "");
  
  // Tenta encontrar o padrão de data DD-MM-YYYY ou DD/MM/YYYY
  let match = limpo.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    return match[1].padStart(2, '0') + "-" + match[2].padStart(2, '0');
  }
  // Tenta encontrar o padrão de data DD-MM ou DD/MM
  match = limpo.match(/(\d{1,2})[-/](\d{1,2})/);
  if (match) {
    return match[1].padStart(2, '0') + "-" + match[2].padStart(2, '0');
  }

  let partes = limpo.split("_");
  if (partes.length < 4) return "";

  let dt = partes[3];
  let pedacos = dt.split("-");
  if (pedacos.length < 2) return partes[3];

  return pedacos[0] + "-" + pedacos[1]; // só dia-mês
}

// --- Estado Global Local ---
let rowsData = [];
const STORAGE_KEY = 'igui_pagamentos_rows';
const HEADER_KEY = 'igui_pagamentos_header';
const VALUES_KEY = 'igui_pagamentos_values';

let pagId = null;

// Admin: pode ver/editar os pagamentos de qualquer projetista
let isAdminUser = false;
let meuUserId = null;        // id do usuário logado
let targetUserId = null;     // de quem são os pagamentos exibidos (default: você)
let targetUserName = '';     // nome do projetista alvo
let usuariosPagamentos = []; // lista de usuários (para o seletor do admin)
let editandoIndex = null;    // índice da linha em edição no modal (null = adicionar)
let pagIdPorUser = {};       // no modo "Todos": user_id -> id do registro primário

let queryPesquisa = "";
let filtroAtivo = "todos";
let filtroTipoAtivo = "todos";
let filtroLojaAtivo = "todos";
let ultimoExcluido = null;

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function extrairMesAno(strData, defaultYear = 2026) {
  if (!strData) return null;
  const matchDmy = strData.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (matchDmy) {
    return {
      dia: parseInt(matchDmy[1]),
      mes: parseInt(matchDmy[2]),
      ano: parseInt(matchDmy[3])
    };
  }
  const matchDm = strData.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (matchDm) {
    return {
      dia: parseInt(matchDm[1]),
      mes: parseInt(matchDm[2]),
      ano: defaultYear
    };
  }
  return null;
}

function obterDiferencaMeses(row, defaultYear = 2026) {
  let dtRec = row.data ? row.data.toString().trim() : "";
  let dtEnv = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
  if (!dtRec || !dtEnv) return false;
  
  const recParsed = extrairMesAno(dtRec, defaultYear);
  const envParsed = extrairMesAno(dtEnv, defaultYear);
  if (!recParsed || !envParsed) return false;
  
  const recMonths = recParsed.ano * 12 + recParsed.mes;
  const envMonths = envParsed.ano * 12 + envParsed.mes;

  return envMonths > recMonths;
}

// Recebido neste mês, porém enviado num mês ANTERIOR (ex.: recebe 01/06, envia 31/05)
function recebidoDeMesAnterior(row, defaultYear = 2026) {
  let dtRec = row.data ? row.data.toString().trim() : "";
  let dtEnv = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
  if (!dtRec || !dtEnv) return false;

  const recParsed = extrairMesAno(dtRec, defaultYear);
  const envParsed = extrairMesAno(dtEnv, defaultYear);
  if (!recParsed || !envParsed) return false;

  const recMonths = recParsed.ano * 12 + recParsed.mes;
  const envMonths = envParsed.ano * 12 + envParsed.mes;

  return envMonths < recMonths;
}

function temMesesDiferentes(row, defaultYear = 2026) {
  let dtRec = row.data ? row.data.toString().trim() : "";
  let dtEnv = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
  if (!dtRec || !dtEnv) return false;
  
  const recParsed = extrairMesAno(dtRec, defaultYear);
  const envParsed = extrairMesAno(dtEnv, defaultYear);
  if (!recParsed || !envParsed) return false;
  
  return recParsed.mes !== envParsed.mes || recParsed.ano !== envParsed.ano;
}

function syncFiltrosLista(mesVal, anoVal) {
  if (mesVal) {
    document.getElementById('pagamentoMes').value = mesVal;
    const selectFiltroMes = document.getElementById('filtroListaMes');
    if (selectFiltroMes) selectFiltroMes.value = mesVal;
  }
  if (anoVal) {
    document.getElementById('pagamentoAno').value = anoVal;
    const selectFiltroAno = document.getElementById('filtroListaAno');
    if (selectFiltroAno) selectFiltroAno.value = anoVal;
  }
  salvarCabecalho(true);
}

function atualizarSelectsFiltro() {
  const currentMonth = document.getElementById('pagamentoMes')?.value || 'Maio';
  const currentYear = document.getElementById('pagamentoAno')?.value || '2026';
  
  const selectFiltroMes = document.getElementById('filtroListaMes');
  if (selectFiltroMes) selectFiltroMes.value = currentMonth;
  
  const selectFiltroAno = document.getElementById('filtroListaAno');
  if (selectFiltroAno) selectFiltroAno.value = currentYear;
}

// --- Inicialização ---
// Define mês/ano atuais imediatamente (antes da resposta do Supabase),
// evitando que os selects fiquem em "Janeiro" durante o carregamento.
function definirPeriodoAtual() {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const hoje = new Date();
  const mesAtual = meses[hoje.getMonth()];
  const anoAtual = hoje.getFullYear().toString();
  ['pagamentoMes', 'filtroListaMes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = mesAtual;
  });
  ['pagamentoAno', 'filtroListaAno'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = anoAtual;
  });
}

// Linhas-fantasma enquanto os dados carregam do Supabase
function mostrarSkeletonTabela() {
  const tbody = document.getElementById('tabelaProjetosCorpo');
  if (!tbody) return;
  const larguras = [[40, 70, 85, 60], [40, 55, 75, 45], [40, 65, 90, 55], [40, 50, 70, 65], [40, 60, 80, 40]];
  tbody.innerHTML = larguras.map(ws => `
    <tr class="pag-skel-row">
      <td colspan="6">
        <div class="pag-skel-flex">
          <div class="skel-bar" style="width:18px;height:18px;border-radius:4px;flex-shrink:0;"></div>
          <div class="skel-bar" style="width:${ws[1]}px;height:12px;flex-shrink:0;"></div>
          <div class="skel-bar" style="flex:${ws[2] / 100};height:12px;"></div>
          <div class="skel-bar" style="flex:${ws[3] / 100};height:12px;"></div>
        </div>
      </td>
    </tr>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  definirPeriodoAtual();
  mostrarSkeletonTabela();
  iniciarPagamentos();

  // Add event delegation for duplicate highlighting on hover
  const tableBody = document.getElementById('tabelaProjetosCorpo');
  if (tableBody) {
    tableBody.addEventListener('mouseover', (e) => {
      const tr = e.target.closest('tr');
      if (tr && tr.classList.contains('is-duplicate-row')) {
        const projId = tr.getAttribute('data-proj-id');
        if (projId) {
          document.querySelectorAll(`#tabelaProjetosCorpo tr[data-proj-id="${projId}"]`).forEach(el => {
            el.classList.add('hover-highlight-duplicate');
          });
        }
      }
    });

    tableBody.addEventListener('mouseout', (e) => {
      const tr = e.target.closest('tr');
      if (tr) {
        document.querySelectorAll('#tabelaProjetosCorpo tr.hover-highlight-duplicate').forEach(el => {
          el.classList.remove('hover-highlight-duplicate');
        });
      }
    });
  }
});

// --- Inicialização: resolve admin e projetista-alvo, depois carrega ---
async function iniciarPagamentos() {
  try {
    const [profile, user] = await Promise.all([sbGetProfile().catch(() => null), sbGetUser().catch(() => null)]);
    meuUserId = user?.id || null;
    targetUserId = meuUserId;
    isAdminUser = profile?.role === 'admin';
    targetUserName = profile?.name || '';
    if (isAdminUser) {
      await montarSeletorProjetista();
    }
    
    // Configurar campos de preço como readonly para usuários normais
    const idsValores = ['val_ate2', 'val_3a4', 'val_mais5', 'val_360', 'val_360_3mod', 'val_conceito', 'val_alt_grandes'];
    idsValores.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (!isAdminUser) {
          el.readOnly = true;
          el.style.background = '#f1f5f9';
          el.style.cursor = 'not-allowed';
        } else {
          el.readOnly = false;
          el.style.background = '';
          el.style.cursor = '';
        }
      }
    });
  } catch (e) {
    console.warn('Falha ao preparar admin de pagamentos:', e);
  }
  carregarDados();
}

// Monta o seletor de projetistas (somente admin) e define o alvo inicial
async function montarSeletorProjetista() {
  const wrap = document.getElementById('adminProjetistaWrap');
  const sel = document.getElementById('adminProjetistaSelect');
  if (!wrap || !sel) return;
  let lista = [];
  try { lista = await sbListarUsuarios(); } catch (e) { return; }
  if (!lista || !lista.length) return;

  // Admins não são projetistas — não entram na lista
  usuariosPagamentos = lista.filter(u => u.role !== 'admin');
  // Abre no modo "Todos" (visão geral do mês de todos os projetistas)
  targetUserId = 'ALL';
  targetUserName = 'Todos os projetistas';

  const opts = ['<option value="ALL" selected>Todos os projetistas</option>'].concat(
    usuariosPagamentos.map(u =>
      `<option value="${esc(u.id)}">${esc(u.name || u.email)}</option>`
    )
  );
  sel.innerHTML = opts.join('');
  wrap.style.display = 'flex';
}

// Admin troca o projetista exibido: recarrega os pagamentos do alvo
function trocarProjetista(userId) {
  if (!userId || userId === targetUserId) return;
  targetUserId = userId;
  const u = usuariosPagamentos.find(x => x.id === userId);
  targetUserName = u?.name || '';
  pagId = null;        // novo alvo: zera o registro atual
  rowsData = [];
  resetarFiltrosVista(); // mostra todos os projetos do mês do projetista escolhido
  mostrarSkeletonTabela();
  carregarDados();
}

// Volta os filtros para "todos" e limpa datas, garantindo ver todos os projetos do mês
function resetarFiltrosVista() {
  filtroAtivo = 'todos';
  filtroLojaAtivo = 'todos';
  filtroTipoAtivo = 'todos';
  queryPesquisa = '';
  const dIni = document.getElementById('filtroDataInicio');
  const dFim = document.getElementById('filtroDataFim');
  if (dIni) dIni.value = '';
  if (dFim) dFim.value = '';
  document.querySelectorAll('.btn-filter.active').forEach(b => b.classList.remove('active'));
  ['btnFiltroTodos', 'btnFiltroLojaTodos', 'btnFiltroTipoTodos'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.add('active');
  });
}

// --- Carregar e Salvar no Supabase ---
async function carregarDados() {
  try {
    const user = await sbGetUser();
    if (!user) return;

    // Carregar preços globais primeiro
    let globalPrecos = null;
    try {
      globalPrecos = await sbGetPrecosProjeto();
    } catch (e) {
      console.warn('Erro ao carregar preços globais:', e);
    }

    // Modo "Todos": carrega e mescla os pagamentos de todos os projetistas
    if (targetUserId === 'ALL') {
      await carregarTodosProjetistas();
    } else {
      const alvoId = targetUserId || user.id;
      const ehProprio = alvoId === user.id;
      const inpNome0 = document.getElementById('projetistaNome');
      if (inpNome0) inpNome0.readOnly = false;

      // Nome completo do projetista-alvo
      let nomeCompleto = '';
      if (ehProprio) {
        const cachedName = localStorage.getItem('igui_user_name');
        nomeCompleto = cachedName ? cachedName.toUpperCase() : '';
        if (!nomeCompleto) nomeCompleto = user.email.split('@')[0].toUpperCase();
      } else {
        nomeCompleto = (targetUserName || '').toUpperCase();
      }

      const { data: list, error } = await sb.from('payments').select('*').eq('user_id', alvoId);
      if (error) throw error;
      
      if (list && list.length > 0) {
        const data = list[0];
        pagId = data.id;
        rowsData = Array.isArray(data.rows_data) ? data.rows_data : [];
        
        const meses = [
          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        const hoje = new Date();
        const mesAtual = meses[hoje.getMonth()];
        const anoAtual = hoje.getFullYear().toString();

        const h = data.header_data || {};
        let projetistaVal = h.projetista;
        if (projetistaVal && !projetistaVal.trim().includes(' ')) {
          projetistaVal = nomeCompleto;
        }
        document.getElementById('projetistaNome').value = projetistaVal || nomeCompleto;
        document.getElementById('pagamentoMes').value = mesAtual;
        document.getElementById('pagamentoAno').value = anoAtual;
        
        const v = globalPrecos || data.values_data || {};
        document.getElementById('val_ate2').value = v.val_ate2 ?? 70;
        document.getElementById('val_3a4').value = v.val_3a4 ?? 80;
        document.getElementById('val_mais5').value = v.val_mais5 ?? 95;
        document.getElementById('val_360').value = v.val_360 ?? 90;
        document.getElementById('val_360_3mod').value = v.val_360_3mod ?? 105;
        document.getElementById('val_conceito').value = v.val_conceito ?? 150;
        document.getElementById('val_alt_grandes').value = v.val_alt_grandes ?? 60;
        
        // Salva cabecalho com o novo mes/ano atualizado automaticamente
        salvarCabecalho();
      } else {
        const meses = [
          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        const hoje = new Date();
        const mesAtual = meses[hoje.getMonth()];
        const anoAtual = hoje.getFullYear().toString();

        rowsData = obterValoresIniciais();
        document.getElementById('projetistaNome').value = nomeCompleto;
        document.getElementById('pagamentoMes').value = mesAtual;
        document.getElementById('pagamentoAno').value = anoAtual;
        
        const v = globalPrecos || {};
        document.getElementById('val_ate2').value = v.val_ate2 ?? 70;
        document.getElementById('val_3a4').value = v.val_3a4 ?? 80;
        document.getElementById('val_mais5').value = v.val_mais5 ?? 95;
        document.getElementById('val_360').value = v.val_360 ?? 90;
        document.getElementById('val_360_3mod').value = v.val_360_3mod ?? 105;
        document.getElementById('val_conceito').value = v.val_conceito ?? 150;
        document.getElementById('val_alt_grandes').value = v.val_alt_grandes ?? 60;

        await salvarTudoSupabase();
      }
    }
  } catch (e) {
    console.error('Erro ao carregar dados do Supabase:', e);
    if (targetUserId && meuUserId && targetUserId !== meuUserId) {
      rowsData = []; // editando outro projetista: não usar o cache local do próprio admin
    } else {
      const raw = localStorage.getItem(STORAGE_KEY);
      rowsData = raw ? JSON.parse(raw) : obterValoresIniciais();
    }
  }
  atualizarSelectsFiltro();
  animarTabela = true; // primeira carga entra com animação em cascata
  renderTabela();
  recalcularFinanceiro();
  saveStatusAtivo = true; // a partir daqui, edições reais mostram o selinho
}

// Carrega e mescla os pagamentos de TODOS os projetistas (modo "Todos")
async function carregarTodosProjetistas() {
  pagIdPorUser = {};
  const { data: list, error } = await sb.from('payments').select('*').order('updated_at', { ascending: false });
  if (error) throw error;

  // Agrupa registros por usuário (o mais recente é o registro primário)
  const porUser = {};
  (list || []).forEach(rec => {
    if (!porUser[rec.user_id]) porUser[rec.user_id] = { rows: [], pagId: rec.id };
    if (Array.isArray(rec.rows_data)) {
      porUser[rec.user_id].rows = porUser[rec.user_id].rows.concat(rec.rows_data);
    }
  });

  // Admins não são projetistas — não entram na visão "Todos"
  const idsProjetistas = new Set(usuariosPagamentos.map(u => u.id));
  const filtrarProjetistas = idsProjetistas.size > 0;

  const todas = [];
  Object.keys(porUser).forEach(uid => {
    if (filtrarProjetistas && !idsProjetistas.has(uid)) return;
    pagIdPorUser[uid] = porUser[uid].pagId;
    const nome = (usuariosPagamentos.find(u => u.id === uid)?.name) || '';
    const seen = new Set();
    porUser[uid].rows.forEach(r => {
      if (r.raw) {
        const key = r.raw.toString().trim();
        if (seen.has(key)) return;
        seen.add(key);
      }
      todas.push({ ...r, _uid: uid, _projNome: nome });
    });
  });
  rowsData = todas;

  // Cabeçalho em modo Todos (nome não editável; valores não se aplicam aqui)
  const inp = document.getElementById('projetistaNome');
  if (inp) { inp.value = 'TODOS OS PROJETISTAS'; inp.readOnly = true; }
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const hoje = new Date();
  const mEl = document.getElementById('pagamentoMes'); if (mEl) mEl.value = meses[hoje.getMonth()];
  const aEl = document.getElementById('pagamentoAno'); if (aEl) aEl.value = hoje.getFullYear().toString();
}

function obterValoresIniciais() {
  return [];
}

// ── Selinho de salvamento + debounce ──────────────────────────────
let salvarDebounceTimer = null;
let savePillHideTimer = null;
let saveStatusAtivo = false; // só mostra o selinho após a carga inicial (edições reais)

function setSaveStatus(estado) {
  const pill = document.getElementById('savePill');
  if (!pill) return;
  const txt = pill.querySelector('.save-txt');
  clearTimeout(savePillHideTimer);
  pill.classList.remove('saved', 'err');
  if (estado === 'saving') {
    txt.textContent = 'Salvando…';
    pill.classList.add('show');
  } else if (estado === 'saved') {
    txt.textContent = 'Salvo ✓';
    pill.classList.add('show', 'saved');
    savePillHideTimer = setTimeout(() => pill.classList.remove('show'), 1800);
  } else if (estado === 'error') {
    txt.textContent = 'Erro ao salvar';
    pill.classList.add('show', 'err');
    savePillHideTimer = setTimeout(() => pill.classList.remove('show'), 4000);
  } else {
    pill.classList.remove('show');
  }
}

// Debounce: aguarda 800ms após a última edição antes de enviar ao Supabase.
// (localStorage continua sendo salvo na hora, em atualizarCampo)
function salvarTudoSupabase() {
  const mostrarStatus = saveStatusAtivo;
  if (mostrarStatus) setSaveStatus('saving');
  clearTimeout(salvarDebounceTimer);
  return new Promise(resolve => {
    salvarDebounceTimer = setTimeout(async () => {
      salvarDebounceTimer = null;
      await salvarSupabaseAgora(mostrarStatus);
      resolve();
    }, 800);
  });
}

// Se fechar/trocar de aba com salvamento pendente, dispara na hora (melhor esforço)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && salvarDebounceTimer) {
    clearTimeout(salvarDebounceTimer);
    salvarDebounceTimer = null;
    salvarSupabaseAgora();
  }
});

async function salvarSupabaseAgora(mostrarStatus = true) {
  try {
    const user = await sbGetUser();
    if (!user) return;

    // Modo "Todos": grava as linhas no registro de cada projetista (sem mexer em valores/cabeçalho)
    if (targetUserId === 'ALL') {
      const grupos = {};
      rowsData.forEach(r => {
        const uid = r._uid;
        if (!uid) return;
        const limpo = { ...r };
        delete limpo._uid;
        delete limpo._projNome;
        (grupos[uid] = grupos[uid] || []).push(limpo);
      });
      let anyErr = null;
      // Atualiza cada registro já conhecido (inclusive esvaziando quem ficou sem linhas)
      for (const uid of Object.keys(pagIdPorUser)) {
        const { error } = await sb.from('payments').update({ rows_data: grupos[uid] || [] }).eq('id', pagIdPorUser[uid]);
        if (error) anyErr = error;
      }
      // Projetistas sem registro ainda (ex.: recebeu o 1º projeto via "Todos")
      for (const uid of Object.keys(grupos)) {
        if (pagIdPorUser[uid]) continue;
        const nome = (usuariosPagamentos.find(u => u.id === uid)?.name) || '';
        const { data, error } = await sb.from('payments')
          .insert({ user_id: uid, rows_data: grupos[uid], header_data: { projetista: nome, mes: '', ano: '' }, values_data: {} })
          .select().single();
        if (error) anyErr = error; else if (data) pagIdPorUser[uid] = data.id;
      }
      if (anyErr) throw anyErr;
      if (mostrarStatus) setSaveStatus('saved');
      return;
    }

    const alvoId = targetUserId || user.id;

    const header = {
      projetista: document.getElementById('projetistaNome').value,
      mes: document.getElementById('pagamentoMes').value,
      ano: document.getElementById('pagamentoAno').value
    };
    
    const values = {
      val_ate2: parseFloat(document.getElementById('val_ate2').value) || 70,
      val_3a4: parseFloat(document.getElementById('val_3a4').value) || 80,
      val_mais5: parseFloat(document.getElementById('val_mais5').value) || 95,
      val_360: parseFloat(document.getElementById('val_360').value) || 90,
      val_360_3mod: parseFloat(document.getElementById('val_360_3mod').value) || 105,
      val_conceito: parseFloat(document.getElementById('val_conceito').value) || 150,
      val_alt_grandes: parseFloat(document.getElementById('val_alt_grandes').value) || 60
    };
    
    const payload = {
      user_id: alvoId,
      rows_data: rowsData,
      header_data: header,
      values_data: values
    };

    let res;
    if (pagId) {
      res = await sb.from('payments').update(payload).eq('id', pagId);
    } else {
      res = await sb.from('payments').insert(payload).select().single();
      if (res.data) pagId = res.data.id;
    }

    if (res.error) throw res.error;
    // Só espelha no cache local quando são os próprios pagamentos (não polui ao editar de outro)
    if (alvoId === user.id) localStorage.setItem(STORAGE_KEY, JSON.stringify(rowsData));
    if (mostrarStatus) setSaveStatus('saved');
  } catch (e) {
    console.error('Erro ao salvar no Supabase:', e);
    if (mostrarStatus) setSaveStatus('error');
  }
}

function salvarDados() {
  salvarTudoSupabase();
  atualizarSelectsFiltro();
}

function salvarCabecalho(animar = false) {
  if (animar) animarTabela = true;
  salvarTudoSupabase();
  atualizarSelectsFiltro();
  renderTabela();
  recalcularFinanceiro();
}

// Flag: próxima renderização da tabela entra com animação em cascata
let animarTabela = false;

function salvarValoresConfig() {
  salvarTudoSupabase();
}

// --- Renderizar Tabela ---
function renderTabela() {
  const animar = animarTabela;
  animarTabela = false;
  let visIdx = 0;
  const tbody = document.getElementById('tabelaProjetosCorpo');
  tbody.innerHTML = '';
  
  const query = queryPesquisa.trim().toLowerCase();
  
  // Contadores para os status dinâmicos
  let visibleTotal = 0;
  let visibleConferidos = 0;

  // Filtro de período por inputs De e Até
  const dataInicioStr = document.getElementById('filtroDataInicio')?.value.trim() || "";
  const dataFimStr = document.getElementById('filtroDataFim')?.value.trim() || "";
  const anoSelecionado = parseInt(document.getElementById('pagamentoAno')?.value) || 2026;
  const mesSelecionado = document.getElementById('pagamentoMes')?.value || 'Maio';

  // Calcular contadores de status para o mês selecionado
  let countTodos = 0;
  let countConferidos = 0;
  let countPendentes = 0;
  let countAlterados = 0;
  let countDuplicados = 0;

  // Primeiro contamos as ocorrências de IDs no mês para identificar duplicados
  const idCounts = {};
  rowsData.forEach(row => {
    if (!rowPertenceAoMesAno(row, mesSelecionado, anoSelecionado.toString())) return;
    const id = nProjeto(row.raw);
    if (id && /^\d+$/.test(id)) {
      idCounts[id] = (idCounts[id] || 0) + 1;
    }
  });

  rowsData.forEach(row => {
    if (!rowPertenceAoMesAno(row, mesSelecionado, anoSelecionado.toString())) return;

    // Filtros por pesquisa
    const numProj = nProjeto(row.raw);
    const piscinaModel = piscina(row.raw);
    const lojaFranquia = loja(row.raw);
    
    let matchesQuery = true;
    if (query) {
      matchesQuery = numProj.toLowerCase().includes(query) || 
                     piscinaModel.toLowerCase().includes(query) || 
                     lojaFranquia.toLowerCase().includes(query) || 
                     (row.raw || '').toLowerCase().includes(query) ||
                     (row.obs || '').toLowerCase().includes(query);
    }
    
    // Filtros por período
    let matchesPeriodo = true;
    const dtInicioObj = obterObjetoData(dataInicioStr, anoSelecionado);
    const dtFimObj = obterObjetoData(dataFimStr, anoSelecionado);
    if (dtInicioObj || dtFimObj) {
      const rowDtStr = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
      const rowDtObj = obterObjetoData(rowDtStr, anoSelecionado);
      if (rowDtObj) {
        if (dtInicioObj && rowDtObj < dtInicioObj) matchesPeriodo = false;
        if (dtFimObj && rowDtObj > dtFimObj) matchesPeriodo = false;
      } else {
        matchesPeriodo = false;
      }
    }

    // Filtros por Loja
    let matchesLoja = true;
    if (filtroLojaAtivo !== 'todos') {
      if (filtroLojaAtivo === 'Splash') {
        matchesLoja = numProj === 'Splash';
      } else if (filtroLojaAtivo === 'Inter.') {
        matchesLoja = numProj === 'Inter.';
      } else if (filtroLojaAtivo === 'iGUi') {
        matchesLoja = /^\d+$/.test(numProj);
      }
    }

    // Filtros por tipo
    let matchesTipo = true;
    if (filtroTipoAtivo !== 'todos') {
      if (filtroTipoAtivo === 'Projeto 360º') {
        matchesTipo = row.tipo === 'Projeto 360º' || row.tipo === 'Projeto 360º (3 Modificações)';
      } else {
        matchesTipo = row.tipo === filtroTipoAtivo;
      }
    }

    if (matchesQuery && matchesPeriodo && matchesLoja && matchesTipo) {
      countTodos++;
      if (row.conf) countConferidos++;
      else countPendentes++;
      if (row.alt) countAlterados++;
      const id = nProjeto(row.raw);
      if (id && /^\d+$/.test(id) && idCounts[id] > 1) {
        countDuplicados++;
      }
    }
  });

  // Atualizar botões de filtro de status com os contadores dinâmicos
  const btnTodos = document.getElementById('btnFiltroTodos');
  const btnConferidos = document.getElementById('btnFiltroConferidos');
  const btnPendentes = document.getElementById('btnFiltroPendentes');
  const btnAlterados = document.getElementById('btnFiltroAlterados');
  const btnDuplicados = document.getElementById('btnFiltroDuplicados');

  if (btnTodos) btnTodos.innerText = `Todos (${countTodos})`;
  if (btnConferidos) btnConferidos.innerText = `Conferidos (${countConferidos})`;
  if (btnPendentes) btnPendentes.innerText = `Pendentes (${countPendentes})`;
  if (btnAlterados) btnAlterados.innerText = `Alterações (${countAlterados})`;
  if (btnDuplicados) {
    btnDuplicados.innerText = `Duplicados (${countDuplicados})`;
    if (countDuplicados > 0) {
      btnDuplicados.classList.add('has-duplicates');
    } else {
      btnDuplicados.classList.remove('has-duplicates');
    }
  }

  const visibleNumSpans = []; // trs visíveis em ordem de exibição, para numerar depois
  const rowsReversed = rowsData.map((row, i) => ({ row, index: i })).reverse();
  rowsReversed.forEach(({ row, index }) => {
    // Apenas renderizar linhas pertencentes ao mês ativo (separado por data de recebimento)
    if (!rowPertenceAoMesAno(row, mesSelecionado, anoSelecionado.toString())) {
      return;
    }

    const tr = document.createElement('tr');
    const numProj = nProjeto(row.raw);

    if (numProj && /^\d+$/.test(numProj)) {
      tr.setAttribute('data-proj-id', numProj);
      if (idCounts[numProj] > 1) {
        tr.classList.add('is-duplicate-row');
      }
    }
    
    // Se estiver conferido, adiciona classe de destaque
    if (row.conf) {
      tr.className = row.conf ? 'row-conferido' : '';
    }
    
    // Processamento do identificador/nome do arquivo
    const piscinaModel = piscina(row.raw);
    const lojaFranquia = loja(row.raw);
    const dtEnvio = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
    const estiloTipo = obterEstiloTipo(row.tipo);
    
    // Filtros por pesquisa e status
    let matchesQuery = true;
    if (query) {
      matchesQuery = numProj.toLowerCase().includes(query) || 
                     piscinaModel.toLowerCase().includes(query) || 
                     lojaFranquia.toLowerCase().includes(query) || 
                     (row.raw || '').toLowerCase().includes(query) ||
                     (row.obs || '').toLowerCase().includes(query);
    }
    
    let matchesFilter = true;
    if (filtroAtivo === 'conferidos') {
      matchesFilter = !!row.conf;
    } else if (filtroAtivo === 'pendentes') {
      matchesFilter = !row.conf;
    } else if (filtroAtivo === 'alterados') {
      matchesFilter = !!row.alt;
    } else if (filtroAtivo === 'duplicados') {
      const id = nProjeto(row.raw);
      matchesFilter = id && /^\d+$/.test(id) && idCounts[id] > 1;
    }

    let matchesPeriodo = true;
    const dtInicioObj = obterObjetoData(dataInicioStr, anoSelecionado);
    const dtFimObj = obterObjetoData(dataFimStr, anoSelecionado);
    if (dtInicioObj || dtFimObj) {
      const rowDtStr = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
      const rowDtObj = obterObjetoData(rowDtStr, anoSelecionado);
      if (rowDtObj) {
        if (dtInicioObj && rowDtObj < dtInicioObj) matchesPeriodo = false;
        if (dtFimObj && rowDtObj > dtFimObj) matchesPeriodo = false;
      } else {
        matchesPeriodo = false;
      }
    }
    
    let matchesLoja = true;
    if (filtroLojaAtivo !== 'todos') {
      if (filtroLojaAtivo === 'Splash') {
        matchesLoja = numProj === 'Splash';
      } else if (filtroLojaAtivo === 'Inter.') {
        matchesLoja = numProj === 'Inter.';
      } else if (filtroLojaAtivo === 'iGUi') {
        matchesLoja = /^\d+$/.test(numProj);
      }
    }
    
    let matchesTipo = true;
    if (filtroTipoAtivo !== 'todos') {
      if (filtroTipoAtivo === 'Projeto 360º') {
        matchesTipo = row.tipo === 'Projeto 360º' || row.tipo === 'Projeto 360º (3 Modificações)';
      } else {
        matchesTipo = row.tipo === filtroTipoAtivo;
      }
    }
    
    if (matchesQuery && matchesFilter && matchesPeriodo && matchesLoja && matchesTipo) {
      visibleTotal++;
      if (row.conf) visibleConferidos++;
      visibleNumSpans.push(tr);
      tr.style.display = '';
      if (animar) {
        tr.classList.add('row-entrada');
        tr.style.animationDelay = `${Math.min(visIdx * 70, 1000)}ms`;
        visIdx++;
      }
    } else {
      tr.style.display = 'none';
    }
    
    const detailsHtml = row.raw ? `
      <div class="extracted-info" style="margin-top: 2px; padding: 2px 6px;">
        <div>Piscina: ${badgesPiscina(row.raw)}</div>
        <div style="margin-top: 2px; display:flex; align-items:center; justify-content:space-between;">
          <span>Loja: <span class="badge-loja">${esc(lojaFranquia)}</span></span>
          ${row.auto ? '<span style="display:inline-flex;align-items:center;gap:2px;font-size:9px;color:#94a3b8;">&#9889;<span style="font-weight:500;letter-spacing:.2px;">Automático</span></span>' : ''}
        </div>
      </div>
    ` : '';

    // Configuração de cores pastel dinâmicas para o identificador do projeto
    let badgeBg = '#e2eaf3';
    let badgeColor = '#7f8c9a';
    if (numProj === 'Splash') {
      badgeBg = '#fce7f3';
      badgeColor = '#be185d';
    } else if (numProj === 'Inter.') {
      badgeBg = '#dcfce7';
      badgeColor = '#15803d';
    } else if (/^\d+$/.test(numProj)) {
      badgeBg = '#e0f2fe';
      badgeColor = '#0369a1';
    }

    let warningHtml = '';
    if (row.veio_anterior || recebidoDeMesAnterior(row, anoSelecionado)) {
      warningHtml = `<div class="row-aviso anterior" title="Recebido neste mês e enviado no mês anterior">↩ mês anterior</div>`;
    } else if (obterDiferencaMeses(row, anoSelecionado)) {
      warningHtml = `<div class="row-aviso seguinte" title="Projeto recebido neste mês e enviado no mês seguinte">→ mês seguinte</div>`;
    }

    tr.innerHTML = `
      <td style="text-align: center; vertical-align: middle; cursor: pointer;" onclick="toggleRowCheckboxFromCell(event, ${index})">
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;">
          <span class="row-num" style="font-weight: bold; color: var(--muted); font-size: 13px; user-select: none;">0</span>
          <input type="checkbox" id="check-${index}" ${row.conf ? 'checked' : ''} onchange="atualizarCampo(${index}, 'conf', this.checked); toggleRowHighlight(this, ${index})" style="vertical-align: middle;" onclick="event.stopPropagation()">
        </div>
        ${warningHtml}
      </td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" onclick="definirDataHoje(${index})" title="Usar data de hoje" style="background: none; border: none; padding: 2px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#e2eaf3'" onmouseout="this.style.background='none'">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M3 13h10M8 2v8M4 7l4 4 4-4"/></svg>
            </button>
            <input type="text" id="input-data-${index}" value="${esc(row.data || '')}" placeholder="dd/mm" style="width: 55px; padding: 3px 6px; font-size: 11px;" oninput="atualizarCampo(${index}, 'data', this.value)">
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="padding: 2px; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; box-sizing: border-box; flex-shrink: 0;">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" title="Data de Envio" style="flex-shrink:0;"><path d="M3 3h10M8 14V6M4 9l4-4 4 4"/></svg>
            </div>
            <input type="text" value="${esc(dtEnvio || '')}" placeholder="dd/mm" style="width: 55px; padding: 3px 6px; font-size: 11px;" oninput="atualizarCampo(${index}, 'data_envio', this.value)">
          </div>
        </div>
      </td>
      <td>
        <select onchange="atualizarCampo(${index}, 'tipo', this.value); reprocessarLinha(${index})" style="width: 100%; padding: 4px 8px; font-size: 12px; background-color: ${estiloTipo.bg}; color: ${estiloTipo.color}; border-color: ${estiloTipo.border}; font-weight: 600; border-radius: 6px; outline: none; transition: all 0.15s;">
          <option value="" ${!row.tipo ? 'selected' : ''}>-- Selecione --</option>
          <option value="Até 02 Projetos" ${row.tipo === 'Até 02 Projetos' ? 'selected' : ''}>Até 02 Projetos</option>
          <option value="03 a 4 Projetos" ${row.tipo === '03 a 4 Projetos' ? 'selected' : ''}>03 a 4 Projetos</option>
          <option value="Mais que 05 Projetos" ${row.tipo === 'Mais que 05 Projetos' ? 'selected' : ''}>Mais que 05 Projetos</option>
          <option value="Projeto 360º" ${row.tipo === 'Projeto 360º' ? 'selected' : ''}>Projeto 360º</option>
          <option value="Projeto 360º (3 Modificações)" ${row.tipo === 'Projeto 360º (3 Modificações)' ? 'selected' : ''}>Projeto 360º (3 Modificações)</option>
          <option value="Conceito" ${row.tipo === 'Conceito' ? 'selected' : ''}>Conceito</option>
          <option value="Alterações GRANDES" ${row.tipo === 'Alterações GRANDES' ? 'selected' : ''}>Alteração Grande</option>
        </select>
        <div style="margin-top: 4px; display: flex; align-items: center;">
          <label style="font-size: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; background: #fff8e1; color: #b7791f; padding: 1px 6px; border-radius: 3px; border: 1px solid #f5d87a; margin: 0; user-select: none;">
            <input type="checkbox" ${row.alt ? 'checked' : ''} onchange="atualizarCampo(${index}, 'alt', this.checked)" style="width: 12px; height: 12px; margin: 0; cursor: pointer;">
            Grande Alteração
          </label>
        </div>
      </td>
      <td>
        ${row._projNome ? `<div style="font-size:11px; font-weight:800; color:#0369a1; margin-bottom:3px; display:flex; align-items:center; gap:4px;">👤 ${esc(row._projNome)}</div>` : ''}
        <div style="position: relative; width: 100%;">
          <span class="badge-identificador" style="color: ${badgeColor}; background: ${badgeBg};">${numProj || '—'}</span>
          <input type="text" class="raw-string-input" value="${esc(row.raw || '')}" placeholder="Cole o nome do arquivo aqui..." oninput="atualizarCampo(${index}, 'raw', this.value); reprocessarLinha(${index})" style="padding-left: ${numProj ? Math.max(35, 22 + numProj.toString().length * 7.2) : 30}px; font-size: 12px !important; height: 28px;">
        </div>
        ${detailsHtml}
      </td>
      <td style="height: 1px; padding: 4px 6px;">
        <textarea placeholder="Observação..." oninput="atualizarCampo(${index}, 'obs', this.value)" style="width: 100%; height: 100%; min-height: 38px; font-size: 12px; resize: none; box-sizing: border-box; padding: 4px 6px; border: 1.5px solid var(--border); border-radius: 4px; line-height: 1.3; display: block;">${esc(row.obs || '')}</textarea>
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
          ${obterDiferencaMeses(row, anoSelecionado) ? `
            <button class="btn-mini info" onclick="enviarParaOutroMes(${index})" title="Deseja enviar para o outro mês?">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;">
                <polyline points="15 14 20 9 15 4"></polyline>
                <path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>
              </svg>
            </button>
          ` : ''}
          <button class="btn-mini info" onclick="editarLinha(${index})" title="Editar projeto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
            </svg>
          </button>
          <button class="btn-mini danger" onclick="removerLinha(${index})" title="Excluir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </td>
    `;
    if (row._edit) tr.classList.add('tem-editado');
    tbody.appendChild(tr);

    // Faixa de "editado" ocupando a linha inteira do projeto (admin),
    // grudada na linha do projeto acima
    if (row._edit) {
      const trEd = document.createElement('tr');
      trEd.className = 'row-editado-tr';
      trEd.style.display = tr.style.display;
      trEd.innerHTML = `<td colspan="6" style="padding:0;">${renderEditadoLine(row._edit, index)}</td>`;
      tbody.appendChild(trEd);
    }
  });

  // Mostra aviso de tabela vazia caso nenhum projeto esteja visível
  if (visibleTotal === 0) {
    const trEmpty = document.createElement('tr');
    trEmpty.innerHTML = `
      <td colspan="6" style="text-align: center; padding: 32px; color: var(--muted); font-size: 13px; background: #fff;">
        <span style="font-size: 22px; display: block; margin-bottom: 8px;">📂</span>
        Nenhum projeto adicionado ou correspondente aos filtros/período selecionados.
      </td>
    `;
    tbody.appendChild(trEmpty);
  }

  // Numera as linhas visíveis: #N no topo (mais novo), #1 embaixo (mais antigo)
  const totalVis = visibleNumSpans.length;
  visibleNumSpans.forEach((trVis, i) => {
    const s = trVis.querySelector('.row-num');
    if (s) s.textContent = totalVis - i;
  });

  // Atualiza os painéis de resumo rápido com base nos registros visíveis após os filtros
  const statTotalGeral = document.getElementById('statTotalGeral');
  const statConferidos = document.getElementById('statConferidos');
  const statPendentes = document.getElementById('statPendentes');
  if (statTotalGeral) statTotalGeral.textContent = visibleTotal;
  if (statConferidos) statConferidos.textContent = visibleConferidos;
  if (statPendentes) statPendentes.textContent = visibleTotal - visibleConferidos;
}

function toggleRowHighlight(checkbox, index) {
  const tr = checkbox.closest('tr');
  if (tr) {
    if (checkbox.checked) {
      tr.classList.add('row-conferido');
    } else {
      tr.classList.remove('row-conferido');
    }
  }
}

function toggleRowCheckboxFromCell(event, index) {
  const checkbox = document.getElementById(`check-${index}`);
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    atualizarCampo(index, 'conf', checkbox.checked);
    toggleRowHighlight(checkbox, index);
  }
}

// --- Funções Interativas ---
function adicionarLinha() {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const hojeFormatado = `${dia}/${mes}`;
  rowsData.push({ data: hojeFormatado, tipo: '', alt: false, raw: '', conf: false, obs: '' });
  salvarDados();
  renderTabela();
}

function removerLinha(index) {
  confirmar('Excluir Projeto', 'Deseja excluir este projeto permanentemente?', () => {
    ultimoExcluido = {
      index: index,
      data: { ...rowsData[index] }
    };
    rowsData.splice(index, 1);
    salvarDados();
    recalcularFinanceiro();
    renderTabela();
    showToastHTML('🗑 Projeto excluído. <a href="javascript:void(0)" onclick="desfazerExclusao()" style="color: #60a5fa; font-weight: 700; text-decoration: underline; margin-left: 10px;">Desfazer</a>', 'ok');
  });
}

function enviarParaOutroMes(index) {
  const row = rowsData[index];
  const dtEnv = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
  if (!dtEnv) {
    showToast("Este projeto não possui data de envio para podermos transferir.", "err");
    return;
  }
  
  const envParsed = extrairMesAno(dtEnv, new Date().getFullYear());
  if (!envParsed) {
    showToast("A data de envio é inválida.", "err");
    return;
  }

  const novoMes = String(envParsed.mes).padStart(2, '0');
  const novaData = `01/${novoMes}`;

  confirmar(
    'Transferir Projeto',
    `Deseja enviar este projeto para o outro mês?\nIsso mudará a data de recebimento para: ${novaData}`,
    () => {
      rowsData[index].data = novaData;
      rowsData[index].veio_anterior = true;
      
      salvarDados();
      recalcularFinanceiro();
      renderTabela();
      
      showToast("✅ Projeto transferido para o dia 01 do mês seguinte!", "ok");
    }
  );
}

window.enviarParaOutroMes = enviarParaOutroMes;

function removerEditado(index, event) {
  if (event) event.stopPropagation();
  if (!isAdminUser) {
    showToast('❌ Apenas administradores podem apagar o histórico de edição.', 'err');
    return;
  }
  confirmar('Excluir histórico', 'Deseja apagar o histórico de edição deste projeto?', () => {
    if (rowsData[index]) {
      delete rowsData[index]._edit;
      salvarDados();
      renderTabela();
    }
  });
}

window.removerEditado = removerEditado;

function limparTabela() {
  confirmar('Limpar Tabela', 'Tem certeza que deseja apagar todos os projetos desta lista?', () => {
    rowsData = [];
    salvarDados();
    recalcularFinanceiro();
    renderTabela();
    showToast('🗑 Tabela limpa', 'ok');
  });
}

function confirmar(titulo, msg, cb) {
  const modal = document.getElementById('confirmModal');
  if (!modal) return;
  document.getElementById('confirmTitle').textContent = titulo;
  document.getElementById('confirmMsg').textContent   = msg;
  modal.style.display = 'flex';
  
  document.getElementById('btnConfirmCancelar').onclick = () => {
    modal.style.display = 'none';
  };
  
  document.getElementById('btnConfirmAcao').onclick = async () => {
    try {
      await cb();
    } catch(e) {
      showToast('Erro: ' + e.message, 'err');
    }
    modal.style.display = 'none';
  };
}

function atualizarCampo(index, campo, valor) {
  const antigo = rowsData[index][campo];
  rowsData[index][campo] = valor;

  // Admin trocou o Tipo do projeto pelo dropdown da tabela → registra na linha de "Editado"
  // (a troca pelo modal já é registrada em salvarProjetoManual). Mantém só a última edição.
  if (campo === 'tipo' && isAdminUser && String(antigo || '') !== String(valor || '')) {
    rowsData[index]._edit = {
      por: (localStorage.getItem('igui_user_name') || 'Admin').trim(),
      em: new Date().toISOString(),
      campos: [{ c: 'Tipo', de: antigo || '—', para: valor || '—' }]
    };
    // o onchange do dropdown chama reprocessarLinha() em seguida, que re-renderiza a tabela
  }

  // Apenas salvar, recalcular e atualizar sem re-renderizar a tabela inteira para não tirar o foco do input
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rowsData));
  recalcularFinanceiro();
  salvarDados();
}

function definirDataHoje(index) {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const formatado = `${dia}/${mes}`;
  
  rowsData[index].data = formatado;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rowsData));
  recalcularFinanceiro();
  
  const input = document.getElementById(`input-data-${index}`);
  if (input) {
    input.value = formatado;
  }
}

function reprocessarLinha(index) {
  // Reprocessa os cards e renderiza novamente a tabela
  renderTabela();
}

// --- Processar Lote (Bulk Import) ---
function processarLote() {
  const area = document.getElementById('bulkInput');
  const text = area.value.trim();
  if (!text) return;

  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const hojeFormatado = `${dia}/${mes}`;

  const linhas = text.split('\n');
  linhas.forEach(linha => {
    const raw = linha.trim();
    if (raw) {
      // Tenta inferir a data de envio
      const dt = dataEnvio(raw);
      rowsData.push({
        data: hojeFormatado,
        data_envio: dt || '',
        tipo: '',
        alt: false,
        raw: raw,
        conf: false,
        obs: ''
      });
    }
  });

  area.value = '';
  if (typeof atualizarFeedbackLote === 'function') atualizarFeedbackLote();
  salvarDados();
  renderTabela();
  showToast('✅ Lote processado com sucesso!', 'ok');
}

// --- Recalcular Financeiro e Gerar Resumos ---
function recalcularFinanceiro() {
  salvarValoresConfig();

  // Valores Unitários
  const val_ate2 = parseFloat(document.getElementById('val_ate2').value) || 0;
  const val_3a4 = parseFloat(document.getElementById('val_3a4').value) || 0;
  const val_mais5 = parseFloat(document.getElementById('val_mais5').value) || 0;
  const val_360 = parseFloat(document.getElementById('val_360').value) || 0;
  const val_360_3mod = parseFloat(document.getElementById('val_360_3mod').value) || 0;
  const val_conceito = parseFloat(document.getElementById('val_conceito').value) || 0;
  const val_alt_grandes = parseFloat(document.getElementById('val_alt_grandes').value) || 0;

  // Quantidades
  let qty_ate2 = 0;
  let qty_3a4 = 0;
  let qty_mais5 = 0;
  let qty_360 = 0;
  let qty_360_3mod = 0;
  let qty_conceito = 0;
  let qty_alt_grandes = 0;

  // Orçamentos
  let list_alt_grandes = [];
  let list_360 = [];
  let list_conceito = [];
  let list_3_piscinas = []; // Mapeando a "03 a 4 Projetos" ou "Mais que 05 Projetos"

  const mesNome = document.getElementById('pagamentoMes').value;
  const anoStr = document.getElementById('pagamentoAno').value;

  const dataInicioStr = document.getElementById('filtroDataInicio')?.value.trim() || "";
  const dataFimStr = document.getElementById('filtroDataFim')?.value.trim() || "";
  const anoSelecionado = parseInt(document.getElementById('pagamentoAno')?.value) || 2026;

  rowsData.forEach(row => {
    // Se filtramos por período, a linha deve pertencer ao período
    const dtInicioObj = obterObjetoData(dataInicioStr, anoSelecionado);
    const dtFimObj = obterObjetoData(dataFimStr, anoSelecionado);
    
    if (dtInicioObj || dtFimObj) {
      const rowDtStr = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
      const rowDtObj = obterObjetoData(rowDtStr, anoSelecionado);
      if (!rowDtObj) return;
      if (dtInicioObj && rowDtObj < dtInicioObj) return;
      if (dtFimObj && rowDtObj > dtFimObj) return;
    } else {
      // Only count project in totals if the send date belongs to the sheet's selected month/year
      if (!rowPertenceAoMesAno(row, mesNome, anoStr)) {
        return;
      }
    }

    const num = nProjeto(row.raw);
    // Quando for projeto Inter., exibe o nome da loja no lugar de "Inter."
    const label = num === 'Inter.' ? (loja(row.raw) || 'Inter.') : num;

    // Contabilidade de tipos
    if (row.tipo === 'Até 02 Projetos') qty_ate2++;
    else if (row.tipo === '03 a 4 Projetos') {
      qty_3a4++;
      if (label) list_3_piscinas.push(label);
    }
    else if (row.tipo === 'Mais que 05 Projetos') {
      qty_mais5++;
      if (label) list_3_piscinas.push(label);
    }
    else if (row.tipo === 'Projeto 360º') {
      qty_360++;
      if (label) list_360.push(label);
    }
    else if (row.tipo === 'Projeto 360º (3 Modificações)') {
      qty_360_3mod++;
      if (label) list_360.push(label);
    }
    else if (row.tipo === 'Conceito') {
      qty_conceito++;
      if (label) list_conceito.push(label);
    }
    // Contabilidade para Alterações GRANDES (seja pelo tipo ou pelo checkbox "Grande Alteração")
    let isAltGrande = (row.tipo === 'Alterações GRANDES');
    if (row.alt) {
      isAltGrande = true;
    }

    if (isAltGrande) {
      qty_alt_grandes++;
      if (label) list_alt_grandes.push(label);
    }
  });

  // Atualiza quantidades na tabela de resumo
  document.getElementById('qty_ate2').textContent = qty_ate2;
  document.getElementById('qty_3a4').textContent = qty_3a4;
  document.getElementById('qty_mais5').textContent = qty_mais5;
  document.getElementById('qty_360').textContent = qty_360;
  document.getElementById('qty_360_3mod').textContent = qty_360_3mod;
  document.getElementById('qty_conceito').textContent = qty_conceito;
  document.getElementById('qty_alt_grandes').textContent = qty_alt_grandes;

  // Calcula totais
  const tot_ate2 = qty_ate2 * val_ate2;
  const tot_3a4 = qty_3a4 * val_3a4;
  const tot_mais5 = qty_mais5 * val_mais5;
  const tot_360 = qty_360 * val_360;
  const tot_360_3mod = qty_360_3mod * val_360_3mod;
  const tot_conceito = qty_conceito * val_conceito;
  const tot_alt_grandes = qty_alt_grandes * val_alt_grandes;

  document.getElementById('tot_ate2').textContent = formatarMoeda(tot_ate2);
  document.getElementById('tot_3a4').textContent = formatarMoeda(tot_3a4);
  document.getElementById('tot_mais5').textContent = formatarMoeda(tot_mais5);
  document.getElementById('tot_360').textContent = formatarMoeda(tot_360);
  document.getElementById('tot_360_3mod').textContent = formatarMoeda(tot_360_3mod);
  document.getElementById('tot_conceito').textContent = formatarMoeda(tot_conceito);
  document.getElementById('tot_alt_grandes').textContent = formatarMoeda(tot_alt_grandes);

  // Total geral
  const qty_total = qty_ate2 + qty_3a4 + qty_mais5 + qty_360 + qty_360_3mod + qty_conceito + qty_alt_grandes;
  const tot_total = tot_ate2 + tot_3a4 + tot_mais5 + tot_360 + tot_360_3mod + tot_conceito + tot_alt_grandes;

  document.getElementById('qty_total').textContent = qty_total;
  document.getElementById('tot_total').textContent = formatarMoeda(tot_total);

  // Atualiza listas de orçamento no rodapé
  document.getElementById('orc_alt_grandes').textContent = list_alt_grandes.length ? list_alt_grandes.join(', ') : '#N/A';
  document.getElementById('orc_360').textContent = list_360.length ? list_360.join(', ') : '#N/A';
  document.getElementById('orc_conceito').textContent = list_conceito.length ? list_conceito.join(', ') : '#N/A';
  document.getElementById('orc_3_piscinas').textContent = list_3_piscinas.length ? list_3_piscinas.join(', ') : '#N/A';

  atualizarOpcoesPeriodo();
  atualizarGraficoEvolucao();
  atualizarGraficoTipos();
}

// --- Períodos com dados (meses/anos) ---
const MESES_NOMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function periodosDisponiveis() {
  const anosCandidatos = ['2024', '2025', '2026', '2027', '2028', '2029', '2030'];
  const hoje = new Date();
  const mesAtual = MESES_NOMES[hoje.getMonth()];
  const anoAtual = hoje.getFullYear().toString();
  const dispo = {};
  anosCandidatos.forEach(ano => {
    const ms = MESES_NOMES.filter(m =>
      (ano === anoAtual && m === mesAtual) || // mês corrente sempre disponível
      rowsData.some(r => rowPertenceAoMesAno(r, m, ano))
    );
    if (ms.length) dispo[ano] = ms;
  });
  if (!Object.keys(dispo).length) dispo[anoAtual] = [mesAtual];
  return dispo;
}

function atualizarOpcoesPeriodo() {
  const dispo = periodosDisponiveis();
  const anoSel = document.getElementById('pagamentoAno')?.value || new Date().getFullYear().toString();
  const mesSel = document.getElementById('pagamentoMes')?.value || MESES_NOMES[new Date().getMonth()];

  const anos = Object.keys(dispo);
  if (!anos.includes(anoSel)) anos.push(anoSel);
  anos.sort();

  let meses = (dispo[anoSel] || []).slice();
  if (!meses.includes(mesSel)) meses.push(mesSel);
  meses.sort((a, b) => MESES_NOMES.indexOf(a) - MESES_NOMES.indexOf(b));

  const setOptions = (selId, values, selected) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    // Evita reconstruir o select se nada mudou (não atrapalhar dropdown aberto)
    const atual = Array.from(sel.options).map(o => o.value).join('|');
    if (atual === values.join('|') && sel.value === selected) return;
    sel.innerHTML = values.map(v =>
      `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`
    ).join('');
  };
  setOptions('pagamentoAno', anos, anoSel);
  setOptions('filtroListaAno', anos, anoSel);
  setOptions('pagamentoMes', meses, mesSel);
  setOptions('filtroListaMes', meses, mesSel);
}

// --- Mini-gráfico: projetos do mês por tipo ---
const TIPOS_GRAFICO = [
  { tipo: 'Até 02 Projetos',               abrev: '≤2'  },
  { tipo: '03 a 4 Projetos',               abrev: '3-4' },
  { tipo: 'Mais que 05 Projetos',          abrev: '5+'  },
  { tipo: 'Projeto 360º',                  abrev: '360' },
  { tipo: 'Projeto 360º (3 Modificações)', abrev: '3M'  },
  { tipo: 'Conceito',                      abrev: 'Con' },
  { tipo: 'Alterações GRANDES',            abrev: 'Alt' },
];

function atualizarGraficoTipos() {
  const cont = document.getElementById('tipoChart');
  if (!cont) return;
  const mesSel = document.getElementById('pagamentoMes')?.value;
  const anoStr = document.getElementById('pagamentoAno')?.value || '2026';

  const lbl = document.getElementById('tipoMesLabel');
  if (lbl) lbl.textContent = `${mesSel}/${anoStr}`;

  const contagens = TIPOS_GRAFICO.map(({ tipo }) => {
    let n = 0;
    rowsData.forEach(row => {
      if (!rowPertenceAoMesAno(row, mesSel, anoStr)) return;
      if (tipo === 'Alterações GRANDES') {
        if (row.tipo === 'Alterações GRANDES' || row.alt) n++;
      } else if (row.tipo === tipo) {
        n++;
      }
    });
    return n;
  });
  const max = Math.max(...contagens, 1);

  cont.innerHTML = '';
  TIPOS_GRAFICO.forEach(({ tipo, abrev }, i) => {
    const estilo = obterEstiloTipo(tipo);
    const col = document.createElement('div');
    col.className = 'evo-col tipo-col';
    col.title = `${tipo}: ${contagens[i]}`;
    col.innerHTML = `
      <span class="tipo-qtd" style="color:${estilo.color}">${contagens[i] || ''}</span>
      <div class="evo-bar" style="height:${Math.max(3, Math.round((contagens[i] / max) * 38))}px; background:${contagens[i] ? estilo.color : '#eef2f6'}; max-width:22px;"></div>
      <span>${abrev}</span>`;
    cont.appendChild(col);
  });
}

// --- Mini-gráfico: evolução mensal ---
function calcularTotalDoMes(mesNome, anoStr) {
  const vals = {
    'Até 02 Projetos':               parseFloat(document.getElementById('val_ate2').value) || 0,
    '03 a 4 Projetos':               parseFloat(document.getElementById('val_3a4').value) || 0,
    'Mais que 05 Projetos':          parseFloat(document.getElementById('val_mais5').value) || 0,
    'Projeto 360º':                  parseFloat(document.getElementById('val_360').value) || 0,
    'Projeto 360º (3 Modificações)': parseFloat(document.getElementById('val_360_3mod').value) || 0,
    'Conceito':                      parseFloat(document.getElementById('val_conceito').value) || 0,
  };
  const valAlt = parseFloat(document.getElementById('val_alt_grandes').value) || 0;
  let total = 0;
  rowsData.forEach(row => {
    if (!rowPertenceAoMesAno(row, mesNome, anoStr)) return;
    if (vals[row.tipo] !== undefined) total += vals[row.tipo];
    if (row.tipo === 'Alterações GRANDES' || row.alt) total += valAlt;
  });
  return total;
}

function atualizarGraficoEvolucao() {
  const cont = document.getElementById('evoChart');
  if (!cont) return;
  const anoStr = document.getElementById('pagamentoAno')?.value || '2026';
  const mesSel = document.getElementById('pagamentoMes')?.value;

  // Só meses com dados (+ o mês selecionado/corrente)
  const dispo = periodosDisponiveis();
  let meses = (dispo[anoStr] || []).slice();
  if (mesSel && !meses.includes(mesSel)) meses.push(mesSel);
  meses.sort((a, b) => MESES_NOMES.indexOf(a) - MESES_NOMES.indexOf(b));

  const totais = meses.map(m => calcularTotalDoMes(m, anoStr));
  const max = Math.max(...totais, 1);

  const elAno = document.getElementById('evoAno');
  if (elAno) elAno.textContent = anoStr;

  cont.innerHTML = '';
  meses.forEach((m, i) => {
    const col = document.createElement('div');
    col.className = 'evo-col' + (m === mesSel ? ' active' : '');
    col.title = `${m}: ${formatarMoeda(totais[i])}`;
    col.onclick = () => { if (m !== mesSel) syncFiltrosLista(m, null); };
    col.innerHTML = `
      <div class="evo-bar" style="height:${Math.max(3, Math.round((totais[i] / max) * 46))}px"></div>
      <span>${m.slice(0, 3)}</span>`;
    cont.appendChild(col);
  });
}

function formatarMoeda(valor) {
  return 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let toastTimer;
function showToast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.textContent = msg; // texto puro: evita HTML injetado (ex.: mensagens de erro)
  t.className = `toast ${tipo} show`;
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}
// Variante para toasts com HTML confiável (ex.: link "Desfazer")
function showToastHTML(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.innerHTML = msg;
  t.className = `toast ${tipo} show`;
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

// --- Funções de Busca e Filtro ---
function definirPesquisa(val) {
  queryPesquisa = val;
  renderTabela();
}

function definirFiltro(tipo) {
  filtroAtivo = tipo;
  
  // Atualiza classes ativas dos botões de filtro de status
  document.querySelectorAll('#btnFiltroTodos, #btnFiltroConferidos, #btnFiltroPendentes, #btnFiltroAlterados, #btnFiltroDuplicados').forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  const activeBtn = document.getElementById(
    tipo === 'todos' ? 'btnFiltroTodos' :
    tipo === 'conferidos' ? 'btnFiltroConferidos' :
    tipo === 'pendentes' ? 'btnFiltroPendentes' :
    tipo === 'alterados' ? 'btnFiltroAlterados' : 'btnFiltroDuplicados'
  );
  if (activeBtn) activeBtn.classList.add('active');
  
  renderTabela();
}

function definirFiltroLoja(lojaVal) {
  filtroLojaAtivo = lojaVal;
  
  // Atualiza classes ativas de todos os botões de filtro de loja
  document.querySelectorAll('[id^="btnFiltroLoja"]').forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  let btnId = 'btnFiltroLojaTodos';
  if (lojaVal === 'Splash') btnId = 'btnFiltroLojaSplash';
  else if (lojaVal === 'Inter.') btnId = 'btnFiltroLojaInter';
  else if (lojaVal === 'iGUi') btnId = 'btnFiltroLojaIgui';
  
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) activeBtn.classList.add('active');
  
  renderTabela();
}

function definirFiltroTipo(tipo) {
  filtroTipoAtivo = tipo;
  
  // Atualiza classes ativas de todos os botões de filtro de tipo
  document.querySelectorAll('[id^="btnFiltroTipo"]').forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  
  let btnId = 'btnFiltroTipoTodos';
  if (tipo === 'Splash') btnId = 'btnFiltroTipoSplash';
  else if (tipo === 'Inter.') btnId = 'btnFiltroTipoInter';
  else if (tipo === 'Conceito') btnId = 'btnFiltroTipoConceito';
  else if (tipo === 'Numerico') btnId = 'btnFiltroTipoNumerico';
  else if (tipo === 'Até 02 Projetos') btnId = 'btnFiltroTipoAte2';
  else if (tipo === '03 a 4 Projetos') btnId = 'btnFiltroTipo3a4';
  else if (tipo === 'Mais que 05 Projetos') btnId = 'btnFiltroTipoMais5';
  else if (tipo === 'Projeto 360º') btnId = 'btnFiltroTipo360';
  else if (tipo === 'Alterações GRANDES') btnId = 'btnFiltroTipoAltGrandes';
  
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) activeBtn.classList.add('active');
  
  renderTabela();
}

function marcarVisiveisComoConferidos() {
  const query = queryPesquisa.trim().toLowerCase();
  const dataInicioStr = document.getElementById('filtroDataInicio')?.value.trim() || "";
  const dataFimStr = document.getElementById('filtroDataFim')?.value.trim() || "";
  const anoSelecionado = parseInt(document.getElementById('pagamentoAno')?.value) || 2026;

  let count = 0;
  rowsData.forEach(row => {
    const numProj = nProjeto(row.raw);
    const piscinaModel = piscina(row.raw);
    const lojaFranquia = loja(row.raw);
    
    // Filtros por pesquisa
    let matchesQuery = true;
    if (query) {
      matchesQuery = numProj.toLowerCase().includes(query) || 
                     piscinaModel.toLowerCase().includes(query) || 
                     lojaFranquia.toLowerCase().includes(query) || 
                     (row.raw || '').toLowerCase().includes(query) ||
                     (row.obs || '').toLowerCase().includes(query);
    }
    
    // Filtros por status
    let matchesFilter = true;
    if (filtroAtivo === 'conferidos') {
      matchesFilter = !!row.conf;
    } else if (filtroAtivo === 'pendentes') {
      matchesFilter = !row.conf;
    } else if (filtroAtivo === 'alterados') {
      matchesFilter = !!row.alt;
    }

    // Filtros por período
    let matchesPeriodo = true;
    const dtInicioObj = obterObjetoData(dataInicioStr, anoSelecionado);
    const dtFimObj = obterObjetoData(dataFimStr, anoSelecionado);
    if (dtInicioObj || dtFimObj) {
      const rowDtStr = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
      const rowDtObj = obterObjetoData(rowDtStr, anoSelecionado);
      if (rowDtObj) {
        if (dtInicioObj && rowDtObj < dtInicioObj) matchesPeriodo = false;
        if (dtFimObj && rowDtObj > dtFimObj) matchesPeriodo = false;
      } else {
        matchesPeriodo = false;
      }
    }

    // Filtros por Loja
    let matchesLoja = true;
    if (filtroLojaAtivo !== 'todos') {
      if (filtroLojaAtivo === 'Splash') {
        matchesLoja = numProj === 'Splash';
      } else if (filtroLojaAtivo === 'Inter.') {
        matchesLoja = numProj === 'Inter.';
      } else if (filtroLojaAtivo === 'iGUi') {
        matchesLoja = /^\d+$/.test(numProj);
      }
    }

    // Filtros por tipo
    let matchesTipo = true;
    if (filtroTipoAtivo !== 'todos') {
      if (filtroTipoAtivo === 'Projeto 360º') {
        matchesTipo = row.tipo === 'Projeto 360º' || row.tipo === 'Projeto 360º (3 Modificações)';
      } else {
        matchesTipo = row.tipo === filtroTipoAtivo;
      }
    }

    if (matchesQuery && matchesFilter && matchesPeriodo && matchesLoja && matchesTipo) {
      if (!row.conf) {
        row.conf = true;
        count++;
      }
    }
  });

  if (count > 0) {
    salvarDados();
    renderTabela();
    recalcularFinanceiro();
    showToast(`✅ ${count} projetos marcados como conferidos!`, "ok");
  } else {
    showToast("Nenhum projeto pendente para marcar neste filtro.", "err");
  }
}

function copiarTabelaExcel() {
  if (!rowsData.length) {
    showToast("A lista está vazia para copiar.", "err");
    return;
  }
  let cabecalho = "Nº\tData Inicial\tData Envio\tTipo Projeto\tID Projeto\tPiscina\tLoja\tConferido\tObservação\n";
  let rows = rowsData.map((row, index) => {
    const numProj = nProjeto(row.raw);
    const piscinaModel = piscinasArr(row.raw).join(', ');
    const lojaFranquia = loja(row.raw);
    const dtEnvio = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
    return `${index + 1}\t${row.data || ''}\t${dtEnvio || ''}\t${row.tipo || ''}\t${numProj || ''}\t${piscinaModel || ''}\t${lojaFranquia || ''}\t${row.conf ? 'Sim' : 'Não'}\t${row.obs || ''}`;
  }).join('\n');
  
  navigator.clipboard.writeText(cabecalho + rows).then(() => {
    showToast("📋 Dados copiados! Cole direto no Excel ou Google Sheets.", "ok");
  }).catch(err => {
    showToast("Erro ao copiar: " + err.message, "err");
  });
}

function rowPertenceAoMesAno(row, mesNome, anoStr) {
  const mesesMap = {
    "Janeiro": "01", "Fevereiro": "02", "Março": "03", "Abril": "04",
    "Maio": "05", "Junho": "06", "Julho": "07", "Agosto": "08",
    "Setembro": "09", "Outubro": "10", "Novembro": "11", "Dezembro": "12"
  };
  const mesNum = mesesMap[mesNome];
  if (!mesNum) return false;
  
  // Obtém a representação da data de recebimento (row.data)
  let dtRecebimento = "";
  if (row.data !== undefined && row.data !== null) {
    dtRecebimento = row.data.toString().trim();
  }
  
  if (!dtRecebimento) return false;
  
  let rowMes = "";
  let rowAno = "";
  
  // Tenta extrair mês e ano de dtRecebimento
  let match = dtRecebimento.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    rowMes = match[2].padStart(2, '0');
    rowAno = match[3];
  } else {
    match = dtRecebimento.match(/(\d{1,2})[-/](\d{1,2})/);
    if (match) {
      rowMes = match[2].padStart(2, '0');
    }
  }
  
  // Se não encontrou o ano em dtRecebimento, busca um ano de 4 dígitos no raw
  if (!rowAno && row.raw) {
    let yearMatch = row.raw.toString().match(/[-/](\d{4})/);
    if (yearMatch) {
      rowAno = yearMatch[1];
    }
  }
  
  // Se ainda assim não encontrou o ano, assume o ano selecionado
  if (!rowAno) {
    rowAno = anoStr;
  }
  
  const mesBate = rowMes === mesNum;
  const anoBate = rowAno === anoStr;
  
  return mesBate && anoBate;
}


async function exportarPDF() {
  const btn = document.querySelector('.btn-minimal[onclick="exportarPDF()"]');
  const originalText = btn ? btn.innerHTML : "";
  if (btn) btn.innerHTML = "⌛ Gerando PDF...";

  if (!window.html2pdf) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  const element = document.getElementById('painelDireitoResumo');
  const mes = document.getElementById('pagamentoMes').value;
  const ano = document.getElementById('pagamentoAno').value;
  const projetista = document.getElementById('projetistaNome').value.trim().replace(/\s+/g, '_');
  
  const opt = {
    margin:       [10, 10, 10, 10],
    filename:     `Relatorio_Pagamento_${projetista}_${mes}_${ano}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2.5, useCORS: true, letterRendering: true, scrollX: 0, scrollY: 0 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // display:none (e não visibility:hidden) para não deixar espaço em branco no PDF
  const printHides = element.querySelectorAll('.btn-print-hide');
  const printHidesDisplay = [];
  printHides.forEach(el => {
    printHidesDisplay.push(el.style.display);
    el.style.display = 'none';
  });

  // Salva estilos originais para evitar corte lateral no PDF
  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalBoxShadow = element.style.boxShadow;
  const originalMargin = element.style.margin;
  const originalPaddingBottom = element.style.paddingBottom;

  element.style.width = '680px';
  element.style.maxWidth = '680px';
  element.style.boxShadow = 'none';
  element.style.margin = '0 auto';
  element.style.paddingBottom = '20px';

  try {
    await html2pdf().set(opt).from(element).save();
    showToast("📦 PDF gerado com sucesso!", "ok");
  } catch (err) {
    console.error("Erro ao gerar PDF: ", err);
    showToast("Erro ao gerar PDF: " + err.message, "err");
  } finally {
    // Restaura estilos originais
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
    element.style.boxShadow = originalBoxShadow;
    element.style.margin = originalMargin;
    element.style.paddingBottom = originalPaddingBottom;

    printHides.forEach((el, i) => el.style.display = printHidesDisplay[i] || '');
    if (btn) btn.innerHTML = originalText;
  }
}

function selecionarMesAtual() {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const hoje = new Date();
  const mesAtual = meses[hoje.getMonth()];
  const anoAtual = hoje.getFullYear().toString();
  
  const selectMes = document.getElementById('pagamentoMes');
  const selectAno = document.getElementById('pagamentoAno');
  
  if (selectMes && selectAno) {
    selectMes.value = mesAtual;
    selectAno.value = anoAtual;
    salvarCabecalho(true);
    showToast(`📅 Período alterado para ${mesAtual}/${anoAtual}`, "ok");
  }
}

// ── Campos dinâmicos de piscina (1 a 5) no modal manual ──
function renderPiscinasModal(lista) {
  const wrap = document.getElementById('manualPiscinasWrap');
  if (!wrap) return;
  let arr = Array.isArray(lista) ? lista.slice(0, 5) : [];
  if (!arr.length) arr = [''];
  wrap.innerHTML = arr.map((v, i) => `
    <div class="pisc-row" style="display:flex; gap:6px; align-items:center;">
      <input type="text" class="pisc-input" value="${esc(v)}" placeholder="Ex: Atica M01" style="flex:1; padding:9px 12px; border:1.5px solid var(--border); border-radius:7px; font-size:13px; outline:none;">
      ${arr.length > 1 ? `<button type="button" onclick="removerCampoPiscina(${i})" title="Remover piscina" style="background:none; border:none; cursor:pointer; color:#e74c3c; font-size:16px; line-height:1; padding:4px 6px;">✕</button>` : ''}
    </div>`).join('');
  const b = document.getElementById('btnAddPiscina');
  if (b) b.style.display = arr.length >= 5 ? 'none' : 'inline-flex';
}

function lerPiscinasModalValores() {
  return Array.from(document.querySelectorAll('#manualPiscinasWrap .pisc-input')).map(i => i.value);
}

function lerPiscinasModal() {
  return lerPiscinasModalValores().map(v => v.trim()).filter(Boolean);
}

function adicionarCampoPiscina() {
  const atuais = lerPiscinasModalValores();
  if (atuais.length >= 5) return;
  atuais.push('');
  renderPiscinasModal(atuais);
}

function removerCampoPiscina(i) {
  const atuais = lerPiscinasModalValores();
  atuais.splice(i, 1);
  renderPiscinasModal(atuais.length ? atuais : ['']);
}

function abrirModalManual() {
  editandoIndex = null;
  document.getElementById('manualId').value = '';
  document.getElementById('manualDataRecebimento').value = '';
  document.getElementById('manualDataEnvio').value = '';
  renderPiscinasModal(['']);
  document.getElementById('manualLoja').value = '';
  document.getElementById('manualTipo').value = '';
  document.getElementById('manualAlt').checked = false;
  document.getElementById('manualObs').value = '';
  const t = document.getElementById('manualModalTitle'); if (t) t.textContent = 'Inserir Projeto Manual';
  const b = document.getElementById('btnManualSalvar'); if (b) b.textContent = 'Adicionar';
  popularProjetistaModal(targetUserId || meuUserId);
  document.getElementById('manualModal').style.display = 'flex';
}

// Abre o modal já preenchido para editar uma linha existente
function editarLinha(index) {
  const row = rowsData[index];
  if (!row) return;
  editandoIndex = index;
  const idPart = (row.raw || '').split('_')[0] || '';
  document.getElementById('manualId').value = /^\d+$/.test(idPart) ? idPart : '';
  document.getElementById('manualDataRecebimento').value = row.data || '';
  document.getElementById('manualDataEnvio').value = row.data_envio || '';
  renderPiscinasModal(piscinasArr(row.raw));
  document.getElementById('manualLoja').value = loja(row.raw) || '';
  document.getElementById('manualTipo').value = row.tipo || '';
  document.getElementById('manualAlt').checked = !!row.alt;
  document.getElementById('manualObs').value = row.obs || '';
  const t = document.getElementById('manualModalTitle'); if (t) t.textContent = 'Editar Projeto';
  const b = document.getElementById('btnManualSalvar'); if (b) b.textContent = 'Salvar';
  popularProjetistaModal(row._uid || targetUserId || meuUserId);
  document.getElementById('manualModal').style.display = 'flex';
}

// Preenche o select de projetista do modal (admin escolhe; usuário comum só vê o próprio)
function popularProjetistaModal(selId) {
  const sel = document.getElementById('manualProjetista');
  const hint = document.getElementById('manualProjetistaHint');
  if (!sel) return;
  if (isAdminUser && usuariosPagamentos.length) {
    sel.innerHTML = usuariosPagamentos.map(u =>
      `<option value="${esc(u.id)}"${u.id === selId ? ' selected' : ''}>${esc(u.name || u.email)}${u.role === 'admin' ? ' (admin)' : ''}</option>`
    ).join('');
    sel.disabled = false;
    if (hint) hint.style.display = 'block';
  } else {
    const nome = (localStorage.getItem('igui_user_name') || '').trim();
    sel.innerHTML = `<option value="${esc(meuUserId || '')}" selected>${esc(nome || 'Você')}</option>`;
    sel.disabled = true;
    if (hint) hint.style.display = 'none';
  }
}

// Anexa uma linha ao registro de pagamentos de um usuário (cria registro se não existir)
async function adicionarLinhaAoRegistro(destUserId, rowObj) {
  const { data: list } = await sb.from('payments').select('*').eq('user_id', destUserId).order('updated_at', { ascending: false });
  const destRec = list && list[0];
  if (destRec) {
    const rows = Array.isArray(destRec.rows_data) ? destRec.rows_data.slice() : [];
    rows.push(rowObj);
    const { error } = await sb.from('payments').update({ rows_data: rows }).eq('id', destRec.id);
    if (error) throw error;
  } else {
    const destName = (usuariosPagamentos.find(u => u.id === destUserId)?.name) || '';
    const { error } = await sb.from('payments').insert({
      user_id: destUserId,
      rows_data: [rowObj],
      header_data: { projetista: destName, mes: '', ano: '' },
      values_data: {}
    });
    if (error) throw error;
  }
}

function fecharModalManual() {
  editandoIndex = null;
  document.getElementById('manualModal').style.display = 'none';
}

async function salvarProjetoManual() {
  const idVal = document.getElementById('manualId').value.trim();
  const recebimentoVal = document.getElementById('manualDataRecebimento').value.trim();
  const envioVal = document.getElementById('manualDataEnvio').value.trim();
  const piscinasModal = lerPiscinasModal();
  const piscinaVal = piscinasModal.join(';');
  const lojaVal = document.getElementById('manualLoja').value.trim();
  const tipoVal = document.getElementById('manualTipo').value;
  const altVal = document.getElementById('manualAlt').checked;
  const obsVal = document.getElementById('manualObs').value.trim();

  if (!piscinasModal.length || !lojaVal) {
    showToast("Por favor, preencha pelo menos uma Piscina e a Loja.", "err");
    return;
  }

  // Se não colocar Nº Orçamento (ID) é Splash
  const finalId = idVal || 'Splash';

  // Se não informou data de envio, pega hoje
  let dtEnvioFinal = envioVal;
  if (!dtEnvioFinal) {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    dtEnvioFinal = `${dia}-${mes}-${ano}`;
  }

  // Monta a string raw padronizada: ID_Piscina_Loja_DataEnvio
  const rawString = `${finalId}_${piscinaVal}_${lojaVal}_${dtEnvioFinal}`;
  
  // Função auxiliar para obter formato curto dd/mm
  function obterDataCurta(str) {
    if (!str) return "";
    let pedacos = str.split(/[-/]/);
    if (pedacos.length >= 2) {
      return `${pedacos[0]}/${pedacos[1]}`;
    }
    return str;
  }

  let dataRecebimentoCurta = obterDataCurta(recebimentoVal);
  if (!dataRecebimentoCurta) {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    dataRecebimentoCurta = `${dia}/${mes}`;
  }
  const dataEnvioCurta = obterDataCurta(dtEnvioFinal);

  // Projetista de destino (admin pode escolher; usuário comum = ele mesmo)
  const selProj = document.getElementById('manualProjetista');
  const destUserId = (isAdminUser && selProj && selProj.value) ? selProj.value : (targetUserId || meuUserId);

  // ── Edição de uma linha existente ──
  if (editandoIndex !== null && rowsData[editandoIndex]) {
    const orig = rowsData[editandoIndex];
    const ownerAtual = orig._uid || targetUserId || meuUserId;
    const rowObj = {
      ...orig,
      data: dataRecebimentoCurta, data_envio: dataEnvioCurta,
      tipo: tipoVal, alt: altVal, raw: rawString, obs: obsVal
    };

    // Registro de edição — só quando um ADMIN edita, e mantém apenas a última
    if (isAdminUser) {
      const campos = diferencasEdicao(orig, {
        id: finalId, data: dataRecebimentoCurta, data_envio: dataEnvioCurta,
        piscina: piscinaVal, loja: lojaVal, tipo: tipoVal, alt: altVal, obs: obsVal
      });
      if (campos.length) {
        rowObj._edit = {
          por: (localStorage.getItem('igui_user_name') || 'Admin').trim(),
          em: new Date().toISOString(),
          campos
        };
      }
    }

    // Admin trocou o projetista → move para o registro do destino
    if (isAdminUser && destUserId && destUserId !== ownerAtual) {
      if (targetUserId === 'ALL') {
        // Modo Todos: a linha já está na lista — só re-etiqueta o dono
        rowObj._uid = destUserId;
        rowObj._projNome = (usuariosPagamentos.find(u => u.id === destUserId)?.name) || '';
        rowsData[editandoIndex] = rowObj;
        editandoIndex = null;
        fecharModalManual();
        salvarDados(); // grava nos dois registros (origem perde, destino ganha)
        renderTabela();
        recalcularFinanceiro();
        showToast("✅ Projeto movido para o projetista selecionado.", "ok");
        return;
      }
      // Modo um projetista: remove daqui e grava no registro do destino
      rowsData.splice(editandoIndex, 1);
      editandoIndex = null;
      fecharModalManual();
      await salvarTudoSupabase(); // grava a remoção no registro de origem
      try {
        const mover = { ...rowObj }; delete mover._uid; delete mover._projNome;
        await adicionarLinhaAoRegistro(destUserId, mover);
        showToast("✅ Projeto movido para o projetista selecionado.", "ok");
      } catch (e) { showToast("Erro ao mover: " + e.message, "err"); }
      renderTabela();
      recalcularFinanceiro();
      return;
    }

    rowsData[editandoIndex] = rowObj;
    editandoIndex = null;
    fecharModalManual();
    salvarDados();
    renderTabela();
    recalcularFinanceiro();
    showToast("✅ Projeto atualizado!", "ok");
    return;
  }

  // ── Adição de novo projeto ──
  const novo = {
    data: dataRecebimentoCurta,
    data_envio: dataEnvioCurta,
    tipo: tipoVal,
    alt: altVal,
    raw: rawString,
    conf: false,
    obs: obsVal
  };

  // Modo Todos: adiciona à lista já etiquetando o dono escolhido
  if (targetUserId === 'ALL' && isAdminUser && destUserId) {
    novo._uid = destUserId;
    novo._projNome = (usuariosPagamentos.find(u => u.id === destUserId)?.name) || '';
    rowsData.push(novo);
    fecharModalManual();
    salvarDados();
    renderTabela();
    recalcularFinanceiro();
    showToast("✅ Projeto adicionado ao projetista selecionado.", "ok");
    return;
  }

  // Modo um projetista, admin adicionando para OUTRO → grava direto no registro dele
  if (isAdminUser && destUserId && destUserId !== (targetUserId || meuUserId)) {
    fecharModalManual();
    try {
      await adicionarLinhaAoRegistro(destUserId, novo);
      showToast("✅ Projeto adicionado ao projetista selecionado.", "ok");
    } catch (e) { showToast("Erro ao adicionar: " + e.message, "err"); }
    return;
  }

  rowsData.push(novo);
  fecharModalManual();
  salvarDados();
  renderTabela();
  recalcularFinanceiro();
  showToast("✅ Projeto manual adicionado com sucesso!", "ok");
}

// --- Função auxiliar para processar datas em comparações ---
function obterObjetoData(strData, defaultYear = 2026) {
  if (!strData) return null;
  // matches dd/mm/yyyy or dd-mm-yyyy
  let match = strData.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  // matches dd/mm or dd-mm
  match = strData.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return new Date(defaultYear, parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return null;
}

function desfazerExclusao() {
  if (ultimoExcluido) {
    rowsData.splice(ultimoExcluido.index, 0, ultimoExcluido.data);
    ultimoExcluido = null;
    salvarDados();
    recalcularFinanceiro();
    renderTabela();
    showToast('✅ Projeto restaurado com sucesso!', 'ok');
  }
}

// --- Exportar para Excel (.xlsx) ---
async function exportarExcel() {
  const mes = document.getElementById('pagamentoMes')?.value || '';
  const ano = document.getElementById('pagamentoAno')?.value || '';

  const linhas = rowsData.filter(r => rowPertenceAoMesAno(r, mes, ano));
  if (!linhas.length) { showToast('Nenhum projeto no mês selecionado para exportar.', 'err'); return; }

  // Carrega SheetJS sob demanda (só na primeira exportação)
  if (!window.XLSX) {
    showToast('📦 Preparando exportação...', 'ok');
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }).catch(() => {});
    if (!window.XLSX) { showToast('❌ Erro ao carregar biblioteca de Excel.', 'err'); return; }
  }

  const dados = linhas.map((row, i) => ({
    'Nº': i + 1,
    'Data Recebimento': row.data || '',
    'Data Envio': row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw),
    'Tipo': row.tipo || '',
    'Nº Projeto': nProjeto(row.raw) || '',
    'Piscina': piscinasArr(row.raw).join(', ') || '',
    'Loja': loja(row.raw) || '',
    'Arquivo': row.raw || '',
    'Observação': row.obs || '',
    'Conferido': row.conf ? 'Sim' : 'Não',
    'Grande Alteração': row.alt ? 'Sim' : 'Não',
  }));

  const ws = XLSX.utils.json_to_sheet(dados);
  ws['!cols'] = [
    { wch: 4 }, { wch: 14 }, { wch: 11 }, { wch: 24 }, { wch: 10 },
    { wch: 16 }, { wch: 18 }, { wch: 46 }, { wch: 28 }, { wch: 9 }, { wch: 14 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${mes} ${ano}`.trim().slice(0, 31) || 'Pagamentos');
  XLSX.writeFile(wb, `Pagamentos_${mes}_${ano}.xlsx`);
  showToast(`✅ ${linhas.length} projeto(s) exportado(s) para Excel!`, 'ok');
}

function atualizarFeedbackLote() {
  const area = document.getElementById('bulkInput');
  const feedback = document.getElementById('bulkFeedback');
  if (!area || !feedback) return;

  const text = area.value.trim();
  if (!text) {
    feedback.innerHTML = '';
    feedback.style.display = 'none';
    return;
  }

  const linhas = text.split('\n');
  let validos = 0;
  let invalidos = 0;

  linhas.forEach(linha => {
    const raw = inlineText => inlineText.trim();
    const rawVal = linha.trim();
    if (!rawVal) return;
    
    const partes = rawVal.split('_');
    const dt = dataEnvio(rawVal);
    
    if (partes.length >= 3 && dt) {
      validos++;
    } else {
      invalidos++;
    }
  });

  if (validos > 0 || invalidos > 0) {
    feedback.style.display = 'block';
    feedback.style.fontSize = '11px';
    feedback.style.marginTop = '6px';
    feedback.style.fontWeight = '600';
    
    let html = '';
    if (validos > 0) {
      html += `<span style="color: #16a34a; margin-right: 12px;">✓ ${validos} linha${validos > 1 ? 's' : ''} válida${validos > 1 ? 's' : ''}</span>`;
    }
    if (invalidos > 0) {
      html += `<span style="color: #dc2626;">⚠ ${invalidos} linha${invalidos > 1 ? 's' : ''} fora do padrão</span>`;
    }
    feedback.innerHTML = html;
  } else {
    feedback.innerHTML = '';
    feedback.style.display = 'none';
  }
}
