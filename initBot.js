const db = require('./utils/db');
require('dotenv').config();


async function initLBKUSDTBot() {
  try {
    await db.initDatabase();

    // 插入交易所账户
    const [accountResult] = await db.pool.query(
      'INSERT INTO exchange_accounts (name, api_key, api_secret, rest_api_url,memo) VALUES (?, ?, ?, ?, ?)',
      ['lbank', '1', '1', 'http://103.153.101.112:1173','']
    );
    const accountId = accountResult.insertId;

    // 插入交易对
    const [pairResult] = await db.pool.query(
      'INSERT INTO trading_pairs (pair) VALUES (?)',
      ['LBK_USDT']
    );
    const tradingPairId = pairResult.insertId;

    // 创建配置对象
    const config = {
      base_spread: 0.001,      // 基础价差，表示买卖订单之间的最小价差百分比
      base_order_size: 10,     // 基础订单大小，表示每个订单的基本数量
      min_profit: 0.001,       // 最小利润，用于决定何时更新订单的阈值
      max_position: 0.1,       // 最大持仓量，用于控制风险敞口
      order_levels: 5,         // 订单档位数量，决定在每个方向上放置多少个订单
      amount_precision: 0,     // 数量精度，用于控制订单数量的小数位数
      price_precision: 6,      // 价格精度，用于控制订单价格的小数位数
      min_multiplier: 0.80,    // 最小乘数，用于计算不同档位订单的大小
      max_multiplier: 1.80,    // 最大乘数，用于计算不同档位订单的大小
      spread_increment: 0.50   // 价差增量，用于计算不同档位订单的价差
    };
    // 插入机器人配置
    await db.pool.query(
      `INSERT INTO market_maker_bots 
      (name, account_id, trading_pair_id, config, is_active) 
      VALUES (?, ?, ?, ?, ?)`,
      ['LBK_USDT_BOT', accountId, tradingPairId, JSON.stringify(config), true]
    );

    // console.log('LBK_USDT 交易对机器人初始化完成');
  } catch (error) {
    console.error('初始化 LBK_USDT 交易对机器人时发生错误:', error);
  } finally {
    await db.pool.end();
  }
}

initLBKUSDTBot();