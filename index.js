const axios = require('axios');
const db = require('./db');
require('dotenv').config();
const API = require('z_gwapi');

const exchangeAPI = new API({
	os: 'lbank',
	api_key:'',
	secret:'',
});

const UPDATE_INTERVAL = 10000; // 10秒，更新订单的时间间隔

// 交易所API操作对象
const exchange = {
  async getOrderBook(pair, apiKey, apiSecret) {
    try {
      const response = await axios.get(`${process.env.EXCHANGE_URL}/orderbook/${pair}`, {
        headers: {
          'API-Key': apiKey,
          'API-Secret': apiSecret
        }
      });
      return response.data;
    } catch (error) {
      console.error('获取订单簿失败:', error);
      return null;
    }
  },

  async placeOrder(pair, side, price, amount, apiKey, apiSecret) {
    try {
      const response = await axios.post(`${process.env.EXCHANGE_URL}/order`, {
        pair,
        side,
        price,
        amount
      }, {
        headers: {
          'API-Key': apiKey,
          'API-Secret': apiSecret
        }
      });
      return response.data;
    } catch (error) {
      console.error('下单失败:', error);
      return null;
    }
  }
};

// 获取指定交易对的市场价格
async function getMarketPrice(pair, apiKey, apiSecret) {
  const orderBook = await exchange.getOrderBook(pair, apiKey, apiSecret);
  if (!orderBook) return null;
  const bestBid = orderBook.bids[0][0];
  const bestAsk = orderBook.asks[0][0];
  return (bestBid + bestAsk) / 2;
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
  const marketPrice = await getMarketPrice(bot.pair, bot.api_key, bot.api_secret);
  if (!marketPrice) return;

  const volatility = await calculateVolatility(bot.trading_pair_id, marketPrice);
  const spread = calculateDynamicSpread(bot.base_spread, volatility);

  // 计算买入和卖出价格
  const buyPrice = marketPrice * (1 - spread / 2);
  const sellPrice = marketPrice * (1 + spread / 2);

  // 更新买单和卖单
  await updateOrder(bot, 'buy', buyPrice, bot.order_size);
  await updateOrder(bot, 'sell', sellPrice, bot.order_size);

  console.log(`更新${bot.name}的${bot.pair}订单 - 买入: ${buyPrice}, 卖出: ${sellPrice}`);
  
  // 插入新的市场价格到数据库
  await db.insertMarketPrice(bot.trading_pair_id, marketPrice);
}

// 更新单个订单
async function updateOrder(bot, side, price, amount) {
  const existingOrders = await db.getOpenOrders(bot.trading_pair_id, side);

  if (existingOrders.length > 0) {
    for (const order of existingOrders) {
      // 如果价格偏差超过最小利润，则更新订单
      if (Math.abs(order.price - price) / price > bot.min_profit) {
        await exchange.placeOrder(bot.pair, side, price, amount, bot.api_key, bot.api_secret);
        await db.closeOrder(order.id);
        await db.insertOrder(bot.trading_pair_id, side, price, amount);
      }
    }
  } else {
    // 如果没有现有订单，则创建新订单
    await exchange.placeOrder(bot.pair, side, price, amount, bot.api_key, bot.api_secret);
    await db.insertOrder(bot.trading_pair_id, side, price, amount);
  }
}

// 启动做市商程序
async function start() {
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
}

// 启动程序并捕获可能的错误
start().catch(console.error);