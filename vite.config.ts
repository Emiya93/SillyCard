import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // 打包配置：用于酒馆测试
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: false, // 保留 console，方便调试
          },
        },
        rollupOptions: {
          output: {
            // 将所有 JS 打包到单个文件（类似 XianTu 的做法）
            manualChunks: undefined,
            entryFileNames: 'wenwan.js',
            chunkFileNames: 'wenwan-[hash].js',
            assetFileNames: 'wenwan-[hash].[ext]',
          },
        },
        // 增加 chunk 大小限制
        chunkSizeWarningLimit: 2000,
      },
    };
});
