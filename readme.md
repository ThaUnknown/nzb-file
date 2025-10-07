# NZB File

A library to download files from NZB files using multiple connections. Supports streaming.

Files follow the W3C spec for File objects.

## Installation

```bash
npm install nzb-file
```

## Usage

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
