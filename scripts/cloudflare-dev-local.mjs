import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const envPath = fileURLToPath(new URL('../.env', import.meta.url))
const wranglerPath = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
const dotenv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}

const requiredWorkerSecrets = [
  'NUXT_SESSION_PASSWORD',
  'NUXT_OAUTH_GITHUB_CLIENT_ID',
  'NUXT_OAUTH_GITHUB_CLIENT_SECRET',
  'IP_HASH_SECRET',
  'LIBRARY_ADMIN_TOKEN'
]
const wranglerCredentialNames = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_EMAIL'
]
const generatedWorkerConfigNames = [
  'AI_GATEWAY_ID',
  'CHAT_MODEL',
  'EMBEDDING_PROVIDER',
  'EMBEDDING_MODEL',
  'EMBEDDING_DIMENSIONS',
  'VECTORIZE_INDEX_NAME',
  'VECTORIZE_METRIC',
  'QUESTION_DAILY_LIMIT'
]

const wranglerEnv = { ...process.env }

for (const name of generatedWorkerConfigNames) {
  delete wranglerEnv[name]
}

for (const name of [...requiredWorkerSecrets, ...wranglerCredentialNames]) {
  const value = process.env[name] || dotenv[name]
  if (value) {
    wranglerEnv[name] = value
  }
}

const missingSecrets = requiredWorkerSecrets.filter(name => !wranglerEnv[name])
if (missingSecrets.length > 0) {
  console.error(`Missing required local Worker secrets: ${missingSecrets.join(', ')}`)
  process.exit(1)
}

const wrangler = spawn(process.execPath, [
  wranglerPath,
  'dev',
  '--config',
  '.output/server/wrangler.json',
  '--env-file',
  'scripts/cloudflare-dev-local.env',
  '--test-scheduled'
], {
  cwd: projectRoot,
  env: wranglerEnv,
  stdio: 'inherit'
})

wrangler.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

wrangler.on('exit', (code) => {
  process.exitCode = code ?? 1
})
