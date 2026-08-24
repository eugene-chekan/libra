import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PublicPill } from './PublicPill'

describe('PublicPill', () => {
  it('says the shelf is public in words, not only in colour', () => {
    render(<PublicPill />)

    expect(screen.getByText('Public')).toBeInTheDocument()
  })
})
