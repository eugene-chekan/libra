import * as Dialog from '@radix-ui/react-dialog'

import type { TextSize } from './BookReader'
import styles from './TextSizeMenu.module.css'

const CHOICES: { size: TextSize; label: string }[] = [
  { size: 'small', label: 'Small' },
  { size: 'medium', label: 'Medium' },
  { size: 'large', label: 'Large' },
]

interface TextSizeMenuProps {
  value: TextSize
  onChange: (size: TextSize) => void
  onClose: () => void
}

/** Three steps rather than a slider: a slider implies a precision nobody wants. */
export function TextSizeMenu({ value, onChange, onClose }: TextSizeMenuProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.menu} aria-describedby={undefined}>
          <Dialog.Title className={styles.heading}>Text size</Dialog.Title>
          {CHOICES.map((choice) => (
            <button
              key={choice.size}
              type="button"
              className={styles.row}
              aria-current={choice.size === value ? 'true' : undefined}
              onClick={() => onChange(choice.size)}
            >
              {choice.label}
            </button>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
