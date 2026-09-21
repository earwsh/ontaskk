import 'dotenv/config';
import { PrismaClient } from '../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://earwsh@localhost:5432/ontask';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// User IDs
const USER_MAHYAR = 47;
const USER_TARANEH = 45;
const USER_ADMIN = 43;

// Project IDs
const PROJECT_MAP: Record<string, number> = {
  'نجما توکلیان': 63,
  'کنزا کانستراکشن': 66,
  'معمارخانه شین': 51,
  'زاگرس مکانیک': 58,
  'بیستست': 67,
  'شین بیوتی': 50,
  'فاطمی': 53,
  'دکتر میراسماعیلی': 60,
  'دکتر واثقی': 61,
  'پی ار پی ایران': 56,
  'دکتر ابوعلی': 52,
  'دکتر حاتم': 62,
  'دکتر پارسی پور': 59,
  'تیم داخلی وبسایت': 95,
};

const ARTICLE_SUBTASKS = [
  'تحقیق کلمات کلیدی، تعیین زاویه دید و استخراج موجودیت‌ها (Entities)',
  'تدوین ساختار مقاله و رعایت سلسله‌مراتب هدینگ‌ها (H2/H3)',
  'نگارش متن کامل تخصصی و رعایت لحن برند',
  'بهینه‌سازی سئو داخلی (On-Page)، تایتل و متا دسکریپشن جذاب',
  'تصویرسازی شاخص، بهینه‌سازی حجم و درج متن جایگزین (Alt)',
  'بارگذاری، انتشار نهایی و اجرای لینک‌سازی داخلی',
];

const ARTICLE_DESC =
  'تألیف محتوای یونیک، رعایت اصول سئو داخلی (On-Page)، ساختار هدینگ‌ها (H2/H3)، تصویرسازی شاخص با متن جایگزین (Alt)، لینک‌سازی داخلی و انتشار روی وبسایت';

const UPDATE_SUBTASKS = [
  'بررسی صفحات پرایمپرشن و کم‌کلیک در سرچ کنسول',
  'بازنویسی و افزودن پاراگراف‌های جدید، آمار به‌روز و بخش سوالات متداول (FAQ)',
  'جذاب‌سازی عنوان (CTR Booster) و اصلاح متادسکریپشن',
  'بازسازی لینک‌های داخلی ورودی/خروجی و حذف لینک‌های شکسته',
  'درخواست ایندکس مجدد در سرچ کنسول گوگل',
];

const TRAINING_SUBTASKS = [
  'مطالعه منابع مرجع و مستندات سئو پیرامون مبحث روز',
  'بررسی و آنالیز میدانی روی وبسایت‌های هدف مجموعه',
  'ارائه خروجی مدون و راهکار اجرایی جهت پیاده‌سازی',
];

const REPORT_SUBTASKS = [
  'استخراج داده‌های سرچ‌کنسول (Clicks, Impressions, CTR, Average Position)',
  'بررسی وضعیت ایندکس مقالات جدید مهرماه و خطاهای احتمالی',
  'تحلیل تغییرات رتبه کلمات کلیدی هدف',
  'تدوین جمع‌بندی تحلیلی و پیشنهادهای بهبود برای آبان‌ماه',
];

const MEHR_DATES: Record<number, string> = {
  1: '2026-09-23',
  2: '2026-09-24',
  4: '2026-09-26',
  5: '2026-09-27',
  6: '2026-09-28',
  7: '2026-09-29',
  8: '2026-09-30',
  9: '2026-10-01',
  11: '2026-10-03',
  12: '2026-10-04',
  13: '2026-10-05',
  14: '2026-10-06',
  15: '2026-10-07',
  16: '2026-10-08',
  18: '2026-10-10',
  19: '2026-10-11',
  20: '2026-10-12',
  21: '2026-10-13',
  22: '2026-10-14',
  23: '2026-10-15',
  25: '2026-10-17',
  26: '2026-10-18',
  27: '2026-10-19',
  28: '2026-10-20',
  29: '2026-10-21',
  30: '2026-10-22',
};

const DAILY_UPDATES: Record<number, Array<{ user: number; site: string; title: string; desc: string }>> = {
  1: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  2: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  4: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  5: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  6: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  7: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  8: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  9: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  11: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  12: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  13: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  14: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  15: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  16: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  18: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  19: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  20: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  21: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  22: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  23: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  25: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  26: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  27: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  28: [
    { user: USER_MAHYAR, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'فاطمی', title: 'آپدیت و بازنویسی مقالات قدیمی فاطمی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  29: [
    { user: USER_MAHYAR, site: 'نجما توکلیان', title: 'آپدیت و بازنویسی مقالات قدیمی نجما', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'پی ار پی ایران', title: 'آپدیت و بازنویسی مقالات قدیمی پی ار پی ایران', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ],
  30: [
    { user: USER_MAHYAR, site: 'بیستست', title: 'آپدیت و بازنویسی مقالات قدیمی بیستست', desc: 'به‌روزرسانی محتوا، افزودن FAQ، بهبود تایتل/CTR و اصلاح لینک‌سازی داخلی' },
    { user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'آپدیت و بازنویسی مقالات قدیمی دکتر ابوعلی', desc: 'به‌روزرسانی اطلاعات، بهبود ساختار هدینگ‌ها، اصلاح اسکیما و رفع ایرادات محتوایی' }
  ]
};

const DAILY_TRAINING_TOPICS: Record<number, string> = {
  1: 'تحلیل الگوریتم‌های جدید گوگل و استانداردهای کیفی محتوا (E-E-A-T)',
  2: 'مهندسی معکوس رقبای برتر در حوزه پزشکی و خدمات درمانی',
  4: 'بررسی و بهبود ساختار خوشه‌های محتوایی (Topic Clusters & Pillar Pages)',
  5: 'تکنیک‌های افزایش نرخ کلیک (CTR Booster) با عناوین ترغیب‌کننده و متادسکریپشن',
  6: 'سئو معنایی (Semantic SEO) و استخراج موجودیت‌ها (Entities) مرتبط',
  7: 'بهینه‌سازی تصاویر، سرعت لود و شاخص‌های Core Web Vitals',
  8: 'تحلیل فرصت‌های کیوردهای دم‌دراز (Long-tail Keywords) برای رشد سریع',
  9: 'استراتژی رفع همنوع‌خواری کلمات کلیدی (Keyword Cannibalization)',
  11: 'به‌کارگیری اسکیماهای پیشرفته (MedicalWebPage, FAQPage, Organization)',
  12: 'اصلاح و بازسازی لینک‌سازی داخلی سایت‌ها و رفع صفحات یتیم (Orphan Pages)',
  13: 'سئو محلی (Local SEO) و استراتژی Google Business Profile برای پزشکان',
  14: 'تکنیک‌های نگارش محتوای انگلیسی بین‌المللی برای سایت‌های نجما و کنزا',
  15: 'تحلیل گزارش‌های Search Console و کشف کوئری‌های از دست رفته (Lost Impressions)',
  16: 'استراتژی مدیکال توریسم و جذب بیماران خارجی برای سایت دکتر میراسماعیلی',
  18: 'تحلیل رفتار کاربر (User Intent) و تطبیق ساختار صفحات لندینگ',
  19: 'تکنیک‌های بهینه‌سازی برای جستجوی صوتی (Voice Search) و هوش مصنوعی',
  20: 'ارائه راهبرد بهبود تجربه کاربری و افزایش نرخ تماس/لید (CRO)',
  21: 'بررسی استانداردهای سئو تکنیکال (Robots.txt, Canonical, Sitemap)',
  22: 'استراتژی محتوای ویدیویی و سئو ویدیو برای خدمات زیبایی و جراحی',
  23: 'تحلیل بک‌لینک‌های رقبا و تدوین راهبرد رپورتاژ آگهی برای ماه‌های بعد',
  25: 'پایش رتبه‌ها و تارگت‌گذاری صفحات هدف برای جهش به رتبه‌های ۱ تا ۳ گوگل',
  26: 'تدوین تقویم محتوایی پیشنهادی برای ماه آبان ۱۴۰۵',
  27: 'جمع‌بندی دستاوردهای آموزش و فرموله‌کردن راهبردهای قطعی رشد سایت‌ها',
};

const SITE_REPORTS = [
  { day: 28, user: USER_MAHYAR, site: 'نجما توکلیان', title: 'تدوین گزارش اختصاصی ماهانه وبسایت نجما توکلیان (دوزبانه)', desc: 'استخراج آمار سرچ‌کنسول، بررسی ۱۲ مقاله منتشرشده، رتبه‌بندی کیوردها و گزارش عملکرد' },
  { day: 29, user: USER_MAHYAR, site: 'کنزا کانستراکشن', title: 'تدوین گزارش اختصاصی ماهانه کنزا کانستراکشن', desc: 'استخراج آمار سئو بین‌الملل، ۶ مقاله انگلیسی و رتبه کلمات مهندسی' },
  { day: 29, user: USER_MAHYAR, site: 'معمارخانه شین', title: 'تدوین گزارش اختصاصی ماهانه معمارخانه شین', desc: 'بررسی ۶ مقاله معماری، ایمپرشن و ورودی گوگل در حوزه دکوراسیون' },
  { day: 29, user: USER_MAHYAR, site: 'زاگرس مکانیک', title: 'تدوین گزارش اختصاصی ماهانه زاگرس مکانیک', desc: 'بررسی عملکرد ۶ مقاله فنی و مهندسی، وضعیت ایندکس و کلیک‌ها' },
  { day: 29, user: USER_TARANEH, site: 'دکتر میراسماعیلی', title: 'تدوین گزارش اختصاصی ماهانه دکتر میراسماعیلی (دوزبانه)', desc: 'استخراج آمار ۱۲ مقاله، کلمات مدیکال توریسم و مقالات درمانی' },
  { day: 29, user: USER_TARANEH, site: 'دکتر واثقی', title: 'تدوین گزارش اختصاصی ماهانه دکتر واثقی', desc: 'بررسی ۶ مقاله پزشکی، ورودی ارگانیک و رفع خطاهای سرچ‌کنسول' },
  { day: 29, user: USER_TARANEH, site: 'پی ار پی ایران', title: 'تدوین گزارش اختصاصی ماهانه پی ار پی ایران', desc: 'گزارش ۶ مقاله جدید + ۸ مقاله آپدیت‌شده پروتکل‌های درمانی PRP' },
  { day: 30, user: USER_MAHYAR, site: 'بیستست', title: 'تدوین گزارش اختصاصی ماهانه بیستست', desc: 'تحلیل ۶ مقاله جدید + ۸ مقاله آپدیت، رتبه آزمون‌ها و حل کنبالیزیشن' },
  { day: 30, user: USER_MAHYAR, site: 'شین بیوتی', title: 'تدوین گزارش اختصاصی ماهانه شین بیوتی', desc: 'بررسی ۶ مقاله خدمات زیبایی، کلیک‌های سرچ کنسول و رشد کلمات' },
  { day: 30, user: USER_MAHYAR, site: 'فاطمی', title: 'تدوین گزارش اختصاصی ماهانه وبسایت فاطمی', desc: 'گزارش تجمیعی مقالات جدید و آپدیت‌های صنعتی، رفع صفحات یتیم' },
  { day: 30, user: USER_TARANEH, site: 'دکتر ابوعلی', title: 'تدوین گزارش اختصاصی ماهانه دکتر ابوعلی', desc: 'گزارش ۶ مقاله نو + ۸ آپدیت، ارتقای E-E-A-T و رفع ۴۰۴' },
  { day: 30, user: USER_TARANEH, site: 'دکتر حاتم', title: 'تدوین گزارش اختصاصی ماهانه دکتر حاتم', desc: 'بررسی عملکرد ۶ مقاله جدید و رتبه‌های سئو محلی پزشکی' },
  { day: 30, user: USER_TARANEH, site: 'دکتر پارسی پور', title: 'تدوین گزارش اختصاصی ماهانه دکتر پارسی پور', desc: 'بررسی ۶ مقاله تخصصی و رفتار کاربران در مقالات منتشرشده' },
];

async function main() {
  console.log('🚀 Starting SEO Tasks Sync Script...');

  // -------------------------------------------------------------
  // PART 1: Update Existing Article Tasks
  // -------------------------------------------------------------
  console.log('\n--- Part 1: Updating existing article tasks created today ---');
  const existingArticles = await prisma.task.findMany({
    where: {
      title: { contains: 'تالیف و انتشار مقاله' },
      createdAt: { gte: new Date('2026-09-17T00:00:00Z') },
    },
    select: { id: true, title: true, projectId: true },
  });

  console.log(`Found ${existingArticles.length} existing article tasks.`);
  let updatedCount = 0;
  let subtasksAdded = 0;

  for (const t of existingArticles) {
    // 1. Update task description, weight and estimatedMinutes
    await prisma.task.update({
      where: { id: t.id },
      data: {
        description: ARTICLE_DESC,
        estimatedMinutes: 60,
        weight: 60,
      },
    });
    updatedCount++;

    // 2. Check if subtasks already exist
    const existingSubtasks = await prisma.taskSubtask.count({
      where: { taskId: t.id },
    });

    if (existingSubtasks === 0) {
      await prisma.taskSubtask.createMany({
        data: ARTICLE_SUBTASKS.map((st, idx) => ({
          taskId: t.id,
          title: st,
          isDone: false,
          position: idx + 1,
        })),
      });
      subtasksAdded += ARTICLE_SUBTASKS.length;
    }
  }

  console.log(`✓ Updated ${updatedCount} article tasks with description and 60m weight.`);
  console.log(`✓ Added ${subtasksAdded} subtasks across article tasks.`);

  // -------------------------------------------------------------
  // PART 2: Create 90-min Site Updates (26 working days)
  // -------------------------------------------------------------
  console.log('\n--- Part 2: Creating 90-min daily site updates ---');
  let updatesCreated = 0;

  for (const [dayStr, updates] of Object.entries(DAILY_UPDATES)) {
    const day = parseInt(dayStr, 10);
    const dateStr = MEHR_DATES[day];
    if (!dateStr) continue;

    const deadline = new Date(`${dateStr}T20:00:00Z`);

    for (const up of updates) {
      const projectId = PROJECT_MAP[up.site];
      if (!projectId) {
        console.warn(`Project not found for site: ${up.site}`);
        continue;
      }

      // Check if task already exists
      const existing = await prisma.task.findFirst({
        where: {
          title: up.title,
          projectId,
          deadline,
        },
      });

      if (!existing) {
        const newTask = await prisma.task.create({
          data: {
            title: up.title,
            description: up.desc,
            projectId,
            createdById: USER_ADMIN,
            deadline,
            estimatedMinutes: 90,
            weight: 90,
            status: 'TODO',
            assignees: {
              create: {
                userId: up.user,
              },
            },
            subtasks: {
              create: UPDATE_SUBTASKS.map((st, idx) => ({
                title: st,
                isDone: false,
                position: idx + 1,
              })),
            },
          },
        });
        updatesCreated++;
      }
    }
  }
  console.log(`✓ Created ${updatesCreated} site update tasks (90 min each) with subtasks.`);

  // -------------------------------------------------------------
  // PART 3: Create 60-min Training & Strategy Tasks (Days 1 to 27)
  // -------------------------------------------------------------
  console.log('\n--- Part 3: Creating 60-min SEO training & strategy tasks ---');
  let trainingCreated = 0;
  const trainingProjectId = PROJECT_MAP['تیم داخلی وبسایت'] || 95;

  for (const [dayStr, topic] of Object.entries(DAILY_TRAINING_TOPICS)) {
    const day = parseInt(dayStr, 10);
    const dateStr = MEHR_DATES[day];
    if (!dateStr) continue;

    const deadline = new Date(`${dateStr}T20:00:00Z`);
    const title = `آموزش و ارائه راهبرد سئو: ${topic}`;
    const desc = 'مطالعه آپدیت‌های سئو، بنچ‌مارک رقبا و ارائه راهکارهای عملی برای رشد رتبه وبسایت‌ها';

    // Create 1 for Mahyar and 1 for Taraneh
    for (const userId of [USER_MAHYAR, USER_TARANEH]) {
      const existing = await prisma.task.findFirst({
        where: {
          title,
          projectId: trainingProjectId,
          deadline,
          assignees: {
            some: { userId },
          },
        },
      });

      if (!existing) {
        await prisma.task.create({
          data: {
            title,
            description: desc,
            projectId: trainingProjectId,
            createdById: USER_ADMIN,
            deadline,
            estimatedMinutes: 60,
            weight: 60,
            status: 'TODO',
            assignees: {
              create: {
                userId,
              },
            },
            subtasks: {
              create: TRAINING_SUBTASKS.map((st, idx) => ({
                title: st,
                isDone: false,
                position: idx + 1,
              })),
            },
          },
        });
        trainingCreated++;
      }
    }
  }
  console.log(`✓ Created ${trainingCreated} training tasks (60 min each) with subtasks.`);

  // -------------------------------------------------------------
  // PART 4: Create 13 Website Reports (Days 28, 29, 30)
  // -------------------------------------------------------------
  console.log('\n--- Part 4: Creating 13 website reports (90 min each, delivery 30 Mehr) ---');
  let reportsCreated = 0;

  for (const rep of SITE_REPORTS) {
    const dateStr = MEHR_DATES[rep.day];
    const projectId = PROJECT_MAP[rep.site];
    if (!projectId) {
      console.warn(`Project not found for site: ${rep.site}`);
      continue;
    }

    const deadline = new Date(`${MEHR_DATES[30]}T20:00:00Z`); // Delivery date: 30 Mehr 1405
    const startDate = new Date(`${dateStr}T08:00:00Z`); // Preparation starts on day 28/29/30

    const existing = await prisma.task.findFirst({
      where: {
        title: rep.title,
        projectId,
      },
    });

    if (!existing) {
      await prisma.task.create({
        data: {
          title: rep.title,
          description: rep.desc,
          projectId,
          createdById: USER_ADMIN,
          startDate,
          deadline,
          estimatedMinutes: 90,
          weight: 90,
          status: 'TODO',
          assignees: {
            create: {
              userId: rep.user,
            },
          },
          subtasks: {
            create: REPORT_SUBTASKS.map((st, idx) => ({
              title: st,
              isDone: false,
              position: idx + 1,
            })),
          },
        },
      });
      reportsCreated++;
    }
  }
  console.log(`✓ Created ${reportsCreated} website report tasks (90 min each) with subtasks.`);

  console.log('\n======================================================');
  console.log('🎉 ALL SEO TASKS SYNCED SUCCESSFULLY!');
  console.log(`- Updated article tasks: ${updatedCount}`);
  console.log(`- Added subtasks to article tasks: ${subtasksAdded}`);
  console.log(`- Created site updates (90 min): ${updatesCreated}`);
  console.log(`- Created training & strategy sessions (60 min): ${trainingCreated}`);
  console.log(`- Created website reports (90 min): ${reportsCreated}`);
  console.log('======================================================\n');
}

main()
  .catch((err) => {
    console.error('Error executing script:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
