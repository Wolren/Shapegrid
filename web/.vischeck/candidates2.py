import math

def srgb(c):
    c = c/255.0
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4

def lum(hexc):
    h = hexc.lstrip('#')
    r,g,b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    return 0.2126*srgb(r)+0.7152*srgb(g)+0.0722*srgb(b)

def Lstar(hexc):
    y = lum(hexc)
    return 116*(y**(1/3))-16 if y > 0.008856 else 903.3*y

def contrast(a,b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la,lb), min(la,lb)
    return (hi+0.05)/(lo+0.05)

CANDIDATES = {
  'neon-a': ['#050510', '#3a128a', '#6b2fe0', '#a660ff', '#e8b0ff'],
  'neon-b': ['#050510', '#3d148f', '#7030ea', '#ab66ff', '#eab8ff'],
  'neon-c': ['#050510', '#42158f', '#7a35f0', '#b070ff', '#eec0ff'],
  'neon-d': ['#050510', '#35137f', '#6a2fdc', '#a25cff', '#e4b0ff'],
}
BG = '#0d1117'
for name, cols in CANDIDATES.items():
    Ls = [Lstar(c) for c in cols]
    ramp = Ls[1:]
    dl2 = [ramp[i+1]-ramp[i] for i in range(len(ramp)-1)]
    m2 = sum(dl2)/len(dl2)
    maxdev = max(abs(x-m2) for x in dl2)/m2*100
    print(f"{name:8} L*: {[f'{x:.1f}' for x in Ls]}")
    print(f"        ramp deltas: {[f'{x:.1f}' for x in dl2]} mean={m2:.1f} maxdev={maxdev:.0f}%  dimL*={ramp[0]:.1f} dimCtr={contrast(cols[1],BG):.2f}")
