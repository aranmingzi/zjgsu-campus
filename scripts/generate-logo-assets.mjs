import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const sourcePath = fileURLToPath(
  new URL('../public/logo/zjgsu-campus-logo.svg', import.meta.url),
)
const outputDirectory = fileURLToPath(
  new URL('../public/logo/', import.meta.url),
)
const svg = await readFile(sourcePath, 'utf8')

const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { display: grid; place-items: center; background: #f8fcff; }
      svg { width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>${svg}</body>
</html>`

const browser = await chromium.launch({ channel: 'chrome', headless: true })

try {
  for (const size of [1024, 512, 256, 128, 64, 32]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(html, { waitUntil: 'load' })
    await page.screenshot({
      path: join(outputDirectory, `zjgsu-campus-logo-${size}.png`),
      omitBackground: false,
    })
    await page.close()
  }
} finally {
  await browser.close()
}

console.log(`Generated logo assets from ${sourcePath}`)
