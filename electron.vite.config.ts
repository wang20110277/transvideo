import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Vite 插件：API CORS 代理
 * 在开发服务器上注册 /__api_proxy 中间件，
 * 将浏览器端的外部 API 请求由服务端转发，绕过 CORS 限制。
 */
function apiCorsProxyPlugin(): Plugin {
  return {
    name: 'api-cors-proxy',
    configureServer(server) {
      server.middlewares.use('/__api_proxy', async (req, res) => {
        // OPTIONS 预检请求
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          });
          res.end();
          return;
        }

        // 解析目标 URL
        const urlParam = new URL(req.url || '', 'http://localhost').searchParams.get('url');
        if (!urlParam) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
          return;
        }

        try {
          // 读取请求体
          const bodyChunks: Buffer[] = [];
          for await (const chunk of req) {
            bodyChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

          // 解包原始请求头
          const proxyHeadersRaw = req.headers['x-proxy-headers'];
          let forwardHeaders: Record<string, string> = {};
          if (typeof proxyHeadersRaw === 'string') {
            try { forwardHeaders = JSON.parse(proxyHeadersRaw); } catch { /* ignore */ }
          }

          // 服务端转发
          const response = await fetch(urlParam, {
            method: req.method || 'GET',
            headers: forwardHeaders,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
          });

          const respBody = await response.arrayBuffer();
          const headers: Record<string, string> = { 'Access-Control-Allow-Origin': '*' };
          const ct = response.headers.get('content-type');
          if (ct) headers['Content-Type'] = ct;

          res.writeHead(response.status, headers);
          res.end(Buffer.from(respBody));
        } catch (err: any) {
          const cause = err?.cause?.message || err?.cause?.code || '';
          console.error(`[api-cors-proxy] Unexpected error: ${err?.message}${cause ? ' | cause: ' + cause : ''}`);
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({ error: 'Proxy request failed', detail: err?.message, cause }));
        }
      });
    },
  };
}

export default defineConfig({
  main: {
    // '@smartsub/bridge' 类型侧由根 tsconfig paths 指向 declaration-only 门面
    // (防止根程序 import 追入整棵 smartsub 树),打包侧在此指回真实实现。
    resolve: {
      alias: {
        '@smartsub/bridge': path.resolve(__dirname, 'electron/services/smartsub/bridge/index.ts'),
      },
    },
    build: {
      // electron-vite v5 默认 externalizeDeps=true:把 package.json 全部 dependencies
      // 运行时 require 化。但 https-proxy-agent / http-proxy-agent v9 是纯 ESM 包,
      // CJS 主进程产物运行时 require 会 ERR_REQUIRE_ESM(Phase 0 冒烟实测)。原生
      // SmartSub 在 nextron.config.js 做了同样处理:把这两包从外部化排除、打进
      // bundle(传递依赖 agent-base / proxy-agent-negotiate 一并打入)。其可选动态
      // import 的 kerberos(Kerberos 代理鉴权才用,永不启用)在 external 里保持懒加载。
      externalizeDeps: { exclude: ['https-proxy-agent', 'http-proxy-agent'] },
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/main.ts')
        },
        output: {
          format: 'cjs'
        },
        external: [
          'ffmpeg-static', 'fluent-ffmpeg', 'axios', 'fs-extra', 'lodash', 'uuid',
          'iconv-lite', 'opencc-js', 'srt-webvtt', 'tinyld', 'fontkit', 'decompress',
          'msedge-tts', 'openai', 'zod', 'electron-store',
          'systeminformation', 'jsonrepair', 'diff',
          // Task 3 补装(496c816)的翻译服务运行时依赖,同样运行时 require、不进 bundle
          '@alicloud/alimt20181012', '@alicloud/openapi-client', '@alicloud/tea-util',
          '@volcengine/openapi', 'really-relaxed-json',
          // 仅 proxy-agent-negotiate 的可选动态 import 触达,未安装,永不执行
          'kerberos',
        ]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/preload.ts')
        },
        output: {
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@editor': path.resolve(__dirname, './src/editor'),
        '@opencut/ai-core/services/prompt-compiler': path.resolve(__dirname, './src/packages/ai-core/services/prompt-compiler.ts'),
        '@opencut/ai-core/api/task-poller': path.resolve(__dirname, './src/packages/ai-core/api/task-poller.ts'),
        '@opencut/ai-core/protocol': path.resolve(__dirname, './src/packages/ai-core/protocol/index.ts'),
        '@opencut/ai-core': path.resolve(__dirname, './src/packages/ai-core/index.ts'),
      },
    },
    plugins: [
      apiCorsProxyPlugin(),
      react(),
    ],
  },
})
