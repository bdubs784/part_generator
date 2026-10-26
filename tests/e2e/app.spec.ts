import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('status')).toHaveText(/Built in \d+ ms/, { timeout: 45_000 })
})

test('builds the default bearing and downloads a STEP', async ({ page }) => {
  const download = page.waitForEvent('download')
  await page.locator('.download-row', { hasText: 'outer ring' }).getByRole('button', { name: 'STEP' }).click()
  expect((await download).suggestedFilename()).toBe('outer_ring.step')
})

test('typing an impossible value shows an error and pauses downloads', async ({ page }) => {
  const count = page.getByLabel('Ball count', { exact: true })
  await count.fill('80')
  await expect(page.locator('.issues .error')).toContainText(/Only \d+ balls fit/)
  await expect(page.getByRole('button', { name: 'STEP' }).first()).toBeDisabled()

  await count.fill('30')
  await expect(page.locator('.issues')).toHaveCount(0)
  await expect(page.getByTestId('status')).toHaveText(/Built in/)
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
  await thickness.fill('7')
  await page.getByRole('button', { name: '↺ auto' }).click()
  await expect(thickness).toHaveValue('6.4')
})
