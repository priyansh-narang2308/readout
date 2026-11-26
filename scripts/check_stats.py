#!/usr/bin/env python3
"""Independent reference vectors for Readout's statistics (27 §7 T-STAT).

Written separately from src/stats/flagsmithStats.ts, using closed forms rather than a port:
  - binary sample variance p(1-p)·n/(n-1)
  - delta-method SE written as ratio · sqrt(CV_t² + CV_c²)
  - Phi(x) = 0.5·erfc(-x/√2), two-sided p = erfc(|z|/√2), SRM(df=1) = erfc(√(χ²/2))
The same derivation was checked against Flagsmith's own stats.py (commit 64c1ebe):
max abs diff 4.4e-16 (research/flagsmith-hackathon/verification/).
Usage: python3 -I scripts/check_stats.py > src/stats/__fixtures__/reference.json
"""
import json, math

Z95 = 1.959963984540054
VECTORS = [
    # id, n_c, c_c, n_t, c_t, direction
    ("S1", 4000, 160, 4000, 212, "up"),
    ("S2", 3000, 360, 3000, 291, "up"),
    ("S3", 1500, 120, 1500, 138, "up"),
    ("S4", 60, 6, 60, 11, "up"),
    ("S5", 9120, 456, 6400, 371, "up"),
    ("S6_primary", 5000, 400, 5000, 470, "up"),
    ("S6_guardrail", 5000, 50, 5000, 95, "down"),
    # extra independent vectors: negative, zero effect, tiny, large, lower-is-better improvement
    ("NEG", 1000, 100, 1000, 80, "up"),
    ("NEG_down", 1000, 100, 1000, 80, "down"),
    ("ZERO", 2000, 200, 2000, 200, "up"),
    ("SMALL", 50, 5, 50, 7, "up"),
    ("LARGE", 200000, 10000, 200000, 10400, "up"),
    ("UNEQUAL", 800, 40, 1200, 75, "up"),
]

def phi(x):
    return 0.5 * math.erfc(-x / math.sqrt(2))

def ref(nc, cc, nt, ct, direction):
    pc, pt = cc / nc, ct / nt
    vc = pc * (1 - pc) * nc / (nc - 1)
    vt = pt * (1 - pt) * nt / (nt - 1)
    r = pt / pc
    lift = r - 1
    se = r * math.sqrt(vt / (nt * pt * pt) + vc / (nc * pc * pc)) if pt > 0 else math.sqrt(vt / (nt * pc * pc))
    z = lift / se if se > 0 else 0.0
    chance = phi(z)
    if direction == "down":
        chance = 1 - chance
    p = math.erfc(abs(z) / math.sqrt(2))
    total = nc + nt
    chi = sum((o - total / 2) ** 2 / (total / 2) for o in (nc, nt))
    srm = math.erfc(math.sqrt(chi / 2))
    return dict(lift=lift, se=se, lo=lift - Z95 * se, hi=lift + Z95 * se, z=z, p=p, chance=chance, chi=chi, srm=srm)

out = {}
for vid, nc, cc, nt, ct, d in VECTORS:
    out[vid] = dict(input=dict(nc=nc, cc=cc, nt=nt, ct=ct, direction=d), expected=ref(nc, cc, nt, ct, d))
print(json.dumps(out, indent=2))
