import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { renderMarkdown } from '../markdown.js';

const MIME_TYPES = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function imageSource(src, inputDirectory) {
  const path = resolve(inputDirectory, src);
  const bytes = await readFile(path);
  const mimeType = MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function renderSection(section, model, pageNumbers) {
  switch (section.type) {
    case 'cover':
      return `<section class="page cover"><p class="eyebrow">${escapeHtml(model.document.cycle)}</p><h1>${escapeHtml(model.document.title)}</h1></section>`;
    case 'contents':
      return `<section class="page contents"><h2>Contents</h2><ol>${model.tableOfContents
        .map(({ id, name }) => `<li><span>${escapeHtml(name)}</span><span>${pageNumbers[id] || '...'}</span></li>`)
        .join('')}</ol></section>`;
    case 'department':
      return `<section class="page department" data-toc-id="${escapeHtml(section.id)}"><p class="eyebrow">Department</p><h2>${escapeHtml(section.name)}</h2></section>`;
    case 'team-report':
      return `<article class="team-report"><header><p class="eyebrow">${escapeHtml(section.departmentName)} · ${escapeHtml(section.reportStage)}</p><h2>${escapeHtml(section.teamName)}</h2><p>${escapeHtml(section.authorName ?? '')}</p></header>${section.sections
        .map(({ id, title, markdown }) => `<section class="report-section" data-section="${id}"><h3>${escapeHtml(title)}</h3>${markdown.trim() ? renderMarkdown(markdown) : '<p class="empty">No response provided.</p>'}</section>`)
        .join('')}</article>`;
    case 'image-insert': {
      const source = await imageSource(section.src, model.inputDirectory);
      return `<figure class="image-insert image-${escapeHtml(section.layout ?? 'full-width')}"><img src="${source}" alt="${escapeHtml(section.altText ?? '')}">${section.caption ? `<figcaption>${escapeHtml(section.caption)}</figcaption>` : ''}</figure>`;
    }
    case 'welcome':
      return `<section class="page placeholder welcome"><h2>Welcome and leadership structure</h2><p>Fixed content will be supplied later.</p></section>`;
    case 'financials':
      return `<section class="page placeholder"><h2>${escapeHtml(section.title ?? 'Financials')}</h2><p>Financial information will be supplied later.</p></section>`;
    case 'placeholder':
      return `<section class="page placeholder"><h2>${escapeHtml(section.title ?? 'Placeholder')}</h2><p>Content will be supplied later.</p></section>`;
    default:
      throw new Error(`Unsupported document section type "${section.type}"`);
  }
}

export const defaultTheme = {
  pdfOptions: {
    displayHeaderFooter: true,
    footerTemplate:
      '<div style="font-family:Arial,sans-serif;font-size:8pt;text-align:center;width:100%;color:#667085;">Page <span class="pageNumber"></span></div>',
    headerTemplate: '<div></div>',
    margin: { bottom: '12mm' },
  },
  async render(model, pageNumbers) {
    const sections = await Promise.all(
      model.sections.map((section) => renderSection(section, model, pageNumbers)),
    );
    const watermark = model.document.draft.enabled
      ? `<div class="watermark">${escapeHtml(model.document.draft.watermarkText || 'DRAFT')}</div>`
      : '';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      body { color: #1f2933; font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; margin: 0; }
      .page { break-before: page; min-height: 297mm; padding: 24mm 22mm; position: relative; }
      .cover { break-before: auto; display: grid; place-content: center; text-align: center; }
      .department { background: #f2f4f5; display: grid; place-content: center; }
      .team-report { break-inside: avoid; padding: 14mm 22mm 8mm; }
      .team-report + .team-report { border-top: 1px solid #cbd2d9; }
      .report-section { break-inside: avoid; margin: 0 0 7mm; }
      .contents ol { list-style: none; margin: 0; padding: 0; }
      .contents li { display: flex; justify-content: space-between; padding: 2mm 0; }
      .image-insert { break-inside: avoid; margin: 12mm 22mm; }
      .image-insert img { display: block; height: auto; max-width: 100%; }
      .image-half-page img { max-height: 130mm; object-fit: contain; }
      .empty { color: #667085; font-style: italic; }
      .eyebrow { font-size: 8pt; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; }
      h1 { font-size: 34pt; line-height: 1.15; }
      h2 { font-size: 24pt; line-height: 1.2; }
      h3 { font-size: 13pt; margin-bottom: 2mm; }
      .watermark { color: rgba(128, 0, 0, 0.18); font-size: 70pt; font-weight: bold; left: 50%; position: fixed; top: 50%; transform: translate(-50%, -50%) rotate(-35deg); z-index: 10; }
    </style>
  </head>
  <body class="${model.document.draft.enabled ? 'draft' : 'final'}">
    ${watermark}
    ${sections.join('\n')}
  </body>
</html>`;
  },
};
