import { request, upload, postForm } from './request'

export const api = {
  bootstrap: () => request('/api/bootstrap'),
  overview: () => request('/api/overview'),
  mastery: () => request('/api/mastery'),

  ocr: (filePath) => upload('/api/ocr', filePath, {}, 'image'),

  questions: {
    list: (params) => request('/api/questions', { params }),
    get: (id) => request('/api/questions/' + id),
    create: (formData) => postForm('/api/questions', formData),
    update: (id, data) => request('/api/questions/' + id, { method: 'PATCH', data }),
    remove: (id) => request('/api/questions/' + id, { method: 'DELETE' }),
    restore: (id) => request('/api/questions/' + id + '/restore', { method: 'POST' }),
    review: (id, result) => request('/api/questions/' + id + '/review', { method: 'POST', data: { result } })
  },

  review: {
    queue: (params) => request('/api/review/questions', { params })
  },

  politics: {
    cards: {
      list: (params) => request('/api/politics/cards', { params }),
      create: (data) => request('/api/politics/cards', { method: 'POST', data }),
      update: (id, data) => request('/api/politics/cards/' + id, { method: 'PATCH', data }),
      remove: (id) => request('/api/politics/cards/' + id, { method: 'DELETE' }),
      restore: (id) => request('/api/politics/cards/' + id + '/restore', { method: 'POST' }),
      view: (id, rating) =>
        request('/api/politics/cards/' + id + '/view', {
          method: 'POST',
          data: rating ? { rating } : {}
        })
    },
    affairs: {
      list: (params) => request('/api/politics/affairs', { params }),
      create: (data) => request('/api/politics/affairs', { method: 'POST', data }),
      update: (id, data) => request('/api/politics/affairs/' + id, { method: 'PATCH', data }),
      remove: (id) => request('/api/politics/affairs/' + id, { method: 'DELETE' }),
      restore: (id) => request('/api/politics/affairs/' + id + '/restore', { method: 'POST' })
    },
    frameworks: {
      list: (params) => request('/api/politics/frameworks', { params }),
      create: (data) => request('/api/politics/frameworks', { method: 'POST', data }),
      update: (id, data) => request('/api/politics/frameworks/' + id, { method: 'PATCH', data }),
      remove: (id) => request('/api/politics/frameworks/' + id, { method: 'DELETE' }),
      restore: (id) => request('/api/politics/frameworks/' + id + '/restore', { method: 'POST' })
    },
    search: (q) => request('/api/politics/search', { params: { q } })
  }
}
