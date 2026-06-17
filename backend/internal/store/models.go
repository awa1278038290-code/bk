package store

import "time"

type Post struct {
	ID             int64     `json:"id"`
	Title          string    `json:"title"`
	Summary        string    `json:"summary"`
	Content        string    `json:"content"`
	Published      bool      `json:"published"`
	Featured       bool      `json:"featured"`
	LikesCount     int       `json:"likesCount"`
	FavoritesCount int       `json:"favoritesCount"`
	CommentsCount  int       `json:"commentsCount"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type Comment struct {
	ID         int64     `json:"id"`
	PostID     int64     `json:"postId"`
	ParentID   *int64    `json:"parentId,omitempty"`
	UserID     *int64    `json:"userId,omitempty"`
	AuthorName string    `json:"authorName"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"createdAt"`
}

type User struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Session struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type Message struct {
	ID           int64     `json:"id"`
	SenderID     int64     `json:"senderId"`
	SenderName   string    `json:"senderName"`
	ReceiverID   int64     `json:"receiverId"`
	ReceiverName string    `json:"receiverName"`
	Content      string    `json:"content"`
	CreatedAt    time.Time `json:"createdAt"`
}
