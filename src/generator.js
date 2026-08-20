import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const A4_HEIGHT_PX = 1122.519685;

async function measureDepartmentPages(page) {
  return page.evaluate((pageHeight) => {
    return Object.fromEntries(
      [...document.querySelectorAll('[data-toc-id]')].map((element) => [
        element.dataset.tocId,
        Math.floor(element.getBoundingClientRect().top / pageHeight) + 1,
      ]),
    );
  }, A4_HEIGHT_PX);
}

function samePages(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function generatePdf({ documentModel, outputFile, theme }) {
  await mkdir(dirname(outputFile), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let pageNumbers = Object.fromEntries(
      documentModel.tableOfContents.map(({ id }) => [id, 0]),
    );

    for (let pass = 0; pass < 3; pass += 1) {
      await page.setContent(await theme.render(documentModel, pageNumbers), {
        waitUntil: 'load',
      });
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => document.fonts.ready);

      const measuredPages = await measureDepartmentPages(page);
      if (samePages(pageNumbers, measuredPages)) break;
      pageNumbers = measuredPages;
    }

    await page.setContent(await theme.render(documentModel, pageNumbers), {
      waitUntil: 'load',
    });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: outputFile,
      preferCSSPageSize: true,
      printBackground: true,
      ...theme.pdfOptions,
    });

    return pageNumbers;
  } finally {
    await browser.close();
  }
}
