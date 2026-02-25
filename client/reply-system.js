// ============================================
// НОВАЯ СИСТЕМА ОТВЕТОВ НА СООБЩЕНИЯ
// ============================================
// Проблемы старой системы:
// 1. Цитаты в цитатах ломают форматирование
// 2. Нет перехода к оригинальному сообщению
// 3. Непонятно, на какое голосовое сообщение ответ
//
// Новая система:
// - Визуальный блок reply-preview сверху сообщения
// - Клик по превью скроллит к оригиналу
// - Иконки для типов сообщений (голос, файл)
// - Обрезка длинного текста
// ============================================

// Глобальное состояние для текущего ответа
let currentReplyTo = null;

// Функция экранирования HTML для безопасности
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Экспорт функций в глобальную область видимости СРАЗУ (для доступа из script.js)
// Функции будут определены ниже, но мы экспортируем их после определения
// Пока что ставим заглушки
window._replyToMessageInternal = function(message) {
    console.warn('Reply system initializing...');
};
window._sendMessageWithReply = function() {
    console.warn('Reply system initializing...');
};
window._cancelReply = function() {
    console.warn('Reply system initializing...');
};
window._scrollToMessage = function(id) {
    console.warn('Reply system initializing...');
};
window._getCurrentReplyTo = function() { return null; };
window._createReplyBlockHTML = function() { return ''; };
window._hideReplyPreview = function() {};
window._clearCurrentReplyTo = function() {};

// Инициализация системы ответов
function initializeReplySystem() {
    setupCancelReplyButton();
    // setupReplyToSelection будет добавлен после определения функции
}

// Функция для ответа на выделенный текст
function setupReplyToSelection() {
    document.addEventListener('mouseup', function(event) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        // Проверяем, что выделение не пустое
        if (selectedText === '') {
            return;
        }

        // Проверяем, что выделение находится внутри сообщения (.message-group)
        const messageElement = selection.anchorNode.nodeType === Node.ELEMENT_NODE
            ? selection.anchorNode.closest('.message-group')
            : selection.anchorNode.parentElement?.closest('.message-group');

        // Если выделение не внутри сообщения - ничего не делаем
        if (!messageElement) {
            return;
        }

        // Получаем координаты выделения
        try {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Создаем кнопку ответа
            const replyButton = document.createElement('button');
            replyButton.className = 'reply-selection-btn';
            replyButton.textContent = '↪';
            replyButton.title = 'Ответить на выделенное';
            replyButton.style.position = 'fixed';
            replyButton.style.left = rect.left + 'px';
            replyButton.style.top = (rect.top - 30) + 'px';
            replyButton.style.zIndex = '1000';
            replyButton.style.background = 'var(--accent)';
            replyButton.style.color = 'white';
            replyButton.style.border = 'none';
            replyButton.style.borderRadius = '50%';
            replyButton.style.width = '30px';
            replyButton.style.height = '30px';
            replyButton.style.cursor = 'pointer';

            replyButton.onclick = function() {
                // Получаем данные сообщения
                const messageId = messageElement.getAttribute('data-message-id');
                const authorElement = messageElement.querySelector('.message-author');
                
                // Создаем объект сообщения для ответа
                const messageToReplyTo = {
                    id: messageId,
                    author: authorElement ? authorElement.textContent : 'Unknown',
                    text: selectedText, // Используем именно выделенный текст, а не весь
                    isVoiceMessage: messageElement.querySelector('.voice-message-container') !== null,
                    file: null
                };

                // Используем систему ответов
                window._replyToMessageInternal(messageToReplyTo);

                // Очищаем выделение
                selection.removeAllRanges();

                // Удаляем кнопку
                if (replyButton.parentNode) {
                    document.body.removeChild(replyButton);
                }
            };

            document.body.appendChild(replyButton);

            // Удаляем кнопку через 3 секунды
            setTimeout(() => {
                if (replyButton.parentNode) {
                    document.body.removeChild(replyButton);
                }
            }, 3000);
        } catch (e) {
            console.error('Error creating reply button:', e);
        }
    });
}

// Обновляем initializeReplySystem чтобы вызвать setupReplyToSelection после её определения
initializeReplySystem = function() {
    setupReplyToSelection();
    setupCancelReplyButton();
}

// Обновленная функция ответа на сообщение
function replyToMessage(message) {
    currentReplyTo = {
        id: message.id,
        author: message.author,
        text: message.text,
        timestamp: message.timestamp,
        isVoiceMessage: message.isVoiceMessage || false,
        file: message.file || null
    };

    showReplyPreview();

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.focus();
    }
}

// Показать превью ответа над полем ввода
function showReplyPreview() {
    if (!currentReplyTo) return;

    // Удаляем старое превью если есть
    hideReplyPreview();

    const inputContainer = document.querySelector('.message-input-container');
    if (!inputContainer) return;

    const replyPreview = document.createElement('div');
    replyPreview.className = 'reply-preview';
    replyPreview.id = 'replyPreview';
    
    replyPreview.innerHTML = `
        <div class="reply-preview-content" onclick="scrollToMessage(${currentReplyTo.id})">
            <span class="reply-preview-author">${escapeHtml(currentReplyTo.author)}</span>
            <span class="reply-preview-separator">:</span>
            <span class="reply-preview-text">${getReplyPreviewText(currentReplyTo)}</span>
        </div>
        <button class="reply-preview-cancel" onclick="cancelReply()" title="Cancel reply">×</button>
    `;

    // Вставляем превью перед input container
    inputContainer.insertBefore(replyPreview, inputContainer.firstChild);
}

// Скрыть превью ответа
function hideReplyPreview() {
    const existingPreview = document.getElementById('replyPreview');
    if (existingPreview) {
        existingPreview.remove();
    }
}

// Отменить ответ
function cancelReply() {
    currentReplyTo = null;
    hideReplyPreview();
    
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.focus();
    }
}

// Настроить кнопку отмены ответа
function setupCancelReplyButton() {
    // Обработчик будет добавлен через onclick в HTML
    window.cancelReply = cancelReply;
    window.scrollToMessage = scrollToMessage;
}

// Получить текст превью в зависимости от типа сообщения
function getReplyPreviewText(message) {
    if (message.isVoiceMessage) {
        return '🎤 Голосовое сообщение';
    }
    
    if (message.file) {
        const fileExt = message.file.filename.split('.').pop().toLowerCase();
        const fileIcons = {
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'bmp': '🖼️',
            'mp4': '🎬', 'webm': '🎬', 'avi': '🎬', 'mov': '🎬',
            'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
            'pdf': '📄', 'doc': '📄', 'docx': '📄', 'txt': '📄',
            'zip': '📦', 'rar': '📦', '7z': '📦',
            'js': '📝', 'ts': '📝', 'py': '📝', 'java': '📝', 'cpp': '📝', 'c': '📝', 'go': '📝', 'rs': '📝'
        };
        const icon = fileIcons[fileExt] || '📎';
        return `${icon} Файл: ${escapeHtml(message.file.filename)}`;
    }
    
    // Обрезаем текст и убираем markdown
    let text = message.text || '';
    
    // Удаляем markdown разметку для превью
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1'); // изображения
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // ссылки
    text = text.replace(/`([^`]+)`/g, '$1'); // код
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // жирный
    text = text.replace(/\*([^*]+)\*/g, '$1'); // курсив
    text = text.replace(/~~([^~]+)~~/g, '$1'); // зачеркнутый
    text = text.replace(/^>\s*/gm, ''); // цитаты
    text = text.replace(/^[#*+-]\s*/gm, ''); // списки
    
    // Обрезаем до 100 символов
    if (text.length > 100) {
        text = text.substring(0, 100) + '…';
    }
    
    return text || 'Пустое сообщение';
}

// Прокрутка к сообщению с подсветкой
function scrollToMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        // Убираем подсветку со всех сообщений
        document.querySelectorAll('.message-group.highlighted').forEach(el => {
            el.classList.remove('highlighted');
        });
        
        // Скроллим к сообщению
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Добавляем подсветку
        messageElement.classList.add('highlighted');
        
        // Убираем подсветку через 2 секунды
        setTimeout(() => {
            messageElement.classList.remove('highlighted');
        }, 2000);
    } else {
        // Сообщение не найдено (возможно старое)
        showNotification('Сообщение', 'Исходное сообщение не найдено');
    }
}

// Получить текущий ответ (для отправки)
function getCurrentReplyTo() {
    return currentReplyTo;
}

// Очистить текущий ответ после отправки
function clearCurrentReplyTo() {
    currentReplyTo = null;
    hideReplyPreview();
}

// Обновленная функция отправки сообщения с поддержкой replyTo
function sendMessageWithReply() {
    // Не отправляем текстовое сообщение, если идет запись голоса
    if (isRecording) {
        console.log('Recording in progress, not sending text message');
        return;
    }

    const messageInput = document.getElementById('messageInput');

    if (!messageInput) {
        console.error('Message input element not found');
        return;
    }

    const text = messageInput.value.trim();

    if (text === '') return;

    // Если мы редактируем сообщение, обновляем его вместо создания нового
    if (editingMessageId) {
        updateMessage(editingMessageId, text);
        return;
    }

    const message = {
        id: Date.now(),
        text: text,
        author: currentUser.username,
        avatar: currentUser.avatar || currentUser.username.charAt(0).toUpperCase(),
        timestamp: new Date().toISOString(),
        reactions: [],
        replyTo: currentReplyTo ? {
            id: currentReplyTo.id,
            author: currentReplyTo.author,
            text: currentReplyTo.text,
            isVoiceMessage: currentReplyTo.isVoiceMessage,
            file: currentReplyTo.file
        } : null
    };

    // Если это Self Chat, сохраняем сообщение локально
    if (currentDMUserId === currentUser.id) {
        addMessageToUI(message);
        saveSelfMessageToHistory(message);
        scrollToBottom();
    } else if (currentDMUserId) {
        // Для обычных DM отправляем через сокет
        if (socket && socket.connected) {
            socket.emit('send-dm', {
                receiverId: currentDMUserId,
                message: message
            });
        }
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';
    adjustTextareaHeight(messageInput);
    
    // Очищаем ответ после отправки
    clearCurrentReplyTo();
}

// Создать HTML для блока ответа в сообщении
function createReplyBlockHTML(replyTo) {
    if (!replyTo) return '';
    
    const icon = replyTo.isVoiceMessage 
        ? '<span class="reply-voice-icon">🎤</span>'
        : replyTo.file 
            ? '<span class="reply-file-icon">📎</span>'
            : '<span class="reply-icon">↪</span>';
    
    const text = getReplyPreviewText(replyTo);
    
    return `
        <div class="message-reply-block" onclick="scrollToMessage(${replyTo.id})">
            ${icon}
            <span class="reply-author">${escapeHtml(replyTo.author)}</span>
            <span class="reply-separator">:</span>
            <span class="reply-text">${escapeHtml(text)}</span>
        </div>
    `;
}

// Экспорт функций для использования в других модулях
// Переопределяем заглушки реальными функциями
window._replyToMessageInternal = replyToMessage;
window._sendMessageWithReply = sendMessageWithReply;
window._cancelReply = cancelReply;
window._scrollToMessage = scrollToMessage;
window._getCurrentReplyTo = getCurrentReplyTo;
window._createReplyBlockHTML = createReplyBlockHTML;
window._hideReplyPreview = hideReplyPreview;
window._clearCurrentReplyTo = clearCurrentReplyTo;

// Также экспортируем под обычными именами для прямого доступа
window.replyToMessage = replyToMessage;
window.sendMessageWithReply = sendMessageWithReply;
window.cancelReply = cancelReply;
window.scrollToMessage = scrollToMessage;
window.getCurrentReplyTo = getCurrentReplyTo;
window.createReplyBlockHTML = createReplyBlockHTML;
window.hideReplyPreview = hideReplyPreview;
window.clearCurrentReplyTo = clearCurrentReplyTo;

// Инициализация при загрузке скрипта (не ждём DOMContentLoaded)
// setupReplyToSelection будет вызван после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeReplySystem();
    });
} else {
    initializeReplySystem();
}
