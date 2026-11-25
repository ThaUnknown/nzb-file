import { NNTP } from 'nntp-js'

export class Pool {
  pool = new Set<NNTP>()
  available: NNTP[] = []
  waiters: Array<{ resolve: (nntp: NNTP) => void, reject: (error: Error) => void }> = []
  ready: Promise<Pool>
  depth

  /**
   * @param depth The maximum number of `body()` calls in flight on 1 connection. A value above 1 uses NNTP pipelining.
   * @param timeout The maximum time in ms that a connection waits for data from the server. Then the connection closes and the call fails.
   */
  constructor (login: string, password: string, group: string, domain: string, port = 119, size = 24, ConnectionFactory = NNTP, depth = 1, timeout = 15_000) {
    this.depth = depth
    for (let i = 0; i < size; i++) {
      const nntp = new ConnectionFactory(domain, port)
      this.pool.add(nntp)
    }

    this.ready = this._connectPool(login, password, group, timeout)
  }

  _enqueueConnection (nntp: NNTP) {
    if (!this.pool.has(nntp)) return
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve(nntp)
    } else {
      this.available.push(nntp)
    }
  }

  async _connectPool (login: string, password: string, group: string, timeout: number) {
    await Promise.all([...this.pool].map(async (nntp) => {
      try {
        await nntp.connect(false, timeout)
        if ('STARTTLS' in (nntp.caps ?? {})) await nntp.starttls()

        await nntp.login(login, password)
        await nntp.group(group)
        for (let i = 0; i < this.depth; i++) this._enqueueConnection(nntp)
      } catch (error) {
        this.pool.delete(nntp)
      }
    }))

    if (this.pool.size === 0) {
      throw new Error('Failed to establish any NNTP connections')
    }

    return this
  }

  async _acquire (): Promise<NNTP> {
    await this.ready

    const available = this.available.shift()
    if (available != null) return available

    if (this.pool.size === 0) {
      throw new Error('No NNTP connections available')
    }

    return await new Promise<NNTP>((resolve, reject) => {
      this.waiters.push({ resolve, reject })
    })
  }

  async body (messageSpec: string) {
    const nntp = await this._acquire()
    try {
      return await nntp.body(messageSpec)
    } finally {
      this._enqueueConnection(nntp)
    }
  }

  async destroy () {
    for (const nntp of this.waiters) {
      nntp.reject(new Error('Pool is being destroyed'))
    }
    // a QUIT on a busy connection would interleave with the response it's reading, so drop those sockets instead
    const idle = [...this.pool].filter(nntp => this.available.filter(entry => entry === nntp).length === this.depth)
    for (const nntp of this.pool) {
      if (!idle.includes(nntp)) nntp.sock?.destroy()
    }
    await Promise.allSettled(idle.map(nntp => nntp.quit()))
    this.waiters = []
    this.pool.clear()
    this.available = []
  }
}
