import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Description } from './Description'

describe('Description', () => {
  it('shows paragraphs and italics as formatting, not as tags', () => {
    render(<Description html="<p>The <i>Secret History</i> of Justinian.</p><p>Second part.</p>" />)

    expect(screen.getByText('Secret History').tagName).toBe('I')
    expect(screen.getByText('Second part.').tagName).toBe('P')
    expect(screen.queryByText(/<p>|<i>/)).not.toBeInTheDocument()
  })

  it('turns an https link into a link that opens in a new tab', () => {
    render(
      <Description html='<p>By <a href="https://standardebooks.org/ebooks/procopius">Procopius</a>.</p>' />
    )

    const link = screen.getByRole('link', { name: 'Procopius' })
    expect(link).toHaveAttribute('href', 'https://standardebooks.org/ebooks/procopius')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each(['javascript:alert(1)', 'data:text/html,<b>hi</b>', '/ebooks/procopius'])(
    'keeps the words of a link to %s, but not the link',
    (href) => {
      render(<Description html={`<p><a href="${href}">Procopius</a></p>`} />)

      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText('Procopius')).toBeInTheDocument()
    }
  )

  it('drops a script together with its content, and an image with its handler', () => {
    const { container } = render(
      <Description html='<p>Safe</p><script>stolen = document.cookie</script><img src="x" onerror="stolen = 1">' />
    )

    expect(container).toHaveTextContent('Safe')
    expect(container).not.toHaveTextContent('stolen')
    expect(container.querySelector('script, img')).toBeNull()
  })

  it('keeps the text of a tag it does not allow, without the tag', () => {
    const { container } = render(<Description html='<p>A <span class="x">plain</span> word</p>' />)

    expect(screen.getByText('A plain word').tagName).toBe('P')
    expect(container.querySelector('span')).toBeNull()
  })

  it('copies no attribute from an allowed tag', () => {
    render(<Description html='<p style="color: red" onclick="steal()">Hello</p>' />)

    expect(screen.getByText('Hello').attributes).toHaveLength(0)
  })

  it('splits plain text into paragraphs at blank lines', () => {
    render(<Description html={'First paragraph.\n\nSecond paragraph.'} />)

    expect(screen.getByText('First paragraph.').tagName).toBe('P')
    expect(screen.getByText('Second paragraph.').tagName).toBe('P')
  })
})
