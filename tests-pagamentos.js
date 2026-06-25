// ══════════════════════════════════════════════════════════════════
// Testes unitários — funções puras de pagamentos.js
// Rodar: node tests-pagamentos.js
// ══════════════════════════════════════════════════════════════════
// Copia local das funções puras (sem dependências de DOM ou Supabase).

function nProjeto(texto) {
  if (!texto) return "";
  let limpo = texto.toString().trim().replace(/\s*\(\d+\)\s*$/, "");
  if (/splash/i.test(limpo)) return "Splash";
  let partes = limpo.split("_");
  let projeto = partes[0] || "";
  if (/^\d+$/.test(projeto)) return projeto.trim();
  return "Inter.";
}

function piscina(texto) {
  if (!texto) return "";
  let limpo = texto.toString().replace(/\s*\(\d+\)\s*$/, "");
  return limpo.split("_")[1] || "";
}

function piscinasArr(raw) {
  return (piscina(raw) || '').split(';').map(s => s.trim()).filter(Boolean);
}

function loja(texto) {
  if (!texto) return "";
  let limpo = texto.toString().replace(/\s*\(\d+\)\s*$/, "");
  return limpo.split("_")[2] || "";
}

function dataEnvio(texto) {
  if (!texto) return "";
  let limpo = texto.toString().trim().replace(/\s*\(\d+\)\s*$/, "");
  let match = limpo.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) return match[1].padStart(2, '0') + "-" + match[2].padStart(2, '0');
  match = limpo.match(/(\d{1,2})[-/](\d{1,2})/);
  if (match) return match[1].padStart(2, '0') + "-" + match[2].padStart(2, '0');
  let partes = limpo.split("_");
  if (partes.length < 4) return "";
  let dt = partes[3];
  let pedacos = dt.split("-");
  if (pedacos.length < 2) return partes[3];
  return pedacos[0] + "-" + pedacos[1];
}

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

// ── Runner ───────────────────────────────────────────────────────
let passed = 0, failed = 0;
function eq(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      esperado: ${JSON.stringify(expected)}`);
    console.error(`      recebido: ${JSON.stringify(got)}`);
    failed++;
  }
}

// ── nProjeto ─────────────────────────────────────────────────────
console.log('\nnProjeto');
eq('ID numérico',            nProjeto('809763_Atica_Loja_04-05'),       '809763');
eq('ID numérico com sufixo', nProjeto('809763_Atica_Loja_04-05 (1)'),   '809763');
eq('splash (minúsc)',        nProjeto('splash_Atica_Loja_04-05'),        'Splash');
eq('SPLASH (maiúsc)',        nProjeto('SPLASH_Foo_Bar_01-01'),           'Splash');
eq('sem ID numérico',        nProjeto('ABC_Foo_Bar_01-01'),              'Inter.');
eq('vazio',                  nProjeto(''),                               '');
eq('null',                   nProjeto(null),                             '');

// ── piscina ──────────────────────────────────────────────────────
console.log('\npiscina');
eq('piscina simples',        piscina('809763_Atica_Loja_04-05'),         'Atica');
eq('piscina com ponto-vírgula', piscina('809763_Atica;Unlimited_Loja_04-05'), 'Atica;Unlimited');
eq('sem piscina',            piscina('809763'),                          '');
eq('vazio',                  piscina(''),                                '');

// ── piscinasArr ──────────────────────────────────────────────────
console.log('\npiscinasArr');
eq('1 piscina',              piscinasArr('809763_Atica_Loja_04-05'),     ['Atica']);
eq('2 piscinas',             piscinasArr('809763_Atica;Unlimited_Loja_04-05'), ['Atica', 'Unlimited']);
eq('5 piscinas',             piscinasArr('123_A;B;C;D;E_L_01-01'),      ['A','B','C','D','E']);
eq('vazio',                  piscinasArr(''),                             []);

// ── loja ─────────────────────────────────────────────────────────
console.log('\nloja');
eq('loja normal',            loja('809763_Atica_Ática_04-05'),           'Ática');
eq('sem loja',               loja('809763_Atica'),                       '');
eq('vazio',                  loja(''),                                   '');

// ── dataEnvio ────────────────────────────────────────────────────
console.log('\ndataEnvio');
eq('formato raw _',          dataEnvio('809763_Atica_Loja_04-05'),       '04-05');
eq('formato DD-MM-YYYY',     dataEnvio('01-06-2026'),                    '01-06');
eq('formato DD/MM/YYYY',     dataEnvio('15/03/2025'),                    '15-03');
eq('formato DD-MM',          dataEnvio('07-09'),                         '07-09');
eq('dia único dígito',       dataEnvio('1-6'),                           '01-06');
eq('vazio',                  dataEnvio(''),                              '');
eq('sem data no raw',        dataEnvio('809763_Atica_Loja'),             '');

// ── diferencasEdicao ─────────────────────────────────────────────
console.log('\ndiferencasEdicao');

const base = {
  raw: '809763_Atica_Loja_04-05',
  data: '10-06',
  data_envio: '04-05',
  tipo: 'Até 02 Projetos',
  alt: false,
  obs: ''
};

eq('sem diferença', diferencasEdicao(base, {
  id: '809763', data: '10-06', data_envio: '04-05',
  piscina: 'Atica', loja: 'Loja', tipo: 'Até 02 Projetos', alt: false, obs: ''
}), []);

eq('mudança de tipo', diferencasEdicao(base, {
  id: '809763', data: '10-06', data_envio: '04-05',
  piscina: 'Atica', loja: 'Loja', tipo: 'Conceito', alt: false, obs: ''
}), [{ c: 'Tipo', de: 'Até 02 Projetos', para: 'Conceito' }]);

eq('mudança de obs', diferencasEdicao(base, {
  id: '809763', data: '10-06', data_envio: '04-05',
  piscina: 'Atica', loja: 'Loja', tipo: 'Até 02 Projetos', alt: false, obs: 'urgente'
}), [{ c: 'Obs', de: '', para: 'urgente' }]);

eq('mudança de alt', diferencasEdicao(base, {
  id: '809763', data: '10-06', data_envio: '04-05',
  piscina: 'Atica', loja: 'Loja', tipo: 'Até 02 Projetos', alt: true, obs: ''
}), [{ c: 'Gde Alteração', de: 'Não', para: 'Sim' }]);

eq('múltiplas mudanças', diferencasEdicao(base, {
  id: '809763', data: '12-06', data_envio: '05-05',
  piscina: 'Unlimited', loja: 'Loja Nova', tipo: 'Conceito', alt: true, obs: 'obs nova'
}), [
  { c: 'Recebimento', de: '10-06', para: '12-06' },
  { c: 'Envio',       de: '04-05', para: '05-05' },
  { c: 'Piscina',     de: 'Atica', para: 'Unlimited' },
  { c: 'Loja',        de: 'Loja',  para: 'Loja Nova' },
  { c: 'Tipo',        de: 'Até 02 Projetos', para: 'Conceito' },
  { c: 'Gde Alteração', de: 'Não', para: 'Sim' },
  { c: 'Obs',         de: '', para: 'obs nova' }
]);

// ── Resultado ────────────────────────────────────────────────────
console.log(`\n${passed + failed} testes — ✓ ${passed} passaram, ${failed > 0 ? '✗ ' + failed + ' falharam' : '0 falharam'}\n`);
if (failed > 0) process.exit(1);
