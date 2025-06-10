const express = require('express');
const https = require('https');
const cors = require('cors');
const bodyParser = require('body-parser'); // Убедитесь, что он установлен: npm install body-parser

const app = express();
// Используем переменную окружения PORT, если она задана, иначе 3000
const port = process.env.PORT || 3000;

// Middleware для обработки raw body для всех типов содержимого.
// Это гарантирует, что req.body будет буфером.
app.use(bodyParser.raw({ type: '*/*' }));

// CORS configuration
app.use(cors({
  origin: '*', // Разрешить запросы с любого источника
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Разрешенные HTTP методы
  allowedHeaders: ['*'] // Разрешенные заголовки
}));

// Обработка всех входящих запросов
app.all('*', async (req, res) => {
  try {
    const targetPath = req.originalUrl;
    // Целевой URL для Mistral API.
    const targetUrl = `https://api.mistral.ai/v1${targetPath}`; 

    console.log(`Proxying to: ${targetUrl}`);

    const options = {
      method: req.method,
      headers: {
        ...req.headers, // Копируем ВСЕ заголовки из входящего запроса
        host: 'api.mistral.ai', // ОБЯЗАТЕЛЬНО переопределяем заголовок Host для Mistral API
        // Заголовок 'Authorization' будет автоматически передан из req.headers,
        // если клиент его предоставил.
      }
    };

    // Удаляем ненужные или потенциально проблемные заголовки перед отправкой запроса к Mistral API
    // (Content-Length будет пересчитан автоматически https.request)
    delete options.headers['content-length']; 
    // Удаляем наш кастомный заголовок, который не нужен внешнему API (если был)
    delete options.headers['x-proxy-request']; 
    // Обычно не требуются при проксировании и могут быть удалены
    delete options.headers['origin']; 
    delete options.headers['referer']; 
    // Некоторые проксирующие серверы могут иметь проблемы с 'connection' заголовком
    delete options.headers['connection']; 

    const externalReq = https.request(targetUrl, options, (externalRes) => {
      console.log(`Response status: ${externalRes.statusCode}`);

      // Передаем заголовки ответа, статус код и статус сообщение
      // Используем res.writeHead для потоковой передачи
      res.writeHead(
        externalRes.statusCode, 
        externalRes.headers
      );

      // Потоковая передача данных от внешнего API к клиенту
      externalRes.pipe(res);
    });

    externalReq.on('error', (err) => {
      console.error('Proxy error:', err);
      // Проверяем, были ли заголовки уже отправлены, чтобы избежать ERR_HTTP_HEADERS_SENT
      if (!res.headersSent) {
        res.status(500).json({ error: `Proxy error: ${err.message}` });
      } else {
        console.error('Headers already sent, cannot send error response for proxy error.');
      }
    });

    // Передаем тело запроса как есть
    // Проверяем, что req.body существует и является буфером/строкой, и имеет ненулевую длину
    if (req.body && (typeof req.body === 'string' || Buffer.isBuffer(req.body)) && req.body.length > 0) {
      externalReq.write(req.body);
    }
    externalReq.end(); // Завершаем запрос к внешнему API
  } catch (err) {
    console.error('General error:', err);
    // Проверяем, были ли заголовки уже отправлены, чтобы избежать ERR_HTTP_HEADERS_SENT
    if (!res.headersSent) {
      res.status(500).json({ error: `General error: ${err.message}` });
    } else {
      console.error('Headers already sent, cannot send error response for general error.');
    }
  }
});

// Запускаем прокси-сервер
app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
