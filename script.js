class GeminiChat {
    constructor() {
        this.apiKey = 'AIzaSyAlD7PxnEM5qFNq1JsOPFgT-sbs8TJqipc'; // Your API key
        this.currentChat = [];
        this.isProcessing = false;
        this.isMobile = this.checkMobile();
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadChatHistory();
        this.setupMobileFeatures();
        this.applyTheme();
    }

    checkMobile() {
        return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    initializeElements() {
        // Core elements
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.fileUpload = document.getElementById('fileUpload');
        this.filePreview = document.getElementById('filePreview');
        this.cameraBtn = document.getElementById('cameraBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.newChatBtn = document.getElementById('newChatBtn');
        
        // Response elements
        this.responseContainer = document.querySelector('.response-container');
        this.questionAsked = document.querySelector('.question-asked p');
        this.responseText = document.querySelector('.response-text p');
        
        // Mobile elements
        this.mobileToggle = document.getElementById('mobileToggle');
        this.themeToggle = document.getElementById('themeToggle');
        
        // Camera elements
        this.cameraModal = document.getElementById('cameraModal');
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.captureBtn = document.getElementById('captureBtn');
        this.retakeBtn = document.getElementById('retakeBtn');
        this.closeModal = document.querySelector('.close');
        
        // State
        this.selectedFiles = [];
        this.stream = null;
        this.sidebarOpen = false;
        this.currentTheme = localStorage.getItem('theme') || 'light';
    }

    setupMobileFeatures() {
        // Handle virtual keyboard
        this.messageInput.addEventListener('focus', () => {
            if (this.isMobile) {
                setTimeout(() => this.scrollToBottom(), 300);
            }
        });

        // Prevent zoom on input focus
        this.messageInput.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
    }

    attachEventListeners() {
        // Message sending
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });

        // File handling
        this.fileUpload.addEventListener('change', (e) => this.handleFileSelect(e));
        this.cameraBtn.addEventListener('click', () => this.openCamera());
        this.clearBtn.addEventListener('click', () => this.clearFiles());

        // Camera functionality
        this.captureBtn.addEventListener('click', () => this.capturePhoto());
        this.retakeBtn.addEventListener('click', () => this.retakePhoto());
        this.closeModal.addEventListener('click', () => this.closeCamera());

        // Mobile sidebar
        this.mobileToggle.addEventListener('click', () => this.toggleSidebar());

        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());

        // New chat
        this.newChatBtn.addEventListener('click', () => this.startNewChat());

        // Suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.messageInput.value = chip.getAttribute('data-prompt');
                this.messageInput.focus();
            });
        });

        // Close modal on outside click
        this.cameraModal.addEventListener('click', (e) => {
            if (e.target === this.cameraModal) {
                this.closeCamera();
            }
        });
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        this.sidebarOpen = !this.sidebarOpen;
        sidebar.classList.toggle('active');
        
        // Update toggle icon
        this.mobileToggle.querySelector('span').textContent = this.sidebarOpen ? '✕' : '☰';
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.currentTheme);
        this.applyTheme();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        this.themeToggle.textContent = this.currentTheme === 'light' ? '🌙' : '☀️';
    }

    async sendMessage() {
        const query = this.messageInput.value.trim();
        const hasFiles = this.selectedFiles.length > 0;

        if ((!query && !hasFiles) || this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.sendBtn.disabled = true;

        // Add user message to chat
        this.addMessage('user', query, this.selectedFiles);
        this.messageInput.value = '';
        this.clearFiles();

        // Reset textarea height
        this.messageInput.style.height = 'auto';

        // Show typing indicator
        this.showTypingIndicator();

        // Close sidebar on mobile
        if (this.isMobile && this.sidebarOpen) {
            this.toggleSidebar();
        }

        try {
            const response = await this.callGeminiAPI(query, this.selectedFiles);
            this.removeTypingIndicator();
            this.addMessage('assistant', response);
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage('assistant', `Sorry, I encountered an error: ${error.message}`);
            console.error('API Error:', error);
        }

        this.isProcessing = false;
        this.sendBtn.disabled = false;
        this.saveChatHistory();
    }

    async callGeminiAPI(query, files = []) {
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.AIzaSyAlD7PxnEM5qFNq1JsOPFgT-sbs8TJqipc}`;

        // Prepare content parts
        const parts = [];

        // Add text part if query exists
        if (query) {
            parts.push({ text: query });
        }

        // Add file parts
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const base64 = await this.fileToBase64(file);
                parts.push({
                    inline_data: {
                        mime_type: file.type,
                        data: base64.split(',')[1] // Remove data URL prefix
                    }
                });
            } else if (file.type === 'text/plain') {
                const text = await this.readTextFile(file);
                parts.push({ text: `File: ${file.name}\nContent: ${text}` });
            }
        }

        const requestBody = {
            contents: [{
                parts: parts
            }]
        };

        // Add timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'API request failed');
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout. Please check your connection and try again.');
            }
            throw error;
        }
    }

    addMessage(role, content, files = []) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role} fade-in`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = role === 'user' ? 'U' : 'G';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (content) {
            contentDiv.innerHTML = this.formatMessage(content);
        }
        
        // Add file previews for user messages
        if (files.length > 0 && role === 'user') {
            files.forEach(file => {
                if (file.type.startsWith('image/')) {
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(file);
                    img.alt = file.name;
                    img.loading = 'lazy';
                    contentDiv.appendChild(img);
                } else {
                    const fileSpan = document.createElement('span');
                    fileSpan.className = 'file-preview-item';
                    fileSpan.textContent = `📄 ${this.truncateFilename(file.name)}`;
                    contentDiv.appendChild(fileSpan);
                }
            });
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        this.chatContainer.appendChild(messageDiv);
        
        // Remove welcome message if it exists
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage && this.currentChat.length === 0) {
            welcomeMessage.remove();
        }
        
        this.scrollToBottom();
        this.currentChat.push({ role, content, files, timestamp: new Date().toISOString() });
    }

    formatMessage(content) {
        // Convert markdown-like formatting to HTML
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant';
        typingDiv.id = 'typing-indicator';
        
        typingDiv.innerHTML = `
            <div class="avatar">G</div>
            <div class="message-content">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        
        this.chatContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        this.selectedFiles = [...this.selectedFiles, ...files];
        this.updateFilePreview();
    }

    updateFilePreview() {
        this.filePreview.innerHTML = '';
        this.selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-preview-item';
            fileItem.innerHTML = `
                ${file.type.startsWith('image/') ? '🖼️' : '📄'} ${this.truncateFilename(file.name)}
                <button onclick="chat.removeFile(${index})" style="margin-left: 4px; background: none; border: none; color: inherit; cursor: pointer; font-size: 14px; padding: 2px;">×</button>
            `;
            this.filePreview.appendChild(fileItem);
        });
    }

    truncateFilename(filename) {
        if (filename.length > 20 && this.isMobile) {
            return filename.substring(0, 17) + '...';
        }
        return filename;
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.updateFilePreview();
    }

    clearFiles() {
        this.selectedFiles = [];
        this.filePreview.innerHTML = '';
        this.fileUpload.value = '';
    }

    async openCamera() {
        this.cameraModal.style.display = 'block';
        
        try {
            const constraints = {
                video: { 
                    facingMode: this.isMobile ? 'environment' : 'user',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                } 
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.captureBtn.style.display = 'block';
            this.retakeBtn.style.display = 'none';
            
            if (this.isMobile) {
                this.video.setAttribute('playsinline', '');
            }
        } catch (error) {
            alert('Error accessing camera: ' + error.message);
            this.closeCamera();
        }
    }

    capturePhoto() {
        const context = this.canvas.getContext('2d');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        context.drawImage(this.video, 0, 0);
        
        this.canvas.toBlob((blob) => {
            const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
            this.selectedFiles.push(file);
            this.updateFilePreview();
            this.closeCamera();
            
            // Auto-focus on message input
            setTimeout(() => {
                this.messageInput.focus();
            }, 300);
        }, 'image/jpeg', 0.8);
    }

    retakePhoto() {
        this.captureBtn.style.display = 'block';
        this.retakeBtn.style.display = 'none';
    }

    closeCamera() {
        this.cameraModal.style.display = 'none';
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }

    startNewChat() {
        this.currentChat = [];
        this.chatContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">🤖</div>
                <h3>Hello! I'm Gemini AI</h3>
                <p>How can I help you today? You can ask me anything or upload files for analysis.</p>
                <div class="suggestions">
                    <div class="suggestion-chip" data-prompt="Explain quantum computing in simple terms">Explain quantum computing</div>
                    <div class="suggestion-chip" data-prompt="Write a Python function to calculate fibonacci sequence">Python fibonacci</div>
                    <div class="suggestion-chip" data-prompt="What are the latest advancements in AI?">Latest AI advancements</div>
                    <div class="suggestion-chip" data-prompt="Help me plan a healthy meal for the week">Plan healthy meals</div>
                </div>
            </div>
        `;
        
        // Reattach event listeners to new suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.messageInput.value = chip.getAttribute('data-prompt');
                this.messageInput.focus();
            });
        });
        
        this.saveChatHistory();
        
        // Close sidebar on mobile
        if (this.isMobile) {
            this.toggleSidebar();
        }
    }

    saveChatHistory() {
        const history = {
            timestamp: new Date().toISOString(),
            chat: this.currentChat
        };
        localStorage.setItem('gemini_chat_history', JSON.stringify(history));
    }

    loadChatHistory() {
        const saved = localStorage.getItem('gemini_chat_history');
        if (saved) {
            try {
                const history = JSON.parse(saved);
                this.currentChat = history.chat || [];
                
                if (this.currentChat.length > 0) {
                    this.chatContainer.innerHTML = '';
                    this.currentChat.forEach(msg => {
                        this.addMessage(msg.role, msg.content, msg.files || []);
                    });
                }
            } catch (error) {
                console.error('Error loading chat history:', error);
            }
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }, 100);
    }

    // Utility functions
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    readTextFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}

// Initialize the chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.chat = new GeminiChat();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.chat && window.chat.stream) {
        window.chat.closeCamera();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.chat) {
        window.chat.isMobile = window.chat.checkMobile();
    }
});


