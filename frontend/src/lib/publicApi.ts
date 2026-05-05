import axios from 'axios'

export const publicApi = axios.create({
  baseURL: '/api/public',
  timeout: 10_000,
})
