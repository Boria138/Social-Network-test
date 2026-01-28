# Discord Clone

Кроссплатформенное приложение для общения с real-time сообщениями, голосовыми/видео звонками, демонстрацией экрана и файлообменом.

**PWA** — работает на Linux, Windows, Android и любой платформе с браузером.

## Возможности

- **Аутентификация** — сессионные токены, bcrypt хеширование
- **Real-time чат** — текстовые каналы, личные сообщения, Socket.IO
- **Голосовые/видео звонки** — WebRTC, HD видео, определение голосовой активности
- **Демонстрация экрана** — весь экран или отдельные окна
- **Файлообмен** — до 10MB, изображения, документы, медиа
- **Реакции** — эмодзи на сообщения
- **Push-уведомления** — браузерные и нативные
- **PWA** — установка как приложение, offline режим

## Структура проекта

```
discord-clone/
├── client/                 # PWA клиент
│   ├── assets/icons/       # Иконки
│   ├── index.html
│   ├── login.html
│   ├── manifest.json       # PWA манифест
│   ├── sw.js               # Service Worker
│   └── package.json
├── server/                 # API сервер
│   ├── server.js           # Express + Socket.IO
│   ├── database.js         # SQLite
│   └── package.json
├── deploy.sh               # Скрипт деплоя
└── README.md
```

## Локальная разработка

```bash
# Терминал 1 - сервер
cd server
npm install
npm run dev

# Терминал 2 - клиент
cd client
npm install
npm run dev

# Открыть http://localhost:5173
```

## Деплой на VPS

Клиент и сервер хостятся вместе — один порт, один адрес.

```bash
./deploy.sh root@YOUR_SERVER_IP
```

После деплоя открыть: `http://YOUR_SERVER_IP:3000`

### Что делает скрипт

1. Собирает клиент (`npm run build`)
2. Загружает `server/` и `client/dist/` на VPS
3. Устанавливает Node.js и PM2 (если нет)
4. Запускает сервер через PM2

### Ручной деплой

```bash
# Локально - собрать клиент
cd client && npm install && npm run build && cd ..

# Загрузить на сервер
scp -r server client/dist root@YOUR_SERVER_IP:/opt/discord-clone/

# На сервере
ssh root@YOUR_SERVER_IP
cd /opt/discord-clone/server
npm install --production
npm install -g pm2
pm2 start server.js --name discord-api
pm2 save
```

### Открыть порт

```bash
ufw allow 3000
```

## Конфигурация

### server/.env

```env
PORT=3000
NODE_ENV=production
```

## PWA установка

- **Android**: Chrome → Меню → "Установить приложение"
- **Windows/Linux**: Chrome/Edge → иконка в адресной строке
- **iOS**: Safari → Поделиться → "На экран Домой"

## API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | /api/register | Регистрация |
| POST | /api/login | Вход |
| POST | /api/logout | Выход |
| GET | /api/users | Пользователи |
| GET | /api/friends | Друзья |
| POST | /api/friends/request | Запрос в друзья |
| GET | /api/servers | Серверы |
| POST | /api/upload | Загрузка файла |

## Команды PM2

```bash
pm2 status              # Статус
pm2 logs discord-api    # Логи
pm2 restart discord-api # Перезапуск
pm2 stop discord-api    # Остановить
```

## Решение проблем

### Не открывается сайт
- Проверьте что порт 3000 открыт: `ufw allow 3000`
- Проверьте статус: `pm2 status`
- Смотрите логи: `pm2 logs discord-api`

### Камера/микрофон не работают
- Для WebRTC нужен HTTPS (кроме localhost)
- Настройте nginx с SSL сертификатом

## Лицензия

MIT
