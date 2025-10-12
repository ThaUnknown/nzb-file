module.exports = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('yencode')
  } catch (err) {
    console.warn('WebTorrent: uTP not supported', err)
    return {
      from_post: () => { throw new Error('yencode not supported in this environment') }
    }
  }
})()
