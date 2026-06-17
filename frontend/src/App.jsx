import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Heart, MessageCircle, PenLine, RefreshCcw, Send, ShieldCheck } from 'lucide-react';
import { rpc } from './api';

export default function App() {
  const [posts, setPosts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const visiblePosts = useMemo(() => posts.filter((post) => post.published), [posts]);
  const currentPostId = selectedId || visiblePosts[0]?.id || posts[0]?.id;

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

  const refresh = useCallback(async () => {
    await loadPosts();
    await loadPost(currentPostId);
  }, [currentPostId, loadPost, loadPosts]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    loadPost(currentPostId);
  }, [currentPostId, loadPost]);

  function rememberToken(value) {
    setAdminToken(value);
    localStorage.setItem('adminToken', value);
  }

  async function handleCreatePost(event) {
    event.preventDefault();
    setNotice('');
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const post = await rpc('posts.create', {
        adminToken,
        title: form.get('title'),
        summary: form.get('summary'),
        content: form.get('content'),
        published: form.get('published') === 'on'
      });
      event.currentTarget.reset();
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
    const form = new FormData(event.currentTarget);
    try {
      await rpc('comments.add', {
        postId: selected.post.id,
        authorName: form.get('authorName'),
        content: form.get('content')
      });
      event.currentTarget.reset();
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLike() {
    if (!selected?.post) return;
    try {
      await rpc('posts.like', { postId: selected.post.id });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app-shell">
      <section className="blog-pane">
        <header className="topbar">
          <div>
            <p className="eyebrow">Personal Blog</p>
            <h1>我的个人博客</h1>
          </div>
          <button className="icon-button" onClick={refresh} title="刷新">
            <RefreshCcw size={18} />
          </button>
        </header>

        {error && <div className="alert">{error}</div>}
        {notice && <div className="success">{notice}</div>}

        <div className="content-grid">
          <aside className="post-list" aria-label="文章列表">
            {loading && <p className="muted">正在加载文章...</p>}
            {!loading && posts.length === 0 && <p className="muted">还没有文章，去后台发布第一篇吧。</p>}
            {posts.map((post) => (
              <button
                key={post.id}
                className={`post-row ${post.id === currentPostId ? 'active' : ''}`}
                onClick={() => setSelectedId(post.id)}
              >
                <span className="post-row-title">{post.title}</span>
                <span className="post-row-meta">
                  {post.published ? '已发布' : '草稿'} · {formatDate(post.createdAt)}
                </span>
              </button>
            ))}
          </aside>

          <article className="post-detail">
            {selected?.post ? (
              <>
                <div className="post-heading">
                  <div>
                    <h2>{selected.post.title}</h2>
                    <p className="post-meta">
                      <CalendarDays size={16} /> {formatDate(selected.post.createdAt)}
                    </p>
                  </div>
                  <button className="like-button" onClick={handleLike} title="点赞">
                    <Heart size={18} /> {selected.post.likesCount}
                  </button>
                </div>
                {selected.post.summary && <p className="summary">{selected.post.summary}</p>}
                <div className="post-body">{selected.post.content}</div>

                <section className="comments">
                  <h3>
                    <MessageCircle size={18} /> 评论 {selected.comments?.length || 0}
                  </h3>
                  <form className="comment-form" onSubmit={handleAddComment}>
                    <input name="authorName" placeholder="你的名字" maxLength="40" required />
                    <textarea name="content" placeholder="写下评论" rows="3" required />
                    <button type="submit">
                      <Send size={16} /> 提交评论
                    </button>
                  </form>
                  <div className="comment-list">
                    {(selected.comments || []).map((comment) => (
                      <div className="comment" key={comment.id}>
                        <strong>{comment.authorName}</strong>
                        <span>{formatDate(comment.createdAt)}</span>
                        <p>{comment.content}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <p className="muted">选择一篇文章查看详情。</p>
            )}
          </article>
        </div>
      </section>

      <aside className="admin-pane">
        <div className="admin-header">
          <ShieldCheck size={20} />
          <div>
            <p className="eyebrow">Admin</p>
            <h2>后台发帖</h2>
          </div>
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
          <label>
            标题
            <input name="title" placeholder="文章标题" required />
          </label>
          <label>
            摘要
            <input name="summary" placeholder="一句话摘要" />
          </label>
          <label>
            内容
            <textarea name="content" placeholder="正文内容" rows="10" required />
          </label>
          <label className="checkbox-line">
            <input name="published" type="checkbox" defaultChecked />
            立即发布
          </label>
          <button type="submit">
            <PenLine size={16} /> 发布文章
          </button>
        </form>
      </aside>
    </main>
  );
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

