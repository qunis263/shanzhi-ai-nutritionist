import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/33826/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const outputDir = new URL('../docs/assets/work-intro/', import.meta.url)
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.25 })

await page.addInitScript(() => {
  localStorage.setItem(
    'shanzhi_auth_v1',
    JSON.stringify({ username: 'document-preview', loginAt: Date.now() })
  )
})

const shots = [
  ['#/', '01-home.png'],
  ['#/chat', '02-ai-chat.png'],
  ['#/intervention', '03-intervention.png'],
  ['#/evaluation', '04-evaluation.png']
]

for (const [route, filename] of shots) {
  await page.goto(`http://127.0.0.1:5173/${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: fileURLToPath(new URL(filename, outputDir)), fullPage: false })
}

await browser.close()
