const API = require('z_gwapi');

class ExchangeAPI {
  constructor(config) {
    this.api = new API(config);
  }

  async fetchDepth(pair) {
    try {
      const result = await this.api.depth({
				symbol:pair
			});
      console.log('fetchDepth:',result)
      const tickerPrice = (result.asks[0][0]*1 + result.bids[0][0]*1)/2
      return tickerPrice;
    } catch (error) {
      console.error('获取行情数据失败:', error);
      throw error;
    }
  }

  async placeOrder(pair, side, price, amount) {
    try {
      return await this.api.order({
        size: amount,
        price:price,
        symbol:pair,
        side: side,
        type: "LIMIT"
        });
    } catch (error) {
      console.error('下单失败:', error);
      throw error;
    }
  }

  async cancelOrder(pair, orderId) {
    try {
      return await this.api.cancel_order({
        order_id:orderId, 
        symbol:pair
      });
    } catch (error) {
      console.error('取消订单失败:', error);
      throw error;
    }
  }

  /**
   * 订单状态 -1：已撤销 0：未成交 1： 部分成交 2：完全成交 3：部分成交已撤销 4：撤单处理中
   * @param {*} pair 
   * @param {*} orderId 
   * @returns 
   */
  async checkOrderInfo(pair, orderId) {
    try {
      const order = await this.api.order_info({
        order_id:orderId, 
        symbol:pair
      });
      switch (order.status) {
        case -1:
          order.statusStr = 'cancelled'
          break;
        case 2:
          order.statusStr = 'filled'
          break;  
        case 3:
          order.statusStr = 'cancelled'
          break;     
        default:
          order.statusStr = 'open'
          break;
      }
      return order;
    } catch (error) {
      console.error('检查订单状态失败:', error);
      throw error;
    }
  }
}

module.exports = ExchangeAPI;