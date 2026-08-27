# AdFlow

Turn a brand name and URL into a folder of production-ready static ads.

AdFlow researches a brand on the real web, distills a **Brand DNA** document,
fills a library of proven ad templates with on-brand copy, and renders the
images one by one in a background queue — you come back to a finished gallery.

## Stack

- **Next.js** (App Router, TypeScript) + **Tailwind v4** + **shadcn/ui** + `lucide-react`
- **Convex** — database, server functions, file storage, auth, background jobs
- **Convex Auth** — email + password, tokenised signup links, password reset
- **Resend** — transactional email (password reset)
- **OpenRouter** — LLM phases (brand research with the `openrouter:web_search`
  server tool, prompt generation), called with the `openai` SDK
- **FAL** — image generation via `openai/gpt-image-2` and
  `openai/gpt-image-2/edit` (product-reference images)
- **Vercel** — frontend hosting (pushes to `main` deploy automatically)

## How it works

1. **Setup** — create a project (brand name, URL, product name), upload 1–3
   product photos.
2. **Brand DNA** — a Convex action runs the research prompt through OpenRouter
   with server-side web search; rendered as structured sections with color
   swatches, editable, with a distilled "Visual style" paragraph.
3. **Formats** — pick ad formats from the library (image-forward cards with
   example renders). One click on "Generate N ads" writes the copy behind
   the scenes (Phase 2) and chains straight into image generation. Prompts
   are deliberately never shown to users (admins see them in the gallery
   lightbox). Quality (low/medium/high) and 1–3 variations per ad.
4. **Generate** — one job per image, drained by a bounded pool of
   self-rescheduling Convex scheduler workers (default 4 concurrent FAL
   calls; tune with `GENERATION_CONCURRENCY`, clamped 1–8).
   Product-reference prompts call the FAL edit endpoint with the uploaded
   photos and the template's style example; results are stored in Convex
   file storage. Live progress via Convex reactivity (no polling).
5. **Gallery** — masonry grid, lightbox, per-image download / regenerate /
   delete, and a Download-all ZIP ("a folder of finished ads").

Admins configure the models in `/admin/settings` (OpenRouter text model +
FAL image endpoint, both picked from live catalogs) and curate the shared
format library in `/admin/templates` (names, descriptions, prompt bodies,
and example/style-reference images — `npx convex run
exampleSeeder:generateExamples` renders missing examples against a demo
brand). Users may add their own OpenRouter/FAL keys on `/profile`; keys are
AES-GCM encrypted at rest and, when present, that user's runs bill their
accounts instead of the shared keys.

## Access model

- No public signup. Admins create **plans** and generate reusable,
  non-expiring **signup links** (`/signup/{token}`) that assign their plan to
  whoever signs up through them.
- Admin role comes from the `ADMIN_EMAILS` env allowlist (evaluated at access
  time) or from an explicit role set in the admin area. Allowlisted emails may
  sign up without a link (first-admin bootstrap, via `/signup`).
- `/admin` — user management (add/edit/delete, plan/role), plans CRUD, signup
  links.

## Development

```bash
npm install
npx convex dev        # pushes functions to the dev deployment + codegen
npm run dev           # Next.js dev server
```

Seed the system template library once per deployment:

```bash
npx convex run templates:seed
```

## Environment

Convex deployment env vars (server-side only — never exposed to the browser):

| Var | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | LLM phases (research + prompt generation) |
| `OPENROUTER_MODEL` | optional; defaults to `anthropic/claude-sonnet-5` |
| `FAL_KEY` | image generation |
| `RESEND_API_KEY` | password-reset email |
| `AUTH_EMAIL_FROM` | from-address (display name or `Name <addr>`) |
| `ADMIN_EMAILS` | comma-separated admin allowlist |
| `SITE_URL` | absolute app URL used in emails |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex Auth token signing |
| `BYOK_ENCRYPTION_KEY` | 32-byte base64 key encrypting users' own API keys |
| `GENERATION_CONCURRENCY` | optional; parallel FAL calls per project (1–8, default 4) |
| `OPENROUTER_MODEL` | optional env fallback; admin Settings override it |

Frontend (Vercel / `.env.local`):

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | the Convex deployment the app talks to |
