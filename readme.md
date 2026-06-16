# NZB File

A library to download files from NZB files using multiple connections. Supports streaming.

Files follow the W3C spec for File objects.

## Installation

```bash
pnpm install nzb-file
```

## Example Usage

```typescript
const { files, pool } = await fromNZB(
  await readFile('file.nzb', { encoding: 'utf-8' }),
  'example.domain.news.com',
  119, // port
  'login',
  'password',
  'alt.binaries.things',
  20 // connection pool size
)

const biggest = files.reduce((a, b) => (a.size > b.size ? a : b))

const sub = biggest.slice(0, 50 * 1024 * 1024) // first 50MB
const data = await sub.arrayBuffer() // this will download only the required segments from the slice

const stream = file.stream() // ReadableStream of the entire file, downloaded on-the-fly, using a single connection only

const slices = [
  biggest.slice(0, 10 * 1024 * 1024), // first 10MB
  biggest.slice(10 * 1024 * 1024, 20 * 1024 * 1024), // second 10MB
  biggest.slice(20 * 1024 * 1024) // rest of the file
]

const allData = slices.map(s => s.arrayBuffer()) // all slices will be downloaded in parallel, using the connection pool
await Promise.all(allData)

import { Readable } from 'node:stream'
import { createWriteStream } from 'node:fs'

const readable = Readable.from(biggest) // NZBFile implements async iterable, so you can create a Node.js Readable stream from it
readable.pipe(createWriteStream('output.file')) // this will download the entire file, using a single connection only, so quite slowly, but with low memory usage


pool.destroy() // remember to destroy the pool when you are done
```

or if you don't care about a connection pool and just want to download using a single connection or your own pool implementation:

```typescript
import parse from 'nzb-parser'
import { NNTPFile } from 'nzb-file'
import NNTP from 'nntp-js'
import { fromPost } from '@thaunknown/yencode'

async function fromNZB (nzbcontents: string, domain: string, port: number, login: string, password: string, group: string, poolSize = 24) {
  const { files, groups } = parse(nzbcontents)

  const targetGroup = groups[0] ?? group
  const fileList = []
  const nntp = new NNTP(domain, port)
  await nntp.connect()
  if ('STARTTLS' in (nntp.caps ?? {})) await nntp.starttls()

  await nntp.login(login, password)
  await nntp.group(targetGroup)

  for (const { name, segments, datetime } of files) {
    const { data } = await nntp.body(`<${segments[0]!.messageId}>`)
    const { props } = fromPost(Buffer.from(data))
    fileList.push(new NNTPFile({ name, size: parseInt(props!.begin.size), segments, segmentSize: parseInt(props!.part.end), lastModifiedDate: datetime, pool: nntp }))
  }

  return { files: fileList, pool: nntp }
}
```
