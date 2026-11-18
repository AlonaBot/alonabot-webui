package admin

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/AlonaBot/AlonaBot/sdk/message"
	"github.com/AlonaBot/AlonaBot/sdk/sqlitedb"
)

type accountBucket struct {
	InstanceID string `json:"instance_id"`
	Incoming   int64  `json:"incoming"`
	Outgoing   int64  `json:"outgoing"`
}
type commandBucket struct {
	PluginID    string `json:"plugin_id"`
	RouteID     string `json:"route_id"`
	CommandName string `json:"command_name"`
	Result      string `json:"result"`
	Count       int64  `json:"count"`
	DurationMS  int64  `json:"duration_ms"` // 桶内该命令与结果的累计耗时，单位毫秒
}
type hourBucket struct {
	Hour       string          `json:"hour"`
	Incoming   int64           `json:"incoming"`
	Outgoing   int64           `json:"outgoing"`
	SendErrors int64           `json:"send_errors"`
	Accounts   []accountBucket `json:"accounts"`
	Commands   []commandBucket `json:"commands"`
}
type statistics struct {
	Timezone      string       `json:"timezone"`
	ObservedSince string       `json:"observed_since"`
	Buckets       []hourBucket `json:"buckets"`
}
type seenUser struct {
	User        string `json:"user"`
	DisplayName string `json:"display_name"`
	FirstSeenAt string `json:"first_seen_at"`
	LastSeenAt  string `json:"last_seen_at"`
}

// 保留当地小时对应的绝对时刻，夏令时回拨的两个同名小时拥有不同键。
func hourStart(t time.Time) time.Time {
	return t.Add(-time.Duration(t.Minute())*time.Minute - time.Duration(t.Second())*time.Second - time.Duration(t.Nanosecond()))
}

func claimEvent(ctx context.Context, tx *sql.Tx, id string) (bool, error) {
	result, err := tx.ExecContext(ctx, "INSERT OR IGNORE INTO processed_event(id) VALUES(?)", id)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	return n == 1, err
}

func increment(ctx context.Context, tx *sql.Tx, hour int64, instance string, incoming, outgoing, failed int) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO hour_bucket(hour,incoming,outgoing,send_errors) VALUES(?,?,?,?) ON CONFLICT(hour) DO UPDATE SET incoming=incoming+excluded.incoming,outgoing=outgoing+excluded.outgoing,send_errors=send_errors+excluded.send_errors", hour, incoming, outgoing, failed)
	if err != nil {
		return err
	}
	if incoming+outgoing == 0 {
		return nil
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO account_bucket(hour,instance_id,incoming,outgoing) VALUES(?,?,?,?) ON CONFLICT(hour,instance_id) DO UPDATE SET incoming=incoming+excluded.incoming,outgoing=outgoing+excluded.outgoing", hour, instance, incoming, outgoing)
	return err
}

func recordIncoming(ctx context.Context, event *message.Event, user string) error {
	return transaction(ctx, func(tx *sql.Tx) error {
		fresh, err := claimEvent(ctx, tx, event.ID)
		if err != nil || !fresh {
			return err
		}
		if err := increment(ctx, tx, hourStart(event.OccurredAt.In(time.Local)).Unix(), event.AdapterInstanceID, 1, 0, 0); err != nil {
			return err
		}
		if event.Actor == nil || user == "" {
			return nil
		}
		at := event.OccurredAt.UTC().Format("2006-01-02T15:04:05.000000000Z")
		_, err = tx.ExecContext(ctx, `INSERT INTO seen_user(user,display_name,first_seen_at,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(user) DO UPDATE SET display_name=CASE WHEN excluded.last_seen_at>=last_seen_at THEN excluded.display_name ELSE display_name END,first_seen_at=min(first_seen_at,excluded.first_seen_at),last_seen_at=max(last_seen_at,excluded.last_seen_at)`, user, event.Actor.DisplayName, at, at)
		return err
	})
}

func recordCommand(ctx context.Context, event *message.Event, payload *message.CommandInvokedPayload) error {
	return transaction(ctx, func(tx *sql.Tx) error {
		fresh, err := claimEvent(ctx, tx, event.ID)
		if err != nil || !fresh {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO command_bucket(hour,plugin_id,route_id,command_name,result,count,duration_ms) VALUES(?,?,?,?,?,1,?) ON CONFLICT(hour,plugin_id,route_id,command_name,result) DO UPDATE SET count=count+1,duration_ms=duration_ms+excluded.duration_ms`, hourStart(event.OccurredAt.In(time.Local)).Unix(), payload.PluginID, payload.RouteID, payload.CommandName, payload.Result, payload.DurationMS)
		return err
	})
}

func recordSend(ctx context.Context, result *message.SendResult, sendErr error) error {
	outgoing, failed := 0, 0
	instance := ""
	at := time.Now()
	if result != nil {
		instance = result.AdapterInstanceID
		if !result.ProviderAcceptedAt.IsZero() {
			at = result.ProviderAcceptedAt
		}
		if result.Status == message.SendAccepted {
			outgoing = 1
		}
		for _, part := range result.PartResults {
			if part.Status == message.PartAccepted {
				outgoing = 1
			}
		}
	}
	if sendErr != nil {
		failed = 1
	}
	if outgoing+failed == 0 {
		return nil
	}
	return transaction(ctx, func(tx *sql.Tx) error {
		return increment(ctx, tx, hourStart(at.In(time.Local)).Unix(), instance, 0, outgoing, failed)
	})
}

func statisticsHTTP(w http.ResponseWriter, r *http.Request) {
	ranges := map[string]time.Duration{"24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour, "30d": 30 * 24 * time.Hour}
	span, ok := ranges[r.URL.Query().Get("range")]
	if !ok {
		invalid(w, errors.New("range must be 24h, 7d or 30d"))
		return
	}
	value, err := readStatistics(r.Context(), time.Now(), span)
	respond(w, value, err)
}

func readStatistics(ctx context.Context, now time.Time, span time.Duration) (statistics, error) {
	value := statistics{Timezone: time.Local.String(), Buckets: []hourBucket{}}
	err := transaction(ctx, func(tx *sql.Tx) error {
		// 1. 时窗与采集起点共同限定真实观测区间，小时键保留绝对时间。
		if err := tx.QueryRowContext(ctx, "SELECT value FROM observation WHERE key='observed_since'").Scan(&value.ObservedSince); err != nil {
			return err
		}
		start, end := hourStart(now.Add(-span)), hourStart(now)
		observed, err := time.Parse(time.RFC3339Nano, value.ObservedSince)
		if err != nil {
			return err
		}
		if first := hourStart(observed.In(time.Local)); first.After(start) {
			start = first
		}

		positions := map[int64]int{}
		for at := start; !at.After(end); at = at.Add(time.Hour) {
			positions[at.Unix()] = len(value.Buckets)
			value.Buckets = append(value.Buckets, hourBucket{Hour: at.In(time.Local).Format(time.RFC3339), Accounts: []accountBucket{}, Commands: []commandBucket{}})
		}
		// 2. 在同一快照内依次填充总量、账号与命令，空小时保留真实零值。
		rows, err := tx.QueryContext(ctx, "SELECT hour,incoming,outgoing,send_errors FROM hour_bucket WHERE hour>=? AND hour<=? ORDER BY hour", start.Unix(), end.Unix())
		if err != nil {
			return err
		}
		for rows.Next() {
			var hour int64
			var in, out, failed int64
			if err := rows.Scan(&hour, &in, &out, &failed); err != nil {
				rows.Close()
				return err
			}
			bucket := &value.Buckets[positions[hour]]
			bucket.Incoming = in
			bucket.Outgoing = out
			bucket.SendErrors = failed
		}
		if err := errors.Join(rows.Err(), rows.Close()); err != nil {
			return err
		}
		rows, err = tx.QueryContext(ctx, "SELECT hour,instance_id,incoming,outgoing FROM account_bucket WHERE hour>=? AND hour<=? ORDER BY hour,instance_id", start.Unix(), end.Unix())
		if err != nil {
			return err
		}
		for rows.Next() {
			var hour int64
			var account accountBucket
			if err := rows.Scan(&hour, &account.InstanceID, &account.Incoming, &account.Outgoing); err != nil {
				rows.Close()
				return err
			}
			bucket := &value.Buckets[positions[hour]]
			bucket.Accounts = append(bucket.Accounts, account)
		}
		if err := errors.Join(rows.Err(), rows.Close()); err != nil {
			return err
		}
		rows, err = tx.QueryContext(ctx, "SELECT hour,plugin_id,route_id,command_name,result,count,duration_ms FROM command_bucket WHERE hour>=? AND hour<=? ORDER BY hour,plugin_id,route_id,command_name,result", start.Unix(), end.Unix())
		if err != nil {
			return err
		}
		for rows.Next() {
			var hour int64
			var command commandBucket
			if err := rows.Scan(&hour, &command.PluginID, &command.RouteID, &command.CommandName, &command.Result, &command.Count, &command.DurationMS); err != nil {
				rows.Close()
				return err
			}
			bucket := &value.Buckets[positions[hour]]
			bucket.Commands = append(bucket.Commands, command)
		}
		return errors.Join(rows.Err(), rows.Close())
	})
	return value, err
}

func usersHTTP(w http.ResponseWriter, r *http.Request) {
	users := []seenUser{}
	db, err := sqlitedb.Open(r.Context())
	if err != nil {
		respond(w, nil, err)
		return
	}
	rows, err := db.QueryContext(r.Context(), "SELECT user,display_name,first_seen_at,last_seen_at FROM seen_user ORDER BY user")
	if err != nil {
		respond(w, nil, err)
		return
	}
	for rows.Next() {
		var user seenUser
		if err := rows.Scan(&user.User, &user.DisplayName, &user.FirstSeenAt, &user.LastSeenAt); err != nil {
			rows.Close()
			respond(w, nil, err)
			return
		}
		users = append(users, user)
	}
	respond(w, users, errors.Join(rows.Err(), rows.Close()))
}
