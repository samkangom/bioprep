import fs from 'node:fs'
import { defineConfig } from '@playwright/test'

// Uses the Chromium that ships with Playwright. In sandboxes with a pre-installed browser, set PW_CHROMIUM=/path/to/chrome.
const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = process.env.PW_CHROMIUM || (fs.existsSync(preinstalled) ? preinstalled : undefined)

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5180', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { executablePath, args: ['--no-sandbox'] } },
  // Boots the local stack (database + auth + storage stand-in + API) and the Vite dev server. Never touches real services.
  webServer: { command: 'node e2e/serve.mjs', url: 'http://127.0.0.1:5180', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
})
