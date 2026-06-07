import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Library from './pages/Library'
import Reader from './pages/Reader'
import Quiz from './pages/Quiz'
import Review from './pages/Review'
import Settings from './pages/Settings'
import { useSettingsStore } from './stores/settingsStore'

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Library />} />
          <Route path="reader/:bookId" element={<Reader />} />
          <Route path="quiz/:bookId/:chapterId" element={<Quiz />} />
          <Route path="review/:bookId/:chapterId" element={<Review />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
