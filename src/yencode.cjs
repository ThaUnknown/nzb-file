module.exports = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@thaunknown/yencode')
  } catch (err) {
    console.warn('yencode not supported in this environment', err)
    return {
      fromPost: () => { throw new Error('yencode not supported in this environment') }
    }
  }
})()
