import { useState } from 'react'

import type { Tag } from '../api/types'
import { Icon } from '../widgets/Icon'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  tags: Tag[]
  /** Lowercased tag names already applied as filters — excluded from their own suggestions. */
  activeHashTagNames: string[]
}

/** One field, two token types — bare words and `#tag` tokens — per client-design.md. */
export function SearchBar({ value, onChange, tags, activeHashTagNames }: SearchBarProps) {
  const [focused, setFocused] = useState(false)

  const words = value.split(/\s+/)
  const lastWord = words[words.length - 1] ?? ''
  const fragment =
    lastWord.startsWith('#') && lastWord.length > 1 ? lastWord.slice(1).toLowerCase() : null

  const suggestions =
    fragment === null
      ? []
      : tags.filter(
          (tag) =>
            tag.name.toLowerCase().startsWith(fragment) &&
            !activeHashTagNames.includes(tag.name.toLowerCase())
        )

  const showSuggestions = focused && suggestions.length > 0

  function selectTag(name: string) {
    const newWords = [...words]
    newWords[newWords.length - 1] = `#${name}`
    onChange(`${newWords.join(' ')} `)
  }

  return (
    <div className={styles.wrap}>
      <Icon name="search" size={16} className={styles.icon} />
      <input
        className={styles.input}
        type="text"
        value={value}
        placeholder="Search books, authors… or type #tag"
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        // A delay, not an immediate close: onMouseDown on a suggestion below
        // fires before this, but only if blur has not already torn the list
        // down by then.
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />

      {showSuggestions && (
        // div, not ul/li: "listbox"/"option" is its own ARIA widget, not list
        // semantics, and jsx-a11y's non-interactive-element-to-role check
        // agrees — a `<ul>` is not the element this pattern wants.
        <div className={styles.dropdown} role="listbox">
          <div className={styles.sectionLabel} aria-hidden="true">
            Tags
          </div>
          {suggestions.map((tag) => (
            <div
              key={tag.id}
              role="option"
              aria-selected={false}
              // Not in tab order: the field stays focused throughout this
              // interaction (see the mousedown handler below), so nothing
              // here needs its own stop. -1 satisfies the rule that an
              // "option" role must be programmatically focusable at all.
              tabIndex={-1}
              className={styles.option}
              onMouseDown={(event) => {
                // Not onClick: firing on mousedown, before the input's own
                // blur, is what lets a click here register as a selection
                // instead of just closing the dropdown first.
                event.preventDefault()
                selectTag(tag.name)
              }}
            >
              <Icon name="tag" size={14} className={styles.tagIcon} />#{tag.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
