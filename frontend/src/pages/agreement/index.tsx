import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Download, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useAppDispatch } from '@/store'
import { membershipAgreementSigned } from '@/store/slices/authSlice'
import { useSignMembershipAgreementMutation } from '@/store/api/authApi'

const AGREEMENT_PDF_URL = '/mHUB_Membership_Agreement_2026.pdf'

type SignatureMode = 'type' | 'draw'

export function AgreementPage() {
  const [txQueryParam] = useState(() => new URLSearchParams(window.location.search).get('tx'))
  const [returnToParam] = useState(() => new URLSearchParams(window.location.search).get('returnTo'))
  useEffect(() => {
    if (txQueryParam || returnToParam) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const [agreed, setAgreed] = useState(false)
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('type')
  const [fullLegalName, setFullLegalName] = useState('')
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawnDataUrlRef = useRef<string | null>(null)

  const [signMembershipAgreement, { isLoading: isSigning }] = useSignMembershipAgreementMutation()

  // Signature canvas wiring — draws on mouse/touch, captures a data URL once the
  // member lifts the pointer. Only active while in "draw" mode.
  useEffect(() => {
    if (signatureMode !== 'draw') return
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.clientWidth || 600
    if (canvas.width !== width) {
      canvas.width = width
      canvas.height = 130
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1a1a1a'

    let drawing = false
    const pos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      const point = 'touches' in e ? e.touches[0] : e
      return { x: point.clientX - rect.left, y: point.clientY - rect.top }
    }
    const start = (e: MouseEvent | TouchEvent) => {
      drawing = true
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      e.preventDefault()
    }
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing) return
      const p = pos(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      setHasDrawnSignature(true)
      e.preventDefault()
    }
    const end = () => {
      if (drawing) {
        drawing = false
        drawnDataUrlRef.current = canvas.toDataURL('image/png')
      }
    }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)

    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', end)
    }
  }, [signatureMode])

  const clearDrawnSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawnDataUrlRef.current = null
    setHasDrawnSignature(false)
  }

  const isValid = agreed && (signatureMode === 'type' ? fullLegalName.trim().length > 1 : hasDrawnSignature)

  // This page's only job is capturing the signature — it no longer opens the PV tab or
  // hands off to SSO itself. Once signed, the member is sent back to /login (carrying
  // tx/returnTo forward) to log in for real; login/index.tsx is the single place that
  // opens the payment-form tab and polls for completion, so that behavior only ever
  // lives in one place instead of being duplicated here too.
  const handleSubmit = async () => {
    if (!isValid) return
    try {
      const result = await signMembershipAgreement({
        fullLegalName: fullLegalName.trim(),
        signatureType: signatureMode,
        signatureImageDataUrl: signatureMode === 'draw' ? drawnDataUrlRef.current ?? undefined : undefined,
      }).unwrap()

      if (!result.data) {
        throw new Error('Invalid response from server')
      }
      dispatch(membershipAgreementSigned(result.data.membershipAgreementSignedAt))
      toast.success('Membership agreement signed! Please log in to continue.')

      const loginParams = new URLSearchParams()
      if (txQueryParam) loginParams.set('tx', txQueryParam)
      if (returnToParam) loginParams.set('returnTo', returnToParam)
      const loginQuery = loginParams.toString()
      navigate(loginQuery ? `/login?${loginQuery}` : '/login')
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string }
      toast.error(err.data?.message || err.message || 'Failed to sign the agreement. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="MHUB Logo" className="h-10 mx-auto mb-8" />
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-brand/10 rounded-full">
              <ShieldCheck className="h-8 w-8 text-brand" />
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-2">Membership Agreement</h2>
          <p className="text-gray-600 text-base">
            Review the mHUB Membership Agreement, confirm your agreement, then sign below.
          </p>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div className="flex items-center gap-3 border rounded-lg bg-gray-50 p-3.5">
            <div className="h-10 w-9 rounded bg-white border flex items-center justify-center text-red-600 flex-shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">mHUB Membership Agreement</p>
              <p className="text-xs text-gray-400">2026 &bull; 1623 W Fulton</p>
            </div>
            <a
              href={AGREEMENT_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 border rounded-md px-3 py-1.5"
            >
              View
            </a>
            <a
              href={AGREEMENT_PDF_URL}
              download
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 border rounded-md px-3 py-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </div>

          <div className="flex items-start gap-3 border rounded-lg p-3.5">
            <Checkbox
              id="agreeChk"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="agreeChk" className="text-sm font-normal leading-relaxed cursor-pointer">
              <span className="font-semibold">I agree to the Membership Agreement.</span>{' '}
              I confirm that I have read and understood the mHUB Membership Agreement, and I agree to
              be bound by its terms and conditions.
            </Label>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand mb-3">Signature</p>
            <div className="flex gap-2 mb-4">
              <Button
                type="button"
                variant={signatureMode === 'type' ? 'default' : 'outline'}
                size="sm"
                className={signatureMode === 'type' ? 'bg-brand hover:bg-brand-hover' : ''}
                onClick={() => setSignatureMode('type')}
              >
                Type
              </Button>
              <Button
                type="button"
                variant={signatureMode === 'draw' ? 'default' : 'outline'}
                size="sm"
                className={signatureMode === 'draw' ? 'bg-brand hover:bg-brand-hover' : ''}
                onClick={() => setSignatureMode('draw')}
              >
                Draw
              </Button>
            </div>

            {signatureMode === 'type' ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="fullLegalName">
                    Full Legal Name <span className="text-brand">*</span>
                  </Label>
                  <Input
                    id="fullLegalName"
                    autoComplete="name"
                    placeholder="Type your full legal name"
                    value={fullLegalName}
                    onChange={(e) => setFullLegalName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="min-h-[54px] border border-dashed rounded-md flex items-center justify-center px-4">
                  {fullLegalName.trim() ? (
                    <p className="text-2xl" style={{ fontFamily: '"Segoe Script","Brush Script MT",cursive' }}>
                      {fullLegalName}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Your signature will appear here</p>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <canvas
                  ref={canvasRef}
                  className="w-full border border-dashed rounded-md bg-white cursor-crosshair"
                  style={{ height: 130, touchAction: 'none' }}
                />
                <button
                  type="button"
                  onClick={clearDrawnSignature}
                  className="text-xs text-gray-500 underline mt-2"
                >
                  Clear signature
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400">
            Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <p className="text-xs text-gray-500 leading-relaxed">
            By continuing, you consent to sign this agreement electronically. Your electronic
            signature is legally binding, the same as a handwritten signature. A signed copy will be
            emailed to you and stored with your membership record.
          </p>

          <Button
            type="button"
            disabled={!isValid || isSigning}
            onClick={handleSubmit}
            className="w-full py-4 h-12 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md"
          >
            {isSigning ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing...
              </div>
            ) : (
              'Sign & Continue'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
