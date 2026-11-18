// Package admin 提供官方 WebUI 的统计、用户目录、插件源与更新后台。
//
// 后台只读写自己的受管 SQLite；Core 管理数据由浏览器经 Admin API 读取。
// 路由沿用 SDK 的管理会话认证，连接由 SDK 随 Session 关闭。
package admin

import (
	"cmp"
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/AlonaBot/AlonaBot/contracts/manifest"
	"github.com/AlonaBot/AlonaBot/sdk"
	"github.com/AlonaBot/AlonaBot/sdk/message"
	"github.com/AlonaBot/AlonaBot/sdk/sqlitedb"
)

//go:embed schema.sql
var schema string

// New 登记统计观察点、迁移与管理会话路由。
func New() *sdk.Plugin {
	p := sdk.NewPlugin()
	// 1. 先登记受管迁移，首次就绪时保存实际开始采集的时间。
	sqlitedb.Migrations(p, []sqlitedb.Migration{{ID: 1, Up: func(ctx context.Context, tx *sql.Tx) error { _, err := tx.ExecContext(ctx, schema); return err }}})
	p.OnReady(func(ctx context.Context) error {
		db, err := sqlitedb.Open(ctx)
		if err != nil {
			return err
		}
		_, err = db.ExecContext(ctx, "INSERT OR IGNORE INTO observation(key,value) VALUES('observed_since',?)", time.Now().Format(time.RFC3339Nano))
		return err
	})
	// 2. 入站观察点先于等待与命令截断；发送按实际回执记录。
	p.PreEvent("observe.incoming", sdk.MessageCreated).Handle(func(c *sdk.Context, payload *message.CreatedPayload) (*message.CreatedPayload, error) {
		err := recordIncoming(c.Context(), c.Event(), c.User())
		if err != nil {
			slog.ErrorContext(c.Context(), "record incoming statistics failed", "error", err)
		}
		return payload, nil
	})
	p.On("observe.command", sdk.CommandInvoked).Handle(func(c *sdk.Context, payload *message.CommandInvokedPayload) error {
		return recordCommand(c.Context(), c.Event(), payload)
	})
	p.AfterSend("observe.outgoing").Handle(func(c *sdk.Context, to string, result *message.SendResult, sendErr error) error {
		if c.Editing() != "" {
			return nil
		}
		return recordSend(c.Context(), result, sendErr)
	})
	// 3. 管理路由沿用默认认证；抓取连接随插件停止释放。
	p.Route("GET", "/stats").HandleFunc(statisticsHTTP)
	p.Route("GET", "/users").HandleFunc(usersHTTP)
	p.Route("GET", "/changelog/seen").HandleFunc(seenHTTP)
	p.Route("PUT", "/changelog/seen").HandleFunc(seenHTTP)
	client := &http.Client{Transport: http.DefaultTransport.(*http.Transport).Clone()}
	p.OnStop(func(context.Context) error { client.CloseIdleConnections(); return nil })
	store := &catalog{client: client}
	p.Route("GET", "/store").HandleFunc(store.storeHTTP)
	p.Route("GET", "/updates").HandleFunc(store.updatesHTTP)
	return p
}

func transaction(ctx context.Context, fn func(*sql.Tx) error) (err error) {
	db, err := sqlitedb.Open(ctx)
	if err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if e := tx.Rollback(); e != nil && !errors.Is(e, sql.ErrTxDone) {
			err = errors.Join(err, e)
		}
	}()
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func respond(w http.ResponseWriter, value any, err error) {
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		value = map[string]string{"code": "INTERNAL", "safe_message": err.Error()}
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Error("write WebUI response failed", "error", err)
	}
}

func invalid(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	if err := json.NewEncoder(w).Encode(map[string]string{"code": "INVALID_ARGUMENT", "safe_message": err.Error()}); err != nil {
		slog.Error("write WebUI error failed", "error", err)
	}
}

func seenHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		component := r.URL.Query().Get("component")
		if component == "" {
			invalid(w, errors.New("component is required"))
			return
		}
		db, err := sqlitedb.Open(r.Context())
		if err != nil {
			respond(w, nil, err)
			return
		}
		var version *string
		err = db.QueryRowContext(r.Context(), "SELECT version FROM seen_version WHERE component=?", component).Scan(&version)
		if errors.Is(err, sql.ErrNoRows) {
			err = nil
		}
		respond(w, map[string]*string{"version": version}, err)
		return
	}
	var input struct {
		Component string `json:"component"`
		Version   string `json:"version"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		invalid(w, err)
		return
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		invalid(w, errors.New("expected a single JSON object"))
		return
	}
	if input.Component == "" || !manifest.ValidVersion(input.Version) {
		invalid(w, fmt.Errorf("component and a SemVer version are required"))
		return
	}
	err := transaction(r.Context(), func(tx *sql.Tx) error {
		var current string
		err := tx.QueryRowContext(r.Context(), "SELECT version FROM seen_version WHERE component=?", input.Component).Scan(&current)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil && compareVersions(input.Version, current) <= 0 {
			return nil
		}
		_, err = tx.ExecContext(r.Context(), "INSERT INTO seen_version(component,version) VALUES(?,?) ON CONFLICT(component) DO UPDATE SET version=excluded.version", input.Component, input.Version)
		return err
	})
	respond(w, struct{}{}, err)
}

// compareVersions 比较已经校验的 SemVer；数字按位数比较以保留任意精度。
func compareVersions(a, b string) int {
	left, _, _ := strings.Cut(a, "+")
	right, _, _ := strings.Cut(b, "+")
	left, lp, _ := strings.Cut(left, "-")
	right, rp, _ := strings.Cut(right, "-")
	l, r := strings.Split(left, "."), strings.Split(right, ".")
	numeric := func(a, b string) int {
		if order := cmp.Compare(len(a), len(b)); order != 0 {
			return order
		}
		return strings.Compare(a, b)
	}
	for i := range 3 {
		if order := numeric(l[i], r[i]); order != 0 {
			return order
		}
	}
	if lp == rp {
		return 0
	}
	if lp == "" {
		return 1
	}
	if rp == "" {
		return -1
	}
	l, r = strings.Split(lp, "."), strings.Split(rp, ".")
	for i := range min(len(l), len(r)) {
		ln, rn := strings.Trim(l[i], "0123456789") == "", strings.Trim(r[i], "0123456789") == ""
		var order int
		switch {
		case ln && rn:
			order = numeric(l[i], r[i])
		case ln:
			order = -1
		case rn:
			order = 1
		default:
			order = strings.Compare(l[i], r[i])
		}
		if order != 0 {
			return order
		}
	}
	return cmp.Compare(len(l), len(r))
}
