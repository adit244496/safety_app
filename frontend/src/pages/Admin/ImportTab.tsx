import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, SkipForward, Download } from 'lucide-react'
import api from '../../lib/api'

interface ImportResult {
  created_count: number
  skipped_count: number
  error_count: number
  created: string[]
  skipped: string[]
  errors: string[]
}

function ImportSection({
  title,
  description,
  columns,
  note,
  endpoint,
  templateFile,
}: {
  title: string
  description: string
  columns: string[]
  note?: string
  endpoint: string
  templateFile?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploadError, setUploadError] = useState('')

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(endpoint, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
    } catch (e: any) {
      setUploadError(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setUploadError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        {templateFile && (
          <a
            href={`/uploads/${templateFile}`}
            download
            className="btn-secondary flex-shrink-0 text-xs"
          >
            <Download className="w-3.5 h-3.5" /> Template
          </a>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Column guide */}
        <div className="text-sm bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1.5">
          <p className="font-medium text-blue-800">Expected Excel columns:</p>
          <div className="flex flex-wrap gap-1.5">
            {columns.map(c => (
              <span key={c} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-mono">
                {c}
              </span>
            ))}
          </div>
          {note && <p className="text-xs text-blue-600 mt-1">{note}</p>}
        </div>

        {!result ? (
          <>
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                file
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
              }`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-2 ${file ? 'text-green-500' : 'text-gray-400'}`} />
              {file ? (
                <p className="text-sm font-medium text-green-700">{file.name}</p>
              ) : (
                <p className="text-sm text-gray-500">Click to select Excel file (.xlsx)</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => { setFile(e.target.files?.[0] || null); setUploadError('') }}
              />
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="btn-primary"
              >
                {uploading ? 'Importing…' : <><Upload className="w-4 h-4" /> Import</>}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-green-700">{result.created_count}</p>
                <p className="text-xs text-green-600 mt-0.5">Imported</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-amber-700">{result.skipped_count}</p>
                <p className="text-xs text-amber-600 mt-0.5">Skipped</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-red-700">{result.error_count}</p>
                <p className="text-xs text-red-600 mt-0.5">Errors</p>
              </div>
            </div>

            {result.created.length > 0 && (
              <details open={result.created_count <= 20}>
                <summary className="cursor-pointer flex items-center gap-1.5 text-green-700 font-medium text-sm py-1">
                  <CheckCircle2 className="w-4 h-4" /> Imported ({result.created_count})
                </summary>
                <div className="mt-1 max-h-48 overflow-y-auto thin-scroll bg-green-50 rounded-lg p-2 space-y-0.5">
                  {result.created.map((s, i) => (
                    <p key={i} className="text-xs text-green-800 font-mono">{s}</p>
                  ))}
                </div>
              </details>
            )}

            {result.skipped.length > 0 && (
              <details>
                <summary className="cursor-pointer flex items-center gap-1.5 text-amber-700 font-medium text-sm py-1">
                  <SkipForward className="w-4 h-4" /> Skipped ({result.skipped_count})
                </summary>
                <div className="mt-1 max-h-48 overflow-y-auto thin-scroll bg-amber-50 rounded-lg p-2 space-y-0.5">
                  {result.skipped.map((s, i) => (
                    <p key={i} className="text-xs text-amber-800 font-mono">{s}</p>
                  ))}
                </div>
              </details>
            )}

            {result.errors.length > 0 && (
              <details open>
                <summary className="cursor-pointer flex items-center gap-1.5 text-red-700 font-medium text-sm py-1">
                  <AlertCircle className="w-4 h-4" /> Errors ({result.error_count})
                </summary>
                <div className="mt-1 max-h-48 overflow-y-auto thin-scroll bg-red-50 rounded-lg p-2 space-y-0.5">
                  {result.errors.map((s, i) => (
                    <p key={i} className="text-xs text-red-800 font-mono">{s}</p>
                  ))}
                </div>
              </details>
            )}

            <div className="flex justify-end pt-1">
              <button onClick={reset} className="btn-secondary text-sm">
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ImportTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <FileSpreadsheet className="w-4 h-4" />
        <span>Bulk import historical data from Excel files</span>
      </div>

      <ImportSection
        title="Import Historical Observations"
        description="Import past safety observations without images. Duplicate observation IDs are skipped. Buildings and floors are auto-created if missing."
        endpoint="/observations/bulk-import"
        columns={[
          'Observation ID',
          'Observation Date',
          'Observation Time',
          'Project Name',
          'Building / Block',
          'Floor / Level',
          'Exact Location',
          'Observer Name',
          'Contractor Name',
          'To Be Rectified By',
          'Category',
          'Core Concern',
          'Specific Concern',
          'Specific Concern (Custom Text)',
          'Possible Outcome',
          'Severity',
          'Probability',
          'Risk Factor',
          'Risk Level',
          'Root Cause Category',
          'Root Cause Specific',
          'Violation / Non-Conformance',
          'Closing Date Actual',
          'Status',
        ]}
        note="Use the Safety_Observation_Migration_Template.xlsx format. Status values: Open, Closed, Positive Approach."
      />
    </div>
  )
}
