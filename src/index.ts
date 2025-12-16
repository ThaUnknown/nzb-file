import mime from 'mime/lite'
import parse from 'nzb-parser'

import { Pool } from './pool.ts'
import { fromPost } from './yencode.ts'

import type { Segment } from 'nzb-parser/src/models.ts'

const textDecoder = new TextDecoder('ascii')

export class NNTPFile implements File {
  // nntp stuff
  pool: Pool
  segments: Segment[]

  // File stuff
  lastModified: number
  name: string
  size: number
  segmentSize: number
  type: string
  webkitRelativePath: string
  lastModifiedDate: Date

  // internal stuff
  _trueSize: number
  _start = 0
  _end = 0

  constructor (opts: Partial<NNTPFile> & { pool: Pool }) {
    if (!opts?.pool) throw new Error('NNTP instance is required')

    this.pool = opts.pool!
    this.segments = opts.segments!
    this.lastModified = +opts.lastModifiedDate!
    this.lastModifiedDate = opts.lastModifiedDate!
    this.name = opts.name!
    this.webkitRelativePath = opts.name!
    this.size = opts.size!
    this.segmentSize = opts.segmentSize!
    this._trueSize = opts._trueSize ?? opts.size!
    this._start = opts._start ?? 0
    this._end = opts._end ?? this.size
    this.type = opts.type ?? mime.getType(this.name) ?? 'application/octet-stream'
  }

  async * [Symbol.asyncIterator] () {
    if (this.size === 0) return

    let fileOffset = 0

    for (const segment of this.segments) {
      const segmentEnd = fileOffset + this.segmentSize

      // Skip segments entirely before our range
      if (segmentEnd <= this._start) {
        fileOffset = segmentEnd
        continue
      }
      // Stop if we're past our range
      if (fileOffset >= this._end) {
        break
      }

      const { data } = await this.pool.body(`<${segment.messageId}>`)
      const decoded = fromPost(Buffer.from(data), false)

      const sliceStart = Math.max(0, this._start - fileOffset)
      const sliceEnd = Math.min(decoded.data.length, this._end - fileOffset)

      if (sliceStart > 0 || sliceEnd < decoded.data.length) {
        yield decoded.data.subarray(sliceStart, sliceEnd)
      } else {
        yield decoded.data
      }

      fileOffset = segmentEnd
    }
  }

  async bytes () {
    return new Uint8Array(await this.arrayBuffer())
  }

  /**
   *  end position is non-inclusive, W3C slice's end is non-inclusive, but HTTP's and Node's ends are inclusive, be careful!!!
   */
  slice (start = 0, end = this.size, contentType = this.type) {
    if (start == null || this.size === 0) return this
    if (end < 0) end = Math.max(this.size + end, 0)
    if (start < 0) start = Math.max(this.size + start, 0)

    if (end === 0) return new NNTPFile({ ...this, type: contentType })

    const safeEnd = Math.min(this._trueSize, end)
    const safeStart = Math.min(start, safeEnd)

    const newSize = safeEnd - safeStart

    if (newSize === 0) return new NNTPFile({ ...this, type: contentType, size: 0 })

    if (newSize === this.size) return this

    return new NNTPFile({ ...this, type: contentType, size: newSize, _start: this._start + safeStart, _end: this._start + safeEnd })
  }

  async arrayBuffer () {
    if (this.size === 0) return new ArrayBuffer(0)
    const data = new Uint8Array(this.size)
    let offset = 0
    for await (const chunk of this) {
      data.set(chunk, offset)
      offset += chunk.length
    }
    return data.buffer
  }

  async text (): Promise<string> {
    if (this.size === 0) return ''
    return textDecoder.decode(await this.arrayBuffer())
  }

  stream () {
    if (this.size === 0) return new ReadableStream()
    let iterator: AsyncGenerator<Uint8Array, void, unknown>
    return new ReadableStream({
      start: () => {
        iterator = this[Symbol.asyncIterator]()
      },
      async pull (controller) {
        const { value, done } = await iterator.next()
        if (done) {
          controller.close()
        } else {
          controller.enqueue(value)
        }
      },
      cancel () {
        iterator.return()
      }
    })
  }
}

export default async function fromNZB (nzbcontents: string, domain: string, port: number, login: string, password: string, group: string, poolSize = 24) {
  const { files, groups } = parse(nzbcontents)

  const targetGroup = groups[0] ?? group
  const fileList = []
  const pool = new Pool(login, password, targetGroup, domain, port, poolSize)

  for (const { name, segments, datetime } of files) {
    const { data } = await pool.body(`<${segments[0]!.messageId}>`)
    const { props } = fromPost(Buffer.from(data))
    fileList.push(new NNTPFile({ name, size: parseInt(props!.begin.size), segments, segmentSize: parseInt(props!.part.end), lastModifiedDate: datetime, pool }))
  }

  return { files: fileList, pool }
}
