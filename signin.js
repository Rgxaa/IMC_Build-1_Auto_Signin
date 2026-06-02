// 导入 Minecraft 协议库，用于模拟客户端与服务器通信
const m = require('minecraft-protocol'),

    // 服务器连接配置，敏感信息通过环境变量传入
    c = {
        username: process.env.USERNAME,      // 离线模式玩家名
        host: 'off.s4.imc.cab',              // 目标服务器地址
        port: 25565,                         // 服务器端口
        version: '1.8.9',                    // 模拟的客户端版本
        protocolVersion: 47,                 // 对应协议号（1.8.9）
        password: process.env.PASSWORD       // IMC 登录密码
    };

/**
 * 将 Minecraft 聊天组件（可能是 JSON 字符串、对象或纯文本）转换为纯文本
 * @param {Object|string} e - 原始聊天消息
 * @returns {string} 提取后的可读文本
 */
function p(e) {
    if (!e) return '';
    // 尝试解析 JSON 字符串，失败则按普通字符串处理
    if (typeof e == 'string') {
        try {
            return u(JSON.parse(e));
        } catch {
            return e;
        }
    }
    // 对象形式则递归解析其组件树
    return typeof e == 'object' ? u(e) : String(e);
}

/**
 * 递归解析聊天组件对象，拼接所有文字内容
 * @param {Object} e - 包含 text / extra / translate 等字段的聊天组件
 * @returns {string} 拼接后的纯文本
 */
function u(e) {
    if (!e) return '';
    let t = '';
    if (e.text) t += e.text;                         // 直接文本部分
    if (e.extra && Array.isArray(e.extra))          // 附加子组件列表
        e.extra.forEach(r => t += u(r));
    if (e.translate) {                               // 本地化标识符
        t += e.translate;
        if (e.with) e.with.forEach(r => t += ' ' + u(r)); // 本地化参数
    }
    return t;
}

/**
 * 去除 Minecraft 经典颜色/样式代码（§ 符号及其后格式字符）
 * @param {string} e - 原始字符串
 * @returns {string} 清洗后的纯文本
 */
function f(e) {
    return e ? String(e).replace(/§[0-9a-fk-or]/gi, '') : '';
}

/**
 * 安全地将任意聊天消息转换为可打印字符串，无法解析时返回“未知”
 * @param {*} e - 任意格式的聊天消息
 * @returns {string} 适合日志输出的文本
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
    // en-CA 区域会输出类似 "2026-06-01, 11:45:14" 的格式
    const parts = new Intl.DateTimeFormat('en-CA', options).format(now).split(', ');
    const time = parts.length > 1 ? parts[1] : parts[0]; // 提取时间部分
    return `[${time}]`;
}

// 统一日志输出接口，自动添加北京时间戳
function info(msg)  { console.log(`${getBeijingTime()} [步骤] ${msg}`); }
function err(msg)   { console.error(`${getBeijingTime()} [错误] ${msg}`); }
function svr(msg)   { console.log(`${getBeijingTime()} [服务器] ${msg}`); }

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
 * 向指定窗口的指定槽位发送鼠标左键单击操作
 * @param {Object} client   - Minecraft 客户端实例
 * @param {number} windowId - 窗口 ID
 * @param {number} slot     - 槽位索引
 */
function clickSlot(client, windowId, slot) {
    info(`🖱️  点击窗口 (windowId=${windowId}, slot=${slot})`);
    client.write('window_click', {
        windowId: windowId,
        slot: slot,
        mouseButton: 0,          // 鼠标左键
        action: 0,
        mode: 0,                 // 普通点击模式
        item: { blockId: -1 }    // 空手（无物品携带）
    });
}

/**
 * Ping 目标服务器，获取 MOTD、在线人数、延迟等信息
 * @returns {Promise<Object>} 包含 description, players, latency 等字段的结果对象
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
 * 主签到流程入口
 * 依次完成：登录验证 → 紫水晶签到 → 钓鱼同步 → 切换 Build-1 子服 → 普通签到 → 断开连接
 */
async function h() {
    info('IMC 建筑服自动签到脚本启动...');

    return new Promise(async (resolve) => {
        try {
            // 1. 检测服务器可达性
            info('1. 正在 Ping 服务器...');
            const pingRes = await g();
            info(`Ping 延迟: ${pingRes.latency} ms`);

            // 2. 建立 Minecraft 客户端连接
            info('2. 正在建立连接...');
            const client = m.createClient({
                host: c.host,
                port: c.port,
                username: c.username,
                version: c.version,
                keepAlive: true,
                hideErrors: false,
                auth: 'offline'                // 使用离线模式认证
            });

            // 全局超时保护（40 秒），避免流程异常时无限挂起
            const timeout = setTimeout(() => {
                info('⏰ 全局超时（40秒），强制终止连接');
                client.end();
                resolve();
            }, 40000);

            // 流程状态机：login（大厅） → wait_switch（等待子服切换） → wait_sign（等待签到结果）
            let state = 'login';
            let guiWindowId = -1;               // 当前打开的容器窗口 ID
            let woolClicked = false;            // 是否已点击黄色羊毛
            let bookClicked = false;            // 是否已点击书
            let loginCount = 0;                 // 维度/世界切换计数（区分初次加入与后续切换）

            // 资源清理与连接终止
            function cleanup() {
                clearTimeout(timeout);
                client.end();
            }

            // 所有签到任务完成
            function done() {
                info('✅ 全部签到流程完成，主动断开连接');
                cleanup();
                resolve();
            }

            // 签到失败或因特定原因终止
            function fail(reason) {
                info(`❌ 签到终止: ${reason}`);
                cleanup();
                resolve();
            }

            // ══════════════════ 并行监听 1：紫水晶签到容器操作 ══════════════════
            client.on('packet', (data, meta) => {
                if (meta.name === 'open_window') {
                    // 检测到容器界面打开（minecraft:container 表示箱子/功能性 GUI）
                    if (data.inventoryType === 'minecraft:container') {
                        info(`📦 检测到容器打开: windowId=${data.windowId}, 槽位数=${data.slotCount}`);
                        guiWindowId = data.windowId;
                    }
                } else if (meta.name === 'window_items') {
                    // 容器内物品更新，仅处理当前关注的窗口
                    if (data.windowId !== guiWindowId) return;
                    let foundWool = false, foundBook = false;
                    data.items.forEach((item, slot) => {
                        if (item.blockId === -1) return;              // 空槽位忽略
                        // 优先点击黄色羊毛（若尚未操作）
                        if (!woolClicked && isYellowWool(item)) {
                            info(`🐑 发现黄色羊毛 (slot=${slot})，执行拾取`);
                            clickSlot(client, guiWindowId, slot);
                            woolClicked = true;
                            foundWool = true;
                        // 羊毛已拾取后，继续寻找书
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

            // ══════════════════ 并行监听 2：聊天消息驱动主流程 ══════════════════
            client.on('chat', async (packet) => {
                try {
                    const rawText = p(packet.message);
                    const plainText = f(rawText).trim();
                    if (!plainText) return;
                    svr(plainText);   // 输出服务器所有聊天内容，便于调试

                    // 1. 收到登录请求 → 发送密码
                    if (plainText.toLowerCase().includes('/login')) {
                        info('🔑 检测到登录提示，正在发送密码...');
                        client.write('chat', { message: `/l ${c.password}` });
                        return;
                    }

                    // 2. 登录成功提示（仅记录日志，保持 login 状态，等待钓鱼同步）
                    if (plainText.includes('登录成功') && plainText.includes('欢迎回来')) {
                        info('🔓 登录验证通过');
                        return;
                    }

                    // 3. 紫水晶签到成功（仅日志）
                    if (plainText.includes('签到成功') && state === 'login') {
                        info('🍇 紫水晶已签到');
                        return;
                    }

                    // 4. 钓鱼数据同步完成 → 发送切换 Build-1 子服命令
                    if (plainText.includes('钓鱼数据同步成功') && state === 'login') {
                        info('🎣 钓鱼数据同步完毕，准备切换至 Build-1 子服...');
                        state = 'wait_switch';
                        client.write('chat', { message: '/server build-1' });
                        return;
                    }

                    // 5. 子服切换成功（匹配格式："|   + 玩家名"）
                    if (state === 'wait_switch' && plainText === `|   + ${c.username}`) {
                        info('🏠 已进入 Build-1 子服，发送曲奇签到指令');
                        state = 'wait_sign';
                        client.write('chat', { message: '/signin' });
                        info('✍️  曲奇签到命令已发送');
                        return;
                    }

                    // 6. 曲奇签到成功（获得 20 曲奇）
                    if (state === 'wait_sign' && plainText.includes('+ 20 曲奇')) {
                        info('🍪 曲奇签到奖励领取成功');
                        done();
                        return;
                    }

                    // 7. 异常/阻止情况处理
                    if (plainText.includes('/bind') || plainText.includes('绑定')) {
                        fail('账号未绑定游戏角色');
                        return;
                    }
                    if (plainText.includes('才能再次领取该奖励')) {
                        fail('曲奇签到冷却中');
                        return;
                    }
                } catch (e) { /* 忽略聊天解析过程中的异常 */ }
            });

            // ══════════════════ 连接生命周期事件 ══════════════════
            client.on('login', () => {
                loginCount++;
                if (loginCount === 1) {
                    info('✅ 已成功加入服务器，开始等待自动登录流程...');

                    // 主动发送原版客户端应有的插件通道信息，防止被识别为第三方EaglerCraft客户端
                    // 1. 告知服务器本客户端品牌为 "vanilla"
                    client.write('custom_payload', {
                        channel: 'MC|Brand',
                        data: Buffer.from('vanilla', 'utf8')
                    });
                    info('已主动发送客户端品牌标识: vanilla');

                    // 2. 注册插件通道，声明支持 "MC|Brand"
                    client.write('custom_payload', {
                        channel: 'REGISTER',
                        data: Buffer.from('MC|Brand', 'utf8')
                    });
                    info('已主动注册插件通道: MC|Brand');
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

// 脚本入口，启动主流程
(async () => {
    await h();
})();