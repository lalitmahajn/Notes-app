/**
 * IndexedDBService — Local cache & write buffer
 *
 * Object stores:
 *   notes — mirrors Supabase notes + local metadata:
 *     _dirty   (bool)  changes not yet pushed to server
 *     _deleted (bool)  tombstone; hidden from UI, pending server delete
 *     _local   (bool)  created offline, no server-side ID yet
 *   meta  — key/value for sync state (e.g. last_synced_at)
 */
const IndexedDBService = (() => {
    const DB_NAME = 'secure_notes_offline';
    const DB_VERSION = 1;
    let db = null;

    /** Open (or create) the IndexedDB database */
    function open() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const _db = e.target.result;
                // Notes store — keyed by 'id' (uuid from Supabase or temp local id)
                if (!_db.objectStoreNames.contains('notes')) {
                    _db.createObjectStore('notes', { keyPath: 'id' });
                }
                // Meta store — key/value pairs
                if (!_db.objectStoreNames.contains('meta')) {
                    _db.createObjectStore('meta', { keyPath: 'key' });
                }
            };

            req.onsuccess = (e) => {
                db = e.target.result;
                console.log('[IDB] Database opened');
                resolve(db);
            };

            req.onerror = (e) => {
                console.error('[IDB] Open failed:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    /** Generic helper: run a transaction and return a promise */
    function _tx(storeName, mode, callback) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const result = callback(store);
            tx.oncomplete = () => resolve(result._result ?? result);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /** Get all notes that are NOT tombstoned (visible to UI) */
    async function getAllNotes() {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('notes', 'readonly');
            const store = tx.objectStore('notes');
            const req = store.getAll();
            req.onsuccess = () => {
                // Filter out tombstoned (deleted) notes — UI should never see them
                resolve(req.result.filter(n => !n._deleted));
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /** Get ALL notes including tombstones (for sync) */
    async function getAllNotesRaw() {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('notes', 'readonly');
            const store = tx.objectStore('notes');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /** Get a single note by id */
    async function getNote(id) {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('notes', 'readonly');
            const req = tx.objectStore('notes').get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /** Upsert a note (create or update). Marks as dirty for sync. */
    async function putNote(note) {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('notes', 'readwrite');
            tx.objectStore('notes').put(note);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /** Tombstone a note — mark as deleted but keep for sync */
    async function markDeleted(id) {
        const note = await getNote(id);
        if (!note) return;
        note._deleted = true;
        note._dirty = true;
        note.updated_at = new Date().toISOString();
        await putNote(note);
    }

    /** Physically remove from IDB (after server confirms delete) */
    async function removeNote(id) {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('notes', 'readwrite');
            tx.objectStore('notes').delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /** Get notes that need sync (dirty or deleted) */
    async function getDirtyNotes() {
        const all = await getAllNotesRaw();
        return all.filter(n => n._dirty && !n._deleted);
    }

    async function getDeletedNotes() {
        const all = await getAllNotesRaw();
        return all.filter(n => n._deleted);
    }

    /** Bulk replace all notes in IDB (used after full pull) */
    async function bulkPut(notes) {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('notes', 'readwrite');
            const store = tx.objectStore('notes');
            notes.forEach(n => store.put(n));
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /** Meta helpers */
    async function getMeta(key) {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').get(key);
            req.onsuccess = () => resolve(req.result?.value ?? null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async function setMeta(key, value) {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('meta', 'readwrite');
            tx.objectStore('meta').put({ key, value });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /** Clear all notes from IDB (e.g. on logout) */
    async function clearAll() {
        await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['notes', 'meta'], 'readwrite');
            tx.objectStore('notes').clear();
            tx.objectStore('meta').clear();
            tx.oncomplete = () => { console.log('[IDB] Cleared'); resolve(); };
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    return {
        open, getAllNotes, getAllNotesRaw, getNote, putNote,
        markDeleted, removeNote, getDirtyNotes, getDeletedNotes,
        bulkPut, getMeta, setMeta, clearAll,
    };
})();
