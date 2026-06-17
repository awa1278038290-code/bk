INSERT INTO posts (title, summary, content, published)
SELECT *
FROM (VALUES
(
    '第一篇博客',
    '这是个人博客系统的示例文章。',
    '欢迎来到你的个人博客。你可以在后台发布文章，在前台查看文章、评论和点赞。',
    TRUE
)
) AS seed(title, summary, content, published)
WHERE NOT EXISTS (SELECT 1 FROM posts);
