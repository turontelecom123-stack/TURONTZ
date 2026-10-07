/* Turon TZ — built-in brief analyzer.
   Works offline, without any API key. Understands Russian and Uzbek (Latin) briefs,
   including voice-dictated text without punctuation. */

const TZ_OFFSET_MIN = 300; // Asia/Tashkent: UTC+5, no DST

const LB = '(?<![\\p{L}\\p{N}])';
const RB = '(?![\\p{L}\\p{N}])';
const W = (body, flags = 'iu') => new RegExp(LB + '(?:' + body + ')' + RB, flags); // whole word
const S = (body, flags = 'iu') => new RegExp(LB + '(?:' + body + ')', flags);      // word start
const G = re => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function squash(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function cap(s) { s = squash(s); return s ? s[0].toUpperCase() + s.slice(1) : s; }

/* ---------- time ---------- */

function clock(now, tzMin) {
  const t = new Date(now.getTime() + tzMin * 60000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
  return {
    now, y, m, d, dow: t.getUTCDay(),
    at: (yy, mm, dd, hh = 18, mi = 0) => new Date(Date.UTC(yy, mm, dd, hh, mi) - tzMin * 60000),
    day: off => ({ y, m, d: d + off }),
  };
}

const MONTHS = ['январ|yanvar', 'феврал|fevral', 'март|mart', 'апрел|aprel', 'ма[йя]|may', 'июн|iyun',
  'июл|iyul', 'август|avgust', 'сентябр|sent?yabr', 'октябр|okt?yabr', 'ноябр|noyabr', 'декабр|dekabr'];
const WEEKDAYS = [
  [1, 'понедельник\\p{L}*|dushanba\\p{L}*'], [2, 'вторник\\p{L}*|seshanba\\p{L}*'], [3, 'сред[аеуы]|chorshanba\\p{L}*'],
  [4, 'четверг\\p{L}*|payshanba\\p{L}*'], [5, 'пятниц\\p{L}*|juma\\p{L}*'], [6, 'суббот\\p{L}*|shanba\\p{L}*'],
  [0, 'воскресень\\p{L}*|yakshanba\\p{L}*'],
];
const DAYPARTS = [
  ['(?:к|до) концу дня|в конце дня|kun oxiri\\p{L}*', 18, true],
  ['до обеда|tushlikkacha|tushlikgacha|tushgacha|obedgacha', 12],
  ['после обеда|tushdan keyin|tushlikdan keyin', 15],
  ['в обед|к обеду|обед\\p{L}*|tushlik\\p{L}*', 13],
  ['утр\\p{L}*|с утра|ertalab\\p{L}*', 10],
  ['вечер\\p{L}*|kechqurun\\p{L}*|kechga|kechki', 18],
  ['ноч\\p{L}*|kechasi', 22],
];
const NUM_WORDS = { один: 1, одну: 1, одна: 1, одного: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, bir: 1, ikki: 2, uch: 3, tort: 4, besh: 5 };

// Finds one date/time expression in a clause. Returns { date, spans } or null.
function findDate(clause, C, allowTimeOnly) {
  const st = { s: ' ' + clause.toLowerCase() + ' ', spans: [] };
  const grab = (re, ok = () => true) => {
    for (const m of st.s.matchAll(G(re))) {
      if (!ok(m)) continue;
      st.spans.push(m[0].trim());
      st.s = st.s.slice(0, m.index) + ' '.repeat(m[0].length) + st.s.slice(m.index + m[0].length);
      return m;
    }
    return null;
  };
  let ymd = null, hh = null, mi = 0, m;

  // 15.10 · 15/10 · 15.10.2026
  if ((m = grab(/(?<![\d:.,])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d:,])(?!\s*(?:гб|мб|gb|mb|%|сум|so'm|млн|тыс|ming))/iu,
    x => +x[1] >= 1 && +x[1] <= 31 && +x[2] >= 1 && +x[2] <= 12))) {
    let y = m[3] ? +m[3] : C.y; if (y < 100) y += 2000;
    ymd = { y, m: +m[2] - 1, d: +m[1] };
    if (!m[3] && C.at(y, ymd.m, ymd.d, 23, 59) < C.now) ymd.y += 1;
  }
  // 15 октября · 15-oktabr
  if (!ymd && (m = grab(new RegExp('(?<!\\d)(\\d{1,2})(?:-?(?:го|е|ого|chi))?\\s*-?\\s*(' + MONTHS.join('|') + ')\\p{L}*', 'iu'),
    x => +x[1] >= 1 && +x[1] <= 31))) {
    const mo = MONTHS.findIndex(v => new RegExp('^(?:' + v + ')', 'iu').test(m[2]));
    ymd = { y: C.y, m: mo, d: +m[1] };
    if (C.at(C.y, mo, ymd.d, 23, 59) < C.now) ymd.y += 1;
  }
  // 10 числа · 10-го · 10-sanada
  if (!ymd && (m = grab(/(?<!\d)(\d{1,2})\s*-?\s*(?:го\s+)?(?:числ\p{L}*|sana\p{L}*)|(?<!\d)(\d{1,2})-?го(?![\p{L}])/iu,
    x => +(x[1] || x[2]) >= 1 && +(x[1] || x[2]) <= 31))) {
    const d = +(m[1] || m[2]);
    ymd = { y: C.y, m: C.m, d };
    if (C.at(C.y, C.m, d, 23, 59) < C.now) ymd.m += 1;
  }
  if (!ymd && grab(W('послезавтра|indinga|indin|ertadan keyin'))) ymd = C.day(2);
  if (!ymd && grab(W('завтра|завтрашн\\p{L}*|ertaga|ertangi'))) ymd = C.day(1);
  if (!ymd && grab(W('сегодня|сегодняшн\\p{L}*|bugun\\p{L}*'))) ymd = C.day(0);

  // через 2 дня · через неделю · через 3 часа · 2 kundan keyin
  if (!ymd && (m = grab(new RegExp(LB + 'через\\s+(?:(\\d+|' + Object.keys(NUM_WORDS).join('|') + ')\\s+)?(дн\\p{L}*|день|недел\\p{L}*|час\\p{L}*|минут\\p{L}*)' +
    '|' + LB + '(\\d+|bir|ikki|uch|tort|besh)\\s+(kun|hafta|soat|daqiqa)(?:dan)?\\s+(?:keyin|so\'ng)', 'iu')))) {
    const n = +(m[1] || m[3]) || NUM_WORDS[(m[1] || m[3] || '').toLowerCase()] || 1;
    const unit = (m[2] || m[4] || '').toLowerCase();
    if (/^(час|soat)/.test(unit)) return { date: new Date(C.now.getTime() + n * 3600e3), spans: st.spans };
    if (/^(минут|daqiqa)/.test(unit)) return { date: new Date(C.now.getTime() + n * 60e3), spans: st.spans };
    ymd = C.day(/^(недел|hafta)/.test(unit) ? n * 7 : n);
  }
  if (!ymd && grab(W('(?:к|до) концу недели|в конце недели|на этой неделе|hafta oxiri\\p{L}*|shu hafta\\p{L}*'))) ymd = C.day((5 - C.dow + 7) % 7);
  if (!ymd && grab(W('на следующей неделе|следующ\\p{L}* недел\\p{L}*|keyingi hafta\\p{L}*'))) ymd = C.day(((1 - C.dow + 7) % 7) || 7);
  if (!ymd) {
    for (const [wd, pat] of WEEKDAYS) {
      if ((m = grab(W('(?:(следующ\\p{L}*|keyingi)\\s+)?(?:' + pat + ')(?:\\s+kuni)?')))) {
        let diff = ((wd - C.dow + 7) % 7) || 7;
        if (m[1] && diff < 7 && wd !== 0 && wd > C.dow) diff += 7;
        ymd = C.day(diff);
        break;
      }
    }
  }

  // time of day
  if ((m = grab(/(?<![\d.:])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)(?:\s*gacha)?/iu))) { hh = +m[1]; mi = +m[2]; }
  if (hh === null && (ymd || allowTimeOnly)) {
    const t = grab(new RegExp(LB + '(?:(?:в|к|до|около|soat)\\s*(\\d{1,2})(?:\\s*(?:час\\p{L}*|ч(?![\\p{L}])))?(?:\\s*gacha)?|(\\d{1,2})\\s*(?:час\\p{L}*|gacha|da)' + RB + ')(?![\\d:.])', 'iu'),
      x => +(x[1] || x[2]) <= 23);
    if (t) { hh = +(t[1] || t[2]); if (hh < 7) hh += 12; }
  }
  let todayByDaypart = false;
  if (hh === null) {
    for (const [pat, h, today] of DAYPARTS) {
      if (grab(W(pat))) { hh = h; todayByDaypart = !!today; break; }
    }
  }
  if (!ymd && todayByDaypart) ymd = C.day(0);
  if (!ymd && hh !== null && allowTimeOnly) {
    ymd = C.day(0);
    if (C.at(ymd.y, ymd.m, ymd.d, hh, mi) <= C.now) ymd = C.day(1);
  }
  if (!ymd) return null;
  return { date: C.at(ymd.y, ymd.m, ymd.d, hh === null ? 18 : hh, mi), spans: st.spans };
}

/* ---------- vocabulary ---------- */

const DL_MARK = S('дедлайн|deadline|срок\\p{L}*|сдать|сдач\\p{L}*|сдайте|успеть|готов\\p{L}* (?:к|до)|muddat\\p{L}*|topshir\\p{L}*');
const PUB_MARK = S('дат\\p{L}* (?:публикац|выход)|публикац|опубликов|выложить|выклад|выход(?!н)|выйдет|выпуск|постинг|e\'lon|joyla|chiqadi|chiqish|nashr|publish');
const EVENT_INFO = S('действ|длится|продлится|проходит|пройд[её]т|amal qil|davom et');
const MARK_STRIP = S('дат\\p{L}* (?:публикац|выход)\\p{L}*|дедлайн\\p{L}*|deadline|срок\\p{L}*(?: сдачи)?|сдать|сдач\\p{L}*|сдайте|публикац\\p{L}*|опубликов\\p{L}*|выложить|выход(?!н)\\p{L}*|выйдет|выпуск\\p{L}*|muddat\\p{L}*|e\'lon\\p{L}*|joyla\\p{L}*|chiqadi|nashr\\p{L}*');
const PRIORITY_STRIP = S('(?:очень\\s+)?(?:не\\s+)?срочн\\p{L}*|горит|горящ\\p{L}*|asap|как можно (?:скорее|быстрее)|приоритет\\p{L}*(?:\\s*[:\\-—]?\\s*(?:высок|низк|средн|обычн|главн|максим)\\p{L}*)?|(?:высок|низк|средн)\\p{L}* приоритет\\p{L}*|shoshilinch(?: emas)?|zudlik bilan|tezroq|tezda|без спешки|не к спеху');
const ROLE_NOUNS = S('видеограф\\p{L}*|оператор\\p{L}*|монтаж[её]р\\p{L}*|монтажник\\p{L}*|дизайнер\\p{L}*|videograf\\p{L}*|operator\\p{L}*|montajchi\\p{L}*|montajyor\\p{L}*|dizayner\\p{L}*|исполнител\\p{L}*|ответственн\\p{L}*|ijrochi\\p{L}*');
const SPEECH = S('говор|рассказ|интервью|ведущ|в кадре|озвуч|голос|спикер|gapir|aytib|suhbat|intervyu');
const URL_RE = /https?:\/\/\S+|(?:www\.|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.|t\.me\/)\S+/gi;
const FILLER = new Set(('мне нам вам нужно нужен нужна нужны надо необходимо пожалуйста прошу давайте это всё все так тоже ещё еще очень ну вот там тут ' +
  'чтобы который которые которая для проекта проект числа часов часа kerak iltimos uchun bilan kuni gacha va ham loyiha loyihasi').split(' '));

const PLATFORMS = [
  ['Instagram', 'instagram\\p{L}*|инстаграм\\p{L}*|инста\\p{L}*|инст|insta\\p{L}*|ig|рилс\\p{L}*|reels?|сторис|stories'],
  ['Telegram', 'telegram\\p{L}*|телеграм\\p{L}*|телег\\p{L}*|тг|tg'],
  ['YouTube', 'youtube\\p{L}*|ютуб\\p{L}*|ютьюб\\p{L}*|shorts|шортс'],
  ['TikTok', 'tiktok\\p{L}*|тикток\\p{L}*|тик-ток\\p{L}*'],
  ['Facebook', 'facebook\\p{L}*|фейсбук\\p{L}*|fb'],
  ['Сайт', 'сайт\\p{L}*|website|veb-sayt\\p{L}*|лендинг\\p{L}*'],
];
const ALL_SOCIALS = S('вс\\p{L}* соцсет|все платформ|barcha (?:tarmoq|ijtimoiy)|hamma tarmoq');

const FORMATS = {
  reels: { re: S('рилс\\p{L}*|рилз|reels?'), noun: 'Reels', video: true },
  shorts: { re: S('shorts|шортс\\p{L}*'), noun: 'Shorts', video: true },
  tiktok: { re: S('tiktok|тикток\\p{L}*|тик-ток'), noun: 'TikTok', video: true },
  interview: { re: S('интервью|подкаст\\p{L}*|intervyu|podkast'), noun: 'Интервью', video: true },
  video: { re: S('ролик\\p{L}*|видео(?!граф)\\p{L}*|video(?!graf)\\p{L}*|rolik\\p{L}*|клип\\p{L}*'), noun: 'Видеоролик', video: true },
  stories: { re: S('сторис|stories|story|storis'), noun: 'Сторис' },
  carousel: { re: S('карусел\\p{L}*|carousel|karusel\\p{L}*'), noun: 'Карусель' },
  banner: { re: S('баннер\\p{L}*|banner\\p{L}*|билборд\\p{L}*|billboard'), noun: 'Баннер' },
  cover: { re: S('обложк\\p{L}*|превью|preview|muqova\\p{L}*'), noun: 'Обложка' },
  post: { re: S('пост(?!анов|оян|ав|ер)\\p{L}*|post(?!er)\\p{L}*'), noun: 'Пост' },
  logo: { re: S('(?:нов\\p{L}*|сделать|разработать|нарисовать)\\s+логотип|logotip\\s+(?:yarat|chiz|ishlab)'), noun: 'Логотип' },
  photo: { re: S('фотосесс\\p{L}*|фотосъ[её]мк\\p{L}*|suratga ol\\p{L}*|fotosessiya'), noun: 'Фотосъёмка' },
};

const CATS = [
  ['tariff', 'тариф|tarif|безлимит|bezlimit|гигабайт|гб(?![\\p{L}])|интернет[- ]пакет|paket'],
  ['promo', 'акци|скидк|chegirma|aksiya|распродаж|бонус|кэшбэк|кешбэк|cashback|подар|sovg\'a'],
  ['device', 'роутер|router|модем|modem|смартфон|smartfon|приставк|tv ?box|оборудован|uskuna'],
  ['contest', 'конкурс|розыгрыш|разыгрыва|tanlov|giveaway'],
  ['event', 'мероприят|ивент|открыти|открыва|презентац|tadbir|ochilish|konsert|концерт|форум|выставк'],
  ['hiring', 'ваканс|vakans|ish o\'rni|на работу|набор сотрудник|hiring|ищем в команду'],
  ['holiday', 'праздник|поздравл|bayram|tabrik|navro\'z|навруз|новый год|новогод|yangi yil|8 марта|независимост|mustaqillik|рамадан|ramazon|хайит|hayit'],
  ['howto', 'инструкц|как подключ|как оплат|как настро|qo\'llanma|qanday ulan|туториал|tutorial|пошагов'],
  ['service', 'услуг|xizmat|подключени|ulanish|покрыти|qamrov|скорост|tezlik|оптик|optika|fttx|gpon'],
];

/* ---------- text preparation ---------- */

function normalize(text) {
  let s = String(text || '').replace(/\r/g, '').replace(/[ʻʼ‘’`´]/g, "'").replace(/[“”„]/g, '"');
  s = s.replace(G(S('bad ?line|бэд ?лайн|бед ?лайн|дед ?лайн|ded ?layn|dedlayn')), 'дедлайн');
  s = s.replace(G(W('турон\\s+телеком\\p{L}*|turon\\s+telekom\\p{L}*')), 'Turon Telecom')
    .replace(G(W('турон\\s+маркет\\p{L}*|turon\\s+market\\p{L}*')), 'Turon Market')
    .replace(G(W('турон\\s+(?:тв|ти\\s?ви)|turon\\s+tv')), 'Turon TV');
  // voice recognition often repeats a phrase: "мне нужен мне нужен ролик"
  const rep = /(^|\s)((?:[^\s]+\s+){0,3}?[^\s]+)(?:\s+\2)+(?=\s|$)/giu;
  let prev; do { prev = s; s = s.replace(rep, '$1$2'); } while (s !== prev);
  return s.replace(/[ \t]+/g, ' ').trim();
}

function splitClauses(text) {
  const marked = text
    .replace(G(S('дедлайн|deadline|срок\\p{L}* сдачи|дат\\p{L}* (?:публикац|выход)|публикац\\p{L}*|приоритет\\p{L}*|исполнител\\p{L}*|ijrochi\\p{L}*|muddat\\p{L}*')), m => '\n' + m);
  return marked
    .split(/[!?;\n]+|\.(?!\d)|(?<!\d)\.|,(?!\d)/)
    .map(squash)
    .filter(Boolean);
}

function stripMeta(clause, spans, people) {
  let s = ' ' + clause.replace(URL_RE, ' ') + ' ';
  for (const sp of spans.sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp('(?:' + LB + '(?:к|ко|до|в|во|на|после|с)\\s+)?' + escRe(sp), 'iu'), ' ');
  }
  s = s.replace(G(MARK_STRIP), ' ').replace(G(PRIORITY_STRIP), ' ').replace(G(ROLE_NOUNS), ' ');
  for (const p of people) s = s.replace(G(p.re), ' ');
  s = s.replace(G(W('gacha|kuni|числа')), ' ');
  return squash(s).replace(/^[\s,:;–—-]+|[\s,:;–—-]+$/g, '');
}

function isMeaningful(s) {
  const words = s.toLowerCase().match(/[\p{L}\p{N}«»+]+/gu) || [];
  return words.some(w => w.length >= 3 && !FILLER.has(w));
}

function tidyClause(s) {
  return squash(s)
    .replace(new RegExp('^(?:(?:мне|нам)\\s+)?(?:нужн[оаы]?|нужен|надо|необходимо|требуется)' + RB + '\\s*', 'iu'), '')
    .replace(new RegExp('^(?:пожалуйста|прошу|давайте|iltimos)' + RB + '[\\s,]*', 'iu'), '')
    .replace(new RegExp('^(?:и|а|но|va|ham)' + RB + '\\s*', 'iu'), '')
    .replace(/^[\s,:;–—-]+|[\s,:;–—-]+$/g, '');
}

/* ---------- detectors ---------- */

function detectProject(low, projects = [], defaultId = '') {
  if (/turon\s*market|turonmarket|маркет|market/.test(low)) return projects.find(p => /market/i.test(p.name))?.id || projects[0]?.id || 'p_market';
  if (/turon\s*tv|\btv\b|(?<![\p{L}])тв(?![\p{L}])/u.test(low)) return projects.find(p => /tv/i.test(p.name))?.id || projects[0]?.id || 'p_tv';
  const candidates = [];
  projects.forEach(p => [p.name, ...(p.aliases || [])].forEach(a => {
    const v = String(a || '').toLowerCase().trim();
    if (v.length >= 2 && W(escRe(v)).test(low)) candidates.push({ id: p.id, len: v.length });
  }));
  candidates.sort((a, b) => b.len - a.len);
  if (candidates[0]) return candidates[0].id;
  return projects.some(p => p.id === defaultId) ? defaultId : (projects[0]?.id || 'p_telecom');
}

function detectPlatforms(low, project) {
  if (ALL_SOCIALS.test(low)) return (project.platformDefaults && project.platformDefaults.length) ? project.platformDefaults.slice(0, 4) : ['Instagram', 'Telegram', 'Facebook'];
  return PLATFORMS.filter(([, pat]) => W(pat).test(low)).map(([name]) => name);
}

function detectFormats(low) {
  return Object.entries(FORMATS)
    .map(([key, f]) => ({ key, idx: low.search(f.re) }))
    .filter(x => x.idx >= 0)
    .filter((x, _, all) => !(x.key === 'video' && all.some(y => ['reels', 'shorts', 'tiktok', 'interview'].includes(y.key))))
    .sort((a, b) => a.idx - b.idx)
    .map(x => x.key);
}

function detectPeople(text, team) {
  const found = [];
  for (const u of team) {
    const parts = String(u.name).split(/\s+/).filter(p => p.length >= 3).slice(0, 2);
    for (const part of parts) {
      const base = part.length > 4 ? part.slice(0, -1) : part;
      const re = new RegExp(LB + escRe(base) + '\\p{L}{0,3}' + RB, 'iu');
      if (re.test(text)) { found.push({ id: u.id, role: u.role, re }); break; }
    }
  }
  return found;
}

function decideRoles(low, formats, people) {
  const roles = new Set(people.map(p => p.role));
  const explicit = new Set();
  if (S('видеограф|оператор|videograf|operator').test(low)) explicit.add('video');
  if (S('монтаж[её]р|монтажник|montajchi|montajyor').test(low)) explicit.add('edit');
  if (S('дизайнер|dizayner').test(low)) explicit.add('design');
  explicit.forEach(r => roles.add(r));
  // "исполнитель видеограф монтажёр" — the SMM named the roles, trust them as is
  if (explicit.size && S('исполнител|ответственн|ijrochi').test(low)) return ['video', 'edit', 'design'].filter(r => roles.has(r));

  const isVideo = formats.some(k => FORMATS[k].video);
  const fromExisting = S('из готов|из имеющ|из архив|готов\\p{L}* (?:кадр|материал|видео|исходник)|исходник|tayyor (?:video|material|kadr)').test(low);
  if (S('сним\\p{L}*|снять\\p{L}*|снял\\p{L}*|съ[её]м\\p{L}*|отсня\\p{L}*|suratga|tasvirga|olib ber|s\'?yomka').test(low) || formats.includes('photo')) roles.add('video');
  if (S('монтаж(?!ёр|ер|ник)|смонтир|монтир|склеи|склей|нарезк|нареж|субтитр|озвуч|цветокор|montaj(?!chi|yor)|subtitr|kesib').test(low)) roles.add('edit');
  if (isVideo) { roles.add('edit'); if (!fromExisting) roles.add('video'); }
  if (fromExisting && !explicit.has('video') && !S('сним|снять|съ[её]м|suratga').test(low)) roles.delete('video');
  if (formats.some(k => ['stories', 'carousel', 'banner', 'cover', 'post', 'logo'].includes(k)) ||
      S('дизайн(?!ер)|макет|афиш|карточк|инфографик|визуал|постер|dizayn(?!er)|maket|poster|afisha').test(low)) roles.add('design');
  if (!roles.size) roles.add('design');
  return ['video', 'edit', 'design'].filter(r => roles.has(r));
}

function videoFormatLabel(key, platforms, durSec) {
  const dur = durSec ? (durSec >= 60 ? `${Math.round(durSec / 60)} мин` : `${durSec} сек`) : '';
  if (key === 'reels') return `Reels 9:16, ${dur || '15–30 сек'}`;
  if (key === 'shorts') return `Shorts 9:16, ${dur || 'до 60 сек'}`;
  if (key === 'tiktok') return `TikTok 9:16, ${dur || '15–30 сек'}`;
  if (key === 'interview') return `Интервью 16:9${dur ? ', ' + dur : ''}`;
  const horizontal = platforms.includes('YouTube') && !platforms.includes('Instagram') && !platforms.includes('TikTok');
  return horizontal ? `Видео 16:9${dur ? ', ' + dur : ''}` : `Видеоролик 9:16, ${dur || '20–40 сек'}`;
}

function formatLabel(formats, platforms, roles, low) {
  let m, durSec = 0;
  if ((m = low.match(/(\d{1,3})\s*(?:сек\p{L}*|soniya\p{L}*)/u))) durSec = +m[1];
  else if ((m = low.match(/(\d{1,2})\s*(?:мин\p{L}*|daqiqa\p{L}*)/u))) durSec = +m[1] * 60;
  const tgOnly = platforms.length === 1 && platforms[0] === 'Telegram';
  const labels = formats.map(k => {
    if (FORMATS[k].video) return videoFormatLabel(k, platforms, durSec);
    return {
      stories: 'Stories 9:16 (1080×1920)', carousel: 'Карусель 1080×1350, 5–8 слайдов', banner: 'Баннер (размер уточнить)',
      cover: 'Обложка / превью', post: tgOnly ? 'Пост для Telegram 1280×720' : 'Пост 1080×1350', logo: 'Логотип', photo: 'Фотосъёмка',
    }[k];
  });
  if (labels.length) return labels.join(' + ');
  if (roles.includes('video') || roles.includes('edit')) return videoFormatLabel('video', platforms, durSec);
  return 'Макет (формат уточнить)';
}

// The most specific intent goes first: a smartphone giveaway is a giveaway, not a device ad.
const INTENT_ORDER = ['contest', 'hiring', 'holiday', 'event', 'howto', 'promo', 'tariff', 'device', 'service'];
function detectCategories(low) {
  return CATS.filter(([, pat]) => S(pat).test(low)).map(([key]) => key)
    .sort((a, b) => INTENT_ORDER.indexOf(a) - INTENT_ORDER.indexOf(b));
}

function categoryLabel(cats, low, quoted) {
  const deviceLabel = /роутер|router/u.test(low) ? 'роутеры' : /смартфон|smartfon/u.test(low) ? 'смартфоны'
    : /приставк|tv ?box/u.test(low) ? 'ТВ-приставка' : /модем|modem/u.test(low) ? 'модемы' : 'оборудование';
  const promoLabel = /скидк|chegirma/u.test(low) ? 'скидки' : /подар|sovg'a/u.test(low) ? 'подарки' : 'акция';
  const one = key => ({
    tariff: quoted ? `тариф «${quoted}»` : 'тариф',
    promo: promoLabel,
    device: deviceLabel,
    contest: 'розыгрыш',
    event: /открыти|открыва|ochilish/u.test(low) ? 'открытие' : /презентац/u.test(low) ? 'презентация' : /концерт|konsert/u.test(low) ? 'концерт' : 'мероприятие',
    hiring: 'вакансия',
    holiday: /независим|mustaqillik/u.test(low) ? 'День независимости' : /новый год|новогод|yangi yil/u.test(low) ? 'Новый год'
      : /навруз|navro'z/u.test(low) ? 'Навруз' : /8 марта/u.test(low) ? '8 Марта' : /рамадан|ramazon|хайит|hayit/u.test(low) ? 'Рамазан-хайит' : 'поздравление',
    howto: 'инструкция',
    service: 'услуги',
  }[key]);
  if (cats.includes('promo') && cats.includes('tariff')) return 'акции и тарифы';
  if (cats.includes('promo') && cats.includes('device')) return `${promoLabel === 'скидки' ? 'скидки' : 'акция'} на ${deviceLabel}`;
  if (cats.includes('contest') && cats.includes('device')) return `розыгрыш: ${deviceLabel}`;
  return one(cats[0]);
}

function aboutPhrase(text) {
  let m;
  const cut = t => {
    t = t.split(new RegExp(LB + '(?:для|чтобы|которы\\p{L}*|с дедлайн\\p{L}*|дедлайн|срок|нужно|надо|uchun|kerak)' + RB, 'iu'))[0];
    t = t.replace(G(W('наш\\p{L}*|сво\\p{L}*|этот|эта|это|эту|этих|всех|всё|все')), ' ');
    return squash(t).split(' ').filter(Boolean).slice(0, 5).join(' ').replace(/[\s,–—-]+$/, '');
  };
  if ((m = text.match(/(?:^|\s)о том,?\s+(как\s+[^.,;!?]{3,60})/iu))) return { text: cut(m[1]), kind: 'how' };
  if ((m = text.match(S('как\\s+(?:подключ|оплат|настро|пользова|установ|получ|перейти|смен|провер|заказ|купить|сэконом)\\p{L}*[^.,;!?]{0,50}')))) return { text: cut(m[0]), kind: 'how' };
  if ((m = text.match(new RegExp(LB + '((?:[\\p{L}\\p{N}\'«»+-]+\\s+){0,4}?[\\p{L}\\p{N}\'«»+-]+)\\s+haqida' + RB, 'iu')))) {
    return { text: squash(m[1].split(/\s+(?:uchun|kerak|bo'yicha)\s+/iu).pop()), kind: 'uz' };
  }
  if ((m = text.match(new RegExp(LB + '(?:про|на тему|по теме|посвящ[её]нн\\p{L}*|насч[её]т|по поводу)\\s+([^.,;!?]{2,80})', 'iu')))) return { text: cut(m[1]), kind: 'acc' };
  if ((m = text.match(new RegExp(LB + '(?:о|об|обо)\\s+([^.,;!?]{2,80})', 'iu')))) return { text: cut(m[1]), kind: 'prep' };
  return null;
}

// Words left after removing format, platform, project and service words — a topic the dictionaries do not know.
function leftoverTopic(clause, project) {
  const names = [project.name, ...(project.aliases || [])].filter(Boolean).map(x => String(x).toLowerCase());
  let s = ' ' + clause.toLowerCase().replace(URL_RE, ' ') + ' ';
  names.forEach(n => { s = s.replace(G(W(escRe(n))), ' '); });
  s = s.replace(G(S('turon\\p{L}*|турон\\p{L}*|telecom|market|tv(?![\\p{L}])')), ' ');
  Object.values(FORMATS).forEach(f => { s = s.replace(G(f.re), ' '); });
  PLATFORMS.forEach(([, pat]) => { s = s.replace(G(W(pat)), ' '); });
  CATS.forEach(([, pat]) => { s = s.replace(G(S('(?:' + pat + ')\\p{L}*')), ' '); });
  s = s.replace(G(S('сдела|сним|сня|смонт|подгот|нарис|созда|напис|оформ|qil|tayyorla|yarat|chiz|монтаж|динамичн|субтитр|кадр|живы|бренд|brend|логотип|logotip|цвет|rang|cta|призыв|текст|matn|формат|размер|секунд|минут|час|soniya|daqiqa|офис|улиц|студи|ofis')), ' ');
  s = s.replace(/\d+\s*%?/g, ' ');
  const words = (s.match(/[\p{L}\p{N}«»+]+/gu) || []).filter(w => w.length >= 3 && !FILLER.has(w) && !/^\p{L}+(?:ть|ться|ите|йте)$/u.test(w));
  return words.length >= 2 ? words.slice(0, 4).join(' ') : '';
}

/* ---------- generators ---------- */

const IDEAS = {
  tariff: {
    video: ['Начать с вопроса в лоб: «Сколько вы платите за интернет?»', 'Показать цену крупно уже в первые 3 секунды', 'Сравнение «было / стало»: старый тариф против нового'],
    static: ['Цена — самый крупный элемент макета', 'Одна главная выгода + 2–3 иконки с деталями', 'Карусель: проблема → тариф → как подключить'],
  },
  promo: {
    video: ['Перечёркнутая старая цена рядом с новой — прямо в кадре', 'Указать срок акции — «только до …» создаёт срочность', 'Показать выгоду в реальном использовании, а не на белом фоне'],
    static: ['Перечёркнутая старая цена рядом с новой', 'Срок акции крупно — «только до …»', 'Один товар/выгода на макет, без перегруза'],
  },
  device: {
    video: ['Распаковка и первый запуск за 10 секунд', 'Показать устройство дома, в реальной жизни', 'Крупно цена и рассрочка в финале'],
    static: ['Фото устройства крупно + цена', 'Сравнить 2–3 модели в одной карусели', 'Главная характеристика (скорость, покрытие) иконкой'],
  },
  contest: {
    video: ['Показать приз в руках в первые секунды', 'Условия участия — 3 шага, каждый отдельным кадром', 'Дата подведения итогов в финальном кадре'],
    static: ['Условия в 3 шага на одном слайде', 'Приз — главный визуальный элемент', 'Дата итогов крупно'],
  },
  event: {
    video: ['Тизер с атмосферой места за 15 секунд', 'Дата, время и место — крупными титрами', 'После события — короткий репортаж из лучших моментов'],
    static: ['Дата, время и место — крупно и сразу', 'Фото площадки или людей, а не сток', 'Серия: анонс → напоминание → репортаж'],
  },
  hiring: {
    video: ['Реальный сотрудник рассказывает о работе за 20 секунд', 'Показать офис и команду в работе', 'В конце — простой способ откликнуться'],
    static: ['Должность крупно + 3 плюса работы иконками', 'Фото настоящей команды', 'Контакт для отклика на самом видном месте'],
  },
  holiday: {
    video: ['Тёплое поздравление от команды вместо стоковой открытки', 'Короткий текст на русском и узбекском', 'Фирменные цвета + один праздничный элемент'],
    static: ['Поздравление на двух языках', 'Фирменные цвета + один праздничный элемент без перегруза', 'Минимум текста — максимум настроения'],
  },
  howto: {
    video: ['Запись экрана телефона крупным планом', 'Один шаг — один кадр, с подписью', 'Финал: «Сохраните, чтобы не потерять»'],
    static: ['Один шаг — один слайд карусели', 'Скриншоты с выделенными кнопками', 'Последний слайд: «Сохраните пост»'],
  },
  service: {
    video: ['Показать результат услуги в жизни клиента', 'Вопрос-проблема в начале, решение — в конце', 'Отзыв реального клиента в 1–2 фразах'],
    static: ['Главная выгода услуги в заголовке до 5 слов', 'Цифры: скорость, цена, покрытие', 'Как подключить — в одну строку'],
  },
  generic: {
    video: ['Хук в первые 2 секунды — вопрос или неожиданный кадр', 'Субтитры на русском и узбекском — многие смотрят без звука', 'Смена планов каждые 2–3 секунды'],
    static: ['Одна главная мысль на макет — без перегруза текстом', 'Заголовок до 5 слов, крупно', 'Логотип и фирменные цвета в одном месте во всех постах'],
  },
};
const HOOKS = {
  tariff: 'Сколько вы переплачиваете за интернет каждый месяц?',
  promo: 'Только до конца акции — успейте забрать выгоду',
  device: 'Интернет летает во всех комнатах — показываем как',
  contest: 'Хотите выиграть приз? Всего 3 простых шага',
  event: 'Вы точно не захотите это пропустить',
  hiring: 'Ищем людей в команду Turon',
  holiday: 'Поздравляем вас с праздником!',
  howto: 'Это займёт меньше минуты — показываем как',
  service: 'Устали от медленного интернета?',
};
const CTAS = {
  tariff: 'Подключайтесь — подробности в Direct', service: 'Подключайтесь — подробности в Direct',
  promo: 'Успейте до конца акции — пишите в Direct', device: 'Заказывайте — пишите в Direct',
  contest: 'Участвуйте: подпишитесь и оставьте комментарий', hiring: 'Отправьте резюме в Direct',
  event: 'Сохраните пост, чтобы не пропустить', howto: 'Сохраните пост, чтобы не потерять',
};

function explicitCta(text) {
  const m = text.match(/(?:cta|призыв\p{L}*(?:\s+к\s+действию)?|call to action)\s*[:\-—]?\s*([^.;\n]{3,90})/iu);
  if (!m) return '';
  const val = squash(m[1].replace(/,\s*$/, ''));
  const junk = /^(?:qo'sh\p{L}*|добав\p{L}*|нуж\p{L}*|обязательно|в конце|kerak|bo'lsin|сделать|сделайте|qo'yilsin)(?:\s+(?:в конце|kerak|обязательно|qilinsin))?$/iu;
  return junk.test(val) ? '' : val;
}
function brandCta(project) {
  const b = project.brandSettings || {};
  if (b.cta) return b.cta;
  const m = String(project.brand || '').match(/CTA\s*[:\-—]?\s*([^|]+?)(?:\.\s|\.?$|\|)/i);
  return m ? squash(m[1]).replace(/[.,;\s]+$/, '') : '';
}

function buildChecklist({ roles, formats, format, platforms, low, cats, project, cta, speech }) {
  const items = [];
  const isVideo = formats.some(k => FORMATS[k].video) || (!formats.length && (roles.includes('video') || roles.includes('edit')));
  const horizontal = /16:9/.test(format);
  if (roles.includes('video') && isVideo) {
    items.push(horizontal ? 'Снимать горизонтально 16:9' : 'Снимать вертикально 9:16');
    if (speech) items.push('Чистый звук: петличка, без шума вокруг');
    items.push('Разные планы: общий, средний, крупный + запас для перебивок');
  }
  if (roles.includes('video') && formats.includes('photo')) items.push('Снять в высоком разрешении, с запасом вариантов');
  if (roles.includes('edit')) {
    items.push('Хук в первые 2 секунды');
    const ru = /русск|rus/u.test(low), uz = /узбек|o'zbek|uzbek/u.test(low);
    if (/субтитр|subtitr/u.test(low)) items.push('Субтитры: ' + (ru && !uz ? 'русский' : uz && !ru ? 'узбекский' : 'русский и узбекский'));
    else items.push('Субтитры (RU/UZ), если есть речь');
    items.push('Финальный кадр: логотип ' + (project.name || '') + (cta ? ' + призыв' : ''));
  }
  if (roles.includes('design')) {
    const size = (format.match(/\d{3,4}×\d{3,4}/) || [])[0];
    if (size) items.push('Размер ' + size);
    items.push(`Логотип и фирменные цвета ${project.name || 'бренда'}`);
    if (cats.includes('contest')) items.push('Приз и условия участия — крупно и понятно');
    else if (cats.some(c => ['tariff', 'promo', 'device'].includes(c))) items.push('Цена / главная выгода — самый крупный элемент');
    items.push('Проверить текст на ошибки (RU/UZ)');
  }
  items.push('Загрузить готовый файл в карточку задачи');
  return uniq(items).slice(0, 7);
}

function buildMissing({ topic, formats, format, deadline, publishDate, deadlineFromPublish, low, cats, roles, speech, ctaKnown, platformGuessed, now }) {
  const q = [];
  const noun = (formats[0] ? FORMATS[formats[0]].noun : (roles.includes('design') ? 'Макет' : 'Видео')).toLowerCase();
  if (!topic) q.push(`О чём ${noun}? Какой продукт, акция или главная мысль?`);
  if (!deadline) q.push('Какой дедлайн сдачи?');
  else if (deadlineFromPublish) q.push('Дедлайн не назван — поставил за день до публикации. Подходит?');
  else if (deadline < now) q.push('Дедлайн получился в прошлом — проверьте дату');
  if (deadline && publishDate && deadline > publishDate) q.push('Дедлайн позже даты публикации — проверьте даты');
  if (cats.includes('contest')) {
    if (!/услови|shart|приз|sovrin|итог|g'olib/u.test(low)) q.push('Какой приз, условия участия и дата итогов?');
  } else if (cats.some(c => ['promo', 'tariff', 'device'].includes(c)) && !/\d[\d\s]*(?:сум|so'm|тыс|ming|млн|mln|%|гб|gb|мбит|mbit)/u.test(low)) {
    q.push(cats.includes('tariff') ? 'Какие цена и условия тарифа?' : 'Какие точные цены и сроки акции?');
  }
  if (roles.includes('video') && speech && !/(?:в кадре|ведущ|спикер|сотрудник|директор|клиент|блогер|актёр|актер|голос за кадром|диктор)/u.test(low)) q.push('Кто будет в кадре или говорить за кадром?');
  if (roles.includes('video') && !/(?:офис|улиц|магазин|филиал|студи|дом|точк|локац|ofis|do'kon|filial|studiya|joyda|на месте)/u.test(low)) q.push('Где снимать?');
  if (!ctaKnown) q.push('Какой призыв в конце (позвонить, написать в Direct, подключить)?');
  if (platformGuessed) q.push('Где публикуем: Instagram, Telegram, другое?');
  if (/Макет \(формат/.test(format)) q.push('Какой формат и размер нужен?');
  return uniq(q).slice(0, 4);
}

function buildIdeas(cats, isVideo) {
  const medium = isVideo ? 'video' : 'static';
  const pool = [];
  cats.slice(0, 2).forEach(c => (IDEAS[c] ? IDEAS[c][medium] : []).forEach(x => pool.push(x)));
  IDEAS.generic[medium].forEach(x => pool.push(x));
  return uniq(pool).slice(0, 4);
}

function extractRefs(text) {
  const urls = String(text || '').match(URL_RE) || [];
  return urls.map(u => ({ url: u.replace(/[.,;)]+$/, ''), note: 'Референс — адаптировать под бренд, не копировать 1:1' }));
}

/* ---------- main ---------- */

function parse(text, opts = {}) {
  const projects = opts.projects || [];
  const team = (opts.users || []).filter(u => u && u.name && ['video', 'edit', 'design'].includes(u.role) && u.active !== false);
  const C = clock(opts.now ? new Date(opts.now) : new Date(), opts.tzOffsetMin ?? TZ_OFFSET_MIN);
  const clean = normalize(text);
  const low = clean.toLowerCase();

  const projectId = detectProject(low, projects, opts.defaultProjectId);
  const project = projects.find(p => p.id === projectId) || {};
  const platforms = detectPlatforms(low, project);
  const platformGuessed = !platforms.length;
  const platform = platforms.length ? platforms.join(', ') : ((project.platformDefaults || [])[0] || 'Instagram');
  const formats = detectFormats(low);
  const people = detectPeople(clean, team);
  const roles = decideRoles(low, formats, people);
  const format = formatLabel(formats, platforms, roles, low);
  const cats = detectCategories(low);
  const quoted = (clean.match(/«([^»]{2,40})»|"([^"]{2,40})"/) || []).slice(1).find(Boolean) || '';

  let deadline = null, publishDate = null;
  const content = [];
  for (const clause of splitClauses(clean)) {
    const lc = clause.toLowerCase();
    const isPub = PUB_MARK.test(lc), isDl = DL_MARK.test(lc);
    const found = findDate(clause, C, isPub || isDl);
    if (found) {
      if (isPub) { if (!publishDate) publishDate = found.date; }
      else if (!EVENT_INFO.test(lc) && !deadline) deadline = found.date;
    }
    const rest = stripMeta(clause, found && !EVENT_INFO.test(lc) ? found.spans : [], people);
    if (isMeaningful(rest)) content.push(tidyClause(rest));
  }
  let deadlineFromPublish = false;
  if (!deadline && publishDate) {
    const p = new Date(publishDate.getTime() + TZ_OFFSET_MIN * 60000);
    deadline = C.at(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate() - 1, 18, 0);
    if (deadline <= C.now) deadline = new Date(publishDate.getTime() - 2 * 3600e3);
    deadlineFromPublish = true;
  }

  const pr = detectPriority(low);
  let priority = pr.level;
  if (!pr.explicit && deadline && deadline - C.now < 30 * 3600e3) priority = 'high';

  // topic & title
  const contentText = content.join('. ');
  const about = aboutPhrase(contentText);
  let topic = '', m;
  const leftover = content[0] ? leftoverTopic(content[0], project) : '';
  if (formats[0] === 'interview' && (m = contentText.match(/(?:интервью|подкаст)\s+(со?\s+[\p{L}-]{3,}(?:\s+[\p{L}-]{3,})?)/iu))) topic = m[1];
  // a lone word after "про" is often an inflected category word ("про акцию") — the dictionary label reads better
  else if (about && ['how', 'acc'].includes(about.kind) && about.text && !(cats.length && about.kind === 'acc' && !/\s/.test(about.text))) topic = about.text;
  else if (cats.length) {
    topic = categoryLabel(cats, low, quoted);
    const pct = (low.match(/(\d{1,2})\s*%/) || [])[1];
    if (leftover && pct && cats.every(c => ['promo', 'tariff', 'service'].includes(c)) && !quoted) topic = `${leftover} — скидка ${pct}%`;
  } else if (about && about.text) topic = about.text;
  if (!topic) topic = leftover;
  if (quoted && topic && !topic.includes(quoted) && topic.length < 40) topic += ` «${quoted}»`;
  if (!topic && quoted) topic = `«${quoted}»`;

  const nouns = formats.slice(0, 2).map((k, i) => {
    let n = FORMATS[k].noun;
    if (k === 'video' && /^Видео 16/.test(format)) n = 'Видео';
    return i ? n.toLowerCase().replace(/^reels$/, 'Reels').replace(/^shorts$/, 'Shorts').replace(/^tiktok$/, 'TikTok') : n;
  });
  const noun = nouns.length ? nouns.join(' + ') : (roles.includes('video') || roles.includes('edit') ? 'Видео' : 'Макет');
  let title = !topic ? `${noun} для ${project.name || 'проекта'}` : /^со?\s/iu.test(topic) ? `${noun} ${topic}` : `${noun}: ${topic}`;
  if (title.length > 72) title = title.slice(0, 70).replace(/\s+\S*$/, '') + '…';

  const description = content.length ? cap(content[0]).replace(/[.!]*$/, '.') : cap(clean).slice(0, 1200);
  const bullets = content.slice(1).map(x => cap(x)).filter(x => x.length > 2).slice(0, 7);

  const speech = SPEECH.test(low);
  const isVideo = formats.some(k => FORMATS[k].video) || (!formats.length && (roles.includes('video') || roles.includes('edit')));
  const ctaOwn = explicitCta(clean);
  const ctaBrand = brandCta(project);
  const cta = ctaOwn || ctaBrand || CTAS[cats.find(c => CTAS[c])] || '';
  const hook = HOOKS[cats[0]] || (isVideo ? 'Вопрос или неожиданный кадр в первые 2 секунды' : '');

  const parsed = {
    title: cap(title),
    projectId,
    platform,
    format,
    roles,
    assigneeIds: people.map(p => p.id),
    deadline: deadline ? deadline.toISOString() : null,
    publishDate: publishDate ? publishDate.toISOString() : null,
    priority,
    description: description.slice(0, 1200),
    bullets,
    checklist: buildChecklist({ roles, formats, format, platforms, low, cats, project, cta, speech }),
    refs: extractRefs(text),
    ideas: buildIdeas(cats, isVideo),
    missing: buildMissing({ topic, formats, format, deadline, publishDate, deadlineFromPublish, low, cats, roles, speech, ctaKnown: !!(ctaOwn || ctaBrand), platformGuessed, now: C.now }),
    hook,
    cta,
    source: opts.source || 'text',
    engine: 'built-in',
  };
  return parsed;
}

function detectPriority(low) {
  if (S('не\\s+срочн|не\\s+горит|без\\s+спешки|не к спеху|когда будет время|приоритет\\p{L}*\\s*[:\\-—]?\\s*(?:низк|3(?!\\d))|низк\\p{L}* приоритет|shoshilinch emas|shoshilmasdan').test(low)) return { level: 'low', explicit: true };
  if (S('срочн|горит|горящ|asap|как можно (?:скорее|быстрее)|приоритет\\p{L}*\\s*[:\\-—]?\\s*(?:высок|главн|максим|1(?!\\d))|высок\\p{L}* приоритет|очень важн|shoshilinch|zudlik|tezroq|tezda|juda muhim').test(low)) return { level: 'high', explicit: true };
  if (S('приоритет\\p{L}*\\s*[:\\-—]?\\s*(?:средн|обычн|2(?!\\d))|средн\\p{L}* приоритет').test(low)) return { level: 'med', explicit: true };
  return { level: 'med', explicit: false };
}

module.exports = { parse, esc, findDate, clock, normalize };
