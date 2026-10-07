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

## Загрузка приложения и данных
Сначала остановите локальный сервер (start.bat), чтобы последние изменения были в `db.json`.
```bash
cd /c/Users/user/Downloads/TuronTZ
tar -czf - server.js parser_engine.js app.js index.html styles.css creative-os.css package.json db.json uploads backups \
  | ssh -i ~/.ssh/turontz_vps root@IP "tar -xzf - -C /opt/turontz && chown -R turontz:turontz /opt/turontz && systemctl restart turontz"
```

## Обслуживание
- Журнал: `journalctl -u turontz -f`
- Перезапуск: `systemctl restart turontz`
- Резервные копии базы: `/opt/turontz/backups/` (при каждом запуске и каждые 6 часов, последние 30)
- AI на сервере — встроенный анализатор (`AI_PROVIDER=offline`): Ollama без видеокарты слишком медленный.
- Telegram-бот подключается в приложении: «Команда» → «Telegram-бот». Один и тот же бот не может работать одновременно на двух серверах.
