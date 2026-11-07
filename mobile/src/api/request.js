import { API_BASE } from '@/config'

function buildUrl(path, params) {
  let url = /^https?:\/\//.test(path) ? path : API_BASE + path
  if (params) {
    const parts = []
    Object.keys(params).forEach((key) => {
      const value = params[key]
      if (value === undefined || value === null || value === '') return
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value))
    })
    if (parts.length) {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&')
    }
  }
  return url
}

function errorFromBody(body) {
  if (!body) return ''
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (err) {
      return body
    }
  }
  if (typeof body.detail === 'string') return body.detail
  if (Array.isArray(body.detail) && body.detail.length) {
    return body.detail.map((item) => item.msg || '').join('；')
  }
  return ''
}

// #ifdef H5
// H5 用 fetch；小程序没有 fetch，走下面的 uni.request 分支。
export function request(path, options = {}) {
  const { method = 'GET', data, params, header } = options
  const headers = Object.assign({ Accept: 'application/json' }, header || {})
  const init = { method, headers }
  if (data !== undefined && data !== null) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(data)
  }
  return fetch(buildUrl(path, params), init).then((res) => {
    return res.text().then((text) => {
      let body = null
      if (text) {
        try {
          body = JSON.parse(text)
        } catch (err) {
          body = text
        }
      }
      if (!res.ok) {
        throw new Error(errorFromBody(body) || '请求失败（' + res.status + '）')
      }
      return body
    })
  })
}
// #endif

// #ifndef H5
export function request(path, options = {}) {
  const { method = 'GET', data, params, header } = options
  return new Promise((resolve, reject) => {
    uni.request({
      url: buildUrl(path, params),
      method,
      data,
      header: Object.assign({ Accept: 'application/json' }, header || {}),
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(errorFromBody(res.data) || '请求失败（' + res.statusCode + '）'))
        }
      },
      fail(err) {
        // 不同基础库返回的失败对象结构不同（有的只有 errCode），统一拼成可读字符串
        const raw =
          err && typeof err === 'object'
            ? [
                err.errMsg,
                err.message,
                err.errCode !== undefined ? 'errCode ' + err.errCode : '',
                JSON.stringify(err)
              ]
                .filter(Boolean)
                .join(' · ')
            : String(err)
        reject(new Error(raw || '网络请求失败'))
      }
    })
  })
}
// #endif

/**
 * 提交 multipart 表单（不带文件）。
 * 后端 /api/questions 只接受 Form 表单，所以不能用 JSON。
 * H5 用原生 FormData；小程序没有 FormData，手工拼 multipart 文本。
 */
export function postForm(path, formData = {}) {
  // #ifdef H5
  const fd = new FormData()
  Object.keys(formData).forEach((key) => {
    const value = formData[key]
    if (value === undefined || value === null) return
    fd.append(key, String(value))
  })
  return fetch(buildUrl(path), { method: 'POST', body: fd }).then((res) => {
    return res.text().then((text) => {
      let body = null
      if (text) {
        try {
          body = JSON.parse(text)
        } catch (err) {
          body = text
        }
      }
      if (!res.ok) throw new Error(errorFromBody(body) || '保存失败（' + res.status + '）')
      return body
    })
  })
  // #endif

  // #ifndef H5
  const boundary = '----recordFormBoundary' + Math.random().toString(16).slice(2)
  let body = ''
  Object.keys(formData).forEach((key) => {
    const value = formData[key]
    if (value === undefined || value === null) return
    body += '--' + boundary + '\r\n'
    body += 'Content-Disposition: form-data; name="' + key + '"\r\n\r\n'
    body += String(value) + '\r\n'
  })
  body += '--' + boundary + '--\r\n'
  return new Promise((resolve, reject) => {
    uni.request({
      url: buildUrl(path),
      method: 'POST',
      data: body,
      header: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(errorFromBody(res.data) || '保存失败（' + res.statusCode + '）'))
        }
      },
      fail(err) {
        // 不同基础库返回的失败对象结构不同（有的只有 errCode），统一拼成可读字符串
        const raw =
          err && typeof err === 'object'
            ? [
                err.errMsg,
                err.message,
                err.errCode !== undefined ? 'errCode ' + err.errCode : '',
                JSON.stringify(err)
              ]
                .filter(Boolean)
                .join(' · ')
            : String(err)
        reject(new Error(raw || '网络请求失败'))
      }
    })
  })
  // #endif
}

/**
 * 上传文件（拍照 / 选图）。
 * 两端的 uni.uploadFile 都能用：H5 走 xhr，小程序走 wx.uploadFile。
 */
export function upload(path, filePath, formData = {}, name = 'image') {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error('请先选择图片'))
      return
    }
    uni.uploadFile({
      url: buildUrl(path),
      filePath,
      name,
      formData,
      success(res) {
        let body = res.data
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body)
          } catch (err) {
            body = body
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body)
        } else {
          reject(new Error(errorFromBody(body) || '上传失败（' + res.statusCode + '）'))
        }
      },
      fail(err) {
        reject(new Error(err && err.errMsg ? err.errMsg : '上传失败'))
      }
    })
  })
}
