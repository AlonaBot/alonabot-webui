// Package admin 提供官方组件的公开构造入口。
package admin

import (
	"github.com/AlonaBot/AlonaBot/sdk"
	implementation "github.com/AlonaBot/alonabot-webui/internal/admin"
)

// New 创建独立组件并登记其业务行为。
func New() *sdk.Plugin {
	p := sdk.NewPlugin()
	implementation.Register(p)
	return p
}
