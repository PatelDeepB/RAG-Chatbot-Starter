/**
 * Coordinates sidebar toggles, authentication flow, file uploading, and chat history.
 */
export class Sidebar {
    /**
     * @param {Object} config Config properties from API.
     */
    constructor(config) {
        this.config = config;
        
        // Dom References
        this.hamburgerBtn = document.getElementById('hamburger-menu');
        this.sidebarCloseBtn = document.getElementById('mobile-sidebar-close');
        this.body = document.body;
        
        // Auth Dom
        this.adminAuthTrigger = document.getElementById('admin-auth-trigger');
        this.adminLockIcon = document.getElementById('admin-lock-icon');
        this.adminLockedPanel = document.getElementById('admin-locked-panel');
        this.adminActivePanel = document.getElementById('admin-active-panel');
        this.btnUnlockAdmin = document.getElementById('btn-unlock-admin');
        
        this.authModal = document.getElementById('auth-modal');
        this.authModalClose = document.getElementById('auth-modal-close');
        this.authForm = document.getElementById('auth-form');
        this.adminPasswordInput = document.getElementById('admin-password');
        this.authErrorMsg = document.getElementById('auth-error-msg');
        
        // Document Dom
        this.uploadDropzone = document.getElementById('upload-dropzone');
        this.fileInput = document.getElementById('file-input');
        this.kbFileList = document.getElementById('kb-file-list');
        this.uploadProgressContainer = document.getElementById('upload-progress-container');
        this.progressBarFill = document.getElementById('progress-bar-fill');
        this.progressLabel = document.getElementById('progress-label');
        
        // Chat History Dom
        this.btnNewChat = document.getElementById('btn-new-chat');
        this.chatHistoryList = document.getElementById('chat-history-list');
        
        // State Properties
        this.token = sessionStorage.getItem('admin_token') || null;
        this.history = JSON.parse(localStorage.getItem('chat_history')) || [];
        this.activeChatId = localStorage.getItem('active_chat_id') || null;
        this.onChatSelectCallback = null;
        
        this.pollingInterval = null;
    }

    /**
     * Bootstraps UI events and lists.
     */
    init() {
        this.bindLayoutEvents();
        this.bindAuthEvents();
        this.bindUploadEvents();
        this.bindHistoryEvents();
        
        this.checkAuthStatus();
        this.renderHistory();
    }

    // --- Layout Actions ---

    bindLayoutEvents() {
        if (this.hamburgerBtn) {
            this.hamburgerBtn.addEventListener('click', () => {
                this.body.classList.add('sidebar-open');
            });
        }
        
        if (this.sidebarCloseBtn) {
            this.sidebarCloseBtn.addEventListener('click', () => {
                this.body.classList.remove('sidebar-open');
            });
        }
        
        // Close sidebar on clicking the overlay in mobile
        document.addEventListener('click', (e) => {
            if (this.body.classList.contains('sidebar-open') && 
                !e.target.closest('.sidebar') && 
                !e.target.closest('#hamburger-menu')) {
                this.body.classList.remove('sidebar-open');
            }
        });
    }

    // --- Authentication Actions ---

    bindAuthEvents() {
        const showModal = () => {
            this.authModal.classList.remove('hidden');
            this.adminPasswordInput.focus();
        };
        
        const hideModal = () => {
            this.authModal.classList.add('hidden');
            this.adminPasswordInput.value = '';
            this.authErrorMsg.classList.add('hidden');
        };

        if (this.btnUnlockAdmin) this.btnUnlockAdmin.addEventListener('click', showModal);
        if (this.adminAuthTrigger) this.adminAuthTrigger.addEventListener('click', () => {
            if (this.token) {
                // Logout if clicked while logged in
                this.logoutAdmin();
            } else {
                showModal();
            }
        });
        
        if (this.authModalClose) this.authModalClose.addEventListener('click', hideModal);
        
        if (this.authForm) {
            this.authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const password = this.adminPasswordInput.value;
                await this.loginAdmin(password);
            });
        }
    }

    async loginAdmin(password) {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (res.status === 200) {
                const data = await res.json();
                this.token = data.token;
                sessionStorage.setItem('admin_token', this.token);
                this.authModal.classList.add('hidden');
                this.adminPasswordInput.value = '';
                this.authErrorMsg.classList.add('hidden');
                
                this.updateAuthUI(true);
                this.fetchDocuments();
            } else {
                this.authErrorMsg.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Auth error', err);
            this.authErrorMsg.classList.remove('hidden');
        }
    }

    async checkAuthStatus() {
        if (!this.token) {
            this.updateAuthUI(false);
            return;
        }

        try {
            const res = await fetch('/api/auth/status', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.status === 200) {
                this.updateAuthUI(true);
                this.fetchDocuments();
            } else {
                this.logoutAdmin();
            }
        } catch {
            this.logoutAdmin();
        }
    }

    logoutAdmin() {
        this.token = null;
        sessionStorage.removeItem('admin_token');
        this.updateAuthUI(false);
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    updateAuthUI(isAuthenticated) {
        if (isAuthenticated) {
            this.adminLockIcon.setAttribute('data-lucide', 'unlock');
            this.adminLockedPanel.classList.add('hidden');
            this.adminActivePanel.classList.remove('hidden');
        } else {
            this.adminLockIcon.setAttribute('data-lucide', 'lock');
            this.adminLockedPanel.classList.remove('hidden');
            this.adminActivePanel.classList.add('hidden');
        }
        if (window.lucide) window.lucide.createIcons();
    }

    // --- Document Actions ---

    bindUploadEvents() {
        // Browse file click
        if (this.uploadDropzone) {
            this.uploadDropzone.addEventListener('click', () => {
                this.fileInput.click();
            });
            
            // Drag and drop handlers
            this.uploadDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.uploadDropzone.classList.add('dragover');
            });
            
            this.uploadDropzone.addEventListener('dragleave', () => {
                this.uploadDropzone.classList.remove('dragover');
            });
            
            this.uploadDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.uploadDropzone.classList.remove('dragover');
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) this.handleFileUploads(files);
            });
        }
        
        if (this.fileInput) {
            this.fileInput.setAttribute('multiple', 'true'); // Allow multiple select in browser picker
            this.fileInput.addEventListener('change', () => {
                const files = Array.from(this.fileInput.files);
                if (files.length > 0) this.handleFileUploads(files);
            });
        }
    }

    async handleFileUploads(files) {
        if (!files || files.length === 0) return;
        
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file); // Matches backend 'files' argument list
        });

        this.uploadProgressContainer.classList.remove('hidden');
        this.progressBarFill.style.width = '20%';
        this.progressLabel.textContent = `Uploading ${files.length} file(s)...`;

        try {
            // Simulated upload increments to look highly professional
            let progress = 20;
            const progressTimer = setInterval(() => {
                if (progress < 80) {
                    progress += 10;
                    this.progressBarFill.style.width = `${progress}%`;
                }
            }, 150);

            const res = await fetch('/api/documents/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            clearInterval(progressTimer);

            if (res.status === 200) {
                this.progressBarFill.style.width = '100%';
                this.progressLabel.textContent = 'Uploaded! Indexing in background...';
                
                setTimeout(() => {
                    this.uploadProgressContainer.classList.add('hidden');
                    this.progressBarFill.style.width = '0%';
                    this.fileInput.value = '';
                }, 1500);

                this.fetchDocuments();
                
                // Poll document list to show real-time "indexing" state updates
                this.startDocumentStatusPolling();
            } else {
                const data = await res.json();
                alert(`Upload failed: ${data.detail || 'Unknown error'}`);
                this.uploadProgressContainer.classList.add('hidden');
            }
        } catch (err) {
            console.error('Upload error', err);
            alert('Upload failed due to a network connection error.');
            this.uploadProgressContainer.classList.add('hidden');
        }
    }

    async fetchDocuments() {
        if (!this.token) return;
        try {
            const res = await fetch('/api/documents', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.status === 200) {
                const docs = await res.json();
                this.renderDocuments(docs);
                
                // If any document is still actively indexing in background, poll for updates
                const isIndexing = docs.some(d => d.status === 'indexing');
                if (isIndexing) {
                    this.startDocumentStatusPolling();
                } else if (this.pollingInterval && !isIndexing) {
                    clearInterval(this.pollingInterval);
                    this.pollingInterval = null;
                }
            }
        } catch (err) {
            console.error('Fetch docs error', err);
        }
    }

    startDocumentStatusPolling() {
        if (this.pollingInterval) return;
        this.pollingInterval = setInterval(() => {
            this.fetchDocuments();
        }, 3000);
    }

    renderDocuments(documents) {
        if (!this.kbFileList) return;
        this.kbFileList.innerHTML = '';

        if (documents.length === 0) {
            this.kbFileList.innerHTML = '<p class="admin-hint-text">No custom documents indexed yet.</p>';
            return;
        }

        documents.forEach(doc => {
            const sizeKB = (doc.sizeBytes / 1024).toFixed(1);
            
            // Resolve visual class and status label dynamically based on backend state
            let statusClass = 'indexing';
            let statusLabel = 'Indexing';
            
            if (doc.status === 'indexed') {
                statusClass = 'indexed';
                statusLabel = 'Indexed';
            } else if (doc.status && doc.status.startsWith('failed')) {
                statusClass = 'failed';
                statusLabel = doc.status; // Render exact failure reason (e.g. Invalid API key)
            } else if (doc.status) {
                statusClass = doc.status;
                statusLabel = doc.status.charAt(0).toUpperCase() + doc.status.slice(1);
            }
            
            const fileItem = document.createElement('div');
            fileItem.className = 'kb-file-item';
            fileItem.innerHTML = `
                <div class="file-info-col">
                    <i data-lucide="file-text" style="width:16px; height:16px; flex-shrink:0;"></i>
                    <div class="file-details">
                        <span class="file-name" title="${doc.name}">${doc.name}</span>
                        <div class="file-meta">
                            <span>${sizeKB} KB</span>
                            <span class="status-badge ${statusClass}">
                                ${statusLabel}
                            </span>
                        </div>
                    </div>
                </div>
                <button class="btn-file-delete" data-name="${doc.name}" title="Delete document">
                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                </button>
            `;
            
            // Delete action
            fileItem.querySelector('.btn-file-delete').addEventListener('click', async (e) => {
                const docName = e.currentTarget.getAttribute('data-name');
                if (confirm(`Are you sure you want to remove '${docName}' from the knowledge base?`)) {
                    await this.deleteDocument(docName);
                }
            });

            this.kbFileList.appendChild(fileItem);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    async deleteDocument(name) {
        try {
            const res = await fetch(`/api/documents/${encodeURIComponent(name)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.status === 200) {
                this.fetchDocuments();
                this.startDocumentStatusPolling();
            } else {
                alert('Deletion failed.');
            }
        } catch (err) {
            console.error('Delete error', err);
        }
    }

    // --- Chat Session History Actions ---

    bindHistoryEvents() {
        if (this.btnNewChat) {
            this.btnNewChat.addEventListener('click', () => {
                this.createNewChat();
            });
        }
    }

    registerOnChatSelect(callback) {
        this.onChatSelectCallback = callback;
    }

    createNewChat() {
        const id = 'chat_' + Date.now();
        const newChat = {
            id,
            title: 'New Conversation',
            messages: []
        };
        this.history.unshift(newChat);
        this.saveHistory();
        this.activeChatId = id;
        localStorage.setItem('active_chat_id', id);
        
        this.renderHistory();
        
        if (this.onChatSelectCallback) {
            this.onChatSelectCallback(newChat);
        }
        
        // Hide mobile sidebar
        this.body.classList.remove('sidebar-open');
    }

    selectChat(id) {
        this.activeChatId = id;
        localStorage.setItem('active_chat_id', id);
        this.renderHistory();

        const chat = this.history.find(c => c.id === id);
        if (chat && this.onChatSelectCallback) {
            this.onChatSelectCallback(chat);
        }
        
        // Hide mobile sidebar
        this.body.classList.remove('sidebar-open');
    }

    deleteChat(id, event) {
        event.stopPropagation(); // Avoid triggering selectChat
        
        this.history = this.history.filter(c => c.id !== id);
        this.saveHistory();
        
        if (this.activeChatId === id) {
            if (this.history.length > 0) {
                this.selectChat(this.history[0].id);
            } else {
                this.activeChatId = null;
                localStorage.removeItem('active_chat_id');
                if (this.onChatSelectCallback) {
                    this.onChatSelectCallback(null);
                }
            }
        }
        
        this.renderHistory();
    }

    updateActiveChatHistory(messages) {
        if (!this.activeChatId) return;
        
        const chat = this.history.find(c => c.id === this.activeChatId);
        if (chat) {
            chat.messages = messages;
            
            // Set dynamic title based on the first query
            const firstUserQuery = messages.find(m => m.role === 'user');
            if (firstUserQuery && chat.title === 'New Conversation') {
                chat.title = firstUserQuery.content.substring(0, 24) + (firstUserQuery.content.length > 24 ? '...' : '');
            }
            
            this.saveHistory();
            this.renderHistory();
        }
    }

    saveHistory() {
        localStorage.setItem('chat_history', JSON.stringify(this.history));
    }

    renderHistory() {
        if (!this.chatHistoryList) return;
        this.chatHistoryList.innerHTML = '';

        if (this.history.length === 0) {
            this.chatHistoryList.innerHTML = '<p class="admin-hint-text">No recent conversations.</p>';
            return;
        }

        this.history.forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-history-item ${chat.id === this.activeChatId ? 'active' : ''}`;
            item.innerHTML = `
                <div class="chat-title-container">
                    <i data-lucide="message-square" style="width:14px; height:14px; flex-shrink:0;"></i>
                    <span class="chat-item-title">${chat.title}</span>
                </div>
                <button class="chat-item-delete" title="Delete conversation">
                    <i data-lucide="trash" style="width:12px; height:12px;"></i>
                </button>
            `;

            item.addEventListener('click', () => this.selectChat(chat.id));
            
            item.querySelector('.chat-item-delete').addEventListener('click', (e) => {
                this.deleteChat(chat.id, e);
            });

            this.chatHistoryList.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }
}
