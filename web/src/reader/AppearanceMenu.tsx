import * as Dialog from '@radix-ui/react-dialog'

import type { Appearance, ReadingWidth, TextSize } from './BookReader'
import styles from './AppearanceMenu.module.css'

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

const WIDTHS: { value: ReadingWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
]

interface AppearanceMenuProps {
  value: Appearance
  onChange: (appearance: Appearance) => void
  onClose: () => void
}

/** Text size and measure, three steps each: a slider implies a precision nobody wants. */
export function AppearanceMenu({ value, onChange, onClose }: AppearanceMenuProps) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.menu} aria-describedby={undefined}>
          <Dialog.Title className={styles.heading}>Text size</Dialog.Title>
          <div className={styles.group} role="group" aria-label="Text size">
            {TEXT_SIZES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={styles.choice}
                aria-current={choice.value === value.textSize ? 'true' : undefined}
                onClick={() => onChange({ ...value, textSize: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>

          <p className={styles.heading}>Page width</p>
          <div className={styles.group} role="group" aria-label="Page width">
            {WIDTHS.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={styles.choice}
                aria-current={choice.value === value.width ? 'true' : undefined}
                onClick={() => onChange({ ...value, width: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
