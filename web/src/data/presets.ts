// ══════════════════════════════════════════════════════════════════════════════
// Shapegrid boundary presets
// ══════════════════════════════════════════════════════════════════════════════

import type { Point2D } from '../types';

// Note: These presets require the `norm` function from projection.ts
// They will be initialized after norm is available
export function createPresets(norm: (pts: Point2D[]) => Point2D[]): Record<string, Point2D[]> {
  return {
    shield: norm([[50,0],[100,20],[100,60],[50,100],[0,60],[0,20]]),
    circle: norm(Array.from({length:32},(_,i)=>{const a=(i/32)*Math.PI*2;return[50+50*Math.cos(a),50+50*Math.sin(a)] as Point2D;})),
    star: norm(Array.from({length:10},(_,i)=>{const a=(i/10)*Math.PI*2-Math.PI/2,r=i%2===0?50:20;return[50+r*Math.cos(a),50+r*Math.sin(a)] as Point2D;})),
    diamond: norm([[50,0],[100,50],[50,100],[0,50]]),
    heart: (()=>{const p:Point2D[]=[];for(let i=0;i<=32;i++){const t=(i/32)*Math.PI*2;p.push([16*Math.sin(t)**3,-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))]);}return norm(p);})(),
    rectangle: norm([[0,0],[100,0],[100,60],[0,60]]),
    hexagon: norm(Array.from({length:6},(_,i)=>{const a=(i/6)*Math.PI*2-Math.PI/6;return[50+50*Math.cos(a),50+50*Math.sin(a)] as Point2D;})),
    arrow: norm([[10,30],[50,30],[50,10],[90,50],[50,90],[50,70],[10,70]]),
    cross: norm([[30,0],[70,0],[70,30],[100,30],[100,70],[70,70],[70,100],[30,100],[30,70],[0,70],[0,30],[30,30]]),
  };
}
