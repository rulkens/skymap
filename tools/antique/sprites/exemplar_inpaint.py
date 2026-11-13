import numpy as np
from scipy import ndimage as ndi
def inpaint(img, mask, donor_ok, patch=11, search=110, seed=0):
    """Onion-peel exemplar fill: each boundary pixel takes the centre of the best-matching donor patch
    (SSD over the already-known pixels of its patch). img float 2D, mask bool (to fill), donor_ok bool (allowed centres)."""
    img=img.copy(); m=mask.copy(); r=patch//2
    H,W=img.shape
    ys,xs=np.nonzero(mask); cy,cx=int(ys.mean()),int(xs.mean())
    y0,y1=max(r,cy-search),min(H-r,cy+search); x0,x1=max(r,cx-search),min(W-r,cx+search)
    cand=[(y,x) for y in range(y0,y1,2) for x in range(x0,x1,2) if donor_ok[y,x] and not m[y-r:y+r+1,x-r:x+r+1].any()]
    cand=np.array(cand)
    wins=np.stack([img[y-r:y+r+1,x-r:x+r+1] for y,x in cand]) # N,p,p
    while m.any():
        edge=m & ~ndi.binary_erosion(m)
        # fill in strict priority of known-neighbour count
        pts=np.argwhere(edge)
        known=ndi.uniform_filter((~m).astype(float),patch)
        order=np.argsort(-known[edge])
        updates=[]
        for i in order:
            y,x=pts[i]
            if y<r or x<r or y>=H-r or x>=W-r: m[y,x]=False; continue
            t=img[y-r:y+r+1,x-r:x+r+1]; k=~m[y-r:y+r+1,x-r:x+r+1]
            d=(((wins-t)**2)*k).sum((1,2))
            j=np.argmin(d); updates.append((y,x,wins[j][r,r]))
        for y,x,v in updates:
            img[y,x]=v; m[y,x]=False
        # note: pixels filled this round become known next round
    return img
