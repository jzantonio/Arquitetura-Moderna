// =====================================================================
// FIAMS Campo · configuração
// Cole aqui os dados do seu projeto Supabase (Project Settings → API).
// Enquanto os dois campos estiverem vazios, o app funciona em MODO
// DEMONSTRAÇÃO: os dados ficam só neste navegador (bom para testar).
// =====================================================================
export const CONFIG = {
  SUPABASE_URL: 'https://mbaojesxkkwnjpmjgcqj.supabase.co',        // ex.: 'https://abcdefghijk.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iYW9qZXN4a2t3bmpwbWpnY3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MDY4MTcsImV4cCI6MjEwNjI4MjgxN30.LTjK41DVxox2Cxl1NHkTStE98EgoOAXD6L242WrbCRs',   // chave "anon public"
  // E-mails da supervisão (o papel real é definido no banco, tabela "supervisores").
  SUPERVISORES: ['jose.lopes@undb.edu.br', 'luis.longhi@undb.edu.br'],
  // Domínio sugerido no cadastro dos alunos (apenas aviso; deixe '' para não sugerir).
  DOMINIO_SUGERIDO: '@undb.edu.br',
};
