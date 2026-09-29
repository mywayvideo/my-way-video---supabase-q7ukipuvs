const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

function getObject(sha) {
  const dir = sha.slice(0, 2)
  const file = sha.slice(2)
  const p = path.join('.git', 'objects', dir, file)
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p)
    const uncompressed = zlib.inflateSync(raw)
    const nullIdx = uncompressed.indexOf(0)
    const header = uncompressed.slice(0, nullIdx).toString('utf8')
    const content = uncompressed.slice(nullIdx + 1)
    const [type, size] = header.split(' ')
    return { type, size: parseInt(size, 10), content }
  }
  return null
}

function listDir(p) {
  if (fs.existsSync(p)) {
    return fs.readdirSync(p)
  }
  return []
}
console.log('git dir exists:', fs.existsSync('.git'))
if (fs.existsSync('.git')) {
  console.log('.git contents:', listDir('.git'))
  console.log('.git/refs:', listDir('.git/refs'))
  console.log('.git/refs/tags:', listDir('.git/refs/tags'))
  if (fs.existsSync('.git/packed-refs')) {
    fs.writeFileSync('temp_packed_refs.txt', fs.readFileSync('.git/packed-refs', 'utf8'))
  } else {
    fs.writeFileSync('temp_packed_refs.txt', 'no packed-refs')
  }
}
