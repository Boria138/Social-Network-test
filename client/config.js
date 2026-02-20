// Client configuration
// When hosted on same server as API, leave API_URL empty
const config = {
  API_URL: '',
  SOCKET_OPTIONS: {}
};

window.APP_CONFIG = config;

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
