import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react"
import { parseCsv } from "@/utils/csv"

type Format = "standard" | "pv"

interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  entity: "companies" | "users"
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>
  isImporting: boolean
  standardHeaders: string[]
  standardExample: string
}

export function ImportDialog({ open, onClose, entity, onImport, isImporting, standardHeaders, standardExample }: Props) {
  const [format, setFormat] = useState<Format>("standard")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [parseError, setParseError] = useState("")
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    setFile(f)
    setResult(null)
    setParseError("")
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCsv(text)
      if (rows.length === 0) {
        setParseError("No data rows found in file.")
        setPreview([])
        return
      }
      // Validate expected headers
      const missing = standardHeaders.filter(h => !headers.includes(h))
      if (missing.length > 0) {
        setParseError(`Missing columns: ${missing.join(", ")}`)
        setPreview([])
        return
      }
      setPreview(rows.slice(0, 5))
    }
    reader.readAsText(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith(".csv")) handleFile(f)
  }

  const handleSubmit = async () => {
    if (!file || parseError) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const { rows } = parseCsv(e.target?.result as string)
      const res = await onImport(rows)
      setResult(res)
    }
    reader.readAsText(file)
  }

  const handleClose = () => {
    setFile(null)
    setPreview([])
    setParseError("")
    setResult(null)
    setFormat("standard")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import {entity === "companies" ? "Companies" : "Users"}</DialogTitle>
        </DialogHeader>

        {/* Format selector */}
        <div className="flex gap-2">
          <button
            onClick={() => { setFormat("standard"); setFile(null); setPreview([]); setParseError("") }}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              format === "standard" ? "border-brand bg-brand/5 text-brand" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Standard Format
          </button>
          <button
            disabled
            title="Coming soon — PV CSV format not yet defined"
            className="flex-1 rounded-md border px-3 py-2 text-sm font-medium border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50"
          >
            PV Format
            <span className="ml-2 text-xs text-gray-400">(coming soon)</span>
          </button>
        </div>

        {/* Format description */}
        <div className="rounded-md bg-gray-50 border p-3 text-xs text-gray-600 space-y-1">
          <p className="font-medium text-gray-700">Expected columns:</p>
          <p className="font-mono">{standardHeaders.join(", ")}</p>
          <p className="text-gray-500 pt-1">Example: <span className="font-mono">{standardExample}</span></p>
        </div>

        {!result ? (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-colors"
            >
              <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-brand" />
                  <span className="font-medium">{file.name}</span>
                  <Badge variant="outline">{preview.length}+ rows</Badge>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Drop a CSV file here or <span className="text-brand font-medium">browse</span></p>
              )}
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {parseError}
              </div>
            )}

            {/* Preview */}
            {preview.length > 0 && !parseError && (
              <div className="text-sm">
                <p className="text-gray-500 mb-2">Preview (first {preview.length} rows):</p>
                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>{Object.keys(preview[0]).map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.map((row, i) => (
                        <tr key={i}>{Object.values(row).map((v, j) => <td key={j} className="px-3 py-1.5 text-gray-700 max-w-32 truncate">{v || <span className="text-gray-300">—</span>}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!file || !!parseError || isImporting}>
                {isImporting ? "Importing..." : "Import"}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Result */}
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Import complete</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md bg-green-50 border border-green-100 p-3">
                  <div className="text-2xl font-bold text-green-700">{result.created}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Created</div>
                </div>
                <div className="rounded-md bg-blue-50 border border-blue-100 p-3">
                  <div className="text-2xl font-bold text-blue-700">{result.updated}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Updated</div>
                </div>
                <div className="rounded-md bg-gray-50 border p-3">
                  <div className="text-2xl font-bold text-gray-600">{result.skipped}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Skipped</div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
