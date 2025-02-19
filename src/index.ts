import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import axios from 'axios';
import { load } from 'cheerio';
import iconv from 'iconv-lite';

interface Results {
  title: string;
  description: string;
  displayUrl: string;
  url: string;
  source: string;
}

interface CacheEntry {
  data: Results[];
  expire: number;
}

const cache: { [key: string]: CacheEntry } = {};

import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200
});

const app = express();


app.use(cors());
app.use(bodyParser.json());

async function getBrave(q: string): Promise<Results[]> {
  const results: Results[] = [];
  try {
    // Request Brave Search API and assume a JSON response with a "results" array
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search?q=' + q, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY || ''
      }
    });
    if (true) {
      response.data.web.results.forEach((item: any) => {

        const result: Results = {
          title: item.title || '',
          description: (item.description || '').replace(/<[^>]+>/g, ''), // removed possible HTML tags
          displayUrl: (item.url || '').replace(/^https?:\/\//, ''),
          url: item.url || '',
          source: 'Brave'
        };
        results.push(result);
      });
    }
  } catch (error) {
    console.error('Error fetching Brave search data:', error);
  }
  return results;
}

async function getDuck(q: string): Promise<Results[]> {
  const results: Results[] = [];

  try {
    const response = await axios.get('https://html.duckduckgo.com/html?q=' + q, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
      }
    });
    const html = response.data;

    const $ = load(html);
    if ($('.result--no-result').length > 0) {
      return results;
    }
  
    $('.results_links_deep').each((_, productHTMLElement) => {
      const title: string = $(productHTMLElement)
        .find('.result__title a')
        .text() as string;
      let displayUrl: string = $(productHTMLElement)
        .find('.result__url')
        .text() as string;
      const desc: string = $(productHTMLElement)
        .find('.result__snippet')
        .text()
        .trim() as string;

      displayUrl = displayUrl.replace(/\s/g, '');

      const urlnospace = displayUrl.replace(/ /g, '');
      let url = urlnospace.replace(/\u203a/g, '/');

      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }

      if (url.includes('...') || displayUrl.includes('...')) {
        url = url.substring(0, url.indexOf('...'));
        displayUrl = displayUrl.substring(0, displayUrl.indexOf('...'));
      }

      if (!url.endsWith('/')) {
        url += '/';
      }

      const description = desc.replace(/<[^>]+>/g, '').replace(/(\r\n|\n|\r)/gm, ''); // removed HTML tags and line breaks
      if (title === '' || displayUrl === '' || url === '') {
      }

      const result: Results = {
        title: title,
        description: description,
        displayUrl: displayUrl,
        url: url,
        source: 'DuckDuckGo'
      };
      results.push(result);
    });
  } catch (error) {
    console.error('Error fetching data:', error);
  }

  return results;
}

async function getGoogle(q, n): Promise<Results[]> {
  const results: Results[] = [];

  const response = await axios.get("https://www.google.com/search?q=" + q + "&start=" + n , {
      responseType: 'arraybuffer'
  });
  const html = iconv.decode(Buffer.from(response.data), 'ISO-8859-1');

  const $ = load(html);

  $("div.Gx5Zad.xpd.EtOod.pkphOe").each((div, productHTMLElement) => {
      const title: string = $(productHTMLElement).find("div.BNeawe.vvjwJb.AP7Wnd").text() as string;
      const displayUrl: string = $(productHTMLElement).find("div.BNeawe.UPmit.AP7Wnd.lRVwie").text() as string;
      const trackerurl: string = $(productHTMLElement).find("div.egMi0.kCrYT a").attr("href") as string;
      const description: string = $(productHTMLElement).find("div.BNeawe.s3v9rd.AP7Wnd").text() as string;

      const prefix = '/url?q=';
      const suffix = '&sa=';
      let url;
      if (trackerurl) {
          if (trackerurl.startsWith(prefix)) {
              const startIndex = prefix.length;
              const endIndex = trackerurl.indexOf(suffix);

              if (endIndex !== -1) {
                  url = trackerurl.substring(startIndex, endIndex);
              } else {
                  url = trackerurl.substring(startIndex);
              }
          } else {
              url = trackerurl;
          }
      }

      const result: Results = {
          title: title,
          description: description,
          displayUrl: displayUrl,
          url: url,
          source: "Google"
      };
      results.push(result);
  });
  return results;
}

app.get('/', (req, res) => {
  return res.status(200).send({ response: 'Tekir search API active!' });
});

app.get('/api', async (req, res) => {
  try {
    const query = req.query.q as string;
    const querysource = req.query.source as string;
    const source = querysource.toLowerCase();

    let results: Results[] = [];

    switch (source) {
      case 'duck': {
        const cacheKey = `duck_${query}`;
        const now = Date.now();
        if (cache[cacheKey] && cache[cacheKey].expire > now) {
          results = cache[cacheKey].data;
        } else {
          results = await getDuck(query);
          cache[cacheKey] = { data: results, expire: now + 30 * 60 * 1000 };
        }
        break;
      }
      case 'brave': {
        const cacheKey = `brave_${query}`;
        const now = Date.now();
        if (cache[cacheKey] && cache[cacheKey].expire > now) {
          results = cache[cacheKey].data;
        } else {
          results = await getBrave(query);
          cache[cacheKey] = { data: results, expire: now + 30 * 60 * 1000 };
        }
        break;
      }
      case 'google': {
        const cacheKey = `google_${query}`;
        const now = Date.now();
        if (cache[cacheKey] && cache[cacheKey].expire > now) {
          results = cache[cacheKey].data;
        } else {
          results = await getGoogle(query, 0);
          cache[cacheKey] = { data: results, expire: now + 30 * 60 * 1000 };
        }
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid source' });
    }

    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    return res.status(200).json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log('✅ Tekir search API started!');
});