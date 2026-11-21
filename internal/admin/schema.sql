CREATE TABLE observation (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE processed_event (id TEXT PRIMARY KEY);
CREATE TABLE hour_bucket (hour INTEGER PRIMARY KEY, incoming INTEGER NOT NULL DEFAULT 0, outgoing INTEGER NOT NULL DEFAULT 0, send_errors INTEGER NOT NULL DEFAULT 0);
CREATE TABLE account_bucket (hour INTEGER NOT NULL, instance_id TEXT NOT NULL, incoming INTEGER NOT NULL DEFAULT 0, outgoing INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(hour, instance_id));
CREATE TABLE command_bucket (hour INTEGER NOT NULL, plugin_id TEXT NOT NULL, route_id TEXT NOT NULL, command_name TEXT NOT NULL, result TEXT NOT NULL, count INTEGER NOT NULL, duration_ms INTEGER NOT NULL, PRIMARY KEY(hour, plugin_id, route_id, command_name, result));
CREATE TABLE seen_user (user TEXT PRIMARY KEY, display_name TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
CREATE TABLE seen_version (component TEXT PRIMARY KEY, version TEXT NOT NULL);
CREATE TABLE fetch_cache (key TEXT PRIMARY KEY, body BLOB NOT NULL, fetched_at TEXT NOT NULL);
