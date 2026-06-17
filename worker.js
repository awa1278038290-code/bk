export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/rpc') {
      if (request.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }));
      }

      if (env.API_ORIGIN) {
        const upstream = new URL('/rpc', env.API_ORIGIN);
        return fetch(new Request(upstream, request));
      }

      return handleFallbackRPC(request);
    }

    return env.ASSETS.fetch(request);
  }
};

const now = '2026-06-17T10:00:00.000Z';
const demoUser = {
  id: 1,
  username: 'demo',
  displayName: 'Demo User',
  createdAt: now
};
const demoPost = {
  id: 1,
  title: 'Cloudflare deployment is online with demo data',
  summary: 'API_ORIGIN is not configured yet, so the Worker is serving fallback data.',
  content:
    'The frontend static assets are deployed successfully on Cloudflare.\n\nThe previous HTTP 500 happened because API_ORIGIN was empty, so the Worker could not reach the Go + PostgreSQL backend. This fallback RPC keeps the page usable.\n\nTo use real posts, comments, likes, accounts, and messages, deploy the Go backend to a public HTTPS origin and set API_ORIGIN in Cloudflare Worker variables.',
  published: true,
  featured: true,
  likesCount: 12,
  favoritesCount: 5,
  commentsCount: 1,
  createdAt: now,
  updatedAt: now
};
const demoComments = [
  {
    id: 1,
    postId: 1,
    userId: 1,
    authorName: 'Demo User',
    content: 'The page is no longer blank and /rpc no longer returns HTTP 500.',
    createdAt: now
  }
];

async function handleFallbackRPC(request) {
  if (request.method !== 'POST') {
    return rpcResponse(null, null, -32600, 'only POST is allowed');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return rpcResponse(null, null, -32700, 'invalid JSON');
  }

  const params = body.params || {};

  switch (body.method) {
    case 'posts.list':
      return rpcResponse(body.id, [demoPost]);
    case 'posts.get':
      return rpcResponse(body.id, { post: demoPost, comments: demoComments });
    case 'users.list':
      return rpcResponse(body.id, [demoUser]);
    case 'auth.login':
    case 'auth.register':
      return rpcResponse(body.id, {
        token: 'cloudflare-demo-session',
        user: {
          ...demoUser,
          username: params.username || demoUser.username,
          displayName: params.displayName || params.username || demoUser.displayName
        }
      });
    case 'auth.me':
      return rpcResponse(body.id, demoUser);
    case 'posts.like':
      return rpcResponse(body.id, { ...demoPost, likesCount: demoPost.likesCount + 1 });
    case 'posts.favorite':
      return rpcResponse(body.id, { ...demoPost, favoritesCount: demoPost.favoritesCount + 1 });
    case 'posts.feature':
      return rpcResponse(body.id, { ...demoPost, featured: Boolean(params.featured) });
    case 'posts.create':
      return rpcResponse(body.id, {
        ...demoPost,
        id: Date.now(),
        title: params.title || demoPost.title,
        summary: params.summary || '',
        content: params.content || '',
        published: params.published !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    case 'comments.add':
      return rpcResponse(body.id, {
        id: Date.now(),
        postId: params.postId || demoPost.id,
        parentId: params.parentId || null,
        userId: demoUser.id,
        authorName: demoUser.displayName,
        content: params.content || '',
        createdAt: new Date().toISOString()
      });
    case 'messages.list':
      return rpcResponse(body.id, []);
    case 'messages.send':
      return rpcResponse(body.id, {
        id: Date.now(),
        senderId: demoUser.id,
        senderName: demoUser.displayName,
        receiverId: params.receiverId || 1,
        receiverName: 'Demo User',
        content: params.content || '',
        createdAt: new Date().toISOString()
      });
    default:
      return rpcResponse(body.id, null, -32601, 'method not found');
  }
}

function rpcResponse(id, result, code = 0, message = '') {
  const payload =
    code === 0
      ? { jsonrpc: '2.0', id, result }
      : { jsonrpc: '2.0', id, error: { code, message } };

  return withCors(
    new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    })
  );
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return new Response(response.body, { status: response.status, headers });
}
