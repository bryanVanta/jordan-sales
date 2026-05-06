export const runtime = 'nodejs';

import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

type NewsArticle = {
  title?: string;
  description?: string;
  url?: string;
  source?: { name?: string };
  publishedAt?: string;
};

const CACHE_DIR = path.join(process.cwd(), '.next', 'cache', 'news-insights');

const getMalaysiaDayKey = (date = new Date()) => {
  const malaysiaMs = date.getTime() + 8 * 60 * 60 * 1000;
  return new Date(malaysiaMs).toISOString().slice(0, 10);
};

const getCachePath = (industry: string, country: string) => {
  const key = createHash('sha1').update(`${industry.toLowerCase()}::${country.toLowerCase()}`).digest('hex');
  return path.join(CACHE_DIR, `${key}.json`);
};

const readCachedInsight = async (industry: string, country: string) => {
  try {
    const raw = await readFile(getCachePath(industry, country), 'utf8');
    const cached = JSON.parse(raw);
    if (cached?.dayKey === getMalaysiaDayKey()) return cached.payload;
    return null;
  } catch {
    return null;
  }
};

const writeCachedInsight = async (industry: string, country: string, payload: any) => {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    getCachePath(industry, country),
    JSON.stringify({ dayKey: getMalaysiaDayKey(), cachedAt: new Date().toISOString(), payload }),
    'utf8'
  );
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const industry = String(url.searchParams.get('industry') || 'business').trim().slice(0, 80);
    const country = String(url.searchParams.get('country') || url.searchParams.get('location') || '').trim().slice(0, 80);
    const apiKey = process.env.NEWS_API_KEY;
    const cached = await readCachedInsight(industry, country);

    if (cached) {
      return Response.json({
        ...cached,
        cached: true,
      });
    }

    if (!apiKey) {
      const payload = {
        success: false,
        configured: false,
        industry,
        country,
        message: 'NEWS_API_KEY is not configured.',
      };
      await writeCachedInsight(industry, country, payload);
      return Response.json({ ...payload, cached: false });
    }

    const countryCodes: Record<string, string> = {
      malaysia: 'my',
      singapore: 'sg',
      indonesia: 'id',
      thailand: 'th',
      philippines: 'ph',
      'united states': 'us',
      'united kingdom': 'gb',
      australia: 'au',
    };
    const countryCode = countryCodes[country.toLowerCase()];
    const queryParts = [
      `"${industry}"`,
      country ? `"${country}"` : '',
      '(technology OR AI OR "artificial intelligence" OR automation OR software OR digital OR platform)',
    ].filter(Boolean);
    const query = queryParts.join(' AND ');
    const newsUrl = new URL('https://newsapi.org/v2/everything');
    newsUrl.searchParams.set('q', query);
    newsUrl.searchParams.set('language', 'en');
    newsUrl.searchParams.set('sortBy', 'publishedAt');
    newsUrl.searchParams.set('pageSize', '5');
    newsUrl.searchParams.set('apiKey', apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(newsUrl.toString(), { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    const json = await response.json().catch(() => null);

    if (!response.ok || json?.status !== 'ok') {
      const payload = {
        success: false,
        configured: true,
        industry,
        country,
        message: json?.message || `NewsAPI request failed (${response.status})`,
      };
      await writeCachedInsight(industry, country, payload);
      return Response.json({ ...payload, cached: false }, { status: response.ok ? 200 : response.status });
    }

    const industryTerms = industry.toLowerCase().split(/\s+/).filter(Boolean);
    const countryTerms = country.toLowerCase().split(/[,\s]+/).filter((term) => term.length >= 3);
    const techTerms = ['technology', 'tech', 'ai', 'artificial intelligence', 'automation', 'software', 'digital', 'platform', 'system', 'pms', 'saas', 'app', 'data'];
    const scoreArticle = (article: NewsArticle) => {
      const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
      const industryScore = industryTerms.some((term) => text.includes(term)) ? 2 : 0;
      const countryScore = countryTerms.some((term) => text.includes(term)) ? 2 : 0;
      const techScore = techTerms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
      return { total: industryScore + countryScore + techScore, industryScore, countryScore, techScore };
    };

    const scoredArticles: Array<{ article: NewsArticle; score: ReturnType<typeof scoreArticle> }> = (Array.isArray(json?.articles) ? json.articles : [])
      .filter((article: NewsArticle) => article?.title && article?.url)
      .map((article: NewsArticle) => ({ article, score: scoreArticle(article) }));

    const articles = scoredArticles
      .filter(({ score }) => score.techScore > 0 && (score.countryScore > 0 || score.industryScore > 0))
      .sort((a, b) => b.score.total - a.score.total)
      .map(({ article }) => article)
      .map((article: NewsArticle) => ({
        title: article.title,
        description: article.description || '',
        url: article.url,
        source: article.source?.name || 'News',
        publishedAt: article.publishedAt || '',
      }));

    const payload = {
      success: true,
      configured: true,
      industry,
      country,
      countryCode,
      article: articles[0] || null,
      articles,
    };
    await writeCachedInsight(industry, country, payload);
    return Response.json({ ...payload, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, message }, { status: 500 });
  }
}
