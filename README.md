# Discord Clone - Direct Messages Only

Упрощённое приложение для общения с поддержкой только личных сообщений (Direct Messages), голосовыми/видео звонками, демонстрацией экрана и файлообменом.

Работает на Linux, Windows, Android и любой платформе с браузером.

## Возможности

- **Аутентификация** — сессионные токены, bcrypt хеширование
- **Real-time чат** — личные сообщения (DM), системный канал новостей, Socket.IO
- **Голосовые/видео звонки** — WebRTC, HD видео, определение голосовой активности
- **Демонстрация экрана** — весь экран или отдельные окна
- **Файлообмен** — до 10MB, изображения, документы, медиа
- **Реакции** — эмодзи на сообщения
- **Поиск пользователей** — возможность найти и добавить в друзья других пользователей
- **Системный канал «Новости»** — официальный канал для объявлений (принудительная подписка)
- **Транскрипция голосовых сообщений** — преобразование речи в текст через whisper-cpp

## Структура проекта

```
discord-clone/
├── client/                 # Web клиент
│   ├── index.html
│   ├── login.html
│   └── package.json
├── server/                 # API сервер
│   ├── server.js           # Express + Socket.IO
│   ├── database.js         # SQLite
│   └── package.json
├── deploy.sh               # Скрипт деплоя
└── README.md
```

## Сборка и запуск проекта

```bash
# Собрать проект (установить зависимости и собрать клиент)
npm run build:all

# Или только клиентскую часть
npm run build

# Полная сборка и запуск production версии
npm run serve
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
SSL_CERT=/root/cert/cert.crt
SSL_KEY=/root/cert/secret.key
WHISPER_CPP_PATH=/usr/local/bin/whisper-cli
WHISPER_CPP_MODEL=/usr/local/share/whisper.cpp/ggml-tiny-q8_0.bin
```

## API

### Аутентификация

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | /api/register | Регистрация нового пользователя |
| POST | /api/login | Вход (возвращает токен сессии) |
| POST | /api/logout | Выход (требует токен) |
| GET | /api/user/profile | Получить профиль текущего пользователя |
| PUT | /api/user/profile | Обновить профиль пользователя |

### Пользователи

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | /api/users | Список всех пользователей |
| GET | /api/users/search?q=query | Поиск пользователей по имени |

### Личные сообщения (DM)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | /api/dm/:userId | Получить историю переписки с пользователем |
| POST | /api/dm/:userId | Отправить сообщение пользователю |
| PUT | /api/dm/:messageId | Редактировать своё сообщение |
| DELETE | /api/dm/:messageId | Удалить сообщение |
| POST | /api/dm/:messageId/reaction | Добавить реакцию на сообщение |
| DELETE | /api/dm/:messageId/reaction/:emoji | Удалить реакцию с сообщения |

### Друзья

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | /api/friends | Список друзей |
| GET | /api/friends/pending | Входящие заявки в друзья |
| POST | /api/friends/request | Отправить заявку в друзья |
| POST | /api/friends/accept | Принять заявку в друзья |
| POST | /api/friends/reject | Отклонить заявку в друзья |
| DELETE | /api/friends/:friendId | Удалить из друзей |

### Уведомления

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | /api/notifications | Получить все уведомления |
| GET | /api/notifications/unread | Получить непрочитанные уведомления |
| POST | /api/notifications/mark-all-read | Отметить все уведомления прочитанными |
| POST | /api/notifications/mark-user-read | Отметить уведомления от пользователя прочитанными |
| DELETE | /api/notifications/:notificationId | Удалить уведомление |
| DELETE | /api/notifications | Удалить все уведомления |

### Серверы и каналы

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | /api/servers | Создать сервер |
| GET | /api/servers | Список серверов пользователя |
| GET | /api/servers/:serverId/members | Участники сервера |
| GET | /api/channels/system | Системный канал новостей |

### Файлы и медиа

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | /api/upload | Загрузить файл (до 10MB) |
| POST | /api/transcribe | Транскрипция голосового сообщения |
| GET | /api/link-preview | Получить preview ссылки (Open Graph) |

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

### Транскрипция не работает
- Проверьте установку whisper-cpp: `whisper-cli --help`
- Убедитесь что модель загружена: `ls /usr/local/share/whisper.cpp/`
- Для VPS с 1GB RAM используйте модель `tiny-q8_0` (~40MB RAM)
- Проверьте логи: `pm2 logs discord-api | grep Transcribe`

## Лицензия

MIT
