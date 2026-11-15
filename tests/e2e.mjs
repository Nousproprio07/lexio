/**
 * Parcours utilisateur complet, dans un navigateur vierge (données stockées sur l'appareil).
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
  // hors connexion (test volontaire), le navigateur signale les ressources non chargées (icône de l'onglet)
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_INTERNET_DISCONNECTED') && errors.push(m.text()))
  const shot = (name) => page.screenshot({ path: `${OUT}/${label}-${name}.png`, fullPage: true })

  // --- espace protégé par un code ----------------------------------------------
  await page.goto(BASE)
  await page.getByRole('heading', { name: 'Votre espace Lexio' }).waitFor()
  await shot('00-code')
  await page.getByLabel('Code d’accès').fill('soleil42')
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click()
  await page.getByText('Aucun espace ne correspond à ce code').waitFor()
  check(true, 'code inconnu refusé')
  await page.getByRole('button', { name: 'Créer un nouvel espace' }).click()
  await page.getByLabel('Nouveau code').fill('soleil42')
  await page.getByLabel('Confirmez le code').fill('soleil43')
  await page.getByRole('button', { name: 'Créer mon espace' }).click()
  check(await page.getByText('Les deux codes ne sont pas identiques.').isVisible(), 'confirmation du code vérifiée')
  await page.getByLabel('Confirmez le code').fill('soleil42')
  await shot('00-creation')
  await page.getByRole('button', { name: 'Créer mon espace' }).click()
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
  // persistance : rechargement, puis nouvel onglet après fermeture du premier
  await page.reload()
  await page.getByText('Mots enregistrés').waitFor()
  check((await page.locator('dl').first().innerText()).includes('5'), 'mots conservés après rechargement')
  const page2 = await ctx.newPage()
  await page2.goto(`${BASE}/dictionnaire`)
  await page2.getByLabel('Code d’accès').fill('soleil42')
  await page2.getByRole('button', { name: 'Ouvrir mon espace' }).click()
  await page2.getByRole('heading', { name: 'Mon dictionnaire' }).waitFor()
  check((await page2.locator('main li article').count()) === 5, 'mots retrouvés dans un nouvel onglet avec le code')
  await page2.close()
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
  check(await page.getByText(/Dernière sauvegarde le/).isVisible(), 'date de sauvegarde affichée')
  check(await page.getByText(/uniquement sur cet appareil/).isVisible(), 'stockage local expliqué')
  await shot('13-reglages')

  // --- suppression -------------------------------------------------------------
  await page.goto(`${BASE}/dictionnaire`)
  await page.getByRole('button', { name: 'Supprimer « Sérendipité »' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
  await page.getByText('« Sérendipité » supprimé').waitFor()
  check((await page.locator('main li article').count()) === 4, 'suppression avec confirmation')

  // --- verrouillage et second espace -------------------------------------------
  const stored = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('lexio')
        req.onsuccess = () => {
          const all = req.result.transaction('kv').objectStore('kv').getAll()
          all.onsuccess = () => resolve(JSON.stringify(all.result, (_, v) => (v instanceof ArrayBuffer ? new TextDecoder().decode(v) : v)))
        }
      }),
  )
  check(!stored.includes('Résilience') && !stored.includes('Inflation'), 'mots illisibles dans le stockage (chiffrés)')
  await page.goto(`${BASE}/reglages`)
  await page.getByRole('button', { name: 'Verrouiller l’espace' }).click()
  await page.getByRole('heading', { name: 'Votre espace Lexio' }).waitFor()
  await page.reload()
  check(await page.getByRole('heading', { name: 'Votre espace Lexio' }).isVisible(), 'code redemandé après verrouillage')
  await page.getByRole('button', { name: 'Créer un nouvel espace' }).click()
  await page.getByLabel('Nouveau code').fill('lune')
  await page.getByLabel('Confirmez le code').fill('lune')
  await page.getByRole('button', { name: 'Créer mon espace' }).click()
  await page.getByText('Votre dictionnaire vous attend').waitFor()
  check(true, 'un autre code ouvre un espace vide et séparé')
  await page.goto(`${BASE}/reglages`)
  await page.getByRole('button', { name: 'Verrouiller l’espace' }).click()
  await page.getByLabel('Code d’accès').fill('soleil42')
  await page.getByRole('button', { name: 'Ouvrir mon espace' }).click()
  await page.getByText('Mots enregistrés').waitFor()
  check((await page.locator('dl').first().innerText()).includes('4'), 'le premier code rouvre ses 4 mots')

  // --- culture générale ----------------------------------------------------------
  // une question saisie par erreur dans « Mots »
  await page.goto(`${BASE}/dictionnaire`)
  await page.getByRole('button', { name: 'Ajouter un mot' }).first().click()
  await dialog.getByLabel('Mot').fill('Qui a peint la Joconde ?')
  await dialog.getByLabel('Définition').fill('Léonard de Vinci')
  await dialog.getByRole('button', { name: 'Enregistrer le mot' }).click()
  await page.getByText('ajouté à votre dictionnaire').waitFor()
  await dialog.getByRole('button', { name: 'Terminer' }).click()
  await page.getByText(/ressemble à des questions de culture générale/).click()
  await page.getByRole('heading', { name: 'Culture générale' }).waitFor()
  await shot('14-culture-a-ranger')
  await page.locator('section[aria-labelledby="misplaced-title"]').getByRole('button', { name: 'Transformer' }).click()
  check((await dialog.getByLabel('Question', { exact: true }).inputValue()) === 'Qui a peint la Joconde ?', 'transformation : la question est reprise')
  check((await dialog.getByLabel('Bonne réponse', { exact: true }).inputValue()) === 'Léonard de Vinci', 'transformation : la réponse est reprise')
  await dialog.locator('input[type=file]').setInputFiles('public/icon-512.png')
  await dialog.locator('img[alt="Image de la question"]').waitFor()
  await dialog.getByLabel(/^Autres réponses/).fill('Vinci, De Vinci')
  await dialog.getByLabel(/^Catégorie/).fill('Peintres')
  await shot('15-question-formulaire')
  await dialog.getByRole('button', { name: 'Transformer', exact: true }).click()
  await page.getByText('Transformé en question de culture générale').waitFor()
  check(!(await page.locator('section[aria-labelledby="misplaced-title"]').isVisible()), 'plus rien à ranger')

  const QUESTIONS = [
    ['Qui a peint Guernica ?', 'Pablo Picasso'],
    ['Qui a peint Les Tournesols ?', 'Vincent van Gogh'],
    ['Qui a peint Impression, soleil levant ?', 'Claude Monet'],
  ]
  const answerOf = new Map([['Qui a peint la Joconde ?', 'Léonard de Vinci'], ...QUESTIONS])
  await page.getByRole('button', { name: 'Ajouter une question' }).first().click()
  await dialog.getByRole('button', { name: 'Enregistrer la question' }).click()
  check(await dialog.getByText('Indiquez la bonne réponse.').isVisible(), 'validation : réponse requise')
  for (const [question, answer] of QUESTIONS) {
    await dialog.getByLabel('Question', { exact: true }).fill(question)
    await dialog.getByLabel('Bonne réponse', { exact: true }).fill(answer)
    await dialog.getByLabel(/^Catégorie/).fill('Peintres')
    await dialog.getByRole('button', { name: 'Enregistrer la question' }).click()
    await page.getByText('Question ajoutée').last().waitFor()
    await page.waitForTimeout(150)
  }
  await dialog.getByRole('button', { name: 'Terminer' }).click()
  await page.waitForTimeout(300)
  check((await page.locator('main li article').count()) === 4, '4 questions en culture générale')
  const imgOk = await page.locator('main li article img').first().evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)
  check(imgOk, 'image déchiffrée et affichée')
  await shot('16-culture')

  // vraies images depuis Wikipédia (nécessite Internet)
  const fill = page.getByRole('button', { name: /Compléter les images manquantes/ })
  check(/3/.test(await fill.innerText()) && /1 question illustrée sur 4/.test(await fill.innerText()), 'compteur : 3 sans image, 1 illustrée sur 4')
  await fill.click()
  check(await dialog.getByText('Question 1 sur 3').isVisible(), 'images : 3 questions sans image')
  const subject = await dialog.locator('.bg-page').first().innerText()
  await dialog.getByRole('button', { name: 'Valider cette image' }).waitFor({ timeout: 20000 })
  console.log('  proposée :', await dialog.locator('figure img').getAttribute('alt'), '| pour :', subject.replace(/\n/g, ' / '))
  await shot('16b-images-wikipedia')
  await dialog.getByRole('button', { name: 'Valider cette image' }).click()
  await dialog.getByText('Question 2 sur 3').waitFor({ timeout: 20000 })
  check(await dialog.getByText('2 questions illustrées sur 4').isVisible(), 'progression : 2 questions illustrées sur 4')
  await dialog.getByRole('button', { name: 'Arrêter' }).click()
  await page.waitForTimeout(500)
  check((await page.locator('main li article img').count()) === 2, '2 questions ont maintenant une image')
  // la question illustrée est inchangée, avec l'attribution de l'image
  const [illustratedQ, illustratedA] = subject.split('\n').map((t) => t.replace(/^Réponse : /, '').trim()).filter(Boolean)
  await page.locator('main li article h3 button', { hasText: illustratedA }).click()
  check(await dialog.getByText(illustratedQ, { exact: true }).isVisible(), 'question inchangée')
  check(await dialog.getByText(/^Image : .*(Wikimedia Commons|Wikipédia)/).isVisible(), 'attribution de l’image conservée')
  await shot('16c-fiche-attribution')
  await dialog.getByRole('button', { name: 'Fermer' }).click()
  // hors connexion : les images enregistrées s'affichent toujours
  await ctx.setOffline(true)
  await page.getByRole('link', { name: 'Accueil' }).first().click()
  await page.getByRole('link', { name: 'Culture G.' }).first().click()
  await page.waitForTimeout(500)
  const offlineOk = await page.locator('main li article img').evaluateAll((imgs) => imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0))
  check(offlineOk, 'images affichées hors connexion')
  await ctx.setOffline(false)

  await page.goto(`${BASE}/dictionnaire`)
  await page.getByRole('heading', { name: 'Mon dictionnaire' }).waitFor()
  check((await page.locator('main li article').count()) === 4, 'les questions ne sont plus dans Mots')

  await page.goto(`${BASE}/quiz?section=culture`)
  check(await page.getByRole('tab', { name: 'Culture générale', selected: true }).isVisible(), 'quiz : section culture générale')
  await page.locator('label', { hasText: /^Tous$/ }).click()
  await shot('17-quiz-culture-reglages')
  await page.getByRole('button', { name: /Commencer · 4 questions/ }).click()
  for (let i = 0; i < 4; i++) {
    await page.getByText(`Question ${i + 1} sur 4`).waitFor()
    const prompt = await page.locator('main .card').first().innerText()
    const question = [...answerOf.keys()].find((k) => prompt.includes(k))
    check(!!question, `question affichée (${question})`)
    check((await page.getByRole('radio').count()) === 4, 'quatre réponses proposées')
    if (question === 'Qui a peint la Joconde ?') {
      check(await page.locator('main .card img').first().waitFor().then(() => true, () => false), 'image affichée avec la question')
      await shot('18-question-image')
    }
    await page.getByRole('radio', { name: answerOf.get(question) }).click()
    await page.keyboard.press('Enter')
    check(await page.getByText('Bonne réponse !').isVisible(), 'bonne réponse reconnue')
    await page.keyboard.press('Enter')
  }
  await page.getByText(/bonnes? réponses?/).waitFor()
  check(/4 \/ 4/.test(await page.locator('section[aria-labelledby="score-title"]').innerText()), 'score culture 4/4')
  await page.getByRole('button', { name: "Retour à l'accueil" }).click()
  await page.getByRole('heading', { name: 'Culture générale' }).waitFor()
  await shot('19-accueil-culture')

  await page.goto(`${BASE}/reglages`)
  const dl2 = page.waitForEvent('download')
  await page.getByRole('button', { name: /Sauvegarde complète/ }).click()
  const backup = await (await dl2).path().then((p) => import('node:fs').then((fs) => fs.readFileSync(p, 'utf8')))
  check(backup.includes('"kind": "question"') && backup.includes('data:image/'), 'sauvegarde avec les questions et leurs images')
  const keys = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('lexio')
        req.onsuccess = () => {
          const all = req.result.transaction('kv').objectStore('kv').getAllKeys()
          all.onsuccess = () => resolve(all.result)
        }
      }),
  )
  check(keys.some((k) => String(k).startsWith('img:')), 'image rangée à part, chiffrée')

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
