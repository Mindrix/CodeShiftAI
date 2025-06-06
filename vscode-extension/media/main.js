// Main chat interface JavaScript
(function() {
    const vscode = acquireVsCodeApi();
      // Get DOM elements
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const exportBtn = document.getElementById('exportBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const newChatBtn = document.getElementById('newChatBtn');

    let messages = [];
    let messageHistory = []; // For undo/redo functionality
    let historyIndex = -1;    // Initialize event listeners
    function init() {
        // Auto-resize textarea
        messageInput.addEventListener('input', handleInputChange);
        messageInput.addEventListener('keydown', handleKeyDown);
        
        // Button event listeners
        sendBtn.addEventListener('click', sendMessage);
        clearBtn.addEventListener('click', clearChat);
        exportBtn.addEventListener('click', exportChat);
        settingsBtn.addEventListener('click', openSettings);
        undoBtn.addEventListener('click', undoAction);
        redoBtn.addEventListener('click', redoAction);
        newChatBtn.addEventListener('click', newChat);
        
        // Focus input
        messageInput.focus();
        
        // Listen for messages from extension
        window.addEventListener('message', handleExtensionMessage);
        
        // Update button states
        updateUndoRedoButtons();
    }

    function handleInputChange() {
        // Auto-resize textarea
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        
        // Enable/disable send button
        const isEmpty = messageInput.value.trim().length === 0;
        sendBtn.disabled = isEmpty;
    }

    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!sendBtn.disabled) {
                sendMessage();
            }
        }
    }    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text) {
            return;
        }

        // Save state for undo functionality
        saveMessageState();

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendBtn.disabled = true;

        // Send message to extension
        vscode.postMessage({
            command: 'sendMessage',
            text: text
        });
    }

    function clearChat() {
        if (messages.length === 0) {
            return;
        }
        
        if (confirm('Are you sure you want to clear the chat history?')) {
            saveMessageState();
            messages = [];
            messagesContainer.innerHTML = getWelcomeMessage();
            vscode.postMessage({ command: 'clearChat' });
            updateUndoRedoButtons();
        }
    }

    function exportChat() {
        if (messages.length === 0) {
            vscode.postMessage({
                command: 'showInformation',
                message: 'No messages to export'
            });
            return;
        }

        const chatData = {
            timestamp: new Date().toISOString(),
            messages: messages
        };

        vscode.postMessage({
            command: 'exportChat',
            data: chatData
        });
    }    function openSettings() {
        vscode.postMessage({ command: 'openSettings' });
    }

    // New functions for undo, redo, and new chat
    function newChat() {
        if (messages.length > 0) {
            if (confirm('Start a new chat? Current conversation will be saved to history.')) {
                saveMessageState();
                messages = [];
                messagesContainer.innerHTML = getWelcomeMessage();
                vscode.postMessage({ command: 'newChat' });
                updateUndoRedoButtons();
            }
        } else {
            // Already empty, just refresh
            messagesContainer.innerHTML = getWelcomeMessage();
            vscode.postMessage({ command: 'newChat' });
        }
    }

    function undoAction() {
        if (historyIndex > 0) {
            historyIndex--;
            restoreMessageState(messageHistory[historyIndex]);
            updateUndoRedoButtons();
            vscode.postMessage({ command: 'undo' });
        }
    }

    function redoAction() {
        if (historyIndex < messageHistory.length - 1) {
            historyIndex++;
            restoreMessageState(messageHistory[historyIndex]);
            updateUndoRedoButtons();
            vscode.postMessage({ command: 'redo' });
        }
    }

    function saveMessageState() {
        // Remove any future history if we're not at the end
        if (historyIndex < messageHistory.length - 1) {
            messageHistory = messageHistory.slice(0, historyIndex + 1);
        }
        
        // Add current state to history
        messageHistory.push(JSON.parse(JSON.stringify(messages)));
        historyIndex = messageHistory.length - 1;
        
        // Limit history size
        if (messageHistory.length > 50) {
            messageHistory.shift();
            historyIndex--;
        }
        
        updateUndoRedoButtons();
    }

    function restoreMessageState(state) {
        messages = JSON.parse(JSON.stringify(state));
        
        // Clear and rebuild the messages container
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            messagesContainer.innerHTML = getWelcomeMessage();
        } else {
            messages.forEach(message => {
                const messageEl = createMessageElement(message);
                messagesContainer.appendChild(messageEl);
            });
        }
        
        scrollToBottom();
    }

    function updateUndoRedoButtons() {
        if (undoBtn && redoBtn) {
            undoBtn.disabled = historyIndex <= 0;
            redoBtn.disabled = historyIndex >= messageHistory.length - 1;
        }
    }    function handleExtensionMessage(event) {
        const message = event.data;
        
        switch (message.command) {
            case 'addMessage':
                addMessage(message.message);
                break;
            case 'showTyping':
                showTypingIndicator();
                break;
            case 'hideTyping':
                hideTypingIndicator();
                break;
            case 'clearMessages':
                clearMessages();
                break;
            case 'exportMessages':
                exportMessages();
                break;
            case 'newChat':
                // Handle new chat command from extension
                newChat();
                break;
            case 'undo':
                // Handle undo command from extension
                undoAction();
                break;
            case 'redo':
                // Handle redo command from extension
                redoAction();
                break;
        }
    }function addMessage(message) {
        messages.push(message);
        
        // Save state for undo functionality when assistant responds
        if (message.type === 'assistant') {
            saveMessageState();
        }
        
        // Remove welcome message if it exists
        const welcomeMsg = messagesContainer.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }
        
        // Create message element
        const messageEl = createMessageElement(message);
        messagesContainer.appendChild(messageEl);
        
        // Scroll to bottom
        scrollToBottom();
    }

    function createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        let avatarIcon = '';
        switch (message.type) {
            case 'user':
                avatarIcon = '<span class="codicon codicon-account"></span>';
                break;
            case 'assistant':
                avatarIcon = '<span class="codicon codicon-robot"></span>';
                break;
            case 'error':
                avatarIcon = '<span class="codicon codicon-error"></span>';
                break;
        }
        avatar.innerHTML = avatarIcon;
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        // Format message content (handle code blocks, etc.)
        const formattedContent = formatMessageContent(message.content);
        content.innerHTML = formattedContent;
        
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = formatTimestamp(message.timestamp);
        content.appendChild(timestamp);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        
        return messageDiv;
    }

    function formatMessageContent(content) {
        // Basic markdown-like formatting
        content = content.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
        content = content.replace(/\n/g, '<br>');
        
        return content;
    }

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function showTypingIndicator() {
        // If already present, do nothing
        if (document.getElementById('typingIndicator')) { return; }
        const indicator = document.createElement('div');
        indicator.id = 'typingIndicator';
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span>CodeShiftAI is thinking...</span>
        `;
        messagesContainer.appendChild(indicator);
        scrollToBottom();
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) { indicator.remove(); }
    }    function clearMessages() {
        saveMessageState();
        messages = [];
        messageHistory = [];
        historyIndex = -1;
        messagesContainer.innerHTML = getWelcomeMessage();
        updateUndoRedoButtons();
    }

    function exportMessages() {
        // This would be handled by the extension
    }

    function scrollToBottom() {
        setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 10);
    }

    function getWelcomeMessage() {
        return `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <span class="codicon codicon-robot"></span>
                </div>
                <h3>Welcome to CodeShiftAI!</h3>
                <p>I'm your AI coding assistant. I can help you with:</p>
                <ul>
                    <li><span class="codicon codicon-lightbulb"></span> Code explanations and suggestions</li>
                    <li><span class="codicon codicon-tools"></span> Bug fixes and optimizations</li>
                    <li><span class="codicon codicon-beaker"></span> Test generation</li>
                    <li><span class="codicon codicon-book"></span> Documentation writing</li>
                </ul>
                <p>What would you like help with today?</p>
            </div>
        `;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
