// Génère les icônes PNG à partir de public/icon.svg (npm run icons).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/icon.svg', 'utf8')
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
for (const [size, file, bg] of [[512, 'public/icon-512.png', false], [180, 'public/apple-touch-icon.png', true]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  // iOS arrondit lui-même les coins : fond plein pour l'apple-touch-icon
  const body = bg ? svg.replace('rx="112"', 'rx="0"') : svg
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${body}`)
  await page.screenshot({ path: file, omitBackground: true })
  await page.close()
}
await browser.close()
