import { gmgnTokens } from '../api/apiService.js';
import { sendRequest } from './httpUtils.js';
import moment from 'moment';
import dotenv from 'dotenv';

dotenv.config();

// 从环境变量中获取 Telegram Bot Token 和 Chat IDs
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const chatIds = process.env.TG_CHAT_IDS ? process.env.TG_CHAT_IDS.split(',') : [];

/**
 * 格式化数字
 * @param {number} num - 要格式化的数字
 * @returns {string} - 格式化后的字符串
 */
function formatNumber(num) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
}

/**
 * 发送 Telegram 消息
 * @param {Object} params - 消息参数
 */
async function sendMessage(params) {
  const { TOKEN, chatId, text, replyMarkup, mode } = params;
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const data = {
    chat_id: chatId,
    text: text,
    parse_mode: mode,
    reply_markup: JSON.stringify(replyMarkup)
  };

  try {
    const result = await sendRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: data
    });
    console.log('Telegram 消息发送成功:', result);
  } catch (error) {
    console.error('Telegram 消息发送失败:', error);
  }
}

/**
 * 推送消息到其他平台（待实现）
 * @param {Object} params - 消息参数
 */
function pushMsg(params) {
  // 这里可以实现推送到其他平台的逻辑
  console.log('推送到其他平台:', params);
}

/**
 * 发送 Telegram 消息
 * @param {Object} params - 消息参数
 * @param {string} params.sniperAddress - Sniper 地址
 * @param {string} params.tokenAddress - 代币地址
 */
async function sendTgMessage(params = {}) {
  try {
    const { sniperAddress, tokenAddress, memo ='' } = params;
    const tokenInfo = await gmgnTokens(tokenAddress);
    // console.log('tokenInfo:', tokenInfo);
    if (!tokenInfo.token.symbol) return;
    chatIds.forEach((chatId) => {
      const time = moment().format("YYYY/MM/DD HH:mm:ss");
      let text = `🔑密码来了🔑\n
Sniper Address: <code>${sniperAddress}</code>\n
Token Symbol: ${tokenInfo.token.symbol} (${tokenInfo.token.name})
Token Address: <code>${tokenInfo.token.address}</code>
总市值: $${formatNumber(tokenInfo.token.fdv * 1)}
流通市值: $${formatNumber(tokenInfo.token.market_cap * 1)}
当前池子: ${tokenInfo.token.pool_info && formatNumber(tokenInfo.token.pool_info.quote_reserve * 1)} ${tokenInfo.token.pool_info && tokenInfo.token.pool_info.quote_symbol}
初始池子: ${tokenInfo.token.pool_info && formatNumber(tokenInfo.token.pool_info.initial_quote_reserve * 1)} ${tokenInfo.token.pool_info && tokenInfo.token.pool_info.quote_symbol}
持有者: ${tokenInfo.token.holder_count}
Mint权限丢弃检测: ${tokenInfo.token.renounced_mint === 1 ? '✅' : '❌'}
黑名单检测: ${tokenInfo.token.renounced_freeze_account === 1 ? '✅' : '❌'}
烧池子检测: ${tokenInfo.token.burn_status == 'burn' ? '✅' : '❌'}
Top10持仓: ${(tokenInfo.token.top_10_holder_rate * 100).toFixed(2)}%
launchpad: ${tokenInfo.token.launchpad}\n
备注: ${memo}
播报时间: ${time}`;

      sendMessage({
        TOKEN: TG_BOT_TOKEN,
        chatId: chatId,
        text: text,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "🚀️冲啊🚀️", url: `https://gmgn.ai/sol/token/${tokenInfo.token.address}` }]
          ]
        },
        mode: "HTML"
      });
    });
  } catch (error) {
    console.error('推送消息失败:', error);
  }
}

export { sendTgMessage };