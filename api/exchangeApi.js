const API = require('z_gwapi');
const log = require('../utils/log.js');
class ExchangeAPI {
  constructor(config) {
    this.config = config;
    this.api = new API(config);
  }

  async ticker(pair) {
    try {
      const result = await this.api.ticker({
        symbol:pair
      });
      return result;
    } catch (error) {
      log.error('获取交易对行情数据失败:', error);
      throw error;
    }
  }
  async depth(pair) {
    try {
      const result = await this.api.depth({
				symbol:pair
			});
      log.info('depth:',result)
      const tickerPrice = (result.asks[0][0]*1 + result.bids[0][0]*1)/2
      return tickerPrice;
    } catch (error) {
      log.error('获取交易对深度数据失败:', error);
      throw error;
    }
  }

  async order(pair, side, price, amount, type = 'LIMIT') {
    try {
      const result = await this.api.order({
        size: amount,
        price:price,
        symbol:pair,
        side: side,
        type: type
        });
      return result;
    } catch (error) {
      log.error('下单失败:', error);
      throw error;
    }
  }
  async batchOrders(orders) {
    try {
      const result = await this.api.batch_orders({
        orders
      });
      return result;
    } catch (error) {
      log.error('批量下单失败:', error);
      throw error;
    }
  }

  async cancelOrder(pair, orderId) {
    try {
      const result = await this.api.cancel_order({
        symbol:pair,
        order_id:orderId
      });
      return result;
    } catch (error) {
      log.error('取消订单失败:', error);
      throw error;
    }
  }

  /**
   * 订单状态 - 返回数据以MEXC为标准
   *  NEW 未成交
   *  FILLED 已成交
   *  PARTIALLY_FILLED 部分成交
   *  CANCELED 已撤销
   *  PARTIALLY_CANCELED 部分撤销
   * @param {*} pair 
   * @param {*} orderId 
   * @returns 
   */
  async orderInfo(pair, orderId) {
    try {
      const result = await this.api.order_info({
        symbol:pair,
        order_id:orderId, 
      });
      switch (result.status) {
        case 'CANCELED':
          result.statusStr = 'cancelled'
          break;
        case 'FILLED':
          result.statusStr = 'filled'
          break;  
        case 'PARTIALLY_CANCELED':
          result.statusStr = 'cancelled'
          break;     
        default:
          result.statusStr = 'open'
          break;
      }
      return result;
    } catch (error) {
      log.error('查询订单信息失败:', error);
      throw error;
    }
  }
}

module.exports = ExchangeAPI;