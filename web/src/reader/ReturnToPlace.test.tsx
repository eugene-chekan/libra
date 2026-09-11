import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ReturnToPlace } from './ReturnToPlace'

describe('ReturnToPlace', () => {
  it('names the page it goes back to', () => {
    render(<ReturnToPlace pages={{ current: 12, total: 80 }} onReturn={vi.fn()} onStay={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Back to page 12' })).toBeInTheDocument()
  })

  it('says where you were, without a number, while the book is not measured', () => {
    render(<ReturnToPlace pages={null} onReturn={vi.fn()} onStay={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Back to where you were' })).toBeInTheDocument()
  })

  it('goes back, or stays here', async () => {
    const onReturn = vi.fn()
    const onStay = vi.fn()
    render(<ReturnToPlace pages={null} onReturn={onReturn} onStay={onStay} />)

    await userEvent.click(screen.getByRole('button', { name: 'Back to where you were' }))
    await userEvent.click(screen.getByRole('button', { name: 'Stay here' }))

    expect(onReturn).toHaveBeenCalledOnce()
    expect(onStay).toHaveBeenCalledOnce()
  })
})
