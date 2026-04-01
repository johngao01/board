import { useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'dark' | 'light'

export type ChartTheme = {
  mode: ThemeMode
  text: string
  muted: string
  axis: string
  grid: string
  split: string
  panel: string
  pieBorder: string
  baseBar: string
  baseLabel: string
  heatText: string
  heatBorder: string
  heatCell: string
  heatLabel: string
  heatScale: [string, string, string, string]
  emphasisShadow: string
}

export function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>(
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setTheme(root.dataset.theme === 'light' ? 'light' : 'dark')
    })

    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

export function useChartTheme(): ChartTheme {
  const mode = useThemeMode()

  return useMemo(
    () =>
      mode === 'dark'
        ? {
            mode,
            text: '#dce4f2',
            muted: '#c2cbdb',
            axis: '#9faabd',
            grid: '#384357',
            split: '#2b3445',
            panel: '#161d2d',
            pieBorder: '#1a2233',
            baseBar: '#3a3a3a',
            baseLabel: '#8d93a6',
            heatText: '#91a6c2',
            heatBorder: 'rgba(18, 24, 38, 0.95)',
            heatCell: '#1c2440',
            heatLabel: '#f7fbff',
            heatScale: ['#202845', '#18456e', '#0c6ec9', '#00d7ff'],
            emphasisShadow: 'rgba(0, 234, 255, 0.38)',
          }
        : {
            mode,
            text: '#173247',
            muted: '#698096',
            axis: '#7a8ea6',
            grid: '#d5e2ef',
            split: '#e3edf6',
            panel: '#ffffff',
            pieBorder: '#ffffff',
            baseBar: '#d6e2ee',
            baseLabel: '#7c90a5',
            heatText: '#7a8ea6',
            heatBorder: '#d8e3ef',
            heatCell: '#f7fbff',
            heatLabel: '#163247',
            heatScale: ['#edf5ff', '#bde9ff', '#58bdf1', '#00a9c2'],
            emphasisShadow: 'rgba(0, 169, 194, 0.22)',
          },
    [mode],
  )
}
