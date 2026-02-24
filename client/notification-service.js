/**
 * Notification Service - система уведомлений для Voxii
 * Работает через Browser Notification API и серверное API
 */

class NotificationService {
    constructor() {
        this.permission = 'default';
        this.unreadCounts = new Map();
        this.missedCalls = [];
        this.notifications = [];
        this.audioContext = null;
        this.isMuted = false;
        
        if ('Notification' in window) {
            this.permission = Notification.permission;
        }
    }

    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('Notifications not supported');
            return false;
        }
        if (this.permission === 'granted') return true;
        if (this.permission === 'denied') return false;
        try {
            this.permission = await Notification.requestPermission();
            return this.permission === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    showBrowserNotification(title, options = {}) {
        if (!('Notification' in window)) return null;
        if (this.permission !== 'granted') return null;
        try {
            const notification = new Notification(title, {
                body: options.body || '',
                icon: options.icon || '/assets/icon.png',
                tag: options.tag || 'voxii-notification',
                requireInteraction: options.requireInteraction || false
            });
            if (!options.requireInteraction) {
                setTimeout(() => notification.close(), 5000);
            }
            return notification;
        } catch (error) {
            console.error('Error showing notification:', error);
            return null;
        }
    }

    playNotificationSound(type = 'message') {
        if (this.isMuted) return;
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            const now = this.audioContext.currentTime;
            if (type === 'message') {
                this.playTone(800, 0.1, now, 'sine');
                this.playTone(1200, 0.15, now + 0.1, 'sine');
            } else if (type === 'call') {
                this.playTone(600, 0.2, now, 'sine');
                this.playTone(800, 0.2, now + 0.25, 'sine');
                this.playTone(600, 0.2, now + 0.5, 'sine');
                this.playTone(800, 0.3, now + 0.75, 'sine');
            }
        } catch (error) {
            console.warn('Could not play notification sound:', error);
        }
    }

    playTone(frequency, duration, startTime, type = 'sine') {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    }

    async loadFromServer() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return false;
            const response = await fetch('/api/notifications/unread', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const data = await response.json();
                this.notifications = data.notifications.map(n => ({
                    id: n.id,
                    type: n.type,
                    userId: n.fromUserId,
                    username: n.fromUsername || 'Пользователь',
                    avatar: n.fromAvatar || 'U',
                    text: n.content || '',
                    callType: n.callType,
                    timestamp: n.createdAt,
                    read: n.read === 1 || n.read === true
                }));
                this.missedCalls = this.notifications
                    .filter(n => n.type === 'missed-call')
                    .map(n => ({
                        from: { id: n.userId, username: n.username, avatar: n.avatar },
                        type: n.callType,
                        timestamp: n.timestamp,
                        read: n.read
                    }));
                this.unreadCounts = new Map();
                this.notifications
                    .filter(n => n.type === 'message')
                    .forEach(n => {
                        const current = this.unreadCounts.get(n.userId) || 0;
                        this.unreadCounts.set(n.userId, current + 1);
                    });
                this.updateDocumentTitle();
                return true;
            }
        } catch (error) {
            console.warn('Could not load notifications from server:', error);
        }
        return false;
    }

    incrementUnread(userId, userData = {}) {
        const current = this.unreadCounts.get(userId) || 0;
        this.unreadCounts.set(userId, current + 1);
        this.updateDocumentTitle();
        this.notifications.push({
            type: 'message',
            userId: userId,
            username: userData.username || 'Пользователь',
            avatar: userData.avatar || 'U',
            text: userData.text || 'Новое сообщение',
            timestamp: new Date().toISOString(),
            read: false
        });
        this.saveToLocalStorage();
    }

    resetUnread(userId) {
        if (userId) this.unreadCounts.delete(userId);
        else this.unreadCounts.clear();
        this.updateDocumentTitle();
        this.saveToLocalStorage();
    }

    getTotalUnread() {
        let total = 0;
        this.unreadCounts.forEach(count => total += count);
        return total;
    }

    updateDocumentTitle() {
        const total = this.getTotalUnread();
        document.title = total > 0 ? `(${total}) Voxii` : 'Voxii';
    }

    addMissedCall(fromUser, callType = 'voice', timestamp = new Date()) {
        const callData = {
            from: fromUser,
            type: callType,
            timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp,
            read: false
        };
        this.missedCalls.push(callData);
        this.notifications.push({
            type: 'missed-call',
            userId: fromUser.id,
            username: fromUser.username || 'Пользователь',
            avatar: fromUser.avatar || 'U',
            callType: callType,
            timestamp: callData.timestamp,
            read: false
        });
        this.saveToLocalStorage();
        this.showMissedCallNotification(fromUser, callType);
    }

    showMissedCallNotification(fromUser, callType) {
        const title = `Пропущенный ${callType === 'video' ? 'видео' : 'голосовой'} звонок`;
        const body = `${fromUser.username} звонил(а) вам`;
        this.showBrowserNotification(title, {
            body,
            requireInteraction: true,
            tag: 'missed-call-' + Date.now()
        });
        this.playNotificationSound('call');
    }

    getMissedCalls() {
        return this.missedCalls;
    }

    async markMissedCallsAsRead() {
        this.missedCalls.forEach(call => call.read = true);
        this.notifications.forEach(n => {
            if (n.type === 'missed-call') n.read = true;
        });
        await this.markAllReadOnServer();
        this.saveToLocalStorage();
    }

    async markAllReadOnServer() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            await fetch('/api/notifications/mark-all-read', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.warn('Could not mark notifications as read on server:', error);
        }
    }

    async markUserReadOnServer(userId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            await fetch('/api/notifications/mark-user-read', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fromUserId: userId })
            });
        } catch (error) {
            console.warn('Could not mark user notifications as read on server:', error);
        }
    }

    async clearMissedCalls() {
        this.missedCalls = [];
        this.notifications = [];
        this.unreadCounts.clear();
        await this.deleteAllOnServer();
        this.saveToLocalStorage();
    }

    async deleteAllOnServer() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            await fetch('/api/notifications', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.warn('Could not delete notifications on server:', error);
        }
    }

    saveToLocalStorage() {
        try {
            const unreadData = {};
            this.unreadCounts.forEach((count, userId) => {
                unreadData[userId] = count;
            });
            localStorage.setItem('voxii_unread_counts', JSON.stringify(unreadData));
            localStorage.setItem('voxii_missed_calls', JSON.stringify(this.missedCalls));
            localStorage.setItem('voxii_notifications', JSON.stringify(this.notifications));
        } catch (error) {
            console.warn('Could not save to localStorage:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const unreadData = localStorage.getItem('voxii_unread_counts');
            if (unreadData) {
                const parsed = JSON.parse(unreadData);
                this.unreadCounts = new Map(Object.entries(parsed));
                this.updateDocumentTitle();
            }
            const missedCalls = localStorage.getItem('voxii_missed_calls');
            if (missedCalls) this.missedCalls = JSON.parse(missedCalls);
            const notifications = localStorage.getItem('voxii_notifications');
            if (notifications) this.notifications = JSON.parse(notifications);
            return true;
        } catch (error) {
            console.warn('Could not load from localStorage:', error);
            return false;
        }
    }

    getNotifications() {
        return [...this.notifications].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
    }

    async clearAll() {
        this.missedCalls = [];
        this.notifications = [];
        this.unreadCounts.clear();
        await this.deleteAllOnServer();
        this.saveToLocalStorage();
        this.updateDocumentTitle();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }

    showMessageNotification(sender, messageText, isDM = true) {
        const title = isDM ? sender.username : `#${sender.channelName}`;
        const body = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;
        this.showBrowserNotification(title, {
            body,
            tag: 'message-' + sender.id
        });
        this.playNotificationSound('message');
    }

    async init() {
        this.loadFromLocalStorage();
        await this.loadFromServer();
        const requestPermissionHandler = () => {
            this.requestPermission();
            document.removeEventListener('click', requestPermissionHandler);
            document.removeEventListener('keydown', requestPermissionHandler);
        };
        document.addEventListener('click', requestPermissionHandler, { once: true });
        document.addEventListener('keydown', requestPermissionHandler, { once: true });
    }
}

window.NotificationService = NotificationService;
