// Client configuration
// When hosted on same server as API, leave API_URL empty
const config = {
  API_URL: '',
  SOCKET_OPTIONS: {}
};

window.APP_CONFIG = config;

/* =========================
   File upload constants
   ========================= */
window.FILE_FORMATS = {
  // Audio formats for voice messages and file uploads
  AUDIO: {
    mimeTypes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/webm',
      'audio/opus',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      'audio/wav',
      'audio/x-wav',
      'audio/flac',
      'audio/x-flac',
      'audio/x-ms-wma',
      'audio/vnd.wave',
      'audio/3gpp',
      'audio/3gpp2'
    ],
    extensions: ['.mp3', '.ogg', '.webm', '.opus', '.m4a', '.wav', '.aac', '.flac', '.wma', '.3gp', '.3g2'],
    // Mapping MIME types to file extensions
    extensionMap: {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
      'audio/opus': 'opus',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'm4a',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
      'audio/x-ms-wma': 'wma',
      'audio/3gpp': '3gp',
      'audio/3gpp2': '3g2'
    }
  },
  // Video formats
  VIDEO: {
    mimeTypes: [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'video/mpeg',
      'video/ogg',
      'video/3gpp',
      'video/3gpp2'
    ],
    extensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.mpeg', '.mpg', '.ogv', '.3gp', '.3g2'],
    // Mapping MIME types to file extensions
    extensionMap: {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/x-matroska': 'mkv',
      'video/mpeg': 'mpeg',
      'video/ogg': 'ogv',
      'video/3gpp': '3gp',
      'video/3gpp2': '3g2'
    }
  },
  // Image formats
  IMAGE: {
    mimeTypes: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/x-icon',
      'image/tiff',
      'image/heic',
      'image/heif'
    ],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.tif', '.heic', '.heif'],
    // Mapping MIME types to file extensions
    extensionMap: {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/x-icon': 'ico',
      'image/tiff': 'tiff',
      'image/heic': 'heic',
      'image/heif': 'heif'
    }
  },
  // Document formats
  DOCUMENT: {
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/html',
      'text/css',
      'text/csv',
      'text/markdown'
    ],
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.html', '.htm', '.css', '.csv', '.md'],
    // Mapping MIME types to file extensions
    extensionMap: {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/html': 'html',
      'text/css': 'css',
      'text/csv': 'csv',
      'text/markdown': 'md'
    }
  },
  // Archive formats
  ARCHIVE: {
    mimeTypes: [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-tar',
      'application/x-7z-compressed',
      'application/x-gzip',
      'application/gzip',
      'application/x-bzip2',
      'application/x-xz',
      'application/vnd.ms-cab-compressed'
    ],
    extensions: ['.zip', '.rar', '.tar', '.7z', '.gz', '.gzip', '.bz2', '.xz', '.cab', '.iso'],
    // Mapping MIME types to file extensions
    extensionMap: {
      'application/zip': 'zip',
      'application/x-rar-compressed': 'rar',
      'application/x-tar': 'tar',
      'application/x-7z-compressed': '7z',
      'application/x-gzip': 'gz',
      'application/gzip': 'gz',
      'application/x-bzip2': 'bz2',
      'application/x-xz': 'xz',
      'application/vnd.ms-cab-compressed': 'cab'
    }
  }
};

// Helper function to get file extension from MIME type
window.getFileExtensionFromMime = function(mimeType) {
  if (!mimeType) return 'bin';
  
  // Check audio formats
  if (mimeType.startsWith('audio/')) {
    const audioExt = window.FILE_FORMATS?.AUDIO?.extensionMap?.[mimeType];
    if (audioExt) return audioExt;
  }
  
  // Check video formats
  if (mimeType.startsWith('video/')) {
    const videoExt = window.FILE_FORMATS?.VIDEO?.extensionMap?.[mimeType];
    if (videoExt) return videoExt;
  }
  
  // Check image formats
  if (mimeType.startsWith('image/')) {
    const imageExt = window.FILE_FORMATS?.IMAGE?.extensionMap?.[mimeType];
    if (imageExt) return imageExt;
  }
  
  // Check document formats
  if (mimeType.startsWith('text/') || mimeType.startsWith('application/')) {
    const docExt = window.FILE_FORMATS?.DOCUMENT?.extensionMap?.[mimeType];
    if (docExt) return docExt;
  }
  
  // Check archive formats
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || 
      mimeType.includes('7z') || mimeType.includes('gzip') || mimeType.includes('bzip') || 
      mimeType.includes('xz') || mimeType.includes('cab') || mimeType.includes('iso')) {
    const archiveExt = window.FILE_FORMATS?.ARCHIVE?.extensionMap?.[mimeType];
    if (archiveExt) return archiveExt;
  }
  
  // Fallback: extract from MIME type
  const subtype = mimeType.split('/')[1];
  if (subtype) {
    const ext = subtype.split(';')[0].split('+')[0];
    // Handle special cases
    if (ext === 'svg+xml') return 'svg';
    if (ext === 'octet-stream') return 'bin';
    return ext;
  }
  
  return 'bin';
};

/* =========================
   i18n dictionary (Voxii)
   ========================= */
window.I18N = {
  en: {
    "app.title": "Voxii",
    "nav.friends": "Friends",
    "notifications.empty": "No notifications",
    "auth.pageTitle": "Voxii - Login",
    "auth.welcomeBack": "Welcome back!",
    "auth.welcomeSubtitle": "We're so excited to see you again!",
    "auth.createAccount": "Create an account",
    "auth.createSubtitle": "Welcome to Voxii!",
    "auth.username": "USERNAME",
    "auth.email": "EMAIL",
    "auth.password": "PASSWORD",
    "auth.confirmPassword": "CONFIRM PASSWORD",
    "auth.loginBtn": "Log In",
    "auth.registerBtn": "Register",
    "auth.needAccount": "Need an account?",
    "auth.haveAccount": "Already have an account?",
    "auth.loginLink": "Log In",
    "auth.registerLink": "Register",
    "auth.error.usernameMin": "Username must be at least 3 characters long",
    "auth.error.passwordMismatch": "Passwords do not match",
    "auth.error.invalidEmail": "Please enter a valid email address",
    "auth.error.passwordMin": "Password must be at least 6 characters long",
    "auth.error.loginFailed": "Login failed",
    "auth.error.registrationFailed": "Registration failed",
    "auth.error.network": "Network error. Please try again.",
    "auth.success.login": "Login successful! Redirecting...",
    "auth.success.registration": "Registration successful! Redirecting...",

    "dm.search": "Find or start a conversation",
    "dm.directMessages": "DIRECT MESSAGES",

    "status.online": "Online",
    "status.offline": "Offline",

    "friends.online": "Online",
    "friends.all": "All",
    "friends.pending": "Pending",
    "friends.add": "Add Friend",
    "friends.addTitle": "ADD FRIEND",
    "friends.addDesc": "You can add friends by searching all users.",
    "friends.searchUser": "Search username",
    "friends.noOneOnline": "No one is online",
    "friends.noPendingRequests": "No pending requests",
    "friends.noFriendsYet": "No friends yet",
    "friends.noUsersFound": "No users found",
    "friends.incomingRequest": "Incoming Friend Request",
    "friends.removeConfirm": "Are you sure you want to remove this friend?",
    "friends.requestSent": "Friend request sent!",
    "friends.sendRequestFailed": "Failed to send friend request",

    "actions.search": "Search",
    "actions.attach": "Attach",
    "actions.emoji": "Emoji",
    "actions.voiceMessage": "Voice Message",
    "actions.transcribe": "Transcribe",
    "actions.mute": "Mute",
    "actions.deafen": "Deafen",
    "actions.settings": "Settings",
    "actions.changeTheme": "Change Theme",
    "actions.close": "Close",
    "actions.apply": "Apply",
    "actions.callBack": "Call back",
    "actions.dismiss": "Dismiss",
    "actions.reply": "Reply to message",
    "actions.edit": "Edit message",
    "actions.delete": "Delete message",
    "actions.hidePreview": "Hide preview",
    "actions.downloadViewFile": "Download/View Full File",
    "actions.minimize": "Minimize",
    "actions.maximize": "Maximize",
    "actions.fullscreen": "Fullscreen",
    "actions.clearSearch": "Clear search",

    "chat.message": "Message...",
    "chat.messageTo": "Message",
    "chat.messageToChannel": "Message",
    "chat.searchPlaceholder": "Search in chat...",
    "chat.messageYourself": "Message yourself...",
    "chat.noMessagesYet": "No messages yet. Be the first to say hello!",
    "chat.noConversationsYet": "No conversations yet.",
    "chat.callWith": "Call with",
    "chat.connectedWith": "Connected with",
    "chat.joinedCallWith": "Joined call with",
    "chat.news": "News",
    "chat.newsReadOnly": "News is read-only",
    "chat.loading": "Loading...",
    "chat.subscribers": "{count} subscribers",
    "chat.subscriber.one": "subscriber",
    "chat.subscriber.few": "subscribers",
    "chat.subscriber.many": "subscribers",
    "chat.filePreviewFailed": "[Unable to load preview]",
    "chat.systemUser": "System",
    "chat.friend": "Friend",
    "chat.participant": "Participant",
    "chat.voiceMessage": "Voice message",
    "chat.fileLabel": "File",
    "message.edited": "(edited)",
    "message.deleteConfirm": "Are you sure you want to delete this message?",
    "time.todayAt": "Today at",
    "time.yesterdayAt": "Yesterday at",
    "time.dateFormat": "{date} at {time}",
    "time.justNow": "Just now",
    "time.minutesAgo": "{count} min ago",
    "time.hoursAgo": "{count} h ago",
    "time.daysAgo": "{count} d ago",
    "chat.selfChat": "Self Chat",
    "chat.attachment": "Attachment",

    // Theme related translations
    "theme.title": "Theme Settings",
    "theme.custom_color": "Custom Color",
    "theme.select_theme": "Select Theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.oled": "OLED Dark",
    "theme.system": "System",
    "theme.transparency": "Transparency",
    "theme.accent_color": "Accent Color",
    "theme.defaultDark": "Default Dark",
    "theme.midnightBlue": "Midnight Blue",
    "theme.forestGreen": "Forest Green",
    "theme.sunsetPurple": "Sunset Purple",
    "theme.oceanBlue": "Ocean Blue",
    "theme.coffeeBrown": "Coffee Brown",
    "theme.highContrast": "High Contrast",
    "theme.deuteranopia": "Deuteranopia Friendly",
    "theme.tritanopia": "Tritanopia Friendly",
    "theme.customColor": "Custom Color:",
    "theme.glassEffect": "Glass Effect:",

    // Call related translations
    "call.voiceChannel": "Voice Channel",
    "call.you": "You",
    "call.isCalling": "is calling you...",
    "call.accept": "Accept",
    "call.decline": "Decline",
    "call.toggleVideo": "Toggle Video",
    "call.toggleAudio": "Toggle Audio",
    "call.toggleScreen": "Share Screen",
    "call.declined": "Call was declined",
    "call.incoming": "Incoming call",
    "call.isCallingYou": "{username} is calling you",
    "call.missedType.audio": "Audio",
    "call.missedType.video": "Video",
    "call.missedCall": "Missed {type} call",
    "call.accessDenied": "Failed to access camera/microphone. Please check permissions.",
    "call.micAccessDenied": "Could not access microphone. Please check permissions.",
    "call.screenDenied": "Screen sharing permission denied",
    "call.screenUnsupported": "Screen sharing is not supported on this device. Camera access was also denied.",
    "call.screenError": "Error sharing screen. Please try again. Note: Screen sharing may not be supported on mobile devices.",
    "call.screenStopCamera": "Stop Camera Share",
    "call.screenStop": "Stop Screen Share",
    "call.screenShareCamera": "Share Camera (Mobile)",
    "call.screenShare": "Share Screen",

    // Settings related translations
    "settings.title": "Settings",
    "settings.privacy": "Privacy & Content",
    "settings.linkPreview": "Link Previews",
    "settings.linkPreviewDesc": "Show preview cards for links in messages",
    "settings.clearHiddenPreviews": "Clear Hidden Previews",
    "settings.account": "Account",
    "settings.logout": "Logout",
    "settings.hiddenPreviewsReset": "All hidden previews have been reset",
    "settings.logoutConfirm": "Do you want to logout?",

    // Additional action translations
    "actions.notifications": "Notifications",
    "actions.menu": "Menu",
    "actions.send": "Send",
    "actions.forward": "Forward message",
    "actions.pin": "Pin message",
    "actions.unpin": "Unpin message",
    "chat.forwardedMessage": "Forwarded message",
    "chat.forwardedFrom": "Forwarded from",
    "chat.originalAuthor": "Author",
    "chat.forwardTo": "Forward message to:",
    "chat.unknownSource": "Unknown source",
    "chat.unknownUser": "Unknown",
    "chat.pinnedMessages": "Pinned messages",
    "message.pinned": "Pinned",
    "errors.noForwardChats": "No available chats for forwarding",
    "errors.invalidRecipient": "Invalid recipient",
    "errors.voiceCorrupted": "Voice recording is corrupted. Please try again.",
    "errors.newsLoadFailed": "Failed to load news",
    "errors.uploadFailed": "Failed to upload file",
    "errors.voiceSendFailed": "Failed to send voice message",
    "errors.transcribeFailed": "Failed to transcribe",
    "errors.sendRequestFailed": "Failed to send request",
    "voice.releaseToSend": "Release to send voice message",
    "voice.clickToSeek": "Click to seek",
    "upload.fileInProgress": "Uploading file...",
    "upload.voiceInProgress": "Uploading voice message..."
  },

  ru: {
    "app.title": "Voxii",
    "nav.friends": "Друзья",
    "notifications.empty": "Нет уведомлений",
    "auth.pageTitle": "Voxii - Вход",
    "auth.welcomeBack": "С возвращением!",
    "auth.welcomeSubtitle": "Мы очень рады видеть тебя снова!",
    "auth.createAccount": "Создать аккаунт",
    "auth.createSubtitle": "Добро пожаловать в Voxii!",
    "auth.username": "ИМЯ ПОЛЬЗОВАТЕЛЯ",
    "auth.email": "EMAIL",
    "auth.password": "ПАРОЛЬ",
    "auth.confirmPassword": "ПОДТВЕРДИТЕ ПАРОЛЬ",
    "auth.loginBtn": "Войти",
    "auth.registerBtn": "Регистрация",
    "auth.needAccount": "Нет аккаунта?",
    "auth.haveAccount": "Уже есть аккаунт?",
    "auth.loginLink": "Войти",
    "auth.registerLink": "Регистрация",
    "auth.error.usernameMin": "Имя пользователя должно быть не короче 3 символов",
    "auth.error.passwordMismatch": "Пароли не совпадают",
    "auth.error.invalidEmail": "Введите корректный email",
    "auth.error.passwordMin": "Пароль должен быть не короче 6 символов",
    "auth.error.loginFailed": "Ошибка входа",
    "auth.error.registrationFailed": "Ошибка регистрации",
    "auth.error.network": "Ошибка сети. Попробуйте снова.",
    "auth.success.login": "Вход выполнен! Перенаправление...",
    "auth.success.registration": "Регистрация выполнена! Перенаправление...",

    "dm.search": "Найти или начать диалог",
    "dm.directMessages": "ЛИЧНЫЕ СООБЩЕНИЯ",

    "status.online": "В сети",
    "status.offline": "Не в сети",

    "friends.online": "В сети",
    "friends.all": "Все",
    "friends.pending": "Ожидают",
    "friends.add": "Добавить",
    "friends.addTitle": "ДОБАВИТЬ ДРУГА",
    "friends.addDesc": "Ты можешь добавить друзей, найдя пользователя.",
    "friends.searchUser": "Никнейм",
    "friends.noOneOnline": "Никого нет в сети",
    "friends.noPendingRequests": "Нет ожидающих заявок",
    "friends.noFriendsYet": "Пока нет друзей",
    "friends.noUsersFound": "Пользователи не найдены",
    "friends.incomingRequest": "Входящая заявка в друзья",
    "friends.removeConfirm": "Вы уверены, что хотите удалить этого друга?",
    "friends.requestSent": "Запрос в друзья отправлен!",
    "friends.sendRequestFailed": "Не удалось отправить запрос в друзья",

    "actions.search": "Найти",
    "actions.attach": "Вложение",
    "actions.emoji": "Эмодзи",
    "actions.voiceMessage": "Голосовое сообщение",
    "actions.transcribe": "Расшифровать",
    "actions.mute": "Выключить микрофон",
    "actions.deafen": "Отключить звук",
    "actions.settings": "Настройки",
    "actions.changeTheme": "Сменить тему",
    "actions.close": "Закрыть",
    "actions.apply": "Применить",
    "actions.callBack": "Перезвонить",
    "actions.dismiss": "Скрыть",
    "actions.reply": "Ответить на сообщение",
    "actions.edit": "Редактировать сообщение",
    "actions.delete": "Удалить сообщение",
    "actions.hidePreview": "Скрыть превью",
    "actions.downloadViewFile": "Скачать/Открыть файл",
    "actions.minimize": "Свернуть",
    "actions.maximize": "Развернуть",
    "actions.fullscreen": "На весь экран",
    "actions.clearSearch": "Очистить поиск",

    "chat.message": "Сообщение...",
    "chat.messageTo": "Сообщение",
    "chat.messageToChannel": "Сообщение",
    "chat.searchPlaceholder": "Поиск в чате...",
    "chat.messageYourself": "Сообщение себе...",
    "chat.noMessagesYet": "Пока нет сообщений. Будьте первым!",
    "chat.noConversationsYet": "Пока нет диалогов.",
    "chat.callWith": "Звонок с",
    "chat.connectedWith": "Подключено с",
    "chat.joinedCallWith": "Подключение к звонку с",
    "chat.news": "Новости",
    "chat.newsReadOnly": "Новости только для чтения",
    "chat.loading": "Загрузка...",
    "chat.subscribers": "{count} подписчиков",
    "chat.subscriber.one": "подписчик",
    "chat.subscriber.few": "подписчика",
    "chat.subscriber.many": "подписчиков",
    "chat.filePreviewFailed": "[Не удалось загрузить превью]",
    "chat.systemUser": "Система",
    "chat.friend": "Друг",
    "chat.participant": "Участник",
    "chat.voiceMessage": "Голосовое сообщение",
    "chat.fileLabel": "Файл",
    "message.edited": "(изменено)",
    "message.deleteConfirm": "Вы уверены, что хотите удалить это сообщение?",
    "time.todayAt": "Сегодня в",
    "time.yesterdayAt": "Вчера в",
    "time.dateFormat": "{date} в {time}",
    "time.justNow": "Только что",
    "time.minutesAgo": "{count} мин. назад",
    "time.hoursAgo": "{count} ч. назад",
    "time.daysAgo": "{count} дн. назад",
    "chat.selfChat": "Личный чат",
    "chat.attachment": "Вложение",

    // Theme related translations
    "theme.title": "Настройки темы",
    "theme.custom_color": "Пользовательский цвет",
    "theme.select_theme": "Выбрать тему",
    "theme.light": "Светлая",
    "theme.dark": "Тёмная",
    "theme.oled": "OLED Тёмная",
    "theme.system": "Системная",
    "theme.transparency": "Прозрачность",
    "theme.accent_color": "Цвет акцента",
    "theme.defaultDark": "Стандартная тёмная",
    "theme.midnightBlue": "Полночная синяя",
    "theme.forestGreen": "Лесная зелёная",
    "theme.sunsetPurple": "Фиолетовый закат",
    "theme.oceanBlue": "Океанская синяя",
    "theme.coffeeBrown": "Кофейная коричневая",
    "theme.highContrast": "Высокая контрастность",
    "theme.deuteranopia": "Для дейтеранопии",
    "theme.tritanopia": "Для тританопии",
    "theme.customColor": "Пользовательский цвет:",
    "theme.glassEffect": "Эффект стекла:",

    // Call related translations
    "call.voiceChannel": "Голосовой канал",
    "call.you": "Вы",
    "call.isCalling": "звонит вам...",
    "call.accept": "Принять",
    "call.decline": "Отклонить",
    "call.toggleVideo": "Включить/выключить видео",
    "call.toggleAudio": "Включить/выключить аудио",
    "call.toggleScreen": "Поделиться экраном",
    "call.declined": "Звонок был отклонён",
    "call.incoming": "Входящий звонок",
    "call.isCallingYou": "{username} звонит вам",
    "call.missedType.audio": "Голосовой",
    "call.missedType.video": "Видео",
    "call.missedCall": "Пропущенный {type} звонок",
    "call.accessDenied": "Не удалось получить доступ к камере/микрофону. Проверьте разрешения.",
    "call.micAccessDenied": "Не удалось получить доступ к микрофону. Проверьте разрешения.",
    "call.screenDenied": "Доступ к демонстрации экрана запрещён",
    "call.screenUnsupported": "Демонстрация экрана не поддерживается на этом устройстве. Доступ к камере также не получен.",
    "call.screenError": "Ошибка демонстрации экрана. Попробуйте снова. Примечание: функция может не поддерживаться на мобильных устройствах.",
    "call.screenStopCamera": "Остановить показ камеры",
    "call.screenStop": "Остановить показ экрана",
    "call.screenShareCamera": "Поделиться камерой (моб.)",
    "call.screenShare": "Поделиться экраном",

    // Settings related translations
    "settings.title": "Настройки",
    "settings.privacy": "Приватность и контент",
    "settings.linkPreview": "Предпросмотр ссылок",
    "settings.linkPreviewDesc": "Показывать карточки предпросмотра для ссылок в сообщениях",
    "settings.clearHiddenPreviews": "Очистить скрытые предпросмотры",
    "settings.account": "Аккаунт",
    "settings.logout": "Выйти",
    "settings.hiddenPreviewsReset": "Все скрытые предпросмотры сброшены",
    "settings.logoutConfirm": "Выйти из аккаунта?",

    // Additional action translations
    "actions.notifications": "Уведомления",
    "actions.menu": "Меню",
    "actions.send": "Отправить",
    "actions.forward": "Переслать сообщение",
    "actions.pin": "Закрепить сообщение",
    "actions.unpin": "Открепить сообщение",
    "chat.forwardedMessage": "Пересланное сообщение",
    "chat.forwardedFrom": "Переслано из",
    "chat.originalAuthor": "Автор",
    "chat.forwardTo": "Переслать сообщение в:",
    "chat.unknownSource": "Неизвестный источник",
    "chat.unknownUser": "Неизвестно",
    "chat.pinnedMessages": "Закреплённые сообщения",
    "message.pinned": "Закреплено",
    "errors.noForwardChats": "Нет доступных чатов для пересылки",
    "errors.invalidRecipient": "Некорректный получатель",
    "errors.voiceCorrupted": "Голосовое сообщение повреждено. Попробуйте снова.",
    "errors.newsLoadFailed": "Не удалось загрузить новости",
    "errors.uploadFailed": "Не удалось загрузить файл",
    "errors.voiceSendFailed": "Не удалось отправить голосовое сообщение",
    "errors.transcribeFailed": "Не удалось распознать аудио",
    "errors.sendRequestFailed": "Не удалось отправить запрос",
    "voice.releaseToSend": "Отпустите, чтобы отправить голосовое сообщение",
    "voice.clickToSeek": "Нажмите для перемотки",
    "upload.fileInProgress": "Загрузка файла...",
    "upload.voiceInProgress": "Загрузка голосового сообщения..."
  }
};
