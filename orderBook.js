const db = require('./utils/db.js');
const RedisManager = require('./utils/redisManager.js');
const ExchangeAPI = require('./api/exchangeApi.js');
const log = require('./utils/log.js');
require('dotenv').config();
dotenv.config();

/**
 * 计算动态价差
 * @param {number} baseSpread - 基础价差
 * @param {number} volatility - 市场波动性
 * @returns {number} 动态价差
 */
function calculateDynamicSpread(baseSpread, volatility) {
  return baseSpread * (1 + volatility);
}

/**
 * 计算市场波动性
 * @param {number} tradingPairId - 交易对ID
 * @returns {number} 波动性
 */
async function calculateVolatility(tradingPairId) {
  const prices = await db.getRecentPrices(tradingPairId);

  if (prices.length < 2) return 0;

  // 计算对数收益率
  const returns = prices.slice(1).map((p, i) =>
    Math.log(p.price / prices[i].price)
  );

  // 计算平均收益率和方差
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;

  // 返回标准差作为波动性指标
  return Math.sqrt(variance);
}

/**
 * 计算订单价格水平
 * @param {number} marketPrice - 当前市场价格
 * @param {number} dynamicSpread - 动态价差
 * @param {number} baseOrderSize - 基础订单大小
 * @param {number} orderLevels - 订单档位数量
 * @returns {Object} 买单和卖单的价格水平
 */
function calculateLevels(bot, marketPrice, dynamicSpread) {
  const {
    base_order_size: baseOrderSize,
    order_levels: orderLevels,
    amount_precision: amountPrecision,
    price_precision: pricePrecision,
    min_multiplier: minMultiplier,
    max_multiplier: maxMultiplier,
    spread_increment: spreadIncrement
  } = bot.config;
  log.info('calculateLevels:',{baseOrderSize,orderLevels,amountPrecision,pricePrecision})
  const levels = [];
  for (let i = 0; i < orderLevels; i++) {
    const spreadMultiplier = 1 + i * spreadIncrement; // 随着档位增加，价差逐渐增大
    // const sizeMultiplier = 1 - i * 0.1; // 随着档位增加，订单大小逐渐减小
    // 使用随机范围调整订单大小，不考虑档位
    
    const sizeMultiplier = minMultiplier*1 + Math.random() * (maxMultiplier - minMultiplier);
    log.info('sizeMultiplier:',{sizeMultiplier,maxMultiplier,minMultiplier})
    const buyPrice = (marketPrice * (1 - dynamicSpread * spreadMultiplier)).toFixed(pricePrecision);
    const sellPrice = (marketPrice * (1 + dynamicSpread * spreadMultiplier)).toFixed(pricePrecision);
    const orderSize = (baseOrderSize * sizeMultiplier).toFixed(amountPrecision);

    levels.push({ side: 'buy', price: buyPrice, amount: orderSize });
    levels.push({ side: 'sell', price: sellPrice, amount: orderSize });
  }
  return {
    buyLevels: levels.filter(l => l.side === 'buy'),
    sellLevels: levels.filter(l => l.side === 'sell')
  };
}

/**
 * 检查并更新订单状态
 * @param {Object} bot - 机器人配置
 * @param {ExchangeAPI} exchangeAPI - 交易所API实例
 */
async function checkAndUpdateOrderStatus(bot, exchangeAPI) {
  log.info('开始检查订单状态');
  const openOrders = await db.getOpenOrders(bot.id);
  for (const order of openOrders) {
    try {
      const {statusStr,origQty,price} = await exchangeAPI.checkOrderInfo(bot.pair, order.exchange_order_id);
      if (statusStr !== 'open') {
        if (statusStr === 'filled') {
          await db.updateOrderStatus(order.id, statusStr, origQty, price);
          log.info(`订单已成交: ${order.exchange_order_id}, 成交量: ${origQty}, 平均价格: ${price}`);
        } else if(statusStr === 'cancelled'){
          await db.updateOrderStatus(order.id, statusStr);
          log.info(`订单状态更新: ${order.exchange_order_id}, 新状态: ${statusStr}`);
        }
      }
    } catch (error) {
      log.error(`检查订单状态时发生错误: ${error.message}`);
    }
  }
}

/**
 * 更新单边订单（买单或卖单）
 * @param {Object} bot - 机器人配置
 * @param {ExchangeAPI} exchangeAPI - 交易所API实例
 * @param {string} side - 订单方向（'buy' 或 'sell'）
 * @param {Array} levels - 价格水平数组
 * @param {Array} openOrders - 当前未成交订单数组
 */
async function updateSideOrders(bot, exchangeAPI, side, levels, openOrders) {
  const {
    min_multiplier: minMultiplier,
    max_multiplier: maxMultiplier,
    min_profit: minProfit
  } = bot.config;
  for (const level of levels) {
    //查找现有的未成交订单中是否有与当前价格水平相近的订单
    const existingOrder = openOrders.find(o => o.side === side && Math.abs(o.price - level.price) / level.price < minProfit);
    log.info('existingOrder:',existingOrder)
    if (existingOrder) {
      log.info('存在当前价格水平相近的订单')
      const threshold = (maxMultiplier - minMultiplier) / 2; // 在这个例子中是 (1.5 - 0.8) / 2 = 0.35
      if (Math.abs(existingOrder.amount - level.amount) / level.amount > threshold) { // 如果数量差异超过百分比
        log.info('数量差异超过百分比%')
        //查询该订单状态是否已经取消
        const {status} = await db.getOrderById(existingOrder.id);
        log.info('status',status)
        if (status === 'cancelled') {
          log.info('订单已取消，无需取消')
          continue;
        }
        await exchangeAPI.cancelOrder(bot.pair, existingOrder.exchange_order_id);
        await db.closeOrder(existingOrder.id);
        const newOrder = await exchangeAPI.placeOrder(bot.pair, side, level.price, level.amount);
        await db.insertOrder(bot.id, side, level.price, level.amount, newOrder.order_id);
      }
    } else {
      log.info('不存在当前价格水平相近的订单')
      const newOrder = await exchangeAPI.placeOrder(bot.pair, side, level.price, level.amount);
      await db.insertOrder(bot.id, side, level.price, level.amount, newOrder.order_id);
    }
  }

  // 取消不在新的价格水平上的订单
  for (const order of openOrders.filter(o => o.side === side)) {
    if (!levels.some(l => Math.abs(l.price - order.price) / order.price < bot.min_profit)) {
      log.info('取消不在新的价格水平上的订单',bot.pair,order.exchange_order_id)
      await exchangeAPI.cancelOrder(bot.pair, order.exchange_order_id);
      await db.closeOrder(order.id);
    }
  }
}

/**
 * 更新机器人的订单
 * @param {Object} bot - 机器人配置
 * @param {ExchangeAPI} exchangeAPI - 交易所API实例
 */
async function updateOrders(bot, exchangeAPI) {
    const marketPrice = await exchangeAPI.fetchDepth(bot.pair);
    if (!marketPrice) return;

    // 首先检查和更新订单状态
    await checkAndUpdateOrderStatus(bot, exchangeAPI);

    // 计算动态价差
    const volatility = await calculateVolatility(bot.trading_pair_id);
    const dynamicSpread = calculateDynamicSpread(bot.config.base_spread, volatility);

    // 计算新的价格水平
    const { buyLevels, sellLevels } = calculateLevels(
      bot,
      marketPrice,
      dynamicSpread,
    );
    log.info('计算新的价格水平==>', { buyLevels, sellLevels })
    const openOrders = await db.getOpenOrders(bot.id);

    // 更新买单和卖单
    await updateSideOrders(bot, exchangeAPI, 'buy', buyLevels, openOrders);
    await updateSideOrders(bot, exchangeAPI, 'sell', sellLevels, openOrders);

    log.info(`更新${bot.name}的${bot.pair}订单 - 市场价: ${marketPrice}, 动态价差: ${dynamicSpread}`);

    // 插入新的市场价格到数据库
    await db.insertMarketPrice(bot.trading_pair_id, marketPrice);
    return true;
}



async function updateAllBots() {
  const lockKey = 'update_all_bots_lock';
  const lockSet = await RedisManager.setTimeLock(lockKey, 20);//流程20秒
  if (!lockSet) {
    log.info('updateAllBots 锁已存在，操作被阻止');
    return;
  } 
  try {
    const activeBots = await db.getActiveBots();
    for (const bot of activeBots) {
      try {
        const exchangeAPI = new ExchangeAPI({
          os: bot.os_name, // 假设所有机器人都使用lbank，如果不是，需要在数据库中存储每个机器人的交易所信息
          api_key: bot.api_key,
          secret: bot.api_secret,
          server: bot.rest_api_url
        });
        await updateOrders(bot, exchangeAPI);
      } catch (error) {
        log.error(`更新${bot.name}的${bot.pair}订单时发生错误:`, error);
      }
    }
  } catch (error) {
    log.error('更新所有机器人时发生错误:', error);
  } finally {
    //删除流程锁
    await RedisManager.del(lockKey);
  }
}
module.exports = { updateAllBots };