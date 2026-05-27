import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { stockService } from '@/services/stockService'

export const fetchStock = createAsyncThunk('stock/fetch', async ({ ticker, days = 365 }, { rejectWithValue }) => {
  try {
    return await stockService.getStock(ticker, days)
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || `No se pudo obtener datos de ${ticker}`)
  }
})

export const fetchIndicators = createAsyncThunk('stock/indicators', async (ticker, { rejectWithValue }) => {
  try {
    return await stockService.getIndicators(ticker)
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Error obteniendo indicadores')
  }
})

export const fetchBatch = createAsyncThunk('stock/batch', async ({ tickers, days = 30 }, { rejectWithValue }) => {
  try {
    return await stockService.getBatch(tickers, days)
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Error obteniendo datos')
  }
})

const stockSlice = createSlice({
  name: 'stock',
  initialState: {
    currentStock: null,
    indicators:   null,
    indicatorsError: null,
    batch:        {},
    isLoading:    false,
    error:        null,
    ticker:       null,
  },
  reducers: {
    clearStock(state) {
      state.currentStock = null
      state.indicators   = null
      state.indicatorsError = null
      state.ticker       = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStock.pending,    (s) => { s.isLoading = true; s.error = null })
      .addCase(fetchStock.fulfilled,  (s, { payload }) => {
        s.isLoading    = false
        s.currentStock = payload
        s.ticker       = payload.ticker
      })
      .addCase(fetchStock.rejected,   (s, a) => { s.isLoading = false; s.error = a.payload })

      .addCase(fetchIndicators.pending,   (s) => { s.indicatorsError = null })
      .addCase(fetchIndicators.fulfilled, (s, { payload }) => { s.indicators = payload; s.indicatorsError = null })
      .addCase(fetchIndicators.rejected,  (s, a) => { s.indicators = null; s.indicatorsError = a.payload })

      .addCase(fetchBatch.fulfilled, (s, { payload }) => { s.batch = payload.tickers || {} })
  },
})

export const { clearStock } = stockSlice.actions
export default stockSlice.reducer
