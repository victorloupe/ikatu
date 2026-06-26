#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// bump-version.js — Ikatu
//
// Uso:  node bump-version.js
//
// O que faz:
//   1. Gera um sufixo de versão baseado na data/hora atual (YYYYMMDD-HHmm)
//   2. Substitui TODOS os ?v=... nos arquivos HTML listados
//   3. Incrementa o número do CACHE no sw.js  (ex: ikatu-v28 → ikatu-v29)
//
// Por que isso importa:
//   Antes era preciso editar manualmente ~10 lugares antes de cada deploy.
//   Agora: `node bump-version.js` e pronto.
// ══════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

// ── Configuração ──────────────────────────────────────────────────

const ROOT = __dirname;

// Arquivos HTML onde os ?v=... devem ser atualizados
const HTML_FILES = [
  'index.html',
  'admin.html',
  'pagamentos.html',
  'avisos.html',
  'chat.html',
  'login.html',
  'projetos.html',
  'links.html',
  'mobile/index.html',
  'mobile/admin.html',
  'mobile/avisos.html',
  'mobile/chat.html',
  'mobile/pagamentos.html',
  'mobile/perfil.html',
  'mobile/prancha.html',
];

const SW_FILE = 'sw.js';

// ── Helpers ───────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function buildVersionSuffix() {
  const d = new Date();
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

// ── 1. Versão dos assets nos HTMLs ────────────────────────────────

const newVersion = buildVersionSuffix();
let htmlCount = 0;

for (const rel of HTML_FILES) {
  const full = path.join(ROOT, rel);
  if (!fileExists(full)) {
    console.log(`  ⚠  skipped (not found): ${rel}`);
    continue;
  }

  const original = fs.readFileSync(full, 'utf8');
  // Substitui qualquer ?v=XXXXXXXX (letras e números) por ?v=<novo>
  const updated = original.replace(/\?v=[a-zA-Z0-9]+/g, `?v=${newVersion}`);

  if (updated !== original) {
    fs.writeFileSync(full, updated, 'utf8');
    console.log(`  ✓  ${rel}  →  ?v=${newVersion}`);
    htmlCount++;
  } else {
    console.log(`  –  ${rel}  (sem ?v= para atualizar)`);
  }
}

// ── 2. CACHE version no sw.js ─────────────────────────────────────

const swPath = path.join(ROOT, SW_FILE);
if (fileExists(swPath)) {
  const swOriginal = fs.readFileSync(swPath, 'utf8');
  const match = swOriginal.match(/const CACHE\s*=\s*'ikatu-v(\d+)'/);

  if (match) {
    const oldNum = parseInt(match[1], 10);
    const newNum = oldNum + 1;
    const swUpdated = swOriginal.replace(
      /const CACHE\s*=\s*'ikatu-v\d+'/,
      `const CACHE = 'ikatu-v${newNum}'`
    );
    fs.writeFileSync(swPath, swUpdated, 'utf8');
    console.log(`  ✓  sw.js  →  ikatu-v${oldNum} → ikatu-v${newNum}`);
  } else {
    console.log(`  ⚠  sw.js: padrão 'ikatu-vN' não encontrado, pulando.`);
  }
} else {
  console.log(`  ⚠  ${SW_FILE} não encontrado.`);
}

// ── Resumo ────────────────────────────────────────────────────────

console.log('');
console.log(`✅ bump-version concluído.`);
console.log(`   Versão aplicada nos HTMLs: ${newVersion}`);
console.log(`   Arquivos HTML atualizados: ${htmlCount}`);
console.log('');
console.log('Próximo passo: git add -A && git commit -m "chore: bump version" && git push');
