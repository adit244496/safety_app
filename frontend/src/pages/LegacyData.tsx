// Bump when public/legacy-data.html changes so browsers don't keep a stale cached copy.
const LEGACY_PAGE_VERSION = '2026-10-26'

export default function LegacyData() {
  return (
    <div className="w-full bg-slate-50">
      <iframe
        src={`/legacy-data.html?v=${LEGACY_PAGE_VERSION}`}
        title="Legacy Data"
        className="w-full border-0 block"
        style={{ height: 'calc(100vh - 4rem)' }}
      />
    </div>
  )
}
