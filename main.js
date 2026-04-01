document.addEventListener('DOMContentLoaded', () => {
    // Textarea Auto-resize
    const searchInput = document.querySelector('.search-input');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            
            // Limit max height to 200px
            if (this.scrollHeight > 200) {
                this.style.height = '200px';
                this.style.overflowY = 'auto';
            } else {
                this.style.overflowY = 'hidden';
            }
        });
    }

    // Nav Item Selection
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Close Cards
    const closeButtons = document.querySelectorAll('.close-card');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.info-card');
            if (card) {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    card.style.display = 'none';
                }, 200);
            }
        });
    });

    // Initialize Markdown-it
    const md = window.markdownit();

    // Mock Search Submission (Converted to actual backend call)
    const sendBtn = document.getElementById('send-btn');
    const responseContainer = document.getElementById('response-container');
    const responseContent = document.getElementById('response-content');
    const recentThreadsContainer = document.getElementById('recent-threads-container');
    const newThreadBtn = document.getElementById('new-thread-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const pdfUploadInput = document.getElementById('pdf-upload');
    const uploadStatus = document.getElementById('upload-status');
    const uploadedFilename = document.getElementById('uploaded-filename');
    const clearUploadBtn = document.getElementById('clear-upload');

    // Thread Management
    let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
    let currentChatHistory = []; 
    let activeFile = null;

    // File Upload Handling
    uploadBtn.onclick = () => pdfUploadInput.click();

    pdfUploadInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !file.name.endsWith('.pdf')) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            uploadBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i>';
            lucide.createIcons();
            
            const response = await fetch('http://localhost:5000/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (response.ok) {
                activeFile = file.name;
                uploadStatus.classList.remove('hidden');
                uploadedFilename.textContent = `PDF: ${file.name}`;
                uploadBtn.style.color = '#3b82f6';
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('Upload failed:', error);
            alert('PDF Upload failed: ' + error.message);
        } finally {
            uploadBtn.innerHTML = '<i data-lucide="plus"></i>';
            lucide.createIcons();
        }
    };

    clearUploadBtn.onclick = () => {
        activeFile = null;
        uploadStatus.classList.add('hidden');
        pdfUploadInput.value = '';
        uploadBtn.style.color = '';
    };

    const renderHistory = () => {
        recentThreadsContainer.innerHTML = '';
        history.slice(0, 5).forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.textContent = item.query;
            div.title = item.query;
            div.onclick = () => loadFromHistory(index);
            recentThreadsContainer.appendChild(div);
        });
    };

    const saveToLocalStorage = () => {
        localStorage.setItem('searchHistory', JSON.stringify(history));
    };

    const loadFromHistory = (index) => {
        const item = history[index];
        if (!item) return;

        // Reset current thread and load history
        currentChatHistory = item.messages || [{ role: 'user', parts: item.query }, { role: 'model', parts: item.response }];
        
        responseContainer.classList.remove('hidden');
        responseContent.innerHTML = ''; // Clear for fresh render

        currentChatHistory.forEach(msg => {
            appendMessageToUI(msg.role, msg.parts);
        });
        
        responseContainer.scrollIntoView({ behavior: 'smooth' });
        renderHistory();
    };

    const appendMessageToUI = (role, text) => {
        const div = document.createElement('div');
        div.className = `chat-bubble ${role === 'user' ? 'user' : 'ai'}`;
        
        if (role === 'model') {
            div.innerHTML = `
                <div class="model-badge">Gemini 2.5 Flash</div>
                ${md.render(text)}
            `;
        } else {
            div.textContent = text;
        }
        
        responseContent.appendChild(div);
    };

    // New Thread Logic
    newThreadBtn.onclick = () => {
        responseContainer.classList.add('hidden');
        responseContent.innerHTML = '';
        currentChatHistory = [];
        searchInput.value = '';
        searchInput.focus();
    };

    // Initial render
    renderHistory();

    // API Health Check
    const checkApiHealth = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/health');
            const data = await response.json();
            if (data.status === 'connected') console.log('API Connected.');
        } catch (e) {
            console.error('Backend is NOT running.');
        }
    };
    checkApiHealth();

    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        // UI: Show current thread container and append user query
        responseContainer.classList.remove('hidden');
        appendMessageToUI('user', query);
        
        // Show thinking state (temp bubble)
        const thinkingBubble = document.createElement('div');
        thinkingBubble.className = 'chat-bubble ai';
        thinkingBubble.innerHTML = '<p class="thinking">Thinking...</p>';
        responseContent.appendChild(thinkingBubble);
        
        searchInput.value = '';
        searchInput.style.height = 'auto';

        try {
            const response = await fetch('http://localhost:5000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: query,
                    history: currentChatHistory 
                }),
            });

            const data = await response.json();
            responseContent.removeChild(thinkingBubble);

            if (!response.ok) throw new Error(data.error || 'Server error');
            
            // Append AI response to UI
            appendMessageToUI('model', data.response);
            
            // Update global memory (for API context)
            currentChatHistory.push({ role: 'user', parts: query });
            currentChatHistory.push({ role: 'model', parts: data.response });

            // Save this entire thread to sidebar history (Limit to 5)
            const threadSummary = currentChatHistory[0].parts; // Use first question as title
            history = history.filter(h => h.query !== threadSummary);
            history.unshift({ 
                query: threadSummary, 
                messages: [...currentChatHistory] 
            });
            if (history.length > 5) history.pop();
            saveToLocalStorage();
            renderHistory();
            
            // Scroll to latest
            responseContent.lastElementChild.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            if (thinkingBubble.parentNode) responseContent.removeChild(thinkingBubble);
            
            const isQuotaError = error.message.includes('Quota') || error.message.includes('free-tier');
            
            responseContent.innerHTML += `
                <div style="color: #ef4444; background: #fee2e2; padding: 16px; border-radius: 12px; border: 1px solid #fecaca; margin-top: 20px; line-height: 1.5;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 700;">
                        <i data-lucide="alert-circle"></i> Proper API Key Required
                    </div>
                    <strong>Error:</strong> ${error.message}<br><br>
                    ${isQuotaError ? `
                        <div style="font-size: 0.9em; color: #7f1d1d;">
                            <strong>How to fix:</strong><br>
                            1. Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #ef4444; text-weight: bold; text-decoration: underline;">Google AI Studio</a>.<br>
                            2. Create a <b>new API Key</b>.<br>
                            3. Update the <code>.env</code> file in your project folder.<br>
                            4. Restart the backend (<code>py app.py</code>).<br><br>
                            <button id="clear-history-retry" style="background: #ef4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: 600;">Clear History & Retry</button>
                        </div>
                    ` : ''}
                </div>
            `;
            lucide.createIcons();
            
            // Handle Clear History & Retry
            const clearRetryBtn = document.getElementById('clear-history-retry');
            if (clearRetryBtn) {
                clearRetryBtn.onclick = () => {
                    currentChatHistory = [];
                    handleSearch();
                };
            }
        }
    };

    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', handleSearch);
    }

    // Action Buttons Hover/Active States
    const actionBtns = document.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('pill-btn') || btn.classList.contains('text-btn')) {
               // Toggle logic for certain buttons if needed
            }
        });
    });
});
