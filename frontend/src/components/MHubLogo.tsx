export function MHubLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`font-bold ${className}`}>
      <span className="text-black">M</span>
      <span className="text-gray-700 underline decoration-2 underline-offset-2">HUB</span>
    </div>
  )
}