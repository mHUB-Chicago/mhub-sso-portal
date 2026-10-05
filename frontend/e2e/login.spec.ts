import { expect, test, type Page } from '@playwright/test'
import { E2E_API_URL } from '../playwright.config'

// Screenshots land here so they can be shared for review (e.g. with Xavier/QA).
const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true })

const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const mockStartLogin = (page: Page, requiresOtp: boolean) =>
  page.route(`${E2E_API_URL}/api/login/start`, (route) =>
    route.fulfill(json(200, {
      success: true,
      message: 'Success',
      data: { request_id: 'req-1', isPendingMembership: false, requiresOtp, peopleVineLandingUrl: null },
    })),
  )

test.beforeEach(async ({ page }) => {
  // Anything not mocked by a test fails like an unauthenticated call would.
  await page.route(`${E2E_API_URL}/**`, (route) => route.fulfill(json(401, { success: false, message: 'Unauthorized' })))
})

const enterEmail = async (page: Page, email: string) => {
  await page.goto('/login')
  await page.getByLabel('Email or Username').fill(email)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Password')).toBeVisible()
}

test('email step', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome Back!' })).toBeVisible()
  await shot(page, '01-login-email-step')
})

test('first-time login message is red and bold', async ({ page }) => {
  await mockStartLogin(page, true)
  await enterEmail(page, 'new.member@example.com')

  const otpMessage = page.getByText('If this is your first time logging in, check your email for a one-time password.')
  await expect(otpMessage).toBeVisible()
  await expect(otpMessage).toHaveCSS('font-weight', '700')
  await expect(otpMessage).toHaveCSS('color', /^(rgb\(185, 28, 28\)|oklch\(0\.505 0\.213 27\.518\))$/) // tailwind red-700
  await shot(page, '02-login-password-step-first-time-message')
})

test('inactive account sees an inline "contact an admin" message', async ({ page }) => {
  await mockStartLogin(page, true)
  await page.route(`${E2E_API_URL}/api/login/verify`, (route) =>
    route.fulfill(json(403, { success: false, message: 'Your account is inactive. Please contact an admin.', code: 'ACCOUNT_INACTIVE' })),
  )
  await enterEmail(page, 'inactive.member@example.com')

  await page.getByLabel('Password').fill('ABCD1234')
  await page.getByRole('button', { name: 'Sign in' }).click()

  const alert = page.getByRole('alert').filter({ hasText: 'Your account is inactive. Please contact an admin.' })
  await expect(alert).toBeVisible()
  await expect(page.getByText('If this is your first time logging in')).toHaveCount(0)
  // Still on the login page — no session, no redirect to change-password.
  await expect(page).toHaveURL(/\/login$/)
  await shot(page, '03-login-inactive-account')

  // Going back to the email step clears it.
  await page.getByRole('button', { name: 'inactive.member@example.com' }).click()
  await expect(alert).toHaveCount(0)
})
