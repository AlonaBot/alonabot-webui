package admin

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/AlonaBot/AlonaBot/contracts/manifest"
	"github.com/AlonaBot/AlonaBot/sdk/sqlitedb"
)

var repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

// 远端内容不可信；限制整个刷新与单次请求，并分别约束传输、展开和实际保留的内容。
const (
	remoteFetchTimeout   = 20 * time.Second
	remoteMetadataBytes  = 1 << 20
	remoteSnapshotBytes  = 32 << 20 // store.json 内联各条目至多 1 MiB 的图标
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
	Counts    storeCounts  `json:"counts"`
}

// storeCounts 按当前搜索统计各角色条目数，与角色过滤无关。
type storeCounts struct {
	All     int `json:"all"`
	Plugin  int `json:"plugin"`
	Adapter int `json:"adapter"`
	Agent   int `json:"agent"`
	WebUI   int `json:"webui"`
}

// storeCheck 是发布插件表单在提交前的只读检查结果。
// 标签不在其中：它们由发布者显式填写，不从缺失字段推测。
type storeCheck struct {
	Repo        string   `json:"repo"`
	Role        string   `json:"role"`
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Version     string   `json:"version"`
	ReleaseURL  string   `json:"release_url"`
	Description string   `json:"description,omitempty"`
	Author      string   `json:"author,omitempty"`
	Warnings    []string `json:"warnings"`
}
type githubRelease struct {
	Tag    string `json:"tag_name"`
	URL    string `json:"html_url"`
	Body   string `json:"body"`
	Assets []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
		Size int64  `json:"size"`
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
		return !download && len(parts) == 5 && parts[0] == "repos" && validRepo(parts[1]+"/"+parts[2]) && parts[3] == "releases" && parts[4] == "latest"
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
	if download {
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
// 不做整次刷新聚合期限：每个 HTTP 请求各自受 remoteFetchTimeout 约束，刷新仍随调用 ctx 取消。
func (c *catalog) cached(ctx context.Context, key string, fetch func(context.Context) ([]byte, error)) (raw []byte, at string, stale bool, fetchErr error, err error) {
	db, err := sqlitedb.Open(ctx)
	if err != nil {
		return nil, "", false, nil, err
	}
	raw, fetchErr = fetch(ctx)
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

// storeSnapshot 是插件源仓库 index 分支上的 store.json，由插件源的 CI 生成。
type storeSnapshot struct {
	Version int          `json:"version"`
	Items   []storeEntry `json:"items"`
}

// snapshotURLs 返回按镜像设置读取 store.json 的地址；auto 同时尝试 GitHub 与 jsDelivr。
// 自定义镜像是 GitHub 加速前缀，拼在 raw.githubusercontent.com 地址之前。
func snapshotURLs(source, mirror string) ([]string, error) {
	raw := "https://raw.githubusercontent.com/" + source + "/index/store.json"
	jsdelivr := "https://cdn.jsdelivr.net/gh/" + source + "@index/store.json"
	switch mirror {
	case "", "auto":
		return []string{raw, jsdelivr}, nil
	case "github":
		return []string{raw}, nil
	case "jsdelivr":
		return []string{jsdelivr}, nil
	}
	u, err := url.Parse(mirror)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("mirror must be auto, github, jsdelivr or an https URL prefix")
	}
	return []string{strings.TrimRight(mirror, "/") + "/" + raw}, nil
}

// refreshStore 读取插件源的静态快照；多个地址并发请求，取第一个成功的结果。
// 全部失败时返回所有地址的错误。
func (c *catalog) refreshStore(ctx context.Context, source, mirror string) ([]byte, error) {
	addresses, err := snapshotURLs(source, mirror)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	type result struct {
		raw []byte
		err error
	}
	results := make(chan result, len(addresses))
	for _, address := range addresses {
		go func() {
			raw, err := c.fetchSnapshot(ctx, address)
			results <- result{raw, err}
		}()
	}
	var errs []error
	for range addresses {
		r := <-results
		if r.err == nil {
			return r.raw, nil
		}
		errs = append(errs, r.err)
	}
	return nil, errors.Join(errs...)
}

func (c *catalog) fetchSnapshot(ctx context.Context, address string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	client := *c.client
	client.Timeout = remoteFetchTimeout
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	raw, readErr := readBounded(response.Body, remoteSnapshotBytes, "GET "+address+" response")
	if err := errors.Join(readErr, response.Body.Close()); err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		return nil, &upstreamError{address: address, status: response.StatusCode, body: string(raw)}
	}
	// 1. 远端内容不可信：只保留格式正确、仓库与角色合法的条目。
	var snapshot storeSnapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, fmt.Errorf("GET %s: parse store.json: %w", address, err)
	}
	if snapshot.Version != 1 {
		return nil, fmt.Errorf("GET %s: unsupported store.json version %d", address, snapshot.Version)
	}
	items := make([]storeEntry, 0, len(snapshot.Items))
	for _, entry := range snapshot.Items {
		switch entry.Role {
		case "plugin", "adapter", "agent", "webui":
		default:
			continue
		}
		if !validRepo(entry.Repo) || entry.ID == "" {
			continue
		}
		if !strings.HasPrefix(entry.IconURL, "data:image/") {
			entry.IconURL = ""
		}
		if entry.Tags == nil {
			entry.Tags = []string{}
		}
		items = append(items, entry)
	}
	return json.Marshal(storeSnapshot{Version: 1, Items: items})
}

// snapshot 只读已持久化的成功快照；没有记录时 found 为 false，不触发任何远端请求。
func (c *catalog) snapshot(ctx context.Context, key string) (raw []byte, at string, found bool, err error) {
	db, err := sqlitedb.Open(ctx)
	if err != nil {
		return nil, "", false, err
	}
	err = db.QueryRowContext(ctx, "SELECT body,fetched_at FROM fetch_cache WHERE key=?", key).Scan(&raw, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", false, nil
	}
	if err != nil {
		return nil, "", false, err
	}
	return raw, at, true, nil
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
	if err != nil || releaseURL.Scheme != "https" || releaseURL.Host != "github.com" || releaseURL.User != nil || releaseURL.RawQuery != "" || releaseURL.Fragment != "" || !strings.EqualFold(strings.TrimSuffix(releaseURL.Path, "/releases/tag/"+result.Tag), "/"+repo) || !strings.HasSuffix(releaseURL.Path, "/releases/tag/"+result.Tag) {
		return result, fmt.Errorf("GitHub release %s: invalid release URL %q", repo, result.URL)
	}
	if !manifest.ValidVersion(strings.TrimPrefix(result.Tag, "v")) {
		return result, fmt.Errorf("GitHub release %s: invalid SemVer tag %q", repo, result.Tag)
	}
	return result, nil
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
	mirror := q.Get("mirror")
	if _, err := snapshotURLs(source, mirror); err != nil {
		invalid(w, err)
		return
	}
	role := q.Get("role")
	switch role {
	case "", "plugin", "adapter", "agent", "webui":
	default:
		invalid(w, errors.New("unknown component role"))
		return
	}
	// sort 缺省与空串都是 stars，其余只接受 name。
	order := q.Get("sort")
	switch order {
	case "", "stars", "name":
	default:
		invalid(w, errors.New("sort must be stars or name"))
		return
	}
	// refresh 只接受字面量 true/false；省略等价于 true，空串是非法值。
	// refresh=false 有成功快照时直接在该快照上筛选，不发远端请求。
	key := "store:" + strings.ToLower(source)
	var raw []byte
	var at string
	var stale bool
	var fetchErr error
	// 省略与 true 等价；"refresh=" 这类空串是非法值，因此要先看参数是否出现。
	refresh, present := q["refresh"]
	if !present {
		refresh = []string{"true"}
	}
	switch refresh[0] {
	case "true":
		if raw, at, stale, fetchErr, err = c.cached(r.Context(), key, func(ctx context.Context) ([]byte, error) { return c.refreshStore(ctx, source, mirror) }); err != nil {
			break
		}
	case "false":
		// 快照读取不刷新：命中即用原 fetched_at，不会产生远端请求，也不带刷新错误。
		var found bool
		raw, at, found, err = c.snapshot(r.Context(), key)
		if err != nil {
			respond(w, nil, err)
			return
		}
		if found {
			break
		}
		// 尚无成功快照时执行正常首次抓取，与 refresh=true 相同。
		raw, at, stale, fetchErr, err = c.cached(r.Context(), key, func(ctx context.Context) ([]byte, error) { return c.refreshStore(ctx, source, mirror) })
	default:
		invalid(w, errors.New("refresh must be true or false"))
		return
	}
	if err != nil {
		var upstream *upstreamError
		if errors.As(err, &upstream) && upstream.status == http.StatusNotFound && strings.HasSuffix(upstream.address, "/store.json") {
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
	// 1. 先按搜索词与角色过滤，计数与总数都取自这一份结果。
	items, total, counts := selectStoreEntries(snapshot.Items, role, q.Get("q"), order)
	if offset > total {
		offset = total
	}
	end := total
	if limit < total-offset {
		end = offset + limit
	}
	value := storePage{Source: source, FetchedAt: at, Stale: stale, Items: items[offset:end], Total: total, Counts: counts}
	if fetchErr != nil {
		value.Error = fetchErr.Error()
	}
	respond(w, value, nil)
}

// selectStoreEntries 按搜索词、角色与排序返回待分页的完整结果，以及过滤后的总数与角色计数。
// 标签一并参与搜索，因此名称、描述、仓库、作者与标签共享同一子串匹配。
func selectStoreEntries(entries []storeEntry, role, query, order string) ([]storeEntry, int, storeCounts) {
	search := strings.ToLower(query)
	counts := storeCounts{}
	items := []storeEntry{}
	for _, entry := range entries {
		fields := append([]string{entry.Name, entry.Description, entry.Repo, entry.Author}, entry.Tags...)
		if !strings.Contains(strings.ToLower(strings.Join(fields, " ")), search) {
			continue
		}
		counts.All++
		switch entry.Role {
		case "plugin":
			counts.Plugin++
		case "adapter":
			counts.Adapter++
		case "agent":
			counts.Agent++
		case "webui":
			counts.WebUI++
		}
		if role != "" && entry.Role != role {
			continue
		}
		items = append(items, entry)
	}
	// 排序在角色过滤之后；stars 缺失排队尾，名称按不区分大小写的升序。
	sort.SliceStable(items, func(i, j int) bool {
		if order == "name" {
			return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
		}
		left, right := items[i].Stars, items[j].Stars
		if left == nil || right == nil {
			return right == nil && left != nil
		}
		return *left > *right
	})
	return items, len(items), counts
}

// 未发布 Release 由 latest 端点的 404 表示；其他资产 404是坏资产，保留原错误。
func (c *catalog) checkHTTP(w http.ResponseWriter, r *http.Request) {
	repo := r.URL.Query().Get("repo")
	if !validRepo(repo) {
		invalid(w, errors.New("repo must be owner/repo"))
		return
	}
	value, err := c.inspect(r.Context(), repo)
	var upstream *upstreamError
	if errors.As(err, &upstream) && upstream.status == http.StatusNotFound && strings.HasSuffix(upstream.address, "/releases/latest") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		respond(w, map[string]string{"code": "NO_RELEASE", "safe_message": "No release published"}, nil)
		return
	}
	if err != nil {
		respond(w, nil, err)
		return
	}
	respond(w, value, nil)
}

// inspect 返回发布前检查所需的展示身份；只读取最新 Release 与包内声明。
// 安装前的平台、入口与受控解压检查由 Core 执行。
func (c *catalog) inspect(ctx context.Context, repo string) (storeCheck, error) {
	value := storeCheck{Repo: repo, Warnings: []string{}}
	publication, declaration, _, err := c.packageArchive(ctx, repo)
	if err != nil {
		return value, err
	}
	value.Role = declaration.Manifest.Role
	// 仓库名用已验证来源的规范大小写：安装请求带的 Source 会被 Core 精确比较。
	value.Repo = strings.TrimPrefix(declaration.Manifest.Source, "github.com/")
	value.ID = declaration.Manifest.ID
	value.Name = declaration.Manifest.Name
	value.Version = declaration.Manifest.Version
	value.ReleaseURL = publication.URL
	value.Description = declaration.Manifest.Description
	value.Author = declaration.Manifest.Author
	if declaration.Warnings != nil {
		value.Warnings = declaration.Warnings
	}
	return value, nil
}

// packageArchive 选择唯一的平台归档，展示信息直接取自与仓库和标签一致的包内声明。
func (c *catalog) packageArchive(ctx context.Context, repo string) (githubRelease, *manifest.Result, []byte, error) {
	publication, err := c.publication(ctx, repo)
	if err != nil {
		return publication, nil, nil, err
	}
	// 商店读取展示信息，优先静态包，再按固定平台顺序选择。
	suffixes := []string{"-any.tar.gz"}
	for _, platform := range manifest.Platforms {
		suffixes = append(suffixes, "-"+platform.OS+"-"+platform.Arch+".tar.gz")
	}
	for _, suffix := range suffixes {
		index := -1
		for i, asset := range publication.Assets {
			if !strings.HasSuffix(asset.Name, suffix) {
				continue
			}
			if index >= 0 {
				return publication, nil, nil, fmt.Errorf("multiple component archives match %s", suffix)
			}
			index = i
		}
		if index < 0 {
			continue
		}
		asset := publication.Assets[index]
		u, err := url.Parse(asset.URL)
		if err != nil || u.RawQuery != "" || u.Fragment != "" || !strings.EqualFold(strings.TrimSuffix(u.Path, "/releases/download/"+publication.Tag+"/"+asset.Name), "/"+repo) || !strings.HasSuffix(u.Path, "/releases/download/"+publication.Tag+"/"+asset.Name) {
			return publication, nil, nil, errors.New("asset URL does not match the release tag and archive name")
		}
		archive, err := c.download(ctx, repo, asset.URL)
		if err != nil {
			return publication, nil, nil, err
		}
		if int64(len(archive)) != asset.Size {
			return publication, nil, nil, errors.New("archive size does not match the GitHub asset")
		}
		declaration, icon, err := readManifest(archive)
		if err != nil {
			return publication, nil, nil, err
		}
		m := declaration.Manifest
		if m.Version != strings.TrimPrefix(publication.Tag, "v") {
			return publication, nil, nil, errors.New("package version does not match the GitHub release tag")
		}
		if !strings.EqualFold(m.Source, "github.com/"+repo) {
			return publication, nil, nil, fmt.Errorf("package source %q does not match repository %s", m.Source, repo)
		}
		platform := m.OS + "-" + m.Arch
		if m.OS == "any" && m.Arch == "any" {
			platform = "any"
		}
		if asset.Name != m.ID+"-"+m.Version+"-"+platform+".tar.gz" {
			return publication, nil, nil, errors.New("archive name does not match the package manifest")
		}
		return publication, declaration, icon, nil
	}
	return publication, nil, nil, errors.New("release has no component archive")
}

func readManifest(archive []byte) (*manifest.Result, []byte, error) {
	declaration, err := archiveFile(archive, "plugin.yaml", manifestBytes)
	if err != nil {
		return nil, nil, err
	}
	parsed, err := manifest.Parse(declaration)
	if err != nil {
		return nil, nil, err
	}
	if parsed.Manifest.Icon == "" {
		return parsed, nil, nil
	}
	icon, err := archiveFile(archive, parsed.Manifest.Icon, iconBytes)
	return parsed, icon, err
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
			if _, err := io.Copy(io.Discard, expanded); err != nil {
				return nil, err
			}
			if expanded.N == 0 {
				return nil, fmt.Errorf("archive expanded content exceeds %d bytes", archiveExpandedBytes)
			}
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
