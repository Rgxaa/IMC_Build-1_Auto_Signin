// 导入 Minecraft 协议库，用于与服务器通信
const m = require('minecraft-protocol'),

    // 服务器连接配置，敏感信息从环境变量读取
    c = {
        username: process.env.USERNAME,      // 玩家名（离线模式）
        host: 'off.imc.cab',                 // 服务器地址
        port: 25565,                         // 端口
        version: '1.8.9',                    // 客户端版本
        protocolVersion: 47,                 // 对应协议号
        password: process.env.PASSWORD       // 登录密码
    };

/**
 * 将 Minecraft 聊天组件（JSON / 字符串 / 对象）转换为纯文本
 * @param {Object|string} e - 聊天消息原始内容
 * @returns {string} 提取后的纯文本
 */
function p(e) {
    if (!e) return '';
    // 如果是字符串，尝试解析为 JSON，失败则直接返回
    if (typeof e == 'string') {
        try {
            return u(JSON.parse(e));
        } catch {
            return e;
        }
    }
    // 对象类型递归解析
    return typeof e == 'object' ? u(e) : String(e);
}

/**
 * 递归解析聊天组件对象
 * @param {Object} e - 包含 text, extra, translate 等字段的组件
 * @returns {string} 拼接后的文本
 */
function u(e) {
    if (!e) return '';
    let t = '';
    if (e.text) t += e.text;                        // 直接文本
    if (e.extra && Array.isArray(e.extra))         // 额外子组件
        e.extra.forEach(r => t += u(r));
    if (e.translate) {                              // 本地化键
        t += e.translate;
        if (e.with) e.with.forEach(r => t += ' ' + u(r)); // 参数
    }
    return t;
}

/**
 * 去除 Minecraft 颜色/样式代码（§ 符号后跟格式字符）
 * @param {string} e - 原始字符串
 * @returns {string} 清洗后的纯文本
 */
function f(e) {
    return e ? String(e).replace(/§[0-9a-fk-or]/gi, '') : '';
}

/**
 * 安全地将聊天消息转换为可显示的文本
 * @param {*} e - 任意聊天消息格式
 * @returns {string} 最终显示文本，默认返回“未知”
 */
function d(e) {
    if (!e) return '未知';
    if (typeof e == 'string') return f(e);
    if (typeof e == 'object') return f(p(e));
    return String(e);
}

// 生成北京时间的 [HH:MM:SS] 时间戳
function getBeijingTime() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Shanghai',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    const parts = new Intl.DateTimeFormat('en-CA', options).format(now).split(', ');
    const time = parts.length > 1 ? parts[1] : parts[0]; // 提取 HH:MM:SS
    return `[${time}]`;
}

// 日志辅助函数，统一输出格式，并加入北京时间的 [HH:MM:SS] 前缀
function info(msg)  { console.log(`${getBeijingTime()} [步骤] ${msg}`); }
function err(msg)   { console.error(`${getBeijingTime()} [错误] ${msg}`); }
function svr(msg)   { console.log(`${getBeijingTime()} [服务器] ${msg}`); }

// 判定物品：黄色羊毛（id:35, damage:4）
function isYellowWool(item) {
    return item.blockId === 35 && item.itemDamage === 4;
}
// 判定物品：书（id:340）
function isBook(item) {
    return item.blockId === 340;
}

/**
 * 向指定窗口的槽位发送鼠标左键单击（取物/放物）
 * @param {Object} client   - 已连接的客户端实例
 * @param {number} windowId - 窗口ID
 * @param {number} slot     - 槽位索引
 */
function clickSlot(client, windowId, slot) {
    info(`🖱️  点击窗口 (windowId=${windowId}, slot=${slot})`);
    client.write('window_click', {
        windowId: windowId,
        slot: slot,
        mouseButton: 0,          // 左键
        action: 0,
        mode: 0,                 // 普通点击模式
        item: { blockId: -1 }    // 空手
    });
}

/**
 * 对服务器执行 Ping 操作，获取在线信息与延迟
 * @returns {Promise<Object>} 解析后包含 description、players、latency 等字段
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
                try { svr(`描述: ${d(result.description)}`); } catch { err('描述: [解析失败]'); }
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
 * 主签到流程入口，负责连接、登录、紫水晶签到、切换子服、普通签到
 */
async function h() {
    info('IMC 建筑服签到机器人启动...');

    return new Promise(async (resolve) => {
        try {
            // 1. Ping 服务器
            info('1. 正在 Ping 服务器...');
            const pingRes = await g();
            info(`Ping 延迟: ${pingRes.latency} ms`);

            // 2. 创建客户端连接
            info('2. 正在建立连接...');
            const client = m.createClient({
                host: c.host,
                port: c.port,
                username: c.username,
                version: c.version,
                keepAlive: true,
                hideErrors: false,
                auth: 'offline'                // 离线模式
            });

            // 总超时保护，防止流程卡死
            const timeout = setTimeout(() => {
                info('⏰ 全局超时，强制终止连接');
                client.end();
                resolve();
            }, 40000);

            // 流程状态机（移除了 wait_fish 状态，登录后直接监听钓鱼同步）
            let state = 'login';                // login -> wait_switch -> wait_sign
            let guiWindowId = -1;               // 当前打开的容器窗口 ID
            let woolClicked = false;            // 是否已拾取黄色羊毛
            let bookClicked = false;            // 是否已拾取书
            let loginCount = 0;                 // 登录维度计数（用于区分初次加入与切换维度）
            let brandReplied = false;           // 是否已回复过 brand 信息

            // 统一清理资源
            function cleanup() {
                clearTimeout(timeout);
                client.end();
            }

            // 签到成功完成
            function done() {
                info('✅ 所有签到任务已完成，主动断开连接');
                cleanup();
                resolve();
            }

            // 签到失败或需要中止
            function fail(reason) {
                info(`❌ 签到失败: ${reason}`);
                cleanup();
                resolve();
            }

            // ══════════════════ 并行监听：数据包处理（含 brand 回复与紫水晶签到窗口） ══════════════════
            client.on('packet', (data, meta) => {
                // 调试日志：打印收到的每个数据包名称
                try {
                    info(`DEBUG packet: ${meta.name}`);
                } catch (e) {
                    // 调试日志异常不影响主流程
                }

                // 专门记录 kick_disconnect 的踢出原因
                if (meta.name === 'kick_disconnect') {
                    try {
                        const reason = f(p(data.reason));
                        info(`DEBUG kick_disconnect 原因: ${reason}`);
                    } catch (e) {
                        info(`DEBUG kick_disconnect 原始数据: ${JSON.stringify(data)}`);
                    }
                }

                // 处理 custom_payload（响应品牌查询与通道注册，防止被误判为网页版）
                if (meta.name === 'custom_payload') {
                    try {
                        const channel = data.channel;
                        let payloadStr = '';
                        if (Buffer.isBuffer(data.data)) {
                            payloadStr = data.data.toString('utf8');
                            // 若不是可打印字符串，显示十六进制
                            if (!/^[\x20-\x7E]*$/.test(payloadStr)) {
                                payloadStr = data.data.toString('hex');
                            }
                        } else if (typeof data.data === 'string') {
                            payloadStr = data.data;
                        }
                        info(`DEBUG custom_payload channel=${channel}, data=${payloadStr}`);

                        // 自动回复 minecraft:brand 或 MC|Brand（只回复一次）
                        if (!brandReplied && (channel === 'minecraft:brand' || channel === 'MC|Brand')) {
                            brandReplied = true;
                            const brand = Buffer.from('vanilla', 'utf8');
                            client.write('custom_payload', {
                                channel: channel,
                                data: brand
                            });
                            info('已回复 ' + channel + ' (vanilla)');
                        }

                        // 如果服务器要求注册通道，声明我们支持的通道列表
                        if (channel === 'minecraft:register') {
                            const supportedChannels = 'minecraft:brand\0MC|Brand\0';
                            client.write('custom_payload', {
                                channel: 'minecraft:register',
                                data: Buffer.from(supportedChannels, 'utf8')
                            });
                            info('已回复 minecraft:register，声明支持 brand 通道');
                        }
                    } catch (e) {
                        info(`DEBUG custom_payload 处理异常: ${e.message}`);
                    }
                }

                // 紫水晶签到窗口：open_window
                if (meta.name === 'open_window') {
                    // 检测到容器打开（minecraft:container 代表普通箱子/界面）
                    if (data.inventoryType === 'minecraft:container') {
                        info(`📦 检测到容器打开: windowId=${data.windowId}, 槽位数=${data.slotCount}`);
                        guiWindowId = data.windowId;
                    }
                } else if (meta.name === 'window_items') {
                    // 容器物品更新
                    if (data.windowId !== guiWindowId) return;
                    let foundWool = false, foundBook = false;
                    data.items.forEach((item, slot) => {
                        if (item.blockId === -1) return;  // 空槽位
                        // 优先拾取黄色羊毛（若尚未完成）
                        if (!woolClicked && isYellowWool(item)) {
                            info(`🐑 找到黄色羊毛 (slot=${slot})，开始拾取`);
                            clickSlot(client, guiWindowId, slot);
                            woolClicked = true;
                            foundWool = true;
                        // 羊毛已拾取后再找书
                        } else if (woolClicked && !bookClicked && isBook(item)) {
                            info(`📖 找到书 (slot=${slot})，开始拾取`);
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

            // ══════════════════ 并行监听：聊天消息驱动的主流程 ══════════════════
            client.on('chat', async (packet) => {
                try {
                    const rawText = p(packet.message);
                    const plainText = f(rawText).trim();
                    if (!plainText) return;
                    svr(plainText);   // 输出服务器传来的每一条聊天信息

                    // 1. 要求登录 → 发送登录指令
                    if (plainText.toLowerCase().includes('/login')) {
                        info('🔑 收到登录请求，发送密码...');
                        client.write('chat', { message: `/l ${c.password}` });
                        return;
                    }

                    // 2. 登录成功提示（仅作日志记录，状态保持 login 不变，继续等待钓鱼同步）
                    if (plainText.includes('登录成功') && plainText.includes('欢迎回来')) {
                        info('🔓 登录验证通过');
                        return;
                    }

                    // 3. 紫水晶签到成功（日志记录，不改变状态）
                    if (plainText.includes('签到成功') && state === 'login') {
                        info('🍇 紫水晶签到已确认');
                        return;
                    }

                    // 4. 钓鱼数据同步成功 → 发送切换子服命令
                    if (plainText.includes('钓鱼数据同步成功') && state === 'login') {
                        info('🎣 钓鱼数据同步完毕，开始切换子服...');
                        state = 'wait_switch';
                        client.write('chat', { message: '/server build-1' });
                        return;
                    }

                    // 5. 成功切换子服（Build-1）
                    if (state === 'wait_switch' && plainText === `|   + ${c.username}`) {
                        info('🏠 已进入子服 build-1，发送签到命令');
                        state = 'wait_sign';
                        client.write('chat', { message: '/signin' });
                        info('✍️  普通签到命令已发送');
                        return;
                    }

                    // 6. 普通签到成功（获得曲奇）
                    if (state === 'wait_sign' && plainText.includes('+ 20 曲奇')) {
                        info('🍪 普通签到奖励获取成功');
                        done();
                        return;
                    }

                    // 7. 异常流程处理
                    if (plainText.includes('/bind') || plainText.includes('绑定')) {
                        fail('账号未绑定游戏角色');
                        return;
                    }
                    if (plainText.includes('才能再次领取该奖励')) {
                        fail('签到处于冷却中，签到失败');
                        return;
                    }
                } catch (e) { /* 忽略聊天解析异常 */ }
            });

            // ══════════════════ 连接生命周期事件 ══════════════════
            client.on('login', () => {
                loginCount++;
                if (loginCount === 1) {
                    info('✅ 已成功加入服务器，等待自动登录流程...');
                } else {
                    info('🔄 检测到维度/世界切换');
                }
            });

            client.on('error', (er) => {
                err(`网络错误: ${er.message}`);
                cleanup();
                resolve();
            });

            client.on('end', () => {
                info('连接已关闭');
                clearTimeout(timeout);
                resolve();
            });

            client.on('disconnect', (packet) => {
                if (packet.reason) {
                    try { svr(`断开连接: ${f(p(packet.reason))}`); } catch { info('与服务器断开连接'); }
                }
                clearTimeout(timeout);
                resolve();
            });

        } catch (r) {
            err(`流程异常: ${r.message}`);
            resolve();
        }
    });
}

// 程序入口
(async () => {
    await h();
})();