import { extname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
const COVER_HERO_PATH = fileURLToPath(
  new URL('../../assets/afterburn-report-hero.jpg', import.meta.url),
);
const COVER_LOGO_PATH = fileURLToPath(
  new URL('../../assets/kiwiburn-logo-tagline-white.png', import.meta.url),
);
const COVER_HERO_CREDIT = '2026 Temple Burn. Design by Kym Skelton. Photo by John Williams.';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function imageDataUri(path, contentType) {
  const bytes = await readFile(path);
  const mimeType = contentType ?? MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function imageSource(src, inputDirectory, contentType) {
  return imageDataUri(resolve(inputDirectory, src), contentType);
}

const DEPARTMENT_COLOURS = [
  '#BE5555',
  '#AA6441',
  '#907237',
  '#7E7730',
  '#6A7E30',
  '#458131',
  '#328547',
  '#31816D',
  '#387D94',
  '#5175BD',
  '#736BC7',
  '#9160C3',
  '#B946B9',
];

function departmentIdentity(departmentIndex) {
  return { colour: DEPARTMENT_COLOURS[departmentIndex % DEPARTMENT_COLOURS.length] };
}

function departmentIndex(model, department) {
  return model.departments.findIndex(({ id }) => id === department.id);
}

function renderBlock(block, imageSources = new Map()) {
  switch (block.type) {
    case 'team-heading':
      return `<section class="layout-block team-heading" data-layout-block="${escapeHtml(block.id)}"><div class="team-heading-row"><h2>${escapeHtml(block.team.name)}</h2>${block.team.authorName ? `<p class="author">${escapeHtml(block.team.authorName)}</p>` : ''}</div></section>`;
    case 'not-received':
      return `<section class="layout-block not-received" data-layout-block="${escapeHtml(block.id)}"><strong>Not received</strong><p>This team has not supplied a report.</p></section>`;
    case 'empty':
      return `<section class="layout-block not-received" data-layout-block="${escapeHtml(block.id)}"><strong>Role was empty</strong><p>During the event- this role was empty. It may be filled now, but if it feels like home, <a href="https://kiwiburn.com/participate/volunteer/">check our open positions here</a></p></section>`;
    case 'report-section-heading':
      return `<section class="layout-block report-section-heading" data-layout-block="${escapeHtml(block.id)}"><h3>${escapeHtml(block.title)}</h3></section>`;
    case 'content-section-heading':
      return `<section class="layout-block content-section-heading" data-layout-block="${escapeHtml(block.id)}"><h1>${escapeHtml(block.title)}</h1></section>`;
    case 'report-markdown':
      return `<section class="layout-block report-markdown${block.continuation ? ' report-markdown--continuation' : ''}" data-layout-block="${escapeHtml(block.id)}">${renderMarkdown(block.markdown)}</section>`;
    case 'report-empty':
      return `<section class="layout-block report-empty" data-layout-block="${escapeHtml(block.id)}"><p>No response provided.</p></section>`;
    case 'department-image':
      return `<figure class="layout-block department-image" data-layout-block="${escapeHtml(block.id)}"><img src="${imageSources.get(block.insert.id) ?? ''}" alt="${escapeHtml(block.insert.altText ?? '')}">${block.insert.caption ? `<figcaption>${escapeHtml(block.insert.caption)}</figcaption>` : ''}</figure>`;
    case 'department-image-full':
      return `<figure class="layout-block department-image-full" data-layout-block="${escapeHtml(block.id)}"><img src="${imageSources.get(block.insert.id) ?? ''}" alt="${escapeHtml(block.insert.altText ?? '')}">${block.insert.caption ? `<figcaption>${escapeHtml(block.insert.caption)}</figcaption>` : ''}</figure>`;
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
    .content-section-heading { border-bottom: 1mm solid #52606d; margin-bottom: 4mm; padding-bottom: 3mm; }
    .content-section-heading h1 { color: #243b53; font-size: 22pt; line-height: 1.15; margin: 0; }
    .report-markdown { overflow-wrap: anywhere; padding-bottom: 3mm; text-align: justify; }
    .report-markdown:has(+ .report-markdown--continuation) { padding-bottom: 0; }
    .report-markdown:has(+ .report-markdown--continuation) > :last-child { margin-bottom: 0; }
    .report-markdown:has(+ .report-markdown--continuation) ul,
    .report-markdown:has(+ .report-markdown--continuation) ol { margin-bottom: 0; }
    .report-markdown p { margin-bottom: 2.5mm; }
    .report-markdown ul, .report-markdown ol { margin: 0 0 2.5mm; padding-left: 5mm; }
    .report-empty p, .not-received p { color: #667085; font-style: italic; margin-bottom: 0; }
    .not-received { background: #f5f7fa; border-left: 2mm solid #98a2b3; margin-bottom: 4mm; padding: 4mm 5mm; }
    .spread.image-spread:not(.department-start) { align-items: stretch; display: grid; }
    .spread.image-spread .image-page { align-items: center; display: flex; justify-content: center; overflow: hidden; }
    .spread.image-spread .image-page figure { margin: 0; max-width: 100%; text-align: center; }
    .spread.image-spread .image-page img { max-height: 160mm; max-width: 100%; object-fit: contain; }
    .spread.image-spread .image-page figcaption { color: #52606d; font-size: 8pt; margin-top: 2mm; }
    .department-image { height: 92mm; margin: auto 0 0; max-height: 92mm; overflow: hidden; padding-bottom: 2mm; width: 100%; }
    .department-image img { display: block; height: auto; max-height: 84mm; object-fit: contain; width: 100%; }
    .department-image figcaption { color: #52606d; font-size: 7.5pt; margin-top: 1mm; }
    .department-image-full { align-items: center; display: flex; flex: 1 1 auto; flex-direction: column; height: 100%; justify-content: center; margin: 0; overflow: hidden; padding-bottom: 0; width: 100%; }
    .department-image-full img { display: block; max-height: 100%; max-width: 100%; object-fit: contain; }
    .department-image-full figcaption { color: #52606d; flex: 0 0 auto; font-size: 7.5pt; margin-top: 2mm; }
    .department-start .booklet-page, .department-continuation .booklet-page { display: flex; flex-direction: column; }
  `;
}

function renderBlocks(units, blocks, imageSources) {
  return units.flatMap((unit) => unit.blockIds.map((id) => renderBlock(blocks[id], imageSources))).join('');
}

function renderWatermark(document) {
  return document.draft.enabled
    ? `<div class="watermark">${escapeHtml(document.draft.watermarkText || 'DRAFT')}</div>`
    : '';
}

function renderPageFooter(document, pageNumber) {
  return `<footer class="page-footer"><span>Kiwiburn ${escapeHtml(document.cycle)} - Afterburn Report</span><span>${pageNumber}</span></footer>`;
}

async function loadDepartmentImageSources(model) {
  const departmentImages = (model.outline ?? [])
    .filter((item) => item.type === 'department')
    .flatMap((item) => item.items)
    .filter((item) => item.type === 'image');
  const topLevelImages = (model.outline ?? []).filter((item) => item.type === 'image');
  const images = [...departmentImages, ...topLevelImages];
  const sources = await Promise.all(images.map(async (image) => [
    image.id,
    await imageSource(image.src, model.inputDirectory, image.contentType),
  ]));
  return new Map(sources);
}

function renderFrontSlot(slot, model, pageNumbers, imageSources) {
  switch (slot.type) {
    case 'contents':
      return `<p class="eyebrow">Navigation</p><h2>Contents</h2><ol class="contents-list">${model.tableOfContents.map(({ id, name }) => `<li><span>${escapeHtml(name)}</span><span>${pageNumbers[id] ?? ''}</span></li>`).join('')}</ol>`;
    case 'welcome':
      return `<p class="eyebrow">Front matter</p><h2>Welcome and leadership structure</h2><p>Fixed content will be supplied later.</p>${slot.pageIndex === 2 ? '<p>This second page is reserved for the leadership structure.</p>' : ''}`;
    case 'image':
      return `<figure class="frontmatter-image"><img src="${imageSources.get(slot.insert.id) ?? ''}" alt="${escapeHtml(slot.insert.altText ?? '')}">${slot.insert.caption ? `<figcaption>${escapeHtml(slot.insert.caption)}</figcaption>` : ''}</figure>`;
    case 'blank':
      return '';
    default:
      throw new Error(`Unsupported front-matter slot type "${slot.type}"`);
  }
}

async function renderSpread(spread, model, plan, imageSources) {
  if (spread.type === 'image-insert') {
    const source = await imageSource(
      spread.insert.src,
      model.inputDirectory,
      spread.insert.contentType,
    );
    if (!spread.department && (spread.insert.fullPage || spread.insert.fullWidth)) {
      return `<section class="spread image-spread"><figure><img src="${source}" alt="${escapeHtml(spread.insert.altText ?? '')}">${spread.insert.caption ? `<figcaption>${escapeHtml(spread.insert.caption)}</figcaption>` : ''}</figure>${renderPageFooter(model.document, spread.pdfPageNumber)}${renderWatermark(model.document)}</section>`;
    }
    const identity = spread.departmentStart
      ? departmentIdentity(departmentIndex(model, spread.department))
      : null;
    const className = identity ? 'spread image-spread department-start' : 'spread image-spread';
    const style = identity ? ` style="--department-colour: ${identity.colour}"` : '';
    const hero = identity
      ? `<header class="department-hero"><div><p>${escapeHtml(identity.eyebrow)}</p><h1>${escapeHtml(identity.title)}</h1></div></header>`
      : '';
    const imagePage = `<article class="booklet-page image-page"><figure><img src="${source}" alt="${escapeHtml(spread.insert.altText ?? '')}">${spread.insert.caption ? `<figcaption>${escapeHtml(spread.insert.caption)}</figcaption>` : ''}</figure></article>`;
    const contentPage = spread.slots?.[1]?.type === 'content'
      ? `<article class="booklet-page">${renderBlocks(spread.slots[1].units, plan.blocks, imageSources)}</article>`
      : '<article class="booklet-page blank-page"></article>';
    return `<section class="${className}"${style}>${hero}<div class="spread-grid">${imagePage}${contentPage}</div>${renderPageFooter(model.document, spread.pdfPageNumber)}${renderWatermark(model.document)}</section>`;
  }

  if (spread.type === 'financials') {
    return `<section class="spread final-spread"><div class="spread-grid"><article class="booklet-page"><p class="eyebrow">Final section</p><h2>${escapeHtml(spread.financials.title ?? 'Financials')}</h2><p>Financial information will be supplied later.</p></article><article class="booklet-page blank-page"></article></div>${renderPageFooter(model.document, spread.pdfPageNumber)}${renderWatermark(model.document)}</section>`;
  }

  if (spread.type === 'front-matter') {
    const pages = spread.slots.map((slot) => (
      slot.type === 'content'
        ? `<article class="booklet-page">${renderBlocks(slot.units, plan.blocks, imageSources)}</article>`
        : `<article class="booklet-page">${renderFrontSlot(slot, model, plan.pageNumbers, imageSources)}</article>`
    ));
    return `<section class="spread front-spread"><div class="spread-grid">${pages.join('')}</div>${renderPageFooter(model.document, spread.pdfPageNumber)}${renderWatermark(model.document)}</section>`;
  }

  const identity = departmentIdentity(
    departmentIndex(model, spread.department),
  );
  const isStart = spread.type === 'department-start';
  const className = isStart ? 'department-start' : 'department-continuation';
  const pages = spread.slots.map(
    (slot) => `<article class="booklet-page">${renderBlocks(slot.units, plan.blocks, imageSources)}</article>`,
  );
  const hero = isStart
    ? `<header class="department-hero"><h1>${escapeHtml(spread.department.name)}</h1></header>`
    : `<aside class="department-rail" aria-label="${escapeHtml(spread.department.name)} department">${escapeHtml(spread.department.name)}</aside>`;

  return `<section class="spread ${className}" style="--department-colour: ${identity.colour}">${hero}<div class="spread-grid">${pages.join('')}</div>${renderPageFooter(model.document, spread.pdfPageNumber)}${renderWatermark(model.document)}</section>`;
}

export const defaultTheme = {
  async renderMeasurement(model) {
    const { blocks } = createLayoutBlocks(model);

    return `<!doctype html><html><head><meta charset="utf-8"><style>${bodyStyles()} .measurement-column { width: 118.5mm; }</style></head><body><main class="measurement-column">${Object.values(blocks).map((block) => renderBlock(block)).join('')}</main></body></html>`;
  },
  async renderCover(model) {
    const [heroImage, logoImage] = await Promise.all([
      imageDataUri(COVER_HERO_PATH),
      imageDataUri(COVER_LOGO_PATH),
    ]);
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page { size: A5 portrait; margin: 0; } * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; } .cover { height: 210mm; overflow: hidden; position: relative; } .cover-upper { align-items: center; background: #11181c; display: flex; flex-direction: column; height: 105mm; justify-content: center; padding: 16mm 14mm; text-align: center; } .cover-branding img { display: block; height: auto; margin: 0 auto 11mm; max-height: 32mm; max-width: 88mm; object-fit: contain; } .cover-copy h1 { color: #f5efdf; font-size: 28pt; letter-spacing: -.035em; line-height: 1.04; margin: 0; } .spectrum-divider { display: grid; grid-template-columns: repeat(6, 1fr); height: 2mm; left: 0; position: absolute; right: 0; top: 104mm; z-index: 2; } .spectrum-divider span:nth-child(1) { background: #b67868; } .spectrum-divider span:nth-child(2) { background: #b39154; } .spectrum-divider span:nth-child(3) { background: #7c966c; } .spectrum-divider span:nth-child(4) { background: #679099; } .spectrum-divider span:nth-child(5) { background: #7485a4; } .spectrum-divider span:nth-child(6) { background: #9a768c; } .cover-hero { height: 105mm; margin: 0; position: relative; } .cover-hero img { display: block; height: 100%; object-fit: cover; object-position: center center; width: 100%; } .cover-hero figcaption { background: transparent; bottom: 3mm; color: white; font-size: 7pt; left: 4mm; padding: 0; position: absolute; right: auto; text-shadow: none; } .watermark { color: rgba(128, 0, 0, .18); font-size: 48pt; font-weight: bold; left: 50%; position: fixed; top: 50%; transform: translate(-50%, -50%) rotate(-35deg); z-index: 1; }</style></head><body><main class="cover"><section class="cover-upper"><section class="cover-branding"><img src="${logoImage}" alt="Kiwiburn logo and tagline"></section><section class="cover-copy"><h1>${escapeHtml(model.document.title)}</h1></section></section><div class="spectrum-divider" aria-hidden="true">${'<span></span>'.repeat(6)}</div><figure class="cover-hero"><img src="${heroImage}" alt="${escapeHtml(COVER_HERO_CREDIT)}"><figcaption>${escapeHtml(COVER_HERO_CREDIT)}</figcaption></figure>${renderWatermark(model.document)}</main></body></html>`;
  },
  async renderBody(model, plan) {
    const imageSources = await loadDepartmentImageSources(model);
    const spreads = await Promise.all(
      plan.spreads.map((spread) => renderSpread(spread, model, plan, imageSources)),
    );
    return `<!doctype html><html><head><meta charset="utf-8"><style>@page { size: A4 landscape; margin: 0; } ${bodyStyles()} body { background: white; } .spread { break-after: page; height: 210mm; overflow: hidden; padding: 10mm; position: relative; width: 297mm; } .spread-grid { display: grid; gap: 4mm; grid-template-columns: repeat(2, minmax(0, 1fr)); height: 190mm; } .booklet-page { background: #fff; min-width: 0; padding: 9mm; } .front-spread .booklet-page, .final-spread .booklet-page { background: #f8fafc; } .front-spread h2, .final-spread h2 { font-size: 22pt; line-height: 1.16; } .eyebrow { color: #52606d; font-size: 8pt; font-weight: bold; letter-spacing: .14em; text-transform: uppercase; } .contents-list { list-style: none; margin: 8mm 0 0; padding: 0; } .contents-list li { border-bottom: 1px solid #d9e2ec; display: flex; justify-content: space-between; padding: 2.4mm 0; } .department-hero { align-items: center; background: var(--department-colour); color: white; display: flex; height: 20mm; margin: -10mm -10mm 0; padding: 4.5mm 10mm; } .department-hero h1 { font-size: 22pt; line-height: 1; margin: 0; } .department-start .spread-grid { height: 170mm; } .department-continuation { padding-left: 17mm; } .department-continuation .spread-grid { height: 190mm; } .department-continuation .booklet-page { border-top: 1mm solid var(--department-colour); } .department-rail { background: var(--department-colour); bottom: 0; color: white; font-size: 8pt; font-weight: bold; left: 0; letter-spacing: .12em; padding: 8mm 3mm; position: absolute; text-orientation: mixed; text-transform: uppercase; top: 0; writing-mode: vertical-rl; } .image-spread { align-items: center; display: flex; justify-content: center; } .image-spread.department-start { display: block; } .image-spread.department-start figure { margin: 10mm auto 0; max-height: 150mm; } .image-spread.department-start img { max-height: 140mm; } .image-spread figure { margin: 0; max-height: 180mm; max-width: 260mm; text-align: center; } .image-spread img { display: block; height: auto; max-height: 170mm; max-width: 100%; } figcaption { color: #52606d; font-size: 8.5pt; margin-top: 3mm; } .frontmatter-image { align-items: center; display: flex; flex-direction: column; height: 100%; justify-content: center; margin: 0; } .frontmatter-image img { display: block; max-height: 160mm; max-width: 100%; object-fit: contain; } .frontmatter-image figcaption { color: #52606d; font-size: 8pt; margin-top: 3mm; text-align: center; } .page-footer { bottom: 4mm; color: #667085; display: flex; font-size: 8pt; justify-content: space-between; left: 10mm; position: absolute; right: 7mm; } .department-continuation .page-footer { left: 20mm; } .watermark { color: rgba(128, 0, 0, .16); font-size: 64pt; font-weight: bold; left: 50%; pointer-events: none; position: absolute; top: 50%; transform: translate(-50%, -50%) rotate(-35deg); z-index: 2; }</style></head><body>${spreads.join('')}</body></html>`;
  },
};
