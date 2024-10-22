import axios from 'axios';

/**
 * 发送 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {Object} config - axios 配置对象
 * @returns {Promise<Object>} - 响应数据
 */
async function sendRequest(url, config) {
  try {
    const response = await axios({
      url,
      ...config
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      // 请求已发出，但服务器响应状态码不在 2xx 范围内
      throw error.response.data;
    } else if (error.request) {
      // 请求已发出，但没有收到响应
      throw new Error('No response received from server',error);
    } else {
      // 在设置请求时触发了错误
      throw error;
    }
  }
}

export { sendRequest };