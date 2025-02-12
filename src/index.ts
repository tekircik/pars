import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import axios from 'axios';
import { load } from 'cheerio';

interface Results {
  title: string;
  description: string;
  displayUrl: string;
  url: string;
  source: string;
}

import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200
});

const app = express();


app.use(cors());
app.use(bodyParser.json());

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

      const description = desc.replace(/(\r\n|\n|\r)/gm, '');
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
      case 'duck':
        results = await getDuck(query);
        break;
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
  console.log('Server running!');
});
