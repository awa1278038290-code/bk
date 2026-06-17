package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")
var ErrUnauthorized = errors.New("unauthorized")
var ErrConflict = errors.New("conflict")

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) ListPosts(ctx context.Context, includeDrafts bool) ([]Post, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, title, summary, content, published, featured, likes_count, favorites_count, comments_count, created_at, updated_at
		FROM posts
		WHERE ($1::boolean OR published = TRUE)
		ORDER BY featured DESC, created_at DESC`, includeDrafts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []Post
	for rows.Next() {
		var post Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.Featured, &post.LikesCount, &post.FavoritesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, rows.Err()
}

func (s *Store) GetPost(ctx context.Context, id int64, includeDrafts bool) (Post, []Comment, error) {
	var post Post
	err := s.db.QueryRow(ctx, `
		SELECT id, title, summary, content, published, featured, likes_count, favorites_count, comments_count, created_at, updated_at
		FROM posts
		WHERE id = $1 AND ($2::boolean OR published = TRUE)`, id, includeDrafts).
		Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.Featured, &post.LikesCount, &post.FavoritesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Post{}, nil, ErrNotFound
		}
		return Post{}, nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, post_id, parent_id, user_id, author_name, content, created_at
		FROM comments
		WHERE post_id = $1
		ORDER BY COALESCE(parent_id, id), parent_id NULLS FIRST, created_at ASC`, id)
	if err != nil {
		return Post{}, nil, err
	}
	defer rows.Close()

	var comments []Comment
	for rows.Next() {
		var comment Comment
		if err := rows.Scan(&comment.ID, &comment.PostID, &comment.ParentID, &comment.UserID, &comment.AuthorName, &comment.Content, &comment.CreatedAt); err != nil {
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
		RETURNING id, title, summary, content, published, featured, likes_count, favorites_count, comments_count, created_at, updated_at`,
		title, summary, content, published).
		Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.Featured, &post.LikesCount, &post.FavoritesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt)
	return post, err
}

func (s *Store) SetFeatured(ctx context.Context, postID int64, featured bool) (Post, error) {
	var post Post
	err := s.db.QueryRow(ctx, `
		UPDATE posts
		SET featured = $2
		WHERE id = $1
		RETURNING id, title, summary, content, published, featured, likes_count, favorites_count, comments_count, created_at, updated_at`, postID, featured).
		Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.Featured, &post.LikesCount, &post.FavoritesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Post{}, ErrNotFound
		}
		return Post{}, err
	}
	return post, nil
}

func (s *Store) Register(ctx context.Context, username, displayName, password string) (Session, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	displayName = strings.TrimSpace(displayName)
	password = strings.TrimSpace(password)
	if username == "" || displayName == "" || len(password) < 4 {
		return Session{}, errors.New("username, display name and password(>=4) are required")
	}

	hash, err := hashPassword(password)
	if err != nil {
		return Session{}, err
	}

	var user User
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (username, display_name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id, username, display_name, created_at`, username, displayName, hash).
		Scan(&user.ID, &user.Username, &user.DisplayName, &user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return Session{}, ErrConflict
		}
		return Session{}, err
	}
	return s.createSession(ctx, user)
}

func (s *Store) Login(ctx context.Context, username, password string) (Session, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	password = strings.TrimSpace(password)
	var user User
	var hash string
	err := s.db.QueryRow(ctx, `
		SELECT id, username, display_name, password_hash, created_at
		FROM users
		WHERE username = $1`, username).
		Scan(&user.ID, &user.Username, &user.DisplayName, &hash, &user.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Session{}, ErrUnauthorized
		}
		return Session{}, err
	}
	if !checkPassword(hash, password) {
		return Session{}, ErrUnauthorized
	}
	return s.createSession(ctx, user)
}

func (s *Store) CurrentUser(ctx context.Context, token string) (User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return User{}, ErrUnauthorized
	}
	var user User
	err := s.db.QueryRow(ctx, `
		SELECT u.id, u.username, u.display_name, u.created_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > NOW()`, token).
		Scan(&user.ID, &user.Username, &user.DisplayName, &user.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrUnauthorized
		}
		return User{}, err
	}
	return user, nil
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, username, display_name, created_at
		FROM users
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.Username, &user.DisplayName, &user.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func (s *Store) AddComment(ctx context.Context, user User, postID int64, parentID *int64, content string) (Comment, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return Comment{}, errors.New("comment is required")
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
	if parentID != nil {
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM comments WHERE id = $1 AND post_id = $2)`, *parentID, postID).Scan(&exists); err != nil {
			return Comment{}, err
		}
		if !exists {
			return Comment{}, ErrNotFound
		}
	}

	var comment Comment
	err = tx.QueryRow(ctx, `
		INSERT INTO comments (post_id, parent_id, user_id, author_name, content)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, post_id, parent_id, user_id, author_name, content, created_at`,
		postID, parentID, user.ID, user.DisplayName, content).
		Scan(&comment.ID, &comment.PostID, &comment.ParentID, &comment.UserID, &comment.AuthorName, &comment.Content, &comment.CreatedAt)
	if err != nil {
		return Comment{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1`, postID); err != nil {
		return Comment{}, err
	}
	return comment, tx.Commit(ctx)
}

func (s *Store) LikePost(ctx context.Context, userID, postID int64) (Post, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Post{}, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, postID, userID)
	if err != nil {
		return Post{}, err
	}
	if tag.RowsAffected() > 0 {
		if _, err := tx.Exec(ctx, `UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1 AND published = TRUE`, postID); err != nil {
			return Post{}, err
		}
	}
	post, err := scanPost(ctx, tx, postID)
	if err != nil {
		return Post{}, err
	}
	return post, tx.Commit(ctx)
}

func (s *Store) FavoritePost(ctx context.Context, userID, postID int64) (Post, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Post{}, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `INSERT INTO post_favorites (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, postID, userID)
	if err != nil {
		return Post{}, err
	}
	if tag.RowsAffected() > 0 {
		if _, err := tx.Exec(ctx, `UPDATE posts SET favorites_count = favorites_count + 1 WHERE id = $1 AND published = TRUE`, postID); err != nil {
			return Post{}, err
		}
	}
	post, err := scanPost(ctx, tx, postID)
	if err != nil {
		return Post{}, err
	}
	return post, tx.Commit(ctx)
}

func (s *Store) SendMessage(ctx context.Context, sender User, receiverID int64, content string) (Message, error) {
	content = strings.TrimSpace(content)
	if receiverID == sender.ID || content == "" {
		return Message{}, errors.New("receiver and message are required")
	}
	var message Message
	err := s.db.QueryRow(ctx, `
		INSERT INTO messages (sender_id, receiver_id, content)
		VALUES ($1, $2, $3)
		RETURNING id, sender_id, receiver_id, content, created_at`, sender.ID, receiverID, content).
		Scan(&message.ID, &message.SenderID, &message.ReceiverID, &message.Content, &message.CreatedAt)
	if err != nil {
		return Message{}, err
	}
	return s.GetMessage(ctx, message.ID)
}

func (s *Store) ListMessages(ctx context.Context, userID int64) ([]Message, error) {
	rows, err := s.db.Query(ctx, `
		SELECT m.id, m.sender_id, su.display_name, m.receiver_id, ru.display_name, m.content, m.created_at
		FROM messages m
		JOIN users su ON su.id = m.sender_id
		JOIN users ru ON ru.id = m.receiver_id
		WHERE m.sender_id = $1 OR m.receiver_id = $1
		ORDER BY m.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var message Message
		if err := rows.Scan(&message.ID, &message.SenderID, &message.SenderName, &message.ReceiverID, &message.ReceiverName, &message.Content, &message.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}
	return messages, rows.Err()
}

func (s *Store) GetMessage(ctx context.Context, id int64) (Message, error) {
	var message Message
	err := s.db.QueryRow(ctx, `
		SELECT m.id, m.sender_id, su.display_name, m.receiver_id, ru.display_name, m.content, m.created_at
		FROM messages m
		JOIN users su ON su.id = m.sender_id
		JOIN users ru ON ru.id = m.receiver_id
		WHERE m.id = $1`, id).
		Scan(&message.ID, &message.SenderID, &message.SenderName, &message.ReceiverID, &message.ReceiverName, &message.Content, &message.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Message{}, ErrNotFound
		}
		return Message{}, err
	}
	return message, nil
}

func (s *Store) createSession(ctx context.Context, user User) (Session, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return Session{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	_, err := s.db.Exec(ctx, `
		INSERT INTO sessions (token, user_id, expires_at)
		VALUES ($1, $2, $3)`, token, user.ID, time.Now().Add(7*24*time.Hour))
	if err != nil {
		return Session{}, err
	}
	return Session{Token: token, User: user}, nil
}

type postScanner interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func scanPost(ctx context.Context, db postScanner, postID int64) (Post, error) {
	var post Post
	err := db.QueryRow(ctx, `
		SELECT id, title, summary, content, published, featured, likes_count, favorites_count, comments_count, created_at, updated_at
		FROM posts
		WHERE id = $1 AND published = TRUE`, postID).
		Scan(&post.ID, &post.Title, &post.Summary, &post.Content, &post.Published, &post.Featured, &post.LikesCount, &post.FavoritesCount, &post.CommentsCount, &post.CreatedAt, &post.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Post{}, ErrNotFound
		}
		return Post{}, err
	}
	return post, nil
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	sum := sha256.Sum256(append(salt, []byte(password)...))
	return hex.EncodeToString(salt) + ":" + hex.EncodeToString(sum[:]), nil
}

func checkPassword(encoded, password string) bool {
	parts := strings.Split(encoded, ":")
	if len(parts) != 2 {
		return false
	}
	salt, err := hex.DecodeString(parts[0])
	if err != nil {
		return false
	}
	expected, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	sum := sha256.Sum256(append(salt, []byte(password)...))
	return subtle.ConstantTimeCompare(expected, sum[:]) == 1
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
