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

    <!-- Dimension lines (blue dashed extensions + solid span lines) -->
    <!-- Left extension: x=58 -->
    <line x1="58" y1="112" x2="58" y2="50" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <!-- Middle extension: x=182 -->
    <line x1="182" y1="112" x2="182" y2="38" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <!-- Right extension: x=368 -->
    <line x1="368" y1="112" x2="368" y2="50" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>

    <!-- Left span line: 2.00 m -->
    <line x1="58" y1="54" x2="182" y2="54" stroke="#2563eb" stroke-width="1"/>
    <line x1="58" y1="49" x2="58" y2="59" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="182" y1="49" x2="182" y2="59" stroke="#2563eb" stroke-width="1.5"/>
    <text x="120" y="46" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">2.00 m</text>

    <!-- Right span line: 3.00 m -->
    <line x1="182" y1="42" x2="368" y2="42" stroke="#2563eb" stroke-width="1"/>
    <line x1="182" y1="37" x2="182" y2="47" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="368" y1="37" x2="368" y2="47" stroke="#2563eb" stroke-width="1.5"/>
    <text x="275" y="34" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">3.00 m</text>

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

    <!-- Labels -->
    <text x="58"  y="182" font-size="10" fill="#6b7280" text-anchor="middle">pin</text>
    <text x="368" y="182" font-size="10" fill="#6b7280" text-anchor="middle">roller</text>
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

    <!-- Distributed load arrows (green downward, uniform across span) -->
    <line x1="80" y1="76" x2="80" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="80,115 75,104 85,104" fill="#0BE77E"/>
    <line x1="120" y1="76" x2="120" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="120,115 115,104 125,104" fill="#0BE77E"/>
    <line x1="160" y1="76" x2="160" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="160,115 155,104 165,104" fill="#0BE77E"/>
    <line x1="200" y1="76" x2="200" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="200,115 195,104 205,104" fill="#0BE77E"/>
    <line x1="240" y1="76" x2="240" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="240,115 235,104 245,104" fill="#0BE77E"/>
    <line x1="280" y1="76" x2="280" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="280,115 275,104 285,104" fill="#0BE77E"/>
    <line x1="320" y1="76" x2="320" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="320,115 315,104 325,104" fill="#0BE77E"/>
    <line x1="360" y1="76" x2="360" y2="109" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="360,115 355,104 365,104" fill="#0BE77E"/>
    <!-- Baseline -->
    <line x1="58" y1="76" x2="368" y2="76" stroke="#0BE77E" stroke-width="1.5"/>
    <!-- Label -->
    <text x="213" y="69" font-size="10" fill="#107343" text-anchor="middle" font-weight="600">10 kN/m</text>

    <!-- Beam -->
    <rect x="58" y="112" width="310" height="9" rx="1.5" fill="#1a2f5e"/>

    <!-- Nodes -->
    <circle cx="58"  cy="116" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="368" cy="116" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>

    <!-- Fixed support (left) -->
    <rect x="42" y="119" width="32" height="32" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="45" y1="125" x2="71" y2="149" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="45" y1="135" x2="71" y2="135" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="45" y1="145" x2="71" y2="121" stroke="#1a2f5e" stroke-width="1.2"/>

    <!-- Label -->
    <text x="58" y="175" font-size="10" fill="#6b7280" text-anchor="middle">fixed</text>
  </svg>
`

const SVG_PORTAL_GRAVITY = `
  <svg viewBox="0 0 420 290" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Arial, sans-serif">

    <!-- Dimensions: Horizontal spans -->
    <!-- Left span: 2.00 m (x=60 to x=184) -->
    <line x1="60" y1="120" x2="60" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="184" y1="120" x2="184" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="60" y1="50" x2="184" y2="50" stroke="#2563eb" stroke-width="1"/>
    <line x1="60" y1="45" x2="60" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <line x1="184" y1="45" x2="184" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <text x="122" y="42" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">2.00 m</text>

    <!-- Right span: 3.00 m (x=184 to x=380) -->
    <line x1="380" y1="120" x2="380" y2="45" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,2"/>
    <line x1="184" y1="50" x2="380" y2="50" stroke="#2563eb" stroke-width="1"/>
    <line x1="380" y1="45" x2="380" y2="55" stroke="#2563eb" stroke-width="1.5"/>
    <text x="282" y="42" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="500">3.00 m</text>

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

    <!-- Point load at middle node (10 kN downward) -->
    <line x1="184" y1="62" x2="184" y2="108" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="184,114 177,101 191,101" fill="#0BE77E"/>
    <text x="199" y="75" font-size="10" fill="#107343" font-weight="600">10 kN</text>

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

    <!-- Fixed supports (both bottom corners) -->
    <!-- Left fixed support -->
    <rect x="44" y="243" width="32" height="32" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="47" y1="249" x2="73" y2="273" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="47" y1="259" x2="73" y2="259" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="47" y1="269" x2="73" y2="245" stroke="#1a2f5e" stroke-width="1.2"/>

    <!-- Right fixed support -->
    <rect x="364" y="243" width="32" height="32" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="367" y1="249" x2="393" y2="273" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="367" y1="259" x2="393" y2="259" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="367" y1="269" x2="393" y2="245" stroke="#1a2f5e" stroke-width="1.2"/>
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

    <!-- Distributed load on left column (rightward, horizontal) -->
    <!-- Light green fill area behind arrows -->
    <rect x="56" y="135" width="65" height="110" fill="#D7FDEB" opacity="0.5"/>
    <!-- Horizontal arrows pointing right FROM the column surface -->
    <line x1="64" y1="155" x2="105" y2="155" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="111,155 100,150 100,160" fill="#0BE77E"/>
    <line x1="64" y1="190" x2="105" y2="190" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="111,190 100,185 100,195" fill="#0BE77E"/>
    <line x1="64" y1="225" x2="105" y2="225" stroke="#0BE77E" stroke-width="2"/>
    <polygon points="111,225 100,220 100,230" fill="#0BE77E"/>
    <!-- Baseline on column right edge -->
    <line x1="64" y1="135" x2="64" y2="245" stroke="#0BE77E" stroke-width="1.5"/>
    <!-- Label -->
    <text x="30" y="195" font-size="9" fill="#107343" text-anchor="end" font-weight="600">10 kN/m</text>

    <!-- Point load at top-left node (10 kN rightward) -->
    <line x1="60" y1="120" x2="108" y2="120" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="114,120 103,115 103,125" fill="#0BE77E"/>
    <text x="110" y="108" font-size="10" fill="#107343" font-weight="600">10 kN</text>

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

    <!-- Fixed supports (both bottom corners) -->
    <!-- Left fixed support -->
    <rect x="44" y="243" width="32" height="32" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="47" y1="249" x2="73" y2="273" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="47" y1="259" x2="73" y2="259" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="47" y1="269" x2="73" y2="245" stroke="#1a2f5e" stroke-width="1.2"/>

    <!-- Right fixed support -->
    <rect x="364" y="243" width="32" height="32" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="367" y1="249" x2="393" y2="273" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="367" y1="259" x2="393" y2="259" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="367" y1="269" x2="393" y2="245" stroke="#1a2f5e" stroke-width="1.2"/>
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

    <!-- === DISTRIBUTED LOAD on rafter (perpendicular arrows, CCW) === -->
    <!-- Rafter: nTL(80,40) → nTR(380,190). Direction: dx=300, dy=150. Length≈335px.
         Unit along rafter: (0.894, 0.447). Perp-CCW (upward-left of rafter): (−0.447, 0.894) in world→screen: (−0.447, −0.894) flipped.
         We offset arrow tips ~20px in perp direction above the rafter, arrows point toward rafter. -->
    <!-- Light fill region between load baseline and rafter -->
    <polygon points="80,40 380,190 380,164 80,14" fill="#D7FDEB" opacity="0.6"/>
    <!-- Baseline (parallel to rafter, offset ~26px perp-above) -->
    <line x1="80" y1="14" x2="380" y2="164" stroke="#0BE77E" stroke-width="1.5"/>
    <!-- Perpendicular load arrows (6 evenly spaced, tip on rafter, tail on baseline) -->
    <line x1="128" y1="21"  x2="115" y2="47"  stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="115,47 117,34 124,40" fill="#0BE77E"/>
    <line x1="178" y1="46"  x2="165" y2="72"  stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="165,72 167,59 174,65" fill="#0BE77E"/>
    <line x1="228" y1="71"  x2="215" y2="97"  stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="215,97 217,84 224,90" fill="#0BE77E"/>
    <line x1="278" y1="96"  x2="265" y2="122" stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="265,122 267,109 274,115" fill="#0BE77E"/>
    <line x1="328" y1="121" x2="315" y2="147" stroke="#0BE77E" stroke-width="1.8"/>
    <polygon points="315,147 317,134 324,140" fill="#0BE77E"/>
    <!-- Load label -->
    <text x="248" y="62" font-size="10" fill="#107343" text-anchor="middle" font-weight="600" transform="rotate(26.6 248 62)">12 kN/m</text>

    <!-- === POINT LOAD: 40 kN rightward at nTL (80,40) === -->
    <line x1="80" y1="40" x2="136" y2="40" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="142,40 131,35 131,45" fill="#0BE77E"/>
    <text x="148" y="36" font-size="10" fill="#107343" font-weight="600">40 kN</text>

    <!-- === POINT LOAD: 80 kN rightward at nML (80,190) === -->
    <line x1="80" y1="190" x2="136" y2="190" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>
    <polygon points="142,190 131,185 131,195" fill="#0BE77E"/>
    <text x="148" y="186" font-size="10" fill="#107343" font-weight="600">80 kN</text>

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

    <!-- === NODES === -->
    <circle cx="80"  cy="340" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="340" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="80"  cy="190" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="80"  cy="40"  r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>
    <circle cx="380" cy="190" r="5.5" fill="white" stroke="#1a2f5e" stroke-width="2"/>

    <!-- === FIXED SUPPORTS === -->
    <!-- Left base fixed support -->
    <rect x="64" y="343" width="32" height="28" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="67" y1="348" x2="93" y2="369" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="67" y1="357" x2="93" y2="357" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="67" y1="366" x2="93" y2="345" stroke="#1a2f5e" stroke-width="1.2"/>

    <!-- Right base fixed support -->
    <rect x="364" y="343" width="32" height="28" fill="none" stroke="#1a2f5e" stroke-width="2"/>
    <line x1="367" y1="348" x2="393" y2="369" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="367" y1="357" x2="393" y2="357" stroke="#1a2f5e" stroke-width="1.2"/>
    <line x1="367" y1="366" x2="393" y2="345" stroke="#1a2f5e" stroke-width="1.2"/>

  </svg>
`

export const EXAMPLES: Record<string, ExampleDefinition> = {
  "simple-beam": {
    id: "simple-beam",
    title: "Simple Beam",
    templateFn: template1SimpleBeam,
    svgIllustration: SVG_SIMPLE_BEAM,
    notesTemplate: "This example features a 5 m simply supported beam with pin and roller supports, subjected to an asymmetrical 10 kN concentrated load. ",
    defaultE: 23500000,
    defaultI: 0.003125,
    defaultA: 0.15,
  },
  "cantilever": {
    id: "cantilever",
    title: "Cantilever Beam",
    templateFn: template2Cantilever,
    svgIllustration: SVG_CANTILEVER,
    notesTemplate: "This example features a 5 m simply supported beam subjected to a 10 kN/m uniformly distributed load (UDL) across its entire span. ",
    defaultE: 23500000,
    defaultI: 0.003125,
    defaultA: 0.15,
  },
  "portal-gravity": {
    id: "portal-gravity",
    title: "Portal Frame (Gravity)",
    templateFn: template3Portal,
    svgIllustration: SVG_PORTAL_GRAVITY,
    notesTemplate: "This example features a 5 m beam wide by 4 m high column portal frame subjected to a combined loading of a 10 kN/m uniformly distributed load across the beam and a concentrated 10 kN concentrated load applied 2 m from the left column. ",
    defaultE: 23500000,
    defaultI: 0.003125,
    defaultA: 0.15,
  },
  "portal-lateral": {
    id: "portal-lateral",
    title: "Portal Frame (Lateral)",
    templateFn: template4PortalLateral,
    svgIllustration: SVG_PORTAL_LATERAL,
    notesTemplate: "This example features a 5 m beam wide by 4 m high column portal frame subjected to a lateral 10 kN/m uniformly distributed load along the left column and a 10 kN horizontal point load acting at the top-left joint. ",
    defaultE: 23500000,
    defaultI: 0.003125,
    defaultA: 0.15,
  },
  "asymmetric-rafter": {
    id: "asymmetric-rafter",
    title: "Asymmetric Rafter",
    templateFn: template5AsymmetricRafter,
    svgIllustration: SVG_ASYMMETRIC_RAFTER,
    notesTemplate: "This model is adapted from Example 6.7 of Aslam Kassimali’s textbook, Matrix Analysis of Structures (3rd ed., 2020) ",
    defaultE: 23500000,
    defaultI: 0.003125,
    defaultA: 0.15,
  },
}

export const EXAMPLE_IDS = Object.keys(EXAMPLES) as Array<keyof typeof EXAMPLES>
