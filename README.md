# IMC 建筑服 & 紫水晶 自动签到

使用 GitHub Actions 每 72 分钟自动完成 **Build-1 曲奇签到** 与 **紫水晶签到**，专为离线模式账号设计，全程云端执行。

> 理论 **400** 🍪/天， **12,000** 🍪/月， **146,000** 🍪/年。

---

## 快速配置

1. **Fork 仓库**  
   点击右上角 `Fork`，将仓库复制到你的 GitHub 账户下。

2. **添加 Secrets**  
   在 `Settings → Secrets and variables → Actions` 中新建两个仓库机密：

   | 名称 | 说明 |
   |------|------|
   | `USERNAME` | 离线模式玩家名 |
   | `PASSWORD` | 对应的 IMC 登录密码 |

   机密值保存后不可见，仅在 Actions 运行环境解密。

3. **启用 Actions**  
   进入 `Actions` 选项卡，点击 `I understand my workflows, go ahead and enable them`。

4. **（可选）手动测试**  
   在 `Actions → Auto /signin` 中点击 `Run workflow` 可立即触发一次签到。

---

## 执行原理

基于 [Node.js](https://nodejs.org/) 运行时与 [`minecraft-protocol`](https://github.com/PrismarineJS/node-minecraft-protocol) 库模拟 Minecraft 客户端连接，自动完成以下流程：

1. **登录验证**  
   监听聊天提示，当服务器要求登录时自动发送 `/l <password>` 完成完成身份核验。

2. **紫水晶签到**  
   检测签到容器界面，按顺序拾取`黄色羊毛`与`书`，完成每日紫水晶签到。

3. **钓鱼数据同步与子服切换**  
   等待服务器广播钓鱼数据同步完成，随即发送 `/server build-1` 指令进入建筑服。

4. **Build-1 曲奇签到**  
   确认已进入目标子服后，执行 `/signin` 获取曲奇奖励。

5. **主动断连**  
   收到签到成功消息后，客户端自动关闭连接，结束任务。

---

## 为什么是 72 分钟？

GitHub Actions 定时任务存在 1–15 分钟随机延迟。若按 60 分钟冷却卡点，延迟极易导致签到失败。  
采用 **72 分钟** 提供充足缓冲，每日稳定运行 20 次。

| 间隔 | 理论次数/天 | 实际成功率 |
|------|------------|------------|
| 60 分钟 | 24 | 约 40% |
| **72 分钟** | **20** | **>90%** |

---

## 隐私与安全

- 账号凭据仅以加密形式存储在 GitHub Secrets 中，脚本运行时在云端安全解密。
- 所有代码公开可审计，脚本仅包含登录与签到逻辑，有全部注释，无隐私泄露或恶意操作风险。

---

## 许可证

本作品采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可协议。
