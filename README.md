# 高级中心化交易所做市商

这是一个高级的中心化交易所做市商系统，使用 Node.js 实现。该系统支持多个交易所、多个交易对，并提供动态价差和库存管理功能。

## 功能特点

- 支持多个交易所和交易对
- 动态价差计算，基于市场波动性
- 库存管理，防止过度暴露
- 市场价格缓存，减少 API 调用
- 灵活的机器人配置，可以针对不同交易对设置不同策略

## 系统要求

- Node.js (推荐 v14 或更高版本)
- MySQL 数据库

## 安装

1. 克隆仓库：
   ```
   git clone https://github.com/your-username/advanced-cex-market-maker.git
   cd advanced-cex-market-maker
   ```

2. 安装依赖：
   ```
   npm install
   ```

3. 配置环境变量：
   复制 `.env.example` 文件为 `.env`，并填写必要的配置信息：
   ```
   cp .env.example .env
   ```
   编辑 `.env` 文件，填写数据库连接信息和其他必要的配置。

4. 初始化数据库：
   运行 `initBot.js` 文件，它将自动创建必要的数据库表并插入示例数据：
   ```
   node initBot.js
   ```

## 使用说明

1. 确保数据库已初始化并包含必要的配置数据。

2. 运行做市商程序：
   ```
   npm start
   ```

## 配置说明

- `UPDATE_INTERVAL`：订单更新间隔（毫秒），在 `index.js` 中设置
- 其他配置参数可以在数据库的 `market_maker_bots` 表中设置

## 数据库表结构和示例数据

系统使用以下主要表：

1. `exchange_accounts`: 存储交易所账户信息
2. `trading_pairs`: 存储交易对信息
3. `market_maker_bots`: 存储做市商机器人配置
4. `orders`: 存储订单信息
5. `market_prices`: 存储市场价格历史

### market_maker_bots 表字段说明

`market_maker_bots` 表是系统的核心配置表，用于存储每个做市商机器人的参数。以下是该表的主要字段及其说明：

- `id`: 机器人的唯一标识符（主键）
- `name`: 机器人的名称，用于识别不同的机器人实例
- `account_id`: 关联的交易所账户ID，外键关联到 `exchange_accounts` 表
- `trading_pair_id`: 关联的交易对ID，外键关联到 `trading_pairs` 表
- `base_spread`: 基础价差，表示买卖订单之间的最小价差百分比
- `base_order_size`: 基础订单大小，表示每个订单的基本数量
- `min_profit`: 最小利润，用于决定何时更新订单的阈值
- `max_position`: 最大持仓量，用于控制风险敞口
- `order_levels`: 订单档位数量，决定在每个方向上放置多少个订单
- `is_active`: 机器人是否处于活动状态
- `amount_precision`: 数量精度，用于控制订单数量的小数位数
- `price_precision`: 价格精度，用于控制订单价格的小数位数
- `min_multiplier`: 最小乘数，用于计算不同档位订单的大小
- `max_multiplier`: 最大乘数，用于计算不同档位订单的大小
- `spread_increment`: 价差增量，用于计算不同档位订单的价差

这些参数允许用户精细地控制每个机器人的行为，以适应不同的市场条件和交易策略。

### 初始化数据库表案例

以下是使用 `initBot.js` 初始化数据库表和插入示例数据的过程：

```javascript
async function initLBKUSDTBot() {
  try {
    await db.initDatabase();

    // 插入交易所账户
    const [accountResult] = await db.pool.query(
      'INSERT INTO exchange_accounts (name, api_key, api_secret, rest_api_url) VALUES (?, ?, ?, ?)',
      ['lbank', '1', '1', 'http://103.153.101.112:1173']
    );
    const accountId = accountResult.insertId;

    // 插入交易对
    const [pairResult] = await db.pool.query(
      'INSERT INTO trading_pairs (pair) VALUES (?)',
      ['LBK_USDT']
    );
    const tradingPairId = pairResult.insertId;

    // 插入机器人配置
    await db.pool.query(
      `INSERT INTO market_maker_bots 
      (name, account_id, trading_pair_id, base_spread, base_order_size, min_profit, max_position, order_levels, is_active, amount_precision, price_precision, min_multiplier, max_multiplier, spread_increment) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['LBK_USDT_BOT', accountId, tradingPairId, 0.001, 10, 0.001, 0.1, 5, true, 0, 6, 0.80, 1.80, 0.50]
    );

    console.log('LBK_USDT 交易对机器人初始化完成');
  } catch (error) {
    console.error('初始化 LBK_USDT 交易对机器人时发生错误:', error);
  } finally {
    await db.pool.end();
  }
}
```

这个示例创建了一个用于 LBK_USDT 交易对的机器人配置。

## 机器人策略说明

本做市商系统采用了以下策略来优化做市效果：

1. **动态价差计算**：
   - 基础价差由用户设置（`base_spread`）
   - 根据市场波动性动态调整价差，波动性越大，价差越大
   - 波动性通过计算最近价格的对数收益率的标准差来衡量

2. **订单更新机制**：
   - 定期检查现有订单
   - 如果市场价格变化超过设定的最小利润（`min_profit`），则取消旧订单并下新订单
   - 这确保了订单始终接近当前市场价格，同时避免频繁更新导致的手续费损失

3. **库存管理**：
   - 设置最大持仓限制（`max_position`）
   - 当持仓接近上限时，调整订单策略以平衡风险

4. **多级订单**：
   - 支持设置多个价格级别的订单（`order_levels`）
   - 使用不同的乘数（`min_multiplier`, `max_multiplier`）和价差增量（`spread_increment`）来调整每个级别的订单

5. **精度控制**：
   - 支持设置金额精度（`amount_precision`）和价格精度（`price_precision`）
   - 确保所有订单符合交易所的精度要求

通过调整这些参数，用户可以根据不同的市场条件和风险偏好来优化做市策略。

## 项目结构

- `index.js`：主程序入口，包含做市商逻辑
- `db.js`：数据库操作相关函数
- `exchangeApi.js`：交易所 API 封装
- `initBot.js`：初始化数据库和机器人配置
- `.env`：环境变量配置文件

## 注意事项

- 请确保您有足够的资金在交易所账户中进行做市操作。
- 在实际交易前，建议先在测试环境中充分测试。
- 定期检查日志和数据库，确保系统正常运行。
- 根据市场情况和交易结果，定期调整策略参数以优化性能。

## 贡献

欢迎提交 issues 和 pull requests 来改进这个项目。

## 许可证

[MIT License](LICENSE)