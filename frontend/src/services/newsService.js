import api from './api'

export const newsService = {
  /** Noticias de un ticker concreto o generales de mercado */
  getNews: (ticker = '', limit = 30, category = 'general') =>
    api.get('/api/news', {
      params: { ticker: ticker || undefined, limit, category },
    }).then(r => r.data),

  /** Noticias agrupadas por categoría (Finnhub: general, forex, crypto, merger + top tickers) */
  getTrending: () =>
    api.get('/api/news/trending').then(r => r.data),

  /** Sentimiento de noticias recientes para un ticker (positivo / negativo / neutral) */
  getSentiment: (ticker) =>
    api.get(`/api/news/sentiment/${ticker}`).then(r => r.data),
}
