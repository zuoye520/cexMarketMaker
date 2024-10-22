const orderBook = require('./orderBook.js');
const log = require('./utils/log.js');
require('dotenv').config();
/**
 * 启动做市商程序
 */
async function start() {
  // 定期更新所有活跃机器人的订单
  setInterval(orderBook.updateAllBots, process.env.UPDATE_INTERVAL);
}
// 启动程序并捕获可能的错误
start().catch(log.error);