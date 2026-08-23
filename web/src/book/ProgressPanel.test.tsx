import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProgressPanel } from './ProgressPanel'

describe('ProgressPanel', () => {
  it('reports progress as a percentage a screen reader can read', () => {
    render(<ProgressPanel progress={0.42} pages={null} />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('counts pages when the book says how many it has', () => {
    render(<ProgressPanel progress={0.5} pages={300} />)

    expect(screen.getByText('150 of 300 pages')).toBeInTheDocument()
  })

  it('says nothing about pages for a book whose file never declared any', () => {
    // Most EPUBs do not. "150 of null pages" would be worse than no line.
    render(<ProgressPanel progress={0.5} pages={null} />)

    expect(screen.queryByText(/pages/)).not.toBeInTheDocument()
    expect(screen.getByText('Read so far')).toBeInTheDocument()
  })

  it('says "Not started" at zero rather than showing an empty measurement', () => {
    render(<ProgressPanel progress={0} pages={null} />)

    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('clamps a value from outside 0 to 1 rather than drawing past the end', () => {
    render(<ProgressPanel progress={1.4} pages={null} />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('offers no control to change progress', () => {
    // The reader (#36) makes progress observed rather than declared. A slider
    // here would ask the reader for something the app is about to know.
    render(<ProgressPanel progress={0.5} pages={300} />)

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
