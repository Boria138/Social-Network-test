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
    connectToSocketIO();
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

    // Setup reply to selection functionality
    setupReplyToSelection();
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

function updateUserInfo() {
    const userAvatar = document.querySelector('.user-avatar');
    const username = document.querySelector('.username');
    
    if (userAvatar) userAvatar.textContent = currentUser.avatar;
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
                addMessageToUI({
                    id: data.message.id,
                    author: data.message.author,
                    avatar: data.message.avatar,
                    text: data.message.text,
                    timestamp: data.message.timestamp,
                    reactions: data.message.reactions || [],
                    file: data.message.file  // Добавляем информацию о файле, если она есть
                });
                scrollToBottom();
            }
        });

        socket.on('dm-sent', (data) => {
            // Отображаем наше сообщение, если оно было отправлено в текущий чат
            if (currentView === 'dm' && currentDMUserId && data.receiverId === currentDMUserId) {
                // Добавляем сообщение, которое мы отправили
                addMessageToUI({
                    id: data.message.id,
                    author: currentUser.username,
                    avatar: currentUser.avatar,
                    text: data.message.text,
                    timestamp: data.message.timestamp,
                    reactions: data.message.reactions || [],
                    file: data.message.file  // Добавляем информацию о файле, если она есть
                });
                scrollToBottom();
            }
        });

        socket.on('new-friend-request', () => {
            loadPendingRequests();
            showNotification('New Friend Request', 'You have a new friend request!');
        });

        socket.on('incoming-call', (data) => {
            const { from, type } = data;
            if (from) {
                showIncomingCall(from, type);
            }
        });

        socket.on('call-accepted', (data) => {
            console.log('Call accepted by:', data.from);
            // When call is accepted, create peer connection
            document.querySelector('.call-channel-name').textContent = `Connected with ${data.from.username}`;
            
            // Create peer connection as initiator
            if (!peerConnections[data.from.socketId]) {
                createPeerConnection(data.from.socketId, true);
            }
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
        displayFriends(friends);
        populateDMList(friends);
    } catch (error) {
        console.error('Error loading friends:', error);
    }
}

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
        <div class="friend-avatar">${friend.avatar || friend.username.charAt(0).toUpperCase()}</div>
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
            <div class="user-avatar">${user.avatar || user.username.charAt(0).toUpperCase()}</div>
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
                <div class="friend-avatar">${request.avatar || request.username.charAt(0).toUpperCase()}</div>
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

// Initiate call function
async function initiateCall(friendId, type) {
    try {
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
            originalType: type
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
    
    // Auto-reject after 30 seconds
    setTimeout(() => {
        if (!incomingCallDiv.classList.contains('hidden')) {
            incomingCallDiv.classList.add('hidden');
            rejectCall(caller);
        }
    }, 30000);
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
            originalType: type
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
}

window.startDM = async function(friendId, friendUsername) {
    currentView = 'dm';
    currentDMUserId = friendId;
    // currentServerId = null; // Убрано, так как серверы больше не используются

    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');

    if (friendsView) friendsView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';
    // document.getElementById('channelsView').style.display = 'none'; // Убрано, так как элемент больше не существует
    if (dmListView) dmListView.style.display = 'block';

    const chatHeaderInfo = document.getElementById('chatHeaderInfo');
    if (chatHeaderInfo) {
        chatHeaderInfo.innerHTML = `
            <div class="friend-avatar">${friendUsername.charAt(0).toUpperCase()}</div>
            <span class="channel-name">${friendUsername}</span>
        `;
    }

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.placeholder = `Message @${friendUsername}`;
    }

    await loadDMHistory(friendId);
};

// Функция для открытия чата с самим собой
function startSelfChat() {
    currentView = 'dm';
    currentDMUserId = currentUser.id; // Используем ID текущего пользователя

    const friendsView = document.getElementById('friendsView');
    const chatView = document.getElementById('chatView');
    const dmListView = document.getElementById('dmListView');

    if (friendsView) friendsView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';
    if (dmListView) dmListView.style.display = 'block';

    const chatHeaderInfo = document.getElementById('chatHeaderInfo');
    if (chatHeaderInfo) {
        chatHeaderInfo.innerHTML = `
            <div class="friend-avatar">${currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}</div>
            <span class="channel-name">Self Chat</span>
        `;
    }

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.placeholder = `Message yourself...`;
    }

    // Загружаем историю сообщений для Self Chat
    loadSelfChatHistory();
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
        addMessageToUI({
            id: message.id,
            author: message.author,
            avatar: message.avatar,
            text: message.text,
            timestamp: message.timestamp,
            reactions: message.reactions || [],
            file: message.file  // Добавляем информацию о файле, если она есть
        });
    });

    scrollToBottom();
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

    if (friendsView) friendsView.style.display = 'flex';
    if (chatView) chatView.style.display = 'none';
    if (dmListView) dmListView.style.display = 'block';
    if (serverName) serverName.textContent = 'Friends';
    if (friendsBtn) friendsBtn.classList.add('active');

    // Hide chat and show friends content
    if (chatView) chatView.style.display = 'none';
    if (friendsView) friendsView.style.display = 'flex';
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
            sendMessage();
        }

        // Автоматическое изменение высоты при вводе текста
        adjustTextareaHeight(messageInput);
    });

    // Обработчик для изменения высоты при вводе текста
    messageInput.addEventListener('input', (e) => {
        adjustTextareaHeight(messageInput);
    });
}

// Функция для автоматического изменения высоты textarea
function adjustTextareaHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');

    if (!messageInput) {
        console.error('Message input element not found');
        return;
    }

    const text = messageInput.value.trim();

    if (text === '') return;

    const message = {
        id: Date.now(), // используем временную метку как ID
        text: text,
        author: currentUser.username,
        avatar: currentUser.avatar || currentUser.username.charAt(0).toUpperCase(),
        timestamp: new Date(),
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

    messageInput.value = '';
    // Сбрасываем высоту textarea после отправки
    messageInput.style.height = 'auto';
    adjustTextareaHeight(messageInput);
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

    // Process the message text to handle quotes
    const processedText = formatQuotedText(message.text);

    // Set the HTML content to display formatted quotes
    text.innerHTML = processedText;

    // If the message contains a file, add it to the message
    if (message.file) {
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
            // Audio preview
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
            filePreview.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
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
            fileLink.style.color = '#74c0fc';
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
            fileLink.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            fileLink.style.borderRadius = '4px';
            fileLink.style.marginTop = '8px';
            fileLink.style.textDecoration = 'none';
            fileLink.style.color = '#74c0fc';

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
}

function formatTimestamp(date) {
    const messageDate = new Date(date);
    const hours = messageDate.getHours().toString().padStart(2, '0');
    const minutes = messageDate.getMinutes().toString().padStart(2, '0');
    return `Today at ${hours}:${minutes}`;
}


// Function to reply to a message
function replyToMessage(message) {
    const messageInput = document.getElementById('messageInput');

    if (!messageInput) {
        console.error('Message input element not found');
        return;
    }

    // Format the reply message
    const replyText = `> **${message.author}**: ${message.text}\n\n`;

    // Insert the reply text at the beginning of the input
    const currentValue = messageInput.value;
    messageInput.value = replyText + currentValue;

    // Focus the input and move cursor to the end
    messageInput.focus();
    messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);

    // Adjust textarea height
    adjustTextareaHeight(messageInput);
}

// Function to handle reply to selected text
function setupReplyToSelection() {
    document.addEventListener('mouseup', function() {
        const selection = window.getSelection();
        if (selection.toString().trim() !== '') {
            // Create a temporary button to allow replying to selection
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Create reply button for selection
            const replyButton = document.createElement('button');
            replyButton.className = 'reply-selection-btn';
            replyButton.textContent = '↪';
            replyButton.title = 'Reply to selection';
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
                const selectedText = selection.toString();
                const messageInput = document.getElementById('messageInput');

                if (messageInput) {
                    // Find the message that contains the selection
                    const messageElement = selection.anchorNode.parentElement.closest('.message-group');
                    let author = 'Unknown';

                    if (messageElement) {
                        const authorElement = messageElement.querySelector('.message-author');
                        if (authorElement) {
                            author = authorElement.textContent;
                        }
                    }

                    // Format the reply to selection
                    const replyText = `> **${author}**: ${selectedText}\n\n`;

                    const currentValue = messageInput.value;
                    messageInput.value = replyText + currentValue;

                    messageInput.focus();
                    messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
                    adjustTextareaHeight(messageInput);
                }

                document.body.removeChild(replyButton);
            };

            document.body.appendChild(replyButton);

            // Remove button after a short time
            setTimeout(() => {
                if (replyButton.parentNode) {
                    document.body.removeChild(replyButton);
                }
            }, 3000);
        }
    });
}

// Function to parse and format replied messages for display
function formatQuotedText(text) {
    // Split text into lines
    const lines = text.split('\n');
    let formattedLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if the line is a quoted/replied line
        if (line.startsWith('> ')) {
            // Extract the quoted content
            let quotedContent = line.substring(2); // Remove '> '

            // Check if it's a formatted quote with author
            if (quotedContent.startsWith('**') && quotedContent.includes('**: ')) {
                const colonIndex = quotedContent.indexOf('**: ');
                if (colonIndex !== -1) {
                    const author = quotedContent.substring(2, colonIndex); // Remove '**'
                    const quoteText = quotedContent.substring(colonIndex + 4); // Remove '**author**: '

                    formattedLines.push(`<div class="quoted-message"><span class="quote-author">**${escapeHtml(author)}**:</span> ${escapeHtml(quoteText)}</div>`);
                } else {
                    // Simple quote without author
                    formattedLines.push(`<div class="quoted-message">${escapeHtml(quotedContent)}</div>`);
                }
            } else {
                // Simple quote without author
                formattedLines.push(`<div class="quoted-message">${escapeHtml(quotedContent)}</div>`);
            }
        } else {
            // Regular text line
            formattedLines.push(escapeHtml(line));
        }
    }

    return formattedLines.join('');
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

function scrollToBottom() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
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
        emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾']
    },
    'people': {
        icon: '👋',
        name: 'People & Body',
        emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞', '🧟', '💆', '💇', '🚶', '🧍', '🧎', '🏃', '💃', '🕺', '🕴️', '👯', '🧖', '🧗', '🤸', '🏌️', '🏇', '⛷️', '🏂', '🏋️', '🤼', '🤽', '🤾', '🤺', '⛹️', '🏊', '🚣', '🧘', '🛀', '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '👨‍👩‍👦', '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👨‍👦', '👨‍👦‍👦', '👨‍👧', '👨‍👧‍👦', '👨‍👧‍👧', '👩‍👦', '👩‍👦‍👦', '👩‍👧', '👩‍👧‍👦', '👩‍👧‍👧', '🗣️', '👤', '👥', '🫂', '👣']
    },
    'animals': {
        icon: '🐶',
        name: 'Animals & Nature',
        emojis: ['🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦣', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦫', '🦔', '🦇', '🐻', '🐻‍❄️', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉', '🦤', '🪶', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍', '🐲', '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭', '🐟', '🐠', '🐡', '🦈', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞', '🦗', '🪳', '🕷️', '🕸️', '🦂', '🦟', '🪰', '🪱', '🦠', '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃']
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
        emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '👁‍🗨', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧']
    },
    'flags': {
        icon: '🏳️',
        name: 'Flags',
        emojis: ['🏳️', '🏴', '🏴‍☠️', '🏁', '🚩', '🎌', '🏳️‍🌈', '🏳️‍⚧️', '🇺🇳', '🇦🇫', '🇦🇱', '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲', '🇦🇼', '🇦🇺', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿', '🇧🇯', '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷', '🇮🇴', '🇻🇬', '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮', '🇰🇭', '🇨🇲', '🇨🇦', '🇮🇨', '🇨🇻', '🇧🇶', '🇰🇾', '🇨🇫', '🇹🇩', '🇨🇱', '🇨🇳', '🇨🇽', '🇨🇨', '🇨🇴', '🇰🇲', '🇨🇬', '🇨🇩', '🇨🇰', '🇨🇷', '🇨🇮', '🇭🇷', '🇨🇺', '🇨🇼', '🇨🇾', '🇨🇿', '🇩🇰', '🇩🇯', '🇩🇲', '🇩🇴', '🇪🇨', '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇸🇿', '🇪🇹', '🇪🇺', '🇫🇰', '🇫🇴', '🇫🇯', '🇫🇮', '🇫🇷', '🇬🇫', '🇵🇫', '🇹🇫', '🇬🇦', '🇬🇲', '🇬🇪', '🇩🇪', '🇬🇭', '🇬🇮', '🇬🇷', '🇬🇱', '🇬🇩', '🇬🇵', '🇬🇺', '🇬🇹', '🇬🇬', '🇬🇳', '🇬🇼', '🇬🇾', '🇭🇹', '🇭🇳', '🇭🇰', '🇭🇺', '🇮🇸', '🇮🇳', '🇮🇩', '🇮🇷', '🇮🇶', '🇮🇪', '🇮🇲', '🇮🇱', '🇮🇹', '🇯🇲', '🇯🇵', '🎌', '🇯🇪', '🇯🇴', '🇰🇿', '🇰🇪', '🇰🇮', '🇽🇰', '🇰🇼', '🇰🇬', '🇱🇦', '🇱🇻', '🇱🇧', '🇱🇸', '🇱🇷', '🇱🇾', '🇱🇮', '🇱🇹', '🇱🇺', '🇲🇴', '🇲🇬', '🇲🇼', '🇲🇾', '🇲🇻', '🇲🇱', '🇲🇹', '🇲🇭', '🇲🇶', '🇲🇷', '🇲🇺', '🇾🇹', '🇲🇽', '🇫🇲', '🇲🇩', '🇲🇨', '🇲🇳', '🇲🇪', '🇲🇸', '🇲🇦', '🇲🇿', '🇲🇲', '🇳🇦', '🇳🇷', '🇳🇵', '🇳🇱', '🇳🇨', '🇳🇿', '🇳🇮', '🇳🇪', '🇳🇬', '🇳🇺', '🇳🇫', '🇰🇵', '🇲🇰', '🇲🇵', '🇳🇴', '🇴🇲', '🇵🇰', '🇵🇼', '🇵🇸', '🇵🇦', '🇵🇬', '🇵🇾', '🇵🇪', '🇵🇭', '🇵🇳', '🇵🇱', '🇵🇹', '🇵🇷', '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇺', '🇷🇼', '🇼🇸', '🇸🇲', '🇸🇹', '🇸🇦', '🇸🇳', '🇷🇸', '🇸🇨', '🇸🇱', '🇸🇬', '🇸🇽', '🇸🇰', '🇸🇮', '🇬🇸', '🇸🇧', '🇸🇴', '🇿🇦', '🇰🇷', '🇸🇸', '🇪🇸', '🇱🇰', '🇧🇱', '🇸🇭', '🇰🇳', '🇱🇨', '🇵🇲', '🇻🇨', '🇸🇩', '🇸🇷', '🇸🇪', '🇨🇭', '🇸🇾', '🇹🇼', '🇹🇯', '🇹🇿', '🇹🇭', '🇹🇱', '🇹🇬', '🇹🇰', '🇹🇴', '🇹🇹', '🇹🇳', '🇹🇷', '🇹🇲', '🇹🇨', '🇹🇻', '🇻🇮', '🇺🇬', '🇺🇦', '🇦🇪', '🇬🇧', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇺', '🇻🇦', '🇻🇪', '🇻🇳', '🇼🇫', '🇪🇭', '🇾🇪', '🇿🇲', '🇿🇼']
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
            timestamp: new Date(),
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
            // Start screen sharing
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
            } else {
                alert('Error sharing screen. Please try again.');
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
               addMessageToUI({
                   id: message.id,
                   author: message.username,
                   avatar: message.avatar || message.username.charAt(0).toUpperCase(),
                   text: message.content,
                   timestamp: message.created_at,
                   reactions: message.reactions || [],
                   file: message.file  // Добавляем информацию о файле, если она есть
               });
           });
       } else {
           console.error('Failed to load DM history');
       }
   } catch (error) {
       console.error('Error loading DM history:', error);
   }

   scrollToBottom();
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
       <div class="friend-avatar self-chat-icon">${currentUser.avatar || currentUser.username.charAt(0).toUpperCase()}</div>
       <span>Self Chat</span>
   `;
   selfChatItem.addEventListener('click', () => {
       startSelfChat();
   });
   dmList.appendChild(selfChatItem);

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
       dmItem.innerHTML = `
           <div class="friend-avatar">${friend.avatar || friend.username.charAt(0).toUpperCase()}</div>
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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
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
            console.log('Sending ICE candidate');
            socket.emit('ice-candidate', {
                to: remoteSocketId,
                candidate: event.candidate
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
        
        if (!participantDiv) {
            participantDiv = document.createElement('div');
            participantDiv.className = 'participant';
            participantDiv.id = `participant-${remoteSocketId}`;
            
            remoteVideo = document.createElement('video');
            remoteVideo.id = `remote-${remoteSocketId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.volume = isDeafened ? 0 : 1; // Respect deafened state
            
            const participantName = document.createElement('div');
            participantName.className = 'participant-name';
            participantName.textContent = 'Friend';
            
            participantDiv.appendChild(remoteVideo);
            participantDiv.appendChild(participantName);
            remoteParticipants.appendChild(participantDiv);
        }
        
        // Set the stream to the video element
        if (event.streams && event.streams[0]) {
            console.log('Setting remote stream to video element');
            remoteVideo = document.getElementById(`remote-${remoteSocketId}`);
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                
                // Ensure audio is playing
                remoteVideo.play().catch(e => {
                    console.error('Error playing remote video:', e);
                    // Try to play after user interaction
                    document.addEventListener('click', () => {
                        remoteVideo.play().catch(err => console.error('Still cannot play:', err));
                    }, { once: true });
                });
            }
        }
        
        // Initialize resizable videos
        function initializeResizableVideos() {
            const callInterface = document.getElementById('callInterface');
            const participants = callInterface.querySelectorAll('.participant');
            
            participants.forEach(participant => {
                makeResizable(participant);
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
        const originalOntrack = RTCPeerConnection.prototype.ontrack;
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
            if (typeof makeResizable === 'function' && participantDiv) {
                makeResizable(participantDiv);
            }
        }, 100);
    };

    // Create offer if initiator with modern constraints
    if (isInitiator) {
        pc.createOffer()
        .then(offer => {
            console.log('Created offer with SDP:', offer.sdp.substring(0, 200));
            return pc.setLocalDescription(offer);
        })
        .then(() => {
            console.log('Sending offer to:', remoteSocketId);
            socket.emit('offer', {
                to: remoteSocketId,
                offer: pc.localDescription
            });
        })
        .catch(error => {
            console.error('Error creating offer:', error);
        });
    }
    
    return pc;
}

// Initialize resizable videos
function initializeResizableVideos() {
    const callInterface = document.getElementById('callInterface');
    if (!callInterface) return;
    
    const participants = callInterface.querySelectorAll('.participant');
    participants.forEach(participant => {
        makeResizable(participant);
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
