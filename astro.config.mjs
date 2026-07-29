import dns from 'node:dns';
import { defineConfig, sessionDrivers } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import netlify from '@astrojs/netlify';
import cloudflare from '@astrojs/cloudflare';

dns.setDefaultResultOrder('verbatim');
const DEFAULT_DEV_HOST = 'localhost';
const DEFAULT_DEV_PORT = 4321;

function getDevServerConfig(env = process.env) {
  const host = env.DEV_HOST || DEFAULT_DEV_HOST;
  const port = Number(env.PORT || DEFAULT_DEV_PORT);

  return {
    host,
    port,
    strictPort: false,
  };
}

const devServerConfig = getDevServerConfig();

// Cloudflare Pages 构建时自动注入 CF_PAGES；Workers 部署用 DEPLOY_TARGET=cloudflare 显式指定
const isCloudflare = Boolean(process.env.CF_PAGES || process.env.DEPLOY_TARGET === 'cloudflare');
const isEdgeOne = process.env.DEPLOY_TARGET === 'edgeone';
const usesWebRuntimeAdapter = isCloudflare || isEdgeOne;

function getAdapter(env = process.env) {
  if (usesWebRuntimeAdapter) {
    // DuoDash 为纯客户端渲染的 React SPA，不使用 Astro 图像优化，
    // 用 passthrough 关闭图像服务：免去 IMAGES 绑定依赖，也跳过构建期 workerd 处理。
    return cloudflare({ imageService: 'passthrough' });
  }

  if (env.NETLIFY) {
    return netlify();
  }

  return vercel({
    webAnalytics: {
      enabled: false
    }
  });
}

export default defineConfig({
  // EdgeOne serves the UI as static assets. Only /api/* executes in Edge Functions.
  output: isEdgeOne ? 'static' : 'server',
  adapter: getAdapter(),
  // Cloudflare 适配器默认强制用 KV 提供 Sessions；本项目不使用 Sessions，
  // 指定内存驱动关闭该默认，免去部署时创建 SESSION KV 命名空间。
  ...(usesWebRuntimeAdapter ? { session: { driver: sessionDrivers.memory() } } : {}),
  devToolbar: {
    enabled: false
  },
  server: {
    host: devServerConfig.host,
    port: devServerConfig.port,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://www.duolingo.com https://*.openai.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    }
  },
  integrations: [
    react()
  ],
  vite: {
    server: devServerConfig,
    build: {
      cssCodeSplit: true,
      minify: 'esbuild',
      cssMinify: 'esbuild'
    },
    ssr: {
      noExternal: ['recharts']
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'recharts'],
      exclude: ['@zumer/snapdom']
    }
  },
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  }
});
