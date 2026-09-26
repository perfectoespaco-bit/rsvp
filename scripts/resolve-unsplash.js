const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function fetchPage(urlStr) {
  const url = new URL(urlStr, 'https://unsplash.com');
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log('Redirecting to:', res.headers.location);
      return fetchPage(res.headers.location);
    }
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const matches = body.match(/https:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9_-]+/g);
      console.log('Found URLs:', Array.from(new Set(matches || [])).slice(0, 10));
    });
  }).on('error', console.error);
}

fetchPage('https://unsplash.com/pt-br/fotografias/um-homem-e-uma-mulher-sentados-em-um-cobertor-comendo-comida-1HAw4hBB_aI');
