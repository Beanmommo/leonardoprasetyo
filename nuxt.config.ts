// https://nuxt.com/docs/api/configuration/nuxt-config
const isProductionBuild = process.env.NODE_ENV === 'production'
const isBuildCommand = process.env.npm_lifecycle_event === 'build'
  || process.argv.includes('build')
const configuredCloudflareDatabaseId = process.env.NUXT_HUB_CLOUDFLARE_DATABASE_ID
const cloudflareDatabaseIdPattern = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

if (
  isProductionBuild
  && isBuildCommand
  && (
    !configuredCloudflareDatabaseId
    || !cloudflareDatabaseIdPattern.test(configuredCloudflareDatabaseId)
    || /^0+$/.test(configuredCloudflareDatabaseId.replaceAll('-', ''))
  )
) {
  throw new Error('NUXT_HUB_CLOUDFLARE_DATABASE_ID must be a real D1 UUID for production builds')
}

const cloudflareDatabaseId = configuredCloudflareDatabaseId || '00000000-0000-0000-0000-000000000000'
const cloudflareDatabaseName = 'leonardoprasetyo-prod'
const cloudflareBucketName = 'leonardoprasetyo-uploads-prod'
const cloudflareVectorizeIndex = 'leonardoprasetyo-documents-prod'

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
    // These mutations are called by CI/CLI and are protected by the
    // constant-time LIBRARY_ADMIN_TOKEN check rather than browser cookies.
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
        name: 'leonardoprasetyo',
        compatibility_date: '2026-08-29',
        compatibility_flags: ['nodejs_compat'],
        ai: {
          binding: 'AI'
        },
        d1_databases: [{
          binding: 'DB',
          database_name: cloudflareDatabaseName,
          database_id: cloudflareDatabaseId
        }],
        r2_buckets: [{
          binding: 'BLOB',
          bucket_name: cloudflareBucketName
        }],
        vectorize: [{
          binding: 'VECTORIZE',
          index_name: cloudflareVectorizeIndex
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
