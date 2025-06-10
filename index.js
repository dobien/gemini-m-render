const express = require('express');
const https = require('https');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Потоковая обработка тела запроса
app.use((req, res, next) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    req.body = chunks.length > 0 ? Buffer.concat(chunks) : null;
    next();
  });
});

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']
}));

// Обработка запросов
app.all('*', async (req, res) => {
  try {
    const targetUrl = `https://api.mistral.ai${req.originalUrl}`;
    console.log(`Proxying to: ${targetUrl}`);

    const options = {
      method: req.method,
      headers: { 
        ...req.headers,
        host: 'api.mistral.ai'
      }
    };

    // Очистка заголовков
    const disallowedHeaders = ['content-length', 'x-proxy-request', 'origin', 'referer', 'connection'];
    disallowedHeaders.forEach(h => delete options.headers[h]);

    const externalReq = https.request(targetUrl, options, (externalRes) => {
      console.log(`Response status: ${externalRes.statusCode}`);
      
      // Проверка перед отправкой заголовков
      if (!res.headersSent) {
        res.writeHead(externalRes.statusCode, externalRes.headers);
        externalRes.pipe(res);
      } else {
        console.warn('Headers already sent, skipping piping');
      }
    });

    externalReq.on('error', (err) => {
      console.error('Proxy connection error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: `Proxy failed: ${err.message}` });
      } else {
        res.destroy();
      }
    });

    // Передача тела
    if (req.body && req.body.length > 0) {
      externalReq.write(req.body);
    }
    externalReq.end();

  } catch (err) {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: `Server error: ${err.message}` });
    }
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
