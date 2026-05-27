import { useState, useCallback } from 'react'

export const useApi = (asyncFn) => {
  const [data,      setData]      = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error,     setError]     = useState(null)

  const execute = useCallback(async (...args) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await asyncFn(...args)
      setData(result)
      return result
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Error'
      setError(msg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [asyncFn])

  return { data, isLoading, error, execute }
}
