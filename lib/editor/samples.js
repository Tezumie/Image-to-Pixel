// Sample images drawn for this project (SVG, MIT like the rest of the code).

const dusk = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1a3f"/><stop offset=".45" stop-color="#6b3f7c"/><stop offset=".72" stop-color="#e0766a"/><stop offset=".86" stop-color="#f6c27a"/></linearGradient>
<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4d6"/><stop offset=".35" stop-color="#ffd98a"/><stop offset=".6" stop-color="#ffb46a" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a6a" stop-opacity="0"/></radialGradient>
<linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4f7d"/><stop offset="1" stop-color="#5a3566"/></linearGradient>
<linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c2f5e"/><stop offset="1" stop-color="#2d2147"/></linearGradient>
<linearGradient id="m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22193a"/><stop offset="1" stop-color="#140f25"/></linearGradient>
<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2a873"/><stop offset=".35" stop-color="#8d4f78"/><stop offset="1" stop-color="#1b1734"/></linearGradient>
</defs>
<rect width="960" height="640" fill="url(#sky)"/>
<g fill="#fff" opacity=".7"><circle cx="90" cy="60" r="1.6"/><circle cx="210" cy="110" r="1.2"/><circle cx="330" cy="40" r="1.4"/><circle cx="700" cy="70" r="1.6"/><circle cx="820" cy="130" r="1.1"/><circle cx="560" cy="30" r="1.2"/><circle cx="880" cy="40" r="1.3"/></g>
<circle cx="600" cy="400" r="190" fill="url(#sun)"/>
<circle cx="600" cy="400" r="58" fill="#fff1cf"/>
<g fill="#f7c9a0" opacity=".55"><ellipse cx="220" cy="250" rx="140" ry="12"/><ellipse cx="300" cy="270" rx="90" ry="8"/><ellipse cx="760" cy="230" rx="120" ry="10"/></g>
<path d="M0 410 L120 330 L190 370 L300 280 L390 350 L470 310 L560 380 L660 300 L760 360 L860 290 L960 340 V470 H0Z" fill="url(#m1)"/>
<path d="M0 440 L90 390 L170 420 L260 360 L350 425 L450 380 L540 430 L640 375 L740 430 L840 385 L960 420 V480 H0Z" fill="url(#m2)"/>
<path d="M0 470 L140 430 L260 455 L380 425 L520 462 L660 432 L800 458 L960 436 V500 H0Z" fill="url(#m3)"/>
<rect y="480" width="960" height="160" fill="url(#lake)"/>
<g fill="#ffe8bf" opacity=".8"><rect x="540" y="492" width="120" height="4" rx="2"/><rect x="560" y="508" width="80" height="3" rx="1.5"/><rect x="520" y="524" width="160" height="3" rx="1.5"/><rect x="575" y="542" width="50" height="3" rx="1.5"/><rect x="548" y="562" width="104" height="2" rx="1"/></g>
<path d="M0 470 L140 430 L260 455 L380 425 L520 462 L660 432 L800 458 L960 436 V480 H0Z" fill="#120d22" opacity=".9"/>
<path d="M60 640 C120 560 180 560 240 640Z" fill="#0d0a1a"/><path d="M780 640 C840 575 900 560 960 600 V640Z" fill="#0d0a1a"/>
<g fill="none" stroke="#2a1b38" stroke-width="3" stroke-linecap="round"><path d="M300 170 q10 -10 20 0 q10 -10 20 0"/><path d="M350 200 q7 -7 14 0 q7 -7 14 0"/><path d="M262 210 q6 -6 12 0 q6 -6 12 0"/></g>
</svg>`;

const still = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="680" viewBox="0 0 900 680">
<defs>
<linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f3b45"/><stop offset="1" stop-color="#1a2129"/></linearGradient>
<linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a6a45"/><stop offset="1" stop-color="#4c2f1f"/></linearGradient>
<radialGradient id="apple" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffb3a1"/><stop offset=".25" stop-color="#e2453c"/><stop offset=".8" stop-color="#7a1622"/><stop offset="1" stop-color="#3d0b14"/></radialGradient>
<radialGradient id="lemon" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fffbd0"/><stop offset=".3" stop-color="#f5d34a"/><stop offset=".85" stop-color="#a77d16"/><stop offset="1" stop-color="#5a4008"/></radialGradient>
<radialGradient id="plum" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#c7a6ff"/><stop offset=".3" stop-color="#6b3fb8"/><stop offset=".85" stop-color="#2b1557"/><stop offset="1" stop-color="#140a2c"/></radialGradient>
<linearGradient id="vase" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c5a63"/><stop offset=".35" stop-color="#5fb7b0"/><stop offset=".5" stop-color="#c9f0e6"/><stop offset=".65" stop-color="#4aa29d"/><stop offset="1" stop-color="#123c44"/></linearGradient>
<radialGradient id="light" cx=".3" cy=".1" r=".9"><stop offset="0" stop-color="#ffe9c4" stop-opacity=".35"/><stop offset="1" stop-color="#ffe9c4" stop-opacity="0"/></radialGradient>
<radialGradient id="shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>
<rect width="900" height="680" fill="url(#wall)"/>
<rect width="900" height="680" fill="url(#light)"/>
<rect y="450" width="900" height="230" fill="url(#table)"/>
<rect y="450" width="900" height="8" fill="#c08a5c" opacity=".7"/>
<ellipse cx="520" cy="560" rx="120" ry="18" fill="url(#shadow)"/>
<path d="M470 250 C440 300 430 360 450 420 C460 470 480 520 520 548 C560 520 580 470 590 420 C610 360 600 300 570 250 C565 230 568 205 580 190 H460 C472 205 475 230 470 250Z" fill="url(#vase)"/>
<ellipse cx="520" cy="190" rx="60" ry="10" fill="#0e2e34"/>
<path d="M500 190 C495 130 470 100 430 80 M530 190 C540 120 580 90 620 85 M515 190 C515 140 520 110 515 70" stroke="#3f6b3a" stroke-width="5" fill="none" stroke-linecap="round"/>
<circle cx="430" cy="78" r="22" fill="#f2e6d0"/><circle cx="430" cy="78" r="8" fill="#e8b23c"/>
<circle cx="622" cy="84" r="18" fill="#f08aa6"/><circle cx="622" cy="84" r="7" fill="#7a2a4a"/>
<circle cx="515" cy="66" r="15" fill="#f6d8f0"/><circle cx="515" cy="66" r="6" fill="#d9a03a"/>
<ellipse cx="250" cy="560" rx="95" ry="16" fill="url(#shadow)"/>
<circle cx="250" cy="490" r="78" fill="url(#apple)"/>
<path d="M250 418 q6 -26 18 -34" stroke="#4a2a14" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M262 400 q30 -20 46 2 q-26 14 -46 -2Z" fill="#4f8a3a"/>
<ellipse cx="700" cy="580" rx="90" ry="14" fill="url(#shadow)"/>
<ellipse cx="690" cy="530" rx="80" ry="56" fill="url(#lemon)"/>
<circle cx="370" cy="560" r="44" fill="url(#plum)"/>
<circle cx="780" cy="585" r="34" fill="url(#plum)"/>
</svg>`;

const potion = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="560" viewBox="0 0 560 560">
<defs>
<radialGradient id="glass" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#e8fbff" stop-opacity=".9"/><stop offset=".5" stop-color="#9fd8f0" stop-opacity=".55"/><stop offset="1" stop-color="#3a6f9e" stop-opacity=".85"/></radialGradient>
<linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7ad1"/><stop offset=".6" stop-color="#b8248f"/><stop offset="1" stop-color="#5d0e4c"/></linearGradient>
<linearGradient id="cork" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4a24"/><stop offset=".5" stop-color="#c78a52"/><stop offset="1" stop-color="#6a3c1a"/></linearGradient>
</defs>
<rect x="232" y="64" width="96" height="62" rx="12" fill="url(#cork)"/>
<rect x="222" y="118" width="116" height="40" rx="10" fill="#bfe8f7"/>
<path d="M240 156 V210 C150 240 104 310 104 380 C104 470 182 520 280 520 C378 520 456 470 456 380 C456 310 410 240 320 210 V156Z" fill="url(#glass)"/>
<path d="M118 360 C160 340 220 350 280 362 C340 374 400 370 442 352 C452 370 456 380 456 392 C456 476 378 520 280 520 C182 520 104 476 104 392 C104 382 108 370 118 360Z" fill="url(#liquid)"/>
<circle cx="220" cy="430" r="16" fill="#ffd1f0" opacity=".8"/><circle cx="330" cy="460" r="10" fill="#ffd1f0" opacity=".7"/><circle cx="300" cy="402" r="7" fill="#ffd1f0" opacity=".7"/>
<path d="M160 300 C180 262 214 240 250 228" stroke="#ffffff" stroke-width="16" stroke-linecap="round" fill="none" opacity=".75"/>
<path d="M150 340 v12" stroke="#ffffff" stroke-width="16" stroke-linecap="round" opacity=".6"/>
<path d="M240 156 V210 C150 240 104 310 104 380 C104 470 182 520 280 520 C378 520 456 470 456 380 C456 310 410 240 320 210 V156Z" fill="none" stroke="#1d3150" stroke-width="10"/>
</svg>`;

export const SAMPLES = [
  { id: 'dusk', name: 'Dusk', svg: dusk },
  { id: 'still-life', name: 'Still life', svg: still },
  { id: 'potion', name: 'Potion (transparent)', svg: potion },
];

/** Data URL for a sample (for thumbnails and <img>). */
export const sampleURL = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg);

/** Load a sample as an ImageBitmap-compatible <img>. */
export async function loadSample(s) {
  const img = new Image();
  img.src = sampleURL(s);
  await img.decode();
  return img;
}
