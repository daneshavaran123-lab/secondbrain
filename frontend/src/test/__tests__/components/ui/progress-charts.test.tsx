import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressCharts } from '@/components/ui/progress-charts'

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: any) => <div data-testid="pie">{children}</div>,
  Cell: () => <div data-testid="cell" />,
  Tooltip: () => <div data-testid="tooltip" />
}))

vi.mock('@/services/progressStatsService', () => ({
  getProgressStats: vi.fn().mockResolvedValue({ projects: 75, tasks: 60, ideas: 85, meetings: 40 })
}))

describe('ProgressCharts Component', () => {
  describe('تست جعبه‌سیاه (Black-box Testing)', () => {
    it('should render pie chart and progress rings', async () => {
      render(<ProgressCharts />)

      expect(await screen.findByTestId('responsive-container')).toBeInTheDocument()
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
      expect(screen.getByText('پروژه‌ها')).toBeInTheDocument()
      expect(screen.getByText('وظایف')).toBeInTheDocument()
      expect(screen.getByText('ایده‌ها')).toBeInTheDocument()
      expect(screen.getByText('جلسات')).toBeInTheDocument()
    })

    it('should display progress percentages correctly', async () => {
      render(<ProgressCharts />)

      expect(await screen.findByText('۷۵%')).toBeInTheDocument() // پروژه‌ها
      expect(screen.getByText('۶۰%')).toBeInTheDocument() // وظایف
      expect(screen.getByText('۸۵%')).toBeInTheDocument() // ایده‌ها
      expect(screen.getByText('۴۰%')).toBeInTheDocument() // جلسات
    })
  })

  describe('تست عملکرد (Performance Testing)', () => {
    it('should render quickly with multiple data points', () => {
      const startTime = performance.now()
      render(<ProgressCharts />)
      const endTime = performance.now()
      
      // Should render in reasonable time
      expect(endTime - startTime).toBeLessThan(200)
    })
  })
})