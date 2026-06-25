// ═══════════════════════════════════════════════════
// SINCRONIZAÇÃO COM O SUPABASE
// ═══════════════════════════════════════════════════

export async function salvarProjeto(payload, existingId) {
  try {
    // A função sbSalvarProjeto está declarada no escopo global (supabase-client.js)
    if (window.sbSalvarProjeto) {
      const id = await window.sbSalvarProjeto(payload, existingId || null);
      return id;
    } else {
      throw new Error('Supabase Client (sbSalvarProjeto) não encontrado no escopo global.');
    }
  } catch(e) {
    console.error('Erro ao salvar projeto no Supabase:', e);
    throw e;
  }
}

export async function listarProjetos() {
  try {
    if (window.sbListarProjetos) {
      return await window.sbListarProjetos();
    } else {
      console.warn('Supabase Client (sbListarProjetos) não encontrado no escopo global.');
      return [];
    }
  } catch(e) {
    console.error('Erro ao listar projetos:', e);
    return [];
  }
}

export async function deletarProjeto(id) {
  try {
    if (window.sbDeletarProjeto) {
      await window.sbDeletarProjeto(id);
    } else {
      throw new Error('Supabase Client (sbDeletarProjeto) não encontrado no escopo global.');
    }
  } catch(e) {
    console.error('Erro ao deletar projeto:', e);
    throw e;
  }
}
