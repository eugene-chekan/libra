import { createElement, Fragment, type ReactNode } from 'react'

import styles from './Description.module.css'

const KEPT_TAGS = new Set(['p', 'br', 'i', 'em', 'b', 'strong'])
/** Their content is code or markup, not words a reader should see. */
const DROPPED_TAGS = new Set(['script', 'style', 'template', 'noscript'])

/** A book's description, keeping only harmless formatting from the HTML the file wrote. */
export function Description({ html, className }: { html: string; className?: string }) {
  return (
    <div className={className ? `${styles.description} ${className}` : styles.description}>
      {descriptionNodes(html)}
    </div>
  )
}

function descriptionNodes(html: string): ReactNode[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  if (body.children.length === 0) {
    return (body.textContent ?? '')
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph !== '')
      .map((paragraph, index) => <p key={index}>{paragraph}</p>)
  }
  return childNodes(body)
}

function childNodes(parent: Node): ReactNode[] {
  return Array.from(parent.childNodes, (child, index) => toNode(child, index))
}

function toNode(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent
  if (node.nodeType !== Node.ELEMENT_NODE) return null

  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (DROPPED_TAGS.has(tag)) return null

  const children = childNodes(element)
  if (tag === 'a') {
    const href = webAddress(element.getAttribute('href'))
    if (href !== null) {
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    }
  } else if (KEPT_TAGS.has(tag)) {
    return createElement(tag, { key }, ...children)
  }
  return <Fragment key={key}>{children}</Fragment>
}

/** The address itself when it is an http or https URL, and null for anything else. */
function webAddress(href: string | null): string | null {
  if (href === null) return null
  try {
    const { protocol } = new URL(href)
    return protocol === 'http:' || protocol === 'https:' ? href : null
  } catch {
    return null
  }
}
