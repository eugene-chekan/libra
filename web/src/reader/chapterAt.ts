import type { Chapter } from './BookReader'

/** The contents entry covering spine position `index`, or null when none does. */
export function chapterAt(chapters: Chapter[], index: number): string | null {
  let covering: Chapter | null = null
  for (const chapter of chapters) {
    if (chapter.index > index) continue
    if (covering === null || chapter.index > covering.index) covering = chapter
  }
  return covering?.label ?? null
}
