# 质量评分

## 评分标准

- `A`：覆盖完整、行为稳定、文档清楚、运行风险低。
- `B`：整体可接受，但还有明确短板。
- `C`：能用，但需要针对性补强。
- `D`：脆弱、缺少规范，或很多行为尚未定义。

## 当前水位

| 区域 | 评分 | 原因 | 下一步 |
| --- | --- | --- | --- |
| 产品面 | B | 已经有 Swift 本地 `computer-use` MCP server、默认 app 模式权限引导，以及共享的 9 个核心 tools；macOS 另有 query、select_text，JS 可调用。 | 继续收敛复杂 AX 场景下的 state rendering 细节、权限 UI 和更清晰的用户错误提示。 |
| Windows runtime | C | 已新增独立 Go `.exe`，通过 Windows UI Automation + Win32 window message 暴露同样 9 个核心 tools 和显式 launch_app、MCP server 和 `call --calls`；默认不再自动启动 app、执行 `SetFocus`，或让 `type_text` 走可能抢前台的 UIA text fallback；截图会过滤隐藏、最小化、cloaked、离屏和退化窗口，并在 Go 层复核 PNG，但整体仍是功能性第一版。 | 维护 WPF 观察 / 输入 / 截图边界 fixture 和 Windows PR smoke，扩展更多工具与 toolkit；补 installer/signing，以及更原生的 Go UIA 实现或更稳定的 bridge。 |
| Linux runtime | C | 已新增独立 Go binary，通过 Python GI / AT-SPI2 暴露同样 9 个核心 tools 和显式 launch_app、MCP server 和 `call --calls`，并增加 Linux 窗口 ID 的 AX/语义绑定及已通过隔离 GTK 验证的焦点/索引文本输入、前后文选区、逐字符按键和 X11 文本/HTML 剪贴板粘贴；Ubuntu GNOME VM 已跑通 `list_apps`、MCP tools list 和 Text Editor 8-tool sequence，并已接入 npm bundled artifact 分发，截图、基本点击及窗口内拖拽已通过本地非合成 X11 窗口像素和接收事件验证，拖拽途中 reset/close 的释放也已验证，按住点击和定时按键/组合键已有接收端持续时间、修饰键状态与取消释放实测，坐标/索引滚轮也已验证真实 GTK 滚动容器偏移与焦点隔离，原生操作取消已传递到子进程并有 reset/close、CLI 终止和父进程死亡验证，GIO 桌面 ID/文件路径和精确显示名称启动已通过两种 JS 会话的真实 GTK 生命周期验证，D-Bus 激活回复、服务复用、失败回传和等待中的 helper 回收也已实测，XComposite 后台/遮挡/部分离屏截图与 alpha 已通过真实 xcompmgr 的隔离 GTK 验证，Openbox 带装饰/重挂载的 RGB/ARGB 混合深度 frame 与尺寸变化、重新映射已有双会话像素验证，原生 ShapeBounding 的缺口、透明度和恢复已有三种布局双会话验证，Shape 物理输入的 Bounding/Input 区域、按下前拖拽路径拒绝、实际接收事件及 reset/close 释放也已接通，事件触发的 Input 区域变化已有停止、释放与恢复验证，取消清理补充了有界逻辑键图确认，合成 X11 输入已接通并加入 Openbox 的带装饰窗口、被动抓取重放与取消释放验证，真实桌面合成器与 Wayland 图像仍待补齐，coordinate input 也不是通用后台模型。 | 扩展已有的隔离 GTK 动作回读 smoke，补完整工具覆盖、portal/真实桌面合成器与更广 provider/子窗口输入校验，以及更原生的 Go D-Bus/libatspi bridge。 |
| macOS Locked Use | D | 已有签名 Broker / 插件、双进程保护、原生租约与恢复入口，离线和遮罩 rehearsal 有回归；安装恢复和无许可双保护释放已实测，独立无遮罩 Return 解锁 / 重锁已实测，受保护自动解锁 / AX / SCK / 重锁及隔离 legacy Keychain 已有一轮实测通过，完整会话认证状态 / 故障链路尚未通过实测；正常启用改为管理员 enable 与签名校验，普通 enable / 正常 MCP 的完整 GUI 闭环已实测。 | 物理覆盖已确认，继续完成 Data Protection / 会话认证状态、Secure Input / 崩溃 / 显示器故障回归及正式发布制品检查。 |
| 架构文档 | B | 顶层结构、fixture bridge、app 模式和验证路径已经落文档；浏览器独立源安装、依赖暂存与已安装 MCP 的验证路径已补充；独立 npm tarball 的本地/全局安装和 macOS/Linux 真实浏览器验证已完成；浏览器发现阶段的弹窗捕获、popup 动作所有权和观察器恢复已通过两种 JS 会话实测；活动弹窗断线后的身份保留、禁止复用和外部关闭后的恢复路径也已实测；popup 下载归属、隔离及取消也已有 macOS/Linux 双会话验证；WebMCP 取消改为等待原生调用结束，已有延迟确认检查与 Chrome 158 双会话 turn/reset/close 实测；已获取工具的原生 frame 增删事件可合并提示到两种 JS 会话的后续返回，已有主页面、iframe、OOP frame 和无关 tab 隔离实测；绑定或复用 tab 时可独立发现初始工具、导航和后加 frame，并通过 Chrome 158 双会话及 Chrome 156 普通绑定回归。 | 后续补 release artifact、code signing / notarization 和 host 集成方式。 |
| 测试 | B | `swift test` + smoke suite 已覆盖 9 个 tools 的回归，并新增了针对“前台焦点是否被抢占”的手工对比样本沉淀；浏览器发现前置监听、popup 所有权、跨会话保留和 reset/close 回收已有 macOS/Linux 实测。 | 增加更多普通 app 的录制回归，减少只依赖 fixture 和一次性手工检查。 |
| 可观测性 | C | 已有 `doctor`、`snapshot`、smoke 输出，以及一组仓库内留档的官方 `computer-use` / 本仓库实现对比样本。 | 补统一日志级别、失败上下文和 release artifact 里的诊断信息，把一次性样本收敛成可重复采集流程。 |
| 安全 | B | 已明确本地-only、权限边界和 fixture test bridge 的作用域，并将内置 denylist 收缩到密码管理器。 | 增加 session approval 和更清楚的敏感 app policy，避免策略长期硬编码在仓库里。 |
