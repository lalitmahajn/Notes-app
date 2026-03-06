/**
 * UIController — DOM interactions, rendering, events, auto-save
 *
 * Depends on: SupabaseService, AuthService, FoldersService, NotesService,
 *             IndexedDBService, SyncEngine, MarkdownService,
 *             toUTC, relativeTime, debounce, generateLocalId (from helpers.js)
 */
const UIController = (() => {
    const $ = (sel) => document.querySelector(sel);

    // DOM refs
    const authSection = $('#auth-section');
    const appSection = $('#app-section');
    const authForm = $('#auth-form');
    const authEmail = $('#auth-email');
    const authPassword = $('#auth-password');
    const authSubmitBtn = $('#auth-submit-btn');
    const authSubtitle = $('#auth-subtitle');
    const authToggleText = $('#auth-toggle-text');
    const authToggleBtn = $('#auth-toggle-btn');
    const userEmailEl = $('#user-email');
    const logoutBtn = $('#logout-btn');
    const notesGrid = $('#notes-grid');
    const notesCount = $('#notes-count');
    const notesHeading = $('#notes-heading');
    const newNoteBtn = $('#new-note-btn');
    const fabBtn = $('#fab-btn');
    const noteModal = $('#note-modal');
    const modalTitle = $('#modal-title');
    const noteForm = $('#note-form');
    const noteTitleInput = $('#note-title-input');
    const noteContentInput = $('#note-content-input');
    const notePinInput = $('#note-pin-input');
    const noteFolderSelect = $('#note-folder-select');
    const tagInputWrapper = $('#tag-input-wrapper');
    const tagInput = $('#tag-input');
    const modalCancelBtn = $('#modal-cancel-btn');
    const autosaveStatus = $('#autosave-status');
    const searchInput = $('#search-input');
    const sortSelect = $('#sort-select');
    const tagFilterBar = $('#tag-filter-bar');
    const sidebar = $('#sidebar');
    const sidebarBackdrop = $('#sidebar-backdrop');
    const sidebarToggle = $('#sidebar-toggle-btn');
    const folderList = $('#folder-list');
    const allNotesCount = $('#all-notes-count');
    const newFolderBtn = $('#new-folder-btn');
    const folderModal = $('#folder-modal');
    const folderModalTitle = $('#folder-modal-title');
    const folderForm = $('#folder-form');
    const folderNameInput = $('#folder-name-input');
    const folderColorPicker = $('#folder-color-picker');
    const folderCancelBtn = $('#folder-cancel-btn');
    const pwaInstallBtn = $('#pwa-install-btn');
    const syncStatusEl = $('#sync-status');
    const syncBtn = $('#sync-btn');
    const toastEl = $('#toast');

    // View note modal
    const viewNoteModal = $('#view-note-modal');
    const viewNoteTitle = $('#view-note-title');
    const viewNoteMeta = $('#view-note-meta');
    const viewNoteBody = $('#view-note-body');
    const viewNoteClose = $('#view-note-close');
    const viewNoteEditBtn = $('#view-note-edit');
    const viewNoteDeleteBtn = $('#view-note-delete');
    let viewingNote = null;

    // State
    let isSignUp = false;
    let editingNoteId = null;
    let toastTimeout = null;
    let allNotes = [];   // loaded from IndexedDB
    let allFolders = [];
    let currentTags = [];
    let activeFolder = 'all';
    let activeTagFilter = null;
    let searchQuery = '';
    let editingFolderId = null;
    let selectedFolderColor = '#0a84ff';
    let deferredPWAPrompt = null;
    let currentUserId = null;

    // Auto-save
    let lastSavedData = null;

    // Periodic sync timer
    let periodicSyncTimer = null;

    // ── Init ──
    function init() {
        SupabaseService.init();
        bindEvents();
        restoreSession();
        listenAuthChanges();
        registerServiceWorker();
        listenNetworkChanges();

        // Wire up SyncEngine status callback to update UI
        SyncEngine.setStatusCallback(updateSyncStatus);
    }

    /** Update the sync status pill in the top bar */
    function updateSyncStatus(state, msg) {
        syncStatusEl.textContent = msg;
        syncStatusEl.className = 'sync-status ' + state;
    }

    function bindEvents() {
        // Auth
        authForm.addEventListener('submit', handleAuthSubmit);
        authToggleBtn.addEventListener('click', toggleAuthMode);
        logoutBtn.addEventListener('click', handleLogout);

        // Notes
        newNoteBtn.addEventListener('click', () => openNoteModal());
        fabBtn.addEventListener('click', () => openNoteModal());
        modalCancelBtn.addEventListener('click', closeNoteModal);
        noteModal.addEventListener('click', (e) => { if (e.target === noteModal) closeNoteModal(); });
        noteForm.addEventListener('submit', handleNoteSave);

        // View modal events
        viewNoteClose.addEventListener('click', closeViewNote);
        viewNoteModal.addEventListener('click', (e) => { if (e.target === viewNoteModal) closeViewNote(); });
        viewNoteEditBtn.addEventListener('click', () => {
            if (!viewingNote) return;
            closeViewNote();
            openNoteModal(viewingNote);
        });
        viewNoteDeleteBtn.addEventListener('click', async () => {
            if (!viewingNote) return;
            if (!confirm('Delete this note?')) return;
            await IndexedDBService.markDeleted(viewingNote.id);
            closeViewNote();
            showToast('Note deleted', 'success');
            await reloadNotesFromIDB();
            if (navigator.onLine) SyncEngine.sync().then(() => reloadNotesFromIDB());
        });

        // Tags input
        tagInput.addEventListener('keydown', handleTagKeydown);
        tagInputWrapper.addEventListener('click', () => tagInput.focus());

        // Auto-save — debounced (writes to IndexedDB)
        const triggerAutoSave = debounce(() => autoSave(), 1500);
        noteTitleInput.addEventListener('input', triggerAutoSave);
        noteContentInput.addEventListener('input', triggerAutoSave);

        // Search
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim().toLowerCase();
            renderFilteredNotes();
        });

        // Sort
        sortSelect.addEventListener('change', renderFilteredNotes);

        // Sidebar
        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarBackdrop.addEventListener('click', toggleSidebar);
        newFolderBtn.addEventListener('click', () => openFolderModal());

        // Folder modal
        folderCancelBtn.addEventListener('click', closeFolderModal);
        folderModal.addEventListener('click', (e) => { if (e.target === folderModal) closeFolderModal(); });
        folderForm.addEventListener('submit', handleFolderSave);
        folderColorPicker.querySelectorAll('.color-swatch').forEach((s) => {
            s.addEventListener('click', () => {
                folderColorPicker.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
                s.classList.add('active');
                selectedFolderColor = s.dataset.color;
            });
        });

        // PWA — capture install prompt for custom button, no preventDefault so
        // browsers that show a native banner will still do so automatically
        window.addEventListener('beforeinstallprompt', (e) => {
            deferredPWAPrompt = e;
            pwaInstallBtn.classList.remove('hidden');
        });
        pwaInstallBtn.addEventListener('click', async () => {
            if (!deferredPWAPrompt) return;
            deferredPWAPrompt.prompt();
            await deferredPWAPrompt.userChoice;
            deferredPWAPrompt = null;
            pwaInstallBtn.classList.add('hidden');
        });

        // Force sync button
        syncBtn.addEventListener('click', async () => {
            if (!navigator.onLine) { showToast('You are offline', 'error'); return; }
            syncBtn.style.animation = 'spin 0.6s linear infinite';
            await SyncEngine.sync();
            await reloadNotesFromIDB();
            await loadFolders();
            syncBtn.style.animation = '';
        });
    }

    // ── Network status ──
    function listenNetworkChanges() {
        window.addEventListener('online', () => {
            console.log('[Network] Back online — triggering sync');
            updateSyncStatus('syncing', 'Syncing…');
            SyncEngine.sync().then(() => reloadNotesFromIDB());
        });
        window.addEventListener('offline', () => {
            console.log('[Network] Went offline');
            updateSyncStatus('offline', 'Offline');
        });

        // Set initial network status
        if (!navigator.onLine) {
            updateSyncStatus('offline', 'Offline');
        }
    }

    function startPeriodicSync() {
        stopPeriodicSync();
        // Sync every 60 seconds while online
        periodicSyncTimer = setInterval(() => {
            if (navigator.onLine) {
                SyncEngine.sync().then(() => reloadNotesFromIDB());
            }
        }, 60000);
    }

    function stopPeriodicSync() {
        if (periodicSyncTimer) {
            clearInterval(periodicSyncTimer);
            periodicSyncTimer = null;
        }
    }

    // ── Auth ──
    function toggleAuthMode() {
        isSignUp = !isSignUp;
        authSubmitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
        authSubtitle.textContent = isSignUp ? 'Create a new account' : 'Sign in to access your notes';
        authToggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
        authToggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';
    }

    async function handleAuthSubmit(e) {
        e.preventDefault();
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) return;
        authSubmitBtn.disabled = true;
        authSubmitBtn.innerHTML = '<span class="spinner"></span>';
        let result;
        if (isSignUp) {
            result = await AuthService.signUp(email, password);
            if (!result.error) showToast('Account created! Check your email to confirm.', 'success');
        } else {
            result = await AuthService.signIn(email, password);
        }
        if (result.error) showToast(result.error.message, 'error');
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    }

    async function handleLogout() {
        stopPeriodicSync();
        // Clear local IDB on logout (user data shouldn't persist)
        await IndexedDBService.clearAll();
        const { error } = await AuthService.signOut();
        if (error) showToast('Logout failed: ' + error.message, 'error');
    }

    // ── Session ──
    async function restoreSession() {
        const { session } = await AuthService.getSession();
        if (session) showApp(session.user); else showAuth();
    }

    function listenAuthChanges() {
        AuthService.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) showApp(session.user);
            else if (event === 'SIGNED_OUT') showAuth();
        });
    }

    function showAuth() {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        authForm.reset();
    }

    async function showApp(user) {
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        userEmailEl.textContent = user.email;
        currentUserId = user.id;
        SyncEngine.setUserId(user.id);

        // 1. Open IndexedDB
        await IndexedDBService.open();

        // 2. Load from IDB immediately (fast, works offline)
        await reloadNotesFromIDB();

        // 3. Load folders (online-only, graceful fallback)
        await loadFolders();

        // 4. If online, sync in background then refresh UI
        if (navigator.onLine) {
            SyncEngine.sync().then(() => reloadNotesFromIDB());
        } else {
            updateSyncStatus('offline', 'Offline');
        }

        // 5. Start periodic sync
        startPeriodicSync();
    }

    // ── Data loading ──
    /** Reload notes from IndexedDB and refresh the UI */
    async function reloadNotesFromIDB() {
        allNotes = await IndexedDBService.getAllNotes();
        collectAllTags();
        renderFilteredNotes();
        updateFolderCounts();
    }

    async function loadFolders() {
        try {
            const { data } = await FoldersService.fetchFolders();
            allFolders = data;
        } catch (e) {
            console.warn('[UIController] Folders fetch failed (probably offline):', e);
            // Keep existing folders in memory
        }
        renderFolders();
        populateFolderSelects();
    }

    // ── Folders rendering ──
    function renderFolders() {
        const allItem = folderList.querySelector('[data-folder-id="all"]');
        folderList.innerHTML = '';
        folderList.appendChild(allItem);

        allFolders.forEach((f) => {
            const li = document.createElement('li');
            li.className = 'sidebar-item' + (activeFolder === f.id ? ' active' : '');
            li.dataset.folderId = f.id;
            li.innerHTML = `
        <span class="folder-dot" style="background:${f.color}"></span>
        <span>${MarkdownService.escapeHTML(f.name)}</span>
        <span class="folder-count" data-count-folder="${f.id}"></span>
        <div class="folder-actions">
          <button class="btn-icon btn-edit-folder" title="Edit">✏️</button>
          <button class="btn-icon btn-delete-folder" title="Delete">🗑️</button>
        </div>`;
            li.addEventListener('click', (e) => {
                if (e.target.closest('.btn-edit-folder') || e.target.closest('.btn-delete-folder')) return;
                setActiveFolder(f.id, f.name);
            });
            li.querySelector('.btn-edit-folder').addEventListener('click', () => openFolderModal(f));
            li.querySelector('.btn-delete-folder').addEventListener('click', async () => {
                if (!confirm(`Delete folder "${f.name}"? Notes inside will be unassigned.`)) return;
                const { error } = await FoldersService.deleteFolder(f.id);
                if (error) { showToast('Delete failed', 'error'); return; }
                if (activeFolder === f.id) setActiveFolder('all', 'My Notes');
                showToast('Folder deleted', 'success');
                await loadFolders();
                // Reload notes since folder_id references may have changed
                if (navigator.onLine) {
                    await SyncEngine.sync();
                    await reloadNotesFromIDB();
                }
            });
            folderList.appendChild(li);
        });

        allItem.onclick = () => setActiveFolder('all', 'My Notes');
        if (activeFolder === 'all') allItem.classList.add('active');
        else allItem.classList.remove('active');
    }

    function setActiveFolder(id, name) {
        activeFolder = id;
        notesHeading.innerHTML = `${MarkdownService.escapeHTML(name)} <span class="notes-count" id="notes-count"></span>`;
        folderList.querySelectorAll('.sidebar-item').forEach(i => {
            i.classList.toggle('active', i.dataset.folderId === String(id));
        });
        renderFilteredNotes();
        if (window.innerWidth <= 768) closeSidebar();
    }

    function updateFolderCounts() {
        allNotesCount.textContent = allNotes.length;
        allFolders.forEach(f => {
            const el = folderList.querySelector(`[data-count-folder="${f.id}"]`);
            if (el) el.textContent = allNotes.filter(n => n.folder_id === f.id).length;
        });
    }

    function populateFolderSelects() {
        noteFolderSelect.innerHTML = '<option value="">None</option>';
        allFolders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            noteFolderSelect.appendChild(opt);
        });
    }

    // ── Sidebar toggle ──
    function toggleSidebar() {
        sidebar.classList.toggle('open');
        sidebarBackdrop.classList.toggle('open');
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('open');
    }

    // ── Tags ──
    let allUniqueTags = [];

    function collectAllTags() {
        const tagSet = new Set();
        allNotes.forEach(n => (n.tags || []).forEach(t => tagSet.add(t)));
        allUniqueTags = [...tagSet].sort();
        renderTagFilterBar();
    }

    function renderTagFilterBar() {
        tagFilterBar.innerHTML = '';
        if (allUniqueTags.length === 0) return;
        allUniqueTags.forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip' + (activeTagFilter === tag ? ' active' : '');
            chip.textContent = `#${tag}`;
            chip.addEventListener('click', () => {
                activeTagFilter = activeTagFilter === tag ? null : tag;
                renderTagFilterBar();
                renderFilteredNotes();
            });
            tagFilterBar.appendChild(chip);
        });
        if (activeTagFilter) {
            const clear = document.createElement('span');
            clear.className = 'tag-chip';
            clear.textContent = '✕ Clear';
            clear.addEventListener('click', () => { activeTagFilter = null; renderTagFilterBar(); renderFilteredNotes(); });
            tagFilterBar.appendChild(clear);
        }
    }

    function handleTagKeydown(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = tagInput.value.trim().replace(/,/g, '');
            if (val && !currentTags.includes(val)) {
                currentTags.push(val);
                renderModalTags();
            }
            tagInput.value = '';
        } else if (e.key === 'Backspace' && !tagInput.value) {
            currentTags.pop();
            renderModalTags();
        }
    }

    function renderModalTags() {
        tagInputWrapper.querySelectorAll('.tag-chip').forEach(c => c.remove());
        currentTags.forEach((tag, i) => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = `#${MarkdownService.escapeHTML(tag)} <span class="tag-remove" data-idx="${i}">✕</span>`;
            chip.querySelector('.tag-remove').addEventListener('click', () => {
                currentTags.splice(i, 1);
                renderModalTags();
            });
            tagInputWrapper.insertBefore(chip, tagInput);
        });
    }

    // ── Filtering, sorting, rendering ──
    function getFilteredNotes() {
        let notes = [...allNotes];

        if (activeFolder !== 'all') {
            notes = notes.filter(n => n.folder_id === activeFolder);
        }
        if (activeTagFilter) {
            notes = notes.filter(n => (n.tags || []).includes(activeTagFilter));
        }
        if (searchQuery) {
            notes = notes.filter(n =>
                (n.title || '').toLowerCase().includes(searchQuery) ||
                (n.content || '').toLowerCase().includes(searchQuery) ||
                (n.tags || []).some(t => t.toLowerCase().includes(searchQuery))
            );
        }

        const sort = sortSelect.value;
        notes.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            switch (sort) {
                case 'updated_desc': return new Date(toUTC(b.updated_at)) - new Date(toUTC(a.updated_at));
                case 'created_desc': return new Date(toUTC(b.created_at)) - new Date(toUTC(a.created_at));
                case 'created_asc': return new Date(toUTC(a.created_at)) - new Date(toUTC(b.created_at));
                case 'title_asc': return (a.title || '').localeCompare(b.title || '');
                case 'title_desc': return (b.title || '').localeCompare(a.title || '');
                default: return 0;
            }
        });

        return notes;
    }

    let gridHasRendered = false;

    function renderFilteredNotes() {
        const notes = getFilteredNotes();
        const countEl = document.getElementById('notes-count');
        if (countEl) countEl.textContent = notes.length ? `(${notes.length})` : '';

        if (notes.length === 0) {
            const msg = searchQuery ? 'No notes matching your search' : 'No notes yet';
            notesGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon" style="opacity: 0.5; margin-bottom: var(--sp-3);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h4"></path><path d="M2 10h4"></path><path d="M2 14h4"></path><path d="M2 18h4"></path><rect width="16" height="20" x="4" y="2" rx="2"></rect><path d="M9.5 8h5"></path><path d="M9.5 12H16"></path><path d="M9.5 16H14"></path></svg>
          </div>
          <p>${msg}</p>
          <span>${searchQuery ? 'Try a different search term.' : 'Tap <strong>+ New Note</strong> to get started.'}</span>
        </div>`;
            gridHasRendered = true;
            return;
        }

        // Skip entrance animation on re-renders (pin, delete, sync) to avoid flash
        const isRerender = gridHasRendered;
        notesGrid.innerHTML = notes.map((note, i) => noteCardHTML(note, i)).join('');
        if (isRerender) {
            notesGrid.querySelectorAll('.note-card').forEach(c => {
                c.style.animation = 'none';
                c.style.opacity = '1';
            });
        }
        bindNoteCardEvents(notes);
        gridHasRendered = true;
    }

    function noteCardHTML(note, index) {
        const time = relativeTime(note.updated_at || note.created_at);
        const folder = allFolders.find(f => f.id === note.folder_id);
        const pinnedClass = note.is_pinned ? ' pinned' : '';
        // Show a yellow dot on unsynced cards
        const unsyncedClass = note._dirty ? ' unsynced' : '';
        const pinBadge = note.is_pinned ? '<span class="pin-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg></span>' : '';

        const folderBadge = folder
            ? `<div class="note-folder-badge"><span class="folder-dot" style="background:${folder.color}"></span>${MarkdownService.escapeHTML(folder.name)}</div>`
            : '';

        const tagChips = (note.tags || [])
            .map(t => `<span class="tag-chip">#${MarkdownService.escapeHTML(t)}</span>`)
            .join('');

        const contentHTML = MarkdownService.render(note.content || '');

        return `
      <div class="note-card${pinnedClass}${unsyncedClass}" data-id="${note.id}" style="animation-delay:${index * 0.05}s">
        ${pinBadge}
        <div class="note-title">${MarkdownService.escapeHTML(note.title || 'Untitled')}</div>
        ${folderBadge}
        ${tagChips ? `<div class="note-tags">${tagChips}</div>` : ''}
        <div class="note-content-preview">${contentHTML}</div>
        <div class="note-meta">
          <span class="note-date">${time}</span>
          <div class="note-actions">
            <button class="btn btn-sm btn-ghost btn-pin" title="${note.is_pinned ? 'Unpin' : 'Pin'}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${note.is_pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
            </button>
            <button class="btn btn-sm btn-ghost btn-edit" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-sm btn-danger btn-delete" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>

        </div>
      </div>`;
    }

    function bindNoteCardEvents(notes) {
        notesGrid.querySelectorAll('.note-card').forEach(card => {
            const id = card.dataset.id;
            const note = notes.find(n => n.id === id);

            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                if (note) openViewNote(note);
            });

            card.querySelector('.btn-edit').addEventListener('click', (e) => {
                e.stopPropagation();
                if (note) openNoteModal(note);
            });

            // Pin — write to IndexedDB, trigger sync
            card.querySelector('.btn-pin').addEventListener('click', async (e) => {
                e.stopPropagation();
                const updated = { ...note, is_pinned: !note.is_pinned, _dirty: true, updated_at: new Date().toISOString() };
                await IndexedDBService.putNote(updated);
                await reloadNotesFromIDB();
                // Sync in background — don't re-render, periodic sync will pick it up
                if (navigator.onLine) SyncEngine.sync();
            });

            // Delete — tombstone in IndexedDB, trigger sync
            card.querySelector('.btn-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this note?')) return;
                await IndexedDBService.markDeleted(id);
                showToast('Note deleted', 'success');
                await reloadNotesFromIDB();
                // Sync in background
                if (navigator.onLine) SyncEngine.sync();
            });
        });
    }

    // ── View note (read-only) ──
    function openViewNote(note) {
        viewingNote = note;
        viewNoteTitle.textContent = note.title || 'Untitled';
        viewNoteBody.innerHTML = MarkdownService.render(note.content || '<em>No content</em>');

        // Build meta: date, folder badge, tags
        let metaHTML = `<span class="view-date">${relativeTime(note.updated_at || note.created_at)}</span>`;
        const folder = allFolders.find(f => f.id === note.folder_id);
        if (folder) {
            metaHTML += `<span class="view-folder-badge"><span class="folder-dot" style="background:${folder.color}"></span>${MarkdownService.escapeHTML(folder.name)}</span>`;
        }
        (note.tags || []).forEach(t => {
            metaHTML += `<span class="tag-chip">#${MarkdownService.escapeHTML(t)}</span>`;
        });
        if (note.is_pinned) metaHTML += '<span style="color:var(--accent)">Pinned</span>';
        viewNoteMeta.innerHTML = metaHTML;

        viewNoteModal.classList.add('active');
    }

    function closeViewNote() {
        viewNoteModal.classList.remove('active');
        viewingNote = null;
    }

    // ── Note modal ──
    function openNoteModal(note = null) {
        editingNoteId = note ? note.id : null;
        modalTitle.textContent = note ? 'Edit Note' : 'New Note';
        noteTitleInput.value = note ? note.title : '';
        noteContentInput.value = note ? note.content : '';
        notePinInput.checked = note ? note.is_pinned : false;
        noteFolderSelect.value = note?.folder_id || '';
        currentTags = note ? [...(note.tags || [])] : [];
        renderModalTags();

        lastSavedData = note ? { title: note.title, content: note.content } : null;
        autosaveStatus.classList.add('hidden');
        if (note) autosaveStatus.classList.remove('hidden');

        noteModal.classList.add('active');
        noteTitleInput.focus();
    }

    function closeNoteModal() {
        noteModal.classList.remove('active');
        noteForm.reset();
        currentTags = [];
        renderModalTags();
        editingNoteId = null;
        autosaveStatus.classList.add('hidden');
    }

    /**
     * Handle save button — writes to IndexedDB, then triggers async sync.
     * Works fully offline.
     */
    async function handleNoteSave(e) {
        e.preventDefault();
        const title = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();
        if (!title) { showToast('Title is required', 'error'); return; }

        const saveBtn = $('#modal-save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span>';

        const now = new Date().toISOString();

        if (editingNoteId) {
            // Update existing note in IndexedDB
            const existing = await IndexedDBService.getNote(editingNoteId);
            const updated = {
                ...existing,
                title, content,
                is_pinned: notePinInput.checked,
                tags: currentTags,
                folder_id: noteFolderSelect.value || null,
                updated_at: now,
                _dirty: true,
            };
            await IndexedDBService.putNote(updated);
        } else {
            // Create new note in IndexedDB with a temporary local ID
            const newNote = {
                id: generateLocalId(),
                user_id: currentUserId,
                title, content,
                is_pinned: notePinInput.checked,
                tags: currentTags,
                folder_id: noteFolderSelect.value || null,
                created_at: now,
                updated_at: now,
                _dirty: true,
                _deleted: false,
                _local: true,   // Mark as locally-created (no server ID yet)
            };
            await IndexedDBService.putNote(newNote);
        }

        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';

        showToast(editingNoteId ? 'Note updated' : 'Note created', 'success');
        closeNoteModal();
        await reloadNotesFromIDB();

        // Async sync — don't block UI
        if (navigator.onLine) SyncEngine.sync().then(() => reloadNotesFromIDB());
    }

    // ── Auto-save (writes to IndexedDB, not Supabase) ──
    async function autoSave() {
        if (!editingNoteId) return;
        const title = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();
        if (!title) return;

        if (lastSavedData && lastSavedData.title === title && lastSavedData.content === content) return;

        autosaveStatus.textContent = 'Saving…';
        autosaveStatus.className = 'autosave-status saving';
        autosaveStatus.classList.remove('hidden');

        try {
            const existing = await IndexedDBService.getNote(editingNoteId);
            if (!existing) return;

            const updated = {
                ...existing,
                title, content,
                is_pinned: notePinInput.checked,
                tags: currentTags,
                folder_id: noteFolderSelect.value || null,
                updated_at: new Date().toISOString(),
                _dirty: true,
            };
            await IndexedDBService.putNote(updated);

            autosaveStatus.textContent = 'Saved locally ✓';
            autosaveStatus.className = 'autosave-status saved';
            lastSavedData = { title, content };

            // Refresh the note list silently
            allNotes = await IndexedDBService.getAllNotes();
            collectAllTags();
            updateFolderCounts();

            // Trigger async sync
            if (navigator.onLine) SyncEngine.sync().then(() => reloadNotesFromIDB());
        } catch (err) {
            autosaveStatus.textContent = 'Save failed';
            autosaveStatus.className = 'autosave-status error';
            console.error('[AutoSave] Error:', err);
        }
    }

    // ── Folder modal (online-only) ──
    function openFolderModal(folder = null) {
        editingFolderId = folder ? folder.id : null;
        folderModalTitle.textContent = folder ? 'Edit Folder' : 'New Folder';
        folderNameInput.value = folder ? folder.name : '';
        selectedFolderColor = folder ? folder.color : '#0a84ff';
        folderColorPicker.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === selectedFolderColor);
        });
        folderModal.classList.add('active');
        folderNameInput.focus();
    }

    function closeFolderModal() {
        folderModal.classList.remove('active');
        folderForm.reset();
        editingFolderId = null;
    }

    async function handleFolderSave(e) {
        e.preventDefault();
        const name = folderNameInput.value.trim();
        if (!name) { showToast('Folder name is required', 'error'); return; }

        let result;
        if (editingFolderId) {
            result = await FoldersService.updateFolder(editingFolderId, name, selectedFolderColor);
        } else {
            result = await FoldersService.createFolder(name, selectedFolderColor);
        }

        if (result.error) { showToast(result.error.message, 'error'); return; }
        showToast(editingFolderId ? 'Folder updated' : 'Folder created', 'success');
        closeFolderModal();
        await loadFolders();
    }

    // ── Toast ──
    function showToast(message, type = 'success') {
        toastEl.textContent = message;
        toastEl.className = type;
        void toastEl.offsetWidth;
        toastEl.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 3200);
    }

    // ── PWA ──
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').then((reg) => {
                console.log('[PWA] Service worker registered', reg.scope);
            }).catch((err) => {
                console.log('[PWA] SW registration failed:', err);
            });
        }
    }

    return { init };
})();
