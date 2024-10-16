const db = require('./db');
const ExchangeAPI = require('./exchangeApi');
require('dotenv').config();

const UPDATE_INTERVAL = 10000; // 10秒，更新订单的时间间隔
const PRICE_CACHE_TIME = 5000; // 5秒，市场价格缓存时间

let priceCache = new Map();

// 获取市场价格（带缓存）
async function getMarketPrice(exchangeAPI, pair) {
  const now = Date.now();
  const cacheKey = `${pair}`;
  if (priceCache.has(cacheKey) && now - priceCache.get(cacheKey).timestamp < PRICE_CACHE_TIME) {
    return priceCache.get(cacheKey).price;
  }

  try {
    const price = await exchangeAPI.getMarketPrice(pair);
    priceCache.set(cacheKey, { price, timestamp: now });
    return price;
  } catch (error) {
    console.error(`获取${pair}市场价格失败:`, error);
    return null;
  }
}

// 计算动态价差
function calculateDynamicSpread(baseSpread, volatility) {
  return baseSpread * (1 + volatility);
}

// 计算波动率
async function calculateVolatility(tradingPairId, currentPrice) {
  const prices = await db.getRecentPrices(tradingPairId);
  
  if (prices.length < 2) return 0;

  const returns = prices.slice(1).map((p, i) => 
    Math.log(p.price / prices[i].price)
  );

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

// 更新指定机器人的订单
async function updateOrders(bot) {
  const exchangeAPI = new ExchangeAPI({
    os: bot.exchange_os,
    api_key: bot.api_key,
    secret: bot.api_secret,
    server: bot.rest_api_url
  });

  const marketPrice = await getMarketPrice(exchangeAPI, bot.pair);
  if (!marketPrice) return;

  const volatility = await calculateVolatility(bot.trading_pair_id, marketPrice);
  const spread = calculateDynamicSpread(bot.base_spread, volatility);

  // 计算买入和卖出价格
  const buyPrice = marketPrice * (1 - spread / 2);
  const sellPrice = marketPrice * (1 + spread / 2);

  // 获取当前库存
  const inventory = await exchangeAPI.getInventory(bot.pair);

  // 更新买单和卖单
  if (inventory < bot.max_inventory) {
    await updateOrder(exchangeAPI, bot, 'buy', buyPrice, bot.order_size);
  }
  if (inventory > -bot.max_inventory) {
    await updateOrder(exchangeAPI, bot, 'sell', sellPrice, bot.order_size);
  }

  console.log(`更新${bot.name}的${bot.pair}订单 - 买入: ${buyPrice}, 卖出: ${sellPrice}, 库存: ${inventory}`);
  
  // 插入新的市场价格到数据库
  await db.insertMarketPrice(bot.trading_pair_id, marketPrice);
}

// 更新单个订单
async function updateOrder(exchangeAPI, bot, side, price, amount) {
  try {
    const existingOrders = await db.getOpenOrders(bot.trading_pair_id, side);

    if (existingOrders.length > 0) {
      for (const order of existingOrders) {
        // 如果价格偏差超过最小利润，则更新订单
        if (Math.abs(order.price - price) / price > bot.min_profit) {
          await exchangeAPI.cancelOrder(bot.pair, order.id);
          await db.closeOrder(order.id);
          const newOrder = await exchangeAPI.placeOrder(bot.pair, side, price, amount);
          await db.insertOrder(bot.trading_pair_id, side, price, amount, newOrder.id);
        }
      }
    } else {
      // 如果没有现有订单，则创建新订单
      const newOrder = await exchangeAPI.placeOrder(bot.pair, side, price, amount);
      await db.insertOrder(bot.trading_pair_id, side, price, amount, newOrder.id);
    }
  } catch (error) {
    console.error(`更新${bot.name}的${bot.pair} ${side}订单失败:`, error);
  }
}

// 启动做市商程序
async function start() {
  try {
    await db.initDatabase();
    console.log('数据库初始化完成');

    // 定期更新所有活跃机器人的订单
    setInterval(async () => {
      const activeBots = await db.getActiveBots();
      for (const bot of activeBots) {
        try {
          await updateOrders(bot);
        } catch (error) {
          console.error(`更新${bot.name}的${bot.pair}订单时发生错误:`, error);
        }
      }
    }, UPDATE_INTERVAL);

    console.log('做市商程序已启动');
  } catch (error) {
    console.error('启动做市商程序时发生错误:', error);
  }
}

// 启动程序并捕获可能的错误
start().catch(console.error);