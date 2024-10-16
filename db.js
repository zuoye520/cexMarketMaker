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
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      api_key VARCHAR(100) NOT NULL,
      api_secret VARCHAR(100) NOT NULL,
      rest_api_url VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await createTableIfNotExists('trading_pairs', `
    CREATE TABLE trading_pairs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pair VARCHAR(20) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await createTableIfNotExists('market_maker_bots', `
    CREATE TABLE market_maker_bots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      account_id INT NOT NULL,
      trading_pair_id INT NOT NULL,
      base_spread DECIMAL(5,4) NOT NULL,
      base_order_size DECIMAL(18,8) NOT NULL,
      min_profit DECIMAL(5,4) NOT NULL,
      max_position DECIMAL(18,8) NOT NULL,
      order_levels INT NOT NULL DEFAULT 5,
      is_active BOOLEAN DEFAULT TRUE,
      amount_precision INT NOT NULL DEFAULT 8,
      price_precision INT NOT NULL DEFAULT 8,
      min_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
      max_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
      spread_increment DECIMAL(3,2) NOT NULL DEFAULT 0.50,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES exchange_accounts(id),
      FOREIGN KEY (trading_pair_id) REFERENCES trading_pairs(id)
    )
  `);

  await createTableIfNotExists('orders', `
    CREATE TABLE orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bot_id INT NOT NULL,
      side ENUM('buy', 'sell') NOT NULL,
      price DECIMAL(18, 8) NOT NULL,
      amount DECIMAL(18, 8) NOT NULL,
      status ENUM('open', 'filled', 'cancelled') NOT NULL,
      exchange_order_id VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (bot_id) REFERENCES market_maker_bots(id)
    )
  `);

  await createTableIfNotExists('market_prices', `
    CREATE TABLE market_prices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trading_pair_id INT NOT NULL,
      price DECIMAL(18, 8) NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trading_pair_id) REFERENCES trading_pairs(id)
    )
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