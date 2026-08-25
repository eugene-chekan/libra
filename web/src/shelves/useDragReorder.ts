import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Dragging a row to a new place in a list, with the mouse. */
interface DragReorder {
  /** The ids in the order to draw right now: the live preview while dragging. */
  order: number[]
  /** The row being dragged, so it can be drawn as lifted. */
  draggingId: number | null
  /** Put this on each row's drag handle. */
  handleProps: (id: number) => { onPointerDown: (event: ReactPointerEvent) => void }
}

export function useDragReorder(ids: number[], onCommit: (ids: number[]) => void): DragReorder {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [preview, setPreview] = useState<number[] | null>(null)

  const working = useRef<number[]>(ids)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })

  useEffect(() => {
    if (draggingId === null) return

    function move(event: PointerEvent) {
      const over = rowUnder(event.clientX, event.clientY)
      if (over === null || over === draggingId || draggingId === null) return
      const next = moveWithin(working.current, draggingId, over)
      working.current = next
      setPreview(next)
    }

    function up() {
      const next = working.current
      setDraggingId(null)
      setPreview(null)
      if (!sameOrder(next, ids)) commit.current(next)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [draggingId, ids])

  return {
    order: preview ?? ids,
    draggingId,
    handleProps: (id: number) => ({
      onPointerDown: (event: ReactPointerEvent) => {
        // Without this the browser starts a text selection that follows the
        // pointer and highlights the whole dialog.
        event.preventDefault()
        working.current = ids
        setDraggingId(id)
        setPreview(ids)
      },
    }),
  }
}

/** The id of the row under the pointer, read from `data-drag-id` on the row. */
function rowUnder(x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y)
  const row = element?.closest('[data-drag-id]')
  const id = row?.getAttribute('data-drag-id')
  return id === undefined || id === null ? null : Number(id)
}

/** `moved` taken out and put back where `target` currently sits. */
export function moveWithin(order: number[], moved: number, target: number): number[] {
  const without = order.filter((id) => id !== moved)
  const at = without.indexOf(target)
  if (at === -1) return order
  const goingDown = order.indexOf(moved) < order.indexOf(target)
  without.splice(goingDown ? at + 1 : at, 0, moved)
  return without
}

/** Whether two id lists are the same, in the same order. */
export function sameOrder(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}
