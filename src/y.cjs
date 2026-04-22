module.exports = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node-gyp-build')(require.resolve('@thaunknown/yencode').slice(0, -9))
  } catch (err) {
    console.warn('yencode not supported in this environment', err)
    return {
      from_post: () => { throw new Error('yencode not supported in this environment') }
    }
  }
})()
