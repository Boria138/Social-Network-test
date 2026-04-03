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
let iceRestartAttempts = {};
let iceRestartLocks = {};
let iceRestartTimers = {};
let makingOffers = {};
let ignoreIncomingOffers = {};
let settingRemoteAnswerPending = {};
let seenRemoteCandidates = {};
let screenAudioMixContext = null;
let screenAudioMixDestination = null;
let screenAudioMixNodes = [];
let isVideoEnabled = true;
let isAudioEnabled = true;
let isMuted = false;
let isDeafened = false;
let currentUser = null;
let socket = null;
let socketInitAttempts = 0;
let webrtcHandlersBound = false;
let token = null;
let currentView = 'friends';
let currentDMUserId = null;
// Store user information by socketId
let users = new Map();
// Переменная для отслеживания текущего режима (мобильный/десктопный)
let isMobileView = window.innerWidth <= 820;
// Переменная для отслеживания редактируемого сообщения
let editingMessageId = null;
let pinnedMessageIds = [];
let activePinnedMessageIndex = 0;
let uploadInFlightCount = 0;
let currentUploadKind = 'file';
let currentUploadLabel = '';
let currentChatSearchQuery = '';

// Variables for voice recording
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
const MIN_VOICE_BLOB_BYTES = 1024;
const MIN_VOICE_RECORDING_MS = 250;
const AUDIO_METADATA_TIMEOUT_MS = 5000;

// Link preview settings
let linkPreviewEnabled = true;
const hiddenPreviews = new Set();

// Notification service
let notificationService = null;
let notificationsUI = null;
let callMediaController = null;
const ICON_SVG = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3z"/></svg>',
    fullscreen: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 14H5v5h5v-2H7zm0-4h2V7h3V5H5zm10 7h-3v2h5v-5h-2zm0-12v2h-3v2h5V5z"/></svg>'
};

function parseTwemoji(root = document.body) {
    window.VoxiiTwemojiUI?.parse(root);
}

function queueTwemojiParse(node) {
    window.VoxiiTwemojiUI?.queueParse(node);
}

function initializeTwemojiRendering() {
    window.VoxiiTwemojiUI?.initialize();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeTwemojiRendering();

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
    notificationsUI = window.VoxiiNotificationsUI?.createController({
        getCurrentDMUserId: () => currentDMUserId,
        getCurrentView: () => currentView,
        getLastLoadedFriends: () => window.lastLoadedFriends,
        getService: () => notificationService,
        onCallUser: (userId, callType) => {
            initiateCall(userId, callType);
        },
        populateDMList,
        setService: (service) => {
            notificationService = service;
        }
    }) || null;

    updateUserInfo();
    initializeFriendsTabs();
    initializeMessageInput();
    initializeChatSearch();
    initializeUserControls();
    initializeCallControls();
    initializeFileUpload();
    initializeEmojiPicker();
    initializeDraggableCallWindow();
    initializeSettingsModal();
    initializeNotifications(); // Инициализация системы уведомлений
    initializeMobileKeyboardAvoidance();
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

function initializeMobileKeyboardAvoidance() {
    window.VoxiiMobileKeyboard?.initializeMessageKeyboardAvoidance();
}

function requestNotificationPermissionOnce() {
    notificationsUI?.requestPermissionOnce();
}

function requestNotificationPermission() {
    notificationsUI?.requestPermission();
}

function showNotification(title, body) {
    return notificationsUI?.showNotification(title, body) || null;
}

// ==========================================
// Notification System
// ==========================================

function initializeNotifications() {
    notificationsUI?.initialize();
}

function initializeNotificationsPanel() {
    notificationsUI?.initializePanel();
}

function updateNotificationBadge() {
    notificationsUI?.updateBadge();
}

function renderNotificationsList() {
    notificationsUI?.renderList();
}

function getTimeAgo(date) {
    return window.VoxiiNotificationsUI?.getTimeAgo(date) || '';
}

function addMessageNotification(sender, messageText, isDM = true) {
    notificationsUI?.addMessageNotification(sender, messageText, isDM);
}

function addCallNotification(fromUser, callType = 'voice') {
    notificationsUI?.addCallNotification(fromUser, callType);
}


function updateUserInfo() {
    const userAvatarContent = document.querySelector('.user-avatar .user-avatar-content');
    const username = document.querySelector('.username');

    if (userAvatarContent) userAvatarContent.textContent = currentUser.avatar;
    if (username) username.textContent = currentUser.username;
}

function renderRemoteParticipantStream({ peerId, stream, username }) {
    const remoteParticipants = document.getElementById('remoteParticipants');
    if (!remoteParticipants || !peerId || !stream) return;

    let participantDiv = document.getElementById(`participant-${peerId}`);
    let remoteVideo = document.getElementById(`remote-${peerId}`);

    if (!participantDiv) {
        participantDiv = document.createElement('div');
        participantDiv.className = 'participant';
        participantDiv.id = `participant-${peerId}`;

        remoteVideo = document.createElement('video');
        remoteVideo.id = `remote-${peerId}`;
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.muted = false;
        remoteVideo.volume = isDeafened ? 0 : 1;

        const participantName = document.createElement('div');
        participantName.className = 'participant-name';
        participantName.textContent = username || (window.i18n ? window.i18n.t('chat.participant') : 'Participant');

        participantDiv.appendChild(remoteVideo);
        participantDiv.appendChild(participantName);
        remoteParticipants.appendChild(participantDiv);
        makeResizable(participantDiv);
    }

    if (remoteVideo) {
        remoteVideo.srcObject = stream;
        remoteVideo.play().catch(() => {});
    }
}

function removeRemoteParticipant(peerId) {
    if (!peerId) return;
    const participant = document.getElementById(`participant-${peerId}`);
    if (participant) {
        participant.remove();
    }
}

function setupCallMediaController() {
    if (!socket || callMediaController || !window.VoxiiMediasoupCalls) return;

    callMediaController = window.VoxiiMediasoupCalls.createController({
        onPeerClosed: removeRemoteParticipant,
        onRemoteStream: renderRemoteParticipantStream,
        socket
    });
}

async function startCallMediaSession(callId) {
    if (!callId || !localStream) return;
    setupCallMediaController();
    if (!callMediaController) return;
    await callMediaController.start(callId, localStream);
}

function connectToSocketIO() {
    if (typeof io === 'undefined') {
        socketInitAttempts += 1;
        if (socketInitAttempts <= 10) {
            setTimeout(connectToSocketIO, 300);
            return;
        }
        console.error('Socket.IO client is not loaded');
        return;
    }

    socketInitAttempts = 0;
    const apiUrl = getApiUrl();
    const socketOpts = {
        auth: { token: token },
        ...(window.APP_CONFIG?.SOCKET_OPTIONS || {})
    };
    socket = apiUrl ? io(apiUrl, socketOpts) : io(socketOpts);
    setupCallMediaController();
    registerWebRTCSignalingHandlers();
    
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
                    pinned: Boolean(data.message.pinned),
                    pinnedAt: data.message.pinnedAt || null,
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
                const attachmentLabel = window.i18n ? window.i18n.t('chat.attachment') : 'Attachment';
                const messageText = data.message.text || (data.message.file ? `📎 ${attachmentLabel}` : '');
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
                    pinned: Boolean(data.message.pinned),
                    pinnedAt: data.message.pinnedAt || null,
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

    socket.on('dm-pin-updated', (data) => {
            if (currentView === 'dm' && currentDMUserId) {
                updateMessagePinInUI(data.messageId, data.pinned, data.pinnedAt);
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
            const { from, type, callId } = data;
            if (from) {
                // Добавляем уведомление о входящем звонке
                addCallNotification(from, type);
                showIncomingCall(from, type, callId);
            }
        });

    socket.on('call-accepted', async (data) => {
            console.log('Call accepted by:', data.from);
            if (window.currentCallDetails) {
                window.currentCallDetails.callId = data.callId;
                window.currentCallDetails.participants = data.participants || window.currentCallDetails.participants || [];
            }
            const connectedWithLabel = window.i18n ? window.i18n.t('chat.connectedWith') : 'Connected with';
            document.querySelector('.call-channel-name').textContent = `${connectedWithLabel} ${data.from.username}`;
            await startCallMediaSession(data.callId);
        });
        
    // Обработка присоединения к существующему звонку
    socket.on('join-existing-call', (data) => {
            const { callId, participants, type } = data;
            console.log('Joining existing call:', callId);
            
            // Присоединяемся к существующему звонку
            joinExistingCall({
                id: participants.find(id => id !== currentUser.id), // Находим другого участника
                username: window.i18n ? window.i18n.t('chat.participant') : 'Participant' // Временное имя, нужно получить настоящее
            }, callId, type);
        });

    socket.on('call-rejected', (data) => {
            const callDeclinedMessage = window.i18n ? window.i18n.t('call.declined') : 'Call was declined';
            alert(callDeclinedMessage);
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
            removeRemoteParticipant(data.from);
            leaveVoiceChannel(true);
        });

    socket.on('user-left-call', (data) => {
            removeRemoteParticipant(data.socketId);
            if (window.currentCallDetails?.participants) {
                window.currentCallDetails.participants = window.currentCallDetails.participants
                    .filter(id => id !== data.userId);
            }
            if (!window.currentCallDetails?.participants?.length) {
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
                    const noOneOnlineText = window.i18n ? window.i18n.t('friends.noOneOnline') : 'No one is online';
                    onlineList.innerHTML = `<div class="friends-empty">${noOneOnlineText}</div>`;
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
        if (from?.username) {
            document.querySelector('.call-channel-name').textContent = from.username;
        }
    });
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

async function loadNewsReactionsFromServer(newsIds) {
    if (!Array.isArray(newsIds) || newsIds.length === 0) {
        return {};
    }

    try {
        const response = await fetch(`${getApiUrl()}/api/news/reactions?ids=${encodeURIComponent(newsIds.join(','))}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            return {};
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading news reactions:', error);
        return {};
    }
}

// Преобразование новости в сообщение канала
function newsToChannelMessage(news) {
    const title = news.title || `Version ${news.version}`;
    const content = `**${title}**\n\n${news.changes.map(c => `• ${c}`).join('\n')}`;
    return {
        id: `news-${news.id}`,
        content: content,
        username: window.i18n ? window.i18n.t('chat.systemUser') : 'System',
        avatar: '📢',
        created_at: news.date + 'T00:00:00.000Z',
        file: null,
        reactions: [],
        replyTo: null,
        isNews: true
    };
}

function formatSubscribersCount(count) {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const lang = window.i18n && typeof window.i18n.getLang === 'function' ? window.i18n.getLang() : 'en';

    if (lang === 'ru') {
        const mod10 = safeCount % 10;
        const mod100 = safeCount % 100;
        let key = 'chat.subscriber.many';
        if (mod10 === 1 && mod100 !== 11) {
            key = 'chat.subscriber.one';
        } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
            key = 'chat.subscriber.few';
        }
        const word = window.i18n ? window.i18n.t(key) : 'подписчиков';
        return `${safeCount} ${word}`;
    }

    const enKey = safeCount === 1 ? 'chat.subscriber.one' : 'chat.subscriber.many';
    const enWord = window.i18n ? window.i18n.t(enKey) : (safeCount === 1 ? 'subscriber' : 'subscribers');
    return `${safeCount} ${enWord}`;
}

// Открытие системного канала (аналогично startSelfChat)
async function openSystemChannel() {
    if (!systemChannelId) {
        console.error('systemChannelId not set');
        return;
    }
    
    currentView = 'channel';
    const newsChannelName = window.i18n ? window.i18n.t('chat.news') : 'News';
    const loadingText = window.i18n ? window.i18n.t('chat.loading') : 'Loading...';
    currentChannel = { id: systemChannelId, name: newsChannelName, type: 'system' };
    hidePinnedMessageBanner();
    
    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');
    const serverName = document.getElementById('serverName');
    const chatHeaderInfo = document.getElementById('chatHeaderInfo');
    const messageInputContainer = document.querySelector('.message-input-container');
    
    if (friendsView) friendsView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';
    if (dmListView) dmListView.style.display = 'block';
    if (serverName) {
        serverName.setAttribute('data-i18n', 'chat.news');
        serverName.textContent = newsChannelName;
    }
    if (chatHeaderInfo) {
        chatHeaderInfo.innerHTML = `
            <div class="channel-icon" style="margin-right: 8px;">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
            </div>
            <div style="display: flex; flex-direction: column;">
                <span class="channel-name" data-i18n="chat.news">${newsChannelName}</span>
                <span class="channel-subscribers" data-i18n="chat.loading" style="font-size: 12px; color: rgba(255,255,255,0.5);">${loadingText}</span>
            </div>
        `;
        if (window.i18n && typeof window.i18n.applyI18n === 'function') {
            window.i18n.applyI18n(chatHeaderInfo);
        }
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
        messageInput.placeholder = window.i18n ? window.i18n.t('chat.newsReadOnly') : 'News is read-only';
    }
    
    // Загружаем количество подписчиков
    try {
        const response = await fetch(`${getApiUrl()}/api/channels/system`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const channel = await response.json();
            const subscribersEl = document.querySelector('.channel-subscribers');
            if (subscribersEl && channel && channel.subscriberCount !== undefined && channel.subscriberCount !== null) {
                subscribersEl.setAttribute('data-subscriber-count', String(channel.subscriberCount));
                subscribersEl.textContent = formatSubscribersCount(channel.subscriberCount);
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
        const newsIds = news.map(item => `news-${item.id}`);
        const newsReactionsMap = await loadNewsReactionsFromServer(newsIds);
        const newsMessages = news.map(item => {
            const message = newsToChannelMessage(item);
            message.reactions = newsReactionsMap[message.id] || [];
            return message;
        });
        
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
        const allMessages = [...newsMessages, ...apiMessages].sort((a, b) => 
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
        const newsLoadFailed = window.i18n ? window.i18n.t('errors.newsLoadFailed') : 'Failed to load news';
        messagesContainer.innerHTML = `<div class="error-messages">${newsLoadFailed}</div>`;
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
    const formattedText = formatQuotedText(message.content);
    const reactions = Array.isArray(message.reactions) ? message.reactions : [];

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
            <div class="reactions-and-actions-container">
                <div class="message-reactions"></div>
                <div class="message-actions">
                    <button class="add-reaction-btn" title="${window.i18n ? window.i18n.t('actions.emoji') : 'Add reaction'}">😊</button>
                </div>
            </div>
        </div>
    `;

    messagesContainer.appendChild(div);

    const reactionsContainer = div.querySelector('.message-reactions');
    const addReactionBtn = div.querySelector('.add-reaction-btn');
    reactions.forEach(reaction => {
        const reactionEl = document.createElement('div');
        reactionEl.className = 'reaction';
        reactionEl.innerHTML = `${reaction.emoji} <span>${reaction.count}</span>`;
        reactionEl.title = reaction.users;
        reactionEl.addEventListener('click', () => {
            if (socket && socket.connected) {
                socket.emit('remove-reaction', { messageId: message.id, emoji: reaction.emoji });
            }
        });
        reactionsContainer.appendChild(reactionEl);
    });
    if (addReactionBtn) {
        addReactionBtn.onclick = () => showEmojiPickerForMessage(message.id);
    }

    const newsTextEl = div.querySelector('.message-text');
    if (newsTextEl) {
        applyHashtagLinks(newsTextEl);
    }

    if (currentChatSearchQuery.trim()) {
        applyChatSearchFilter(currentChatSearchQuery);
    }
    
    // Применяем Twemoji к сообщению
    if (typeof twemoji !== 'undefined') {
        parseTwemoji(div);
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
        <span class="channel-name" data-i18n="chat.news">${window.i18n ? window.i18n.t('chat.news') : 'News'}</span>
    `;
    systemChannelEl.addEventListener('click', () => {
        console.log('System channel clicked');
        openSystemChannel();
    });
    if (window.i18n && typeof window.i18n.applyI18n === 'function') {
        window.i18n.applyI18n(systemChannelEl);
    }

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
        const noMessagesText = window.i18n ? window.i18n.t('chat.noMessagesYet') : 'No messages yet. Be the first to say hello!';
        messagesContainer.innerHTML = `<div class="no-messages">${noMessagesText}</div>`;
        return;
    }
    
    messages.forEach(msg => {
        const messageEl = createChannelMessageElement(msg);
        messagesContainer.appendChild(messageEl);
    });

    if (currentChatSearchQuery.trim()) {
        applyChatSearchFilter(currentChatSearchQuery);
    }
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Обновляем placeholder
    if (messageInput) {
        const messageToChannelText = window.i18n ? window.i18n.t('chat.messageToChannel') : 'Message';
        messageInput.placeholder = `${messageToChannelText} #${currentChannel?.name || 'channel'}...`;
    }
}

// Создание элемента сообщения канала
function createChannelMessageElement(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    div.setAttribute('data-message-id', msg.id);
    const messageContent = typeof msg.content === 'string' ? msg.content : '';
    const hasMessageContent = messageContent.trim().length > 0;
    
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
            ${hasMessageContent ? `<div class="message-text">${escapeHtml(messageContent)}</div>` : ''}
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

    const channelTextEl = div.querySelector('.message-text');
    if (channelTextEl) {
        applyHashtagLinks(channelTextEl);
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
        const noFriendsYetText = window.i18n ? window.i18n.t('friends.noFriendsYet') : 'No friends yet';
        onlineList.innerHTML = `<div class="friends-empty">${noFriendsYetText}</div>`;
        allList.innerHTML = `<div class="friends-empty">${noFriendsYetText}</div>`;
        return;
    }
    
    const onlineFriends = friends.filter(f => f.status === 'Online');
    
    if (onlineFriends.length === 0) {
        const noOneOnlineText = window.i18n ? window.i18n.t('friends.noOneOnline') : 'No one is online';
        onlineList.innerHTML = `<div class="friends-empty">${noOneOnlineText}</div>`;
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
    const friendStatus = String(friend.status || '');
    const friendStatusText = friendStatus === 'Online'
        ? (window.i18n ? window.i18n.t('status.online') : 'Online')
        : (friendStatus === 'Offline'
            ? (window.i18n ? window.i18n.t('status.offline') : 'Offline')
            : friendStatus);

    div.innerHTML = `
        <div class="friend-avatar">
            <div class="friend-avatar-content">${friend.avatar || friend.username.charAt(0).toUpperCase()}</div>
        </div>
        <div class="friend-info">
            <div class="friend-name">${friend.username}</div>
            <div class="friend-status ${friend.status === 'Online' ? '' : 'offline'}">${friendStatusText}</div>
        </div>
        <div class="friend-actions">
            <button class="friend-action-btn message" title="${window.i18n ? window.i18n.t('chat.messageTo') : 'Message'}">💬</button>
            <button class="friend-action-btn audio-call" title="${window.i18n ? window.i18n.t('call.missedType.audio') : 'Audio'}">📞</button>
            <button class="friend-action-btn video-call" title="${window.i18n ? window.i18n.t('call.missedType.video') : 'Video'}">📹</button>
            <button class="friend-action-btn remove" title="${window.i18n ? window.i18n.t('actions.delete') : 'Remove'}">🗑️</button>
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
        const noUsersFoundText = window.i18n ? window.i18n.t('friends.noUsersFound') : 'No users found';
        resultsDiv.innerHTML = `<div class="friends-empty">${noUsersFoundText}</div>`;
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
            <button class="add-friend-btn" onclick="sendFriendRequest(${user.id})">${window.i18n ? window.i18n.t('friends.add') : 'Add Friend'}</button>
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
            alert(window.i18n ? window.i18n.t('friends.requestSent') : 'Friend request sent!');
        } else {
            const error = await response.json();
            alert(error.error || (window.i18n ? window.i18n.t('errors.sendRequestFailed') : 'Failed to send request'));
        }
    } catch (error) {
        console.error('Error sending friend request:', error);
        alert(window.i18n ? window.i18n.t('friends.sendRequestFailed') : 'Failed to send friend request');
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
            const noPendingRequestsText = window.i18n ? window.i18n.t('friends.noPendingRequests') : 'No pending requests';
            pendingList.innerHTML = `<div class="friends-empty">${noPendingRequestsText}</div>`;
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
                    <div class="friend-status">${window.i18n ? window.i18n.t('friends.incomingRequest') : 'Incoming Friend Request'}</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn accept" onclick="acceptFriendRequest(${request.id})" aria-label="${window.i18n ? window.i18n.t('call.accept') : 'Accept'}">${ICON_SVG.check}</button>
                    <button class="friend-action-btn reject" onclick="rejectFriendRequest(${request.id})" aria-label="${window.i18n ? window.i18n.t('call.decline') : 'Reject'}">${ICON_SVG.close}</button>
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
    if (!confirm(window.i18n ? window.i18n.t('friends.removeConfirm') : 'Are you sure you want to remove this friend?')) return;

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
        updateLocalVideoPreview(localVideo, localStream);

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
            }, (response = {}) => {
                if (response.callId && window.currentCallDetails) {
                    window.currentCallDetails.callId = response.callId;
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
        alert(window.i18n ? window.i18n.t('call.accessDenied') : 'Failed to access camera/microphone. Please check permissions.');
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

        if (window.currentCallDetails && !window.currentCallDetails.participants.includes(friendId)) {
            window.currentCallDetails.participants.push(friendId);
        }

        socket.emit('invite-to-call', {
            to: friendId,
            callId: window.currentCallDetails ? window.currentCallDetails.callId : null,
            type: type,
            inviter: {
                id: currentUser.id,
                username: currentUser.username
            }
        });
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
function showIncomingCall(caller, type, callId) {
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
        await acceptCall(caller, type, callId);
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

        const joinedCallWithLabel = window.i18n ? window.i18n.t('chat.joinedCallWith') : 'Joined call with';
        const participantLabel = inviter.username || (window.i18n ? window.i18n.t('chat.participant') : 'Participant');
        document.querySelector('.call-channel-name').textContent = `${joinedCallWithLabel} ${participantLabel}`;

        const localVideo = document.getElementById('localVideo');
        updateLocalVideoPreview(localVideo, localStream);

        // Store call details
        window.currentCallDetails = {
            callId: callId,
            type: type,
            isInitiator: false,
            originalType: type,
            participants: [inviter.id] // Инициализируем списком участников
        };

        inCall = true;
        isVideoEnabled = type === 'video';
        isAudioEnabled = true;
        updateCallButtons();
        await startCallMediaSession(callId);

        // Initialize resizable functionality after a short delay
        setTimeout(() => {
            if (typeof initializeResizableVideos === 'function') {
                initializeResizableVideos();
            }
        }, 100);

    } catch (error) {
        console.error('Error joining call:', error);
        alert(window.i18n ? window.i18n.t('call.accessDenied') : 'Failed to access camera/microphone. Please check permissions.');
    }
}

// Accept incoming call
async function acceptCall(caller, type, callId) {
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
        
        const callWithLabel = window.i18n ? window.i18n.t('chat.callWith') : 'Call with';
        document.querySelector('.call-channel-name').textContent = `${callWithLabel} ${caller.username}`;
        
        const localVideo = document.getElementById('localVideo');
        updateLocalVideoPreview(localVideo, localStream);
        
        // Store call details
        window.currentCallDetails = {
            callId: callId,
            peerId: caller.socketId,
            type: type,
            isInitiator: false,
            originalType: type,
            participants: [caller.id] // Добавляем инициатора в список участников
        };
        
        if (socket && socket.connected) {
            socket.emit('accept-call', {
                callId,
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
        
        // Initialize resizable functionality after a short delay
        setTimeout(() => {
            if (typeof initializeResizableVideos === 'function') {
                initializeResizableVideos();
            }
        }, 100);
        
    } catch (error) {
        console.error('Error accepting call:', error);
        alert(window.i18n ? window.i18n.t('call.accessDenied') : 'Failed to access camera/microphone. Please check permissions.');
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
        const messageToText = window.i18n ? window.i18n.t('chat.messageTo') : 'Message';
        messageInput.placeholder = `${messageToText} @${friendUsername}`;
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
        messageInput.placeholder = window.i18n ? window.i18n.t('chat.messageYourself') : 'Message yourself...';
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
    ensurePinnedMessagesBlock();

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
            isVoiceMessage: isVoiceMessage, // Определяем, является ли это голосовым сообщением
            pinned: Boolean(message.pinned),
            pinnedAt: message.pinnedAt || null
        });
    });

    rebuildPinnedMessagesBlock();
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
    hidePinnedMessageBanner();

    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');
    const serverName = document.getElementById('serverName');
    const friendsBtn = document.getElementById('friendsBtn');
    const messageInputContainer = document.querySelector('.message-input-container');

    if (friendsView) friendsView.style.display = 'flex';
    if (chatView) chatView.style.display = 'none';
    if (dmListView) dmListView.style.display = 'block';
    if (serverName) {
        serverName.setAttribute('data-i18n', 'nav.friends');
        serverName.textContent = window.i18n ? window.i18n.t('nav.friends') : 'Friends';
    }
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

function initializeChatSearch() {
    const searchInput = document.getElementById('chatSearchInput');
    const clearBtn = document.getElementById('chatSearchClearBtn');
    if (!searchInput || !clearBtn) return;

    searchInput.addEventListener('input', () => {
        setChatSearchQuery(searchInput.value || '');
    });

    clearBtn.addEventListener('click', () => {
        setChatSearchQuery('');
        searchInput.focus();
    });

    setChatSearchQuery(currentChatSearchQuery || '');

    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.addEventListener('click', (event) => {
            const hashtagEl = event.target.closest('.hashtag-link');
            if (!hashtagEl) return;
            event.preventDefault();
            const hashtag = hashtagEl.getAttribute('data-hashtag') || hashtagEl.textContent || '';
            if (!hashtag) return;
            setChatSearchQuery(hashtag.startsWith('#') ? hashtag : `#${hashtag}`);
        });
    }
}

function setChatSearchQuery(query) {
    const searchInput = document.getElementById('chatSearchInput');
    const clearBtn = document.getElementById('chatSearchClearBtn');
    const nextQuery = String(query || '');

    if (searchInput && searchInput.value !== nextQuery) {
        searchInput.value = nextQuery;
    }

    currentChatSearchQuery = nextQuery;
    applyChatSearchFilter(nextQuery);

    if (clearBtn) {
        clearBtn.style.visibility = nextQuery.trim() ? 'visible' : 'hidden';
    }
}

function applyHashtagLinks(root) {
    if (!root) return;

    const hashtagRegex = /#[A-Za-z0-9_\-\u0400-\u04FF]+/g;
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.includes('#')) return NodeFilter.FILTER_REJECT;
            const parentEl = node.parentElement;
            if (!parentEl) return NodeFilter.FILTER_REJECT;
            if (parentEl.closest('a, pre, code, .md-code-block, .hashtag-link')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }

    textNodes.forEach((node) => {
        const text = node.nodeValue || '';
        hashtagRegex.lastIndex = 0;
        if (!hashtagRegex.test(text)) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        hashtagRegex.lastIndex = 0;
        let match = hashtagRegex.exec(text);

        while (match) {
            const hashtag = match[0];
            const index = match.index;
            const prevChar = index > 0 ? text[index - 1] : '';
            const isBoundary = !prevChar || /\s|[\(\[\{>"'.,!?;:]/.test(prevChar);
            if (!isBoundary) {
                match = hashtagRegex.exec(text);
                continue;
            }

            if (index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
            }

            const link = document.createElement('a');
            link.href = '#';
            link.className = 'hashtag-link';
            link.setAttribute('data-hashtag', hashtag);
            link.textContent = hashtag;
            fragment.appendChild(link);
            lastIndex = index + hashtag.length;

            match = hashtagRegex.exec(text);
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        if (node.parentNode) {
            node.parentNode.replaceChild(fragment, node);
        }
    });
}

function escapeSearchRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clearChatSearchHighlights() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.querySelectorAll('.search-highlight').forEach((highlightEl) => {
        const parent = highlightEl.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(highlightEl.textContent || ''), highlightEl);
        parent.normalize();
    });
}

function highlightTextInElement(root, regex) {
    if (!root || !regex) return;

    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            if (node.parentElement && node.parentElement.closest('.search-highlight')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }

    textNodes.forEach((node) => {
        const text = node.nodeValue || '';
        regex.lastIndex = 0;
        if (!regex.test(text)) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        regex.lastIndex = 0;
        let match = regex.exec(text);

        while (match) {
            const matchIndex = match.index;
            const matchText = match[0];
            if (matchIndex > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
            }

            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = matchText;
            fragment.appendChild(mark);
            lastIndex = matchIndex + matchText.length;

            if (matchText.length === 0) break;
            match = regex.exec(text);
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        if (node.parentNode) {
            node.parentNode.replaceChild(fragment, node);
        }
    });
}

function applyChatSearchFilter(query) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const normalizedQuery = String(query || '').trim().toLowerCase();
    const messages = container.querySelectorAll(':scope > .message-group, :scope > .message');

    clearChatSearchHighlights();

    if (!normalizedQuery) {
        messages.forEach((messageEl) => {
            messageEl.classList.remove('search-hidden');
        });
        return;
    }

    const hashtagRegex = /#[A-Za-z0-9_\-\u0400-\u04FF]+/g;
    let highlightRegex = null;

    messages.forEach((messageEl) => {
        const textContent = (messageEl.textContent || '').toLowerCase();
        let isMatch = false;

        if (normalizedQuery.startsWith('#')) {
            const hashtagQuery = normalizedQuery.slice(1).trim();
            if (!hashtagQuery) {
                isMatch = hashtagRegex.test(textContent);
                hashtagRegex.lastIndex = 0;
                highlightRegex = /#[A-Za-z0-9_\-\u0400-\u04FF]+/g;
            } else {
                const hashtagToken = `#${hashtagQuery}`;
                isMatch = textContent.includes(hashtagToken);
                highlightRegex = new RegExp(escapeSearchRegExp(hashtagToken), 'gi');
            }
        } else {
            isMatch = textContent.includes(normalizedQuery);
            highlightRegex = new RegExp(escapeSearchRegExp(normalizedQuery), 'gi');
        }

        messageEl.classList.toggle('search-hidden', !isMatch);
        if (!isMatch || !highlightRegex) return;

        const highlightTargets = messageEl.querySelectorAll('.message-text, .reply-text, .message-author, .file-info, .file-link, .file-content-preview');
        highlightTargets.forEach((target) => {
            highlightTextInElement(target, highlightRegex);
        });
    });
}

function getUploadStatusElement() {
    const messageInputContainer = document.querySelector('.message-input-container');
    if (!messageInputContainer) return null;

    const existingStatusEl = document.getElementById('uploadStatusIndicator');
    if (existingStatusEl) return existingStatusEl;

    const statusEl = document.createElement('div');
    statusEl.id = 'uploadStatusIndicator';
    statusEl.className = 'upload-status';
    statusEl.innerHTML = `
        <div class="upload-status-head">
            <span class="upload-status-text"></span>
            <span class="upload-status-percent">0%</span>
        </div>
        <div class="upload-status-track">
            <div class="upload-status-fill"></div>
        </div>
    `;
    messageInputContainer.appendChild(statusEl);
    return statusEl;
}

function updateUploadProgress(percent) {
    const statusEl = getUploadStatusElement();
    if (!statusEl) return;

    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
    const fillEl = statusEl.querySelector('.upload-status-fill');
    const percentEl = statusEl.querySelector('.upload-status-percent');
    if (fillEl) fillEl.style.width = `${safePercent}%`;
    if (percentEl) percentEl.textContent = `${safePercent}%`;
}

function setUploadState(active, kind = 'file', label = '') {
    if (active) {
        uploadInFlightCount += 1;
        currentUploadKind = kind;
        currentUploadLabel = label || '';
    } else {
        uploadInFlightCount = Math.max(0, uploadInFlightCount - 1);
    }

    const statusEl = getUploadStatusElement();
    const attachBtn = document.querySelector('.attach-btn');
    const voiceRecordBtn = document.getElementById('voiceRecordBtn');
    const isUploading = uploadInFlightCount > 0;

    if (attachBtn) attachBtn.disabled = isUploading;
    if (voiceRecordBtn) voiceRecordBtn.disabled = isUploading;

    if (!statusEl) return;

    if (!isUploading) {
        statusEl.classList.remove('is-visible');
        const textEl = statusEl.querySelector('.upload-status-text');
        if (textEl) textEl.textContent = '';
        updateUploadProgress(0);
        return;
    }

    const statusKey = currentUploadKind === 'voice'
        ? 'upload.voiceInProgress'
        : 'upload.fileInProgress';
    const statusText = window.i18n ? window.i18n.t(statusKey) : (currentUploadKind === 'voice' ? 'Uploading voice message...' : 'Uploading file...');
    const statusLabel = currentUploadLabel ? `${statusText} ${currentUploadLabel}` : statusText;
    const textEl = statusEl.querySelector('.upload-status-text');
    if (textEl) textEl.textContent = statusLabel;
    updateUploadProgress(0);
    statusEl.classList.add('is-visible');
}

async function uploadWithProgress(formData, onProgress) {
    return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${getApiUrl()}/api/upload`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable || typeof onProgress !== 'function') return;
            const percent = (event.loaded / event.total) * 100;
            onProgress(percent);
        };

        xhr.onload = () => {
            let parsed = null;
            try {
                parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch (error) {
                parsed = null;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(parsed);
                return;
            }

            const errorMessage = parsed && parsed.error ? parsed.error : 'Upload failed';
            reject(new Error(errorMessage));
        };

        xhr.onerror = () => {
            reject(new Error('Upload failed'));
        };

        xhr.send(formData);
    });
}

// Voice recording functions
function isValidAudioDuration(duration) {
    return Number.isFinite(duration) && duration > 0;
}

function formatAudioDuration(duration) {
    const safeDuration = isValidAudioDuration(duration) ? duration : 0;
    const minutes = Math.floor(safeDuration / 60);
    const seconds = Math.floor(safeDuration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Convert decoded audio data to a WAV blob.
 * @param {AudioBuffer} audioBuffer
 * @returns {Blob}
 */
function encodeWavFromAudioBuffer(audioBuffer) {
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bytesPerSample = 2;
    const dataSize = length * channels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, value) => {
        for (let i = 0; i < value.length; i += 1) {
            view.setUint8(offset + i, value.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let index = 0; index < length; index += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[index]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += bytesPerSample;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Read audio metadata and return duration for a blob.
 * @param {Blob} blob
 * @returns {Promise<number>}
 */
async function getAudioDurationFromBlob(blob) {
    return await new Promise((resolve, reject) => {
        const audio = new Audio();
        const objectUrl = URL.createObjectURL(blob);
        let finished = false;
        const timeoutId = setTimeout(() => {
            if (finished) return;
            finished = true;
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Audio metadata timeout'));
        }, AUDIO_METADATA_TIMEOUT_MS);

        const cleanup = () => {
            clearTimeout(timeoutId);
            URL.revokeObjectURL(objectUrl);
        };

        audio.addEventListener('loadedmetadata', () => {
            if (finished) return;
            finished = true;
            const duration = audio.duration;
            cleanup();
            resolve(duration);
        }, { once: true });

        audio.addEventListener('error', () => {
            if (finished) return;
            finished = true;
            cleanup();
            reject(new Error('Audio metadata load failed'));
        }, { once: true });

        audio.src = objectUrl;
    });
}

/**
 * Validate voice blob by size and finite metadata duration.
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
async function isVoiceBlobValid(blob) {
    if (!blob || blob.size < MIN_VOICE_BLOB_BYTES) return false;
    try {
        const duration = await getAudioDurationFromBlob(blob);
        return isValidAudioDuration(duration);
    } catch {
        return false;
    }
}

/**
 * Try to repair an invalid voice blob by re-encoding to WAV.
 * @param {Blob} blob
 * @returns {Promise<Blob|null>}
 */
async function tryRepairVoiceBlob(blob) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor || !blob) return null;

    const audioContext = new AudioContextCtor();
    try {
        const sourceBuffer = await blob.arrayBuffer();
        const decoded = await audioContext.decodeAudioData(sourceBuffer);
        const wavBlob = encodeWavFromAudioBuffer(decoded);
        return wavBlob.size >= MIN_VOICE_BLOB_BYTES ? wavBlob : null;
    } catch (error) {
        console.warn('Voice blob repair failed:', error);
        return null;
    } finally {
        await audioContext.close();
    }
}

/**
 * Prepare a safe voice blob for upload.
 * @param {Blob} audioBlob
 * @param {string} mimeType
 * @param {number} recordingMs
 * @returns {Promise<{blob: Blob, mimeType: string}|null>}
 */
async function prepareVoiceBlobForUpload(audioBlob, mimeType, recordingMs) {
    if (!audioBlob || audioBlob.size === 0) return null;
    if (recordingMs < MIN_VOICE_RECORDING_MS && audioBlob.size < MIN_VOICE_BLOB_BYTES) return null;

    if (await isVoiceBlobValid(audioBlob)) {
        return { blob: audioBlob, mimeType };
    }

    const repairedBlob = await tryRepairVoiceBlob(audioBlob);
    if (!repairedBlob) return null;
    if (!(await isVoiceBlobValid(repairedBlob))) return null;

    return { blob: repairedBlob, mimeType: 'audio/wav' };
}

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

        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
            const preferredMimeTypes = [
                'audio/mp4;codecs=mp4a.40.2',
                'audio/mp4',
                'audio/aac',
                'audio/ogg;codecs=opus',
                'audio/ogg',
                'audio/webm;codecs=opus',
                'audio/webm'
            ];

            for (const candidateMimeType of preferredMimeTypes) {
                if (!MediaRecorder.isTypeSupported(candidateMimeType)) continue;
                mimeType = candidateMimeType;
                mimeTypeOptions = { mimeType: candidateMimeType };
                break;
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

        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event?.error || event);
        };

        mediaRecorder.onstop = async () => {
            // Stop all tracks in the stream
            stream.getTracks().forEach(track => track.stop());

            // Create blob from recorded chunks with correct MIME type
            const audioBlob = new Blob(recordedChunks, { type: mimeType });
            const recordingMs = recordingStartTime ? Date.now() - recordingStartTime : 0;
            recordingStartTime = null;

            const preparedVoice = await prepareVoiceBlobForUpload(audioBlob, mimeType, recordingMs);
            if (!preparedVoice) {
                const corruptedMessage = window.i18n ? window.i18n.t('errors.voiceCorrupted') : 'Voice recording is corrupted. Please try again.';
                alert(corruptedMessage);
                return;
            }

            // Send the recorded audio
            sendVoiceMessage(preparedVoice.blob, preparedVoice.mimeType);
        };

        // Start recording
        mediaRecorder.start(250);
        isRecording = true;
        recordingStartTime = Date.now();

        // Update UI to show recording state
        updateRecordingUI(true);

        console.log('Recording started with MIME type:', mimeType);
    } catch (error) {
        console.error('Error starting recording:', error);
        alert(window.i18n ? window.i18n.t('call.micAccessDenied') : 'Could not access microphone. Please check permissions.');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        if (mediaRecorder.state !== 'inactive') {
            try {
                mediaRecorder.requestData();
            } catch (error) {
                console.warn('MediaRecorder.requestData failed:', error);
            }
            mediaRecorder.stop();
        }
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
        const releaseToSendVoiceMessage = window.i18n ? window.i18n.t('voice.releaseToSend') : 'Release to send voice message';
        voiceRecordBtn.title = releaseToSendVoiceMessage;
        voiceRecordBtn.setAttribute('aria-label', releaseToSendVoiceMessage);

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
    let fileName = '';
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
        fileName = `voice_message_${Date.now()}.${fileExtension}`;
        setUploadState(true, 'voice', fileName);

        // Create form data to send the audio file
        const formData = new FormData();
        formData.append('file', audioBlob, fileName);
        formData.append('dmId', currentDMUserId);
        formData.append('senderId', currentUser.id);
        formData.append('isVoiceMessage', 'true'); // Flag to identify voice messages
        formData.append('folder', 'voice_messages'); // Specify the folder for voice messages

        const fileData = await uploadWithProgress(formData, updateUploadProgress);

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
        alert(window.i18n ? window.i18n.t('errors.voiceSendFailed') : 'Failed to send voice message');
    } finally {
        setUploadState(false, 'voice');
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
            isForwarded: Boolean(currentReplyTo.isForwarded),
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
    ensurePinnedMessagesBlock();

    messageGroup.className = 'message-group';
    messageGroup.setAttribute('data-message-id', message.id || Date.now());
    messageGroup.setAttribute('data-pinned', message.pinned ? '1' : '0');
    if (message.pinned) {
        messageGroup.classList.add('pinned-message');
    }

    // Проверяем, является ли сообщение отправленным текущим пользователем
    const isUserMessage = Number(message.senderId) === Number(currentUser.id) ||
        message.author === currentUser.username;
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

    const pinIndicator = document.createElement('span');
    pinIndicator.className = 'message-pin-indicator';
    pinIndicator.textContent = '📌 ' + (window.i18n ? window.i18n.t('message.pinned') : 'Pinned');
    pinIndicator.style.display = message.pinned ? 'inline-flex' : 'none';

    const rawMessageText = typeof message.text === 'string' ? message.text : '';
    const shouldRenderText = rawMessageText.trim().length > 0 || Boolean(message.edited);
    let text = null;

    if (shouldRenderText) {
        text = document.createElement('div');
        text.className = 'message-text';

        if (isUserMessage) {
            text.classList.add('user-message-text');
        }

        // Process the message text to handle quotes
        let processedText = formatQuotedText(rawMessageText);

        // Add edited indicator if message was edited
        if (message.edited) {
            processedText += ' <span class="edited-indicator">' + (window.i18n ? window.i18n.t('message.edited') : '(edited)') + '</span>';
        }

        // Set the HTML content to display formatted quotes
        text.innerHTML = processedText;
        text.setAttribute('data-raw-text', rawMessageText);
        applyHashtagLinks(text);
    }

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
        let forwardedBadge = '';

        if (message.replyTo.isForwarded) {
            icon = '↗';
            const forwardedLabel = window.i18n ? window.i18n.t('chat.forwardedMessage') : 'Forwarded message';
            forwardedBadge = `<div class="reply-forward-badge">${escapeHtml(forwardedLabel)}</div>`;
        } else if (message.replyTo.isVoiceMessage) {
            icon = '🎤';
            previewText = window.i18n ? window.i18n.t('chat.voiceMessage') : 'Voice message';
        } else if (message.replyTo.file) {
            icon = '📎';
            const fileLabel = window.i18n ? window.i18n.t('chat.fileLabel') : 'File';
            previewText = `${fileLabel}: ${message.replyTo.file.filename}`;
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
            ${forwardedBadge}
            <div class="message-reply-row">
                <span class="reply-icon">${icon}</span>
                <span class="reply-author">${escapeHtml(message.replyTo.author)}</span>
                <span class="reply-separator">:</span>
                <span class="reply-text">${escapeHtml(previewText)}</span>
            </div>
        `;
    }

    // Add elements to content in correct order: reply block first, then header, then text
    if (replyBlock) {
        content.appendChild(replyBlock);
    }

    // Handle voice messages separately from file attachments
    if (message.isVoiceMessage && message.file) {
        const voiceContainer = document.createElement('div');
        voiceContainer.className = 'voice-message-container';

        // Create waveform visualization container with progress overlay
        const waveformContainer = document.createElement('div');
        waveformContainer.className = 'voice-waveform';
        waveformContainer.style.position = 'relative';
        waveformContainer.style.height = '40px';
        waveformContainer.style.margin = '8px 0';
        waveformContainer.style.padding = '4px';
        waveformContainer.style.background = 'var(--glass)';
        waveformContainer.style.borderRadius = '10px';
        waveformContainer.style.cursor = 'pointer';
        waveformContainer.title = window.i18n ? window.i18n.t('voice.clickToSeek') : 'Click to seek';

        // Create waveform bars container
        const waveformBars = document.createElement('div');
        waveformBars.className = 'voice-waveform-bars';
        waveformBars.style.display = 'flex';
        waveformBars.style.alignItems = 'center';
        waveformBars.style.justifyContent = 'space-between';
        waveformBars.style.height = '100%';
        waveformBars.style.position = 'relative';
        waveformBars.style.zIndex = '1';
        waveformBars.style.width = '100%';
        waveformBars.style.padding = '0 4px';

        // Create progress overlay
        const waveformProgress = document.createElement('div');
        waveformProgress.className = 'voice-waveform-progress';
        waveformProgress.style.position = 'absolute';
        waveformProgress.style.left = '0';
        waveformProgress.style.top = '0';
        waveformProgress.style.height = '100%';
        waveformProgress.style.width = '0%';
        waveformProgress.style.background = 'linear-gradient(90deg, var(--accent-transparent) 0%, var(--accentB-transparent) 100%)';
        waveformProgress.style.borderRadius = '10px';
        waveformProgress.style.zIndex = '2';
        waveformProgress.style.pointerEvents = 'none';
        waveformProgress.style.transition = 'width 0.1s linear';
        waveformProgress.style.boxShadow = 'inset 0 0 10px var(--accent-transparent)';

        // Generate waveform bars with varying heights for visual interest
        const barHeights = [];
        const totalBars = 60; // More bars for better resolution
        
        for (let i = 0; i < totalBars; i++) {
            // Create varied but smooth height pattern using multiple sine waves
            const baseHeight = Math.sin(i * 0.2) * 8 + Math.cos(i * 0.4) * 6 + Math.sin(i * 0.7) * 4;
            const variation = (Math.random() - 0.5) * 8;
            const height = Math.max(8, Math.min(32, 16 + baseHeight + variation));
            barHeights.push(height);
            
            const bar = document.createElement('div');
            bar.style.width = '2px';
            bar.style.height = `${height * 0.4}px`; // Start at 40% height
            bar.style.backgroundColor = 'var(--accent)';
            bar.style.borderRadius = '2px';
            bar.style.flexShrink = '0';
            bar.style.transition = 'height 0.15s ease, opacity 0.15s ease, background-color 0.15s ease';
            bar.style.opacity = '0.4';
            waveformBars.appendChild(bar);
        }

        waveformContainer.appendChild(waveformBars);
        waveformContainer.appendChild(waveformProgress);
        
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

        // Play/Pause button with SVG icons
        const playBtn = document.createElement('button');
        playBtn.className = 'voice-play-btn';
        playBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
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
        speedBtn.style.width = '44px';
        speedBtn.style.height = '28px';
        speedBtn.style.padding = '0';
        speedBtn.style.cursor = 'pointer';
        speedBtn.style.color = 'var(--accent)';
        speedBtn.style.fontSize = '12px';
        speedBtn.style.fontWeight = '600';
        speedBtn.style.display = 'inline-flex';
        speedBtn.style.alignItems = 'center';
        speedBtn.style.justifyContent = 'center';

        // Transcribe button
        const transcribeBtn = document.createElement('button');
        transcribeBtn.className = 'voice-transcribe-small-btn';
        const transcribeIcon = `
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M4 6h16v2H4zM4 11h10v2H4zM4 16h16v2H4z"/>
            </svg>
        `;
        transcribeBtn.innerHTML = transcribeIcon;
        transcribeBtn.setAttribute('aria-label', window.i18n ? window.i18n.t('actions.transcribe') : 'Transcribe');
        transcribeBtn.title = window.i18n ? window.i18n.t('actions.transcribe') : 'Расшифровать';
        transcribeBtn.style.background = 'transparent';
        transcribeBtn.style.border = '1px solid var(--accent)';
        transcribeBtn.style.borderRadius = '8px';
        transcribeBtn.style.width = '44px';
        transcribeBtn.style.height = '28px';
        transcribeBtn.style.padding = '0';
        transcribeBtn.style.cursor = 'pointer';
        transcribeBtn.style.color = 'var(--accent)';
        transcribeBtn.style.fontSize = '12px';
        transcribeBtn.style.fontWeight = '600';
        transcribeBtn.style.display = 'inline-flex';
        transcribeBtn.style.alignItems = 'center';
        transcribeBtn.style.justifyContent = 'center';

        // Duration display (in controls container)
        const durationDisplay = document.createElement('span');
        durationDisplay.className = 'voice-duration';
        durationDisplay.textContent = '0:00';
        durationDisplay.style.color = 'var(--muted)';
        durationDisplay.style.fontSize = '13px';
        durationDisplay.style.marginLeft = 'auto';
        durationDisplay.style.minWidth = '40px';
        durationDisplay.style.textAlign = 'right';

        // Add event listeners
        let isPlaying = false;
        let totalDuration = null;
        
        // SVG icons for play/pause
        const playIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        const pauseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        
        // Play/Pause toggle with lock during playback
        playBtn.addEventListener('click', () => {
            if (isPlaying) {
                audio.pause();
                playBtn.innerHTML = playIcon;
                playBtn.style.opacity = '1';
            } else {
                audio.play();
                playBtn.innerHTML = pauseIcon;
                playBtn.style.opacity = '0.7';
            }
            isPlaying = !isPlaying;
        });

        // Speed control
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
            transcribeBtn.innerHTML = '...';

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
                const transcribeMimeType = audioBlob.type || 'audio/mp4';
                const transcribeExt = getFileExtensionFromMime(transcribeMimeType) || 'm4a';
                formData.append('file', audioBlob, `voice_message.${transcribeExt}`);

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

                transcribeBtn.innerHTML = ICON_SVG.check;
                setTimeout(() => {
                    transcribeBtn.innerHTML = transcribeIcon;
                }, 2000);
            } catch (error) {
                console.error('[Transcribe] Error transcribing voice message:', error);
                const transcribeFailed = window.i18n ? window.i18n.t('errors.transcribeFailed') : 'Failed to transcribe';
                alert(`${transcribeFailed}: ${error.message}`);
                transcribeBtn.innerHTML = ICON_SVG.close;
                setTimeout(() => {
                    transcribeBtn.innerHTML = transcribeIcon;
                }, 2000);
            } finally {
                isTranscribing = false;
                transcribeBtn.classList.remove('transcribing');
            }
        });

        // Update duration when metadata is loaded - show total duration
        audio.addEventListener('loadedmetadata', () => {
            totalDuration = isValidAudioDuration(audio.duration) ? audio.duration : 0;
            durationDisplay.textContent = formatAudioDuration(totalDuration);
            durationDisplay.style.color = 'var(--muted)';
        });

        // Update progress bar and waveform during playback
        audio.addEventListener('timeupdate', () => {
            const currentTime = audio.currentTime;
            const duration = audio.duration;

            // Update progress bar
            if (isValidAudioDuration(duration)) {
                const progressPercent = (currentTime / duration) * 100;
                waveformProgress.style.width = `${progressPercent}%`;

                // Show remaining time during playback
                const remainingTime = duration - currentTime;
                durationDisplay.textContent = `-${formatAudioDuration(remainingTime)}`;
                durationDisplay.style.color = 'var(--accent)';

                // Update waveform bars to show progress dynamically
                const bars = waveformBars.querySelectorAll('div');
                const totalBars = bars.length;
                const currentBar = Math.floor((currentTime / duration) * totalBars);

                bars.forEach((bar, index) => {
                    if (index < currentBar) {
                        // Played bars: full height, bright accent color
                        bar.style.height = `${barHeights[index]}px`;
                        bar.style.backgroundColor = 'var(--accent)';
                        bar.style.opacity = '1';
                        bar.style.boxShadow = '0 0 4px var(--accent-transparent)';
                    } else if (index === currentBar) {
                        // Current bar: pulsing effect
                        const pulse = Math.sin(Date.now() * 0.015) * 0.4 + 0.6;
                        bar.style.height = `${barHeights[index]}px`;
                        bar.style.backgroundColor = 'var(--accent)';
                        bar.style.opacity = pulse;
                        bar.style.boxShadow = '0 0 6px var(--accent-transparent)';
                    } else {
                        // Unplayed bars: minimum height, dimmed
                        bar.style.height = `${barHeights[index] * 0.3}px`;
                        bar.style.backgroundColor = 'var(--muted)';
                        bar.style.opacity = '0.25';
                        bar.style.boxShadow = 'none';
                    }
                });
            }
        });

        // Reset duration display when audio ends
        audio.addEventListener('ended', () => {
            playBtn.innerHTML = playIcon;
            playBtn.style.opacity = '1';
            isPlaying = false;

            // Reset progress
            waveformProgress.style.width = '0%';

            // Reset duration display to total
            if (isValidAudioDuration(totalDuration)) {
                durationDisplay.textContent = formatAudioDuration(totalDuration);
                durationDisplay.style.color = 'var(--muted)';
            }

            // Reset waveform bars
            const bars = waveformBars.querySelectorAll('div');
            bars.forEach((bar, index) => {
                bar.style.height = `${barHeights[index] * 0.3}px`;
                bar.style.backgroundColor = 'var(--muted)';
                bar.style.opacity = '0.25';
                bar.style.boxShadow = 'none';
            });
        });

        // Reset duration display when audio pauses
        audio.addEventListener('pause', () => {
            if (isValidAudioDuration(totalDuration)) {
                durationDisplay.textContent = formatAudioDuration(totalDuration);
                durationDisplay.style.color = 'var(--muted)';
            }
        });

        // Click on waveform to seek
        waveformContainer.addEventListener('click', (e) => {
            const rect = waveformContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            const duration = audio.duration;

            if (isValidAudioDuration(duration)) {
                const seekTime = (clickX / width) * duration;
                audio.currentTime = seekTime;

                // If not playing, start playing
                if (!isPlaying) {
                    audio.play();
                    playBtn.innerHTML = pauseIcon;
                    playBtn.style.opacity = '0.7';
                    isPlaying = true;
                }
            }
        });
        
        // Store the audio element in a global array to prevent garbage collection
        if (!window.voiceMessageElements) {
            window.voiceMessageElements = [];
        }
        // Store references to the elements for later restoration
        window.voiceMessageElements.push({
            audio,
            playBtn,
            speedBtn,
            durationDisplay,
            waveformProgress,
            waveformBars,
            waveformContainer,
            transcribeBtn
        });

        // Animation for played bars - gentle wave motion
        let animationFrameId = null;
        let animationTime = 0;

        function animateWaveform() {
            if (!audio.paused && !audio.ended) {
                animationTime += 0.15;
                const bars = waveformBars.querySelectorAll('div');
                const totalBars = bars.length;
                const safeDuration = isValidAudioDuration(audio.duration) ? audio.duration : 1;
                const currentBar = Math.floor((audio.currentTime / safeDuration) * totalBars);

                bars.forEach((bar, index) => {
                    if (index < currentBar) {
                        // Played bars: animated wave motion
                        const waveOffset = Math.sin(animationTime + index * 0.3) * 4;
                        const baseHeight = barHeights[index];
                        bar.style.height = `${Math.max(12, baseHeight + waveOffset)}px`;
                    }
                });

                animationFrameId = requestAnimationFrame(animateWaveform);
            }
        }

        // Start animation when audio plays
        audio.addEventListener('play', () => {
            if (!animationFrameId) {
                animateWaveform();
            }
        });

        // Stop animation when audio pauses/ends
        audio.addEventListener('pause', () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        });

        audio.addEventListener('ended', () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        });

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
            fileLink.textContent = window.i18n ? window.i18n.t('actions.downloadViewFile') : 'Download/View Full File';
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
                    fileContentPreview.textContent = window.i18n ? window.i18n.t('chat.filePreviewFailed') : '[Unable to load preview]';
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
    addReactionBtn.title = window.i18n ? window.i18n.t('actions.emoji') : 'Add reaction';
    addReactionBtn.onclick = () => showEmojiPickerForMessage(message.id || Date.now());

    header.appendChild(author);
    header.appendChild(timestamp);
    header.appendChild(pinIndicator);
    content.appendChild(header);
    if (text) {
        content.appendChild(text);
    }

    // Create a container for reactions
    const reactionsAndActionsContainer = document.createElement('div');
    reactionsAndActionsContainer.className = 'reactions-and-actions-container';
    reactionsAndActionsContainer.appendChild(reactionsContainer);

    // Add reply button
    const replyBtn = document.createElement('button');
    replyBtn.className = 'reply-btn';
    replyBtn.textContent = '↪';  // Right arrow for reply
    replyBtn.title = window.i18n ? window.i18n.t('actions.reply') : 'Reply to message';
    replyBtn.onclick = () => replyToMessage(message);

    const forwardBtn = document.createElement('button');
    forwardBtn.className = 'forward-btn';
    forwardBtn.textContent = '↗';
    forwardBtn.title = window.i18n ? window.i18n.t('actions.forward') : 'Forward message';
    forwardBtn.onclick = () => forwardMessage(message);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.textContent = '📌';
    pinBtn.dataset.messageId = String(message.id);
    pinBtn.title = message.pinned
        ? (window.i18n ? window.i18n.t('actions.unpin') : 'Unpin message')
        : (window.i18n ? window.i18n.t('actions.pin') : 'Pin message');
    if (message.pinned) {
        pinBtn.classList.add('active');
    }
    pinBtn.onclick = () => toggleMessagePin(message.id);

    // Create a container for action buttons to position them properly
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'message-actions';

    // Add edit and delete buttons for user's own messages
    if (isUserMessage) {
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '✏️';  // Pencil emoji for edit
        editBtn.title = window.i18n ? window.i18n.t('actions.edit') : 'Edit message';
        editBtn.onclick = () => editMessage(message);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '🗑️';  // Trash emoji for delete
        deleteBtn.title = window.i18n ? window.i18n.t('actions.delete') : 'Delete message';
        deleteBtn.onclick = () => deleteMessage(message.id);

        actionsContainer.appendChild(editBtn);
        actionsContainer.appendChild(deleteBtn);
    }

    actionsContainer.appendChild(replyBtn);
    actionsContainer.appendChild(forwardBtn);
    actionsContainer.appendChild(pinBtn);
    actionsContainer.appendChild(addReactionBtn);
    reactionsAndActionsContainer.appendChild(actionsContainer);
    content.appendChild(reactionsAndActionsContainer);

    messageGroup.appendChild(avatar);
    messageGroup.appendChild(content);

    messagesContainer.appendChild(messageGroup);
    rebuildPinnedMessagesBlock();

    if (typeof twemoji !== 'undefined') {
        parseTwemoji(messageGroup);
    }

    // Highlight code blocks with Prism.js
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageGroup);
    }

    // Add link previews for URLs in the message
    const messageId = message.id || Date.now();
    if (text && rawMessageText.trim()) {
        addLinkPreviews(messageId, rawMessageText, text);
    }

    // Restore voice message handlers after adding the message
    setTimeout(() => {
        restoreVoiceMessageHandlers();
    }, 0);

    if (currentChatSearchQuery.trim()) {
        applyChatSearchFilter(currentChatSearchQuery);
    }
}

function ensurePinnedMessagesBlock() {
    let banner = document.getElementById('pinnedMessageBanner');
    if (!banner) {
        const chatView = document.getElementById('chatView');
        if (!chatView) {
            return null;
        }
        banner = document.createElement('button');
        banner.type = 'button';
        banner.id = 'pinnedMessageBanner';
        banner.className = 'pinned-message-banner';
        banner.style.display = 'none';
        banner.innerHTML = `
            <span class="pinned-banner-title">📌 ${window.i18n ? window.i18n.t('chat.pinnedMessages') : 'Pinned messages'}</span>
            <span class="pinned-banner-counter">1/1</span>
            <span class="pinned-banner-text"></span>
        `;

        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            chatView.insertBefore(banner, messagesContainer);
        } else {
            chatView.appendChild(banner);
        }
    }

    if (!banner.dataset.bound) {
        banner.addEventListener('click', () => {
            rotatePinnedMessageBanner();
        });
        banner.dataset.bound = '1';
    }

    return banner;
}

function rebuildPinnedMessagesBlock() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        return;
    }

    if (currentView !== 'dm' || !currentDMUserId) {
        hidePinnedMessageBanner();
        return;
    }

    const currentPinnedMessageId = pinnedMessageIds[activePinnedMessageIndex] || null;
    const pinnedMessages = Array.from(messagesContainer.querySelectorAll('.message-group[data-pinned="1"]'));
    pinnedMessageIds = pinnedMessages.map(messageEl => messageEl.getAttribute('data-message-id')).filter(Boolean);

    if (!pinnedMessageIds.length) {
        hidePinnedMessageBanner();
        return;
    }

    const existingIndex = currentPinnedMessageId ? pinnedMessageIds.indexOf(currentPinnedMessageId) : -1;
    activePinnedMessageIndex = existingIndex >= 0 ? existingIndex : 0;
    renderPinnedMessageBanner();
}

function hidePinnedMessageBanner() {
    const banner = document.getElementById('pinnedMessageBanner');
    if (!banner) {
        return;
    }

    banner.style.display = 'none';
    pinnedMessageIds = [];
    activePinnedMessageIndex = 0;
}

function renderPinnedMessageBanner() {
    const banner = ensurePinnedMessagesBlock();
    if (!banner || !pinnedMessageIds.length) {
        hidePinnedMessageBanner();
        return;
    }

    const currentId = pinnedMessageIds[activePinnedMessageIndex];
    const messageElement = currentId ? document.querySelector(`.message-group[data-message-id="${currentId}"]`) : null;
    if (!messageElement) {
        rebuildPinnedMessagesBlock();
        return;
    }

    const titleEl = banner.querySelector('.pinned-banner-title');
    const counterEl = banner.querySelector('.pinned-banner-counter');
    const textEl = banner.querySelector('.pinned-banner-text');
    if (!titleEl || !counterEl || !textEl) {
        return;
    }

    const author = messageElement.querySelector('.message-author')?.textContent || '';
    const rawText = messageElement.querySelector('.message-text')?.getAttribute('data-raw-text') || '';
    const preview = rawText.trim() ? rawText.trim() : '📎';
    const textPrefix = author ? `${author}: ` : '';

    titleEl.textContent = `📌 ${window.i18n ? window.i18n.t('chat.pinnedMessages') : 'Pinned messages'}`;
    counterEl.textContent = `${activePinnedMessageIndex + 1}/${pinnedMessageIds.length}`;
    textEl.textContent = `${textPrefix}${preview.slice(0, 120)}`;
    banner.style.display = 'flex';
}

function rotatePinnedMessageBanner() {
    if (!pinnedMessageIds.length) {
        return;
    }

    scrollToActivePinnedMessage();

    activePinnedMessageIndex += 1;
    if (activePinnedMessageIndex >= pinnedMessageIds.length) {
        activePinnedMessageIndex = 0;
    }

    renderPinnedMessageBanner();
}

function scrollToActivePinnedMessage() {
    if (!pinnedMessageIds.length) {
        return;
    }

    const messageId = pinnedMessageIds[activePinnedMessageIndex];
    if (!messageId) {
        return;
    }

    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) {
        return;
    }

    const target = messagesContainer.querySelector(`.message-group[data-message-id="${messageId}"]`);
    if (!target) {
        return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlighted');
    setTimeout(() => target.classList.remove('highlighted'), 1600);
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

function showForwardPicker(recipients) {
    return new Promise((resolve) => {
        const existing = document.getElementById('forwardPickerModal');
        if (existing) {
            existing.remove();
        }

        const title = window.i18n ? window.i18n.t('actions.forward') : 'Forward message';
        const closeLabel = window.i18n ? window.i18n.t('actions.close') : 'Close';
        const emptyLabel = window.i18n ? window.i18n.t('errors.noForwardChats') : 'No available chats for forwarding';

        const modal = document.createElement('div');
        modal.id = 'forwardPickerModal';
        modal.className = 'forward-picker-modal active';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'false');

        const listHtml = recipients.length > 0
            ? recipients.map((recipient, index) => `
                <button type="button" class="forward-picker-item" data-forward-index="${index}">
                    <div class="friend-avatar">
                        <div class="friend-avatar-content">${(recipient.avatar || recipient.username.charAt(0)).toUpperCase()}</div>
                    </div>
                    <span class="forward-picker-name">${escapeHtml(recipient.username)}</span>
                </button>
            `).join('')
            : `<div class="forward-picker-empty">${emptyLabel}</div>`;

        modal.innerHTML = `
            <div class="forward-picker-content">
                <div class="forward-picker-header">
                    <h3>${escapeHtml(title)}</h3>
                    <button type="button" class="forward-picker-close" aria-label="${escapeHtml(closeLabel)}">${ICON_SVG.close}</button>
                </div>
                <div class="forward-picker-list">${listHtml}</div>
            </div>
        `;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                close();
            }
        };

        const close = () => {
            document.removeEventListener('keydown', onKeyDown);
            modal.remove();
            resolve(null);
        };

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                close();
            }
        });

        const closeBtn = modal.querySelector('.forward-picker-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', close);
        }

        modal.querySelectorAll('.forward-picker-item').forEach((item) => {
            item.addEventListener('click', () => {
                const index = Number(item.getAttribute('data-forward-index'));
                const selected = recipients[index] || null;
                document.removeEventListener('keydown', onKeyDown);
                modal.remove();
                resolve(selected);
            });
        });

        document.addEventListener('keydown', onKeyDown);

        document.body.appendChild(modal);
    });
}

async function forwardMessage(message) {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    const textElement = messageElement?.querySelector('.message-text');
    const rawText = textElement?.getAttribute('data-raw-text');
    const forwardText = rawText !== null && rawText !== undefined ? rawText : (message.text || '');
    const hasFileAttachment = Boolean(message.file && message.file.url);
    if (!forwardText.trim() && !hasFileAttachment) return;

    const friends = Array.isArray(window.lastLoadedFriends) ? window.lastLoadedFriends : [];
    const recipients = [
        {
            id: currentUser.id,
            avatar: currentUser.avatar || currentUser.username.charAt(0).toUpperCase(),
            username: window.i18n ? window.i18n.t('chat.selfChat') : 'Self Chat'
        },
        ...friends.map(friend => ({
            id: friend.id,
            avatar: friend.avatar || friend.username.charAt(0).toUpperCase(),
            username: friend.username
        }))
    ];
    const receiver = await showForwardPicker(recipients);
    if (!receiver) return;

    const sourceEl = document.querySelector('#chatHeaderInfo .channel-name');
    const sourceName = sourceEl?.textContent?.trim() || (window.i18n ? window.i18n.t('chat.unknownSource') : 'Unknown source');
    const authorName = message.author || (window.i18n ? window.i18n.t('chat.unknownUser') : 'Unknown');
    const forwardedFromLabel = window.i18n ? window.i18n.t('chat.forwardedFrom') : 'Forwarded from';
    const authorLabel = window.i18n ? window.i18n.t('chat.originalAuthor') : 'Author';
    const forwardedTitle = window.i18n ? window.i18n.t('chat.forwardedMessage') : 'Forwarded message';
    const forwardHeader = `↗ ${forwardedTitle}\n${forwardedFromLabel}: ${sourceName} • ${authorLabel}: ${authorName}`;
    const preparedForwardText = forwardText.trim()
        ? `${forwardHeader}\n\n${forwardText}`
        : forwardHeader;
    const forwardedMessage = {
        id: Date.now(),
        text: preparedForwardText,
        author: currentUser.username,
        avatar: currentUser.avatar || currentUser.username.charAt(0).toUpperCase(),
        timestamp: new Date().toISOString(),
        reactions: [],
        replyTo: null,
        file: hasFileAttachment ? message.file : null,
        isVoiceMessage: Boolean(message.isVoiceMessage)
    };

    if (receiver.id === currentUser.id) {
        saveSelfMessageToHistory(forwardedMessage);
        if (currentDMUserId === currentUser.id) {
            addMessageToUI(forwardedMessage);
            scrollToBottom();
        }
        return;
    }

    if (socket && socket.connected) {
        socket.emit('send-dm', {
            receiverId: receiver.id,
            message: forwardedMessage
        });
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
    
    // Берем исходный текст из data-raw-text, чтобы не терять markdown/форматирование
    let currentText = message.text;
    if (textElement) {
        const rawText = textElement.getAttribute('data-raw-text');
        if (rawText !== null) {
            currentText = rawText;
        } else {
            const clone = textElement.cloneNode(true);
            // Fallback для старых сообщений без data-raw-text
            const editedIndicator = clone.querySelector('.edited-indicator');
            if (editedIndicator) {
                editedIndicator.remove();
            }
            currentText = clone.textContent;
        }
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
    if (!confirm(window.i18n ? window.i18n.t('message.deleteConfirm') : 'Are you sure you want to delete this message?')) return;

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

function toggleMessagePin(messageId) {
    if (!messageId) {
        return;
    }

    if (currentDMUserId === currentUser.id) {
        toggleSelfChatMessagePin(messageId);
        return;
    }

    if (socket && socket.connected) {
        socket.emit('toggle-dm-pin', { messageId });
    }
}

function updateMessagePinInUI(messageId, pinned, pinnedAt) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
        return;
    }

    messageElement.setAttribute('data-pinned', pinned ? '1' : '0');
    messageElement.classList.toggle('pinned-message', Boolean(pinned));

    const pinIndicator = messageElement.querySelector('.message-pin-indicator');
    if (pinIndicator) {
        pinIndicator.style.display = pinned ? 'inline-flex' : 'none';
    }

    const pinBtn = messageElement.querySelector('.pin-btn');
    if (pinBtn) {
        pinBtn.classList.toggle('active', Boolean(pinned));
        pinBtn.title = pinned
            ? (window.i18n ? window.i18n.t('actions.unpin') : 'Unpin message')
            : (window.i18n ? window.i18n.t('actions.pin') : 'Pin message');
    }

    if (currentDMUserId === currentUser.id) {
        const key = `selfChatHistory_${currentUser.id}`;
        const history = JSON.parse(localStorage.getItem(key)) || [];
        const messageIndex = history.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
            history[messageIndex].pinned = Boolean(pinned);
            history[messageIndex].pinnedAt = pinned ? (pinnedAt || new Date().toISOString()) : null;
            localStorage.setItem(key, JSON.stringify(history));
        }
    }

    rebuildPinnedMessagesBlock();
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
            messageTextElement.setAttribute('data-raw-text', updatedMessage.text || '');
            applyHashtagLinks(messageTextElement);

            // Re-parse emojis if twemoji is available
            if (typeof twemoji !== 'undefined') {
                parseTwemoji(messageTextElement);
            }

            // Re-highlight code blocks with Prism.js
            if (typeof Prism !== 'undefined') {
                Prism.highlightAllUnder(messageTextElement);
            }

            if (currentChatSearchQuery.trim()) {
                applyChatSearchFilter(currentChatSearchQuery);
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
    rebuildPinnedMessagesBlock();
    
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
    let listStack = [];
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

    const syncListState = () => {
        inList = listStack.length > 0;
        listType = inList ? listStack[listStack.length - 1] : null;
    };

    const openList = (type) => {
        formattedLines.push(`<${type} class="md-list md-${type}">`);
        listStack.push(type);
        syncListState();
    };

    const closeList = () => {
        if (listStack.length > 0) {
            const type = listStack.pop();
            formattedLines.push(`</${type}>`);
        }
        syncListState();
    };

    const closeAllLists = () => {
        while (listStack.length > 0) {
            closeList();
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
                    closeAllLists();
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
            closeAllLists();
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
            closeAllLists();
            formattedLines.push('<br>');
            continue;
        }

        // Check for HTML block placeholder
        if (trimmedLine.startsWith('%%HTMLBLOCK') && trimmedLine.endsWith('%%')) {
            closeAllLists();
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
            closeAllLists();
            // Add horizontal rule before header (except if it's the first element)
            if (formattedLines.length > 0) {
                formattedLines.push('<hr class="md-hr">');
            }
            const level = headerMatch[1].length;
            const headerText = formatInline(headerMatch[2]);
            formattedLines.push(`<h${level} class="md-header md-h${level}">${headerText}</h${level}>`);
            continue;
        }

        // Lists (supports nested lists by indentation)
        const listMatch = line.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
        if (listMatch) {
            const indent = listMatch[1].replace(/\t/g, '    ').length;
            const marker = listMatch[2];
            const content = listMatch[3];
            const itemType = /^\d+\.$/.test(marker) ? 'ol' : 'ul';
            let targetDepth = Math.floor(indent / 2) + 1;

            // Avoid invalid jumps deeper than one level at a time.
            if (targetDepth > listStack.length + 1) {
                targetDepth = listStack.length + 1;
            }

            while (listStack.length > targetDepth) {
                closeList();
            }

            if (listStack.length === targetDepth && listStack[targetDepth - 1] && listStack[targetDepth - 1] !== itemType) {
                closeList();
            }

            while (listStack.length < targetDepth) {
                openList(itemType);
            }

            if (listStack[listStack.length - 1] !== itemType) {
                closeList();
                openList(itemType);
            }

            formattedLines.push(`<li class="md-list-item">${formatInline(content)}</li>`);
            continue;
        }

        // Horizontal rule
        if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
            closeAllLists();
            formattedLines.push('<hr class="md-hr">');
            continue;
        }

        // Regular text line
        closeAllLists();
        formattedLines.push(`<div class="md-paragraph">${hasHtmlTags ? allowHtml(trimmedLine) : formatInline(trimmedLine)}</div>`);
    }

    closeAllLists();
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
    hideBtn.innerHTML = ICON_SVG.close;
    hideBtn.title = window.i18n ? window.i18n.t('actions.hidePreview') : 'Hide preview';
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
            parseTwemoji(content);
        }
    }

    if (typeof twemoji !== 'undefined') {
        parseTwemoji(tabs);
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
    if (String(messageId).startsWith('news-')) {
        if (socket && socket.connected) {
            socket.emit('add-reaction', { messageId, emoji });
        }
        return;
    }

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

        if (String(messageId).startsWith('news-')) {
            reactionEl.addEventListener('click', () => {
                if (socket && socket.connected) {
                    socket.emit('remove-reaction', { messageId, emoji: reaction.emoji });
                }
            });
            reactionsContainer.appendChild(reactionEl);
            return;
        }

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
        parseTwemoji(reactionsContainer);
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

function toggleSelfChatMessagePin(messageId) {
    const key = `selfChatHistory_${currentUser.id}`;
    const history = JSON.parse(localStorage.getItem(key)) || [];
    const messageIndex = history.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
        return;
    }

    const message = history[messageIndex];
    const nextPinned = !Boolean(message.pinned);
    message.pinned = nextPinned;
    message.pinnedAt = nextPinned ? new Date().toISOString() : null;

    localStorage.setItem(key, JSON.stringify(history));
    updateMessagePinInUI(messageId, nextPinned, message.pinnedAt);
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
    setUploadState(true, 'file', file.name);
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('dmId', currentDMUserId); // Добавляем ID получателя для DM
        formData.append('senderId', currentUser.id); // Добавляем ID отправителя

        const fileData = await uploadWithProgress(formData, updateUploadProgress);

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
        alert(window.i18n ? window.i18n.t('errors.uploadFailed') : 'Failed to upload file');
    } finally {
        setUploadState(false, 'file');
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
            alert(window.i18n ? window.i18n.t('settings.hiddenPreviewsReset') : 'All hidden previews have been reset');
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm(window.i18n ? window.i18n.t('settings.logoutConfirm') : 'Do you want to logout?')) {
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
        updateLocalVideoPreview(localVideo, localStream);
        
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
            toggleScreenBtn.title = window.i18n ? window.i18n.t('call.screenShareCamera') : 'Share Camera (Mobile)';
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
    if (callMediaController) {
        callMediaController.setVideoEnabled(isVideoEnabled).catch((error) => {
            console.error('Failed to update video producer:', error);
        });
    }
    
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

    if (callMediaController) {
        callMediaController.setAudioEnabled(isAudioEnabled).catch((error) => {
            console.error('Failed to update audio producer:', error);
        });
    }
    
    updateCallButtons();
}

async function toggleScreenShare() {
    if (screenStream) {
        // Stop screen sharing
        screenStream.getTracks().forEach(track => track.stop());

        const videoTrack = localStream.getVideoTracks()[0];
        const micAudioTrack = localStream.getAudioTracks()[0];
        if (videoTrack) {
            videoTrack.contentHint = 'motion';
        }
        if (videoTrack && callMediaController) {
            await callMediaController.replaceVideoTrack(videoTrack);
        }
        if (micAudioTrack && callMediaController) {
            await callMediaController.replaceAudioTrack(micAudioTrack);
        }
        cleanupScreenAudioMix();

        screenStream = null;

        const localVideo = document.getElementById('localVideo');
        updateLocalVideoPreview(localVideo, localStream);

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
            const outgoingAudioTrack = await createScreenShareOutgoingAudioTrack(screenStream, localStream);
            if (screenTrack) {
                screenTrack.contentHint = 'detail';
            }

            if (screenTrack && callMediaController) {
                await callMediaController.replaceVideoTrack(screenTrack);
            }
            if (outgoingAudioTrack && callMediaController) {
                await callMediaController.replaceAudioTrack(outgoingAudioTrack);
            }

            // Show screen share in local video
            const localVideo = document.getElementById('localVideo');
            const previewAudioTracks = outgoingAudioTrack ? [outgoingAudioTrack] : localStream.getAudioTracks();
            const mixedStream = new MediaStream([
                screenTrack,
                ...previewAudioTracks
            ]);
            updateLocalVideoPreview(localVideo, mixedStream);

            // Handle screen share ending
            screenTrack.addEventListener('ended', () => {
                toggleScreenShare(); // This will stop screen sharing
            });

            updateCallButtons();
        } catch (error) {
            console.error('Error sharing screen:', error);
            if (error.name === 'NotAllowedError') {
                alert(window.i18n ? window.i18n.t('call.screenDenied') : 'Screen sharing permission denied');
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
                    const outgoingAudioTrack = await createScreenShareOutgoingAudioTrack(screenStream, localStream);
                    if (screenTrack) {
                        screenTrack.contentHint = 'detail';
                    }

                    if (screenTrack && callMediaController) {
                        await callMediaController.replaceVideoTrack(screenTrack);
                    }
                    if (outgoingAudioTrack && callMediaController) {
                        await callMediaController.replaceAudioTrack(outgoingAudioTrack);
                    }

                    // Show screen share in local video
                    const localVideo = document.getElementById('localVideo');
                    const previewAudioTracks = outgoingAudioTrack ? [outgoingAudioTrack] : localStream.getAudioTracks();
                    const mixedStream = new MediaStream([
                        screenTrack,
                        ...previewAudioTracks
                    ]);
                    updateLocalVideoPreview(localVideo, mixedStream);

                    // Handle screen share ending
                    screenTrack.addEventListener('ended', () => {
                        toggleScreenShare(); // This will stop screen sharing
                    });

                    updateCallButtons();
                } catch (fallbackError) {
                    console.error('Error with fallback camera access:', fallbackError);
                    alert(window.i18n ? window.i18n.t('call.screenUnsupported') : 'Screen sharing is not supported on this device. Camera access was also denied.');
                }
            } else {
                alert(window.i18n ? window.i18n.t('call.screenError') : 'Error sharing screen. Please try again. Note: Screen sharing may not be supported on mobile devices.');
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
                toggleScreenBtn.title = window.i18n ? window.i18n.t('call.screenStopCamera') : 'Stop Camera Share';
            } else {
                toggleScreenBtn.title = window.i18n ? window.i18n.t('call.screenStop') : 'Stop Screen Share';
            }
        } else {
            if (isMobile) {
                toggleScreenBtn.title = window.i18n ? window.i18n.t('call.screenShareCamera') : 'Share Camera (Mobile)';
            } else {
                toggleScreenBtn.title = window.i18n ? window.i18n.t('call.screenShare') : 'Share Screen';
            }
        }
    }
}

function updateLocalVideoPreview(videoElement, stream) {
    if (!videoElement) return;
    videoElement.srcObject = stream;
    videoElement.style.transform = 'none';
}

function cleanupScreenAudioMix() {
    screenAudioMixNodes.forEach(node => {
        try {
            node.disconnect();
        } catch (e) {
            console.warn('Failed to disconnect audio node:', e.message);
        }
    });
    screenAudioMixNodes = [];
    if (screenAudioMixContext) {
        screenAudioMixContext.close().catch(() => {});
    }
    screenAudioMixContext = null;
    screenAudioMixDestination = null;
}

async function createScreenShareOutgoingAudioTrack(currentScreenStream, currentLocalStream) {
    const screenAudioTrack = currentScreenStream ? currentScreenStream.getAudioTracks()[0] : null;
    const micAudioTrack = currentLocalStream ? currentLocalStream.getAudioTracks()[0] : null;
    if (!screenAudioTrack) return micAudioTrack || null;
    if (!micAudioTrack) return screenAudioTrack;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return screenAudioTrack;

    cleanupScreenAudioMix();
    screenAudioMixContext = new AudioContextClass();
    screenAudioMixDestination = screenAudioMixContext.createMediaStreamDestination();
    if (screenAudioMixContext.state === 'suspended') {
        await screenAudioMixContext.resume().catch(() => {});
    }

    const connectTrack = (track, gainValue) => {
        const source = screenAudioMixContext.createMediaStreamSource(new MediaStream([track]));
        const gain = screenAudioMixContext.createGain();
        gain.gain.value = gainValue;
        source.connect(gain);
        gain.connect(screenAudioMixDestination);
        screenAudioMixNodes.push(source, gain);
    };

    connectTrack(screenAudioTrack, 1.0);
    connectTrack(micAudioTrack, 1.0);
    return screenAudioMixDestination.stream.getAudioTracks()[0] || screenAudioTrack;
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
   ensurePinnedMessagesBlock();

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
                   senderId: message.sender_id,
                   author: message.username,
                   avatar: message.avatar || message.username.charAt(0).toUpperCase(),
                   text: message.content,
                   timestamp: message.created_at,
                   reactions: message.reactions || [],
                   file: message.file,  // Добавляем информацию о файле, если она есть
                   isVoiceMessage: isVoiceMessage, // Определяем, является ли это голосовым сообщением
                   edited: message.edited,  // Добавляем флаг редактирования, если он существует
                   pinned: Boolean(message.pinned),
                   pinnedAt: message.pinnedAt || null,
                   replyTo: message.replyTo || null  // Добавляем информацию об ответе
               });
           });
           rebuildPinnedMessagesBlock();
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
           <span class="channel-name" data-i18n="chat.news">${window.i18n ? window.i18n.t('chat.news') : 'News'}</span>
       `;
       systemChannelEl.addEventListener('click', () => {
           console.log('System channel clicked');
           openSystemChannel();
       });
       if (window.i18n && typeof window.i18n.applyI18n === 'function') {
           window.i18n.applyI18n(systemChannelEl);
       }
       dmList.appendChild(systemChannelEl);
   }

   if (friends.length === 0) {
       const emptyDM = document.createElement('div');
       emptyDM.className = 'empty-dm-list';
       emptyDM.textContent = window.i18n ? window.i18n.t('chat.noConversationsYet') : 'No conversations yet.';
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
function clearPeerConnectionRuntimeState(remoteSocketId) {
    if (iceRestartTimers[remoteSocketId]) {
        clearTimeout(iceRestartTimers[remoteSocketId]);
        delete iceRestartTimers[remoteSocketId];
    }
    delete iceRestartAttempts[remoteSocketId];
    delete iceRestartLocks[remoteSocketId];
    delete makingOffers[remoteSocketId];
    delete ignoreIncomingOffers[remoteSocketId];
    delete settingRemoteAnswerPending[remoteSocketId];
    delete seenRemoteCandidates[remoteSocketId];
}

function isPolitePeer(remoteSocketId) {
    if (!socket || !socket.id) return true;
    return socket.id.localeCompare(remoteSocketId) > 0;
}

function optimizeSenderParameters(pc, track = null) {
    if (!pc) return;
    const senders = pc.getSenders();
    senders.forEach(sender => {
        if (!sender || !sender.track) return;
        if (track && sender.track.id !== track.id) return;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
        }

        if (sender.track.kind === 'audio') {
            params.encodings[0].maxBitrate = 32000;
        } else if (sender.track.kind === 'video') {
            const isScreenTrack = sender.track.contentHint === 'detail';
            params.degradationPreference = isScreenTrack ? 'maintain-resolution' : 'maintain-framerate';
            params.encodings[0].maxBitrate = isScreenTrack ? 1400000 : 700000;
            params.encodings[0].maxFramerate = isScreenTrack ? 20 : 24;
            if (!sender.track.contentHint) {
                sender.track.contentHint = 'motion';
            }
        }

        sender.setParameters(params).catch(error => {
            console.warn('Failed to apply sender parameters:', error.message);
        });
    });
}

function createAndSendOffer(remoteSocketId, options = {}) {
    const pc = peerConnections[remoteSocketId];
    if (!pc || pc.signalingState === 'closed') return Promise.resolve();
    if (!socket || !socket.connected) return Promise.resolve();
    if (pc.signalingState !== 'stable') return Promise.resolve();
    if (makingOffers[remoteSocketId]) return Promise.resolve();

    if (seenRemoteCandidates[remoteSocketId]) {
        seenRemoteCandidates[remoteSocketId].clear();
    }
    ignoreIncomingOffers[remoteSocketId] = false;
    makingOffers[remoteSocketId] = true;
    return pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        ...options
    })
    .then(offer => pc.setLocalDescription(offer))
    .then(() => {
        socket.emit('offer', {
            to: remoteSocketId,
            offer: pc.localDescription,
            from: socket.id
        });
    })
    .catch(error => {
        console.error('Error creating offer:', error);
    })
    .finally(() => {
        makingOffers[remoteSocketId] = false;
    });
}

function requestIceRestart(remoteSocketId, reason = 'unknown') {
    const pc = peerConnections[remoteSocketId];
    if (!pc || pc.signalingState === 'closed') return;
    if (!socket || !socket.connected) return;
    if (pc.signalingState !== 'stable') return;
    if (iceRestartLocks[remoteSocketId]) return;

    const attempts = iceRestartAttempts[remoteSocketId] || 0;
    if (attempts >= 3) {
        console.error(`ICE restart limit reached for ${remoteSocketId}`);
        return;
    }

    iceRestartLocks[remoteSocketId] = true;
    iceRestartAttempts[remoteSocketId] = attempts + 1;
    console.log(`Starting ICE restart with ${remoteSocketId} (${reason}), attempt ${iceRestartAttempts[remoteSocketId]}`);

    createAndSendOffer(remoteSocketId, { iceRestart: true })
    .catch(error => {
        console.error('Error during ICE restart:', error);
    })
    .finally(() => {
        iceRestartLocks[remoteSocketId] = false;
    });
}

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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:openrelay.metered.ca:80' },
            { urls: 'turn:openrelay.metered.ca:80?transport=udp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 10
    });

    peerConnections[remoteSocketId] = pc;
    iceRestartAttempts[remoteSocketId] = 0;
    makingOffers[remoteSocketId] = false;
    ignoreIncomingOffers[remoteSocketId] = false;
    settingRemoteAnswerPending[remoteSocketId] = false;
    seenRemoteCandidates[remoteSocketId] = new Set();

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
    optimizeSenderParameters(pc);

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
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            console.error(`ICE connection issue (${pc.iceConnectionState}) with ${remoteSocketId}`);
            if (!iceRestartTimers[remoteSocketId]) {
                const delay = pc.iceConnectionState === 'failed' ? 300 : 1500;
                iceRestartTimers[remoteSocketId] = setTimeout(() => {
                    delete iceRestartTimers[remoteSocketId];
                    requestIceRestart(remoteSocketId, pc.iceConnectionState);
                }, delay);
            }
        }
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            console.log('Peer connection established successfully!');
            iceRestartAttempts[remoteSocketId] = 0;
            if (iceRestartTimers[remoteSocketId]) {
                clearTimeout(iceRestartTimers[remoteSocketId]);
                delete iceRestartTimers[remoteSocketId];
            }
        }
        if (pc.iceConnectionState === 'closed') {
            clearPeerConnectionRuntimeState(remoteSocketId);
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && !iceRestartTimers[remoteSocketId]) {
            iceRestartTimers[remoteSocketId] = setTimeout(() => {
                delete iceRestartTimers[remoteSocketId];
                requestIceRestart(remoteSocketId, 'connection-failed');
            }, 300);
        }
        if (pc.connectionState === 'connected') {
            iceRestartAttempts[remoteSocketId] = 0;
        }
        if (pc.connectionState === 'closed') {
            clearPeerConnectionRuntimeState(remoteSocketId);
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
            participantName.textContent = window.i18n ? window.i18n.t('chat.friend') : 'Friend';

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
                <button class="size-control-btn minimize-btn" title="${window.i18n ? window.i18n.t('actions.minimize') : 'Minimize'}">_</button>
                <button class="size-control-btn maximize-btn" title="${window.i18n ? window.i18n.t('actions.maximize') : 'Maximize'}">□</button>
                <button class="size-control-btn fullscreen-btn" title="${window.i18n ? window.i18n.t('actions.fullscreen') : 'Fullscreen'}">${ICON_SVG.fullscreen}</button>
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
        createAndSendOffer(remoteSocketId);
    }

    return pc;
}

function flushPendingIceCandidates(pc) {
    if (!pc || !pc.remoteDescription || !pc.candidatesToProcess || pc.candidatesToProcess.length === 0) {
        return;
    }

    pc.candidatesToProcess.forEach(candidate => {
        try {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding stored ice candidate:', e);
        }
    });

    pc.candidatesToProcess = [];
}

// Обработчики событий WebRTC должны быть зарегистрированы после инициализации socket
function registerWebRTCSignalingHandlers() {
    if (!socket || webrtcHandlersBound) return;
    webrtcHandlersBound = true;
}

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
        <button class="size-control-btn minimize-btn" title="${window.i18n ? window.i18n.t('actions.minimize') : 'Minimize'}">_</button>
        <button class="size-control-btn maximize-btn" title="${window.i18n ? window.i18n.t('actions.maximize') : 'Maximize'}">□</button>
        <button class="size-control-btn fullscreen-btn" title="${window.i18n ? window.i18n.t('actions.fullscreen') : 'Fullscreen'}">${ICON_SVG.fullscreen}</button>
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
    },
    highContrast: {
        '--bg-0': '#050507',
        '--bg-1': '#0f1013',
        '--glass': 'rgba(10, 10, 12, .92)',
        '--glass-2': 'rgba(14, 15, 18, .84)',
        '--glass-strong': 'rgba(8, 8, 10, .96)',
        '--text': 'rgba(255,255,255,.98)',
        '--muted': 'rgba(255,255,255,.82)',
        '--muted-2': 'rgba(255,255,255,.70)',
        '--stroke': 'rgba(255,255,255,.22)',
        '--stroke-soft': 'rgba(255,255,255,.14)'
    },
    deuteranopia: {
        '--bg-0': '#0e1724',
        '--bg-1': '#1a2738',
        '--glass': 'rgba(16, 27, 42, .88)',
        '--glass-2': 'rgba(22, 36, 54, .78)',
        '--glass-strong': 'rgba(14, 24, 38, .94)',
        '--text': 'rgba(255,255,255,.94)',
        '--muted': 'rgba(255,255,255,.70)',
        '--muted-2': 'rgba(255,255,255,.56)',
        '--stroke': 'rgba(255,255,255,.11)',
        '--stroke-soft': 'rgba(255,255,255,.07)'
    },
    tritanopia: {
        '--bg-0': '#1b1022',
        '--bg-1': '#2a1730',
        '--glass': 'rgba(36, 20, 44, .88)',
        '--glass-2': 'rgba(45, 27, 54, .78)',
        '--glass-strong': 'rgba(32, 18, 40, .94)',
        '--text': 'rgba(255,255,255,.94)',
        '--muted': 'rgba(255,255,255,.70)',
        '--muted-2': 'rgba(255,255,255,.56)',
        '--stroke': 'rgba(255,255,255,.11)',
        '--stroke-soft': 'rgba(255,255,255,.07)'
    }
};

const DEFAULT_ACCENT_PALETTE = ['#8b5cf6', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#ec4899'];
const THEME_ACCENT_DEFAULTS = {
    highContrast: '#fbbf24',
    deuteranopia: '#60a5fa',
    tritanopia: '#34d399'
};
const THEME_ACCENT_PALETTES = {
    highContrast: ['#fbbf24', '#38bdf8', '#f43f5e', '#22d3ee', '#ffffff', '#f97316'],
    deuteranopia: ['#60a5fa', '#eab308', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6'],
    tritanopia: ['#34d399', '#f59e0b', '#ef4444', '#84cc16', '#f97316', '#facc15']
};

function getThemeAccent(themeName) {
    const savedAccent = localStorage.getItem('selectedAccent') || '#8b5cf6';
    if (THEME_ACCENT_DEFAULTS[themeName]) {
        const themePalette = THEME_ACCENT_PALETTES[themeName] || DEFAULT_ACCENT_PALETTE;
        if (themePalette.includes(savedAccent)) return savedAccent;
        return THEME_ACCENT_DEFAULTS[themeName];
    }
    return savedAccent;
}

function getAccentPalette(themeName) {
    return THEME_ACCENT_PALETTES[themeName] || DEFAULT_ACCENT_PALETTE;
}

function updateAccentPalette(themeName) {
    const accentColors = document.querySelectorAll('.accent-color');
    const palette = getAccentPalette(themeName);
    accentColors.forEach((color, index) => {
        const nextColor = palette[index] || DEFAULT_ACCENT_PALETTE[index] || palette[0];
        color.dataset.accent = nextColor;
        color.style.backgroundColor = nextColor;
    });
}

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
    
    const savedAccent = getThemeAccent(savedTheme);
    const savedTransparency = localStorage.getItem('transparencyLevel') || 86;
    
    // Apply saved theme
    applyTheme(savedTheme);
    updateAccentPalette(savedTheme);
    
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
    setTimeout(() => {
        applyAccentColor(getThemeAccent(themeName));
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
            const currentTheme = localStorage.getItem('selectedTheme') || 'default';
            const savedAccent = getThemeAccent(currentTheme);
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
            localStorage.setItem('selectedTheme', themeName);

            const themeAccent = getThemeAccent(themeName);
            applyTheme(themeName);
            updateAccentPalette(themeName);
            highlightSelectedTheme(themeName);
            highlightSelectedAccent(themeAccent);
            localStorage.setItem('selectedAccent', themeAccent);
            if (customColorPicker) customColorPicker.value = themeAccent;
            
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
        const currentTheme = localStorage.getItem('selectedTheme') || 'default';
        const savedAccent = getThemeAccent(currentTheme);
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
    } else if (currentTheme === 'highContrast') {
        baseR = 10;
        baseG = 10;
        baseB = 12;
    } else if (currentTheme === 'deuteranopia') {
        baseR = 16;
        baseG = 27;
        baseB = 42;
    } else if (currentTheme === 'tritanopia') {
        baseR = 36;
        baseG = 20;
        baseB = 44;
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
    updateDynamicI18nText();

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

  function updateDynamicI18nText(){
    document.querySelectorAll(".channel-subscribers[data-subscriber-count]").forEach((el) => {
      const count = Number(el.getAttribute("data-subscriber-count"));
      if (!Number.isFinite(count)) return;
      if (typeof formatSubscribersCount === "function") {
        el.textContent = formatSubscribersCount(count);
      }
    });
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
            const { audio, playBtn, speedBtn, durationDisplay, waveformProgress, waveformBars, waveformContainer } = item;

            if (audio && playBtn && speedBtn && durationDisplay) {
                // Проверяем, что элементы все еще находятся в DOM
                if (document.contains(audio) && document.contains(playBtn)) {
                    // SVG icons for play/pause
                    const playIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                    const pauseIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

                    // Удаляем старые обработчики
                    const newPlayBtn = playBtn.cloneNode(true);

                    // Восстанавливаем обработчики с блокировкой повторного запуска
                    let isPlaying = false;
                    newPlayBtn.addEventListener('click', () => {
                        if (isPlaying) {
                            audio.pause();
                            newPlayBtn.innerHTML = playIcon;
                            newPlayBtn.style.opacity = '1';
                        } else {
                            audio.play();
                            newPlayBtn.innerHTML = pauseIcon;
                            newPlayBtn.style.opacity = '0.7';
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
                        durationDisplay.textContent = formatAudioDuration(audio.duration);
                    } else {
                        // Если аудио еще не загружено, ждем события loadedmetadata
                        audio.addEventListener('loadedmetadata', function updateDuration() {
                            durationDisplay.textContent = formatAudioDuration(audio.duration);
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
    cleanupScreenAudioMix();

    // Если это не вызвано удаленно, уведомляем других участников о выходе
    if (!isCalledFromRemote && socket && socket.connected && window.currentCallDetails?.callId) {
        socket.emit('end-call', { callId: window.currentCallDetails.callId });
    }

    if (callMediaController) {
        callMediaController.close({ notifyServer: false }).catch((error) => {
            console.error('Failed to close mediasoup call controller:', error);
        });
    }

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
