import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

interface GuideStepProps {
  number: number
  title: string
  children: ReactNode
  image?: { src: string; alt: string }
  done?: boolean
}

function GuideStep({ number, title, children, image, done }: GuideStepProps) {
  return (
    <section className="mb-11">
      <div className="flex items-center gap-4 mb-3">
        <div className={`flex-shrink-0 w-11 h-11 rounded-full text-white text-xl font-extrabold flex items-center justify-center ${done ? 'bg-green-600' : 'bg-brand'}`}>
          {number}
        </div>
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      </div>
      <p className="text-[15px] text-gray-600 leading-relaxed">{children}</p>
      {image && (
        <img
          src={image.src}
          alt={image.alt}
          className="block w-full max-w-md mx-auto mt-4 border border-gray-200 rounded-xl shadow-sm"
        />
      )}
    </section>
  )
}

export function LoginGuidePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <img src="/logo.png" alt="mHUB Logo" className="h-8" />
          <Link to="/login" className="text-sm font-semibold text-brand hover:underline">
            &larr; Back to Sign In
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-11 pb-20">
        <div className="text-center mb-11">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-3">First Time Logging In</h2>
          <p className="text-base text-gray-600 leading-relaxed max-w-xl mx-auto">
            Welcome to mHUB! Your first sign-in takes about two minutes. One login gets you into the{' '}
            <b className="text-gray-900">member portal, the mHUB Shop, LearnWorlds, and DigiFabster</b>, no separate accounts or passwords.
          </p>
        </div>

        <GuideStep
          number={1}
          title="Enter your registered email"
          image={{ src: '/login-guide/step-1-email.png', alt: 'The mHUB sign-in page with the email field' }}
        >
          Use the email address where you receive mHUB communications. It is your login for every mHUB service. Type it on the sign-in page and click <b className="text-gray-900">Next</b>.
        </GuideStep>

        <GuideStep
          number={2}
          title="Check your email for a one-time password"
          image={{ src: '/login-guide/step-2-one-time-password.png', alt: 'The password screen with the first-time login notice' }}
        >
          On your first login you do not have a password yet. A <b className="text-gray-900">one-time password</b> is sent to your inbox. Enter it in the password field and click <b className="text-gray-900">Sign in</b>.
        </GuideStep>

        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 mb-11 text-sm text-amber-900 leading-relaxed">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <b>Code not arriving?</b> Check your spam or junk folder first. Codes expire after a short time, so request a new one if yours has expired, and make sure you entered your registered email.
          </div>
        </div>

        <GuideStep
          number={3}
          title="Set your own password"
          image={{ src: '/login-guide/step-3-set-password.png', alt: 'The Set Your Password screen' }}
        >
          Choose a password of <b className="text-gray-900">at least 8 characters</b> and confirm it. From now on, this email and password sign you in to everything at mHUB.
        </GuideStep>

        <GuideStep number={4} title="You're in" done>
          You land in the member portal. From there, open the <b className="text-gray-900">mHUB Shop, LearnWorlds, and DigiFabster</b> with one click. No second login needed.
        </GuideStep>

        <section className="mt-2">
          <h3 className="text-xl font-bold text-gray-900 mb-3">Good to know</h3>
          <div className="space-y-2.5 text-sm text-gray-600 leading-relaxed">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3.5">
              <b className="text-gray-900">Every sign-in after this:</b> just your email and password. The one-time password step only happens on your first sign-in and password resets.
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3.5">
              <b className="text-gray-900">Same login on any device.</b> Phone, tablet, or computer, your account follows you.
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3.5">
              <b className="text-gray-900">Forgot your password?</b> Click Forgot Password on the sign-in page and a new one-time password is emailed to you.
            </div>
          </div>
        </section>

        <div className="mt-8 bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 text-sm text-gray-600 leading-relaxed">
          <b className="text-gray-900">Still stuck?</b> Reach out to Virginia Chiu at{' '}
          <a href="mailto:virginia@mhub.org" className="font-bold text-brand hover:underline">virginia@mhub.org</a> or John Welin at{' '}
          <a href="mailto:john@mhub.org" className="font-bold text-brand hover:underline">john@mhub.org</a> and we will get you sorted quickly.
        </div>

        <div className="text-center mt-11">
          <Link
            to="/login"
            className="inline-block bg-brand hover:bg-brand-hover text-white font-bold text-[15px] px-8 py-3 rounded-md"
          >
            Go to Sign In
          </Link>
        </div>
      </main>
    </div>
  )
}
