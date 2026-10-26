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
