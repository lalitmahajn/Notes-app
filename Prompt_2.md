You are adding an OFFLINE SYNC feature to an EXISTING browser-based notes app.

Context (already implemented — do NOT reimplement or restate):
- App is hosted on GitHub Pages
- Uses Supabase for authentication
- Uses Supabase to store notes (existing DB structure already in place)
- PWA support is already implemented
- Plain JavaScript (no framework)
- Text-only notes
- Very small user base

IMPORTANT:
- Do NOT assume or redefine the database schema.
- Analyze existing Supabase table structure and adapt to it.
- Only add client-side fields locally (e.g. synced, deleted) if needed.

TASK:
Implement OFFLINE-FIRST DATA SYNC using IndexedDB so users can
create, edit, and delete notes while offline and automatically sync
when internet connectivity returns.

--------------------------------
OFFLINE SYNC REQUIREMENTS
--------------------------------

1. DATA FLOW
- IndexedDB must act as a LOCAL CACHE and WRITE BUFFER.
- UI must read/write notes from IndexedDB.
- Supabase must be used ONLY as a sync target.
- UI logic must never depend directly on Supabase availability.

Data flow:
UI → IndexedDB → (async sync) → Supabase

2. INDEXEDDB
- Use IndexedDB (NOT localStorage).
- Create a local database (name is up to you).
- Mirror existing Supabase note records locally.
- Add local-only metadata fields if needed:
  - synced (boolean)
  - deleted (boolean for offline deletes)
  - last_synced_at (optional)

3. OFFLINE BEHAVIOR
- App must fully function while offline.
- Create/update/delete operations must update IndexedDB immediately.
- Offline changes must be clearly marked for later sync.

4. ONLINE SYNC LOGIC
- Detect connectivity using navigator.onLine and the "online" event.
- When online:
  a) Push unsynced local changes to Supabase
     - Use appropriate Supabase operations (insert/update/delete)
  b) Pull latest records from Supabase
  c) Resolve conflicts using LAST-WRITE-WINS
     (prefer newer updated timestamps or equivalent existing field)
- Ensure local metadata is updated after successful sync.

5. DELETE HANDLING
- Do NOT permanently delete records locally when offline.
- Use a tombstone approach (local-only deleted flag).
- Remove local records only after server deletion succeeds.

6. PERFORMANCE & SAFETY
- Do NOT sync on every keystroke.
- Debounce save operations (1–2 seconds idle).
- Avoid unnecessary Supabase calls.
- Batch sync operations where possible.
- Ensure sync logic is idempotent (safe to retry).

--------------------------------
COMMON MISTAKES TO AVOID (MANDATORY)
--------------------------------

DO NOT:
- ❌ Redefine or migrate the Supabase database schema
- ❌ Assume column names without checking existing structure
- ❌ Render UI directly from Supabase responses
- ❌ Write directly to Supabase on user actions
- ❌ Block UI while waiting for network calls
- ❌ Sync on every keypress
- ❌ Delete local records without tombstone handling
- ❌ Overwrite newer local data with older remote data
- ❌ Assume background sync works when the app is closed
- ❌ Introduce frameworks or heavy abstractions
- ❌ Over-engineer (no realtime collaboration or CRDTs)

--------------------------------
EXPECTED OUTPUT
--------------------------------

Provide:
1. IndexedDB helper utilities
2. Offline-first create/update/delete logic
3. Sync engine (push + pull)
4. Network detection integration
5. Clear comments explaining WHY each decision was made

Constraints:
- Plain JavaScript only
- Minimal changes to existing codebase
- Production-safe for a small PWA