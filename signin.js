// 导入 Minecraft 协议库，用于模拟客户端与服务器通信
const m = require('minecraft-protocol');

// 服务器连接配置（账号密码通过环境变量传入，不在代码中硬编码）
const c = {
    username: process.env.USERNAME,   // 离线模式使用的玩家名
    host: 'off.imc.cab',              // IMC 服务器地址
    port: 25565,                      // 默认端口
    version: '1.8.9',                 // 客户端版本
    password: process.env.PASSWORD    // 游戏内登录密码（/l 密码）
};

/**
 * 将 Minecraft 聊天组件（JSON 字符串或对象）转换为纯文本
 * @param {Object|string} e - 原始聊天消息
 * @returns {string} 提取后的可读文本
 */
function p(e) {
    if (!e) return '';
    if (typeof e == 'string') {
        // 尝试解析 JSON 字符串，若失败则作为普通字符串返回
        try {
            return u(JSON.parse(e));
        } catch {
            return e;
        }
    }
    return typeof e == 'object' ? u(e) : String(e);
}

/**
 * 递归解析聊天组件对象，拼接所有文字内容（支持 text/extra/translate 等字段）
 * @param {Object} e - 聊天组件
 * @returns {string} 拼接后的纯文本
 */
function u(e) {
    if (!e) return '';
    let t = '';
    if (e.text) t += e.text;                     // 直接文本
    if (e.extra && Array.isArray(e.extra))       // 附加子组件
        e.extra.forEach(r => t += u(r));
    if (e.translate) {                           // 本地化标识符（如多语言键）
        t += e.translate;
        if (e.with) e.with.forEach(r => t += ' ' + u(r)); // 本地化参数
    }
    return t;
}

/**
 * 去除 Minecraft 颜色/样式代码（§ 符号及其后格式字符）
 * @param {string} e - 原始字符串
 * @returns {string} 清洗后的纯文本
 */
function f(e) {
    return e ? String(e).replace(/§[0-9a-fk-or]/gi, '') : '';
}

/**
 * 安全地将任意格式的聊天消息转换为可打印字符串，用于日志输出
 * @param {*} e - 聊天原始数据
 * @returns {string} 日志友好的文本
 */
function d(e) {
    if (!e) return '未知';
    if (typeof e == 'string') return f(e);
    if (typeof e == 'object') return f(p(e));
    return String(e);
}

/**
 * 生成当前北京时间（Asia/Shanghai）的 [HH:MM:SS] 时间戳字符串
 * @returns {string} 形如 "[11:45:14]" 的时间前缀
 */
function getBeijingTime() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Shanghai',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    // en-CA 格式输出 "2026-06-01, 11:45:14"，取逗号后的时间部分
    const parts = new Intl.DateTimeFormat('en-CA', options).format(now).split(', ');
    const time = parts.length > 1 ? parts[1] : parts[0];
    return `[${time}]`;
}

// 统一日志输出接口，自动添加北京时间戳和标签
function info(msg) { console.log(`${getBeijingTime()} [脚本] ${msg}`); }
function err(msg) { console.error(`${getBeijingTime()} [错误] ${msg}`); }
function svr(msg) { console.log(`${getBeijingTime()} [服务器] ${msg}`); }

/**
 * 判断物品是否为黄色羊毛（id=35, damage=4）
 * @param {Object} item - 物品对象，需包含 blockId 和 itemDamage
 * @returns {boolean}
 */
function isYellowWool(item) {
    return item.blockId === 35 && item.itemDamage === 4;
}

/**
 * 判断物品是否为书（id=340）
 * @param {Object} item
 * @returns {boolean}
 */
function isBook(item) {
    return item.blockId === 340;
}

/**
 * 向指定窗口的指定槽位发送鼠标左键单击操作（用于紫水晶签到 GUI）
 * @param {Object} client   - Minecraft 客户端实例
 * @param {number} windowId - 窗口 ID
 * @param {number} slot     - 槽位索引
 */
function clickSlot(client, windowId, slot) {
    info(`🖱️  点击窗口 (windowId=${windowId}, slot=${slot})`);
    client.write('window_click', {
        windowId: windowId,
        slot: slot,
        mouseButton: 0,          // 0 = 左键
        action: 0,
        mode: 0,                 // 普通点击模式
        item: { blockId: -1 }    // 空手（无物品）
    });
}

/**
 * Ping 目标服务器，获取 MOTD、在线人数、延迟等信息
 * @returns {Promise<Object>} 包含 description, players, latency 等字段的结果
 */
async function g() {
    return new Promise((resolve, reject) => {
        m.ping({
            host: c.host,
            port: c.port,
            version: c.version
        }, (error, result) => {
            if (error) {
                err(`服务器 Ping 失败: ${error.message}`);
                reject(error);
            } else {
                info('══════════════════════════════════════');
                info('服务器信息:');
                try {
                    svr(`描述: ${d(result.description)}`);
                } catch {
                    err('描述: [解析失败]');
                }
                svr(`在线人数: ${result.players.online} / ${result.players.max}`);
                if (result.players && result.players.sample)
                    svr(`在线玩家: ${result.players.sample.map(n => n.name).join(', ')}`);
                svr(`延迟: ${result.latency} ms`);
                svr(`协议版本: ${result.version.protocol}`);
                info('══════════════════════════════════════');
                resolve(result);
            }
        });
    });
}

/**
 * 主签到流程入口（状态机驱动）
 * 流程：Ping → 连接 → 登录 → 钓鱼同步 → 切换 Build-1 子服 → 曲奇签到 → 结束
 * 同时并行监听原始数据包处理紫水晶签到 GUI（点击黄色羊毛和书）
 */
async function h() {
    info('IMC 建筑服自动签到脚本启动...');

    return new Promise(async (resolve) => {
        let finished = false;            // 防止重复结束（成功/失败只执行一次）
        let state = 'login';             // 状态机：login → wait_switch → wait_sign
        let guiWindowId = -1;            // 当前打开的容器窗口 ID（用于紫水晶签到）
        let woolClicked = false;          // 是否已点击黄色羊毛
        let bookClicked = false;          // 是否已点击书
        let loginCount = 0;              // 维度/世界切换计数（区分初次加入与子服切换）
        let client = null;               // Minecraft 客户端实例
        let timeout = null;              // 全局超时定时器

        /**
         * 统一终止流程函数（无论成功或失败均调用）
         * @param {string} reason   - 结束原因（用于日志）
         * @param {boolean} isSuccess - true=签到成功, false=失败
         */
        function endProcess(reason, isSuccess = false) {
            if (finished) return;        // 已结束，避免重复执行
            finished = true;

            if (timeout) clearTimeout(timeout);   // 清除超时定时器

            if (isSuccess) {
                info(`✅ 签到成功: ${reason}`);
            } else {
                info(`❌ 签到终止: ${reason}`);
            }

            // 断开连接并清理事件监听，避免残留回调
            if (client && client.end) {
                client.end();
                client.removeAllListeners();
            }

            resolve();                  // 结束 Promise
            // 强制退出 Node.js 进程，确保 GitHub Actions 或 Termux 中不会因未清理资源而挂起
            process.exit(isSuccess ? 0 : 0);   // 退出码统一为 0（可根据需要修改）
        }

        try {
            // ---------- 步骤1：Ping 服务器获取延迟 ----------
            info('1. 正在 Ping 服务器...');
            const pingRes = await g();
            info(`Ping 延迟: ${pingRes.latency} ms`);

            // ---------- 步骤2：建立 Minecraft 连接（离线模式） ----------
            info('2. 正在建立连接...');
            client = m.createClient({
                host: c.host,
                port: c.port,
                username: c.username,
                version: c.version,
                keepAlive: true,          // 自动响应服务器 keepalive 包
                hideErrors: false,
                auth: 'offline'           // 离线认证模式
            });

            // 全局超时保护（30 秒），防止网络卡死导致脚本永久挂起
            timeout = setTimeout(() => {
                if (!finished) {
                    err('⏰ 全局超时（30秒），强制终止');
                    endProcess('全局超时（30秒）', false);
                }
            }, 30000);

            // ---------- 并行监听1：处理紫水晶签到 GUI（原始数据包） ----------
            client.on('packet', (data, meta) => {
                if (finished) return;

                // 检测到容器窗口打开（例如每日签到 GUI）
                if (meta.name === 'open_window') {
                    if (data.inventoryType === 'minecraft:container') {
                        info(`📦 检测到容器打开: windowId=${data.windowId}, 槽位数=${data.slotCount}`);
                        guiWindowId = data.windowId;
                    }
                }
                // 容器内物品列表更新（用于定位羊毛和书）
                else if (meta.name === 'window_items') {
                    if (data.windowId !== guiWindowId) return;

                    let foundWool = false, foundBook = false;
                    data.items.forEach((item, slot) => {
                        if (item.blockId === -1) return; // 空槽位
                        // 按顺序：先点击黄色羊毛，再点击书
                        if (!woolClicked && isYellowWool(item)) {
                            info(`🐑 发现黄色羊毛 (slot=${slot})，执行拾取`);
                            clickSlot(client, guiWindowId, slot);
                            woolClicked = true;
                            foundWool = true;
                        } else if (woolClicked && !bookClicked && isBook(item)) {
                            info(`📖 发现书 (slot=${slot})，执行拾取`);
                            clickSlot(client, guiWindowId, slot);
                            bookClicked = true;
                            foundBook = true;
                        }
                    });
                    if (foundBook) {
                        info('🍇 紫水晶签到物品收集完成');
                    }
                }
            });

            // ---------- 并行监听2：聊天消息驱动主状态机 ----------
            client.on('chat', async (packet) => {
                if (finished) return;
                try {
                    const rawText = p(packet.message);
                    const plainText = f(rawText).trim();
                    if (!plainText) return;
                    svr(plainText);   // 输出服务器所有聊天内容，便于调试

                    // 1. 收到登录请求（/login 提示） → 发送密码
                    if (plainText.toLowerCase().includes('/login')) {
                        info('🔑 检测到登录提示，正在发送密码...');
                        client.write('chat', { message: `/l ${c.password}` });
                        return;
                    }

                    // 2. 登录成功确认（仅记录日志）
                    if (plainText.includes('登录成功') && plainText.includes('欢迎回来')) {
                        info('🔓 登录验证通过');
                        return;
                    }

                    // 3. 紫水晶签到成功提示（仅日志，状态仍为 login）
                    if (plainText.includes('签到成功') && state === 'login') {
                        info('🍇 紫水晶已签到');
                        return;
                    }

                    // 4. 钓鱼数据同步完成 → 发送切换至 Build-1 子服的命令
                    if (plainText.includes('钓鱼数据同步成功') && state === 'login') {
                        info('🎣 钓鱼数据同步完毕，准备切换至 Build-1 子服...');
                        state = 'wait_switch';   // 进入等待子服切换状态
                        client.write('chat', { message: '/server build-1' });
                        return;
                    }

                    // 5. 子服切换成功（聊天格式："|   + 玩家名"）→ 发送曲奇签到指令
                    if (state === 'wait_switch' && plainText === `|   + ${c.username}`) {
                        info('🏠 已进入 Build-1 子服，发送曲奇签到指令');
                        state = 'wait_sign';     // 进入等待曲奇奖励状态
                        client.write('chat', { message: '/signin' });
                        info('✍️  曲奇签到命令已发送');
                        return;
                    }

                    // 6. 曲奇签到成功（获得 20 曲奇）→ 全部完成，结束流程
                    if (state === 'wait_sign' && plainText.includes('+ 20 曲奇')) {
                        info('🍪 曲奇签到奖励领取成功');
                        endProcess('已领取 20 曲奇', true);
                        return;
                    }

                    // 7. 账号未绑定 → 终止签到
                    if (plainText.includes('/bind') || plainText.includes('绑定')) {
                        endProcess('账号未绑定游戏角色', false);
                        return;
                    }

                    // 8. 已经签到过（冷却中）→ 终止签到
                    if (plainText.includes('才能再次领取该奖励')) {
                        endProcess('曲奇签到冷却中', false);
                        return;
                    }
                } catch (e) {
                    // 忽略聊天解析过程中的异常（不影响主流程）
                }
            });

            // ---------- 连接生命周期事件 ----------
            client.on('login', () => {
                if (finished) return;
                loginCount++;
                if (loginCount === 1) {
                    info('✅ 已成功加入服务器，开始等待自动登录流程...');
                } else {
                    info('🔄 检测到维度/世界切换');   // 切换子服时也会触发 login 事件
                }
            });

            client.on('error', (er) => {
                if (!finished) {
                    err(`网络错误: ${er.message}`);
                    endProcess(`网络错误: ${er.message}`, false);
                }
            });

            client.on('end', () => {
                info('连接已关闭');
                if (!finished) {
                    endProcess('连接意外关闭', false);
                }
            });

            client.on('disconnect', (packet) => {
                if (packet.reason) {
                    try {
                        svr(`断开连接: ${f(p(packet.reason))}`);
                    } catch {
                        info('与服务器断开连接');
                    }
                }
                if (!finished) {
                    endProcess('服务器主动断开连接', false);
                }
            });

        } catch (r) {
            err(`流程异常: ${r.message}`);
            if (!finished) {
                endProcess(`流程异常: ${r.message}`, false);
            }
        }
    });
}

// 脚本入口：启动主流程
(async () => {
    await h();
})();