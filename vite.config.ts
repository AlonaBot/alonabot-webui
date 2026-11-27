// 构建官方 WebUI 的静态资源；开发服务器把 Admin API 与插件路由转发到本机 Core。
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Core 按 base_url 校验 Host 与 Origin，转发时都改写为 Core 自己的来源；Cookie 仍按开发页同源保存。
const core = 'http://127.0.0.1:7650';
const forward: ProxyOptions = { target: core, changeOrigin: true, headers: { origin: core } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': forward, '/plugins': forward } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
            return 'vendor-echarts';
          }
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
          return undefined;
        },
      },
    },
  },
});
