/**
 * jsdom has no layout and therefore no `matchMedia`, which `useIsPhone` needs.
 *
 * `setup.ts` calls this with a desktop width before every test, so the whole
 * suite keeps the layout it was written against; a test that wants the phone
 * one calls it again with a narrow width before rendering.
 */
export function setViewportWidth(width: number): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    const min = /min-width:\s*(\d+)px/.exec(query)
    const matches = (max ? width <= Number(max[1]) : true) && (min ? width >= Number(min[1]) : true)

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  }
}
