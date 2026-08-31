# Nuxt AI Chatbot Template

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

Full-featured AI Chatbot Nuxt application with authentication, chat history, collapsible sidebar, keyboard shortcuts, light & dark mode, command palette and more. Built using [Nuxt UI](https://ui.nuxt.com) components and integrated with [AI SDK](https://ai-sdk.dev) for a complete chat experience.

- [Live demo](https://chat-template.nuxt.dev/)
- [Documentation](https://ui.nuxt.com/docs/getting-started/installation/nuxt)

<a href="https://chat-template.nuxt.dev/" target="_blank">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://ui.nuxt.com/assets/templates/nuxt/chat-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://ui.nuxt.com/assets/templates/nuxt/chat-light.png">
    <img alt="Nuxt AI Chatbot Template" src="https://ui.nuxt.com/assets/templates/nuxt/chat-light.png">
  </picture>
</a>

> The chat template for Vue is on https://github.com/nuxt-ui-templates/chat-vue.

## Features

- ⚡️ **Streaming AI messages** powered by the [AI SDK](https://ai-sdk.dev) with thinking/reasoning support
- 🤖 **Cloudflare-hosted AI** — Granite chat generation and Qwen embeddings through Workers AI and AI Gateway
- 🔍 **Web search** with built-in provider tools (Anthropic, OpenAI)
- 📊 **Charts and weather** tool calling with rich UI rendering
- 🔐 **Authentication** via GitHub OAuth using [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils)
- 💾 **Chat history persistence** using SQLite database ([Turso](https://turso.tech) in production) and [Drizzle ORM](https://orm.drizzle.team)
- 📎 **File uploads** with drag & drop using [NuxtHub Blob](https://hub.nuxt.com/docs/blob) (requires authentication)
- ✨ **Markdown rendering** with streaming code highlighting via [Comark](https://comark.dev)

## Quick Start

```bash
npm create nuxt@latest -- -t ui/chat
```

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnuxt-ui-templates%2Fchat&repository-name=chat&env=NUXT_OAUTH_GITHUB_CLIENT_ID%2CNUXT_OAUTH_GITHUB_CLIENT_SECRET%2CNUXT_SESSION_PASSWORD&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22tursocloud%22%2C%22productSlug%22%3A%22database%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%7D%5D&demo-title=Nuxt+Chat+Template&demo-description=An+AI+chatbot+template+with+GitHub+authentication+and+persistent+chat+history+powered+by+Vercel+AI+SDK.&demo-url=https%3A%2F%2Fchat-template.nuxt.dev&demo-image=https%3A%2F%2Fui.nuxt.com%2Fassets%2Ftemplates%2Fnuxt%2Fchat-dark.png)

## Setup

Make sure to install the dependencies:

```bash
pnpm install
```

Run database migrations:

```bash
pnpm db:migrate
```

> [!NOTE]
> In production, configure your database connection. On Vercel, add the [Turso integration](https://vercel.com/integrations/turso) to automatically provision `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

### AI Integration

The public portfolio chat uses the [Vercel AI SDK](https://ai-sdk.dev/) with Cloudflare's official Workers AI provider. Chat generation runs on `@cf/ibm-granite/granite-4.0-h-micro`; PDF Library ingestion and retrieval use `@cf/qwen/qwen3-embedding-0.6b` with a 1,024-dimensional Vectorize index. Both calls use the Worker `AI` binding and Cloudflare AI Gateway.

These Cloudflare-hosted models do not require an OpenAI, Google, or other provider API key. Configure the server-owned model variables in `.env`:

```dotenv
AI_GATEWAY_ID=leonardoprasetyo
CHAT_MODEL=@cf/ibm-granite/granite-4.0-h-micro
EMBEDDING_PROVIDER=workers-ai
EMBEDDING_MODEL=@cf/qwen/qwen3-embedding-0.6b
EMBEDDING_DIMENSIONS=1024
```

> [!TIP]
> See [infra/cloudflare/README.md](./infra/cloudflare/README.md) for resource provisioning, Worker secrets, migrations, and deployment commands.

### Authentication

This template uses [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) for authentication with GitHub OAuth.

To enable authentication, [create a GitHub OAuth application](https://github.com/settings/applications/new) and set:

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID=<your-github-oauth-app-client-id>
NUXT_OAUTH_GITHUB_CLIENT_SECRET=<your-github-oauth-app-client-secret>
NUXT_SESSION_PASSWORD=<your-password-minimum-32-characters>
```

Set the OAuth application's callback URL to `http://localhost:8787/auth/github`
for `pnpm dev:local`, or `https://<your-production-domain>/auth/github` for the
deployed Worker. GitHub OAuth applications accept a single callback URL, so use
separate development and production OAuth applications when you need both.

The unlisted `/admin` page uses this sign-in. D1 seeds an administrator user
for GitHub username `beanmommo` and email `leonardo.prasetyo5@gmail.com`.
GitHub OAuth claims that seeded identity when either verified value matches;
authorization then uses the persisted `admin` role. The page uploads PDFs to
R2, starts durable indexing Workflows, shows current and historical task
progress, opens stored PDFs in a new tab, and deletes their R2 object, D1
metadata/chunks, and Vectorize records.

### Blob Storage (Optional)

This template uses [NuxtHub Blob](https://hub.nuxt.com/docs/blob) for file uploads, which supports multiple storage drivers:

- **Local filesystem** (default for development, stored in `.data/blob`)
- **[Vercel Blob](https://vercel.com/docs/vercel-blob)** (auto-configured when deployed to Vercel)
- **[Cloudflare R2](https://hub.nuxt.com/docs/blob#set-a-driver)** (when deployed to Cloudflare)
- **[Amazon S3](https://hub.nuxt.com/docs/blob#set-a-driver)** (with manual configuration)

For **Vercel Blob**, assign a Blob Store to your project from the Vercel dashboard (Project → Storage), then set the token for local development:

```bash
BLOB_READ_WRITE_TOKEN=<your-vercel-blob-token>
```

> [!NOTE]
> File uploads require authentication. See the [NuxtHub Blob documentation](https://hub.nuxt.com/docs/blob#set-a-driver) for configuring other storage drivers.

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

To run the built Worker on `http://localhost:8787` with remote Workers AI,
`leonardoprasetyo-dev` D1, `leonardoprasetyo-uploads-dev` R2, and the
development Vectorize index:

```bash
pnpm dev:local
```

This command rebuilds the Cloudflare Worker, applies its migrations to the
remote development D1 database, and starts Wrangler with scheduled-event
testing enabled. The launcher reads only `NUXT_SESSION_PASSWORD`, the two
`NUXT_OAUTH_GITHUB_*` values, `IP_HASH_SECRET`, `LIBRARY_ADMIN_TOKEN`, and
optional Wrangler credentials from `.env`; the generated Worker variables
remain authoritative, so production resource names cannot leak into the local
simulation through Wrangler's automatic `.env` loading. Run
`pnpm exec wrangler login` first, and ensure the remote
`leonardoprasetyo-dev` D1 database, `leonardoprasetyo-uploads-dev` R2 bucket,
and `leonardoprasetyo-documents-dev` Vectorize index exist. The development D1 UUID belongs in
`NUXT_HUB_CLOUDFLARE_DEV_DATABASE_ID`.

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Renovate integration

Install [Renovate GitHub app](https://github.com/apps/renovate/installations/select_target) on your repository and you are good to go.
