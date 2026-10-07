# Turon TZ: bepul internetga chiqarish

Tavsiya etilgan bepul kombinatsiya:

- **Render Free** — hozirgi Node.js serverni ishlatadi.
- **Supabase Free** — foydalanuvchilar, TЗ, kommentlar, versiyalar va fayllarni saqlaydi.
- **Ollama** — faqat lokal kompyuterda bepul, API-kalitsiz AI. Hostingda u ishlamaydi; server `AI_PROVIDER=offline` bilan ichki tahlilchidan foydalanadi.

> Render Free bo‘sh turganda uxlab qoladi. Birinchi ochilishda uyg‘onishi mumkin. Ma’lumotlar Supabase’da saqlangani uchun yo‘qolmaydi. Doim uyg‘oq, katta jamoa uchun keyinchalik pullik host kerak bo‘ladi.

## 1. Supabase loyihasini yarating

1. Supabase’da yangi **Free** loyiha yarating.
2. SQL Editor’ni oching va [`supabase/migrations/0001_turon_tz_state.sql`](supabase/migrations/0001_turon_tz_state.sql) faylidagi SQL’ni bir marta ishga tushiring.
3. Project Settings → API’dan quyidagilarni oling:
   - Project URL → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

`service_role` kaliti juda maxfiy: uni faqat Render’dagi Environment bo‘limiga yozing. Uni Figma, frontend JavaScript yoki GitHub’ga qo‘ymang.

## 2. Kodni GitHub’ga yuboring

Bu papkani GitHub’dagi private repository’ga yuklang. `.gitignore` sababli `db.json`, yuklangan lokal fayllar, `.env` va AI-kalitlar ketmaydi.

## 3. Render’da servis yarating

1. Render → **New +** → **Blueprint** yoki **Web Service**.
2. GitHub repository’ni tanlang. Loyihadagi `render.yaml` aniqlanadi.
3. Environment’ga qo‘shing:

   ```text
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
   ```

4. Deploy tugagach `https://…onrender.com/api/health` manzilini oching. Javobda `"persistence":"supabase"` va `"storage":"supabase"` bo‘lishi kerak.
5. O‘sha domenni komanda bilan ulashing. Birinchi SMM akkauntini ro‘yxatdan o‘tkazing, so‘ng **Управление** ekranidan qolganlarni yarating.

## 4. Lokal bepul AI’ni yoqish

Lokal kompyuterda Profile → **Бесплатный локальный AI** → **Скачать Ollama** tugmasini oching. O‘rnatilgach Profile’dagi model tugmasi bilan `qwen2.5:7b` ni yuklang. Shundan keyin `Разобрать ТЗ` qo‘shimcha API-kalitsiz aqlliroq javob beradi.

Internetdagi Render nusxasida lokal Ollama’ga kira olmaydi. Unda ichki analyzer ishlaydi. Cloud AI kerak bo‘lsa, keyin serverga rasmiy AI-provider kaliti qo‘shiladi — kalit hech qachon frontendga berilmaydi.

## Muhim cheklovlar

- Bepul tariflar vaqt o‘tishi bilan o‘zgarishi mumkin; deploydan oldin Render va Supabase limitlarini ularning rasmiy pricing sahifasida tekshiring.
- `service_role` kaliti faqat serverda bo‘lishi shart.
- Hozirgi versiya JSONB state-mirror’dan foydalanadi. U kichik jamoa uchun tez va xavfsiz ko‘chirish yo‘li. Katta jamoa/ko‘p trafik uchun keyingi bosqichda normalizatsiyalangan `users`, `projects`, `tasks`, `task_files`, `task_comments`, `notifications` jadvallariga o‘tiladi.
