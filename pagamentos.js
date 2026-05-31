// ═══════════════════════════════════════════════════
// PAGAMENTOS.JS — lógica da página de pagamentos
// ═══════════════════════════════════════════════════

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
  return "Internacional";
}

function piscina(texto) {
  if (!texto) return "";
  let limpo = texto.toString().replace(/\s*\(\d+\)\s*$/, "");
  let partes = limpo.split("_");
  return partes[1] || "";
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
let queryPesquisa = "";
let filtroAtivo = "todos";

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
  carregarDados();
});

// --- Carregar e Salvar no Supabase ---
async function carregarDados() {
  try {
    const user = await sbGetUser();
    if (!user) return;
    
    // Pega o nome completo salvo localmente no login
    const cachedName = localStorage.getItem('igui_user_name');
    let nomeCompleto = cachedName ? cachedName.toUpperCase() : '';
    
    if (!nomeCompleto) {
      nomeCompleto = user.email.split('@')[0].toUpperCase();
    }
    
    const { data, error } = await sb.from('payments').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    
    if (data) {
      pagId = data.id;
      rowsData = data.rows_data || [];
      
      const h = data.header_data || {};
      let projetistaVal = h.projetista;
      if (projetistaVal && !projetistaVal.trim().includes(' ')) {
        projetistaVal = nomeCompleto;
      }
      document.getElementById('projetistaNome').value = projetistaVal || nomeCompleto;
      document.getElementById('pagamentoMes').value = h.mes || 'Maio';
      document.getElementById('pagamentoAno').value = h.ano || '2026';
      
      const v = data.values_data || {};
      document.getElementById('val_ate2').value = v.val_ate2 ?? 70;
      document.getElementById('val_3a4').value = v.val_3a4 ?? 80;
      document.getElementById('val_mais5').value = v.val_mais5 ?? 95;
      document.getElementById('val_360').value = v.val_360 ?? 90;
      document.getElementById('val_360_3mod').value = v.val_360_3mod ?? 105;
      document.getElementById('val_conceito').value = v.val_conceito ?? 150;
      document.getElementById('val_alt_grandes').value = v.val_alt_grandes ?? 60;
    } else {
      rowsData = obterValoresIniciais();
      document.getElementById('projetistaNome').value = nomeCompleto;
      document.getElementById('pagamentoMes').value = 'Maio';
      document.getElementById('pagamentoAno').value = '2026';
      
      await salvarTudoSupabase();
    }
  } catch (e) {
    console.error('Erro ao carregar dados do Supabase:', e);
    const raw = localStorage.getItem(STORAGE_KEY);
    rowsData = raw ? JSON.parse(raw) : obterValoresIniciais();
  }
  renderTabela();
  recalcularFinanceiro();
}

function obterValoresIniciais() {
  return [];
}

async function salvarTudoSupabase() {
  try {
    const user = await sbGetUser();
    if (!user) return;
    
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
      user_id: user.id,
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rowsData));
  } catch (e) {
    console.error('Erro ao salvar no Supabase:', e);
  }
}

function salvarDados() {
  salvarTudoSupabase();
}

function salvarCabecalho() {
  salvarTudoSupabase();
  recalcularFinanceiro();
}

function salvarValoresConfig() {
  salvarTudoSupabase();
}

// --- Renderizar Tabela ---
function renderTabela() {
  const tbody = document.getElementById('tabelaProjetosCorpo');
  tbody.innerHTML = '';
  
  const query = queryPesquisa.trim().toLowerCase();
  
  // Contadores para os status
  let totalGeral = rowsData.length;
  let totalConferidos = rowsData.filter(r => r.conf).length;
  let totalPendentes = totalGeral - totalConferidos;
  
  // Atualiza os painéis de resumo rápido
  const statTotalGeral = document.getElementById('statTotalGeral');
  const statConferidos = document.getElementById('statConferidos');
  const statPendentes = document.getElementById('statPendentes');
  if (statTotalGeral) statTotalGeral.textContent = totalGeral;
  if (statConferidos) statConferidos.textContent = totalConferidos;
  if (statPendentes) statPendentes.textContent = totalPendentes;

  rowsData.forEach((row, index) => {
    const tr = document.createElement('tr');
    
    // Se estiver conferido, adiciona classe de destaque
    if (row.conf) {
      tr.className = 'row-conferido';
    }
    
    // Processamento do identificador/nome do arquivo
    const numProj = nProjeto(row.raw);
    const piscinaModel = piscina(row.raw);
    const lojaFranquia = loja(row.raw);
    const dtEnvio = row.data_envio !== undefined ? row.data_envio : dataEnvio(row.raw);
    
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
    }
    
    if (!matchesQuery || !matchesFilter) {
      tr.style.display = 'none';
    }
    
    const detailsHtml = row.raw ? `
      <div class="extracted-info" style="margin-top: 2px; padding: 2px 6px;">
        Piscina: <span class="badge-piscina">${piscinaModel}</span> | Loja: <span class="badge-loja">${lojaFranquia}</span>
      </div>
    ` : '';

    tr.innerHTML = `
      <td style="text-align: center; vertical-align: middle; white-space: nowrap;">
        <span style="font-weight: bold; color: var(--muted); margin-right: 6px; font-size: 13px;">${index + 1}</span>
        <input type="checkbox" ${row.conf ? 'checked' : ''} onchange="atualizarCampo(${index}, 'conf', this.checked); toggleRowHighlight(this, ${index})" style="vertical-align: middle;">
      </td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <button type="button" onclick="definirDataHoje(${index})" title="Usar data de hoje" style="background: none; border: none; padding: 2px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#e2eaf3'" onmouseout="this.style.background='none'">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M3 13h10M8 2v8M4 7l4 4 4-4"/></svg>
            </button>
            <input type="text" id="input-data-${index}" value="${row.data || ''}" placeholder="dd/mm" style="width: 55px; padding: 3px 6px; font-size: 11px;" oninput="atualizarCampo(${index}, 'data', this.value)">
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="padding: 2px; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; box-sizing: border-box; flex-shrink: 0;">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" title="Data de Envio" style="flex-shrink:0;"><path d="M3 3h10M8 14V6M4 9l4-4 4 4"/></svg>
            </div>
            <input type="text" value="${dtEnvio || ''}" placeholder="dd/mm" style="width: 55px; padding: 3px 6px; font-size: 11px;" oninput="atualizarCampo(${index}, 'data_envio', this.value)">
          </div>
        </div>
      </td>
      <td>
        <select onchange="atualizarCampo(${index}, 'tipo', this.value)" style="width: 100%; padding: 4px 8px; font-size: 12px;">
          <option value="" ${!row.tipo ? 'selected' : ''}>-- Selecione --</option>
          <option value="Até 02 Projetos" ${row.tipo === 'Até 02 Projetos' ? 'selected' : ''}>Até 02 Projetos</option>
          <option value="03 a 4 Projetos" ${row.tipo === '03 a 4 Projetos' ? 'selected' : ''}>03 a 4 Projetos</option>
          <option value="Mais que 05 Projetos" ${row.tipo === 'Mais que 05 Projetos' ? 'selected' : ''}>Mais que 05 Projetos</option>
          <option value="Projeto 360º" ${row.tipo === 'Projeto 360º' ? 'selected' : ''}>Projeto 360º</option>
          <option value="Projeto 360º (3 Modificações)" ${row.tipo === 'Projeto 360º (3 Modificações)' ? 'selected' : ''}>Projeto 360º (3 Modificações)</option>
          <option value="Conceito" ${row.tipo === 'Conceito' ? 'selected' : ''}>Conceito</option>
          <option value="Alterações GRANDES" ${row.tipo === 'Alterações GRANDES' ? 'selected' : ''}>Alterações GRANDES</option>
        </select>
        <div style="margin-top: 4px; display: flex; align-items: center;">
          <label style="font-size: 10px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; background: #fff8e1; color: #b7791f; padding: 1px 6px; border-radius: 3px; border: 1px solid #f5d87a; margin: 0; user-select: none;">
            <input type="checkbox" ${row.alt ? 'checked' : ''} onchange="atualizarCampo(${index}, 'alt', this.checked)" style="width: 12px; height: 12px; margin: 0; cursor: pointer;">
            Grande Alteração
          </label>
        </div>
      </td>
      <td>
        <div style="position: relative; width: 100%;">
          <span style="position: absolute; left: 6px; top: 6px; font-size: 10px; font-weight: 700; color: #7f8c9a; background: #e2eaf3; padding: 2px 4px; border-radius: 4px; pointer-events: none;">${numProj || '—'}</span>
          <input type="text" class="raw-string-input" value="${row.raw || ''}" placeholder="Cole o nome do arquivo aqui..." oninput="atualizarCampo(${index}, 'raw', this.value); reprocessarLinha(${index})" style="padding-left: ${numProj ? Math.max(25, 14 + numProj.toString().length * 6.0) : 25}px; font-size: 12px !important; height: 28px;">
        </div>
        ${detailsHtml}
      </td>
      <td style="height: 1px; padding: 4px 6px;">
        <textarea placeholder="Observação..." oninput="atualizarCampo(${index}, 'obs', this.value)" style="width: 100%; height: 100%; min-height: 38px; font-size: 12px; resize: none; box-sizing: border-box; padding: 4px 6px; border: 1.5px solid var(--border); border-radius: 4px; line-height: 1.3; display: block;">${row.obs || ''}</textarea>
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <button class="btn-mini danger" onclick="removerLinha(${index})" title="Excluir" style="padding: 3px 6px;">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
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

// --- Funções Interativas ---
function adicionarLinha() {
  rowsData.push({ data: '', tipo: '', alt: false, raw: '', conf: false, obs: '' });
  salvarDados();
  renderTabela();
}

function removerLinha(index) {
  rowsData.splice(index, 1);
  salvarDados();
  renderTabela();
}

function limparTabela() {
  if (confirm('Tem certeza que deseja apagar todos os projetos desta lista?')) {
    rowsData = [];
    salvarDados();
    renderTabela();
  }
}

function atualizarCampo(index, campo, valor) {
  rowsData[index][campo] = valor;
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

  const linhas = text.split('\n');
  linhas.forEach(linha => {
    const raw = linha.trim();
    if (raw) {
      // Tenta inferir a data de envio como data inicial
      const dt = dataEnvio(raw);
      rowsData.push({
        data: dt || '',
        tipo: '',
        alt: false,
        raw: raw,
        conf: false,
        obs: ''
      });
    }
  });

  area.value = '';
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

  rowsData.forEach(row => {
    // Only count project in totals if the send date belongs to the sheet's selected month/year
    if (!rowPertenceAoMesAno(row, mesNome, anoStr)) {
      return;
    }

    const num = nProjeto(row.raw);
    
    // Contabilidade de tipos
    if (row.tipo === 'Até 02 Projetos') qty_ate2++;
    else if (row.tipo === '03 a 4 Projetos') {
      qty_3a4++;
      if (num) list_3_piscinas.push(num);
    }
    else if (row.tipo === 'Mais que 05 Projetos') {
      qty_mais5++;
      if (num) list_3_piscinas.push(num);
    }
    else if (row.tipo === 'Projeto 360º') {
      qty_360++;
      if (num) list_360.push(num);
    }
    else if (row.tipo === 'Projeto 360º (3 Modificações)') {
      qty_360_3mod++;
      if (num) list_360.push(num);
    }
    else if (row.tipo === 'Conceito') {
      qty_conceito++;
      if (num) list_conceito.push(num);
    }
    else if (row.tipo === 'Alterações GRANDES') {
      qty_alt_grandes++;
    }

    // Se checkbox de alteração ("Alt.") estiver ativa
    if (row.alt) {
      if (num) list_alt_grandes.push(num);
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
}

function formatarMoeda(valor) {
  return 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let toastTimer;
function showToast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  clearTimeout(toastTimer);
  t.textContent = msg;
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
  
  // Atualiza classes ativas dos botões de filtro
  document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.classList.remove('active');
  });
  
  if (tipo === 'todos') document.getElementById('btnFiltroTodos').classList.add('active');
  else if (tipo === 'conferidos') document.getElementById('btnFiltroConferidos').classList.add('active');
  else if (tipo === 'pendentes') document.getElementById('btnFiltroPendentes').classList.add('active');
  else if (tipo === 'alterados') document.getElementById('btnFiltroAlterados').classList.add('active');
  
  renderTabela();
}

function copiarTabelaExcel() {
  if (!rowsData.length) {
    showToast("A lista está vazia para copiar.", "err");
    return;
  }
  let cabecalho = "Nº\tData Inicial\tData Envio\tTipo Projeto\tID Projeto\tPiscina\tLoja\tConferido\tObservação\n";
  let rows = rowsData.map((row, index) => {
    const numProj = nProjeto(row.raw);
    const piscinaModel = piscina(row.raw);
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
  
  // Obtém a representação da data de envio
  let dtEnvio = "";
  if (row.data_envio !== undefined && row.data_envio !== null) {
    dtEnvio = row.data_envio.toString().trim();
  } else if (row.raw) {
    dtEnvio = dataEnvio(row.raw);
  }
  
  if (!dtEnvio) return false;
  
  let rowMes = "";
  let rowAno = "";
  
  // Tenta extrair mês e ano de dtEnvio
  let match = dtEnvio.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    rowMes = match[2].padStart(2, '0');
    rowAno = match[3];
  } else {
    match = dtEnvio.match(/(\d{1,2})[-/](\d{1,2})/);
    if (match) {
      rowMes = match[2].padStart(2, '0');
    }
  }
  
  // Se não encontrou o ano em dtEnvio, busca um ano de 4 dígitos no raw
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

  const printHides = element.querySelectorAll('.btn-print-hide');
  printHides.forEach(el => el.style.visibility = 'hidden');

  // Salva estilos originais para evitar corte lateral no PDF
  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalBoxShadow = element.style.boxShadow;
  const originalMargin = element.style.margin;

  element.style.width = '720px';
  element.style.maxWidth = '720px';
  element.style.boxShadow = 'none';
  element.style.margin = '0 auto';

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

    printHides.forEach(el => el.style.visibility = 'visible');
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
    salvarCabecalho();
    showToast(`📅 Período alterado para ${mesAtual}/${anoAtual}`, "ok");
  }
}

function abrirModalManual() {
  document.getElementById('manualId').value = '';
  document.getElementById('manualDataRecebimento').value = '';
  document.getElementById('manualDataEnvio').value = '';
  document.getElementById('manualPiscina').value = '';
  document.getElementById('manualLoja').value = '';
  document.getElementById('manualTipo').value = '';
  document.getElementById('manualAlt').checked = false;
  document.getElementById('manualObs').value = '';
  document.getElementById('manualModal').style.display = 'flex';
}

function fecharModalManual() {
  document.getElementById('manualModal').style.display = 'none';
}

function salvarProjetoManual() {
  const idVal = document.getElementById('manualId').value.trim();
  const recebimentoVal = document.getElementById('manualDataRecebimento').value.trim();
  const envioVal = document.getElementById('manualDataEnvio').value.trim();
  const piscinaVal = document.getElementById('manualPiscina').value.trim();
  const lojaVal = document.getElementById('manualLoja').value.trim();
  const tipoVal = document.getElementById('manualTipo').value;
  const altVal = document.getElementById('manualAlt').checked;
  const obsVal = document.getElementById('manualObs').value.trim();

  if (!piscinaVal || !lojaVal) {
    showToast("Por favor, preencha pelo menos a Piscina e a Loja.", "err");
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

  const dataRecebimentoCurta = obterDataCurta(recebimentoVal);
  const dataEnvioCurta = obterDataCurta(dtEnvioFinal);

  // Adiciona a nova linha no rowsData
  rowsData.push({
    data: dataRecebimentoCurta,
    data_envio: dataEnvioCurta,
    tipo: tipoVal,
    alt: altVal,
    raw: rawString,
    conf: false,
    obs: obsVal
  });

  fecharModalManual();
  salvarDados();
  renderTabela();
  recalcularFinanceiro();
  showToast("✅ Projeto manual adicionado com sucesso!", "ok");
}
