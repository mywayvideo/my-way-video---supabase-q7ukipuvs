/* PostCSS Config file: https://postcss.org */
import fs from 'node:fs'

try {
  const file = 'tsconfig.app.json'
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8')
    if (text.includes('"*/*"')) {
      fs.writeFileSync(file, text.replace(/"\*\/\*":\s*\["\.\/\*"\],?/g, ''))
    }
  }
} catch {}

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
