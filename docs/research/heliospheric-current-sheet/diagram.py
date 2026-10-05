import math
W,H=1400,700
K=1.09  # rad per AU: Omega/v for 400 km/s wind, 25.4 d sidereal spin
out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Helvetica,Arial,sans-serif">',
 f'<rect width="{W}" height="{H}" fill="#05070d"/>']
# ---- left: Parker spiral, top-down
cx,cy,S=350,390,44  # px per AU
for name,a in [('Earth',1),('Mars',1.52),('Jupiter',5.2),]:
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{a*S}" fill="none" stroke="#3a4560" stroke-dasharray="3 5"/>')
    out.append(f'<text x="{cx+a*S*0.71+4}" y="{cy-a*S*0.71-4}" fill="#6b7898" font-size="12">{name}</text>')
N=12
for i in range(N):
    p0=2*math.pi*i/N
    pos = math.sin(2*p0+0.6)>0   # four-sector polarity pattern
    col='#ff8a5c' if pos else '#5cb8ff'
    pts=[]
    r=0.05
    while r<=6.3:
        ph=p0-K*r
        pts.append(f'{cx+r*S*math.cos(ph):.1f},{cy-r*S*math.sin(ph):.1f}')
        r+=0.03
    out.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{col}" stroke-width="1.6" stroke-opacity="0.85"/>')
out.append(f'<circle cx="{cx}" cy="{cy}" r="7" fill="#ffd27a"/><circle cx="{cx}" cy="{cy}" r="14" fill="#ffd27a" opacity="0.25"/>')
out.append(f'<text x="{cx}" y="40" fill="#e8ecf5" font-size="22" text-anchor="middle">Parker spiral (seen from above the Sun\'s pole)</text>')
out.append(f'<text x="{cx}" y="66" fill="#8f9bb8" font-size="14" text-anchor="middle">field lines carried out by a 400 km/s wind while the Sun turns every ~25 days · orange = outward, blue = inward</text>')
# ---- right: ballerina skirt, oblique 3D
ox,oy,S2=1050,400,44
ALPHA=math.radians(28)  # dipole tilt
el=math.radians(22); az=math.radians(-35)
def proj(x,y,z):
    x1= x*math.cos(az)-y*math.sin(az); y1=x*math.sin(az)+y*math.cos(az)
    sy= y1*math.sin(el)+z*math.cos(el); depth=y1*math.cos(el)-z*math.sin(el)
    return ox+x1*S2, oy-sy*S2, depth
def P(r,ph):
    lat=math.atan(math.tan(ALPHA)*math.sin(ph+K*r))
    return proj(r*math.cos(lat)*math.cos(ph), r*math.cos(lat)*math.sin(ph), r*math.sin(lat))
quads=[]
rs=[0.15+i*0.06 for i in range(100)]; NP=120
for i in range(len(rs)-1):
    for j in range(NP):
        a=2*math.pi*j/NP; b=2*math.pi*(j+1)/NP
        c=[P(rs[i],a),P(rs[i+1],a),P(rs[i+1],b),P(rs[i],b)]
        d=sum(p[2] for p in c)/4
        lat=math.atan(math.tan(ALPHA)*math.sin(a+K*rs[i]))
        quads.append((d,c,lat,rs[i]))
        if i%8==0:
            quads.append((d-1e-3,[c[0],c[3]],lat,-1))
quads.sort(key=lambda q:-q[0])
# Sun drawn mid-stack: behind-sheet quads first
sun=proj(0,0,0)
drawn_sun=False
for d,c,lat,r in quads:
    if not drawn_sun and d<0:
        out.append(f'<circle cx="{sun[0]:.1f}" cy="{sun[1]:.1f}" r="6" fill="#ffd27a"/><circle cx="{sun[0]:.1f}" cy="{sun[1]:.1f}" r="13" fill="#ffd27a" opacity="0.25"/>')
        drawn_sun=True
    if r==-1:
        out.append(f'<line x1="{c[0][0]:.1f}" y1="{c[0][1]:.1f}" x2="{c[1][0]:.1f}" y2="{c[1][1]:.1f}" stroke="#ffe2b8" stroke-opacity="0.7" stroke-width="1.2"/>')
        continue
    t=(lat/ALPHA+1)/2
    rr=int(90+120*t); gg=int(110+60*t); bb=int(230-90*t)
    fade=max(0.25,1-r/7)
    pts=" ".join(f'{p[0]:.1f},{p[1]:.1f}' for p in c)
    out.append(f'<polygon points="{pts}" fill="rgb({rr},{gg},{bb})" fill-opacity="{0.55*fade:.2f}" stroke="rgb({rr},{gg},{bb})" stroke-opacity="{0.35*fade:.2f}" stroke-width="0.5"/>')
out.append(f'<text x="{ox}" y="40" fill="#e8ecf5" font-size="22" text-anchor="middle">The “ballerina skirt” (heliospheric current sheet)</text>')
out.append(f'<text x="{ox}" y="66" fill="#8f9bb8" font-size="14" text-anchor="middle">the boundary between the two polarities, warped by a 28° magnetic tilt and wound by the same spiral</text>')
out.append(f'<text x="{W/2}" y="{H-18}" fill="#56607a" font-size="12" text-anchor="middle">Ideal model: spiral to 6.3 AU, sheet to 6 AU — a sketch, not observations. Real skirt shape per solar rotation: Wilcox Solar Observatory.</text>')
out.append('</svg>')
open('parker-spiral-and-skirt.svg','w').write("\n".join(out))
