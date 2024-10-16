const API = require('z_gwapi');

class ExchangeAPI {
  constructor(config) {
    this.api = new API(config);
  }

  async getOrderBook(pair) {
    try {
      const orderBook = await this.api.getOrderBook(pair);
      return orderBook;
    } catch (error) {
      console.error('获取订单簿失败:', error);
      return null;
    }
  }

  async placeOrder(pair, side, price, amount) {
    try {
      const order = await this.api.placeOrder(pair, side, price, amount);
      return order;
    } catch (error) {
      console.error('下单失败:', error);
      return null;
    }
  }

  async getOrderStatus(orderId) {
    try {
      const status = await this.api.getOrderStatus(orderId);
      return status;
    } catch (error) {
      console.error('获取订单状态失败:', error);
      return null;
    }
  }

  async cancelOrder(orderId) {
    try {
      const result = await this.api.cancelOrder(orderId);
      return result;
    } catch (error) {
      console.error('撤销订单失败:', error);
      return null;
    }
  }
}

module.exports = ExchangeAPI;