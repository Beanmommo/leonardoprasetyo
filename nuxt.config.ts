// https://nuxt.com/docs/api/configuration/nuxt-config
const isProductionBuild = process.env.NODE_ENV === 'production'
const isBuildCommand = process.env.npm_lifecycle_event === 'build'
  || process.argv.includes('build')
const isCloudflareLocalDev = process.env.CLOUDFLARE_LOCAL_DEV === '1'
const configuredCloudflareDatabaseId = process.env.NUXT_HUB_CLOUDFLARE_DATABASE_ID
const configuredDevCloudflareDatabaseId = process.env.NUXT_HUB_CLOUDFLARE_DEV_DATABASE_ID
const configuredDevVectorizeIndex = process.env.VECTORIZE_DEV_INDEX_NAME
const cloudflareDatabaseIdPattern = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

if (
  isProductionBuild
  && isBuildCommand
  && !isCloudflareLocalDev
  && (
    !configuredCloudflareDatabaseId
    || !cloudflareDatabaseIdPattern.test(configuredCloudflareDatabaseId)
    || /^0+$/.test(configuredCloudflareDatabaseId.replaceAll('-', ''))
  )
) {
  throw new Error('NUXT_HUB_CLOUDFLARE_DATABASE_ID must be a real D1 UUID for production builds')
}

if (
  isProductionBuild
  && isBuildCommand
  && isCloudflareLocalDev
  && (
    !configuredDevCloudflareDatabaseId
    || !cloudflareDatabaseIdPattern.test(configuredDevCloudflareDatabaseId)
    || /^0+$/.test(configuredDevCloudflareDatabaseId.replaceAll('-', ''))
  )
) {
  throw new Error('NUXT_HUB_CLOUDFLARE_DEV_DATABASE_ID must be the development D1 UUID for dev:local')
}

const cloudflareDatabaseId = isCloudflareLocalDev
  ? configuredDevCloudflareDatabaseId || '00000000-0000-0000-0000-000000000000'
  : configuredCloudflareDatabaseId || '00000000-0000-0000-0000-000000000000'
const cloudflareDatabaseName = isCloudflareLocalDev
  ? 'leonardoprasetyo-dev'
  : 'leonardoprasetyo-prod'
const cloudflareBucketName = isCloudflareLocalDev
  ? 'leonardoprasetyo-uploads-dev'
  : 'leonardoprasetyo-uploads-prod'
const cloudflareVectorizeIndex = isCloudflareLocalDev
  ? configuredDevVectorizeIndex || 'leonardoprasetyo-documents-dev'
  : 'leonardoprasetyo-documents-prod'
const cloudflareIndexingWorkflowName = isCloudflareLocalDev
  ? 'leonardoprasetyo-library-indexing-dev'
  : 'leonardoprasetyo-library-indexing-prod'
const remoteCloudflareBinding = isCloudflareLocalDev ? { remote: true } as const : {}
const requiredCloudflareSecrets = {
  secrets: {
    required: [
      'NUXT_SESSION_PASSWORD',
      'NUXT_OAUTH_GITHUB_CLIENT_ID',
      'NUXT_OAUTH_GITHUB_CLIENT_SECRET',
      'IP_HASH_SECRET',
      'LIBRARY_ADMIN_TOKEN'
    ]
  }
} as const

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@comark/nuxt',
    '@nuxthub/core',
    'nuxt-auth-utils',
    'nuxt-charts',
    'nuxt-csurf'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    // These mutations are protected by an allowlisted GitHub session or the
    // constant-time LIBRARY_ADMIN_TOKEN check used by CI/CLI. Session-backed
    // mutations also enforce a same-origin request in assertLibraryAdmin.
    // @ts-expect-error nuxt-csurf adds this route-rule key at runtime, but its
    // module augmentation is not visible through Nuxt 4's generated config type.
    '/api/admin/library/**': { csurf: false }
  },

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    preset: isProductionBuild ? 'cloudflare-module' : undefined,
    ...(isProductionBuild ? { entry: './runtime/cloudflare-entry.mjs' } : {}),
    experimental: {
      openAPI: true
    },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        ...requiredCloudflareSecrets,
        name: 'leonardoprasetyo',
        compatibility_date: '2026-08-29',
        compatibility_flags: ['nodejs_compat'],
        ai: {
          binding: 'AI',
          ...remoteCloudflareBinding
        },
        d1_databases: [{
          binding: 'DB',
          database_name: cloudflareDatabaseName,
          database_id: cloudflareDatabaseId,
          ...remoteCloudflareBinding
        }],
        r2_buckets: [{
          binding: 'BLOB',
          bucket_name: cloudflareBucketName,
          ...remoteCloudflareBinding
        }],
        vectorize: [{
          binding: 'VECTORIZE',
          index_name: cloudflareVectorizeIndex,
          ...remoteCloudflareBinding
        }],
        workflows: [{
          binding: 'INDEXING_WORKFLOW',
          name: cloudflareIndexingWorkflowName,
          class_name: 'LibraryIndexingWorkflow',
          // @ts-expect-error Nitro's vendored Wrangler type lags the current
          // Wrangler schema, which supports Workflow concurrency limits.
          concurrency: {
            limit: 1
          }
        }],
        vars: {
          AI_GATEWAY_ID: 'leonardoprasetyo',
          CHAT_MODEL: '@cf/ibm-granite/granite-4.0-h-micro',
          EMBEDDING_PROVIDER: 'workers-ai',
          EMBEDDING_MODEL: '@cf/qwen/qwen3-embedding-0.6b',
          EMBEDDING_DIMENSIONS: '1024',
          VECTORIZE_INDEX_NAME: cloudflareVectorizeIndex,
          VECTORIZE_METRIC: 'cosine',
          QUESTION_DAILY_LIMIT: '5'
        },
        triggers: {
          crons: ['17 0 * * *']
        },
        observability: {
          enabled: true,
          logs: {
            enabled: true,
            head_sampling_rate: 1,
            invocation_logs: true
          },
          // @ts-expect-error Nitro's vendored Wrangler type lags the current
          // Wrangler schema, which supports observability.traces.
          traces: {
            enabled: true,
            head_sampling_rate: 0.01
          }
        }
      }
    }
  },

  hub: {
    db: 'sqlite',
    blob: isProductionBuild
      ? {
          driver: 'cloudflare-r2',
          binding: 'BLOB',
          bucketName: cloudflareBucketName
        }
      : true
  },

  vite: {
    optimizeDeps: {
      include: ['striptags']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
