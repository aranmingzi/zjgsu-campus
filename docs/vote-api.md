# 事件投票接口与防刷设计

界面原型使用本地 Mock 数据。接入真实服务时，投票写操作必须经过服务端校验，前端乐观更新只用于即时反馈。

## 数据模型

```ts
type VoteScope = 'all' | 'followers' | 'college'

interface VoteRecord {
  id: string
  postId: string
  creatorUserId: string
  title: string
  options: { id: string; label: string; order: number; votes: number }[]
  multiple: boolean
  anonymous: boolean
  visibility: VoteScope
  collegeIds?: string[]
  expiresAt: string
  status: 'active' | 'closed'
  totalVotes: number
}

interface VoteParticipation {
  voteId: string
  userId: string
  optionIds: string[]
  createdAt: string
}
```

## 接口

### `POST /votes`

创建投票。校验登录态、学号绑定状态、标题、截止时间、选项数量和服务端权限。

```json
{
  "postId": "post_123",
  "title": "校庆晚会返场节目",
  "options": ["校园乐队返场", "街舞社年度舞台"],
  "multiple": false,
  "anonymous": true,
  "visibility": "all",
  "expiresAt": "2026-10-01T12:00:00+08:00"
}
```

### `POST /votes/:voteId/participate`

提交投票。请求体只接受 `optionIds`，服务端必须再次校验选项归属、投票状态、身份范围及重复参与。

```json
{
  "optionIds": ["option_1"]
}
```

返回值包含服务端权威票数和用户当前选择，用于修正前端乐观结果。

### `GET /votes/:voteId`

读取投票详情。未到截止时间且用户未投票时，可以隐藏实时票数；结束后返回完整结果。

### `GET /votes/:voteId/results`

获取增量结果。前端在投票进行中每 10 秒调用一次；页面隐藏时停止轮询，重新可见时立即刷新。

## Redis 防刷

- 参与锁：`SET vote:participate:{voteId}:{userId} 1 NX EX {remainingSeconds}`。
- 并发计数：`HINCRBY vote:count:{voteId} {optionId} 1`，数据库更新通过消息或事务串行落库。
- 单账号只能在同一次投票中写入一次；多选投票同样只记录一条 `VoteParticipation`。
- 定时清理 `vote:count:{voteId}`，以数据库最终值为准。
- 同一用户、设备、IP 的异常高频请求进入风控队列，不直接依赖前端按钮禁用。

## 权限与隐私

- 只有完成学号绑定的账号可以投票。
- `visibility=college` 时，在服务端读取用户学院并校验 `collegeIds`。
- `anonymous=true` 表示其他用户看不到投票者身份，但服务端始终保存 `userId` 用于防刷和审计。
- `anonymous=false` 时，接口只返回符合隐私规范的头像和昵称，不返回学号、联系方式或其他身份字段。
- 公开投票者列表应支持分页，并允许用户撤回公开展示授权。

## 前端约束

- 点击后立即禁用当前选项或提交按钮，直到接口成功或失败。
- 成功后使用接口权威票数替换乐观值；失败时回滚，并提供重试提示。
- 信息流卡片和多选确认按钮共用同一个防重复提交状态。
- 10 秒轮询仅在页面可见、投票进行中且网络在线时运行。
