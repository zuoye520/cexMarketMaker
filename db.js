const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM information_schema.tables 
     WHERE table_schema = ? AND table_name = ?`,
    [process.env.DB_NAME, tableName]
  );
  return rows[0].count > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM information_schema.columns 
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [process.env.DB_NAME, tableName, columnName]
  );
  return rows[0].count > 0;
}

async function createTableIfNotExists(tableName, createTableSQL) {
  if (!(await tableExists(tableName))) {
    await pool.query(createTableSQL);
    console.log(`表 ${tableName} 已创建`);
  } else {
    console.log(`表 ${tableName} 已存在`);
  }
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  if (!(await columnExists(tableName, columnName))) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    console.log(`列 ${columnName} 已添加到表 ${tableName}`);
  } else {
    console.log(`列 ${columnName} 已存在于表 ${tableName}`);
  }
}

async function initDatabase() {
  await createTableIfNotExists('exchange_accounts', `
    CREATE TABLE exchange_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '交易所账户ID',
      name VARCHAR(50) NOT NULL COMMENT '交易所名称',
      api_key VARCHAR(100) NOT NULL COMMENT 'API密钥',
      api_secret VARCHAR(100) NOT NULL COMMENT 'API密钥',
      rest_api_url VARCHAR(255) NOT NULL COMMENT 'REST API URL',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
    ) COMMENT '交易所账户表'
  `);

  await createTableIfNotExists('trading_pairs', `
    CREATE TABLE trading_pairs (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '交易对ID',
      pair VARCHAR(20) NOT NULL UNIQUE COMMENT '交易对名称',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
    ) COMMENT '交易对表'
  `);

  await createTableIfNotExists('market_maker_bots', `
    CREATE TABLE market_maker_bots (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '做市商机器人ID',
      name VARCHAR(50) NOT NULL UNIQUE COMMENT '机器人名称',
      account_id INT NOT NULL COMMENT '关联的交易所账户ID',
      trading_pair_id INT NOT NULL COMMENT '关联的交易对ID',
      base_spread DECIMAL(5,4) NOT NULL COMMENT '基础价差',
      base_order_size DECIMAL(18,8) NOT NULL COMMENT '基础订单大小',
      min_profit DECIMAL(5,4) NOT NULL COMMENT '最小利润',
      max_position DECIMAL(18,8) NOT NULL COMMENT '最大持仓量',
      order_levels INT NOT NULL DEFAULT 5 COMMENT '订单档位数量',
      is_active BOOLEAN DEFAULT TRUE COMMENT '是否激活',
      amount_precision INT NOT NULL DEFAULT 8 COMMENT '数量精度',
      price_precision INT NOT NULL DEFAULT 8 COMMENT '价格精度',
      min_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT '最小乘数',
      max_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00 COMMENT '最大乘数',
      spread_increment DECIMAL(3,2) NOT NULL DEFAULT 0.50 COMMENT '价差增量',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      FOREIGN KEY (account_id) REFERENCES exchange_accounts(id),
      FOREIGN KEY (trading_pair_id) REFERENCES trading_pairs(id)
    ) COMMENT '做市商机器人表'
  `);

  await createTableIfNotExists('orders', `
    CREATE TABLE orders (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单ID',
      bot_id INT NOT NULL COMMENT '关联的机器人ID',
      side ENUM('buy', 'sell') NOT NULL COMMENT '订单方向',
      price DECIMAL(18, 8) NOT NULL COMMENT '订单价格',
      amount DECIMAL(18, 8) NOT NULL COMMENT '订单数量',
      status ENUM('open', 'filled', 'cancelled') NOT NULL COMMENT '订单状态',
      exchange_order_id VARCHAR(100) NOT NULL COMMENT '交易所订单ID',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      FOREIGN KEY (bot_id) REFERENCES market_maker_bots(id)
    ) COMMENT '订单表'
  `);

  await createTableIfNotExists('market_prices', `
    CREATE TABLE market_prices (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '市场价格ID',
      trading_pair_id INT NOT NULL COMMENT '关联的交易对ID',
      price DECIMAL(18, 8) NOT NULL COMMENT '市场价格',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
      FOREIGN KEY (trading_pair_id) REFERENCES trading_pairs(id)
    ) COMMENT '市场价格表'
  `);

  console.log('数据库初始化完成');
}

async function getOpenOrders(botId) {
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE bot_id = ? AND status = "open"',
    [botId]
  );
  return rows;
}

async function getOrderById(orderId) {
  const [rows] = await pool.query(
    'SELECT * FROM orders WHERE id = ?',
    [orderId]
  );
  return rows[0];
}

async function closeOrder(orderId) {
  await pool.query(
    'UPDATE orders SET status = "cancelled" WHERE id = ?',
    [orderId]
  );
}

async function insertOrder(botId, side, price, amount, exchangeOrderId) {
  await pool.query(
    'INSERT INTO orders (bot_id, side, price, amount, status, exchange_order_id) VALUES (?, ?, ?, ?, "open", ?)',
    [botId, side, price, amount, exchangeOrderId]
  );
}

async function getRecentPrices(tradingPairId, limit = 10) {
  const [rows] = await pool.query(
    'SELECT price FROM market_prices WHERE trading_pair_id = ? ORDER BY timestamp DESC LIMIT ?',
    [tradingPairId, limit]
  );
  return rows;
}

async function insertMarketPrice(tradingPairId, price) {
  await pool.query(
    'INSERT INTO market_prices (trading_pair_id, price) VALUES (?, ?)',
    [tradingPairId, price]
  );
}

async function getActiveBots() {
  const [rows] = await pool.query(`
    SELECT b.*, a.name as os_name,a.api_key, a.api_secret, a.rest_api_url, t.pair
    FROM market_maker_bots b
    JOIN exchange_accounts a ON b.account_id = a.id
    JOIN trading_pairs t ON b.trading_pair_id = t.id
    WHERE b.is_active = TRUE
  `);
  return rows;
}

async function getBotById(botId) {
  const [rows] = await pool.query(`
    SELECT b.*, a.api_key, a.api_secret, a.rest_api_url, t.pair
    FROM market_maker_bots b
    JOIN exchange_accounts a ON b.account_id = a.id
    JOIN trading_pairs t ON b.trading_pair_id = t.id
    WHERE b.id = ?
  `, [botId]);
  return rows[0];
}

async function updateBotConfig(botId, config) {
  await pool.query(`
    UPDATE market_maker_bots
    SET base_spread = ?,
        base_order_size = ?,
        min_profit = ?,
        max_position = ?,
        order_levels = ?,
        is_active = ?
    WHERE id = ?
  `, [config.base_spread, config.base_order_size, config.min_profit, config.max_position, config.order_levels, config.is_active, botId]);
}

async function updateOrderStatus(orderId, status, filledAmount = null, averagePrice = null) {
  if (filledAmount !== null && averagePrice !== null) {
    await pool.query(
      'UPDATE orders SET status = ?, amount = ?, price = ? WHERE id = ?',
      [status, filledAmount, averagePrice, orderId]
    );
  } else {
    await pool.query(
      'UPDATE orders SET status = ? WHERE id = ?',
      [status, orderId]
    );
  }
}

module.exports = {
  pool,
  initDatabase,
  getOpenOrders,
  closeOrder,
  insertOrder,
  getRecentPrices,
  insertMarketPrice,
  getActiveBots,
  getBotById,
  getOrderById,
  updateBotConfig,
  updateOrderStatus
};