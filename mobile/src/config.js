// 后端地址配置：换域名上线时只改这个文件。
//
// H5：开发环境留空，走 vite.config.js 里的 /api、/uploads 代理；
//     部署上线后改成你的后端域名，例如 'https://api.example.com'。
// 微信小程序：必须是已备案的 HTTPS 域名，并在微信开发者工具里勾选
//     「详情 → 本地设置 → 不校验合法域名」（仅开发阶段）。
// 开发期填电脑的局域网 IPv4（手机与电脑需在同一 Wi-Fi）；
// 换网络、换电脑或换路由器后这个地址会变，届时改这里并重新编译。
let BASE_URL = 'http://192.168.1.43:8000'
// #ifdef H5
BASE_URL = ''
// #endif

export const API_BASE = BASE_URL

/** 把后端返回的相对图片路径（/uploads/xxx.jpg）拼成可访问地址 */
export function fileUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return API_BASE + (path.charAt(0) === '/' ? path : '/' + path)
}
