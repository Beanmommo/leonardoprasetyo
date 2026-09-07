# RAG infographic revision

Edited with the built-in image generation tool. Original: `rag-upload-index.png`. Output: `rag-upload-index-v2.png`.

## Requested edit prompt

```text
Use case: precise-object-edit.
Input image is the edit target: the existing "leonardoprasetyo RAG database Upload & index" infographic.
Make exactly these three localized text edits, and NOTHING else:
1. Inside step 03, remove the entire second body line "Resume: automatic • Document: ingest request". Leave the first body line "D1 task → Cloudflare Workflows" exactly as it is.
2. Inside step 05, replace the entire second body line "Deduplicate chunks and preserve page provenance" with the exact text "1 page approximately produces 4 chunks". Match the existing line's font, font size, weight, color, baseline and left alignment. Keep the first body line "1,000-character target • 150-character overlap" unchanged.
3. Inside step 07, remove the entire second body line "Wait for vector visibility and verify metadata". Leave the first body line "Save chunks in D1 → upsert vectors in Vectorize" exactly as it is.
Restore the background only in the two deleted-line areas, matching their original clean card background.
Strict preservation: keep the original canvas size, aspect ratio, full image framing, all card positions and dimensions, whitespace, every other word and line, all fonts, colors, background, icons, connectors, numbers, section labels, brackets, titles, input chips, footer, and outcome badge exactly unchanged. Do not reposition or vertically center surviving text. Do not reflow the diagram or redesign anything. This is a precise edit of three text lines only.
```

## Final refinement prompt

```text
Edit target: the FIRST reference image, the original infographic. The SECOND reference image only demonstrates the correct three text changes; do not use its geometry, as it inadvertently expands the layout and crowds/crops the bottom footer.

Produce the FIRST reference image with ONLY these three localized text changes:
- Step 03: delete the second body line "Resume: automatic • Document: ingest request".
- Step 05: replace "Deduplicate chunks and preserve page provenance" with EXACTLY "1 page approximately produces 4 chunks".
- Step 07: delete "Wait for vector visibility and verify metadata".

CRITICAL: preserve the FIRST reference's exact original framing and geometry. All existing elements must remain at their original sizes and original coordinates. Keep the full footer comfortably visible with its original bottom margin: "Limits per PDF: 200 pages • 500,000 extracted characters • 250 chunks". Keep the FIRST image's original title font size and position, all original card rectangles, icons, connectors, numbered circles, section brackets and side notes. Do not stretch, scale, shift, redraw, or enlarge the layout to fill space freed by the deleted lines. Do not vertically center or move surviving text. The three altered line areas are the only areas that should change. Use the same original background inside those areas and match the replacement line's original font, size, weight and left alignment.
This is a precise localized retouch, not a recreation of the infographic. Every word, graphic, line and pixel outside these three text areas should remain identical to the FIRST reference.
```
