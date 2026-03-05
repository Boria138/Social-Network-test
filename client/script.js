// API helper
function getApiUrl() {
    return window.APP_CONFIG?.API_URL || '';
}

// Global state
let currentChannel = null;
let channels = {};
let inCall = false;
let localStream = null;
let screenStream = null;
let peerConnections = {};
let isVideoEnabled = true;
let isAudioEnabled = true;
let isMuted = false;
let isDeafened = false;
let currentUser = null;
let socket = null;
let token = null;
let currentView = 'friends';
let currentDMUserId = null;
// Store user information by socketId
let users = new Map();
// Переменная для отслеживания текущего режима (мобильный/десктопный)
let isMobileView = window.innerWidth <= 820;
// Переменная для отслеживания редактируемого сообщения
let editingMessageId = null;

// Variables for voice recording
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;

// Link preview settings
let linkPreviewEnabled = true;
const hiddenPreviews = new Set();

// Notification service
let notificationService = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    token = localStorage.getItem('token');
    const userStr = localStorage.getItem('currentUser');

    if (!token || !userStr) {
        window.location.replace('login.html');
        return;
    }

    try {
        currentUser = JSON.parse(userStr);
        initializeApp();
    } catch (e) {
        console.error('Error parsing user data:', e);
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        window.location.replace('login.html');
    }
});


function initializeApp() {
    updateUserInfo();
    initializeFriendsTabs();
    initializeMessageInput();
    initializeUserControls();
    initializeCallControls();
    initializeFileUpload();
    initializeEmojiPicker();
    initializeDraggableCallWindow();
    initializeSettingsModal();
    initializeNotifications(); // Инициализация системы уведомлений
    connectToSocketIO();

    // Загружаем системный канал и обновляем DM список
    loadSystemChannel().then(() => {
        // Пересоздаем DM список с каналом новостей
        if (window.lastLoadedFriends) {
            populateDMList(window.lastLoadedFriends);
        }
    });

    // requestNotificationPermission(); // Убрано из автозапуска
    showFriendsView();

    // Обработчик клика на кнопку Friends для возврата на главную страницу
    const friendsBtn = document.getElementById('friendsBtn');
    if (friendsBtn) {
        friendsBtn.addEventListener('click', () => {
            showFriendsView();
        });
    }

    // Добавляем обработчик для запроса разрешения при первом взаимодействии пользователя
    document.addEventListener('click', requestNotificationPermissionOnce, { once: true });
    document.addEventListener('keydown', requestNotificationPermissionOnce, { once: true });

    // Setup reply to selection functionality - перенесено в reply-system.js

    // Restore voice message handlers after initialization
    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 500);
}

function requestNotificationPermissionOnce() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
    }
}

// ==========================================
// Notification System
// ==========================================

function initializeNotifications() {
    if (typeof NotificationService === 'undefined') {
        console.warn('NotificationService not loaded, skipping initialization');
        return;
    }

    notificationService = new NotificationService();
    notificationService.init();

    // Инициализация обработчиков панели уведомлений
    initializeNotificationsPanel();

    // Обновляем DM список с бейджами после загрузки уведомлений
    setTimeout(() => {
        if (window.lastLoadedFriends) {
            populateDMList(window.lastLoadedFriends);
        }
    }, 500);
}

function initializeNotificationsPanel() {
    const notificationsBtn = document.getElementById('notificationsBtn');
    const notificationsPanel = document.getElementById('notificationsPanel');
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    const notificationBadge = document.getElementById('notificationBadge');
    
    // Открытие/закрытие панели уведомлений
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notificationsPanel) {
                notificationsPanel.classList.toggle('active');
                const isActive = notificationsPanel.classList.contains('active');
                notificationsPanel.setAttribute('aria-hidden', !isActive);
                
                // Если открываем панель, помечаем уведомления как прочитанные
                if (isActive) {
                    notificationService?.markMissedCallsAsRead();
                    renderNotificationsList();
                }
            }
        });
    }
    
    // Закрытие панели при клике вне её
    document.addEventListener('click', (e) => {
        if (notificationsPanel && !notificationsPanel.contains(e.target) && 
            (!notificationsBtn || !notificationsBtn.contains(e.target))) {
            notificationsPanel.classList.remove('active');
            notificationsPanel.setAttribute('aria-hidden', 'true');
        }
    });
    
    // Отметить все как прочитанные
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', () => {
            notificationService?.markMissedCallsAsRead();
            updateNotificationBadge();
            renderNotificationsList();
        });
    }
    
    // Загрузка сохраненных уведомлений из localStorage
    notificationService?.loadFromLocalStorage();
    updateNotificationBadge();
    renderNotificationsList();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    // Считаем все непрочитанные уведомления
    const notifications = notificationService?.getNotifications() || [];
    const unreadCount = notifications.filter(n => !n.read).length;
    
    if (unreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    } else {
        badge.style.display = 'none';
    }
}

function renderNotificationsList() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    
    const notifications = notificationService?.getNotifications() || [];
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="notifications-panel-empty">Нет уведомлений</div>';
        return;
    }
    
    let html = '';
    
    notifications.forEach(notif => {
        const timeAgo = getTimeAgo(new Date(notif.timestamp));
        const isRead = notif.read ? '' : 'unread';
        
        if (notif.type === 'missed-call') {
            const callType = notif.callType === 'video' ? 'Видео' : 'Голосовой';
            html += `
                <div class="notification-item ${isRead}">
                    <div class="notification-item-icon missed-call">📞</div>
                    <div class="notification-item-content">
                        <div class="notification-item-header">
                            <span class="notification-item-title">${notif.username}</span>
                            <span class="notification-item-time">${timeAgo}</span>
                        </div>
                        <div class="notification-item-text">Пропущенный ${callType} звонок</div>
                        <div class="notification-item-actions">
                            <button class="call-back" onclick="callUser('${notif.userId}', '${notif.callType}')">Перезвонить</button>
                            <button class="dismiss" onclick="dismissNotification('${notif.userId}')">Скрыть</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (notif.type === 'message') {
            html += `
                <div class="notification-item ${isRead}">
                    <div class="notification-item-icon message">💬</div>
                    <div class="notification-item-content">
                        <div class="notification-item-header">
                            <span class="notification-item-title">${notif.username}</span>
                            <span class="notification-item-time">${timeAgo}</span>
                        </div>
                        <div class="notification-item-text">${notif.text}</div>
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Только что';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. назад`;
    return `${Math.floor(seconds / 86400)} дн. назад`;
}

function addMessageNotification(sender, messageText, isDM = true) {
    if (!notificationService) return;
    
    // Проверяем, находимся ли мы в текущем чате
    const isInChat = isDM && currentView === 'dm' && currentDMUserId === sender.id;
    
    // Если мы в чате и окно активно, не показываем уведомление
    if (isInChat && document.hasFocus()) {
        return;
    }
    
    // Увеличиваем счетчик непрочитанных (это также сохраняет уведомление в localStorage)
    notificationService.incrementUnread(sender.id, {
        username: sender.username,
        avatar: sender.avatar,
        text: messageText
    });
    updateNotificationBadge();
    renderNotificationsList();
    
    // Показываем браузерное уведомление и звук
    notificationService.showMessageNotification(sender, messageText, isDM);
}

function addCallNotification(fromUser, callType = 'voice') {
    if (!notificationService) return;
    
    // Показываем браузерное уведомление
    notificationService.showBrowserNotification('Входящий звонок', {
        body: `${fromUser.username} звонит вам`,
        requireInteraction: true,
        tag: 'incoming-call'
    });
    
    // Звуковое уведомление
    notificationService.playNotificationSound('call');
}

// Глобальные функции для кнопок в уведомлениях
window.callUser = function(userId, callType) {
    // Закрытие панели уведомлений
    const panel = document.getElementById('notificationsPanel');
    if (panel) panel.classList.remove('active');
    
    // Инициирование звонка (будет вызвано из существующей функции)
    console.log('Calling user:', userId, callType);
    // Здесь будет вызов существующей функции начала звонка
};

window.dismissNotification = function(userId) {
    if (notificationService) {
        // Удаляем уведомления для этого пользователя
        notificationService.notifications = notificationService.notifications.filter(
            n => n.userId !== userId
        );
        notificationService.missedCalls = notificationService.missedCalls.filter(
            c => c.from.id !== userId
        );
        notificationService.saveToLocalStorage();
        renderNotificationsList();
        updateNotificationBadge();
    }
};


function updateUserInfo() {
    const userAvatarContent = document.querySelector('.user-avatar .user-avatar-content');
    const username = document.querySelector('.username');

    if (userAvatarContent) userAvatarContent.textContent = currentUser.avatar;
    if (username) username.textContent = currentUser.username;
}

function connectToSocketIO() {
    if (typeof io !== 'undefined') {
        const apiUrl = getApiUrl();
        const socketOpts = {
            auth: { token: token },
            ...(window.APP_CONFIG?.SOCKET_OPTIONS || {})
        };
        socket = apiUrl ? io(apiUrl, socketOpts) : io(socketOpts);
        
        socket.on('connect', () => {
            console.log('Connected to server');
        });
        
       socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });
        
        
        socket.on('reaction-update', (data) => {
            updateMessageReactions(data.messageId, data.reactions);
        });

        // WebRTC Signaling
        socket.on('new-dm', (data) => {
            // Отображаем сообщение, если оно от пользователя, с которым мы общаемся
            if (currentView === 'dm' && currentDMUserId && data.senderId === currentDMUserId) {
                // Определяем, является ли файл голосовым сообщением
                let isVoiceMessage = false;
                if (data.message.file) {
                    const fileExtension = data.message.file.filename.split('.').pop().toLowerCase();
                    const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a', 'aac'];
                    isVoiceMessage = audioExtensions.includes(fileExtension);
                }

                addMessageToUI({
                    id: data.message.id,
                    author: data.message.author,
                    avatar: data.message.avatar,
                    text: data.message.text,
                    timestamp: data.message.timestamp,
                    reactions: data.message.reactions || [],
                    file: data.message.file,
                    isVoiceMessage: isVoiceMessage,
                    edited: data.message.edited,
                    replyTo: data.message.replyTo || null
                });
                scrollToBottom();
            }
            
            // Добавляем уведомление, если сообщение не в текущем чате
            if (!(currentView === 'dm' && currentDMUserId && data.senderId === currentDMUserId)) {
                const sender = {
                    id: data.senderId,
                    username: data.message.author,
                    avatar: data.message.avatar
                };
                const messageText = data.message.text || (data.message.file ? '📎 Вложение' : '');
                addMessageNotification(sender, messageText, true);
                
                // Принудительно обновляем бейдж сразу после добавления уведомления
                setTimeout(() => {
                    updateNotificationBadge();
                    renderNotificationsList();
                }, 100);
            }
        });

        socket.on('dm-sent', (data) => {
            // Отображаем наше сообщение, если оно было отправлено в текущий чат
            if (currentView === 'dm' && currentDMUserId && data.receiverId === currentDMUserId) {
                // Определяем, является ли файл голосовым сообщением
                let isVoiceMessage = false;
                if (data.message.file) {
                    const fileExtension = data.message.file.filename.split('.').pop().toLowerCase();
                    const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a', 'aac'];
                    isVoiceMessage = audioExtensions.includes(fileExtension);
                }

                // Добавляем сообщение, которое мы отправили
                addMessageToUI({
                    id: data.message.id,
                    author: currentUser.username,
                    avatar: currentUser.avatar,
                    text: data.message.text,
                    timestamp: data.message.timestamp,
                    reactions: data.message.reactions || [],
                    file: data.message.file,  // Добавляем информацию о файле, если она есть
                    isVoiceMessage: isVoiceMessage, // Определяем, является ли это голосовым сообщением
                    edited: data.message.edited,  // Добавляем флаг редактирования, если есть
                    replyTo: data.message.replyTo || null  // Добавляем информацию об ответе
                });
                scrollToBottom();
            }
        });

        socket.on('updated-dm', (data) => {
            // Обновляем сообщение, если оно от пользователя, с которым мы общаемся
            if (currentView === 'dm' && currentDMUserId && data.receiverId === currentDMUserId) {
                // Определяем, является ли файл голосовым сообщением
                let isVoiceMessage = false;
                if (data.message.file) {
                    const fileExtension = data.message.file.filename.split('.').pop().toLowerCase();
                    const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a', 'aac'];
                    isVoiceMessage = audioExtensions.includes(fileExtension);
                }
                
                updateMessageInUI({
                    id: data.message.id,
                    text: data.message.text,
                    file: data.message.file,
                    isVoiceMessage: isVoiceMessage, // Определяем, является ли это голосовым сообщением
                    edited: true  // Всегда помечаем как отредактированное при обновлении
                });
            }
        });
        
        socket.on('dm-updated', (data) => {
            // Обновляем сообщение у отправителя
            if (currentView === 'dm' && currentDMUserId && data.receiverId === currentDMUserId) {
                // Определяем, является ли файл голосовым сообщением
                let isVoiceMessage = false;
                if (data.message.file) {
                    const fileExtension = data.message.file.filename.split('.').pop().toLowerCase();
                    const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a', 'aac'];
                    isVoiceMessage = audioExtensions.includes(fileExtension);
                }
                
                updateMessageInUI({
                    id: data.message.id,
                    text: data.message.text,
                    file: data.message.file,
                    isVoiceMessage: isVoiceMessage, // Определяем, является ли это голосовым сообщением
                    edited: true  // Всегда помечаем как отредактированное при обновлении
                });
            }
        });

        socket.on('deleted-dm', (data) => {
            // Удаляем сообщение из UI
            if (currentView === 'dm' && currentDMUserId) {
                deleteMessageFromUI(data.messageId);
            }
        });

        // Обработка новых сообщений в канале
        socket.on('new-channel-message', (data) => {
            const { channelId, message } = data;

            // Отображаем сообщение если мы в этом канале
            if (currentView === 'channel' && currentChannel && currentChannel.id === channelId) {
                addChannelMessageToUI(message);
                scrollToBottom();
            }
        });

        socket.on('new-friend-request', () => {
            loadPendingRequests();
        });

        socket.on('incoming-call', (data) => {
            const { from, type } = data;
            if (from) {
                // Добавляем уведомление о входящем звонке
                addCallNotification(from, type);
                showIncomingCall(from, type);
            }
        });

        socket.on('call-accepted', (data) => {
            console.log('Call accepted by:', data.from);
            // When call is accepted, create peer connection
            document.querySelector('.call-channel-name').textContent = `Connected with ${data.from.username}`;

            // Create peer connection - для инициатора вызова создаем как инициатора, для принимающего - как не-инициатора
            if (!peerConnections[data.from.socketId]) {
                // Определяем, является ли текущий пользователь инициатором вызова
                const isInitiator = window.currentCallDetails && window.currentCallDetails.isInitiator;
                createPeerConnection(data.from.socketId, isInitiator);
            }
        });
        
        // Обработка присоединения к существующему звонку
        socket.on('join-existing-call', (data) => {
            const { callId, participants, type } = data;
            console.log('Joining existing call:', callId);
            
            // Присоединяемся к существующему звонку
            joinExistingCall({
                id: participants.find(id => id !== currentUser.id), // Находим другого участника
                username: 'Participant' // Временное имя, нужно получить настоящее
            }, callId, type);
        });

        socket.on('call-rejected', (data) => {
            alert('Call was declined');
            // Close call interface
            const callInterface = document.getElementById('callInterface');
            callInterface.classList.add('hidden');
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            inCall = false;
        });
        
        socket.on('call-ended', (data) => {
            // Handle when other party ends the call
            if (peerConnections[data.from]) {
                peerConnections[data.from].close();
                delete peerConnections[data.from];
            }
            const remoteVideo = document.getElementById(`remote-${data.from}`);
            if (remoteVideo) remoteVideo.remove();

            // If no more connections, end the call
            if (Object.keys(peerConnections).length === 0) {
                leaveVoiceChannel(true);
            }
        });

        // Обработка уведомления о пропущенном звонке (от сервера)
        socket.on('missed-call-notification', (data) => {
            const { from, type, timestamp } = data;
            console.log('Missed call notification from server:', from);
            
            // Сохраняем как пропущенный звонок
            if (notificationService) {
                notificationService.addMissedCall(from, type, new Date(timestamp));
                updateNotificationBadge();
                renderNotificationsList();
            }
        });

        // Обновляем список пользователей
        socket.on('user-list-update', (usersList) => {
            // Update online friends list
            const onlineList = document.getElementById('friendsOnline');
            if (onlineList) {
                onlineList.innerHTML = '';
                
                const onlineFriends = usersList.filter(f => f.status === 'Online');
                
                if (onlineFriends.length === 0) {
                    onlineList.innerHTML = '<div class="friends-empty">No one is online</div>';
                } else {
                    onlineFriends.forEach(friend => {
                        onlineList.appendChild(createFriendItem(friend));
                    });
                }
            }
            
            // Update our local users map
            users.clear();
            usersList.forEach(user => {
                users.set(user.socketId, user);
            });
        });
        
        // Обработка приглашения присоединиться к звонку
        socket.on('call-invitation', (data) => {
            const { inviter, callId, type } = data;
            showCallInvitation(inviter, callId, type);
        });
        
        // Обработка добавления к существующему звонку
        socket.on('add-participant-to-call', (data) => {
            const { from, participants } = data;
            // Обновляем список участников
            if (window.currentCallDetails) {
                window.currentCallDetails.participants = participants;
            }
            // Создаем соединение с инициатором
            if (!peerConnections[from.socketId]) {
                createPeerConnection(from.socketId, false); // не инициатор
            }
        });
    }
}

// Initialize friends tabs
function initializeFriendsTabs() {
    const tabs = document.querySelectorAll('.friends-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchFriendsTab(tabName);
        });
    });

    const searchBtn = document.getElementById('searchUserBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', searchUsers);
    }

    loadFriends();
}

function switchFriendsTab(tabName) {
    document.querySelectorAll('.friends-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    document.querySelectorAll('.friends-list').forEach(l => l.classList.remove('active-tab'));
    const contentMap = {
        'online': 'friendsOnline',
        'all': 'friendsAll',
        'pending': 'friendsPending',
        'add': 'friendsAdd'
    };
    document.getElementById(contentMap[tabName]).classList.add('active-tab');
    
    if (tabName === 'pending') {
        loadPendingRequests();
    }
}

async function loadFriends() {
    try {
        const response = await fetch(`${getApiUrl()}/api/friends`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const friends = await response.json();
        window.lastLoadedFriends = friends; // Сохраняем для использования в startDM
        displayFriends(friends);
        populateDMList(friends);
        updateServerListWithFriends(friends);
    } catch (error) {
        console.error('Error loading friends:', error);
    }
}

// Загрузка системного канала
let systemChannelId = null;
let systemChannelMessages = [];

async function loadSystemChannel() {
    try {
        const response = await fetch(`${getApiUrl()}/api/channels/system`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const channel = await response.json();
            systemChannelId = channel.id;
            console.log('System channel loaded, ID:', systemChannelId);
            return channel;
        } else {
            console.error('Failed to load system channel, status:', response.status);
        }
    } catch (error) {
        console.error('Error loading system channel:', error);
    }
    return null;
}

// Загрузка новостей из файла news.json
async function loadNewsFromFile() {
    try {
        const response = await fetch('news.json');
        if (!response.ok) return [];
        const data = await response.json();
        return data.news || [];
    } catch (error) {
        console.error('Error loading news:', error);
        return [];
    }
}

// Преобразование новости в сообщение канала
function newsToChannelMessage(news) {
    const content = `📢 **${news.title}** (v${news.version})\n\n${news.changes.map(c => `• ${c}`).join('\n')}`;
    return {
        id: `news-${news.id}`,
        content: content,
        username: 'Система',
        avatar: '📢',
        created_at: news.date + 'T00:00:00.000Z',
        file: null,
        reactions: [],
        replyTo: null,
        isNews: true
    };
}

// Открытие системного канала (аналогично startSelfChat)
async function openSystemChannel() {
    if (!systemChannelId) {
        console.error('systemChannelId not set');
        return;
    }
    
    currentView = 'channel';
    currentChannel = { id: systemChannelId, name: 'Новости', type: 'system' };
    
    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');
    const serverName = document.getElementById('serverName');
    const chatHeaderInfo = document.getElementById('chatHeaderInfo');
    const messageInputContainer = document.querySelector('.message-input-container');
    
    if (friendsView) friendsView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';
    if (dmListView) dmListView.style.display = 'block';
    if (serverName) serverName.textContent = 'Новости';
    if (chatHeaderInfo) {
        chatHeaderInfo.innerHTML = `
            <div class="channel-icon" style="margin-right: 8px;">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
            </div>
            <div style="display: flex; flex-direction: column;">
                <span class="channel-name">Новости</span>
                <span class="channel-subscribers" style="font-size: 12px; color: rgba(255,255,255,0.5);">Загрузка...</span>
            </div>
        `;
    }
    
    // Скрываем поле ввода сообщений (новости только для чтения)
    if (messageInputContainer) {
        messageInputContainer.style.display = 'none';
    }
    
    // Выделяем системный канал в списке
    document.querySelectorAll('.channel').forEach(ch => ch.classList.remove('active'));
    const systemChannelEl = document.querySelector(`[data-channel-id="${systemChannelId}"]`);
    if (systemChannelEl) systemChannelEl.classList.add('active');
    
    // Загружаем новости и количество подписчиков
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.placeholder = 'Новости только для чтения';
    }
    
    // Загружаем количество подписчиков
    try {
        const response = await fetch(`${getApiUrl()}/api/channels/system`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const channel = await response.json();
            const subscribersEl = document.querySelector('.channel-subscribers');
            if (subscribersEl && channel.subscriberCount) {
                subscribersEl.textContent = `${channel.subscriberCount}${getSubscriberCountSuffix(channel.subscriberCount)}`;
            }
        }
    } catch (error) {
        console.error('Error loading subscriber count:', error);
    }
    
    await loadSystemChannelMessages();
    
    setTimeout(() => {
        scrollToBottom();
    }, 100);
}

// Склонение слова "подписчик"
function getSubscriberCountSuffix(count) {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        return ' подписчиков';
    }
    if (lastDigit === 1) {
        return ' подписчик';
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
        return ' подписчика';
    }
    return ' подписчиков';
}

// Загрузка сообщений системного канала (аналогично loadSelfChatHistory)
async function loadSystemChannelMessages() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        console.error('messagesContainer not found');
        return;
    }
    
    console.log('Loading system channel messages...');
    messagesContainer.innerHTML = '';
    
    try {
        // Загружаем новости из файла
        const news = await loadNewsFromFile();
        console.log('News loaded:', news.length);
        
        // Загружаем сообщения из API (если есть)
        let apiMessages = [];
        try {
            const response = await fetch(`${getApiUrl()}/api/channels/${systemChannelId}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                apiMessages = await response.json();
                console.log('API messages loaded:', apiMessages.length);
            }
        } catch (error) {
            console.log('No API messages or API not available');
        }
        
        // Объединяем и сортируем по дате
        const allMessages = [...news.map(newsToChannelMessage), ...apiMessages].sort((a, b) => 
            new Date(a.created_at) - new Date(b.created_at)
        );
        
        console.log('Total messages to display:', allMessages.length);
        
        // Отображаем сообщения
        allMessages.forEach(msg => {
            if (msg.isNews) {
                addNewsMessageToUI(msg);
            } else {
                addMessageToUI(msg);
            }
        });
    } catch (error) {
        console.error('Error loading system channel messages:', error);
        messagesContainer.innerHTML = '<div class="error-messages">Ошибка загрузки новостей</div>';
    }
}

// Добавление новости в UI (аналогично addMessageToUI)
function addNewsMessageToUI(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;

    const date = new Date(message.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // Форматируем текст с Markdown используя готовую функцию
    let formattedText = formatQuotedText(message.content);

    const div = document.createElement('div');
    div.className = 'message news-message';
    div.setAttribute('data-message-id', message.id);
    div.innerHTML = `
        <div class="message-avatar" style="background: linear-gradient(135deg, #ff8c00, #ffaa33); font-size: 20px;">📢</div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-author" style="color: #ffaa33; font-weight: 600;">${message.username}</span>
                <span class="message-time">${date}</span>
            </div>
            <div class="message-text" style="line-height: 1.6;">
                ${formattedText}
            </div>
        </div>
    `;

    messagesContainer.appendChild(div);
    
    // Применяем Twemoji к сообщению
    if (typeof twemoji !== 'undefined') {
        twemoji.parse(div);
    }
}

// Загрузка каналов пользователя
async function loadUserChannels() {
    try {
        const response = await fetch(`${getApiUrl()}/api/channels`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Error loading user channels:', error);
    }
    return [];
}

// Отображение системного канала в списке каналов
function prependSystemChannelToDMList() {
    const dmList = document.getElementById('dmList');
    if (!dmList) {
        console.error('dmList not found');
        return;
    }
    
    if (!systemChannelId) {
        console.error('systemChannelId not set');
        return;
    }

    console.log('Prepending system channel to DM list, ID:', systemChannelId);

    const systemChannelEl = document.createElement('div');
    systemChannelEl.className = 'channel system-channel';
    systemChannelEl.setAttribute('data-channel-id', systemChannelId);
    systemChannelEl.innerHTML = `
        <div class="channel-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
        </div>
        <span class="channel-name">Новости</span>
    `;
    systemChannelEl.addEventListener('click', () => {
        console.log('System channel clicked');
        openSystemChannel();
    });

    // Вставляем после self-chat (первый элемент)
    const selfChat = dmList.querySelector('.self-chat-icon');
    if (selfChat && selfChat.closest('.channel')) {
        dmList.insertBefore(systemChannelEl, selfChat.closest('.channel').nextSibling);
    } else {
        dmList.insertBefore(systemChannelEl, dmList.firstChild);
    }
}

// Загрузка сообщений канала
async function loadChannelMessages(channelId) {
    try {
        const response = await fetch(`${getApiUrl()}/api/channels/${channelId}/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const messages = await response.json();
            displayChannelMessages(messages);
        }
    } catch (error) {
        console.error('Error loading channel messages:', error);
    }
}

// Отображение сообщений канала
function displayChannelMessages(messages) {
    const messagesContainer = document.getElementById('messagesContainer');
    const messageInput = document.getElementById('messageInput');
    
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<div class="no-messages">No messages yet. Be the first to say hello!</div>';
        return;
    }
    
    messages.forEach(msg => {
        const messageEl = createChannelMessageElement(msg);
        messagesContainer.appendChild(messageEl);
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Обновляем placeholder
    if (messageInput) {
        messageInput.placeholder = `Message #${currentChannel?.name || 'channel'}...`;
    }
}

// Создание элемента сообщения канала
function createChannelMessageElement(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    div.setAttribute('data-message-id', msg.id);
    
    const timestamp = new Date(msg.created_at).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    let fileHTML = '';
    if (msg.file) {
        if (msg.file.type.startsWith('image/')) {
            fileHTML = `<div class="message-file"><img src="${msg.file.url}" alt="${msg.file.filename}" class="message-image"></div>`;
        } else if (msg.file.type.startsWith('audio/')) {
            fileHTML = `<div class="message-file"><audio controls src="${msg.file.url}"></audio></div>`;
        } else if (msg.file.type.startsWith('video/')) {
            fileHTML = `<div class="message-file"><video controls src="${msg.file.url}"></video></div>`;
        } else {
            fileHTML = `<div class="message-file"><a href="${msg.file.url}" download="${msg.file.filename}">📎 ${msg.file.filename}</a></div>`;
        }
    }
    
    let replyHTML = '';
    if (msg.replyTo) {
        replyHTML = `
            <div class="reply-preview" data-reply-to="${msg.replyTo.id}">
                <div class="reply-author">${msg.replyTo.author}</div>
                <div class="reply-text">${msg.replyTo.text || '[Attachment]'}</div>
            </div>
        `;
    }
    
    div.innerHTML = `
        <div class="message-avatar">${msg.avatar || msg.username.charAt(0).toUpperCase()}</div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-author">${msg.username}</span>
                <span class="message-time">${timestamp}</span>
            </div>
            ${replyHTML}
            <div class="message-text">${escapeHtml(msg.content)}</div>
            ${fileHTML}
            <div class="message-reactions"></div>
        </div>
    `;
    
    // Добавляем реакции если есть
    if (msg.reactions && msg.reactions.length > 0) {
        const reactionsContainer = div.querySelector('.message-reactions');
        msg.reactions.forEach(reaction => {
            reactionsContainer.innerHTML += `
                <span class="reaction" data-emoji="${reaction.emoji}">${reaction.emoji} ${reaction.count}</span>
            `;
        });
    }
    
    return div;
}

// Добавляем обработчик изменения размера окна для обновления отображения друзей
window.addEventListener('resize', () => {
    const currentIsMobile = window.innerWidth <= 820;
    
    // Обновляем отображение только если режим изменился
    if (isMobileView !== currentIsMobile) {
        isMobileView = currentIsMobile;
        
        if (currentIsMobile) {
            // Если перешли в мобильный режим, обновляем server-list
            loadFriends();
        } else {
            // Если перешли в десктопный режим, очищаем server-list от аватаров друзей
            const serverList = document.querySelector('.server-list');
            const existingFriendAvatars = serverList.querySelectorAll('.friend-avatar-server');
            existingFriendAvatars.forEach(avatar => avatar.remove());
        }
    }
});

function displayFriends(friends) {
    const onlineList = document.getElementById('friendsOnline');
    const allList = document.getElementById('friendsAll');
    
    onlineList.innerHTML = '';
    allList.innerHTML = '';
    
    if (friends.length === 0) {
        onlineList.innerHTML = '<div class="friends-empty">No friends yet</div>';
        allList.innerHTML = '<div class="friends-empty">No friends yet</div>';
        return;
    }
    
    const onlineFriends = friends.filter(f => f.status === 'Online');
    
    if (onlineFriends.length === 0) {
        onlineList.innerHTML = '<div class="friends-empty">No one is online</div>';
    } else {
        onlineFriends.forEach(friend => {
            onlineList.appendChild(createFriendItem(friend));
        });
    }
    
    friends.forEach(friend => {
        allList.appendChild(createFriendItem(friend));
    });
}

function createFriendItem(friend) {
    const div = document.createElement('div');
    div.className = 'friend-item';

    div.innerHTML = `
        <div class="friend-avatar">
            <div class="friend-avatar-content">${friend.avatar || friend.username.charAt(0).toUpperCase()}</div>
        </div>
        <div class="friend-info">
            <div class="friend-name">${friend.username}</div>
            <div class="friend-status ${friend.status === 'Online' ? '' : 'offline'}">${friend.status}</div>
        </div>
        <div class="friend-actions">
            <button class="friend-action-btn message" title="Message">💬</button>
            <button class="friend-action-btn audio-call" title="Audio Call">📞</button>
            <button class="friend-action-btn video-call" title="Video Call">📹</button>
            <button class="friend-action-btn remove" title="Remove">🗑️</button>
        </div>
    `;

    div.querySelector('.message').addEventListener('click', () => startDM(friend.id, friend.username));
    div.querySelector('.audio-call').addEventListener('click', () => initiateCall(friend.id, 'audio'));
    div.querySelector('.video-call').addEventListener('click', () => initiateCall(friend.id, 'video'));
    div.querySelector('.remove').addEventListener('click', () => removeFriend(friend.id));

    return div;
}

async function searchUsers() {
    const searchInput = document.getElementById('searchUserInput');
    const query = searchInput.value.trim();
    
    if (!query) return;
    
    try {
        const response = await fetch(`${getApiUrl()}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const users = await response.json();
        
        const results = users.filter(u => 
            u.username.toLowerCase().includes(query.toLowerCase()) && 
            u.id !== currentUser.id
        );
        
        displaySearchResults(results);
    } catch (error) {
        console.error('Error searching users:', error);
    }
}

function displaySearchResults(users) {
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '';
    
    if (users.length === 0) {
        resultsDiv.innerHTML = '<div class="friends-empty">No users found</div>';
        return;
    }
    
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-search-item';
        
        div.innerHTML = `
            <div class="user-avatar">
                <div class="user-avatar-content">${user.avatar || user.username.charAt(0).toUpperCase()}</div>
            </div>
            <div class="user-info">
                <div class="user-name">${user.username}</div>
            </div>
            <button class="add-friend-btn" onclick="sendFriendRequest(${user.id})">Add Friend</button>
        `;
        
        resultsDiv.appendChild(div);
    });
}

window.sendFriendRequest = async function(friendId) {
    try {
        const response = await fetch(`${getApiUrl()}/api/friends/request`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ friendId })
        });
        
        if (response.ok) {
            alert('Friend request sent!');
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to send request');
        }
    } catch (error) {
        console.error('Error sending friend request:', error);
        alert('Failed to send friend request');
    }
};

async function loadPendingRequests() {
    try {
        const response = await fetch(`${getApiUrl()}/api/friends/pending`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const requests = await response.json();
        
        const pendingList = document.getElementById('friendsPending');
        pendingList.innerHTML = '';
        
        if (requests.length === 0) {
            pendingList.innerHTML = '<div class="friends-empty">No pending requests</div>';
            return;
        }
        
        requests.forEach(request => {
            const div = document.createElement('div');
            div.className = 'friend-item';
            
            div.innerHTML = `
                <div class="friend-avatar">
                    <div class="friend-avatar-content">${request.avatar || request.username.charAt(0).toUpperCase()}</div>
                </div>
                <div class="friend-info">
                    <div class="friend-name">${request.username}</div>
                    <div class="friend-status">Incoming Friend Request</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn accept" onclick="acceptFriendRequest(${request.id})">✓</button>
                    <button class="friend-action-btn reject" onclick="rejectFriendRequest(${request.id})">✕</button>
                </div>
            `;
            
            pendingList.appendChild(div);
        });
    } catch (error) {
        console.error('Error loading pending requests:', error);
    }
}

window.acceptFriendRequest = async function(friendId) {
    try {
        const response = await fetch(`${getApiUrl()}/api/friends/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ friendId })
        });
        
        if (response.ok) {
            loadPendingRequests();
            loadFriends();
        }
    } catch (error) {
        console.error('Error accepting friend request:', error);
    }
};

window.rejectFriendRequest = async function(friendId) {
    try {
        const response = await fetch(`${getApiUrl()}/api/friends/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ friendId })
        });
        
        if (response.ok) {
            loadPendingRequests();
        }
    } catch (error) {
        console.error('Error rejecting friend request:', error);
    }
};

window.removeFriend = async function(friendId) {
    if (!confirm('Are you sure you want to remove this friend?')) return;

    try {
        const response = await fetch(`/api/friends/${friendId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            loadFriends();
        }
    } catch (error) {
        console.error('Error removing friend:', error);
    }
};

// Обновляем server-list аватарами друзей (только для мобильной верстки)
function updateServerListWithFriends(friends) {
    // Проверяем, является ли текущая версия мобильной (по ширине окна)
    if (window.innerWidth <= 820) {
        const serverList = document.querySelector('.server-list');
        
        // Очищаем предыдущие аватары друзей, кроме friendsBtn
        const existingFriendAvatars = serverList.querySelectorAll('.friend-avatar-server');
        existingFriendAvatars.forEach(avatar => avatar.remove());
        
        // Добавляем аватар Self Chat (копируем структуру friend-avatar из dmListView)
        const selfChatAvatar = document.createElement('div');
        selfChatAvatar.className = 'server-icon friend-avatar-server self-chat-icon';
        selfChatAvatar.title = window.i18n.t('chat.selfChat');
        
        // Используем ту же структуру, что и в createFriendItem
        selfChatAvatar.innerHTML = `
            <div class="friend-avatar-content">${currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}</div>
        `;
        selfChatAvatar.addEventListener('click', startSelfChat);
        
        // Вставляем Self Chat аватар сразу после friendsBtn
        const friendsBtn = document.getElementById('friendsBtn');
        if (friendsBtn) {
            serverList.insertBefore(selfChatAvatar, friendsBtn.nextSibling);
        } else {
            serverList.appendChild(selfChatAvatar);
        }
        
        // Добавляем аватары друзей в server-list после friendsBtn и selfChat
        friends.forEach(friend => {
            const friendAvatar = document.createElement('div');
            friendAvatar.className = 'server-icon friend-avatar-server';
            friendAvatar.title = friend.username;
            
            // Используем ту же структуру, что и в createFriendItem
            friendAvatar.innerHTML = `
                <div class="friend-avatar-content">${friend.avatar || friend.username.charAt(0).toUpperCase()}</div>
            `;
            
            // Добавляем обработчик клика для открытия DM с другом
            friendAvatar.addEventListener('click', () => {
                startDM(friend.id, friend.username);
            });
            
            // Вставляем аватар после selfChat
            serverList.appendChild(friendAvatar);
        });
    }
}

// Initiate call function
async function initiateCall(friendId, type) {
    try {
        // Если звонок уже активен, добавляем нового участника к существующему звонку
        if (inCall && window.currentCallDetails) {
            return addParticipantToCall(friendId, type);
        }

        // Always request both video and audio, but disable video if it's audio call
        const constraints = { video: true, audio: true };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        // If audio call, disable video track initially
        if (type === 'audio') {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = false;
            });
        }

        // Show call interface
        const callInterface = document.getElementById('callInterface');
        callInterface.classList.remove('hidden');

        // Update call header
        document.querySelector('.call-channel-name').textContent = `Calling...`;

        // Set local video
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;

        // Store call details
        window.currentCallDetails = {
            friendId: friendId,
            type: type,
            isInitiator: true,
            originalType: type,
            participants: [] // Список участников звонка
        };

        // Emit call request via socket
        if (socket && socket.connected) {
            socket.emit('initiate-call', {
                to: friendId,
                type: type,
                from: {
                    id: currentUser.id,
                    username: currentUser.username,
                    socketId: socket.id
                }
            });
        }

        inCall = true;
        isVideoEnabled = type === 'video';
        isAudioEnabled = true;
        updateCallButtons();

        // Initialize resizable functionality after a short delay
        setTimeout(() => {
            if (typeof initializeResizableVideos === 'function') {
                initializeResizableVideos();
            }
        }, 100);

    } catch (error) {
        console.error('Error initiating call:', error);
        alert('Failed to access camera/microphone. Please check permissions.');
    }
}

// Функция для добавления участника к существующему звонку
async function addParticipantToCall(friendId, type) {
    try {
        // Получаем данные о пользователе
        const response = await fetch(`${getApiUrl()}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const users = await response.json();
        const friend = users.find(u => u.id == friendId);

        if (!friend) {
            console.error('Friend not found');
            return;
        }

        // Создаем новое peer-соединение для участника
        const socketId = getSocketIdByUserId(friendId); // Нужно реализовать функцию получения socketId по userId
        if (socketId) {
            // Создаем peer-соединение с новым участником
            if (!peerConnections[socketId]) {
                createPeerConnection(socketId, true); // initiator
                
                // Обновляем список участников
                if (window.currentCallDetails && !window.currentCallDetails.participants.includes(friendId)) {
                    window.currentCallDetails.participants.push(friendId);
                }
                
                // Уведомляем нового участника о присоединении к звонку
                socket.emit('add-participant-to-call', {
                    to: socketId,
                    type: type,
                    from: {
                        id: currentUser.id,
                        username: currentUser.username,
                        socketId: socket.id
                    },
                    participants: window.currentCallDetails.participants
                });
            }
        } else {
            // Если пользователь оффлайн, отправляем ему приглашение
            socket.emit('invite-to-call', {
                to: friendId,
                callId: window.currentCallDetails ? window.currentCallDetails.friendId : null,
                type: type,
                inviter: {
                    id: currentUser.id,
                    username: currentUser.username
                }
            });
        }
    } catch (error) {
        console.error('Error adding participant to call:', error);
    }
}

// Вспомогательная функция для получения socketId по userId
function getSocketIdByUserId(userId) {
    // Используем глобальный объект users
    for (let [socketId, userData] of users.entries()) {
        if (userData.id == userId) {
            return socketId;
        }
    }
    return null;
}

// Show incoming call notification
function showIncomingCall(caller, type) {
    const incomingCallDiv = document.getElementById('incomingCall');
    const callerName = incomingCallDiv.querySelector('.caller-name');
    const callerAvatar = incomingCallDiv.querySelector('.caller-avatar');

    callerName.textContent = caller.username || 'Unknown User';
    callerAvatar.textContent = caller.avatar || caller.username?.charAt(0).toUpperCase() || 'U';

    incomingCallDiv.classList.remove('hidden');

    // Set up accept/reject handlers
    const acceptBtn = document.getElementById('acceptCallBtn');
    const rejectBtn = document.getElementById('rejectCallBtn');

    acceptBtn.onclick = async () => {
        incomingCallDiv.classList.add('hidden');
        await acceptCall(caller, type);
    };

    rejectBtn.onclick = () => {
        incomingCallDiv.classList.add('hidden');
        rejectCall(caller);
    };

    // Auto-reject after 30 seconds - add missed call notification
    setTimeout(() => {
        if (!incomingCallDiv.classList.contains('hidden')) {
            incomingCallDiv.classList.add('hidden');
            // Добавляем уведомление о пропущенном звонке
            if (notificationService) {
                notificationService.addMissedCall(caller, type, new Date());
                updateNotificationBadge();
                renderNotificationsList();
            }
            rejectCall(caller);
        }
    }, 30000);
}

// Show call invitation notification
function showCallInvitation(inviter, callId, type) {
    const invitationDiv = document.getElementById('incomingCall') || createCallInvitationElement();
    const callerName = invitationDiv.querySelector('.caller-name');
    const callerAvatar = invitationDiv.querySelector('.caller-avatar');

    callerName.textContent = `${inviter.username} invited you to join a call`;
    callerAvatar.textContent = inviter.avatar || inviter.username?.charAt(0).toUpperCase() || 'U';

    invitationDiv.classList.remove('hidden');

    // Set up join/cancel handlers
    const acceptBtn = document.getElementById('acceptCallBtn');
    const rejectBtn = document.getElementById('rejectCallBtn');

    acceptBtn.onclick = async () => {
        invitationDiv.classList.add('hidden');
        // Присоединяемся к существующему звонку
        await joinExistingCall(inviter, callId, type);
    };

    rejectBtn.onclick = () => {
        invitationDiv.classList.add('hidden');
    };
}

// Create call invitation element if it doesn't exist
function createCallInvitationElement() {
    const invitationDiv = document.createElement('div');
    invitationDiv.id = 'incomingCall';
    invitationDiv.className = 'incoming-call hidden';
    invitationDiv.innerHTML = `
        <div class="caller-info">
            <div class="caller-avatar"></div>
            <div class="caller-name"></div>
        </div>
        <div class="call-actions">
            <button id="acceptCallBtn">Join</button>
            <button id="rejectCallBtn">Cancel</button>
        </div>
    `;
    document.body.appendChild(invitationDiv);
    return invitationDiv;
}

// Join existing call
async function joinExistingCall(inviter, callId, type) {
    try {
        // Always request both video and audio
        const constraints = { video: true, audio: true };

        // Если у нас уже есть локальный поток, используем его
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // If audio call, disable video track initially
            if (type === 'audio') {
                localStream.getVideoTracks().forEach(track => {
                    track.enabled = false;
                });
            }
        }

        // Show call interface
        const callInterface = document.getElementById('callInterface');
        callInterface.classList.remove('hidden');

        document.querySelector('.call-channel-name').textContent = `Joined call with ${inviter.username || 'Participant'}`;

        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;

        // Store call details
        window.currentCallDetails = {
            callId: callId,
            type: type,
            isInitiator: false,
            originalType: type,
            participants: [inviter.id] // Инициализируем списком участников
        };

        // Создаем соединение с инициатором звонка
        if (inviter.socketId && !peerConnections[inviter.socketId]) {
            createPeerConnection(inviter.socketId, false);
        }

        inCall = true;
        isVideoEnabled = type === 'video';
        isAudioEnabled = true;
        updateCallButtons();

        // Initialize resizable functionality after a short delay
        setTimeout(() => {
            if (typeof initializeResizableVideos === 'function') {
                initializeResizableVideos();
            }
        }, 100);

    } catch (error) {
        console.error('Error joining call:', error);
        alert('Failed to access camera/microphone. Please check permissions.');
    }
}

// Accept incoming call
async function acceptCall(caller, type) {
    try {
        // Always request both video and audio
        const constraints = { video: true, audio: true };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // If audio call, disable video track initially
        if (type === 'audio') {
            localStream.getVideoTracks().forEach(track => {
                track.enabled = false;
            });
        }
        
        // Show call interface
        const callInterface = document.getElementById('callInterface');
        callInterface.classList.remove('hidden');
        
        document.querySelector('.call-channel-name').textContent = `Call with ${caller.username}`;
        
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;
        
        // Store call details
        window.currentCallDetails = {
            peerId: caller.socketId,
            type: type,
            isInitiator: false,
            originalType: type,
            participants: [caller.id] // Добавляем инициатора в список участников
        };
        
        if (socket && socket.connected) {
            socket.emit('accept-call', {
                to: caller.socketId,
                from: {
                    id: currentUser.id,
                    username: currentUser.username,
                    socketId: socket.id
                }
            });
        }
        
        inCall = true;
        isVideoEnabled = type === 'video';
        isAudioEnabled = true;
        updateCallButtons();
        
        // Create peer connection as receiver (not initiator)
        if (!peerConnections[caller.socketId]) {
            createPeerConnection(caller.socketId, false);
        }
        
        // Notify the caller that the call was accepted
        if (socket && socket.connected) {
            socket.emit('accept-call', {
                to: caller.socketId,
                from: {
                    id: currentUser.id,
                    username: currentUser.username,
                    socketId: socket.id
                }
            });
        }
        
        // Initialize resizable functionality after a short delay
        setTimeout(() => {
            if (typeof initializeResizableVideos === 'function') {
                initializeResizableVideos();
            }
        }, 100);
        
    } catch (error) {
        console.error('Error accepting call:', error);
        alert('Failed to access camera/microphone. Please check permissions.');
    }
}

// Reject incoming call
function rejectCall(caller) {
    if (socket && socket.connected) {
        socket.emit('reject-call', { to: caller.socketId });
    }
    
    // Скрываем интерфейс входящего звонка
    const incomingCallDiv = document.getElementById('incomingCall');
    if (incomingCallDiv) {
        incomingCallDiv.classList.add('hidden');
    }
}

window.startDM = async function(friendId, friendUsername) {
    currentView = 'dm';
    currentDMUserId = friendId;
    currentChannel = null; // Сбрасываем системный канал

    // Сбрасываем счетчик непрочитанных для этого пользователя
    if (notificationService) {
        notificationService.resetUnread(friendId);
        // Также помечаем уведомления от этого пользователя как прочитанные
        notificationService.notifications.forEach(n => {
            if (n.userId === friendId) n.read = true;
        });
        notificationService.missedCalls.forEach(c => {
            if (c.from.id === friendId) c.read = true;
        });
        notificationService.saveToLocalStorage();
        // Отмечаем на сервере
        notificationService.markUserReadOnServer(friendId);
        updateNotificationBadge();
        renderNotificationsList();
    }

    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');
    const messageInputContainer = document.querySelector('.message-input-container');

    if (friendsView) friendsView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';
    if (dmListView) dmListView.style.display = 'block';

    // Показываем поле ввода (возвращаем после скрытия в канале новостей)
    if (messageInputContainer) {
        messageInputContainer.style.display = 'block';
    }

    const chatHeaderInfo = document.getElementById('chatHeaderInfo');
    if (chatHeaderInfo) {
        chatHeaderInfo.innerHTML = `
            <div class="friend-avatar">
                <div class="friend-avatar-content">${friendUsername.charAt(0).toUpperCase()}</div>
            </div>
            <span class="channel-name">${friendUsername}</span>
        `;
    }

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.placeholder = `Message @${friendUsername}`;
    }

    await loadDMHistory(friendId);

    // Обновляем DM список для удаления бейджа
    loadFriends().then(() => {
        populateDMList(window.lastLoadedFriends || []);
    });

    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 100);
};

// Функция для открытия чата с самим собой
function startSelfChat() {
    currentView = 'dm';
    currentDMUserId = currentUser.id;
    currentChannel = null; // Сбрасываем системный канал

    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');
    const messageInputContainer = document.querySelector('.message-input-container');

    if (friendsView) friendsView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';
    if (dmListView) dmListView.style.display = 'block';

    // Показываем поле ввода (возвращаем после скрытия в канале новостей)
    if (messageInputContainer) {
        messageInputContainer.style.display = 'block';
    }

    const chatHeaderInfo = document.getElementById('chatHeaderInfo');
    if (chatHeaderInfo) {
        chatHeaderInfo.innerHTML = `
            <div class="friend-avatar">
                <div class="friend-avatar-content">${currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}</div>
            </div>
            <span class="channel-name" data-i18n="chat.selfChat">Self Chat</span>
        `;

        window.i18n.applyI18n(chatHeaderInfo);
    }

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.placeholder = `Message yourself...`;
    }

    loadSelfChatHistory();

    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 100);
}

// Функция для загрузки истории Self Chat из localStorage
function loadSelfChatHistory() {
    const messagesContainer = document.getElementById('messagesContainer');

    if (!messagesContainer) {
        console.error('Messages container element not found');
        return;
    }

    messagesContainer.innerHTML = '';

    // Получаем историю из localStorage
    const selfChatHistory = JSON.parse(localStorage.getItem(`selfChatHistory_${currentUser.id}`)) || [];

    selfChatHistory.forEach(message => {
        // Определяем, является ли файл голосовым сообщением
        let isVoiceMessage = false;
        if (message.file) {
            const fileExtension = message.file.filename.split('.').pop().toLowerCase();
            const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a', 'aac'];
            isVoiceMessage = audioExtensions.includes(fileExtension);
        }
        
        addMessageToUI({
            id: message.id,
            author: message.author,
            avatar: message.avatar,
            text: message.text,
            timestamp: message.timestamp,
            reactions: message.reactions || [],
            file: message.file,  // Добавляем информацию о файле, если она есть
            isVoiceMessage: isVoiceMessage // Определяем, является ли это голосовым сообщением
        });
    });

    scrollToBottom();
    
    // Restore voice message handlers after loading history
    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 100);
}

// Функция для сохранения сообщения в истории Self Chat
function saveSelfMessageToHistory(message) {
    const key = `selfChatHistory_${currentUser.id}`;
    const history = JSON.parse(localStorage.getItem(key)) || [];

    // Добавляем новое сообщение
    history.push(message);

    // Сохраняем обратно в localStorage
    localStorage.setItem(key, JSON.stringify(history));
}

// Show friends view
function showFriendsView() {
    currentView = 'friends';
    currentDMUserId = null;

    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');
    const serverName = document.getElementById('serverName');
    const friendsBtn = document.getElementById('friendsBtn');
    const messageInputContainer = document.querySelector('.message-input-container');

    if (friendsView) friendsView.style.display = 'flex';
    if (chatView) chatView.style.display = 'none';
    if (dmListView) dmListView.style.display = 'block';
    if (serverName) serverName.textContent = 'Friends';
    if (friendsBtn) friendsBtn.classList.add('active');
    
    // Показываем поле ввода
    if (messageInputContainer) {
        messageInputContainer.style.display = 'block';
    }

    if (window.voiceMessageElements) {
        window.voiceMessageElements = [];
    }
}

// Show server view



function initializeMessageInput() {
    const messageInput = document.getElementById('messageInput');

    if (!messageInput) {
        console.error('Message input element not found');
        return;
    }

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Используем новую функцию отправки с поддержкой ответов
            if (typeof window.sendMessageWithReply === 'function') {
                window.sendMessageWithReply();
            } else {
                sendMessage();
            }
        }

        // Автоматическое изменение высоты при вводе текста
        adjustTextareaHeight(messageInput);
    });

    // Обработчик для изменения высоты при вводе текста
    messageInput.addEventListener('input', (e) => {
        adjustTextareaHeight(messageInput);
    });
}

// Voice recording functions
async function startRecording() {
    try {
        // Request access to microphone with specific constraints for Firefox Android
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 48000,
                echoCancellation: true,
                noiseSuppression: true
            } 
        });

        // Determine best supported MIME type
        let mimeType = 'audio/webm';
        let mimeTypeOptions = { mimeType: 'audio/webm' };
        
        // Firefox Android works better with audio/ogg
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
            if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                mimeType = 'audio/ogg;codecs=opus';
                mimeTypeOptions = { mimeType: 'audio/ogg;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
                mimeTypeOptions = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
                mimeTypeOptions = { mimeType: 'audio/webm' };
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                mimeType = 'audio/ogg';
                mimeTypeOptions = { mimeType: 'audio/ogg' };
            }
        }

        console.log('Using MIME type:', mimeType);

        // Create media recorder with explicit options
        mediaRecorder = new MediaRecorder(stream, mimeTypeOptions);
        recordedChunks = [];

        // Event handlers for recording
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Stop all tracks in the stream
            stream.getTracks().forEach(track => track.stop());

            // Create blob from recorded chunks with correct MIME type
            const audioBlob = new Blob(recordedChunks, { type: mimeType });

            // Send the recorded audio
            sendVoiceMessage(audioBlob, mimeType);
        };

        // Start recording
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();

        // Update UI to show recording state
        updateRecordingUI(true);

        console.log('Recording started with MIME type:', mimeType);
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Could not access microphone. Please check permissions.');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI to hide recording state
        updateRecordingUI(false);
        
        console.log('Recording stopped');
    }
}

// Variable to store the interval ID for updating recording time
let recordingTimeUpdateInterval = null;

function updateRecordingUI(show) {
    const voiceRecordBtn = document.getElementById('voiceRecordBtn');
    const messageInput = document.getElementById('messageInput');
    if (!voiceRecordBtn || !messageInput) return;

    // Clear any existing interval
    if (recordingTimeUpdateInterval) {
        clearInterval(recordingTimeUpdateInterval);
        recordingTimeUpdateInterval = null;
    }

    // Remove any existing recording timer element
    const existingTimer = document.querySelector('.recording-timer');
    if (existingTimer) {
        existingTimer.remove();
    }

    if (show) {
        // Add recording class to change icon via CSS
        voiceRecordBtn.classList.add('recording');
        voiceRecordBtn.title = 'Release to send voice message';
        voiceRecordBtn.setAttribute('aria-label', 'Release to send voice message');

        // Create recording timer element
        const timerElement = document.createElement('div');
        timerElement.className = 'recording-timer';
        timerElement.textContent = '0:00';
        timerElement.style.position = 'absolute';
        timerElement.style.bottom = '10px';
        timerElement.style.right = '10px';
        timerElement.style.backgroundColor = 'rgba(239, 68, 68, 0.9)';
        timerElement.style.color = 'white';
        timerElement.style.padding = '4px 8px';
        timerElement.style.borderRadius = '12px';
        timerElement.style.fontSize = '12px';
        timerElement.style.zIndex = '10';
        timerElement.style.fontWeight = 'bold';

        // Add the timer next to the message input
        const wrapper = messageInput.parentElement;
        wrapper.style.position = 'relative';
        wrapper.appendChild(timerElement);

        // Start updating recording time
        recordingTimeUpdateInterval = setInterval(() => {
            if (recordingStartTime) {
                const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsedSeconds / 60);
                const seconds = elapsedSeconds % 60;
                timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    } else {
        // Remove recording class to restore original icon via CSS
        voiceRecordBtn.classList.remove('recording');
        voiceRecordBtn.title = window.i18n ? window.i18n.t('actions.voiceMessage') : 'Voice Message';
        voiceRecordBtn.setAttribute('aria-label', window.i18n ? window.i18n.t('actions.voiceMessage') : 'Voice Message');
    }
}

async function sendVoiceMessage(audioBlob, mimeType = 'audio/webm') {
    try {
        // Determine file extension using centralized function
        let fileExtension = getFileExtensionFromMime(mimeType);
        
        // Fallback for wav or unknown types
        if (!fileExtension || fileExtension === 'bin') {
            if (mimeType.includes('wav')) {
                fileExtension = 'wav';
            } else {
                fileExtension = 'webm';
            }
        }

        // Create a unique filename with voice prefix
        const fileName = `voice_message_${Date.now()}.${fileExtension}`;

        // Create form data to send the audio file
        const formData = new FormData();
        formData.append('file', audioBlob, fileName);
        formData.append('dmId', currentDMUserId);
        formData.append('senderId', currentUser.id);
        formData.append('isVoiceMessage', 'true'); // Flag to identify voice messages
        formData.append('folder', 'voice_messages'); // Specify the folder for voice messages

        const response = await fetch(`${getApiUrl()}/api/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const fileData = await response.json();

        // Create message object with voice file
        const message = {
            id: Date.now(),
            author: currentUser.username,
            avatar: currentUser.avatar,
            text: '', // No text for voice messages
            file: fileData,
            isVoiceMessage: true, // Mark as voice message
            duration: null, // Will be set when audio metadata is loaded
            timestamp: new Date().toISOString(), // отправляем в UTC
            reactions: []
        };

        // If this is a Self Chat, save the message locally
        if (currentDMUserId === currentUser.id) {
            addMessageToUI(message);
            saveSelfMessageToHistory(message);
            scrollToBottom();
        } else if (currentDMUserId) {
            // For regular DMs, send via socket
            if (socket && socket.connected) {
                socket.emit('send-dm', {
                    receiverId: currentDMUserId,
                    message: message
                });
            }
        }
    } catch (error) {
        console.error('Error sending voice message:', error);
        alert('Failed to send voice message');
    }
}

// Функция для автоматического изменения высоты textarea
function adjustTextareaHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

function sendMessage() {
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

    // Получаем текущий ответ (если есть)
    const currentReplyTo = typeof window._getCurrentReplyTo === 'function'
        ? window._getCurrentReplyTo()
        : null;

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
    } else if (currentView === 'channel' && systemChannelId) {
        // Отправляем сообщение в системный канал
        sendChannelMessage(text, currentReplyTo, null);
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

    if (typeof window._clearCurrentReplyTo === 'function') {
        window._clearCurrentReplyTo();
    }
}

function addMessageToUI(message) {
    const messagesContainer = document.getElementById('messagesContainer');

    if (!messagesContainer) {
        console.error('Messages container element not found');
        return;
    }

    const messageGroup = document.createElement('div');

    messageGroup.className = 'message-group';
    messageGroup.setAttribute('data-message-id', message.id || Date.now());

    // Проверяем, является ли сообщение отправленным текущим пользователем
    // Исключаем self chat, так как все сообщения там от текущего пользователя
    const isUserMessage = message.author === currentUser.username && currentDMUserId !== currentUser.id;
    if (isUserMessage) {
        messageGroup.classList.add('user-message');
    }

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = message.avatar;

    const content = document.createElement('div');
    content.className = 'message-content';

    const header = document.createElement('div');
    header.className = 'message-header';

    const author = document.createElement('span');
    author.className = 'message-author';
    author.textContent = message.author;

    const timestamp = document.createElement('span');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTimestamp(message.timestamp);

    const text = document.createElement('div');
    text.className = 'message-text';

    if (isUserMessage) {
        text.classList.add('user-message-text');
    }

    // Process the message text to handle quotes
    let processedText = formatQuotedText(message.text);

    // Add edited indicator if message was edited
    if (message.edited) {
        processedText += ' <span class="edited-indicator">' + (window.i18n ? window.i18n.t('message.edited') : '(edited)') + '</span>';
    }

    // Set the HTML content to display formatted quotes
    text.innerHTML = processedText;

    // Add reply block if this message is a reply to another message
    let replyBlock = null;
    if (message.replyTo) {
        replyBlock = document.createElement('div');
        replyBlock.className = 'message-reply-block';
        replyBlock.onclick = () => {
            if (typeof window._scrollToMessage === 'function') {
                window._scrollToMessage(message.replyTo.id);
            }
        };

        // Determine icon based on message type
        let icon = '↪';
        let previewText = message.replyTo.text || '';

        if (message.replyTo.isVoiceMessage) {
            icon = '🎤';
            previewText = 'Голосовое сообщение';
        } else if (message.replyTo.file) {
            icon = '📎';
            previewText = `Файл: ${message.replyTo.file.filename}`;
        } else {
            // Strip markdown for preview
            previewText = previewText
                .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/`([^`]+)`/g, '$1')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .replace(/~~([^~]+)~~/g, '$1')
                .substring(0, 100) + (previewText.length > 100 ? '…' : '');
        }

        replyBlock.innerHTML = `
            <span class="reply-icon">${icon}</span>
            <span class="reply-author">${escapeHtml(message.replyTo.author)}</span>
            <span class="reply-separator">:</span>
            <span class="reply-text">${escapeHtml(previewText)}</span>
        `;
    }

    // Add elements to content in correct order: reply block first, then header, then text
    if (replyBlock) {
        content.appendChild(replyBlock);
    }
    content.appendChild(header);
    content.appendChild(text);

    // Handle voice messages separately from file attachments
    if (message.isVoiceMessage && message.file) {
        const voiceContainer = document.createElement('div');
        voiceContainer.className = 'voice-message-container';
        
        // Create waveform visualization container
        const waveformContainer = document.createElement('div');
        waveformContainer.className = 'voice-waveform';
        waveformContainer.style.display = 'flex';
        waveformContainer.style.alignItems = 'center';
        waveformContainer.style.gap = '2px';
        waveformContainer.style.margin = '8px 0';
        waveformContainer.style.padding = '4px';
        waveformContainer.style.background = 'var(--glass)';
        waveformContainer.style.borderRadius = '10px';
        
        // Generate simple waveform bars
        for (let i = 0; i < 20; i++) {
            const bar = document.createElement('div');
            bar.style.width = '3px';
            bar.style.height = `${Math.random() * 12 + 6}px`;
            bar.style.backgroundColor = 'var(--accent)';
            bar.style.borderRadius = '2px';
            waveformContainer.appendChild(bar);
        }
        
        // Create audio player with speed controls
        const audio = document.createElement('audio');
        audio.src = message.file.url;
        audio.className = 'voice-player';
        audio.style.width = '100%';
        audio.style.margin = '8px 0';
        
        // Create custom controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'voice-controls';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.alignItems = 'center';
        controlsContainer.style.gap = '10px';
        controlsContainer.style.marginTop = '8px';
        
        // Play/Pause button
        const playBtn = document.createElement('button');
        playBtn.className = 'voice-play-btn';
        playBtn.innerHTML = '▶';
        playBtn.style.background = 'var(--accent)';
        playBtn.style.border = 'none';
        playBtn.style.borderRadius = '50%';
        playBtn.style.width = '36px';
        playBtn.style.height = '36px';
        playBtn.style.display = 'flex';
        playBtn.style.alignItems = 'center';
        playBtn.style.justifyContent = 'center';
        playBtn.style.cursor = 'pointer';
        playBtn.style.color = 'white';
        playBtn.style.flexShrink = '0';
        
        // Speed control
        const speedBtn = document.createElement('button');
        speedBtn.className = 'voice-speed-btn';
        speedBtn.textContent = '1x';
        speedBtn.style.background = 'transparent';
        speedBtn.style.border = '1px solid var(--accent)';
        speedBtn.style.borderRadius = '8px';
        speedBtn.style.padding = '4px 10px';
        speedBtn.style.cursor = 'pointer';
        speedBtn.style.color = 'var(--accent)';
        speedBtn.style.fontSize = '12px';
        speedBtn.style.fontWeight = '600';

        // Transcribe button
        const transcribeBtn = document.createElement('button');
        transcribeBtn.className = 'voice-transcribe-small-btn';
        transcribeBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M14.25 2.001c0-.892-.339-1.751-.948-2.405l-.859 1.135c.375.403.607.942.607 1.535 0 1.242-1.008 2.25-2.25 2.25s-2.25-1.008-2.25-2.25c0-.593.232-1.132.607-1.535L8.25 1.266c-.609.654-.948 1.513-.948 2.405 0 1.795 1.455 3.25 3.25 3.25s3.25-1.455 3.25-3.25v-1.669z"/>
                <path fill="currentColor" d="M12 7.5c-3.038 0-5.5 2.462-5.5 5.5v2.25H5.25c-.69 0-1.25.56-1.25 1.25v3c0 .69.56 1.25 1.25 1.25h13.5c.69 0 1.25-.56 1.25-1.25v-3c0-.69-.56-1.25-1.25-1.25H17.5v-2.25c0-3.038-2.462-5.5-5.5-5.5zm-3.5 5.5c0-1.933 1.567-3.5 3.5-3.5s3.5 1.567 3.5 3.5v2.25H8.5v-2.25z"/>
            </svg>
        `;
        transcribeBtn.title = window.i18n ? window.i18n.t('actions.transcribe') : 'Расшифровать';
        transcribeBtn.style.background = 'transparent';
        transcribeBtn.style.border = '1px solid var(--muted)';
        transcribeBtn.style.borderRadius = '8px';
        transcribeBtn.style.padding = '6px 10px';
        transcribeBtn.style.cursor = 'pointer';
        transcribeBtn.style.color = 'var(--muted)';
        transcribeBtn.style.fontSize = '12px';
        transcribeBtn.style.fontWeight = '600';
        transcribeBtn.style.display = 'flex';
        transcribeBtn.style.alignItems = 'center';
        transcribeBtn.style.gap = '6px';
        
        // Duration display
        const durationDisplay = document.createElement('span');
        durationDisplay.className = 'voice-duration';
        durationDisplay.textContent = '0:00';
        durationDisplay.style.color = 'var(--muted)';
        durationDisplay.style.fontSize = '13px';
        durationDisplay.style.marginLeft = 'auto';
        
        // Add event listeners
        let isPlaying = false;
        playBtn.addEventListener('click', () => {
            if (isPlaying) {
                audio.pause();
                playBtn.innerHTML = '▶';
            } else {
                audio.play();
                playBtn.innerHTML = '⏸';
            }
            isPlaying = !isPlaying;
        });
        
        let currentSpeed = 1;
        const speeds = [0.5, 1, 1.25, 1.5, 2];
        let speedIndex = 1; // Default to 1x
        
        speedBtn.addEventListener('click', () => {
            speedIndex = (speedIndex + 1) % speeds.length;
            currentSpeed = speeds[speedIndex];
            audio.playbackRate = currentSpeed;
            speedBtn.textContent = `${currentSpeed}x`;
        });

        // Transcribe button click handler
        let isTranscribing = false;
        transcribeBtn.addEventListener('click', async () => {
            if (isTranscribing) return;

            isTranscribing = true;
            transcribeBtn.classList.add('transcribing');
            transcribeBtn.innerHTML = '⟳';

            try {
                console.log('[Transcribe] Starting transcription...');

                // Fetch the audio file
                const audioUrl = message.file.url;
                console.log('[Transcribe] Fetching audio from:', audioUrl);
                const response = await fetch(audioUrl);
                const audioBlob = await response.blob();
                console.log('[Transcribe] Audio blob received, size:', audioBlob.size);

                // Send to transcription API
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice_message.webm');

                const apiUrl = getApiUrl();
                console.log('[Transcribe] Sending to API:', apiUrl + '/api/transcribe');

                const transcribeResponse = await fetch(`${apiUrl}/api/transcribe`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });

                console.log('[Transcribe] Response status:', transcribeResponse.status);

                if (!transcribeResponse.ok) {
                    const errorText = await transcribeResponse.text();
                    console.error('[Transcribe] Server error:', errorText);
                    throw new Error('Transcription failed: ' + errorText);
                }

                const result = await transcribeResponse.json();
                console.log('[Transcribe] Result:', result);

                // Insert transcribed text into message input
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    if (messageInput.value.trim()) {
                        messageInput.value += ' ' + result.text;
                    } else {
                        messageInput.value = result.text;
                    }
                    messageInput.dispatchEvent(new Event('input'));
                    console.log('[Transcribe] Text inserted into message input:', result.text);
                } else {
                    console.warn('[Transcribe] Message input not found');
                }

                transcribeBtn.innerHTML = '✓';
                setTimeout(() => {
                    transcribeBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path fill="currentColor" d="M14.25 2.001c0-.892-.339-1.751-.948-2.405l-.859 1.135c.375.403.607.942.607 1.535 0 1.242-1.008 2.25-2.25 2.25s-2.25-1.008-2.25-2.25c0-.593.232-1.132.607-1.535L8.25 1.266c-.609.654-.948 1.513-.948 2.405 0 1.795 1.455 3.25 3.25 3.25s3.25-1.455 3.25-3.25v-1.669z"/>
                            <path fill="currentColor" d="M12 7.5c-3.038 0-5.5 2.462-5.5 5.5v2.25H5.25c-.69 0-1.25.56-1.25 1.25v3c0 .69.56 1.25 1.25 1.25h13.5c.69 0 1.25-.56 1.25-1.25v-3c0-.69-.56-1.25-1.25-1.25H17.5v-2.25c0-3.038-2.462-5.5-5.5-5.5zm-3.5 5.5c0-1.933 1.567-3.5 3.5-3.5s3.5 1.567 3.5 3.5v2.25H8.5v-2.25z"/>
                        </svg>
                    `;
                }, 2000);
            } catch (error) {
                console.error('[Transcribe] Error transcribing voice message:', error);
                alert('Failed to transcribe: ' + error.message);
                transcribeBtn.innerHTML = '✕';
                setTimeout(() => {
                    transcribeBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path fill="currentColor" d="M14.25 2.001c0-.892-.339-1.751-.948-2.405l-.859 1.135c.375.403.607.942.607 1.535 0 1.242-1.008 2.25-2.25 2.25s-2.25-1.008-2.25-2.25c0-.593.232-1.132.607-1.535L8.25 1.266c-.609.654-.948 1.513-.948 2.405 0 1.795 1.455 3.25 3.25 3.25s3.25-1.455 3.25-3.25v-1.669z"/>
                            <path fill="currentColor" d="M12 7.5c-3.038 0-5.5 2.462-5.5 5.5v2.25H5.25c-.69 0-1.25.56-1.25 1.25v3c0 .69.56 1.25 1.25 1.25h13.5c.69 0 1.25-.56 1.25-1.25v-3c0-.69-.56-1.25-1.25-1.25H17.5v-2.25c0-3.038-2.462-5.5-5.5-5.5zm-3.5 5.5c0-1.933 1.567-3.5 3.5-3.5s3.5 1.567 3.5 3.5v2.25H8.5v-2.25z"/>
                        </svg>
                    `;
                }, 2000);
            } finally {
                isTranscribing = false;
                transcribeBtn.classList.remove('transcribing');
            }
        });
        
        // Update duration when metadata is loaded
        audio.addEventListener('loadedmetadata', () => {
            const minutes = Math.floor(audio.duration / 60);
            const seconds = Math.floor(audio.duration % 60);
            durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        });
        
        // Also try to update duration when audio can play through
        audio.addEventListener('canplaythrough', () => {
            if (audio.duration && !isNaN(audio.duration)) {
                const minutes = Math.floor(audio.duration / 60);
                const seconds = Math.floor(audio.duration % 60);
                durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
        
        // Set duration to 'Loading...' initially
        durationDisplay.textContent = '...';
        
        // Try to set duration immediately if audio is already loaded
        if (audio.readyState >= 1 && audio.duration) {
            const minutes = Math.floor(audio.duration / 60);
            const seconds = Math.floor(audio.duration % 60);
            durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Update play button when audio ends
        audio.addEventListener('ended', () => {
            playBtn.innerHTML = '▶';
            isPlaying = false;
        });
        
        // Store the audio element in a global array to prevent garbage collection
        if (!window.voiceMessageElements) {
            window.voiceMessageElements = [];
        }
        // Store references to the elements for later restoration
        window.voiceMessageElements.push({ audio, playBtn, speedBtn, durationDisplay, transcribeBtn });

        // Add elements to containers
        controlsContainer.appendChild(playBtn);
        controlsContainer.appendChild(speedBtn);
        controlsContainer.appendChild(transcribeBtn);
        controlsContainer.appendChild(durationDisplay);
        
        voiceContainer.appendChild(waveformContainer);
        voiceContainer.appendChild(audio);
        voiceContainer.appendChild(controlsContainer);
        
        content.appendChild(voiceContainer);
    } 
    // If the message contains a file (but not a voice message), add it to the message
    else if (message.file) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-attachment';

        // Determine file type and show appropriate preview/icon
        const fileExtension = message.file.filename.split('.').pop().toLowerCase();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi'];
        const audioExtensions = ['mp3', 'wav', 'ogg', 'flac'];
        // Определяем, является ли файл текстовым по MIME-типу или расширению
        function isTextFile(file) {
            // Проверяем по MIME-типу
            if (file.type) {
                // Любой MIME-тип, начинающийся с "text/" - текстовый файл
                if (file.type.startsWith('text/')) {
                    return true;
                }
                // Некоторые двоичные файлы могут иметь расширение, но не MIME-тип
                // Поэтому проверяем и популярные текстовые MIME-типы
                const textMimeTypes = [
                    'application/json', 'application/javascript', 'application/xml',
                    'application/x-sh', 'application/x-shellscript', 'application/octet-stream',
                    'application/x-msdownload', 'application/x-executable', 'application/x-makesys',
                    'application/x-msdownload', 'binary/octet-stream'
                ];
                if (textMimeTypes.includes(file.type)) {
                    // Для некоторых типов, которые могут быть текстовыми, дополнительно проверяем расширение
                    const fileExtension = file.filename.split('.').pop().toLowerCase();
                    const textExtensions = ['sh', 'log', 'js', 'json', 'xml', 'csv', 'md', 'html', 'css', 'sql', 'py', 'java', 'cpp', 'c', 'h', 'hpp', 'ts', 'tsx', 'jsx', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'bat', 'ps1', 'bash', 'zsh', 'pl', 'rb', 'php', 'asp', 'aspx', 'sql', 'sqlitedb', 'env', 'toml', 'lock'];
                    return textExtensions.includes(fileExtension);
                }
            }

            // Проверяем по расширению
            const textExtensions = ['txt', 'pdf', 'doc', 'docx', 'sh', 'log', 'js', 'py', 'html', 'css', 'json', 'xml', 'csv', 'md', 'sql', 'java', 'cpp', 'c', 'h', 'hpp', 'ts', 'tsx', 'jsx', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'bat', 'ps1', 'bash', 'zsh', 'pl', 'rb', 'php', 'asp', 'aspx', 'sql', 'sqlitedb', 'env', 'toml', 'lock'];
            const fileExtension = file.filename.split('.').pop().toLowerCase();
            return textExtensions.includes(fileExtension);
        }

        if (imageExtensions.includes(fileExtension)) {
            // Image preview
            const img = document.createElement('img');
            img.src = message.file.url;
            img.alt = message.file.filename;
            img.className = 'file-preview-image';
            img.style.maxWidth = '300px';
            img.style.maxHeight = '300px';
            img.style.borderRadius = '8px';
            img.style.marginTop = '10px';

            // Add click handler to open image in new tab
            img.addEventListener('click', () => {
                window.open(message.file.url, '_blank');
            });

            fileDiv.appendChild(img);
        } else if (videoExtensions.includes(fileExtension)) {
            // Video preview
            const video = document.createElement('video');
            video.src = message.file.url;
            video.controls = true;
            video.className = 'file-preview-video';
            video.style.maxWidth = '300px';
            video.style.maxHeight = '300px';
            video.style.borderRadius = '8px';
            video.style.marginTop = '10px';

            fileDiv.appendChild(video);
        } else if (audioExtensions.includes(fileExtension)) {
            // Audio preview (non-voice messages)
            const audio = document.createElement('audio');
            audio.src = message.file.url;
            audio.controls = true;
            audio.className = 'file-preview-audio';
            audio.style.width = '100%';
            audio.style.marginTop = '10px';

            fileDiv.appendChild(audio);
        } else if (isTextFile(message.file)) {
            // For text-based files, create a preview with a snippet
            const filePreview = document.createElement('div');
            filePreview.className = 'file-preview-text';
            filePreview.style.marginTop = '10px';
            filePreview.style.padding = '10px';
            filePreview.style.backgroundColor = 'var(--glass)';
            filePreview.style.borderRadius = '4px';
            filePreview.style.maxWidth = '300px';

            // Create file info header
            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            fileInfo.style.fontWeight = 'bold';
            fileInfo.style.marginBottom = '5px';
            fileInfo.textContent = `📄 ${message.file.filename}`;

            // Create a preview of the file content (first 100 characters)
            const fileContentPreview = document.createElement('div');
            fileContentPreview.className = 'file-content-preview';
            fileContentPreview.style.fontSize = '14px';
            fileContentPreview.style.whiteSpace = 'pre-wrap';
            fileContentPreview.style.overflow = 'hidden';
            fileContentPreview.style.textOverflow = 'ellipsis';
            fileContentPreview.style.maxHeight = '60px';

            // Create a link to download/view the full file
            const fileLink = document.createElement('a');
            fileLink.href = message.file.url;
            fileLink.textContent = 'Download/View Full File';
            fileLink.target = '_blank';
            fileLink.rel = 'noopener noreferrer';
            fileLink.style.display = 'inline-block';
            fileLink.style.marginTop = '5px';
            fileLink.style.color = 'var(--accent)';
            fileLink.style.textDecoration = 'none';

            // Add click handler to open file in new tab
            fileLink.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering parent click handlers
            });

            // Add elements to the preview container
            filePreview.appendChild(fileInfo);
            filePreview.appendChild(fileContentPreview);
            filePreview.appendChild(fileLink);

            // Attempt to fetch a small portion of the text file for preview
            fetch(`${message.file.url}?t=${Date.now()}`, {
                cache: 'no-cache'
            })
                .then(response => response.text())
                .then(fileText => {
                    // Take first 100 characters and add ellipsis if needed
                    const previewText = fileText.length > 100 ?
                        fileText.substring(0, 100) + '...' :
                        fileText;
                    fileContentPreview.textContent = previewText;
                })
                .catch(error => {
                    console.error('Could not load file preview:', error);
                    fileContentPreview.textContent = '[Unable to load preview]';
                });

            fileDiv.appendChild(filePreview);
        } else {
            // Generic file link
            const fileLink = document.createElement('a');
            fileLink.href = message.file.url;
            fileLink.textContent = `📄 ${message.file.filename}`;
            fileLink.target = '_blank';
            fileLink.rel = 'noopener noreferrer';
            fileLink.className = 'file-link';
            fileLink.style.display = 'block';
            fileLink.style.padding = '8px';
            fileLink.style.backgroundColor = 'var(--glass)';
            fileLink.style.borderRadius = '4px';
            fileLink.style.marginTop = '8px';
            fileLink.style.textDecoration = 'none';
            fileLink.style.color = 'var(--accent)';

            fileDiv.appendChild(fileLink);
        }

        content.appendChild(fileDiv);
    }

    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'message-reactions';

    // Add existing reactions to the message
    if (message.reactions && message.reactions.length > 0) {
        message.reactions.forEach(reaction => {
            const reactionEl = document.createElement('div');
            reactionEl.className = 'reaction';
            reactionEl.innerHTML = `${reaction.emoji} <span>${reaction.count}</span>`;
            reactionEl.title = reaction.users;

            // Для Self Chat обработка реакций будет отличаться
            if (currentDMUserId === currentUser.id) {
                // В Self Chat просто удаляем реакцию при клике
                reactionEl.addEventListener('click', () => {
                    removeSelfChatReaction(message.id, reaction.emoji);
                });
            } else {
                // Для обычных DM отправляем через сокет
                reactionEl.addEventListener('click', () => {
                    if (socket && socket.connected) {
                        socket.emit('remove-reaction', { messageId: message.id, emoji: reaction.emoji });
                    }
                });
            }
            reactionsContainer.appendChild(reactionEl);
        });
    }

    const addReactionBtn = document.createElement('button');
    addReactionBtn.className = 'add-reaction-btn';
    addReactionBtn.textContent = '😊';
    addReactionBtn.title = 'Add reaction';
    addReactionBtn.onclick = () => showEmojiPickerForMessage(message.id || Date.now());

    header.appendChild(author);
    header.appendChild(timestamp);
    content.appendChild(header);
    content.appendChild(text);

    // Create a container for reactions
    const reactionsAndActionsContainer = document.createElement('div');
    reactionsAndActionsContainer.className = 'reactions-and-actions-container';
    reactionsAndActionsContainer.appendChild(reactionsContainer);

    // Add reply button
    const replyBtn = document.createElement('button');
    replyBtn.className = 'reply-btn';
    replyBtn.textContent = '↪';  // Right arrow for reply
    replyBtn.title = 'Reply to message';
    replyBtn.onclick = () => replyToMessage(message);

    // Create a container for action buttons to position them properly
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'message-actions';

    // Add edit and delete buttons for user's own messages
    if (isUserMessage) {
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✏️';  // Pencil emoji for edit
        editBtn.title = 'Edit message';
        editBtn.onclick = () => editMessage(message);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '🗑️';  // Trash emoji for delete
        deleteBtn.title = 'Delete message';
        deleteBtn.onclick = () => deleteMessage(message.id);

        actionsContainer.appendChild(editBtn);
        actionsContainer.appendChild(deleteBtn);
    }

    actionsContainer.appendChild(replyBtn);
    actionsContainer.appendChild(addReactionBtn);
    reactionsAndActionsContainer.appendChild(actionsContainer);
    content.appendChild(reactionsAndActionsContainer);

    messageGroup.appendChild(avatar);
    messageGroup.appendChild(content);

    messagesContainer.appendChild(messageGroup);

    if (typeof twemoji !== 'undefined') {
        twemoji.parse(messageGroup);
    }

    // Highlight code blocks with Prism.js
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageGroup);
    }

    // Add link previews for URLs in the message
    const messageId = message.id || Date.now();
    addLinkPreviews(messageId, message.text, text);

    // Restore voice message handlers after adding the message
    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 0);
}

function formatTimestamp(date) {
    const messageDate = new Date(date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
    
    const hours = messageDate.getHours().toString().padStart(2, '0');
    const minutes = messageDate.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;
    
    // Check if the message is from today
    if (messageDay.getTime() === today.getTime()) {
        return `${window.i18n.t('time.todayAt')} ${timeString}`;
    } 
    // Check if the message is from yesterday
    else if (messageDay.getTime() === yesterday.getTime()) {
        return `${window.i18n.t('time.yesterdayAt')} ${timeString}`;
    } 
    // For other dates, format as DD/MM/YYYY at HH:MM
    else {
        const day = messageDate.getDate().toString().padStart(2, '0');
        const month = (messageDate.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const year = messageDate.getFullYear();
        const dateString = `${day}/${month}/${year}`;
        
        // Using template replacement for the date format
        let dateFormat = window.i18n.t('time.dateFormat');
        return dateFormat.replace('{date}', dateString).replace('{time}', timeString);
    }
}


// Function to reply to a message - использует новую систему ответов из reply-system.js
function replyToMessage(message) {
    // Новая система ответов: показываем превью над полем ввода вместо цитат
    if (typeof window._replyToMessageInternal === 'function') {
        window._replyToMessageInternal(message);
    } else {
        // Fallback: просто фокус на input
        console.warn('Reply system not loaded, using fallback');
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
        }
    }
}

// Function to edit a message
function editMessage(message) {
    const messageInput = document.getElementById('messageInput');

    if (!messageInput) {
        console.error('Message input element not found');
        return;
    }

    // Берем текст из DOM элемента, а не из объекта message
    // Это важно для повторно редактируемых сообщений
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    const textElement = messageElement?.querySelector('.message-text');
    
    // Клонируем элемент чтобы удалить индикатор редактирования
    let currentText = message.text;
    if (textElement) {
        const clone = textElement.cloneNode(true);
        // Удаляем индикатор редактирования из клона
        const editedIndicator = clone.querySelector('.edited-indicator');
        if (editedIndicator) {
            editedIndicator.remove();
        }
        currentText = clone.textContent;
    }

    // Put the current message text in the input field
    messageInput.value = currentText;

    // Focus the input and move cursor to the end
    messageInput.focus();
    messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);

    // Adjust textarea height
    adjustTextareaHeight(messageInput);

    // Store the ID of the message being edited
    editingMessageId = message.id;

    // Change send button function temporarily (keep the same icon/text)
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        // Store the original function to restore later
        sendBtn._originalOnClick = sendBtn.onclick;
        sendBtn.onclick = () => updateMessage(message.id, messageInput.value);
    }
}

// Function to update a message
function updateMessage(messageId, newText) {
    if (newText.trim() === '') return;

    // If it's a self chat, update locally
    if (currentDMUserId === currentUser.id) {
        updateSelfChatMessageContent(messageId, newText);
    } else if (currentDMUserId) {
        // For regular DMs, send update via socket
        if (socket && socket.connected) {
            socket.emit('update-dm', {
                messageId: messageId,
                newText: newText,
                receiverId: currentDMUserId
            });
        }
    }

    // Reset the send button
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.onclick = sendBtn._originalOnClick || (() => sendMessage());
    }

    // Clear the input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.value = '';
        messageInput.style.height = 'auto';
        adjustTextareaHeight(messageInput);
    }
    
    // Reset the editing message ID
    editingMessageId = null;
}

// Function to delete a message
function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) return;

    // Delete from UI immediately
    deleteMessageFromUI(messageId);

    // If it's a self chat, delete locally
    if (currentDMUserId === currentUser.id) {
        deleteSelfChatMessage(messageId);
    } else if (currentDMUserId) {
        // For regular DMs, send delete via socket
        if (socket && socket.connected) {
            socket.emit('delete-dm', {
                messageId: messageId,
                receiverId: currentDMUserId
            });
        }
    }
}

// Function to update a message in the UI
function updateMessageInUI(updatedMessage) {
    const messageElement = document.querySelector(`[data-message-id="${updatedMessage.id}"]`);
    if (messageElement) {
        // Find the message text element and update its content
        const messageTextElement = messageElement.querySelector('.message-text');
        if (messageTextElement) {
            // Preserve the original structure but update the text
            let newTextContent = formatQuotedText(updatedMessage.text);
            
            // Add edited indicator if message was edited
            if (updatedMessage.edited) {
                newTextContent += ' <span class="edited-indicator">' + (window.i18n ? window.i18n.t('message.edited') : '(edited)') + '</span>';
            }
            
            messageTextElement.innerHTML = newTextContent;

            // Re-parse emojis if twemoji is available
            if (typeof twemoji !== 'undefined') {
                twemoji.parse(messageTextElement);
            }

            // Re-highlight code blocks with Prism.js
            if (typeof Prism !== 'undefined') {
                Prism.highlightAllUnder(messageTextElement);
            }
        }
    }
    
    // Restore voice message handlers after updating message
    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 50);
}

// Function to delete a message from the UI
function deleteMessageFromUI(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
    
    // Restore voice message handlers after deleting message
    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 50);
}

// Function to handle reply to selected text - перенесено в reply-system.js
// setupReplyToSelection теперь определяется в reply-system.js

// Function to parse and format messages with Markdown support
function formatQuotedText(text) {
    // Сначала обрабатываем многозначные HTML блоки (div, p, etc.)
    // Заменяем их на плейсхолдеры, чтобы сохранить структуру
    let htmlBlocks = [];
    let blockIndex = 0;
    
    // Извлекаем многозначные HTML блоки и сжимаем их в одну строку
    text = text.replace(/<(div|p|section|article|header|footer|main|aside|nav)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi, (match) => {
        const index = blockIndex++;
        // Сжимаем HTML блок в одну строку (заменяем переносы на пробелы)
        const compressedBlock = match.replace(/\n\s*/g, ' ');
        htmlBlocks[index] = compressedBlock;
        return `%%HTMLBLOCK${index}%%`;
    });
    
    const lines = text.split('\n');
    let formattedLines = [];
    let inList = false;
    let listType = null;
    let inCodeBlock = false;
    let codeBlockContent = [];
    let codeBlockLanguage = '';
    let inDetails = false;
    let detailsContent = [];
    let inDetailsCodeBlock = false;
    let detailsCodeBlockContent = [];
    let detailsCodeBlockLanguage = '';
    let inDetailsList = false;
    let detailsListType = null;

    const closeList = () => {
        if (inList) {
            formattedLines.push(`</${listType}>`);
            inList = false;
            listType = null;
        }
    };

    const closeCodeBlock = () => {
        if (inCodeBlock) {
            const code = codeBlockContent.join('\n');
            formattedLines.push(`<pre class="md-code-block"><code class="md-code-block-content language-${codeBlockLanguage}">${escapeHtml(code)}</code></pre>`);
            inCodeBlock = false;
            codeBlockContent = [];
            codeBlockLanguage = '';
        }
    };

    const closeDetailsCodeBlock = () => {
        if (inDetailsCodeBlock) {
            const code = detailsCodeBlockContent.join('\n');
            detailsContent.push(`<pre class="md-code-block"><code class="md-code-block-content language-${detailsCodeBlockLanguage}">${escapeHtml(code)}</code></pre>`);
            inDetailsCodeBlock = false;
            detailsCodeBlockContent = [];
            detailsCodeBlockLanguage = '';
        }
    };

    const closeDetailsList = () => {
        if (inDetailsList) {
            detailsContent.push(`</${detailsListType}>`);
            inDetailsList = false;
            detailsListType = null;
        }
    };

    const closeDetails = () => {
        closeDetailsCodeBlock();
        closeDetailsList();
        if (inDetails) {
            let content = detailsContent.join('\n');
            // Восстанавливаем HTML блоки внутри details
            for (let i = 0; i < htmlBlocks.length; i++) {
                const placeholder = `%%HTMLBLOCK${i}%%`;
                const block = htmlBlocks[i];
                const processedBlock = allowHtml(block);
                content = content.replace(placeholder, processedBlock);
            }
            // Check if summary is already present
            const hasSummary = content.includes('<summary>');
            if (hasSummary) {
                formattedLines.push(`<details>${content}</details>`);
            } else {
                formattedLines.push(`<details><summary>Details</summary>${content}</details>`);
            }
            inDetails = false;
            detailsContent = [];
        }
    };

    // Security: Block event handlers (onerror, onclick, onload, etc.)
    const blockEventHandlers = (html) => {
        return html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
                   .replace(/\s*on\w+\s*=\s*[^\s>]+/gi, '');
    };

    // Security: Sanitize style attribute to block dangerous CSS
    const sanitizeStyle = (style) => {
        if (!style) return '';
        // Block javascript:, expression(), url() with javascript/data
        if (style.toLowerCase().includes('javascript:') ||
            style.toLowerCase().includes('expression(') ||
            style.toLowerCase().includes('url(javascript:') ||
            style.toLowerCase().includes('url(data:')) {
            return '';
        }
        // Only allow safe CSS properties
        const safeStyles = [];
        const props = style.split(';');
        const allowedProps = ['text-align', 'color', 'background', 'background-color', 'font-size', 'font-weight', 'font-style', 'margin', 'padding', 'border', 'width', 'height', 'display', 'text-decoration'];
        for (const prop of props) {
            const [name, value] = prop.split(':').map(s => s.trim());
            if (name && value && allowedProps.includes(name.toLowerCase())) {
                safeStyles.push(`${name}:${value}`);
            }
        }
        return safeStyles.join(';');
    };

    // Helper function to sanitize and allow specific HTML tags
    const allowHtml = (line) => {
        let result = line;

        // Allow <img> tags with strict sanitization
        result = result.replace(/<img\s+([^>]*?)\s*\/?>/gi, (match) => {
            // Block event handlers first
            match = blockEventHandlers(match);

            const allowedAttrs = ['src', 'alt', 'width', 'height', 'class', 'align'];
            let newAttrs = [];

            for (const attr of allowedAttrs) {
                const attrMatch = match.match(new RegExp(`${attr}=["']([^"']*)["']`, 'i'));
                if (attrMatch) {
                    let value = attrMatch[1];
                    // Block javascript: and data: URLs in src
                    if (attr === 'src') {
                        if (value.toLowerCase().startsWith('javascript:') ||
                            value.toLowerCase().startsWith('data:')) {
                            continue;
                        }
                        if (!value.startsWith('http://') &&
                            !value.startsWith('https://') &&
                            !value.startsWith('/') &&
                            !value.startsWith('./')) {
                            continue;
                        }
                    }
                    newAttrs.push(`${attr}="${value}"`);
                }
            }

            if (newAttrs.length === 0) return '';
            return `<img ${newAttrs.join(' ')}>`;
        });

        // Allow <a> tags with strict sanitization
        result = result.replace(/<a\s+([^>]*?)>(.*?)<\/a>/gi, (match, text) => {
            match = blockEventHandlers(match);

            const hrefMatch = match.match(/href=["']([^"']*)["']/i);
            if (!hrefMatch) return text;
            let href = hrefMatch[1];

            const lowerHref = href.toLowerCase().trim();
            if (lowerHref.startsWith('javascript:') ||
                lowerHref.startsWith('data:') ||
                lowerHref.startsWith('vbscript:')) {
                return text;
            }

            if (!href.startsWith('http://') &&
                !href.startsWith('https://') &&
                !href.startsWith('/') &&
                !href.startsWith('./') &&
                !href.startsWith('#')) {
                return text;
            }

            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        });

        // Allow <br> tags (do this early, before other processing)
        result = result.replace(/<br\s*\/?>/gi, '<br>');

        // Allow <p> tags with sanitized style - process content inside for <br>
        result = result.replace(/<p(?:\s+[^>]*?)?>(.*?)<\/p>/gi, (match, content) => {
            const styleMatch = match.match(/style=["']([^"']*)["']/i);
            const classMatch = match.match(/class=["']([^"']*)["']/i);
            let attrs = '';
            if (styleMatch) {
                const sanitizedStyle = sanitizeStyle(styleMatch[1]);
                if (sanitizedStyle) attrs += ` style="${sanitizedStyle}"`;
            }
            if (classMatch) attrs += ` class="${classMatch[1]}"`;
            // Process <br> inside content
            const processedContent = content.replace(/<br\s*\/?>/gi, '<br>');
            return `<p${attrs}>${processedContent}</p>`;
        });

        // Allow <div> tags with sanitized style
        result = result.replace(/<div(?:\s+[^>]*?)?>/gi, (match) => {
            const styleMatch = match.match(/style=["']([^"']*)["']/i);
            const classMatch = match.match(/class=["']([^"']*)["']/i);
            const alignMatch = match.match(/align=["']([^"']*)["']/i);
            let attrs = '';
            if (styleMatch) {
                const sanitizedStyle = sanitizeStyle(styleMatch[1]);
                if (sanitizedStyle) attrs += ` style="${sanitizedStyle}"`;
            }
            if (classMatch) attrs += ` class="${classMatch[1]}"`;
            if (alignMatch && ['center', 'left', 'right'].includes(alignMatch[1].toLowerCase())) {
                attrs += ` align="${alignMatch[1]}"`;
            }
            return `<div${attrs}>`;
        });
        result = result.replace(/<\/div>/gi, '</div>');

        // Allow <b>, <strong>, <i>, <em>, <u>, <s>, <del>
        result = result.replace(/<(b|strong|i|em|u|s|del)(?:\s+[^>]*?)?>/gi, '<$1>');
        result = result.replace(/<\/(b|strong|i|em|u|s|del)>/gi, '</$1>');

        // Allow <ul>, <ol>, <li>
        result = result.replace(/<(ul|ol|li)(?:\s+[^>]*?)?>/gi, '<$1>');
        result = result.replace(/<\/(ul|ol|li)>/gi, '</$1>');

        // Allow <h1> to <h6>
        result = result.replace(/<(h[1-6])(?:\s+[^>]*?)?>/gi, '<$1>');
        result = result.replace(/<\/(h[1-6])>/gi, '</$1>');

        // Allow <code> and <pre>
        result = result.replace(/<(code|pre)(?:\s+[^>]*?)?>/gi, '<$1>');
        result = result.replace(/<\/(code|pre)>/gi, '</$1>');

        // Allow <span> with sanitized style
        result = result.replace(/<span(?:\s+[^>]*?)?>/gi, (match) => {
            const styleMatch = match.match(/style=["']([^"']*)["']/i);
            const classMatch = match.match(/class=["']([^"']*)["']/i);
            let attrs = '';
            if (styleMatch) {
                const sanitizedStyle = sanitizeStyle(styleMatch[1]);
                if (sanitizedStyle) attrs += ` style="${sanitizedStyle}"`;
            }
            if (classMatch) attrs += ` class="${classMatch[1]}"`;
            return `<span${attrs}>`;
        });
        result = result.replace(/<\/span>/gi, '</span>');

        // Final pass: remove any remaining event handlers
        result = blockEventHandlers(result);

        return result;
    };

    const formatInline = (line) => {
        let result = escapeHtml(line);

        // Images ![alt](url)
        result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-image">');

        // Code blocks (inline) `code`
        result = result.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

        // Bold **text** or __text__
        result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

        // Italic *text* or _text_
        result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        result = result.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');

        // Strikethrough ~~text~~
        result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // Links [text](url)
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Plain URLs (https://... or http://...)
        result = result.replace(/(?<!href="|href='|">|'>)(https?:\/\/[^\s<]+[^\s<.,;:!?])/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

        return result;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Check for code block start/end ```
        if (trimmedLine.startsWith('```')) {
            if (inDetails) {
                // Code block inside details
                if (!inDetailsCodeBlock) {
                    inDetailsCodeBlock = true;
                    const langMatch = trimmedLine.match(/^```(\w+)?/);
                    detailsCodeBlockLanguage = langMatch && langMatch[1] ? langMatch[1] : 'plaintext';
                } else {
                    closeDetailsCodeBlock();
                }
            } else {
                // Code block outside details
                if (!inCodeBlock) {
                    closeList();
                    inCodeBlock = true;
                    const langMatch = trimmedLine.match(/^```(\w+)?/);
                    codeBlockLanguage = langMatch && langMatch[1] ? langMatch[1] : 'plaintext';
                } else {
                    closeCodeBlock();
                }
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        if (inDetailsCodeBlock) {
            detailsCodeBlockContent.push(line);
            continue;
        }

        // Check for <details> start
        if (trimmedLine.startsWith('<details>')) {
            closeList();
            inDetails = true;
            // Check if summary is on the same line <details><summary>text</summary>
            const summaryMatch = trimmedLine.match(/<details><summary>(.*?)<\/summary>(.*)?$/i);
            if (summaryMatch) {
                detailsContent.push(`<summary>${allowHtml(summaryMatch[1])}</summary>`);
                // If there's content after summary on the same line
                if (summaryMatch[2] && summaryMatch[2].trim()) {
                    const remainingContent = summaryMatch[2].trim();
                    const hasHtmlTags = /<[a-z][a-z0-9]*(?:\s+[^>]*)?>/i.test(remainingContent);
                    detailsContent.push(hasHtmlTags ? allowHtml(remainingContent) : formatInline(remainingContent));
                }
            }
            continue;
        }

        // Check for </details> end (can be at the end of any line)
        if (trimmedLine.includes('</details>')) {
            // Close code block and list inside details if open
            closeDetailsCodeBlock();
            closeDetailsList();
            // Get content before </details>
            const contentBefore = trimmedLine.split('</details>')[0].trim();
            if (contentBefore) {
                const hasHtmlTags = /<[a-z][a-z0-9]*(?:\s+[^>]*)?>/i.test(contentBefore);
                detailsContent.push(hasHtmlTags ? allowHtml(contentBefore) : formatInline(contentBefore));
            }
            closeDetails();
            continue;
        }

        // If inside details, collect content
        if (inDetails) {
            // Check for HTML block placeholder
            if (trimmedLine.startsWith('%%HTMLBLOCK') && trimmedLine.endsWith('%%')) {
                detailsContent.push(trimmedLine);
                continue;
            }
            
            // Check for standalone <summary>line</summary>
            if (trimmedLine.match(/^<summary>.*<\/summary>$/i)) {
                const summaryMatch = trimmedLine.match(/<summary>(.*?)<\/summary>/i);
                if (summaryMatch) {
                    detailsContent.push(`<summary>${allowHtml(summaryMatch[1])}</summary>`);
                }
            } else {
                // Process markdown inside details
                let processedLine = trimmedLine;
                const hasHtmlTags = /<[a-z][a-z0-9]*(?:\s+[^>]*)?>/i.test(line) ||
                                   /<\/[a-z][a-z0-9]*>/i.test(line);
                
                // Check for headers inside details
                if (trimmedLine.startsWith('### ')) {
                    closeDetailsList();
                    processedLine = `<h3>${formatInline(trimmedLine.substring(4))}</h3>`;
                } else if (trimmedLine.startsWith('## ')) {
                    closeDetailsList();
                    processedLine = `<h2>${formatInline(trimmedLine.substring(3))}</h2>`;
                } else if (trimmedLine.startsWith('# ')) {
                    closeDetailsList();
                    processedLine = `<h1>${formatInline(trimmedLine.substring(2))}</h1>`;
                }
                // Check for unordered list inside details
                else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
                    if (!inDetailsList || detailsListType !== 'ul') {
                        closeDetailsList();
                        inDetailsList = true;
                        detailsListType = 'ul';
                        detailsContent.push('<ul>');
                    }
                    const listContent = trimmedLine.substring(2);
                    processedLine = `<li>${formatInline(listContent)}</li>`;
                }
                // Check for ordered list inside details
                else if (/^\d+\.\s/.test(trimmedLine)) {
                    if (!inDetailsList || detailsListType !== 'ol') {
                        closeDetailsList();
                        inDetailsList = true;
                        detailsListType = 'ol';
                        detailsContent.push('<ol>');
                    }
                    const listContent = trimmedLine.replace(/^\d+\.\s/, '');
                    processedLine = `<li>${formatInline(listContent)}</li>`;
                }
                // Empty line or other block element - close list
                else if (trimmedLine === '' || trimmedLine.startsWith('<')) {
                    closeDetailsList();
                    if (trimmedLine) {
                        processedLine = hasHtmlTags ? allowHtml(trimmedLine) : formatInline(trimmedLine);
                    }
                }
                // Regular line inside details
                else {
                    closeDetailsList();
                    processedLine = hasHtmlTags ? allowHtml(trimmedLine) : formatInline(trimmedLine);
                }
                
                if (processedLine) {
                    detailsContent.push(processedLine);
                }
            }
            continue;
        }

        // Empty line
        if (trimmedLine === '') {
            closeList();
            formattedLines.push('<br>');
            continue;
        }

        // Check for HTML block placeholder
        if (trimmedLine.startsWith('%%HTMLBLOCK') && trimmedLine.endsWith('%%')) {
            closeList();
            formattedLines.push(trimmedLine);
            continue;
        }

        // Check if line contains HTML tags - more permissive to catch all tags including <br>
        const hasHtmlTags = /<[a-z][a-z0-9]*(?:\s+[^>]*)?\/?>/i.test(line) ||
                           /<\/[a-z][a-z0-9]*>/i.test(line) ||
                           /<br\s*\/?>/i.test(line);

        // Quoted lines - УБРАНО: старая система цитат больше не используется
        // Теперь ответы обрабатываются через отдельный блок replyTo, а не через цитаты в тексте
        // if (line.startsWith('> ')) { ... }

        // Headers
        const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
            closeList();
            // Add horizontal rule before header (except if it's the first element)
            if (formattedLines.length > 0) {
                formattedLines.push('<hr class="md-hr">');
            }
            const level = headerMatch[1].length;
            const headerText = formatInline(headerMatch[2]);
            formattedLines.push(`<h${level} class="md-header md-h${level}">${headerText}</h${level}>`);
            continue;
        }

        // Unordered lists
        const ulMatch = trimmedLine.match(/^[\*\-\+]\s+(.+)$/);
        if (ulMatch) {
            if (!inList || listType !== 'ul') {
                closeList();
                formattedLines.push('<ul class="md-list md-ul">');
                inList = true;
                listType = 'ul';
            }
            formattedLines.push(`<li class="md-list-item">${formatInline(ulMatch[1])}</li>`);
            continue;
        }

        // Ordered lists
        const olMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
        if (olMatch) {
            if (!inList || listType !== 'ol') {
                closeList();
                formattedLines.push('<ol class="md-list md-ol">');
                inList = true;
                listType = 'ol';
            }
            formattedLines.push(`<li class="md-list-item">${formatInline(olMatch[2])}</li>`);
            continue;
        }

        // Horizontal rule
        if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
            closeList();
            formattedLines.push('<hr class="md-hr">');
            continue;
        }

        // Regular text line
        closeList();
        formattedLines.push(`<div class="md-paragraph">${hasHtmlTags ? allowHtml(trimmedLine) : formatInline(trimmedLine)}</div>`);
    }

    closeList();
    closeCodeBlock();
    closeDetails();

    let result = formattedLines.join('');

    // Восстанавливаем HTML блоки, удаляя обёртку md-paragraph если она есть
    for (let i = 0; i < htmlBlocks.length; i++) {
        const placeholder = `%%HTMLBLOCK${i}%%`;
        const block = htmlBlocks[i];
        // Для HTML блоков используем прямую вставку с минимальной санитизацией
        // Убираем только опасные атрибуты
        let sanitizedBlock = block
            .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s*on\w+\s*=\s*[^\s>]+/gi, '');
        // Сначала заменяем <br> на <hr> везде
        sanitizedBlock = sanitizedBlock.replace(/<br\s*\/?>/gi, '<hr class="md-hr">');
        // Затем восстанавливаем <br> внутри <p> тегов
        sanitizedBlock = sanitizedBlock.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, content) => {
            const restoredContent = content.replace(/<hr class="md-hr">/gi, '<br>');
            return `<p${attrs}>${restoredContent}</p>`;
        });
        // Удаляем обёртку <div class="md-paragraph"> если она есть
        result = result.replace(`<div class="md-paragraph">${placeholder}</div>`, sanitizedBlock);
        result = result.replace(placeholder, sanitizedBlock);
    }

    return result;
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Link Preview functions
function extractUrls(text) {
    const urlRegex = /https?:\/\/[^\s<]+[^\s<.,;:!?]/gi;
    const matches = text.match(urlRegex);
    if (!matches) return [];

    // Remove duplicates and filter out URLs from markdown links and images
    const uniqueUrls = [...new Set(matches)];
    return uniqueUrls.filter(url => {
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Filter out URLs that are already in markdown link format [text](url)
        const markdownLinkPattern = new RegExp(`\\[[^\\]]+\\]\\(${escapedUrl}\\)`, 'i');
        // Filter out URLs that are in markdown image format ![alt](url)
        const markdownImagePattern = new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, 'i');
        return !markdownLinkPattern.test(text) && !markdownImagePattern.test(text);
    });
}

async function fetchLinkPreview(url) {
    try {
        const response = await fetch(`${getApiUrl()}/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch preview');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching link preview:', error);
        return null;
    }
}

function createLinkPreviewCard(metadata, messageId, url) {
    const container = document.createElement('div');
    container.className = 'link-preview-container';
    container.setAttribute('data-preview-url', url);
    
    const hideBtn = document.createElement('button');
    hideBtn.className = 'link-preview-hide';
    hideBtn.textContent = '✕';
    hideBtn.title = 'Hide preview';
    hideBtn.onclick = () => hideLinkPreview(messageId, url);
    
    const previewDiv = document.createElement('div');
    previewDiv.className = 'link-preview';
    
    if (metadata.image) {
        previewDiv.classList.add('has-image');
        previewDiv.innerHTML = `
            <img class="link-preview-image" src="${escapeHtml(metadata.image)}" alt="" onerror="this.style.display='none'">
            <div class="link-preview-content">
                ${metadata.siteName || metadata.favicon ? `
                    <div class="link-preview-site">
                        ${metadata.favicon ? `<img class="link-preview-favicon" src="${escapeHtml(metadata.favicon)}" alt="" onerror="this.style.display='none'">` : ''}
                        ${metadata.siteName ? `<span>${escapeHtml(metadata.siteName)}</span>` : ''}
                    </div>
                ` : ''}
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="link-preview-title">
                    ${escapeHtml(metadata.title) || escapeHtml(url)}
                </a>
                ${metadata.description ? `<p class="link-preview-description">${escapeHtml(metadata.description)}</p>` : ''}
            </div>
        `;
    } else {
        previewDiv.innerHTML = `
            <div class="link-preview-no-image">🔗</div>
            <div class="link-preview-content">
                ${metadata.siteName || metadata.favicon ? `
                    <div class="link-preview-site">
                        ${metadata.favicon ? `<img class="link-preview-favicon" src="${escapeHtml(metadata.favicon)}" alt="" onerror="this.style.display='none'">` : ''}
                        ${metadata.siteName ? `<span>${escapeHtml(metadata.siteName)}</span>` : ''}
                    </div>
                ` : ''}
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="link-preview-title">
                    ${escapeHtml(metadata.title) || escapeHtml(url)}
                </a>
                ${metadata.description ? `<p class="link-preview-description">${escapeHtml(metadata.description)}</p>` : ''}
            </div>
        `;
    }
    
    container.appendChild(hideBtn);
    container.appendChild(previewDiv);
    
    return container;
}

function createLinkPreviewLoading() {
    const container = document.createElement('div');
    container.className = 'link-preview-loading';
    container.innerHTML = `
        <div class="link-preview-loading-spinner"></div>
        <span>Loading preview...</span>
    `;
    return container;
}

function hideLinkPreview(messageId, url) {
    const previewKey = `${messageId}-${url}`;
    hiddenPreviews.add(previewKey);
    localStorage.setItem('hiddenPreviews', JSON.stringify([...hiddenPreviews]));
    
    // Hide the preview in UI
    const previewContainer = document.querySelector(`[data-preview-url="${url}"]`);
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
}

function loadHiddenPreviews() {
    try {
        const stored = localStorage.getItem('hiddenPreviews');
        if (stored) {
            const hidden = JSON.parse(stored);
            hidden.forEach(key => hiddenPreviews.add(key));
        }
    } catch (e) {
        console.error('Error loading hidden previews:', e);
    }
}

async function addLinkPreviews(messageId, messageText, messageElement) {
    if (!linkPreviewEnabled) return;
    
    const urls = extractUrls(messageText);
    if (urls.length === 0) return;
    
    // Load hidden previews from storage
    loadHiddenPreviews();
    
    // Get only the first URL that is not hidden
    let firstValidUrl = null;
    let previewKey = null;
    
    for (const url of urls) {
        const key = `${messageId}-${url}`;
        if (!hiddenPreviews.has(key)) {
            firstValidUrl = url;
            previewKey = key;
            break;
        }
    }
    
    if (!firstValidUrl) return;
    
    // Create loading indicator
    const loadingEl = createLinkPreviewLoading();
    messageElement.appendChild(loadingEl);
    
    // Fetch preview for the first URL only
    const metadata = await fetchLinkPreview(firstValidUrl);
    
    // Remove loading indicator
    messageElement.removeChild(loadingEl);
    
    if (metadata && !metadata.error) {
        const previewCard = createLinkPreviewCard(metadata, messageId, firstValidUrl);
        messageElement.appendChild(previewCard);
    }
    // If error, don't show anything (silently fail)
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // Restore voice message handlers after scrolling
    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 100);
}

// Emoji picker
function initializeEmojiPicker() {
    const emojiBtn = document.querySelector('.emoji-btn');
    if (emojiBtn) {
        emojiBtn.addEventListener('click', () => {
            showEmojiPickerForInput();
        });
    }
}

const EMOJI_CATEGORIES = {
    'smileys': {
        icon: '😀',
        name: 'Smileys & Emotion',
        emojis: [
            '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇',
            '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪',
            '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒',
            '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
            '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕',
            '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥',
            '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠',
            '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
            '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'
        ]
    },
    'people': {
        icon: '👋',
        name: 'People & Body',
        emojis: [
            '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙',
            '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏',
            '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶',
            '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄',
            '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵',
            '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷',
            '👮', '🕵️', '💂', '🥷', '👷', '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰',
            '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝',
            '🧞', '🧟', '💆', '💇', '🚶', '🧍', '🧎', '🏃', '💃', '🕺', '🕴️',
            '🧖', '🧗', '🤸', '🏌️', '🏇', '⛷️', '🏂', '🏋️', '🤼', '🤽', '🤾', '🤺',
            '⛹️', '🏊', '🚣', '🧘', '🛀', '🛌', '👣'
        ]
    },
    'animals': {
        icon: '🐶',
        name: 'Animals & Nature',
        emojis: [
            '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🐈‍⬛', '🦁',
            '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🦬', '🐮', '🐂', '🐃', '🐄',
            '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦣',
            '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦫', '🦔', '🦇', '🐻',
            '🐻‍❄️', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾',
            '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢',
            '🦉', '🦤', '🪶', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍', '🐲',
            '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭', '🐟', '🐠', '🐡', '🦈', '🐙',
            '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞', '🦗', '🪳', '🕷️', '🕸️',
            '🦂', '🦟', '🪰', '🪱', '🦠',
            '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴',
            '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃'
        ]
    },
    'food': {
        icon: '🍔',
        name: 'Food & Drink',
        emojis: ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐', '🥝', '🍅', '🫒', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🫕', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦀', '🦞', '🦐', '🦑', '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🫖', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤', '🧋', '🧃', '🧉', '🧊', '🥢', '🍽️', '🍴', '🥄']
    },
    'activities': {
        icon: '⚽',
        name: 'Activities',
        emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩']
    },
    'travel': {
        icon: '🚗',
        name: 'Travel & Places',
        emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🪝', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁']
    },
    'objects': {
        icon: '💡',
        name: 'Objects',
        emojis: ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓']
    },
    'symbols': {
        icon: '❤️',
        name: 'Symbols',
        emojis: [
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞',
            '💓', '💗', '💖', '💘', '💝', '💟',
            '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎',
            '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓',
            '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️',
            '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲',
            '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫',
            '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕',
            '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰',
            '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤',
            '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅',
            '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡',
            '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓',
            '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
            '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️',
            '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️',
            '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️',
            '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️',
            '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝',
            '🔜', '✔️', '☑️', '🔘',
            '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤',
            '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽',
            '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫',
            '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️',
            '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄',
            '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛',
            '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'
        ]
    },
    'flags': {
        icon: '🏳️',
        name: 'Flags',
        emojis: [
            '🏳️',
            '🏴',
            '🏴‍☠️',
            '🏁',
            '🚩',
            '🎌',
            '🇦🇨', '🇦🇩', '🇦🇪', '🇦🇫', '🇦🇬', '🇦🇮', '🇦🇱', '🇦🇲', '🇦🇴', '🇦🇶', '🇦🇷', '🇦🇸', '🇦🇹', '🇦🇺', '🇦🇼', '🇦🇽',
            '🇦🇿', '🇧🇦', '🇧🇧', '🇧🇩', '🇧🇪', '🇧🇫', '🇧🇬', '🇧🇭', '🇧🇮', '🇧🇯', '🇧🇱', '🇧🇲', '🇧🇳', '🇧🇴', '🇧🇶', '🇧🇷',
            '🇧🇸', '🇧🇹', '🇧🇻', '🇧🇼', '🇧🇾', '🇧🇿', '🇨🇦', '🇨🇨', '🇨🇩', '🇨🇫', '🇨🇬', '🇨🇭', '🇨🇮', '🇨🇰', '🇨🇱', '🇨🇲',
            '🇨🇳', '🇨🇴', '🇨🇵', '🇨🇷', '🇨🇺', '🇨🇻', '🇨🇼', '🇨🇽', '🇨🇾', '🇨🇿', '🇩🇪', '🇩🇬', '🇩🇯', '🇩🇰', '🇩🇲', '🇩🇴',
            '🇩🇿', '🇪🇦', '🇪🇨', '🇪🇪', '🇪🇬', '🇪🇭', '🇪🇷', '🇪🇸', '🇪🇹', '🇪🇺', '🇫🇮', '🇫🇯', '🇫🇰', '🇫🇲', '🇫🇴', '🇫🇷',
            '🇬🇦', '🇬🇧', '🇬🇩', '🇬🇪', '🇬🇫', '🇬🇬', '🇬🇭', '🇬🇮', '🇬🇱', '🇬🇲', '🇬🇳', '🇬🇵', '🇬🇶', '🇬🇷', '🇬🇸', '🇬🇹',
            '🇬🇺', '🇬🇼', '🇬🇾', '🇭🇰', '🇭🇲', '🇭🇳', '🇭🇷', '🇭🇹', '🇭🇺', '🇮🇨', '🇮🇩', '🇮🇪', '🇮🇱', '🇮🇲', '🇮🇳', '🇮🇴',
            '🇮🇶', '🇮🇷', '🇮🇸', '🇮🇹', '🇯🇪', '🇯🇲', '🇯🇴', '🇯🇵', '🇰🇪', '🇰🇬', '🇰🇭', '🇰🇮', '🇰🇲', '🇰🇳', '🇰🇵', '🇰🇷',
            '🇰🇼', '🇰🇾', '🇰🇿', '🇱🇦', '🇱🇧', '🇱🇨', '🇱🇮', '🇱🇰', '🇱🇷', '🇱🇸', '🇱🇹', '🇱🇺', '🇱🇻', '🇱🇾', '🇲🇦', '🇲🇨',
            '🇲🇩', '🇲🇪', '🇲🇫', '🇲🇬', '🇲🇭', '🇲🇰', '🇲🇱', '🇲🇲', '🇲🇳', '🇲🇴', '🇲🇵', '🇲🇶', '🇲🇷', '🇲🇸', '🇲🇹', '🇲🇺',
            '🇲🇻', '🇲🇼', '🇲🇽', '🇲🇾', '🇲🇿', '🇳🇦', '🇳🇨', '🇳🇪', '🇳🇫', '🇳🇬', '🇳🇮', '🇳🇱', '🇳🇴', '🇳🇵', '🇳🇷', '🇳🇺',
            '🇳🇿', '🇴🇲', '🇵🇦', '🇵🇪', '🇵🇫', '🇵🇬', '🇵🇭', '🇵🇰', '🇵🇱', '🇵🇲', '🇵🇳', '🇵🇷', '🇵🇸', '🇵🇹', '🇵🇼', '🇵🇾',
            '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇸', '🇷🇺', '🇷🇼', '🇸🇦', '🇸🇧', '🇸🇨', '🇸🇩', '🇸🇪', '🇸🇬', '🇸🇭', '🇸🇮', '🇸🇯', '🇸🇰',
            '🇸🇱', '🇸🇲', '🇸🇳', '🇸🇴', '🇸🇷', '🇸🇸', '🇸🇹', '🇸🇻', '🇸🇽', '🇸🇾', '🇸🇿', '🇹🇦', '🇹🇨', '🇹🇩', '🇹🇫', '🇹🇬',
            '🇹🇭', '🇹🇯', '🇹🇰', '🇹🇱', '🇹🇲', '🇹🇳', '🇹🇴', '🇹🇷', '🇹🇹', '🇹🇻', '🇹🇼', '🇹🇿', '🇺🇦', '🇺🇬', '🇺🇲', '🇺🇳',
            '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇦', '🇻🇨', '🇻🇪', '🇻🇬', '🇻🇮', '🇻🇳', '🇻🇺', '🇼🇫', '🇼🇸', '🇽🇰', '🇾🇪', '🇾🇹', '🇿🇦',
            '🇿🇲', '🇿🇼'
        ]
    }
};

function showEmojiPickerForInput() {
    const existingPicker = document.querySelector('.emoji-picker-full');
    if (existingPicker) {
        existingPicker.remove();
        return;
    }
    const picker = createFullEmojiPicker((emoji) => {
        const input = document.getElementById('messageInput');
        input.value += emoji;
        input.focus();
    });
    document.body.appendChild(picker);
}

function showEmojiPickerForMessage(messageId) {
    const existingPicker = document.querySelector('.emoji-picker-full');
    if (existingPicker) {
        existingPicker.remove();
        return;
    }
    const picker = createFullEmojiPicker((emoji) => {
        addReaction(messageId, emoji);
    });
    document.body.appendChild(picker);
}

function createFullEmojiPicker(onSelect) {
    const picker = document.createElement('div');
    picker.className = 'emoji-picker-full';

    const tabs = document.createElement('div');
    tabs.className = 'emoji-tabs';

    const content = document.createElement('div');
    content.className = 'emoji-content';

    const categoryKeys = Object.keys(EMOJI_CATEGORIES);

    categoryKeys.forEach((key, index) => {
        const category = EMOJI_CATEGORIES[key];
        const tab = document.createElement('button');
        tab.className = 'emoji-tab' + (index === 0 ? ' active' : '');
        tab.innerHTML = category.icon;
        tab.title = category.name;
        tab.addEventListener('click', () => {
            tabs.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderCategory(key);
        });
        tabs.appendChild(tab);
    });

    function renderCategory(key) {
        const category = EMOJI_CATEGORIES[key];
        content.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'emoji-category-title';
        title.textContent = category.name;
        content.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'emoji-grid';

        category.emojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'emoji-option';
            btn.innerHTML = emoji;
            btn.addEventListener('click', () => {
                onSelect(emoji);
                picker.remove();
            });
            grid.appendChild(btn);
        });

        content.appendChild(grid);

        if (typeof twemoji !== 'undefined') {
            twemoji.parse(content);
        }
    }

    if (typeof twemoji !== 'undefined') {
        twemoji.parse(tabs);
    }

    renderCategory(categoryKeys[0]);

    picker.appendChild(tabs);
    picker.appendChild(content);

    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target) && !e.target.closest('.emoji-btn') && !e.target.closest('.add-reaction-btn')) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 100);

    return picker;
}

function addReaction(messageId, emoji) {
    // Если это Self Chat, обрабатываем локально
    if (currentDMUserId === currentUser.id) {
        addSelfChatReaction(messageId, emoji);
    } else if (socket && socket.connected) {
        socket.emit('add-reaction', { messageId, emoji });
    }
}

function updateMessageReactions(messageId, reactions) {
    const reactionsContainer = document.querySelector(`[data-message-id="${messageId}"] .message-reactions`);
    if (!reactionsContainer) return;

    reactionsContainer.innerHTML = '';

    reactions.forEach(reaction => {
        const reactionEl = document.createElement('div');
        reactionEl.className = 'reaction';
        reactionEl.innerHTML = `${reaction.emoji} <span>${reaction.count}</span>`;
        reactionEl.title = reaction.users;

        // Для Self Chat обработка реакций будет отличаться
        if (currentDMUserId === currentUser.id) {
            // В Self Chat просто удаляем реакцию при клике
            reactionEl.addEventListener('click', () => {
                removeSelfChatReaction(messageId, reaction.emoji);
            });
        } else {
            // Для обычных DM отправляем через сокет
            reactionEl.addEventListener('click', () => {
                if (socket && socket.connected) {
                    socket.emit('remove-reaction', { messageId, emoji: reaction.emoji });
                }
            });
        }
        reactionsContainer.appendChild(reactionEl);
    });

    if (typeof twemoji !== 'undefined') {
        twemoji.parse(reactionsContainer);
    }
}

// Функция для добавления реакции в Self Chat
function addSelfChatReaction(messageId, emoji) {
    const key = `selfChatHistory_${currentUser.id}`;
    const history = JSON.parse(localStorage.getItem(key)) || [];

    const messageIndex = history.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
        const message = history[messageIndex];
        if (!message.reactions) {
            message.reactions = [];
        }

        // Проверяем, есть ли уже такая реакция
        const existingReaction = message.reactions.find(r => r.emoji === emoji);
        if (existingReaction) {
            existingReaction.count++;
        } else {
            message.reactions.push({
                emoji: emoji,
                count: 1,
                users: [currentUser.username]
            });
        }

        // Обновляем историю
        localStorage.setItem(key, JSON.stringify(history));

        // Обновляем отображение сообщения
        updateSelfChatMessage(messageId, message);
    }
}

// Функция для удаления реакции из Self Chat
function removeSelfChatReaction(messageId, emoji) {
    const key = `selfChatHistory_${currentUser.id}`;
    const history = JSON.parse(localStorage.getItem(key)) || [];

    const messageIndex = history.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
        const message = history[messageIndex];
        if (message.reactions) {
            const reactionIndex = message.reactions.findIndex(r => r.emoji === emoji);
            if (reactionIndex !== -1) {
                const reaction = message.reactions[reactionIndex];
                reaction.count--;

                // Если количество реакций стало 0, удаляем реакцию
                if (reaction.count <= 0) {
                    message.reactions.splice(reactionIndex, 1);
                }
            }
        }

        // Обновляем историю
        localStorage.setItem(key, JSON.stringify(history));

        // Обновляем отображение сообщения
        updateSelfChatMessage(messageId, message);
    }
}

// Функция для обновления отображения сообщения в Self Chat
function updateSelfChatMessage(messageId, updatedMessage) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove(); // Удаляем старое сообщение

        // Добавляем обновленное сообщение
        addMessageToUI(updatedMessage);
    }
}

// Функция для обновления содержимого сообщения в Self Chat
function updateSelfChatMessageContent(messageId, newText) {
    const key = `selfChatHistory_${currentUser.id}`;
    const history = JSON.parse(localStorage.getItem(key)) || [];

    const messageIndex = history.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
        // Обновляем текст сообщения
        history[messageIndex].text = newText;
        
        // Обновляем время редактирования
        history[messageIndex].edited = true;

        // Обновляем историю
        localStorage.setItem(key, JSON.stringify(history));

        // Обновляем отображение сообщения
        updateSelfChatMessage(messageId, history[messageIndex]);
    }
}

// Функция для удаления сообщения из Self Chat
function deleteSelfChatMessage(messageId) {
    const key = `selfChatHistory_${currentUser.id}`;
    const history = JSON.parse(localStorage.getItem(key)) || [];

    // Фильтруем сообщения, исключая удаляемое
    const updatedHistory = history.filter(msg => msg.id !== messageId);

    // Обновляем историю
    localStorage.setItem(key, JSON.stringify(updatedHistory));

    // Удаляем сообщение из интерфейса
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
}

// File upload
function initializeFileUpload() {
    const attachBtn = document.querySelector('.attach-btn');
    if (!attachBtn) {
        console.error('Attach button element not found');
        return;
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadFile(file);
        }
        fileInput.value = '';
    });
}

async function uploadFile(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('dmId', currentDMUserId); // Добавляем ID получателя для DM
        formData.append('senderId', currentUser.id); // Добавляем ID отправителя

        const response = await fetch(`${getApiUrl()}/api/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const fileData = await response.json();

        const message = {
            id: Date.now(), // используем временную метку как ID
            author: currentUser.username,
            avatar: currentUser.avatar,
            text: '', // Убираем текст "Uploaded [filename]"
            file: fileData,
            timestamp: new Date().toISOString(), // отправляем в UTC
            reactions: []
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

    } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload file');
    }
}

// User controls
function initializeUserControls() {
    const muteBtn = document.getElementById('muteBtn');
    const deafenBtn = document.getElementById('deafenBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            isMuted = !isMuted;
            const normalIcon = muteBtn.querySelector('.icon-normal');
            const slashedIcon = muteBtn.querySelector('.icon-slashed');

            if (normalIcon) normalIcon.style.display = isMuted ? 'none' : 'block';
            if (slashedIcon) slashedIcon.style.display = isMuted ? 'block' : 'none';

            if (localStream) {
                localStream.getAudioTracks().forEach(track => {
                    track.enabled = !isMuted;
                });
            }
        });
    }

    if (deafenBtn) {
        deafenBtn.addEventListener('click', () => {
            isDeafened = !isDeafened;
            const normalIcon = deafenBtn.querySelector('.icon-normal');
            const slashedIcon = deafenBtn.querySelector('.icon-slashed');

            if (normalIcon) normalIcon.style.display = isDeafened ? 'none' : 'block';
            if (slashedIcon) slashedIcon.style.display = isDeafened ? 'block' : 'none';

            // When deafened, also mute microphone
            if (isDeafened) {
                if (!isMuted) {
                    isMuted = true;
                    if (muteBtn) {
                        const normalIcon = muteBtn.querySelector('.icon-normal');
                        const slashedIcon = muteBtn.querySelector('.icon-slashed');

                        if (normalIcon) normalIcon.style.display = 'none';
                        if (slashedIcon) slashedIcon.style.display = 'block';
                    }
                }

                // Mute all remote audio
                document.querySelectorAll('video[id^="remote-"]').forEach(video => {
                    video.volume = 0;
                });
            } else {
                // Unmute remote audio
                document.querySelectorAll('video[id^="remote-"]').forEach(video => {
                    video.volume = 1;
                });
            }

            // Update local stream audio tracks
            if (localStream) {
                localStream.getAudioTracks().forEach(track => {
                    track.enabled = !isMuted;
                });
            }
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            openSettingsModal();
        });
    }
}

// Settings Modal functions
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    
    // Load current settings
    loadSettings();
    
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function loadSettings() {
    const linkPreviewToggle = document.getElementById('linkPreviewToggle');
    if (linkPreviewToggle) {
        // Load from localStorage
        const saved = localStorage.getItem('linkPreviewEnabled');
        linkPreviewToggle.checked = saved !== 'false';
        linkPreviewEnabled = linkPreviewToggle.checked;
    }
}

function initializeSettingsModal() {
    const closeBtn = document.getElementById('closeSettingsModal');
    const linkPreviewToggle = document.getElementById('linkPreviewToggle');
    const clearHiddenPreviewsBtn = document.getElementById('clearHiddenPreviewsBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettingsModal);
    }
    
    // Close modal on outside click
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeSettingsModal();
            }
        });
    }
    
    if (linkPreviewToggle) {
        linkPreviewToggle.addEventListener('change', (e) => {
            linkPreviewEnabled = e.target.checked;
            localStorage.setItem('linkPreviewEnabled', linkPreviewEnabled.toString());
        });
    }
    
    if (clearHiddenPreviewsBtn) {
        clearHiddenPreviewsBtn.addEventListener('click', () => {
            hiddenPreviews.clear();
            localStorage.removeItem('hiddenPreviews');
            alert('All hidden previews have been reset');
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Do you want to logout?')) {
                if (inCall) leaveVoiceChannel();
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
                if (socket) socket.disconnect();
                window.location.replace('login.html');
            }
        });
    }
}

// Voice channel functions - call persists when switching views

async function initializeMedia() {
    try {
        // Better audio constraints for clear voice
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                sampleSize: 16,
                channelCount: 1
            }
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;
        
        // Log audio track status
        const audioTracks = localStream.getAudioTracks();
        console.log('Local audio tracks:', audioTracks.length);
        audioTracks.forEach(track => {
            console.log(`Audio track: ${track.label}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
        });
        
        if (isMuted || isDeafened) {
            audioTracks.forEach(track => {
                track.enabled = false;
            });
        }
    } catch (error) {
        console.error('Error getting media devices:', error);
        throw error;
    }
}


function initializeCallControls() {
    const closeCallBtn = document.getElementById('closeCallBtn');
    const toggleVideoBtn = document.getElementById('toggleVideoBtn');
    const toggleAudioBtn = document.getElementById('toggleAudioBtn');
    const toggleScreenBtn = document.getElementById('toggleScreenBtn');

    if (closeCallBtn) {
        closeCallBtn.addEventListener('click', () => {
            // End call for direct calls
            if (window.currentCallDetails) {
                // End a direct call
                Object.keys(peerConnections).forEach(socketId => {
                    if (socket && socket.connected) {
                        socket.emit('end-call', { to: socketId });
                    }
                });
            }
            // Leave the voice channel and clean up resources
            leaveVoiceChannel();
        });
    }

    if (toggleVideoBtn) {
        toggleVideoBtn.addEventListener('click', () => {
            toggleVideo();
        });
    }

    if (toggleAudioBtn) {
        toggleAudioBtn.addEventListener('click', () => {
            toggleAudio();
        });
    }

    if (toggleScreenBtn) {
        toggleScreenBtn.addEventListener('click', () => {
            toggleScreenShare();
        });
        
        // Обновляем подсказку для кнопки в зависимости от устройства
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            toggleScreenBtn.title = 'Share Camera (Mobile)';
            // Меняем иконку или текст, если необходимо
            const icon = toggleScreenBtn.querySelector('i') || toggleScreenBtn.querySelector('span');
            if (icon) {
                // Можно изменить иконку для мобильного режима
            }
        }
    }
}

function toggleVideo() {
    if (!localStream) return;
    
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
    });
    
    // Notify peer about video state change
    Object.keys(peerConnections).forEach(socketId => {
        if (socket && socket.connected) {
            socket.emit('video-toggle', {
                to: socketId,
                enabled: isVideoEnabled
            });
        }
    });
    
    updateCallButtons();
}

function toggleAudio() {
    if (!localStream) return;
    
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isAudioEnabled;
    });
    
    if (!isAudioEnabled) {
        isMuted = true;
        document.getElementById('muteBtn').classList.add('active');
    } else {
        isMuted = false;
        document.getElementById('muteBtn').classList.remove('active');
    }
    
    updateCallButtons();
}

async function toggleScreenShare() {
    if (screenStream) {
        // Stop screen sharing
        screenStream.getTracks().forEach(track => track.stop());

        // Replace screen track with camera track in all peer connections
        const videoTrack = localStream.getVideoTracks()[0];
        Object.values(peerConnections).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
        });

        screenStream = null;

        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;

        updateCallButtons();
    } else {
        try {
            // Проверяем, является ли устройство мобильным
            const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (isMobile) {
                // На мобильных устройствах используем захват камеры вместо экрана
                // так как API захвата экрана не поддерживается на большинстве мобильных браузеров
                const constraints = {
                    video: {
                        facingMode: 'environment', // Используем внешнюю камеру по умолчанию
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100
                    }
                };
                
                screenStream = await navigator.mediaDevices.getUserMedia(constraints);
            } else {
                // На ПК используем стандартный API захвата экрана
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100
                    }
                });
            }

            const screenTrack = screenStream.getVideoTracks()[0];

            // Replace video track in all peer connections
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            });

            // Show screen share in local video
            const localVideo = document.getElementById('localVideo');
            const mixedStream = new MediaStream([
                screenTrack,
                ...localStream.getAudioTracks()
            ]);
            localVideo.srcObject = mixedStream;

            // Handle screen share ending
            screenTrack.addEventListener('ended', () => {
                toggleScreenShare(); // This will stop screen sharing
            });

            updateCallButtons();
        } catch (error) {
            console.error('Error sharing screen:', error);
            if (error.name === 'NotAllowedError') {
                alert('Screen sharing permission denied');
            } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
                // На мобильных устройствах может не быть внешней камеры
                try {
                    // Пробуем использовать фронтальную камеру
                    const constraints = {
                        video: {
                            facingMode: 'user',
                            width: { ideal: 1920 },
                            height: { ideal: 1080 }
                        },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            sampleRate: 44100
                        }
                    };
                    
                    screenStream = await navigator.mediaDevices.getUserMedia(constraints);
                    
                    const screenTrack = screenStream.getVideoTracks()[0];

                    // Replace video track in all peer connections
                    Object.values(peerConnections).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                        if (sender) {
                            sender.replaceTrack(screenTrack);
                        }
                    });

                    // Show screen share in local video
                    const localVideo = document.getElementById('localVideo');
                    const mixedStream = new MediaStream([
                        screenTrack,
                        ...localStream.getAudioTracks()
                    ]);
                    localVideo.srcObject = mixedStream;

                    // Handle screen share ending
                    screenTrack.addEventListener('ended', () => {
                        toggleScreenShare(); // This will stop screen sharing
                    });

                    updateCallButtons();
                } catch (fallbackError) {
                    console.error('Error with fallback camera access:', fallbackError);
                    alert('Screen sharing is not supported on this device. Camera access was also denied.');
                }
            } else {
                alert('Error sharing screen. Please try again. Note: Screen sharing may not be supported on mobile devices.');
            }
        }
    }
}

function updateCallButtons() {
    const toggleVideoBtn = document.getElementById('toggleVideoBtn');
    const toggleAudioBtn = document.getElementById('toggleAudioBtn');
    const toggleScreenBtn = document.getElementById('toggleScreenBtn');

    if (toggleVideoBtn) {
        toggleVideoBtn.classList.toggle('active', !isVideoEnabled);
    }

    if (toggleAudioBtn) {
        toggleAudioBtn.classList.toggle('active', !isAudioEnabled);
    }

    if (toggleScreenBtn) {
        toggleScreenBtn.classList.toggle('active', screenStream !== null);
        
        // Обновляем подсказку для кнопки в зависимости от типа захвата
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (screenStream) {
            if (isMobile) {
                toggleScreenBtn.title = 'Stop Camera Share';
            } else {
                toggleScreenBtn.title = 'Stop Screen Share';
            }
        } else {
            if (isMobile) {
                toggleScreenBtn.title = 'Share Camera (Mobile)';
            } else {
                toggleScreenBtn.title = 'Share Screen';
            }
        }
    }
}

function initializeDraggableCallWindow() {
   const callInterface = document.getElementById('callInterface');

   if (!callInterface) {
       console.error('Call interface element not found');
       return;
   }

   const callHeader = callInterface.querySelector('.call-header');

   if (!callHeader) {
       console.error('Call header element not found');
       return;
   }

   let isDragging = false;
   let offsetX, offsetY;

   callHeader.addEventListener('mousedown', (e) => {
       isDragging = true;
       offsetX = e.clientX - callInterface.offsetLeft;
       offsetY = e.clientY - callInterface.offsetTop;
       callInterface.style.transition = 'none'; // Disable transition during drag
   });

   document.addEventListener('mousemove', (e) => {
       if (isDragging) {
           let newX = e.clientX - offsetX;
           let newY = e.clientY - offsetY;

           // Constrain within viewport
           const maxX = window.innerWidth - callInterface.offsetWidth;
           const maxY = window.innerHeight - callInterface.offsetHeight;

           newX = Math.max(0, Math.min(newX, maxX));
           newY = Math.max(0, Math.min(newY, maxY));

           callInterface.style.left = `${newX}px`;
           callInterface.style.top = `${newY}px`;
       }
   });

   document.addEventListener('mouseup', () => {
       if (isDragging) {
           isDragging = false;
           callInterface.style.transition = 'all 0.3s ease'; // Re-enable transition
       }
   });
}

async function loadDMHistory(userId) {
   // Не загружаем историю для Self Chat, так как она хранится локально
   if (userId === currentUser.id) {
       return;
   }

   const messagesContainer = document.getElementById('messagesContainer');

   if (!messagesContainer) {
       console.error('Messages container element not found');
       return;
   }

   messagesContainer.innerHTML = '';

   try {
       const response = await fetch(`${getApiUrl()}/api/dm/${userId}?t=${Date.now()}`, {
           headers: { 'Authorization': `Bearer ${token}` },
           cache: 'no-cache'
       });
       if (response.ok) {
           const messages = await response.json();
           messages.forEach(message => {
               // Определяем, является ли файл голосовым сообщением
               let isVoiceMessage = false;
               if (message.file) {
                   const fileExtension = message.file.filename.split('.').pop().toLowerCase();
                   const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a', 'aac'];
                   isVoiceMessage = audioExtensions.includes(fileExtension);
               }
               
               addMessageToUI({
                   id: message.id,
                   author: message.username,
                   avatar: message.avatar || message.username.charAt(0).toUpperCase(),
                   text: message.content,
                   timestamp: message.created_at,
                   reactions: message.reactions || [],
                   file: message.file,  // Добавляем информацию о файле, если она есть
                   isVoiceMessage: isVoiceMessage, // Определяем, является ли это голосовым сообщением
                   edited: message.edited,  // Добавляем флаг редактирования, если он существует
                   replyTo: message.replyTo || null  // Добавляем информацию об ответе
               });
           });
       } else {
           console.error('Failed to load DM history');
       }
   } catch (error) {
       console.error('Error loading DM history:', error);
   }

   scrollToBottom();
   
   // Restore voice message handlers after loading history
   setTimeout(() => {
       restoreVoiceMessageHandlers();
   }, 100);
}

console.log('Discord Clone initialized successfully!');
if (currentUser) {
   console.log('Logged in as:', currentUser.username);
}

function populateDMList(friends) {
   const dmList = document.getElementById('dmList');

   if (!dmList) {
       console.error('DM list element not found');
       return;
   }

   dmList.innerHTML = '';

   // Добавляем чат с самим собой в начало списка
   const selfChatItem = document.createElement('div');
   selfChatItem.className = 'channel';
   selfChatItem.setAttribute('data-dm-id', 'self');
   selfChatItem.innerHTML = `
       <div class="friend-avatar self-chat-icon">
           <div class="friend-avatar-content">${currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}</div>
       </div>
       <span data-i18n="chat.selfChat">Self Chat</span>
   `;
   selfChatItem.addEventListener('click', () => {
       startSelfChat();
   });
   dmList.appendChild(selfChatItem);

   window.i18n.applyI18n(selfChatItem);

   // Добавляем канал новостей после self-chat (если загружен)
   if (systemChannelId) {
       const systemChannelEl = document.createElement('div');
       systemChannelEl.className = 'channel system-channel';
       systemChannelEl.setAttribute('data-channel-id', systemChannelId);
       systemChannelEl.innerHTML = `
           <div class="channel-icon">
               <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                   <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
               </svg>
           </div>
           <span class="channel-name">Новости</span>
       `;
       systemChannelEl.addEventListener('click', () => {
           console.log('System channel clicked');
           openSystemChannel();
       });
       dmList.appendChild(systemChannelEl);
   }

   if (friends.length === 0) {
       const emptyDM = document.createElement('div');
       emptyDM.className = 'empty-dm-list';
       emptyDM.textContent = 'No conversations yet.';
       dmList.appendChild(emptyDM);
       return;
   }

   friends.forEach(friend => {
       const dmItem = document.createElement('div');
       dmItem.className = 'channel';
       dmItem.setAttribute('data-dm-id', friend.id);

       // Проверяем количество непрочитанных от этого пользователя
       const unreadCount = notificationService?.unreadCounts?.get(friend.id) || 0;
       const unreadIndicator = unreadCount > 0
           ? `<span class="dm-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
           : '';

       dmItem.innerHTML = `
           <div class="friend-avatar-wrapper" style="position: relative;">
               <div class="friend-avatar">
                   <div class="friend-avatar-content">${friend.avatar || friend.username.charAt(0).toUpperCase()}</div>
               </div>
               ${unreadIndicator}
           </div>
           <span>${friend.username}</span>
       `;
       dmItem.addEventListener('click', () => {
           startDM(friend.id, friend.username);
       });
       dmList.appendChild(dmItem);
   });
}

// WebRTC Functions
function createPeerConnection(remoteSocketId, isInitiator) {
    console.log(`Creating peer connection with ${remoteSocketId}, initiator: ${isInitiator}`);

    if (peerConnections[remoteSocketId]) {
        console.log('Peer connection already exists');
        return peerConnections[remoteSocketId];
    }

    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            // TURN сервер для лучшей совместимости
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ],
        iceCandidatePoolSize: 10
    });

    peerConnections[remoteSocketId] = pc;

    // Add local stream tracks with better error handling
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        const videoTracks = localStream.getVideoTracks();

        console.log(`Adding tracks - Audio: ${audioTracks.length}, Video: ${videoTracks.length}`);

        // Add audio tracks first (priority for voice calls)
        audioTracks.forEach(track => {
            console.log(`Adding audio track: ${track.label}, enabled: ${track.enabled}`);
            pc.addTrack(track, localStream);
        });

        // Then add video tracks
        videoTracks.forEach(track => {
            console.log(`Adding video track: ${track.label}, enabled: ${track.enabled}`);
            pc.addTrack(track, localStream);
        });
    } else {
        console.error('No local stream available');
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to:', remoteSocketId);
            socket.emit('ice-candidate', {
                to: remoteSocketId,
                candidate: event.candidate,
                from: socket.id // Добавляем идентификатор отправителя
            });
        }
    };

    // Handle connection state changes
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
            console.error('ICE connection failed');
            // Try to restart ICE
            pc.restartIce();
        }
        if (pc.iceConnectionState === 'connected') {
            console.log('Peer connection established successfully!');
        }
    };

    // Handle incoming remote stream
    pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind, 'Stream ID:', event.streams[0]?.id);

        const remoteParticipants = document.getElementById('remoteParticipants');

        let participantDiv = document.getElementById(`participant-${remoteSocketId}`);
        let remoteVideo = document.getElementById(`remote-${remoteSocketId}`);

        // Create video element only once (on first track)
        if (!participantDiv) {
            participantDiv = document.createElement('div');
            participantDiv.className = 'participant';
            participantDiv.id = `participant-${remoteSocketId}`;

            remoteVideo = document.createElement('video');
            remoteVideo.id = `remote-${remoteSocketId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.muted = false; // Don't mute remote video
            remoteVideo.volume = isDeafened ? 0 : 1; // Respect deafened state

            const participantName = document.createElement('div');
            participantName.className = 'participant-name';
            participantName.textContent = 'Friend';

            participantDiv.appendChild(remoteVideo);
            participantDiv.appendChild(participantName);
            remoteParticipants.appendChild(participantDiv);
            
            console.log('Created video element for remote participant');
        } else {
            // Video element already exists, skip duplicate track handling
            console.log('Video element already exists, skipping duplicate track');
            return;
        }

        // Set the stream to the video element
        if (event.streams && event.streams[0]) {
            console.log('Setting remote stream to video element');
            remoteVideo = document.getElementById(`remote-${remoteSocketId}`);
            if (remoteVideo) {
                // Stop previous stream if exists
                if (remoteVideo.srcObject) {
                    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
                }
                
                remoteVideo.srcObject = event.streams[0];
                
                // Force reload the video element
                remoteVideo.load();

                // Ensure audio/video is playing
                const playVideo = () => {
                    remoteVideo.play().catch(e => {
                        console.warn('Cannot play yet, waiting for interaction:', e.message);
                    });
                };
                
                // Try immediately
                playVideo();
                
                // Also try on user interaction if needed
                document.addEventListener('click', playVideo, { once: true });
                document.addEventListener('keydown', playVideo, { once: true });
            }
        }

        // Initialize resizable videos
        function initializeResizableVideos() {
            const callInterface = document.getElementById('callInterface');
            const participants = callInterface.querySelectorAll('.participant');

            participants.forEach(participant => {
                // Check if resizable functionality has already been applied
                if (!participant.hasAttribute('data-resizable')) {
                    makeResizable(participant);
                }
            });

            // Make call interface resizable too
            makeInterfaceResizable(callInterface);
        }

        // Make individual video resizable
        function makeResizable(element) {
            // Add resize handle
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.innerHTML = '↘';
            resizeHandle.style.cssText = `
                position: absolute;
                bottom: 5px;
                right: 5px;
                width: 20px;
                height: 20px;
                background: rgba(255,255,255,0.3);
                cursor: nwse-resize;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 3px;
                font-size: 12px;
                color: white;
                user-select: none;
            `;

            // Add video size controls
            const sizeControls = document.createElement('div');
            sizeControls.className = 'video-size-controls';
            sizeControls.innerHTML = `
                <button class="size-control-btn minimize-btn" title="Minimize">_</button>
                <button class="size-control-btn maximize-btn" title="Maximize">□</button>
                <button class="size-control-btn fullscreen-btn" title="Fullscreen">⛶</button>
            `;

            if (!element.querySelector('.resize-handle')) {
                element.appendChild(resizeHandle);
                element.appendChild(sizeControls);
                element.style.resize = 'both';
                element.style.overflow = 'auto';
                element.style.minWidth = '150px';
                element.style.minHeight = '100px';
                element.style.maxWidth = '90vw';
                element.style.maxHeight = '90vh';
                element.setAttribute('data-resizable', 'true');

                // Add double-click for fullscreen
                element.addEventListener('dblclick', function(e) {
                    if (!e.target.closest('.video-size-controls')) {
                        toggleVideoFullscreen(element);
                    }
                });

                // Size control buttons
                const minimizeBtn = sizeControls.querySelector('.minimize-btn');
                const maximizeBtn = sizeControls.querySelector('.maximize-btn');
                const fullscreenBtn = sizeControls.querySelector('.fullscreen-btn');

                minimizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    element.classList.toggle('minimized');
                    element.classList.remove('maximized');
                });

                maximizeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    element.classList.toggle('maximized');
                    element.classList.remove('minimized');
                });

                fullscreenBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const video = element.querySelector('video');
                    if (video && video.requestFullscreen) {
                        video.requestFullscreen();
                    }
                });
            }
        }

        // Toggle video fullscreen
        function toggleVideoFullscreen(element) {
            element.classList.toggle('maximized');
            if (element.classList.contains('maximized')) {
                element.classList.remove('minimized');
            }
        }

        // Make call interface resizable
        function makeInterfaceResizable(callInterface) {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'interface-resize-handle';
            resizeHandle.style.cssText = `
                position: absolute;
                bottom: 0;
                right: 0;
                width: 15px;
                height: 15px;
                cursor: nwse-resize;
                background: linear-gradient(135deg, transparent 50%, #5865f2 50%);
                border-bottom-right-radius: 12px;
            `;

            if (!callInterface.querySelector('.interface-resize-handle')) {
                callInterface.appendChild(resizeHandle);

                let isResizing = false;
                let startWidth = 0;
                let startHeight = 0;
                let startX = 0;
                let startY = 0;

                resizeHandle.addEventListener('mousedown', (e) => {
                    isResizing = true;
                    startWidth = parseInt(document.defaultView.getComputedStyle(callInterface).width, 10);
                    startHeight = parseInt(document.defaultView.getComputedStyle(callInterface).height, 10);
                    startX = e.clientX;
                    startY = e.clientY;
                    e.preventDefault();
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isResizing) return;

                    const newWidth = startWidth + e.clientX - startX;
                    const newHeight = startHeight + e.clientY - startY;

                    if (newWidth > 300 && newWidth < window.innerWidth * 0.9) {
                        callInterface.style.width = newWidth + 'px';
                    }
                    if (newHeight > 200 && newHeight < window.innerHeight * 0.9) {
                        callInterface.style.height = newHeight + 'px';
                    }
                });

                document.addEventListener('mouseup', () => {
                    isResizing = false;
                });
            }
        }

        // Update resizable functionality when new participants join
        window.observeNewParticipants = function() {
            setTimeout(() => {
                const participants = document.querySelectorAll('.participant:not([data-resizable])');
                participants.forEach(participant => {
                    participant.setAttribute('data-resizable', 'true');
                    makeResizable(participant);
                });
            }, 500);
        };

        // Make the new participant video resizable after a short delay
        setTimeout(() => {
            if (typeof makeResizable === 'function' && participantDiv && !participantDiv.hasAttribute('data-resizable')) {
                makeResizable(participantDiv);
            }
        }, 100);
    };

    // Create offer if initiator with modern constraints
    if (isInitiator) {
        pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        })
        .then(offer => {
            console.log('Created offer with SDP:', offer.sdp.substring(0, 200));
            return pc.setLocalDescription(offer);
        })
        .then(() => {
            console.log('Sending offer to:', remoteSocketId);
            socket.emit('offer', {
                to: remoteSocketId,
                offer: pc.localDescription,
                from: socket.id // Добавляем идентификатор отправителя
            });
        })
        .catch(error => {
            console.error('Error creating offer:', error);
        });
    }

    return pc;
}

// Обработчики событий WebRTC должны быть зарегистрированы один раз при инициализации приложения
document.addEventListener('DOMContentLoaded', () => {
    // Listen for remote offer (when someone calls us)
    socket.on('offer', (data) => {
        console.log('Received offer from:', data.from);
        const remoteSocketId = data.from;
        
        // Create peer connection as receiver (not initiator)
        if (!peerConnections[remoteSocketId]) {
            createPeerConnection(remoteSocketId, false);
        }
        
        // Get the peer connection
        const pc = peerConnections[remoteSocketId];
        if (pc) {
            // Set the remote description
            pc.setRemoteDescription(new RTCSessionDescription(data.offer))
            .then(() => {
                // Create answer
                return pc.createAnswer();
            })
            .then(answer => {
                return pc.setLocalDescription(answer);
            })
            .then(() => {
                // Send answer back to the caller
                socket.emit('answer', {
                    to: remoteSocketId,
                    answer: pc.localDescription,
                    from: socket.id
                });
            })
            .catch(error => {
                console.error('Error during offer processing:', error);
            });
        }
    });

    // Listen for remote answer
    socket.on('answer', (data) => {
        const pc = peerConnections[data.from];
        if (pc) {
            console.log('Received answer from:', data.from);
            pc.setRemoteDescription(new RTCSessionDescription(data.answer))
            .then(() => {
                // После установки удаленного описания обрабатываем сохраненные кандидаты
                if (pc.candidatesToProcess) {
                    pc.candidatesToProcess.forEach(candidate => {
                        try {
                            pc.addIceCandidate(new RTCIceCandidate(candidate));
                        } catch (e) {
                            console.error('Error adding stored ice candidate:', e);
                        }
                    });
                    pc.candidatesToProcess = []; // Очищаем список после обработки
                }
            })
            .catch(error => {
                console.error('Error setting remote description:', error);
            });
        }
    });

    // Listen for ICE candidates from remote peer
    socket.on('ice-candidate', (data) => {
        const pc = peerConnections[data.from];
        if (pc) {
            console.log('Received ICE candidate from:', data.from);
            // Проверяем, что удаленный дескриптор уже установлен
            if (pc.remoteDescription) {
                try {
                    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error('Error adding received ice candidate:', e);
                }
            } else {
                // Если удаленный дескриптор еще не установлен, сохраняем кандидаты для последующей обработки
                if (!pc.candidatesToProcess) {
                    pc.candidatesToProcess = [];
                }
                pc.candidatesToProcess.push(data.candidate);
            }
        }
    });
    
    // Обработка события о выходе участника из звонка
    socket.on('user-left-call', (data) => {
        const { userId, socketId } = data;
        console.log(`User ${userId} left the call`);
        
        // Закрываем соединение с этим пользователем
        if (peerConnections[socketId]) {
            peerConnections[socketId].close();
            delete peerConnections[socketId];
        }
        
        // Удаляем видео этого участника
        const remoteVideo = document.getElementById(`remote-${socketId}`);
        if (remoteVideo) {
            remoteVideo.remove();
        }
        
        // Обновляем список участников
        if (window.currentCallDetails && window.currentCallDetails.participants) {
            window.currentCallDetails.participants = window.currentCallDetails.participants.filter(id => id != userId);
        }
    });
});

// Initialize resizable videos
function initializeResizableVideos() {
    const callInterface = document.getElementById('callInterface');
    if (!callInterface) return;

    const participants = callInterface.querySelectorAll('.participant');
    participants.forEach(participant => {
        // Check if resizable functionality has already been applied
        if (!participant.hasAttribute('data-resizable')) {
            makeResizable(participant);
        }
    });

    // Make call interface resizable too
    makeInterfaceResizable(callInterface);
}

// Make individual video resizable
function makeResizable(element) {
    if (!element || element.hasAttribute('data-resizable')) return;
    
    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.innerHTML = '↘';
    resizeHandle.style.cssText = `
        position: absolute;
        bottom: 5px;
        right: 5px;
        width: 20px;
        height: 20px;
        background: rgba(255,255,255,0.3);
        cursor: nwse-resize;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        font-size: 12px;
        color: white;
        user-select: none;
        z-index: 10;
    `;
    
    // Add video size controls
    const sizeControls = document.createElement('div');
    sizeControls.className = 'video-size-controls';
    sizeControls.innerHTML = `
        <button class="size-control-btn minimize-btn" title="Minimize">_</button>
        <button class="size-control-btn maximize-btn" title="Maximize">□</button>
        <button class="size-control-btn fullscreen-btn" title="Fullscreen">⛶</button>
    `;
    sizeControls.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 10;
    `;
    
    element.appendChild(resizeHandle);
    element.appendChild(sizeControls);
    element.style.resize = 'both';
    element.style.overflow = 'auto';
    element.style.minWidth = '150px';
    element.style.minHeight = '100px';
    element.style.maxWidth = '90vw';
    element.style.maxHeight = '90vh';
    element.setAttribute('data-resizable', 'true');
    
    // Show controls on hover
    element.addEventListener('mouseenter', () => {
        sizeControls.style.opacity = '1';
    });
    
    element.addEventListener('mouseleave', () => {
        sizeControls.style.opacity = '0';
    });
    
    // Add double-click for fullscreen
    element.addEventListener('dblclick', function(e) {
        if (!e.target.closest('.video-size-controls')) {
            toggleVideoFullscreen(element);
        }
    });
    
    // Size control buttons
    const minimizeBtn = sizeControls.querySelector('.minimize-btn');
    const maximizeBtn = sizeControls.querySelector('.maximize-btn');
    const fullscreenBtn = sizeControls.querySelector('.fullscreen-btn');
    
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            element.classList.toggle('minimized');
            element.classList.remove('maximized');
        });
    }
    
    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            element.classList.toggle('maximized');
            element.classList.remove('minimized');
        });
    }
    
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const video = element.querySelector('video');
            if (video && video.requestFullscreen) {
                video.requestFullscreen();
            }
        });
    }
}

// Toggle video fullscreen
function toggleVideoFullscreen(element) {
    element.classList.toggle('maximized');
    if (element.classList.contains('maximized')) {
        element.classList.remove('minimized');
    }
}

// Make interface resizable
function makeInterfaceResizable(callInterface) {
    if (!callInterface || callInterface.hasAttribute('data-interface-resizable')) return;
    
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'interface-resize-handle';
    resizeHandle.style.cssText = `
        position: absolute;
        bottom: 0;
        right: 0;
        width: 15px;
        height: 15px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, #5865f2 50%);
        border-bottom-right-radius: 12px;
    `;
    
    callInterface.appendChild(resizeHandle);
    callInterface.setAttribute('data-interface-resizable', 'true');
    
    let isResizing = false;
    let startWidth = 0;
    let startHeight = 0;
    let startX = 0;
    let startY = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startWidth = parseInt(document.defaultView.getComputedStyle(callInterface).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(callInterface).height, 10);
        startX = e.clientX;
        startY = e.clientY;
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const newWidth = startWidth + e.clientX - startX;
        const newHeight = startHeight + e.clientY - startY;
        
        if (newWidth > 400 && newWidth < window.innerWidth * 0.9) {
            callInterface.style.width = newWidth + 'px';
        }
        if (newHeight > 300 && newHeight < window.innerHeight * 0.9) {
            callInterface.style.height = newHeight + 'px';
        }
    });
    
    document.addEventListener('mouseup', () => {
        isResizing = false;
    });
}



// =======================================================
// Mobile drawer: open/close channel list
// =======================================================
(() => {
  const panel = document.getElementById("channelList");
  const overlay = document.getElementById("drawerOverlay");
  const btn = document.getElementById("mobileMenuBtn");

  if (!panel || !overlay || !btn) return;

  const isMobile = () => window.matchMedia("(max-width: 820px)").matches;

  const openDrawer = () => {
    if (!isMobile()) return;
    panel.classList.add("is-open");
    overlay.classList.add("is-open");
  };

  const closeDrawer = () => {
    panel.classList.remove("is-open");
    overlay.classList.remove("is-open");
  };

  btn.addEventListener("click", () => {
    const opened = panel.classList.contains("is-open");
    if (opened) closeDrawer();
    else openDrawer();
  });

  overlay.addEventListener("click", closeDrawer);

  // Close drawer when user selects a channel/DM item
  panel.addEventListener("click", (e) => {
    const target = e.target;
    if (!target) return;
    const channelEl = target.closest(".channel");
    if (channelEl && isMobile()) closeDrawer();
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // Auto-close when leaving mobile size
  window.addEventListener("resize", () => {
    if (!isMobile()) closeDrawer();
  });
})();

// =======================================================
// Theme and Accent Color Switcher
// =======================================================

// Theme definitions with CSS variable values
const THEMES = {
    default: {
        '--bg-0': '#0a0f18',
        '--bg-1': '#0c1322',
        '--glass': 'rgba(16, 20, 30, .86)',
        '--glass-2': 'rgba(16, 20, 30, .76)',
        '--glass-strong': 'rgba(16, 20, 30, .92)',
        '--text': 'rgba(255,255,255,.92)',
        '--muted': 'rgba(255,255,255,.62)',
        '--muted-2': 'rgba(255,255,255,.48)',
        '--stroke': 'rgba(255,255,255,.08)',
        '--stroke-soft': 'rgba(255,255,255,.05)'
    },
    midnight: {
        '--bg-0': '#0a0a1a',
        '--bg-1': '#121226',
        '--glass': 'rgba(10, 10, 26, .86)',
        '--glass-2': 'rgba(18, 18, 38, .76)',
        '--glass-strong': 'rgba(10, 10, 26, .92)',
        '--text': 'rgba(255,255,255,.92)',
        '--muted': 'rgba(255,255,255,.62)',
        '--muted-2': 'rgba(255,255,255,.48)',
        '--stroke': 'rgba(255,255,255,.08)',
        '--stroke-soft': 'rgba(255,255,255,.05)'
    },
    forest: {
        '--bg-0': '#0a1a10',
        '--bg-1': '#0f2a1f',
        '--glass': 'rgba(10, 26, 16, .86)',
        '--glass-2': 'rgba(15, 42, 31, .76)',
        '--glass-strong': 'rgba(10, 26, 16, .92)',
        '--text': 'rgba(255,255,255,.92)',
        '--muted': 'rgba(255,255,255,.62)',
        '--muted-2': 'rgba(255,255,255,.48)',
        '--stroke': 'rgba(255,255,255,.08)',
        '--stroke-soft': 'rgba(255,255,255,.05)'
    },
    sunset: {
        '--bg-0': '#1a0a1a',
        '--bg-1': '#261212',
        '--glass': 'rgba(38, 18, 26, .86)',
        '--glass-2': 'rgba(48, 24, 36, .76)',
        '--glass-strong': 'rgba(48, 24, 36, .92)',
        '--text': 'rgba(255,255,255,.92)',
        '--muted': 'rgba(255,255,255,.62)',
        '--muted-2': 'rgba(255,255,255,.48)',
        '--stroke': 'rgba(255,255,255,.08)',
        '--stroke-soft': 'rgba(255,255,255,.05)'
    },
    ocean: {
        '--bg-0': '#0a1a26',
        '--bg-1': '#122626',
        '--glass': 'rgba(18, 38, 38, .86)',
        '--glass-2': 'rgba(24, 48, 48, .76)',
        '--glass-strong': 'rgba(24, 48, 48, .92)',
        '--text': 'rgba(255,255,255,.92)',
        '--muted': 'rgba(255,255,255,.62)',
        '--muted-2': 'rgba(255,255,255,.48)',
        '--stroke': 'rgba(255,255,255,.08)',
        '--stroke-soft': 'rgba(255,255,255,.05)'
    },
    coffee: {
        '--bg-0': '#261c14',
        '--bg-1': '#3c2a1f',
        '--glass': 'rgba(60, 42, 31, .86)',
        '--glass-2': 'rgba(72, 54, 43, .76)',
        '--glass-strong': 'rgba(72, 54, 43, .92)',
        '--text': 'rgba(255,255,255,.92)',
        '--muted': 'rgba(255,255,255,.62)',
        '--muted-2': 'rgba(255,255,255,.48)',
        '--stroke': 'rgba(255,255,255,.08)',
        '--stroke-soft': 'rgba(255,255,255,.05)'
    }
};

// Initialize theme system
function initializeThemeSystem() {
    // Load saved theme and accent color from localStorage
    let savedTheme = localStorage.getItem('selectedTheme') || 'default';
    
    // If the saved theme is 'light', reset to default since we removed it
    if (savedTheme === 'light') {
        savedTheme = 'default';
        localStorage.setItem('selectedTheme', 'default');
    }
    
    // Validate that the saved theme exists in our current themes
    const validThemes = Object.keys(THEMES);
    if (!validThemes.includes(savedTheme)) {
        savedTheme = 'default';
        localStorage.setItem('selectedTheme', 'default');
    }
    
    const savedAccent = localStorage.getItem('selectedAccent') || '#8b5cf6';
    const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
    
    // Apply saved theme
    applyTheme(savedTheme);
    
    // Wait a moment for theme to apply, then apply accent color and transparency
    setTimeout(() => {
        applyAccentColor(savedAccent);
        updateTransparency(savedTransparency);
    }, 50);
    
    // Highlight the selected theme and accent in the UI
    setTimeout(() => {
        highlightSelectedTheme(savedTheme);
        highlightSelectedAccent(savedAccent);
    }, 100);
    
    // Add event listeners for theme selector
    setupThemeSelector();
}

// Apply a theme by name
function applyTheme(themeName) {
    const theme = THEMES[themeName];
    if (!theme) return;
    
    const root = document.documentElement;
    for (const [property, value] of Object.entries(theme)) {
        root.style.setProperty(property, value);
    }
    
    // Update radial gradients in body background
    updateBodyBackground(themeName);
    
    // Update transparency after applying theme
    const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
    updateTransparency(savedTransparency);
    
    // Reapply accent color to ensure all elements update properly
    const savedAccent = localStorage.getItem('selectedAccent') || '#8b5cf6';
    setTimeout(() => {
        applyAccentColor(savedAccent);
    }, 30); // Small delay to ensure theme is applied first
}

// Apply accent color
function applyAccentColor(color) {
    const root = document.documentElement;
    root.style.setProperty('--accent', color);

    // Convert hex to RGB for rgba() usage
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);

    // Update accentB to be a lighter version of the accent color
    const accentB = lightenColor(color, 20);
    root.style.setProperty('--accentB', accentB);

    // Update accent-light to be a much lighter version for code
    const accentLight = lightenColor(color, 60);
    root.style.setProperty('--accent-light', accentLight);

    // Update transparent versions of accent colors
    const transparentAccent = hexToRgba(color, 0.26);
    const transparentAccentB = hexToRgba(accentB, 0.16);
    root.style.setProperty('--accent-transparent', transparentAccent);
    root.style.setProperty('--accentB-transparent', transparentAccentB);

    // Update other transparent accent variations
    const transparentAccent20 = hexToRgba(color, 0.20);
    const transparentAccent25 = hexToRgba(color, 0.25);
    const transparentAccent32 = hexToRgba(color, 0.32);
    const transparentAccent18 = hexToRgba(color, 0.18);

    root.style.setProperty('--accent-hover-bg', transparentAccent20);
    root.style.setProperty('--accent-border-focus', transparentAccent32);
    root.style.setProperty('--accent-shadow-focus', transparentAccent18);
    root.style.setProperty('--accent-reaction-hover', transparentAccent25);

    // Update body background to reflect new accent colors
    const currentTheme = localStorage.getItem('selectedTheme') || 'default';
    updateBodyBackground(currentTheme);

    // Also update transparency to ensure all glass effects are consistent
    const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
    setTimeout(() => {
        updateTransparency(savedTransparency);
    }, 10); // Very short delay to ensure accent colors are applied first
}

// Convert hex color to rgba with alpha
function hexToRgba(hex, alpha) {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Parse r, g, b values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Lighten a hex color by a percentage
function lightenColor(hex, percent) {
    // Convert hex to RGB
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    
    // Lighten each component
    r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
    g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
    b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Update body background based on theme and accent color
function updateBodyBackground(themeName) {
    const body = document.body;
    const theme = THEMES[themeName];
    const accentColor = document.documentElement.style.getPropertyValue('--accent') || '#8b5cf6';
    const accentBColor = document.documentElement.style.getPropertyValue('--accentB') || '#60a5fa';
    
    // Convert hex to rgba with opacity
    const accent18 = hexToRgbaWithOpacity(accentColor, 0.18);
    const accentB14 = hexToRgbaWithOpacity(accentBColor, 0.14);
    const good10 = 'rgba(34,197,94,.10)'; // Good color is not themed
    
    // For all themes, use the original gradient with dynamic accent colors
    body.style.background = `
        radial-gradient(1200px 800px at 15% 20%, ${accent18}, transparent 55%),
        radial-gradient(900px 700px at 85% 10%, ${accentB14}, transparent 55%),
        radial-gradient(900px 700px at 75% 85%, ${good10}, transparent 60%),
        linear-gradient(180deg, ${theme['--bg-0']}, ${theme['--bg-1']})
    `;
}

// Convert hex color to rgba with specific opacity
function hexToRgbaWithOpacity(hex, opacity) {
    // Remove # if present
    hex = hex.trim().replace('#', '');
    
    // Parse r, g, b values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Highlight the selected theme in the UI
function highlightSelectedTheme(themeName) {
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        option.classList.toggle('selected', option.dataset.theme === themeName);
    });
}

// Highlight the selected accent color in the UI
function highlightSelectedAccent(accentColor) {
    const accentColors = document.querySelectorAll('.accent-color');
    accentColors.forEach(color => {
        color.classList.toggle('selected', color.dataset.accent === accentColor);
    });
    
    // Update the custom color picker to match the selected color
    const customColorPicker = document.getElementById('customColorPicker');
    if (customColorPicker) {
        customColorPicker.value = accentColor;
    }
}

// Set up event listeners for the theme selector
function setupThemeSelector() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeSelector = document.getElementById('themeSelector');
    const transparencySlider = document.getElementById('transparencySlider');
    const transparencyValue = document.getElementById('transparencyValue');
    const customColorPicker = document.getElementById('customColorPicker');
    const applyCustomColorBtn = document.getElementById('applyCustomColorBtn');
    
    if (!themeToggleBtn || !themeSelector) {
        console.error('Theme toggle button or selector not found');
        return;
    }
    
    // Toggle theme selector visibility
    themeToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        themeSelector.classList.toggle('visible');
        
        // Update slider value from stored transparency
        if (transparencySlider) {
            const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
            transparencySlider.value = savedTransparency;
            if (transparencyValue) {
                transparencyValue.textContent = `${savedTransparency}%`;
            }
        }
        
        // Update custom color picker value from saved accent
        if (customColorPicker) {
            const savedAccent = localStorage.getItem('selectedAccent') || '#8b5cf6';
            customColorPicker.value = savedAccent;
        }
    });
    
    // Close theme selector when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!themeSelector.contains(e.target) && e.target !== themeToggleBtn) {
            themeSelector.classList.remove('visible');
        }
    });
    
    // Theme selection
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const themeName = option.dataset.theme;
            applyTheme(themeName);
            highlightSelectedTheme(themeName);
            
            // Save selected theme to localStorage
            localStorage.setItem('selectedTheme', themeName);
            
            // Force update transparency after theme change
            const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
            setTimeout(() => {
                updateTransparency(savedTransparency);
            }, 50); // Small delay to ensure theme is applied first
            
            // Close the selector after selection
            themeSelector.classList.remove('visible');
        });
    });
    
    // Accent color selection
    const accentColors = document.querySelectorAll('.accent-color');
    accentColors.forEach(color => {
        color.addEventListener('click', () => {
            const accentColor = color.dataset.accent;
            applyAccentColor(accentColor);
            highlightSelectedAccent(accentColor);
            
            // Save selected accent color to localStorage
            localStorage.setItem('selectedAccent', accentColor);
            
            // Update custom color picker to match
            if (customColorPicker) {
                customColorPicker.value = accentColor;
            }
            
            // Update transparency to ensure consistency
            const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
            setTimeout(() => {
                updateTransparency(savedTransparency);
            }, 30);
            
            // Close the selector after selection
            themeSelector.classList.remove('visible');
        });
    });
    
    // Custom color picker
    if (customColorPicker) {
        // Load saved accent color
        const savedAccent = localStorage.getItem('selectedAccent') || '#8b5cf6';
        customColorPicker.value = savedAccent;
    }
    
    // Apply custom color button
    if (applyCustomColorBtn && customColorPicker) {
        applyCustomColorBtn.addEventListener('click', () => {
            const customColor = customColorPicker.value;
            applyAccentColor(customColor);
            highlightSelectedAccent(customColor);
            
            // Save selected accent color to localStorage
            localStorage.setItem('selectedAccent', customColor);
            
            // Update transparency to ensure consistency
            const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
            setTimeout(() => {
                updateTransparency(savedTransparency);
            }, 30);
            
            // Close the selector after selection
            themeSelector.classList.remove('visible');
        });
    }
    
    // Transparency slider
    if (transparencySlider) {
        // Load saved transparency level
        const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
        transparencySlider.value = savedTransparency;
        if (transparencyValue) {
            transparencyValue.textContent = `${savedTransparency}%`;
        }
        
        // Update transparency when slider changes
        transparencySlider.addEventListener('input', (e) => {
            const transparency = e.target.value;
            if (transparencyValue) {
                transparencyValue.textContent = `${transparency}%`;
            }
            updateTransparency(transparency);
            
            // Save transparency level to localStorage
            localStorage.setItem('transparencyLevel', transparency);
        });
    }
}

// Update transparency levels for glass effects
function updateTransparency(level) {
    const root = document.documentElement;
    const currentTheme = localStorage.getItem('selectedTheme') || 'default';
    
    // Calculate opacity values based on the slider level
    // Level 50 = 0.50 opacity, Level 100 = 1.00 opacity
    const opacity = level / 100;
    
    // Base colors for different themes
    let baseR, baseG, baseB;
    
    if (currentTheme === 'midnight') {
        baseR = 10;
        baseG = 10;
        baseB = 26;
    } else if (currentTheme === 'forest') {
        baseR = 15;
        baseG = 42;
        baseB = 31;
    } else if (currentTheme === 'sunset') {
        baseR = 38;
        baseG = 18;
        baseB = 26;
    } else if (currentTheme === 'ocean') {
        baseR = 18;
        baseG = 38;
        baseB = 38;
    } else if (currentTheme === 'coffee') {
        baseR = 60;
        baseG = 42;
        baseB = 31;
    } else { // default dark theme
        baseR = 16;
        baseG = 20;
        baseB = 30;
    }
    
    // Update glass effect variables
    root.style.setProperty('--glass', `rgba(${baseR}, ${baseG}, ${baseB}, ${opacity})`);
    root.style.setProperty('--glass-2', `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.max(0.1, opacity - 0.1)})`);
    root.style.setProperty('--glass-strong', `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.min(0.98, opacity + 0.06)})`);
    
    // Trigger a reflow to force browser to update all elements
    document.body.offsetHeight;
}

// Initialize theme system when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeThemeSystem);



/* =========================
   i18n engine (Voxii)
   - supports: data-i18n, data-i18n-placeholder, data-i18n-title
   - updates: aria-label optionally, <html lang>, <title>
   - persists: localStorage("lang")
   ========================= */

(function(){
  const STORAGE_KEY = "lang";
  const FALLBACK_LANG = "en";

  function getDict(lang){
    const dict = window.I18N || {};
    return dict[lang] || dict[FALLBACK_LANG] || {};
  }

  function t(key, lang){
    // Если язык не указан, используем текущий
    if (!lang) {
      lang = getLang();
    }
    const dict = getDict(lang);
    if (key in dict) return dict[key];

    const fb = getDict(FALLBACK_LANG);
    if (key in fb) return fb[key];

    return key; // visible missing key
  }

  function getLang(){
    const saved = (localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    if (saved && window.I18N && window.I18N[saved]) return saved;

    const nav = (navigator.language || "").slice(0,2).toLowerCase();
    if (nav && window.I18N && window.I18N[nav]) return nav;

    return FALLBACK_LANG;
  }

  function setLang(lang){
    lang = (lang || "").toLowerCase();
    if (!window.I18N || !window.I18N[lang]) lang = FALLBACK_LANG;

    localStorage.setItem(STORAGE_KEY, lang);
    window.APP_LANG = lang;

    applyI18n(document, lang);
    updateLangButtons(lang);

    // if you render dynamic lists later, you can call this again after render
    // applyI18n(dmListContainer, lang)
  }

  function applyI18n(root = document, lang = getLang()){
    const html = document.documentElement;
    html.setAttribute("lang", lang);

    // Title + app title key
    document.title = t("app.title", lang) || "Voxii";

    // [data-i18n] => textContent
    root.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key, lang);
    });

    // [data-i18n-placeholder] => placeholder
    root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      el.setAttribute("placeholder", t(key, lang));
    });

    // [data-i18n-title] => title (and aria-label if it matches old title)
    root.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      if (!key) return;
      const val = t(key, lang);
      const oldTitle = el.getAttribute("title");
      el.setAttribute("title", val);

      // optional: keep aria-label in sync when it was same as title or empty
      const oldAria = el.getAttribute("aria-label");
      if (!oldAria || oldAria === oldTitle) el.setAttribute("aria-label", val);
    });
  }

  function updateLangButtons(lang){
    const ruBtn = document.getElementById("langRuBtn");
    const enBtn = document.getElementById("langEnBtn");
    if (ruBtn) ruBtn.classList.toggle("active", lang === "ru");
    if (enBtn) enBtn.classList.toggle("active", lang === "en");

    // optional: visual hint via aria-pressed
    if (ruBtn) ruBtn.setAttribute("aria-pressed", String(lang === "ru"));
    if (enBtn) enBtn.setAttribute("aria-pressed", String(lang === "en"));
  }

  function bindLangButtons(){
    const ruBtn = document.getElementById("langRuBtn");
    const enBtn = document.getElementById("langEnBtn");

    if (ruBtn) ruBtn.addEventListener("click", () => setLang("ru"));
    if (enBtn) enBtn.addEventListener("click", () => setLang("en"));
  }

  // expose small API
  window.i18n = { t, getLang, setLang, applyI18n };

  document.addEventListener("DOMContentLoaded", () => {
    bindLangButtons();
    setLang(getLang()); // applies + persists + highlights
  });
})();


/* =========================
   Mobile burger / drawer — matches your CSS (.is-open)
   Uses:
   - #drawerOverlay (.drawer-overlay.is-open)
   - #channelList (.channel-list.is-open)
   - #mobileMenuBtnChat, #mobileMenuBtnFriends
   Also uses:
   - html/body .drawer-open (body lock)
   ========================= */

(function(){
  const BP = 820;

  const $ = (id) => document.getElementById(id);

  function isMobile(){
    return window.innerWidth <= BP;
  }

  function openDrawer(){
    const drawer = $("channelList");
    const overlay = $("drawerOverlay");
    if (!drawer || !overlay) return;

    document.documentElement.classList.add("drawer-open");
    document.body.classList.add("drawer-open");

    drawer.classList.add("is-open");
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeDrawer(){
    const drawer = $("channelList");
    const overlay = $("drawerOverlay");
    if (!drawer || !overlay) return;

    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");

    document.documentElement.classList.remove("drawer-open");
    document.body.classList.remove("drawer-open");
  }

  function toggleDrawer(){
    const drawer = $("channelList");
    if (!drawer) return;
    drawer.classList.contains("is-open") ? closeDrawer() : openDrawer();
  }

  function bind(){
    const btnChat = $("mobileMenuBtnChat");
    const btnFriends = $("mobileMenuBtnFriends");
    const overlay = $("drawerOverlay");

    const onBurger = (e) => {
      if (!isMobile()) return;
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    };

    if (btnChat) btnChat.addEventListener("click", onBurger);
    if (btnFriends) btnFriends.addEventListener("click", onBurger);

    if (overlay){
      overlay.addEventListener("click", (e) => {
        e.preventDefault();
        closeDrawer();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });

    window.addEventListener("resize", () => {
      if (!isMobile()) closeDrawer();
    });

    // optional: close when user taps a DM/channel item inside drawer
    const drawer = $("channelList");
    if (drawer){
      drawer.addEventListener("click", (e) => {
        if (!isMobile()) return;
        const item = e.target.closest(".channel, .dm-item, .dm-entry, [role='listitem']");
        if (item) closeDrawer();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", bind);
  window.VoxiiDrawer = { openDrawer, closeDrawer, toggleDrawer };
})();




/* =========================
   Send button + Voice Record button behavior
   - Enter: send text
   - Shift+Enter: newline
   - Send button click: send text
   - Voice Record button: hold to record voice message
   - Toggle visibility based on text presence
   ========================= */

(function(){
  function getEl(id){ return document.getElementById(id); }

  function updateButtonVisibility(){
    const input = getEl("messageInput");
    const sendBtn = getEl("sendBtn");
    const voiceRecordBtn = getEl("voiceRecordBtn");
    if (!input || !sendBtn || !voiceRecordBtn) return;

    const hasText = input.value.trim().length > 0;

    // Показываем кнопку отправки когда есть текст, кнопку записи когда нет текста
    if (hasText) {
      sendBtn.style.display = 'inline-flex';
      voiceRecordBtn.style.display = 'none';
      sendBtn.classList.toggle("ready", true);
    } else {
      sendBtn.style.display = 'none';
      voiceRecordBtn.style.display = 'inline-flex';
      voiceRecordBtn.classList.remove('recording');
    }
  }

  function trySend(){
    const input = getEl("messageInput");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // ✅ ВАЖНО:
    // Подключи сюда твою реальную отправку.
    // Если у тебя уже есть функция sendMessage(), используй её.
    if (typeof window.sendMessage === "function") {
      window.sendMessage(text);
    } else if (typeof window.handleSendMessage === "function") {
      window.handleSendMessage(text);
    } else if (typeof sendMessage === "function") {
      sendMessage(text);
    } else {
      console.warn("No sendMessage() handler found. Hook it here.");
    }

    input.value = "";
    updateButtonVisibility();
  }

  // Track if we're currently handling a press/hover event for voice recording
  let isMouseDown = false;
  let isTouchDown = false;
  let pressTimer = null;
  let shouldPreventClick = false;

  document.addEventListener("DOMContentLoaded", () => {
    const input = getEl("messageInput");
    const sendBtn = getEl("sendBtn");
    const voiceRecordBtn = getEl("voiceRecordBtn");
    if (!input || !sendBtn || !voiceRecordBtn) return;

    input.addEventListener("input", updateButtonVisibility);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        trySend();
      }
    });

    // Send button click handler
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (input.value.trim()) {
        trySend();
      }
    });

    // Voice recording functionality
    voiceRecordBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      isMouseDown = true;
      shouldPreventClick = false;

      // Clear any existing timer
      if (pressTimer) clearTimeout(pressTimer);
      
      // Start timer to determine if it's a long press
      pressTimer = setTimeout(() => {
        shouldPreventClick = true;
        if (!isRecording) {
          startRecording();
        }
      }, 100);
    });

    // For touch events
    voiceRecordBtn.addEventListener("touchstart", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      isTouchDown = true;
      shouldPreventClick = false;

      // Clear any existing timer
      if (pressTimer) clearTimeout(pressTimer);
      
      // Start timer to determine if it's a long press
      pressTimer = setTimeout(() => {
        shouldPreventClick = true;
        if (!isRecording) {
          startRecording();
        }
      }, 100);
    });

    // Prevent click event if we're recording or if it was a long press
    voiceRecordBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      // Always prevent default click behavior for voice button
    });

    // Stop recording when mouse/touch is released
    document.addEventListener("mouseup", (e) => {
      if (isMouseDown) {
        isMouseDown = false;
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }

        if (isRecording) {
          stopRecording();
          shouldPreventClick = true;
        }

        // Reset prevent flag after a short delay
        setTimeout(() => {
          shouldPreventClick = false;
        }, 200);
      }
    });

    document.addEventListener("touchend", (e) => {
      if (isTouchDown) {
        isTouchDown = false;
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }

        if (isRecording) {
          stopRecording();
          shouldPreventClick = true;
        }

        // Reset prevent flag after a short delay
        setTimeout(() => {
          shouldPreventClick = false;
        }, 200);
      }
    });

    // Cancel recording if mouse leaves the button area
    voiceRecordBtn.addEventListener("mouseleave", () => {
      isMouseDown = false;
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }

      if (isRecording) {
        stopRecording();
        shouldPreventClick = true;
        setTimeout(() => {
          shouldPreventClick = false;
        }, 200);
      }
    });

    updateButtonVisibility();
  });

  // export if you want
  window.VoxiiSend = { trySend, updateButtonVisibility };
})();

// Функция для восстановления обработчиков голосовых сообщений
function restoreVoiceMessageHandlers() {
    if (window.voiceMessageElements) {
        window.voiceMessageElements.forEach(item => {
            const { audio, playBtn, speedBtn, durationDisplay } = item;
            
            if (audio && playBtn && speedBtn && durationDisplay) {
                // Проверяем, что элементы все еще находятся в DOM
                if (document.contains(audio) && document.contains(playBtn)) {
                    // Удаляем старые обработчики
                    const newPlayBtn = playBtn.cloneNode(true);
                    
                    // Восстанавливаем обработчики
                    let isPlaying = false;
                    newPlayBtn.addEventListener('click', () => {
                        if (isPlaying) {
                            audio.pause();
                            newPlayBtn.innerHTML = '▶';
                        } else {
                            audio.play();
                            newPlayBtn.innerHTML = '⏸';
                        }
                        isPlaying = !isPlaying;
                    });
                    
                    // Заменяем старую кнопку на новую с обработчиками
                    if (playBtn.parentNode) {
                        playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
                    }
                    
                    // Восстанавливаем обработчик скорости
                    const newSpeedBtn = speedBtn.cloneNode(true);
                    
                    let currentSpeed = 1;
                    const speeds = [0.5, 1, 1.25, 1.5, 2];
                    let speedIndex = 1; // Default to 1x
                    
                    newSpeedBtn.addEventListener('click', () => {
                        speedIndex = (speedIndex + 1) % speeds.length;
                        currentSpeed = speeds[speedIndex];
                        audio.playbackRate = currentSpeed;
                        newSpeedBtn.textContent = `${currentSpeed}x`;
                    });
                    
                    // Заменяем старую кнопку скорости на новую
                    if (speedBtn.parentNode) {
                        speedBtn.parentNode.replaceChild(newSpeedBtn, speedBtn);
                    }
                    
                    // Обновляем длительность при загрузке метаданных
                    if (audio.readyState >= 1) {
                        // Если аудио уже загружено, обновляем длительность
                        const minutes = Math.floor(audio.duration / 60);
                        const seconds = Math.floor(audio.duration % 60);
                        durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    } else {
                        // Если аудио еще не загружено, ждем события loadedmetadata
                        audio.addEventListener('loadedmetadata', function updateDuration() {
                            const minutes = Math.floor(audio.duration / 60);
                            const seconds = Math.floor(audio.duration % 60);
                            durationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                            audio.removeEventListener('loadedmetadata', updateDuration);
                        });
                    }
                }
            }
        });
    }
}

// Функция для выхода из голосового канала и корректного завершения соединений
function leaveVoiceChannel(isCalledFromRemote = false) {
    console.log('Leaving voice channel...');

    // Если это не вызвано удаленно, уведомляем других участников о выходе
    if (!isCalledFromRemote && socket && socket.connected) {
        Object.keys(peerConnections).forEach(socketId => {
            socket.emit('end-call', { to: socketId });
        });
    }

    // Закрываем все peer-соединения
    Object.keys(peerConnections).forEach(socketId => {
        const pc = peerConnections[socketId];
        if (pc) {
            pc.close();
        }
        delete peerConnections[socketId];
    });

    // Останавливаем все треки локального потока
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }

    // Останавливаем экранную запись, если активна
    if (screenStream) {
        screenStream.getTracks().forEach(track => {
            track.stop();
        });
        screenStream = null;
    }

    // Очищаем удаленные видео
    const remoteParticipants = document.getElementById('remoteParticipants');
    if (remoteParticipants) {
        remoteParticipants.innerHTML = '';
    }

    // Скрываем интерфейс звонка
    const callInterface = document.getElementById('callInterface');
    if (callInterface) {
        callInterface.classList.add('hidden');
    }

    // Сбрасываем состояние звонка
    inCall = false;
    window.currentCallDetails = null;

    console.log('Voice channel left successfully');
}
