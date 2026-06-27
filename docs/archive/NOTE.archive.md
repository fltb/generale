# Note

目前的阶段：

后端框架基本完成，要为前端做准备。

但是目前的后端还无法运行，所以现在梳理需要的流程，完善后端之后，写出整个的测试，功能正常后就可以开始写前端了。

现在分点梳理，对着清单检查功能并完善。

## 后端功能

### 基础设施 DONE

websocket 还没有实现 reconnect

前后端需要对称的实现。目前先实现后端。

还需要加入：底层 ws 连接 close 的时候，后端所有连接视为 disconnect.

然后连接重新建立后，如果有受到 `reconnect` 消息，那么触发对应的连接 reconnect。如果后端已经主动 close 了这个连接，那么也把 close 发到前端。

### 用户功能 DONE

用户的 register：

- username password 的存储校验
- 邮件的发送和校验
- 分配 uid

用户的 login：

- 校验密码
- 找回密码
- 使用 cookie 维护 auth session

用户的 profile：

- 上传头像
- 更改邮箱
- 更改用户名
- 更改密码
- 获取 profile，公开接口 `/user/:uid` 和私密接口 `/me`

### 游戏房间功能 DONE

创建游戏房间：

- 房间名称
- 人数上限
- 游戏模式(个人战/组队战)
- 游戏地图(目前仅默认，后续加入自定义)

修改目前的 GameService 和 Manager 的实现，在创建的时候指定房主。

游戏房间列表：

- 返回房间名称，房主，人数/人数上限，模式，地图
- 通过 `id=string` 的 param 来获取指定游戏的简单 info，减少接口
- 通过房间名，人数已满未满，模式，地图等 param 来筛选房间
- GameService 的变更自动推送到客户端订阅的 ws 逻辑，目前先全量推送，后续可以加订阅逻辑（使用 `room-created room-deleted room-updated`）
- 瀑布流功能，根据锚点+数量来。然后如果有新的 created 就提示是否刷新，如果有 delete 和 update，就地刷新。

### 游戏功能 差一个观战

加入游戏房间的时候：

- 建立连接的 context 中的 userid 应该让后端填充，而不是前端发送-防止伪装其他玩家 DONE
- 对于个人战，每个人加入时静默分配自己 uid 同名的队伍，退出时自动清理队伍，不响应队伍变更请求 DONE
- 对于组队战，玩家进入的时候默认分配队伍，也可以自己选择已有的队伍。队伍数量由房主动态设置，默认为 2 DONE
- 完善设置，房间名称，房主，人数/人数上限，模式，地图，组队，观战开关等等。 DONE
- 断线视为主动 close 请求，前后端都自己清理连接，避免反复触发。 DONE

在游戏中：

- 加入观战功能。如果玩家中途结束了游戏，在打开观战开关的情况下，可以选择是否观战。这个功能需要拓展 GameInstance，目前给全图视野，后续可以做个 `spactatorMask(state, settings)`。如果不观战，也可以选择等待游戏结束并进入下一局的房间。
- 游戏结束后，玩家可以选择是否继续下一局，此时房间不会解散，而是保留设置并继续。除非所有玩家退出，或者在房间阶段房主解散。这里需要改写 GameService 现在的行为。

## 前端计划

现在前端先这样准备：

### 整体框架

solidjs SPA, 分成各个路由和页面。

注意逻辑集中到 hooks 里面，和 ui 分离，方便做成游戏化的高度自定义 ui

### 用户管理系统

注册，登录，用户 profile 展示和修改，信息获取。

### 全局 ws 连接，自动连接和 sub connection

这里管理

### 游戏组件

创建好房间之后就进入这个页面，这里就进入游戏组件的开发。分成房间和游戏内两个 stage。

一个独立的页面，打开后自动请求后端状态并决定自己的显示。

先做 pregame 的选项和同步。

### 地图显示

先把地图展示组件写出来，根据共享 type 中的地图数据来展示内容，并且提供点击和移动的 callback。这些 callback 再向上暴露出来组成游戏的操作逻辑，包装成 action 来管理。

这里可以写一些特效，在状态之间变化的时候播放动画来提高体验。

发现问题：战争迷雾不应该覆盖已知的地形。如果是玩家已经发现过的兵营和王座，沼泽，山地等地形应该在被 mask 的时候也能看到，只是没有兵力数据。还要区分出来玩家视野内的地形和视野外的地形。这里还可以在地图元数据上标明一些公开数据点，在这些点上的信息会被完全展示给所有玩家。

继续增加：

修复箭头方向。icon 使用 regular。优化 UI 外观。写出 cursor。

现在需要写出一些内容

- 点击 cursor 切换当前 active
- 上下左右/wasd 移动指令队列

上面的完成之后，就需要前后端联动的逻辑了。

先写一个 ws 的总连接逻辑写好，测试 subconnection. 就适用一个 echo subconnection 即可

把后端写死，make room 接口，然后测试 subconnection 。

先测试一个 pregame 的 subconnection。目前的流程是：

1. 前端请求 create room, 创建房间
2. 前端根据返回的数据，调整状态，准备连接 subconnection
3. 前端的 subconnection 接上状态管理 hooks，自动处理状态同步
4. 前端展示数据，并尝试修改数据同步到后端。注意共享的事件状态

这边先完成第一步

然后写出 websocket 的

上述基本测试组件已经完成，现在开始写正式的组件。

首先写出表单展示组件。本身对应这个报文：

```ts
export type SyncedPreGameClientChangeSettingAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_SETTING,
  Partial<PreGameRoomState['gameSetting']>
>;
```

获取数据展示，并使用 onchange 通知父元素

然后剩余的每个事件也都对应一个组件。

最后将每个组件组装成一个 Room，并响应各个 custom event 如 kicked，game-started 等等

先写一个测试数据塞进去侧 ui, 然后再街上 hook

检查 AI 写的代码，人工核对逻辑，确保 dispatch 和后端的行为是同步的，并且明确 action 的返回

### 游戏逻辑

根据玩家操作，，向后端发送，本地再加上乐观更新。

### 房间列表和展示

创建房间，房间列表展示，瀑布流，事件订阅更新。

### 开发计划安排

现在整理一个完整的流程：

- 玩家注册账户并登陆
- 玩家创建游戏房间
- 其他玩家打开游戏列表，找到房间并加入
- 房间内房主调整设置，各玩家准备
- 在所有玩家准备完成后，进入游戏
- 游戏内同步玩家操作，结算并同步状态
- 游戏结束后，各玩家返回房间
- 房主解散或玩家自行退出房间后自动解散游戏房间

目前后端 API 已经准备就绪，正在进行前端的开发与测试工作。

准备按照顺序逐步开发前端功能。

#### 玩家注册账户并登陆

开启后端，连接数据库。

编写 login/register 页面，介入页面

登陆后，自动连接 websocket

#### 玩家创建游戏房间

编写一个创建房间页面，玩家填入指定的参数，然后创建一个游戏房间，并同步到列表

记录需要修改的地方：

API 部分，craete game 的 API 使用，size 应该分 mode, custom 和 calssic

gameServoce 的 create 接口也要改

创建的游戏类型分两种，

standard, custom

standard: 快速，不可更改设置，只能选择地图大小(small, medium, large)

custom: 可以自定义游戏参数。create 中目前只有游戏地图大小和玩家人数，其他都在创建之后设置，暂时不用放。

在游戏房间中，对 standard 模式隐藏 gamesettings，隐藏地图频率等设置，仅保留 small medium large 等预置 size

对 custom 模式开放所有修改

暂时隐藏 imported

bug：

- [X] 需要在玩家连接之后主动发送状态，让玩家列表在连接之后能正常显示
- [X] （客户端）需要修复下方的准备按钮功能
- [X] （客户端）隐藏 fog 的设置
- [X] （服务端）踢出的玩家短时间内不能再加入
- [X] （客户端）被踢出应有反应
- [ ] （客户端）被踢出再次加入应有反应
- [X] （服务端）玩家退出之后应该重新广播，这里需要特判玩家断开连接为一个 event，参考玩家加入的广播实现。
- [ ] （服务端）所有玩家退出后自动解散游戏，同时广播。目前没有给出解散之后的回调


#### 游戏列表功能

使用自己定义的 subconnection 逻辑创建一个 room list 同步列表并显示。点击可以胶乳房间

#### 房间功能

目前的组件已经测试完成，准备在前面的功能完成后接入

#### 游戏功能

游戏的显示组件已经完成，具体的逻辑等待前面的工作开发完后编写。

首先需要进入游戏。前端收到游戏开始信号之后，前端的房间组件被替换成游戏组件（路由不变）

这时候后端的 Stage 已经切换完成。

所有玩家加入游戏之后，游戏开始计时，进入游戏状态。

现在前端需要根据 subconnection 返回的 state 来确定当前应该展示的组件。

现在还需要完成的功能：

- [X] 正式进入游戏
- [X] 正确同步更新游戏状态到客户端
- [X] 正确接受客户端的玩家操作队列
- [X] 正确在每个 tick 更新游戏状态
- [X] 目前前端的 map 演示有 bug，会出现报错, 需要检查 solid-pixi 的使用方式是否正确
- [X] 修复之后可以正常显示，但是 icon 的大小变大了，没有调整到各自的大小，需要调整 icon 大小和位置
- [X] test 页面当中的箭头可以显示，但是放在 realtime 的 game 中就显示不出来了
- [X] 所有玩家退出之后，解散房间。或者房主主动解散房间，现在没有成功解散房间，会残留一个 0 人的房间
- [X] 需要有一个列表实时展示各玩家的信息，比如 username, 颜色，地块数量，总兵力。
- [X] 需要处理 gameover 事件，在触发事件之后，后端自动断开 game 的 subconnection, 切换到 pregame 状态，等待客户端重新连接。前端则显示游戏结束，允许玩家重新跳转到 pregame 或者退出。
- [X] 写好玩家聊天的组件，写一个独立的组件来连接和管理玩家聊天消息，然后可以在 room 的准备和游戏内阶段进行玩家对话
- [X] room 应该判断玩家组队是否合法，是否至少存在两个队伍。如果不合法，应该拒绝开始游戏。拒绝开始的时候应该通知前端，新增一个事件（SyncedPregameServerEventPayload）发送到前端。
- [X] 前后端应该给玩家加入切换队伍的选项。应该至少存在两个队伍，且后端内部给队伍命名，前端不需要显示准确的内部名。
- [X] 游戏内部同队队友的视角应该共享。目前队友的块显示了，但队友的块的相邻块还没有显示，应该修改 game 的 mask 函数。
- [X] GameInstance 的 playerDisplay[] 中加入 playername, 并且把前端不存在的 playerSummery 去掉
- [X] 后端只有在收到玩家操作之后才后续的 tick 更新，应该尝试在前端或者后端进行不需要用户操作的协商同步
- [X] gameover 的时候房间自己解散了，应该尝试重建。这个恢复逻辑是有问题的，因为 pregame instance 在切换到 room 之后会被销毁，但是 pregame 在 game end 之后重建的时候，又会进行 instance 的重建，但是重建的是时候不会带上 player 的信息，所以导致 instance 重建之后没有玩家，所以立刻被销毁，然后又触发了完整的房间解散流程。正确的做法是，重建的时候加上玩家信息。或者干脆在玩家进入 game 阶段时，保留 pregame 的连接，这样只有在玩家真正断线之后才会断开 pregame 的连接，重联的时候连接 chat， pregame 和 game。这样的修改.
- [X] 找到问题是 endgame 的时候 gameservice manager 自动删除 game 了。现在的问题是，恢复后的 pregame instance 表现异常，host 发生变化了，需要检查玩家重进 room 的逻辑。
- [X] gameover 的时候前端 UI 需要改进为：返回大厅 | 回到房间
- [X] 前端应该增加新建队伍的方式，而且把玩家加入队伍从 option menu 变为点击队伍标题这一个更加符合操作逻辑的方式。
- [X] 后端在玩家加入房间的时候，如果当前是队伍数量小于最小队伍数量，应该给这个玩家创建新队伍并加入。
- [X] pregame 阶段 room 的准备按钮是坏的，只有 playerlist 里面的是好的，检查这里的问题，然后修正
- [X] join team 的逻辑有问题，点击 team 名称试图加入 team 的时候会新建 team 而不是加入。
- [X] 需要在 pregame instance suspend 的时候锁定状态。锁定状态的具体表现为：忽略客户端的修改事件，暂时固定 room 的状态。暂时固定房主，在恢复之后，确认房主掉线，再转移房主。
- [X] 在 game start 时，没有成功隐藏 pregame 阶段的 room 组件

#### 其他计划


- [X] room list 的 websocket 事件同步，确保实时同步信息。目前的实现是通过 solid query 自动刷新，需要订阅后端实现的 websocket 连接事件来做到按需更新。
- [X] 需要设计并调整游戏数值，随机生成的出生点，然后控制兵营的人数到 40 左右: 目前兵营的人数都是 1 需要修复
- [X] 房间列表现在显示的是房间 id, 需要显示房间名称，房主名称，房间模式等。
- [X] 房间列表的页面需要加上筛选，需要根据房间的条件来筛选房间，这个需要配合后端实现，可能还要和上面的 websocket 连接联动。
- [X] 需要改进游戏 UI, 让 UI 更加好看。包括房间的 UI, 以及游戏内部的 UI。
- [X] 需要加入倍速游戏模式
- [X] 需要防止玩家重复登陆，给 user 加上反重复登陆机制。登陆 session 目前是 in-memory 的，改成更好的机制
- [X] 需要实现 profile 页面，允许玩家上传头像，更改自己的信息。
- [X] 需要完整的账号管理系统，玩家可以找回账号，也可以修改密码，邮箱等操作。
- [X] 继续设计 preagame 游戏房间逻辑。玩家进入游戏之后，将玩家设置为“游戏中”状态，并进行锁定，即使玩家退出房间，也只是标记为暂时断开连接，等待加入，除非游戏结束后将其回收。然后，不在游戏中的玩家，进入房间之后，仍然看到的是房间页面，也可以切换队伍。只是其他玩家都在游戏中，也无法进行准备等操作。后续还可以在此基础上设计出观战模式。
- [X] 进入游戏的时候，有时候能正常显示格子的 icon，有时候又显示不出来
- [X] 进入游戏的时候，如果刷新之后有时候没法正常移动。观察前端 state 有移动指令，但是没有移动动作，一帧之后移动指令又没了
- [X] 需要改变地图生成逻辑：初始应该只有一个 thone 1 兵力，旁边的格子不要填充
- [X] 需要加入默认的房间模式，单人组队。对前端隐藏队伍信息，后端视作每个玩家自己一个独立的队伍
- [X] 玩家房间中也用上头像名字
- [X] 能看其他人的 profile
- [X] 更改密码后，引导浏览器的密码管理器存储邮箱或者 usermane 而不是 display name
- [X] tile 白格子不会增长兵力，需要最多 10 tick 长一个
- [X] 局内的 chat 组件实现。整个参考其他的实现（指的是 game 文件夹下 useXXXSession 类似的方式做 UI 和逻辑的隔离）。在房间内和游戏内的聊天应该有所区分。在房间页面的聊天不需要特殊处理。但是在这个游戏内的时候需要处理，会有一些玩家在游戏开始后暂时加入房间，也会有一些玩家在观战，然后这个需要在 UI 上面区分出来。以及游戏内部可以根据 team 做小队聊天功能（可以做形如 `/team <message>` 的格式来小队聊天)。目前的 UI 很简单，可能需要优化成类似(`[(可选)小队聊天提示][(可选)team，FFA不显示][(可选)旁观者|房间内|游戏内就不提示][颜色块][头像][ID]：消息内容`)的格式。这需要拓展后端和前端的功能。
- [X] 房主创建房间的时候无法直接连接 chatInstance, 只有第二个玩家进入才能进，需要修复
- [X] 默认头像没有显示在 chat 中，需要给默认头像也作为 avatarThumbUrl
- [X] 允许每个玩家选择自己的局内颜色
- [X] 房主本人的 ready 状态显示有问题，不应该显示 not ready
- [X] 进入游戏之后蓝底的 bug 修复了，但是仍然有概率 faicon 不显示+移动指令没反应
- [X] 房间的 password 还没有测试过，需要测试

#### [ ] 游戏的外观与功能优化

##### 需要让游戏更具有游戏感

目前的问题是这个网页端的风格不够游戏化。

虽然最近的两个 commit 已经把 UI 和逻辑解耦方便定制了，而且也将网页的控件使用了游戏的风格渲染。

但是目前的网站的组件排列还是普通的网站的排列方式，没有特别游戏性的特色 UI 结构设计。

可以考虑把这个游戏的房间和大厅采用更有趣味性的布局，突出游戏化的特色。

目前可以先从游戏的特色入手，在游戏房间内部进行更有意思的布局

- [X] 聊天栏的行为模式优化：聊天栏虽然是在各个阶段都可用的，但是作为一个独立组建，他可能需要进行半透明底部等 UX 优化来确保跨阶段的时候不影响可用性和 UI 完整性。最终采用半透明玻璃态 + 右下角 floating 的独立面板方案，ChatPanel 新增 `transparent` prop 支持跨阶段复用。
- [ ] 游戏资源替换：修改默认头像的风格为像素风。调研了 DiceBear Pixel Art（https://api.dicebear.com/10.x/pixel-art/svg?seed=default，CC0），风格合适。后续可替换 profileService.ts 中的 SVG，或者引入 @dicebear 库直接生成。也需检查其他游戏资源（音效、图标等）是否需要统一到像素/复古风格。
- [X] 地图目前是固定大小的画布，应该改成可以在一块画布上拖动和缩放，方便大地图。已实现：PixiJS stage 容器捕获鼠标拖拽（含水平/垂直双向），滚轮缩放（以光标为中心），键盘 `=`/`-`/`0` 快捷键缩放，底部 HUD 缩放按钮。地图全屏铺满 viewport，顶部栏和玩家列表改为半透明 HUD 覆盖层。
- [ ] 地图画布中 icon 全变成红色了：应该是黑色，因为是基底

##### - [ ] 需要允许加入自定义地图

自定义地图：玩家自己画地图，按照现在已经有的地图元素（空白块，兵营等）直接画地图，不仅可以表明元素还可以预填数值（不只是正数还可以是复数比如-100 的兵营进去加兵力加快节奏，或者 100 的地块让 100 兵力才能占领）还可以有：预留王座位置。

为此我们需要三个部分：编辑器、地图展示页面、地图导入逻辑。

---

#### 自定义地图设计计划

##### 一、地图数据格式

定义 `CustomMapData` 类型，存储于 DB（新增 `custom_maps` 表或存为 JSON 文件）：

```ts
interface CustomMapTile {
  type: TileType;        // PLAIN | BARRACKS | MOUNTAIN | SWAMP | FOG | THRONE
  army?: number;         // 初始兵力，默认 0。负数表示占领需要减法（加速节奏）
  ownerId?: PlayerId;    // 预分配的 throne 所属（不填则顺序分配）
  isThrone?: boolean;    // 标记 tiles 中哪些是 throne
}

interface CustomMapData {
  id: string;            // UUID
  name: string;          // 地图名称
  description?: string;
  authorId: string;
  authorName: string;
  width: number;
  height: number;
  tiles: CustomMapTile[][];  // [y][x] 二维数组
  minPlayers: number;    // 最少需要多少玩家（= throne 数量）
  maxPlayers: number;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;     // 是否公开到地图库
  tags?: string[];       // 方便搜索
}
```

##### 二、地图编辑器 (`packages/frontend/src/components/map-editor/`)

基于 PixiJS（复用 MapRender 和 MapTile 核心渲染），纯前端编辑。

| 功能 | 描述 |
|------|------|
| 画布 | 可缩放/拖动的网格画布，默认 20×20，可调大 |
| 调色板 | 左侧面板：Plain / Barracks / Mountain / Swamp / Fog / Throne |
| 画笔模式 | 点击单个 tile 绘制；按住拖拽连续绘制 |
| 橡皮擦 | 还原为 Plain |
| 数值编辑 | 选中 tile 后输入 army 数值（可为负数：-100 加速节奏，正大数：100 需要更多兵力占领）|
| 王座分配 | 放置 throne 后自动分配 owner 编号；可手动换序 |
| 缩放/平移 | 复用 MapRender 的 viewport 逻辑 |
| 保存/加载 | 保存到 localStorage 草稿；上传到服务器；从服务器加载继续编辑 |
| 导出/导入 | JSON 导出下载；JSON 导入上传 |
| 预览 | 实时平铺预览（CSS grid 缩略图） |
| 撤销/重做 | Ctrl+Z / Ctrl+Shift+Z |

**技术要点：**
- 复用 `MapTile` 和 `tileTheme` 渲染，编辑器模式增加 hover/选中态
- 数值编辑用浮动 input 或键盘输入
- 地图尺寸限制 10~200

##### 三、后端地图存储

**DB schema（`custom_maps` 表）：**

```ts
export const customMaps = sqliteTable('custom_maps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  tileCount: integer('tile_count').notNull(),   // width × height，方便查询
  minPlayers: integer('min_players').default(2),
  maxPlayers: integer('max_players').default(8),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  isDraft: integer('is_draft', { mode: 'boolean' }).default(false),
  usageCount: integer('usage_count').default(0),  // 用于"最热"排序
  tags: text('tags'),                       // JSON array string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
```

**Tiles 不存 DB**。地图瓦片数据以 JSON 文件存储在 `./public/maps/<id>.json`（和头像 `./public/avatars/<id>/` 同模式）。DB 只存元数据，路径由 `id` 推导。

**Storage 抽象层（`services/mapService.ts`）：** 和 `ProfileService` 同模式——

```ts
class MapService {
  saveMapTiles(id: string, tiles: CustomMapTile[][]): Promise<void>;
  loadMapTiles(id: string): Promise<CustomMapTile[][]>;
  /** 发布地图时调用：生成 PNG 缩略图到 ./public/maps/<id>.png（用 sharp） */
  generateThumbnail(id: string, tiles: CustomMapTile[][]): Promise<void>;
  /** 返回缩略图 URL，不存在则返回 null（画廊降级到 canvas 渲染） */
  thumbnailUrl(id: string): string | null;
}
```

`generateThumbnail()` 使用 `sharp` 从 tiles 数据生成单像素 PNG（200×200 地图 → 200×200px 图片，~2KB）。未来换 S3/R2 只改内部实现。

**文件大小预估：** 200×200 地图 gzip 后约 100KB，20×20 约 2KB，完全可接受。

**API 路由（`routes/map.ts` + `services/mapService.ts`）：**

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/api/map/create` | 上传/保存地图（需登录） |
| `PATCH` | `/api/map/:id` | 更新地图（仅作者） |
| `DELETE` | `/api/map/:id` | 删除地图（仅作者） |
| `GET` | `/api/map/:id` | 获取地图详情（含完整 tiles） |
| `GET` | `/api/map/list` | 公开地图列表（分页+搜索+标签排序） |
| `GET` | `/api/map/my` | 我的地图列表（需登录） |
| `GET` | `/api/map/:id/thumb` | 缩略图 PNG。不存在则 404 → 前端 canvas 降级渲染 + 自动触发后台生成 |
| `POST` | `/api/map/:id/fork` | 复制公开地图到自己的地图库 |

**发布流程（`isDraft: false` → 保存时触发）：**
1. 校验通过
2. `saveMapTiles(id, tiles)` — 写 tiles JSON
3. `generateThumbnail(id, tiles)` — 生成缩略图 PNG（同步或后台）
4. 更新 DB 元数据

**缩略图存储：** `./public/maps/<id>.png`，由 Elysia `staticPlugin` 直接托管（`/api/maps/<id>.png`），零服务端开销。

**地图校验规则（仅 `isDraft: false` 时生效）：**
- 王座数量：可 0（随机分配），可 ≥ 2（手动指定）。若手动指定，必须 ≤ maxPlayers 且每个王座 ownerId 不同
- 尺寸 range：10 ≤ width/height ≤ 200
- tile 总数 ≤ 200×200 = 40,000
- army 值 range：-999 ~ 999

##### 五、API 健壮性分析（各 UI 调用场景）

**1. `POST /api/map/create` — 上传/保存**

| 调用方 | 场景 | 潜在问题 | 措施 |
|--------|------|----------|------|
| 编辑器 | 保存完整地图 | tiles JSON 可达 ~1MB（200×200）POST body | 前端做进度指示；后端校验 body size ≤ 2MB |
| 编辑器 | 保存草稿（无王座/不完整） | 草稿不需要校验王座 | `isDraft: true` 跳过所有校验规则；发布时需要满足校验 |
| 编辑器 | 重复保存（id 已存在） | 幂等性问题 | 首次 POST 生成 id；再次编辑用 PATCH；或 POST 做 upsert |

**2. `PATCH /api/map/:id` — 更新地图**

| 调用方 | 场景 | 潜在问题 | 措施 |
|--------|------|----------|------|
| 编辑器 | 改 tiles | 旧 tiles 文件需原子替换 | `mapService.saveMapTiles()` 内部 `fs.writeFile` 原子写 |
| 编辑器 | 只改 name/tags | 不需要重写 tiles 文件 | PATCH body 只更新提供字段，不传 tiles 则不写文件 |
| 编辑器 | 非作者试图改 | 需鉴权 | `authorId !== session.userId → 403` |
| 房间创建 | 不会调 PATCH | — | — |

**3. `DELETE /api/map/:id` — 删除地图**

| 调用方 | 场景 | 潜在问题 | 措施 |
|--------|------|----------|------|
| 我的地图 | 删除自己的地图 | 如果地图正被某房间使用，游戏开始时找不到 tiles | 删除前检查是否有活跃房间引用；或软删除（`deletedAt` 列），房间引用时只标记不实删 |
| 管理员 | 删除违规地图 | 同上 | 同上，admin 可强制删除 |

**4. `GET /api/map/:id` — 获取地图详情（含 tiles）**

| 调用方 | 场景 | 潜在问题 | 措施 |
|--------|------|----------|------|
| 画廊详情页 | 预览完整地图 | 200×200 tiles JSON ~1MB，首次加载慢 | 客户端缓存；考虑 gzip（Bun 默认支持） |
| 房间创建 | 预填地图信息 | 同上 | 同上 |
| 游戏开始 | 加载 tiles 进游戏 | 同时启动多个房间会并发读同一文件 | 文件只读无害；但可加内存缓存 `mapService.loadMapTiles()` 内做 LRU |
| 游戏开始 | 地图已删除 | 房间引用的 mapId 找不到 tiles | 启动时 `mapSetting.customMapId` 若 map 不存在 → 降级到随机生成地图 + 通知玩家（`GAME_STARTED` 附 warning） |

**5. `GET /api/map/list` — 公开地图列表**

| 调用方 | 场景 | 潜在问题 | 措施 |
|--------|------|----------|------|
| 画廊 | 浏览公开地图 | 大量地图时分页必要 | `?offset=0&limit=20`，默认 20 条 |
| 画廊 | 按"最热"排序 | DB 无使用次数统计 | 新增 `usageCount` 列，房间 startGame 时 +1 |
| 画廊 | 搜索标签/名称 | 模糊搜索 SQLite `LIKE` | `tags` 存 JSON array，搜索用 `tags LIKE '%keyword%'`；名称用 `name LIKE '%kw%'` |
| 画廊 | 按尺寸筛选 | 需区间查询 | `?minWidth=10&maxWidth=50` → WHERE width BETWEEN |
| 房间创建 | 选择地图列表 | 同上，但用户可能只想要自己能用的地图 | 过滤 `minPlayers ≤ currentRoom.playerCount ≤ maxPlayers` ？不一定，可以先展示全部，选不合适的校验时提示 |

**6. `GET /api/map/my` — 我的地图列表**

| 调用方 | 场景 | 潜在问题 | 措施 |
|--------|------|----------|------|
| 编辑器 | 继续编辑已有地图 | 需要知道哪些是草稿 | 列表返回 `isDraft` 标记 |
| 我的地图页 | 管理自己的地图 | 需分页 | 同上 `offset/limit` |
| 房间创建 | 快速选自己的地图 | 同上 | 同上 |

**发现的缺失项：**

| # | 缺失点 | 严重度 | 建议 |
|---|--------|--------|------|
| 1 | 无 `isDraft` 字段 | 中 | 草稿跳过校验，编辑器可中途保存 |
| 2 | 无 `usageCount` 排序依据 | 低 | 加列，startGame 时递增 |
| 3 | 删除地图无活跃房间检查 | 高 | 软删除或引用计数检查 |
| 4 | tiles 加载无缓存 | 低 | 游戏开始时地图 tiles 只读，加内存 LRU |
| 5 | 无分页默认 limit | 中 | `GET /list` 和 `/my` 默认 20，上限 100 |
| 6 | 地图被房间引用后不能删 | 高 | `DELETE` 检查是否有活跃房间使用；或 UI 提示"已被 X 个房间使用" |
| 7 | POST body 大小无限制 | 低 | 服务端限制 2MB |
| 8 | 无 fork/duplicate 功能 | 低 | 后期可加 `POST /api/map/:id/fork` |

##### 四、地图展示页面（`routes/map-gallery.tsx` 或嵌入 roomlist）

| 功能 | 描述 |
|------|------|
| 网格/列表展示 | 公开地图的卡片视图 |
| 缩略图 | 前端实时渲染：读取 tiles 数据，CSS grid 按比例缩放绘制小地图（免存图片） |
| 搜索 | 按名称、标签、尺寸范围、作者 |
| 排序 | 最新、最热（被使用次数）、最多玩家 |
| 详情页 | 点击卡片 → 预览完整地图 + "创建房间" / "编辑"入口 |
| 一键创建房间 | "用此地图创建房间" → 预填 create room 表单 |
| 按地图筛选房间 | 房间列表 `mapId=` 参数筛选用该地图的游戏 |

**最终方案：服务端生成缩略图 + 客户端 Canvas 降级**

| 路径 | 行为 |
|------|------|
| 地图发布时 | `MapService.generateThumbnail()` 用 sharp 生成像素级 PNG（1px/tile）到 `./public/maps/<id>.png` |
| 画廊加载 | `<img src="/api/maps/<id>.png">` 直接加载（~2KB，瞬间） |
| 缩略图不存在 | 404 → 前端 Canvas 降级渲染 → 后台触发生成 |

**稳定性总结：**

| 场景 | 行为 | 性能 |
|------|------|------|
| 画廊首页 20 张任意尺寸地图 | `<img>` 标签加载 PNG | 每张 ~2KB，瞬间 |
| 新发布地图（thumb 未生成完） | Canvas 降级渲染 | 首次慢（~50ms），后续命中 |
| 移动端 | `<img>` 加载 | 零 DOM 开销 |
| 缩略图更新（地图编辑后重发布） | 覆盖 PNG 文件，URL 不变 | 即时生效 |

不再需要 CSS grid 渲染。缩略图文件极小（单像素颜色块，sharp 压缩后 1-3KB），存储成本可忽略。

##### 五、地图导入游戏逻辑

**创建房间时选择地图：**
- `createGameReqSchema` 新增 `mapId?: string`
- 指定 `mapId` → 后端加载该地图的 tiles → 跳过 `generateMap()`
- `PreGameRoomState.mapSetting` 新增 `customMapId?: string`

**游戏开始时应用地图：**
- `GameService.startGame()` 检查 `mapSetting.customMapId`
- 存在 → `loadCustomMap(mapId)` → 返回 tiles
- 不存在 → 现有 `generateMap()` 逻辑
- 王座数 vs 玩家数校验：不够则降级到实际玩家数

**特殊数值处理：**
- `army: 100` → 地块初始 100 兵力，玩家需攒够 100 才能占领
- `army: -50` → 地块初始 -50，占领后倒减再涨正（加速节奏）
- `army: 0` 或无 army → 标准中立地块

**房间内切换地图：**
房主在 `PreGameMapSettingForm` 中可以从已发布的地图库选取替换。和切换 roomType/size 等同层级的 setting action。
- 新增 `SyncedPreGameClientActionTypes.CHANGE_MAP_ID`
- `RoomInstance` 新增 `changeMapId(pid, mapId)` — 校验地图存在且可用
- `PreGameRoomState.mapSetting.customMapId` 更新 → `broadcastState()`
- 房主独有权限（`isHost` 检查），非 `suspended` 期间可用
- 前端 `PreGameMapSettingForm` 增加地图选择下拉/搜索（从 `/api/map/list` 加载）
- 切换地图时地图尺寸变更 → 同步更新 `mapSetting.width/height`

##### 六、开发顺序

| 优先级 | 任务 | 依赖 |
|--------|------|------|
| 1 | `CustomMapData` 类型 + DB schema（含 `isDraft`, `usageCount`）+ drizzle-kit push | 无 |
| 2 | 后端 CRUD API + `MapService`（含 `generateThumbnail()`） | 1 |
| 3 | 地图编辑器 MVP（画布 + 调色板 + 保存/发布） | 1 |
| 4 | 编辑器增强（数值编辑、王座分配、撤销重做） | 3 |
| 5 | 地图库页面（缩略图 `<img>` + Canvas 降级 + 搜索） | 2 |
| 6 | 导入游戏（创建房间选地图 + GameService 加载） | 2, 3 |
| 7 | 房间内切换地图（CHANGE_MAP_ID action + PreGameMapSettingForm 选择器） | 6 |
| 8 | 房间列表按地图筛选 | 6 |
| 9 | Fork/duplicate + 草稿管理 | 2 |

##### 用户名称展示优化

数据出现了新的规则：目前的 username 设定是用户注册时永久固定，无法更改的用户的内部名称，作为仅用于登陆或者系统内部使用的 id，可以作为和 UUID 一样的 ID，新的名称更改为 displayname，这里需要把所有的代码都迁移走，不使用 username。但是这样的逻辑比较反直觉，因为已经有 UUID 作为用户唯一标识符了，而且新的也没必要引入这点。一种好的做法是令 username 只允许数字字母和符号，限定更改频率且不允许重复， displayName （逻辑同 nickname）允许随意更改。

因为展示的逻辑都在前端，所以需要前端在展示的时候加以区分。这里如果允许 display name 同名，就需要前端在展示数据的时候通过一些逻辑来专门确定用户名如何展示，尤其是同一批用户的时候。目前的做法是游戏内部自己一路传到展示组件来展示，很自然。但是如果说用这样的展示方式的话，至少会引入一个 user group 的语义，在需要显示同名用户的时候可以用 `<displayName>#<username>` 的格式区分。这里需要权衡是否允许 displayName 同名，会不会带来问题（也可以在这些场合用 displayname 的 alt 写 `#username` 来实现。

需要做的：

- [X] 在注册和修改的入口显示 username 的频率
- [X] 允许修改 username，禁止重名，限制修改频率（每 7 天一次）。后端新增 `usernameChangedAt` 列，`PATCH /me/username` 路由，前端 profile 页新增 username 修改入口及冷却倒计时提示。
- [X] displayName 允许重名：玩家列表和房间列表引入 `resolveDisplayNames()` 工具函数，出现同名 displayName 时自动显示为 `displayName#username` 格式区分。

#### [X] 对前后端的逻辑进行重构优化

这段计划属于重构类型，在开启这段内容的时候需要暂时冻结前后端功能和外观拓展的更新，不引入新的内容，确保新的内容不会和重构的内容杂糅。

##### [X] 后端的结构优化

目前的前后端已经开始出现分层不清晰和蔓延的情况了。因为协议设计很早，但是实际需求已经让前后端不得不拓展很多功能了。前端按照格式需要发送 userid 和 username，但是它在后端被静默丢弃并使用从 session 和 db 中读取的真实环境变量作为替代。

然后在内部也是一样的，GameService 负责了三个方向的逻辑：instance 的管理，sub connceter 的管理，以及游戏信息到 manager 的同步，这里存在大量的边界条件和内部状态转换的判断，非常复杂。

类似这样的功能拓展导致的复杂逻辑或者冗余逻辑已经很多了，需要对后端进行优化和判断来解决这部分的内容，顺便更改前端对应的接口代码。

首先要分析目前的结构总体的框架如何，什么语义的操作需要放在什么层面，再去把语义不明或者冗余或者过度复杂的逻辑进行优化。

最好拆分的更加通用，方便后续拓展成多个小游戏的一个小游戏联机平台的时候复用框架。

目前先列出明显的待修复的问题，后续的问题也整理在这里写在下面，直到在不动现有功能的情况下完成这块的整体优化：

- [X] 优化 subconnection open 时发送的 context，去掉前端的 context（userid 和 username） 的发送逻辑，因为他们的具体实现就是后端从 current session 里面读出来的。原先这么写只是为了接口类型复用方便（WSContext），然后希望前端能在 open 阶段把一些 Context 直接透传到后端，这样前后端都可以使用。但是目前的逻辑也没有保证前后端运行的时候实时 Context 一致，前端更没有在连接初始化之外的任何地方使用 Context，只是 open 的时候发送一次给后端初始化，不如删掉前端的冗余逻辑，把前端的 context 重命名称 open payload，再去掉前端的 Context 保存逻辑。
- [X] ChatInstance 获取外部状态的逻辑混乱：现在 ChatInstance 依赖一个 _activeStageInstance（实际上就是 preGameInstance）来获取信息和鉴权判断玩家是否能够连接进游戏，以及获取玩家信息。这里高度依赖了 preGameInstance，但是他们理论上应该是平行的，这样写是因为房间的管理逻辑（鉴权，玩家信息）实际上都在 preGameInstance，导致其不得不依赖 preGameInstance 进行鉴权和实时获取用于 chat 的信息，否则就会 copy-paste 导致更难维护。这里应该仔细斟酌 GameService 目前的 Service - Instance 的分层逻辑，是否可以考虑进一步的拆分，因为 Instance 之间不得不相互依赖了，甚至需要 Service 来手动给它挂载 _activeStageInstance。**DONE: 新建 IRoomRoster 接口，ChatInstance 改为依赖 IRoomRoster（仅暴露 canJoin / getPlayerChatMeta / getPlayersForTeamChat），不再依赖具体 Instance 类型。**
- [X] 还有一个逻辑是 pregame 一直挂载，game 随时卸载和挂载，这样的 instance 逻辑也是很复杂的，不够平滑，不好理解。理论上可以随时挂载卸载的 instance 实际上不能卸载了，直接变成了 service 的一部分，承担了 service 的管理职能，这里很反直觉。这里是因为设计中让 instance 管理 connection 的加入和离开，然后 connection 又会提供游戏的房间状态的交互。但是本身 Service 也依赖这些状态，导致这部分状态必须向上同步到 Service 中。如果做不到优化，至少也要把 preagameInstance 的名字改掉，变成更能反应实际功能的名字方便理解。**DONE: PreGameInstance 重命名为 RoomInstance；域名 pregame- 重命名为 room-；ChatInstance.activeStageInstance 类型收窄为 IRoomRoster。**

##### [X] 过时的测试逻辑的清理

随着项目的大改和重构，很多旧的测试代码已经不再适用，而我们并没有更新这些测试逻辑。

现在有很多测试逻辑是没有办法跑起来的，因为接口变化太多了。尤其是前端的很多测试组建更是纯 UI，靠手工操作来确定状态。这部分的测试就需要酌情处理，看是直接删除还是进行优化和更改，以及是否要为新的状态和代码来引入新的测试。

#### [ ] 考虑引入其他游戏模式

这个项目的框架解耦很好，游戏状态同步的框架和游戏逻辑无关。

使用这套框架是可以去做其他游戏的，只要实现后端的游戏逻辑和前端的渲染和输入的逻辑，就可以做一个完整的联机游戏。那么就可以把其他有意思的网页小游戏做出来。也可以将网站直接拓展出来。

##### 联机游戏平台

为此，我们需要设计 2-5 个新的多人联机小游戏，观察他们的共性，将房间列表，房间逻辑，游戏设置与游戏内容进一步解耦，确保可以在不同的小游戏当中尽可能复用更多的逻辑，这样仅需完成游戏本身的逻辑和游戏的设置等逻辑，即可复刻到另一个游戏内。

这样就可以花比较少的精力去拓展成称一个在线小游戏平台。因为用户逻辑已经和游戏逻辑解耦了。

我们甚至可以引入存档等功能，让这些小游戏变成在线的可以持续玩的游戏，甚至引入单人模式。

这部分的内容需要在上方的后端结构优化中也考虑进去，不过重构只需要保证结构能支持后续的可拓展性即可，不需要预留接口。

##### 用户的网站局部|全局设置

目前已经有很多个性化外观了，包括网站的全局外观，按钮音效等，在游戏内部也有音效，这些可以进行用户的自定义管理，让用户自己设置调整。

可以考虑引入一个网站的全局用户的 settings 系统，再在游戏内部做一个游戏 settings 系统。

网站的全局设置可以存储网站主题，外观等全局的设置。

游戏内部设置存储每个玩家的键位，音效等设置，在游戏中设置。因为后续可能会引入多游戏，所以需要将这部分逻辑和网站全局设置拆分。

##### 网站的移动端优化

我们可能需要考虑将这个网站放在手机，平板等设备上面使用，因此需要考虑移动端的优化。

目前可以分成两类移动端优化，一类是网站本体的优化，这种可以直接在编写时顺手完成。

另一类就是游戏内部的优化了。我们需要界定什么属于每个游戏的独有部分，然后在这些部分将移动端优化直接下放，让游戏内部完成移动端优化，或者干脆表明不支持。

如果使用类似小游戏平台的设计，那么进入某个游戏的时候就直接下放了，然后游戏自己会把通用的部分用通用的写法编写，再独立编写移动端的部分。
