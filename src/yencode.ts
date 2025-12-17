// taken from node-yencode, but modified slightly
import y from './y.cjs'

interface YencData {
  yencStart: number
  dataStart: number
  dataEnd: number
  yencEnd: number
  props: {
    begin: {
      part: string
      total: string
      line: string
      size: string
      name: string
    }
    part: {
      begin: string
      end: string
    }
    end: {
      size: string
      part: string
      pcrc32: string
    }
  } | null
  data: Buffer
  crc32: Buffer
  warnings: Array<{
    code: string
    message: string
  }>
}

const RE_YPROP = /([a-z_][a-z_0-9]*)=/

const decode = y.decode ?? function (data: Buffer, stripDots: boolean) {
  const buffer = Buffer.allocUnsafe(data.length)
  const length = y.decodeTo(data, buffer, stripDots)
  return buffer.subarray(0, length)
}

const decoderParseLines = function (lines: string[], ydata: YencData['props']) {
  for (let i = 0; i < lines.length; i++) {
    const yprops: Record<string, string> = {}

    let line = lines[i].substring(2) // cut off '=y'
    // parse tag
    let p = line.indexOf(' ')
    const tag = (p < 0 ? line : line.substring(0, p))
    line = line.substring(tag.length + 1).trim()

    // parse props
    let m = line.match(RE_YPROP)
    while (m) {
      const prop = m[1]
      let val: string
      const valPos = (m.index ?? 0) + m[0].length
      if (tag === 'begin' && prop === 'name') {
        // special treatment of filename - the value is the rest of the line (can include spaces)
        val = line.substring(valPos)
        line = ''
      } else {
        p = line.indexOf(' ', valPos)
        val = (p < 0 ? line.substring(valPos) : line.substring(valPos, p))
        line = line.substring(valPos + val.length + 1)
      }
      yprops[prop] = val
      m = line.match(RE_YPROP)
    }
    // @ts-expect-error idfk
    ydata[tag] = yprops
  }
}

export function fromPost (data: Buffer, props = true) {
  if (!Buffer.isBuffer(data)) throw new TypeError('Expected string or Buffer')

  const ret = {} as unknown as YencData

  // find '=ybegin' to know where the yEnc data starts
  let yencStart
  if (data.subarray(0, 8).toString('hex') === '3d79626567696e20' /* =ybegin */) {
    // common case: starts right at the beginning
    yencStart = 0
  } else {
    // otherwise, we have to search for the beginning marker
    yencStart = data.indexOf('\r\n=ybegin ')
    if (yencStart < 0) throw new Error('yEnc start marker not found')
    yencStart += 2
  }
  ret.yencStart = yencStart

  // find all start lines
  const lines: string[] = []
  let sp = yencStart
  let p = data.indexOf('\r\n', yencStart + 8)
  while (p > 0) {
    const line = data.subarray(sp, p).toString('utf8').trim()
    lines.push(line)
    sp = p + 2
    if (line.substring(0, 6) === '=yend ') { // no data in post
      ret.yencEnd = sp
      break
    }

    if (data[sp] !== 0x3d /* = */ || data[sp + 1] !== 0x79 /* y */) {
      ret.dataStart = sp
      break
    }
    p = data.indexOf('\r\n', sp)
  }
  // reached end of data but '=yend' not found
  if (!ret.dataStart && !ret.yencEnd) throw new Error('yEnd end marker not found')

  const ydata = {} as unknown as YencData['props']
  if (props) decoderParseLines(lines, ydata)

  if (!ret.yencEnd) {
    let yencEnd = data.subarray(ret.dataStart).lastIndexOf('\r\n=yend ', -1)
    if (yencEnd < 0) throw new Error('yEnd end marker not found')

    yencEnd += ret.dataStart
    ret.dataEnd = yencEnd
    p = data.indexOf('\r\n', yencEnd + 8)
    if (p < 0) {
      p = data.length
      ret.yencEnd = p
    } else { ret.yencEnd = p + 2 }
    if (props) {
      const endLine = data.subarray(yencEnd + 2, p).toString('utf8').trim()

      decoderParseLines([endLine], ydata)
    }
  }
  if (props) {
    ret.props = ydata!
    // check properties
    // required properties, according to yEnc 1.2 spec
    if (!ydata!.begin.line || !ydata!.begin.size || !('name' in ydata!.begin)) throw new Error('Could not find line/size/name properties on ybegin line')
    if (!ydata!.end.size) throw new Error('Could not find size properties on yend line')
  }

  if (ret.dataStart) {
    ret.data = decode(data.subarray(ret.dataStart, ret.dataEnd), false)
  }

  return ret
}
