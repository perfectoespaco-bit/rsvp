const fs = require('fs');

const content = fs.readFileSync('src/lib/gift-templates.ts', 'utf8');

// Extrair todas as URLs de imagem (Unsplash, Pixabay, Googleusercontent, etc.)
const urlMatches = content.match(/https?:\/\/[^\s'"\`\)]+/g) || [];
const uniqueUrls = Array.from(new Set(urlMatches));

console.log(`🔍 Total de URLs de imagens encontradas: ${uniqueUrls.length}`);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function checkUrls() {
  const broken = [];
  const valid = [];
  
  for (let i = 0; i < uniqueUrls.length; i += 15) {
    const chunk = uniqueUrls.slice(i, i + 15);
    await Promise.all(chunk.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { 
          method: 'GET', 
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: controller.signal 
        });
        clearTimeout(timeout);
        if (res.ok) {
          valid.push(url);
        } else {
          broken.push({ url, status: res.status });
        }
      } catch (err) {
        broken.push({ url, status: err.message });
      }
    }));
    process.stdout.write(`\rProcessando: ${Math.min(i + 15, uniqueUrls.length)} / ${uniqueUrls.length}...`);
  }
  
  console.log(`\n\n✅ Válidas: ${valid.length}`);
  console.log(`❌ Quebradas ou inacessíveis: ${broken.length}`);
  
  fs.writeFileSync('broken_images_audit.json', JSON.stringify({ brokenCount: broken.length, broken }, null, 2));
}

checkUrls();
