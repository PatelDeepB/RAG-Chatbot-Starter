/**
 * Orchestrates sending queries, parsing Markdown/Syntax, streaming SSE responses,
 * and displaying clickable citation tags.
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
        
        // Citation Drawer Dom
        this.citationModal = document.getElementById('citation-modal');
        this.citationModalClose = document.getElementById('citation-modal-close');
        this.citationTitle = document.getElementById('citation-title');
        this.citationRelevance = document.getElementById('citation-relevance');
        this.citationSourceText = document.getElementById('citation-source-text');
        
        // State Properties
        this.messages = [];
        this.isGenerating = false;
        
        // Configure Markdown options
        if (window.marked) {
            window.marked.setOptions({
                highlight: function(code, lang) {
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

        // Initialize display configuration values
        if (this.config.welcomeMessage) {
            const welcomeSub = document.getElementById('welcome-subtitle');
            if (welcomeSub) welcomeSub.textContent = this.config.welcomeMessage;
        }
        
        if (this.config.chatbotName) {
            const welcomeTitle = document.getElementById('welcome-title');
            if (welcomeTitle) welcomeTitle.textContent = this.config.chatbotName;
        }

        // Set RAG toggle capability based on system config
        if (this.ragToggle && this.config.isRagEnabled === false) {
            this.ragToggle.checked = false;
            this.ragToggle.disabled = true;
            this.ragToggle.closest('.toggle-container').style.opacity = '0.5';
        }
    }

    bindEvents() {
        // Chat submission
        if (this.chatInputForm) {
            this.chatInputForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleUserSubmit();
            });
        }

        // Textarea adjustments
        if (this.chatTextarea) {
            this.chatTextarea.addEventListener('input', () => {
                this.updateCharacterCount();
            });
            
            // Allow Ctrl+Enter or Cmd+Enter to submit, and regular Enter to submit if not typing multi-lines
            this.chatTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!this.isGenerating && this.chatTextarea.value.trim()) {
                        this.chatInputForm.requestSubmit();
                    }
                }
            });
        }

        // Click suggestions cards
        document.querySelectorAll('.suggested-card').forEach(card => {
            card.addEventListener('click', () => {
                const query = card.getAttribute('data-query');
                if (query && this.chatTextarea) {
                    this.chatTextarea.value = query;
                    this.updateCharacterCount();
                    this.chatTextarea.focus();
                }
            });
        });

        // Citation closing
        if (this.citationModalClose) {
            this.citationModalClose.addEventListener('click', () => {
                this.citationModal.classList.add('hidden');
            });
        }
        
        this.citationModal.addEventListener('click', (e) => {
            if (e.target === this.citationModal) {
                this.citationModal.classList.add('hidden');
            }
        });
    }

    setupTextareaAutoResize() {
        if (!this.chatTextarea) return;
        this.chatTextarea.addEventListener('input', () => {
            this.chatTextarea.style.height = 'auto';
            const scrollHeight = this.chatTextarea.scrollHeight;
            this.chatTextarea.style.height = `${Math.min(scrollHeight, 180)}px`;
        });
    }

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

    // --- Active Chat Loading ---

    loadChatSession(chat) {
        // Reset console UI
        this.messageList.innerHTML = '';
        
        if (!chat) {
            // Display greeting screen
            this.messages = [];
            this.welcomeContainer.classList.remove('hidden');
            return;
        }

        this.welcomeContainer.classList.add('hidden');
        this.messages = chat.messages || [];
        
        this.messages.forEach(msg => {
            this.appendMessageBubble(msg.role, msg.content, msg.sources);
        });
        
        this.scrollToBottom();
    }

    // --- Message Processing & Streaming ---

    async handleUserSubmit() {
        const query = this.chatTextarea.value.trim();
        if (!query || this.isGenerating) return;

        // Ensure active chat session exists
        if (!this.sidebar.activeChatId) {
            this.sidebar.createNewChat();
        }

        this.isGenerating = true;
        this.btnSend.setAttribute('disabled', 'true');
        this.chatTextarea.value = '';
        this.chatTextarea.style.height = 'auto';
        this.charCounter.textContent = '0/4000';
        this.welcomeContainer.classList.add('hidden');

        // 1. Add User Message to local state & render UI
        const userMsg = { role: 'user', content: query };
        this.messages.push(userMsg);
        this.appendMessageBubble('user', query);
        this.sidebar.updateActiveChatHistory(this.messages);
        this.scrollToBottom();

        // 2. Append empty AI Message container for streaming tokens
        const aiBubbleId = 'ai_bubble_' + Date.now();
        const aiMsgDiv = this.appendEmptyAIMessageBubble(aiBubbleId);
        this.scrollToBottom();

        // 3. Perform POST Streaming Request via browser ReadableStream
        const enableRag = this.ragToggle ? this.ragToggle.checked : true;
        
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: this.messages,
                    enableRag
                })
            });

            if (res.status !== 200) {
                this.renderStreamError(aiBubbleId, 'Failed to connect to LLM Service.');
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let streamText = '';
            let sources = [];

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop(); // Hold onto unfinished chunks

                for (const part of parts) {
                    if (!part.trim()) continue;

                    // Parse SSE Event lines
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

                    if (eventName === 'sources') {
                        try {
                            sources = JSON.parse(eventData);
                        } catch (err) {
                            console.error('SSE sources JSON parse failure', err);
                        }
                    } else if (eventName === 'delta') {
                        try {
                            const parsedToken = JSON.parse(eventData);
                            streamText += parsedToken;
                            this.updateAIMessageContent(aiBubbleId, streamText, sources);
                            this.scrollToBottom();
                        } catch (err) {
                            console.error('SSE delta parse failure', err);
                        }
                    } else if (eventName === 'error') {
                        const errMsg = JSON.parse(eventData);
                        this.renderStreamError(aiBubbleId, errMsg);
                        return;
                    }
                }
            }

            // Streaming finished successfully! Save state.
            const aiMsg = { role: 'assistant', content: streamText, sources };
            this.messages.push(aiMsg);
            this.sidebar.updateActiveChatHistory(this.messages);

        } catch (err) {
            console.error('Streaming connection failed', err);
            this.renderStreamError(aiBubbleId, 'Network streaming connection error.');
        } finally {
            this.isGenerating = false;
            this.updateCharacterCount();
        }
    }

    // --- Message Bubble Rendering Elements ---

    appendMessageBubble(role, content, sources = []) {
        const row = document.createElement('div');
        row.className = `msg-row ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = role === 'user' ? 'U' : 'AI';
        
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        
        if (role === 'user') {
            bubble.textContent = content;
        } else {
            // Render markdown content
            bubble.innerHTML = window.marked ? window.marked.parse(content) : content;
            
            // Add citation elements if present
            if (sources && sources.length > 0) {
                this.renderCitationsInsideBubble(bubble, sources);
            }
        }

        row.appendChild(avatar);
        row.appendChild(bubble);
        this.messageList.appendChild(row);
        
        // Highlight nested code snippets
        row.querySelectorAll('pre code').forEach(block => {
            if (window.hljs) window.hljs.highlightElement(block);
        });
    }

    appendEmptyAIMessageBubble(id) {
        const row = document.createElement('div');
        row.className = 'msg-row ai-msg';
        row.id = id;
        
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = 'AI';
        
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        
        // Animated loading state placeholder
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
        return row;
    }

    updateAIMessageContent(id, text, sources = []) {
        const row = document.getElementById(id);
        if (!row) return;

        const bubble = row.querySelector('.msg-bubble');
        if (!bubble) return;

        // Render cumulative tokens as HTML
        bubble.innerHTML = window.marked ? window.marked.parse(text) : text;

        if (sources && sources.length > 0) {
            this.renderCitationsInsideBubble(bubble, sources);
        }

        // Highlight code snippets
        row.querySelectorAll('pre code').forEach(block => {
            if (window.hljs) window.hljs.highlightElement(block);
        });
    }

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

    // --- RAG Source Citations Drawer ---

    renderCitationsInsideBubble(bubbleElement, sources) {
        // Ensure we don't render duplicate citation containers
        let citationContainer = bubbleElement.querySelector('.citations-wrapper');
        if (citationContainer) {
            citationContainer.remove();
        }

        citationContainer = document.createElement('div');
        citationContainer.className = 'citations-wrapper';
        citationContainer.innerHTML = `<span class="citations-header">Retrieved context sources:</span>`;

        const tagList = document.createElement('div');
        tagList.className = 'citations-list';

        sources.forEach((source, index) => {
            const docName = source.metadata.source || 'Unknown';
            const pageInfo = source.metadata.page ? `, Page ${source.metadata.page}` : '';
            const scorePercent = Math.round(source.similarity * 100);
            
            const tag = document.createElement('button');
            tag.className = 'citation-tag';
            tag.innerHTML = `
                <i data-lucide="file" style="width:12px; height:12px;"></i>
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

    displayCitationDetail(source, docName, pageInfo, scorePercent) {
        this.citationTitle.textContent = `${docName}${pageInfo}`;
        this.citationRelevance.textContent = `Matching Similarity: ${scorePercent}%`;
        this.citationSourceText.textContent = source.text;
        
        this.citationModal.classList.remove('hidden');
    }

    scrollToBottom() {
        this.chatOutputArea.scrollTo({
            top: this.chatOutputArea.scrollHeight,
            behavior: 'smooth'
        });
    }
}
