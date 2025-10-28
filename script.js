class GeminiChat {
    constructor() {
        this.apiKey = 'AIzaSyAlD7PxnEM5qFNq1JsOPFgT-sbs8TJqipc';
        this.currentChat = [];
        this.isProcessing = false;
        this.isMobile = this.checkMobile();
        
        this.initializeElements();
        this.attachEventListeners();
        this.setupMobileFeatures();
        this.applyTheme();
        this.loadChatHistory();
    }

    checkMobile() {
        return window.innerWidth <= 768 || 
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    initializeElements() {
        // Core elements
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.fileUpload = document.getElementById('fileUpload');
        this.filePreview = document.getElementById('filePreview');
        this.fileBtn = document.getElementById('fileBtn');
        this.cameraBtn = document.getElementById('cameraBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.newChatBtn = document.getElementById('newChatBtn');
        
        // Mobile elements
        this.mobileToggle = document.getElementById('mobileToggle');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.themeToggle = document.getElementById('themeToggle');
        
        // Camera elements
        this.cameraModal = document.getElementById('cameraModal');
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.captureBtn = document.getElementById('captureBtn');
        this.retakeBtn = document.getElementById('retakeBtn');
        this.closeCamera = document.getElementById('closeCamera');
        
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
                setTimeout(() => this.scrollToBottom(), 100);
            }
        });

        // Prevent zoom on input focus for iOS
        this.messageInput.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // Handle viewport height changes
        this.setViewportHeight();
        window.addEventListener('resize', () => this.setViewportHeight());
    }

    setViewportHeight() {
        // Set custom property for dynamic viewport height
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
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
            this.autoResizeTextarea();
        });

        // File handling
        this.fileBtn.addEventListener('click', () => this.fileUpload.click());
        this.fileUpload.addEventListener('change', (e) => this.handleFileSelect(e));
        this.cameraBtn.addEventListener('click', () => this.openCamera());
        this.clearBtn.addEventListener('click', () => this.clearFiles());

        // Camera functionality
        this.captureBtn.addEventListener('click', () => this.capturePhoto());
        this.retakeBtn.addEventListener('click', () => this.retakePhoto());
        this.closeCamera.addEventListener('click', () => this.closeCameraModal());

        // Mobile sidebar
        this.mobileToggle.addEventListener('click', () => this.toggleSidebar());
        this.sidebarOverlay.addEventListener('click', () => this.toggleSidebar());

        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());

        // New chat
        this.newChatBtn.addEventListener('click', () => this.startNewChat());

        // Quick actions
        document.querySelectorAll('.action-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                this.messageInput.value = prompt;
                this.messageInput.focus();
                this.autoResizeTextarea();
            });
        });

        // Close modal on outside click
        this.cameraModal.addEventListener('click', (e) => {
            if (e.target === this.cameraModal) {
                this.closeCameraModal();
            }
        });

        // Handle orientation changes
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.handleOrientationChange(), 300);
        });
    }

    autoResizeTextarea() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        this.sidebar.classList.toggle('active');
        this.sidebarOverlay.classList.toggle('active');
        
        // Prevent body scroll when sidebar is open
        document.body.style.overflow = this.sidebarOpen ? 'hidden' : '';
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.currentTheme);
        this.applyTheme();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        const icon = this.themeToggle.querySelector('i');
        icon.className = this.currentTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    handleOrientationChange() {
        // Re-initialize camera on orientation change
        if (this.cameraModal.style.display === 'block') {
            this.closeCameraModal();
            setTimeout(() => this.openCamera(), 500);
        }
        
        // Update mobile detection
        this.isMobile = this.checkMobile();
    }

    async sendMessage() {
        const query = this.messageInput.value.trim();
        const hasFiles = this.selectedFiles.length > 0;

        if ((!query && !hasFiles) || this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.sendBtn.disabled = true;
        this.updateSendButton();

        // Add user message to chat
        this.addMessage('user', query, this.selectedFiles);
        this.messageInput.value = '';
        this.clearFiles();
        this.autoResizeTextarea();

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
        this.updateSendButton();
        this.saveChatHistory();
    }

    updateSendButton() {
        const icon = this.sendBtn.querySelector('i');
        if (this.isProcessing) {
            icon.className = 'fas fa-spinner fa-spin';
        } else {
            icon.className = 'fas fa-paper-plane';
        }
    }

    async callGeminiAPI(query, files = []) {
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;

        const parts = [];

        if (query) {
            parts.push({ text: query });
        }

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const base64 = await this.fileToBase64(file);
                parts.push({
                    inline_data: {
                        mime_type: file.type,
                        data: base64.split(',')[1]
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
                throw new Error('Request timeout. Please check your connection.');
            }
            throw error;
        }
    }

    addMessage(role, content, files = []) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (content) {
            contentDiv.innerHTML = this.formatMessage(content);
        }
        
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
                    fileSpan.innerHTML = `
                        <i class="fas fa-file"></i>
                        ${this.truncateFilename(file.name)}
                    `;
                    contentDiv.appendChild(fileSpan);
                }
            });
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        this.chatContainer.appendChild(messageDiv);
        
        // Remove welcome message if it's the first message
        const welcomeSection = document.querySelector('.welcome-section');
        if (welcomeSection && this.currentChat.length === 0) {
            welcomeSection.remove();
        }
        
        this.scrollToBottom();
        this.currentChat.push({ role, content, files, timestamp: new Date().toISOString() });
    }

    formatMessage(content) {
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
            <div class="avatar">
                <i class="fas fa-robot"></i>
            </div>
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
                <i class="fas ${file.type.startsWith('image/') ? 'fa-image' : 'fa-file'}"></i>
                ${this.truncateFilename(file.name)}
                <button class="remove-btn" onclick="chat.removeFile(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            this.filePreview.appendChild(fileItem);
        });
    }

    truncateFilename(filename) {
        if (this.isMobile && filename.length > 15) {
            return filename.substring(0, 12) + '...';
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
        this.cameraModal.style.display = 'flex';
        
        try {
            const constraints = {
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                } 
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.captureBtn.style.display = 'flex';
            this.retakeBtn.style.display = 'none';
            
            // Handle mobile orientation
            if (this.isMobile) {
                this.video.setAttribute('playsinline', 'true');
            }
        } catch (error) {
            alert('Camera access denied or not available: ' + error.message);
            this.closeCameraModal();
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
            this.closeCameraModal();
            
            setTimeout(() => {
                this.messageInput.focus();
            }, 300);
        }, 'image/jpeg', 0.8);
    }

    retakePhoto() {
        this.captureBtn.style.display = 'flex';
        this.retakeBtn.style.display = 'none';
    }

    closeCameraModal() {
        this.cameraModal.style.display = 'none';
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }

    startNewChat() {
        this.currentChat = [];
        this.chatContainer.innerHTML = `
            <div class="welcome-section">
                <div class="welcome-card">
                    <div class="welcome-icon">
                        <i class="fas fa-robot"></i>
                    </div>
                    <h1>Hello, How can I help you today?</h1>
                    <p>Ask anything, upload files, or take photos for analysis</p>
                    
                    <div class="quick-actions">
                        <div class="action-grid">
                            <div class="action-card" data-prompt="Write a professional email">
                                <div class="action-icon">
                                    <i class="fas fa-envelope"></i>
                                </div>
                                <span>Write Email</span>
                            </div>
                            <div class="action-card" data-prompt="Explain quantum computing simply">
                                <div class="action-icon">
                                    <i class="fas fa-atom"></i>
                                </div>
                                <span>Explain Concept</span>
                            </div>
                            <div class="action-card" data-prompt="Write Python code for web scraping">
                                <div class="action-icon">
                                    <i class="fas fa-code"></i>
                                </div>
                                <span>Code Help</span>
                            </div>
                            <div class="action-card" data-prompt="Create a workout plan">
                                <div class="action-icon">
                                    <i class="fas fa-dumbbell"></i>
                                </div>
                                <span>Fitness Plan</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Reattach event listeners
        document.querySelectorAll('.action-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                this.messageInput.value = prompt;
                this.messageInput.focus();
                this.autoResizeTextarea();
            });
        });
        
        this.saveChatHistory();
        
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
                    const welcomeSection = document.querySelector('.welcome-section');
                    if (welcomeSection) {
                        welcomeSection.remove();
                    }
                    
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
        window.chat.closeCameraModal();
    }
});

// Handle beforeunload
window.addEventListener('beforeunload', () => {
    if (window.chat && window.chat.stream) {
        window.chat.closeCameraModal();
    }
});
