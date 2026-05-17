import type { AnalysisResult } from "@/lib/solver"
import { formatValue } from "@/lib/constants"

export function AnalyzeSelectContent({ analysisResult }: { analysisResult: AnalysisResult | null }) {
  if (!analysisResult) {
    return <p className="text-xs text-gray-500">No analysis result. Add supports and members.</p>
  }

  const forces = Object.values(analysisResult.memberEndForces)
  const disps  = Object.values(analysisResult.nodeDisplacements)
  const rxns   = Object.values(analysisResult.reactions)

  const maxN  = Math.max(...forces.map(f => Math.max(Math.abs(f.N1), Math.abs(f.N2))))
  const maxV  = Math.max(...forces.map(f => Math.max(Math.abs(f.V1), Math.abs(f.V2))))
  const maxM  = Math.max(...forces.map(f => Math.max(Math.abs(f.M1), Math.abs(f.M2))))
  const maxU  = Math.max(...disps.map(d => Math.abs(d.u)))  * 1000
  const maxV2 = Math.max(...disps.map(d => Math.abs(d.v)))  * 1000
  const maxTh = Math.max(...disps.map(d => Math.abs(d.theta))) * (180 / Math.PI)

  const row = (label: string, value: string) => (
    <div className="flex justify-between text-xs" key={label}>
      <span className="text-gray-500">{label}</span>
      <span className="text-[#1e293b] font-mono">{value}</span>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="border border-gray-100 rounded p-2.5 space-y-1.5 bg-gray-50">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Forces</p>
        {row("Max Axial",  `${formatValue(maxN)} kN`)}
        {row("Max Shear",  `${formatValue(maxV)} kN`)}
        {row("Max Moment", `${formatValue(maxM)} kN·m`)}
      </div>
      <div className="border border-gray-100 rounded p-2.5 space-y-1.5 bg-gray-50">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Displacements</p>
        {row("Max horiz (u)", `${maxU.toFixed(3)} mm`)}
        {row("Max vert (v)",  `${maxV2.toFixed(3)} mm`)}
        {row("Max rotation",  `${maxTh.toFixed(4)} °`)}
      </div>
      {rxns.length > 0 && (
        <div className="border border-gray-100 rounded p-2.5 space-y-1.5 bg-gray-50">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Reactions</p>
          {Object.entries(analysisResult.reactions).map(([nodeId, r]) => (
            <div key={nodeId} className="space-y-0.5">
              <p className="text-[10px] text-gray-400">{nodeId}</p>
              {Math.abs(r.Rx) > 1e-6  && row("  Rx", `${formatValue(r.Rx)} kN`)}
              {Math.abs(r.Ry) > 1e-6  && row("  Ry", `${formatValue(r.Ry)} kN`)}
              {Math.abs(r.Mz) > 1e-6  && row("  Mz", `${formatValue(r.Mz)} kN·m`)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
