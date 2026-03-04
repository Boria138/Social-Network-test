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

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | /api/register | Регистрация |
| POST | /api/login | Вход |
| POST | /api/logout | Выход |
| GET | /api/users | Пользователи |
| GET | /api/dm/:userId | Получить личные сообщения с пользователем |
| GET | /api/friends | Друзья |
| POST | /api/friends/request | Запрос в друзья |
| POST | /api/upload | Загрузка файла |
| POST | /api/transcribe | Транскрипция голосового сообщения |

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
