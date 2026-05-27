import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { predictionService } from '@/services/predictionService'

export const createPrediction = createAsyncThunk('prediction/create', async (data, { rejectWithValue }) => {
  try {
    return await predictionService.create(data)
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Error generando predicción')
  }
})

export const fetchPredictions = createAsyncThunk('prediction/fetchList', async (params, { rejectWithValue }) => {
  try {
    return await predictionService.getList(params)
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Error')
  }
})

/** Carga una predicción guardada por su group_id y la pone en `current` */
export const loadSavedPrediction = createAsyncThunk('prediction/loadSaved', async (groupId, { rejectWithValue }) => {
  try {
    return await predictionService.getById(groupId)
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Predicción no encontrada')
  }
})

const predictionSlice = createSlice({
  name: 'prediction',
  initialState: {
    current:   null,
    list:      [],
    total:     0,
    isLoading: false,
    error:     null,
  },
  reducers: {
    clearPrediction(state) { state.current = null; state.error = null },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createPrediction.pending,    (s) => { s.isLoading = true; s.error = null; s.current = null })
      .addCase(createPrediction.fulfilled,  (s, { payload }) => { s.isLoading = false; s.current = payload })
      .addCase(createPrediction.rejected,   (s, a) => { s.isLoading = false; s.error = a.payload })

      .addCase(fetchPredictions.pending,    (s) => { s.isLoading = true })
      .addCase(fetchPredictions.fulfilled,  (s, { payload }) => {
        s.isLoading = false
        s.list  = payload.predictions || []
        s.total = payload.total || 0
      })
      .addCase(fetchPredictions.rejected,   (s, a) => { s.isLoading = false; s.error = a.payload })

      .addCase(loadSavedPrediction.pending,   (s) => { s.isLoading = true; s.error = null })
      .addCase(loadSavedPrediction.fulfilled, (s, { payload }) => { s.isLoading = false; s.current = payload })
      .addCase(loadSavedPrediction.rejected,  (s, a) => { s.isLoading = false; s.error = a.payload })
  },
})

export const { clearPrediction } = predictionSlice.actions
export default predictionSlice.reducer
