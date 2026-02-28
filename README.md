# 📝 Secure Notes

A **secure, login-based Notes application** built with vanilla HTML/CSS/JS and [Supabase](https://supabase.com) for authentication, database, and row-level security. Installable as a **PWA**, deployable on **GitHub Pages** — no server required.

---

## ✨ Features

- **Authentication**: Email + password sign-up / sign-in (Supabase Auth)
- **Notes CRUD**: Create, edit, delete notes with auto-save
- **📌 Pin Notes**: Pin important notes to the top
- **📋 Markdown**: Write notes in Markdown (bold, italic, lists, code blocks, headings)
- **🏷️ Tags**: Add tags to notes, filter by tag
- **📂 Folders**: Organize notes into color-coded folders
- **🔍 Search**: Real-time search across titles, content, and tags
- **↕️ Sort**: Sort by last updated, newest, oldest, or title
- **🕐 Relative Time**: "2h ago", "3d ago" timestamps
- **🔄 Auto-Save**: Debounced auto-save while editing (1.5s delay)
- **📱 PWA**: Installable as a native-like app with offline caching
- **🔒 Security**: Row Level Security — each user sees only their own data
- **🎨 Design**: Dark glassmorphic UI with sidebar, animations, fully responsive

---

## 🚀 Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Copy the **Project URL** and **anon (public) API key** from **Settings → API**.

### 2. Database Setup

Open the **SQL Editor** in your Supabase dashboard and run:

```sql
-- ═══════════════════════════════════════
-- NOTES TABLE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS notes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title      text NOT NULL,
  content    text DEFAULT '',
  is_pinned  boolean DEFAULT false,
  tags       text[] DEFAULT '{}',
  folder_id  uuid DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes"   ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own notes"  ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes"  ON notes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes"  ON notes FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════
-- FOLDERS TABLE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS folders (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  color      text DEFAULT '#6c63ff',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders"   ON folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own folders"  ON folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own folders"  ON folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own folders"  ON folders FOR DELETE USING (auth.uid() = user_id);

-- Foreign key: notes → folders
ALTER TABLE notes ADD CONSTRAINT fk_folder
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;
```

> **⚠️ Upgrading from v1?** If you already have the `notes` table, run this migration instead:
>
> ```sql
> ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
> ALTER TABLE notes ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
> ALTER TABLE notes ADD COLUMN IF NOT EXISTS folder_id uuid DEFAULT NULL;
>
> -- Then create the folders table and foreign key from the SQL above
> ```

### 3. Configure Locally

Create a `.env` file (already gitignored) with your real values:

```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Paste those values into `app.js` (replace the `__SUPABASE_URL__` and `__SUPABASE_ANON_KEY__` placeholders) for local dev.

### 4. Run Locally

```bash
npx -y serve . -l 3000
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🌐 Deploy to GitHub Pages

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that injects credentials from **GitHub Secrets** and deploys automatically.

### Step 1 — Push to GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOU/YOUR_REPO.git
git push -u origin main
```

### Step 2 — Add Repository Secrets

**Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_ANON_KEY` | Your anon (public) key |

### Step 3 — Enable Pages

**Settings → Pages → Source** → select **GitHub Actions**

### Step 4 — Deploy

Push to `main` or manually run the workflow. Your app will be live at `https://YOU.github.io/YOUR_REPO/`.

---

## 🛡️ Security Model

| Layer | Protection |
|-------|-----------|
| **Supabase Auth** | Email + password; JWT per session |
| **Row Level Security** | `auth.uid() = user_id` on every query |
| **Anon key only** | Public key safe to expose; RLS enforces access |
| **No secrets in repo** | Credentials injected via GitHub Actions |

---

## 📁 Project Structure

```
/notes-app
 ├── index.html         ← App shell (auth, sidebar, notes grid, modals)
 ├── style.css          ← Design system & responsive styles
 ├── app.js             ← Application logic (6 decoupled modules)
 ├── manifest.json      ← PWA manifest
 ├── sw.js              ← Service worker (offline caching)
 ├── icons/             ← PWA icons (192, 512)
 ├── .env               ← Local credentials (gitignored)
 ├── .gitignore
 ├── .github/workflows/ ← GitHub Actions deployment
 └── README.md
```

---

## 🔮 Future Roadmap

- **End-to-end encryption** — encrypt content client-side
- **Rich text editor** — WYSIWYG instead of plain Markdown
- **File attachments** — images/files via Supabase Storage
- **Shared notes** — share with other users
- **Reminders** — browser notifications
- **Version History** — track changes, rollback
- **React / Vue migration** — swap `UIController`; keep services unchanged

---

## 📜 License

MIT — use freely.
