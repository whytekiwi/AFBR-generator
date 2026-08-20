import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { createSpreadPlan } from './layout.js';

async function measureLayoutBlocks(page, theme, documentModel) {
  await page.setContent(await theme.renderMeasurement(documentModel), {
    waitUntil: 'load',
  });
  await page.evaluate(() => document.fonts.ready);

  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-layout-block]')].map((element) => [
        element.dataset.layoutBlock,
        (() => {
          const styles = getComputedStyle(element);
          return (
            element.getBoundingClientRect().height
            + Number.parseFloat(styles.marginBlockStart)
            + Number.parseFloat(styles.marginBlockEnd)
          );
        })(),
      ]),
    ),
  );
}

async function mergePdfs(paths) {
  const merged = await PDFDocument.create();

  for (const path of paths) {
    const source = await PDFDocument.load(await readFile(path));
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((pdfPage) => merged.addPage(pdfPage));
  }

  return merged.save();
}

async function verifyPageCount(path, expectedPageCount, segmentName) {
  const document = await PDFDocument.load(await readFile(path));
  if (document.getPageCount() !== expectedPageCount) {
    throw new Error(
      `${segmentName} rendered ${document.getPageCount()} pages; expected ${expectedPageCount}`,
    );
  }
}

export async function generatePdf({ documentModel, outputFile, theme }) {
  await mkdir(dirname(outputFile), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'afterburn-report-'));
  try {
    const page = await browser.newPage();
    const measurements = await measureLayoutBlocks(page, theme, documentModel);
    const plan = createSpreadPlan(documentModel, measurements);
    const coverPath = join(temporaryDirectory, 'cover.pdf');
    const bodyPath = join(temporaryDirectory, 'body.pdf');

    await page.setContent(await theme.renderCover(documentModel), {
      waitUntil: 'load',
    });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: coverPath,
      preferCSSPageSize: true,
      printBackground: true,
    });

    await page.setContent(await theme.renderBody(documentModel, plan), {
      waitUntil: 'load',
    });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: bodyPath,
      preferCSSPageSize: true,
      printBackground: true,
    });

    await verifyPageCount(coverPath, 1, 'Cover');
    await verifyPageCount(bodyPath, plan.spreads.length, 'Body');
    await writeFile(outputFile, await mergePdfs([coverPath, bodyPath]));

    return plan.pageNumbers;
  } finally {
    await browser.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
