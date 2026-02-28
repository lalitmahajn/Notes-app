# 📝 Secure Notes

A **secure, login-based Notes application** built with vanilla HTML/CSS/JS and [Supabase](https://supabase.com) for authentication, database, and row-level security. Designed to run as a **static site** on GitHub Pages — no server required.

---

## ✨ Features

- Email + password sign-up / sign-in (Supabase Auth)
- Create, edit, delete notes
- Notes persist across reloads and devices
- Each user sees **only their own notes** (Row Level Security)
- Dark-mode glassmorphic UI with subtle animations
- Fully responsive (mobile-first)
- Zero paid dependencies

---

## 🚀 Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Once the project is ready, copy the **Project URL** and **anon (public) API key** from **Settings → API**.

### 2. Create the `notes` Table & RLS Policies

Open the **SQL Editor** in your Supabase dashboard and run:

```sql
-- Create the notes table
CREATE TABLE IF NOT EXISTS notes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title      text NOT NULL,
  content    text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: users can SELECT only their own notes
CREATE POLICY "Users can view own notes"
  ON notes FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: users can INSERT only their own notes
CREATE POLICY "Users can create own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can UPDATE only their own notes
CREATE POLICY "Users can update own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can DELETE only their own notes
CREATE POLICY "Users can delete own notes"
  ON notes FOR DELETE
  USING (auth.uid() = user_id);
```

### 3. Configure Locally

For **local development**, create a `.env` file (already gitignored) with your real values:

```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Then paste those values directly into `app.js` (replace the `__SUPABASE_URL__` and `__SUPABASE_ANON_KEY__` placeholders) while developing locally.

### 4. Run Locally

No build step needed. Simply serve the files:

```bash
npx -y serve . -l 3000
```

Then open [http://localhost:3000](http://localhost:3000).

> **Tip:** You can also just open `index.html` directly in a browser, but some browsers restrict `fetch` for `file://` origins.

---

## 🌐 Deploy to GitHub Pages

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that **automatically injects your Supabase credentials from GitHub Secrets** and deploys to Pages on every push to `main`.

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2 — Add Repository Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret Name | Value |
|---|---|
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase anon (public) key |

### Step 3 — Enable GitHub Pages

Go to **Settings → Pages** and set:

- **Source**: `GitHub Actions`

### Step 4 — Deploy

Push any commit to `main` (or go to **Actions → Deploy to GitHub Pages → Run workflow**). The workflow will:

1. Replace `__SUPABASE_URL__` and `__SUPABASE_ANON_KEY__` placeholders in `app.js` with your secrets
2. Deploy the site to GitHub Pages

Your app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

---

## 🛡️ Security Model

| Layer | Protection |
|-------|-----------|
| **Supabase Auth** | Email + password authentication; JWT issued per session |
| **Row Level Security** | Every query is filtered by `auth.uid() = user_id` — one user cannot access another's notes |
| **Anon key only** | The public anon key is safe to expose; it can only do what RLS allows |
| **No secrets in repo** | The anon key is *designed* to be public; the service-role key is never used |

> **Important:** Never use the Supabase **service-role key** in frontend code. The anon key is the only key that should appear in `app.js`.

---

## 📁 Project Structure

```
/notes-app
 ├── index.html     ← App shell (auth + notes UI)
 ├── style.css      ← Design system & responsive styles
 ├── app.js         ← Application logic (4 decoupled modules)
 └── README.md      ← This file
```

---

## 🔮 Future Roadmap

The codebase is designed for easy migration:

- **Offline support** — add IndexedDB sync layer inside `NotesService`
- **Encryption** — encrypt note content before saving in `NotesService`
- **Markdown notes** — render content with a Markdown library in `UIController`
- **Tags & search** — extend the `notes` table and add filter UI
- **PWA** — add a `manifest.json` and service worker
- **React / Vue rewrite** — swap `UIController`; keep `AuthService` and `NotesService` unchanged
- **Supabase Edge Functions** — add server-side logic without changing the client modules

---

## 📜 License

MIT — use freely.
