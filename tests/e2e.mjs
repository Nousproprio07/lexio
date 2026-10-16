/**
 * Parcours utilisateur complet, en mode démonstration (aucune donnée réelle).
 * Usage : npm run build && npm run e2e   (lance `vite preview` sur le port 4173)
 * Les captures sont écrites dans test-results/.
 */
import { chromium, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = 'test-results'
mkdirSync(OUT, { recursive: true })

const WORDS = [
  ['Résilience', 'Capacité à surmonter une difficulté et à retrouver un équilibre après une épreuve.', 'Français', "Elle a fait preuve d'une grande résilience."],
  ['Éphémère', 'Qui ne dure que très peu de temps.', 'Français', ''],
  ['Inflation', 'Hausse générale et durable du niveau des prix.', 'Économie', ''],
  ['Liquidité', 'Facilité avec laquelle un actif se convertit en monnaie.', 'Finance', ''],
  ['Sérendipité', 'Découverte heureuse faite par hasard.', '', ''],
]
const byDef = new Map(WORDS.map(([t, d]) => [d, t]))

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe' })
await new Promise((r) => setTimeout(r, 2500))

const failures = []
const check = (cond, msg) => {
  if (!cond) failures.push(msg)
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
}

async function run(label, contextOptions) {
  console.log(`\n=== ${label} ===`)
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const ctx = await browser.newContext({ ...contextOptions, locale: 'fr-FR', acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const shot = (name) => page.screenshot({ path: `${OUT}/${label}-${name}.png`, fullPage: true })

  await page.goto(BASE)
  await page.getByRole('button', { name: /mode démonstration/i }).click()
  await page.getByText('Un mot de plus, chaque jour.').first().waitFor()
  check(await page.getByText('Votre dictionnaire vous attend').isVisible(), 'accueil vide accueillant')
  await shot('01-accueil-vide')

  // --- ajout de mots -------------------------------------------------------
  await page.getByRole('button', { name: 'Ajouter mon premier mot' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Mot').waitFor()
  await dialog.getByRole('button', { name: 'Enregistrer le mot' }).click()
  check(await dialog.getByText('Indiquez le mot.').isVisible(), 'validation : mot requis')
  for (const [term, def, cat, ex] of WORDS) {
    await dialog.getByLabel('Mot').fill(term)
    await dialog.getByLabel('Définition').fill(def)
    await dialog.getByLabel(/^Catégorie/).fill(cat)
    await dialog.getByLabel(/^Exemple/).fill(ex)
    if (term === 'Inflation') await shot('02-formulaire')
    await dialog.getByRole('button', { name: 'Enregistrer le mot' }).click()
    await page.getByText(`« ${term} » ajouté`).waitFor()
    check((await dialog.getByLabel('Mot').inputValue()) === '', `« ${term} » enregistré, formulaire prêt pour le suivant`)
  }
  // doublon dans la même catégorie
  await dialog.getByLabel('Mot').fill('résilience ')
  await dialog.getByLabel(/^Catégorie/).fill('Français')
  check(await dialog.getByText(/existe déjà dans Français/).isVisible(), 'doublon détecté dans la même catégorie')
  await dialog.getByLabel(/^Catégorie/).fill('Philosophie')
  check(!(await dialog.getByText(/existe déjà/).isVisible()), 'même mot autorisé dans une autre catégorie')
  await dialog.getByLabel('Mot').fill('')
  await dialog.getByRole('button', { name: 'Terminer' }).click()
  await page.waitForTimeout(300)

  check((await page.locator('dl').first().innerText()).includes('5'), 'compteur de mots = 5')
  await shot('03-accueil')

  // --- dictionnaire ----------------------------------------------------------
  await page.goto(`${BASE}/dictionnaire`)
  await page.getByRole('heading', { name: 'Mon dictionnaire' }).waitFor()
  check((await page.locator('main li article').count()) === 5, 'liste de 5 mots')
  await page.getByLabel('Rechercher dans le dictionnaire').fill('serendip')
  await page.waitForTimeout(200)
  check((await page.locator('main li article').count()) === 1, 'recherche insensible aux accents')
  await page.getByLabel('Rechercher dans le dictionnaire').fill('')
  await page.getByLabel('Trier').selectOption('az')
  await page.waitForTimeout(100)
  const first = await page.locator('main li article h3').first().innerText()
  check(first === 'Éphémère', `tri alphabétique (premier : ${first})`)
  await shot('04-dictionnaire')
  await page.locator('main li article h3 button', { hasText: 'Inflation' }).click()
  await page.getByRole('dialog').getByText('Hausse générale').waitFor()
  await shot('05-fiche')
  await page.getByRole('dialog').getByRole('button', { name: 'Modifier' }).click()
  await page.getByRole('dialog').getByLabel(/^Exemple/).fill("L'inflation réduit le pouvoir d'achat.")
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer les modifications' }).click()
  await page.getByText('Modifications enregistrées').waitFor()
  check(true, 'modification enregistrée')

  // --- quiz mixte -------------------------------------------------------------
  await page.goto(`${BASE}/quiz`)
  await page.getByText('Mixte').click()
  await page.locator('label', { hasText: /^5$/ }).click()
  await shot('06-quiz-reglages')
  await page.getByRole('button', { name: /Commencer/ }).click()
  let wrongDone = false
  for (let i = 0; i < 5; i++) {
    await page.getByText(`Question ${i + 1} sur 5`).waitFor()
    if (i === 2) {
      // rechargement en pleine session : on doit pouvoir reprendre
      await page.reload()
      await page.getByText(`Question ${i + 1} sur 5`).waitFor()
      check(true, 'session conservée après rechargement')
    }
    const label = await page.locator('main .card p').first().innerText()
    if (/Quel est ce mot/i.test(label)) {
      const def = (await page.locator('main .card p').nth(1).innerText()).replace(/^«\s*|\s*»$/g, '')
      const term = byDef.get(def)
      check(!!term, 'définition affichée reconnue')
      const answer = wrongDone ? term.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '') : 'mauvaise réponse'
      await page.getByLabel('Votre réponse').fill(answer)
      if (i === 0) await shot('07-question-mot')
      await page.keyboard.press('Enter')
      const ok = await page.getByText('Bonne réponse !').isVisible().catch(() => false)
      check(ok === wrongDone, wrongDone ? 'réponse sans accents acceptée' : 'mauvaise réponse refusée')
      if (!wrongDone) await shot('08-feedback-erreur')
      wrongDone = true
    } else {
      const term = (await page.locator('main .card div').first().innerText()).trim()
      const def = [...byDef].find(([, t]) => t === term)[0]
      const options = page.getByRole('radio')
      check((await options.count()) === 4, 'quatre propositions')
      await page.getByRole('radio', { name: new RegExp(def.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
      if (i === 1) await shot('09-question-choix')
      await page.keyboard.press('Enter')
      check(await page.getByText('Bonne réponse !').isVisible(), 'bonne définition reconnue')
    }
    await page.keyboard.press('Enter') // question suivante via le clavier
  }
  await page.getByText(/bonnes? réponses?/).waitFor()
  const scoreText = await page.locator('section[aria-labelledby="score-title"]').innerText()
  check(/4 \/ 5/.test(scoreText) && /80 %/.test(scoreText), `score 4/5 (80 %)`)
  await shot('10-resultats')

  // --- réviser mes erreurs ----------------------------------------------------
  await page.getByRole('button', { name: 'Réviser mes erreurs' }).click()
  await page.getByText('Question 1 sur 1').waitFor()
  check(true, 'session « réviser mes erreurs » = 1 question')
  await page.getByRole('button', { name: /Quitter la session/ }).click()
  await page.getByText('Une session est en cours').waitFor()
  await page.getByRole('button', { name: 'Abandonner la session' }).click()
  await page.getByText('Nouveau quiz').waitFor()

  // --- progression ------------------------------------------------------------
  await page.goto(`${BASE}/progression`)
  await page.getByText('Réussite des dernières sessions').waitFor()
  const prog = await page.locator('main dl').innerText()
  check(/80 %/.test(prog), 'taux de réussite global affiché')
  check(/1 jour/.test(prog), 'série de 1 jour')
  check(await page.getByRole('button', { name: 'Réviser ces mots' }).isVisible(), 'mots difficiles proposés')
  await shot('11-progression')

  await page.goto(BASE)
  await shot('12-accueil-apres-quiz')

  // --- export ----------------------------------------------------------------
  await page.goto(`${BASE}/reglages`)
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: /Sauvegarde complète/ }).click()
  const file = await dl
  check(/lexio-sauvegarde-.*\.json/.test(file.suggestedFilename()), 'export JSON téléchargé')
  await shot('13-reglages')

  // --- suppression -------------------------------------------------------------
  await page.goto(`${BASE}/dictionnaire`)
  await page.getByRole('button', { name: 'Supprimer « Sérendipité »' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await page.getByText('« Sérendipité » supprimé').waitFor()
  check((await page.locator('main li article').count()) === 4, 'suppression avec confirmation')

  // débordement horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(overflow <= 0, `aucun défilement horizontal (${overflow}px)`)

  check(errors.length === 0, `aucune erreur console${errors.length ? ' : ' + errors.join(' | ') : ''}`)
  await browser.close()
}

try {
  await run('mobile', { ...devices['iPhone 13'], defaultBrowserType: undefined })
  await run('desktop', { viewport: { width: 1366, height: 860 } })
} finally {
  server.kill()
}
console.log(failures.length ? `\n${failures.length} échec(s)` : '\nTous les parcours sont passés.')
process.exit(failures.length ? 1 : 0)
