import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * Dragging a row to a new place in a list, with the mouse.
 *
 * Hand-rolled on pointer events rather than pulling in a drag library: this is
 * one short vertical list, the whole mechanism is the forty lines below, and a
 * dependency would be a permanent cost for a one-screen feature.
 *
 * **The drag is not the only way to reorder, and must not be.** A drag cannot
 * be done from a keyboard at all, so the up and down buttons beside each row
 * are the real control and this is the quick one. Touch dragging is
 * deliberately not attempted here — a phone wants a different gesture, and
 * that belongs to a mobile client rather than to this desktop layout.
 *
 * Nothing is written until the pointer is released, and only if the order
 * actually changed: a commit per row crossed would send one request per pixel
 * of travel.
 *
 * Two refs carry the drag. `working` holds the live order, because the pointer
 * handlers are registered once per drag and would otherwise read the order as
 * it stood when the drag began; `commit` holds the newest callback for the
 * same reason, written in an effect rather than during render because
 * `react-hooks/refs` requires it. The effect re-subscribes on every render,
 * since `ids` is a fresh array each time — two listener swaps, in exchange for
 * comparing against the order as it stands now.
 */
interface DragReorder {
  /** The ids in the order to draw right now: the live preview while dragging. */
  order: number[]
  /** The row being dragged, so it can be drawn as lifted. Null when idle. */
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

/**
 * `moved` taken out and put back where `target` currently sits.
 *
 * Pure, and separate from the pointer plumbing above, because this is the part
 * with the off-by-one in it: removing before inserting shifts every index
 * after the old position, so the target's index is read from the list that
 * already has the moved id taken out. A row dragged downwards lands after the
 * target and one dragged upwards lands before it, so it ends up on the side
 * the pointer came from.
 */
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
