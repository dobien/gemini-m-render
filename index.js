const express = require('express');
const https = require('https');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Middleware для обработки raw body
app.use(bodyParser.raw({ type: '*/*' }));

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']
}));

app.all('*', async (req, res) => {
  try {
    const targetPath = req.originalUrl;
    const targetUrl = `https://generativelanguage.googleapis.com${targetPath}`;
    
    console.log(`Proxying to: ${targetUrl}`);

    const options = {
      method: req.method,
      headers: {
        ...req.headers,
        host: 'generativelanguage.googleapis.com',
        'x-proxy-request': 'true' // Удаляем в конечном запросе
      }
    };

    // Удаляем ненужные заголовки
    delete options.headers['content-length'];
    delete options.headers['x-proxy-request'];
    delete options.headers['origin'];
    delete options.headers['referer'];

    const externalReq = https.request(targetUrl, options, (externalRes) => {
      console.log(`Response status: ${externalRes.statusCode}`);
      
      // Передаем заголовки ответа
      res.writeHead(
        externalRes.statusCode, 
        externalRes.statusMessage,
        externalRes.headers
      );
      
      // Потоковая передача данных
      externalRes.pipe(res);
    });

    externalReq.on('error', (err) => {
      console.error('Proxy error:', err);
      res.status(500).json({ error: err.message });
    });

    // Передаем тело запроса как есть
    if (req.body) {
      externalReq.write(req.body);
    }
    
    externalReq.end();

  } catch (err) {
    console.error('General error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
