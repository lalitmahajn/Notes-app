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
    // App DOM refs
    const fabBtn = $('#fab-btn');
    const searchInput = $('#search-input');
    const sortSelect = $('#sort-select');
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

    // Right Pane (Inline Editor) DOM refs
    const noteEditorPane = $('#note-editor-pane');
    const editorEmptyState = $('#editor-empty-state');
    const editorContentArea = $('#editor-content-area');
    const editorBackBtn = $('#editor-back-btn');

    const noteForm = $('#note-form');
    const noteTitleInput = $('#note-title-input');
    const noteContentInput = $('#note-content-input');
    const notePreviewPane = $('#note-preview-pane');
    const editorTagsWrapper = $('#editor-tags-wrapper');
    const editorToolbar = $('#editor-toolbar');
    const editorSplitContainer = $('#editor-split-container');
    const tagInputWrapper = $('#tag-input-wrapper');
    const tagInput = $('#tag-input');
    const autosaveStatus = $('#autosave-status');

    // Bottom Bar Buttons
    const editorPreviewBtn = $('#editor-preview-btn');
    const editorSplitBtn = $('#editor-split-btn');
    const editorPinBtn = $('#editor-pin-btn');
    const editorTagsBtn = $('#editor-tags-btn');
    const editorDeleteBtn = $('#editor-delete-btn');
    const editorSaveBtn = $('#editor-save-btn');
    const editorSyncBtn = $('#editor-sync-btn');
    const settingsBtn = $('#settings-btn');

    // State
    let isSignUp = false;
    let editingNoteId = null;
    let toastTimeout = null;
    let allNotes = [];   // loaded from IndexedDB
    let allFolders = [];

    let currentTags = [];
    let activeFolder = 'all';
    let searchQuery = '';
    let editingFolderId = null;
    let selectedFolderColor = '#0a84ff';
    let deferredPWAPrompt = null;
    let currentUserId = null;

    // Auto-save
    let lastSavedData = null;
    let editorMode = 'edit';

    // Periodic sync timer
    let periodicSyncTimer = null;

    // ── Init ──
    async function init() {
        SupabaseService.init();
        bindEvents();
        listenNetworkChanges();
        listenAuthChanges();
        await restoreSession();
        registerServiceWorker();

        // Wire up SyncEngine status callback to update UI
        SyncEngine.setStatusCallback(updateSyncStatus);
    }

    /** Update the sync status pill in the top bar */
    function updateSyncStatus(state, msg) {
        let iconHtml = '';
        if (state === 'synced') {
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>`;
        } else if (state === 'needs-sync') {
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-circle"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>`;
        } else if (state === 'syncing') {
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" style="animation: spin 1s linear infinite"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
        } else if (state === 'offline' || state === 'error') {
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        }

        syncStatusEl.innerHTML = `<div style="display:flex; align-items:center; gap:4px;"><span>${msg}</span> ${iconHtml}</div>`;
        syncStatusEl.className = 'sync-status ' + state;
    }

    function bindEvents() {
        // Auth
        authForm.addEventListener('submit', handleAuthSubmit);
        authToggleBtn.addEventListener('click', toggleAuthMode);
        logoutBtn.addEventListener('click', handleLogout);

        // Notes (Inline Editor Actions)
        fabBtn.addEventListener('click', () => openNoteInEditor(null));
        noteForm.addEventListener('submit', handleNoteSave);

        // Editor Mobile Back Button
        editorBackBtn.addEventListener('click', hideEditorMobile);

        // Editor Bottom Bar Actions
        editorPreviewBtn.addEventListener('click', () => {
            if (editorMode === 'preview') setEditorMode('edit');
            else setEditorMode('preview');
        });

        editorSplitBtn.addEventListener('click', () => {
            if (editorMode === 'split') setEditorMode('edit');
            else setEditorMode('split');
        });

        editorToolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('.md-tool-btn');
            if (!btn) return;
            applyMarkdown(btn.dataset.md);
        });

        editorPinBtn.addEventListener('click', async () => {
            const isActive = editorPinBtn.classList.toggle('active');
            if (editingNoteId) {
                const note = allNotes.find(n => n.id === editingNoteId);
                if (note) {
                    const updated = { ...note, is_pinned: isActive, _dirty: true, updated_at: new Date().toISOString() };
                    await IndexedDBService.putNote(updated);
                    await reloadNotesFromIDB();
                    if (navigator.onLine) SyncEngine.sync();
                }
            }
        });

        editorTagsBtn.addEventListener('click', () => {
            editorTagsWrapper.classList.toggle('hidden');
            if (!editorTagsWrapper.classList.contains('hidden')) {
                tagInput.focus();
            }
        });

        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = tagInput.value.trim().toLowerCase();
                if (val && !currentTags.includes(val)) {
                    currentTags.push(val);
                    tagInput.value = '';
                    renderEditorTags();
                    if (editingNoteId) handleNoteSave(new Event('submit'));
                }
            } else if (e.key === 'Backspace' && !tagInput.value && currentTags.length > 0) {
                currentTags.pop();
                renderEditorTags();
                if (editingNoteId) handleNoteSave(new Event('submit'));
            }
        });

        editorDeleteBtn.addEventListener('click', async () => {
            if (!editingNoteId) return;
            if (!confirm('Delete this note?')) return;
            const idToDelete = editingNoteId;
            openNoteInEditor(null); // Clear editor immediately
            await IndexedDBService.markDeleted(idToDelete);
            showToast('Note deleted', 'success');
            await reloadNotesFromIDB();
            if (navigator.onLine) SyncEngine.sync().then(() => reloadNotesFromIDB());
        });

        editorSaveBtn.addEventListener('click', handleNoteSave);

        editorSyncBtn.addEventListener('click', async () => {
            if (!navigator.onLine) { showToast('You are offline', 'error'); return; }
            editorSyncBtn.classList.add('spinning');
            syncBtn.style.animation = 'spin 0.6s linear infinite';
            await SyncEngine.sync();
            await reloadNotesFromIDB();
            editorSyncBtn.classList.remove('spinning');
            syncBtn.style.animation = '';
            showToast('Sync complete', 'success');
        });

        settingsBtn.addEventListener('click', () => {
            showToast('Settings coming soon!', 'info');
        });

        // Auto-save — debounced (writes to IndexedDB)
        const triggerAutoSave = debounce(() => autoSave(), 1500);
        const triggerPreviewRender = debounce(() => {
            if (editorMode === 'split') updatePreview();
        }, 150);
        noteTitleInput.addEventListener('input', triggerAutoSave);
        noteContentInput.addEventListener('input', triggerAutoSave);
        noteContentInput.addEventListener('input', triggerPreviewRender);

        // Interactive Checklists in Preview
        notePreviewPane.addEventListener('change', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
                const cb = e.target;
                const index = parseInt(cb.dataset.index, 10);
                if (isNaN(index)) return;

                let matchCount = -1;
                const newContent = noteContentInput.value.replace(/^([\s]*[-*+]\s+\[)([\s xX])(\])/gm, (match, prefix, state, suffix) => {
                    matchCount++;
                    if (matchCount === index) {
                        const newState = cb.checked ? 'x' : ' ';
                        return `${prefix}${newState}${suffix}`;
                    }
                    return match;
                });

                if (newContent !== noteContentInput.value) {
                    noteContentInput.value = newContent;
                    const cursorPosition = noteContentInput.selectionStart;
                    noteContentInput.dispatchEvent(new Event('input'));
                    noteContentInput.setSelectionRange(cursorPosition, cursorPosition);
                }
            }
        });

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
            updateSyncStatus('syncing', 'Syncing...');
            SyncEngine.sync().then(() => reloadNotesFromIDB());
        });
        window.addEventListener('offline', () => {
            console.log('[Network] Went offline');
            updateSyncStatus('offline', 'Offline');
        });
        
        // Periodically check if there's dirty state while online
        setInterval(() => {
            if (navigator.onLine) SyncEngine.checkDirtyState();
        }, 5000);

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
          <button class="btn-icon btn-edit-folder" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg></button>
          <button class="btn-icon btn-delete-folder" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>
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


    function renderEditorTags() {
        // Remove existing tags
        tagInputWrapper.querySelectorAll('.tag-chip').forEach(el => el.remove());

        currentTags.forEach((tag, i) => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = `#${MarkdownService.escapeHTML(tag)} <span class="tag-remove" style="display:inline-flex; align-items:center; opacity:0.6; margin-left:2px;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>`;
            chip.querySelector('.tag-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                currentTags.splice(i, 1);
                renderEditorTags();
                if (editingNoteId) handleNoteSave(new Event('submit'));
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

        return `
      <div class="note-card${pinnedClass}${unsyncedClass}" data-id="${note.id}" style="animation-delay:${index * 0.05}s">
        ${pinBadge}
        <div class="note-title">${MarkdownService.escapeHTML(note.title || 'Untitled')}</div>
        <div class="note-meta">
          ${folderBadge}
          ${tagChips ? `<div class="note-tags">${tagChips}</div>` : ''}
          <span class="note-date">${time}</span>
        </div>
      </div>`;
    }

    function bindNoteCardEvents(notes) {
        notesGrid.querySelectorAll('.note-card').forEach(card => {
            const id = card.dataset.id;
            const note = notes.find(n => n.id === id);

            card.addEventListener('click', (e) => {
                if (note) openNoteInEditor(note);
            });
        });
    }

    // ── Editor ──
    function showEditorMobile() {
        document.body.classList.add('show-editor');
    }

    function hideEditorMobile() {
        document.body.classList.remove('show-editor');
        // Un-highlight active note
        const c = notesGrid.querySelector('.note-card.active-note');
        if (c) c.classList.remove('active-note');
    }

    function updatePreview() {
        notePreviewPane.innerHTML = MarkdownService.render(noteContentInput.value);
        MarkdownService.highlight(notePreviewPane);

        // Make rendered checkboxes interactive
        notePreviewPane.querySelectorAll('input[type="checkbox"]').forEach((cb, index) => {
            cb.removeAttribute('disabled');
            cb.dataset.index = index;
            cb.style.cursor = 'pointer';
        });
    }

    function setEditorMode(mode) {
        editorMode = mode;
        const isPreview = mode === 'preview';
        const isSplit = mode === 'split';

        notePreviewPane.classList.toggle('hidden', !isPreview && !isSplit);
        noteContentInput.classList.toggle('hidden', isPreview);
        editorSplitContainer.classList.toggle('split', isSplit);

        editorPreviewBtn.classList.toggle('active', isPreview);
        editorSplitBtn.classList.toggle('active', isSplit);

        if (isPreview || isSplit) updatePreview();
    }

    function wrapSelection(prefix, suffix, placeholder) {
        const el = noteContentInput;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = el.value.slice(start, end);
        const insert = selected || placeholder;
        el.value = el.value.slice(0, start) + prefix + insert + suffix + el.value.slice(end);
        el.setSelectionRange(start + prefix.length, start + prefix.length + insert.length);
        el.focus();
    }

    function prefixLines(prefix) {
        const el = noteContentInput;
        const value = el.value;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const lineStart = value.lastIndexOf('\n', start - 1);
        const startIndex = lineStart === -1 ? 0 : lineStart + 1;
        const selected = value.slice(startIndex, end);
        const lines = selected.split('\n').map(line => prefix + line);
        const newText = lines.join('\n');
        el.value = value.slice(0, startIndex) + newText + value.slice(end);
        el.setSelectionRange(startIndex, startIndex + newText.length);
        el.focus();
    }

    function applyMarkdown(action) {
        if (editorMode === 'preview') setEditorMode('edit');

        switch (action) {
            case 'bold':
                wrapSelection('**', '**', 'bold text');
                break;
            case 'italic':
                wrapSelection('*', '*', 'italic text');
                break;
            case 'heading':
                prefixLines('# ');
                break;
            case 'list':
                prefixLines('- ');
                break;
            case 'checklist':
                prefixLines('- [ ] ');
                break;
            case 'quote':
                prefixLines('> ');
                break;
            case 'code':
                wrapSelection('`', '`', 'code');
                break;
            case 'codeblock':
                wrapSelection('```\n', '\n```', 'code');
                break;
            case 'link': {
                const el = noteContentInput;
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const selected = el.value.slice(start, end) || 'link text';
                const url = 'https://';
                const insert = `[${selected}](${url})`;
                el.value = el.value.slice(0, start) + insert + el.value.slice(end);
                const urlStart = start + selected.length + 3;
                el.setSelectionRange(urlStart, urlStart + url.length);
                el.focus();
                break;
            }
            default:
                return;
        }

        noteContentInput.dispatchEvent(new Event('input'));
    }

    function openNoteInEditor(note = null) {
        editingNoteId = note ? note.id : null;

        if (note) {
            editorEmptyState.classList.add('hidden');
            editorContentArea.classList.remove('hidden');
            noteTitleInput.value = note.title || '';
            noteContentInput.value = note.content || '';
            editorPinBtn.classList.toggle('active', note.is_pinned || false);
            currentTags = note.tags || [];
            renderEditorTags();
            editorTagsWrapper.classList.add('hidden'); // Close by default

            // Default to preview mode for existing notes
            setEditorMode('preview');

            lastSavedData = { title: note.title, content: note.content };
            autosaveStatus.classList.remove('hidden');
            autosaveStatus.textContent = 'Saved';
            autosaveStatus.className = 'autosave-status saved';
        } else {
            // New Note - default to edit mode
            setEditorMode('edit');

            editorEmptyState.classList.add('hidden');
            editorContentArea.classList.remove('hidden');
            noteTitleInput.value = '';
            noteContentInput.value = '';
            editorPinBtn.classList.remove('active');

            lastSavedData = null;
            autosaveStatus.classList.add('hidden');
        }

        highlightActiveNoteCard();

        // Setup initial text content
        noteTitleInput.focus();

        // Show the pane on mobile
        showEditorMobile();
    }

    function highlightActiveNoteCard() {
        notesGrid.querySelectorAll('.note-card').forEach(c => {
            c.classList.toggle('active-note', c.dataset.id === String(editingNoteId));
        });
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

        const saveBtn = null; // No dedicated save btn in inline mode, handled by autosave predominantly

        const now = new Date().toISOString();

        const isPinned = editorPinBtn.classList.contains('active');
        const folderId = (activeFolder !== 'all') ? activeFolder : null;

        if (editingNoteId) {
            // Update existing note in IndexedDB
            const existing = await IndexedDBService.getNote(editingNoteId);
            const updated = {
                ...existing,
                title, content,
                is_pinned: isPinned,
                tags: currentTags,
                updated_at: now,
                _dirty: true,
            };
            await IndexedDBService.putNote(updated);
        } else {
            // Create new note in IndexedDB
            const id = generateLocalId();
            const newNote = {
                id: id,
                user_id: currentUserId,
                title, content,
                is_pinned: isPinned,
                tags: currentTags,
                folder_id: folderId,
                created_at: now,
                updated_at: now,
                _dirty: true,
                _deleted: false,
                _local: true,
            };
            await IndexedDBService.putNote(newNote);
            editingNoteId = id; // Set active id
        }
        lastSavedData = { title, content };
        autosaveStatus.classList.remove('hidden');
        autosaveStatus.textContent = 'Saved locally';
        autosaveStatus.className = 'autosave-status saved';

        showToast('Note saved', 'success');
        await reloadNotesFromIDB();
        highlightActiveNoteCard();

        // Instantly switch to Needs Sync before background sync kicks in
        updateSyncStatus('needs-sync', 'Needs Sync');

        // Async sync Ã¢â‚¬â€ don't block UI
        if (navigator.onLine) SyncEngine.sync().then(() => reloadNotesFromIDB());
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Auto-save (writes to IndexedDB, not Supabase) Ã¢â€â‚¬Ã¢â€â‚¬
    async function autoSave() {
        if (!editingNoteId) return;
        const title = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();
        if (!title) return;

        if (lastSavedData && lastSavedData.title === title && lastSavedData.content === content) return;

        autosaveStatus.textContent = 'Saving...';
        autosaveStatus.className = 'autosave-status saving';
        autosaveStatus.classList.remove('hidden');

        try {
            const existing = await IndexedDBService.getNote(editingNoteId);
            if (!existing) return;

            const updated = {
                ...existing,
                title, content,
                updated_at: new Date().toISOString(),
                _dirty: true,
            };
            await IndexedDBService.putNote(updated);

            autosaveStatus.textContent = 'Saved';
            autosaveStatus.className = 'autosave-status saved';
            lastSavedData = { title, content };

            // Refresh the note list silently
            allNotes = await IndexedDBService.getAllNotes();
            collectAllTags();
            updateFolderCounts();
            renderFilteredNotes();
            highlightActiveNoteCard();

            // Trigger async sync
            if (navigator.onLine) SyncEngine.sync().then(() => reloadNotesFromIDB());
        } catch (err) {
            autosaveStatus.textContent = 'Save failed';
            autosaveStatus.className = 'autosave-status error';
            console.error('[AutoSave] Error:', err);
        }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Folder modal (online-only) Ã¢â€â‚¬Ã¢â€â‚¬
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

    // Ã¢â€â‚¬Ã¢â€â‚¬ Toast Ã¢â€â‚¬Ã¢â€â‚¬
    function showToast(message, type = 'success') {
        toastEl.textContent = message;
        toastEl.className = type;
        void toastEl.offsetWidth;
        toastEl.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 3200);
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ PWA Ã¢â€â‚¬Ã¢â€â‚¬
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
