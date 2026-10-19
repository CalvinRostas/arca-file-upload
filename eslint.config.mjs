// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Prettier owns formatting; it writes void elements as `<input />`.
    'vue/html-self-closing': ['warn', { html: { void: 'any' } }],
  },
})
