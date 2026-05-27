import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { communityService } from '@/services/communityService'

export const fetchAnalyses = createAsyncThunk('community/fetchAnalyses', async (params, { rejectWithValue }) => {
  try { return await communityService.getAnalyses(params) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const fetchAnalysis = createAsyncThunk('community/fetchOne', async (id, { rejectWithValue }) => {
  try { return await communityService.getAnalysis(id) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const shareAnalysis = createAsyncThunk('community/share', async (data, { rejectWithValue }) => {
  try { return await communityService.share(data) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error al compartir') }
})

export const likeAnalysis = createAsyncThunk('community/like', async (id, { rejectWithValue }) => {
  try { return await communityService.like(id) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

export const addComment = createAsyncThunk('community/addComment', async ({ id, comment }, { rejectWithValue }) => {
  try { return await communityService.addComment(id, comment) }
  catch (err) { return rejectWithValue(err.response?.data?.message || 'Error') }
})

const communitySlice = createSlice({
  name: 'community',
  initialState: {
    analyses:  [], total: 0, currentAnalysis: null,
    isLoading: false, error: null,
  },
  reducers: { clearError(s) { s.error = null } },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAnalyses.pending,   (s) => { s.isLoading = true })
      .addCase(fetchAnalyses.fulfilled, (s, { payload }) => {
        s.isLoading = false
        s.analyses  = payload.analyses || []
        s.total     = payload.total    || 0
      })
      .addCase(fetchAnalyses.rejected,  (s, a) => { s.isLoading = false; s.error = a.payload })

      .addCase(fetchAnalysis.pending,   (s) => { s.isLoading = true })
      .addCase(fetchAnalysis.fulfilled, (s, { payload }) => { s.isLoading = false; s.currentAnalysis = payload })
      .addCase(fetchAnalysis.rejected,  (s, a) => { s.isLoading = false; s.error = a.payload })

      .addCase(shareAnalysis.fulfilled, (s, { payload }) => {
        s.analyses = [payload, ...s.analyses]
      })

      .addCase(likeAnalysis.fulfilled, (s, { payload }) => {
        const a = s.analyses.find(x => x.id === payload.analysis_id)
        if (a) a.likes_count = payload.total_likes
        if (s.currentAnalysis?.id === payload.analysis_id)
          s.currentAnalysis.likes_count = payload.total_likes
      })

      .addCase(addComment.fulfilled, (s, { payload }) => {
        if (s.currentAnalysis) {
          s.currentAnalysis.comments = [payload, ...(s.currentAnalysis.comments || [])]
          s.currentAnalysis.comments_count = (s.currentAnalysis.comments_count || 0) + 1
        }
      })
  },
})

export const { clearError } = communitySlice.actions
export default communitySlice.reducer
