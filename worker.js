const now = '2026-06-17T10:00:00.000Z';

const state = {
  nextPostId: 3,
  nextCommentId: 2,
  nextMessageId: 1,
  nextUserId: 2,
  users: [
    {
      id: 1,
      username: 'demo',
      displayName: 'Demo User',
      createdAt: now
    }
  ],
  sessions: new Map(),
  posts: [
    {
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
    },
    {
      id: 2,
      title: '功能按钮已实装：点赞、收藏、精华和评论',
      summary: '左侧和顶部导航已经可以切换筛选，操作按钮会更新数据。',
      content:
        '这篇文章用于验证 Cloudflare Worker 降级接口。\n\n你可以点击点赞、收藏、设为精华，也可以登录后评论、发帖和私聊。没有配置真实 Go 后端时，这些数据会保存在 Worker 运行实例的内存中；配置 API_ORIGIN 后会切到真实后端。',
      published: true,
      featured: false,
      likesCount: 3,
      favoritesCount: 1,
      commentsCount: 0,
      createdAt: now,
      updatedAt: now
    }
  ],
  comments: [
    {
      id: 1,
      postId: 1,
      userId: 1,
      authorName: 'Demo User',
      content: 'The page is no longer blank and /rpc no longer returns HTTP 500.',
      createdAt: now
    }
  ],
  messages: [],
  likes: new Set(),
  favorites: new Set()
};

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

  try {
    switch (body.method) {
      case 'posts.list':
        return rpcResponse(body.id, listPosts(Boolean(params.adminToken)));
      case 'posts.get':
        return rpcResponse(body.id, getPostBundle(Number(params.id), Boolean(params.adminToken)));
      case 'users.list':
        return rpcResponse(body.id, state.users);
      case 'auth.login':
      case 'auth.register':
        return rpcResponse(body.id, createSession(params));
      case 'auth.me':
        return rpcResponse(body.id, currentUser(params.token));
      case 'posts.like':
        return rpcResponse(body.id, likePost(params));
      case 'posts.favorite':
        return rpcResponse(body.id, favoritePost(params));
      case 'posts.feature':
        return rpcResponse(body.id, featurePost(params));
      case 'posts.create':
        return rpcResponse(body.id, createPost(params));
      case 'comments.add':
        return rpcResponse(body.id, addComment(params));
      case 'messages.list':
        return rpcResponse(body.id, listMessages(params));
      case 'messages.send':
        return rpcResponse(body.id, sendMessage(params));
      default:
        return rpcResponse(body.id, null, -32601, 'method not found');
    }
  } catch (error) {
    return rpcResponse(body.id, null, -32000, error.message);
  }
}

function listPosts(includeDrafts) {
  return state.posts
    .filter((post) => includeDrafts || post.published)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || new Date(b.createdAt) - new Date(a.createdAt));
}

function getPostBundle(id, includeDrafts) {
  const post = state.posts.find((item) => item.id === id && (includeDrafts || item.published));
  if (!post) throw new Error('resource not found');
  return {
    post,
    comments: state.comments
      .filter((comment) => comment.postId === id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  };
}

function createSession(params) {
  const username = String(params.username || 'demo').trim() || 'demo';
  const displayName = String(params.displayName || username).trim() || username;
  let user = state.users.find((item) => item.username === username);

  if (!user) {
    user = {
      id: state.nextUserId++,
      username,
      displayName,
      createdAt: new Date().toISOString()
    };
    state.users.unshift(user);
  }

  const token = `demo-session-${user.id}-${Date.now()}`;
  state.sessions.set(token, user.id);
  return { token, user };
}

function currentUser(token) {
  const userId = state.sessions.get(token) || 1;
  return state.users.find((user) => user.id === userId) || state.users[0];
}

function findPost(postId) {
  const post = state.posts.find((item) => item.id === Number(postId));
  if (!post) throw new Error('resource not found');
  return post;
}

function likePost(params) {
  const user = currentUser(params.token);
  const post = findPost(params.postId);
  const key = `${post.id}:${user.id}`;
  if (!state.likes.has(key)) {
    state.likes.add(key);
    post.likesCount += 1;
    post.updatedAt = new Date().toISOString();
  }
  return post;
}

function favoritePost(params) {
  const user = currentUser(params.token);
  const post = findPost(params.postId);
  const key = `${post.id}:${user.id}`;
  if (!state.favorites.has(key)) {
    state.favorites.add(key);
    post.favoritesCount += 1;
    post.updatedAt = new Date().toISOString();
  }
  return post;
}

function featurePost(params) {
  const post = findPost(params.postId);
  post.featured = Boolean(params.featured);
  post.updatedAt = new Date().toISOString();
  return post;
}

function createPost(params) {
  const title = String(params.title || '').trim();
  const content = String(params.content || '').trim();
  if (!title || !content) throw new Error('title and content are required');

  const createdAt = new Date().toISOString();
  const post = {
    id: state.nextPostId++,
    title,
    summary: String(params.summary || '').trim(),
    content,
    published: params.published !== false,
    featured: false,
    likesCount: 0,
    favoritesCount: 0,
    commentsCount: 0,
    createdAt,
    updatedAt: createdAt
  };
  state.posts.unshift(post);
  return post;
}

function addComment(params) {
  const user = currentUser(params.token);
  const post = findPost(params.postId);
  const content = String(params.content || '').trim();
  if (!content) throw new Error('comment is required');

  const comment = {
    id: state.nextCommentId++,
    postId: post.id,
    parentId: params.parentId || null,
    userId: user.id,
    authorName: user.displayName,
    content,
    createdAt: new Date().toISOString()
  };
  state.comments.push(comment);
  post.commentsCount += 1;
  post.updatedAt = new Date().toISOString();
  return comment;
}

function listMessages(params) {
  const user = currentUser(params.token);
  return state.messages
    .filter((message) => message.senderId === user.id || message.receiverId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function sendMessage(params) {
  const sender = currentUser(params.token);
  const receiver = state.users.find((user) => user.id === Number(params.receiverId)) || state.users[0];
  const content = String(params.content || '').trim();
  if (!content) throw new Error('receiver and message are required');

  const message = {
    id: state.nextMessageId++,
    senderId: sender.id,
    senderName: sender.displayName,
    receiverId: receiver.id,
    receiverName: receiver.displayName,
    content,
    createdAt: new Date().toISOString()
  };
  state.messages.unshift(message);
  return message;
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
