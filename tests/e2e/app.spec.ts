import { expect, test, type Page } from '@playwright/test'

const type = async (page: Page, label: string, value: string) => {
  const box = page.getByLabel(label, { exact: true })
  await box.fill(value)
  await box.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('status')).toHaveText(/Built in \d+ ms/, { timeout: 45_000 })
})

test('builds the default bearing and downloads a STEP', async ({ page }) => {
  const download = page.waitForEvent('download')
  await page.locator('.download-row', { hasText: 'outer ring' }).getByRole('button', { name: 'STEP' }).click()
  expect((await download).suggestedFilename()).toBe('outer_ring.step')
})

test('typed values are clamped to the absolute limits', async ({ page }) => {
  await type(page, 'Outer diameter', '99999999')
  await expect(page.getByLabel('Outer diameter', { exact: true })).toHaveValue('250')
  await type(page, 'Outer diameter', '-5000')
  await expect(page.getByLabel('Outer diameter', { exact: true })).toHaveValue('10')
})

test('an impossible value shows errors, Make it fit keeps the edit', async ({ page }) => {
  await type(page, 'Outer diameter', '45')
  await expect(page.locator('.issues .error').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'STEP' }).first()).toBeDisabled()

  await page.getByRole('button', { name: 'Make it fit' }).click()
  await expect(page.locator('.issues .note')).toContainText('Bore 52 →')
  await expect(page.locator('.issues .error')).toHaveCount(0)
  await expect(page.getByLabel('Outer diameter', { exact: true })).toHaveValue('45')
  await expect(page.getByTestId('status')).toHaveText(/Built in/)
})

test('undo, redo and start over', async ({ page }) => {
  await type(page, 'Ball count', '20')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Ball count', { exact: true })).toHaveValue('32')
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByLabel('Ball count', { exact: true })).toHaveValue('20')
  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.getByLabel('Ball count', { exact: true })).toHaveValue('32')
})

test('play stops at zero until negative play is allowed', async ({ page }) => {
  const slider = page.getByLabel('Play slider')
  await expect(slider).toHaveAttribute('min', '0')
  await page.getByLabel('Allow negative play').check()
  await expect.poll(async () => Number(await slider.getAttribute('min'))).toBeLessThan(0)
})

test('editing an auto value pins it, reset puts it back', async ({ page }) => {
  const thickness = page.getByLabel('Thickness', { exact: true })
  await expect(thickness).toHaveValue('6.4')
  await type(page, 'Thickness', '7')
  await page.getByRole('button', { name: '↺ auto' }).click()
  await expect(thickness).toHaveValue('6.4')
})

test('picking a standard size fills in its real dimensions and fits the rest', async ({ page }) => {
  const start = page.getByLabel('Start from')
  await expect(start.locator('option', { hasText: '608:' })).toHaveCount(1)
  await start.selectOption({ label: '608: 8 × 22 × 7 (skateboard / spool holders)' })
  await expect(page.locator('.issues .note')).toContainText('608: 8 × 22 × 7 mm')
  await expect(page.getByLabel('Bore', { exact: true })).toHaveValue('8')
  await expect(page.getByLabel('Outer diameter', { exact: true })).toHaveValue('22')
  await expect(page.getByLabel('Thickness', { exact: true })).toHaveValue('7')
  await expect(page.locator('.issues .error')).toHaveCount(0)
  await expect(page.getByTestId('status')).toHaveText(/Built in/)
})

test('share link saves the design and opening it restores it', async ({ page }) => {
  await type(page, 'Ball count', '21')
  await expect(page.getByTestId('status')).toHaveText(/Built in/)
  await page.getByRole('button', { name: 'Share link' }).click()
  const link = page.getByLabel('Share link')
  await expect(link).toHaveValue(/\?d=[a-z2-9]{6}$/)
  const url = await link.inputValue()

  await page.goto(url)
  await expect(page.locator('.issues .note')).toContainText('Opened shared design')
  await expect(page.getByLabel('Ball count', { exact: true })).toHaveValue('21')
})

test('moving a slider rebuilds the preview, going back is served from the cache', async ({ page }) => {
  const status = page.getByTestId('status')
  const slider = page.getByLabel('Ball count slider')
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByLabel('Ball count', { exact: true })).toHaveValue('33')
  await expect(status).toHaveText(/Built in \d+ ms$/)
  await page.keyboard.press('ArrowLeft')
  await expect(status).toHaveText(/Built in \d+ ms \(cached\)/)
})

test('shared designs show up in the gallery and open from it', async ({ page }) => {
  await type(page, 'Ball count', '19')
  await expect(page.getByTestId('status')).toHaveText(/Built in/)
  await page.getByRole('button', { name: 'Share link' }).click()
  const link = await page.getByLabel('Share link').inputValue()
  const id = link.split('d=')[1]

  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByRole('button', { name: 'Gallery' }).click()
  const card = page.getByTestId(`card-${id}`)
  await expect(card).toContainText('19 ×')
  await card.click()
  await expect(page.getByRole('dialog', { name: 'Gallery' })).toHaveCount(0)
  await expect(page.getByLabel('Ball count', { exact: true })).toHaveValue('19')
})

test('downloading a shared design counts toward its downloads', async ({ page, request }) => {
  await type(page, 'Ball count', '18')
  await expect(page.getByTestId('status')).toHaveText(/Built in/)
  await page.getByRole('button', { name: 'Share link' }).click()
  const id = (await page.getByLabel('Share link').inputValue()).split('d=')[1]
  const before = (await (await request.get(`http://127.0.0.1:8787/api/designs/${id}`)).json()).downloads

  const download = page.waitForEvent('download')
  await page.locator('.download-row', { hasText: 'inner ring' }).getByRole('button', { name: 'STL' }).click()
  expect((await download).suggestedFilename()).toBe('inner_ring.stl')
  await expect
    .poll(async () => (await (await request.get(`http://127.0.0.1:8787/api/designs/${id}`)).json()).downloads)
    .toBe(before + 1)
})
