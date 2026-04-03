(function attachNotificationsModule(global) {
  function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return global.i18n ? global.i18n.t('time.justNow') : 'Just now';
    if (seconds < 3600) {
      const minutesAgo = global.i18n ? global.i18n.t('time.minutesAgo') : '{count} min ago';
      return minutesAgo.replace('{count}', String(Math.floor(seconds / 60)));
    }
    if (seconds < 86400) {
      const hoursAgo = global.i18n ? global.i18n.t('time.hoursAgo') : '{count} h ago';
      return hoursAgo.replace('{count}', String(Math.floor(seconds / 3600)));
    }

    const daysAgo = global.i18n ? global.i18n.t('time.daysAgo') : '{count} d ago';
    return daysAgo.replace('{count}', String(Math.floor(seconds / 86400)));
  }

  function createController(options) {
    function updateBadge() {
      const badge = document.getElementById('notificationBadge');
      if (!badge) return;

      const notifications = options.getService()?.getNotifications() || [];
      const unreadCount = notifications.filter((item) => !item.read).length;

      if (unreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        return;
      }

      badge.style.display = 'none';
    }

    function renderList() {
      const container = document.getElementById('notificationsList');
      if (!container) return;

      const notifications = options.getService()?.getNotifications() || [];
      if (notifications.length === 0) {
        const emptyText = global.i18n ? global.i18n.t('notifications.empty') : 'No notifications';
        container.innerHTML = `<div class="notifications-panel-empty">${emptyText}</div>`;
        return;
      }

      let html = '';
      notifications.forEach((notification) => {
        const timeAgo = getTimeAgo(new Date(notification.timestamp));
        const unreadClass = notification.read ? '' : 'unread';

        if (notification.type === 'missed-call') {
          const callType = notification.callType === 'video'
            ? (global.i18n ? global.i18n.t('call.missedType.video') : 'Video')
            : (global.i18n ? global.i18n.t('call.missedType.audio') : 'Audio');
          const missedCallTemplate = global.i18n ? global.i18n.t('call.missedCall') : 'Missed {type} call';
          const missedCallText = missedCallTemplate.replace('{type}', callType);
          const callBackText = global.i18n ? global.i18n.t('actions.callBack') : 'Call back';
          const dismissText = global.i18n ? global.i18n.t('actions.dismiss') : 'Dismiss';

          html += `
            <div class="notification-item ${unreadClass}">
              <div class="notification-item-icon missed-call">📞</div>
              <div class="notification-item-content">
                <div class="notification-item-header">
                  <span class="notification-item-title">${notification.username}</span>
                  <span class="notification-item-time">${timeAgo}</span>
                </div>
                <div class="notification-item-text">${missedCallText}</div>
                <div class="notification-item-actions">
                  <button class="call-back" onclick="callUser('${notification.userId}', '${notification.callType}')">${callBackText}</button>
                  <button class="dismiss" onclick="dismissNotification('${notification.userId}')">${dismissText}</button>
                </div>
              </div>
            </div>
          `;
          return;
        }

        if (notification.type === 'message') {
          html += `
            <div class="notification-item ${unreadClass}">
              <div class="notification-item-icon message">💬</div>
              <div class="notification-item-content">
                <div class="notification-item-header">
                  <span class="notification-item-title">${notification.username}</span>
                  <span class="notification-item-time">${timeAgo}</span>
                </div>
                <div class="notification-item-text">${notification.text}</div>
              </div>
            </div>
          `;
        }
      });

      container.innerHTML = html;
    }

    function initializePanel() {
      const notificationsBtn = document.getElementById('notificationsBtn');
      const notificationsPanel = document.getElementById('notificationsPanel');
      const markAllReadBtn = document.getElementById('markAllReadBtn');

      if (notificationsBtn) {
        notificationsBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!notificationsPanel) return;

          notificationsPanel.classList.toggle('active');
          const isActive = notificationsPanel.classList.contains('active');
          notificationsPanel.setAttribute('aria-hidden', String(!isActive));

          if (!isActive) return;

          options.getService()?.markMissedCallsAsRead();
          renderList();
        });
      }

      document.addEventListener('click', (event) => {
        if (!notificationsPanel || notificationsPanel.contains(event.target)) return;
        if (notificationsBtn && notificationsBtn.contains(event.target)) return;

        notificationsPanel.classList.remove('active');
        notificationsPanel.setAttribute('aria-hidden', 'true');
      });

      if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', () => {
          options.getService()?.markMissedCallsAsRead();
          updateBadge();
          renderList();
        });
      }

      options.getService()?.loadFromLocalStorage();
      updateBadge();
      renderList();
    }

    function requestPermissionOnce() {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    function requestPermission() {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    function showNotification(title, body) {
      if ('Notification' in window && Notification.permission === 'granted') {
        return new Notification(title, { body });
      }
      return null;
    }

    function initialize() {
      if (typeof NotificationService === 'undefined') {
        console.warn('NotificationService not loaded, skipping initialization');
        return null;
      }

      const service = new NotificationService();
      options.setService(service);
      service.init();
      initializePanel();

      setTimeout(() => {
        const friends = options.getLastLoadedFriends();
        if (friends) {
          options.populateDMList(friends);
        }
      }, 500);

      return service;
    }

    function addMessageNotification(sender, messageText, isDM = true) {
      const service = options.getService();
      if (!service) return;

      const isInChat = isDM
        && options.getCurrentView() === 'dm'
        && options.getCurrentDMUserId() === sender.id;
      if (isInChat && document.hasFocus()) return;

      service.incrementUnread(sender.id, {
        username: sender.username,
        avatar: sender.avatar,
        text: messageText
      });
      updateBadge();
      renderList();
      service.showMessageNotification(sender, messageText, isDM);
    }

    function addCallNotification(fromUser, callType = 'voice') {
      const service = options.getService();
      if (!service) return;

      const incomingTitle = global.i18n ? global.i18n.t('call.incoming') : 'Incoming call';
      const incomingBodyTemplate = global.i18n ? global.i18n.t('call.isCallingYou') : '{username} is calling you';
      const incomingBody = incomingBodyTemplate.replace('{username}', fromUser.username);

      service.showBrowserNotification(incomingTitle, {
        body: incomingBody,
        requireInteraction: true,
        tag: 'incoming-call'
      });
      service.playNotificationSound('call');
    }

    function dismissNotification(userId) {
      const service = options.getService();
      if (!service) return;

      service.notifications = service.notifications.filter((item) => item.userId !== userId);
      service.missedCalls = service.missedCalls.filter((item) => item.from.id !== userId);
      service.saveToLocalStorage();
      renderList();
      updateBadge();
    }

    global.callUser = function callUser(userId, callType) {
      const panel = document.getElementById('notificationsPanel');
      if (panel) panel.classList.remove('active');
      options.onCallUser(userId, callType);
    };

    global.dismissNotification = dismissNotification;

    return {
      addCallNotification,
      addMessageNotification,
      dismissNotification,
      getTimeAgo,
      initialize,
      initializePanel,
      renderList,
      requestPermission,
      requestPermissionOnce,
      showNotification,
      updateBadge
    };
  }

  global.VoxiiNotificationsUI = { createController, getTimeAgo };
})(window);
