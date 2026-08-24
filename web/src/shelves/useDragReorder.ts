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
 * actually changed. A commit per row crossed would send one request per pixel
 * of travel.
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

  // The working order lives in a ref as well as in state: the pointer handlers
  // below are registered once per drag and would otherwise read whatever the
  // order was when the drag started, for the whole drag.
  const working = useRef<number[]>(ids)

  // The newest `onCommit`, kept where the pointer handlers below can reach it.
  // They are registered once per drag, so a callback captured when the drag
  // started would be the one used when it ends — and writing this in an effect
  // rather than during render is what `react-hooks/refs` is asking for.
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
      // Only when it actually moved. Picking a row up and putting it back is
      // not a change, and should not spend a request saying so.
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
    // `ids` is a fresh array on every render, so this re-subscribes on every
    // render as well. That is deliberate rather than tolerated: it costs two
    // listener swaps, and it is what keeps the comparison in `up()` against
    // the order as it stands now instead of the one the drag started with.
  }, [draggingId, ids])

  return {
    order: preview ?? ids,
    draggingId,
    handleProps: (id: number) => ({
      onPointerDown: (event: ReactPointerEvent) => {
        // Stops the browser starting a text selection that would follow the
        // pointer around and highlight the whole dialog.
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
 * after the old position, so the target's index has to be read from the list
 * that already has the moved id taken out of it.
 */
export function moveWithin(order: number[], moved: number, target: number): number[] {
  const without = order.filter((id) => id !== moved)
  const at = without.indexOf(target)
  if (at === -1) return order
  // Below the target when dragging down, above it when dragging up: the row
  // being passed should end up on the side the pointer came from.
  const goingDown = order.indexOf(moved) < order.indexOf(target)
  without.splice(goingDown ? at + 1 : at, 0, moved)
  return without
}

/** Whether two id lists are the same, in the same order. */
export function sameOrder(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}
