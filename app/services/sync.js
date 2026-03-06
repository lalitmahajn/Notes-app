/**
 * SyncEngine — Bidirectional sync with last-write-wins
 *
 * 1. Push dirty (modified offline) notes → Supabase
 * 2. Push deleted (tombstoned) notes → Supabase
 * 3. Pull all remote notes → merge with IDB using last-write-wins
 * 4. Clean up: remove local notes deleted on server
 *
 * Depends on: NotesService, IndexedDBService, toUTC (from helpers.js)
 */
const SyncEngine = (() => {
    let syncing = false;      // Prevent concurrent syncs
    let userId = null;        // Set after auth
    let onSyncStatusChange = null;  // Callback for UI

    function setUserId(id) { userId = id; }
    function setStatusCallback(cb) { onSyncStatusChange = cb; }

    function _status(state, msg) {
        if (onSyncStatusChange) onSyncStatusChange(state, msg);
    }

    /**
     * Main sync function. Safe to call repeatedly — it's idempotent
     * and prevents concurrent runs.
     */
    async function sync() {
        if (syncing) { console.log('[Sync] Already in progress, skipping'); return; }
        if (!navigator.onLine) { _status('offline', 'Offline'); return; }
        if (!userId) { console.log('[Sync] No user, skipping'); return; }

        syncing = true;
        _status('syncing', 'Syncing…');
        console.log('[Sync] Starting sync');

        try {
            await pushDirtyNotes();
            await pushDeletedNotes();
            await pullRemoteNotes();
            await IndexedDBService.setMeta('last_synced_at', new Date().toISOString());
            _status('synced', 'Synced ✓');
            console.log('[Sync] Complete');
        } catch (err) {
            console.error('[Sync] Error:', err);
            _status('error', 'Sync failed');
        } finally {
            syncing = false;
        }
    }

    /**
     * Push locally modified notes to Supabase.
     * For notes created offline (_local=true), we INSERT then update the local ID.
     * For existing notes, we UPDATE.
     */
    async function pushDirtyNotes() {
        const dirty = await IndexedDBService.getDirtyNotes();
        console.log(`[Sync] Pushing ${dirty.length} dirty notes`);

        for (const note of dirty) {
            try {
                if (note._local) {
                    // Created offline — insert into Supabase
                    const { data, error } = await NotesService.createNote({
                        title: note.title,
                        content: note.content,
                        is_pinned: note.is_pinned,
                        tags: note.tags,
                        folder_id: note.folder_id,
                        user_id: userId,
                    });

                    if (error) { console.error('[Sync] Push create failed:', error.message); continue; }

                    // Server assigned a real ID — replace the temp local note
                    const serverNote = data[0];
                    await IndexedDBService.removeNote(note.id); // remove temp
                    await IndexedDBService.putNote({
                        ...serverNote,
                        _dirty: false,
                        _deleted: false,
                        _local: false,
                    });
                } else {
                    // Existing note — update on server
                    const { error } = await NotesService.updateNote(note.id, {
                        title: note.title,
                        content: note.content,
                        is_pinned: note.is_pinned,
                        tags: note.tags,
                        folder_id: note.folder_id || null,
                        updated_at: note.updated_at,
                    });

                    if (error) { console.error('[Sync] Push update failed:', error.message); continue; }

                    // Mark as synced in IDB
                    note._dirty = false;
                    await IndexedDBService.putNote(note);
                }
            } catch (err) {
                console.error('[Sync] Push error for note', note.id, err);
            }
        }
    }

    /**
     * Push tombstoned notes — delete from server, then remove from IDB.
     */
    async function pushDeletedNotes() {
        const deleted = await IndexedDBService.getDeletedNotes();
        console.log(`[Sync] Pushing ${deleted.length} deleted notes`);

        for (const note of deleted) {
            try {
                // If note was created offline and never synced, just remove locally
                if (note._local) {
                    await IndexedDBService.removeNote(note.id);
                    continue;
                }

                const { error } = await NotesService.deleteNote(note.id);
                if (error) {
                    // If 404 / not found, the note is already gone from server — safe to remove locally
                    console.error('[Sync] Push delete failed:', error.message);
                }
                // Remove tombstone from IDB regardless (idempotent)
                await IndexedDBService.removeNote(note.id);
            } catch (err) {
                console.error('[Sync] Delete error for note', note.id, err);
            }
        }
    }

    /**
     * Pull all notes from Supabase and merge with local state.
     * Conflict resolution: LAST-WRITE-WINS based on updated_at.
     *   - If remote is newer AND local is not dirty → overwrite local
     *   - If local is dirty (offline edits) → keep local, push will handle it
     *   - Notes on server but not locally → add to IDB
     *   - Notes locally (synced, not dirty) but not on server → deleted remotely → remove from IDB
     */
    async function pullRemoteNotes() {
        const { data: remoteNotes, error } = await NotesService.fetchNotes();
        if (error) { console.error('[Sync] Pull failed:', error.message); return; }

        const localNotes = await IndexedDBService.getAllNotesRaw();
        const localMap = new Map(localNotes.map(n => [n.id, n]));
        const remoteIds = new Set(remoteNotes.map(n => n.id));

        console.log(`[Sync] Pull: ${remoteNotes.length} remote, ${localNotes.length} local`);

        // Merge remote into local
        for (const remote of remoteNotes) {
            const local = localMap.get(remote.id);

            if (!local) {
                // New note from server — add to IDB
                await IndexedDBService.putNote({
                    ...remote,
                    _dirty: false,
                    _deleted: false,
                    _local: false,
                });
            } else if (local._dirty) {
                // Local has unsaved changes — keep local version
                // (it will be pushed on next sync; last-write-wins means our
                //  newer timestamp will prevail when we push)
                console.log(`[Sync] Keeping dirty local note: ${local.id}`);
            } else {
                // Both exist, local is clean — take the newer one
                const remoteTime = new Date(toUTC(remote.updated_at)).getTime();
                const localTime = new Date(toUTC(local.updated_at)).getTime();
                if (remoteTime > localTime) {
                    // Remote is newer — overwrite local
                    await IndexedDBService.putNote({
                        ...remote,
                        _dirty: false,
                        _deleted: false,
                        _local: false,
                    });
                }
                // If local is same or newer but not dirty, it's already synced — no action
            }
        }

        // Remove local notes that were deleted on the server
        // Only remove if: note is synced (not _local), not dirty, and not already tombstoned
        for (const local of localNotes) {
            if (!local._local && !local._dirty && !local._deleted && !remoteIds.has(local.id)) {
                console.log(`[Sync] Removing locally — deleted on server: ${local.id}`);
                await IndexedDBService.removeNote(local.id);
            }
        }
    }

    return { sync, setUserId, setStatusCallback };
})();
