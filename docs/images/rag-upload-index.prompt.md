# RAG upload and index infographic

Generated with the built-in image generation tool.

Implementation references:

- `server/api/admin/library/files.put.ts`
- `server/api/admin/library/resume.put.ts`
- `server/api/admin/library/ingest.post.ts`
- `server/utils/indexingTasks.ts`
- `server/utils/documentIngestion.ts`
- `infra/cloudflare/wrangler.bindings.jsonc`
- `app/app.config.ts`
- `docs/TECHNICAL_DOCUMENTATION.md`, section 5

## Generation prompt

```text
Use case: infographic-diagram
Asset type: polished, high-resolution portrait infographic for this software repository's documentation.
Primary request: Illustrate the actual PDF upload and indexing process for the leonardoprasetyo RAG database. Create one finished raster image, portrait approximately 2:3, with exceptional text clarity.

Visual design: clean technical editorial infographic; warm near-white background, zinc/charcoal text, amber/gold numbered badges and connectors, subtle light-grey card borders. Palette drawn from the site's amber primary and zinc neutral theme. Restrained flat line illustrations, generous whitespace, impeccable alignment, crisp sans-serif typography reminiscent of Public Sans. Small service names may use a mono face. Make this visually engaging and professional with document, storage, workflow, text-page, chunk-stack, vector-node, verification and checkmark icons. No photorealism, mockup device, drop shadows, glow, watermark, invented logos or extraneous labels.

Composition: one unmistakable top-to-bottom flow, with eight numbered steps connected by arrowheads pointing downward. The central process occupies most of the page width. Use compact supplementary illustrations integrated into each step's card, not a maze of cross-connectors. Every step's number must appear exactly once, in order 01 through 08. Main headings must be large and readable; supporting text must also remain readable. Group consecutive stages with subtle section labels at the margin: "UPLOAD" beside steps 01–02; "INDEX" beside steps 03–07; "PUBLISH" beside step 08. A thin bracket alongside steps 03–08 may label them "Cloudflare Workflows", with a compact adjacent note "Progress in D1 • automatic retries". Keep this secondary to the main flow.

Header text, verbatim:
Small brand line: "leonardoprasetyo"
Main title: "RAG database"
Second title line: "Upload & index"
Subtitle: "How PDFs become searchable knowledge"

Below the subtitle, two small input chips with document icons:
"Resume • replace current PDF"
"Document • add a source"
Both feed into step 01.

Eight process cards, exact copy:
01 heading: "Upload & validate"
Body line 1: "Authenticated admin • PDF up to 10 MiB"
Body line 2: "Check filename, content type and PDF signature"

02 heading: "Store the source"
Body line 1: "R2: PDF file • D1: metadata and SHA-256"
Body line 2: "Identical document uploads reuse the existing source"

03 heading: "Start a durable task"
Body line 1: "D1 task → Cloudflare Workflows"
Body line 2: "Resume: automatic • Document: ingest request"

04 heading: "Extract text"
Body line 1: "pdf-parse → Cloudflare Markdown fallback"
Body line 2: "Recheck source integrity and clean extracted text"

05 heading: "Split into chunks"
Body line 1: "1,000-character target • 150-character overlap"
Body line 2: "Deduplicate chunks and preserve page provenance"

06 heading: "Generate embeddings"
Body line 1: "Workers AI via AI Gateway"
Body line 2: "Qwen3 Embedding 0.6B • 1,024 dimensions"

07 heading: "Publish & verify"
Body line 1: "Save chunks in D1 → upsert vectors in Vectorize"
Body line 2: "Wait for vector visibility and verify metadata"

08 heading: "Activate & clean up"
Body line 1: "Mark this source generation ready and active in D1"
Body line 2: "Remove this source's previous chunks and vectors"

Final outcome badge below step 08:
"Ready for RAG retrieval"
Small supporting line: "Published chunks can ground answers with source citations"

Footer, small but readable:
"Limits per PDF: 200 pages • 500,000 extracted characters • 250 chunks"

Accuracy requirements: D1 holds source metadata, task progress, and chunk text; R2 holds PDFs; Workers AI creates embeddings; Vectorize holds vectors. These are distinct services, not one generic database. The sequence must show verification BEFORE activation. Document uploads and resume uploads use the same downstream workflow. Do not imply a chat model generates document embeddings. Do not show a Cloudflare Queue service. All eight numbered stages are required. Render the supplied text faithfully, with no additional marketing copy.
```
