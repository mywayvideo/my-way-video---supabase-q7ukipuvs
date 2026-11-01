/**
 * Parser nativo zero-dependency para arquivos XLSX e ZIP no navegador.
 *
 * Utiliza:
 * - DataView para leitura binária de cabeçalhos de arquivos ZIP (PKZip)
 * - Compression Streams API (DecompressionStream('deflate-raw')) para descompactar streams DEFLATE
 * - DOMParser para parsear XMLs do formato Open Packaging Conventions (xl/worksheets/sheet*.xml, xl/sharedStrings.xml)
 */

export interface ZipFileEntry {
  filename: string
  fileHeaderOffset: number
  compressedSize: number
  uncompressedSize: number
  compressionMethod: number
}

const EOCD_SIGNATURE = 0x06054b50
const CDFH_SIGNATURE = 0x02014b50
const LFH_SIGNATURE = 0x04034b50

const COMPRESSION_NONE = 0
const COMPRESSION_DEFLATE = 8

/**
 * Lê os cabeçalhos dos arquivos contidos no arquivo ZIP
 */
export function getZipEntries(buffer: ArrayBuffer): ZipFileEntry[] {
  const byteLength = buffer.byteLength
  if (byteLength < 22) {
    throw new Error('Arquivo muito pequeno para ser um ZIP/XLSX válido')
  }

  // Localiza End of Central Directory (EOCD) buscando de trás para frente
  let eocdOffset = -1
  const maxSearch = Math.min(byteLength - 22, 65557) // tamanho máx comentário = 65535 + 22
  const minOffset = byteLength - 22 - maxSearch

  for (let i = byteLength - 22; i >= Math.max(0, minOffset); i--) {
    const view = new DataView(buffer, i, 4)
    if (view.getUint32(0, true) === EOCD_SIGNATURE) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Assinatura de fim do diretório central (EOCD) não encontrada no arquivo')
  }

  const eocdView = new DataView(buffer, eocdOffset)
  const numRecords = eocdView.getUint16(10, true)
  const cdStart = eocdView.getUint32(16, true)

  const entries: ZipFileEntry[] = []
  let cdOffset = cdStart

  for (let r = 0; r < numRecords; r++) {
    if (cdOffset + 46 > byteLength) break
    const cdfh = new DataView(buffer, cdOffset)
    if (cdfh.getUint32(0, true) !== CDFH_SIGNATURE) {
      break
    }

    const compressionMethod = cdfh.getUint16(10, true)
    const compressedSize = cdfh.getUint32(20, true)
    const uncompressedSize = cdfh.getUint32(24, true)
    const filenameLen = cdfh.getUint16(28, true)
    const extraLen = cdfh.getUint16(30, true)
    const commentLen = cdfh.getUint16(32, true)
    const fileHeaderOffset = cdfh.getUint32(42, true)

    const nameBytes = new Uint8Array(buffer, cdOffset + 46, filenameLen)
    const filename = new TextDecoder('utf-8').decode(nameBytes)

    entries.push({
      filename,
      fileHeaderOffset,
      compressedSize,
      uncompressedSize,
      compressionMethod,
    })

    cdOffset += 46 + filenameLen + extraLen + commentLen
  }

  return entries
}

/**
 * Descompacta um arquivo individual do arquivo ZIP
 */
export async function extractZipEntry(
  buffer: ArrayBuffer,
  entry: ZipFileEntry,
): Promise<ArrayBuffer> {
  const lfh = new DataView(buffer, entry.fileHeaderOffset)
  if (lfh.getUint32(0, true) !== LFH_SIGNATURE) {
    throw new Error(`Assinatura de arquivo local inválida para ${entry.filename}`)
  }

  const compressionMethod = lfh.getUint16(8, true)
  const filenameLen = lfh.getUint16(26, true)
  const extraLen = lfh.getUint16(28, true)

  const dataStart = entry.fileHeaderOffset + 30 + filenameLen + extraLen
  const compressedData = buffer.slice(dataStart, dataStart + entry.compressedSize)

  if (compressionMethod === COMPRESSION_NONE) {
    return compressedData
  }

  if (compressionMethod === COMPRESSION_DEFLATE) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Navegador não suporta DecompressionStream para descompactar XLSX')
    }

    const stream = new Blob([compressedData])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
    return await new Response(stream).arrayBuffer()
  }

  throw new Error(`Método de compressão não suportado: ${compressionMethod}`)
}

/**
 * Extrai texto utf-8 de uma entrada do zip
 */
export async function readZipEntryText(buffer: ArrayBuffer, entry: ZipFileEntry): Promise<string> {
  const uncompressed = await extractZipEntry(buffer, entry)
  return new TextDecoder('utf-8').decode(uncompressed)
}

/**
 * Converte referência de coluna Excel (A, B, C, ..., AA, AB) para índice zero-based (0, 1, 2...)
 */
export function colLettersToIndex(colStr: string): number {
  let index = 0
  const upper = colStr.toUpperCase()
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64)
  }
  return index - 1
}

/**
 * Separa a referência de célula (ex: "D12") em { col: 3, row: 12 } (ambos índices ou linha base 1)
 */
export function parseCellRef(ref: string): { col: number; row: number } {
  const match = ref.match(/^([A-Za-z]+)(\d+)$/)
  if (!match) return { col: 0, row: 0 }
  return {
    col: colLettersToIndex(match[1]),
    row: parseInt(match[2], 10),
  }
}

export interface ParsedWorksheet {
  sheetName: string
  rows: (string | number | null)[][]
}

/**
 * Analisa e extrai linhas de uma planilha XLSX sem bibliotecas externas
 */
export async function parseXlsxWorkbook(buffer: ArrayBuffer): Promise<ParsedWorksheet[]> {
  const entries = getZipEntries(buffer)
  const entryMap = new Map<string, ZipFileEntry>()
  for (const e of entries) {
    entryMap.set(e.filename.toLowerCase(), e)
  }

  // 1. Ler Shared Strings se existir
  const sharedStrings: string[] = []
  const ssEntry = entryMap.get('xl/sharedstrings.xml')
  if (ssEntry) {
    const xmlText = await readZipEntryText(buffer, ssEntry)
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'application/xml')
    const siElements = doc.getElementsByTagName('si')

    for (let i = 0; i < siElements.length; i++) {
      const si = siElements[i]
      // Pode conter <t> direto ou múltiplos <r><t>...</t></r>
      const tElements = si.getElementsByTagName('t')
      let text = ''
      for (let j = 0; j < tElements.length; j++) {
        text += tElements[j].textContent || ''
      }
      sharedStrings.push(text)
    }
  }

  // 2. Descobrir nomes e caminhos das abas via workbook.xml e rels
  interface SheetInfo {
    name: string
    id: string
    rId: string
    target?: string
  }
  const sheets: SheetInfo[] = []
  const wbEntry = entryMap.get('xl/workbook.xml')
  if (wbEntry) {
    const wbXml = await readZipEntryText(buffer, wbEntry)
    const parser = new DOMParser()
    const doc = parser.parseFromString(wbXml, 'application/xml')
    const sheetEls = doc.getElementsByTagName('sheet')
    for (let i = 0; i < sheetEls.length; i++) {
      const s = sheetEls[i]
      const name = s.getAttribute('name') || `Sheet${i + 1}`
      const sheetId = s.getAttribute('sheetId') || `${i + 1}`
      const rId = s.getAttribute('r:id') || s.getAttribute('id') || `rId${i + 1}`
      sheets.push({ name, id: sheetId, rId })
    }
  }

  // Resolver rels para caminho de arquivo
  const wbRelsEntry = entryMap.get('xl/_rels/workbook.xml.rels')
  const relMap = new Map<string, string>()
  if (wbRelsEntry) {
    const relsXml = await readZipEntryText(buffer, wbRelsEntry)
    const parser = new DOMParser()
    const doc = parser.parseFromString(relsXml, 'application/xml')
    const relEls = doc.getElementsByTagName('Relationship')
    for (let i = 0; i < relEls.length; i++) {
      const r = relEls[i]
      const id = r.getAttribute('Id') || ''
      const target = r.getAttribute('Target') || ''
      if (id && target) {
        relMap.set(id, target.replace(/^\//, ''))
      }
    }
  }

  // Se não achou em workbook.xml, busca arquivos worksheets diretamente
  if (sheets.length === 0) {
    for (const [fn] of entryMap.entries()) {
      if (fn.startsWith('xl/worksheets/sheet') && fn.endsWith('.xml')) {
        const baseName = fn.split('/').pop()?.replace('.xml', '') || 'Sheet'
        sheets.push({ name: baseName, id: '1', rId: 'rId1', target: fn })
      }
    }
  } else {
    for (const s of sheets) {
      let target = relMap.get(s.rId)
      if (target) {
        if (!target.startsWith('xl/')) {
          target = `xl/${target}`
        }
        s.target = target
      }
    }
  }

  const result: ParsedWorksheet[] = []

  for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
    const s = sheets[sIdx]
    let path = (s.target || `xl/worksheets/sheet${sIdx + 1}.xml`).toLowerCase()
    let sheetEntry = entryMap.get(path)
    if (!sheetEntry) {
      // Tenta achar qualquer entrada que case
      for (const [key, val] of entryMap.entries()) {
        if (key.endsWith(path.split('/').pop() || '')) {
          sheetEntry = val
          break
        }
      }
    }

    if (!sheetEntry) continue

    const sheetXml = await readZipEntryText(buffer, sheetEntry)
    const parser = new DOMParser()
    const doc = parser.parseFromString(sheetXml, 'application/xml')

    const rowEls = doc.getElementsByTagName('row')
    const maxRows = rowEls.length
    const rows: (string | number | null)[][] = []

    for (let rIdx = 0; rIdx < maxRows; rIdx++) {
      const rowEl = rowEls[rIdx]
      const rowNumAttr = rowEl.getAttribute('r')
      const targetRowIndex = rowNumAttr ? parseInt(rowNumAttr, 10) - 1 : rIdx

      // Garantir tamanho do array de linhas
      while (rows.length <= targetRowIndex) {
        rows.push([])
      }

      const currentRow = rows[targetRowIndex]
      const cellEls = rowEl.getElementsByTagName('c')

      for (let cIdx = 0; cIdx < cellEls.length; cIdx++) {
        const c = cellEls[cIdx]
        const cellRef = c.getAttribute('r')
        const cellType = c.getAttribute('t')

        let colIndex = cIdx
        if (cellRef) {
          const parsed = parseCellRef(cellRef)
          colIndex = parsed.col
        }

        // Valor textual
        const vEl = c.getElementsByTagName('v')[0]
        const isInlineStr = cellType === 'inlineStr'
        let rawVal = vEl?.textContent || ''

        if (isInlineStr) {
          const tEl = c.getElementsByTagName('t')[0]
          rawVal = tEl?.textContent || ''
        }

        let cellValue: string | number | null = null

        if (cellType === 's') {
          // Shared string index
          const ssIndex = parseInt(rawVal, 10)
          cellValue =
            !isNaN(ssIndex) && ssIndex >= 0 && ssIndex < sharedStrings.length
              ? sharedStrings[ssIndex]
              : rawVal
        } else if (cellType === 'b') {
          cellValue = rawVal === '1' ? 'TRUE' : 'FALSE'
        } else if (cellType === 'str' || cellType === 'inlineStr') {
          cellValue = rawVal
        } else {
          // Número ou vazio
          if (rawVal.trim() !== '') {
            const num = parseFloat(rawVal)
            cellValue = !isNaN(num) ? num : rawVal
          } else {
            cellValue = null
          }
        }

        while (currentRow.length <= colIndex) {
          currentRow.push(null)
        }
        currentRow[colIndex] = cellValue
      }
    }

    result.push({
      sheetName: s.name,
      rows,
    })
  }

  return result
}
