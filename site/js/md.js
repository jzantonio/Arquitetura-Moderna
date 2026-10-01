// Formatação simples dos textos públicos (portal e editor da administração).
// Aceita: "## Título", "### Subtítulo", listas com "- ", **negrito**, *itálico* e [texto](https://…).
// O texto é escapado antes de formatar, então nenhum HTML digitado é executado.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, (_, t, u) => {
      const ext = u.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${u}"${ext}>${t}</a>`;
    });
}

export function md(text = '') {
  return String(text).replace(/\r/g, '').split(/\n{2,}/).map((block) => {
    const b = block.trim();
    if (!b) return '';
    if (b.startsWith('### ')) return `<h3>${inline(b.slice(4))}</h3>`;
    if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-•] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•] /, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}
