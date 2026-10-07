# Codex Hub

University study platform for Nigerian students — CBT practice, Nova AI tutor, course library, resources, chats, and rankings.

**Live:** [https://codex-hub-prime.vercel.app/](https://codex-hub-prime.vercel.app/)

## Stack

- Frontend: HTML / CSS / vanilla JS (PWA-ready)
- Auth & data: Firebase Auth + Firestore
- AI backend: Node on [Render](https://codex-backend-new.onrender.com) (Groq / Gemini / Hugging Face)
- Hosting: Vercel (static) + optional GitHub Pages

## Plans (official)

| Plan | Price |
|------|--------|
| Free | ₦0 |
| Regular | **₦2,000** / month |
| Pro | **₦5,000** / month |

## Project layout

```
login.html, signup.html, verify-email.html, auth-action.html, index.html
app/          → student app (home, nova, cbt, chats, …)
admin/        → command center
js/           → shared modules
backend/      → server.js for Render
assets/       → images & icons
```

## Email verification

1. Password sign-ups must verify email (Google sign-in is trusted).
2. Firebase emails must open **`auth-action.html`**, which runs `applyActionCode`.
3. In Firebase Console → Authentication → Settings → **Authorized domains**, add:
   - `codex-hub-prime.vercel.app`
   - `adesanyademilade16-dotcom.github.io` (if still used)
4. Authentication → Templates → Email address verification → **Customize action URL**:
   `https://codex-hub-prime.vercel.app/auth-action.html`

Without step 4, links may open the site home and never mark the account verified.

## Local run

Serve the folder over HTTP (not `file://`):

```bash
npx serve .
# open http://localhost:3000/login.html
```

## Deploy

1. Push this tree to the GitHub repo linked to Vercel.
2. Redeploy `backend/server.js` on Render when the API changes.
3. Keep API keys only in Render environment variables.

## PWA

`manifest.json` + `service-worker.js` + Install buttons on the landing page and Home.

## License

Private — Codex Hub. All rights reserved.
