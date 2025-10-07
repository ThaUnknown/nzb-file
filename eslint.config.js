import config from 'eslint-config-standard-universal'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  ...config(globals.node),
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    },
  }
)