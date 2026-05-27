import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { portfolioService } from '@/services/portfolioService'

export const fetchPortfolios = createAsyncThunk('portfolio/fetchList', async (_, { rejectWithValue }) => {
  try { return await portfolioService.getList() }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const fetchPortfolio = createAsyncThunk('portfolio/fetchOne', async (id, { rejectWithValue }) => {
  try { return await portfolioService.getById(id) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const createPortfolio = createAsyncThunk('portfolio/create', async (data, { rejectWithValue }) => {
  try { return await portfolioService.create(data) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const deletePortfolio = createAsyncThunk('portfolio/delete', async (id, { rejectWithValue }) => {
  try { await portfolioService.delete(id); return id }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const addPosition = createAsyncThunk('portfolio/addPosition', async ({ portfolioId, data }, { rejectWithValue }) => {
  try { return await portfolioService.addPosition(portfolioId, data) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const sellPosition = createAsyncThunk('portfolio/sellPosition', async ({ portfolioId, positionId }, { rejectWithValue }) => {
  try { return await portfolioService.sellPosition(portfolioId, positionId) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState: { list: [], current: null, isLoading: false, error: null },
  reducers: { clearError(s) { s.error = null } },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPortfolios.pending,   (s) => { s.isLoading = true })
      .addCase(fetchPortfolios.fulfilled, (s, { payload }) => {
        s.isLoading = false; s.list = payload.portfolios || []
      })
      .addCase(fetchPortfolios.rejected,  (s, a) => { s.isLoading = false; s.error = a.payload })

      .addCase(fetchPortfolio.pending,    (s) => { s.isLoading = true })
      .addCase(fetchPortfolio.fulfilled,  (s, { payload }) => { s.isLoading = false; s.current = payload })
      .addCase(fetchPortfolio.rejected,   (s, a) => { s.isLoading = false; s.error = a.payload })

      .addCase(createPortfolio.fulfilled, (s, { payload }) => {
        s.list = [payload, ...s.list]; s.current = payload
      })

      .addCase(deletePortfolio.fulfilled, (s, { payload: id }) => {
        s.list = s.list.filter(p => p.id !== id)
        if (s.current?.id === id) s.current = null
      })

      .addCase(addPosition.fulfilled, (s, { payload }) => {
        if (s.current) {
          s.current.positions = [...(s.current.positions || []), payload]
        }
      })

      .addCase(sellPosition.fulfilled, (s, { payload }) => {
        if (payload?.portfolio) {
          s.current = payload.portfolio
          s.list = s.list.map(p => p.id === payload.portfolio.id ? payload.portfolio : p)
        }
      })
  },
})

export const { clearError } = portfolioSlice.actions
export default portfolioSlice.reducer
