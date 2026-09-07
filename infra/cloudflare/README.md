# Cloudflare deployment runbook

This directory is the deployment contract and runbook for the implemented Nuxt portfolio RAG application. It intentionally contains no account IDs, API tokens, or generated Wrangler output. A production build generates the executable `.output/server/wrangler.json`; `.wrangler/deploy/config.json` is Nitro deployment metadata that points to it and is not passed directly to Wrangler.

## Target architecture

| Concern | Cloudflare service | Responsibility |
| --- | --- | --- |
| Nuxt application and API | Workers | Serve the application and keep AI credentials off the browser. |
| Durable document indexing | Workflows | Run the multi-stage indexing task after the R2 upload request completes, with retries and a concurrency limit of one. |
| Model inference | Workers AI through AI Gateway | Stream Granite chat completions, create Qwen embeddings, retain operational metadata without prompt/response payloads, and enforce gateway policy. |
| Vector search | Vectorize | Store and query document-chunk embeddings. |
| Uploaded file bytes | R2 | Store the original objects. D1 is not intended for file bytes. |
| Relational metadata | D1 | Store upload ownership, R2 object keys, processing state, and the mapping from chunks to Vectorize IDs. |
| Chat history | Browser `localStorage` | Keep chats on the current browser and origin. Chat content is not persisted in D1. |

The application request flow is:

1. The browser loads chat history from `localStorage` after the Vue app mounts.
2. The browser sends the current conversation to a same-origin Nuxt API route such as `POST /api/chat`.
3. The Worker optionally embeds the latest question, queries Vectorize, and loads matching chunk text from D1.
4. The Worker runs Granite through the Workers AI binding and AI Gateway, then streams the answer to the browser.
5. The browser appends the completed response to `localStorage`.
6. An upload is streamed through an authenticated API route into R2. D1 stores its metadata and a persistent task record, then a Workflow extracts text, chunks it, creates embeddings, and upserts them into Vectorize.

## Resource contract

The example names are deliberately stable across the application and deployment configuration:

| Binding | Local development resource | Production resource | Notes |
| --- | --- | --- | --- |
| Worker | Local emulator | `leonardoprasetyo` | Only `main` deploys a Worker through GitHub Actions. |
| `AI` | Workers AI binding | Workers AI binding | Calls use Cloudflare-hosted models and the `leonardoprasetyo` AI Gateway. |
| `DB` | `leonardoprasetyo-dev` | `leonardoprasetyo-prod` | D1 database used by NuxtHub/Drizzle. |
| `BLOB` | `leonardoprasetyo-uploads-dev` | `leonardoprasetyo-uploads-prod` | Private R2 bucket used by NuxtHub Blob. |
| `VECTORIZE` | `leonardoprasetyo-documents-dev` | `leonardoprasetyo-documents-prod` | 1,024 dimensions with cosine distance. |
| `INDEXING_WORKFLOW` | `leonardoprasetyo-library-indexing-dev` (local emulator) | `leonardoprasetyo-library-indexing-prod` | Durable `LibraryIndexingWorkflow`, limited to one concurrent indexing task. |

Local development runs the Worker and `LibraryIndexingWorkflow` in Wrangler's
emulator with remote development storage. Production deploys the same
implementation to `leonardoprasetyo` and
`leonardoprasetyo-library-indexing-prod`.

The embedding model is Cloudflare-hosted `@cf/qwen/qwen3-embedding-0.6b`. It returns 1,024-dimensional vectors, so the Vectorize index must use 1,024 dimensions and cosine distance. Changing embedding models or dimensions later requires creating a new index and re-embedding the corpus.

The selected low-cost chat model is Cloudflare-hosted `@cf/ibm-granite/granite-4.0-h-micro`, routed through AI Gateway by the Workers AI binding. Keep the model name server-controlled so it cannot be changed from browser requests.

See [wrangler.bindings.jsonc](./wrangler.bindings.jsonc) for the binding fragment and [ai-gateway.json](./ai-gateway.json) for the initial gateway settings.

The detailed public chat, daily IP quota, PDF ingestion, retrieval, and read-only Library implementation record is in [PORTFOLIO_RAG_PLAN.md](./PORTFOLIO_RAG_PLAN.md).

## Local binding development

`pnpm dev:local` builds the Cloudflare Worker and runs its code locally through
Wrangler. Workers AI (`AI`), `leonardoprasetyo-dev` D1 (`DB`),
`leonardoprasetyo-uploads-dev` R2 (`BLOB`), and
`leonardoprasetyo-documents-dev` (`VECTORIZE`) use remote bindings, while the
`LibraryIndexingWorkflow` runs in Wrangler's local Workflow emulator. The Worker
and Workflow run locally; only AI and the development data bindings are remote.
While `dev:local` is running,
inspect it with `pnpm exec wrangler workflows list --local --port 8787` or the
Local Explorer at `http://localhost:8787/cdn-cgi/explorer`. The same
Worker code executes ingestion directly through its bound D1, R2, Workers AI,
and Vectorize services in both development and production; only the configured
resource destinations change between environments. Keeping
the storage trio in the same remote development environment ensures Vectorize
result IDs resolve to D1 chunk text and D1 object keys resolve to the original
R2 PDFs. The command applies remote development D1 migrations before starting
and loads only the declared runtime secrets from `.env`.

The private `/admin` page signs in through GitHub. For local use, configure a
GitHub OAuth application with callback URL
`http://localhost:8787/auth/github`; for production use
`https://<your-production-domain>/auth/github`. Put its client ID and secret in
`.env` for local development. Migration `0006_seed_library_admin.sql` seeds an
administrator user for GitHub username `beanmommo` and email
`leonardo.prasetyo5@gmail.com`. A matching GitHub sign-in claims the row, and
the persisted `admin` role grants access. The page is intentionally absent from
the application sidebar.

## Provisioning sequence

Do not run these commands until the target Cloudflare account and environment names have been confirmed.

```bash
pnpm dlx wrangler@latest login
pnpm dlx wrangler@latest whoami

pnpm dlx wrangler@latest d1 create leonardoprasetyo-dev --location=oc
pnpm dlx wrangler@latest r2 bucket create leonardoprasetyo-uploads-dev --location=apac
pnpm dlx wrangler@latest vectorize create leonardoprasetyo-documents-dev --dimensions=1024 --metric=cosine
pnpm dlx wrangler@latest d1 create leonardoprasetyo-prod --location=oc
pnpm dlx wrangler@latest r2 bucket create leonardoprasetyo-uploads-prod --location=apac
pnpm dlx wrangler@latest vectorize create leonardoprasetyo-documents-prod --dimensions=1024 --metric=cosine
```

Record the D1 database IDs returned by Wrangler. Set the development UUID as
`NUXT_HUB_CLOUDFLARE_DEV_DATABASE_ID` and the production UUID as
`NUXT_HUB_CLOUDFLARE_DATABASE_ID`. R2 and Vectorize bindings use their resource
names.

Create the AI Gateway with an API token that has `AI Gateway - Read` and `AI Gateway - Edit` permissions:

```bash
curl --fail-with-body \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai-gateway/gateways" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data @infra/cloudflare/ai-gateway.json
```

The gateway payload creates the gateway and enables request metadata logging while leaving response caching and gateway-wide rate limiting disabled initially. Every Workers AI request sets `cf-aig-collect-log-payload: false`, so Cloudflare can retain operational metadata without storing visitor prompts, model responses, or embedded resume text in Gateway logs. The payload does not enable Authenticated Gateway; calls made through the Worker `AI` binding are already authenticated. Chat requests are personalized and have low exact-match cache value. The Worker-side IP limit remains the hard per-visitor cost boundary.

Export the real D1 ID before every production build. Build first so NuxtHub copies the application-owned migrations and writes the executable Wrangler configuration, then apply all pending migrations through Wrangler:

```bash
export NUXT_HUB_CLOUDFLARE_DATABASE_ID=<d1-database-id>
pnpm build
pnpm cloudflare:migrate
```

The authoritative RAG schema is the application-owned chain under `server/db/migrations/sqlite/`, including the Library tables in `0003_overjoyed_bloodstrike.sql`, the ingestion lease/generation fields in `0004_perfect_nova.sql`, generation-scoped chunk uniqueness in `0005_many_shinobi_shaw.sql`, persistent indexing task history in `0006_lazy_arclight.sql`, and the resume/document source roles in `0007_worried_grim_reaper.sql`. NuxtHub tracks it with `_hub_migrations`. There is intentionally no second infrastructure SQL copy.

## Branch promotion and deployment

The Git deployment contract is:

- Run development locally with `pnpm run dev:local`. Pushes and pull requests
  targeting `dev` do not trigger GitHub Actions.
- Merge the tested `dev` commit into `main` and push `main` to deploy
  `leonardoprasetyo`, including `leonardoprasetyo-library-indexing-prod`.
- Pull requests targeting `main` run validation only. Manual workflow runs are
  restricted to `main`.

GitHub Actions requires the repository variable
`NUXT_HUB_CLOUDFLARE_DATABASE_ID`. The existing `production` GitHub environment
uses the `PRODUCTION_URL` variable and the `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` secrets. Set `NUXT_HUB_CLOUDFLARE_DEV_DATABASE_ID` in the
local `.env` file for `pnpm dev:local`.

## Build, secrets, and deploy

The following commands assume the resources above exist, Wrangler is authenticated, and `NUXT_HUB_CLOUDFLARE_DATABASE_ID` remains exported:

```bash
pnpm build
pnpm cloudflare:dry-run

pnpm exec wrangler secret put NUXT_SESSION_PASSWORD --config .output/server/wrangler.json
pnpm exec wrangler secret put NUXT_OAUTH_GITHUB_CLIENT_ID --config .output/server/wrangler.json
pnpm exec wrangler secret put NUXT_OAUTH_GITHUB_CLIENT_SECRET --config .output/server/wrangler.json
pnpm exec wrangler secret put IP_HASH_SECRET --config .output/server/wrangler.json
pnpm exec wrangler secret put LIBRARY_ADMIN_TOKEN --config .output/server/wrangler.json

pnpm cloudflare:deploy:prod
```

`cloudflare:deploy:prod` builds against production resources, applies remote
production D1 migrations, and publishes the production Worker and Workflow. The legacy
`cloudflare:deploy` command remains a production alias.

The Cloudflare-hosted model calls require no OpenAI, Google, or other provider API key. The Workers AI binding authenticates them. The OAuth, session, admin-token, and IP secrets remain encrypted Worker secrets, never `vars` or `runtimeConfig.public` values.

The build uses compatibility date `2026-08-29` with `nodejs_compat`. `pdf-parse` is loaded lazily inside the ingestion request with JavaScript evaluation and worker fetches disabled; if it cannot parse in the Worker runtime, ingestion falls back to Cloudflare Workers AI `AI.toMarkdown()` and continues through the same splitter, Qwen embedding, D1, and Vectorize stages. The generated Worker is suitable for Workers Paid; production ingestion should not rely on the Free plan's small CPU allowance.

## Publish and ingest Library sources

The R2 bucket stays private. A signed-in, allowlisted GitHub administrator can
upload and delete documents at `/admin`. The browser routes require same-origin
mutations. The `LIBRARY_ADMIN_TOKEN` bearer credential remains available for
CI or CLI administration and must contain at least 32 random bytes. With
`PORTFOLIO_ORIGIN` and `LIBRARY_ADMIN_TOKEN` set locally, publish the canonical
resume through the dedicated endpoint. It overwrites only
`library/public/resume/current.pdf`, updates the single D1 source with role
`resume`, and returns the durable indexing task in the same `202 Accepted`
response:

```bash
curl --fail-with-body --request PUT \
  "${PORTFOLIO_ORIGIN}/api/admin/library/resume" \
  --header "Authorization: Bearer ${LIBRARY_ADMIN_TOKEN}" \
  --header "Content-Type: application/pdf" \
  --header "X-Filename: leonardo-prasetyo-resume.pdf" \
  --data-binary @public/leonardo-prasetyo-resume.pdf
```

Other PDFs are additive Library documents. Upload one through the generic file
endpoint, then pass the returned `file.id` to the asynchronous ingestion
endpoint:

```bash
curl --fail-with-body --request PUT \
  "${PORTFOLIO_ORIGIN}/api/admin/library/files" \
  --header "Authorization: Bearer ${LIBRARY_ADMIN_TOKEN}" \
  --header "Content-Type: application/pdf" \
  --header "X-Filename: project-details.pdf" \
  --data-binary @project-details.pdf

curl --fail-with-body --request POST \
  "${PORTFOLIO_ORIGIN}/api/admin/library/ingest" \
  --header "Authorization: Bearer ${LIBRARY_ADMIN_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{"uploadId":"<upload-id-from-previous-response>"}'
```

The ingestion endpoint returns `202 Accepted` with `task.id` after the durable
Workflow is created. The administrator can close the page at that point. The
admin UI polls `GET /api/admin/library/tasks` for the queue/history view and
`GET /api/admin/library/tasks/:id` for detailed stage progress. Task history is
kept in D1 independently of the Workflow instance retention window.

The admin route family is exempt from the application's CSRF-cookie middleware:
browser mutations are instead protected by the encrypted signed session,
server-side GitHub allowlist, and an explicit same-origin request check. CLI/CI
requests use the constant-time bearer-token check. `/api/chat` remains CSRF
protected. Ingestion requires an explicit upload UUID; there is no implicit
"latest file" selection. Repeating ingestion for the current ready checksum is
an idempotent no-op. Every changed PDF holds a renewable, expiring singleton D1
publication lease and verifies generation-marked vectors before publishing its
own current generation. Publishing one normal document does not deactivate or
delete another. The resume is replaced only through its dedicated fixed R2
key, is indexed with role `resume`, participates in RAG retrieval, and is hidden
from the normal document list. Document deletion uses the same lease, waits for
the asynchronous Vectorize deletion, then removes that document's private R2
object and soft-deletes its D1 upload metadata and chunk records. An interrupted
lease can be taken over after expiry.

The Cron Trigger `17 0 * * *` runs daily and deletes `question_usage` rows older than seven days. Verify the scheduled event and deletion count in Worker logs after the first deployment.

## Launch hardening included

- The exact chat model and embedding model are server-controlled; browsers cannot submit provider URLs, credentials, system messages, or alternative models.
- The production fetch entry streams and limits request bodies before Nitro buffers them: 64 KiB for chat, 10 MiB for a Library PDF, and 16 KiB for the ingest command. Administrative authentication is checked before reading the body, and long-running ingestion is handed to `INDEXING_WORKFLOW` after R2 upload.
- The retired server-persisted `/api/chats/**` and legacy `/api/upload/**` routes return `410`, closing alternate paths around the public quota and private R2 workflow.
- D1 reserves the daily IP quota atomically. Only a normalized, HMAC-SHA256-derived IP value is stored, and old rows are deleted by the scheduled cleanup.
- Document ingestion holds a renewable singleton D1 lease with a unique generation ID. Expired work can be taken over, different revisions cannot publish concurrently, and cleanup/finalization is owner checked.
- Before parsing, ingestion verifies the R2 object's MIME metadata, stored size, PDF signature, and SHA-256 against D1. Extracted page, character, and chunk ceilings bound parser expansion and embedding cost.
- Published PDFs are served with a restrictive CSP sandbox, and indexed text is control-character normalized and encoded as untrusted JSON before reaching the chat model prompt.
- Every Vectorize record uses the ingestion UUID as its namespace and carries that generation plus the content hash in metadata. Retrieval searches across all published resume and document sources, then validates each match against its active D1 generation. Generation-specific IDs and D1 uniqueness keep late stale-worker writes isolated.
- Content-addressed concurrent uploads atomically preserve the persisted lifecycle state, safely revive only deleted rows, and avoid deleting an R2 object that another record still references.
- Production builds fail without a non-placeholder D1 database UUID. The custom production entry and its request limits are included in the generated Worker bundle.

## Original design record and optional follow-ups

The phases below record the design path and useful post-launch enhancements. The core portfolio RAG feature described above is implemented; optional items such as chat export/import, Turnstile, and staging resources remain future work.

### Phase 1: Bind and deploy

- Add the `AI` and `VECTORIZE` bindings to the Wrangler configuration generated by the Nuxt/Nitro build.
- Configure NuxtHub's production database as D1 binding `DB` and its Blob driver as R2 binding `BLOB`.
- Keep local development on the existing local SQLite and filesystem Blob drivers.
- Add staging resources before production if a preview environment is required.
- Store provisioning tokens only in CI secrets. Runtime Workers bindings do not need an account-wide API token.

### Phase 2: Move chat persistence into the browser

- Add a client-only `useLocalChats` composable with a versioned key such as `leonardoprasetyo:chats:v1`.
- Store a normalized chat index and message arrays as JSON strings.
- Load them in `onMounted()` because `localStorage` is unavailable during server rendering.
- Persist after a completed assistant response and after rename, edit, regenerate, or delete actions.
- Remove the server-side `chats`, `messages`, and `votes` dependency after migration. Keep D1 users only if authenticated upload ownership is retained.
- Add Export, Import, and Clear History controls before deleting server persistence.

### Phase 3: Route Workers AI models through AI Gateway

- Replace direct provider selection in `server/api/chats/[id].post.ts` with a same-origin `POST /api/chat` route.
- Use the `AI` binding with the `leonardoprasetyo` gateway for both Granite generation and Qwen embeddings; disable response caching for personalized requests.
- Pass only an allow-listed model identifier from the browser; do not accept arbitrary provider URLs or credentials.
- Preserve response streaming, abort handling, input validation, CSRF protection, and bounded message/context sizes.
- Attach non-sensitive metadata such as release or route name to Gateway logs. Never attach raw session tokens.

### Phase 4: Move uploads to R2 and metadata to D1

- Keep the current `hub:blob` upload interface, backed by the `BLOB` R2 binding in production.
- Make the R2 bucket private. Serve authorized files through a Worker route or time-limited signed URL.
- Write one D1 `uploads` row only after the R2 write succeeds. If the D1 write fails, delete the just-created R2 object or queue cleanup.
- Enforce MIME allow-lists, maximum size, ownership, random object keys, and content-disposition on downloads.
- Add periodic cleanup for abandoned objects and failed ingestion records.

### Phase 5: Index documents and add retrieval

- Extract supported text on the server, split it into bounded chunks, and store chunk text in D1.
- Generate document embeddings with `@cf/qwen/qwen3-embedding-0.6b` through the same AI Gateway and upsert its 1,024-dimensional vectors into `VECTORIZE` with the D1 chunk ID as `vector_id`.
- For each chat request, embed the latest user question with Qwen's `queries` input and retrieval instruction, query Vectorize, then fetch the matched chunk text from D1.
- Add citations containing the upload ID and filename, not public R2 URLs.
- Keep ingestion in Cloudflare Workflows so upload requests return after durable task creation; use Queues only if future workloads need independent fan-out or batching.

### Phase 6: Security and operations

- Retain GitHub authentication for uploads, or introduce a server-issued anonymous session cookie. A browser-provided local ID alone is not proof of ownership.
- Add Turnstile and Worker-side rate limiting before exposing anonymous AI usage.
- Configure AI Gateway spend controls, log retention, and alerts.
- Set R2 lifecycle rules for deleted or temporary uploads.
- Test D1 migration rollback, R2 cleanup, Vectorize re-indexing, localStorage corruption, quota exhaustion, and a fresh browser with no stored chats.

## Browser localStorage behavior

`localStorage` is scoped to the page's **origin**, which is the combination of scheme, hostname, and port. It is not scoped to an API endpoint or URL path.

For example, all these paths share one localStorage area:

- `https://example.com/`
- `https://example.com/chat/123`
- `https://example.com/api/chat`

These origins use different localStorage areas:

- `http://example.com` and `https://example.com`
- `https://example.com` and `https://www.example.com`
- `http://localhost:3000` and `http://localhost:8787`

Consequences for chat history:

- It persists across refreshes and normal browser restarts until the user or browser clears it.
- It is specific to one browser profile and device; it does not sync through the application backend.
- Private/incognito data is removed when the private browsing session ends.
- It stores strings only, is synchronous, and is generally limited to about 5 MiB per origin.
- Do not store uploaded files, provider keys, session secrets, or sensitive tokens in it.
- Any JavaScript running on the same origin can read it, so strong XSS controls remain essential.

For a small portfolio assistant, localStorage is reasonable. If histories become large, move the message bodies to IndexedDB and retain only lightweight preferences or an index in localStorage.

## Activity chat tool and LangSmith tracing

The [technical documentation](../../docs/TECHNICAL_DOCUMENTATION.md#61-langchain-activity-tool)
describes the tool schema, implementation files, query limits, citation behaviour,
and trace structure.

`POST /api/chat` exposes the LangChain `search_leonardo_activity` tool through
the AI SDK. The tool reads `leonardo_activities` from the request's `DB` binding,
with optional literal text and inclusive date filters, a maximum of ten results,
and newest-first ordering using the timeline's Melbourne calendar dates. It
accepts no SQL or environment selector and permits at most two activity lookups.
Each answer permits at most three model steps, with the last step reserved for the
answer. Activity citations link to the public timeline.

The same Worker code sends traces to `leonardo-chat-dev` for development and
`leonardo-chat-prod` for production. The generated Wrangler configuration sets
the project and database metadata alongside the actual resource bindings.
`LANGSMITH_API_KEY` is a separate service key in each environment: development
loads it from the ignored root `.env`, and production inherits the encrypted
secret on the `leonardoprasetyo` Worker. An ignored `.env.production` can retain
the production key for rotation; it is not loaded by the development launcher.
Never put key values in Wrangler `vars`, public runtime configuration, or CI logs.

LangSmith traces contain the chat question, retrieved public excerpts, model
messages and output, activity filters/results, timing, and errors. Request
headers, cookies, IP addresses, and Worker bindings are not passed to tracing.
Trace delivery uses a request-scoped client, flushes after streaming completes,
and registers that completion with the Worker's `waitUntil`. Delivery failures
are logged without preventing chat answers. Set `LANGSMITH_TRACING=false` on
the Worker to disable tracing. When rotating the service keys, preserve their
workspace scope and replace the local and production keys independently.
For a persistent tracing toggle, change the generated `LANGSMITH_TRACING` value
in `nuxt.config.ts`, then rebuild and deploy. A dashboard-only override may be
replaced by the next deployment. The local launcher intentionally uses generated
project/endpoint/flag values instead of similarly named `.env` settings.

Open [LangSmith](https://smith.langchain.com/), select **Tracing**, then select
the appropriate project and a `portfolio-chat` run. The trace includes Library
retrieval, model steps, and the LangChain activity invocation. This integration
uses LangSmith observability; it does not deploy an Agent Server for Studio.

### Service key rotation

The service keys created on 7 September 2026 are named `leonardo-chat-dev` and
`leonardo-chat-prod`, scoped to the selected LangSmith workspace, with a
three-month expiry. Check each key's exact expiry in LangSmith settings before
rotation; do not record its value in documentation.

1. Create a replacement service key in the same workspace for the target environment.
2. For development, replace `LANGSMITH_API_KEY` in the ignored root `.env` and restart `pnpm run dev:local`.
3. For production, build the production configuration and update the encrypted Worker secret using Wrangler's interactive prompt:

   ```bash
   CLOUDFLARE_DEPLOY_ENV=prod pnpm build
   pnpm exec wrangler secret put LANGSMITH_API_KEY --name leonardoprasetyo --config .output/server/wrangler.json --env-file scripts/cloudflare-dev-local.env
   ```

   Enter the production key at the prompt rather than in command-line arguments.
   Update the ignored `.env.production` backup separately. Keep both local secret
   files restricted to their owner (`chmod 600 .env .env.production`).
4. Send an activity question through that environment's chat and confirm a completed run in the expected project with the expected `environment` and `database` metadata.
5. Revoke the superseded key after the replacement is verified.

### Verification record: 7 September 2026

The activity tool and tracing were deployed to Worker `leonardoprasetyo` as
version `21c7cf44-00bf-4b1d-a373-fc3d2b6bcba1`. Existing activity migrations
`0008` through `0011` were applied to production D1 before deployment.

- Seven activity-tool tests, lint, typecheck, the production build, and Wrangler dry run passed.
- `pnpm run dev:local` returned development activity entries and correct empty results for a date range without matches; activity citations opened the corresponding timeline entry.
- A production chat request invoked the tool against `leonardoprasetyo-prod` and correctly reported its empty timeline at verification time. The [production trace](https://smith.langchain.com/o/87fc695a-a8d1-4842-97c3-88e1b0972b73/projects/p/3db3fd13-9245-468c-82ea-ab9995348bb3/trace/01a07b2a-6c40-7000-8000-03cbf717f459/run/01a07b2a-6c40-7000-8000-03cbf717f459) contains completed retrieval, model, and tool spans without errors; access requires the workspace account.
- Both local key files were checked for Git exclusion and owner-only permissions, and the production build was checked for embedded key values. The local test server was stopped and port 8787 was confirmed clear.

Run `pnpm test:activity-tool` for query bounds, date filters, literal search,
environment isolation, citation stability, and cancellation tests. Use
`pnpm dev:local` to verify the real D1/model/tool/streaming/tracing round trip.

## Source documentation

- [AI Gateway Workers binding](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/)
- [Create and manage an AI Gateway](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/)
- [Vectorize client API and Worker binding](https://developers.cloudflare.com/vectorize/reference/client-api/)
- [R2 Worker binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Workers AI with the Vercel AI SDK](https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/)
- [Granite 4.0 H Micro](https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/)
- [Qwen3 Embedding 0.6B](https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/)
- [Vectorize limits](https://developers.cloudflare.com/vectorize/platform/limits/)
- [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
