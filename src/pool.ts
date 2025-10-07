import { NNTP } from 'nntp-js'

export class Pool {
  pool = new Set<NNTP>()
  available: NNTP[] = []
  waiters: Array<{ resolve: (nntp: NNTP) => void, reject: (error: Error) => void }> = []
  ready: Promise<Pool>

  constructor (login: string, password: string, group: string, domain: string, port = 119, size = 24, ConnectionFactory = NNTP) {
    for (let i = 0; i < size; i++) {
      const nntp = new ConnectionFactory(domain, port)
      this.pool.add(nntp)
    }

    this.ready = this._connectPool(login, password, group)
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

  async _connectPool (login: string, password: string, group: string) {
    await Promise.all([...this.pool].map(async (nntp) => {
      try {
        await nntp.connect()
        if ('STARTTLS' in (nntp.caps ?? {})) await nntp.starttls()

        await nntp.login(login, password)
        await nntp.group(group)
        this._enqueueConnection(nntp)
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
    await Promise.all([...this.pool].map(nntp => nntp.quit().catch(() => {})))
    this.waiters = []
    this.pool.clear()
    this.available = []
  }
}
