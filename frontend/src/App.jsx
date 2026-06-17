import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Heart,
  MessageCircle,
  PenLine,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Star,
  ThumbsUp,
  UserRound
} from 'lucide-react';
import { rpc } from './api';

const navItems = ['分类', '精华', '候选', '订阅', '关注', '我评', '我赞', '足迹', '更多'];
const editorLinks = [
  '让 Agent 在对话中成长：自进化机制的五层实现',
  '我的第一个 skill：从脚手架到上线',
  '李飞飞空间智能开源动作今天来了',
  'SpaceX 华人女工程师：没有硕博学位，也能做出好产品'
];

export default function App() {
  const [posts, setPosts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken') || '');
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('session');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currentPostId = selectedId || posts[0]?.id;
  const ranking = useMemo(() => posts.slice(0, 6), [posts]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await rpc('posts.list', adminToken ? { adminToken } : {});
      setPosts(result || []);
      if (!selectedId && result?.[0]) {
        setSelectedId(result[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedId]);

  const loadPost = useCallback(
    async (id = currentPostId) => {
      if (!id) {
        setSelected(null);
        return;
      }
      setError('');
      try {
        const result = await rpc('posts.get', adminToken ? { id, adminToken } : { id });
        setSelected(result);
      } catch (err) {
        setError(err.message);
        setSelected(null);
      }
    },
    [adminToken, currentPostId]
  );

  const loadUsers = useCallback(async () => {
    const result = await rpc('users.list');
    setUsers(result || []);
  }, []);

  const loadMessages = useCallback(async () => {
    if (!session?.token) return;
    const result = await rpc('messages.list', { token: session.token });
    setMessages(result || []);
  }, [session?.token]);

  const refresh = useCallback(async () => {
    await loadPosts();
    await loadPost(currentPostId);
    await loadUsers();
    await loadMessages();
  }, [currentPostId, loadMessages, loadPost, loadPosts, loadUsers]);

  useEffect(() => {
    loadPosts();
    loadUsers();
  }, [loadPosts, loadUsers]);

  useEffect(() => {
    loadPost(currentPostId);
  }, [currentPostId, loadPost]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  function saveSession(nextSession) {
    setSession(nextSession);
    localStorage.setItem('session', JSON.stringify(nextSession));
  }

  function logout() {
    setSession(null);
    setMessages([]);
    localStorage.removeItem('session');
  }

  function rememberToken(value) {
    setAdminToken(value);
    localStorage.setItem('adminToken', value);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const method = authMode === 'login' ? 'auth.login' : 'auth.register';
      const result = await rpc(method, {
        username: form.get('username'),
        displayName: form.get('displayName') || form.get('username'),
        password: form.get('password')
      });
      saveSession(result);
      formElement.reset();
      setNotice(authMode === 'login' ? '登录成功' : '注册成功');
      await loadUsers();
      await loadMessages();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreatePost(event) {
    event.preventDefault();
    setNotice('');
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const post = await rpc('posts.create', {
        adminToken,
        title: form.get('title'),
        summary: form.get('summary'),
        content: form.get('content'),
        published: form.get('published') === 'on'
      });
      formElement.reset();
      setNotice('文章已发布');
      setSelectedId(post.id);
      await loadPosts();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddComment(event) {
    event.preventDefault();
    if (!selected?.post) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await rpc('comments.add', {
        token: session?.token,
        postId: selected.post.id,
        parentId: replyTo?.id || null,
        content: form.get('content')
      });
      formElement.reset();
      setReplyTo(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLike() {
    if (!selected?.post) return;
    try {
      await rpc('posts.like', { token: session?.token, postId: selected.post.id });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFavorite() {
    if (!selected?.post) return;
    try {
      await rpc('posts.favorite', { token: session?.token, postId: selected.post.id });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFeature() {
    if (!selected?.post) return;
    try {
      await rpc('posts.feature', {
        adminToken,
        postId: selected.post.id,
        featured: !selected.post.featured
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await rpc('messages.send', {
        token: session?.token,
        receiverId: Number(form.get('receiverId')),
        content: form.get('content')
      });
      formElement.reset();
      setNotice('私聊已发送');
      await loadMessages();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="portal-shell">
      <header className="site-header">
        <div className="brand">
          <div className="brand-mark">博</div>
          <div>
            <strong>技术博客园</strong>
            <span>tech.cnblogs.local</span>
          </div>
        </div>
        <nav className="top-nav">
          <a>会员</a>
          <a>周边</a>
          <a>新闻</a>
          <a>博问</a>
          <a>闪存</a>
          <a>班级</a>
          <a>赞助商</a>
        </nav>
        <label className="search-box">
          <Search size={16} />
          <input placeholder="代码改变世界" />
        </label>
        <div className="auth-links">
          <a>{session?.user?.displayName || '游客'}</a>
          {session && <button onClick={logout}>退出</button>}
        </div>
      </header>

      <div className="layout-grid">
        <aside className="left-nav">
          {navItems.map((item, index) => (
            <button key={item}>
              {index % 3 === 0 && <BookOpen size={16} />}
              {index % 3 === 1 && <Star size={16} />}
              {index % 3 === 2 && <ThumbsUp size={16} />}
              {item}
            </button>
          ))}
        </aside>

        <section className="feed-panel">
          <div className="editor-picks">
            {editorLinks.map((item) => (
              <button key={item}>
                <ChevronRight size={14} />
                {item}
              </button>
            ))}
          </div>

          <div className="feed-toolbar">
            <h1>开发者技术精选</h1>
            <button className="icon-button" onClick={refresh} title="刷新">
              <RefreshCcw size={17} />
            </button>
          </div>

          {error && <div className="alert">{error}</div>}
          {notice && <div className="success">{notice}</div>}
          {loading && <p className="muted">正在加载文章...</p>}
          {!loading && posts.length === 0 && <p className="muted">还没有文章，去后台发布第一篇吧。</p>}

          <div className="post-feed">
            {posts.map((post) => (
              <article
                key={post.id}
                className={`feed-item ${post.id === currentPostId ? 'active' : ''}`}
                onClick={() => setSelectedId(post.id)}
              >
                <h2>
                  {post.featured && <span className="featured-badge">精华</span>}
                  {post.title}
                </h2>
                <p>{post.summary || post.content}</p>
                <div className="feed-meta">
                  <span>
                    <UserRound size={14} /> 技术随笔
                  </span>
                  <span>{formatDate(post.createdAt)}</span>
                  <span>
                    <MessageCircle size={14} /> {post.commentsCount}
                  </span>
                  <span>
                    <Heart size={14} /> {post.likesCount}
                  </span>
                  <span>
                    <Star size={14} /> {post.favoritesCount}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <section className="detail-panel">
            {selected?.post ? (
              <>
                <div className="detail-heading">
                  <div>
                    <h2>
                      {selected.post.featured && <span className="featured-badge">精华</span>}
                      {selected.post.title}
                    </h2>
                    <p>
                      <CalendarDays size={15} /> {formatDate(selected.post.createdAt)}
                    </p>
                  </div>
                  <div className="detail-actions">
                    <button className="like-button" onClick={handleLike}>
                      <Heart size={17} /> 点赞 {selected.post.likesCount}
                    </button>
                    <button className="like-button secondary" onClick={handleFavorite}>
                      <Star size={17} /> 收藏 {selected.post.favoritesCount}
                    </button>
                    <button className="like-button secondary" onClick={handleFeature}>
                      <ShieldCheck size={17} /> {selected.post.featured ? '取消精华' : '设为精华'}
                    </button>
                  </div>
                </div>
                <div className="post-body">{selected.post.content}</div>
                <div className="comments">
                  <h3>
                    <MessageCircle size={17} /> 评论 {selected.comments?.length || 0}
                  </h3>
                  {replyTo && (
                    <div className="replying">
                      正在回复 {replyTo.authorName}
                      <button onClick={() => setReplyTo(null)}>取消</button>
                    </div>
                  )}
                  <form className="comment-form" onSubmit={handleAddComment}>
                    <textarea name="content" placeholder={session ? '写下评论或回复' : '登录后才能评论'} rows="3" required />
                    <button type="submit">
                      <Send size={15} /> 提交
                    </button>
                  </form>
                  <div className="comment-list">
                    {(selected.comments || []).map((comment) => (
                      <div className={`comment ${comment.parentId ? 'reply' : ''}`} key={comment.id}>
                        <strong>{comment.authorName}</strong>
                        <span>{formatDate(comment.createdAt)}</span>
                        <p>{comment.content}</p>
                        <button onClick={() => setReplyTo(comment)}>回复</button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">选择一篇文章查看详情。</p>
            )}
          </section>
        </section>

        <aside className="right-rail">
          <section className="ranking">
            <h2>48小时阅读排行</h2>
            {ranking.map((post, index) => (
              <button key={post.id} onClick={() => setSelectedId(post.id)}>
                <span>{index + 1}</span>
                {post.title}
              </button>
            ))}
          </section>

          <section className="admin-pane">
            <div className="admin-header">
              <UserRound size={18} />
              <h2>账号系统</h2>
            </div>
            {session ? (
              <div className="account-card">
                <strong>{session.user.displayName}</strong>
                <span>@{session.user.username}</span>
              </div>
            ) : (
              <form className="admin-form" onSubmit={handleAuth}>
                <div className="mode-switch">
                  <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
                    登录
                  </button>
                  <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
                    注册
                  </button>
                </div>
                <input name="username" placeholder="账号" required />
                {authMode === 'register' && <input name="displayName" placeholder="昵称" required />}
                <input name="password" placeholder="密码" type="password" required />
                <button type="submit">{authMode === 'login' ? '登录' : '注册'}</button>
              </form>
            )}
          </section>

          <section className="admin-pane">
            <div className="admin-header">
              <MessageCircle size={18} />
              <h2>私聊</h2>
            </div>
            <form className="admin-form" onSubmit={handleSendMessage}>
              <select name="receiverId" required>
                <option value="">选择用户</option>
                {users
                  .filter((user) => user.id !== session?.user?.id)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
              </select>
              <textarea name="content" placeholder={session ? '发送私聊内容' : '登录后才能私聊'} rows="3" required />
              <button type="submit">
                <Send size={15} /> 发送
              </button>
            </form>
            <div className="message-list">
              {messages.slice(0, 5).map((message) => (
                <div className="message" key={message.id}>
                  <strong>
                    {message.senderName} → {message.receiverName}
                  </strong>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-pane">
            <div className="admin-header">
              <ShieldCheck size={18} />
              <h2>后台发帖</h2>
            </div>
            <label>
              管理 Token
              <input
                value={adminToken}
                onChange={(event) => rememberToken(event.target.value)}
                placeholder="默认 change-me"
                type="password"
              />
            </label>
            <form className="admin-form" onSubmit={handleCreatePost}>
              <input name="title" placeholder="文章标题" required />
              <input name="summary" placeholder="一句话摘要" />
              <textarea name="content" placeholder="正文内容" rows="7" required />
              <label className="checkbox-line">
                <input name="published" type="checkbox" defaultChecked />
                立即发布
              </label>
              <button type="submit">
                <PenLine size={15} /> 发布
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
