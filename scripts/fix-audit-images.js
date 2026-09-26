const fs = require('fs');

const auditData = JSON.parse(fs.readFileSync('broken_images_audit.json', 'utf8'));
const brokenUrls = new Set(auditData.broken.map(b => b.url));
let content = fs.readFileSync('src/lib/gift-templates.ts', 'utf8');

console.log(`Corrigindo ${brokenUrls.size} URLs quebradas em src/lib/gift-templates.ts...`);

// Mapeamento de substituição direta para as URLs quebradas mais comuns (Unsplash permanente de alta qualidade)
const UNSPLASH_COLLECTION = [
  'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=800&q=80',
  'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80',
  'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
  'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=800&q=80',
  'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=800&q=80',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
  'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=800&q=80',
  'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=800&q=80',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
  'https://images.unsplash.com/photo-1418985991508-e47386d96a71?w=800&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80',
  'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&q=80',
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80',
  'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&q=80',
  'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800&q=80',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
  'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?w=800&q=80',
  'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=800&q=80',
  'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&q=80',
  'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&q=80',
  'https://images.unsplash.com/photo-1544731612-de7f96afe55f?w=800&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
  'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&q=80',
  'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&q=80',
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80',
  'https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?w=800&q=80',
  'https://images.unsplash.com/photo-1594489428504-5c0c480a15fd?w=800&q=80',
  'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=80',
  'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80'
];

let index = 0;
let replacedCount = 0;

brokenUrls.forEach(url => {
  if (content.includes(url)) {
    const replacement = UNSPLASH_COLLECTION[index % UNSPLASH_COLLECTION.length];
    index++;
    content = content.replaceAll(url, replacement);
    replacedCount++;
  }
});

fs.writeFileSync('src/lib/gift-templates.ts', content);
console.log(`✨ Sucesso! ${replacedCount} URLs quebradas foram substituídas por imagens Unsplash permanentes.`);
