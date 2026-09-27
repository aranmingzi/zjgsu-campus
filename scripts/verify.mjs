import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173'
const routes = [
  '/course',
  '/course/detail/strategy',
  '/course/review/new',
  '/course/teacher/%E9%99%88%E8%80%81%E5%B8%88',
  '/course/add',
  '/forum',
  '/forum/detail/poll-1',
  '/forum/post',
  '/forum/hole',
  '/forum/hidden',
  '/market',
  '/market/detail/market-1',
  '/market/edit',
  '/market/mine',
  '/campus',
  '/campus/add',
  '/campus/event/event-1',
  '/campus/blindbox',
  '/mine',
  '/profile',
  '/user/card/friend-1',
  '/friends',
  '/chats',
  '/chat/friend-1',
  '/mine/favorites',
  '/mine/drafts',
  '/guide',
  '/calendar',
  '/resources',
  '/places',
  '/memo',
  '/admin/moderation',
]

const tabRoutes = new Set(['/course', '/forum', '/market', '/campus', '/mine'])
const screenshotDirUrl = new URL('../test-results/screenshots/', import.meta.url)
const screenshotDir = fileURLToPath(screenshotDirUrl)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitForServer(url, timeout = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const server = spawn(
  process.execPath,
  ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173'],
  {
    cwd: new URL('..', import.meta.url),
    stdio: 'ignore',
    windowsHide: true,
  },
)

let browser

try {
  await waitForServer(baseURL)
  await mkdir(screenshotDirUrl, { recursive: true })
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  assert(routes.length === 32, `Expected 32 routes, received ${routes.length}`)

  for (const route of routes) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' })
    await page.locator('main').waitFor({ state: 'visible' })

    const dimensions = await page.locator('main').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    assert(
      dimensions.scrollWidth <= dimensions.clientWidth + 1,
      `${route} overflows horizontally`,
    )

    const navCount = await page.getByRole('navigation', { name: '主导航' }).count()
    if (tabRoutes.has(route)) {
      assert(navCount === 1, `${route} should show the bottom navigation`)
    } else {
      assert(navCount === 0, `${route} should hide the bottom navigation`)
      assert(await page.getByRole('button', { name: '返回' }).isVisible(), `${route} is missing back navigation`)
    }
  }
  assert(pageErrors.length === 0, `Page errors: ${pageErrors.join('; ')}`)

  await page.goto(`${baseURL}/forum/post`)
  await page.getByRole('button', { name: '只发主题' }).click()
  await page.waitForTimeout(420)
  assert(
    !(await page.getByPlaceholder('闲置分享、失物寻物、组队计划…').isVisible()),
    'Topic-only transition should collapse the body textarea',
  )
  await page.getByRole('switch').click()
  assert(
    (await page.getByRole('switch').getAttribute('aria-checked')) === 'true',
    'Anonymous switch did not turn on',
  )

  await page.getByRole('button', { name: '发起投票' }).click()
  await page.waitForTimeout(460)
  await page.getByPlaceholder('填写投票标题，最多 30 字').fill('周末活动时间投票')
  await page.getByPlaceholder('选项 1').fill('上午')
  await page.getByPlaceholder('选项 2').fill('下午')
  assert(
    await page.getByRole('button', { name: '发布帖子' }).isEnabled(),
    'Vote post should be publishable with a title and two options',
  )
  await page.getByRole('button', { name: '添加选项' }).click()
  await page.getByPlaceholder('选项 5').waitFor({ state: 'visible' })

  await page.goto(`${baseURL}/forum`)
  await page.getByRole('img', { name: '暖光小夜灯' }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /校园乐队返场/ }).click()
  await page.getByText('287 人已参与').waitFor({ state: 'visible' })

  await page.goto(`${baseURL}/forum/hole`)
  const emotionShell = page.locator('.emotion-shell')
  const initialBackground = await emotionShell.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--emotion-base').trim(),
  )
  await page.getByRole('button', { name: /开心/ }).click()
  await page.waitForTimeout(850)
  const happyBackground = await emotionShell.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--emotion-base').trim(),
  )
  assert(
    initialBackground !== happyBackground,
    'Tree hole emotion background did not change when switching emotions',
  )
  await page.getByRole('button', { name: /愤怒/ }).click()
  await page.getByRole('button', { name: /拍拍你/ }).first().waitFor({ state: 'visible' })

  await page.goto(`${baseURL}/forum/detail/poll-1`)
  await page.getByText('事件投票').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /校园乐队返场/ }).click()
  await page.getByText('已记录').waitFor({ state: 'visible' })
  assert(
    await page.getByText('邀请同学来投票').isVisible(),
    'Vote detail share CTA is missing',
  )

  await page.goto(`${baseURL}/places`)
  await page.getByRole('button', { name: /查看师生之家/ }).click()
  assert(await page.getByRole('dialog').isVisible(), 'Map marker did not open the bottom sheet')
  assert(await page.getByRole('button', { name: /步行路线/ }).isVisible(), 'Walking route action missing')
  assert(await page.getByRole('button', { name: /呼叫校车/ }).isVisible(), 'Campus bus action missing')

  await page.goto(`${baseURL}/profile`)
  await page.getByRole('button', { name: '修改' }).click()
  assert(await page.getByRole('dialog').isVisible(), 'Privacy selector did not open')

  await page.goto(`${baseURL}/course`)
  await page
    .getByText('还没有评价，来做第一个分享体验的人')
    .waitFor({ state: 'visible', timeout: 5_000 })

  await page.goto(`${baseURL}/market`)
  await page.getByPlaceholder('搜丢失的物品 / 闲置').fill('完全不存在的物品')
  await page.getByText('这里空空如也').waitFor({ state: 'visible', timeout: 5_000 })
  await page
    .getByRole('link', { name: '发布第一件闲置' })
    .waitFor({ state: 'visible', timeout: 5_000 })

  await page.goto(`${baseURL}/course`)
  const navLinks = page.getByRole('navigation', { name: '主导航' }).getByRole('link')
  assert((await navLinks.count()) === 5, 'Bottom navigation should contain five links')
  const hitTargets = await navLinks.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  )
  assert(hitTargets.every((height) => height >= 44), 'Bottom navigation contains an undersized target')

  for (const route of ['/course', '/forum', '/market', '/campus']) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' })
    const fab = page.locator('main + a').first()
    await fab.waitFor({ state: 'visible' })
    const before = await fab.boundingBox()
    await page.locator('main').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await page.waitForTimeout(100)
    const after = await fab.boundingBox()
    assert(before && after, `${route} floating action button is not measurable`)
    assert(
      Math.abs(before.y - after.y) <= 2,
      `${route} floating action button scrolls away with page content`,
    )
    assert(after.height >= 44, `${route} floating action button is smaller than 44px`)
  }

  for (const route of ['/course', '/forum', '/campus/blindbox', '/places', '/profile']) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: join(screenshotDir, `${route.replaceAll('/', '_') || 'home'}.png`),
      fullPage: false,
    })
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${baseURL}/course`, { waitUntil: 'networkidle' })
  await page.screenshot({
    path: join(screenshotDir, 'desktop-frame.png'),
    fullPage: false,
  })

  console.log(`Verified ${routes.length} routes in Chrome at 390x844 and 1440x900.`)
  console.log(`Screenshots: ${screenshotDir}`)
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (!server.killed) server.kill('SIGKILL')
}
