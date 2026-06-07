declare module 'epubjs' {
  interface NavItem {
    label: string
    href: string
  }

  interface Book {
    ready: Promise<void>
    loaded: {
      metadata: Promise<{ title?: string; creator?: string }>
      navigation: Promise<{ toc: NavItem[] }>
      spine: Promise<{ items: { href: string }[] }>
    }
    spine: {
      get: (href: string) => Section | undefined
    }
    renderTo: (element: HTMLElement, options: Record<string, unknown>) => Rendition
    coverUrl: () => Promise<string | null>
    load: (path: string) => Promise<void>
    destroy: () => void
  }

  interface Section {
    load: (loader: (path: string) => Promise<void>) => Promise<void>
    document: Document
  }

  interface Rendition {
    on: (event: string, callback: (...args: unknown[]) => void) => void
    display: (target?: string) => Promise<void>
    prev: () => void
    next: () => void
    destroy: () => void
  }

  function ePub(input: string | ArrayBuffer): Book
  export default ePub
}

declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: Buffer) => Database
  }

  export interface Database {
    run: (sql: string, params?: (string | number | null)[]) => void
    prepare: (sql: string) => Statement
    export: () => Uint8Array
    close: () => void
  }

  export interface Statement {
    bind: (params: (string | number | null)[]) => void
    step: () => boolean
    getAsObject: () => Record<string, unknown>
    free: () => void
  }

  export default function initSqlJs(): Promise<SqlJsStatic>
}
