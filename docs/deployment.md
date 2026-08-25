# Инструкция по развертыванию (Deploy) на VPS

В этом руководстве описан процесс первоначального развертывания проекта TgMon на чистом VPS (Ubuntu 22.04/24.04) и настройка процесса регулярных обновлений.

---

## Часть 1: Первоначальная установка

### Шаг 1: Подготовка сервера и установка Node.js
Подключитесь к VPS по SSH, обновите систему и установите Node.js 20.x:

```bash
# Обновляем пакеты
sudo apt update && sudo apt upgrade -y

# Ставим базовые утилиты, Git и Nginx
sudo apt install curl git build-essential nginx -y

# Устанавливаем Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# Проверяем установку
node -v
npm -v
```

### Шаг 2: Установка и настройка PostgreSQL
TgMon использует PostgreSQL. Устанавливаем её и создаем базу:

```bash
sudo apt install postgresql postgresql-contrib -y

# Заходим в консоль Postgres
sudo -i -u postgres psql
```
Выполните SQL-команды в консоли:
```sql
CREATE DATABASE tgmon;
CREATE USER tgmon_user WITH ENCRYPTED PASSWORD 'ваш_надежный_пароль';
GRANT ALL PRIVILEGES ON DATABASE tgmon TO tgmon_user;
\c tgmon
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\q
```

### Шаг 3: Деплой проекта
Клонируем код и устанавливаем зависимости:

```bash
cd /var/www
sudo git clone https://github.com/liquidsyntes/tg_mons.git tgmon
cd tgmon

# Меняем владельца папки на текущего пользователя
sudo chown -R $USER:$USER /var/www/tgmon

npm install
```

### Шаг 4: Настройка переменных окружения (.env)
Создайте конфигурационный файл:
```bash
nano .env
```
Заполните его вашими данными:
```env
# База данных
DATABASE_URL="postgresql://tgmon_user:ваш_надежный_пароль@localhost:5432/tgmon?schema=public"

# Доступы к Telegram API
API_ID="твой_api_id"
API_HASH="твой_api_hash"

# Токены сессий
TELEGRAM_SESSION="..."

# Настройки для алертов
TELEGRAM_BOT_TOKEN="токен_бота"
TELEGRAM_CHAT_ID="твой_id"
```

### Шаг 5: Подготовка БД и Сборка
Применяем миграции и собираем production-билд:

```bash
npm run prisma:migrate
npm run build
```

### Шаг 6: Запуск через PM2 (Менеджер процессов)
Запускаем Web-сервер и фоновый воркер через PM2, чтобы они работали 24/7:

```bash
sudo npm install -g pm2

# Запускаем процессы
pm2 start npm --name "tgmon-web" -- run start
pm2 start npm --name "tgmon-worker" -- run worker

# Сохраняем в автозагрузку
pm2 save
pm2 startup
# (Выполните команду sudo, которую выдаст PM2)
```

### Шаг 7: Настройка Nginx
```bash
sudo nano /etc/nginx/sites-available/tgmon
```
Вставьте конфигурацию:
```nginx
server {
    listen 80;
    server_name ваш-домен.com или-айпи-сервера;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Активируем сайт:
```bash
sudo ln -s /etc/nginx/sites-available/tgmon /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Часть 2: Процесс работы и обновление (CI/CD)

Разработка ведется локально на компьютере. После того как вы написали новый код и отправили его на GitHub (`git commit`, `git push`), вам нужно обновить версию на сервере.

### Скрипт автоматического обновления (Лайфхак)
Создайте bash-скрипт в папке проекта на сервере:

```bash
nano update.sh
```

Вставьте код:
```bash
#!/bin/bash
echo "🔥 Начинаем обновление TgMon..."

echo "📥 1. Скачиваем свежий код из Git..."
git pull origin main

echo "📦 2. Обновляем зависимости..."
npm install

echo "🗄 3. Обновляем базу данных..."
npm run prisma:migrate

echo "🏗 4. Собираем свежий билд Next.js..."
npm run build

echo "🚀 5. Перезапускаем процессы..."
pm2 restart all

echo "✅ Обновление успешно завершено!"
```

Сделайте файл исполняемым:
```bash
chmod +x update.sh
```

### Как обновляться в будущем
Когда вы запушили изменения на GitHub, просто зайдите на сервер и выполните одну команду:
```bash
./update.sh
```
Скрипт автоматически скачает код, обновит зависимости, применит миграции базы данных, пересоберет проект и перезапустит PM2.
