import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface PageTitle { title: string; subtitle?: string }
interface Ctx { pageTitle: PageTitle; setPageTitle: (t: PageTitle) => void }

const PageTitleCtx = createContext<Ctx>({ pageTitle: { title: '' }, setPageTitle: () => {} })

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [pageTitle, set] = useState<PageTitle>({ title: '' })
  const setPageTitle = useCallback((t: PageTitle) => set(t), [])
  return <PageTitleCtx.Provider value={{ pageTitle, setPageTitle }}>{children}</PageTitleCtx.Provider>
}

export function usePageTitle(title: string, subtitle?: string) {
  const { setPageTitle } = useContext(PageTitleCtx)
  useEffect(() => {
    setPageTitle({ title, subtitle })
  }, [title, subtitle]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function useCurrentPageTitle() {
  return useContext(PageTitleCtx).pageTitle
}
