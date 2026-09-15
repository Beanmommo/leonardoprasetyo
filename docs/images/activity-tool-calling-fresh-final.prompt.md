# Custom tool calling — final fresh generation

Generated from scratch with built-in imagegen. No previous raster image was supplied to the generation call. Final asset: `activity-tool-calling-fresh.png`. Actual saved dimensions: 887 × 1774 pixels, with no alpha channel. The generator did not return the larger requested dimensions.

The earlier fresh attempt was discarded because its background contained transparency artifacts. The final selected image was visually checked for a white background, clearer text, seven numbered stages, the quoted question, two-column Tool Library stage, removed labels and the tightened step 04 spacing.

## Final generation prompt

```text
Create a NEW finished infographic from scratch as a FULLY OPAQUE image on a solid pure-white background. Every pixel must be opaque, including the margins, header, text areas and spaces between cards. The background must be white, not transparent. Flat clean editorial design. Native high-resolution portrait 1920 x 3840 if supported.

Use crisp dark zinc text, warm amber #d97706 accents, thin light-grey card borders, white cards, amber circular step numbers with white digits, sharp outline icons on the right. Professional sans-serif typography with large bold headings and readable regular body text. All letters and lines must be freshly rendered and clean. Avoid shaded/glass cards, gradients, shadows or texture. Seven sequential cards connected by downward amber arrows. Leave adequate outer margins. Stage 03 is taller with two equal columns. Modest consistent gaps between each heading and its description. No extra sections.

Render all text below faithfully.

HEADER:
leonardoprasetyo [small centered, amber]
Custom AI tool calling [large centered title]
From question to cited answer [second title line]
A recent-activity question in my portfolio assistant [subtitle]

01 — Ask a question
“What is Leonardo doing right now”
(The double quotation marks are visible; no question mark.)
Right icon: simple outlined chat bubble with three dots.

02 — Prepare input context
Chat history + instructions + Library context
Available tool: description + input schema
Right icon: simple document outline.

03 — Model selects available tools
Below the heading, show TWO EQUAL-WIDTH boxes SIDE BY SIDE with a horizontal amber DOUBLE-HEADED ARROW in the gap between them.
Left box heading: Agent browses available tools
Left box icons: Cloudflare's standard orange cloud mark and GLM/Z.ai's dark rounded square with the white angular Z mark, next to each other.
Left box body: Instructions guide tool selection.
Right box heading: Tool Library
Right box: small document icon and the single tool name search_leonardo_activity in sharp monospaced type.
Right body line 1: Available in this request
Right body line 2: Description + input schema
Under BOTH boxes, still inside card 03, add:
Example tool request
search_leonardo_activity({ limit: 3 })
The example call sits in a subtle pale-gray code box and is spelled exactly as given.

04 — Execute with LangChain
Validate arguments and run the custom function.
Right icon: black LangChain chain-link mark.
The description sits DIRECTLY BENEATH the title with a normal small gap. This card has only the heading, this description, and icon. There is no execution code line.

05 — Read the activity records
Read-only query · newest first
[small clock icon] Same data as /leonardo-activity
Right icon: outlined database cylinder with amber D1 inside.
This card has only these text lines; no Cloudflare D1 / table-name label.

06 — Return results to the model
Dates, titles, descriptions, links and citation labels
AI SDK passes the tool result into the next model step.
Right icon: document with a small amber return arrow.

07 — Stream the chat answer
The model writes an answer using the returned evidence.
Text + [Activity 1] citations link to the activity timeline.
Right icon: outlined chat bubble with three dots.

BOTTOM BANNER: thin amber rounded outline, white background, three equal columns, these exact phrases:
AI SDK coordinates | Model selects | LangChain executes

FOOTER:
Example tool-selection flow; internal reasoning is not displayed.

All seven step numbers appear exactly once. Ordinary body text is dark grey regular sans-serif, not monospaced. Only the tool identifier and example call are monospaced. Preserve the quoted question, the two-column library layout, Cloudflare and Z.ai icons in step 03, LangChain in step 04, D1 in step 05. Show only the exact supplied words, with clean spacing, no overlap and no cropped text. The arrow between the two inner boxes is two-way; the arrows between numbered stages point downward. This is an entirely opaque, flat WHITE poster, with sharp typography and clean white cards.
```
