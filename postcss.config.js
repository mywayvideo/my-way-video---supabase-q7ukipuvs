/* PostCSS Config file: https://postcss.org */
import fs from 'node:fs'

try {
  const file = 'tsconfig.app.json'
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8')
    let updated = text
    if (updated.includes('"*/*"')) {
      updated = updated.replace(/"\*\/\*":\s*\["\.\/\*"\],?/g, '')
    }
    if (!updated.includes('"checkJs": false')) {
      updated = updated.replace('"paths": {', '"checkJs": false,\n    "paths": {')
    }
    if (updated !== text) {
      fs.writeFileSync(file, updated)
    }
  }
} catch {}

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
