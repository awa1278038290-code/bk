package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"personal-blog/backend/internal/store"
)

type Server struct {
	store      *store.Store
	adminToken string
}

func NewServer(store *store.Store, adminToken string) *Server {
	return &Server{store: store, adminToken: adminToken}
}

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
	ID      any             `json:"id"`
}

type response struct {
	JSONRPC string    `json:"jsonrpc"`
	Result  any       `json:"result,omitempty"`
	Error   *rpcError `json:"error,omitempty"`
	ID      any       `json:"id"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type authParams struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
	Token       string `json:"token"`
}

type createPostParams struct {
	AdminToken string `json:"adminToken"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Content    string `json:"content"`
	Published  bool   `json:"published"`
}

type getPostParams struct {
	ID         int64  `json:"id"`
	AdminToken string `json:"adminToken"`
}

type addCommentParams struct {
	Token    string `json:"token"`
	PostID   int64  `json:"postId"`
	ParentID *int64 `json:"parentId"`
	Content  string `json:"content"`
}

type postActionParams struct {
	Token      string `json:"token"`
	AdminToken string `json:"adminToken"`
	PostID     int64  `json:"postId"`
	Featured   bool   `json:"featured"`
}

type messageParams struct {
	Token      string `json:"token"`
	ReceiverID int64  `json:"receiverId"`
	Content    string `json:"content"`
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeRPC(w, nil, nil, -32600, "only POST is allowed")
		return
	}

	var req request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeRPC(w, nil, nil, -32700, "invalid JSON")
		return
	}

	result, code, message := s.handle(r.Context(), req)
	if code != 0 {
		writeRPC(w, req.ID, nil, code, message)
		return
	}
	writeRPC(w, req.ID, result, 0, "")
}

func (s *Server) handle(ctx context.Context, req request) (any, int, string) {
	switch req.Method {
	case "auth.register":
		var params authParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		session, err := s.store.Register(ctx, params.Username, params.DisplayName, params.Password)
		return resultOrError(session, err)
	case "auth.login":
		var params authParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		session, err := s.store.Login(ctx, params.Username, params.Password)
		return resultOrError(session, err)
	case "auth.me":
		var params authParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		user, err := s.store.CurrentUser(ctx, params.Token)
		return resultOrError(user, err)
	case "users.list":
		users, err := s.store.ListUsers(ctx)
		return resultOrError(users, err)
	case "posts.list":
		posts, err := s.store.ListPosts(ctx, s.hasAdminToken(req.Params))
		return resultOrError(posts, err)
	case "posts.get":
		var params getPostParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		post, comments, err := s.store.GetPost(ctx, params.ID, s.validAdminToken(params.AdminToken))
		if err != nil {
			return resultOrError(nil, err)
		}
		return map[string]any{"post": post, "comments": comments}, 0, ""
	case "posts.create":
		var params createPostParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		if !s.validAdminToken(params.AdminToken) {
			return nil, -32001, "invalid admin token"
		}
		post, err := s.store.CreatePost(ctx, params.Title, params.Summary, params.Content, params.Published)
		return resultOrError(post, err)
	case "posts.like":
		var params postActionParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		user, err := s.store.CurrentUser(ctx, params.Token)
		if err != nil {
			return resultOrError(nil, err)
		}
		post, err := s.store.LikePost(ctx, user.ID, params.PostID)
		return resultOrError(post, err)
	case "posts.favorite":
		var params postActionParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		user, err := s.store.CurrentUser(ctx, params.Token)
		if err != nil {
			return resultOrError(nil, err)
		}
		post, err := s.store.FavoritePost(ctx, user.ID, params.PostID)
		return resultOrError(post, err)
	case "posts.feature":
		var params postActionParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		if !s.validAdminToken(params.AdminToken) {
			return nil, -32001, "invalid admin token"
		}
		post, err := s.store.SetFeatured(ctx, params.PostID, params.Featured)
		return resultOrError(post, err)
	case "comments.add":
		var params addCommentParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		user, err := s.store.CurrentUser(ctx, params.Token)
		if err != nil {
			return resultOrError(nil, err)
		}
		comment, err := s.store.AddComment(ctx, user, params.PostID, params.ParentID, params.Content)
		return resultOrError(comment, err)
	case "messages.send":
		var params messageParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		user, err := s.store.CurrentUser(ctx, params.Token)
		if err != nil {
			return resultOrError(nil, err)
		}
		message, err := s.store.SendMessage(ctx, user, params.ReceiverID, params.Content)
		return resultOrError(message, err)
	case "messages.list":
		var params messageParams
		if err := decodeParams(req.Params, &params); err != nil {
			return nil, -32602, err.Error()
		}
		user, err := s.store.CurrentUser(ctx, params.Token)
		if err != nil {
			return resultOrError(nil, err)
		}
		messages, err := s.store.ListMessages(ctx, user.ID)
		return resultOrError(messages, err)
	default:
		return nil, -32601, "method not found"
	}
}

func decodeParams(raw json.RawMessage, target any) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return json.Unmarshal(raw, target)
}

func resultOrError(result any, err error) (any, int, string) {
	if err == nil {
		return result, 0, ""
	}
	if errors.Is(err, store.ErrNotFound) {
		return nil, -32004, "resource not found"
	}
	if errors.Is(err, store.ErrUnauthorized) {
		return nil, -32001, "please login first"
	}
	if errors.Is(err, store.ErrConflict) {
		return nil, -32009, "resource already exists"
	}
	return nil, -32000, err.Error()
}

func writeRPC(w http.ResponseWriter, id any, result any, code int, message string) {
	resp := response{JSONRPC: "2.0", ID: id}
	if code != 0 {
		resp.Error = &rpcError{Code: code, Message: message}
	} else {
		resp.Result = result
	}
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) hasAdminToken(raw json.RawMessage) bool {
	var params map[string]any
	if len(raw) == 0 || json.Unmarshal(raw, &params) != nil {
		return false
	}
	token, _ := params["adminToken"].(string)
	return s.validAdminToken(token)
}

func (s *Server) validAdminToken(token string) bool {
	return s.adminToken != "" && strings.TrimSpace(token) == s.adminToken
}

func ToInt64(value string) (int64, error) {
	return strconv.ParseInt(value, 10, 64)
}
