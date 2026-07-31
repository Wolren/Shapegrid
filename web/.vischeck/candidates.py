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
  'neon':   ['#050510', '#2a0a5e', '#5b2dd4', '#9a4dff', '#e0b3ff'],
  'neon2':  ['#050510', '#2d0a66', '#5a27d8', '#9650ff', '#dfb5ff'],
  'pastel': ['#1a1a2e', '#4a2d6e', '#8a5fb0', '#cfa8e0', '#ffe8f4'],
  'warm':   ['#1a0a00', '#6b2800', '#ad4f00', '#e07f2e', '#ffd9a8'],
  'cool':   ['#0a0a1a', '#0f3568', '#1560a8', '#40a0e0', '#b0e0ff'],
  'ocean':  ['#000d1a', '#0a3a70', '#0a68b0', '#00aad0', '#80e8ff'],
  'arctic': ['#001020', '#104090', '#0078c8', '#60c8f0', '#e0f8ff'],
  'sunset': ['#1a0010', '#7a0038', '#c0005a', '#ff4090', '#ffb0d0'],
  'fire':   ['#1a0000', '#7a1400', '#c04000', '#ff8000', '#ffee00'],
  'gold':   ['#1a1200', '#553800', '#a86c00', '#e0a800', '#ffe060'],
}
BG = '#0d1117'
for name, cols in CANDIDATES.items():
    Ls = [Lstar(c) for c in cols]
    dl = [Ls[i+1]-Ls[i] for i in range(len(Ls)-1)]
    ramp = Ls[1:]
    dl2 = [ramp[i+1]-ramp[i] for i in range(len(ramp)-1)]
    m2 = sum(dl2)/len(dl2)
    maxdev = max(abs(x-m2) for x in dl2)/m2*100
    print(f"{name:8} L*: {[f'{x:.1f}' for x in Ls]}")
    print(f"        ramp deltas: {[f'{x:.1f}' for x in dl2]} mean={m2:.1f} maxdev={maxdev:.0f}%  dimL*={ramp[0]:.1f} dimCtr={contrast(cols[1],BG):.2f}")
