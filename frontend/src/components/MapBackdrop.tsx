export function MapBackdrop({
  route = false,
  className = 'absolute inset-0 h-full w-full',
}: {
  route?: boolean;
  className?: string;
}) {
  const routePath =
    'M360 380 C470 392 560 446 660 474 C760 502 840 516 920 534 C1000 552 1060 570 1120 586';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <rect width="1440" height="900" fill="#e3e7e1" />
      <path
        d="M0 770 C200 748 400 800 600 778 C800 756 950 806 1100 766 C1200 740 1300 706 1440 726 L1440 900 L0 900 Z"
        fill="#bcd3de"
      />
      <path
        d="M1210 650 C1244 620 1306 624 1322 652 C1336 676 1306 700 1268 696 C1232 692 1192 678 1210 650 Z"
        fill="#bcd3de"
      />
      <path
        d="M230 400 C262 370 330 372 352 404 C370 432 338 462 296 460 C254 458 206 432 230 400 Z"
        fill="#bcd3de"
      />
      <path
        d="M1100 300 C1124 282 1170 286 1182 308 C1192 328 1170 344 1144 342 C1116 340 1086 322 1100 300 Z"
        fill="#bcd3de"
      />
      <g fill="#cfe0c6">
        <path d="M740 150 C800 118 890 130 920 182 C944 226 890 262 830 255 C768 248 708 196 740 150 Z" />
        <path d="M440 560 C490 534 556 546 572 582 C584 614 540 636 496 630 C452 624 418 590 440 560 Z" />
        <path d="M1180 470 C1220 450 1280 460 1296 492 C1308 518 1270 536 1236 532 C1200 528 1160 500 1180 470 Z" />
        <path d="M110 250 C140 232 190 238 200 262 C208 282 182 296 156 294 C128 292 96 272 110 250 Z" />
        <path d="M900 640 C930 624 976 630 986 654 C994 672 970 686 946 684 C920 682 886 662 900 640 Z" />
      </g>
      <g fill="none" stroke="#d3d9d3" strokeWidth="16" strokeLinecap="round">
        <path d="M0 250 C300 236 640 262 980 248 C1140 242 1300 258 1440 272" />
        <path d="M0 500 C240 488 520 520 820 500 C1060 486 1260 506 1440 520" />
        <path d="M1000 0 C1012 180 1030 360 1060 500 C1080 590 1120 650 1170 700" />
        <path d="M600 0 C612 160 598 340 580 560 C572 660 560 760 548 900" />
        <path d="M1300 40 C1314 220 1338 380 1380 560" />
        <path d="M180 0 C190 200 170 420 150 900" />
      </g>
      <g fill="none" stroke="#ffffff" strokeWidth="11" strokeLinecap="round">
        <path d="M0 250 C300 236 640 262 980 248 C1140 242 1300 258 1440 272" />
        <path d="M0 500 C240 488 520 520 820 500 C1060 486 1260 506 1440 520" />
        <path d="M1000 0 C1012 180 1030 360 1060 500 C1080 590 1120 650 1170 700" />
        <path d="M600 0 C612 160 598 340 580 560 C572 660 560 760 548 900" />
        <path d="M1300 40 C1314 220 1338 380 1380 560" />
        <path d="M180 0 C190 200 170 420 150 900" />
      </g>
      <g fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.9">
        <path d="M700 900 C740 780 800 700 880 660" />
        <path d="M480 120 C640 160 760 300 820 420" />
        <path d="M1100 120 C1150 200 1200 260 1300 300" />
        <path d="M660 640 C760 620 860 640 960 700" />
        <path d="M300 640 C340 700 380 760 420 900" />
        <path d="M20 380 C120 360 200 380 260 340" />
        <path d="M1180 380 C1260 360 1340 380 1440 360" />
      </g>
      {route && (
        <g>
          <path d={routePath} fill="none" stroke="#ffffff" strokeWidth="18" strokeLinecap="round" />
          <path d={routePath} fill="none" stroke="#00704f" strokeWidth="10" strokeLinecap="round" />
          <rect
            x="781"
            y="498"
            width="34"
            height="20"
            rx="3"
            fill="#f2b300"
            stroke="#1e2629"
            strokeWidth="2.5"
          />
          <rect
            x="1011"
            y="551"
            width="34"
            height="20"
            rx="3"
            fill="#f2b300"
            stroke="#1e2629"
            strokeWidth="2.5"
          />
          <circle cx="360" cy="380" r="13" fill="#1e2629" stroke="#fff" strokeWidth="4" />
          <circle cx="1120" cy="586" r="13" fill="#00704f" stroke="#fff" strokeWidth="4" />
        </g>
      )}
    </svg>
  );
}
