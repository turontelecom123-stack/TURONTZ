# Turon TZ на VPS (turontz.space)

## Сервер
- Ubuntu 24.04 LTS (или 22.04), 1–2 ГБ RAM, от 20 ГБ SSD, публичный IPv4.
- При создании сервера добавьте SSH-ключ `turontz-deploy` (файл `C:\Users\user\.ssh\turontz_vps.pub` на рабочем компьютере).

## DNS у регистратора домена
| Тип | Имя | Значение |
| --- | --- | --- |
| A | `@` (turontz.space) | IP сервера |
| A | `www` | IP сервера |

## Установка (один раз)
```bash
scp -i ~/.ssh/turontz_vps deploy/setup-vps.sh root@IP:/root/
ssh -i ~/.ssh/turontz_vps root@IP "bash /root/setup-vps.sh turontz.space"
```

Первый перенос данных с рабочего компьютера (только один раз — дальше данные живут на сервере). Сначала остановите локальный сервер, чтобы последние изменения были в `db.json`:
```bash
cd /c/Users/user/Downloads/TuronTZ
tar -czf - db.json uploads backups | ssh -i ~/.ssh/turontz_vps root@IP "tar -xzf - -C /opt/turontz && chown -R turontz:turontz /opt/turontz"
```

## Обновление приложения

### Автоматический деплой из GitHub (рекомендуется)
Каждый push в ветку `main` проходит тесты и сам выкладывается на сервер (`.github/workflows/deploy.yml`). Если новая версия не запустилась, на сервере автоматически остаётся предыдущая.

Настройка, один раз:
1. На рабочем компьютере создайте отдельный ключ для GitHub (Git Bash):
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/turontz_github -N "" -C turontz-github
   ssh -i ~/.ssh/turontz_vps root@IP "cat >> ~/.ssh/authorized_keys" < ~/.ssh/turontz_github.pub
   ```
2. GitHub → репозиторий → **Settings → Secrets and variables → Actions → New repository secret**:
   - `VPS_HOST` — IP сервера;
   - `VPS_SSH_KEY` — всё содержимое файла `~/.ssh/turontz_github` (приватный ключ, вместе со строками `BEGIN`/`END`);
   - необязательно: `VPS_KNOWN_HOSTS` — вывод `ssh-keyscan IP` (так GitHub проверяет, что подключается именно к вашему серверу); `VPS_USER`, если не `root`.
3. Если ветки `main` ещё нет — создайте её из рабочей ветки (GitHub → Branches → New branch) и сделайте основной (Settings → General → Default branch).

Запустить деплой вручную: GitHub → **Actions → Deploy → Run workflow**.

### Вручную (Git Bash на рабочем компьютере)
```bash
SSH_OPTS="-i ~/.ssh/turontz_vps" bash deploy/deploy.sh root@IP
```
Скрипт загружает только код (`server.js`, `app.js`, `lib/`, стили, иконки…). `db.json`, `uploads/`, `backups/` и `telegram.json` на сервере не трогаются. Если новая версия не запускается — возвращается предыдущая.

## Мониторинг: узнать, что сервер упал
1. Зарегистрируйтесь на [uptimerobot.com](https://uptimerobot.com) (бесплатно).
2. **Add New Monitor** → тип **HTTP(s)** → адрес `https://turontz.space/api/health` → интервал 5 минут.
3. В **Alert Contacts** добавьте Telegram (или e-mail) — если сайт перестанет отвечать, придёт сообщение.

Нехватку места на диске приложение отслеживает само: если свободно меньше 2 ГБ, SMM-менеджеры получают уведомление (порог — `LOW_DISK_GB`).

## Резервные копии
- На сервере: `/opt/turontz/backups/` — при каждом запуске и каждые 6 часов, последние 30.
- В Telegram: каждый вечер в 21:00 по Ташкенту копия базы приходит SMM-менеджерам, которые включили это в профиле («Каждый вечер присылать мне резервную копию базы»). Там же есть кнопка «Прислать копию сейчас». Видео и макеты (`uploads/`) в копию не входят.

### Как восстановить базу из копии
```bash
# 1. загрузить файл копии на сервер (из Telegram или из backups/)
scp -i ~/.ssh/turontz_vps turontz-db-2026-10-07.json root@IP:/root/
# 2. остановить приложение, сохранить текущую базу и подставить копию
ssh -i ~/.ssh/turontz_vps root@IP
systemctl stop turontz
cp /opt/turontz/db.json /opt/turontz/db.before-restore-$(date +%s).json
cp /root/turontz-db-2026-10-07.json /opt/turontz/db.json
chown turontz:turontz /opt/turontz/db.json
systemctl start turontz
```
После восстановления всем нужно войти заново (сеансы в копию не входят). Файл `.json.gz` сначала распакуйте: `gunzip turontz-db-….json.gz`.

## Обслуживание
- Журнал: `journalctl -u turontz -f`
- Перезапуск: `systemctl restart turontz`
- AI на сервере — встроенный анализатор (`AI_PROVIDER=offline`): Ollama без видеокарты слишком медленный.
- Telegram-бот подключается в приложении: «Команда» → «Telegram-бот». Один и тот же бот не может работать одновременно на двух серверах — не запускайте локальную копию с тем же ботом.
- Большие файлы: приложение принимает до 300 МБ (`MAX_UPLOAD_MB`), Caddy — до 320 МБ. На старых серверах скрипт деплоя сам поднимает лимит Caddy с 15 МБ.
