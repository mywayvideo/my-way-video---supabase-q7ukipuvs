const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function getObject(sha) {
  const dir = sha.slice(0, 2);
  const file = sha.slice(2);
  const p = path.join('.git', 'objects', dir, file);
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p);
    const uncompressed = zlib.inflateSync(raw);
    const nullIdx = uncompressed.indexOf(0);
    const header = uncompressed.slice(0, nullIdx).toString('utf8');
    const content = uncompressed.slice(nullIdx + 1);
    const [type, size] = header.split(' ');
    return { type, size: parseInt(size, 10), content };
  }
  return null;
}

const tagSha = fs.readFileSync('.git/refs/tags/v0.0.643', 'utf8').trim();
console.log('tag v0.0.643 sha:', tagSha);
const commitObj = getObject(tagSha);
console.log('commit header:', commitObj ? commitObj.type : 'not found');
if (commitObj) {
  console.log('commit content preview:', commitObj.content.slice(0, 300).toString('utf8'));
}
