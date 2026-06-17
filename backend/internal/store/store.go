package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) ListPosts(ctx context.Context, includeDrafts bool) ([]Post, error) {
	query := `
		SELECT id, title, summary, content, published, likes_count, comments_count, created_at, updated_at
		FROM posts
		WHERE ($1::boolean OR published = TRUE)
		ORDER BY created_at DESC`

	rows, err := s.db.Query(ctx, query, includeDrafts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var post Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.LikesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}

func (s *Store) GetPost(ctx context.Context, id int64, includeDrafts bool) (Post, []Comment, error) {
	var post Post
	err := s.db.QueryRow(ctx, `
		SELECT id, title, summary, content, published, likes_count, comments_count, created_at, updated_at
		FROM posts
		WHERE id = $1 AND ($2::boolean OR published = TRUE)`, id, includeDrafts).
		Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.LikesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Post{}, nil, ErrNotFound
		}
		return Post{}, nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, post_id, author_name, content, created_at
		FROM comments
		WHERE post_id = $1
		ORDER BY created_at ASC`, id)
	if err != nil {
		return Post{}, nil, err
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var comment Comment
		if err := rows.Scan(&comment.ID, &comment.PostID, &comment.AuthorName, &comment.Content, &comment.CreatedAt); err != nil {
			return Post{}, nil, err
		}
		comments = append(comments, comment)
	}
	return post, comments, rows.Err()
}

func (s *Store) CreatePost(ctx context.Context, title, summary, content string, published bool) (Post, error) {
	title = strings.TrimSpace(title)
	summary = strings.TrimSpace(summary)
	content = strings.TrimSpace(content)
	if title == "" || content == "" {
		return Post{}, errors.New("title and content are required")
	}

	var post Post
	err := s.db.QueryRow(ctx, `
		INSERT INTO posts (title, summary, content, published)
		VALUES ($1, $2, $3, $4)
		RETURNING id, title, summary, content, published, likes_count, comments_count, created_at, updated_at`,
		title, summary, content, published).
		Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.LikesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt)
	return post, err
}

func (s *Store) AddComment(ctx context.Context, postID int64, authorName, content string) (Comment, error) {
	authorName = strings.TrimSpace(authorName)
	content = strings.TrimSpace(content)
	if authorName == "" || content == "" {
		return Comment{}, errors.New("name and comment are required")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Comment{}, err
	}
	defer tx.Rollback(ctx)

	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM posts WHERE id = $1 AND published = TRUE)`, postID).Scan(&exists); err != nil {
		return Comment{}, err
	}
	if !exists {
		return Comment{}, ErrNotFound
	}

	var comment Comment
	err = tx.QueryRow(ctx, `
		INSERT INTO comments (post_id, author_name, content)
		VALUES ($1, $2, $3)
		RETURNING id, post_id, author_name, content, created_at`,
		postID, authorName, content).
		Scan(&comment.ID, &comment.PostID, &comment.AuthorName, &comment.Content, &comment.CreatedAt)
	if err != nil {
		return Comment{}, err
	}

	if _, err := tx.Exec(ctx, `UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1`, postID); err != nil {
		return Comment{}, err
	}
	return comment, tx.Commit(ctx)
}

func (s *Store) LikePost(ctx context.Context, postID int64) (Post, error) {
	var post Post
	err := s.db.QueryRow(ctx, `
		UPDATE posts
		SET likes_count = likes_count + 1
		WHERE id = $1 AND published = TRUE
		RETURNING id, title, summary, content, published, likes_count, comments_count, created_at, updated_at`, postID).
		Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.LikesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return Post{}, err
		}
		return Post{}, ErrNotFound
	}
	return post, nil
}
