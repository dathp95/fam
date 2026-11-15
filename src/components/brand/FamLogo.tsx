// Logo FAM dùng biến CSS trong tokens/theme.css — không có màu cố định.
// Dùng: <FamLogo variant="wordmark" height={40} />  |  <FamLogo variant="mark" height={32} />
type Props = { variant?: "mark" | "wordmark"; height?: number; title?: string; className?: string };

export function FamLogo({ variant = "wordmark", height = 40, title = "FAM", className }: Props) {
  const isMark = variant === "mark";
  const vb = isMark ? "0 0 100 100" : "10 0 236 100";
  const width = isMark ? height : (height * 236) / 100;
  const body = { stroke: "var(--fam-logo-body)" } as const;
  const leaf = { fill: "var(--fam-logo-leaf)" } as const;
  const leafStroke = { stroke: "var(--fam-logo-leaf)" } as const;
  const sprout = (
    <>
      <path d="M50 86V70" style={leafStroke} strokeWidth={6} strokeLinecap="round" fill="none" />
      <path style={leaf} d="M50 72C41 72 37 65 38 57C46 57 50 64 50 72Z" />
      <path style={leaf} d="M50 72C59 72 63 65 62 57C54 57 50 64 50 72Z" />
    </>
  );
  return (
    <svg className={className} width={width} height={height} viewBox={vb} role="img" aria-label={title}>
      {isMark ? (
        <>
          <path d="M16 86L50 14L84 86" style={body} fill="none" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
          {sprout}
        </>
      ) : (
        <>
          <g style={body} fill="none" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 86V14H60M22 48H54" />
            <path d="M174 86V14L204 58L234 14V86" />
            <path d="M78 86L112 14L146 86" />
          </g>
          <g transform="translate(62 0)">{sprout}</g>
        </>
      )}
    </svg>
  );
}
