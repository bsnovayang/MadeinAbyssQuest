import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 相對路徑：GitHub Pages 專案頁不論 repo 名稱都能運作
  base: './',
  test: {
    globals: true,
    environment: 'node',
  },
})
