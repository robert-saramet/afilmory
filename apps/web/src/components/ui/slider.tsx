import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { clsxm } from '~/lib/cn'

interface SliderProps {
  value: number | 'auto'
  onChange: (value: number | 'auto') => void
  min: number
  max: number
  step?: number
  autoLabel?: string
  className?: string
  disabled?: boolean
}

export const Slider = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  autoLabel,
  className,
  disabled = false,
}: SliderProps) => {
  const { t } = useTranslation()
  const finalAutoLabel = autoLabel || t('slider.auto')
  const [isDragging, setIsDragging] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  // Convert value to position percentage
  const getPositionFromValue = useCallback(
    (val: number | 'auto') => {
      if (val === 'auto') return 5 // Auto mode position is slightly to the right
      // Numeric range starts from 15% to 100%
      return 15 + ((val - min) / (max - min)) * 85
    },
    [min, max],
  )

  // Convert position percentage to value
  const getValueFromPosition = useCallback(
    (position: number) => {
      if (position <= 12) return 'auto' // The left 12% area is for auto mode
      const normalizedPosition = (position - 15) / 85 // The 85% area starting from 15% is for numeric values
      const rawValue = min + Math.max(0, normalizedPosition) * (max - min)
      return Math.round(Math.max(min, rawValue) / step) * step
    },
    [min, max, step],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) return

      event.preventDefault()
      setIsDragging(true)

      const updateValue = (clientX: number) => {
        if (!trackRef.current) return

        const rect = trackRef.current.getBoundingClientRect()
        const position = ((clientX - rect.left) / rect.width) * 100
        const clampedPosition = Math.max(0, Math.min(100, position))
        const newValue = getValueFromPosition(clampedPosition)

        if (newValue !== value) {
          onChange(newValue)
        }
      }

      updateValue(event.clientX)

      const handlePointerMove = (e: PointerEvent) => {
        updateValue(e.clientX)
      }

      const handlePointerUp = () => {
        setIsDragging(false)
        document.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('pointerup', handlePointerUp)
      }

      document.addEventListener('pointermove', handlePointerMove)
      document.addEventListener('pointerup', handlePointerUp)
    },
    [disabled, value, onChange, getValueFromPosition],
  )

  const position = getPositionFromValue(value)

  return (
    <div className={clsxm('w-full', className)}>
      {/* Labels */}
      <div className="text-text-secondary mb-2 flex justify-between text-xs">
        <span>{finalAutoLabel}</span>
        <span>{max}</span>
      </div>

      {/* Slider track */}
      <div
        ref={sliderRef}
        className={clsxm(
          'relative h-6 cursor-pointer',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onPointerDown={handlePointerDown}
      >
        {/* Background track */}
        <div
          ref={trackRef}
          className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700"
        >
          {/* Auto mode area indicator */}
          <div className="absolute top-0 left-0 h-full w-[12%] rounded-l-full bg-green-100 dark:bg-green-900/50" />

          {/* Active area */}
          <div
            className={clsxm(
              'absolute top-0 h-full rounded-full transition-all duration-150 max-w-full',
              value === 'auto' ? 'bg-green-500' : 'bg-accent',
            )}
            style={{
              width: `${Math.max(position, 5)}%`,
              borderRadius: value === 'auto' ? '9999px 0 0 9999px' : '9999px',
            }}
          />
        </div>

        {/* Slider handle */}
        <div
          className={clsxm(
            'absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg transition-all duration-150',
            isDragging ? 'scale-110' : 'hover:scale-105',
            value === 'auto' ? 'bg-green-500' : 'bg-accent',
            disabled && 'cursor-not-allowed',
          )}
          style={{
            left: `${position}%`,
          }}
        />

        {/* Numeric scale */}
        <div className="absolute top-full mt-1 flex w-full text-xs text-gray-400">
          <div className="w-[15%] text-left">
            <span
              className={clsxm(
                'transition-colors',
                value === 'auto' && 'font-medium text-green-500',
              )}
            >
              {finalAutoLabel}
            </span>
          </div>
          <div className="flex w-[85%] justify-between">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(
              (num) => (
                <span
                  key={num}
                  className={clsxm(
                    'transition-colors',
                    value === num && 'font-medium text-accent',
                  )}
                >
                  {num}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Current value display */}
      <div className="mt-8 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
        {value === 'auto' ? finalAutoLabel : `${value} ${t('slider.columns')}`}
      </div>
    </div>
  )
}
