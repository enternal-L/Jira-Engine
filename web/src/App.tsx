import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import EditorApp from './pages/EditorApp'
import LandingPage from './pages/LandingPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/editor" element={<EditorApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
