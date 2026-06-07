import { useState, useEffect } from 'react'
import { Key, Wifi, Moon, Sun, CheckCircle, XCircle, Loader2, Image as ImageIcon } from 'lucide-react'
import TeachingModePicker from '../components/TeachingModePicker'
import { useSettingsStore } from '../stores/settingsStore'
import type { TeachingMode } from '../types'

export default function Settings() {
  const settings = useSettingsStore()
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('deepseek-chat')
  const [teachingMode, setTeachingMode] = useState<TeachingMode>('direct')
  const [darkMode, setDarkMode] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [visionApiKey, setVisionApiKey] = useState('')
  const [visionBaseURL, setVisionBaseURL] = useState('')
  const [visionModel, setVisionModel] = useState('')
  const [visionTesting, setVisionTesting] = useState(false)
  const [visionTestResult, setVisionTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (settings.loaded) {
      setApiKey(settings.apiKey)
      setModel(settings.model)
      setTeachingMode(settings.defaultTeachingMode)
      setDarkMode(settings.darkMode)
      setVisionApiKey(settings.visionApiKey)
      setVisionBaseURL(settings.visionBaseURL)
      setVisionModel(settings.visionModel)
    }
  }, [settings.loaded])

  const handleSave = async () => {
    await settings.update({
      apiKey,
      model,
      defaultTeachingMode: teachingMode,
      darkMode,
      visionApiKey,
      visionBaseURL,
      visionModel,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    await settings.update({ apiKey, model })
    const result = await window.specula.settings.testConnection()
    setTestResult(result)
    setTesting(false)
  }

  const handleVisionTest = async () => {
    setVisionTesting(true)
    setVisionTestResult(null)
    await settings.update({ visionApiKey, visionBaseURL, visionModel })
    const result = await window.specula.settings.testVision()
    setVisionTestResult(result)
    setVisionTesting(false)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-lg">
        <h1 className="mb-1 text-2xl font-bold">设置</h1>
        <p className="mb-6 text-sm text-gray-500">配置 DeepSeek API 和阅读偏好</p>

        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Key className="h-5 w-5 text-specula-600" />
              <h2 className="font-medium">DeepSeek API</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">模型</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="input"
                  placeholder="deepseek-chat"
                />
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleTest} disabled={testing || !apiKey} className="btn-secondary">
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  测试连接
                </button>
                {testResult && (
                  <span
                    className={`flex items-center gap-1 text-sm ${
                      testResult.ok ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="card p-5">
            <div className="mb-1 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-specula-600" />
              <h2 className="font-medium">视觉模型（图片解释）</h2>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              DeepSeek 不支持图片输入，图片讲解需单独配置一个兼容 OpenAI 接口的视觉模型
              （默认：阿里云百炼 / Qwen-VL）。
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">API Key</label>
                <input
                  type="password"
                  value={visionApiKey}
                  onChange={(e) => setVisionApiKey(e.target.value)}
                  className="input"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Base URL</label>
                <input
                  type="text"
                  value={visionBaseURL}
                  onChange={(e) => setVisionBaseURL(e.target.value)}
                  className="input"
                  placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">模型</label>
                <input
                  type="text"
                  value={visionModel}
                  onChange={(e) => setVisionModel(e.target.value)}
                  className="input"
                  placeholder="qwen-vl-max"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleVisionTest}
                  disabled={visionTesting || !visionApiKey}
                  className="btn-secondary"
                >
                  {visionTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                  测试连接
                </button>
                {visionTestResult && (
                  <span
                    className={`flex items-center gap-1 text-sm ${
                      visionTestResult.ok ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {visionTestResult.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {visionTestResult.message}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 font-medium">默认教学方式</h2>
            <TeachingModePicker value={teachingMode} onChange={setTeachingMode} />
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {darkMode ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <div>
                  <h2 className="font-medium">深色模式</h2>
                  <p className="text-xs text-gray-500">切换界面主题</p>
                </div>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative h-6 w-11 rounded-full transition ${
                  darkMode ? 'bg-specula-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    darkMode ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </section>

          <button onClick={handleSave} className="btn-primary w-full">
            {saved ? '已保存' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
