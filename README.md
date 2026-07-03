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
   with server-side web search and saves the document + an image-prompt
   modifier. Both are editable.
3. **Prompts** — select templates; a second action fills every template with
   brand-specific copy (JSON-only output) and stores one editable prompt per
   template.
4. **Generate** — one job per prompt, drained by a bounded pool of
   self-rescheduling Convex scheduler workers (default 4 concurrent FAL
   calls; tune with `GENERATION_CONCURRENCY`, clamped 1–8).
   Product-reference prompts call the FAL edit endpoint with the uploaded
   photos; results are stored in Convex file storage. Live progress via
   Convex reactivity (no polling).
5. **Gallery** — grouped grid, lightbox, download, view prompt,
   regenerate-one.

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

Frontend (Vercel / `.env.local`):

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | the Convex deployment the app talks to |
