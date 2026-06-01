/**
 * Showcase Chat Interface Module (Open-Source Showcase Edition)
 * 
 * Orchestrates sending queries, parsing Markdown/Syntax, streaming SSE responses,
 * injecting showcase code block copy-headers, and slide-out citation drawers.
 * 
 * TRACKING CHANGES (Rule 6):
         - Added this change log header.
         - Initialized this.citationOverlay and this.isCopying state fields.
         - Refactored avatars inside appendMessageBubble and appendEmptyAIMessageBubble to render Lucide SVGs.
         - Wrote formatCodeBlocks() helper to inject language titles and functional click-to-copy headers.
         - Wrote writeCodeToClipboard() for micro-animated copy status checks.
         - Hooked up slide-out right drawer animation classes (open/close) on citations triggers.
         - Fully refactored handleUserSubmit() into modular sub-helper methods under 40 lines (Rule 3).
 */

export class ChatInterface {
    /**
     * @param {Object} config Configurations from API.
     * @param {Sidebar} sidebar Sidebar instance managing history.
     */
    constructor(config, sidebar) {
        this.config = config;
        this.sidebar = sidebar;
        
        // Dom References
        this.chatInputForm = document.getElementById('chat-input-form');
        this.chatTextarea = document.getElementById('chat-input-textarea');
        this.btnSend = document.getElementById('btn-send');
        this.charCounter = document.getElementById('char-counter');
        
        this.chatOutputArea = document.getElementById('chat-output-area');
        this.welcomeContainer = document.getElementById('welcome-container');
        this.messageList = document.getElementById('message-stream-list');
        
        this.ragToggle = document.getElementById('rag-toggle');
        this.modelNameLabel = document.getElementById('model-name-label');
        this.btnExportChat = document.getElementById('btn-export-chat');
        
        // Citations Drawer References
        this.citationModal = document.getElementById('citation-modal');
        this.citationModalClose = document.getElementById('citation-modal-close');
        this.citationTitle = document.getElementById('citation-title');
        this.citationRelevance = document.getElementById('citation-relevance');
        this.citationSourceText = document.getElementById('citation-source-text');
        this.citationOverlay = document.getElementById('citation-drawer-overlay');
        
        // State Properties
        this.messages = [];
        this.isGenerating = false;
        this.isCopying = false; // Prevents spam-clicks during copy-resets
        
        this.initMarkdownParser();
    }

    /**
     * Initializes Markdown syntax highlighting rules.
     */
    initMarkdownParser() {
        if (window.marked) {
            window.marked.setOptions({
                highlight: (code, lang) => {
                    const language = window.hljs.getLanguage(lang) ? lang : 'plaintext';
                    return window.hljs.highlight(code, { language }).value;
                },
                langPrefix: 'hljs language-'
            });
        }
    }

    /**
     * Binds chat form submit and input events.
     */
    init() {
        this.bindEvents();
        this.setupTextareaAutoResize();
        
        // Register history callback to load active chat
        this.sidebar.registerOnChatSelect((chat) => {
            this.loadChatSession(chat);
        });

        this.applyBrandingConfigs();
    }

    /**
     * Sets welcome and configurations based on Dynamic API values.
     */
    applyBrandingConfigs() {
        if (this.config.welcomeMessage) {
            const welcomeSub = document.getElementById('welcome-subtitle');
            if (welcomeSub) welcomeSub.textContent = this.config.welcomeMessage;
        }
        
        if (this.config.chatbotName) {
            const welcomeTitle = document.getElementById('welcome-title');
            if (welcomeTitle) welcomeTitle.textContent = this.config.chatbotName;
        }

        this.updateModelBadge();
        this.updateRagToggleState();
        this.verifyBrandingLogos();
    }

    /**
     * Sets readable LLM model description badges cleanly.
     */
    updateModelBadge() {
        if (this.config.modelName && this.modelNameLabel) {
            let prettyName = this.config.modelName;
            if (prettyName === 'gpt-4o-mini') {
                prettyName = 'GPT-4o Mini';
            } else if (prettyName === 'gemini-1.5-flash') {
                prettyName = 'Gemini 1.5 Flash';
            } else if (prettyName === 'gemini-1.5-pro') {
                prettyName = 'Gemini 1.5 Pro';
            } else if (prettyName === 'gemini-2.5-flash') {
                prettyName = 'Gemini 2.5 Flash';
            }
            this.modelNameLabel.textContent = prettyName;
        }
    }

    /**
     * Configures RAG capabilities dynamically based on configuration.
     */
    updateRagToggleState() {
        if (this.ragToggle && this.config.isRagEnabled === false) {
            this.ragToggle.checked = false;
            this.ragToggle.disabled = true;
            this.ragToggle.closest('.toggle-container').style.opacity = '0.5';
        }
    }

    /**
     * Resolves fallbacks for custom company logos dynamically.
     */
    verifyBrandingLogos() {
        const logoImg = document.getElementById('logo-img');
        const logoGraphic = document.getElementById('logo-graphic');
        const welcomeLogoImg = document.getElementById('welcome-logo-img');
        const welcomePlaceholder = document.getElementById('welcome-graphic-placeholder');
        const brandLogoContainer = document.getElementById('brand-logo-container');

        const swapLogo = (img, placeholder, isSidebar = false) => {
            if (img && placeholder) {
                const showLogo = () => {
                    img.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                    if (isSidebar && brandLogoContainer) {
                        brandLogoContainer.classList.add('has-image');
                    }
                };
                if (img.complete && img.naturalHeight !== 0) {
                    showLogo();
                } else {
                    img.addEventListener('load', showLogo);
                }
            }
        };

        swapLogo(logoImg, logoGraphic, true);
        swapLogo(welcomeLogoImg, welcomePlaceholder, false);
    }

    /**
     * Binds click events and form listeners.
     */
    bindEvents() {
        if (this.chatInputForm) {
            this.chatInputForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleUserSubmit();
            });
        }

        if (this.chatTextarea) {
            this.chatTextarea.addEventListener('input', () => this.updateCharacterCount());
            this.chatTextarea.addEventListener('keydown', (e) => this.handleTextareaEnter(e));
        }

        // Suggestions
        document.querySelectorAll('.suggested-card').forEach(card => {
            card.addEventListener('click', () => {
                const query = card.getAttribute('data-query');
                this.insertSuggestedQuery(query);
            });
        });

        // Close triggers for citations
        if (this.citationModalClose) {
            this.citationModalClose.addEventListener('click', () => this.closeCitationDrawer());
        }
        if (this.citationOverlay) {
            this.citationOverlay.addEventListener('click', () => this.closeCitationDrawer());
        }

        if (this.btnExportChat) {
            this.btnExportChat.addEventListener('click', () => this.exportActiveChatToMarkdown());
        }
    }

    /**
     * Closes the citations sliding side panel cleanly.
     */
    closeCitationDrawer() {
        if (this.citationModal) this.citationModal.classList.remove('open');
        if (this.citationOverlay) this.citationOverlay.classList.remove('open');
    }

    /**
     * Submits textarea value on hitting Enter responsibly (shift+enter allows newlines).
     * @param {KeyboardEvent} e Key event
     */
    handleTextareaEnter(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!this.isGenerating && this.chatTextarea.value.trim()) {
                this.chatInputForm.requestSubmit();
            }
        }
    }

    /**
     * Populates Suggested Queries inside the console.
     * @param {string} query Search text
     */
    insertSuggestedQuery(query) {
        if (query && this.chatTextarea) {
            this.chatTextarea.value = query;
            this.updateCharacterCount();
            this.chatTextarea.focus();
        }
    }

    /**
     * Auto adjusts input field heights on overflow.
     */
    setupTextareaAutoResize() {
        if (!this.chatTextarea) return;
        this.chatTextarea.addEventListener('input', () => {
            this.chatTextarea.style.height = 'auto';
            const scrollHeight = this.chatTextarea.scrollHeight;
            this.chatTextarea.style.height = `${Math.min(scrollHeight, 180)}px`;
        });
    }

    /**
     * Counts characters and updates send buttons dynamically.
     */
    updateCharacterCount() {
        const val = this.chatTextarea.value;
        const count = val.length;
        this.charCounter.textContent = `${count}/4000`;
        
        if (val.trim() && !this.isGenerating) {
            this.btnSend.removeAttribute('disabled');
        } else {
            this.btnSend.setAttribute('disabled', 'true');
        }
    }

    /**
     * Loads the selected conversation flow into current view history.
     * @param {Object} chat Selected conversation model.
     */
    loadChatSession(chat) {
        this.messageList.innerHTML = '';
        
        if (!chat) {
            this.messages = [];
            this.welcomeContainer.classList.remove('hidden');
            if (this.btnExportChat) this.btnExportChat.setAttribute('disabled', 'true');
            return;
        }

        this.welcomeContainer.classList.add('hidden');
        this.messages = chat.messages || [];
        
        if (this.btnExportChat) {
            if (this.messages.length > 0) {
                this.btnExportChat.removeAttribute('disabled');
            } else {
                this.btnExportChat.setAttribute('disabled', 'true');
            }
        }
        
        this.messages.forEach(msg => {
            this.appendMessageBubble(msg.role, msg.content, msg.sources);
        });
        
        this.scrollToBottom();
    }

    /**
     * Initiates state elements for chat submission helper (Rule 3).
     * @param {string} query User query string.
     * @returns {string} The generated AI message bubble ID.
     */
    initiateSubmission(query) {
        this.isGenerating = true;
        this.btnSend.setAttribute('disabled', 'true');
        this.chatTextarea.value = '';
        this.chatTextarea.style.height = 'auto';
        this.charCounter.textContent = '0/4000';
        this.welcomeContainer.classList.add('hidden');

        // User bubble
        const userMsg = { role: 'user', content: query };
        this.messages.push(userMsg);
        
        if (this.btnExportChat) this.btnExportChat.removeAttribute('disabled');
        
        this.appendMessageBubble('user', query);
        this.sidebar.updateActiveChatHistory(this.messages);
        this.scrollToBottom();

        // Empty AI placeholder
        const aiBubbleId = 'ai_bubble_' + Date.now();
        this.appendEmptyAIMessageBubble(aiBubbleId);
        this.scrollToBottom();

        return aiBubbleId;
    }

    /**
     * Post-processes rendered code blocks to inject dynamic Copy button structures.
     * @param {HTMLElement} element Parent row/bubble element.
     */
    injectCodeBlockHeaders(element) {
        if (!element) return;
        const preBlocks = element.querySelectorAll('pre');
        
        preBlocks.forEach(pre => {
            if (pre.parentNode && pre.parentNode.classList.contains('code-block-container')) return;
            const code = pre.querySelector('code');
            if (!code) return;
            
            // Resolve programming language from CSS class name
            let lang = 'code';
            const classes = Array.from(code.classList);
            const langClass = classes.find(c => c.startsWith('language-') || c.startsWith('hljs'));
            if (langClass) {
                lang = langClass.replace('language-', '').replace('hljs', '').trim() || 'code';
            }
            
            const container = document.createElement('div');
            container.className = 'code-block-container';
            
            const header = document.createElement('div');
            header.className = 'code-block-header';
            header.innerHTML = `
                <span class="code-lang-label">${lang}</span>
                <button class="code-copy-btn" aria-label="Copy code fragment contents">
                    <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                    <span>Copy</span>
                </button>
            `;
            
            pre.parentNode.insertBefore(container, pre);
            container.appendChild(header);
            container.appendChild(pre);
            
            const copyBtn = header.querySelector('.code-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                    await this.writeCodeToClipboard(code.textContent || '', copyBtn);
                });
            }
        });
        
        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Securely copies code text and animates success checkmarks.
     * @param {string} text Text payload to copy.
     * @param {HTMLButtonElement} button Copy button node.
     */
    async writeCodeToClipboard(text, button) {
        if (this.isCopying) return;
        this.isCopying = true;
        
        try {
            await navigator.clipboard.writeText(text);
            
            const label = button.querySelector('span');
            const icon = button.querySelector('i');
            
            if (label && icon) {
                const originalLabel = label.textContent;
                const originalIcon = icon.getAttribute('data-lucide');
                
                label.textContent = 'Copied!';
                icon.setAttribute('data-lucide', 'check');
                button.style.color = '#10b981';
                
                if (window.lucide) window.lucide.createIcons();
                
                setTimeout(() => {
                    label.textContent = originalLabel;
                    icon.setAttribute('data-lucide', originalIcon || 'copy');
                    button.style.color = '';
                    if (window.lucide) window.lucide.createIcons();
                    this.isCopying = false;
                }, 2000);
            } else {
                this.isCopying = false;
            }
        } catch (err) {
            console.error('Clipboard copy operation failed', err);
            this.isCopying = false;
        }
    }

    /**
     * Connects to backend LLM streaming API.
     * @param {boolean} enableRag Whether documents RAG retrieval is toggled.
     * @returns {Promise<Response>} The streaming API fetch response.
     */
    async executeChatStreamFetch(enableRag) {
        return fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: this.messages,
                enableRag
            })
        });
    }

    /**
     * Parses chunk contents and updates AI message bubbles dynamically.
     * @param {ReadableStreamReader} reader Stream reader block.
     * @param {string} aiBubbleId AI Bubble ID mapping.
     */
    async readStreamChunks(reader, aiBubbleId) {
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let streamText = '';
        let sources = [];

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop(); // Keep partial segment

                for (const part of parts) {
                    if (!part.trim()) continue;

                    // Deconstruct Server-Sent Events structure
                    const { eventName, eventData } = this.parseSseEvent(part);

                    if (eventName === 'sources') {
                        sources = JSON.parse(eventData);
                    } else if (eventName === 'delta') {
                        const parsedToken = JSON.parse(eventData);
                        streamText += parsedToken;
                        this.updateAIMessageContent(aiBubbleId, streamText, sources);
                        this.scrollToBottom();
                    } else if (eventName === 'error') {
                        const errMsg = JSON.parse(eventData);
                        this.renderStreamError(aiBubbleId, errMsg);
                        return;
                    }
                }
            }

            // Ingest stream complete
            const aiMsg = { role: 'assistant', content: streamText, sources };
            this.messages.push(aiMsg);
            this.sidebar.updateActiveChatHistory(this.messages);
        } catch (err) {
            console.error('Stream chunk parsing interrupted', err);
            this.renderStreamError(aiBubbleId, 'Network streaming connection error.');
        }
    }

    /**
     * Deconstructs raw Server-Sent Event strings cleanly (Rule 3 helper).
     * @param {string} part Single SSE raw payload segment.
     * @returns {Object} Extracted event name and data values.
     */
    parseSseEvent(part) {
        const lines = part.split('\n');
        let eventName = 'delta';
        let eventData = '';

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                eventName = line.replace('event: ', '').trim();
            } else if (line.startsWith('data: ')) {
                eventData = line.replace('data: ', '').trim();
            }
        }

        return { eventName, eventData };
    }

    /**
     * Entry handler initiating the asynchronous streaming execution (Rule 3 Compliant).
     */
    async handleUserSubmit() {
        const query = this.chatTextarea.value.trim();
        if (!query || this.isGenerating) return;

        if (!this.sidebar.activeChatId) {
            this.sidebar.createNewChat();
        }

        const aiBubbleId = this.initiateSubmission(query);
        const enableRag = this.ragToggle ? this.ragToggle.checked : true;
        
        try {
            const res = await this.executeChatStreamFetch(enableRag);

            if (res.status !== 200) {
                this.renderStreamError(aiBubbleId, 'Failed to connect to LLM Service.');
                return;
            }

            const reader = res.body.getReader();
            await this.readStreamChunks(reader, aiBubbleId);

        } catch (err) {
            console.error('Streaming connection failed globally', err);
            this.renderStreamError(aiBubbleId, 'Network streaming connection error.');
        } finally {
            this.isGenerating = false;
            this.updateCharacterCount();
        }
    }

    /**
     * Renders standard user or response message bubbles.
     */
    appendMessageBubble(role, content, sources = []) {
        const row = document.createElement('div');
        row.className = `msg-row ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.innerHTML = role === 'user' 
            ? '<i data-lucide="user" style="width: 16px; height: 16px;"></i>' 
            : '<i data-lucide="sparkles" style="width: 16px; height: 16px;"></i>';
        
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        
        if (role === 'user') {
            bubble.textContent = content;
        } else {
            bubble.innerHTML = window.marked ? window.marked.parse(content) : content;
            if (sources && sources.length > 0) {
                this.renderCitationsInsideBubble(bubble, sources);
            }
        }

        row.appendChild(avatar);
        row.appendChild(bubble);
        this.messageList.appendChild(row);
        
        // Format nested syntax highlighting and copy triggers
        row.querySelectorAll('pre code').forEach(block => {
            if (window.hljs) window.hljs.highlightElement(block);
        });
        
        this.injectCodeBlockHeaders(row);
        
        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Appends placeholder indicators during LLM processing operations.
     */
    appendEmptyAIMessageBubble(id) {
        const row = document.createElement('div');
        row.className = 'msg-row ai-msg';
        row.id = id;
        
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.innerHTML = '<i data-lucide="sparkles" style="width: 16px; height: 16px;"></i>';
        
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        
        bubble.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;

        row.appendChild(avatar);
        row.appendChild(bubble);
        this.messageList.appendChild(row);
        
        if (window.lucide) window.lucide.createIcons();
        return row;
    }

    /**
     * Accumulates streaming tokens and appends source tags when complete.
     */
    updateAIMessageContent(id, text, sources = []) {
        const row = document.getElementById(id);
        if (!row) return;

        const bubble = row.querySelector('.msg-bubble');
        if (!bubble) return;

        bubble.innerHTML = window.marked ? window.marked.parse(text) : text;

        if (sources && sources.length > 0) {
            this.renderCitationsInsideBubble(bubble, sources);
        }

        row.querySelectorAll('pre code').forEach(block => {
            if (window.hljs) window.hljs.highlightElement(block);
        });

        this.injectCodeBlockHeaders(row);
    }

    /**
     * Visual diagnostics when streams fail.
     */
    renderStreamError(id, message) {
        const row = document.getElementById(id);
        if (!row) return;

        const bubble = row.querySelector('.msg-bubble');
        if (bubble) {
            bubble.innerHTML = `<span class="error-text">❌ error: ${message}</span>`;
        }
        this.isGenerating = false;
        this.updateCharacterCount();
    }

    /**
     * Renders matching document source links inside response cards.
     */
    renderCitationsInsideBubble(bubbleElement, sources) {
        let citationContainer = bubbleElement.querySelector('.citations-wrapper');
        if (citationContainer) {
            citationContainer.remove();
        }

        citationContainer = document.createElement('div');
        citationContainer.className = 'citations-wrapper';
        citationContainer.innerHTML = `<span class="citations-header">Retrieved Context Sources:</span>`;

        const tagList = document.createElement('div');
        tagList.className = 'citations-list';

        sources.forEach((source, index) => {
            const docName = source.metadata.source || 'Unknown';
            const pageInfo = source.metadata.page ? `, Page ${source.metadata.page}` : '';
            const scorePercent = Math.round(source.similarity * 100);
            
            const tag = document.createElement('button');
            tag.className = 'citation-tag';
            tag.innerHTML = `
                <i data-lucide="file" style="width: 12px; height: 12px;"></i>
                <span>[${index + 1}] ${docName}${pageInfo}</span>
                <span class="relevance-badge" style="margin-top:0; padding:1px 3px; font-size:8px;">
                    ${scorePercent}%
                </span>
            `;

            tag.addEventListener('click', () => {
                this.displayCitationDetail(source, docName, pageInfo, scorePercent);
            });

            tagList.appendChild(tag);
        });

        citationContainer.appendChild(tagList);
        bubbleElement.appendChild(citationContainer);
        
        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Dynamic sliding drawer display for citation inspections (Showcase Upgrade).
     */
    displayCitationDetail(source, docName, pageInfo, scorePercent) {
        if (this.citationTitle) this.citationTitle.textContent = `${docName}${pageInfo}`;
        
        if (this.citationRelevance) {
            this.citationRelevance.textContent = `${scorePercent}% Match`;
            this.citationRelevance.className = 'relevance-badge';
            
            if (scorePercent >= 85) {
                this.citationRelevance.classList.add('relevance-high');
            } else if (scorePercent >= 60) {
                this.citationRelevance.classList.add('relevance-medium');
            } else {
                this.citationRelevance.classList.add('relevance-low');
            }
        }
        
        if (this.citationSourceText) this.citationSourceText.textContent = source.text;
        
        if (this.citationModal) this.citationModal.classList.add('open');
        if (this.citationOverlay) this.citationOverlay.classList.add('open');
    }

    /**
     * Scrolls content view to bottom zone.
     */
    scrollToBottom() {
        this.chatOutputArea.scrollTo({
            top: this.chatOutputArea.scrollHeight,
            behavior: 'smooth'
        });
    }

    /**
     * Exposes markdown files of active chat sessions dynamically.
     */
    exportActiveChatToMarkdown() {
        if (!this.messages || this.messages.length === 0) return;
        
        const chatTitle = this.sidebar.history.find(c => c.id === this.sidebar.activeChatId)?.title || "Conversation";
        const dateStr = new Date().toLocaleDateString();
        
        let markdown = `# AI Chat Export - ${chatTitle}\n`;
        markdown += `*Date: ${dateStr}*\n\n`;
        markdown += `---\n\n`;
        
        this.messages.forEach(msg => {
            const roleName = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
            markdown += `### ${roleName}:\n${msg.content}\n\n`;
            
            if (msg.sources && msg.sources.length > 0) {
                markdown += `**Retrieved Context Sources:**\n`;
                msg.sources.forEach((src, idx) => {
                    const docName = src.metadata.source || "Source";
                    const pageStr = src.metadata.page ? `, Page ${src.metadata.page}` : "";
                    const simPercent = Math.round(src.similarity * 100);
                    markdown += `- [${idx + 1}] *${docName}${pageStr}* (Relevance: ${simPercent}%)\n`;
                });
                markdown += `\n`;
            }
            markdown += `---\n\n`;
        });
        
        this.downloadMarkdownFile(markdown, chatTitle);
    }

    /**
     * Prepares and triggers the file downloader.
     * @param {string} content Markdown compiled content.
     * @param {string} chatTitle Safe filename context.
     */
    downloadMarkdownFile(content, chatTitle) {
        try {
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            
            const safeFilename = chatTitle.toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') || 'chat_history';
                
            downloadLink.href = url;
            downloadLink.setAttribute('download', `${safeFilename}_export.md`);
            downloadLink.style.visibility = 'hidden';
            
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to compile file download', err);
            alert('Failed to export conversation.');
        }
    }
}
