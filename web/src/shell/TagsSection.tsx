import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useTags } from '../library/useTags'
import { routes } from '../routes'
import { TagManager } from '../tags/TagManager'
import { Icon } from '../widgets/Icon'
import { SkeletonRows } from '../widgets/Skeleton'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './FilterSection.module.css'

/** The sidebar's TAGS list. */
export function TagsSection() {
  const tagsQuery = useTags()
  const [searchParams] = useSearchParams()
  const [managing, setManaging] = useState(false)
  const activeTagIds = new Set((searchParams.get('tags') ?? '').split(',').filter(Boolean))

  if (tagsQuery.isPending) {
    return (
      <CollapsibleSection label="Tags" topMargin="28px">
        <SkeletonRows rows={3} height="30px" />
      </CollapsibleSection>
    )
  }

  const tags = tagsQuery.data ?? []
  if (tagsQuery.isError) return null

  return (
    <>
      <CollapsibleSection label="Tags" topMargin="28px">
        {tags.map((tag) => {
          const idStr = String(tag.id)
          const isActive = activeTagIds.has(idStr)
          const nextIds = new Set(activeTagIds)
          if (isActive) nextIds.delete(idStr)
          else nextIds.add(idStr)

          const next = new URLSearchParams(searchParams)
          if (nextIds.size > 0) next.set('tags', [...nextIds].join(','))
          else next.delete('tags')
          const query = next.toString()

          return (
            <Link
              key={tag.id}
              to={query ? `${routes.library}?${query}` : routes.library}
              className={styles.row}
              aria-current={isActive ? 'true' : undefined}
            >
              <Icon name="tag" size={14} className={styles.tagIcon} />
              <span className={styles.tagName}>{tag.name}</span>
              {isActive && <span className={styles.activeDot} />}
            </Link>
          )
        })}

        <button type="button" className={styles.manageRow} onClick={() => setManaging(true)}>
          <Icon name="plus" size={12} />
          Manage Tags
        </button>
      </CollapsibleSection>

      {managing && <TagManager onClose={() => setManaging(false)} />}
    </>
  )
}
