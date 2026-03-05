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

    "dm.search": "Find or start a conversation",
    "dm.directMessages": "DIRECT MESSAGES",

    "status.online": "Online",

    "friends.online": "Online",
    "friends.all": "All",
    "friends.pending": "Pending",
    "friends.add": "Add Friend",
    "friends.addTitle": "ADD FRIEND",
    "friends.addDesc": "You can add friends by searching all users.",
    "friends.searchUser": "Search username",

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

    "chat.message": "Message...",
    "message.edited": "(edited)",
    "time.todayAt": "Today at",
    "time.yesterdayAt": "Yesterday at",
    "time.dateFormat": "{date} at {time}",
    "chat.selfChat": "Self Chat",

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
    "theme.customColor": "Custom Color:",
    "theme.glassEffect": "Glass Effect:"
  },

  ru: {
    "app.title": "Voxii",
    "nav.friends": "Друзья",

    "dm.search": "Найти или начать диалог",
    "dm.directMessages": "ЛИЧНЫЕ СООБЩЕНИЯ",

    "status.online": "В сети",

    "friends.online": "В сети",
    "friends.all": "Все",
    "friends.pending": "Ожидают",
    "friends.add": "Добавить",
    "friends.addTitle": "ДОБАВИТЬ ДРУГА",
    "friends.addDesc": "Ты можешь добавить друзей, найдя пользователя.",
    "friends.searchUser": "Никнейм",

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

    "chat.message": "Сообщение...",
    "message.edited": "(изменено)",
    "time.todayAt": "Сегодня в",
    "time.yesterdayAt": "Вчера в",
    "time.dateFormat": "{date} в {time}",
    "chat.selfChat": "Личный чат",

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
    "theme.customColor": "Пользовательский цвет:",
    "theme.glassEffect": "Эффект стекла:"
  }
};
