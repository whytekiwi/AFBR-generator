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

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderTable(headerCells, rows) {
  const thead = `<thead><tr>${headerCells.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let listType = null;
  let quoteLines = null;

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };

  // consecutive `>` lines become a single callout, blank lines inside split it into paragraphs
  const closeQuote = () => {
    if (!quoteLines) return;
    const paragraphs = quoteLines.join('\n').split(/\n\s*\n/).filter((paragraph) => paragraph.trim() !== '');
    html.push(`<blockquote class="callout">${paragraphs
      .map((paragraph) => `<p>${inlineMarkdown(paragraph.replace(/\s*\n\s*/g, ' ').trim())}</p>`)
      .join('')}</blockquote>`);
    quoteLines = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const quote = line.match(/^\s*>\s?(.*)$/);

    if (quote) {
      closeList();
      quoteLines = quoteLines ?? [];
      quoteLines.push(quote[1]);
      continue;
    }
    closeQuote();

    if (line.includes('|') && TABLE_SEPARATOR.test(lines[index + 1] ?? '')) {
      closeList();
      const headerCells = splitTableRow(line);
      const rows = [];
      index += 2; // skip past the header row and the "---" separator row
      while (index < lines.length && lines[index].trim() !== '' && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1; // the loop's increment will advance past the last consumed row
      html.push(renderTable(headerCells, rows));
      continue;
    }

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
  closeQuote();
  return html.join('\n');
}
