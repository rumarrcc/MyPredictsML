import { useState, useEffect } from 'react'

/**
 * Devuelve un valor "debounced" que sólo se actualiza
 * después de que el valor original no haya cambiado durante `delay` ms.
 *
 * @param {*}      value  - Valor a debouncear
 * @param {number} delay  - Milisegundos de espera (default: 400)
 * @returns {*}  Valor debounced
 */
export function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

export default useDebounce
