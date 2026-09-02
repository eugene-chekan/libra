import * as Dialog from '@radix-ui/react-dialog'

import type { Chapter } from './BookReader'
import styles from './ContentsDrawer.module.css'

interface ContentsDrawerProps {
  chapters: Chapter[]
  currentIndex: number
  onChoose: (index: number) => void
  onClose: () => void
}

/** The book's own table of contents, from the left, where the sidebar used to be. */
export function ContentsDrawer({ chapters, currentIndex, onChoose, onClose }: ContentsDrawerProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.drawer} aria-describedby={undefined}>
          <Dialog.Title className={styles.heading}>Contents</Dialog.Title>
          {chapters.length === 0 ? (
            <p className={styles.empty}>This book has no table of contents.</p>
          ) : (
            <ul className={styles.list}>
              {chapters.map((chapter) => (
                <li key={chapter.index}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-current={chapter.index === currentIndex ? 'true' : undefined}
                    onClick={() => onChoose(chapter.index)}
                  >
                    {chapter.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
