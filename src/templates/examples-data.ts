import type { StructureModel } from "@/lib/model"
import {
  template1SimpleBeam,
  template2Cantilever,
  template3Portal,
  template4PortalLateral,
  template5AsymmetricRafter,
} from "./examples"

export interface ExampleDefinition {
  id: string
  title: string
  templateFn: () => StructureModel
  svgIllustration: string
  notesTemplate: string
  defaultE: number
  defaultI: number
  defaultA: number
}

const SVG_SIMPLE_BEAM = `
  <svg viewBox="0 0 420 190" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Arial, sans-serif">

    <!-- Dimension lines (blue dashed extensions + solid span lines, aligned to one level) -->
    <line x1="58" y1="112" x2="58" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="182" y1="112" x2="182" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="368" y1="112" x2="368" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>

    <!-- Left span line: 2.00 m -->
    <line x1="58" y1="50" x2="182" y2="50" stroke="#2563eb" stroke-width="1"/>
    <line x1="58" y1="45" x2="58" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="182" y1="45" x2="182" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <text x="120" y="42" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">2.00 m</text>

    <!-- Right span line: 3.00 m -->
    <line x1="182" y1="50" x2="368" y2="50" stroke="#2563eb" stroke-width="1"/>
    <line x1="368" y1="45" x2="368" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <text x="275" y="42" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">3.00 m</text>

    <!-- Point load: 10 kN downward at x=182 -->
    <line x1="182" y1="68" x2="182" y2="109" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="182,115 175,102 189,102" fill="#0BE77E"/>
    <text x="197" y="80" font-size="10" fill="#107343" font-weight="600">10 kN</text>

    <!-- Beam -->
    <rect x="58" y="112" width="310" height="9" rx="1.5" fill="#1a2f5e"/>

    <!-- Nodes -->
    <circle cx="58"  cy="116" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="182" cy="116" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="368" cy="116" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>

    <!-- Pin support (left) -->
    <polygon points="58,121 40,148 76,148" fill="#1a2f5e"/>
    <line x1="34" y1="148" x2="82" y2="148" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="34" y1="148" x2="41" y2="158" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="44" y1="148" x2="51" y2="158" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="54" y1="148" x2="61" y2="158" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="64" y1="148" x2="71" y2="158" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="74" y1="148" x2="81" y2="158" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>

    <!-- Roller support (right) -->
    <polygon points="368,121 351,145 385,145" fill="#1a2f5e"/>
    <circle cx="357" cy="152" r="5" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="379" cy="152" r="5" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="349" y1="159" x2="387" y2="159" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="349" y1="159" x2="356" y2="169" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="359" y1="159" x2="366" y2="169" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="369" y1="159" x2="376" y2="169" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="379" y1="159" x2="386" y2="169" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>

  </svg>
`

const SVG_CANTILEVER = `
  <svg viewBox="0 0 420 190" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Arial, sans-serif">

    <!-- Dimension line (blue dashed above) -->
    <line x1="58" y1="112" x2="58" y2="50" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="368" y1="112" x2="368" y2="50" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="58" y1="54" x2="368" y2="54" stroke="#2563eb" stroke-width="1"/>
    <line x1="58" y1="49" x2="58" y2="59" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="368" y1="49" x2="368" y2="59" stroke="#2563eb" stroke-width="1.5"/>
    <text x="213" y="46" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">5.00 m</text>

    <!-- Distributed load fill region (light green) -->
    <rect x="58" y="75" width="310" height="37" fill="#D7FDEB" opacity="0.6"/>

    <!-- Distributed load arrows (green downward, uniform; arrows land on both edges of the load) -->
    <line x1="58" y1="76" x2="58" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="58,115 53,104 63,104" fill="#0BE77E"/>
    <line x1="103" y1="76" x2="103" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="103,115 98,104 108,104" fill="#0BE77E"/>
    <line x1="147" y1="76" x2="147" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="147,115 142,104 152,104" fill="#0BE77E"/>
    <line x1="191" y1="76" x2="191" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="191,115 186,104 196,104" fill="#0BE77E"/>
    <line x1="235" y1="76" x2="235" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="235,115 230,104 240,104" fill="#0BE77E"/>
    <line x1="279" y1="76" x2="279" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="279,115 274,104 284,104" fill="#0BE77E"/>
    <line x1="324" y1="76" x2="324" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="324,115 319,104 329,104" fill="#0BE77E"/>
    <line x1="368" y1="76" x2="368" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="368,115 363,104 373,104" fill="#0BE77E"/>
    <!-- Baseline -->
    <line x1="58" y1="76" x2="368" y2="76" stroke="#0BE77E" stroke-width="1.5"/>
    <!-- Label -->
    <text x="213" y="69" font-size="10" fill="#107343" text-anchor="middle" font-weight="600">10 kN/m</text>

    <!-- Beam -->
    <rect x="58" y="112" width="310" height="9" rx="1.5" fill="#1a2f5e"/>

    <!-- Nodes -->
    <circle cx="58"  cy="116" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="368" cy="116" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>

    <!-- Fixed support (left) — vertical wall (rotated fixed glyph) for a theoretical cantilever fixed end -->
    <rect x="46" y="98" width="8" height="36" fill="#1a2f5e"/>
    <line x1="40" y1="96" x2="40" y2="136" stroke="#1a2f5e" stroke-width="1.5"/>
    <line x1="46" y1="100" x2="40" y2="106" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="46" y1="107" x2="40" y2="113" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="46" y1="114" x2="40" y2="120" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="46" y1="121" x2="40" y2="127" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="46" y1="128" x2="40" y2="134" stroke="#1a2f5e" stroke-width="1.2"/>
  </svg>
`

const SVG_PORTAL_GRAVITY = `
  <svg viewBox="0 0 420 290" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Arial, sans-serif">

    <!-- Dimensions: Horizontal spans (raised to clear the point-load label) -->
    <!-- Left span: 2.00 m (x=60 to x=184) -->
    <line x1="60" y1="120" x2="60" y2="33" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="184" y1="120" x2="184" y2="33" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="60" y1="38" x2="184" y2="38" stroke="#2563eb" stroke-width="1"/>
    <line x1="60" y1="33" x2="60" y2="43" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="184" y1="33" x2="184" y2="43" stroke="#2563eb" stroke-width="1.5"/>
    <text x="122" y="30" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">2.00 m</text>

    <!-- Right span: 3.00 m (x=184 to x=380) -->
    <line x1="380" y1="120" x2="380" y2="33" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="184" y1="38" x2="380" y2="38" stroke="#2563eb" stroke-width="1"/>
    <line x1="380" y1="33" x2="380" y2="43" stroke="#2563eb" stroke-width="1.5"/>
    <text x="282" y="30" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">3.00 m</text>

    <!-- Dimensions: Vertical height (4.00 m on left) -->
    <line x1="25" y1="120" x2="25" y2="240" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="20" y1="120" x2="30" y2="120" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="20" y1="240" x2="30" y2="240" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="25" y1="125" x2="25" y2="235" stroke="#2563eb" stroke-width="1"/>
    <text x="12" y="185" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500" transform="rotate(-90 12 185)">4.00 m</text>

    <!-- Distributed load on left beam segment (2m, 10 kN/m) -->
    <rect x="60" y="70" width="124" height="40" fill="#D7FDEB" opacity="0.6"/>
    <line x1="75" y1="71" x2="75" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="75,114 70,103 80,103" fill="#0BE77E"/>
    <line x1="105" y1="71" x2="105" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="105,114 100,103 110,103" fill="#0BE77E"/>
    <line x1="135" y1="71" x2="135" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="135,114 130,103 140,103" fill="#0BE77E"/>
    <line x1="165" y1="71" x2="165" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="165,114 160,103 170,103" fill="#0BE77E"/>
    <line x1="60" y1="71" x2="184" y2="71" stroke="#0BE77E" stroke-width="1.5"/>
    <text x="122" y="63" font-size="9" fill="#107343" text-anchor="middle" font-weight="500">10 kN/m</text>

    <!-- Point load at middle node (10 kN downward) — label beside the arrow tail -->
    <line x1="184" y1="56" x2="184" y2="108" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="184,114 177,101 191,101" fill="#0BE77E"/>
    <text x="199" y="60" font-size="10" fill="#107343" font-weight="600">10 kN</text>

    <!-- Distributed load on right beam segment (3m, 10 kN/m) -->
    <rect x="184" y="70" width="196" height="40" fill="#D7FDEB" opacity="0.6"/>
    <line x1="210" y1="71" x2="210" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="210,114 205,103 215,103" fill="#0BE77E"/>
    <line x1="250" y1="71" x2="250" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="250,114 245,103 255,103" fill="#0BE77E"/>
    <line x1="290" y1="71" x2="290" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="290,114 285,103 295,103" fill="#0BE77E"/>
    <line x1="330" y1="71" x2="330" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="330,114 325,103 335,103" fill="#0BE77E"/>
    <line x1="370" y1="71" x2="370" y2="108" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="370,114 365,103 375,103" fill="#0BE77E"/>
    <line x1="184" y1="71" x2="380" y2="71" stroke="#0BE77E" stroke-width="1.5"/>
    <text x="282" y="63" font-size="9" fill="#107343" text-anchor="middle" font-weight="500">10 kN/m</text>

    <!-- Left column -->
    <rect x="56" y="120" width="8" height="120" fill="#1a2f5e"/>

    <!-- Right column -->
    <rect x="376" y="120" width="8" height="120" fill="#1a2f5e"/>

    <!-- Beam -->
    <rect x="60" y="116" width="320" height="9" rx="1.5" fill="#1a2f5e"/>

    <!-- Nodes -->
    <!-- Top nodes (on beam) -->
    <circle cx="60"  cy="120" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="184" cy="120" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="120" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <!-- Bottom nodes (at supports) -->
    <circle cx="60"  cy="240" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="240" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>

    <!-- Fixed supports (both bottom corners) — matches canvas fixed glyph: bar + diagonal ground hatch -->
    <!-- Left fixed support -->
    <rect x="44" y="246" width="32" height="8" fill="#1a2f5e"/>
    <line x1="41" y1="260" x2="79" y2="260" stroke="#1a2f5e" stroke-width="1.5"/>
    <line x1="46" y1="254" x2="42" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="51" y1="254" x2="47" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="56" y1="254" x2="52" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="61" y1="254" x2="57" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="66" y1="254" x2="62" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="71" y1="254" x2="67" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="76" y1="254" x2="72" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>

    <!-- Right fixed support -->
    <rect x="364" y="246" width="32" height="8" fill="#1a2f5e"/>
    <line x1="361" y1="260" x2="399" y2="260" stroke="#1a2f5e" stroke-width="1.5"/>
    <line x1="366" y1="254" x2="362" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="371" y1="254" x2="367" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="376" y1="254" x2="372" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="381" y1="254" x2="377" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="386" y1="254" x2="382" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="391" y1="254" x2="387" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="396" y1="254" x2="392" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
  </svg>
`

const SVG_PORTAL_LATERAL = `
  <svg viewBox="0 0 420 290" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Arial, sans-serif">

    <!-- Dimensions: Horizontal span -->
    <line x1="60" y1="120" x2="60" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="380" y1="120" x2="380" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="60" y1="50" x2="380" y2="50" stroke="#2563eb" stroke-width="1"/>
    <line x1="60" y1="45" x2="60" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="380" y1="45" x2="380" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <text x="220" y="42" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">5.00 m</text>

    <!-- Dimensions: Vertical height (offset left to avoid load labels) -->
    <line x1="15" y1="120" x2="15" y2="240" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="10" y1="120" x2="20" y2="120" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="10" y1="240" x2="20" y2="240" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="15" y1="125" x2="15" y2="235" stroke="#2563eb" stroke-width="1"/>
    <text x="12" y="182" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500" transform="rotate(-90 12 182)">4.00 m</text>

    <!-- Distributed load on left column (rightward, +X) — band on the LEFT, arrows point right into the column, full height -->
    <!-- Light green fill area behind arrows -->
    <rect x="34" y="128" width="22" height="110" fill="#D7FDEB" opacity="0.5"/>
    <!-- Vertical baseline (arrow tails) -->
    <line x1="34" y1="128" x2="34" y2="238" stroke="#0BE77E" stroke-width="1.5"/>
    <!-- Horizontal arrows pointing right, heads at the column's left edge -->
    <line x1="36" y1="136" x2="50" y2="136" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="56,136 50,131 50,141" fill="#0BE77E"/>
    <line x1="36" y1="156" x2="50" y2="156" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="56,156 50,151 50,161" fill="#0BE77E"/>
    <line x1="36" y1="176" x2="50" y2="176" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="56,176 50,171 50,181" fill="#0BE77E"/>
    <line x1="36" y1="196" x2="50" y2="196" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="56,196 50,191 50,201" fill="#0BE77E"/>
    <line x1="36" y1="216" x2="50" y2="216" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="56,216 50,211 50,221" fill="#0BE77E"/>
    <line x1="36" y1="234" x2="50" y2="234" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="56,234 50,229 50,239" fill="#0BE77E"/>
    <!-- Label (rotated, between the 4.00 m dimension and the load band) -->
    <text x="27" y="183" font-size="9" fill="#107343" text-anchor="middle" font-weight="600" transform="rotate(-90 27 183)">10 kN/m</text>

    <!-- Point load at top-left node (10 kN rightward) — head at the node, tail to the left -->
    <line x1="22" y1="120" x2="50" y2="120" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="56,120 49,115 49,125" fill="#0BE77E"/>
    <text x="34" y="110" font-size="10" fill="#107343" text-anchor="middle" font-weight="600">10 kN</text>

    <!-- Left column -->
    <rect x="56" y="120" width="8" height="120" fill="#1a2f5e"/>

    <!-- Right column -->
    <rect x="376" y="120" width="8" height="120" fill="#1a2f5e"/>

    <!-- Beam -->
    <rect x="60" y="116" width="320" height="9" rx="1.5" fill="#1a2f5e"/>

    <!-- Nodes -->
    <!-- Top nodes -->
    <circle cx="60"  cy="120" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="120" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <!-- Bottom nodes -->
    <circle cx="60"  cy="240" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="240" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>

    <!-- Fixed supports (both bottom corners) — matches canvas fixed glyph: bar + diagonal ground hatch -->
    <!-- Left fixed support -->
    <rect x="44" y="246" width="32" height="8" fill="#1a2f5e"/>
    <line x1="41" y1="260" x2="79" y2="260" stroke="#1a2f5e" stroke-width="1.5"/>
    <line x1="46" y1="254" x2="42" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="51" y1="254" x2="47" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="56" y1="254" x2="52" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="61" y1="254" x2="57" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="66" y1="254" x2="62" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="71" y1="254" x2="67" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="76" y1="254" x2="72" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>

    <!-- Right fixed support -->
    <rect x="364" y="246" width="32" height="8" fill="#1a2f5e"/>
    <line x1="361" y1="260" x2="399" y2="260" stroke="#1a2f5e" stroke-width="1.5"/>
    <line x1="366" y1="254" x2="362" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="371" y1="254" x2="367" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="376" y1="254" x2="372" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="381" y1="254" x2="377" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="386" y1="254" x2="382" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="391" y1="254" x2="387" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="396" y1="254" x2="392" y2="260" stroke="#1a2f5e" stroke-width="1.2"/>
  </svg>
`

const SVG_ASYMMETRIC_RAFTER = `
  <svg viewBox="0 0 460 390" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Arial, sans-serif">

    <!--
      Structure layout (world coords → SVG px):
        nBL  (−4.5, −6) → (80,  340)   base-left,  fixed
        nBR  (+4.5, −6) → (380, 340)   base-right, fixed
        nML  (−4.5,  0) → (80,  190)   mid-left junction
        nTL  (−4.5, +6) → (80,   40)   top-left
        nTR  (+4.5,  0) → (380, 190)   top-right

      Scale: 1 m = ~25 px (horiz 9 m → 300 px, vert 12 m → 300 px)
    -->

    <!-- === DIMENSION LINES === -->

    <!-- Horizontal span: 9.00 m (top) -->
    <line x1="80"  y1="40"  x2="80"  y2="18"  stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="380" y1="190" x2="380" y2="18"  stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="80"  y1="22"  x2="380" y2="22"  stroke="#2563eb" stroke-width="1"/>
    <line x1="80"  y1="17"  x2="80"  y2="27"  stroke="#2563eb" stroke-width="1.5"/>
    <line x1="380" y1="17"  x2="380" y2="27"  stroke="#2563eb" stroke-width="1.5"/>
    <text x="230" y="14" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">9.00 m</text>

    <!-- Left column upper height: 6.00 m -->
    <line x1="80"  y1="40"  x2="48"  y2="40"  stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="80"  y1="190" x2="48"  y2="190" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="52"  y1="40"  x2="52"  y2="190" stroke="#2563eb" stroke-width="1"/>
    <line x1="47"  y1="40"  x2="57"  y2="40"  stroke="#2563eb" stroke-width="1.5"/>
    <line x1="47"  y1="190" x2="57"  y2="190" stroke="#2563eb" stroke-width="1.5"/>
    <text x="38" y="120" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500" transform="rotate(-90 38 120)">6.00 m</text>

    <!-- Left column lower height: 6.00 m -->
    <line x1="80"  y1="190" x2="48"  y2="190" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="80"  y1="340" x2="48"  y2="340" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="52"  y1="195" x2="52"  y2="335" stroke="#2563eb" stroke-width="1"/>
    <line x1="47"  y1="340" x2="57"  y2="340" stroke="#2563eb" stroke-width="1.5"/>
    <text x="38" y="268" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500" transform="rotate(-90 38 268)">6.00 m</text>

    <!-- === POINT LOAD: 40 kN rightward at nTL (80,40) — head at node, tail to the left === -->
    <line x1="30" y1="40" x2="68" y2="40" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="74,40 67,35 67,45" fill="#0BE77E"/>
    <text x="44" y="31" font-size="10" fill="#107343" text-anchor="middle" font-weight="600">40 kN</text>

    <!-- === POINT LOAD: 80 kN rightward at nML (80,190) — head at node, tail to the left === -->
    <line x1="30" y1="190" x2="68" y2="190" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="74,190 67,185 67,195" fill="#0BE77E"/>
    <text x="44" y="180" font-size="10" fill="#107343" text-anchor="middle" font-weight="600">80 kN</text>

    <!-- === MEMBERS === -->

    <!-- Left column lower: nBL(80,340) → nML(80,190) -->
    <rect x="76" y="190" width="8" height="150" fill="#1a2f5e"/>

    <!-- Left column upper: nML(80,190) → nTL(80,40) -->
    <rect x="76" y="40" width="8" height="150" fill="#1a2f5e"/>

    <!-- Right column: nBR(380,340) → nTR(380,190) -->
    <rect x="376" y="190" width="8" height="150" fill="#1a2f5e"/>

    <!-- Horizontal beam: nML(80,190) → nTR(380,190) -->
    <rect x="80" y="186" width="300" height="8" rx="1.5" fill="#1a2f5e"/>

    <!-- Inclined rafter: nTL(80,40) → nTR(380,190) -->
    <line x1="80" y1="40" x2="380" y2="190" stroke="#1a2f5e" stroke-width="8" stroke-linecap="round"/>

    <!-- === DISTRIBUTED LOAD on rafter (drawn ON TOP of the rafter, transparent fill so the beam shows through) === -->
    <!-- Rafter: nTL(80,40) → nTR(380,190). Load q=+12 acts in +local-2 (up-right, screen ≈ (0.45,−0.89)).
         Baseline sits ~22px on the lower-left side of the rafter; arrows point up-right, heads on the rafter. -->
    <!-- Light fill region between the rafter and the lower-left baseline -->
    <polygon points="80,40 380,190 370,210 70,60" fill="#D7FDEB" opacity="0.35"/>
    <!-- Baseline (parallel to rafter, offset to the lower-left) -->
    <line x1="70" y1="60" x2="370" y2="210" stroke="#0BE77E" stroke-width="1.5"/>
    <!-- End caps closing the load region onto the rafter -->
    <line x1="80" y1="40" x2="70" y2="60" stroke="#0BE77E" stroke-width="1.5"/>
    <line x1="380" y1="190" x2="370" y2="210" stroke="#0BE77E" stroke-width="1.5"/>
    <!-- Perpendicular load arrows (tail on baseline, head on rafter, pointing up-right) -->
    <line x1="106" y1="78"  x2="116" y2="58"  stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="116,58 116,68 108,64" fill="#0BE77E"/>
    <line x1="160" y1="105" x2="170" y2="85"  stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="170,85 170,95 162,91" fill="#0BE77E"/>
    <line x1="214" y1="132" x2="224" y2="112" stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="224,112 224,122 216,118" fill="#0BE77E"/>
    <line x1="268" y1="159" x2="278" y2="139" stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="278,139 278,149 270,145" fill="#0BE77E"/>
    <line x1="322" y1="186" x2="332" y2="166" stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="332,166 332,176 324,172" fill="#0BE77E"/>
    <!-- Load label (below the rafter) -->
    <text x="245" y="162" font-size="10" fill="#107343" text-anchor="middle" font-weight="600" transform="rotate(26.6 245 162)">12 kN/m</text>

    <!-- === NODES === -->
    <circle cx="80"  cy="340" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="340" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="80"  cy="190" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="80"  cy="40"  r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="190" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>

    <!-- === FIXED SUPPORTS === matches canvas fixed glyph: bar + diagonal ground hatch -->
    <!-- Left base fixed support -->
    <rect x="64" y="346" width="32" height="8" fill="#1a2f5e"/>
    <line x1="61" y1="360" x2="99" y2="360" stroke="#1a2f5e" stroke-width="1.5"/>
    <line x1="66" y1="354" x2="62" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="71" y1="354" x2="67" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="76" y1="354" x2="72" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="81" y1="354" x2="77" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="86" y1="354" x2="82" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="91" y1="354" x2="87" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="96" y1="354" x2="92" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>

    <!-- Right base fixed support -->
    <rect x="364" y="346" width="32" height="8" fill="#1a2f5e"/>
    <line x1="361" y1="360" x2="399" y2="360" stroke="#1a2f5e" stroke-width="1.5"/>
    <line x1="366" y1="354" x2="362" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="371" y1="354" x2="367" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="376" y1="354" x2="372" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="381" y1="354" x2="377" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="386" y1="354" x2="382" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="391" y1="354" x2="387" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="396" y1="354" x2="392" y2="360" stroke="#1a2f5e" stroke-width="1.2"/>

  </svg>
`

export const EXAMPLES: Record<string, ExampleDefinition> = {
  "simple-beam": {
    id: "simple-beam",
    title: "Example 1 - Simple Beam",
    templateFn: template1SimpleBeam,
    svgIllustration: SVG_SIMPLE_BEAM,
    notesTemplate: "This example features a 5 m simply supported beam with pin and roller supports, subjected to an asymmetrical 10 kN concentrated load. ",
    defaultE: 23500,
    defaultI: 3125000,
    defaultA: 150000,
  },
  "cantilever": {
    id: "cantilever",
    title: "Example 2 - Cantilever Beam",
    templateFn: template2Cantilever,
    svgIllustration: SVG_CANTILEVER,
    notesTemplate: "This example features a 5 m simply supported beam subjected to a 10 kN/m uniformly distributed load (UDL) across its entire span. ",
    defaultE: 23500,
    defaultI: 3125000,
    defaultA: 150000,
  },
  "portal-gravity": {
    id: "portal-gravity",
    title: "Example 3 - Portal Frame (Gravity)",
    templateFn: template3Portal,
    svgIllustration: SVG_PORTAL_GRAVITY,
    notesTemplate: "This example features a 5 m beam wide by 4 m high column portal frame subjected to a combined loading of a 10 kN/m uniformly distributed load across the beam and a concentrated 10 kN concentrated load applied 2 m from the left column. ",
    defaultE: 23500,
    defaultI: 3125000,
    defaultA: 150000,
  },
  "portal-lateral": {
    id: "portal-lateral",
    title: "Example 4 - Portal Frame (Lateral)",
    templateFn: template4PortalLateral,
    svgIllustration: SVG_PORTAL_LATERAL,
    notesTemplate: "This example features a 5 m beam wide by 4 m high column portal frame subjected to a lateral 10 kN/m uniformly distributed load along the left column and a 10 kN horizontal point load acting at the top-left joint. ",
    defaultE: 23500,
    defaultI: 3125000,
    defaultA: 150000,
  },
  "asymmetric-rafter": {
    id: "asymmetric-rafter",
    title: "Example 5 - Asymmetric Rafter",
    templateFn: template5AsymmetricRafter,
    svgIllustration: SVG_ASYMMETRIC_RAFTER,
    notesTemplate: "This model is adapted from Example 6.7 of Aslam Kassimali’s textbook, Matrix Analysis of Structures (3rd ed., 2020) ",
    defaultE: 30000,
    defaultI: 480000000,
    defaultA: 75000,
  },
}

export const EXAMPLE_IDS = Object.keys(EXAMPLES) as Array<keyof typeof EXAMPLES>