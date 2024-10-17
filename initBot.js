const db = require('./db');
require('dotenv').config();

// 初始化数据库（如果还没有初始化的话）。
// 在 exchange_accounts 表中插入 LBank 的账户信息。
// 在 trading_pairs 表中插入 BTC_USDT 交易对。
// 在 market_maker_bots 表中插入一个新的机器人配置，使用以下参数：
// 基础价差 (base_spread): 0.1% (0.001)
// 基础订单大小 (base_order_size): 10 LBK
// 最小利润 (min_profit): 0.1% (0.001)
// 最大持仓 (max_position): 0.1 BTC
// 订单档位 (order_levels): 5
// 是否激活 (is_active): true
async function initLBKUSDTBot() {
  try {
    await db.initDatabase();

    // 插入交易所账户
    const [accountResult] = await db.pool.query(
      'INSERT INTO exchange_accounts (name, api_key, api_secret, rest_api_url) VALUES (?, ?, ?, ?)',
      ['lbank', '1', '1', 'http://103.153.101.112:1173']
    );
    const accountId = accountResult.insertId;

    // 插入交易对
    const [pairResult] = await db.pool.query(
      'INSERT INTO trading_pairs (pair) VALUES (?)',
      ['LBK_USDT']
    );
    const tradingPairId = pairResult.insertId;

    // 插入机器人配置
    await db.pool.query(
      `INSERT INTO market_maker_bots 
      (name, account_id, trading_pair_id, base_spread, base_order_size, min_profit, max_position, order_levels, is_active, amount_precision, price_precision, min_multiplier, max_multiplier, spread_increment) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['LBK_USDT_BOT', accountId, tradingPairId, 0.001, 10, 0.001, 0.1, 5, true, 0, 6, 0.80, 1.80, 0.50]
    );

    // console.log('LBK_USDT 交易对机器人初始化完成');
  } catch (error) {
    console.error('初始化 LBK_USDT 交易对机器人时发生错误:', error);
  } finally {
    await db.pool.end();
  }
}

initLBKUSDTBot();