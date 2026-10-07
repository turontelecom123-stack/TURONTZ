/* Turon TZ — разбор технического задания из свободного текста.
   Работает без интернета (эвристики), а при наличии ключа Claude API — через настоящий AI. */

const TZParser = (() => {

  const ROLE_WORDS = {
    video: ['снять','сними','съёмк','съемк','видеограф','кадры','отснять','видео с','рилс','reels','ролик','olib','suratga','video ol'],
    edit:  ['монтаж','смонтир','монтажер','монтажёр','субтитр','озвуч','колор','склей','нарезк','переход','montaj'],
    design:['баннер','дизайн','обложк','макет','лого','афиш','креатив','отрисуй','нарисуй','карточк','превью','визуал','dizayn','banner']
  };

  const FORMATS = [
    [/рилс|reels|рил\b/i, 'Reels 9:16'],
    [/сторис|stories|story/i, 'Stories 9:16'],
    [/шортс|shorts/i, 'Shorts 9:16'],
    [/youtube|ютуб|интервью|подкаст/i, 'Видео 16:9'],
    [/баннер|banner/i, 'Баннер'],
    [/обложк/i, 'Обложка'],
    [/пост|post/i, 'Пост 1:1'],
  ];

  const WEEKDAYS = [
    [/понедельник|к пн\b|в пн\b|dushanba/i, 1],
    [/вторник|seshanba/i, 2],
    [/сред[ауе]|chorshanba/i, 3],
    [/четверг|payshanba/i, 4],
    [/пятниц|juma/i, 5],
    [/суббот|shanba/i, 6],
    [/воскресень|yakshanba/i, 0],
  ];

  const MONTHS = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];

  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function parseDeadline(text, now) {
    const t = text.toLowerCase();
    let d = null;

    if (/сегодня|bugun/.test(t)) d = addDays(now, 0);
    else if (/послезавтра/.test(t)) d = addDays(now, 2);
    else if (/завтра|ertaga/.test(t)) d = addDays(now, 1);

    if (!d) {
      const m = t.match(/через\s+(\d+)\s*(день|дня|дней|kun)/);
      if (m) d = addDays(now, parseInt(m[1], 10));
      else if (/через\s+недел/.test(t)) d = addDays(now, 7);
    }
    if (!d) {
      for (const [re, wd] of WEEKDAYS) {
        if (re.test(t)) {
          let diff = (wd - now.getDay() + 7) % 7;
          if (diff === 0) diff = 7;
          d = addDays(now, diff);
          break;
        }
      }
    }
    if (!d) {
      const m = t.match(new RegExp('(\\d{1,2})\\s*(' + MONTHS.join('|') + ')'));
      if (m) {
        d = new Date(now.getFullYear(), MONTHS.indexOf(m[2]), parseInt(m[1], 10));
        if (d < now) d.setFullYear(d.getFullYear() + 1);
      }
    }
    if (!d) return null;

    let h = 18, min = 0;
    const tm = t.match(/(?:к|до|в)\s*(\d{1,2})(?::(\d{2}))?\s*(?:час|:|\b)/);
    if (tm && +tm[1] >= 6 && +tm[1] <= 23) { h = +tm[1]; min = tm[2] ? +tm[2] : 0; }
    else if (/утр/.test(t)) h = 10;
    else if (/обед/.test(t)) h = 13;
    else if (/вечер|kech/.test(t)) h = 18;
    d.setHours(h, min, 0, 0);
    return d;
  }

  function addDays(base, n) {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  }

  function detectRoles(text) {
    const t = text.toLowerCase();
    const roles = [];
    for (const [role, words] of Object.entries(ROLE_WORDS)) {
      if (words.some(w => t.includes(w))) roles.push(role);
    }
    if ((/рилс|reels|ролик|видео/i.test(t)) && !roles.includes('edit')) roles.push('edit');
    if ((/рилс|reels/i.test(t)) && !roles.includes('video')) roles.unshift('video');
    if (!roles.length) roles.push('design');
    return [...new Set(roles)];
  }

  function detectFormat(text) {
    for (const [re, label] of FORMATS) if (re.test(text)) return label;
    return 'Свободный формат';
  }

  function detectPriority(text) {
    const t = text.toLowerCase();
    if (/срочно|горит|asap|сегодня надо|очень быстро|tez(da)?\b|шеф просил/.test(t)) return 'high';
    if (/не срочно|не горит|когда будет время|на потом/.test(t)) return 'low';
    return 'med';
  }

  function detectProject(text) {
    const t = text.toLowerCase();
    let ch = '';
    if (/инст|insta|ig\b/.test(t)) ch = 'Instagram';
    else if (/ютуб|youtube/.test(t)) ch = 'YouTube';
    else if (/телеграм|telegram|тг\b/.test(t)) ch = 'Telegram';
    else if (/тикток|tiktok/.test(t)) ch = 'TikTok';
    else if (/рилс|reels|сторис|stories|пост/.test(t)) ch = 'Instagram';
    return 'Turon Telecom' + (ch ? ' · ' + ch : '');
  }

  function extractRefs(text) {
    const urls = text.match(/https?:\/\/\S+|(?:www\.|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.)\S+/gi) || [];
    return urls.map(u => ({ url: u.replace(/[.,;)]+$/, ''), note: 'Референс — сделать похоже, но в стиле бренда' }));
  }

  function makeTitle(text, format) {
    const q = text.match(/«([^»]{2,40})»|"([^"]{2,40})"/);
    const name = q ? '«' + (q[1] || q[2]) + '»' : '';
    const short = format.split(' ')[0];
    const t = text.toLowerCase();
    let topic = '';
    if (/тариф/.test(t)) topic = 'промо тарифа';
    else if (/акци/.test(t)) topic = 'акция';
    else if (/конкурс/.test(t)) topic = 'конкурс';
    else if (/опрос/.test(t)) topic = 'опрос';
    else if (/интервью/.test(t)) topic = 'интервью';
    if (name && topic) return `${short} ${name} — ${topic}`;
    if (name) return `${short} ${name}`;
    if (topic) return `${short} — ${topic}`;
    const words = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
    return words.length > 48 ? words.slice(0, 48) + '…' : words;
  }

  function makeBullets(text) {
    let parts = text
      .split(/[.!?;\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 12 && !/https?:\/\//.test(s));
    if (parts.length < 2) {
      parts = text
        .split(/,\s*(?=[а-яёa-z])/i)
        .map(s => s.trim().replace(/[.!?;]+$/, ''))
        .filter(s => s.length > 10 && !/https?:\/\//.test(s));
    }
    return parts.slice(0, 5).map(s => s[0].toUpperCase() + s.slice(1));
  }

  const IDEAS = {
    reels: [
      'Хук в первые 2 секунды — вопрос в лоб: «Сколько ты платишь за интернет?»',
      'Приём «до/после»: старый тариф против нового',
      'Финал с CTA и QR-кодом на подключение',
      'Скоростной монтаж под бит трендового трека',
      'Уличный опрос — реакции реальных прохожих',
      'POV-формат: день глазами абонента Turon',
      'Субтитры-акценты: ключевые цифры крупно',
      'Переход-«матч кат» между локациями офис/улица',
    ],
    design: [
      'Крупная цифра тарифа как главный визуальный акцент',
      'Минимализм: фирменный цвет + одна мысль на баннер',
      'Два варианта A/B: с фото продукта и чистая типографика',
      'Мем-формат для молодёжной аудитории',
      'Серия из 3 карточек-каруселей с нарастанием интриги',
      'Иллюстрация вместо фото — выделиться в ленте',
    ],
    generic: [
      'Начать с боли клиента, закончить решением Turon',
      'Добавить цифры и факты — конкретика продаёт',
      'Один сюжет = одна мысль, без перегруза',
      'Закончить вопросом к аудитории для комментариев',
      'Использовать фирменные цвета и шрифт из брендбука',
      'Показать живых сотрудников — доверие к бренду',
    ],
  };

  function pickIdeas(format, exclude = []) {
    const pool = /Reels|Stories|Shorts|Видео/.test(format) ? IDEAS.reels
               : /Баннер|Обложка|Пост/.test(format) ? IDEAS.design
               : IDEAS.generic;
    const rest = pool.filter(i => !exclude.includes(i));
    const src = rest.length >= 3 ? rest : pool;
    return [...src].sort(() => Math.random() - .5).slice(0, 3);
  }

  function heuristic(text, now = new Date()) {
    const format = detectFormat(text);
    return {
      title: makeTitle(text, format),
      roles: detectRoles(text),
      project: detectProject(text),
      deadline: parseDeadline(text, now)?.toISOString() || null,
      priority: detectPriority(text),
      format,
      bullets: makeBullets(text),
      refs: extractRefs(text),
      ideas: pickIdeas(format),
      engine: 'built-in',
    };
  }

  async function withClaude(text, settings, now = new Date()) {
    const prompt = `Ты — помощник SMM-команды Turon Telecom (Узбекистан). Разбери техническое задание, написанное свободным текстом (русский/узбекский), и верни СТРОГО один JSON-объект без пояснений и без markdown.

Сегодня: ${now.toISOString()} (${['вс','пн','вт','ср','чт','пт','сб'][now.getDay()]}).

Поля JSON:
- title: короткий цепкий заголовок задачи (рус.)
- roles: массив из "video" (видеограф), "edit" (монтажёр), "design" (дизайнер) — кто нужен
- project: строка вида "Turon Telecom · Instagram" (канал определи из текста)
- deadline: ISO-дата со временем или null (относительные даты считай от «сегодня», время по умолчанию 18:00)
- priority: "high" | "med" | "low"
- format: например "Reels 9:16 · 20–35 сек", "Баннер 1080×1350", "Пост 1:1"
- bullets: массив из 3–5 коротких пунктов, что именно сделать
- refs: массив объектов {url, note} из ссылок в тексте
- ideas: массив из 3 свежих креативных идей для этой задачи (рус.)

Текст ТЗ:
"""${text}"""`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model || 'claude-sonnet-5',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    const raw = (data.content || []).map(b => b.text || '').join('');
    const json = raw.match(/\{[\s\S]*\}/);
    if (!json) throw new Error('no json');
    const p = JSON.parse(json[0]);
    p.engine = 'claude';
    p.roles = (p.roles || []).filter(r => ['video','edit','design'].includes(r));
    if (!p.roles.length) p.roles = ['design'];
    return p;
  }

  async function parse(text, settings) {
    if (settings && settings.apiKey) {
      try { return await withClaude(text, settings); }
      catch (e) { console.warn('Claude API недоступен, использую встроенный разбор:', e); }
    }
    return heuristic(text);
  }

  async function moreIdeas(task, settings) {
    if (settings && settings.apiKey) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: settings.model || 'claude-sonnet-5',
            max_tokens: 500,
            messages: [{ role: 'user', content:
              `Задача SMM-команды Turon Telecom: «${task.title}» (${task.format}). Уже предлагали: ${task.ideas.join('; ')}. Дай 3 НОВЫЕ короткие креативные идеи на русском. Верни строго JSON-массив из 3 строк.` }],
          }),
        });
        if (!res.ok) throw new Error('API ' + res.status);
        const data = await res.json();
        const raw = (data.content || []).map(b => b.text || '').join('');
        const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)[0]);
        if (Array.isArray(arr) && arr.length) return arr.slice(0, 3).map(String);
      } catch (e) { console.warn('Claude API недоступен для идей:', e); }
    }
    return pickIdeas(task.format, task.ideas);
  }

  return { parse, moreIdeas, heuristic, esc };
})();
