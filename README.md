# 📝 Secure Notes

[![Deploy to GitHub Pages](https://github.com/lalitmahajn/Notes-app/actions/workflows/deploy.yml/badge.svg)](https://github.com/lalitmahajn/Notes-app/actions/workflows/deploy.yml)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-red.svg)](LICENSE)

A **secure, offline-first notes application** built with vanilla HTML/CSS/JS and [Supabase](https://supabase.com). Installable as a **PWA** with full offline support via IndexedDB.

> 🔒 Every note is protected by Row Level Security — users only see their own data.
> 
> ⚠️ **Non-Commercial License** — This software may not be used for commercial purposes. See [LICENSE](LICENSE) for details.

---

## ✨ Features

- **🔐 Authentication** — Email + password (Supabase Auth)
- **📝 Notes CRUD** — Create, edit, delete notes
- **📌 Pin Notes** — Pin important notes to the top
- **📋 Markdown & Code** — Write in GitHub Flavored Markdown (bold, lists, headings) with automatic syntax highlighting.
- **✅ Interactive Checklists** — Clickable checkbox tasks that automatically update your underlying raw text.
- **📂 Folders** — Organize notes into color-coded folders
- **🔍 Search** — Real-time search across titles, content, and tags
- **↕️ Sort** — Sort by date, title, or last updated
- **🕐 Relative Time** — "2h ago", "3d ago" timestamps
- **🔄 Auto-Save** — Debounced save while editing
- **📴 Offline-First** — Full offline support via IndexedDB + background sync with "Needs Sync" and animated "Syncing..." visual states.
- **📱 Mobile Friendly** — Fully responsive UI optimized for mobile, tablet, and desktop

---

## 🖥️ Demo

Deployed on GitHub Pages: **[Live App](https://lalitmahajn.github.io/Notes-app/)**

---

## 🏗️ Architecture

```
┌──────────────┐     ┌──────────────┐     ┌───────────────┐
│     UI       │ ──→ │  IndexedDB   │ ──→ │   Supabase    │
│ (instant)    │     │  (local)     │     │   (remote)    │
└──────────────┘     └──────────────┘     └───────────────┘
                      ↑ SyncEngine ↓
                      Push dirty / Pull remote
                      Last-write-wins conflict resolution
```

The UI **never** reads directly from Supabase. All reads come from IndexedDB. Supabase is the remote sync target only.

---

## 🚀 Quick Start

### Prerequisites

- A free [Supabase](https://supabase.com) project
- [Node.js](https://nodejs.org/) (for local dev server)

### 1. Clone the Repository

```bash
git clone https://github.com/lalitmahajn/Notes-app.git
cd Notes-app
```

### 2. Database Setup

Open the **SQL Editor** in your Supabase dashboard and run:

<details>
<summary>📋 Click to expand SQL</summary>

```sql
-- Notes table
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

-- Folders table
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

-- Foreign key
ALTER TABLE notes ADD CONSTRAINT fk_folder
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;
```

</details>

### 3. Configure Locally

Create a `.env` file (gitignored):

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Or create a `config.local.js` file (gitignored) to override credentials locally:

```js
window.SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
window.SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';
```

### 4. Run Locally

```bash
npx -y serve . -l 3000
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🌐 Deploy to GitHub Pages

The repo includes a GitHub Actions workflow that injects credentials from **GitHub Secrets** and deploys automatically.

1. **Add Secrets** — Go to repo **Settings → Secrets → Actions** and add:

   | Secret | Value |
   |--------|-------|
   | `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
   | `SUPABASE_ANON_KEY` | Your anon (public) key |

2. **Enable Pages** — **Settings → Pages → Source** → select **GitHub Actions**

3. **Push to `main`** — The workflow runs automatically and deploys your site.

---

## 🛡️ Security

| Layer | Protection |
|-------|-----------|
| **Supabase Auth** | Email + password; bcrypt-hashed; JWT sessions |
| **Row Level Security** | `auth.uid() = user_id` on every query |
| **Anon key only** | Public key safe to expose; RLS enforces access |
| **HTTPS** | All data in transit encrypted |
| **No server secrets** | Static site — no backend to compromise |

---

## 📁 Project Structure

```
├── index.html                  # App shell (auth, sidebar, modals)
├── style.css                   # Design system & responsive styles
├── config.local.js             # Local Supabase credentials (gitignored)
├── app/                        # Application logic (modular)
│   ├── config.js               #   Supabase URL/key constants
│   ├── services/
│   │   ├── supabase.js         #   Supabase client singleton
│   │   ├── auth.js             #   Authentication (sign-up/in/out)
│   │   ├── folders.js          #   Folder CRUD (online-only)
│   │   ├── notes.js            #   Notes remote API
│   │   ├── indexeddb.js        #   Local cache & write buffer
│   │   ├── sync.js             #   Bidirectional sync engine
│   │   └── markdown.js         #   Markdown → HTML rendering
│   ├── utils/
│   │   └── helpers.js          #   Utility functions
│   ├── ui/
│   │   └── controller.js       #   DOM interactions & rendering
│   └── main.js                 #   Boot entry point
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker (offline caching)
├── icons/                      # PWA icons
├── .env                        # Credentials for CI/CD (gitignored)
├── .gitignore
├── .github/workflows/          # GitHub Actions CI/CD
├── LICENSE                     # MIT License
└── README.md
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **PolyForm Noncommercial License 1.0.0** — you may use, modify, and distribute this software for **non-commercial purposes only**. See the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) — Backend as a Service
- [marked.js](https://marked.js.org/) — Markdown parser
- [highlight.js](https://highlightjs.org/) — Code syntax highlighting
- [Lucide](https://lucide.dev/) — Beautiful SVG icons
- [Inter](https://rsms.me/inter/) — UI typeface
