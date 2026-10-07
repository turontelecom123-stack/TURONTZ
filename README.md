# Turon TZ

Turon TZ — SMM jamoasi uchun texnik topshiriqlarni qabul qilish, AI yordamida tushunish va videograf, montajyor hamda dizaynerga boshqariladigan tarzda yuborish ilovasi.

Ishlaydigan manzil: **https://turontz.space**

## Nimalar ishlaydi

- Ro‘yxatdan o‘tish va kirish: SMM, administrator, videograf, montajyor, dizayner.
- Erkin matn yoki ovozdan yangi TЗ yaratish.
- **AI Preview**: yuborishdan oldin loyiha, rol, aniq ijrochi, deadline, publish date, format, priority, checklist, savollar, hook va CTA’ni tekshirish.
- Bepul **Ollama** lokal AI: API kalitisiz kompyuterda ishlaydi. Ollama bo‘lmasa ichki parser doim ishlaydi.
- Kanban workflow: Draft, New, Clarify, In progress, Waiting materials, Submitted, Revision, Approved, Published, Archived.
- Ijrochi uchun tezkor tugmalar: ishni boshlash, material so‘rash, savol berish, fayl yuklash, ishni topshirish.
- Fayl versiyalari (v1/v2), qayta ishlash, tasdiqlash va activity history. **Katta video ham yuklanadi** (standart 300 MB gacha), yuklash foizi ko‘rinadi, telefonda video o‘ynaydi.
- Deadline va publish date uchun alohida kalendar. **Kontent-reja** davr bo‘yicha Excel (CSV) yoki PDF (chop etish) qilib olinadi.
- Brand settings: ranglar, font, tone of voice, CTA, social links va default formatlar.
- Menyu: **Задачи**, **Календарь**, **Уведомления**, SMM uchun **Команда** (jamoa, rollar, yuklama, kechikishlar, hisobot, takrorlanuvchi TЗ; u yerdan **Проекты и бренды**) va **Профиль**.
- Ichki analyzer rus va o‘zbek tilidagi, ovozdan yozilgan TЗ’ni ham tushunadi: muddat, publish date, priority, ijrochi ismi, mavzu.
- Desktop va mobile responsive interfeys. Telefonga **ilova sifatida o‘rnatiladi** (PWA): Profil → «Приложение на телефоне».

### Telegram-bot

- Bildirishnomalar: yangi TЗ, kommentlar, fayllar, tasdiqlash va qayta ishlash.
- **Deadline eslatmalari**: muddatga 24 soat va 2 soat qolganda ijrochiga, muddat o‘tsa ijrochi va SMM’ga (ilovada ham, Telegram’da ham).
- **TЗ’ni Telegram’dan yuborish**: SMM botga TЗ matnini yozadi (rasm yoki fayl imzo bilan bo‘lsa — referens bo‘ladi). Bot qoralama ko‘rsatadi: «✅ Отправить исполнителям», «📝 В черновик» yoki «✖️ Отмена». Ovozli xabarni bot hali tanimaydi — telefon klaviaturasidagi mikrofon (diktovka) bilan matn yuboring.
- **Har kuni bazaning zaxira nusxasi** SMM’ning Telegram’iga keladi (Profil → «Каждый вечер присылать мне резервную копию базы»). Videolar va maketlar nusxaga kirmaydi — ular serverda qoladi.
- Server diskida joy kam qolsa (standart 2 GB dan kam), SMM’larga ogohlantirish keladi.

### Takrorlanuvchi TЗ va hisobot

- Istalgan TЗ’ni ochib **«Повторять»** bosing: hafta kunlari va vaqtni tanlang (Toshkent vaqti) — nusxa o‘sha ijrochilarga avtomatik ketadi. Ro‘yxat va pauza: «Команда» → «Повторяющиеся ТЗ».
- **Hisobot** («Команда» → «Отчёт по команде»): davr bo‘yicha har bir ijrochi nechta ishni topshirgan, nechtasi o‘z vaqtida, nechtasi kechikkan, necha marta qayta ishlashga qaytgan. Excel’ga yuklab olinadi.

## Xavfsizlik

- Parol kamida 6 belgi. SMM yangi xodimga yoki parolini unutgan xodimga **vaqtinchalik parol** beradi («Команда» → «Пароль») — xodim birinchi kirishda o‘z parolini o‘rnatadi. Profilda parolni o‘zgartirish mumkin; boshqa qurilmalardagi sessiyalar yopiladi.
- Sessiya 30 kun ishlatilmasa tugaydi.
- Yuklangan fayllar faqat ruxsati bor odamga ochiladi. Rasm, video, audio va PDF brauzerda ochiladi, qolganlari (HTML, SVG, ZIP…) faqat yuklab olinadi — fayl ichidagi skript sayt nomidan ishga tusha olmaydi.
- Ijrochi o‘ziga nomma-nom berilgan TЗ’ni ko‘radi; hech kim tanlanmagan bo‘lsa — o‘z roliga tegishli TЗ’ni. Qoralamalarni faqat SMM ko‘radi.

## Lokal ishga tushirish (dasturchi uchun)

1. [Node.js LTS](https://nodejs.org) o‘rnating.
2. `start-local.bat` faylini ikki marta bosing (`start.bat` endi faqat saytni ochadi).
3. Brauzerda `http://localhost:3457` ochiladi.
4. Server oynasini ochiq qoldiring.

Sozlamalar: `.env.example` ni `.env` qilib nusxalang va kerakli qiymatlarni yozing.

Testlar: `npm test` (Node.js 20+). Har bir push’da GitHub Actions testlarni o‘zi ishga tushiradi.

## Bepul AI — API kalitisiz

Profile → **AI-разбор ТЗ** bo‘limida:

1. **Скачать Ollama** tugmasi orqali Ollama’ni o‘rnating.
2. Ilovaga qayting va `qwen2.5:7b` modelini yuklang.
3. `Разобрать ТЗ` endi lokal AI orqali chuqurroq preview beradi.

Bu AI faqat o‘rnatilgan kompyuterda ishlaydi. API-key talab qilinmaydi, TЗ esa tashqi AI xizmatiga yuborilmaydi. Internetdagi nusxada kalitsiz ichki analyzer ishlaydi.

## Rollar

- **SMM / Administrator** — TЗ, loyiha, template, ijrochi va deadline’larni boshqaradi; faylni tasdiqlaydi yoki revision qaytaradi; jamoa, parollar, hisobot va takrorlanuvchi TЗ’lar.
- **Videograf / Montajyor / Dizayner** — faqat o‘ziga berilgan TЗ’larni ko‘radi, chek-listni belgilaydi, savol beradi, material so‘raydi va fayl topshiradi.

## Ma’lumotlar va serverga chiqarish

Serverda hamma narsa `db.json` va `uploads/` ichida saqlanadi; `backups/` ga har 6 soatda nusxa olinadi (oxirgi 30 tasi), qo‘shimcha ravishda har kuni Telegram’ga.

- VPS (hozirgi `turontz.space`): [deploy/README.md](deploy/README.md) — o‘rnatish, yangilash, **GitHub’dan avtomatik deploy**, monitoring va bazani tiklash.
- Bepul variant (Render + Supabase): [DEPLOY_FREE.md](DEPLOY_FREE.md).

`SUPABASE_SERVICE_ROLE_KEY`, `.env`, `telegram.json`, `db.json` va `ai_key.txt` hech qachon GitHub yoki frontend JavaScript’ga qo‘yilmasligi kerak (`.gitignore` ularni chiqarib tashlaydi).
