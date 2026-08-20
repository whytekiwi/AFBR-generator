import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { renderMarkdown } from '../markdown.js';
import { createLayoutBlocks } from '../layout.js';

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

const DEPARTMENT_COLOURS = [
  '#2F6690',
  '#9A5B13',
  '#6B4E9B',
  '#16756B',
  '#A5445B',
  '#356859',
  '#806517',
];

function departmentIdentity(department) {
  const hash = [...department.id].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return { colour: DEPARTMENT_COLOURS[hash % DEPARTMENT_COLOURS.length] };
}

function renderBlock(block) {
  switch (block.type) {
    case 'team-heading':
      return `<section class="layout-block team-heading" data-layout-block="${escapeHtml(block.id)}"><div class="team-heading-row"><h2>${escapeHtml(block.team.name)}</h2>${block.team.authorName ? `<p class="author">${escapeHtml(block.team.authorName)}</p>` : ''}</div></section>`;
    case 'not-received':
      return `<section class="layout-block not-received" data-layout-block="${escapeHtml(block.id)}"><strong>Not received</strong><p>This team has not supplied a report.</p></section>`;
    case 'report-section-heading':
      return `<section class="layout-block report-section-heading" data-layout-block="${escapeHtml(block.id)}"><h3>${escapeHtml(block.title)}</h3></section>`;
    case 'report-markdown':
      return `<section class="layout-block report-markdown" data-layout-block="${escapeHtml(block.id)}">${renderMarkdown(block.markdown)}</section>`;
    case 'report-empty':
      return `<section class="layout-block report-empty" data-layout-block="${escapeHtml(block.id)}"><p>No response provided.</p></section>`;
    default:
      throw new Error(`Unsupported layout block type "${block.type}"`);
  }
}

function bodyStyles() {
  return `
    * { box-sizing: border-box; }
    body { color: #1f2933; font-family: Arial, sans-serif; font-size: 9.5pt; line-height: 1.42; margin: 0; }
    h1, h2, h3, p { margin-top: 0; }
    .layout-block { break-inside: avoid; padding-bottom: 3mm; }
    .team-heading { border-bottom: 1px solid #cbd2d9; margin-bottom: 2mm; padding-bottom: 3mm; }
    .team-heading-row { align-items: baseline; display: flex; gap: 4mm; justify-content: space-between; }
    .team-heading h2 { flex: 1 1 auto; font-size: 16pt; line-height: 1.15; margin: 0; min-width: 0; }
    .author { color: #52606d; flex: 0 0 auto; font-size: 8.5pt; margin: 0; text-align: right; }
    .report-section-heading { padding-bottom: 1mm; }
    .report-section-heading h3 { color: #243b53; font-size: 11pt; line-height: 1.2; margin: 0; }
    .report-markdown { overflow-wrap: anywhere; padding-bottom: 3mm; }
    .report-markdown p { margin-bottom: 2.5mm; }
    .report-markdown ul, .report-markdown ol { margin: 0 0 2.5mm; padding-left: 5mm; }
    .report-empty p, .not-received p { color: #667085; font-style: italic; margin-bottom: 0; }
    .not-received { background: #f5f7fa; border-left: 2mm solid #98a2b3; margin-bottom: 4mm; padding: 4mm 5mm; }
  `;
}

function renderBlocks(units, blocks) {
  return units.flatMap((unit) => unit.blockIds.map((id) => renderBlock(blocks[id]))).join('');
}

function renderWatermark(document) {
  return document.draft.enabled
    ? `<div class="watermark">${escapeHtml(document.draft.watermarkText || 'DRAFT')}</div>`
    : '';
}

function renderFrontSlot(slot, model, pageNumbers) {
  switch (slot.type) {
    case 'contents':
      return `<p class="eyebrow">Navigation</p><h2>Contents</h2><ol class="contents-list">${model.tableOfContents.map(({ id, name }) => `<li><span>${escapeHtml(name)}</span><span>${pageNumbers[id]}</span></li>`).join('')}</ol>`;
    case 'placeholder':
      return `<p class="eyebrow">Front matter</p><h2>${escapeHtml(slot.section?.title ?? 'Placeholder')}</h2><p>Content will be supplied later.</p>`;
    case 'welcome':
      return `<p class="eyebrow">Front matter</p><h2>Welcome and leadership structure</h2><p>Fixed content will be supplied later.</p>${slot.pageIndex === 2 ? '<p>This second page is reserved for the leadership structure.</p>' : ''}`;
    case 'blank':
      return '';
    default:
      throw new Error(`Unsupported front-matter slot type "${slot.type}"`);
  }
}

async function renderSpread(spread, model, plan) {
  if (spread.type === 'image-insert') {
    const source = await imageSource(spread.insert.src, model.inputDirectory);
    return `<section class="spread image-spread"><figure><img src="${source}" alt="${escapeHtml(spread.insert.altText ?? '')}">${spread.insert.caption ? `<figcaption>${escapeHtml(spread.insert.caption)}</figcaption>` : ''}</figure><span class="page-number">${spread.pdfPageNumber}</span>${renderWatermark(model.document)}</section>`;
  }

  if (spread.type === 'financials') {
    return `<section class="spread final-spread"><div class="spread-grid"><article class="booklet-page"><p class="eyebrow">Final section</p><h2>${escapeHtml(spread.financials.title ?? 'Financials')}</h2><p>Financial information will be supplied later.</p></article><article class="booklet-page blank-page"></article></div><span class="page-number">${spread.pdfPageNumber}</span>${renderWatermark(model.document)}</section>`;
  }

  if (spread.type === 'front-matter') {
    return `<section class="spread front-spread"><div class="spread-grid">${spread.slots.map((slot) => `<article class="booklet-page">${renderFrontSlot(slot, model, plan.pageNumbers)}</article>`).join('')}</div><span class="page-number">${spread.pdfPageNumber}</span>${renderWatermark(model.document)}</section>`;
  }

  const identity = departmentIdentity(spread.department);
  const isStart = spread.type === 'department-start';
  const className = isStart ? 'department-start' : 'department-continuation';
  const pages = spread.slots.map(
    (slot) => `<article class="booklet-page">${renderBlocks(slot.units, plan.blocks)}</article>`,
  );
  const hero = isStart
    ? `<header class="department-hero"><h1>${escapeHtml(spread.department.name)}</h1></header>`
    : `<aside class="department-rail" aria-label="${escapeHtml(spread.department.name)} department">${escapeHtml(spread.department.name)}</aside>`;

  return `<section class="spread ${className}" style="--department-colour: ${identity.colour}">${hero}<div class="spread-grid">${pages.join('')}</div><span class="page-number">${spread.pdfPageNumber}</span>${renderWatermark(model.document)}</section>`;
}

export const defaultTheme = {
  async renderMeasurement(model) {
    const { blocks } = createLayoutBlocks(model);

    return `<!doctype html><html><head><meta charset="utf-8"><style>${bodyStyles()} .measurement-column { width: 118.5mm; }</style></head><body><main class="measurement-column">${Object.values(blocks).map(renderBlock).join('')}</main></body></html>`;
  },
  async renderCover(model) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page { size: A5 portrait; margin: 0; } * { box-sizing: border-box; } body { margin: 0; color: #1f2933; font-family: Arial, sans-serif; } .cover { align-items: center; background: #f5f8fa; display: flex; height: 210mm; justify-content: center; padding: 24mm; position: relative; text-align: center; } .eyebrow { font-size: 8pt; font-weight: bold; letter-spacing: .16em; text-transform: uppercase; } h1 { font-size: 31pt; line-height: 1.12; margin: 4mm 0; } .cover-rule { background: #2f6690; height: 2mm; margin: 8mm auto; width: 34mm; } .watermark { color: rgba(128, 0, 0, .18); font-size: 48pt; font-weight: bold; left: 50%; position: fixed; top: 50%; transform: translate(-50%, -50%) rotate(-35deg); }</style></head><body><main class="cover"><div><p class="eyebrow">${escapeHtml(model.document.cycle)}</p><div class="cover-rule"></div><h1>${escapeHtml(model.document.title)}</h1><p>Afterburn report booklet</p></div>${renderWatermark(model.document)}</main></body></html>`;
  },
  async renderBody(model, plan) {
    const spreads = await Promise.all(plan.spreads.map((spread) => renderSpread(spread, model, plan)));
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page { size: A4 landscape; margin: 0; } ${bodyStyles()} body { background: white; } .spread { break-after: page; height: 210mm; overflow: hidden; padding: 10mm; position: relative; width: 297mm; } .spread-grid { display: grid; gap: 4mm; grid-template-columns: repeat(2, minmax(0, 1fr)); height: 190mm; } .booklet-page { background: #fff; min-width: 0; padding: 9mm; } .front-spread .booklet-page, .final-spread .booklet-page { background: #f8fafc; } .front-spread h2, .final-spread h2 { font-size: 22pt; line-height: 1.16; } .eyebrow { color: #52606d; font-size: 8pt; font-weight: bold; letter-spacing: .14em; text-transform: uppercase; } .contents-list { list-style: none; margin: 8mm 0 0; padding: 0; } .contents-list li { border-bottom: 1px solid #d9e2ec; display: flex; justify-content: space-between; padding: 2.4mm 0; } .department-hero { align-items: center; background: var(--department-colour); color: white; display: flex; height: 20mm; margin: -10mm -10mm 0; padding: 4.5mm 10mm; } .department-hero h1 { font-size: 22pt; line-height: 1; margin: 0; } .department-start .spread-grid { height: 170mm; } .department-continuation { padding-left: 17mm; } .department-continuation .spread-grid { height: 190mm; } .department-continuation .booklet-page { border-top: 1mm solid var(--department-colour); } .department-rail { background: var(--department-colour); bottom: 0; color: white; font-size: 8pt; font-weight: bold; left: 0; letter-spacing: .12em; padding: 8mm 3mm; position: absolute; text-orientation: mixed; text-transform: uppercase; top: 0; writing-mode: vertical-rl; } .image-spread { align-items: center; display: flex; justify-content: center; } .image-spread figure { margin: 0; max-height: 180mm; max-width: 260mm; text-align: center; } .image-spread img { display: block; height: auto; max-height: 170mm; max-width: 100%; } figcaption { color: #52606d; font-size: 8.5pt; margin-top: 3mm; } .page-number { bottom: 4mm; color: #667085; font-size: 8pt; position: absolute; right: 7mm; } .watermark { color: rgba(128, 0, 0, .16); font-size: 64pt; font-weight: bold; left: 50%; pointer-events: none; position: absolute; top: 50%; transform: translate(-50%, -50%) rotate(-35deg); z-index: 2; }</style></head><body>${spreads.join('')}</body></html>`;
  },
};
