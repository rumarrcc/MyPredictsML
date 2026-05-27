import { useDispatch, useSelector } from 'react-redux'
import { fetchStock, fetchIndicators } from '@/store/slices/stockSlice'

export const useStock = () => {
  const dispatch = useDispatch()
  const { currentStock, indicators, isLoading, error } = useSelector(s => s.stock)

  const loadStock = (ticker, days = 365) =>
    dispatch(fetchStock({ ticker, days }))

  const loadIndicators = (ticker) =>
    dispatch(fetchIndicators(ticker))

  return { currentStock, indicators, isLoading, error, loadStock, loadIndicators }
}
