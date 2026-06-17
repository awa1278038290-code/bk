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

const navItems = [
  { key: 'all', label: '分类', icon: BookOpen },
  { key: 'featured', label: '精华', icon: Star },
  { key: 'candidate', label: '候选', icon: ThumbsUp },
  { key: 'subscribed', label: '订阅', icon: BookOpen },
  { key: 'following', label: '关注', icon: Star },
  { key: 'commented', label: '我评', icon: MessageCircle },
  { key: 'liked', label: '我赞', icon: ThumbsUp },
  { key: 'history', label: '足迹', icon: Star },
  { key: 'more', label: '更多', icon: ThumbsUp }
];

const topNavItems = ['会员', '周边', '新闻', '博问', '闪存', '班级', '赞助商'];

const editorLinks = [
  '让 Agent 在对话中成长：自进化机制的五层实现',
  '我的第一个 skill：从脚手架到上线',
  '李飞飞空间智能开源动作今天来了',
  'SpaceX 华人女工程师：没有硕博学位，也能做出好产品'
];

const navLabels = {
  all: '开发者技术精选',
  featured: '精华文章',
  candidate: '候选推荐',
  subscribed: '我的订阅',
  following: '我的关注',
  commented: '我评论过',
  liked: '我点赞过',
  history: '阅读足迹',
  more: '更多内容'
};

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
  const [activeNav, setActiveNav] = useState('all');
  const [activeTop, setActiveTop] = useState('');
  const [searchText, setSearchText] = useState('');
  const [historyIds, setHistoryIds] = useState(() => readNumberList('historyIds'));
  const [likedIds, setLikedIds] = useState(() => readNumberList('likedIds'));
  const [favoriteIds, setFavoriteIds] = useState(() => readNumberList('favoriteIds'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const filteredPosts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesSearch =
        !query ||
        [post.title, post.summary, post.content].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(query)
        );

      if (!matchesSearch) return false;
      if (activeTop && !String(post.title + post.summary + post.content).includes(activeTop)) {
        return true;
      }

      switch (activeNav) {
        case 'featured':
          return post.featured;
        case 'candidate':
          return !post.featured;
        case 'subscribed':
        case 'following':
          return post.featured || favoriteIds.includes(post.id) || post.favoritesCount > 0;
        case 'commented':
          return post.commentsCount > 0;
        case 'liked':
          return likedIds.includes(post.id) || post.likesCount > 0;
        case 'history':
          return historyIds.includes(post.id);
        default:
          return true;
      }
    });
  }, [activeNav, activeTop, favoriteIds, historyIds, likedIds, posts, searchText]);

  const currentPostId = selectedId || filteredPosts[0]?.id || posts[0]?.id;
  const ranking = useMemo(
    () =>
      [...posts]
        .sort((a, b) => b.likesCount + b.commentsCount - (a.likesCount + a.commentsCount))
        .slice(0, 6),
    [posts]
  );

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
        rememberNumber('historyIds', id, setHistoryIds);
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

  useEffect(() => {
    if (filteredPosts.length > 0 && !filteredPosts.some((post) => post.id === currentPostId)) {
      setSelectedId(filteredPosts[0].id);
    }
  }, [currentPostId, filteredPosts]);

  function saveSession(nextSession) {
    setSession(nextSession);
    localStorage.setItem('session', JSON.stringify(nextSession));
  }

  function logout() {
    setSession(null);
    setMessages([]);
    localStorage.removeItem('session');
    setNotice('已退出登录');
  }

  function rememberToken(value) {
    setAdminToken(value);
    localStorage.setItem('adminToken', value);
  }

  function selectPost(id) {
    setSelectedId(id);
    rememberNumber('historyIds', id, setHistoryIds);
  }

  function chooseNav(key) {
    setActiveNav(key);
    setNotice(`${navLabels[key]}已切换`);
  }

  function chooseTop(item) {
    setActiveTop(item);
    setNotice(`已切换到「${item}」频道`);
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
      setNotice('评论已提交');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLike() {
    if (!selected?.post) return;
    try {
      const post = await rpc('posts.like', { token: session?.token, postId: selected.post.id });
      rememberNumber('likedIds', selected.post.id, setLikedIds);
      setSelected((current) => (current ? { ...current, post } : current));
      setNotice('已点赞');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFavorite() {
    if (!selected?.post) return;
    try {
      const post = await rpc('posts.favorite', { token: session?.token, postId: selected.post.id });
      rememberNumber('favoriteIds', selected.post.id, setFavoriteIds);
      setSelected((current) => (current ? { ...current, post } : current));
      setNotice('已收藏');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFeature() {
    if (!selected?.post) return;
    try {
      const post = await rpc('posts.feature', {
        adminToken,
        postId: selected.post.id,
        featured: !selected.post.featured
      });
      setSelected((current) => (current ? { ...current, post } : current));
      setNotice(post.featured ? '已设为精华' : '已取消精华');
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
        <button className="brand" onClick={() => chooseNav('all')}>
          <div className="brand-mark">博</div>
          <div>
            <strong>技术博客园</strong>
            <span>tech.cnblogs.local</span>
          </div>
        </button>
        <nav className="top-nav" aria-label="顶部频道">
          {topNavItems.map((item) => (
            <button
              className={activeTop === item ? 'active' : ''}
              key={item}
              onClick={() => chooseTop(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
        <label className="search-box">
          <Search size={16} />
          <input
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="代码改变世界"
            value={searchText}
          />
        </label>
        <div className="auth-links">
          <button type="button" onClick={() => chooseTop('会员')}>
            {session?.user?.displayName || '游客'}
          </button>
          {session && <button onClick={logout}>退出</button>}
        </div>
      </header>

      <div className="layout-grid">
        <aside className="left-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeNav === item.key ? 'active' : ''}
                key={item.key}
                onClick={() => chooseNav(item.key)}
                type="button"
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </aside>

        <section className="feed-panel">
          <div className="editor-picks">
            {editorLinks.map((item) => (
              <button
                key={item}
                onClick={() => {
                  setSearchText(item.slice(0, 8));
                  setNotice(`已定位精选：${item}`);
                }}
                type="button"
              >
                <ChevronRight size={14} />
                {item}
              </button>
            ))}
          </div>

          <div className="feed-toolbar">
            <h1>{activeTop ? `${activeTop} · ${navLabels[activeNav]}` : navLabels[activeNav]}</h1>
            <button className="icon-button" onClick={refresh} title="刷新" type="button">
              <RefreshCcw size={17} />
            </button>
          </div>

          {error && <div className="alert">{error}</div>}
          {notice && <div className="success">{notice}</div>}
          {loading && <p className="muted">正在加载文章...</p>}
          {!loading && filteredPosts.length === 0 && (
            <p className="muted">当前筛选下没有文章，可以换个频道或去后台发布第一篇。</p>
          )}

          <div className="post-feed">
            {filteredPosts.map((post) => (
              <article
                key={post.id}
                className={`feed-item ${post.id === currentPostId ? 'active' : ''}`}
                onClick={() => selectPost(post.id)}
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
                    <button className="like-button" onClick={handleLike} type="button">
                      <Heart size={17} /> 点赞 {selected.post.likesCount}
                    </button>
                    <button className="like-button secondary" onClick={handleFavorite} type="button">
                      <Star size={17} /> 收藏 {selected.post.favoritesCount}
                    </button>
                    <button className="like-button secondary" onClick={handleFeature} type="button">
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
                      <button onClick={() => setReplyTo(null)} type="button">
                        取消
                      </button>
                    </div>
                  )}
                  <form className="comment-form" onSubmit={handleAddComment}>
                    <textarea
                      name="content"
                      placeholder={session ? '写下评论或回复' : '登录后才能评论'}
                      required
                      rows="3"
                    />
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
                        <button onClick={() => setReplyTo(comment)} type="button">
                          回复
                        </button>
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
              <button key={post.id} onClick={() => selectPost(post.id)} type="button">
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
                  <button
                    className={authMode === 'login' ? 'active' : ''}
                    onClick={() => setAuthMode('login')}
                    type="button"
                  >
                    登录
                  </button>
                  <button
                    className={authMode === 'register' ? 'active' : ''}
                    onClick={() => setAuthMode('register')}
                    type="button"
                  >
                    注册
                  </button>
                </div>
                <input name="username" placeholder="账号" required />
                {authMode === 'register' && <input name="displayName" placeholder="昵称" required />}
                <input name="password" placeholder="密码" required type="password" />
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
              <textarea
                name="content"
                placeholder={session ? '发送私聊内容' : '登录后才能私聊'}
                required
                rows="3"
              />
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
                onChange={(event) => rememberToken(event.target.value)}
                placeholder="默认 change-me"
                type="password"
                value={adminToken}
              />
            </label>
            <form className="admin-form" onSubmit={handleCreatePost}>
              <input name="title" placeholder="文章标题" required />
              <input name="summary" placeholder="一句话摘要" />
              <textarea name="content" placeholder="正文内容" required rows="7" />
              <label className="checkbox-line">
                <input defaultChecked name="published" type="checkbox" />
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

function readNumberList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function rememberNumber(key, value, setter) {
  setter((current) => {
    const next = [Number(value), ...current.filter((item) => item !== Number(value))].slice(0, 30);
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  });
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
