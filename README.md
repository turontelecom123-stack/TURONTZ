# Turon TZ

Turon TZ — SMM jamoasi uchun texnik topshiriqlarni qabul qilish, AI yordamida tushunish va videograf, montajyor hamda dizaynerga boshqariladigan tarzda yuborish ilovasi.

## Nimalar ishlaydi

- Ro‘yxatdan o‘tish va kirish: SMM, administrator, videograf, montajyor, dizayner.
- Erkin matn yoki ovozdan yangi TЗ yaratish.
- **AI Preview**: yuborishdan oldin loyiha, rol, aniq ijrochi, deadline, publish date, format, priority, checklist, savollar, hook va CTA’ni tekshirish.
- Bepul **Ollama** lokal AI: API kalitisiz kompyuterda ishlaydi. Ollama bo‘lmasa ichki parser doim ishlaydi.
- Kanban workflow: New, Clarify, In progress, Waiting materials, Submitted, Revision, Approved, Published, Archived.
- Ijrochi uchun tezkor tugmalar: ishni boshlash, material so‘rash, savol berish, fayl yuklash, ishni topshirish.
- Fayl versiyalari: v1/v2, qayta ishlash, tasdiqlash va activity history.
- Deadline va publish date uchun alohida kalendar.
- Brand settings: ranglar, font, tone of voice, CTA, social links va default formatlar.
- Menyu: **Задачи**, **Календарь**, **Уведомления**, SMM uchun **Команда** (jamoa, rollar, yuklama, kechikishlar; u yerdan **Проекты и бренды**) va **Профиль**.
- Ichki analyzer rus va o‘zbek tilidagi, ovozdan yozilgan TЗ’ni ham tushunadi: muddat, publish date, priority, ijrochi ismi, mavzu.
- Desktop va mobile responsive interfeys.

## Lokal ishga tushirish

1. [Node.js LTS](https://nodejs.org) o‘rnating.
2. `start.bat` faylini ikki marta bosing.
3. Brauzerda `http://localhost:3457` ochiladi.
4. Server oynasini ochiq qoldiring.

Bir Wi‑Fi ichidagi hamkasblar server oynasida ko‘rsatilgan IP manzil orqali kira oladi, masalan: `http://192.168.1.10:3457`.

## Bepul AI — API kalitisiz

Profile → **AI-разбор ТЗ** bo‘limida:

1. **Скачать Ollama** tugmasi orqali Ollama’ni o‘rnating.
2. Ilovaga qayting va `qwen2.5:7b` modelini yuklang.
3. `Разобрать ТЗ` endi lokal AI orqali chuqurroq preview beradi.

Bu AI faqat o‘rnatilgan kompyuterda ishlaydi. API-key talab qilinmaydi, TЗ esa tashqi AI xizmatiga yuborilmaydi. Internetda joylashgan nusxada kalitsiz ichki analyzer ishlaydi.

## Rollar

- **SMM / Administrator** — TЗ, loyiha, template, ijrochi va deadline’larni boshqaradi; faylni tasdiqlaydi yoki revision qaytaradi.
- **Videograf / Montajyor / Dizayner** — faqat o‘ziga berilgan TЗ’larni ko‘radi, chek-listni belgilaydi, savol beradi, material so‘raydi va fayl topshiradi.

## Ma’lumotlar va internetga chiqarish

Lokal rejimda hamma narsa `db.json` va `uploads/` ichida saqlanadi.

Internetdagi bepul versiya uchun Render + Supabase tayyorlangan: ma’lumot va fayllar Supabase’ga server orqali xavfsiz saqlanadi. To‘liq yo‘riqnoma: [DEPLOY_FREE.md](DEPLOY_FREE.md).

`SUPABASE_SERVICE_ROLE_KEY`, `.env` va `ai_key.txt` hech qachon GitHub yoki frontend JavaScript’ga qo‘yilmasligi kerak.
