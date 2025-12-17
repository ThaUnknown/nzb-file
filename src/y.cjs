module.exports = (() => {
  try {
    // @ts-expect-error missing types
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@thaunknown/yencode/build/Release/yencode.node')
  } catch (err) {
    console.warn('yencode not supported in this environment', err)
    return {
      from_post: () => { throw new Error('yencode not supported in this environment') }
    }
  }
})()
