package admin

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/AlonaBot/AlonaBot/contracts/manifest"
	"github.com/AlonaBot/AlonaBot/contracts/pluginindex"
	"github.com/AlonaBot/AlonaBot/contracts/release"
	"github.com/AlonaBot/AlonaBot/sdk/sqlitedb"
)

var repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

// 远端内容不可信；限制整个刷新与单次请求，并分别约束传输、展开和实际保留的内容。
const (
	remoteFetchTimeout   = 20 * time.Second
	remoteMetadataBytes  = 1 << 20
	remoteIndexBytes     = 4 << 20
	remoteArchiveBytes   = 64 << 20
	archiveExpandedBytes = 256 << 20
	archiveFileBytes     = 128 << 20
	archiveEntries       = 2048
	manifestBytes        = 256 << 10
	iconBytes            = 1 << 20
)

type catalog struct{ client *http.Client }
type storeEntry struct {
	Repo        string   `json:"repo"`
	Role        string   `json:"role"`
	Tags        []string `json:"tags"`
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Version     string   `json:"version"`
	Author      string   `json:"author,omitempty"`
	Stars       *int     `json:"stars,omitempty"`
	IconURL     string   `json:"icon_url,omitempty"`
}
type storePage struct {
	Source    string       `json:"source"`
	FetchedAt string       `json:"fetched_at"`
	Stale     bool         `json:"stale"`
	Error     string       `json:"error,omitempty"`
	Items     []storeEntry `json:"items"`
	Total     int          `json:"total"`
}
type latestRelease struct {
	Repo       string `json:"repo"`
	Version    string `json:"version"`
	ReleaseURL string `json:"release_url"`
	Markdown   string `json:"markdown"`
	FetchedAt  string `json:"fetched_at"`
	Stale      bool   `json:"stale"`
	Error      string `json:"error,omitempty"`
}
type githubRelease struct {
	Tag    string `json:"tag_name"`
	URL    string `json:"html_url"`
	Body   string `json:"body"`
	Assets []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

func validRepo(repo string) bool {
	if !repositoryPattern.MatchString(repo) {
		return false
	}
	for _, part := range strings.Split(repo, "/") {
		if part == "." || part == ".." {
			return false
		}
	}
	return true
}

func githubURL(u *url.URL, download bool) bool {
	if u.Scheme != "https" || u.User != nil || u.Fragment != "" {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	switch strings.ToLower(u.Host) {
	case "api.github.com":
		return !download && len(parts) >= 3 && parts[0] == "repos" && validRepo(parts[1]+"/"+parts[2]) && (len(parts) == 3 || len(parts) == 5 && (parts[3] == "releases" && parts[4] == "latest" || parts[3] == "contents" && parts[4] == "index.json"))
	case "github.com":
		return download && len(parts) == 6 && validRepo(parts[0]+"/"+parts[1]) && parts[2] == "releases" && parts[3] == "download"
	case "release-assets.githubusercontent.com", "objects.githubusercontent.com":
		return download && len(parts) == 3 && (parts[0] == "github-production-release-asset" || parts[0] == "github-production-release-asset-2e65be") && strings.Trim(parts[1], "0123456789") == ""
	}
	return false
}

func (c *catalog) get(ctx context.Context, address, accept string) ([]byte, error) {
	u, err := url.Parse(address)
	if err != nil {
		return nil, err
	}
	download := strings.EqualFold(u.Host, "github.com")
	if !githubURL(u, download) {
		return nil, fmt.Errorf("unsupported GitHub URL: %s", address)
	}
	req, err := http.NewRequestWithContext(ctx, "GET", address, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", accept)
	client := *c.client
	client.Timeout = remoteFetchTimeout
	client.CheckRedirect = func(next *http.Request, via []*http.Request) error {
		if !githubURL(next.URL, download) {
			return fmt.Errorf("unsupported GitHub redirect: %s", next.URL)
		}
		if len(via) >= 10 {
			return errors.New("stopped after 10 redirects")
		}
		return nil
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	limit := int64(remoteMetadataBytes)
	if strings.HasSuffix(u.Path, "/contents/index.json") {
		limit = remoteIndexBytes
	} else if download && path.Base(u.Path) != "release.json" {
		limit = remoteArchiveBytes
	}
	raw, readErr := readBounded(response.Body, limit, "GET "+address+" response")
	err = errors.Join(readErr, response.Body.Close())
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, &upstreamError{address: address, status: response.StatusCode, body: string(raw)}
	}
	return raw, nil
}

type upstreamError struct {
	address string
	status  int
	body    string
}

func (e *upstreamError) Error() string {
	return fmt.Sprintf("GET %s: HTTP %d: %s", e.address, e.status, e.body)
}

func readBounded(reader io.Reader, limit int64, label string) ([]byte, error) {
	raw, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > limit {
		return nil, fmt.Errorf("%s exceeds %d bytes", label, limit)
	}
	return raw, nil
}

func (c *catalog) download(ctx context.Context, repo, address string) ([]byte, error) {
	u, err := url.Parse(address)
	if err != nil {
		return nil, err
	}
	if !githubURL(u, true) || !strings.EqualFold(u.Host, "github.com") || !strings.HasPrefix(strings.ToLower(u.Path), "/"+strings.ToLower(repo)+"/releases/download/") {
		return nil, fmt.Errorf("asset URL does not match GitHub repository %s: %s", repo, address)
	}
	return c.get(ctx, address, "application/octet-stream")
}

// cached 在刷新成功后发布完整结果；刷新失败保留上一次成功结果的时间和原错误。
func (c *catalog) cached(ctx context.Context, key string, fetch func(context.Context) ([]byte, error)) (raw []byte, at string, stale bool, fetchErr error, err error) {
	db, err := sqlitedb.Open(ctx)
	if err != nil {
		return nil, "", false, nil, err
	}
	fetchCtx, cancel := context.WithTimeout(ctx, remoteFetchTimeout)
	raw, fetchErr = fetch(fetchCtx)
	cancel()
	if fetchErr == nil {
		at = time.Now().Format(time.RFC3339Nano)
		_, err = db.ExecContext(ctx, "INSERT INTO fetch_cache(key,body,fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,fetched_at=excluded.fetched_at", key, raw, at)
		return raw, at, false, nil, err
	}
	err = db.QueryRowContext(ctx, "SELECT body,fetched_at FROM fetch_cache WHERE key=?", key).Scan(&raw, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", false, fetchErr, fetchErr
	}
	if err != nil {
		return nil, "", false, fetchErr, errors.Join(fetchErr, err)
	}
	return raw, at, true, fetchErr, nil
}

func (c *catalog) publication(ctx context.Context, repo string) (githubRelease, error) {
	var result githubRelease
	raw, err := c.get(ctx, "https://api.github.com/repos/"+repo+"/releases/latest", "application/vnd.github+json")
	if err != nil {
		return result, err
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return result, fmt.Errorf("GitHub release %s: %w", repo, err)
	}
	releaseURL, err := url.Parse(result.URL)
	if err != nil || releaseURL.Scheme != "https" || releaseURL.Host != "github.com" || !strings.HasPrefix(strings.ToLower(releaseURL.Path), "/"+strings.ToLower(repo)+"/releases/") {
		return result, fmt.Errorf("GitHub release %s: invalid release URL %q", repo, result.URL)
	}
	if !manifest.ValidVersion(strings.TrimPrefix(result.Tag, "v")) {
		return result, fmt.Errorf("GitHub release %s: invalid SemVer tag %q", repo, result.Tag)
	}
	return result, nil
}

func (c *catalog) updatesHTTP(w http.ResponseWriter, r *http.Request) {
	repo := r.URL.Query().Get("repo")
	if !validRepo(repo) {
		invalid(w, errors.New("repo must be owner/repo"))
		return
	}
	raw, at, stale, fetchErr, err := c.cached(r.Context(), "release:"+strings.ToLower(repo), func(ctx context.Context) ([]byte, error) {
		publication, err := c.publication(ctx, repo)
		if err != nil {
			return nil, err
		}
		return json.Marshal(latestRelease{Repo: repo, Version: strings.TrimPrefix(publication.Tag, "v"), ReleaseURL: publication.URL, Markdown: publication.Body})
	})
	var upstream *upstreamError
	if errors.As(fetchErr, &upstream) && upstream.status == http.StatusNotFound {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		respond(w, map[string]string{"code": "NO_RELEASE", "safe_message": "No release published"}, nil)
		return
	}
	if err != nil {
		respond(w, nil, err)
		return
	}
	var value latestRelease
	if err := json.Unmarshal(raw, &value); err != nil {
		respond(w, nil, err)
		return
	}
	value.FetchedAt = at
	value.Stale = stale
	if fetchErr != nil {
		value.Error = fetchErr.Error()
	}
	respond(w, value, nil)
}

func (c *catalog) storeHTTP(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	source := q.Get("source")
	if !validRepo(source) {
		invalid(w, errors.New("source must be owner/repo"))
		return
	}
	offset, err := strconv.Atoi(q.Get("offset"))
	if err != nil || offset < 0 {
		invalid(w, errors.New("offset must be an explicit nonnegative integer"))
		return
	}
	limit, err := strconv.Atoi(q.Get("limit"))
	if err != nil || limit <= 0 {
		invalid(w, errors.New("limit must be an explicit positive integer"))
		return
	}
	role := q.Get("role")
	switch role {
	case "", "plugin", "adapter", "agent", "webui":
	default:
		invalid(w, errors.New("unknown component role"))
		return
	}
	raw, at, stale, fetchErr, err := c.cached(r.Context(), "store:"+strings.ToLower(source), func(ctx context.Context) ([]byte, error) {
		// Contents API 省略 ref，读取仓库默认分支；把索引与完整展示快照一起发布。
		indexRaw, err := c.get(ctx, "https://api.github.com/repos/"+source+"/contents/index.json", "application/vnd.github.raw+json")
		if err != nil {
			return nil, err
		}
		index, err := pluginindex.Parse(indexRaw)
		if err != nil {
			return nil, err
		}
		items := []storeEntry{}
		for _, entry := range index.Plugins {
			value, err := c.entry(ctx, entry)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", entry.Repo, err)
			}
			items = append(items, value)
		}
		return json.Marshal(struct {
			Index json.RawMessage `json:"index"`
			Items []storeEntry    `json:"items"`
		}{indexRaw, items})
	})
	if err != nil {
		var upstream *upstreamError
		if errors.As(err, &upstream) && upstream.status == http.StatusNotFound && strings.HasSuffix(upstream.address, "/contents/index.json") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			respond(w, map[string]string{"code": "SOURCE_INDEX_MISSING", "safe_message": err.Error()}, nil)
			return
		}
	}
	if err != nil {
		respond(w, nil, err)
		return
	}
	var snapshot struct {
		Items []storeEntry `json:"items"`
	}
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		respond(w, nil, err)
		return
	}
	items := []storeEntry{}
	search := strings.ToLower(q.Get("q"))
	for _, entry := range snapshot.Items {
		if role != "" && entry.Role != role {
			continue
		}
		if !strings.Contains(strings.ToLower(entry.Name+" "+entry.Description+" "+entry.Repo+" "+entry.Author), search) {
			continue
		}
		items = append(items, entry)
	}
	total := len(items)
	if offset > total {
		offset = total
	}
	end := total
	if limit < total-offset {
		end = offset + limit
	}
	value := storePage{Source: source, FetchedAt: at, Stale: stale, Items: items[offset:end], Total: total}
	if fetchErr != nil {
		value.Error = fetchErr.Error()
	}
	respond(w, value, nil)
}

func (c *catalog) entry(ctx context.Context, entry pluginindex.Plugin) (storeEntry, error) {
	// 1. 解析实际发布清单，核对索引、Release 与包内声明的身份。
	value := storeEntry{Repo: entry.Repo, Role: entry.Role, Tags: entry.Tags}
	if value.Tags == nil {
		value.Tags = []string{}
	}
	publication, err := c.publication(ctx, entry.Repo)
	if err != nil {
		return value, err
	}
	var releaseURL string
	for _, asset := range publication.Assets {
		if asset.Name == "release.json" {
			releaseURL = asset.URL
			break
		}
	}
	if releaseURL == "" {
		return value, errors.New("release.json asset is missing")
	}
	raw, err := c.download(ctx, entry.Repo, releaseURL)
	if err != nil {
		return value, err
	}
	releaseManifest, err := release.Verify(raw, nil, nil)
	if err != nil {
		return value, err
	}
	if !strings.EqualFold(releaseManifest.Source, "github.com/"+entry.Repo) {
		return value, fmt.Errorf("release source %q does not match %s", releaseManifest.Source, entry.Repo)
	}
	if releaseManifest.Version != strings.TrimPrefix(publication.Tag, "v") {
		return value, errors.New("release version does not match GitHub tag")
	}
	archive, err := c.download(ctx, entry.Repo, releaseManifest.Assets[0].URL)
	if err != nil {
		return value, err
	}
	declaration, icon, err := readManifest(archive)
	if err != nil {
		return value, err
	}
	if declaration.ID != releaseManifest.PluginID || declaration.Version != releaseManifest.Version || declaration.Role != entry.Role {
		return value, errors.New("package identity does not match index and release.json")
	}
	// 2. 名称与图标来自包内声明，星数单独读取 GitHub 仓库信息。
	value.ID = declaration.ID
	value.Name = declaration.Name
	value.Description = declaration.Description
	value.Author = declaration.Author
	value.Version = declaration.Version
	if icon != nil {
		mime := map[string]string{".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}[path.Ext(declaration.Icon)]
		value.IconURL = "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(icon)
	}
	raw, err = c.get(ctx, "https://api.github.com/repos/"+entry.Repo, "application/vnd.github+json")
	if err != nil {
		return value, err
	}
	var repository struct {
		Stars *int `json:"stargazers_count"`
	}
	if err := json.Unmarshal(raw, &repository); err != nil {
		return value, err
	}
	value.Stars = repository.Stars
	return value, nil
}

func readManifest(archive []byte) (*manifest.Manifest, []byte, error) {
	declaration, err := archiveFile(archive, "plugin.yaml", manifestBytes)
	if err != nil {
		return nil, nil, err
	}
	parsed, err := manifest.Parse(declaration)
	if err != nil {
		return nil, nil, err
	}
	if parsed.Manifest.Icon == "" {
		return parsed.Manifest, nil, nil
	}
	icon, err := archiveFile(archive, parsed.Manifest.Icon, iconBytes)
	return parsed.Manifest, icon, err
}

// archiveFile 每轮只保留一个目标文件；第二轮按声明取图标，避免缓存全部图片。
func archiveFile(archive []byte, name string, limit int64) ([]byte, error) {
	compressed, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return nil, err
	}
	defer compressed.Close()
	expanded := &io.LimitedReader{R: compressed, N: archiveExpandedBytes + 1}
	reader := tar.NewReader(expanded)
	var content []byte
	for count := 0; ; count++ {
		header, err := reader.Next()
		if expanded.N == 0 {
			return nil, fmt.Errorf("archive expanded content exceeds %d bytes", archiveExpandedBytes)
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}
		if count >= archiveEntries {
			return nil, fmt.Errorf("archive exceeds %d entries", archiveEntries)
		}
		if header.Size > archiveFileBytes {
			return nil, fmt.Errorf("archive file %s exceeds %d bytes", header.Name, archiveFileBytes)
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			continue
		}
		if header.Name == name {
			content, err = readBounded(reader, limit, "archive file "+name)
		} else {
			_, err = io.Copy(io.Discard, reader)
		}
		if expanded.N == 0 {
			return nil, fmt.Errorf("archive expanded content exceeds %d bytes", archiveExpandedBytes)
		}
		if err != nil {
			return nil, err
		}
	}
	return content, nil
}
