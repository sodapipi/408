import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// H5 开发：/api 与 /uploads 代理到本机后端，避免为本地开发改后端 CORS。
// 上线 H5 时把 src/config.js 里的 API_BASE 改成你的 HTTPS 域名即可。
export default defineConfig({
  plugins: [uni()],
  // ec-canvas 自带的 echarts.js 是 UMD 格式，需要显式允许 commonjs 转换
  build: {
    commonjsOptions: {
      include: [/node_modules/, /wxcomponents/],
      transformMixedEsModules: true
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true }
    }
  }
})
