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

PALETTES = {
  'github': ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  'warm':   ['#1a0a00', '#7a2e00', '#c05000', '#e88030', '#ffe0b0'],
  'cool':   ['#0a0a1a', '#0d3060', '#1560a8', '#40a0e0', '#b0e0ff'],
  'mono':   ['#1a1a1a', '#3a3a3a', '#666666', '#a0a0a0', '#e0e0e0'],
  'neon':   ['#050510', '#1a0040', '#4400cc', '#8800ff', '#cc44ff'],
  'forest': ['#0d1a0d', '#1a3d1a', '#2d6e2d', '#4caf50', '#a8e6a3'],
  'sunset': ['#1a0010', '#6b0030', '#c0005a', '#ff4090', '#ffb0d0'],
  'ocean':  ['#000d1a', '#003060', '#0070b0', '#00aad0', '#80e8ff'],
  'fire':   ['#1a0000', '#6b1000', '#c04000', '#ff8000', '#ffee00'],
  'pastel': ['#1a1a2e', '#6a4c93', '#c9a0dc', '#f4c6e0', '#fff5f0'],
  'arctic': ['#001020', '#003080', '#0080d0', '#60c8f0', '#e0f8ff'],
  'gold':   ['#1a1200', '#5a3c00', '#b07000', '#e0a800', '#ffe060'],
}
BG = '#0d1117'
for name, cols in PALETTES.items():
    print('='*64)
    print(f"{name}:")
    rampL = []
    for i,c in enumerate(cols):
        L = Lstar(c)
        rampL.append(L)
        print(f"  stop{i} {c}  L*={L:6.1f}  contrast_vs_bg={contrast(c,BG):5.2f}")
    dl = [rampL[i+1]-rampL[i] for i in range(len(rampL)-1)]
    mean = sum(dl)/len(dl)
    maxdev = max(abs(x-mean) for x in dl)/mean*100
    print(f"  L* deltas incl zero-stop: {[f'{x:.1f}' for x in dl]}  mean={mean:.1f} maxdev={maxdev:.0f}%")
    r2 = rampL[1:]
    dl2 = [r2[i+1]-r2[i] for i in range(len(r2)-1)]
    m2 = sum(dl2)/len(dl2)
    print(f"  RAMP(1..4) deltas: {[f'{x:.1f}' for x in dl2]} mean={m2:.1f} maxdev={max(abs(x-m2) for x in dl2)/m2*100:.0f}%  dimL*={rampL[1]:.1f} dimCtr={contrast(cols[1],BG):.2f}")
