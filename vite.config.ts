// 构建官方 WebUI 的静态资源；开发服务器把 Admin API 与插件路由转发到本机 Core。
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// Core 按 base_url 校验 Host 与 Origin，转发时都改写为 Core 自己的来源；Cookie 仍按开发页同源保存。
const core = 'http://127.0.0.1:7650';
const forward: ProxyOptions = { target: core, changeOrigin: true, headers: { origin: core } };

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': forward, '/plugins': forward } },
});
