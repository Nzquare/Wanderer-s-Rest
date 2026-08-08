# Wanderer's Rest — POS + CRM

A POS and café management system for Wanderer's Rest, a fantasy-themed board
game café. See `AGENTS.md` for the Next.js-version note, and the project's
commit history for what's been built so far.

## Get a live link (no coding required)

You need two free accounts: a database host and a place to run the app.
This takes about 10 minutes.

### 1. Create a free database (Neon)

1. Go to **[neon.tech](https://neon.tech)** → sign up (free tier is enough).
2. Create a new project — any name/region is fine.
3. On the project dashboard, find the **connection string** (starts with
   `postgresql://...`). Copy it — you'll paste it into Vercel in step 2.

*(Supabase.com works the same way if you'd rather use that — copy its
"connection string" / "Session pooler" URI instead.)*

### 2. Deploy on Vercel

1. Go to **[vercel.com](https://vercel.com)** → sign up/log in **with your
   GitHub account** (the one that owns this repo).
2. Click **Add New → Project**, then **Import** this repository
   (`Nzquare/Wanderer-s-Rest`).
3. Under **Branch**, make sure it's set to
   `claude/wanderers-rest-pos-crm-69bqj7` (or whichever branch you were
   given — Vercel usually lets you pick this under Project Settings →
   Git after the first import if it's not offered up front).
4. Open **Environment Variables** and add two:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the connection string you copied from Neon |
   | `AUTH_SECRET` | any long random string — e.g. mash your keyboard for 40 characters, or generate one at [randomkeygen.com](https://randomkeygen.com) |
5. Click **Deploy**. Wait ~2 minutes.
6. You'll get a URL like `wanderers-rest.vercel.app` — that's your live
   link. The database tables and starter data (login, tables, a couple of
   demo menu items) are set up automatically on that first deploy.

### 3. Log in

Open your new link → you'll land on the sign-in screen.

- **Login ID:** `owner`
- **PIN:** `1234`

⚠️ That's a placeholder login baked in for testing — change it (or add
real staff accounts) before using this for anything real. Staff
management UI is coming in a later build pass; for now it can be edited
directly in the database if needed.

### Redeploying after new work

Every time new work is pushed to the branch Vercel is watching, it
redeploys automatically — no steps to repeat.

---

## Local development (for whoever ends up coding on this)

Requires Node 20+ and a local Postgres.

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL / AUTH_SECRET
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Run the domain-logic test suite (pricing/EXP rules) with `npm test`.
