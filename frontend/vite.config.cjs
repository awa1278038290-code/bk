const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  cacheDir: '.vite-cache',
  server: {
    port: 5173,
    proxy: {
      '/rpc': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080'
    }
  }
});
