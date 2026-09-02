import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TextSizeMenu } from './TextSizeMenu'

describe('TextSizeMenu', () => {
  it('offers the three sizes', () => {
    render(<TextSizeMenu value="medium" onChange={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Small' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument()
  })

  it('marks the size in use', () => {
    render(<TextSizeMenu value="large" onChange={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Large' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Small' })).not.toHaveAttribute('aria-current')
  })

  it('reports the size chosen', async () => {
    const onChange = vi.fn()
    render(<TextSizeMenu value="medium" onChange={onChange} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Small' }))

    expect(onChange).toHaveBeenCalledWith('small')
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<TextSizeMenu value="medium" onChange={vi.fn()} onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })
})
