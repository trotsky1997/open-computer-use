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
| 架构文档 | B | 顶层结构、fixture bridge、app 模式和验证路径已经落文档；浏览器独立源安装、依赖暂存与已安装 MCP 的验证路径已补充；独立 npm tarball 的本地/全局安装和 macOS/Linux 真实浏览器验证已完成；浏览器发现阶段的弹窗捕获、popup 动作所有权和观察器恢复已通过两种 JS 会话实测；活动弹窗断线后的身份保留、禁止复用和外部关闭后的恢复路径也已实测；popup 下载归属、隔离及取消也已有 macOS/Linux 双会话验证；WebMCP 取消改为等待原生调用结束，已有延迟确认检查与 Chrome 158 双会话 turn/reset/close 实测；已获取工具的原生 frame 增删事件可合并提示到两种 JS 会话的后续返回，已有主页面、iframe、OOP frame 和无关 tab 隔离实测；绑定或复用 tab 时可独立发现初始工具、导航和后加 frame，并通过 Chrome 158 双会话及 Chrome 156 普通绑定回归；WebMCP 的 Linux arm64 双会话和 renderer 崩溃后的 reset、新 tab 调用恢复和原 tab 重载、发现及新句柄调用也已验证；OOP 子进程崩溃时的主调用存活、取消以及移除死 frame 后的原 tab 工具恢复已通过双系统双会话实测；死 frame 保持挂载时可返回明确标注的部分清单并调用健康主页面工具；发现和工具快照均改为不暂停新目标的原生 CDP 连接，连续导航、OOP 嵌套 frame、保留快照和取消回归已通过双系统双会话验证；本机可确认身份的浏览器退出后，主页面和跨进程 frame 的读取、工具调用及新浏览器恢复已有双系统双会话实测，单纯断线仍保留未确认调用。 | 后续补 release artifact、code signing / notarization 和 host 集成方式。 |
| 测试 | B | `swift test` + smoke suite 已覆盖 9 个 tools 的回归，并新增了针对“前台焦点是否被抢占”的手工对比样本沉淀；浏览器发现前置监听、popup 所有权、跨会话保留和 reset/close 回收已有 macOS/Linux 实测。 | 跟踪原生内联注册挂起：已有独立 CDP 复现，加载后注册的完整夹具已通过双系统。拖拽已接入宿主输入租约和取消清理；Linux 后台截图需显式启用 CDPScreenshotNewSurface，AX 点位已隔离页面原型/实例篡改，并在每次按下前复核移入后的命中与身份，普通点击与拖拽共 53 个场景已有双系统验证，文本输入另有 21 个原生焦点、取消和释放重试场景，索引按键新增 10 个焦点及组合键中途变化场景，粘贴新增 27 个原生输入生命周期与剪贴板写入隔离场景。剪贴板在双系统上各有双会话合计 8 个断线完成确认场景及 8 个本机浏览器退出恢复场景，未确认任务保留输入拦截；宿主崩溃和完成上下文销毁后的恢复仍待实现。普通点击、拖拽、按键和文本输入新增双系统各 16 个浏览器退出回收场景，覆盖离线及同端口替换和本地焦点连接释放。固定调试端口的本机身份核验与退出回收也已覆盖缺失实例文件的启动方式。继续补默认引擎路径和 headful/Windows。增加更多普通 app 的录制回归，减少只依赖 fixture 和一次性手工检查。 |
| 可观测性 | C | 已有 `doctor`、`snapshot`、smoke 输出，以及一组仓库内留档的官方 `computer-use` / 本仓库实现对比样本。 | 补统一日志级别、失败上下文和 release artifact 里的诊断信息，把一次性样本收敛成可重复采集流程。 |
| 安全 | B | 已明确本地-only、权限边界和 fixture test bridge 的作用域，并将内置 denylist 收缩到密码管理器。 | 增加 session approval 和更清楚的敏感 app policy，避免策略长期硬编码在仓库里。 |

托管 headless Chromium 已接入宿主：按需启动、私有 profile/默认下载、reset/turn 保留、宿主退出及守护进程丢失回收。双系统源码与安装入口验证见 [managed browser](managed-browser.md)。Linux Xvfb/Openbox 上已验证显式 headful 模式与多窗口 visibility get/set、后台建页、reset/turn 状态及退出回收；物理桌面、macOS headful、Windows 与启动期宿主、守护进程同时丢失的持久恢复仍待补齐。

WebMCP 发现已覆盖配置浏览器中的未绑定 HTTP(S) 页面及后续创建、导航、关闭，保持 turn 归属和 128 页预算；源码及源码移除后的安装模块已有双系统双会话实测，发现阶段的调用计数与标签页归属保持不变。真实 consent、headful/Windows 与外部站点覆盖仍待补齐。

托管 headful 浏览器已支持系统/显示会话剪贴板与原生 text/HTML/PNG 粘贴；只允许匹配宿主当前 endpoint/socket/进程身份的浏览器。Linux 隔离 Gtk/X11 双会话、源码移除后的安装模块及真实 MCP 已验证原生互通、隐藏 helper、外部客户端拒绝和断线/reset 恢复。物理桌面/macOS、Windows、跨宿主协调与用户接管仍待验证；系统剪贴板数据可被其他应用修改，也可能在宿主退出后保留。

托管 headful 的无窗口恢复已覆盖 Linux 源码/双会话、源码移除后的安装模块与真实 MCP：后台/默认隐藏/可见建页、空窗显示、同进程/profile 的会话 cookie 和剪贴板保留均通过。宿主退出仍回收整个临时 profile；物理桌面、macOS headful 与 Windows 尚待验证。

用户标签页已支持原生 openTabs 元数据和本宿主会话独占 claimTab/getTab/selected，原页面释放保留、跨轮标记、旧句柄拒绝、未确认关闭占有和已有/空闲期子页保护均已接入。macOS/Linux Chrome 158 双会话及源码移除后的安装入口通过接管夹具；Node 为 macOS 193/193、Linux 192/193（一个 macOS 专属跳过）。双系统现有剪贴板、会话选择和完整弹窗恢复回归通过；Linux 安装入口的 headful/原生剪贴板/空窗恢复/MCP 回归通过。跨宿主、原始 CDP 客户端、浏览器全局操作仲裁及物理用户接管仍待实现，完整 parity 目标继续推进。

标签页租约已扩展到同机同 OS 用户的独立宿主进程，endpoint 别名共享浏览器实例命名空间。原子发布、匹配代次释放、创建 nonce 和 opener 后代保护已接入；宿主崩溃后继续占有，等待后续原生动作确认恢复。macOS/Linux 双会话的独立进程与安装后夹具通过接管、原页面内容、popup、handoff、竞争和 SIGKILL/reset 验证；Node 为 macOS 197/197、Linux 196/197（一个平台专属跳过）。npm browser-only 制品和双份模块包含检查通过。未占有的已有/空闲子页会跟随外部 opener 保持拦截；跨机器、全局管理、原始客户端、物理用户接管、Windows 和原生崩溃恢复仍待补齐。

原生管理写入已接入同机布局屏障、受影响窗口租约和写入前布局指纹复核；跨进程外部租约冲突不会留下部分新租约或写审计。建页、接管与显式/清理关闭经过屏障，已占用页的观察与输入可继续。macOS/Linux 双会话源码和安装入口通过 tab/group/window 拒绝、独立后台窗口/书签、原生写入超时确认及 SIGKILL/reset 新建页拦截；组织流程、worker 重启/空闲、弹窗、剪贴板、会话选择和 Linux 安装后的 headful/MCP 回归通过。Node 为 macOS 200/200、Linux 199/200（一个平台专属跳过）。扩展协议升级为 5；未知原生完成仍需浏览器重启恢复，visibility、原始/物理/page-driven 协调、跨机器和 Windows 仍待补齐。

托管 headful visibility 已接入同机布局屏障和全窗口页面租约，写入前复核 target/window/bounds；队列准备可取消，已发动作等待确认，未知完成会停止 JS 并持续拦截到原浏览器进程退出。Linux 隔离 Xvfb/Openbox 双会话源码与安装入口通过跨宿主/同宿主拒绝、原生映射/缓存保持、布局变化拒绝、实际最小化后的延迟确认、超时期间建页拦截和丢失回执后的退出/重置/新实例恢复。原有 GTK 剪贴板、cookies、空窗、MCP 和生命周期回归通过；macOS/Linux Node 为 204/204、203/204（一个平台专属跳过）。物理桌面/macOS headful、Windows、外部/原始/物理 actor、跨机器及原生崩溃接管继续待补。


Locator 与文件选择动作已按活动时间计时：等待归属明确的 JavaScript 弹窗时暂停，
关闭后恢复剩余预算，连续 prompt 同样适用。通过固定版本 Playwright 的公开
AbortSignal 执行超时与清理取消，timeout=0 仍支持会话取消；原生连接和焦点清理
保持完成确认。macOS/Linux 双会话源码与源码移除后的安装入口通过 >10s 确认框、
连续弹窗、文件选择、恢复导航失败及无限动作重置清理；原有弹窗、剪贴板和 Linux
隔离 headful/MCP 回归通过。Node 为 207/207、206/207（一个平台专属跳过），
browser-only npm build/pack 内容检查通过。跨进程既有弹窗观察初始化、原始 CDP /
drop / 导航等待的计时协调、物理 macOS headful 与 Windows 继续待补。


浏览器清单已与页面观察初始化解耦；已有弹窗导致 Page.enable 阻塞时，其他宿主仍可
读取元数据。WebMCP 初始工具异步发现，并提示尚在初始化的页面数。被动观察器退出
可取消自身初始化，保留原宿主弹窗；Playwright 连接会明确拒绝仍在初始化或失败的
活页面观察器，并复核页面 ID 和完成状态。macOS/Linux 双会话源码及当前代码安装
入口通过超过 10s 观察期限后的清单读取、被动退出/重置、原响应保留及重新绑定恢复。
原有 popup、捕获断线恢复、WebMCP 发现和安装/MCP 回归通过，Linux 隔离 headful
回归通过。Node 为 209/209、208/209（一个平台专属跳过）；npm build/pack 中两份
运行模块与当前源码一致。跨宿主接管已有弹窗回调、其他原始动作计时、物理 macOS
headful 与 Windows 继续待补。


原生 drop 已复用弹窗活动时间预算：每次关闭弹窗后恢复剩余期限，公开 AbortSignal
取消目标解析及 trial hover，并在后续原生阶段前检查取消；拖拽释放仍等待确认，失败
继续保留所有权。原先隐藏目标会拖到整个 JS 在 7s 超时，现按 3s 动作期限失败。
macOS/Linux 双会话源码及安装入口覆盖连续等待、恢复后超时、无迟发/重复投递和
无限动作重置恢复；macOS 完整 MIME/文件/frame/shadow 与清理故障重试回归通过。
Node 为 210/210、209/210（一个平台专属跳过），npm build/pack 内容匹配当前源码。
Linux 恢复目标的六次 trial 检查约需 17s，恢复测试显式使用 30s；超时断言仍保持
3s/100ms，产品默认仍为 10s。独立旧版本也在同一 Linux iframe 夹具触发默认超时，
该延迟与完整 Linux MIME/frame 覆盖继续待补；原始导航、物理/headful drop 和
Windows 仍待验证。


原始 goto/reload/history 已由宿主持有原生连接和导航记录，弹窗等待暂停活动预算，
响应后恢复剩余时间；支持 timeoutMs，默认 10s，零值仍可被 JS/turn/reset/close
取消。原生 errorText 在观察动作内回传，beforeunload 的显式取消保持原有语义。
取消等待 stopLoading、原命令回执和渲染屏障；失败保留所有权并拦截复用，允许重置
重试或确认原浏览器退出后恢复。复用绑定的动作会恢复主动归属，原进程退出也会
回收保存的弹窗状态。macOS/Linux 双会话源码及当前代码安装入口通过延迟弹窗、
历史/重载、延迟原生失败、实际停止后的延迟确认、失败保留重试、无限动作取消、
跨 turn 异步弹窗、关闭目标及带弹窗退出后的新实例恢复。原有弹窗/popup/发现和
Linux 安装后的隔离 headful/MCP 回归通过；Node 为 211/211、210/211（一个平台
专属跳过），npm build/pack 内容匹配源码。其他原始 CDP、导航等待、未识别/远端
断线恢复、Linux trial 延迟、物理/headful 导航与 Windows 继续待补。


导航等待已接入可与输入共存的观察 watch、回调父子归属和弹窗暂停预算。
expectNavigation、URL/load 等待可交还弹窗控制；回调动作保持等待并在退出前清理，
已结束作用域拒绝后续输入/等待，回调错误保留，零超时生命周期轮询无隐藏 30s
期限。macOS/Linux 双宿主源码与移走源码后的当前代码安装入口通过重复/异步/
跨目标弹窗、独立等待、恢复超时、回调失败/清理、晚到动作和 reset；Worker
无限等待超过 31s 后原生导航完成。Node 为 212/212、211/212（一个平台专属跳过），
打包两份运行时代码匹配源码。跨目标子 watch 结束后的异步弹窗、广泛 provider
竞态、其他原始 CDP 期限、Windows 与物理桌面验证继续待补。


浏览器 AX 已输出树层级、语义属性和描述，并与 native 共用紧凑行差分逻辑。
保留 Chromium 元素索引，移除连接间换 ID 的重复 InlineTextBox；返回值始终完整，
仅已展示的观察推进绑定内基线，截图、文档/URL/fragment 变化和页面读取/Playwright
失败后恢复完整输出。源码、移走源码后的当前代码安装入口均在 macOS/Linux
双宿主通过原生复选框点击结果、三态/禁用/展开/选中/必填/只读、描述、差分/完整/
无变化、隐藏读取、失败和同/跨文档导航验证。Node 为 213/213、212/213（一个平台
专属跳过）。综合浏览器回归使用独立持有的 Worker 页面，覆盖索引、编辑、键鼠、
定位器、取消、导航与文件选择；所有运行时分发入口携带共享模块。原生 iframe AX
索引与输入路由、广泛 provider/平台、物理桌面与 Windows 证据仍待补。

初始 AX 回执延迟至弹窗交接后的确定性探针还覆盖了 JS 输出归属：后台恢复的读取
保持静默，仅原调用内完成的树会输出并建立基线；Persistent 源码及最终安装入口
验证响应与后续完整回读。完整 Linux 安装/headful/MCP 流程已通过，最后的输出
边界修正另以最终模块逐字节核对、全新安装和早期弹窗回归验证。


原生 iframe AX 与索引输入已接入同/跨进程框架。绑定内数字索引保留框架、文档祖先
与 AX/backend 节点身份；隐藏框架排除可操作节点，重载、移除和进程切换拒绝旧
索引。输入、编辑/选区、区域/文档滚动在准确的原生 agent 与隔离 world 执行；
鼠标保留小数坐标并校验原生及框架内命中，根页面和远程组件渲染屏障确认后才按下。
原生拖放复用框架/命中逻辑并保持原有整数路由。macOS/Linux 双宿主源码及移走
源码后的当前代码安装入口覆盖嵌套/返回进程、重复/隐藏框架、可信输入、字段隔离、
弹窗恢复、仿射变换、遮挡/hover 拒绝、已接收子框架按键的 reset/release，以及同名
重载/移除与进程切换恢复。Node 为 216/216、215/216（一个平台专属跳过）；既有
浏览器、AX 输出/初始弹窗和 native drop 回归通过。原生 iframe 的广泛 provider/
崩溃/IME/Shadow、透视/混合 DPI 与 zoom、最终原子派发、浏览器 secondary AX
动作和物理桌面/Windows 证据继续待补。

冻结代码的完整 Linux 源码移走后安装流程通过，覆盖双宿主 iframe 原生流程、
standalone/managed MCP、隔离 headful、剪贴板/GTK 互通、profile 恢复与关闭；
七个生产模块在 npm 的两份运行时中均与源码逐字节一致。


原生 iframe 输入现支持经过凸性/非奇异性检查的透视与镜像 content quad，目标
多边形逐层裁剪后取内部可见点，并保留原生及框架内命中、文档和租约检查。祖先
几何在 Chromium 滚动前检查，零宽框架直接拒绝。macOS 当前代码安装版双宿主
覆盖多层透视/镜像、斜向边缘裁剪、透视遮挡和退化拒绝后恢复，原生拖放覆盖两层
透视跨进程投递。Node 为 217/217、216/217（一个平台专属跳过）；七个生产模块
在 npm 两份运行时中逐字节一致。混合 DPI/zoom、广泛 3D/provider/crash/IME/
Shadow、最终原子派发、secondary AX 动作及物理桌面/Windows 证据继续待补。

Linux 移走源码后的最终安装模块已逐字节核对，两个宿主均通过新增几何与既有
原生框架全流程。

冻结代码的完整 Linux 安装回归通过，涵盖 standalone/managed MCP、隔离 headful、
text/HTML/PNG 剪贴板与 GTK 互通、profile 恢复、按需启动及关闭清理。
