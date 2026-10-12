# FairShare — Split bills fairly, settle with UPI

A mobile-first PWA for splitting group expenses (a free Splitwise alternative).
Plain HTML/CSS/JS — no build step. Backend: Supabase (Postgres + Auth + RLS).

## What's inside

- **Auth** — email/password sign-up + login; Google OAuth button (needs one toggle in Supabase, see below)
- **Profiles** — display name, UPI ID, avatar color
- **Groups** — create, invite via 6-letter code or link, join via code, member list, leave
- **Expenses** — description, amount, payer, date, category; splits: **equal / exact / percent / shares**; edit & soft-delete (creator or owner), detail view
- **Balances** — per-member net, "you owe / you are owed", greedy debt-simplification suggestions
- **Settle up** — record cash/UPI/bank/other payments; **UPI pay link + QR** generated from the receiver's saved UPI ID (`upi://pay?...`), opens GPay/PhonePe/Paytm
- **Activity feed** per group, **dashboard** with totals across groups
- **PWA** — manifest + service worker, installable, works offline for the app shell

## 1-click setup

1. Open your Supabase project → **SQL Editor** → paste the entire `schema.sql` from this folder → **Run**.
   (This creates all tables, indexes, Row Level Security policies, and the `join_group_by_code` function.)
2. Serve the folder over HTTP — pick one:
   - `npx serve ~/workspace/fairshare`
   - `python3 -m http.server 8000` (run inside the folder)
   - or drag the folder onto Netlify Drop / Vercel / GitHub Pages.
   
   > `file://` works for a quick look, but use `http://localhost` or HTTPS for the PWA install prompt and OAuth redirects.
3. Open the URL, **Sign up**, and you're in. The first sign-in creates your profile row automatically.

That's it — no env files, no build.

## Enable Google OAuth (optional, 2 minutes)

1. Supabase Dashboard → **Authentication → Providers** → enable **Google**.
2. In Google Cloud Console, create an OAuth client ID; add authorized redirect URI:
   `https://ijbarnhnzpwqxjfyknuv.supabase.co/auth/v1/callback`
3. Paste the client ID + secret into the Supabase Google provider settings → Save.
4. Supabase Dashboard → **Authentication → URL Configuration** → add your hosted app URL to **Redirect URLs**
   (e.g. `https://your-app.pages.dev/*`).

The "Continue with Google" button is already wired — it starts working as soon as the above is done.

## Wrap it as an Android app (APK/AAB)

**Option A — Android Studio WebView (fastest):**
1. Host this folder on any HTTPS static host (Netlify/Vercel/GitHub Pages).
2. New Android Studio project → Empty Activity → add a `WebView` filling the screen:
   - `webView.settings.javaScriptEnabled = true`
   - `webView.settings.domStorageEnabled = true`
   - `webView.loadUrl("https://your-hosted-url")`
   - handle back-button to go back in WebView history.
3. Add `INTERNET` permission in the manifest. Build → APK/AAB.

**Option B — Capacitor (nicer native feel):** `npm i @capacitor/core @capacitor/cli`,
`npx cap init FairShare com.you.fairshare`, copy this folder into the web dir,
`npx cap add android`, `npx cap sync`, open in Android Studio.

## Security notes

- The Supabase **anon key** in `js/config.js` is public by design — it's safe to ship in client code.
- Real protection comes from the **Row Level Security** policies in `schema.sql`: users can only read/write groups they belong to.
- **Never** put the `service_role` key in this app.

## Deliberately left for later

- Multiple payers per expense (single payer for now)
- Receipt photos / OCR
- Recurring expenses
- Push notifications & email reminders
- Multi-currency groups (INR throughout for now)
- Expense comments, guest (non-account) members
- Offline expense drafts / sync queue
- Group archive UI (the `archived` flag exists in the schema)
- Export CSV

## Project structure

```
fairshare/
├── index.html          # app shell
├── manifest.json       # PWA manifest
├── service-worker.js   # offline app-shell cache
├── css/style.css       # mobile-first styles
├── js/
│   ├── config.js       # Supabase URL + anon key
│   ├── db.js           # data-access layer (all Supabase queries)
│   ├── ui.js           # formatting, toast, modal, avatars
│   ├── balances.js     # balance math + debt simplification (pure fns)
│   ├── auth.js         # login / signup / profile views
│   ├── groups.js       # dashboard, groups, tabs, invite
│   ├── expenses.js     # expense form (4 split types) + detail
│   ├── settle.js       # settle up + UPI link/QR
│   └── app.js          # router + boot
├── icons/              # PWA icons (192, 512)
├── schema.sql          # run once in Supabase SQL editor
└── README.md
```

## UPI link format used

`upi://pay?pa=<upi-id>&pn=<name>&am=<rupees.2dp>&cu=INR&tn=FairShare%20settlement`
— the standard NPCI UPI deep-link format accepted by GPay, PhonePe, Paytm and BHIM.
