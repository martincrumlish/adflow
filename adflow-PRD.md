# PRD: AdFlow - Static Ad Generator

A web app that turns "a brand name + URL + product photos" into a folder of production-ready
static ad images. It reimplements a manual Claude-to-image-tool workflow as a marketed,
multi-user product.

---

## 0. How to use this document (read first, build agent)

This is a product spec, not a line-by-line implementation. Two categories:

**Firm - do not deviate:**
- The stack (§1) and the technical constraints (§8). These are verified and load-bearing; getting
  them wrong produces a broken build.
- The access/accounts model (§5): tokenised signup links, admin, no teams, payment out of scope.
- The UX intent (§6) and the seed template library (§10). The templates are product content, ship
  them as given.
- The functional behaviour and acceptance criteria in §7.

**Yours to decide - choose sensibly and keep moving:**
- The exact Convex schema (table definitions, indexes), file/folder structure, component
  composition, styling tokens, routing mechanics, the specific model slug, error copy, and any
  detail not pinned in §8. §9 tells you what data must be persisted; you own how.

**Working mode:** build in the milestone order in §11. Keep the app deployable at every step and
commit as you go. When a decision is open, make a reasonable choice and continue - do not stop to
ask for confirmation. Ship v1 against the Definition of Done in §11, then run the self-check.

Name: the product is **AdFlow**. Use it for the app name, page titles, and the email from-address.

---

## 1. Overview and stack

### Problem
Producing on-brand static ads at volume is slow and manual: research the brand, write image
prompts one at a time, paste each into an image tool, download, repeat. This app automates the
whole path so a user goes from a brand name and URL to a gallery of finished ads.

### Stack (fixed)
- **Next.js** (App Router, TypeScript), **Tailwind v4**, **shadcn/ui**, `lucide-react`.
- **Convex** for database, server functions, file storage, auth, and background jobs. No separate
  API server.
- **Vercel** for the frontend; Convex cloud for the backend.
- **Convex Auth** (email + password, with email password-reset).
- **Resend** for transactional email (password reset).
- **OpenRouter** (OpenAI-compatible) for the LLM steps, called with the `openai` SDK.
- **FAL** for image generation (OpenAI GPT Image 2), via `@fal-ai/client`.

---

## 2. Goals and non-goals

### Goals (v1)
- A user can create a project, research a brand, generate brand-specific ad prompts, generate the
  images, and browse/download the results.
- Generation runs as a background job with live progress; the user can walk away during a long run.
- A marketed, gated product: two-column marketing auth, plan-scoped signup links, admin account
  management.

### Non-goals (v1)
- No payment processing or billing (see §5).
- No teams, orgs, collaboration, or project sharing.
- No feature gating by plan (plans only tag accounts in v1).
- No mobile-optimised UI (usable on a laptop is enough).
- No Meta Ad Library scraping / template auto-discovery (see §12).

---

## 3. Users and roles

- **User** (default role): signs up via a plan link, creates and works on their own projects.
  Cannot see other users' data.
- **Admin**: everything a user can do, plus the `/admin` area (manage users, plans, signup links).
  Admin is granted to any account whose email is in the `ADMIN_EMAILS` env list, evaluated on
  sign-in. This bootstraps the first admin with no chicken-and-egg problem.

---

## 4. Core user journeys

1. **New customer onboarding:** admin shares a plan signup link -> customer opens `/signup/{token}`
   -> creates account, auto-assigned that plan -> lands on empty dashboard.
2. **Make ads for a brand:** create project (brand name, URL, product name) -> upload 1-3 product
   photos -> run Brand Research -> review/edit Brand DNA -> select templates -> generate prompts ->
   review/edit prompts -> run generation (walk away) -> return to a filled gallery -> download
   winners.
3. **Account recovery:** user hits "Forgot password?" -> receives reset email -> sets new password
   -> back to sign in.
4. **Admin management:** admin opens `/admin` -> creates a plan -> generates a signup link ->
   copies the URL -> manages users (add/edit/delete, change plan/role).

---

## 5. Access and accounts model (firm)

- **Payment is out of scope.** The app does not process, store, or track payments. Customers pay
  offsite (or are granted free access). Access is conferred solely by giving someone the correct
  signup link.
- **Plans:** an admin creates plans (name + optional description, e.g. "Free", "Pro", "Agency").
  Plans tag accounts; they do not gate features in v1.
- **Tokenised signup links (NOT invites):** per plan, an admin generates one or more signup links
  of the form `/signup/{token}`. They are reusable (one link -> many accounts), non-expiring, not
  tied to a specific email, and assign their plan to whoever signs up through them. An admin can
  deactivate a link to stop further signups on it. There is no open public signup route; visiting
  `/signup` with a missing/invalid/inactive token shows a "you need a signup link" message.
- **Password reset:** standard email flow via Convex Auth's Password provider + Resend.
- **Roles and admin bootstrap:** as in §3. `/admin` is guarded; non-admins are redirected away.

---

## 6. UX and design direction

**Design target: make the whole app feel like Linear** - fast, calm, dense-but-legible,
keyboard-friendly, restrained. Neutral zinc/slate base, dark mode by default, one confident accent,
thin borders over heavy shadows, minimal motion. Actively avoid the generic "every shadcn app looks
the same" look: run density slightly tighter than defaults, commit to a single accent, lean on
clean typography over decoration.

**Firm:**
- shadcn/ui on Tailwind v4 (v4, not v3), lucide icons.
- Left-sidebar app shell: project list + "New Project" at top, sign-out at bottom; main content to
  the right. No top nav bar.
- Login and signup use a **two-column marketing split** (marketing panel + form). `forgot-password`
  and `reset-password` are simple centered utility cards that link back to sign in.
- Project workspace uses **nested routes, not a Tabs component**:
  `/projects/[id]/setup`, `/brand-dna`, `/prompts`, `/generate`, `/gallery`. A secondary nav moves
  between them. Shareable, refresh-safe, and generation state survives navigation. Show a step
  indicator driven by project status.
- **Async states are strict (this makes or breaks the feel):** skeleton loaders while research and
  prompt-gen run (disable the trigger while running); live per-prompt rows during generation
  (queued/running/done/error) driven by Convex reactivity, never polling, with a summary count;
  gallery images appear progressively as each job finishes; toasts on completion and per-job
  errors, with the failing error surfaced inline on that row; clear empty states.
- Gallery: responsive grid, click-to-expand lightbox, hover actions (download, regenerate this one,
  view the prompt used).

**Yours to decide:** exact accent hue, font (Geist or Inter are fine defaults), radii, spacing,
shadow depth, and all component-level composition. shadcn defaults are the floor. Only mandate:
restrained motion, Linear-like calm.

---

## 7. Functional requirements

### 7.1 Projects
- Create a project with: name, brand name, brand URL, product name.
- List the signed-in user's projects on the dashboard with status.
- Project workspace exposes the five nested-route views (§6).
- Product images: upload 1-3 images (PNG/JPG/WebP) on the Setup view, stored in Convex file
  storage.
- **Acceptance:** a user can create a project, see it listed, open it, and upload product images
  that persist across reloads. Users never see other users' projects.

### 7.2 Phase 1 - Brand Research
Runs server-side (Convex action) using OpenRouter with OpenRouter's web-search server tool (§8) so
the model does real research, then saves a Brand DNA document and extracts a reusable prompt
modifier.

Use this research prompt (interpolate brand name + URL), and instruct the model to output the
document with exactly these headers:

```
Role: Act as a Senior Brand Strategist conducting a full reverse-engineering of the target
brand's visual and verbal identity.

Objective: Create a comprehensive Brand DNA document that will be used to write highly specific
AI image generation prompts. Every detail matters because the output will be fed into an image
model that needs exact specifications.

Brand: {BRAND_NAME}
URL: {BRAND_URL}

RESEARCH STEPS:

1. EXTERNAL RESEARCH (search the web for each):
   - Design credits: "who designed {BRAND} branding", "{BRAND} design agency", "{BRAND} rebrand"
   - Public brand assets: "{BRAND} brand guidelines pdf", "{BRAND} press kit", "{BRAND} style guide"
   - Typography: "{BRAND} font", "what font does {BRAND} use"
   - Colors: "{BRAND} brand colors", "{BRAND} hex codes", "{BRAND} color palette"
   - Packaging: "{BRAND} packaging design", "{BRAND} product photography"
   - Advertising: "{BRAND} Meta Ad Library" for current ad creative styles
   - Positioning: "{BRAND} brand story", "{BRAND} founding story", "{BRAND} mission"

2. ON-SITE ANALYSIS (analyze the brand URL):
   - Voice and Tone: 5 distinct adjectives from hero copy, About page, product descriptions.
   - Photography Style: lighting, color grading, composition, subject matter.
   - Typography on site: headline weight, body weight, letter-spacing, distinctive treatments.
   - Color application: primary vs accent, background colors, CTA color.
   - Layout density: airy or dense, grid-based or organic.
   - Packaging details: materials, colors, shape, label placement, textures, matte vs gloss.

3. COMPETITIVE CONTEXT: 2-3 direct competitors and their visual differentiation.

4. OUTPUT the document exactly, using these headers:

BRAND DNA DOCUMENT
==================
BRAND OVERVIEW
Name / Tagline / Design Agency / Voice Adjectives [5] / Positioning / Competitive Differentiation

VISUAL SYSTEM
Primary Font / Secondary Font / Primary Color [hex] / Secondary Color [hex] / Accent Color [hex]
/ Background Colors / CTA Color and Style

PHOTOGRAPHY DIRECTION
Lighting / Color Grading / Composition / Subject Matter / Props and Surfaces / Mood

PRODUCT DETAILS
Physical Description / Label-Logo Placement / Distinctive Features / Packaging System

AD CREATIVE STYLE
Typical formats / Text overlay style / Photo vs illustration / UGC usage / Offer presentation

IMAGE GENERATION PROMPT MODIFIER
A single 50-75 word paragraph to prepend to any image prompt to match this brand's visual
identity. Include exact colors, font descriptions, photography direction, and mood.
```

- Persist the full Brand DNA markdown and the extracted prompt modifier for the project.
- The Brand DNA view renders the document, allows editing, and shows the prompt modifier
  separately.
- **Acceptance:** running research on a real brand produces a populated Brand DNA that references
  real, brand-specific details (not generic placeholders), the modifier is captured, and both
  persist and are editable.

### 7.3 Phase 2 - Prompt Generation
Server-side (Convex action) using OpenRouter (no web search needed). Reads the Brand DNA and the
project's selected templates, fills every template, and writes the resulting prompts. Instruct the
model to return JSON only.

```
You are filling ad-image templates for {PRODUCT_NAME}, aligned to the Brand DNA below.

BRAND DNA:
{BRAND_DNA_MARKDOWN}

TEMPLATES (array of {number, name, body, aspectRatio, needsProductImages}):
{TEMPLATES_JSON}

For EACH template:
1. Replace every [BRACKETED PLACEHOLDER] in body with brand-specific detail. Keep all literal ad
   copy inside double quotes so the image model renders it verbatim.
2. Prepend the IMAGE GENERATION PROMPT MODIFIER from the Brand DNA to the prompt.
3. Keep the template's aspect_ratio and needs_product_images unless the filled content clearly
   changes whether the product is shown.
4. Write copy in the brand's real voice; avoid generic filler.

Return ONLY valid JSON, no markdown or commentary:
{
  "prompts": [
    { "template_number": 1, "template_name": "headline",
      "prompt": "full completed prompt text ready for GPT Image 2",
      "aspect_ratio": "4:5", "needs_product_images": true, "notes": "optional" }
  ]
}
```

- Persist each generated prompt for the project. The Prompts view shows them as editable cards
  (prompt text, aspect ratio, needs-product-images toggle, notes).
- **Acceptance:** generation produces one filled prompt per selected template, placeholders are all
  resolved, literal copy is quoted, prompts persist and are editable.

### 7.4 Phase 3 - Image Generation
Server-side via FAL (§8). Must run as a background job queue, one image at a time, with live
progress - never as a single long blocking call, never 40 parallel calls.

Behaviour:
- Kicking off generation creates one job per selected prompt (queued), sets the project to a
  generating state, and starts processing.
- Each job: if the prompt needs product images, call the FAL edit endpoint with the uploaded
  product photos as references; otherwise call text-to-image. Map the prompt's aspect ratio to a
  valid image size (§8). Download the resulting image and store it in Convex file storage. Mark the
  job done (or error, with the message).
- Jobs process sequentially; when the queue drains, mark the project done.
- The Generate view shows live per-prompt status and a summary count; failures surface inline.
- A quality selector (low/medium/high, default high) and an optional template subset are supported.
- Regenerate-one from the gallery re-runs a single prompt.
- **Acceptance:** a full run over the selected prompts completes in the background while the user is
  away; progress updates live without polling; product-reference prompts visibly match the real
  product; failed jobs show an error and don't block the rest; the user can regenerate a single
  image.

### 7.5 Gallery
- Grid of the project's generated images grouped by template; lightbox; per-image download, view
  prompt, and regenerate.
- **Acceptance:** images appear progressively during generation and remain browsable/downloadable
  afterward.

### 7.6 Admin (`/admin`, admin-only)
- **Users:** list all users (email, plan, role, created). Add a user directly (assign plan,
  optionally admin), edit a user's plan/role, delete a user.
- **Plans:** create, edit, deactivate.
- **Signup links:** per plan, generate a link, copy its URL, activate/deactivate, view its label.
  No expiry controls.
- **Acceptance:** an admin can create a plan, generate and copy a working signup link, sign up a
  new account through that link (which receives the plan), and manage users. Non-admins cannot
  reach `/admin`.

---

## 8. Technical constraints and verified API details (do not deviate)

These are verified against current provider docs. Do not substitute from memory.

### Keys and security
- `OPENROUTER_API_KEY` and `FAL_KEY` are used ONLY inside Convex actions (server-side). Never
  expose either to the browser. The browser talks only to Convex; Convex holds the keys. FAL's own
  guidance is explicit that the FAL key must never run client-side.

### OpenRouter (LLM for Phases 1 and 2)
- OpenAI-compatible. Use the `openai` SDK with `baseURL: "https://openrouter.ai/api/v1"` and
  `OPENROUTER_API_KEY`.
- Pick a current tool-calling Claude slug from openrouter.ai/models (e.g. `anthropic/claude-sonnet-4.5`).
  Any tool-calling model works; confirm the slug on the models page.
- **Web search:** use OpenRouter's server tool by putting `{ type: "openrouter:web_search" }` in
  the `tools` array. OpenRouter runs the searches server-side (the model decides when/how often)
  and returns a grounded answer in one response. Do NOT use Anthropic's native `web_search` tool
  (it does not work through OpenRouter this way), and do NOT use the deprecated `:online` suffix or
  `plugins: [{ id: "web" }]`. Web search is billed per web result on top of tokens.

### FAL (image generation for Phase 3)
- Text-to-image endpoint: `openai/gpt-image-2`. Edit / image-reference endpoint:
  `openai/gpt-image-2/edit` (takes `image_urls: string[]`). Do NOT use gpt-image-1 or invent
  parameters.
- Params: `prompt`, `image_size`, `quality` (`low`|`medium`|`high`, default `high`), `num_images`,
  `output_format`.
- `image_size`: preset enum (`square`, `square_hd`, `portrait_4_3`, `portrait_16_9`,
  `landscape_4_3`, `landscape_16_9`, `auto`) OR explicit `{width, height}`. Custom dimensions: both
  edges multiples of 16, max edge 3840px, aspect ratio up to 3:1, total pixels between 655,360 and
  8,294,400.
- Aspect ratio -> image size mapping to use: `1:1` -> 1024x1024, `4:5` -> 1024x1280,
  `9:16` -> 864x1536.
- Product images: upload each to FAL storage (`fal.storage.upload`) or pass publicly accessible
  URLs as `image_urls`. Cache the uploaded URL so each product image uploads once per project.
  1-3 references is the sweet spot.
- Cost: roughly $0.15-$0.41 per high-quality image depending on size; a 40-image run is single
  digits to low tens of dollars. Default `high`; expose `medium` for iteration.

### Convex specifics
- External-API calls (OpenRouter, FAL) go in Convex **actions** with a `"use node"` directive so
  the npm SDKs work.
- **Live progress via reactivity:** the client subscribes to job/image data through Convex queries;
  do not poll. As jobs flip status server-side, the UI updates automatically.
- **Background queue:** implement Phase 3 as a queue processed one job at a time via the Convex
  scheduler (a self-rescheduling processor), so no single action runs for the whole 40-80 minute
  run and FAL calls don't fan out in parallel.
- Store generated images in Convex file storage; do not persist raw FAL URLs (they expire).
- Prompt rendering tip for the image model: keep all ad copy in double quotes and add "text appears
  once, exactly as written" to reduce duplicated/garbled text.

---

## 9. Data the app must persist (you own the tables)

Model these however is idiomatic for Convex; below is the required information, not a schema.

- **Users:** identity (via Convex Auth) plus a role (admin/user, default user) and an assigned plan.
- **Plans:** name, optional description, active flag.
- **Signup links:** an unguessable token, the plan it grants, an optional label, an active flag.
  Reusable, no expiry.
- **Projects:** owner, name, brand name, brand URL, product name, status. Scoped to one user.
- **Product images:** belong to a project; the stored file, original filename, and (once uploaded)
  the FAL reference URL.
- **Brand DNA:** belongs to a project; the full document and the extracted prompt modifier.
- **Templates:** a shared/system library (seeded, §10) plus optional per-user templates. Each has a
  number, name, body (prompt with placeholders), aspect ratio, needs-product-images flag, optional
  category.
- **Generated prompts:** belong to a project; template number/name, the filled prompt, aspect
  ratio, needs-product-images flag, notes.
- **Generation jobs:** belong to a project and a prompt; status (queued/running/done/error),
  quality, optional error message. This is the Phase 3 queue.
- **Generated images:** belong to a project/prompt/job; the stored image file, template name, and
  dimensions.

Access rules: users only ever read/write their own projects and related rows. Admins can read/write
users, plans, and signup links. Templates: system templates are readable by all; a user's custom
templates are private to that user.

---

## 10. Seed template library (ship with these)

Seed these as system templates on first run. Each body uses `[PLACEHOLDERS]` for Phase 2 to fill,
keeps literal copy in quotes, and assumes the brand prompt modifier is prepended at generation
time. This is the starting library; it will grow over time.

| # | name | aspect | needsProduct |
|---|------|--------|-------------|
| 1 | headline | 4:5 | true |
| 2 | offer-promotion | 1:1 | true |
| 3 | us-vs-them | 4:5 | false |
| 4 | testimonial-card | 1:1 | false |
| 5 | review-screenshot | 4:5 | false |
| 6 | stat-callout | 1:1 | true |
| 7 | ugc-selfie | 9:16 | true |
| 8 | before-after | 1:1 | true |
| 9 | press-editorial | 4:5 | true |
| 10 | faux-iphone-notes | 9:16 | false |
| 11 | feature-callout | 4:5 | true |
| 12 | manifesto | 1:1 | false |

**1. headline** - `Studio product ad. [PRODUCT] centered on a [BACKGROUND COLOR] seamless backdrop, soft directional key light, subtle shadow. Large bold headline across the top reading "[HEADLINE COPY]" in [FONT STYLE]. Smaller subhead beneath reading "[SUBHEAD COPY]". Brand logo top-left. Clean, high-contrast, premium. Text appears once, exactly as written.`

**2. offer-promotion** - `Promotional ad card. [PRODUCT] on a [BACKGROUND COLOR] background with a bold offer badge reading "[OFFER e.g. 40% OFF TODAY]" in [ACCENT COLOR]. Headline "[OFFER HEADLINE]". A pill CTA button reading "[CTA e.g. Shop Now]" in the brand CTA color. Energetic, conversion-focused layout. All text rendered once, verbatim.`

**3. us-vs-them** - `Comparison ad, two vertical columns on a [BACKGROUND COLOR] background. Left column header "[BRAND]" in [ACCENT COLOR] with green check rows: "[BENEFIT 1]", "[BENEFIT 2]", "[BENEFIT 3]". Right column header "Others" greyed out with red X rows: "[NEGATIVE 1]", "[NEGATIVE 2]", "[NEGATIVE 3]". Clean sans-serif, clear visual winner on the left. Text exact and legible.`

**4. testimonial-card** - `Testimonial graphic on a [BACKGROUND COLOR] card. Five gold stars at top. Large quote reading "[CUSTOMER QUOTE]" in a readable serif. Attribution line "[CUSTOMER NAME], [DESCRIPTOR]" below with a small circular avatar. Minimal, trustworthy, lots of whitespace. Render text once, exactly as written.`

**5. review-screenshot** - `Realistic product-review card UI. White card, five filled orange stars, bold review title "[REVIEW TITLE]", body text "[REVIEW BODY]", a "Verified Purchase" badge, reviewer name "[NAME]" and a date. Looks like a genuine e-commerce review. Crisp UI typography, pixel-clean text rendered verbatim.`

**6. stat-callout** - `Bold statistic ad. [PRODUCT] to one side on a [BACKGROUND COLOR] background. A very large number "[STAT e.g. 92%]" in [ACCENT COLOR] with a supporting line "[STAT DESCRIPTION]" beneath. Radiating accent lines or a simple ring around the number. Confident, punchy. Numbers and text render once, exactly.`

**7. ugc-selfie** - `Authentic UGC-style vertical phone photo. A real-looking [PERSONA] holding [PRODUCT] in a [SETTING], natural window light, slightly imperfect framing, shot on phone. Casual, relatable, not studio-polished. A small caption bar at the bottom reading "[UGC CAPTION]". Caption text legible and rendered once.`

**8. before-after** - `Split before/after ad on a [BACKGROUND COLOR] background. Left half labeled "Before" showing "[BEFORE STATE]"; right half labeled "After" showing "[AFTER STATE]" with [PRODUCT] visible. Clear dividing line, arrow between halves. Honest, clean, benefit-obvious. Labels rendered once, exactly.`

**9. press-editorial** - `Premium magazine editorial layout featuring [PRODUCT]. Elegant serif masthead "[PUBLICATION-STYLE HEADER]", a pull-quote "[EDITORIAL QUOTE]", refined product photography with soft daylight, generous margins, muted [BACKGROUND COLOR] palette. Feels like a real press feature, not an ad. All text rendered once, verbatim.`

**10. faux-iphone-notes** - `A realistic iPhone Notes app screenshot, vertical. Title line "[NOTE TITLE]" then a short handwritten-feeling list: "[LINE 1]", "[LINE 2]", "[LINE 3]", "[LINE 4]". Authentic iOS Notes UI (top bar, off-white background, system font). Text crisp and rendered exactly as written, once.`

**11. feature-callout** - `[PRODUCT] shown large and centered on a [BACKGROUND COLOR] background, with 3-4 thin annotation lines pointing to features, each labeled "[FEATURE 1]", "[FEATURE 2]", "[FEATURE 3]". Clean technical-but-premium look, brand accent color for the callout lines. Labels legible, rendered once.`

**12. manifesto** - `Bold typographic manifesto ad. No product. Full-bleed [BACKGROUND COLOR] background with a large statement set in [FONT STYLE]: "[MANIFESTO LINE 1] / [MANIFESTO LINE 2] / [MANIFESTO LINE 3]". Key words emphasized in [ACCENT COLOR]. Confident, brand-voice-driven, striking. Text rendered once, exactly as written.`

---

## 11. Build order and Definition of Done

Build in this order; keep the app deployable and commit at each step.

1. Scaffold Next.js + Convex + Convex Auth. Two-column marketing auth (login + token-gated signup),
   password reset via Resend, forgot/reset pages linking back to sign in. Admin via `ADMIN_EMAILS`.
2. Admin area: plans CRUD; tokenised signup links (generate, copy, activate/deactivate); user
   management (list, add, edit plan/role, delete). Guard `/admin`.
3. Projects CRUD + dashboard + workspace shell (five nested-route views).
4. Product image upload (Setup view).
5. Seed the template library; Templates view (list, select, edit, add custom).
6. Phase 1 action + Brand DNA view.
7. Phase 2 action + Prompts view.
8. Phase 3 background queue + FAL action + Generate view with live progress.
9. Gallery view (grid, lightbox, download, regenerate one).
10. Polish: error states, per-job error surfacing, quality selector, template subset.

**Definition of Done (v1):** items 1-9 complete and working end to end. A signed-up user can take a
real brand from creation through a completed gallery of generated ads, with generation running in
the background and updating live. Admin can manage plans, links, and users. Item 10 is cleanup.

**Self-check before declaring done:**
- Neither `FAL_KEY` nor `OPENROUTER_API_KEY` is referenced anywhere client-side.
- Phase 3 is a background queue (scheduler), not a single blocking action, and does not fan out
  parallel FAL calls.
- Web search uses `openrouter:web_search`, not Anthropic's native tool.
- FAL calls use `openai/gpt-image-2` / `openai/gpt-image-2/edit` with valid image sizes.
- Generated images are stored in Convex, not left as FAL URLs.
- A user cannot read another user's projects; a non-admin cannot reach `/admin`.
- The app builds and deploys.

---

## 12. Out of scope / v2 roadmap (do not build now)

- **BYO API keys per user:** store each user's FAL/OpenRouter keys (encrypted) and use them in the
  actions instead of shared env keys. For reselling.
- **Feature gating by plan:** enforce limits/features per plan.
- **Ad Library template discovery:** an agent that browses the public Meta Ad Library (logged out)
  for long-running / high-impression creatives in a vertical and drafts new template rows via
  vision analysis, for human review. (The API path is a dead end - political/EU only, no commercial
  creatives - so this must be browser-agent based.)
- **Review mining:** scrape real customer reviews and inject them into copy fields before Phase 2.
- **Variations:** more than one image per prompt to choose from.

---

## Appendix: reference code (optional - use if helpful, not required)

These sketches illustrate the constraints in §8. They are not prescriptive; implement idiomatically.

### Phase 1 (OpenRouter + web-search server tool)
```ts
"use node";
import OpenAI from "openai";
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});
const res = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4.5",
  max_tokens: 8000,
  tools: [{ type: "openrouter:web_search",
            parameters: { engine: "auto", max_total_results: 20 } } as any],
  messages: [{ role: "user", content: brandResearchPrompt(brandName, brandUrl) }],
});
const markdown = res.choices[0].message.content ?? "";
```

### Phase 3 (FAL, per job)
```ts
"use node";
import { fal } from "@fal-ai/client";
fal.config({ credentials: process.env.FAL_KEY });

const endpoint = needsProductImages ? "openai/gpt-image-2/edit" : "openai/gpt-image-2";
const input: any = {
  prompt, image_size: mapAspect(aspectRatio),
  quality, num_images: 1, output_format: "png",
};
if (needsProductImages) input.image_urls = productFalUrls; // 1-3 urls

const result = await fal.subscribe(endpoint, { input });
const outUrl = result.data.images[0].url;
const bytes = await (await fetch(outUrl)).arrayBuffer();
const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
```

### Aspect mapping
```
"1:1"  -> { width: 1024, height: 1024 }
"4:5"  -> { width: 1024, height: 1280 }
"9:16" -> { width: 864,  height: 1536 }
```
