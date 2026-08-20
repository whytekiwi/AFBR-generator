function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)]\((https?:\/\/[^ )]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let listType = null;

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const heading = line.match(/^#{1,6}\s+(.+)$/);

    if (unordered || ordered) {
      const nextListType = unordered ? 'ul' : 'ol';
      if (listType !== nextListType) {
        closeList();
        html.push(`<${nextListType}>`);
        listType = nextListType;
      }
      html.push(`<li>${inlineMarkdown((unordered ?? ordered)[1])}</li>`);
      continue;
    }

    closeList();
    if (heading) {
      html.push(`<h3>${inlineMarkdown(heading[1])}</h3>`);
    } else if (line.trim() !== '') {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  return html.join('\n');
}
